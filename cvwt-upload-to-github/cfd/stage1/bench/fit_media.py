"""Fit the measured biochar pressure drop to the Darcy-Forchheimer law the CFD uses.

    python fit_media.py readings.csv [--plot fig.png]

Model (the same one OpenFOAM's DarcyForchheimer applies in every stage-1 case), on SUPERFICIAL
velocity V = Q / A_column:

    dp / L = mu * d * V  +  1/2 * rho * f * V^2

The readings file is a CSV with '# key = value' header lines for the column geometry, then one
row per reading (see readings_template.csv). The script:

1. subtracts the empty-column blank, converts flow to V and pressure to a gradient, and takes air
   density and viscosity from each row's temperature and pressure;
2. fits d and f by least squares on RELATIVE residuals, so the low-velocity points - where the
   CVWT actually operates - count as much as the high ones;
3. reports 95 % intervals, the spread between repacks, and the Ergun-equivalent porosity and
   grain size (a sanity check against the sieve and density measurements);
4. estimates the flow the stage-1 sealed-core design would carry with this biochar, at rig scale
   and full size, from the system curves the stage-1 CFD measured. That is an interpolation to
   decide which cases to re-run, not a result: confirm it with CFD before quoting it.
"""
import csv, math, sys

# ---- stage-1 reference data ---------------------------------------------------------------------
MU_CFD, RHO_CFD = 1.8e-5, 1.2          # air as used in the stage-1 CFD
ASSUMED = {                            # stage-1 assumed media, Ergun on superficial velocity
    "F1 (d_p 4 mm)": (3.11e7, 5.28e3),
    "F2 (d_p 2 mm)": (1.24e8, 1.06e4),
    "F3 (d_p 1 mm)": (4.98e8, 2.11e4),
}
# Pressure available to the bed in the sealed-core design, as a function of the flow through it,
# fitted to the stage-1 CFD: bed dp = head(Q=0) - losses(Q) elsewhere in the path.
#   rig  : Ø68 x 18 mm bed.   F1/F2/F3 gave 23.98/16.69/7.44 L/min at bed dp 1.77/3.58/5.46 Pa,
#          sealed head 6.451 Pa. Losses fit a*Q + b*Q^2 (F2 is reproduced within 2.4 %).
#   full : Ø816 x 216 mm bed. F1/F2/F3 gave 1250/410/108 L/min at bed dp 5.58/6.25/6.50 Pa,
#          sealed head 6.589 Pa. Losses are linear in Q to within 1 %.
SYSTEMS = {
    "rig 1:12  (sealed core, Ø68 x 18 mm bed)": dict(D=0.068, t=0.018, H0=6.451, a=0.1052, b=0.003752),
    "full size (sealed core, Ø816 x 216 mm bed)": dict(D=0.816, t=0.216, H0=6.589, a=8.2e-4, b=0.0),
}


def air(T_C, p_kPa):
    """Density from the ideal gas law, viscosity from Sutherland."""
    T = T_C + 273.15
    rho = p_kPa * 1e3 / (287.05 * T)
    mu = 1.716e-5 * (T / 273.15) ** 1.5 * (273.15 + 110.4) / (T + 110.4)
    return rho, mu


def read(path):
    meta, rows = {}, []
    with open(path, newline="", encoding="utf-8-sig") as fh:
        lines = [l for l in fh]
    body = []
    for l in lines:
        s = l.strip()
        if s.startswith("#"):
            if "=" in s:
                k, v = s[1:].split("=", 1)
                meta[k.strip()] = v.split("#")[0].strip()
        elif s:
            body.append(l)
    for r in csv.DictReader(body):
        if not (r.get("flow_Lpm") or "").strip() or not (r.get("dp_Pa") or "").strip():
            continue                                       # blank data-sheet rows
        rows.append(r)
    return meta, rows


def points(meta, rows):
    D = float(meta["column_ID_mm"]) / 1000.0
    L = float(meta["tap_spacing_mm"]) / 1000.0
    A = math.pi * D * D / 4.0
    pts = []
    for r in rows:
        Q = float(r["flow_Lpm"]) / 60000.0
        blank = float(r.get("dp_blank_Pa") or 0.0)
        rho, mu = air(float(r.get("T_C") or 22.0), float(r.get("p_kPa") or 101.325))
        pts.append(dict(run=(r.get("run") or "1").strip(), V=Q / A, g=(float(r["dp_Pa"]) - blank) / L,
                        rho=rho, mu=mu))
    return pts, A, D, L


