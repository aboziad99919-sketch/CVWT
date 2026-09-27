"""gci.py grades the mesh study, so it is itself graded here on synthetic triplets.

Each fake run has constant probe / flow histories, so the window means are exact and the only
thing under test is the grid-convergence arithmetic and what the script says about it.
"""
import json, os, re, subprocess, sys

GCI = os.path.join(os.path.dirname(__file__), "..", "sweep", "gci.py")
RHO = 1.2


def make_run(root, tag, cells, q_lpm, dp_pa, cp, U=4.0, n=600):
    case = os.path.join(root, f"R4_F2_test_{tag}")
    for d in ("postProcessing/Q_outletFilter/0", "postProcessing/probes/0"):
        os.makedirs(os.path.join(case, d))
    json.dump({"params": {"U_mps": U}, "mesh": {"cells": cells}},
              open(os.path.join(case, "run_summary.json"), "w"))
    q = -q_lpm / 6e4                                    # m3/s, outflow negative as in the solver
    with open(os.path.join(case, "postProcessing/Q_outletFilter/0/surfaceFieldValue.dat"), "w") as f:
        f.write("# Time sum(phi)\n")
        for t in range(1, n + 1):
            f.write(f"{t} {q}\n")
    # kinematic probes: p0 core, p3/p4 across the bed, p7 freestream
    p = [0.0] * 8
    p[0] = cp * 0.5 * U * U
    p[3], p[4] = dp_pa / RHO, 0.0
    with open(os.path.join(case, "postProcessing/probes/0/p"), "w") as f:
        f.write("# Probe 0..7\n")
        for t in range(1, n + 1):
            f.write(f"{t} " + " ".join(str(v) for v in p) + "\n")


def run_gci(root):
    return subprocess.run([sys.executable, GCI, root, "500"], capture_output=True, text=True,
                          check=True).stdout


def test_group_m1_triplet_is_oscillatory_and_reports_half_spread(tmp_path):
    # the actual group M1 window means (run of 2026-09-27)
    make_run(tmp_path, "m1f", 4143946, 16.259, -3.4772, -0.64362)
    make_run(tmp_path, "m1m", 863909, 16.692, -3.5837, -0.66084)
    make_run(tmp_path, "m1c", 294887, 15.832, -3.3300, -0.62209)
    out = run_gci(str(tmp_path))
    assert out.count("OSCILLATORY") == 3
    # the old headline said "worst GCI ... 0.00 %" here; it must now report the real ~3 %
    assert "0.00 %" not in out
    assert "none monotone" in out
    m = re.search(r"half-spread, oscillatory quantities:\s+([\d.]+) %", out)
    assert m, out
    worst = 0.5 * (3.5837 - 3.3300) / 3.4772 * 100          # dp_bed is the widest: 3.65 %
    assert abs(float(m.group(1)) - worst) < 0.01
    q = re.search(r"Q_filter \[L/min\].*?([\d.]+)\*%", out)
    assert q and abs(float(q.group(1)) - 0.5 * (16.692 - 15.832) / 16.259 * 100) < 0.01


def test_second_order_triplet_recovers_p_and_extrapolated_value(tmp_path):
    # f(h) = f0 + C h^2 with h ~ N^(-1/3), ratio 2 in h each step
    f0, C = 10.0, 0.8
    N = {"m1f": 8 * 8 * 8 * 1000, "m1m": 8 * 8 * 1000, "m1c": 8 * 1000}
    for tag, n in N.items():
        h = (n / N["m1f"]) ** (-1.0 / 3.0)
        make_run(tmp_path, tag, n, f0 + C * h * h, -(3.0 + 0.1 * h * h), -(0.6 + 0.02 * h * h))
    out = run_gci(str(tmp_path))
    line = next(l for l in out.splitlines() if l.strip().startswith("Q_filter"))
    assert "monotone" in line
    p, ext = float(line.split()[5]), float(line.split()[6])
    assert abs(p - 2.0) < 1e-3
    assert abs(ext - f0) < 1e-3
    assert "none oscillatory" in out
