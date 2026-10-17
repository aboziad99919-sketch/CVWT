"""Parametric CVWT rotor (stage 3 design study), built at RIG scale (1:12) like every other surface.

The drawn fins (cvwt_fins.stl, from the CAD) are curved blades: in plan, each blade's tip leads its
root by ~38 deg (angle offset rising as s^1.25 along the span from root to tip, s = 0..1), and the
blade twists ~175 deg from the bottom (z 75 mm) to the top (z 306.7 mm). Root r 13.9 mm, tip
r 56.0 mm, 1.08 mm thick (13 mm full size). This file rebuilds that family so ONE parameter at a time
can be changed:

    n       number of fins                    (CAD: 4)
    twist   twist over the span [deg]         (CAD: ~175)
    camber  tip lead over the root [deg]      (CAD: ~38; 0 = straight radial blade)
    plates  end plates top and bottom, r 12.4-59 mm, 1.08 mm thick (CAD: none)

    python3 build_fins.py            -> cvwt_fins_<variant>.stl for every VARIANT below
"""
import math, os
import numpy as np

RI, RO, Z0, Z1, T = 0.0139, 0.0560, 0.0750, 0.306667, 0.00108
P_EXP, TH0 = 1.25, math.radians(-3.7)       # camber shape exponent; root angle at the bottom (CAD fit)
VARIANTS = {
    "base":   dict(n=4, twist=175, camber=38, plates=False),
    "tw0":    dict(n=4, twist=0,   camber=38, plates=False),
    "tw90":   dict(n=4, twist=90,  camber=38, plates=False),
    "tw270":  dict(n=4, twist=270, camber=38, plates=False),
    "tw360":  dict(n=4, twist=360, camber=38, plates=False),
    "n2":     dict(n=2, twist=175, camber=38, plates=False),
    "n3":     dict(n=3, twist=175, camber=38, plates=False),
    "cam0":   dict(n=4, twist=175, camber=0,  plates=False),
    "cam80":  dict(n=4, twist=175, camber=80, plates=False),
    "plates": dict(n=4, twist=175, camber=38, plates=True),
    # stage 4: the S3 winners combined; twist = a whole number of fin periods (360/n) keeps the
    # torque ripple low with fewer fins (n3 at 175 deg = 1.46 periods gave 24 %)
    "c1":     dict(n=3, twist=240, camber=80, plates=False),
    "c2":     dict(n=3, twist=360, camber=80, plates=False),
    "c3":     dict(n=2, twist=360, camber=80, plates=False),
    "c4":     dict(n=3, twist=240, camber=38, plates=False),
    # stage 5 (user, 17 Oct 2026: "use the golden ratio"). Same swept area H x D as c1 and the same top
    # (the core exit and venturi cap stay put); phi = 1.618:
    #   g1  c1 blade, rotor height/diameter = phi (c1 is 2.07): Ø1.52 m x 2.46 m full size, bottom raised 0.32 m
    #   g2  g1 with twist 360/phi = 222.5 deg (the "golden" twist; not a whole number of fin periods)
    #   g3  g1 with the hub ratio root/tip = 1/phi^2 = 0.382 (c1: 0.248)
    "g1":     dict(n=3, twist=240,   camber=80, plates=False, geom="golden"),
    "g2":     dict(n=3, twist=222.5, camber=80, plates=False, geom="golden"),
    "g3":     dict(n=3, twist=240,   camber=80, plates=False, geom="golden_hub"),
}
PHI = (1 + 5 ** 0.5) / 2
_A = 2 * RO * (Z1 - Z0)                                   # c1 swept area, kept constant
_RO_G = (_A / PHI) ** 0.5 / 2
GEOMS = {None: dict(ri=RI, ro=RO, z0=Z0),
         "golden": dict(ri=RI, ro=_RO_G, z0=Z1 - PHI * 2 * _RO_G),
         "golden_hub": dict(ri=_RO_G / PHI ** 2, ro=_RO_G, z0=Z1 - PHI * 2 * _RO_G)}


