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
def add(group, fid, t_mm, U, az, top, mesh="medium", core="holes", why="", bed_z0=None,
        bore_mm=17.0, slot_r_mm=16.0):
    """core: 'holes' = perforated cylinder (design as drawn); 'solid' = unperforated cylinder (reversed layout).

    bed_z0 fixes the bed BOTTOM [m]; the top then follows as bed_z0 + thickness. Left as None the bed
    hangs from a fixed top of 0.045 m and grows downward, which is how groups A-R were run. That
    couples thickness to the length of the inlet plenum below the bed (the slot deck top is at
    z = 0.005 m), and group BP exists to separate the two."""
    cid = f"{group}_{fid}_t{t_mm:02d}_U{U}_az{int(az*10):03d}_{top}_{core}_{mesh}"
    if abs(bore_mm - 17.0) > 1e-9 or abs(slot_r_mm - 16.0) > 1e-9:
        cid += f"_b{int(round(bore_mm))}s{int(round(slot_r_mm))}"
    cases.append(dict(case_id=cid, group=group, filter=fid, thickness_mm=t_mm, U_mps=U, azimuth_deg=az,
                      top=top, core=core, mesh=mesh, purpose=why, bed_z0=bed_z0,
                      bore_mm=bore_mm, slot_r_mm=slot_r_mm))

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
# 1BP control for the group-B anomaly: core Cp did not fall monotonically with bed thickness, and the
#     36 mm cases showed the SHALLOWEST suction when they should show the deepest. In group B the bed
#     hangs from a fixed top at 45 mm, so a thicker bed also starts closer to the slot exits and loses
#     its inlet plenum. Here the bed BOTTOM is pinned at 9 mm instead, giving every case the same 4 mm
#     plenum, so thickness is varied on its own. t36 is unchanged from B1 and is the shared anchor.
for fid in ("F1", "F2", "F3"):
    for t_mm in (9, 18, 36):
        add("BP", fid, t_mm, 4, 0, "capped", bed_z0=0.009,
            why="bed thickness at constant inlet plenum (control for the group-B Cp anomaly)")

# 1D  the two questions the group-A/B results raise, measured rather than modelled.
#  D1: how high can the intake go? The external probe rake (in controlDict, so every case carries it)
#      maps Cp up the outside of the CVWT. An intake is only usable where that is still near ambient.
#      One sealed case is enough, since the external field barely depends on the small internal flow.
#  D2: bed area. The head available to the bed is capped near 1.62 Pa at 4 m/s, so the way to move
#      more air is a lower face velocity, i.e. a wider bed. Ø34 (as drawn) / Ø48 / Ø68, slots widened
#      in step so they do not become the new throttle.
#  D3: Ø68 with the as-drawn slots, to separate the bed-area gain from the slot restriction.
add("D1", "SEALED", 18, 4, 0, "capped", why="external Cp rake: how high can the intake sit?")
for bore, slot in ((17.0, 16.0), (24.0, 23.0), (34.0, 33.0)):
    add("D2", "F2", 18, 4, 0, "capped", bore_mm=bore, slot_r_mm=slot,
        why=f"bed area sweep: bore r={bore:.0f} mm, slots widened to r={slot:.0f} mm")
add("D3", "F2", 18, 4, 0, "capped", bore_mm=34.0, slot_r_mm=16.0,
    why="bore r=34 mm with the as-drawn slots: isolates the slot throttle")

# 1R+ sealing the core. The D1 rake showed the device generates 7.4 Pa between a deck-level intake
#     (Cp +0.11) and the rotor's suction field (Cp -0.66), but the bed receives only 1.62 Pa of it.
#     The perforated core is why: circulation through the hole band pins the bore at an intermediate
#     -2.99 Pa. An unperforated tube breaks that tie, so the path runs deck -> bed -> bore -> top
#     exhaust and the bed can see the full drop. The rotor becomes a suction generator; particles
#     enter with the air at deck level rather than through the blades.
#  RS: sealed bed, solid core, open top - measures the head the sealed core actually delivers, which
#      is the number the whole proposal rests on. Run at both bed diameters.
#  R3/R4: F1-F3 at 18 mm, solid core, open top, at Ø34 and Ø68. Head gain and area gain together.
#      Slots stay as drawn at Ø68: group D measured the widened plate to be worth only 2.1 %.
for bore, slot in ((17.0, 16.0), (34.0, 16.0)):
    add("RS", "SEALED", 18, 4, 0, "open", core="solid", bore_mm=bore, slot_r_mm=slot,
        why="sealed core, open top: how much head does breaking the hole-band tie actually give?")
