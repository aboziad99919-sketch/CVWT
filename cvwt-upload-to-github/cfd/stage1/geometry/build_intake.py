"""Redesigned air intake (user decision, 1 Oct 2026): the intake must be ABOVE the deck.

Why this exists
---------------
The stage-1 model drew air through slots cut down through the base dish, both mount plates and the
median plate, venting at z = -25 mm to "still room air". That works on a test bench, where there is
air under the median plate. On a road median the base sits on ground: there is no reservoir down
there, and the path does not exist. The slot outlet was always a placeholder (geometry issue G1)
and this replaces it.

What replaces it
----------------
An ANNULAR slot through the housing wall, into the plenum below the bed. Reasons it is a ring and
not a port:
  * omnidirectional - traffic-driven wind alternates with the lane, so a facing intake works half
    the time; a ring does not care which way the wind came from;
  * area for free - circumference 2*pi*36 = 226 mm per mm of slot height, so a 6 mm ring gives
    1357 mm2 against the 467 mm2 of the old slot plate;
  * axisymmetric, so it is a revolution and meshes cleanly;
  * it is a ring, so a grit screen is a ring too.

Optionally a concentric SHROUD turns the same slot into a high intake: an outer sleeve from the
slot up to a mouth at z = 100 mm, so the air is taken from 115 mm above the deck and brought down
the annulus. That is the user's "at least 100 mm" requirement. It is built here because the D1 rake
says the static pressure up there is -5.9 Pa against -7.6 Pa in the bore, leaving only ~1.7 Pa of
the 7.6 Pa the circuit works on today - so it costs roughly two thirds of the flow unless the mouth
recovers dynamic pressure. The flared variant tests exactly that. CFD decides, not this comment.

Output: ONE stl per variant, containing closed shells (the annular gap means the housing is two
shells; that is intended and the test suite checks for it rather than for a single solid).

    python build_intake.py <variant>
    variants: sealed_base | slot14_h6 | slot20_h6 | slot14_h12
              shroud100 | shroud100_flared | shroud70
"""
import json, math, sys
import numpy as np

V = sys.argv[1] if len(sys.argv) > 1 else "slot14_h6"

R_BORE, R_WALL = 34.0, 36.0          # O68 bed housing, 2 mm wall (group D/R baseline)
R_DISH         = 75.0
Z_DISH, Z_LID, Z_LID2, R_SEAT = 5.0, 70.0, 72.0, 12.0
BED_Z0, BED_Z1 = 27.0, 45.0          # porous bed, unchanged from groups D/R
DECK_Z         = -15.0

# ---------- revolution helpers -------------------------------------------------------------
def revolve(poly, nseg=160):
    """Closed (r,z) polygon -> triangles of the solid of revolution."""
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
    return T[keep]

def signed_volume(T):
    return float(np.sum(np.einsum("ij,ij->i", T[:,0], np.cross(T[:,1], T[:,2]))) / 6.0)

def outward(T):
    return T if signed_volume(T) > 0 else T[:, ::-1, :]

def write_stl(name, shells, regions=None):
    """shells: list of triangle arrays, all written under one region named `name`.
       regions: {region_name: triangle array} when the surface needs named regions -
       snappyHexMeshDict addresses the base stack's "walls" and "deckTop" by name, so an
       unnamed solid silently breaks meshing."""
    groups = regions if regions is not None else {name: np.vstack([outward(s) for s in shells])}
    total = 0
    with open(name + ".stl", "w") as fh:
        for rname, T in groups.items():
            fh.write(f"solid {rname}\n")
            for t in np.asarray(T)/1000.0:
                nv = np.cross(t[1]-t[0], t[2]-t[0]); nv = nv/(np.linalg.norm(nv) or 1)
                fh.write(f"facet normal {nv[0]:.6e} {nv[1]:.6e} {nv[2]:.6e}\n outer loop\n")
                for v in t: fh.write(f"  vertex {v[0]:.7e} {v[1]:.7e} {v[2]:.7e}\n")
                fh.write(" endloop\nendfacet\n")
            fh.write(f"endsolid {rname}\n")
            total += len(T)
    print(f"{name}.stl   {total} triangles, regions {list(groups)}")
    return np.vstack([np.asarray(T) for T in groups.values()])

