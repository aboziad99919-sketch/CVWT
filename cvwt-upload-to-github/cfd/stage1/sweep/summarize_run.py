"""Post-run summary for one stage-1 case: mesh quality, convergence, flows, bed Δp, rotor torque,
and the acceptance gates from STAGE1_PLAN.md section 6.   python summarize_run.py <case_dir>"""
import glob, json, math, os, re, sys
CASE = os.path.abspath(sys.argv[1])
# Self-contained on purpose: the same parsing rules as the cfd-pipeline MCP server, but with no import of it,
# so this script works inside the repo / CI where that stack is not installed (and can summarise many cases
# in one process). Keep the two in step if either changes.

def parse_checkmesh(p):
    t = open(p, errors="replace").read()
    num = lambda r: (float(re.search(r, t, re.M).group(1)) if re.search(r, t, re.M) else None)   # re.M: "cells:" is mid-file
    FLT = r"([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)"
    return {"cells": int(num(r"^\s*cells:\s+(\d+)") or 0), "mesh_ok": "Mesh OK." in t,
            "max_non_orthogonality": num(r"Mesh non-orthogonality Max: " + FLT),
            "max_skewness": num(r"Max skewness = " + FLT), "max_aspect_ratio": num(r"Max aspect ratio = " + FLT),
            "failed_checks": int(num(r"Failed\s+(\d+)\s+mesh checks") or 0)}

def parse_residuals(p, tol=1e-5):
    t = open(p, errors="replace").read(); h = {}
    for m in re.finditer(r"Solving for (\w+), Initial residual = ([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)", t):
        h.setdefault(m.group(1), []).append(float(m.group(2)))
    out = {f: {"first": v[0], "last": v[-1], "orders": round(math.log10(v[0] / max(v[-1], 1e-300)), 2),
               "below_tol": v[-1] < tol} for f, v in h.items()}
    return {"fields": out, "iterations": len(re.findall(r"^Time = ", t, re.M)),
            "converged": bool(out) and all(f["below_tol"] for f in out.values()),
            "fatal": bool(re.search(r"FOAM FATAL", t))}

def last_dat(name, col=-1):
    # exact function-object directory: "Q_outlet" must not also match "Q_outletFilter"
    fs = sorted(glob.glob(os.path.join(CASE, "postProcessing", name, "*", "*.dat")))
    if not fs: return None
    rows = [l.split() for l in open(fs[-1]) if l.strip() and not l.startswith("#")]
    return float(rows[-1][col]) if rows else None

def probes():
    fs = sorted(glob.glob(os.path.join(CASE, "postProcessing", "probes", "*", "p")))
    if not fs: return None
    rows = [l for l in open(fs[-1]) if l.strip() and not l.startswith("#")]
    return [float(x) for x in rows[-1].split()[1:]] if rows else None

r = {"case": os.path.basename(CASE), "params": json.load(open(os.path.join(CASE, "case_params.json")))}
cm = os.path.join(CASE, "log.checkMesh"); lg = os.path.join(CASE, "log.foamRun")
r["mesh"] = parse_checkmesh(cm) if os.path.exists(cm) else {"verdict": "MISSING"}
r["convergence"] = parse_residuals(lg) if os.path.exists(lg) else {"verdict": "MISSING"}
Q = {k: last_dat(f"Q_{k}") for k in ("outletFilter", "inlet", "outlet")}
r["flows_m3ps"] = Q; r["Q_filter_Lpm"] = (abs(Q["outletFilter"]) * 6e4) if Q["outletFilter"] else None
if all(Q.values()):
    r["mass_imbalance_rel"] = abs(sum(Q.values())) / max(abs(Q["inlet"]), 1e-30)
p = probes()
# Probe order must match system/controlDict exactly. It listed EIGHT locations while this list held
# seven names, so zip() silently dropped the last one: "freestream" was assigned to p[6], a point on
# the axis inside the housing at z = 20 mm. That point lies INSIDE the porous bed whenever the bed is
# thicker than 25 mm, which is why the 36 mm cases reported a shallower core Cp than the 18 mm ones.
PROBE_NAMES = ["bore_0.20", "bore_0.30", "plenum_0.060", "bed_top", "below_bed_0.007",
               "slot_-0.020", "below_bed_0.020", "freestream"]
if p:
    if len(p) != len(PROBE_NAMES):
        r["probe_warning"] = f"controlDict wrote {len(p)} probes, this parser names {len(PROBE_NAMES)}"
    r["probe_p_m2s2"] = dict(zip(PROBE_NAMES, p))
    rho = 1.2; r["dp_bed_Pa"] = (p[3] - p[4]) * rho
    U = float(r["params"]["U_mps"])
    r["Cp_core_at_holes"] = (p[0] - p[7]) / (0.5 * U**2)          # bore vs true freestream
    r["Cp_core_vs_plenum"] = (p[0] - p[6]) / (0.5 * U**2)         # the old quantity, kept for comparison
r["gates"] = {"mesh_quality": bool(r["mesh"].get("mesh_ok") and not r["mesh"].get("failed_checks")),
              "convergence": bool(r["convergence"].get("converged")),
              "conservation": (r["mass_imbalance_rel"] if r.get("mass_imbalance_rel") is not None else 1) < 1e-3}
r["overall"] = "PASS" if all(r["gates"].values()) else "REVIEW"
json.dump(r, open(os.path.join(CASE, "run_summary.json"), "w"), indent=2, default=str)
print(json.dumps(r, indent=2, default=str))
