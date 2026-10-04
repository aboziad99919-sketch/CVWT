"""The multi-layer cassette: per-layer thickness correction and the area-average pressure drop.

Group J run #5 meshed the three 25 mm CemBioFoam grades as 30 / 30 / 15 mm (4648 / 4648 / 2324
cells on 15 mm cells), so the finest grade had 40 % too little resistance. correctLayers.py must
restore each layer's designed t*d and t*f, refuse when it cannot know the meshed thickness, never
apply itself twice, and leave single-layer beds (every earlier group) alone.
"""
import json, math, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CL = os.path.join(HERE, "..", "case", "correctLayers.py")
CS = os.path.join(HERE, "..", "sweep", "check_stability.py")

BLOCKMESH = """convertToMeters 12;
vertices ( (-0.6 -0.5 -0.025) (1.4 -0.5 -0.025) (1.4 0.5 -0.025) (-0.6 0.5 -0.025)
           (-0.6 -0.5 0.6) (1.4 -0.5 0.6) (1.4 0.5 0.6) (-0.6 0.5 0.6) );
blocks ( hex (0 1 2 3 4 5 6 7) (100 50 31) simpleGrading (1 1 1) );
"""
GRADES = [(1.105e6, 364.0), (5.324e6, 841.4), (4.541e7, 2691.0)]   # C1, C2, C3


def make(tmp, sizes, lvl=4, layers=3):
    os.makedirs(os.path.join(tmp, "system"), exist_ok=True)
    z = [0.324 + 0.025 * i for i in range(layers + 1)]
    cp = [f"LVL         {lvl};", "BORE_R      0.41040;"]
    for i in range(1, layers + 1):
        d, f = GRADES[i - 1]
        cp += [f"LZ0_{i}       {z[i-1]:.5f};", f"LZ1_{i}       {z[i]:.5f};",
               f"D_{i}         {d:.6g};        // grade {i}", f"F_{i}         {f:.6g};"]
    open(os.path.join(tmp, "system", "caseParams"), "w").write("\n".join(cp) + "\n")
    open(os.path.join(tmp, "system", "blockMeshDict"), "w").write(BLOCKMESH)
    open(os.path.join(tmp, "log.topoSet"), "w").write("".join(
        f"    cellZoneSet filter{i} now size {n}\n" for i, n in enumerate(sizes, 1)))


def run(tmp):
    return subprocess.run([sys.executable, CL], cwd=tmp, capture_output=True, text=True)


def coeffs(tmp):
    t = open(os.path.join(tmp, "system", "caseParams")).read()
    return {k: float(v) for k, v in re.findall(r"^([DF]_\d+)\s+([-+0-9.eE]+)\s*;", t, flags=re.M)}


def test_run5_mesh_gets_its_designed_resistance_back(tmp_path):
    make(str(tmp_path), [4648, 4648, 2324])
    r = run(str(tmp_path))
    assert r.returncode == 0, r.stdout + r.stderr
    dz = 0.625 * 12 / 31 / 16                                   # level-4 cell height, 15.12 mm
    c = coeffs(str(tmp_path))
    for i, rows in zip((1, 2, 3), (2, 2, 1)):
        d0, f0 = GRADES[i - 1]
        # meshed thickness x corrected coefficient == designed 25 mm x original coefficient
        assert abs(rows * dz * c[f"D_{i}"] - 0.025 * d0) / (0.025 * d0) < 1e-5
        assert abs(rows * dz * c[f"F_{i}"] - 0.025 * f0) / (0.025 * f0) < 1e-5
    assert abs(c["D_3"] / GRADES[2][0] - 1.6533) < 1e-3, "C3 was meshed 15 mm thick, needs x1.65"


def test_never_applied_twice(tmp_path):
    make(str(tmp_path), [4648, 4648, 2324])
    run(str(tmp_path)); once = coeffs(str(tmp_path))
    r = run(str(tmp_path))
    assert r.returncode == 0 and "already corrected" in r.stdout
    assert coeffs(str(tmp_path)) == once


def test_refuses_when_the_mesh_level_is_not_what_it_assumes(tmp_path):
    make(str(tmp_path), [4648, 4648, 2324], lvl=5)              # counts are level-4 counts
    before = coeffs(str(tmp_path))
    r = run(str(tmp_path))
    assert r.returncode != 0 and "REFUSED" in r.stdout
    assert coeffs(str(tmp_path)) == before, "a refused correction must not touch caseParams"


