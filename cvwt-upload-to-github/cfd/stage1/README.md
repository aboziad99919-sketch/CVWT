# CVWT stage 1 — flow & pressure-drop sensitivity package
- `STAGE1_PLAN.md`  study definition, assumptions, findings, sweep, acceptance gates  ← start here
- `geometry/`       audit (`geometry_audit.json`), CFD-ready STLs in metres, `build_geometry.py` (regenerates from the rig STL)
- `rom/`            pre-CFD network model, candidate filters (`filter_candidates.csv`), results table + 2 figures
- `case/`           OpenFOAM.org 12 template (snappyHexMesh, porous bed, outlet patch, probes, torque); `./Allrun` = dry run
- `sweep/`          `make_sweep.py` → 38-case matrix (`sweep_matrix.csv`); `--create [--only=<id>]` builds case folders, never runs them
Pilot: `cd sweep && python3 make_sweep.py --create --only=M1_F2_t18_U4_az000_capped_coarse && cd runs/M1_* && ./Allrun && ./Allrun --run 4`