for grp, bore in (("R3", 17.0), ("R4", 34.0)):
    for fid in ("F1", "F2", "F3"):
        add(grp, fid, 18, 4, 0, "open", core="solid", bore_mm=bore, slot_r_mm=16.0,
            why=f"sealed core, open top, bore r={bore:.0f} mm: head gain x area gain")

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
    bore, slot_r = case.get("bore_mm", 17.0), case.get("slot_r_mm", 16.0)
    hsuf = "" if abs(bore - 17.0) < 1e-9 else f"_r{int(round(bore))}"
    ssuf = "" if abs(slot_r - 16.0) < 1e-9 else f"_r{int(round(slot_r))}"
    for n in ("cvwt_caps", "cvwt_topcap"):
        shutil.copy(GEOM / f"{n}.stl", g / f"{n}.stl")
    # widened variants keep the surface NAMES, so snappy/topoSet need no per-case edits
    shutil.copy(GEOM / f"cvwt_housing_cfd{hsuf}.stl", g / "cvwt_housing_cfd.stl")
    shutil.copy(GEOM / f"cvwt_base_stack{ssuf}.stl", g / "cvwt_base_stack.stl")
    # the core cylinder: perforated (as drawn) or unperforated (reversed layout) - same patch name either way
    shutil.copy(GEOM / ("cvwt_tube.stl" if case["core"] == "holes" else "cvwt_tube_solid.stl"), g / "cvwt_tube.stl")
    rotate_stl(GEOM / "cvwt_fins.stl", g / "cvwt_fins.stl", case["azimuth_deg"])
    if case["filter"] == "SEALED": d, f = SEALED["d"], SEALED["f"]
    else: d, f = float(FILTERS[case["filter"]]["Darcy_d_1/m2"]), float(FILTERS[case["filter"]]["Forchheimer_f_1/m"])
    k, om = k_omega(case["U_mps"]); L = LEVELS[case["mesh"]]
    subs = {"U_IN": case["U_mps"], "K_IN": f"{k:.6g}", "OMEGA_IN": f"{om:.6g}", "D_COEFF": f"{d:.6g}", "F_COEFF": f"{f:.6g}",
            "FILTER_Z0": f"{(case['bed_z0'] if case.get('bed_z0') is not None else 0.045 - case['thickness_mm']/1000):.4f}",
            "FILTER_Z1": f"{((case['bed_z0'] + case['thickness_mm']/1000) if case.get('bed_z0') is not None else 0.045):.4f}",
            "FILTER_ID": case["filter"],
            # the porous cylinder is cut 0.2 mm oversize so it reaches the wall without leaving a gap
            "BORE_R": f"{(case.get('bore_mm', 17.0) + 0.2)/1000:.4f}",
            "LVL": L, "LVL_1": L - 1, "LVL_2": L - 2, "LVL_3": L - 3, "NPROCS": 4}
    for p in dst.rglob("*"):
        if p.is_file() and p.suffix != ".stl":
            t = p.read_text()
            for key, v in subs.items(): t = t.replace(f"@@{key}@@", str(v))
            if case["top"] == "open":
                # surfaceFeaturesDict lists every surface on ONE line: drop only the topcap token,
                # never the whole line (doing so deletes all surfaces and snappy then has no eMesh).
                if p.name == "surfaceFeaturesDict":
                    t = t.replace(' "cvwt_topcap.stl"', "")
                elif p.name == "snappyHexMeshDict":   # here each topcap reference is on its own line
                    t = "\n".join(l for l in t.splitlines() if "topcap" not in l.lower()) + "\n"
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