def test_refuses_an_empty_layer(tmp_path):
    make(str(tmp_path), [4648, 4648, 0])
    r = run(str(tmp_path))
    assert r.returncode != 0 and "no cells" in r.stdout


def test_single_layer_bed_is_left_alone(tmp_path):
    make(str(tmp_path), [6972], layers=1)
    before = coeffs(str(tmp_path))
    r = run(str(tmp_path))
    assert r.returncode == 0 and "single-layer" in r.stdout
    assert coeffs(str(tmp_path)) == before


def test_check_stability_reports_the_area_average_drop(tmp_path):
    c = os.path.join(str(tmp_path), "J1_CEM_full"); os.makedirs(c)
    json.dump({"params": {"filter": "CEM", "U_mps": 4, "BORE_R": 0.4104}},
              open(os.path.join(c, "run_summary.json"), "w"))
    for side, pk in (("below", -2.0), ("above", -3.5)):        # kinematic: drop 1.5 -> 1.8 Pa
        d = os.path.join(c, "postProcessing", f"p_{side}Cassette", "0"); os.makedirs(d)
        with open(os.path.join(d, "volFieldValue.dat"), "w") as f:
            for t in range(1, 1501):
                f.write(f"{t} {pk}\n")
    for side, uz in (("below", 0.03), ("above", 0.08)):        # a bypass: more flow above than below
        d = os.path.join(c, "postProcessing", f"Q_{side}Cassette", "0"); os.makedirs(d)
        with open(os.path.join(d, "volFieldValue.dat"), "w") as f:
            for t in range(1, 1501):
                f.write(f"{t} (0 0 {uz})\n")
    out = subprocess.run([sys.executable, CS, str(tmp_path), "500"], capture_output=True,
                         text=True, check=True).stdout
    row = next(l for l in out.splitlines() if l.strip().startswith("dp_cassette"))
    assert "-1.8" in row, row
    # total-pressure slabs (already Pa): drop 2.3 Pa
    for side, pt in (("below", -1.0), ("above", -3.3)):
        d = os.path.join(c, "postProcessing", f"pT_{side}Cassette", "0"); os.makedirs(d)
        with open(os.path.join(d, "volFieldValue.dat"), "w") as f:
            for t in range(1, 1501):
                f.write(f"{t} {pt}" + chr(10))
    out = subprocess.run([sys.executable, CS, str(tmp_path), "500"], capture_output=True,
                         text=True, check=True).stdout
    row = next(l for l in out.splitlines() if l.strip().startswith("dpTot_cassette"))
    assert "-2.3" in row, row
    A = math.pi * 0.4104 ** 2
    for side, uz in (("below", 0.03), ("above", 0.08)):
        row = next(l for l in out.splitlines() if l.strip().startswith(f"Q_{side}Cassette"))
        assert f"{-uz * A:.5g}" in row, (side, row)


def test_midplane_vtk_is_read(tmp_path):
    """plot_midplane reads the legacy-VTK polydata OpenFOAM's surface writer produces."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("pm", os.path.join(HERE, "..", "sweep", "plot_midplane.py"))
    pm = importlib.util.module_from_spec(spec); spec.loader.exec_module(pm)
    v = tmp_path / "cut.vtk"
    v.write_text("\n".join([
        "# vtk DataFile Version 2.0", "cut", "ASCII", "DATASET POLYDATA",
        "POINTS 4 float", "0 0 0", "1 0 0", "1 0 1", "0 0 1",
        "POLYGONS 1 5", "4 0 1 2 3",
        "POINT_DATA 4", "FIELD attributes 2",
        "p 1 4 float", "1", "2", "3", "4",
        "U 3 4 float", "0 0 1", "0 0 2", "0 0 3", "0 0 4", ""]))
    pts, tris, F = pm.read_vtk(str(v))
    assert len(pts) == 4 and tris == [(0, 1, 2), (0, 2, 3)]
    assert F["p"] == [(1.0,), (2.0,), (3.0,), (4.0,)] and F["U"][3] == (0.0, 0.0, 4.0)
