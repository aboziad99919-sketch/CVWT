"""Give every filter layer its DESIGNED resistance, whatever thickness the mesh gave it.

Run by Allrun after topoSet, before foamRun. topoSet puts a cell in a layer when its CENTRE is
inside, so a layer meshes to a whole number of cell layers. Group J's 25 mm foam grades on 15 mm
cells came out 30 / 30 / 15 mm (4648 / 4648 / 2324 cells): the finest grade, C3, which carries 88 %
of the cassette's resistance, was 40 % too thin, and the cassette 33 % too permeable.

Resistance is linear in thickness for both Ergun terms, so each layer's d and f are scaled by
designed / meshed thickness. The integral t*d and t*f is then exact per layer.

Single-layer beds (every group before J) are left alone: correcting them now would silently break
comparison with the 54 cases already collected. The script REFUSES - exits non-zero, so the run
fails visibly - when the cell counts do not fit the expected cell size, rather than apply a
correction it cannot justify.
"""
import math, re, sys

CP, BM, LOG = "system/caseParams", "system/blockMeshDict", "log.topoSet"


def params(path):
    out = {}
    for line in open(path):
        m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s+([-+0-9.eE]+)\s*;", line)
        if m:
            out[m.group(1)] = float(m.group(2))
    return out


def base_cell(path):
    """(dx, dy, dz) of the blockMesh cells in metres."""
    t = open(path).read()
    conv = float(re.search(r"convertToMeters\s+([-+0-9.eE]+)", t).group(1))
    verts = [tuple(map(float, v)) for v in
             re.findall(r"\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s*\)",
                        t[t.index("vertices"):t.index("blocks")])]
    n = list(map(int, re.search(r"hex\s*\([^)]*\)\s*\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)", t).groups()))
    span = [(max(v[k] for v in verts) - min(v[k] for v in verts)) * conv for k in range(3)]
    return tuple(span[k] / n[k] for k in range(3))


def zone_sizes(path):
    sizes = {}
    for m in re.finditer(r"cellZoneSet\s+filter(\d+)\s+now size\s+(\d+)", open(path).read()):
        sizes[int(m.group(1))] = int(m.group(2))          # last report wins
    return sizes


def main():
    p = params(CP)
    layers = sorted(int(k[4:]) for k in p if re.fullmatch(r"LZ0_\d+", k))
    if len(layers) < 2:
        print("single-layer bed: no correction (kept identical to the collected groups)")
        return 0
    if "designed" in open(CP).read():
        print("layers already corrected in this case: not applying the factors twice")
        return 0
    lvl = int(p["LVL"])
    dx, dy, dz = (d / 2 ** lvl for d in base_cell(BM))
    n_xs = math.pi * p["BORE_R"] ** 2 / (dx * dy)           # cells across the bore, estimated
    N = zone_sizes(LOG)
    rows, total_mesh, total_design = [], 0.0, 0.0
    for i in layers:
        if i not in N or N[i] == 0:
            print(f"REFUSED: filter{i} has no cells in {LOG}"); return 2
        k = N[i] / n_xs
        if round(k) < 1 or abs(k - round(k)) > 0.1:
            print(f"REFUSED: filter{i} has {N[i]} cells = {k:.2f} cross-sections of the expected "
                  f"{n_xs:.0f}. The cassette is not meshed at level {lvl} as assumed, so the meshed "
                  f"thickness is unknown and no correction is applied."); return 3
        t_mesh, t_des = round(k) * dz, p[f"LZ1_{i}"] - p[f"LZ0_{i}"]
        rows.append((i, N[i], round(k), t_des, t_mesh, t_des / t_mesh))
        total_mesh += t_mesh; total_design += t_des
    if abs(total_mesh - total_design) > 2 * dz:
        print(f"REFUSED: meshed stack {1000*total_mesh:.1f} mm against {1000*total_design:.1f} mm "
              f"designed - more than two cells apart, so the cell size assumption is wrong"); return 4

    text = open(CP).read()
    for i, n, k, td, tm, fac in rows:
        for key in (f"D_{i}", f"F_{i}"):
            m = re.search(rf"^({key}\s+)([-+0-9.eE]+)(\s*;)(.*)$", text, flags=re.M)
            new = float(m.group(2)) * fac
            text = (text[:m.start()] + f"{m.group(1)}{new:.6g}{m.group(3)}{m.group(4)}"
                    f"  // x{fac:.4f}: meshed {1000*tm:.1f} mm, designed {1000*td:.1f} mm"
                    + text[m.end():])
    open(CP, "w").write(text)
    print(f"cassette meshed on {1000*dz:.2f} mm cells (level {lvl}), {n_xs:.0f} cells per cross-section")
    print(f"  {'layer':>5s} {'cells':>7s} {'cell rows':>9s} {'designed':>9s} {'meshed':>8s} {'d,f x':>7s}")
    for i, n, k, td, tm, fac in rows:
        print(f"  {i:5d} {n:7d} {k:9d} {1000*td:7.1f}mm {1000*tm:6.1f}mm {fac:7.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
