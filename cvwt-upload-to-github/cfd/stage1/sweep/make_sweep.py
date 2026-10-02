"""Generate the stage-1 sensitivity cases (flow + pressure drop, frozen rotor). Creates NEW folders only.
    python make_sweep.py            -> writes sweep_matrix.csv + cost estimate, creates nothing else
    python make_sweep.py --create   -> also creates runs/<case_id>/ (refuses if a folder exists)
Runs are NOT started. Each case is launched after review with ./Allrun --run N (or via the cfd-pipeline MCP)."""
import csv, json, math, re, shutil, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent; ROOT = HERE.parent
TEMPLATE, GEOM = ROOT / "case", ROOT / "geometry"
FILTERS = {r["id"]: r for r in csv.DictReader(open(ROOT / "rom" / "filter_candidates.csv"))}
SEALED = {"d": 1e12, "f": 0.0}                     # numerical 'blocked bed' to map core pressure with no through-flow
LEVELS = {"coarse": 4, "medium": 5, "fine": 6}
CELLS_EST = {"coarse": 0.6e6, "medium": 3.5e6, "fine": 22e6}   # pre-mesh estimates; replace with checkMesh counts

def k_omega(U, I=0.05, l=0.01, cmu=0.09):
    k = 1.5 * (U * I) ** 2; return k, math.sqrt(k) / (cmu ** 0.25 * l)

cases = []
def add(group, fid, t_mm, U, az, top, mesh="medium", core="holes", why="", bed_z0=None, intake=None,
        skirt=None, stack=None, tube_mm=None,
        bore_mm=17.0, slot_r_mm=16.0, scale=1.0):
    """core: 'holes' = perforated cylinder (design as drawn); 'solid' = unperforated cylinder (reversed layout).

    bed_z0 fixes the bed BOTTOM [m]; the top then follows as bed_z0 + thickness. Left as None the bed
    hangs from a fixed top of 0.045 m and grows downward, which is how groups A-R were run. That
    couples thickness to the length of the inlet plenum below the bed (the slot deck top is at
    z = 0.005 m), and group BP exists to separate the two."""
    cid = f"{group}_{fid}_t{t_mm:02d}_U{U}_az{int(az*10):03d}_{top}_{core}_{mesh}"
    if abs(bore_mm - 17.0) > 1e-9 or abs(slot_r_mm - 16.0) > 1e-9:
        cid += f"_b{int(round(bore_mm))}s{int(round(slot_r_mm))}"
    if abs(scale - 1.0) > 1e-9:
        cid += f"_x{int(round(scale))}"
    if intake: cid += f"_{intake}"
    if skirt:  cid += f"_{skirt}"
    if tube_mm: cid += f"_t{int(round(tube_mm))}"
    cases.append(dict(case_id=cid, group=group, filter=fid, thickness_mm=t_mm, U_mps=U, azimuth_deg=az,
                      intake=intake, skirt=skirt, stack=stack, tube_mm=tube_mm,
                      top=top, core=core, mesh=mesh, purpose=why, bed_z0=bed_z0,
                      bore_mm=bore_mm, slot_r_mm=slot_r_mm, scale=scale))

# 1A  map the core driving pressure (the key unknown of the pre-screen) - bed sealed or empty
for az in (0, 22.5, 45, 67.5):
    add("A1", "SEALED", 18, 4, az, "capped", why="core Cp vs rotor azimuth (4 fins -> 90 deg period), static torque")
for fid in ("SEALED", "F0"):
    for top in ("capped", "open"):
        for U in (2, 4, 6):
            add("A2", fid, 18, U, 0, top, why="driving pressure & bypass vs speed, top open/capped")
# 1B  filter resistance x thickness at the design point
for fid in ("F1", "F2", "F3", "F4"):
    for t in (9, 18, 36):
        add("B1", fid, t, 4, 0, "capped", why="filter resistance x thickness sensitivity")
    add("B2", fid, 18, 4, 0, "open", why="filter bypass through open tube top")
