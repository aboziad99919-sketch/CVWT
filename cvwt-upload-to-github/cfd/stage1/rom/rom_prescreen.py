"""Stage-1 PRE-CFD screening: lumped flow network of the CVWT internal path at 1:12 rig scale.

   core (pressure Cp_h*q at the holes) --holes--+
                                               +-- bore --> housing plenum --> FILTER --> outlet (p = 0, ambient)
   tube top opening (Cp_top*q) ----top---------+

This is NOT a prediction of capture efficiency and NOT a substitute for CFD. It (1) gives system curves
Δp(Q) per candidate filter, (2) shows where the operating point lies for a *range* of driving pressures
that CFD must pin down, and (3) sizes the CFD sweep. Every filter property below is an ASSUMPTION.
"""
import csv, json, math
import numpy as np
from scipy.optimize import brentq
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt

RHO, MU = 1.20, 1.81e-5          # air, 20 °C
G = json.load(open("../geometry/geometry_audit.json"))["cfd_inputs"]
A_H, A_TOP, D_B, L_B = G["hole_open_area_m2"], G["bore_area_m2"], G["bore_diameter_m"], G["bore_length_hole_centroid_to_exit_m"]
A_B = math.pi * D_B**2 / 4
A_F = G["filter_face_area_m2"]; A_OUT = G["outlet_area_m2"]
L_OUT, DH_OUT = G.get("outlet_passage_length_m", 0.0), G.get("outlet_hydraulic_diameter_m", 0.034)
import os
if os.environ.get("OUTLET") == "d34": A_OUT, L_OUT, DH_OUT = G["outlet_placeholder_d34_area_m2"], 0.005, 0.034
K_HOLE, K_TOP, K_EXP, K_OUT = 2.7, 1.5, (1 - A_B / A_F) ** 2, 1.5   # outlet: slot entry 0.5 + exit 1.0   # standard loss coefficients (Idelchik-type, assumed)

# ---- candidate filters: ASSUMED granular biochar beds, Ergun coefficients (superficial velocity) ----
EPS = 0.45
CANDIDATES = [  # id, label, particle diameter [m], porosity
    ("F0", "empty housing (no media)", None, None),
    ("F1", "coarse granules d_p=4 mm", 4e-3, EPS),
    ("F2", "medium granules d_p=2 mm", 2e-3, EPS),
    ("F3", "fine granules d_p=1 mm", 1e-3, EPS),
    ("F4", "very fine d_p=0.5 mm, ε=0.40", 0.5e-3, 0.40),
]
THICKNESS = [0.009, 0.018, 0.036]           # m (0.018 = as drawn: Ø34 x 18 mm placeholder)

def ergun(dp, eps):
    d = 150 * (1 - eps) ** 2 / (eps**3 * dp**2)       # Darcy coeff [1/m^2]  (OpenFOAM DarcyForchheimer 'd')
    f = 3.5 * (1 - eps) / (eps**3 * dp)                # Forchheimer [1/m]    (OpenFOAM 'f', Su=-(mu d + rho|U| f/2)U)
    return d, f

def dp_filter(Q, cand, t):
    _, _, dp, eps = cand
    if dp is None: return 0.0
    d, f = ergun(dp, eps); V = Q / A_F
    return t * (MU * d * V + 0.5 * RHO * f * abs(V) * V)

def dp_K(Q, A, K):  return K * 0.5 * RHO * (Q / A) * abs(Q / A)

def dp_outlet(Q):
    V = Q / A_OUT; Re = max(abs(V) * DH_OUT * RHO / MU, 1e-9)
    fr = 96 / Re if Re < 2300 else 0.316 * Re ** -0.25          # 96/Re: laminar high-aspect slot
    return (K_OUT + fr * L_OUT / DH_OUT) * 0.5 * RHO * V * abs(V)

def dp_bore(Q):
    V = Q / A_B; Re = max(abs(V) * D_B * RHO / MU, 1e-9)
    fr = 64 / Re if Re < 2300 else 0.316 * Re ** -0.25
    return (fr * L_B / D_B + K_EXP) * 0.5 * RHO * V * abs(V)

