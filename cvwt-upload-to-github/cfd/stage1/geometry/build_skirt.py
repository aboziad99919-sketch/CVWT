"""Perforated conical skirt intake (group J), from the hand sketch of 2 October 2026.

Group I asked where to put a slot in the housing wall and found that every answer is bad: lift the
intake to escape road grit and it rises into the rotor's own suction field, which is what drives the
bed, so the head collapses from 4.30 Pa at 29 mm to 1.60 Pa at 115 mm. Height cannot buy both.

This design stops trying. The intake goes back DOWN to deck level, where the external field is least
negative, and grit is handled by screen area instead of altitude: a conical skirt from the ground up
to the housing, perforated over its whole surface. The holes are small enough to reject grit, and
there are enough of them that the screen costs almost nothing, because the face velocity through
4.5 m2 of cone is two orders below the velocity through a slot.

    python3 build_skirt.py <R_SKIRT_mm> <OPEN_FRACTION> [SLOT_Z_mm] [SLOT_H_mm]

Everything here is RIG scale (1:12), like every other surface in this study; make_sweep applies the
x12 scale-up for the full-size cases. The foam cassette does NOT scale and is handled separately.

CFD caveat, stated once and loudly: the real part has thousands of round holes. Resolving them would
cost more cells than the whole domain has, so the cone is built here as concentric annular BANDS of
the same total open area and the same slant distribution. That reproduces the distributed, low-
velocity entry and the plenum it feeds. It does NOT reproduce per-hole jetting or the grit cut-off,
which depends on hole diameter and is a bench question, not a CFD one."""
import sys, math
import numpy as np

R_SKIRT = float(sys.argv[1]) if len(sys.argv) > 1 else 100.0   # skirt base radius [mm, rig]
PHI     = float(sys.argv[2]) if len(sys.argv) > 2 else 0.30    # open-area fraction of the cone
SLOT_Z  = float(sys.argv[3]) if len(sys.argv) > 3 else 19.0    # wall opening centre [mm, rig]
SLOT_H  = float(sys.argv[4]) if len(sys.argv) > 4 else 7.0     # wall opening height [mm, rig]

R_BORE, R_WALL = 34.0, 36.0        # b34 housing: Ø68 bore at rig, Ø816 full size
DECK           = -15.0             # ground surface
Z_PLINTH       = -10.0             # top of the plinth ring the cone stands on
Z_CONE_TOP     = 23.5              # where the cone meets the housing wall
BED_Z0         = 27.0              # foam cassette floor; the cone must finish below it
Z_LID, R_TUBE  = 70.0, 12.0
T_CONE, N_BAND = 2.5, 5            # cone shell thickness [mm, rig]; number of open bands

assert R_SKIRT > 80.0, "skirt must reach outside the Ø150 base dish"
assert Z_CONE_TOP < BED_Z0 - 1, "cone would run into the foam cassette"
assert SLOT_Z + SLOT_H/2 < Z_CONE_TOP, "wall opening must sit below the cone junction"
assert SLOT_Z - SLOT_H/2 > 5.0, "wall opening must sit above the dish floor"
assert 0.05 < PHI < 0.6, "open fraction outside anything a perforated sheet achieves"
# The cone is a shell, not a surface: its material is offset inboard, so the solid reaches HIGHER
# than Z_CONE_TOP. Thickening the shell from 1.5 to 2.5 mm once pushed it into the cassette floor,
# which the group J guards caught. Check the realised top, not the nominal one.
_d = (R_WALL - R_SKIRT, Z_CONE_TOP - Z_PLINTH)
_n = (-_d[1], _d[0]); _L = math.hypot(*_d); _nz = abs(_n[1]) / _L
assert Z_CONE_TOP + T_CONE * _nz < BED_Z0 - 1.0, (
    f"the cone shell tops out at {Z_CONE_TOP + T_CONE*_nz:.2f} mm and the cassette floor is at "
    f"{BED_Z0} mm; lower Z_CONE_TOP or thin the shell")


def revolve(poly, nseg=160):
    """Close a (r, z) polygon and sweep it about the z axis."""
    th = np.linspace(0, 2*np.pi, nseg+1)[:-1]; tris = []; m = len(poly)
    for i in range(m):
        (r0, z0), (r1, z1) = poly[i], poly[(i+1) % m]
        for j in range(nseg):
            a, b = th[j], th[(j+1) % nseg]
            p00 = (r0*np.cos(a), r0*np.sin(a), z0); p01 = (r0*np.cos(b), r0*np.sin(b), z0)
            p10 = (r1*np.cos(a), r1*np.sin(a), z1); p11 = (r1*np.cos(b), r1*np.sin(b), z1)
            tris += [(p00, p10, p11), (p00, p11, p01)]
    T = np.array(tris)
    keep = 0.5*np.linalg.norm(np.cross(T[:,1]-T[:,0], T[:,2]-T[:,0]), axis=1) > 1e-12
    T = T[keep]
    return T[:, ::-1, :] if signed_volume(T) < 0 else T          # outward normals


