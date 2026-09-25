"""Slotted downward outlet (user decision 2026-09-22): slots through the base-dish floor, both mount plates
and the median plate, venting to still room air (p = 0) below the median plate.
Writes cvwt_base_stack.stl: ONE watertight solid, two regions:
   deckTop - road/median top surface z = -15 mm (slip in CFD: component test, no floor boundary layer)
   walls   - plate sides, slot walls, dish floor  (noSlip)
Layers (mm):  median plate + deck slab z -26..-15 (extends past the CFD domain; domain bottom z = -25 is the outlet)
              mount plate 170x110  z -15..-5 ;  mount plate 170x170  z -5..0 ;  housing floor 36x36 square z 0..5
Slot layout (PLACEHOLDER, parametric): N parallel slots along x (lane direction), width W, rib RIB, clipped to r = 16 mm
inside the Ø34 housing bore.  Default 3 x 6 mm slots, 2 mm ribs -> ~467 mm^2 open (51 % of the Ø34 placeholder).
Usage: python build_outlet.py [W_mm=6] [RIB_mm=2] [RCLIP_mm=16]"""
import json, math, sys
import numpy as np
W = float(sys.argv[1]) if len(sys.argv) > 1 else 6.0
RIB = float(sys.argv[2]) if len(sys.argv) > 2 else 2.0
# The slots must widen with the housing bore or they become the throttle: group A showed the internal
# passages already consume most of the head. RCLIP defaults to the as-drawn 16 mm.
RCLIP = float(sys.argv[3]) if len(sys.argv) > 3 else 16.0
MARGIN = 1.0
SUFFIX = "" if abs(RCLIP - 16.0) < 1e-9 else f"_r{int(round(RCLIP))}"

slots, k, pitch = [], 0, W + RIB          # odd layout: centre slot on y = 0
while True:
    yc = k * pitch; ye = yc + W / 2
    if ye > RCLIP - MARGIN: break
    hl = math.sqrt(RCLIP**2 - ye**2)
    for s in ((yc,) if k == 0 else (yc, -yc)):
        slots.append((-hl, hl, s - W / 2, s + W / 2))       # x0 x1 y0 y1
    k += 1
layers = [(-26, -15, (-700, 1500, -600, 600)), (-15, -5, (-85, 85, -55, 55)),
          (-5, 0, (-85, 85, -85, 85)), (0, 5, (-18, 18, -18, 18))]
xs = sorted({v for _, _, r in layers for v in r[:2]} | {v for s in slots for v in s[:2]})
ys = sorted({v for _, _, r in layers for v in r[2:]} | {v for s in slots for v in s[2:]})
zs = sorted({z for a, b, _ in layers for z in (a, b)})
X, Y, Z = np.array(xs), np.array(ys), np.array(zs)
nx, ny, nz = len(X) - 1, len(Y) - 1, len(Z) - 1
fill = np.zeros((nx, ny, nz), bool)
for i in range(nx):
    for j in range(ny):
        xc, yc = (X[i] + X[i+1]) / 2, (Y[j] + Y[j+1]) / 2
        inslot = any(s[0] < xc < s[1] and s[2] < yc < s[3] for s in slots)
        for kz in range(nz):
            zc = (Z[kz] + Z[kz+1]) / 2
            for a, b, r in layers:
                if a < zc < b and r[0] < xc < r[1] and r[2] < yc < r[3] and not inslot:
                    fill[i, j, kz] = True
F = np.pad(fill, 1)                                   # padded occupancy
quads = {"deckTop": [], "walls": []}
def quad(p0, p1, p2, p3, region): quads[region].append((p0, p1, p2, p3))
for i in range(nx):
    for j in range(ny):
        for kz in range(nz):
            if not fill[i, j, kz]: continue
            x0, x1, y0, y1, z0, z1 = X[i], X[i+1], Y[j], Y[j+1], Z[kz], Z[kz+1]
            I, J, K = i + 1, j + 1, kz + 1
            if not F[I+1, J, K]: quad((x1,y0,z0),(x1,y1,z0),(x1,y1,z1),(x1,y0,z1),"walls")
            if not F[I-1, J, K]: quad((x0,y0,z0),(x0,y0,z1),(x0,y1,z1),(x0,y1,z0),"walls")
            if not F[I, J+1, K]: quad((x0,y1,z0),(x0,y1,z1),(x1,y1,z1),(x1,y1,z0),"walls")
            if not F[I, J-1, K]: quad((x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1),"walls")
            if not F[I, J, K+1]: quad((x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1),"deckTop" if abs(z1+15) < 1e-9 else "walls")
            if not F[I, J, K-1]: quad((x0,y0,z0),(x0,y1,z0),(x1,y1,z0),(x1,y0,z0),"walls")
# rectilinear boundary quads can meet with T-junctions across layers; split every quad on all grid lines it spans
def split(q):
    P = np.array(q); lo, hi = P.min(0), P.max(0)
    ax = [d for d in range(3) if hi[d] - lo[d] > 1e-12]; grids = {0: X, 1: Y, 2: Z}
    g = [grids[d][(grids[d] >= lo[d] - 1e-9) & (grids[d] <= hi[d] + 1e-9)] for d in ax]
    n = np.cross(P[1] - P[0], P[2] - P[0])
    out = []
    for a0, a1 in zip(g[0][:-1], g[0][1:]):
        for b0, b1 in zip(g[1][:-1], g[1][1:]):
            c = [lo.copy() for _ in range(4)]
            for pt, (u, v) in zip(c, [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]): pt[ax[0]], pt[ax[1]] = u, v
            if np.dot(np.cross(c[1] - c[0], c[2] - c[0]), n) < 0: c = c[::-1]
            out += [(c[0], c[1], c[2]), (c[0], c[2], c[3])]
    return out
with open(f"cvwt_base_stack{SUFFIX}.stl", "w") as f:
    for region, qs in quads.items():
        f.write(f"solid {region}\n")
        for q in qs:
            for t in split(q):
                t = np.array(t) / 1000.0; nn = np.cross(t[1] - t[0], t[2] - t[0]); nn /= np.linalg.norm(nn)
                f.write(f"facet normal {nn[0]:.6e} {nn[1]:.6e} {nn[2]:.6e}\n outer loop\n")
                for v in t: f.write(f"  vertex {v[0]:.7e} {v[1]:.7e} {v[2]:.7e}\n")
                f.write(" endloop\nendfacet\n")
        f.write(f"endsolid {region}\n")
A = sum((s[1] - s[0]) * (s[3] - s[2]) for s in slots)
info = {"shape": "parallel rectangular slots along x (lane direction) - PLACEHOLDER dimensions",
        "n_slots": len(slots), "width_mm": W, "rib_mm": RIB, "slots_mm_x0x1y0y1": [[round(v, 2) for v in s] for s in slots],
        "open_area_mm2": round(A, 1), "fraction_of_d34_placeholder": round(A / (math.pi * 17**2), 3),
        "passage_length_mm": 30, "passage": "housing floor 5 + mount plates 5 + 10 + median plate 10 mm",
        "hydraulic_diameter_mm": round(np.mean([2*(s[1]-s[0])*W/((s[1]-s[0])+W) for s in slots]), 2),
        "exit": "domain bottom z = -25 mm (underside of median plate) -> patch outletFilter, total pressure 0 (still room air)"}
json.dump(info, open((f"outlet_slots{SUFFIX}.json"), "w"), indent=2); print(json.dumps(info, indent=1))
