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
found = {}
for c in sorted(glob.glob(os.path.join(RUNS, "*"))):
    if not os.path.isdir(c): continue
    b = os.path.basename(c)
    for suf, tag in (("_m1c", "coarse"), ("_m1m", "medium"), ("_m1f", "fine")):
        if b.endswith(suf): found[tag] = c
missing = [t for t in ("coarse", "medium", "fine") if t not in found]
if missing:
    print(f"grid-convergence study incomplete - no case found for: {', '.join(missing)}")
    print("Expected three directories under runs/ ending _m1c, _m1m and _m1f.")
    sys.exit(0)

N = {t: cells(found[t]) for t in found}
if any(not N[t] for t in N):
    print("cell counts missing from run_summary.json - cannot form a grid triplet"); sys.exit(1)
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
    ext = (r21 ** p * f1 - f2) / (r21 ** p - 1.0)
    ea = abs((f1 - f2) / f1) if f1 else float("nan")
    gci = FS * ea / (r21 ** p - 1.0) * 100.0
    if s > 0:
        worst = max(worst, gci)
        note = "monotone" if 0.5 <= p <= 3.0 else f"p={p:.2f} outside 0.5-3, treat GCI as indicative"
    else:
        note = "OSCILLATORY in mesh space - GCI not valid, use the spread of the three"
    print(f"  {k:18s} {f1:11.5g} {f2:11.5g} {f3:11.5g} {p:6.2f} {ext:11.5g} "
          f"{gci:8.2f} %  {note}")

print(f"\n  worst GCI on the fine mesh, monotone quantities only: {worst:.2f} %")
print("  This is the DISCRETISATION uncertainty. It is separate from, and adds to, the")
print("  oscillation band that check_stability.py reports and the 0.43 % replication spread.")
print("  A study is normally considered mesh-independent at a few percent; above ~10 % the")
print("  headline numbers should be re-run on the fine mesh rather than the screening one.")
