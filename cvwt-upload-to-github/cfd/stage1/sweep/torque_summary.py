"""Stage 2 rotor sweep: torque against tip speed ratio, and where the passive rotor settles.

    python3 torque_summary.py <runs_dir> [window_iterations=500]

For each S2 case (MRF at tip speed ratio lambda = omega R / U) it takes the window mean of the axial
moment on the rotor (pressure + viscous, about the z axis) from postProcessing/rotorForces, and of
the filter flow. The wind drives the rotor in the direction of the STATIC torque (lambda = 0); along
that direction the torque falls as the rotor speeds up, and the speed where it crosses zero is the
freewheel speed a passive rotor reaches. Power coefficient Cp = M omega / (1/2 rho U^3 A).
"""
import glob, json, math, os, re, statistics, sys

RHO, R, SPAN = 1.2, 0.056, 0.2317                 # rig: tip radius, fin span [m]
A = 2 * R * SPAN                                   # frontal area [m2]


def rows(path):
    out = []
    for l in open(path):
        if l.startswith("#") or not l.strip(): continue
        v = l.replace("(", " ").replace(")", " ").split()
        try: out.append([float(x) for x in v])
        except ValueError: pass
    return out


def wmean(r, col, w):
    if not r: return None
    t = r[-1][0]; s = [x[col] for x in r if x[0] > t - w and len(x) > col]
    return statistics.fmean(s) if s else None


def main(runs, w=500.0):
    res = []
    for c in sorted(glob.glob(os.path.join(runs, "*_tsr*"))):
        m = re.search(r"_tsr([mp])(\d{3})", c)
        if not m: continue
        lam = (-1 if m.group(1) == "m" else 1) * int(m.group(2)) / 100
        par = {}
        for fn, key in (("run_summary.json", "params"), ("case_params.json", None)):
            if os.path.exists(os.path.join(c, fn)):
                d = json.load(open(os.path.join(c, fn))); par = d.get(key, d) if key else d; break
        U = float(par.get("U_mps", 4))
        f = sorted(glob.glob(os.path.join(c, "postProcessing", "rotorForces", "*", "forces.dat")))
        # columns: t, F_pressure(3), F_viscous(3), M_pressure(3), M_viscous(3) -> Mz = col 9 + col 12
        r = rows(f[-1]) if f else []
        Mz = None if not r else (wmean(r, 9, w) or 0) + (wmean(r, 12, w) or 0)
        q = sorted(glob.glob(os.path.join(c, "postProcessing", "Q_outletFilter", "*", "*.dat")))
        Q = wmean(rows(q[-1]), 1, w) if q else None
        res.append(dict(lam=lam, U=U, omega=lam * U / R, Mz=Mz, Q=Q))
    if not res:
        print(f"no *_tsr* cases under {runs}"); return 1
    res.sort(key=lambda d: d["lam"])
    print("Stage 2 rotor sweep (steady MRF, rig scale, U = %.1f m/s, R = %.0f mm)\n" % (res[0]["U"], 1000 * R))
    print(f"  {'lambda':>7s} {'omega':>8s} {'rpm':>7s} {'torque Mz':>12s} {'Cm':>8s} {'Cp':>8s} {'filter flow':>12s}")
    for d in res:
        q = 0.5 * RHO * d["U"] ** 2
        Cm = d["Mz"] / (q * A * R) if d["Mz"] is not None else None
        Cp = d["Mz"] * d["omega"] / (q * d["U"] * A) if d["Mz"] is not None else None
        f = lambda v, fmt: (fmt % v) if v is not None else "-"
        print(f"  {d['lam']:+7.2f} {d['omega']:8.2f} {d['omega'] * 60 / (2 * math.pi):7.0f} "
              f"{f(d['Mz'], '%12.4e')} {f(Cm, '%8.4f')} {f(Cp, '%8.4f')} "
              f"{f(abs(d['Q']) * 6e4 if d['Q'] is not None else None, '%8.2f L/min'):>12s}")
    s0 = next((d for d in res if d["lam"] == 0 and d["Mz"] is not None), None)
    if not s0:
        print("\n  no static (lambda = 0) case: the driving direction is unknown"); return 0
    sgn = 1 if s0["Mz"] > 0 else -1
    print(f"\n  static torque {s0['Mz']:+.4e} N m -> the wind turns the rotor "
          f"{'counter-clockwise' if sgn > 0 else 'clockwise'} seen from above (lambda {'+' if sgn > 0 else '-'}).")
    side = sorted((d for d in res if d["lam"] * sgn >= 0 and d["Mz"] is not None), key=lambda d: abs(d["lam"]))
    for a, b in zip(side, side[1:]):
        if a["Mz"] * sgn > 0 >= b["Mz"] * sgn:
            lam0 = a["lam"] + (b["lam"] - a["lam"]) * a["Mz"] / (a["Mz"] - b["Mz"])
            print(f"  torque crosses zero at lambda = {lam0:+.3f}: the passive (unloaded) rotor settles at "
                  f"{abs(lam0) * s0['U'] / R * 60 / (2 * math.pi):.0f} rpm at rig scale, "
                  f"tip speed {abs(lam0) * s0['U']:.2f} m/s.")
            best = max(side, key=lambda d: d["Mz"] * d["omega"] * sgn if d["Mz"] is not None else -1)
            print(f"  most power among the cases run: lambda {best['lam']:+.2f}, "
                  f"Cp = {best['Mz'] * best['omega'] / (0.5 * RHO * best['U'] ** 3 * A):.4f}")
            return 0
    print("  torque does not cross zero on the driven side within the lambdas run - extend the sweep.")
    return 0


if __name__ == "__main__":
    a = sys.argv[1:]
    sys.exit(main(a[0] if a else "runs", float(a[1]) if len(a) > 1 else 500.0))
