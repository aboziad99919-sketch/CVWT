"""Pre-screen network model: physics properties that must hold whatever the numbers are."""
import importlib.util, os, unittest
ROM = os.path.join(os.path.dirname(__file__), "..", "rom", "rom_prescreen.py")
spec = importlib.util.spec_from_file_location("rom", ROM); r = importlib.util.module_from_spec(spec)
os.chdir(os.path.dirname(ROM)); spec.loader.exec_module(r)
F1, F2, F4 = r.CANDIDATES[1], r.CANDIDATES[2], r.CANDIDATES[4]
class TestRom(unittest.TestCase):
    def test_flow_decreases_with_resistance(self):
        q = [r.solve(4, 0.3, 0, c, 0.018, top_open=False)["Q_filter"] for c in r.CANDIDATES]
        self.assertEqual(q, sorted(q, reverse=True), "finer media must pass less air")
    def test_flow_increases_with_driving_pressure_and_speed(self):
        f = lambda cp, U: r.solve(U, cp, 0, F2, 0.018, top_open=False)["Q_filter"]
        self.assertLess(f(0.1, 4), f(0.3, 4)); self.assertLess(f(0.3, 4), f(0.6, 4))
        self.assertLess(f(0.3, 2), f(0.3, 6))
    def test_thicker_bed_passes_less(self):
        f = lambda t: r.solve(4, 0.3, 0, F2, t, top_open=False)["Q_filter"]
        self.assertGreater(f(0.009), f(0.018)); self.assertGreater(f(0.018), f(0.036))
    def test_open_top_bypasses_the_filter(self):
        capped = r.solve(4, 0.3, 0.0, F2, 0.018, top_open=False)
        openv = r.solve(4, 0.3, -0.6, F2, 0.018, top_open=True)
        self.assertLess(openv["Q_filter"], capped["Q_filter"])
        self.assertLess(openv["Q_top"], 0, "suction at the top should draw flow out of the core")
    def test_node_pressure_balance(self):
        """Losses along the down-path must equal the bore node pressure (network closure)."""
        s = r.solve(4, 0.3, 0.0, F2, 0.018, top_open=False); Q = s["Q_filter"]
        losses = r.dp_bore(Q) + r.dp_filter(Q, F2, 0.018) + r.dp_outlet(Q)
        self.assertAlmostEqual(losses, s["p_node"], places=6)
    def test_darcy_limit_is_linear(self):
        """A very fine bed is Darcy-dominated: doubling the drive must double the flow (within 5 %)."""
        a = r.solve(4, 0.3, 0, F4, 0.018, top_open=False)["Q_filter"]
        b = r.solve(4, 0.6, 0, F4, 0.018, top_open=False)["Q_filter"]
        self.assertAlmostEqual(b / a, 2.0, delta=0.1)
    def test_ergun_coefficients(self):
        d, f = r.ergun(2e-3, 0.45)
        self.assertAlmostEqual(d, 150 * 0.55**2 / (0.45**3 * 4e-6), delta=d * 1e-9)
        self.assertAlmostEqual(f, 3.5 * 0.55 / (0.45**3 * 2e-3), delta=f * 1e-9)
    def test_zero_drive_gives_zero_flow(self):
        self.assertAlmostEqual(r.solve(4, 0.0, 0.0, F1, 0.018, top_open=False)["Q_filter"], 0.0, places=9)
if __name__ == "__main__":
    unittest.main()