# 1BP control for the group-B anomaly: core Cp did not fall monotonically with bed thickness, and the
#     36 mm cases showed the SHALLOWEST suction when they should show the deepest. In group B the bed
#     hangs from a fixed top at 45 mm, so a thicker bed also starts closer to the slot exits and loses
#     its inlet plenum. Here the bed BOTTOM is pinned at 9 mm instead, giving every case the same 4 mm
#     plenum, so thickness is varied on its own. t36 is unchanged from B1 and is the shared anchor.
for fid in ("F1", "F2", "F3"):
    for t_mm in (9, 18, 36):
        add("BP", fid, t_mm, 4, 0, "capped", bed_z0=0.009,
            why="bed thickness at constant inlet plenum (control for the group-B Cp anomaly)")

# 1D  the two questions the group-A/B results raise, measured rather than modelled.
#  D1: how high can the intake go? The external probe rake (in controlDict, so every case carries it)
#      maps Cp up the outside of the CVWT. An intake is only usable where that is still near ambient.
#      One sealed case is enough, since the external field barely depends on the small internal flow.
#  D2: bed area. The head available to the bed is capped near 1.62 Pa at 4 m/s, so the way to move
#      more air is a lower face velocity, i.e. a wider bed. Ø34 (as drawn) / Ø48 / Ø68, slots widened
#      in step so they do not become the new throttle.
#  D3: Ø68 with the as-drawn slots, to separate the bed-area gain from the slot restriction.
add("D1", "SEALED", 18, 4, 0, "capped", why="external Cp rake: how high can the intake sit?")
for bore, slot in ((17.0, 16.0), (24.0, 23.0), (34.0, 33.0)):
    add("D2", "F2", 18, 4, 0, "capped", bore_mm=bore, slot_r_mm=slot,
        why=f"bed area sweep: bore r={bore:.0f} mm, slots widened to r={slot:.0f} mm")
add("D3", "F2", 18, 4, 0, "capped", bore_mm=34.0, slot_r_mm=16.0,
    why="bore r=34 mm with the as-drawn slots: isolates the slot throttle")

# 1R+ sealing the core. The D1 rake showed the device generates 7.4 Pa between a deck-level intake
#     (Cp +0.11) and the rotor's suction field (Cp -0.66), but the bed receives only 1.62 Pa of it.
#     The perforated core is why: circulation through the hole band pins the bore at an intermediate
#     -2.99 Pa. An unperforated tube breaks that tie, so the path runs deck -> bed -> bore -> top
#     exhaust and the bed can see the full drop. The rotor becomes a suction generator; particles
#     enter with the air at deck level rather than through the blades.
#  RS: sealed bed, solid core, open top - measures the head the sealed core actually delivers, which
#      is the number the whole proposal rests on. Run at both bed diameters.
#  R3/R4: F1-F3 at 18 mm, solid core, open top, at Ø34 and Ø68. Head gain and area gain together.
#      Slots stay as drawn at Ø68: group D measured the widened plate to be worth only 2.1 %.
for bore, slot in ((17.0, 16.0), (34.0, 16.0)):
    add("RS", "SEALED", 18, 4, 0, "open", core="solid", bore_mm=bore, slot_r_mm=slot,
        why="sealed core, open top: how much head does breaking the hole-band tie actually give?")
for grp, bore in (("R3", 17.0), ("R4", 34.0)):
    for fid in ("F1", "F2", "F3"):
        add(grp, fid, 18, 4, 0, "open", core="solid", bore_mm=bore, slot_r_mm=16.0,
            why=f"sealed core, open top, bore r={bore:.0f} mm: head gain x area gain")

# 1FS full scale. Pressure does not scale: head = Cp x 0.5*rho*U^2, and U is 4 m/s at any size, so
#     the ~6.4 Pa available is the same on a 0.31 m rig and a 3.68 m tower. What scales is the bed -
#     thickness x12, area x144 - while the biochar grain stays 2 mm. A hand calculation says flow
#     should go as L^1.1 and residence time as roughly L^2, giving ~405 L/min and ~17 s for F2.
#     That calculation assumes the bed takes all the head and ignores the Reynolds change from
#     30,000 to 360,000 at the rotor, so it is worth +-30% at best. These cases measure it.
for grp, bore, S in (("FS", 34.0, 12.0),):
    add(grp, "SEALED", 18, 4, 0, "open", core="solid", bore_mm=bore, slot_r_mm=16.0, scale=S,
        why="full scale: is the available head really unchanged by size?")
    for fid in ("F1", "F2", "F3"):
        add(grp, fid, 18, 4, 0, "open", core="solid", bore_mm=bore, slot_r_mm=16.0, scale=S,
            why="full scale sealed core: flow and residence time at 1:1")

