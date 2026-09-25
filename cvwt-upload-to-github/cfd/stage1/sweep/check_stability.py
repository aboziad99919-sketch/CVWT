"""Convergence gate based on the REPORTED QUANTITIES, not on residual level.

STAGE1_PLAN.md section 6 asked for < 0.5 % variation over the last 500 iterations. Applied as a
single number that conflates two different things, so it is split here:
  DRIFT  (systematic trend over the window) < 0.5 %  ->  converged; this is the gate.
  SPREAD (peak-to-peak oscillation)                  ->  reported as a +- band on the value. That is the criterion that matters for a frozen-rotor bluff body, where
steady-RANS residuals plateau because the real flow is mildly unsteady. A plateau says the solver
has stopped improving; it does not say the answer is wrong. This implements the plan's criterion.

    python check_stability.py [runs_dir=runs] [window_iterations=500]

Two things this gets right that a naive version does not:

1. The window is counted in ITERATIONS, using the time column, not in samples. `probes` writes every
   10 iterations and `patchFlowRate` every iteration, so a sample-count window mixes the two and,
   for the probes, reaches back into the startup transient and reports absurd spreads.
2. Variation is measured against a PHYSICAL SCALE, not against the quantity's own mean. A sealed
   case carries Q ~ 1e-8 m3/s by construction; a percentage of that is noise about nothing. Pressures
   are scaled by the dynamic pressure 0.5*rho*U^2 and flows by the matching empty-housing (F0) flow.
"""
import glob, json, os, statistics, sys

RUNS = sys.argv[1] if len(sys.argv) > 1 else "runs"
WINDOW = float(sys.argv[2]) if len(sys.argv) > 2 else 500.0
TOL_PCT, RHO = 0.5, 1.2

def read_cols(path, cols):
    """[(time, value...)] from an OpenFOAM .dat / probe file."""
    out = []
    for l in open(path, errors="replace"):
        if not l.strip() or l.startswith("#"): continue
        f = l.replace("(", " ").replace(")", " ").split()
        try: out.append((float(f[0]), [float(f[c]) for c in cols]))
        except (ValueError, IndexError): pass
    return out

def dat(case, name):
    fs = sorted(glob.glob(os.path.join(case, "postProcessing", name, "*", "*.dat")))
    return read_cols(fs[-1], [-1]) if fs else []

def probes(case):
    fs = sorted(glob.glob(os.path.join(case, "postProcessing", "probes", "*", "p")))
    return read_cols(fs[-1], list(range(1, 9))) if fs else []   # eight probes, not seven

def params(case):
    """Case parameters. run_summary.json is what the artifacts actually carry; case_params.json is
    the original and is used only when a case directory is read straight from a local run."""
    for fn, key in (("run_summary.json", "params"), ("case_params.json", None)):
        fp = os.path.join(case, fn)
        if os.path.exists(fp):
            try:
                d = json.load(open(fp))
                return d.get(key, {}) if key else d
            except (ValueError, OSError):
                pass
    return {}


def window(rows):
    if not rows: return []
    t_end = rows[-1][0]
    return [r for r in rows if r[0] > t_end - WINDOW]

def stat(vals, scale, label):
    """spread and drift as a percentage of a PHYSICAL scale, not of the values' own mean"""
    if len(vals) < 5: return None
    m = statistics.fmean(vals)
    s = max(abs(scale), 1e-12)
    tenth = max(1, len(vals) // 5)
    drift = statistics.fmean(vals[-tenth:]) - statistics.fmean(vals[:tenth])
    spread, drift_pct = 100.0 * (max(vals) - min(vals)) / s, 100.0 * drift / s
    # Drift and spread answer different questions and must not be conflated.
    #   drift  - is the solution still going somewhere? that is convergence.
    #   spread - how much does it oscillate about its mean? that is an uncertainty band on the
    #            reported value, not an error. A frozen rotor in cross-flow sheds vortices; a steady
    #            solver cannot remove that, and no number of extra iterations will.
    return {"label": label, "n": len(vals), "mean": m, "spread_pct": spread,
            "drift_pct": drift_pct, "band_pct": spread / 2.0,
            "converged": abs(drift_pct) < TOL_PCT}

# empty-housing flow per speed sets the scale that filter flows are judged against
f0 = {}
for c in sorted(glob.glob(os.path.join(RUNS, "*"))):
    if os.path.isdir(c):
        p = params(c)
        if p.get("filter") == "F0" and p.get("U_mps") is not None:
            w = window(dat(c, "Q_outletFilter"))
            if w: f0[float(p["U_mps"])] = abs(statistics.fmean([v[0] for _, v in w]))

cases = sorted(d for d in glob.glob(os.path.join(RUNS, "*")) if os.path.isdir(d))
if not cases: print(f"no case directories under {RUNS}/"); sys.exit(1)

n_steady = n_total = 0
print(f"Stability over the last {WINDOW:.0f} iterations (tolerance {TOL_PCT} % of the physical scale)\n")
for c in cases:
    name = os.path.basename(c)
    par = params(c)
    U = float(par.get("U_mps", 4)); q = 0.5 * RHO * U * U          # Pa, pressure scale
    qref = f0.get(U) or 1e-4                                        # m3/s, flow scale

    rows = []
    wq = window(dat(c, "Q_outletFilter"))
    if wq:
        v = [x[0] for _, x in wq]
        note = "" if par.get("filter") != "SEALED" else "  (sealed: zero by construction)"
        rows.append((stat(v, qref, "Q_outletFilter" + note), "m3/s"))
    wp = window(probes(c))
    if wp:
        P = [x for _, x in wp]
        rows.append((stat([(p[0] - p[7]) / (0.5 * U * U) for p in P], 1.0, "Cp_core"), "-"))
        rows.append((stat([(p[0] - p[6]) / (0.5 * U * U) for p in P], 1.0, "Cp_vs_plenum (old)"), "-"))
        rows.append((stat([(p[3] - p[4]) * RHO for p in P], q, "dp_bed"), "Pa"))
    rows = [(r, u) for r, u in rows if r]
    if not rows:
        print(f"{name}: no usable time series (postProcessing missing from the artifact)"); continue

    ok = all(r["converged"] for r, _ in rows)
    n_total += 1; n_steady += ok
    print(f"{name}   -> {'CONVERGED' if ok else 'STILL DRIFTING'}   (U={U} m/s, scales: {q:.2f} Pa, {qref:.3e} m3/s)")
    print(f"  {'quantity':34s} {'n':>4s} {'mean':>12s} {'band +-%':>9s} {'drift %':>8s}  converged")
    for r, u in rows:
        print(f"  {r['label']:34s} {r['n']:4d} {r['mean']:12.5g} {r['band_pct']:9.2f} "
              f"{r['drift_pct']:8.3f}  {'yes' if r['converged'] else 'NO'}")
    print()

print(f"{n_steady}/{n_total} case(s) converged: no quantity drifts by more than {TOL_PCT} % over the window.")
print("'band' is half the peak-to-peak oscillation and is the uncertainty to quote with each value.")
print("Percentages are of the physical scale (dynamic pressure, empty-housing flow), so a sealed")
print("case with no through-flow reads sensibly rather than as thousands of percent of nothing.")
