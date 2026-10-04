"""Make a variant of the porous-duct verification case: any speed, any stack of porous layers.

    python3 make_variant.py <out_dir> <U_mps> <x0:x1:d:f> [<x0:x1:d:f> ...]

Each layer is a box in x (metres along the 200 mm duct, 1 mm cells) with its own Darcy d [1/m2] and
Forchheimer f [1/m], written as its own cellZone and porosityForce exactly as make_sweep.py writes
the group J cassette. verify.py then compares the solver's pressure drop with the Ergun sum over the
layers. Why it exists: group J run #6 measured 0.74 Pa across the three-grade CEM cassette where the
measured flow needs ~2.3 Pa by Ergun. This separates "the porous model under-applies a multi-layer
stack" from "the flow reaches the measuring slab by another route".
"""
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
# OpenFOAM 12 createBaffles: a cyclic pair on faceZone "cassette", porousBafflePressure on p
# (TJunctionFan tutorial layout; jump = -(D nu + I/2 |Un|) |Un| L, times rho for pressure in Pa).
BAFFLE_DICT = """FoamFile { format ascii; class dictionary; object createBafflesDict; }
internalFacesOnly true;
fields true;
baffles
{
    cassette
    {
        type        faceZone;
        zoneName    cassette;
        owner
        {
            name        cassette0;
            type        cyclic;
            neighbourPatch cassette1;
            patchFields
            {
                p
                {
                    type        porousBafflePressure;
                    patchType   cyclic;
                    jump        uniform 0;
                    D           %.8g;
                    I           %.8g;
                    length      1;
                    value       uniform 0;
                }
            }
        }
        neighbour
        {
            name        cassette1;
            type        cyclic;
            neighbourPatch cassette0;
            patchFields
            {
                $../../owner/patchFields;
            }
        }
    }
}
"""
out, U = sys.argv[1], float(sys.argv[2])
layers = [tuple(float(v) for v in s.split(":")) for s in sys.argv[3:]]
assert layers, "give at least one layer x0:x1:d:f"
if os.path.exists(out):
    sys.exit(f"{out} exists - not overwriting")
shutil.copytree(HERE, out, ignore=shutil.ignore_patterns("make_variant.py", "log.*", "postProcessing",
                                                         "[1-9]*", "__pycache__"))

zones = "\n".join(
    f"    {{ name layer{i}Cells; type cellSet; action new; source boxToCell; box ({x0} -1 -1) ({x1} 1 1); }}\n"
    f"    {{ name filter{i}; type cellZoneSet; action new; source setToCellZone; set layer{i}Cells; }}"
    for i, (x0, x1, d, f) in enumerate(layers, 1))
models = "\n".join(
    f"filterLayer{i}\n{{\n    type            porosityForce;\n    porosityForceCoeffs\n    {{\n"
    f"        cellZone        filter{i};\n        type            DarcyForchheimer;\n"
    f"        d   ({d:g} {d:g} {d:g});\n        f   ({f:g} {f:g} {f:g});\n"
    f"        coordinateSystem filterAxes;\n    }}\n}}"
    for i, (x0, x1, d, f) in enumerate(layers, 1))

def rewrite(path, start, body):
    """Keep the FoamFile header, replace everything after the line that starts the body."""
    t = open(path).read()
    open(path, "w").write(t[:t.index(start)] + body + "\n")

if os.environ.get("BAFFLE"):
    # The whole stack as ONE porous baffle: a zero-thickness cyclic pair whose pressure jump is
    # (D mu U + 1/2 I rho U^2) L, with D = sum(t*d), I = sum(t*f), L = 1 - exactly the Ergun sum,
    # independent of how many cells a layer would have had. Placed at the stack's lower face, just
    # off the cell face so the owner/neighbour line crosses it unambiguously.
    D = sum((x1 - x0) * d for x0, x1, d, f in layers); I = sum((x1 - x0) * f for x0, x1, d, f in layers)
    xb = layers[0][0] + 1e-3
    zones = (f"    {{ name cassette; type faceZoneSet; action new; source searchableSurfaceToFaceZone;\n"
             f"      surface searchablePlate; origin ({xb} -0.001 -0.001); span (0 0.022 0.022); }}")
    models = "// the stack is a porous baffle (system/createBafflesDict), not a porous zone"
    open(os.path.join(out, "system", "createBafflesDict"), "w").write(BAFFLE_DICT % (D, I))
rewrite(os.path.join(out, "system", "topoSetDict"), "actions", f"actions\n(\n{zones}\n);")
rewrite(os.path.join(out, "constant", "fvModels"), "biocharBed", models)
# Optional coarse mesh (env DX, metres): a 600 mm duct cut into DX-long cells, so a layer can be
# resolved by exactly as few cells as the group J mesh gives it. Run #8 showed the one-cell C3 layer
# there delivering ~0.5 Pa where Ergun needs ~2 Pa; this tests that in isolation.
if os.environ.get("DX"):
    dx = float(os.environ["DX"]); L = 0.6; n = int(round(L / dx))
    assert abs(n * dx - L) < 1e-9, f"DX {dx} does not divide the {L} m duct"
    bm = os.path.join(out, "system", "blockMeshDict"); t = open(bm).read()
    t = t.replace("(0.2 0 0) (0.2 0.02 0)", f"({L} 0 0) ({L} 0.02 0)") \
         .replace("(0.2 0 0.02) (0.2 0.02 0.02)", f"({L} 0 0.02) ({L} 0.02 0.02)") \
         .replace("(200 8 8)", f"({n} 8 8)")
    assert f"({n} 8 8)" in t and f"({L} 0 0)" in t, "blockMeshDict layout changed - update make_variant"
    open(bm, "w").write(t)
up = os.path.join(out, "0", "U"); t = open(up).read()
open(up, "w").write(t.replace("uniform (0.06 0 0)", f"uniform ({U:g} 0 0)"))
json.dump({"U": U, "layers": [{"t": x1 - x0, "d": d, "f": f} for x0, x1, d, f in layers]},
          open(os.path.join(out, "verify_params.json"), "w"), indent=1)
print(f"{out}: U = {U} m/s, {len(layers)} layer(s), {1000*sum(l[1]-l[0] for l in layers):.0f} mm in total")
