# CVWT Stage 1: flow and pressure-drop sensitivity study (1:12 rig)

**What this stage answers:** how much air the CVWT's internal path (holes, hollow cylinder, biochar bed, outlet) actually carries, and how that changes with filter resistance, bed thickness, approach speed and rotor position.

**What it does not answer:** capture efficiency. No capture numbers will be reported until the biochar's Δp(V) and adsorption/filtration properties are measured or explicitly assumed.

## 1. Locked basis

| Item | Value | Source / check |
|---|---|---|
| Full-size CVWT height | 3.68 m | locked |
| 1:2 model (drawing) | 1.84 m | CVWT3.pdf (units cm) |
| 1:12 rig CVWT height | 306.7 mm | STL: z 0 → 306.7 mm ✔ |
| Rig | 2520 × 740 × 830 mm | STL bounding box = drawing ✔ |
| Rotor | 4 helical fins, passive, Ø112 mm (1.34 m full size; drawing 1.32 m, 1.8 % difference), span 231.7 mm, ~175° total twist | STL |
| Stationary core | hollow cylinder OD 24 / ID 20 mm; about 35 radial holes (~5 mm), open area ≈ 718 mm² | STL topology (genus 36) |
| Filter (placeholder) | Ø34 × 18 mm solid at z 27–45 mm, inside housing ID 34 | STL |
| Flow path | external air → fin/core region → holes → bore → housing plenum → biochar bed → downward outlet | locked |

## 2. Geometry findings to resolve (details in `geometry/geometry_audit.json`)

- **G1 (resolved with a placeholder, 22 Sep 2026).** The CAD had no downward outlet. **Your decision:** the outlet is slots cut through the base-dish floor, both mount plates and the median plate, venting to still room air. The slot dimensions are still open, so the CFD uses a parametric placeholder: 3 parallel slots, 6 mm wide with 2 mm ribs, running along the lanes inside the Ø34 bore. That gives 467 mm² open (51 % of the Ø34 area you accepted), through a 30 mm stack (floor 5 + plates 5 + 10 + median plate 10 mm). The exits sit at the underside of the median plate (z = −25 mm) at room pressure. Files: `geometry/build_outlet.py`, `geometry/cvwt_base_stack.stl`, `geometry/outlet_slots.json`. **Sizing guideline from the pre-screen:** with any real bed (F1–F4), switching from the Ø34 hole to these slots cuts filter flow by ≤ 3 %. Keep the open area ≥ ~250 mm² at rig scale (≈ 0.036 m² at full scale) and the filter, not the slots, remains the controlling resistance. Below ~100 mm² the slots start to throttle the coarse beds (F1 −28 %).
- **G2 (decided, 23 Sep 2026).** The top of the hollow cylinder is open in the CAD (the end caps are rings), which lets it bypass the filter. **Decision: the baseline caps it** — a `cvwt_topcap.stl` disk closes the bore above the rotor in every baseline case. The open-top variants stay in groups A2/B2 to quantify the bypass, and the new group R tests the *reversed* layout, where the top opening is used deliberately as the exhaust.
- **G3.** The filter is only a placeholder volume. In CFD it becomes a porous cellZone.
- **G4.** Radial clearance between fins and tube is 1.9 mm. Stage 1 uses a frozen rotor. Stage 2 (rotation) needs a sliding (AMI) or MRF interface in that gap.
- **G5.** Wheels, belts and the enclosure are not watertight solids, and the enclosure ends are open. This does not matter until the moving-vehicle stage.

## 3. Candidate filter resistances (ASSUMED, labelled; replace with measured data)

These are granular biochar beds described by the Ergun equation, using superficial velocity. The coefficients map directly to OpenFOAM DarcyForchheimer `d` and `f`.

