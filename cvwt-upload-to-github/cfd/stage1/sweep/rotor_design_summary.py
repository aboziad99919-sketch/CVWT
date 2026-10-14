"""Stage 3 rotor design study: power and blade-pass ripple for each parametric rotor.

    python3 rotor_design_summary.py <runs_dir> [window_iterations=500]

Each variant ran at lambda -0.5 at three azimuths a third of a fin period apart. The mean over the
three gives the power coefficient; the first harmonic through the three points (exact for three
equally spaced samples) gives the amplitude of the blade-pass load, as a fraction of the mean, for
the drag (Fx, along the wind) and the torque. Frozen-rotor MRF: a screening estimate of the ripple.
"""
import glob, json, math, os, re, statistics, sys

RHO, R, SPAN = 1.2, 0.056, 0.2317
A = 2 * R * SPAN


def rows(path):
    out = []
    for l in open(path):
        if l.startswith("#") or not l.strip(): continue
        v = l.replace("(", " ").replace(")", " ").split()
        try: out.append([float(x) for x in v])
        except ValueError: pass
    return out


def wmean(r, col, w):
    t = r[-1][0]; s = [x[col] for x in r if x[0] > t - w and len(x) > col]
    return statistics.fmean(s) if s else float("nan")


def first_harmonic(v):
    n = len(v); m = sum(v) / n
    a = 2 / n * sum(x * math.cos(2 * math.pi * k / n) for k, x in enumerate(v))
    b = 2 / n * sum(x * math.sin(2 * math.pi * k / n) for k, x in enumerate(v))
    return m, math.hypot(a, b)


def main(runs, w=500.0):
    data = {}
    for c in sorted(glob.glob(os.path.join(runs, "S[34]_*"))):
        m = re.search(r"_az(\d+)_.*_rot(\w+?)_tsr([mp])(\d{3})", os.path.basename(c))
        f = sorted(glob.glob(os.path.join(c, "postProcessing", "rotorForces", "*", "forces.dat")))
        if not m or not f: continue
        r = rows(f[-1])
        if not r: continue
        lam = (-1 if m.group(3) == "m" else 1) * int(m.group(4)) / 100
        U = 4.0; om = lam * U / R
        Fx = wmean(r, 1, w) + wmean(r, 4, w); Mz = wmean(r, 9, w) + wmean(r, 12, w)
        data.setdefault((m.group(2), lam), []).append((int(m.group(1)) / 10, Fx, Mz, om, U))
    if not data:
        print("no S3/S4 results under", runs); return 1
    q = 0.5 * RHO * 4.0 ** 2
    res = []
    for (rot, lam), d in data.items():
        d.sort()
        if len(d) >= 3:
            Fm, Fa = first_harmonic([x[1] for x in d]); Mm, Ma = first_harmonic([x[2] for x in d])
        else:   # one azimuth: a power-curve point, no ripple
            Fm, Mm, Fa, Ma = d[0][1], d[0][2], float("nan"), float("nan")
        Cp = Mm * d[0][3] / (q * 4.0 * A)
        res.append(dict(rotor=rot, lam=lam, n=len(d), Cp=Cp, Cd=Fm / (q * A), drag_ripple=Fa / abs(Fm),
                        torque_ripple=Ma / abs(Mm) if Mm else float("nan")))
    # stage 3 parametric baseline at lambda -0.5 (3 azimuths), used when the base rotor is not in this set
    base = next((x for x in res if x["rotor"] == "base" and x["lam"] == -0.5), None) or {"Cp": 0.0686}
    print("Rotor design study (rig, U 4 m/s, frozen-rotor MRF; ripple only where 3 azimuths ran)\n")
    print(f"  {'rotor':8s} {'lambda':>6s} {'azim':>4s} {'Cp':>7s} {'vs base':>8s} {'Cd':>6s} {'drag ripple':>12s} {'torque ripple':>14s}")
    for x in sorted(res, key=lambda x: (x["rotor"], x["lam"])):
        rel = f"{(x['Cp'] / base['Cp'] - 1) * 100:+6.1f} %"
        print(f"  {x['rotor']:8s} {x['lam']:+6.2f} {x['n']:4d} {x['Cp']:7.4f} {rel:>8s} {x['Cd']:6.3f} "
              f"{x['drag_ripple'] * 100:10.1f} % {x['torque_ripple'] * 100:12.1f} %")
    print("\n  requirement from the vibration study: drag ripple <= 12 % at the 120 rpm cap")
    json.dump(res, open("rotor_design.json", "w"), indent=1)
    return 0


if __name__ == "__main__":
    a = sys.argv[1:]
    sys.exit(main(a[0] if a else "runs", float(a[1]) if len(a) > 1 else 500.0))
