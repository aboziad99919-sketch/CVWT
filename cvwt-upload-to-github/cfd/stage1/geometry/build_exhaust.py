"""Exhaust-top variants for the core tube (group J4, user question 16 Oct 2026: "make the open cylinder a
nozzle - may it increase suction?"). Rig scale (1:12) in mm; make_sweep scales x12.

    python3 build_exhaust.py   -> cvwt_exhaust_n1.stl, cvwt_exhaust_v0.stl, cvwt_exhaust_v1.stl

Core tube (solid variant): r 10-12 mm, top open at z 306.7 mm, just level with the top of the rotor.
  n1  converging NOZZLE on the exit, exit area 0.5 x the tube (r 10 -> 7.07 mm over 13.3 mm). Expected to
      LOSE flow: the exit velocity head grows 4x and is thrown away.
  v0  control: the tube extended 15 mm (0.18 m full size) above the rotor, open. Separates height from cap.
  v1  VENTURI CAP on the v0 extension: a lower dished plate flaring down-out from the exit (r 12 -> 40 mm,
      z 322 -> 316) and an upper plate rising out from a low centre (r 0 -> 40 mm, z 330 -> 338). The passage
      between them is 24 mm at the rim and 8 mm over the exit, so wind from any direction is accelerated
      across the exit and lowers its static pressure. The plates clear the rotor top (z 307.7) by >= 8 mm."""
import math
import numpy as np

R_IN, R_OUT, Z_TOP = 10.0, 12.0, 306.667
T = 1.5


def signed_volume(T_):
    return float(np.sum(np.einsum("ij,ij->i", T_[:, 0], np.cross(T_[:, 1], T_[:, 2]))) / 6.0)


def revolve(poly, nseg=128):
    th = np.linspace(0, 2 * np.pi, nseg + 1)[:-1]; tris = []; m = len(poly)
    for i in range(m):
        (r0, z0), (r1, z1) = poly[i], poly[(i + 1) % m]
        for j in range(nseg):
            a, b = th[j], th[(j + 1) % nseg]
            p00 = (r0 * np.cos(a), r0 * np.sin(a), z0); p01 = (r0 * np.cos(b), r0 * np.sin(b), z0)
            p10 = (r1 * np.cos(a), r1 * np.sin(a), z1); p11 = (r1 * np.cos(b), r1 * np.sin(b), z1)
            tris += [(p00, p10, p11), (p00, p11, p01)]
    T_ = np.array(tris)
    keep = 0.5 * np.linalg.norm(np.cross(T_[:, 1] - T_[:, 0], T_[:, 2] - T_[:, 0]), axis=1) > 1e-12
    T_ = T_[keep]
    return T_[:, ::-1, :] if signed_volume(T_) < 0 else T_


def write(name, shells):
    with open(name + ".stl", "w") as fh:
        n = 0
        for label, poly in shells:
            T_ = revolve(poly); n += len(T_)
            fh.write(f"solid {label}\n")
            for t in T_ / 1000.0:
                nv = np.cross(t[1] - t[0], t[2] - t[0]); nv = nv / (np.linalg.norm(nv) or 1)
                fh.write(f"facet normal {nv[0]:.6e} {nv[1]:.6e} {nv[2]:.6e}\n outer loop\n")
                for v in t: fh.write(f"  vertex {v[0]:.7e} {v[1]:.7e} {v[2]:.7e}\n")
                fh.write(" endloop\nendfacet\n")
            fh.write(f"endsolid {label}\n")
    return n


Z_EXT = Z_TOP + 15.0                                   # 321.7 mm
ext = ("coreExtension", [(R_IN, Z_TOP - 1.0), (R_OUT, Z_TOP - 1.0), (R_OUT, Z_EXT), (R_IN, Z_EXT)])
r_n = R_IN * math.sqrt(0.5)
nozzle = ("nozzle", [(R_IN, Z_TOP - 1.0), (R_OUT, Z_TOP - 1.0), (r_n + 2.0, Z_TOP + 13.3), (r_n, Z_TOP + 13.3)])
lower = ("venturiLower", [(R_IN, Z_EXT - T), (R_OUT, Z_EXT - T), (40.0, Z_EXT - 6.0 - T), (40.0, Z_EXT - 6.0),
                          (R_OUT, Z_EXT), (R_IN, Z_EXT)])
upper = ("venturiUpper", [(0.0, 330.0), (40.0, 338.0), (40.0, 338.0 + T), (0.0, 330.0 + T)])
# three thin struts would hold the upper plate; omitted in the CFD (a few % blockage)

if __name__ == "__main__":
    for name, shells in (("n1", [nozzle]), ("v0", [ext]), ("v1", [ext, lower, upper])):
        print(f"cvwt_exhaust_{name}.stl", write(f"cvwt_exhaust_{name}", shells), "triangles")
    tube_a = math.pi * R_IN ** 2
    print(f"tube area {tube_a:.0f} mm2; v1 throat curtain at r 12: {2 * math.pi * 12 * (330 - Z_EXT):.0f} mm2; "
          f"rim gap {338 - (Z_EXT - 6):.1f} mm (rig) = {(338 - (Z_EXT - 6)) * 12 / 1000:.2f} m full")
