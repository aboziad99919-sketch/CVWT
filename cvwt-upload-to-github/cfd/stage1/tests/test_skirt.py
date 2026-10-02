"""Guards for group J: the perforated skirt intake and the layered CemBioFoam cassette.

Every one of these exists because something comparable has already gone wrong in this study: a
geometry that reached the rotor sweep, a flow probe that integrated the whole domain, a second flow
probe that cancelled half its own faces, and a bed thickness that was silently scaled when it should
not have been. They run before a mesh is spent."""
import json, math, pathlib, shutil, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
GEOM, SWEEP, ROM = HERE.parent / "geometry", HERE.parent / "sweep", HERE.parent / "rom"


def tris(p):
    v = [tuple(round(float(x), 9) for x in l.split()[1:4])
         for l in p.read_text().splitlines() if l.strip().startswith("vertex")]
    return [tuple(v[i:i+3]) for i in range(0, len(v), 3)]


def shells(p):
    out, name, v = {}, None, []
    for l in p.read_text().splitlines():
        t = l.split()
        if t and t[0] == "solid": name, v = t[1], []
        elif t and t[0] == "vertex": v.append(tuple(round(float(x), 9) for x in t[1:4]))
        elif t and t[0] == "endsolid": out[name] = [tuple(v[i:i+3]) for i in range(0, len(v), 3)]
    return out


# ---- 1. media: the foam must actually be the low-resistance medium it is claimed to be ---------
import csv
F = {r["id"]: r for r in csv.DictReader(open(ROM / "filter_candidates.csv"))}
for gid in ("C1", "C2", "C3"):
    assert gid in F, f"{gid} missing from filter_candidates.csv"
    assert "ASSUMED" in F[gid]["status"], (
        f"{gid} is not flagged ASSUMED. These coefficients are Ergun estimates from the sponge PPI, "
        "not the WP4 bench curve, and must stay labelled until that measurement exists")
d1, d2, d3 = (float(F[g]["Darcy_d_1/m2"]) for g in ("C1", "C2", "C3"))
assert d1 < d2 < d3, "foam grades must get finer, so more resistive, from pre-filter to adsorber"
assert d3 < float(F["F2"]["Darcy_d_1/m2"]), (
    "even the finest foam grade must be more permeable than the packed biochar it replaces, "
    "or the whole premise of the CemBioFoam proposal is not represented")
print(f"  media: C1/C2/C3 Darcy {d1:.3g} < {d2:.3g} < {d3:.3g} < F2 {float(F['F2']['Darcy_d_1/m2']):.3g}  OK")

# ---- 2. skirt geometry: watertight, clear of the cassette, and really perforated ---------------
import collections
for r in (100, 140):
    stl = GEOM / f"cvwt_skirt_r{r}_p30.stl"
    assert stl.exists(), f"{stl.name} missing - run build_skirt.py {r} 0.30"
    S = shells(stl)
    assert {"plinth", "housingLower", "housingUpper"} <= set(S), f"{stl.name} is missing a shell"
    bands = [k for k in S if k.startswith("cone")]
    assert len(bands) == 6, f"{stl.name} has {len(bands)} cone segments; 5 open bands needs 6"
    for name, T in S.items():
        e = collections.Counter()
        for tri in T:
            for i in range(3): e[tuple(sorted([tri[i], tri[(i+1) % 3]]))] += 1
        open_edges = sum(1 for c in e.values() if c != 2)
        assert open_edges == 0, f"{stl.name}:{name} has {open_edges} open edges - snappy needs it closed"
    zmax = max(p[2] for T in S.values() for tri in T for p in tri) * 1000
    ztop_cone = max(p[2] for k, T in S.items() if k.startswith("cone") for tri in T for p in tri) * 1000
    assert ztop_cone < 27.0, (
        f"{stl.name}: the cone reaches z = {ztop_cone:.1f} mm and the cassette floor is at 27 mm")
    rmax = max(math.hypot(p[0], p[1]) for T in S.values() for tri in T for p in tri) * 1000
    assert abs(rmax - r) < 0.5, f"{stl.name}: skirt base radius {rmax:.1f} mm, expected {r}"
    assert rmax < 56.0 or ztop_cone < 80.0, "skirt must not reach into the rotor sweep"
    print(f"  cvwt_skirt_r{r}_p30  watertight, {len(bands)} frusta, base r{rmax:.0f} mm, "
          f"cone top {ztop_cone:.1f} mm, overall top {zmax:.0f} mm  OK")

