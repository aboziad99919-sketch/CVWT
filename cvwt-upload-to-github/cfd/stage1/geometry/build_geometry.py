"""Stage-1 geometry preparation from the uploaded rig STL (units mm -> m, z up, origin at CVWT axis).
Originals are never modified. Outputs:
  cvwt_fins.stl, cvwt_tube.stl, cvwt_caps.stl   - rotor parts copied unchanged (frozen rotor)
  cvwt_housing_cfd.stl                          - CFD-corrected revolved housing: identical walls, but the
                                                  floor is OPENED (radius R_OUT) so the drawn downward outlet exists
  cvwt_filter_zone.json                         - filter cylinder (becomes a porous cellZone, not a wall)
  rig_*.stl                                     - rig parts for the later moving-vehicle stage
Usage: python build_geometry.py <rig.stl> [R_OUT_mm=17]
"""
import json, re, sys
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

src = sys.argv[1]; R_OUT = float(sys.argv[2]) if len(sys.argv) > 2 else 17.0
txt = open(src).read()
T = np.array(re.findall(r"vertex\s+(\S+)\s+(\S+)\s+(\S+)", txt), float).reshape(-1, 3, 3)
P = T.reshape(-1, 3); key = np.round(P * 1e3).astype(np.int64)
u, inv = np.unique(key, axis=0, return_inverse=True); F = inv.ravel().reshape(-1, 3)
e = np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); n = len(u)
_, lab = connected_components(coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)), directed=False)
tl = lab[F[:, 0]]

def comps_where(pred):
    out = []
    for c in np.unique(tl):
        Q = T[tl == c].reshape(-1, 3); lo, hi = Q.min(0), Q.max(0); ext, ctr = hi - lo, (hi + lo) / 2
        if pred(ctr, ext, (tl == c).sum()): out.append(c)
    return out

near_axis = lambda ctr, ext: abs(ctr[0]) < 20 and abs(ctr[1]) < 20
groups = {
    "cvwt_fins":  comps_where(lambda c, x, k: near_axis(c, x) and 80 < max(x[0], x[1]) < 100 and x[2] > 200),
    "cvwt_tube":  comps_where(lambda c, x, k: near_axis(c, x) and abs(x[0] - 24) < 1 and x[2] > 200),
    "cvwt_caps":  comps_where(lambda c, x, k: near_axis(c, x) and abs(x[0] - 30) < 1 and x[2] < 5),
    "cvwt_housing_original": comps_where(lambda c, x, k: near_axis(c, x) and abs(x[0] - 150) < 1 and abs(x[2] - 72) < 1),
    "cvwt_filter_original":  comps_where(lambda c, x, k: near_axis(c, x) and abs(x[0] - 34) < 1 and abs(x[2] - 18) < 1),
    "cvwt_mount_plates": comps_where(lambda c, x, k: near_axis(c, x) and 160 < x[0] < 200 and x[2] <= 10),
    "rig_enclosure": comps_where(lambda c, x, k: x[0] > 2500 and x[1] > 700),
    "rig_median_plate": comps_where(lambda c, x, k: x[0] > 2500 and 100 < x[1] < 120),
    "rig_belts": comps_where(lambda c, x, k: 1800 < x[0] < 1900),
    "rig_end_bars": comps_where(lambda c, x, k: abs(abs(c[0]) - 1250) < 1 and x[1] > 600),
    "vehicles_body": comps_where(lambda c, x, k: x[0] > 200 and x[0] < 420 and 120 < x[1] < 170),
    "vehicles_wheels": comps_where(lambda c, x, k: abs(x[0] - 54) < 1 and abs(x[1] - 16) < 1),
    "vehicles_details": comps_where(lambda c, x, k: x[0] < 15 and x[1] < 30 and abs(c[2] - 50) < 1),
}
used = sorted(c for v in groups.values() for c in v)
from collections import Counter; print("dups", {c:[g for g,v in groups.items() if c in v] for c,k in Counter(used).items() if k>1})
assert len(used) == len(set(used)) == len(np.unique(tl)), f"unclassified/double components: {set(np.unique(tl)) - set(used)}"

def write_stl(name, tris_mm):
    tris = tris_mm / 1000.0
    nrm = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]); nrm /= np.linalg.norm(nrm, axis=1)[:, None] + 1e-30
    with open(f"{name}.stl", "w") as f:
        f.write(f"solid {name}\n")
        for t, nn in zip(tris, nrm):
            f.write(f"facet normal {nn[0]:.6e} {nn[1]:.6e} {nn[2]:.6e}\n outer loop\n")
            for v in t: f.write(f"  vertex {v[0]:.7e} {v[1]:.7e} {v[2]:.7e}\n")
            f.write(" endloop\nendfacet\n")
        f.write(f"endsolid {name}\n")

for g, cs in groups.items():
    write_stl(g, T[np.isin(tl, cs)])

# CFD-corrected housing: solid of revolution with the SAME walls as measured, floor opened to R_OUT.
# Measured profile (mm): dish r<=75 z0..5; fillet r17..23 z5..14; wall r17..19 z5..72; lid r12..19 z70..72.
prof = [(R_OUT, 0), (75, 0), (75, 5), (23, 5), (19, 14), (19, 72), (12, 72), (12, 70), (17, 70), (17, 5), (R_OUT, 5)]
if R_OUT >= 17: prof = [(17, 0), (75, 0), (75, 5), (23, 5), (19, 14), (19, 72), (12, 72), (12, 70), (17, 70)]
def revolve(poly, nseg=128):
    th = np.linspace(0, 2 * np.pi, nseg + 1)[:-1]; tris = []
    m = len(poly)
    for i in range(m):
        (r0, z0), (r1, z1) = poly[i], poly[(i + 1) % m]
        for j in range(nseg):
            a, b = th[j], th[(j + 1) % nseg]
            p00 = (r0 * np.cos(a), r0 * np.sin(a), z0); p01 = (r0 * np.cos(b), r0 * np.sin(b), z0)
            p10 = (r1 * np.cos(a), r1 * np.sin(a), z1); p11 = (r1 * np.cos(b), r1 * np.sin(b), z1)
            tris += [(p00, p10, p11), (p00, p11, p01)]
    T2 = np.array(tris); area = 0.5 * np.linalg.norm(np.cross(T2[:, 1] - T2[:, 0], T2[:, 2] - T2[:, 0]), axis=1)
    return T2[area > 1e-12]
H = revolve(prof)
# orient outward: make signed volume positive
vol = np.einsum('ij,ij->i', H[:, 0], np.cross(H[:, 1], H[:, 2])).sum() / 6
if vol < 0: H = H[:, [0, 2, 1]]
write_stl("cvwt_housing_cfd", H)

filt = {"type": "cylinder", "axis": "z", "radius_m": 0.017, "z0_m": 0.027, "z1_m": 0.045,
        "thickness_m": 0.018, "face_area_m2": float(np.pi * 0.017**2),
        "note": "Measured from the solid placeholder (STL component Ø34 x 18 mm). Meshed as FLUID + porous cellZone."}
json.dump(filt, open("cvwt_filter_zone.json", "w"), indent=2)
json.dump({g: [int(c) for c in cs] for g, cs in groups.items()}, open("component_groups.json", "w"), indent=1)
print({g: len(cs) for g, cs in groups.items()}, "housing signed vol cm3:", round(abs(vol) / 1e3, 1), "R_OUT", R_OUT)