def blade(b, n, twist, camber, nr=18, nz=72, ri=RI, ro=RO, z0=Z0):
    r = np.linspace(ri, ro, nr); z = np.linspace(z0, Z1, nz)
    R_, Z_ = np.meshgrid(r, z, indexing="ij")
    s = (R_ - ri) / (ro - ri)
    th = TH0 + 2 * math.pi * b / n + math.radians(twist) * (Z_ - z0) / (Z1 - z0) + math.radians(camber) * s ** P_EXP
    sides = []
    for sg in (1, -1):
        a = th + sg * (T / 2) / R_
        sides.append(np.stack([R_ * np.cos(a), R_ * np.sin(a), Z_], -1))
    up, dn = sides
    tris = []
    def quad(p, q, r_, s_): tris.extend([(p, q, r_), (p, r_, s_)])
    for i in range(nr - 1):
        for j in range(nz - 1):
            quad(up[i, j], up[i+1, j], up[i+1, j+1], up[i, j+1])
            quad(dn[i, j], dn[i, j+1], dn[i+1, j+1], dn[i+1, j])
    for j in range(nz - 1):                                   # root and tip edges
        quad(up[0, j], up[0, j+1], dn[0, j+1], dn[0, j])
        quad(up[-1, j], dn[-1, j], dn[-1, j+1], up[-1, j+1])
    for i in range(nr - 1):                                   # bottom and top edges
        quad(up[i, 0], dn[i, 0], dn[i+1, 0], up[i+1, 0])
        quad(up[i, -1], up[i+1, -1], dn[i+1, -1], dn[i, -1])
    return tris


def plate(z0, z1, r0=0.0124, r1=0.059, nseg=96):
    a = np.linspace(0, 2 * math.pi, nseg + 1)
    P = lambda r, z, k: np.array([r * math.cos(a[k]), r * math.sin(a[k]), z])
    tris = []
    for k in range(nseg):
        for (ra, rb, za, zb) in ((r0, r1, z1, z1), (r1, r0, z0, z0)):          # top and bottom faces
            tris += [(P(ra, za, k), P(rb, zb, k), P(rb, zb, k+1)), (P(ra, za, k), P(rb, zb, k+1), P(ra, za, k+1))]
        for (r, sg) in ((r1, 1), (r0, -1)):                                     # outer and inner rims
            p, q, u, v = P(r, z0, k), P(r, z0, k+1), P(r, z1, k+1), P(r, z1, k)
            tris += [(p, q, u), (p, u, v)] if sg > 0 else [(p, u, q), (p, v, u)]
    return tris


def orient(tris):
    """Flip all triangles if the closed set has negative signed volume (outward normals)."""
    v = sum(np.dot(a, np.cross(b, c)) for a, b, c in tris) / 6
    return (tris if v > 0 else [(a, c, b) for a, b, c in tris]), abs(v)


def write(path, tris):
    with open(path, "w") as f:
        f.write("solid fins\n")
        for a, b, c in tris:
            nrm = np.cross(b - a, c - a); L = np.linalg.norm(nrm) or 1.0; nrm = nrm / L
            f.write("  facet normal %.6e %.6e %.6e\n    outer loop\n" % tuple(nrm))
            for p in (a, b, c): f.write("      vertex %.7e %.7e %.7e\n" % tuple(p))
            f.write("    endloop\n  endfacet\n")
        f.write("endsolid fins\n")


def build(n, twist, camber, plates, geom=None):
    tris, vol = [], 0.0
    for b in range(n):
        t, v = orient(blade(b, n, twist, camber, **GEOMS[geom])); tris += t; vol += v
    if plates:
        for z0, z1 in ((Z0 - T, Z0), (Z1, Z1 + T)):
            t, v = orient(plate(z0, z1)); tris += t; vol += v
    return tris, vol


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    for name, p in VARIANTS.items():
        tris, vol = build(**p)
        write(os.path.join(here, f"cvwt_fins_{name}.stl"), tris)
        print(f"cvwt_fins_{name}.stl  {len(tris):6d} tris  volume {vol*1e6:6.2f} cm3 (rig)  {p}")
