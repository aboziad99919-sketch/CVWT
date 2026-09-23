# Stage-1 test plan (CVWT CFD package)

The deliverable is a simulation, so the failure that matters is not a crash — it is a case that runs, converges and
reports a number that is wrong. The plan therefore tests the cheap deterministic layers hard, and uses one small
physics case to check the expensive layer before spending core-hours on it.

## Pyramid for this codebase

```
        /  pilot case (30-45 min, CI)        \   1 case: does the real geometry mesh, run, converge?
       /  porous-duct verification (30 s)     \  1 case: does OpenFOAM reproduce Ergun?
      /  unit tests (2 s, no OpenFOAM)         \ 29 tests: geometry, pre-screen, generation, parsers
```

## What is tested, and how

| Area | Type | Why it can break | Tests |
|---|---|---|---|
| CFD surfaces (`geometry/*.stl`) | unit | a leaking or inside-out surface silently deletes the fluid region during meshing | watertight, manifold, outward normals, locked scale (306.7 mm, Ø112 mm), perforated vs plain core (genus 36 vs 1), housing floor open on the axis |
| Outlet slots | unit | slots outside the bore would open into solid; too small throttles the bed | corners inside r = 17 mm, area ≥ 250 mm² floor, area matches the slot list, audit JSON agrees with the geometry |
| Pre-screen network (`rom/`) | unit (property-based) | a sign or coefficient error changes the whole study's conclusion | flow falls with resistance and bed thickness, rises with driving pressure and speed, open top bypasses, node-pressure balance closes, Darcy limit is linear, Ergun coefficients exact, zero drive → zero flow |
| Case generation (`sweep/`) | unit | one unresolved `@@PLACEHOLDER@@` or a wrong STL makes a plausible but wrong case | no placeholders survive, refuses to overwrite, capped case has the top cap + perforated core, reversed case has neither, bed thickness and Ergun coefficients reach the dictionaries, fin rotation preserves volume and rotates by the exact angle, dictionaries balanced |
| Log parsing and gates (`summarize_run.py`) | unit with golden logs | a parser that mis-reads a diverged run as converged is the worst failure mode here | healthy run passes all gates and reports the right flow, Δp and Cp; failed checkMesh, stalled run, crashed run and mass imbalance each block the PASS; missing logs never pass |
| OpenFOAM porosity model | integration (30 s) | the `porosityForce` / DarcyForchheimer syntax and units are the single highest-risk assumption in the package | 1-D slip-wall duct, one bed, plug flow: solver Δp must match Ergun (2.844 Pa at 0.06 m/s) within 2 %, and outlet flow must match the inlet |
| Whole case (mesh → solve → gates) | integration (30-45 min) | geometry, snappy settings, patch naming, boundary conditions only meet reality here | coarse pilot case in CI: checkMesh passes, residuals fall 4 orders, mass closes to 1e-3, `outletFilter` has faces at the slot exits only |
| Physics correctness of results | verification | a converged wrong answer | bed Δp from probes must equal t·(μ·d·V + ½·ρ·f·V²) within 2 %; filter flow ≤ empty-housing value; core Cp between sealed and freestream bounds; group R flow must be upward |
| Grid independence | verification | numbers that move with the mesh | coarse/medium/fine on the baseline, GCI reported before any result is quoted |

## Coverage targets

- Deterministic Python (geometry, pre-screen, generation, parsers): **every public function exercised**, and every acceptance gate tested in both its pass and fail state. Currently 29 tests, all passing, about 2 seconds.
- OpenFOAM layer: **one verification case per physics model used**. Today that is the porous bed. Add one per model as they arrive: MRF or sliding mesh in Stage 2, scalar transport in Stage 4.
- Sweep: the pilot case plus the two mesh-independence cases before any group is run in full.

## Gaps this plan does not close

1. **The filter media are assumed, not measured.** No test can fix that; only a bench Δp(V) measurement can.
2. **Turbulence modelling is unvalidated at rig scale.** k-ω SST on a frozen rotor has no reference data here. The rig itself is the missing test.
3. **The pilot has not run yet.** Until it does, the OpenFOAM dictionaries are only syntax-checked, not executed.
4. **No regression baseline.** Once the pilot passes, store its summary as a golden file and assert future runs stay within a few percent.
5. **Rig measurements are the real acceptance test** for Stage 1: a pressure tap in the bore and a flow measurement at the outlet.

## Bugs this suite already caught

Writing the tests found three real defects in the summariser, all of which would have produced confident wrong verdicts:

1. `Q_outlet*` also matched `Q_outletFilter`, so the mass balance compared the wrong flows.
2. The cell-count regex was missing multi-line mode, so every run reported 0 cells.
3. The conservation gate used a falsy check, so a perfect mass balance of exactly 0.0 was recorded as a failure.

## Running the suite

```bash
cd cfd/stage1/tests && python3 -m unittest discover -p "test_*.py" -v     # 2 s, no OpenFOAM
cd foam/porous_duct && ./Allrun --run                                      # 30 s, needs OpenFOAM 12
```

CI runs the unit job on every push, then the porosity verification and the pilot case in the second job.