# 1C  speed scaling check (Δp ~ U^1 vs U^2 regime) for one mid candidate
for U in (2, 6):
    for top in ("capped", "open"):
        add("C1", "F2", 18, U, 0, top, why="Reynolds/speed scaling of filter flow")
# 1R  reversed layout: intake through the bottom slots, bed, bore, exhaust out the open top;
#     perforated holes replaced by a plain cylinder wall so the core cannot short-circuit the path
for fid in ("F1", "F2", "F3", "F4"):
    add("R1", fid, 18, 4, 0, "open", core="solid", why="reversed layout: deck-level intake, top exhaust")
for U in (2, 6):
    add("R2", "F2", 18, U, 0, "open", core="solid", why="reversed layout, speed scaling")
# 1J  SKIRT INTAKE + CemBioFoam CASSETTE (user sketch, 2 Oct 2026; ESC proposal CemBioFoam-Air).
#     Group I proved that height cannot buy both grit rejection and head: lifting the intake into
#     the rotor's suction field cut the driving pressure from 4.30 Pa to 1.60 Pa. This design puts
#     the intake back at deck level, where the rake reads nearly ambient, and rejects grit with a
#     perforated cone instead - 1.35 m2 of open area against a 0.228 m2 slot, so the screen's own
#     loss is below 0.01 Pa. The packed biochar is replaced by the proposal's three-grade open-cell
#     cement foam cassette, 113x more permeable than F2 at the coarse end.
#
#     Full scale, because a 3 x 25 mm foam cassette is a real object: pore size does not shrink when
#     the device does, so a 1:12 model of it would be a different filter.
#
#     A 1-D balance calibrated against the measured FS_F2 case (it predicts 435 L/min where CFD
#     measured 390) says the cassette should give about 4260 L/min and - the reason the tube is in
#     this sweep - that the Ø240 exhaust tube then becomes 38 % of the whole loss. The bottleneck
#     moves out of the filter for the first time in this study.
SK = 12.0
for fid, sk, why in (
        ("SEALED", "r100", "sealed cassette: what head does the skirt actually deliver?"),
        ("CEM",    "r100", "the sketch as drawn: skirt base r1200 mm, three-grade foam cassette"),
        ("CEM",    "r140", "skirt base r1680 mm: does a wider cone buy anything, or is the slot the limit?"),
        ("F2",     "r100", "same skirt, old packed biochar: isolates the media change from the intake change")):
    add("J1", fid, 18, 4, 0, "open", core="solid", bore_mm=34.0, slot_r_mm=16.0, scale=SK,
        skirt=sk, stack=(25.0, 25.0, 25.0), bed_z0=0.027, why=why)
# The flow probe has been wrong twice: a cuttingPlane that ignored its bounds, then a faceZone that
# disagreed with the patch integral by 1.95x. This leg runs the trusted patch integral and the new
# cell-average probe on the same reference case, so group J's flow is checked, not assumed.
add("J1", "F2", 18, 4, 0, "open", core="solid", bore_mm=34.0, slot_r_mm=16.0,
    why="validation: patch integral vs cell-average probe on the reference case")