def solve(U, cp_h, cp_top, cand, t, top_open=True):
    """Return flows [m^3/s] (positive = into the core path) for driving pressures cp*q."""
    q = 0.5 * RHO * U**2; ph, pt = cp_h * q, cp_top * q
    def Qin(p_up, p_node, A, K):   # flow from p_up to p_node through K-loss
        s = np.sign(p_up - p_node); return s * A * math.sqrt(2 * abs(p_up - p_node) / (K * RHO))
    def down(pb):                  # flow from bore node pb to ambient through bore+filter+outlet
        g = lambda Q: dp_bore(Q) + dp_filter(Q, cand, t) + dp_outlet(Q) - pb
        if abs(pb) < 1e-12: return 0.0
        hi = 1.0 if pb > 0 else -1.0
        return brentq(g, 0, hi) if pb > 0 else brentq(g, hi, 0)
    def res(pb):
        return Qin(ph, pb, A_H, K_HOLE) + (Qin(pt, pb, A_TOP, K_TOP) if top_open else 0) - down(pb)
    lo, hi = min(ph, pt, 0) - 1, max(ph, pt, 0) + 1
    pb = brentq(res, lo, hi)
    Qh = Qin(ph, pb, A_H, K_HOLE); Qt = Qin(pt, pb, A_TOP, K_TOP) if top_open else 0.0; Qf = down(pb)
    return dict(p_node=pb, Q_holes=Qh, Q_top=Qt, Q_filter=Qf, V_face=Qf / A_F,
                dp_filter=dp_filter(Qf, cand, t), q=q, drive=ph)

