"""Compare the solver's bed pressure drop with the Ergun value. Fails the build if they disagree > 2 %."""
import glob, sys
RHO, MU, U, T = 1.2, 1.81e-5, 0.06, 0.018
D, F = 1.245e8, 1.0563e4
def last(name):
    f = sorted(glob.glob(f"postProcessing/{name}/*/*.dat"))[-1]
    return float([l for l in open(f) if l.strip() and not l.startswith("#")][-1].split()[-1])
dp_cfd = (last("p_in") - last("p_out")) * RHO                      # kinematic p -> Pa
dp_ergun = T * (MU * D * U + 0.5 * RHO * F * U * U)
err = abs(dp_cfd - dp_ergun) / dp_ergun
print(f"bed Δp: CFD {dp_cfd:.4f} Pa | Ergun {dp_ergun:.4f} Pa | error {err*100:.2f} %")
print(f"outlet flow {abs(last('Q_out'))*6e4:.3f} L/min (expected {U*0.02*0.02*6e4:.3f})")
sys.exit(0 if err < 0.02 else 1)