# 1I  INTAKE REDESIGN (user, 1 Oct 2026). The stage-1 model drew air through slots cut down through
#     the base dish, mount plates and median plate, venting at z = -25 mm to "still room air". That
#     exists on a test bench; on a road median the base sits on ground and there is no reservoir
#     under it. The path was never buildable. It is replaced by an ANNULAR slot through the housing
#     wall into the plenum below the bed: omnidirectional (traffic wind alternates with the lane),
#     1357 mm2 at 6 mm height against the old 467 mm2, and axisymmetric so it meshes cleanly.
#
#     The user also asked for the intake to sit at least 100 mm above the deck, to escape road grit.
#     The D1 rake says the static pressure there is -5.9 Pa against -7.6 Pa in the bore, leaving
#     ~1.7 Pa of the 7.6 Pa the circuit works on today - about 29 % of the flow on the fitted system
#     curve. The shroud variants carry the intake mouth up to 85 and 115 mm above the deck through a
#     concentric sleeve, so that cost is MEASURED rather than argued. shroud100_wide doubles the
#     sleeve annulus to separate duct loss from the pressure penalty.
for v, why in (("slot14_h6",  "annular wall intake 29 mm above the deck - the buildable baseline"),
               ("slot20_h6",  "same, 35 mm above the deck: how fast does the stagnation region fade?"),
               ("slot14_h12", "slot height doubled: is 1357 mm2 already enough open area?"),
               ("shroud70",   "intake mouth 85 mm above the deck, below the rotor"),
               ("shroud100",  "intake mouth 115 mm above the deck - the user's requirement, measured"),
               ("shroud100_wide", "same mouth, sleeve annulus 3318 mm2: duct loss or pressure loss?")):
    add("I1", "F2", 18, 4, 0, "open", core="solid", bore_mm=34.0, slot_r_mm=16.0,
        intake=v, why=why)

# mesh independence on the baseline (medium is in B1)
for mesh in ("coarse", "fine"):
    add("M1", "F2", 18, 4, 0, "capped", mesh, why="grid convergence (GCI) on baseline")


COORD = re.compile(r"\(\s*(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)")
RADIUS = re.compile(r"(\bradius\s+)([\d.eE+-]+)")

def scale_triples(line, s):
    """Multiply every (x y z) on the line, and any 'radius N', by s."""
    line = COORD.sub(lambda m: "(%g %g %g)" % tuple(float(g) * s for g in m.groups()), line)
    return RADIUS.sub(lambda m: m.group(1) + "%g" % (float(m.group(2)) * s), line)

def scale_stl(path, s):
    out = []
    for line in open(path, errors="replace"):
        f = line.split()
        if f and f[0] == "vertex":
            out.append("  vertex %.7e %.7e %.7e\n" % tuple(float(v) * s for v in f[1:4]))
        else:
            out.append(line)                       # normals are unit vectors; scaling must not touch them
    open(path, "w").writelines(out)

def apply_scale(dst, s):
    """Geometric scale-up. Lengths scale; the biochar grain does NOT, so the Ergun coefficients
    (D_COEFF, F_COEFF) are deliberately left alone - that is the whole physics of the question."""
    for stl in (dst / "constant" / "geometry").glob("*.stl"):
        scale_stl(stl, s)
    bm = dst / "system" / "blockMeshDict"
    bm.write_text(re.sub(r"convertToMeters\s+[\d.]+", "convertToMeters %g" % s, bm.read_text()))
    sn = dst / "system" / "snappyHexMeshDict"
    sn.write_text("\n".join(
        scale_triples(l, s) if re.search(r"point1|point2|\bmin\b|\bmax\b|insidePoint|radius", l) else l
        for l in sn.read_text().splitlines()) + "\n")
    cd = dst / "system" / "controlDict"
    txt = cd.read_text(); a = txt.index("probeLocations"); b = txt.index(");", a)
    cd.write_text(txt[:a] + "\n".join(scale_triples(l, s) for l in txt[a:b].splitlines()) + txt[b:])

def rotate_stl(src, dst, deg):
    th = math.radians(deg); c, s = math.cos(th), math.sin(th)
    out = []
    for line in open(src):
        m = re.match(r"(\s*)(vertex|facet normal)\s+(\S+)\s+(\S+)\s+(\S+)", line)
        if m:
            x, y, z = map(float, m.group(3, 4, 5))
            out.append(f"{m.group(1)}{m.group(2)} {c*x - s*y:.7e} {s*x + c*y:.7e} {z:.7e}\n")
        else:
            out.append(line)
    open(dst, "w").writelines(out)

