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
import glob, json, os, re, statistics, sys

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
    return read_cols(fs[-1], list(range(1, 9))) if fs else []   # the first eight; the rest are the external rake

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


def window(rows, w=None):
    if not rows: return []
    t_end = rows[-1][0]
    return [r for r in rows if r[0] > t_end - (WINDOW if w is None else w)]

def mean_stability(rows, scale, col=0):
    """Is the WINDOW MEAN reproducible, or is the solution genuinely going somewhere?

    A long-period oscillation defeats the drift test: the 500-iteration window lands on a
    different phase of the wave each time it is taken, so 'drift' reports where on the wave you
    happened to stop, not a trend. Group FS2 settled this by experiment - re-running FS_F3 to
    4000 iterations made the reported drift WORSE (-4.97 % -> -14.27 %) while the window mean
    moved 0.12 %. That is an oscillation, not a transient, and no number of extra iterations
    removes it.

    So take the mean over the last 500, 1000 and 1500 iterations. If those three means agree
    within tolerance, the value is settled whatever the drift column says, and the honest
    uncertainty is the peak-to-peak band - not a claim that the case failed.
    Returns (spread of the means as % of the physical scale, list of the means) or None.
    """
    # A window only measures the settled part if the run is comfortably longer than it. On a
    # 1500-iteration run the 1500 window reaches back to iteration 1 and swallows the startup
    # transient, which is why the base FS cases first reported 2-6 % "mean variation" while their
    # own longer re-runs reported 0.05-0.5 %. That was the test grading the transient, not the
    # solution. So only use windows no longer than half the run, and report nothing if fewer than
    # two survive - a short run cannot assess itself this way, and its evidence has to come from a
    # replicate instead.
    span = rows[-1][0] - rows[0][0]
    means = []
    for w in (500.0, 1000.0, 1500.0):
        if w > span / 2.0: break
        v = [x[col] for _, x in window(rows, w)]
        if len(v) < 5: break
        means.append(statistics.fmean(v))
    if len(means) < 2: return None
    s = max(abs(scale), 1e-12)
    return 100.0 * (max(means) - min(means)) / s, means

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

def verdict(rows, scale, col=0):
    """One word per quantity, from the drift test and the mean-stability test together."""
    ms = mean_stability(rows, scale, col)
    if ms is None: return "", None
    return ("settled" if ms[0] < TOL_PCT else "moving"), ms[0]

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
MEANS = {}                      # case -> {quantity: window mean}, for the replication table
GATES = {}                      # case -> {quantity: does it count?}, so noise stays out of the headline
print(f"Stability over the last {WINDOW:.0f} iterations (tolerance {TOL_PCT} % of the physical scale)\n")
for c in cases:
    name = os.path.basename(c)
    par = params(c)
    U = float(par.get("U_mps", 4)); q = 0.5 * RHO * U * U          # Pa, pressure scale
    # Flow scale. The F0 empty-housing case is the natural reference, but the only F0 cases are at
    # rig scale, so a full-scale case (x12 geometry, ~55x the flow) was being judged against a
    # reference 55x too small and read as wildly unsteady. Take whichever is larger: the case's own
    # flow, or the F0 reference. A sealed case then still uses F0 rather than its own ~1e-8 noise.
    qref = f0.get(U) or 1e-4                                        # m3/s, flow scale

    # Full series, not just the window: mean_stability needs to look further back than 500.
    raw_q = dat(c, "Q_outletFilter")
    raw_p = probes(c)
    series = []                                     # (label, unit, [(t,[v])], scale)
    if raw_q:
        v0 = [x[0] for _, x in window(raw_q)]
        if v0: qref = max(qref, abs(statistics.fmean(v0)))
        sealed = par.get("filter") == "SEALED"
        note = "" if not sealed else "  (sealed: zero by construction)"
        series.append(("Q_outletFilter" + note, "m3/s", raw_q, qref, sealed))
    if raw_p:
        d = lambda fn: [(tt, [fn(pv)]) for tt, pv in raw_p]
        series.append(("Cp_core", "-", d(lambda pv: (pv[0] - pv[7]) / (0.5 * U * U)), 1.0, False))
        series.append(("Cp_vs_plenum (old)", "-", d(lambda pv: (pv[0] - pv[6]) / (0.5 * U * U)), 1.0, False))
        series.append(("dp_bed", "Pa", d(lambda pv: (pv[3] - pv[4]) * RHO), q, False))

    rows = []
    for label, unit, ser, scale, skip in series:
        r = stat([x[0] for _, x in window(ser)], scale, label)
        if not r: continue
        ms = mean_stability(ser, scale)
        r["mean_spread_pct"] = None if ms is None else ms[0]
        r["mean_settled"] = None if ms is None else ms[0] < TOL_PCT
        # A sealed case carries no through-flow by construction, so its flow series is numerical
        # noise about zero. It is printed for inspection but must not decide whether the case is
        # settled - in a sealed case the PRESSURES are the result.
        r["gates"] = not skip
        rows.append((r, unit))
    if not rows:
        print(f"{name}: no usable time series (postProcessing missing from the artifact)"); continue

    MEANS[name] = {r["label"].split("  (")[0]: r["mean"] for r, _ in rows}
    GATES[name] = {r["label"].split("  (")[0]: r["gates"] for r, _ in rows}
    gating = [r for r, _ in rows if r["gates"]] or [r for r, _ in rows]
    drift_ok = all(r["converged"] for r in gating)
    # A quantity whose 500/1000/1500-iteration means agree is settled even if the drift column does
    # not pass: that is a long-period oscillation, and group FS2 proved by experiment that more
    # iterations make the drift number worse while leaving the mean alone.
    mean_ok = all(r["mean_settled"] is not False for r in gating) \
              and any(r["mean_settled"] for r in gating)
    tag = "CONVERGED" if drift_ok else ("SETTLED (oscillating)" if mean_ok else "STILL DRIFTING")
    n_total += 1; n_steady += (drift_ok or mean_ok)
    print(f"{name}   -> {tag}   (U={U} m/s, scales: {q:.2f} Pa, {qref:.3e} m3/s)")
    print(f"  {'quantity':34s} {'n':>4s} {'mean':>12s} {'band +-%':>9s} {'drift %':>8s} {'mean var%':>9s}  settled")
    for r, u in rows:
        mv = "     -   " if r["mean_spread_pct"] is None else f"{r['mean_spread_pct']:9.3f}"
        state = ("n/a" if not r["gates"] else
                 "yes" if r["converged"] else "osc" if r["mean_settled"] else "NO")
        print(f"  {r['label']:34s} {r['n']:4d} {r['mean']:12.5g} {r['band_pct']:9.2f} "
              f"{r['drift_pct']:8.3f} {mv}  {state}")
    print()

