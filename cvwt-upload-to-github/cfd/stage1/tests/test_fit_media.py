"""fit_media.py turns the bench test into the coefficients every later CFD case will use, so it is
checked here on data with known answers before it ever sees a real reading."""
import importlib.util, math, os, random

HERE = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location("fit_media", os.path.join(HERE, "..", "bench", "fit_media.py"))
fm = importlib.util.module_from_spec(spec); spec.loader.exec_module(fm)

A80 = math.pi * 0.080 ** 2 / 4
VS = [2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 180, 250]


def write_readings(path, d, f, noise=0.0, runs=(1,), T=22.0, p=101.325, blank=0.3, L=0.1, seed=1):
    rng = random.Random(seed)
    rho, mu = fm.air(T, p)
    with open(path, "w") as fh:
        fh.write("# sample = SYNTHETIC test data\n# column_ID_mm = 80\n# tap_spacing_mm = 100\n# d_p_mm = 2\n")
        fh.write("run,target_V_mm_s,flow_Lpm,dp_Pa,dp_blank_Pa,T_C,p_kPa,note\n")
        for r in runs:
            for v in VS:
                V = v / 1000
                dp = L * (mu * d * V + 0.5 * rho * f * V * V) * (1 + noise * rng.gauss(0, 1)) + blank
                fh.write(f"{r},{v},{V * A80 * 60000:.5f},{dp:.5f},{blank},{T},{p},\n")
        fh.write("1,300,,,,,,unused row\n")                      # empty data-sheet rows are skipped


def test_exact_data_recovers_d_and_f(tmp_path):
    fp = tmp_path / "r.csv"; write_readings(fp, 1.24e8, 1.06e4)
    F = fm.fit(fm.points(*fm.read(fp))[0])
    assert abs(F["d"] / 1.24e8 - 1) < 1e-4 and abs(F["f"] / 1.06e4 - 1) < 1e-4   # CSV rounding only
    assert F["rms"] < 1e-4 and not F["darcy_only"]


def test_noisy_repacks_stay_within_their_own_interval(tmp_path):
    fp = tmp_path / "r.csv"; write_readings(fp, 4.98e8, 2.11e4, noise=0.02, runs=(1, 2, 3))
    F = fm.fit(fm.points(*fm.read(fp))[0])
    assert abs(F["d"] - 4.98e8) < max(F["ci_d"], 0.03 * 4.98e8)
    assert abs(F["f"] - 2.11e4) < max(F["ci_f"], 0.25 * 2.11e4)


def test_ergun_equivalent_inverts_the_assumed_media():
    for (d, f), (eps, dp) in zip(fm.ASSUMED.values(), ((0.45, 4e-3), (0.45, 2e-3), (0.45, 1e-3))):
        e, g = fm.ergun_equivalent(d, f)
        assert abs(e - eps) < 0.005 and abs(g / dp - 1) < 0.03


def test_pure_darcy_bed_reports_f_zero(tmp_path):
    fp = tmp_path / "r.csv"; write_readings(fp, 2e9, 0.0, noise=0.01, seed=4)
    F = fm.fit(fm.points(*fm.read(fp))[0])
    assert F["f"] >= 0 and abs(F["d"] / 2e9 - 1) < 0.02


def test_estimate_reproduces_the_stage1_cfd_it_was_built_from():
    # the operating-point estimate must give back the CFD flows for the assumed media
    cfd = {"rig": (23.98, 16.69, 7.44), "full": (1250, 410, 108)}
    for (name, s), key in zip(fm.SYSTEMS.items(), ("rig", "full")):
        for (d, f), q_cfd in zip(fm.ASSUMED.values(), cfd[key]):
            Q = fm.operating_point(d, f, s)[0]
            assert abs(Q / q_cfd - 1) < 0.06, (name, Q, q_cfd)


def test_template_with_no_readings_is_refused(tmp_path):
    import pytest
    tpl = os.path.join(HERE, "..", "bench", "readings_template.csv")
    with pytest.raises(SystemExit):
        fm.report(tpl)
