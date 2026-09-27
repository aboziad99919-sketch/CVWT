"""Grid Convergence Index for the stage-1 mesh triplet (group M1).

    python gci.py [runs_dir=runs] [window_iterations=500]

Method: ASME V&V 20 / Roache. Three geometrically similar meshes with a refinement ratio of 2
(every snappyHexMesh level dropped by one), the same case otherwise. From the three values it
solves for the observed order of accuracy p, extrapolates to zero cell size, and reports GCI on
the finest mesh - the discretisation uncertainty to quote alongside every stage-1 number.

Two things this does differently from a textbook GCI, both forced by what the flow actually does:

1. It uses the WINDOW MEAN of each quantity, not the last-instant value. A frozen rotor in
   cross-flow sheds vortices, so the instantaneous flow swings +-2 to 8 % about its mean (see
   check_stability.py). A GCI built on last-instant values would measure that oscillation, not
   the mesh, and would be nonsense - three meshes stopped at three arbitrary phases.
2. It reports the sign of eps32/eps21. Negative means the three values do not lie on a monotone
   curve: the solution is oscillating in mesh space, Richardson extrapolation does not apply, and
   the honest uncertainty is the spread of the three values rather than a GCI. Saying so is the
   point; quoting a GCI anyway would be false precision.
"""
import glob, json, os, statistics, sys, math

RUNS = sys.argv[1] if len(sys.argv) > 1 else "runs"
WINDOW = float(sys.argv[2]) if len(sys.argv) > 2 else 500.0
RHO, FS = 1.2, 1.25          # air density; the 1.25 safety factor for a three-mesh study

def read_cols(path, cols):
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
    return read_cols(fs[-1], list(range(1, 9))) if fs else []

def wmean(rows, fn):
    if not rows: return None
    t_end = rows[-1][0]
    v = [fn(x) for t, x in rows if t > t_end - WINDOW]
    return statistics.fmean(v) if len(v) >= 5 else None

def quantities(case):
    """The three quantities every stage-1 headline rests on, as window means."""
    par = {}
    for fn, key in (("run_summary.json", "params"), ("case_params.json", None)):
        fp = os.path.join(case, fn)
        if os.path.exists(fp):
            try:
                d = json.load(open(fp)); par = d.get(key, {}) if key else d; break
            except (ValueError, OSError): pass
    U = float(par.get("U_mps", 4))
    P = probes(case)
    return {
        "Q_filter [L/min]": (lambda m: None if m is None else abs(m) * 6e4)(wmean(dat(case, "Q_outletFilter"), lambda x: x[0])),
        "dp_bed [Pa]":      wmean(P, lambda p: (p[3] - p[4]) * RHO),
        "Cp_core":          wmean(P, lambda p: (p[0] - p[7]) / (0.5 * U * U)),
    }

def cells(case):
    fp = os.path.join(case, "run_summary.json")
    if not os.path.exists(fp): return None
    try: return json.load(open(fp)).get("mesh", {}).get("cells")
    except (ValueError, OSError): return None

def observed_order(e21, e32, r21, r32):
    """Roache's implicit equation for p, solved by fixed-point iteration."""
    ratio = e32 / e21
    s = 1.0 if ratio > 0 else -1.0
    p = 2.0
    for _ in range(200):
        try:
            q = math.log((r21 ** p - s) / (r32 ** p - s))
            p_new = abs(math.log(abs(ratio)) + q) / math.log(r21)
        except (ValueError, ZeroDivisionError):
            return None, s
        if abs(p_new - p) < 1e-10: return p_new, s
        p = p_new
    return p, s

# --- find the triplet -----------------------------------------------------------------------
# Suffixes written by cfd-stage1-groupM1.yml: _m1c coarse, _m1m medium, _m1f fine.
SUFFIX = {"coarse": "m1c", "medium": "m1m", "fine": "m1f"}
found = {}
for c in sorted(glob.glob(os.path.join(RUNS, "*"))):
    if not os.path.isdir(c): continue
    b = os.path.basename(c)
    for suf, tag in (("_m1c", "coarse"), ("_m1m", "medium"), ("_m1f", "fine")):
        if b.endswith(suf): found[tag] = c
# A leg whose solve failed still leaves a stub run_summary.json behind, because the workflow runs
# summarize_run.py with "|| true" so a failure is still reported. Such a stub has no cell count, so
# "present" has to mean "has a cell count", not "has a directory" - otherwise this reported a flat
# "cell counts missing" and left you guessing which of the three legs was the problem.
N = {t: cells(c) for t, c in found.items()}
usable = {t: c for t, c in found.items() if N.get(t)}
missing = [t for t in ("coarse", "medium", "fine") if t not in usable]
if missing:
    print(f"grid-convergence study incomplete - no usable case for: {', '.join(missing)}")
    for t in missing:
        if t in found:
            print(f"  {t}: {os.path.basename(found[t])} is present but has no cell count "
                  f"- that leg failed before or during checkMesh")
        else:
            print(f"  {t}: no directory ending _{SUFFIX[t]} found under {RUNS}/")
    if len(usable) >= 2:
        print("\n  The legs that did run, for comparison (a GCI needs all three):\n")
        print(f"  {'mesh':8s} {'cells':>10s}   " + "   ".join(f"{k:>18s}" for k in
              ("Q_filter [L/min]", "dp_bed [Pa]", "Cp_core")))
        order = [t for t in ("fine", "medium", "coarse") if t in usable]
        vals = {t: quantities(usable[t]) for t in order}
        for t in order:
            row = "   ".join(f"{vals[t][k]:18.5g}" if vals[t].get(k) is not None else f"{'-':>18s}"
                             for k in ("Q_filter [L/min]", "dp_bed [Pa]", "Cp_core"))
            print(f"  {t:8s} {N[t]:10d}   {row}")
        if len(order) == 2:
            a, b = order
            print(f"\n  change {b} -> {a}:")
            for k in ("Q_filter [L/min]", "dp_bed [Pa]", "Cp_core"):
                x, y = vals[b].get(k), vals[a].get(k)
                if x and y:
                    print(f"    {k:18s} {100*(y-x)/abs(x):+7.2f} %")
            print("  Two meshes give a difference, not an order of accuracy and not a GCI.")
    sys.exit(0)