| ID | Assumed media | d [1/m²] | f [1/m] | Thickness levels |
|---|---|---|---|---|
| F0 | empty housing | 0 | 0 | – |
| F1 | granules d_p = 4 mm, ε = 0.45 | 3.11e7 | 5.28e3 | 9 / 18 / 36 mm |
| F2 | granules d_p = 2 mm, ε = 0.45 | 1.24e8 | 1.06e4 | 9 / 18 / 36 mm |
| F3 | granules d_p = 1 mm, ε = 0.45 | 4.98e8 | 2.11e4 | 9 / 18 / 36 mm |
| F4 | d_p = 0.5 mm, ε = 0.40 | 3.37e9 | 6.56e4 | 9 / 18 / 36 mm |
| SEALED | numerical block (d = 1e12) | – | – | used to map the core pressure with no through-flow |

A "multilayer" filter is modelled as layers in series: sum the t·d and t·f of each layer.

## 4. Pre-CFD network estimate (`rom/`)

This is a lumped model: hole losses, bore friction, sudden expansion, Ergun bed, slotted outlet passage (entry + laminar slot friction + exit). It exists to size the CFD, not to predict results. The case below is U = 4 m/s, core pressure coefficient at the holes Cp_h = 0.3, bed 18 mm:

| Filter | Q_filter, top capped [L/min] | Face velocity [m/s] | Δp_bed [Pa] | Q_filter, top open [L/min] | Leaving via top [L/min] |
|---|---|---|---|---|---|
| F0 | 29.11 | 0.534 | 0.00 | 6.71 | 48.6 |
| F1 | 7.69 | 0.141 | 2.57 | 2.11 | 49.8 |
| F2 | 3.21 | 0.059 | 2.79 | 0.77 | 50.2 |
| F3 | 0.94 | 0.017 | 2.86 | 0.22 | 50.3 |
| F4 | 0.14 | 0.003 | 2.88 | 0.03 | 50.4 |

What the estimate shows:

1. **Only a few pascals are available to drive the flow at rig scale.** The dynamic pressure is 9.6 Pa at 4 m/s. From F2 onward, the bed consumes almost all of the driving pressure, so the flow through the filter falls roughly as 1/resistance.
2. **Flow through the filter scales linearly with the unknown core pressure** (F2: 1.2, 3.2, 5.8 L/min for Cp_h = 0.1, 0.3, 0.6). That is why CFD groups A1/A2 map the core pressure first.
3. **An open tube top short-circuits the filter by about 4×.** This is a design decision, not a meshing detail.

Plausibility note on the web app: it displays "ΔP ≈ −38 Pa" and "61 W". At rig scale and 6 m/s, the total kinetic power through the rotor's frontal area (0.026 m²) is about 3.4 W. A suction of −38 Pa would need about 8 m/s even at Cp = −1. At full scale (3.7 m² frontal area), 61 W corresponds to about 5.6 m/s local wind at a power coefficient of 0.15. The app should label these values as illustrative full-scale values, not rig or CFD results.

## 5. CFD sweep (`sweep/sweep_matrix.csv`, 44 cases, about 354 core-hours)

Setup common to all cases:
- OpenFOAM.org 12, steady incompressible RANS with k-ω SST, frozen rotor.
- Isolated CVWT at rig scale in a 2.0 × 1.0 × 0.625 m domain (blockage < 5 %). The CVWT sits on its mount plates on a deck at road/median level (z = −15 mm).
- Uniform inflow with 5 % turbulence intensity and a 10 mm length scale (assumed); slip deck (no floor boundary layer; component test).
- `outletFilter` = slot exits under the median plate, total pressure 0 (still room air; your decision).
- Medium mesh: surface level 5 at the core (0.625 mm, at least 8 cells across each hole), about 3.5 M cells.