# ---- 3. a generated group J case ---------------------------------------------------------------
cid = "J1_CEM_t18_U4_az000_open_solid_medium_b34s16_x12_r100"
run = SWEEP / "runs" / cid
if run.exists(): shutil.rmtree(run)
r = subprocess.run([sys.executable, "make_sweep.py", "--create", f"--only={cid}"],
                   cwd=SWEEP, capture_output=True, text=True)
assert run.exists(), f"case not created:\n{r.stdout}\n{r.stderr}"
par = json.loads((run / "case_params.json").read_text())
cp = (run / "system" / "caseParams").read_text()
z = {k: float(cp.split(k)[1].split(";")[0]) for k in
     ("FILTER_Z0", "FILTER_Z1", "LZ0_1", "LZ1_1", "LZ0_2", "LZ1_2", "LZ0_3", "LZ1_3",
      "QC_Z0", "QC_Z1", "BORE_R")}

# the cassette is a real object: 3 x 25 mm whatever the device scale
assert abs((z["FILTER_Z1"] - z["FILTER_Z0"]) - 0.075) < 1e-9, (
    f"cassette is {1000*(z['FILTER_Z1']-z['FILTER_Z0']):.1f} mm. It must be 75 mm at ANY scale - "
    "a foam pore does not shrink when the device does")
for i in (1, 2, 3):
    t = z[f"LZ1_{i}"] - z[f"LZ0_{i}"]
    assert abs(t - 0.025) < 1e-9, f"layer {i} is {1000*t:.1f} mm, must be 25 mm"
assert z["LZ1_1"] == z["LZ0_2"] and z["LZ1_2"] == z["LZ0_3"], "cassette layers must not leave a gap"
assert par["scale"] == 12.0 and abs(z["FILTER_Z0"] - 0.324) < 1e-9, \
    "group J runs at full scale, so the cassette floor sits at 0.324 m"

# three media, in flow order coarse -> fine
fv = (run / "constant" / "fvModels").read_text()
assert fv.count("type            porosityForce;") == 3, "the cassette needs one porous model per grade"
for i, gid in enumerate(("C1", "C2", "C3"), 1):
    assert f"cellZone        filter{i};" in fv, f"filter{i} zone not referenced"
    assert f"// {gid}" in cp, f"{gid} coefficients not written for layer {i}"
ts = (run / "system" / "topoSetDict").read_text()
for i in (1, 2, 3):
    assert f"name filter{i};" in ts, f"filter{i} cellZone not cut by topoSet"
assert "name qCell;" in ts, "the flow-measuring cellZone is missing"

# the flow probe, third attempt - and the two failed ones must not come back
cd = (run / "system" / "controlDict").read_text()
assert "cuttingPlane" not in cd, "the cuttingPlane probe ignored its own bounds; it must not return"
assert "regionType      faceZone" not in cd, (
    "the faceZone probe disagreed with the patch integral by 1.95x; it must not return")
assert "Q_bedCell" in cd and "regionType      cellZone" in cd and "name            qCell" in cd, \
    "group J has no boundary patch, so flow must come from the cell-average probe"
assert "includeFunc components(U)" in cd, "volAverage needs Uz as a scalar field"
assert "operation       volAverage" in cd and "fields          (Uz)" in cd
assert z["QC_Z0"] > z["FILTER_Z1"], "the measuring slab must sit above the cassette, in clear bore"
assert (z["QC_Z1"] - z["QC_Z0"]) > 0.05, "measuring slab too thin to hold cells at this scale"
assert cd.count("{") == cd.count("}"), "controlDict braces are unbalanced"
assert (run / "system" / "INTERNAL_INTAKE").exists(), \
    "group J has no outletFilter patch, so Allrun must skip that check"

# refinement: the stock coreZone was cut for a 17 mm bore and would leave this one coarse
sn = (run / "system" / "snappyHexMeshDict").read_text()
import re
m = re.search(r"coreZone\s+\{[^}]*radius\s+([\d.]+)", sn)
assert m and float(m.group(1)) > z["BORE_R"], (
    f"coreZone radius {m.group(1) if m else '?'} does not cover a {z['BORE_R']:.3f} m bore")
assert "cassetteZone" in sn and "skirtZone" in sn, "cassette and skirt need their own refinement"
assert "housing { level ($LVL $LVL)" in sn, \
    "the 30 mm cone shell needs the finer surface level or snappy closes the open bands over"
shutil.rmtree(run)
print("  generated case: 75 mm cassette in 3 grades, cell-average probe, skirt refinement  OK")

print("test_skirt: all assertions passed")
