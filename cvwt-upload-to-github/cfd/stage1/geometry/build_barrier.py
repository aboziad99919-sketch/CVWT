"""Open steel median barrier (group J2), from the Rev C impact check of 12 October 2026.

The CVWT cannot be designed to survive a vehicle strike (EN 1991-1-7: 500-1000 kN), so it must sit
behind a vehicle restraint system. A solid concrete barrier would wall off the deck-level skirt
intake, so the proposal is an OPEN steel W-beam on posts. This file builds it so the cost to the
filter flow is measured.

    python3 build_barrier.py            -> cvwt_barrier_par.stl and cvwt_barrier_perp.stl

Full-size layout (built here at RIG scale 1:12, like every other surface; make_sweep scales x12):
  W-beam rail modelled as a solid bar 0.31 m tall x 0.10 m deep, z 0.44-0.75 m above the deck
  (same frontal blockage; the 3 mm corrugated sheet itself is unmeshable), posts 0.15 x 0.15 m
  at 2.0 m pitch, deck to rail top. Barrier back face at r = 2.2 m: the r 1.2 m skirt plus a
  1.0 m working width. One barrier each side of the device.
  par  - rails run along x, the wind direction: wind along the road, as in group J.
  perp - rails run along y, across the wind: a crosswind blowing over one barrier into the skirt.
Below the rail the barrier is 93 % open (posts only); over its full 0.75 m height about 52 %."""
import os

DECK = -0.015
S = 1/12.0
Z_R0, Z_R1 = DECK + 0.44*S, DECK + 0.75*S
R_BACK, POST, RAIL = 2.2*S, 0.15*S, 0.10*S
PITCH = 2.0*S
X0, X1, Y0, Y1 = -0.65, 1.45, -0.55, 0.55          # past the domain (-0.6..1.4, -0.5..0.5)


def box(lo, hi):
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    quads = [((0, 3, 2, 1), (0, 0, -1)), ((4, 5, 6, 7), (0, 0, 1)), ((0, 1, 5, 4), (0, -1, 0)),
             ((2, 3, 7, 6), (0, 1, 0)), ((1, 2, 6, 5), (1, 0, 0)), ((3, 0, 4, 7), (-1, 0, 0))]
    out = []
    for q, n in quads:
        for tri in ((q[0], q[1], q[2]), (q[0], q[2], q[3])):
            out.append((n, [v[i] for i in tri]))
    return out


def barrier(along_x):
    tris = []
    for side in (-1, 1):
        a = R_BACK + POST - 0.0002                        # rail overlaps the posts by 0.2 mm (rig)
        b = R_BACK + POST + RAIL
        r0, r1 = sorted((side*a, side*b))
        p0, p1 = sorted((side*R_BACK, side*(R_BACK + POST)))
        if along_x:
            tris += box((X0, r0, Z_R0), (X1, r1, Z_R1))
        else:
            tris += box((r0, Y0, Z_R0), (r1, Y1, Z_R1))
        lo, hi = (X0, X1) if along_x else (Y0, Y1)
        k = int(lo/PITCH) - 1
        while k*PITCH <= hi:
            c = k*PITCH
            if lo < c - POST/2 and c + POST/2 < hi:
                if along_x:
                    tris += box((c - POST/2, p0, DECK - 0.001), (c + POST/2, p1, Z_R1))
                else:
                    tris += box((p0, c - POST/2, DECK - 0.001), (p1, c + POST/2, Z_R1))
            k += 1
    return tris


def write(path, tris):
    with open(path, "w") as f:
        f.write("solid barrier\n")
        for n, vs in tris:
            f.write("  facet normal %g %g %g\n    outer loop\n" % n)
            for p in vs:
                f.write("      vertex %.6f %.6f %.6f\n" % p)
            f.write("    endloop\n  endfacet\n")
        f.write("endsolid barrier\n")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    for name, ax in (("par", True), ("perp", False)):
        t = barrier(ax)
        write(os.path.join(here, f"cvwt_barrier_{name}.stl"), t)
        print(f"cvwt_barrier_{name}.stl: {len(t)} triangles")
