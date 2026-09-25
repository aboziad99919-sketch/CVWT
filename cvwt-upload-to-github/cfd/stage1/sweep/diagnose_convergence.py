"""Per-field residual history for finished cases, to separate 'not converged' from 'gate too strict'.
    python diagnose_convergence.py [runs_dir=runs]
Reads <case>/log.foamRun. Reports, per field: first and last initial residual, orders of drop, and
whether the last 200 iterations are still moving. Prints both criteria side by side:
  ABS  - last initial residual < 1e-5          (what summarize_run.py currently enforces)
  DROP - at least 4 orders of magnitude fall   (what STAGE1_PLAN.md section 6 actually specifies)"""
import glob, math, os, re, sys

RUNS = sys.argv[1] if len(sys.argv) > 1 else "runs"
ABS_TOL, DROP_ORDERS = 1e-5, 4.0
RE_RES = re.compile(r"Solving for (\w+), Initial residual = ([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)")

logs = sorted(glob.glob(os.path.join(RUNS, "*", "log.foamRun")))
if not logs:
    print(f"no log.foamRun under {RUNS}/ - the artifacts must include the logs"); sys.exit(1)

agree = disagree = 0
for lg in logs:
    case = os.path.basename(os.path.dirname(lg))
    hist = {}
    txt = open(lg, errors="replace").read()
    for m in RE_RES.finditer(txt):
        hist.setdefault(m.group(1), []).append(float(m.group(2)))
    iters = len(re.findall(r"^Time = ", txt, re.M))
    fatal = bool(re.search(r"FOAM FATAL", txt))
    if not hist:
        print(f"{case}: no residuals in log (fatal={fatal})"); continue

    rows, ok_abs, ok_drop = [], True, True
    for f, v in hist.items():
        drop = math.log10(v[0] / max(v[-1], 1e-300))
        # is it still improving, or has it flattened out?
        tail = v[-min(200, len(v)):]
        creep = math.log10(max(tail[0], 1e-300) / max(tail[-1], 1e-300))
        a, d = v[-1] < ABS_TOL, drop >= DROP_ORDERS
        ok_abs &= a; ok_drop &= d
        rows.append((f, v[0], v[-1], drop, creep, a, d))

    verdict = "ABS+DROP" if (ok_abs and ok_drop) else ("DROP only" if ok_drop else "neither")
    agree += ok_abs == ok_drop; disagree += ok_abs != ok_drop
    print(f"\n{case}   iterations={iters}  fatal={fatal}   -> {verdict}")
    print(f"  {'field':8s} {'first':>10s} {'last':>10s} {'orders':>7s} {'last200':>8s}  abs<1e-5  drop>=4")
    for f, a0, a1, drop, creep, a, d in rows:
        print(f"  {f:8s} {a0:10.2e} {a1:10.2e} {drop:7.2f} {creep:8.2f}  "
              f"{'yes' if a else 'NO ':>8s}  {'yes' if d else 'NO ':>7s}")

print(f"\n{len(logs)} case(s). The two criteria agree on {agree} and disagree on {disagree}.")
if disagree:
    print("Cases where they disagree are converged by the plan's own definition (4 orders) and were")
    print("failed only by the stricter absolute test in summarize_run.py. Fix the code, not the runs.")
