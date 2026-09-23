"""Generate the stage-1 sensitivity cases (flow + pressure drop, frozen rotor). Creates NEW folders only.
    python make_sweep.py            -> writes sweep_matrix.csv + cost estimate, creates nothing else
    python make_sweep.py --create   -> also creates runs/<case_id>/ (refuses if a folder exists)
Runs are NOT started. Each case is launched after review with ./Allrun --run N (or via the cfd-pipeline MCP)."""
import csv, json, math, re, shutil, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent; ROOT = HERE.parent
TEMPLATE, GEOM = ROOT / "case", ROOT / "geometry"
FILTERS = {r["id"]: r for r in csv.DictReader(open(ROOT / "rom" / "filter_candidates.csv"))}
SEALED = {"d": 1e12, "f": 0.0}                     # numerical 'blocked bed' to map core pressure with no through-flow
LEVELS = {"coarse": 4, "medium": 5, "fine": 6}
CELLS_EST = {"coarse": 0.6e6, "medium": 3.5e6, "fine": 22e6}   # pre-mesh estimates; replace with checkMesh counts

def k_omega(U, I=0.05, l=0.01, cmu=0.09):
    k = 1.5 * (U * I) ** 2; return k, math.sqrt(k) / (cmu ** 0.25 * l)

cases = []
def add(group, fid, t_mm, U, az, top, mesh="medium", core="holes", why=""):
    """core: 'holes' = perforated cylinder (design as drawn); 'solid' = unperforated cylinder (reversed layout)."""
    cid = f"{group}_{fid}_t{t_mm:02d}_U{U}_az{int(az*10):03d}_{top}_{core}_{mesh}"
    cases.append(dict(case_id=cid, group=group, filter=fid, thickness_mm=t_mm, U_mps=U, azimuth_deg=az,
                      top=top, core=core, mesh=mesh, purpose=why))

# 1A  map the core driving pressure (the key unknown of the pre-screen) - bed sealed or empty
for az in (0, 22.5, 45, 67.5):
    add("A1", "SEALED", 18, 4, az, "capped", why="core Cp vs rotor azimuth (4 fins -> 90 deg period), static torque")
for fid in ("SEALED", "F0"):
    for top in ("capped", "open"):
        for U in (2, 4, 6):
            add("A2", fid, 18, U, 0, top, why="driving pressure & bypass vs speed, top open/capped")
# 1B  filter resistance x thickness at the design point
for fid in ("F1", "F2", "F3", "F4"):
    for t in (9, 18, 36):
        add("B1", fid, t, 4, 0, "capped", why="filter resistance x thickness sensitivity")
    add("B2", fid, 18, 4, 0, "open", why="filter bypass through open tube top")
# 1C  speed scaling check (Δp ~ U^1 vs U^2 regime) for one mid candidate
for U in (2, 6):
    for top in ("capped", "open"):
        add("C1", "F2", 18, U, 0, top, why="Reynolds/speed scaling of filter flow")
# 1R  reversed layout: intake through the bottom slots, bed, bore, exhaust out the open top;
#     perforated holes replaced by a plain cylinder wall so the core cannot short-circuit the path
for fid in ("F1", "F2", "F3", "F4"):
    add("R1", fid, 18, 4, 0, "open", core="solid", why="reversed layout: deck-level intake, top exhaust")
for U in (2, 6):
    add("R2", "F2", 18, U, 0, "open", core="solid", why="reversed layout, speed scaling")
# mesh independence on the baseline (medium is in B1)
for mesh in ("coarse", "fine"):
    add("M1", "F2", 18, 4, 0, "capped", mesh, why="grid convergence (GCI) on baseline")