found = usable
# h is proportional to the cube root of the cell volume, so h ~ N^(-1/3)
h = {t: N[t] ** (-1.0 / 3.0) for t in N}
r21 = h["medium"] / h["fine"]        # fine -> medium
r32 = h["coarse"] / h["medium"]      # medium -> coarse

print("Grid convergence (ASME V&V 20), on window means over the last "
      f"{WINDOW:.0f} iterations\n")
print(f"  {'mesh':8s} {'cells':>10s} {'h (relative)':>13s}   case")
for t in ("fine", "medium", "coarse"):
    print(f"  {t:8s} {N[t]:10d} {h[t]/h['fine']:13.3f}   {os.path.basename(found[t])}")
print(f"\n  refinement ratio  fine->medium {r21:.3f}   medium->coarse {r32:.3f}")
if min(r21, r32) < 1.15:
    print("  WARNING: a ratio below ~1.15 is too small for a meaningful extrapolation")
print()

Q = {t: quantities(found[t]) for t in found}
keys = [k for k in Q["fine"] if all(Q[t].get(k) is not None for t in Q)]
if not keys:
    print("no quantity is available on all three meshes (postProcessing missing?)"); sys.exit(1)

print(f"  {'quantity':18s} {'fine':>11s} {'medium':>11s} {'coarse':>11s} {'p':>6s} "
      f"{'extrap.':>11s} {'GCI fine':>9s}  verdict")
worst = 0.0
worst_spread = 0.0
for k in keys:
    f1, f2, f3 = Q["fine"][k], Q["medium"][k], Q["coarse"][k]
    e21, e32 = f2 - f1, f3 - f2
    if abs(e21) < 1e-12 and abs(e32) < 1e-12:
        print(f"  {k:18s} {f1:11.5g} {f2:11.5g} {f3:11.5g} {'-':>6s} {f1:11.5g} "
              f"{0.0:8.2f} %  identical on all three meshes")
        continue
    if abs(e21) < 1e-12:
        print(f"  {k:18s} {f1:11.5g} {f2:11.5g} {f3:11.5g} {'-':>6s} {'-':>11s} "
              f"{'-':>9s}  fine and medium identical")
        continue
    p, s = observed_order(e21, e32, r21, r32)
    if p is None or p <= 0:
        print(f"  {k:18s} {f1:11.5g} {f2:11.5g} {f3:11.5g} {'-':>6s} {'-':>11s} {'-':>9s}"
              "  no real order - not in the asymptotic range")
        continue
    if s <= 0:
        # Oscillatory: p, the extrapolated value and the GCI are all meaningless, so none is printed.
        # The uncertainty is half the range of the three solutions, as a percentage of the fine value.
        # This used to fall out of the headline entirely, which printed "worst GCI 0.00 %" when
        # every quantity was oscillatory and the real mesh uncertainty was ~3 %.
        spread = 0.5 * (max(f1, f2, f3) - min(f1, f2, f3)) / abs(f1) * 100.0 if f1 else float("nan")
        worst_spread = max(worst_spread, spread)
        print(f"  {k:18s} {f1:11.5g} {f2:11.5g} {f3:11.5g} {'-':>6s} {'-':>11s} "
              f"{spread:7.2f}*%  OSCILLATORY in mesh space - * = half the spread of the three, not a GCI")
        continue
    ext = (r21 ** p * f1 - f2) / (r21 ** p - 1.0)
    ea = abs((f1 - f2) / f1) if f1 else float("nan")
    gci = FS * ea / (r21 ** p - 1.0) * 100.0
    worst = max(worst, gci)
    note = "monotone" if 0.5 <= p <= 3.0 else f"p={p:.2f} outside 0.5-3, treat GCI as indicative"
    print(f"  {k:18s} {f1:11.5g} {f2:11.5g} {f3:11.5g} {p:6.2f} {ext:11.5g} "
          f"{gci:8.2f} %  {note}")

print(f"\n  mesh uncertainty on the fine mesh (worst quantity):")
print(f"    GCI, monotone quantities:            " + (f"{worst:.2f} %" if worst > 0 else "none monotone"))
print(f"    half-spread, oscillatory quantities: " + (f"{worst_spread:.2f} %" if worst_spread > 0 else "none oscillatory"))
print("  This is the DISCRETISATION uncertainty. It is separate from, and adds to, the")
print("  oscillation band that check_stability.py reports and the 0.43 % replication spread.")
print("  A study is normally considered mesh-independent at a few percent; above ~10 % the")
print("  headline numbers should be re-run on the fine mesh rather than the screening one.")
