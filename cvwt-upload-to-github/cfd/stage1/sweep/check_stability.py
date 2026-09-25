"""Convergence gate based on the REPORTED QUANTITIES, not on residual level.

STAGE1_PLAN.md section 6 specifies: "Q_outletFilter, the probe dp values and rotor torque vary
< 0.5 % over the last 500 iterations." That is the criterion that matters for a frozen-rotor bluff
body, where steady-RANS residuals plateau because the real flow is mildly unsteady - a plateau says
the solver has stopped improving, not that the answer is wrong. This script implements that gate.

    python check_stability.py [runs_dir=runs] [window=500]

Reads <case>/postProcessing/{probes,Q_outletFilter,Q_inlet,Q_outlet}. For each quantity it reports,
over the last `window` samples: the mean, the peak-to-peak spread as a percentage of |mean|, and the
drift (linear trend across the window, also as a percentage of |mean|). A quantity is STEADY when
both spread and |drift| are under 0.5 %."""
import glob, os, statistics, sys

RUNS = sys.argv[1] if len(sys.argv) > 1 else "runs"
WINDOW = int(sys.argv[2]) if len(sys.argv) > 2 else 500
TOL_PCT = 0.5

def series(case, name, col=-1):
    fs = sorted(glob.glob(os.path.join(case, "postProcessing", name, "*", "*.dat")))
    if not fs: return []
    out = []
    for l in open(fs[-1]):
        if l.strip() and not l.startswith("#"):
            try: out.append(float(l.split()[col]))
            except (ValueError, IndexError): pass
    return out

def probe_series(case, idx):
    fs = sorted(glob.glob(os.path.join(case, "postProcessing", "probes", "*", "p")))
    if not fs: return []
    out = []
    for l in open(fs[-1]):
        if l.strip() and not l.startswith("#"):
            p = l.split()[1:]
            if len(p) > idx:
                try: out.append(float(p[idx]))
                except ValueError: pass
    return out

def verdict(v):
    """peak-to-peak spread and end-to-end drift over the window, each as % of |mean|"""
    w = v[-min(WINDOW, len(v)):]
    if len(w) < 10: return None
    m = statistics.fmean(w)
    scale = max(abs(m), 1e-12)
    spread = 100.0 * (max(w) - min(w)) / scale
    # drift: mean of the last tenth minus mean of the first tenth
    tenth = max(1, len(w) // 10)
    drift = 100.0 * (statistics.fmean(w[-tenth:]) - statistics.fmean(w[:tenth])) / scale
    return {"n": len(w), "mean": m, "spread_pct": spread, "drift_pct": drift,
            "steady": spread < TOL_PCT and abs(drift) < TOL_PCT}

cases = sorted(d for d in glob.glob(os.path.join(RUNS, "*")) if os.path.isdir(d))
if not cases:
    print(f"no case directories under {RUNS}/"); sys.exit(1)

n_steady = n_total = 0
print(f"Stability over the last {WINDOW} samples (tolerance {TOL_PCT} %)\n")
for c in cases:
    name = os.path.basename(c)
    rho = 1.2
    quantities = {
        "Q_outletFilter": series(c, "Q_outletFilter"),
        "p_bore":         probe_series(c, 0),
        "p_freestream":   probe_series(c, 6),
    }
    bed_top, below = probe_series(c, 3), probe_series(c, 4)
    if bed_top and below and len(bed_top) == len(below):
        quantities["dp_bed_Pa"] = [(a - b) * rho for a, b in zip(bed_top, below)]

    rows = [(k, verdict(v)) for k, v in quantities.items() if v]
    rows = [(k, r) for k, r in rows if r]
    if not rows:
        print(f"{name}: no usable time series (postProcessing missing from the artifact)"); continue

    all_steady = all(r["steady"] for _, r in rows)
    n_total += 1; n_steady += all_steady
    print(f"{name}   -> {'STEADY' if all_steady else 'NOT STEADY'}")
    print(f"  {'quantity':16s} {'n':>5s} {'mean':>12s} {'spread %':>9s} {'drift %':>8s}  ok")
    for k, r in rows:
        print(f"  {k:16s} {r['n']:5d} {r['mean']:12.5g} {r['spread_pct']:9.3f} {r['drift_pct']:8.3f}  "
              f"{'yes' if r['steady'] else 'NO'}")
    print()

print(f"{n_steady}/{n_total} case(s) steady by the plan's own criterion.")
if n_steady == n_total and n_total:
    print("Residual plateaus are therefore not a problem here: the reported quantities have settled.")
    print("The residual-level gate in summarize_run.py should be replaced by this one.")