def check(T, label):
    """Every edge must be shared by exactly two triangles, or snappy will leak."""
    q = np.round(T.reshape(-1,3), 6)
    _, idx = np.unique(q, axis=0, return_inverse=True)
    f = idx.reshape(-1,3)
    e = np.sort(np.vstack([f[:,[0,1]], f[:,[1,2]], f[:,[2,0]]]), axis=1)
    _, cnt = np.unique(e, axis=0, return_counts=True)
    bad = int((cnt != 2).sum())
    print(f"   {label}: {len(f)} facets, {bad} non-manifold edges "
          f"{'OK' if bad == 0 else '*** NOT WATERTIGHT ***'}")
    return bad == 0

# ---------- the sealed base stack ----------------------------------------------------------
def sealed_base():
    """Same plate stack as build_outlet.py with every slot removed: nothing passes through it.
    Two regions, matching the file it replaces: deckTop is the road surface at z = -15 (slip in
    CFD, component test), walls is everything else (noSlip)."""
    layers = [(-26,-15,(-700,1500,-600,600)), (-15,-5,(-85,85,-55,55)),
              (-5,0,(-85,85,-85,85)), (0,Z_DISH,(-78,78,-78,78))]
    reg = {"deckTop": [], "walls": []}
    for z0,z1,(x0,x1,y0,y1) in layers:
        c=[(x0,y0),(x1,y0),(x1,y1),(x0,y1)]
        for i in range(4):
            a,b=c[i],c[(i+1)%4]
            reg["walls"] += [((a[0],a[1],z0),(b[0],b[1],z0),(b[0],b[1],z1)),
                             ((a[0],a[1],z0),(b[0],b[1],z1),(a[0],a[1],z1))]
        for z,flip in ((z0,True),(z1,False)):
            t=[((c[0][0],c[0][1],z),(c[1][0],c[1][1],z),(c[2][0],c[2][1],z)),
               ((c[0][0],c[0][1],z),(c[2][0],c[2][1],z),(c[3][0],c[3][1],z))]
            t=[tuple(reversed(x)) for x in t] if flip else t
            reg["deckTop" if (not flip and abs(z+15)<1e-9) else "walls"] += t
    return {k: np.array(v) for k,v in reg.items()}

# ---------- the housing, split by an annular intake slot -----------------------------------
def housing(zs, h):
    """Housing wall with a continuous annular gap centred on zs, h mm tall -> two closed shells."""
    z0, z1 = zs - h/2, zs + h/2
    assert Z_DISH + 2 < z0 and z1 < BED_Z0 - 2, \
        f"slot {z0}-{z1} must sit inside the plenum ({Z_DISH}-{BED_Z0} mm), clear of dish and bed"
    lower = [(R_BORE, 0), (R_DISH, 0), (R_DISH, Z_DISH), (R_WALL, Z_DISH),
             (R_WALL, z0), (R_BORE, z0)]
    upper = [(R_BORE, z1), (R_WALL, z1), (R_WALL, Z_LID), (R_SEAT, Z_LID),
             (R_SEAT, Z_LID2), (R_WALL+2, Z_LID2), (R_WALL+2, z1+0.001)]
    # the upper shell must close: run the inner face back down
    upper = [(R_BORE, z1), (R_WALL, z1), (R_WALL, Z_LID2), (R_SEAT, Z_LID2),
             (R_SEAT, Z_LID), (R_BORE, Z_LID)]
    return [revolve(lower), revolve(upper)]

# ---------- the concentric shroud: a high intake feeding the same slot ----------------------
R_ROTOR, ROTOR_Z0 = 56.0, 80.0           # fin sweep radius and where the rotor starts
CLEAR = 6.0                              # minimum radial gap to the blade path

