"""Compare the solver's bed pressure drop with the Ergun value. Fails the build if they disagree > 2 %.

The base case is one 18 mm F2 bed at 0.06 m/s. A variant made by make_variant.py carries
verify_params.json with its own speed and layer stack, and the Ergun value is the sum over layers.
"""
import glob, json, os, sys
RHO, MU = 1.2, 1.2 * 1.51e-5                 # mu = rho * nu, the nu in constant/physicalProperties
U, LAYERS = 0.06, [{"t": 0.018, "d": 1.245e8, "f": 1.0563e4}]
if os.path.exists("verify_params.json"):
    p = json.load(open("verify_params.json")); U, LAYERS = p["U"], p["layers"]
def last(name):
    f = sorted(glob.glob(f"postProcessing/{name}/*/*.dat"))[-1]
    return float([l for l in open(f) if l.strip() and not l.startswith("#")][-1].split()[-1])
dp_cfd = (last("p_in") - last("p_out")) * RHO                      # kinematic p -> Pa
dp_ergun = sum(l["t"] * (MU * l["d"] * U + 0.5 * RHO * l["f"] * U * U) for l in LAYERS)
err = abs(dp_cfd - dp_ergun) / dp_ergun
print(f"{len(LAYERS)} layer(s) at {U} m/s")
print(f"bed Δp: CFD {dp_cfd:.4f} Pa | Ergun {dp_ergun:.4f} Pa | error {err*100:.2f} %")
print(f"outlet flow {abs(last('Q_out'))*6e4:.4f} L/min (expected {U*0.02*0.02*6e4:.4f})")
sys.exit(0 if err < 0.02 else 1)
