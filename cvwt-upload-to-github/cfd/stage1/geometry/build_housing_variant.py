"""Widened filter housing, as a standalone solid of revolution.

Group A showed the bed's driving pressure is capped at about 1.62 Pa, so the way to move more air is
to lower the face velocity rather than to chase more head: Ergun loss falls with velocity, and
velocity is flow over bed area. This widens the housing bore while keeping the 2 mm wall, the base
dish and the Ø24 tube seat exactly as drawn, so bore radius is the only variable.

    python build_housing_variant.py <R_BORE_mm> [R_OUT_mm]

R_BORE = 17 reproduces the as-drawn housing, which the test suite checks against the original file."""
import sys
import numpy as np

R_BORE = float(sys.argv[1]); R_OUT = float(sys.argv[2]) if len(sys.argv) > 2 else R_BORE
SUFFIX = "" if abs(R_BORE - 17.0) < 1e-9 else f"_r{int(round(R_BORE))}"
RB, RW = R_BORE, R_BORE + 2.0
assert RW + 4 < 75, "housing wall would reach the base dish at r = 75 mm"
assert RB > 12, "bore must clear the Ø24 tube seat"

# measured profile: dish r<=75 z0..5; fillet to the wall by z14; wall to z72; lid closing onto r12
prof = [(RB, 0), (75, 0), (75, 5), (RW + 4, 5), (RW, 14), (RW, 72), (12, 72), (12, 70), (RB, 70)]

def revolve(poly, nseg=128):
    th = np.linspace(0, 2 * np.pi, nseg + 1)[:-1]; tris = []; m = len(poly)
    for i in range(m):
        (r0, z0), (r1, z1) = poly[i], poly[(i + 1) % m]
        for j in range(nseg):
            a, b = th[j], th[(j + 1) % nseg]
            p00 = (r0*np.cos(a), r0*np.sin(a), z0); p01 = (r0*np.cos(b), r0*np.sin(b), z0)
            p10 = (r1*np.cos(a), r1*np.sin(a), z1); p11 = (r1*np.cos(b), r1*np.sin(b), z1)
            tris += [(p00, p10, p11), (p00, p11, p01)]
    T = np.array(tris)
    keep = 0.5*np.linalg.norm(np.cross(T[:,1]-T[:,0], T[:,2]-T[:,0]), axis=1) > 1e-12
    return T[keep]

def signed_volume(T):
    return float(np.sum(np.einsum("ij,ij->i", T[:,0], np.cross(T[:,1], T[:,2]))) / 6.0)

T = revolve(prof)
if signed_volume(T) < 0:                      # outward normals
    T = T[:, ::-1, :]
name = f"cvwt_housing_cfd{SUFFIX}"
with open(name + ".stl", "w") as fh:
    fh.write(f"solid {name}\n")
    for t in T / 1000.0:                      # mm -> m, as every other CFD surface
        n = np.cross(t[1]-t[0], t[2]-t[0]); n = n/(np.linalg.norm(n) or 1)
        fh.write(f"facet normal {n[0]:.6e} {n[1]:.6e} {n[2]:.6e}\n outer loop\n")
        for v in t: fh.write(f"  vertex {v[0]:.7e} {v[1]:.7e} {v[2]:.7e}\n")
        fh.write(" endloop\nendfacet\n")
    fh.write(f"endsolid {name}\n")
print(f"{name}.stl  bore r={RB} mm  wall r={RW} mm  face area {np.pi*(RB/1000)**2*1e6:.0f} mm2  "
      f"volume {abs(signed_volume(T))/1e3:.1f} cm3  {len(T)} triangles")