def signed_volume(T):
    return float(np.sum(np.einsum("ij,ij->i", T[:,0], np.cross(T[:,1], T[:,2]))) / 6.0)


# ---- housing: as drawn, but the wall is cut by a continuous annular opening ----------------
def housing_shells():
    """Two closed shells, below and above the wall opening, so the gap is genuinely open."""
    z0, z1 = SLOT_Z - SLOT_H/2, SLOT_Z + SLOT_H/2
    lower = [(R_BORE, 0), (75, 0), (75, 5), (R_WALL+4, 5), (R_WALL, 14), (R_WALL, z0), (R_BORE, z0)]
    upper = [(R_BORE, z1), (R_WALL, z1), (R_WALL, Z_LID+2), (R_TUBE, Z_LID+2),
             (R_TUBE, Z_LID), (R_BORE, Z_LID)]
    return [("housingLower", lower), ("housingUpper", upper)]


# ---- skirt: a plinth ring, then alternating solid frusta with open bands between -----------
def skirt_shells():
    base, top = np.array([R_SKIRT, Z_PLINTH]), np.array([R_WALL, Z_CONE_TOP])
    d = top - base
    L = float(np.hypot(*d))
    u = d / L
    # Offset the shell toward the axis, so the drawn line is the OUTER skin and the skirt's stated
    # base radius is its real footprint. Taking the other perpendicular (the one with +z) puts the
    # material outboard and above, which grew the footprint and pushed the cone into the cassette.
    n = np.array([-u[1], u[0]])
    if n[0] > 0: n = -n                              # points toward the axis, into the plenum
    solid, gap = (1.0 - PHI) * L / (N_BAND + 1), PHI * L / N_BAND

    shells = [("plinth", [(75, DECK), (R_SKIRT, DECK), (R_SKIRT, Z_PLINTH), (75, Z_PLINTH)])]
    s = 0.0
    for k in range(N_BAND + 1):
        p0, p1 = base + u * s, base + u * (s + solid)
        q1, q0 = p1 + n * T_CONE, p0 + n * T_CONE
        shells.append((f"cone{k+1}", [tuple(p0), tuple(p1), tuple(q1), tuple(q0)]))
        s += solid + gap
    return shells, L


def write(name, shells):
    with open(name + ".stl", "w") as fh:
        total = 0
        for label, poly in shells:
            T = revolve(poly); total += len(T)
            fh.write(f"solid {label}\n")
            for t in T / 1000.0:                     # mm -> m, as every other CFD surface
                nv = np.cross(t[1]-t[0], t[2]-t[0]); nv = nv/(np.linalg.norm(nv) or 1)
                fh.write(f"facet normal {nv[0]:.6e} {nv[1]:.6e} {nv[2]:.6e}\n outer loop\n")
                for v in t: fh.write(f"  vertex {v[0]:.7e} {v[1]:.7e} {v[2]:.7e}\n")
                fh.write(" endloop\nendfacet\n")
            fh.write(f"endsolid {label}\n")
    return total


skirt, L = skirt_shells()
shells = housing_shells() + skirt
name = f"cvwt_skirt_r{int(round(R_SKIRT))}_p{int(round(PHI*100))}"
ntri = write(name, shells)

cone_area = math.pi * (R_SKIRT + R_WALL) * L                      # lateral area of the full cone
open_area = PHI * cone_area
slot_area = 2 * math.pi * R_WALL * SLOT_H
print(f"{name}.stl  {ntri} triangles, {len(shells)} shells")
print(f"  skirt base r {R_SKIRT:.0f} mm   cone slant {L:.1f} mm   junction z {Z_CONE_TOP:.0f} mm")
print(f"  cone area  {cone_area:8.0f} mm2 rig = {cone_area*144/1e6:.2f} m2 full size")
print(f"  open area  {open_area:8.0f} mm2 rig = {open_area*144/1e6:.2f} m2 full size "
      f"({PHI*100:.0f} % of the cone, as {N_BAND} bands)")
print(f"  wall slot  {slot_area:8.0f} mm2 rig = {slot_area*144/1e6:.3f} m2 full size "
      f"-> the slot, not the screen, is the smaller opening by {open_area/slot_area:.1f}x")
for dh in (5.0, 6.0, 8.0):                                        # the real part, for the drawing office
    n = open_area * 144 / (math.pi * (dh/2)**2)
    print(f"  as real holes: {n:7.0f} x Ø{dh:.0f} mm on a {math.sqrt(math.pi*(dh/2)**2/PHI):.1f} mm pitch")
