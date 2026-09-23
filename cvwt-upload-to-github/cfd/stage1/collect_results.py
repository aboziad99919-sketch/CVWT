"""Aggregate finished cases into one table and compare them with the pre-screen estimate.
    python collect_results.py [runs_dir=runs] [out_prefix=stage1]
Reads every <case>/run_summary.json, writes <prefix>_results.csv and prints the comparison.
Cases that failed a gate are kept in the table and flagged, never silently dropped."""
import csv, glob, json, os, sys

RUNS = sys.argv[1] if len(sys.argv) > 1 else "runs"
PREFIX = sys.argv[2] if len(sys.argv) > 2 else "stage1"
FIELDS = ["case", "group", "filter", "thickness_mm", "U_mps", "azimuth_deg", "top", "core", "mesh",
          "cells", "converged", "iterations", "mass_imbalance_rel", "Q_filter_Lpm", "dp_bed_Pa",
          "Cp_core_at_holes", "gates_passed", "overall"]

rows = []
for f in sorted(glob.glob(os.path.join(RUNS, "*", "run_summary.json"))):
    r = json.load(open(f)); p = r.get("params", {}); g = r.get("gates", {})
    rows.append({"case": r.get("case"), "group": p.get("group"), "filter": p.get("filter"),
                 "thickness_mm": p.get("thickness_mm"), "U_mps": p.get("U_mps"),
                 "azimuth_deg": p.get("azimuth_deg"), "top": p.get("top"), "core": p.get("core"),
                 "mesh": p.get("mesh"), "cells": r.get("mesh", {}).get("cells"),
                 "converged": r.get("convergence", {}).get("converged"),
                 "iterations": r.get("convergence", {}).get("iterations"),
                 "mass_imbalance_rel": r.get("mass_imbalance_rel"),
                 "Q_filter_Lpm": r.get("Q_filter_Lpm"), "dp_bed_Pa": r.get("dp_bed_Pa"),
                 "Cp_core_at_holes": r.get("Cp_core_at_holes"),
                 "gates_passed": f"{sum(bool(v) for v in g.values())}/{len(g)}" if g else "",
                 "overall": r.get("overall")})
if not rows:
    print(f"no run_summary.json under {RUNS}/ - nothing to collect"); sys.exit(1)
with open(f"{PREFIX}_results.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=FIELDS); w.writeheader(); w.writerows(rows)

print(f"{len(rows)} case(s) -> {PREFIX}_results.csv\n")
print(f"{'case':52s} {'cells':>8s} {'conv':>5s} {'Q_filt':>8s} {'dp_bed':>7s} {'Cp':>6s}  gates")
for r in sorted(rows, key=lambda x: str(x["case"])):
    fmt = lambda v, n=2: ("-" if v is None else f"{v:.{n}f}") if isinstance(v, (int, float)) else "-"
    print(f"{str(r['case'])[:52]:52s} {str(r['cells'] or '-'):>8s} {str(r['converged'])[:5]:>5s} "
          f"{fmt(r['Q_filter_Lpm']):>8s} {fmt(r['dp_bed_Pa']):>7s} {fmt(r['Cp_core_at_holes'], 3):>6s}  "
          f"{r['gates_passed']} {r['overall']}")

# ---- compare the measured core pressure with the pre-screen assumption (Cp_h = 0.1 / 0.3 / 0.6) ----
cps = [r["Cp_core_at_holes"] for r in rows if isinstance(r.get("Cp_core_at_holes"), (int, float))]
if cps:
    print(f"\ncore Cp at the holes, CFD: min {min(cps):.3f}  max {max(cps):.3f}  mean {sum(cps)/len(cps):.3f}")
    print("pre-screen assumed 0.1 / 0.3 / 0.6 - if the CFD range sits outside that, the pre-screen"
          "\nflow estimates scale with it and the plan's table must be re-issued with the measured value.")
failed = [r["case"] for r in rows if r["overall"] != "PASS"]
if failed:
    print(f"\n{len(failed)} case(s) did not pass every gate: " + ", ".join(str(c) for c in failed[:6]))
