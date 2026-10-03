"""check_stability.py must judge a flow against a scale of the SAME size as the flow.

Group J (full scale, no outletFilter patch, flow only from Q_bedCell) was judged against the rig
empty-housing flow, ~100x too small, so a +-3 % oscillation printed as +-286 % and every flowing
case read STILL DRIFTING. This builds a rig F0 reference and a full-scale Q_bedCell case with a
known +-3 % oscillation and checks the verdict and the band.
"""
import json, math, os, re, subprocess, sys

CS = os.path.join(os.path.dirname(__file__), "..", "sweep", "check_stability.py")


def case(root, name, params, q_patch=None, uz=None, n=1500):
    c = os.path.join(root, name)
    os.makedirs(os.path.join(c, "postProcessing", "probes", "0"))
    json.dump({"params": params}, open(os.path.join(c, "run_summary.json"), "w"))
    with open(os.path.join(c, "postProcessing", "probes", "0", "p"), "w") as f:
        f.write("# Probe\n")
        for t in range(1, n + 1, 10):
            f.write(f"{t} -5.0 -5.0 -3.0 -3.0 0.0 0.0 -3.0 0.0\n")
    if q_patch is not None:
        os.makedirs(os.path.join(c, "postProcessing", "Q_outletFilter", "0"))
        with open(os.path.join(c, "postProcessing", "Q_outletFilter", "0", "surfaceFieldValue.dat"), "w") as f:
            for t in range(1, n + 1):
                f.write(f"{t} {q_patch}\n")
    if uz is not None:
        os.makedirs(os.path.join(c, "postProcessing", "Q_bedCell", "0"))
        with open(os.path.join(c, "postProcessing", "Q_bedCell", "0", "volFieldValue.dat"), "w") as f:
            for t in range(1, n + 1):
                f.write(f"{t} (0 0 {uz(t)})\n")
    return c


def test_full_scale_bedcell_flow_is_judged_against_its_own_size(tmp_path):
    case(tmp_path, "A2_F0_rig", {"filter": "F0", "U_mps": 4}, q_patch=-1.229e-4)
    R = 0.4104
    mean_uz = 0.081                                            # ~0.043 m3/s through a 0.529 m2 bore
    case(tmp_path, "J1_CEM_full", {"filter": "CEM", "U_mps": 4, "BORE_R": R},
         uz=lambda t: mean_uz * (1 + 0.03 * math.sin(2 * math.pi * t / 100)))
    out = subprocess.run([sys.executable, CS, str(tmp_path), "500"], capture_output=True, text=True,
                         check=True).stdout
    block = out[out.index("J1_CEM_full"):]
    head = block.splitlines()[0]
    assert "CONVERGED" in head or "SETTLED" in head, head
    q = mean_uz * math.pi * R * R
    assert f"{q:.3e}" in head, f"flow scale should be the case's own flow {q:.3e} m3/s: {head}"
    row = next(l for l in block.splitlines() if l.strip().startswith("Q_bedCell"))
    band = float(re.split(r"\s+", row.split(")")[-1].strip())[2])
    assert 2.5 < band < 3.5, f"a +-3 % oscillation must print as about +-3 %, got {band}"


def test_sealed_case_still_uses_the_reference_scale(tmp_path):
    case(tmp_path, "A2_F0_rig", {"filter": "F0", "U_mps": 4}, q_patch=-1.229e-4)
    case(tmp_path, "J1_SEALED_full", {"filter": "SEALED", "U_mps": 4, "BORE_R": 0.4104},
         uz=lambda t: 1e-8 * math.sin(t))
    out = subprocess.run([sys.executable, CS, str(tmp_path), "500"], capture_output=True, text=True,
                         check=True).stdout
    head = out[out.index("J1_SEALED_full"):].splitlines()[0]
    assert "1.229e-04" in head, f"a sealed case must not be scaled by its own noise: {head}"