| Group | Cases | Purpose |
|---|---|---|
| A1 | SEALED × azimuth 0 / 22.5 / 45 / 67.5° at 4 m/s | core Cp vs rotor position (90° period), static starting torque |
| A2 | {SEALED, F0} × {top open, capped} × U = 2 / 4 / 6 | driving pressure and bypass vs speed |
| B1 | F1–F4 × t = 9 / 18 / 36 mm, U = 4, capped | resistance × thickness sensitivity |
| B2 | F1–F4, 18 mm, top open | filter bypass |
| C1 | F2 at U = 2 / 6, open and capped | speed scaling (Darcy vs Forchheimer regime) |
| R1 | F1–F4, 18 mm, U = 4, reversed layout (unperforated core, top open) | deck-level intake → bed → bore → top exhaust |
| R2 | F2, reversed layout at U = 2 / 6 | speed scaling of the reversed layout |
| M1 | F2 baseline on coarse and fine meshes | grid convergence index (GCI) |

**Reversed layout (group R).** Same mesh and boundary conditions; two geometry changes: the perforated core cylinder is replaced by a plain
OD 24 / ID 20 cylinder (`geometry/cvwt_tube_solid.stl`, closed wall so the core cannot short-circuit the path) and the top cap is removed.
Nothing else changes: the flow direction is an outcome, not an imposed condition — the outlet patch uses a total-pressure condition that works
as an inlet when the bore pressure is below ambient. Pre-screen expectation at U = 4 m/s, 18 mm bed (to be confirmed or refuted by CFD):
filter flow 11.9 / 5.7 / 1.8 / 0.3 L/min for F1 / F2 / F3 / F4, i.e. 1.5-2.0x the as-drawn layout, with bed residence time ~77 ms for F2.
Caveat: the reversed layout takes its air in at deck level, so it will ingest more coarse grit — a clogging risk that CFD does not capture.

Suggested order:
1. Pilot: one coarse-mesh case (about 0.6 M cells, around 1 core-hour).
2. M1 plus the baseline, to establish mesh independence.
3. A1 and A2, then B, then C, then R (R needs no new mesh settings, only the two geometry swaps).

Nothing runs automatically. Each case starts with `./Allrun` (dry run), then `./Allrun --run 8` after review.

## 6. Acceptance gates per case (engineering skills)

- **Geometry:** the housing, tube, caps, fins and slotted base stack used for CFD are closed and manifold (checked, 0 open or non-manifold edges); `outletFilter` has faces only at the 3 slot exits.
- **Mesh:** checkMesh passes; max non-orthogonality < 70; at least 8 cells across each hole; y+ checked against the wall functions (the mesh has no inflation layers, so y+ must be checked before any wall-shear or force result is trusted).
- **Convergence:** initial residuals drop at least 4 orders; Q_outletFilter, the probe Δp values and rotor torque vary < 0.5 % over the last 500 iterations.
- **Conservation:** |Q_inlet + Q_outlet + Q_outletFilter| / Q_inlet < 1e-3. The bed Δp from the probes should match t·(μ·d·V + ½·ρ·f·V²) within 2 %; this verifies the porous model.
- **Plausibility:** flow through the filter ≤ the empty-housing (F0) value; the core Cp lies between the sealed and freestream bounds. In group R the flow through the bed must be upward (out of the top) — if CFD finds the opposite sign, the suction assumption behind the reversed layout is wrong and the group is reported as such.
- **Validation:** the bed model should be compared against a rig Δp(V) test of the real biochar. Core pressure and outlet flow can be compared later with rig measurements (a pressure tap in the bore, a hot-wire or flow meter at the outlet).

## 7. After stage 1

1. **Stage 2:** rotating rotor. Use MRF at an assumed tip-speed ratio, or AMI with the passive torque balance. Add inflation layers.
2. **Stage 3:** the rig with moving vehicles (opposite-lane shear, transient; overset or AMI mesh motion), using the repaired rig CAD.
3. **Stage 4:** species and particle transport for GEM, particle-bound Hg, PM1/2.5/10, black carbon and Pb. This happens only after the media properties are defined, and all results are labelled with their source.
