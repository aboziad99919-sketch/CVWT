"""Geometry gate: every surface the mesher sees must be closed, manifold and at the locked scale."""
import json, os, unittest
import numpy as np
from helpers import load_stl, topology
G = os.path.join(os.path.dirname(__file__), "..", "geometry")
class TestCfdSurfaces(unittest.TestCase):
    SURFACES = ["cvwt_fins", "cvwt_tube", "cvwt_tube_solid", "cvwt_caps",
                "cvwt_housing_cfd", "cvwt_topcap", "cvwt_base_stack"]
    def test_watertight_and_manifold(self):
        for n in self.SURFACES:
            with self.subTest(surface=n):
                t = topology(load_stl(os.path.join(G, f"{n}.stl")))
                self.assertEqual(t["open_edges"], 0, f"{n} has open edges")
                self.assertEqual(t["nonmanifold"], 0, f"{n} has non-manifold edges")
                self.assertGreater(t["volume_m3"], 0, f"{n} normals point inward")
    def test_locked_scale(self):
        fins = load_stl(os.path.join(G, "cvwt_fins.stl")).reshape(-1, 3)
        self.assertAlmostEqual(fins[:, 2].max(), 0.3067, places=3)          # 1:12 height 306.7 mm
        self.assertAlmostEqual(2 * np.hypot(fins[:, 0], fins[:, 1]).max(), 0.112, places=3)  # rotor Ø112 mm
    def test_core_tube_variants_match_except_holes(self):
        holed, solid = (topology(load_stl(os.path.join(G, f"{n}.stl"))) for n in ("cvwt_tube", "cvwt_tube_solid"))
        self.assertEqual(solid["genus"], 1.0, "unperforated core must be a plain open-ended tube")
        self.assertGreater(holed["genus"], 30, "perforated core should show ~35 holes as genus")
        self.assertLess(abs(solid["volume_m3"] - holed["volume_m3"]) / solid["volume_m3"], 0.05)
    def test_housing_floor_is_open_for_the_outlet(self):
        # CFD housing must NOT close the axis: the slotted base stack forms the floor instead
        H = load_stl(os.path.join(G, "cvwt_housing_cfd.stl")).reshape(-1, 3)
        r = np.hypot(H[:, 0], H[:, 1])
        self.assertGreater(r.min(), 0.011, "housing still has material on the axis")
    def test_outlet_slots_within_bore_and_area_above_floor(self):
        o = json.load(open(os.path.join(G, "outlet_slots.json")))
        for x0, x1, y0, y1 in o["slots_mm_x0x1y0y1"]:
            for x in (x0, x1):
                for y in (y0, y1):
                    self.assertLessEqual(np.hypot(x, y), 17.0, "slot corner outside the Ø34 housing bore")
        self.assertGreaterEqual(o["open_area_mm2"], 250, "below the pre-screen sizing floor")
        self.assertAlmostEqual(o["open_area_mm2"],                       # slot coords are rounded to 0.01 mm
                               sum((s[1] - s[0]) * (s[3] - s[2]) for s in o["slots_mm_x0x1y0y1"]), delta=0.5)
    def test_audit_matches_geometry(self):
        a = json.load(open(os.path.join(G, "geometry_audit.json")))["cfd_inputs"]
        self.assertAlmostEqual(a["outlet_area_m2"],
                               json.load(open(os.path.join(G, "outlet_slots.json")))["open_area_mm2"] * 1e-6, places=9)
        self.assertAlmostEqual(a["rotor_diameter_m"], 0.112, places=3)
if __name__ == "__main__":
    unittest.main()
