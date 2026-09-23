"""Case generation: no unresolved parameters, no overwrites, right geometry per variant."""
import csv, importlib.util, json, os, re, shutil, tempfile, unittest
import numpy as np
from helpers import load_stl, topology
SW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sweep", "make_sweep.py")
spec = importlib.util.spec_from_file_location("mk", SW); mk = importlib.util.module_from_spec(spec); spec.loader.exec_module(mk)

class TestMatrix(unittest.TestCase):
    def test_case_ids_unique_and_groups_present(self):
        ids = [c["case_id"] for c in mk.cases]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue({"A1", "A2", "B1", "B2", "C1", "R1", "R2", "M1"} <= {c["group"] for c in mk.cases})
    def test_reversed_group_uses_solid_core_and_open_top(self):
        for c in [c for c in mk.cases if c["group"].startswith("R")]:
            self.assertEqual(c["core"], "solid"); self.assertEqual(c["top"], "open")
    def test_baseline_groups_are_capped(self):
        for c in [c for c in mk.cases if c["group"] in ("B1", "M1")]:
            self.assertEqual(c["top"], "capped"); self.assertEqual(c["core"], "holes")
    def test_filter_coefficients_match_the_candidate_table(self):
        f2 = mk.FILTERS["F2"]
        self.assertAlmostEqual(float(f2["Darcy_d_1/m2"]), 150 * 0.55**2 / (0.45**3 * 4e-6), delta=2e4)   # the CSV keeps 4 significant figures

class TestCreate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.orig = mk.HERE
        mk.HERE = __import__("pathlib").Path(self.tmp)
    def tearDown(self):
        mk.HERE = self.orig; shutil.rmtree(self.tmp, ignore_errors=True)
    def _make(self, case_id):
        c = next(c for c in mk.cases if c["case_id"] == case_id); mk.create(c)
        return os.path.join(self.tmp, "runs", case_id), c
    def test_no_unresolved_placeholders_and_refuses_overwrite(self):
        d, c = self._make("B1_F2_t18_U4_az000_capped_holes_medium")
        for root, _, files in os.walk(d):
            for f in files:
                if f.endswith(".stl"): continue
                self.assertNotIn("@@", open(os.path.join(root, f), errors="replace").read(), f"{f} has placeholders")
        with self.assertRaises(FileExistsError):
            mk.create(c)
    def test_capped_case_has_topcap_and_perforated_core(self):
        d, _ = self._make("B1_F2_t18_U4_az000_capped_holes_medium")
        self.assertTrue(os.path.exists(os.path.join(d, "constant/geometry/cvwt_topcap.stl")))
        self.assertIn("topcap", open(os.path.join(d, "system/snappyHexMeshDict")).read())
        self.assertGreater(topology(load_stl(os.path.join(d, "constant/geometry/cvwt_tube.stl")))["genus"], 30)
    def test_reversed_case_has_no_topcap_and_solid_core(self):
        d, _ = self._make("R1_F2_t18_U4_az000_open_solid_medium")
        self.assertFalse(os.path.exists(os.path.join(d, "constant/geometry/cvwt_topcap.stl")))
        snappy = open(os.path.join(d, "system/snappyHexMeshDict")).read()
        self.assertNotIn("topcap", snappy.lower())
        self.assertEqual(topology(load_stl(os.path.join(d, "constant/geometry/cvwt_tube.stl")))["genus"], 1.0)
    def test_bed_thickness_and_porosity_land_in_the_dicts(self):
        d, _ = self._make("B1_F3_t36_U4_az000_capped_holes_medium")
        params = open(os.path.join(d, "system/caseParams")).read()
        self.assertIn("FILTER_Z0   0.0090", params)              # 45 mm top - 36 mm bed
        self.assertRegex(params, r"D_COEFF\s+4\.9[0-9]+e\+08")  # F3 Ergun Darcy coefficient
    def test_rotated_fins_preserve_volume_and_rotate_by_the_right_angle(self):
        d, _ = self._make("A1_SEALED_t18_U4_az450_capped_holes_medium")
        ref = load_stl(os.path.join(os.path.dirname(SW), "..", "geometry", "cvwt_fins.stl"))
        rot = load_stl(os.path.join(d, "constant/geometry/cvwt_fins.stl"))
        self.assertAlmostEqual(topology(rot)["volume_m3"], topology(ref)["volume_m3"], places=9)
        th = np.radians(45); c, s = np.cos(th), np.sin(th)
        p = ref.reshape(-1, 3)[0]; q = rot.reshape(-1, 3)[0]
        np.testing.assert_allclose(q, [c*p[0]-s*p[1], s*p[0]+c*p[1], p[2]], atol=1e-6)
    def test_dictionaries_are_syntactically_balanced(self):
        d, _ = self._make("A2_F0_t18_U2_az000_open_holes_medium")
        for root, _, files in os.walk(d):
            for f in files:
                if f.endswith(".stl") or f == "case_params.json": continue
                t = re.sub(r"//.*", "", open(os.path.join(root, f), errors="replace").read())
                self.assertEqual(t.count("{"), t.count("}"), f)
                self.assertEqual(t.count("("), t.count(")"), f)
if __name__ == "__main__":
    unittest.main()