if __name__ == "__main__":
    rows = []
    speeds = [1, 2, 4, 6]                     # rig approach speed at the CVWT [m/s] (ASSUMED range)
    cph_set = [0.1, 0.3, 0.6]                  # core pressure coeff at holes (unknown -> CFD)
    cpt_set = [-0.6, None]                     # tube-top opening: suction (-0.6) or capped (None)
    for c in CANDIDATES:
        for t in THICKNESS if c[2] else [0.018]:
            for U in speeds:
                for cph in cph_set:
                    for cpt in cpt_set:
                        r = solve(U, cph, cpt if cpt is not None else 0.0, c, t, top_open=cpt is not None)
                        d, f = ergun(c[2], c[3]) if c[2] else (0, 0)
                        rows.append(dict(filter=c[0], filter_label=c[1], d_p_mm=(c[2] or 0) * 1e3, porosity=c[3] or 1,
                                         thickness_mm=t * 1e3, U_mps=U, Cp_holes=cph,
                                         top="open, Cp=-0.6" if cpt is not None else "capped",
                                         Darcy_d_1pm2=d, Forch_f_1pm=f,
                                         Q_filter_Lpm=r["Q_filter"] * 6e4, Q_top_Lpm=r["Q_top"] * 6e4,
                                         Q_holes_Lpm=r["Q_holes"] * 6e4, V_face_mps=r["V_face"],
                                         dp_filter_Pa=r["dp_filter"], q_Pa=r["q"],
                                         residence_ms=(t * (c[3] or 1) / r["V_face"] * 1e3) if r["V_face"] > 1e-9 else float("inf"),
                                         Re_particle=(RHO * abs(r["V_face"]) * c[2] / MU) if c[2] else 0))
    SUFFIX = "_d34" if os.environ.get("OUTLET") == "d34" else ""
    with open(f"rom_results{SUFFIX}.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    with open(f"filter_candidates.csv", "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(["id", "assumed media", "d_p_mm", "porosity", "Darcy_d_1/m2", "Forchheimer_f_1/m", "thicknesses_mm", "status"])
        for c in CANDIDATES:
            d, f = ergun(c[2], c[3]) if c[2] else (0, 0)
            w.writerow([c[0], c[1], (c[2] or 0) * 1e3, c[3] or "", f"{d:.4g}", f"{f:.4g}",
                        "/".join(str(int(x * 1e3)) for x in THICKNESS) if c[2] else "-", "ASSUMED - replace with measured Δp(V) of the actual biochar"])

    # ---------- figures (fixed categorical order F0..F4, direct labels, CSV table alongside) ----------
    COL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"]; MK = ["o", "s", "^", "D", "v"]
    plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                         "grid.color": "#e4e3df", "grid.linewidth": 0.6, "font.size": 9,
                         "axes.edgecolor": "#8a8984", "text.color": "#0b0b0b", "axes.labelcolor": "#52514e"})
    # Fig 1: filter system curves Δp(V_face) at 18 mm, with driving-pressure band
    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    V = np.logspace(-3, np.log10(1.5), 200)
    for i, c in enumerate(CANDIDATES[1:], 1):
        y = [dp_filter(v * A_F, c, 0.018) for v in V]
        ax.plot(V, y, color=COL[i], lw=2); j = int(np.searchsorted(np.array(y), 1e3)) - 1 if y[-1] > 1e3 else len(V) - 1
        ax.annotate(c[0], (V[j], y[j]), xytext=(4, -2), textcoords="offset points", va="center", color="#0b0b0b")
    for U, ls in [(2, ":"), (4, "--"), (6, "-.")]:
        ax.axhline(0.6 * 0.5 * RHO * U**2, color="#8a8984", lw=1, ls=ls)
        ax.annotate(f"0.6·q at U={U} m/s", (1.2e-3, 0.6 * 0.5 * RHO * U**2), xytext=(0, 3), textcoords="offset points", color="#52514e", fontsize=8)
    ax.set_yscale("log"); ax.set_xscale("log"); ax.set_ylim(1e-2, 1e3); ax.set_xlim(1e-3, 3)
    ax.set_xlabel("filter face (superficial) velocity  V_f  [m/s]"); ax.set_ylabel("filter Δp  [Pa]  (18 mm bed, Ergun)")
    ax.set_title("Assumed biochar beds vs. available driving pressure (rig scale)", loc="left", fontsize=10)
    fig.tight_layout(); fig.savefig(f"fig1_filter_system_curves{SUFFIX}.png", dpi=160)
    # Fig 2: filter flow vs U for each candidate (18 mm, Cp_h=0.3, top capped vs open)
    fig, axs = plt.subplots(1, 2, figsize=(8.6, 3.8), sharey=True)
    for k, top in enumerate(["capped", "open, Cp=-0.6"]):
        ax = axs[k]
        for i, c in enumerate(CANDIDATES):
            sel = [r for r in rows if r["filter"] == c[0] and r["thickness_mm"] == 18 and r["Cp_holes"] == 0.3 and r["top"] == top]
            x = [r["U_mps"] for r in sel]; y = [r["Q_filter_Lpm"] for r in sel]
            ax.plot(x, y, color=COL[i], lw=2, marker=MK[i], ms=5, mec="#fcfcfb", mew=1.5)
            ax.annotate(c[0], (x[-1], y[-1]), xytext=(5, 0), textcoords="offset points", va="center", fontsize=8)
        ax.set_yscale("log"); ax.set_ylim(0.003, 100)
        ax.set_title(f"tube top {top}", loc="left", fontsize=9); ax.set_xlabel("approach speed U [m/s]"); ax.set_xlim(0.5, 7)
    axs[0].set_ylabel("flow through filter [L/min]  (Cp_holes = 0.3)")
    fig.suptitle("Pre-CFD network estimate of flow reaching the filter (18 mm bed) — log scale", x=0.01, ha="left", fontsize=10)
    fig.tight_layout(); fig.savefig(f"fig2_filter_flow_vs_speed{SUFFIX}.png", dpi=160)
    # console summary
    for top in ["capped", "open, Cp=-0.6"]:
        print(f"\n== U=4 m/s, Cp_h=0.3, t=18 mm, top {top}")
        for r in rows:
            if r["U_mps"] == 4 and r["Cp_holes"] == 0.3 and r["thickness_mm"] == 18 and r["top"] == top:
                print(f"{r['filter']:3s} Qf={r['Q_filter_Lpm']:7.2f} L/min  Vf={r['V_face_mps']:.3f} m/s  dp_f={r['dp_filter_Pa']:6.2f} Pa  "
                      f"Qtop={r['Q_top_Lpm']:7.2f}  Re_p={r['Re_particle']:.0f}  t_res={r['residence_ms']:.0f} ms")
