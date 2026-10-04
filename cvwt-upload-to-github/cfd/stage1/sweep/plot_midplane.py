"""Picture the flow on the y = 0 mid-plane written by the cutPlaneSurface function object.

    python3 plot_midplane.py <case_dir> [out.png]

Reads the latest postProcessing/midPlane/<time>/*.vtk (legacy ASCII polydata, point data) and draws
speed and vertical velocity around the filter, with the cassette and housing bore outlined from
system/caseParams. Built to answer one question from group J: does the intake form a jet that hits
the cassette from below?
"""
import glob, os, re, sys


def read_vtk(path):
    tok = open(path).read().split()
    i = tok.index("POINTS"); n = int(tok[i + 1]); i += 3
    pts = [tuple(map(float, tok[i + 3 * k:i + 3 * k + 3])) for k in range(n)]
    i += 3 * n
    tris = []
    if "POLYGONS" in tok:
        j = tok.index("POLYGONS"); m = int(tok[j + 1]); j += 3
        for _ in range(m):
            c = int(tok[j]); ids = list(map(int, tok[j + 1:j + 1 + c])); j += 1 + c
            tris += [(ids[0], ids[k], ids[k + 1]) for k in range(1, c - 1)]
    fields = {}
    if "POINT_DATA" in tok:
        j = tok.index("POINT_DATA") + 2
        if tok[j] == "FIELD":
            nf = int(tok[j + 2]); j += 3
            for _ in range(nf):
                name, nc, nn = tok[j], int(tok[j + 1]), int(tok[j + 2]); j += 4
                vals = list(map(float, tok[j:j + nc * nn])); j += nc * nn
                fields[name] = [tuple(vals[k * nc:(k + 1) * nc]) for k in range(nn)]
    return pts, tris, fields


def params(case):
    out = {}
    for l in open(os.path.join(case, "system", "caseParams")):
        m = re.match(r"\s*([A-Z][A-Z0-9_]*)\s+([-+0-9.eE]+)\s*;", l)
        if m: out[m.group(1)] = float(m.group(2))
    return out


def main(case, png):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt, matplotlib.tri as mtri
    fs = sorted(glob.glob(os.path.join(case, "postProcessing", "midPlane", "*", "*.vtk")),
                key=lambda f: float(os.path.basename(os.path.dirname(f))))
    if not fs: sys.exit(f"no midPlane VTK under {case}/postProcessing")
    pts, tris, F = read_vtk(fs[-1])
    U = F["U"]; x = [p[0] for p in pts]; z = [p[2] for p in pts]
    P = params(case)
    R = P.get("BORE_R", 0.41); z0, z1 = P.get("FILTER_Z0", 0.32), P.get("FILTER_Z1", 0.40)
    win = (-2.2 * R, 2.2 * R, max(0.0, z0 - 2.0 * R), z1 + 1.6 * R)
    tri = mtri.Triangulation(x, z, tris if tris else None)
    fig, axs = plt.subplots(1, 2, figsize=(12, 6.2), dpi=150, sharey=True)
    for ax, (title, vals, cmap, sym) in zip(axs, (
            ("speed |U| [m/s]", [(u[0]**2 + u[1]**2 + u[2]**2) ** 0.5 for u in U], "viridis", False),
            ("vertical velocity Uz [m/s]", [u[2] for u in U], "RdBu_r", True))):
        # colour scale from inside the bore only: the outside wind (~4 m/s) would wash it out
        inwin = [v for v, a, b in zip(vals, x, z) if abs(a) <= R and win[2] <= b <= win[3]]
        lim = max(abs(v) for v in inwin) if inwin else 1.0
        cs = ax.tripcolor(tri, vals, cmap=cmap, shading="gouraud",
                          vmin=-lim if sym else 0.0, vmax=lim)
        fig.colorbar(cs, ax=ax, shrink=0.85, label=title)
        for xs in (-R, R):
            ax.plot([xs, xs], [win[2], win[3]], color="k", lw=1)
        ax.fill_between([-R, R], z0, z1, color="none", hatch="///", edgecolor="0.25", lw=0)
        ax.plot([-R, R, R, -R, -R], [z0, z0, z1, z1, z0], color="0.15", lw=1.2)
        ax.set_xlim(win[0], win[1]); ax.set_ylim(win[2], win[3]); ax.set_aspect("equal")
        ax.set_xlabel("x [m]"); ax.set_title(title, fontsize=10)
    axs[0].set_ylabel("z [m]")
    fig.suptitle(f"{os.path.basename(os.path.normpath(case))} - mid-plane at iteration "
                 f"{os.path.basename(os.path.dirname(fs[-1]))} (hatched: filter cassette)", fontsize=10)
    fig.tight_layout(); fig.savefig(png); plt.close(fig)
    print(f"wrote {png}")


if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    case = sys.argv[1]
    main(case, sys.argv[2] if len(sys.argv) > 2 else os.path.join(case, "midplane.png"))