def shroud(z_mouth, ri=38.0, ro=46.0, zs=14.0, h=6.0):
    """Outer sleeve from the annular slot up to a mouth at z_mouth. Air is taken at the mouth and
    brought DOWN the annulus into the plenum, so the mouth height IS the intake height.

    The sleeve passes through the rotor's swept volume wherever z > 80 mm, so its outer radius has
    to stay clear of the blade path. A flared bell was tried first and reached r = 56 mm - exactly
    the fin sweep - which would have meshed as a collision. The assertion below is what caught it,
    and it stays so the mistake cannot recur."""
    zb = zs - h/2 - 2                         # skirt bottom, just below the slot
    assert zb > Z_DISH, "shroud skirt would foul the base dish"
    if z_mouth > ROTOR_Z0:
        assert ro <= R_ROTOR - CLEAR, (
            f"shroud outer radius {ro} mm leaves only {R_ROTOR-ro:.0f} mm to the fin sweep at "
            f"r = {R_ROTOR} mm; needs >= {CLEAR} mm")
    assert ri > R_WALL + 1, "shroud must clear the housing wall"
    prof = [(ri, zb), (ri, z_mouth), (ro, z_mouth), (ro, zb)]
    return [revolve(prof)]

# ---------- build ---------------------------------------------------------------------------
NAME = f"cvwt_intake_{V}"
if V == "sealed_base":
    reg = sealed_base()
    T = write_stl("cvwt_base_stack_sealed", None, regions=reg)
    check(T, "sealed base (both regions together)")
    print(f"   regions: " + ", ".join(f"{k} {len(v)} facets" for k,v in reg.items()))
    json.dump({"note":"base stack with no through-slots; the intake moved to the housing wall",
               "open_area_mm2":0.0}, open("base_stack_sealed.json","w"), indent=1)
else:
    cfg = {"slot14_h6":   dict(zs=14, h=6,  sh=None),
           "slot20_h6":   dict(zs=20, h=6,  sh=None),
           "slot14_h12":  dict(zs=14, h=12, sh=None),
           "shroud70":    dict(zs=14, h=6,  sh=(70,  38.0, 46.0)),
           "shroud100":   dict(zs=14, h=6,  sh=(100, 38.0, 46.0)),
           "shroud100_wide": dict(zs=14, h=6, sh=(100, 38.0, 50.0))}[V]
    shells = housing(cfg["zs"], cfg["h"])
    if cfg["sh"]: shells += shroud(cfg["sh"][0], cfg["sh"][1], cfg["sh"][2], cfg["zs"], cfg["h"])
    T = write_stl(NAME, shells)
    ok = all(check(outward(s), f"shell {i}") for i, s in enumerate(shells))
    area = 2*math.pi*R_WALL*cfg["h"]
    mouth = cfg["sh"][0] if cfg["sh"] else cfg["zs"]
    ann = None if not cfg["sh"] else math.pi*(cfg["sh"][2]**2 - cfg["sh"][1]**2)
    json.dump({"variant": V, "slot_centre_mm": cfg["zs"], "slot_height_mm": cfg["h"],
               "slot_open_area_mm2": round(area,1),
               "intake_mouth_z_mm": mouth,
               "intake_height_above_deck_mm": round(mouth - DECK_Z, 1),
               "shroud": None if not cfg["sh"] else {"mouth_z_mm": cfg["sh"][0],
                   "r_inner_mm": cfg["sh"][1], "r_outer_mm": cfg["sh"][2],
                   "annulus_area_mm2": round(ann,1),
                   "clearance_to_fin_sweep_mm": round(56.0-cfg["sh"][2],1)},
               "watertight": bool(ok),
               "replaces": "cvwt_base_stack.stl sub-deck slots (467 mm2, z = -25 mm)"},
              open(f"intake_{V}.json","w"), indent=1)
    print(f"   slot area {area:.0f} mm2 (old slot plate 467 mm2), "
          f"intake mouth {mouth - DECK_Z:.0f} mm above the deck")