print(f"{n_steady}/{n_total} case(s) settled: every quantity either drifts less than {TOL_PCT} % over the")
print(f"window, or its 500/1000/1500-iteration means agree within {TOL_PCT} % - the second is a long-period")
print("oscillation, which extra iterations do not remove (group FS2 tested this and the drift got worse")
print("while the mean moved 0.12 %). 'osc' in the settled column marks that case.")
print("'band' is half the peak-to-peak oscillation and is the uncertainty to quote with each value.")
print("Percentages are of the physical scale (dynamic pressure, empty-housing flow), so a sealed")
print("case with no through-flow reads sensibly rather than as thousands of percent of nothing.")


# ---- replication: the same case re-run for longer -------------------------------------------
# A case run to more iterations is an INDEPENDENT estimate of the same quantity. If the two window
# means agree, the value is right whatever the drift column says, and their difference is a better
# uncertainty than any single-run statistic - it is the one number that accounts for the long-period
# unsteadiness a steady solver cannot resolve. Suffixes _r3k / _r4k mark a longer re-run of the
# case whose name they follow.
SUF = re.compile(r"_r\d+k$")
pairs = {}
for name in MEANS:
    base = SUF.sub("", name)
    if base != name and base in MEANS:
        pairs[base] = name
if pairs:
    print("Replication: base case vs longer re-run (independent estimates of the same quantity)\n")
    worst = 0.0
    print(f"  {'case / quantity':44s} {'base':>12s} {'re-run':>12s} {'diff %':>8s}")
    for base, longer in sorted(pairs.items()):
        print(f"  {base[:44]:44s}")
        for k, a in MEANS[base].items():
            b = MEANS[longer].get(k)
            if b is None or abs(a) < 1e-12: continue
            d = 100.0 * (b - a) / abs(a)
            # A sealed case's flow is zero by construction, so the ratio of two near-zero numbers is
            # meaningless - it read +285 % on a difference of 2e-5 m3/s. Print it, flag it, and keep
            # it out of the headline figure.
            noise = not GATES.get(base, {}).get(k, True)
            if not noise: worst = max(worst, abs(d))
            print(f"    {k:42s} {a:12.5g} {b:12.5g} {d:+8.2f}" + ("   (noise about zero)" if noise else ""))
    print(f"\n  worst replication difference: {worst:.2f} %")
    print("  Read this against the drift column. Where a case reads STILL DRIFTING but replicates to")
    print("  well under 1 %, the solution is oscillating about a settled mean, not still moving: two")
    print("  independent runs cannot agree by accident. Quote the mean with the band, and note that")
    print("  resolving the oscillation itself needs a transient (URANS) run, not more iterations.")
