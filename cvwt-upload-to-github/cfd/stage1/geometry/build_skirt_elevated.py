"""Elevated-inlet skirts (group J3, user request 16 Oct 2026): take the traffic air in ABOVE the layer of
coarse road grit instead of at deck level.

    python3 build_skirt_elevated.py      -> cvwt_skirt_e1_p30.stl, cvwt_skirt_e2_p30.stl

Rig scale (1:12) in mm, as every other surface; make_sweep scales x12. The housing with its wall slot is
the same as build_skirt.py (slot z 15.5-22.5 mm, cassette floor 27 mm), so only the intake changes.

  e1  "high band": the r100 cone of group J, but its lower 45 % of slant is SOLID. Openings run from
      z 5 to 23.5 mm (full size 0.25-0.46 m above the island) instead of from the plinth (0.06 m).
  e2  "elevated collar": a SOLID cone (grit shield) from the plinth to r 50 mm, then a vertical collar
      r 50 mm up to z 58 mm with a closed top. Two open bands at z 41-45 and 50-54 mm (full size
      0.67-0.83 m above the island). Air enters high, flows DOWN the annulus between collar and wall to
      the slot; the volume under the solid cone is a quiet settling chamber (grit tray in the design).

Perforations are modelled as annular open bands of the same open area, as in build_skirt.py."""
import math
import numpy as np

R_BORE, R_WALL, DECK, Z_PLINTH = 34.0, 36.0, -15.0, -10.0
SLOT_Z, SLOT_H, BED_Z0, Z_LID, R_TUBE = 19.0, 7.0, 27.0, 70.0, 12.0
R_SKIRT, Z_CONE_TOP, T = 100.0, 23.5, 2.5


def signed_volume(T_):
    return float(np.sum(np.einsum("ij,ij->i", T_[:, 0], np.cross(T_[:, 1], T_[:, 2]))) / 6.0)


def revolve(poly, nseg=160):
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


def housing_shells():
    z0, z1 = SLOT_Z - SLOT_H / 2, SLOT_Z + SLOT_H / 2
    lower = [(R_BORE, 0), (75, 0), (75, 5), (R_WALL + 4, 5), (R_WALL, 14), (R_WALL, z0), (R_BORE, z0)]
    upper = [(R_BORE, z1), (R_WALL, z1), (R_WALL, Z_LID + 2), (R_TUBE, Z_LID + 2), (R_TUBE, Z_LID), (R_BORE, Z_LID)]
    return [("housingLower", lower), ("housingUpper", upper)]


def plinth():
    return ("plinth", [(75, DECK), (R_SKIRT, DECK), (R_SKIRT, Z_PLINTH), (75, Z_PLINTH)])


def frustum(p0, p1, n, label):
    return (label, [tuple(p0), tuple(p1), tuple(p1 + n * T), tuple(p0 + n * T)])


def cone_frame(r_top, z_top):
    base, top = np.array([R_SKIRT, Z_PLINTH]), np.array([r_top, z_top])
    d = top - base; L = float(np.hypot(*d)); u = d / L
    n = np.array([-u[1], u[0]]); n = -n if n[0] > 0 else n           # toward the axis
    return base, u, n, L


def e1(phi=0.30, solid_frac=0.45, nband=3):
    base, u, n, L = cone_frame(R_WALL, Z_CONE_TOP)
    sh = [plinth(), frustum(base, base + u * (solid_frac * L), n, "coneSolid")]
    Lu = (1 - solid_frac) * L
    solid, gap = (1 - phi) * Lu / (nband + 1), phi * Lu / nband
    s = solid_frac * L
    for k in range(nband + 1):
        sh.append(frustum(base + u * s, base + u * (s + solid), n, f"cone{k + 1}"))
        s += solid + gap
    z_open = (base + u * (solid_frac * L))[1]
    return sh, z_open, Z_CONE_TOP, 2 * math.pi * 0.5 * (R_WALL + R_SKIRT) * Lu * phi


def e2(r_col=50.0, z_top=58.0, bands=((41.0, 45.0), (50.0, 54.0))):
    # solid cone from the plinth up to the collar radius
    z_c = Z_PLINTH + (R_SKIRT - r_col) / (R_SKIRT - R_WALL) * (Z_CONE_TOP - Z_PLINTH)
    base, u, n, L = cone_frame(R_WALL, Z_CONE_TOP)
    s_c = (R_SKIRT - r_col) / (R_SKIRT - R_WALL) * L
    sh = [plinth(), frustum(base, base + u * s_c, n, "coneShield")]
    # vertical collar r_col (material inboard), split by the open bands
    zs = [z_c - 1.0]
    for a, b in bands: zs += [a, b]
    zs.append(z_top)
    for k in range(0, len(zs), 2):
        z0, z1 = zs[k], zs[k + 1]
        sh.append((f"collar{k // 2 + 1}", [(r_col, z0), (r_col, z1), (r_col - T, z1), (r_col - T, z0)]))
    sh.append(("collarCap", [(R_WALL - 0.5, z_top), (r_col, z_top), (r_col, z_top + T), (R_WALL - 0.5, z_top + T)]))
    open_area = sum(2 * math.pi * r_col * (b - a) for a, b in bands)
    return sh, bands[0][0], bands[-1][1], open_area


def write(name, shells):
    with open(name + ".stl", "w") as fh:
        total = 0
        for label, poly in shells:
            T_ = revolve(poly); total += len(T_)
            fh.write(f"solid {label}\n")
            for t in T_ / 1000.0:
                nv = np.cross(t[1] - t[0], t[2] - t[0]); nv = nv / (np.linalg.norm(nv) or 1)
                fh.write(f"facet normal {nv[0]:.6e} {nv[1]:.6e} {nv[2]:.6e}\n outer loop\n")
                for v in t: fh.write(f"  vertex {v[0]:.7e} {v[1]:.7e} {v[2]:.7e}\n")
                fh.write(" endloop\nendfacet\n")
            fh.write(f"endsolid {label}\n")
    return total


if __name__ == "__main__":
    slot = 2 * math.pi * R_WALL * SLOT_H
    for name, (sh, zlo, zhi, area) in (("e1", e1()), ("e2", e2())):
        ntri = write(f"cvwt_skirt_{name}_p30", housing_shells() + sh)
        print(f"cvwt_skirt_{name}_p30.stl {ntri} tris | openings z {zlo:.1f}-{zhi:.1f} mm rig = "
              f"{(zlo - DECK) * 12 / 1000:.2f}-{(zhi - DECK) * 12 / 1000:.2f} m above the island | "
              f"open area {area * 144 / 1e6:.2f} m2 full, {area / slot:.1f}x the wall slot")