def rotate_stl(src, dst, deg):
    th = math.radians(deg); c, s = math.cos(th), math.sin(th)
    out = []
    for line in open(src):
        m = re.match(r"(\s*)(vertex|facet normal)\s+(\S+)\s+(\S+)\s+(\S+)", line)
        if m:
            x, y, z = map(float, m.group(3, 4, 5))
            out.append(f"{m.group(1)}{m.group(2)} {c*x - s*y:.7e} {s*x + c*y:.7e} {z:.7e}\n")
        else:
            out.append(line)
    open(dst, "w").writelines(out)

def create(case):
    dst = HERE / "runs" / case["case_id"]
    if dst.exists():
        raise FileExistsError(f"{dst} exists - not overwriting")
    shutil.copytree(TEMPLATE, dst)
    g = dst / "constant" / "geometry"; g.mkdir(parents=True, exist_ok=True)
    for n in ("cvwt_caps", "cvwt_housing_cfd", "cvwt_topcap", "cvwt_base_stack"):
        shutil.copy(GEOM / f"{n}.stl", g / f"{n}.stl")
    # the core cylinder: perforated (as drawn) or unperforated (reversed layout) - same patch name either way
    shutil.copy(GEOM / ("cvwt_tube.stl" if case["core"] == "holes" else "cvwt_tube_solid.stl"), g / "cvwt_tube.stl")
    rotate_stl(GEOM / "cvwt_fins.stl", g / "cvwt_fins.stl", case["azimuth_deg"])
    if case["filter"] == "SEALED": d, f = SEALED["d"], SEALED["f"]
    else: d, f = float(FILTERS[case["filter"]]["Darcy_d_1/m2"]), float(FILTERS[case["filter"]]["Forchheimer_f_1/m"])
    k, om = k_omega(case["U_mps"]); L = LEVELS[case["mesh"]]
    subs = {"U_IN": case["U_mps"], "K_IN": f"{k:.6g}", "OMEGA_IN": f"{om:.6g}", "D_COEFF": f"{d:.6g}", "F_COEFF": f"{f:.6g}",
            "FILTER_Z0": f"{0.045 - case['thickness_mm']/1000:.4f}", "FILTER_ID": case["filter"],
            "LVL": L, "LVL_1": L - 1, "LVL_2": L - 2, "LVL_3": L - 3, "NPROCS": 8}
    for p in dst.rglob("*"):
        if p.is_file() and p.suffix != ".stl":
            t = p.read_text()
            for key, v in subs.items(): t = t.replace(f"@@{key}@@", str(v))
            if case["top"] == "open" and p.name in ("snappyHexMeshDict", "surfaceFeaturesDict"):
                t = "\n".join(l for l in t.splitlines() if "topcap" not in l.lower()) + "\n"
                t = t.replace(' "cvwt_topcap.stl"', "")
            left = re.findall(r"@@\w+@@", t)
            assert not left, f"unresolved {left} in {p}"
            p.write_text(t)
    if case["top"] == "open": (g / "cvwt_topcap.stl").unlink()
    (dst / "case_params.json").write_text(json.dumps({**case, **subs}, indent=2))

if __name__ == "__main__":
    iters = 3000; us_per_cell_iter = 2.5e-6            # incompressible RANS, per core (rough)
    for c in cases:
        n = CELLS_EST[c["mesh"]]; c["cells_est"] = int(n)
        c["core_hours_est"] = round(n * iters * us_per_cell_iter / 3600, 1)
    with open(HERE / "sweep_matrix.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(cases[0])); w.writeheader(); w.writerows(cases)
    tot = sum(c["core_hours_est"] for c in cases)
    print(f"{len(cases)} cases, ~{tot:.0f} core-hours total (~{tot/8:.0f} h wall on 8 cores; fine mesh dominates)")
    for gname in sorted({c['group'] for c in cases}):
        print(f"  {gname}: {sum(1 for c in cases if c['group']==gname)} cases")
    if "--create" in sys.argv:
        only = [a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")]
        for c in cases:
            if not only or any(o in c["case_id"] for o in only):
                create(c); print("created", c["case_id"])
