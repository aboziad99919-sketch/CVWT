"""Log parsers and acceptance gates: the pieces that decide PASS/FAIL must not mis-read a log."""
import importlib.util, json, math, os, shutil, tempfile, unittest
SUM = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sweep", "summarize_run.py")

CHECKMESH_OK = """Mesh stats
    points:           812345
    cells:            612345
Checking geometry...
    Mesh non-orthogonality Max: 42.7 average: 5.1
    Max skewness = 1.83 OK.
    Max aspect ratio = 12.4 OK.
    Min volume = 3.1e-12. Max volume = 1e-07.
Mesh OK.
"""
CHECKMESH_BAD = CHECKMESH_OK.replace("Mesh non-orthogonality Max: 42.7", "Mesh non-orthogonality Max: 82.4") \
                            .replace("Max skewness = 1.83 OK.", "Max skewness = 6.20 ***Max skewness > 4") \
                            .replace("Mesh OK.", "Failed 2 mesh checks.")
def solver_log(kind):
    L = []
    for i in range(1, 401):
        r = math.exp(-i / 22) if kind == "converged" else (0.5 if kind == "stalled" else math.exp(i / 80))
        L.append(f"Time = {i}\n\nsmoothSolver:  Solving for Ux, Initial residual = {r*0.4:.4e}, Final residual = 1e-9, No Iterations 3\n"
                 f"GAMG:  Solving for p, Initial residual = {r:.4e}, Final residual = 1e-9, No Iterations 6\n"
                 f"time step continuity errors : sum local = {r*1e-7:.3e}, global = 1e-20, cumulative = 1e-19\n")
    if kind == "crashed":
        return "\n".join(L[:20]) + "\n--> FOAM FATAL ERROR: \nMaximum number of iterations exceeded\n\n"
    return "\n".join(L) + "\nEnd\n"

class TestSummariser(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        json.dump({"U_mps": 4, "filter": "F2"}, open(os.path.join(self.d, "case_params.json"), "w"))
    def tearDown(self): shutil.rmtree(self.d, ignore_errors=True)
    def run_summary(self):
        spec = importlib.util.spec_from_file_location("s", SUM)
        import sys; sys.argv = ["summarize_run.py", self.d]
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        return json.load(open(os.path.join(self.d, "run_summary.json")))
    def write(self, checkmesh, solver, flows=None, probe=None):
        open(os.path.join(self.d, "log.checkMesh"), "w").write(checkmesh)
        open(os.path.join(self.d, "log.foamRun"), "w").write(solver)
        for name, v in (flows or {}).items():
            p = os.path.join(self.d, "postProcessing", f"Q_{name}", "0"); os.makedirs(p, exist_ok=True)
            open(os.path.join(p, "surfaceFieldValue.dat"), "w").write(f"# Time sum(phi)\n400 {v}\n")
        if probe:
            p = os.path.join(self.d, "postProcessing", "probes", "0"); os.makedirs(p, exist_ok=True)
            open(os.path.join(p, "p"), "w").write("# Probe 0\n400 " + " ".join(str(x) for x in probe) + "\n")
    def test_healthy_run_passes_every_gate(self):
        self.write(CHECKMESH_OK, solver_log("converged"),
                   flows={"inlet": -2.4, "outlet": 2.39995, "outletFilter": 5e-5},
                   probe=[2.4, -1.0, 1.8, 1.6, 0.2, 0.3, 0.0])
        r = self.run_summary()
        self.assertEqual(r["overall"], "PASS")
        self.assertTrue(r["gates"]["convergence"]); self.assertTrue(r["gates"]["mesh_quality"])
        self.assertAlmostEqual(r["Q_filter_Lpm"], 3.0, places=6)          # 5e-5 m3/s = 3 L/min
        self.assertAlmostEqual(r["dp_bed_Pa"], (1.6 - 0.2) * 1.2, places=6)
        self.assertAlmostEqual(r["Cp_core_at_holes"], 2.4 / (0.5 * 16), places=6)
    def test_failed_checkmesh_is_not_a_pass(self):
        self.write(CHECKMESH_BAD, solver_log("converged"))
        r = self.run_summary(); self.assertFalse(r["gates"]["mesh_quality"]); self.assertEqual(r["overall"], "REVIEW")
    def test_diverged_and_crashed_runs_are_not_a_pass(self):
        for kind in ("stalled", "crashed"):
            with self.subTest(kind=kind):
                self.write(CHECKMESH_OK, solver_log(kind))
                r = self.run_summary()
                self.assertFalse(r["gates"]["convergence"]); self.assertEqual(r["overall"], "REVIEW")
    def test_mass_imbalance_fails_the_conservation_gate(self):
        self.write(CHECKMESH_OK, solver_log("converged"),
                   flows={"inlet": -2.4, "outlet": 2.5, "outletFilter": 5e-5})
        r = self.run_summary(); self.assertFalse(r["gates"]["conservation"]); self.assertEqual(r["overall"], "REVIEW")
    def test_missing_logs_do_not_produce_a_pass(self):
        r = self.run_summary(); self.assertEqual(r["overall"], "REVIEW")
if __name__ == "__main__":
    unittest.main()