def fit(pts):
    """Weighted least squares for (d, f): minimise sum(((model - g) / g)^2)."""
    X = [(p["mu"] * p["V"] / p["g"], 0.5 * p["rho"] * p["V"] ** 2 / p["g"]) for p in pts]
    n = len(pts)
    s11 = sum(a * a for a, _ in X); s12 = sum(a * b for a, b in X); s22 = sum(b * b for _, b in X)
    r1 = sum(a for a, _ in X); r2 = sum(b for _, b in X)       # right-hand side: target is 1
    det = s11 * s22 - s12 * s12
    d = (r1 * s22 - r2 * s12) / det
    f = (s11 * r2 - s12 * r1) / det
    darcy_only = False
    if f < 0:                                                   # no measurable inertia: pure Darcy
        d, f, darcy_only = r1 / s11, 0.0, True
    res = [a * d + b * f - 1.0 for a, b in X]
    k = 1 if darcy_only else 2
    s2 = sum(e * e for e in res) / max(n - k, 1)
    t95 = {1: 12.7, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23}.get(n - k, 2.0)
    if darcy_only:
        ci_d, ci_f = t95 * math.sqrt(s2 / s11), 0.0
    else:
        ci_d = t95 * math.sqrt(s2 * s22 / det)
        ci_f = t95 * math.sqrt(s2 * s11 / det)
    return dict(d=d, f=f, ci_d=ci_d, ci_f=ci_f, rms=math.sqrt(sum(e * e for e in res) / n),
                worst=max(abs(e) for e in res), n=n, darcy_only=darcy_only)


def ergun_equivalent(d, f):
    """Invert d = 150(1-e)^2/(e^3 dp^2), f = 3.5(1-e)/(e^3 dp): the porosity and grain size an
    ideal Ergun bed would need to give these coefficients."""
    if d <= 0 or f <= 0:
        return None, None
    eps = (12.25 * d / (150.0 * f * f)) ** (1.0 / 3.0)
    if not 0 < eps < 1:
        return eps, None
    dp = 3.5 * (1 - eps) / (eps ** 3 * f)
    return eps, dp


def operating_point(d, f, sys_):
    """Flow where the bed's dp(Q) meets the pressure the stage-1 design makes available."""
    A = math.pi * sys_["D"] ** 2 / 4.0
    bed = lambda Q: sys_["t"] * (MU_CFD * d * (Q / 60000 / A) + 0.5 * RHO_CFD * f * (Q / 60000 / A) ** 2)
    avail = lambda Q: sys_["H0"] - sys_["a"] * Q - sys_["b"] * Q * Q
    lo, hi = 0.0, 1.0
    while bed(hi) < avail(hi) and hi < 1e7:
        hi *= 2
    for _ in range(200):
        m = 0.5 * (lo + hi)
        if bed(m) < avail(m): lo = m
        else: hi = m
    Q = 0.5 * (lo + hi)
    V = Q / 60000 / A
    return Q, V, sys_["t"] / V if V > 0 else float("inf"), bed(Q)


