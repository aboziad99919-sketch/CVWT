"""Compare the solver's bed pressure drop with the Ergun value. Fails the build if they disagree > 2 %.

The base case is one 18 mm F2 bed at 0.06 m/s. A variant made by make_variant.py carries
verify_params.json with its own speed and layer stack, and the Ergun value is the sum over layers.
"""
import glob, json, os, sys
RHO, MU = 1.2, 1.2 * 1.51e-5                 # mu = rho * nu, the nu in constant/physicalProperties
U, LAYERS = 0.06, [{"t": 0.018, "d": 1.245e8, "f": 1.0563e4}]
if os.path.exists("verify_params.json"):
    p = json.load(open("verify_params.json")); U, LAYERS = p["U"], p["layers"]
def series(name):
    f = sorted(glob.glob(f"postProcessing/{name}/*/*.dat"))[-1]
    return [(float(l.split()[0]), float(l.split()[-1])) for l in open(f) if l.strip() and not l.startswith("#")]
def last(name):
    return series(name)[-1][1]
dp_cfd = (last("p_in") - last("p_out")) * RHO                      # kinematic p -> Pa
dp_ergun = sum(l["t"] * (MU * l["d"] * U + 0.5 * RHO * l["f"] * U * U) for l in LAYERS)
err = abs(dp_cfd - dp_ergun) / dp_ergun
print(f"{len(LAYERS)} layer(s) at {U} m/s")
print(f"bed Δp: CFD {dp_cfd:.4f} Pa | Ergun {dp_ergun:.4f} Pa | error {err*100:.2f} %")
print(f"outlet flow {abs(last('Q_out'))*6e4:.4f} L/min (expected {U*0.02*0.02*6e4:.4f})")
# A relaxed baffle jump converges slowly: say whether the drop was still moving at the end, so a
# "pass" or "fail" is never read off an unconverged number.
pi, po = series("p_in"), series("p_out")
if len(pi) > 20:
    k = int(0.9 * len(pi)); dp90 = (pi[k][1] - po[k][1]) * RHO
    print(f"drop over the last 10 % of iterations: {100 * (dp_cfd - dp90) / dp_ergun:+.3f} % of Ergun"
          f"  ({'settled' if abs(dp_cfd - dp90) < 0.002 * dp_ergun else 'STILL MOVING'})")
sys.exit(0 if err < 0.02 else 1)
