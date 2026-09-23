"""Shared helpers: load an ASCII STL, check watertightness/manifoldness, signed volume."""
import re, numpy as np
def load_stl(p):
    return np.array(re.findall(r"vertex\s+(\S+)\s+(\S+)\s+(\S+)", open(p).read()), float).reshape(-1, 3, 3)
def topology(T):
    P = T.reshape(-1, 3); k = np.round(P * 1e7).astype(np.int64)
    u, inv = np.unique(k, axis=0, return_inverse=True); F = inv.ravel().reshape(-1, 3)
    E = np.sort(np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1)
    ue, c = np.unique(E, axis=0, return_counts=True)
    return {"open_edges": int((c == 1).sum()), "nonmanifold": int((c > 2).sum()),
            "genus": (2 - (len(u) - len(ue) + len(F))) / 2,
            "volume_m3": float(np.einsum('ij,ij->i', T[:, 0], np.cross(T[:, 1], T[:, 2])).sum() / 6)}
