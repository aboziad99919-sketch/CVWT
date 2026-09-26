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
# ---- external pressure rake: how high can an intake sit and still see ambient? ----
# summarize_run.py writes Cp_external for every case; the rake is a property of the outside flow,
# so one sealed case is representative. An intake is only usable where Cp is near zero: inside the
# rotor's suction field there is no head left to drive the bed.
rake = {}
for f in sorted(glob.glob(os.path.join(RUNS, "*", "run_summary.json"))):
    r = json.load(open(f))
    if r.get("Cp_external"):
        rake[r.get("case")] = r["Cp_external"]
if rake:
    case, cp = sorted(rake.items())[0]
    print(f"\n---- external Cp rake ({case}) ----")
    print("An intake needs Cp near 0. Negative means the rotor is already pulling that air down,")
    print("which cancels the suction the bed depends on.\n")
    print(f"  {'height [mm]':>11s}  {'r = 45 mm':>12s}  {'r = 70 mm':>12s}")
    heights = sorted({int(k.split("_z")[1]) for k in cp})
    for h in heights:
        a = cp.get(f"ext_r45_z{h:03d}"); b = cp.get(f"ext_r70_z{h:03d}")
        fa = "     -      " if a is None else f"{a:+12.4f}"
        fb = "     -      " if b is None else f"{b:+12.4f}"
        print(f"  {h:11d}  {fa}  {fb}")
    usable = [h for h in heights if (cp.get(f"ext_r45_z{h:03d}") or -1) > -0.05]
    if usable:
        print(f"\n  usable intake heights at r = 45 mm (Cp > -0.05): {', '.join(str(h) for h in usable)} mm")
        print(f"  highest usable: {max(usable)} mm of the 307 mm rig height")
    else:
        print("\n  no height on the rake is clear of the rotor's suction field at r = 45 mm;")
        print("  an intake would have to sit further out radially, or below the deck.")

failed = [r["case"] for r in rows if r["overall"] != "PASS"]
if failed:
    print(f"\n{len(failed)} case(s) did not pass every gate: " + ", ".join(str(c) for c in failed[:6]))
