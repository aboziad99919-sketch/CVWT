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
assert "Q_bedCell" in cd and "select          cellZone;" in cd and "cellZone        qCell;" in cd, \
    "group J has no boundary patch, so flow must come from the cell-average probe"
# OpenFOAM 12's volFieldValue (via polyCellSet) reads ONLY select/cellZone; the old regionType/name
# spelling is still accepted by surfaceFieldValue but not here. Group J run #3 meshed five cases and
# then died in foamRun on exactly this: "keyword select is undefined in dictionary .../Q_bedCell".
qb = cd[cd.index("Q_bedCell"):]; qb = qb[:qb.index("}")]
keys = [l.split()[0] for l in qb.splitlines()[1:] if l.split() and not l.strip().startswith("//")]
assert "regionType" not in keys and "name" not in keys, (
    "Q_bedCell must not use regionType/name - OpenFOAM 12 volFieldValue rejects it at foamRun start")
assert "#includeFunc components" not in cd, (
    "components(U) is one more OpenFOAM caseDict that has to exist on the runner. Average the "
    "vector directly: read_cols strips the brackets and keeps the last column, which is Uz")
assert "operation       volAverage" in cd and "fields          (U);" in cd
assert z["QC_Z0"] > z["FILTER_Z1"], "the measuring slab must sit above the cassette, in clear bore"
assert (z["QC_Z1"] - z["QC_Z0"]) > 0.05, "measuring slab too thin to hold cells at this scale"
assert cd.count("{") == cd.count("}"), "controlDict braces are unbalanced"
ar = (run / "Allrun").read_text()
assert "foamDictionary" in ar and "-expand" in ar, (
    "Allrun must expand the dictionaries before meshing. Group J's first run spent five full-scale "
    "meshes before foamRun read controlDict and rejected it")

# ...and the smoke test must SURVIVE a clean case. Group J run #2 died in two seconds in every
# leg, silently, with no output at all: the token hunt was a bare `grep | while` pipeline, and
# under `set -euo pipefail` a grep that matches nothing exits 1 and takes the whole script with
# it. The guard passing is the common case, so run it and insist it returns 0.
lines = ar.splitlines()
i = next(n for n, l in enumerate(lines) if l.strip().startswith("if grep -rlE"))
j = next(n for n, l in enumerate(lines) if "dictionaries expand cleanly" in l)
guard = "set -euo pipefail\n" + "\n".join(lines[i:j + 1])
r = subprocess.run(["bash", "-c", guard], cwd=run, capture_output=True, text=True)
assert r.returncode == 0 and "expand cleanly" in r.stdout, (
    f"the token guard kills Allrun on a clean case (rc={r.returncode}): {r.stdout}{r.stderr}\n"
    "it must be an `if`, never a bare pipeline")
assert "| while read" not in ar, (
    "a bare `grep ... | while read` under set -o pipefail exits 1 when grep finds nothing")
sentinel = run / "system" / "ZZ_token_probe"
sentinel.write_text("a @@STILL_A_TOKEN@@ b\n")
r = subprocess.run(["bash", "-c", guard], cwd=run, capture_output=True, text=True)
sentinel.unlink()
assert r.returncode == 2 and "ZZ_token_probe" in r.stdout, (
    "the token guard no longer catches an unsubstituted token - it would pass a broken case "
    f"through to a full-scale mesh (rc={r.returncode})")
# run #5: the axis probes misread the open CEM cassette, and the mesh thinned its finest layer.
# Every group J case must carry the area-average pressure slabs and the per-layer correction.
assert "p_belowCassette" in cd and "p_aboveCassette" in cd and "select          cellSet;" in cd, \
    "group J needs the area-average cassette pressure drop, not just the two axis probes"
for k in ("PB_Z0", "PB_Z1", "PA_Z0", "PA_Z1"):
    assert k in cp, f"{k} missing from caseParams"
assert "pBelowCells" in ts and "pAboveCells" in ts, "pressure slabs not cut by topoSet"
# run #7: total-pressure balance and a mid-plane picture. pTot must be computed EVERY iteration
# (the stock caseDict only does it at write times, which would feed the slab averages a stale field).
pt = cd[cd.index("pTotField"):]; pt = pt[:pt.index("}")]
assert "executeControl  timeStep;" in pt and "calcTotal       yes;" in pt and "result          pTot;" in pt, pt
assert cd.index("pTotField") < cd.index("pT_belowCassette"), "pTot must be computed before it is averaged"
assert "pT_belowCassette" in cd and "pT_aboveCassette" in cd, "total-pressure slabs missing"
assert "cutPlaneSurface(" in cd and "name=midPlane" in cd, "mid-plane flow picture missing"
assert "Q_belowCassette" in cd and "Q_aboveCassette" in cd, \
    "the flow below and above the cassette must both be measured, to catch flow that bypasses it"
assert "cellZoneSet; action new; source setToCellZone; set pBelowCells" not in ts, \
    "the pressure slabs must stay cell SETS: the upper one overlaps qCell, and zones cannot overlap"
assert (run / "correctLayers.py").exists() and "correctLayers.py" in ar, \
    "Allrun must correct the meshed layer thicknesses before foamRun"
assert ar.index("correctLayers.py") < ar.index("par foamRun"), "the correction must run BEFORE foamRun"
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