QCELL_BLOCK = """    // Flow, measured without any surface at all: the area-average axial velocity in a slab of
    // the bore. components(U) makes Uz a scalar field; volAverage over a region of constant
    // cross-section is the mean axial velocity, so Q = Uz_avg * pi * BORE_R^2. No normal, no flip
    // map, nothing outside the housing can reach it. The collector does the multiplication.
    #includeFunc components(U)
    Q_bedCell
    {
        type            volFieldValue;
        libs            ("libfieldFunctionObjects.so");
        writeControl    timeStep;
        writeInterval   1;
        log             false;
        writeFields     false;
        regionType      cellZone;
        name            qCell;
        operation       volAverage;
        fields          (Uz);
    }"""


def create(case):
    dst = HERE / "runs" / case["case_id"]
    if dst.exists():
        raise FileExistsError(f"{dst} exists - not overwriting")
    shutil.copytree(TEMPLATE, dst)
    g = dst / "constant" / "geometry"; g.mkdir(parents=True, exist_ok=True)
    bore, slot_r = case.get("bore_mm", 17.0), case.get("slot_r_mm", 16.0)
    hsuf = "" if abs(bore - 17.0) < 1e-9 else f"_r{int(round(bore))}"
    ssuf = "" if abs(slot_r - 16.0) < 1e-9 else f"_r{int(round(slot_r))}"
    for n in ("cvwt_caps", "cvwt_topcap"):
        shutil.copy(GEOM / f"{n}.stl", g / f"{n}.stl")
    # widened variants keep the surface NAMES, so snappy/topoSet need no per-case edits
    intake, skirt = case.get("intake"), case.get("skirt")
    if skirt:
        # The skirt file already contains the slotted housing AND the perforated cone as named
        # shells, so snappy and surfaceFeatures address it by the same filename as always.
        shutil.copy(GEOM / f"cvwt_skirt_{skirt}_p30.stl", g / "cvwt_housing_cfd.stl")
        shutil.copy(GEOM / "cvwt_base_stack_sealed.stl", g / "cvwt_base_stack.stl")
    elif intake:
        # The intake variants keep the surface FILENAMES, so snappy and topoSet need no per-case
        # edits: the housing is replaced by the slotted/shrouded one and the base by a sealed stack
        # with no through-path at all.
        shutil.copy(GEOM / f"cvwt_intake_{intake}.stl", g / "cvwt_housing_cfd.stl")
        shutil.copy(GEOM / "cvwt_base_stack_sealed.stl", g / "cvwt_base_stack.stl")
    else:
        shutil.copy(GEOM / f"cvwt_housing_cfd{hsuf}.stl", g / "cvwt_housing_cfd.stl")
        shutil.copy(GEOM / f"cvwt_base_stack{ssuf}.stl", g / "cvwt_base_stack.stl")
    # the core cylinder: perforated (as drawn) or unperforated (reversed layout) - same patch name either way
    shutil.copy(GEOM / ("cvwt_tube.stl" if case["core"] == "holes" else "cvwt_tube_solid.stl"), g / "cvwt_tube.stl")
    rotate_stl(GEOM / "cvwt_fins.stl", g / "cvwt_fins.stl", case["azimuth_deg"])
    # D_COEFF/F_COEFF stay for the single-medium dictionaries and for the case record; a layered
    # cassette ("CEM") has no single pair, so it reports its first grade and the per-layer values
    # below are what the solver actually uses.
    if case["filter"] == "SEALED":  d, f = SEALED["d"], SEALED["f"]
    elif case["filter"] == "CEM":   d, f = (float(FILTERS["C1"]["Darcy_d_1/m2"]),
                                            float(FILTERS["C1"]["Forchheimer_f_1/m"]))
    else: d, f = float(FILTERS[case["filter"]]["Darcy_d_1/m2"]), float(FILTERS[case["filter"]]["Forchheimer_f_1/m"])
    S = case.get("scale", 1.0)
    k, om = k_omega(case["U_mps"], l=0.01 * S); L = LEVELS[case["mesh"]]
    subs = {"U_IN": case["U_mps"], "K_IN": f"{k:.6g}", "OMEGA_IN": f"{om:.6g}", "D_COEFF": f"{d:.6g}", "F_COEFF": f"{f:.6g}",
            "FILTER_Z0": f"{S * (case['bed_z0'] if case.get('bed_z0') is not None else 0.045 - case['thickness_mm']/1000):.5f}",
            "FILTER_Z1": f"{S * ((case['bed_z0'] + case['thickness_mm']/1000) if case.get('bed_z0') is not None else 0.045):.5f}",
            "FILTER_ID": case["filter"],
            # the porous cylinder is cut 0.2 mm oversize so it reaches the wall without leaving a gap
            "BORE_R": f"{S * (case.get('bore_mm', 17.0) + 0.2)/1000:.5f}",
            "LVL": L, "LVL_1": L - 1, "LVL_2": L - 2, "LVL_3": L - 3, "NPROCS": 4}
    # The filter cassette. A single-medium bed is one layer; the CemBioFoam cassette is three
    # 25 mm grades whose thickness is ABSOLUTE - a foam pore does not shrink when the device is
    # scaled, so a x12 case carries the same 75 mm stack a 1:1 case does.
    z0 = float(subs["FILTER_Z0"])
    stack = case.get("stack")
    if stack:
        bounds = [z0]
        for t in stack: bounds.append(bounds[-1] + t / 1000.0)
        subs["FILTER_Z1"] = f"{bounds[-1]:.5f}"
    else:
        bounds = [z0, float(subs["FILTER_Z1"])]
    if case["filter"] == "CEM":   grades = ["C1", "C2", "C3"][:len(bounds) - 1]
    else:                         grades = [case["filter"]] * (len(bounds) - 1)
    lp, fz, pm = [], [], []
    for i, gid in enumerate(grades, 1):
        if gid == "SEALED": dd, ff = SEALED["d"], SEALED["f"]
        else: dd, ff = (float(FILTERS[gid]["Darcy_d_1/m2"]), float(FILTERS[gid]["Forchheimer_f_1/m"]))
        lp.append(f"LZ0_{i}       {bounds[i-1]:.5f};\nLZ1_{i}       {bounds[i]:.5f};\n"
                  f"D_{i}         {dd:.6g};        // {gid}\nF_{i}         {ff:.6g};")
        fz.append(f"    {{ name filter{i}Cells; type cellSet; action new; source cylinderToCell;\n"
                  f"      point1 (0 0 $LZ0_{i}); point2 (0 0 $LZ1_{i}); radius $BORE_R; }}\n"
                  f"    {{ name filter{i}; type cellZoneSet; action new; source setToCellZone;"
                  f" set filter{i}Cells; }}")
        pm.append(f"filterLayer{i}\n{{\n    type            porosityForce;\n"
                  f"    porosityForceCoeffs\n    {{\n        cellZone        filter{i};\n"
                  f"        type            DarcyForchheimer;\n"
                  f"        d   ($D_{i} $D_{i} $D_{i});\n        f   ($F_{i} $F_{i} $F_{i});\n"
                  f"        coordinateSystem filterAxes;\n    }}\n}}")
    subs["LAYERPARAMS"]   = "\n".join(lp)
    subs["FILTERZONES"]   = "\n".join(fz)
    subs["POROUSMODELS"]  = "\n".join(pm)
    subs["QC_Z0"] = f"{bounds[-1] + 0.002 * S:.5f}"
    subs["QC_Z1"] = f"{bounds[-1] + 0.008 * S:.5f}"

    # Flow-measuring slabs, 2 mm at rig scale. The finest mesh resolves 0.3 mm here, the coarsest
    # 2.5 mm, so the slab is at least ~2 cells deep in every case and the shared-face set is never
    # empty. They start 1 mm above the bed so the measurement is in the bore, not in the porous zone.
    _z1 = float(subs["FILTER_Z1"])
    subs["QZ_LO"] = f"{_z1 + 0.001 * S:.5f}"
    subs["QZ_MID"] = f"{_z1 + 0.003 * S:.5f}"
    subs["QZ_HI"] = f"{_z1 + 0.005 * S:.5f}"
    # How the filter-circuit flow is measured. With the sub-deck slots the exits are on the domain
    # boundary and a patch integral is exact. Group I has no such patch. The first attempt sampled a
    # cuttingPlane with a `bounds` entry, which OpenFOAM did NOT apply: the plane spanned the whole
    # domain and integrated the external field, reporting ~1300 L/min through a 34 mm bore (25 m/s,
    # energetically impossible on 7.6 Pa of head). It is now summed over the bedExit FACE ZONE that
    # topoSet cuts inside the bore, which cannot see outside the housing. phi is the volumetric flux
    # for the incompressible solver, so the sum is m3/s directly, and the zone is oriented so that
    # outflow is negative - the convention every parser and all 54 collected cases already use.
    if skirt:
        # Group J gets the cell-average probe ONLY. The faceZone probe below is known wrong (it
        # disagreed with the patch integral by 1.95x on the reference case), so it is not carried
        # into a new group where nobody could catch it. Its check lives on the validation leg,
        # which is a legacy case and still has the trusted patch integral.
        subs["QFLOW"] = QCELL_BLOCK
    elif intake:
        subs["QFLOW"] = (QCELL_BLOCK + "\n" + 
            "    Q_outletFilter\n    {\n"
            "        type            surfaceFieldValue;\n"
            '        libs            ("libfieldFunctionObjects.so");\n'
            "        writeControl    timeStep;\n        writeInterval   1;\n"
            "        log             false;\n        writeFields     false;\n"
            "        surfaceFormat   none;\n"
            "        regionType      faceZone;\n        name            bedExit;\n"
            "        operation       sum;\n        fields          (phi);\n    }")
    else:
        # Groups A-M keep the trusted patch integral as Q_outletFilter, and ALSO carry the new
        # faceZone probe as Q_bedExit. The two measure the same physical flow by independent
        # routes, so any case run with both is a direct check on the group I probe. Nothing
        # downstream reads Q_bedExit, so adding it cannot change an existing result.
        subs["QFLOW"] = (
            "    #includeFunc patchFlowRate(patch=outletFilter, name=Q_outletFilter)\n"
            + QCELL_BLOCK + "\n"
            "    Q_bedExit\n    {\n"
            "        type            surfaceFieldValue;\n"
            '        libs            ("libfieldFunctionObjects.so");\n'
            "        writeControl    timeStep;\n        writeInterval   1;\n"
            "        log             false;\n        writeFields     false;\n"
            "        surfaceFormat   none;\n"
            "        regionType      faceZone;\n        name            bedExit;\n"
            "        operation       sum;\n        fields          (phi);\n    }")
    if abs(S - 1.0) > 1e-9:
        apply_scale(dst, S)
    for p in dst.rglob("*"):
        if p.is_file() and p.suffix != ".stl":
            t = p.read_text()
            for key, v in subs.items(): t = t.replace(f"@@{key}@@", str(v))
            if case["top"] == "open":
                # surfaceFeaturesDict lists every surface on ONE line: drop only the topcap token,
                # never the whole line (doing so deletes all surfaces and snappy then has no eMesh).
                if p.name == "surfaceFeaturesDict":
                    t = t.replace(' "cvwt_topcap.stl"', "")
                elif p.name == "snappyHexMeshDict":   # here each topcap reference is on its own line
                    t = "\n".join(l for l in t.splitlines() if "topcap" not in l.lower()) + "\n"
            left = re.findall(r"@@\w+@@", t)
            assert not left, f"unresolved {left} in {p}"
            p.write_text(t)
    if case["top"] == "open": (g / "cvwt_topcap.stl").unlink()
    if skirt:
        # Refinement, re-cut for this group. Three things make the stock plan wrong here:
        #   coreZone is a 21 mm cylinder drawn for the original 17 mm bore - at x12 it would leave
        #     the outer two thirds of a 410 mm bore at background resolution;
        #   the cassette is three 25 mm layers in a 3.7 m tall domain and needs its own fine box,
        #     but only around the cassette, not up the whole tube;
        #   the perforated cone is a 30 mm shell with 52 mm open bands and sits outside every
        #     existing region, so without one it would not be captured at all.
        # Base cells are 240 mm at full scale, so level 5 is 7.5 mm and level 4 is 15 mm.
        # (The same coreZone mismatch affects the b34 cases in groups D-I at rig scale. That is
        # reported rather than changed underneath results already collected.)
        sn = dst / "system" / "snappyHexMeshDict"
        t = sn.read_text()
        br, z0c, z1c = float(subs["BORE_R"]), bounds[0], float(subs["QC_Z1"])
        t, n = re.subn(r"coreZone\s+\{[^}]*\}",
            f"coreZone     {{ type searchableCylinder; point1 (0 0 0); point2 (0 0 {0.075*S:.4f});"
            f" radius {br + 0.004*S:.4f}; }}\n"
            f"    cassetteZone {{ type searchableCylinder; point1 (0 0 {z0c - 0.004*S:.4f});"
            f" point2 (0 0 {z1c + 0.004*S:.4f}); radius {br + 0.002*S:.4f}; }}\n"
            f"    tubeZone     {{ type searchableCylinder; point1 (0 0 {0.070*S:.4f});"
            f" point2 (0 0 {0.312*S:.4f}); radius {0.021*S:.4f}; }}\n"
            f"    skirtZone    {{ type searchableCylinder; point1 (0 0 {-0.016*S:.4f});"
            f" point2 (0 0 {0.028*S:.4f}); radius {0.106*S:.4f}; }}", t, count=1)
        assert n == 1, "coreZone entry not found in snappyHexMeshDict"
        # cassetteZone carries the fine resolution; the rest of the bore does not need it, and at
        # x12 a 0.9 m tall cylinder at level 5 would cost 1.4 M cells on its own.
        t = t.replace("        coreZone { mode inside; level $LVL; }",
                      "        coreZone { mode inside; level $LVL_1; }")
        t = t.replace("        slotBox  { mode inside; level $LVL; }",
            "        cassetteZone { mode inside; level $LVL; }     // 3 x 25 mm foam layers\n"
            "        tubeZone     { mode inside; level $LVL_2; }\n"
            "        skirtZone    { mode inside; level $LVL_2; }   // plenum; the cone surface is refined by the housing entry")
        # the cone shell is 30 mm with 52 mm open bands: at $LVL_1 that is 2 cells of solid, so the
        # surface itself goes one level finer or snappy closes the bands over
        t = t.replace("housing { level ($LVL_1 $LVL_1);", "housing { level ($LVL $LVL);")
        sn.write_text(t)

    if intake or skirt:
        # Allrun reads this to skip the outletFilter face check, which cannot apply here.
        (dst / "system" / "INTERNAL_INTAKE").write_text(
            f"intake variant: {intake}\nthe filter circuit draws through an annular slot in the "
            f"housing wall, not through the base\n")
    # the generated dictionary blocks are big and are already in the case files; keeping them
    # out of the record stops every collected artifact carrying three copies of them
    rec = {k: v for k, v in {**case, **subs}.items()
           if k not in ("LAYERPARAMS", "FILTERZONES", "POROUSMODELS", "QFLOW")}
    (dst / "case_params.json").write_text(json.dumps(rec, indent=2))

if __name__ == "__main__":
    iters = 3000; us_per_cell_iter = 2.5e-6            # incompressible RANS, per core (rough)
    for c in cases:
        n = CELLS_EST[c["mesh"]]; c["cells_est"] = int(n)
        c["core_hours_est"] = round(n * iters * us_per_cell_iter / 3600, 1)
    with open(HERE / "sweep_matrix.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(cases[0])); w.writeheader(); w.writerows(cases)
    tot = sum(c["core_hours_est"] for c in cases)
    print(f"{len(cases)} cases, ~{tot:.0f} core-hours total (~{tot/8:.0f} h wall on 8 cores; fine mesh dominates)")
    for gname in sorted({c['group'] for c in cases}):
        print(f"  {gname}: {sum(1 for c in cases if c['group']==gname)} cases")
    if "--create" in sys.argv:
        only = [a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")]
        for c in cases:
            if not only or any(o in c["case_id"] for o in only):
                create(c); print("created", c["case_id"])