def report(path, plot=None):
    meta, rows = read(path)
    pts, A, D, L = points(meta, rows)
    if len(pts) < 3:
        sys.exit("need at least 3 readings")
    F = fit(pts)
    out = []
    w = out.append
    w(f"Biochar bench test: {meta.get('sample', path)}")
    w(f"  column Ø{D*1000:.0f} mm, tap spacing {L*1000:.0f} mm, {F['n']} readings, "
      f"V = {min(p['V'] for p in pts)*1000:.1f}-{max(p['V'] for p in pts)*1000:.1f} mm/s")
    if D / max(float(meta.get("d_p_mm", 0) or 0) / 1000, 1e-9) < 10:
        w("  WARNING: column diameter < 10 grain diameters - wall channelling will bias d and f low")
    w("")
    w("  Darcy-Forchheimer fit on superficial velocity (the form the CFD uses):")
    w(f"    d = {F['d']:.3e} 1/m2   (+- {100*F['ci_d']/F['d']:.1f} % at 95 %)")
    if F["darcy_only"]:
        w("    f = 0            (no measurable inertial term - Darcy only; widen the velocity range)")
    else:
        w(f"    f = {F['f']:.3e} 1/m    (+- {100*F['ci_f']/F['f']:.1f} % at 95 %)")
    w(f"    fit: rms residual {100*F['rms']:.1f} %, worst point {100*F['worst']:.1f} %")
    runs = sorted({p["run"] for p in pts})
    if len(runs) > 1:
        per = {r: fit([p for p in pts if p["run"] == r]) for r in runs if sum(p["run"] == r for p in pts) >= 3}
        if len(per) > 1:
            ds = [v["d"] for v in per.values()]
            w(f"    repacks: {len(per)} runs, d spread {100*(max(ds)-min(ds))/F['d']:.1f} % of the pooled value "
              "(packing variability - quote it with the result)")
    eps, dp = ergun_equivalent(F["d"], F["f"])
    if eps:
        w(f"    Ergun-equivalent bed: porosity {eps:.3f}" + (f", grain {dp*1000:.2f} mm" if dp else ""))
    if meta.get("bulk_density_kg_m3") and meta.get("particle_density_kg_m3"):
        e_meas = 1 - float(meta["bulk_density_kg_m3"]) / float(meta["particle_density_kg_m3"])
        w(f"    measured porosity (1 - bulk/particle density): {e_meas:.3f}")
    Re = [p["rho"] * p["V"] * float(meta.get("d_p_mm", 0) or 0) / 1000 / p["mu"] for p in pts]
    if max(Re) > 0:
        w(f"    particle Reynolds number {min(Re):.2g}-{max(Re):.2g}")
    w("")
    w("  OpenFOAM constant/fvModels, porosity coefficients:")
    w(f"    d   ({F['d']:.4g} {F['d']:.4g} {F['d']:.4g});")
    w(f"    f   ({F['f']:.4g} {F['f']:.4g} {F['f']:.4g});")
    w("")
    Vmid = 0.03
    w(f"  Resistance at V = {Vmid*1000:.0f} mm/s compared with the stage-1 assumed media:")
    g = lambda d, f: MU_CFD * d * Vmid + 0.5 * RHO_CFD * f * Vmid ** 2
    gm = g(F["d"], F["f"])
    w(f"    measured          {gm:8.1f} Pa/m")
    for k, (d, f) in ASSUMED.items():
        w(f"    {k:17s} {g(d, f):8.1f} Pa/m   (measured is {gm / g(d, f):.2f} x)")
    w("")
    w("  ESTIMATE for the stage-1 sealed-core design at U = 4 m/s (interpolated from the stage-1")
    w("  system curves; confirm with a CFD case before quoting):")
    w(f"    {'':44s} {'flow':>10s} {'face vel.':>10s} {'residence':>10s} {'bed dp':>8s}")
    for name, s in SYSTEMS.items():
        Q, V, tr, dpb = operating_point(F["d"], F["f"], s)
        w(f"    {name:44s} {Q:7.1f} L/min {V*1000:7.1f} mm/s {tr:8.2f} s {dpb:6.2f} Pa")
    txt = "\n".join(out)
    print(txt)
    if plot:
        make_plot(pts, F, plot, meta.get("sample", ""))
    return F, txt


def make_plot(pts, F, path, title):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    Vs = sorted(p["V"] for p in pts)
    lo, hi = Vs[0] * 0.7, Vs[-1] * 1.4
    grid = [lo * (hi / lo) ** (i / 60) for i in range(61)]
    fig, ax = plt.subplots(figsize=(7, 4.2), dpi=150)
    for k, (d, f) in ASSUMED.items():
        ax.plot([v * 1000 for v in grid], [MU_CFD * d * v + 0.5 * RHO_CFD * f * v * v for v in grid],
                "--", lw=1, color="0.6")
        ax.annotate(k.split()[0], (grid[-1] * 1000, MU_CFD * d * grid[-1] + 0.5 * RHO_CFD * f * grid[-1] ** 2),
                    fontsize=8, color="0.45", xytext=(3, 0), textcoords="offset points", va="center")
    ax.plot([v * 1000 for v in grid], [MU_CFD * F["d"] * v + 0.5 * RHO_CFD * F["f"] * v * v for v in grid],
            color="#1f77b4", lw=2, label="fit")
    for r in sorted({p["run"] for p in pts}):
        sel = [p for p in pts if p["run"] == r]
        ax.plot([p["V"] * 1000 for p in sel], [p["g"] for p in sel], "o", ms=5, label=f"run {r}")
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("Superficial velocity V [mm/s]"); ax.set_ylabel("Pressure gradient dp/L [Pa/m]")
    ax.set_title(title or "Biochar bench test", fontsize=10)
    ax.grid(True, which="both", color="0.92"); ax.legend(fontsize=8, frameon=False)
    fig.tight_layout(); fig.savefig(path); plt.close(fig)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")   # the Windows console default cannot print Ø
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    plot = None
    if "--plot" in args:
        i = args.index("--plot"); plot = args[i + 1]; del args[i:i + 2]
    report(args[0], plot)
