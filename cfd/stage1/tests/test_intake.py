"""Guards for the redesigned intake (group I).

The design claim being protected: air is drawn in ABOVE the deck, through an annular slot in the
housing wall, and nothing passes through the base. The old sub-deck slot path was a bench artefact -
on a road median the base sits on ground and there is no air under it - so a regression that quietly
reopened it would invalidate every group-I number without failing anything else.
                                                              python tests/test_intake.py"""
import json, math, os, subprocess, sys, pathlib, shutil, tempfile
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
GEOM = HERE.parent / "geometry"
SWEEP = HERE.parent / "sweep"
VARIANTS = ["slot14_h6", "slot20_h6", "slot14_h12", "shroud70", "shroud100", "shroud100_wide"]
R_ROTOR = 56.0

def tris(stl):
    v = []
    for line in open(stl):
        if line.lstrip().startswith("vertex"):
            v.append([float(x) for x in line.split()[1:4]])
    return np.array(v).reshape(-1, 3, 3) * 1000.0          # m -> mm

def watertight(T):
    q = np.round(T.reshape(-1, 3), 6)
    _, idx = np.unique(q, axis=0, return_inverse=True)
    f = idx.reshape(-1, 3)
    e = np.sort(np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
    _, cnt = np.unique(e, axis=0, return_counts=True)
    return int((cnt != 2).sum())

# ---- 1. every variant exists, is watertight, and carries an above-deck intake --------------
for v in VARIANTS:
    stl = GEOM / f"cvwt_intake_{v}.stl"
    assert stl.exists(), f"{stl.name} missing - run build_intake.py {v}"
    T = tris(stl)
    assert watertight(T) == 0, f"{v}: surface is not watertight"
    d = json.load(open(GEOM / f"intake_{v}.json"))
    assert d["intake_height_above_deck_mm"] > 0, \
        f"{v}: intake sits at or below deck level - that is the bug this group exists to fix"
    assert d["slot_open_area_mm2"] >= 467, \
        f"{v}: slot area {d['slot_open_area_mm2']} is below the old slot plate's 467 mm2"
    print(f"  {v:18s} watertight, intake {d['intake_height_above_deck_mm']:>3.0f} mm above deck, "
          f"slot {d['slot_open_area_mm2']:.0f} mm2")

# ---- 2. nothing may reach into the rotor's swept path ---------------------------------------
for v in VARIANTS:
    d = json.load(open(GEOM / f"intake_{v}.json"))
    sh = d.get("shroud")
    if not sh or sh["mouth_z_mm"] <= 80:        # rotor starts at z = 80 mm
        continue
    assert sh["r_outer_mm"] <= R_ROTOR - 6, (
        f"{v}: shroud reaches r={sh['r_outer_mm']} mm into the fin sweep at r={R_ROTOR} mm. "
        "A flared mouth was tried first and did exactly this.")
    print(f"  {v:18s} shroud clears the fin sweep by {R_ROTOR - sh['r_outer_mm']:.0f} mm")

# ---- 3. the sealed base really is sealed -----------------------------------------------------
sealed = GEOM / "cvwt_base_stack_sealed.stl"
assert sealed.exists(), "cvwt_base_stack_sealed.stl missing - run build_intake.py sealed_base"
txt = sealed.read_text()
for region in ("deckTop", "walls"):
    assert f"solid {region}" in txt, \
        f"sealed base is missing the {region} region that snappyHexMeshDict addresses by name"
old = tris(GEOM / "cvwt_base_stack.stl")
new = tris(sealed)
assert len(new) < len(old) / 5, (
    f"sealed base has {len(new)} facets against the slotted base's {len(old)}: the slots look "
    "like they are still there")
print(f"  sealed base: {len(new)} facets vs {len(old)} slotted, regions deckTop + walls  OK")

# ---- 4. a generated group-I case must not reference the old sub-deck path --------------------
sys.path.insert(0, str(SWEEP))
case_id = "I1_F2_t18_U4_az000_open_solid_medium_b34s16_slot14_h6"
run = SWEEP / "runs" / case_id
if run.exists(): shutil.rmtree(run)
r = subprocess.run([sys.executable, "make_sweep.py", "--create", f"--only={case_id}"],
                   cwd=SWEEP, capture_output=True, text=True)
assert run.exists(), f"case not created:\n{r.stdout}\n{r.stderr}"
assert (run / "system" / "INTERNAL_INTAKE").exists(), \
    "marker missing - Allrun would then apply the outletFilter face check and abort"
cd = (run / "system" / "controlDict").read_text()
assert "patchFlowRate(patch=outletFilter" not in cd, \
    "group I still measures flow on the outletFilter patch, which has no faces here"
assert "surfaceFieldValue" in cd and "Q_outletFilter" in cd, \
    "group I must measure the same named quantity on a cut plane"
assert cd.count("{") == cd.count("}"), "controlDict braces are unbalanced"
base_used = (run / "constant" / "geometry" / "cvwt_base_stack.stl").read_text()
assert base_used == sealed.read_text(), "group I case did not get the SEALED base stack"
shutil.rmtree(run)
print("  generated case: sealed base, no outletFilter patch flow, marker present  OK")

print("test_intake: all assertions passed")
