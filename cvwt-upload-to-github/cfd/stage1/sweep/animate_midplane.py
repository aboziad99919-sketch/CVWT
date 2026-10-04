"""Animate air moving through the CVWT housing, from the mid-plane slice of a finished run.

    python3 animate_midplane.py <case_dir> [out.gif] [--seconds 8] [--speedup 4]

Tracer particles are carried by the in-plane velocity (Ux, Uz) of the y = 0 slice written by the
cutPlaneSurface function object, over a faded map of the speed. It is a picture of a 3-D steady
flow drawn on one plane: a real parcel also moves out of the plane, so read it as "where the air
goes and how fast", not as a trajectory calculation. Particles are seeded where the air enters the
housing (the wall slot) and through the bore below the filter, and recycled when they leave.
"""
import glob, math, os, random, sys


def main(case, gif, seconds=8.0, speedup=4.0, fps=12):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import plot_midplane as pm
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt, matplotlib.tri as mtri
    from matplotlib.animation import FuncAnimation, PillowWriter

    fs = sorted(glob.glob(os.path.join(case, "postProcessing", "midPlane", "*", "*.vtk")),
                key=lambda f: float(os.path.basename(os.path.dirname(f))))
    pts, tris, F = pm.read_vtk(fs[-1])
    P = pm.params(case)
    R = P.get("BORE_R", 0.41); z0, z1 = P.get("FILTER_Z0", 0.324), P.get("FILTER_Z1", 0.399)
    x = [p[0] for p in pts]; z = [p[2] for p in pts]; U = F["U"]
    tri = mtri.Triangulation(x, z, tris)
    speed = [math.hypot(u[0], u[2]) for u in U]
    xlo, xhi, zlo, zhi = -1.25 * R, 1.25 * R, 0.05, z1 + 1.5 * R

    # The cut-plane writer leaves a few overlapping triangles, which matplotlib's point locator
    # rejects, so the velocity is resampled onto a regular grid instead. Grid nodes farther than
    # 25 mm (about 1.5 cells of the full-scale mesh) from any slice point are solid and get no velocity.
    import numpy as np
    from scipy.interpolate import griddata, RegularGridInterpolator
    from scipy.spatial import cKDTree
    h = 0.006
    gx = np.arange(xlo - 0.05, xhi + 0.05, h); gz = np.arange(zlo - 0.05, zhi + 0.05, h)
    keep = [i for i in range(len(pts)) if xlo - 0.1 < x[i] < xhi + 0.1 and zlo - 0.1 < z[i] < zhi + 0.1]
    xy = np.array([(x[i], z[i]) for i in keep])
    GX, GZ = np.meshgrid(gx, gz, indexing="ij")
    gux = griddata(xy, np.array([U[i][0] for i in keep]), (GX, GZ), method="linear")
    guz = griddata(xy, np.array([U[i][2] for i in keep]), (GX, GZ), method="linear")
    far = cKDTree(xy).query(np.c_[GX.ravel(), GZ.ravel()])[0].reshape(GX.shape) > 0.025
    gux[far] = np.nan; guz[far] = np.nan
    fux = RegularGridInterpolator((gx, gz), gux, bounds_error=False, fill_value=np.nan)
    fuz = RegularGridInterpolator((gx, gz), guz, bounds_error=False, fill_value=np.nan)
    rng = random.Random(7)

    def seed():
        # 15 % just inside the wall slot, 50 % in the bore below the filter, 35 % across the filter
        # itself: on one plane the flow under the filter is mostly sideways, yet air crosses the
        # whole filter (Uz ~ 0.09 m/s everywhere above it), so seeding only below would hide that.
        r = rng.random()
        if r < 0.15:
            return [rng.choice((-1, 1)) * (R - 0.035), rng.uniform(z0 - 0.13, z0 - 0.05)]
        if r < 0.65:
            return [rng.uniform(-0.95 * R, 0.95 * R), rng.uniform(zlo + 0.03, z0 - 0.02)]
        return [rng.uniform(-0.95 * R, 0.95 * R), rng.uniform(z0, z1)]

    N = 450
    parts = [seed() for _ in range(N)]
    age = [rng.randint(0, 70) for _ in range(N)]
    frames = int(seconds * fps)
    dt_real = speedup / fps                 # seconds of flow per frame
    sub = 6

    fig, ax = plt.subplots(figsize=(5.6, 6.4), dpi=80)
    inbore = [s for s, a, b in zip(speed, x, z) if abs(a) < R and zlo < b < zhi]
    vmax = sorted(inbore)[int(0.98 * len(inbore))] if inbore else 1.0
    gs = np.hypot(gux, guz)                                   # speed on the grid, NaN in solids
    ax.imshow(gs.T, origin="lower", extent=(gx[0], gx[-1], gz[0], gz[-1]), cmap="Blues",
              vmin=0, vmax=vmax, alpha=0.6, interpolation="bilinear")
    ax.fill_between([-R, R], z0, z1, color="#8a7466", alpha=0.55, lw=0)
    ax.text(0, (z0 + z1) / 2, "filter cassette", ha="center", va="center", fontsize=8, color="white")
    ax.plot([-R, -R], [zlo, zhi], "k-", lw=1); ax.plot([R, R], [zlo, zhi], "k-", lw=1)
    ax.set_xlim(xlo, xhi); ax.set_ylim(zlo, zhi); ax.set_aspect("equal")
    ax.set_xlabel("x [m]"); ax.set_ylabel("z [m]")
    ax.set_title(f"{os.path.basename(os.path.normpath(case))}\nair through the housing, mid-plane, "
                 f"playback x{speedup:g}", fontsize=8)
    sc = ax.scatter([p[0] for p in parts], [p[1] for p in parts], s=5, c="#d6602a", lw=0)
    clock = ax.text(0.02, 0.98, "", transform=ax.transAxes, va="top", fontsize=8)

    def vel(px, pz):
        a, b = float(fux((px, pz))), float(fuz((px, pz)))
        return None if (a != a or b != b) else (a, b)       # NaN: solid or outside the slice

    def step(k):
        h = dt_real / sub
        for i, p in enumerate(parts):
            for _ in range(sub):
                v = vel(p[0], p[1])
                if v is None: break
                p[0] += v[0] * h; p[1] += v[1] * h
            age[i] += 1
            # recycle: left the picture, hit a solid, stalled in a dead corner (on one plane a 3-D
            # flow has stagnant spots a real parcel would leave sideways), or simply old
            stalled = v is not None and math.hypot(*v) < 0.012
            if v is None or stalled or not (xlo < p[0] < xhi and zlo < p[1] < zhi) or age[i] > 70:
                parts[i] = seed(); age[i] = 0
        sc.set_offsets([(p[0], p[1]) for p in parts])
        clock.set_text(f"t = {k * dt_real:5.1f} s of flow")
        return sc, clock

    anim = FuncAnimation(fig, step, frames=frames, interval=1000 / fps, blit=False)
    anim.save(gif, writer=PillowWriter(fps=fps))
    plt.close(fig)
    print(f"wrote {gif} ({frames} frames)")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    opts = {"--seconds": 8.0, "--speedup": 4.0}
    for k in list(opts):
        if k in a:
            i = a.index(k); opts[k] = float(a[i + 1]); del a[i:i + 2]
    case = a[0]
    main(case, a[1] if len(a) > 1 else os.path.join(case, "airflow.gif"), opts["--seconds"], opts["--speedup"])
