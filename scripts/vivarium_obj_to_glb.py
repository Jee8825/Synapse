"""Vivarium CAD asset pipeline (step 2 of 2): per-part OBJ → multi-node glb.

Parses the grouped OBJ from step 1 (``vivarium_export_cad_parts.py``) and writes a glTF binary
(.glb) with **one node per part**, so the 3D twin can mount the spindle/carriage on their own
pivots and animate them. why a hand-rolled parser: trimesh's OBJ loader collapses ``g`` groups
into a single mesh, losing the part split we need.

Two correctness steps that bit us in testing, baked in here:
- ``fix_normals`` — FreeCAD's OBJ winding is inconsistent; without this the glTF faces light wrong.
- the glb still ships no vertex normals, so the viewer recomputes them on load (see
  ``dashboard/static/vivarium/src/cadBody.js``); don't be surprised the model is black without it.

Runs under any Python with ``trimesh`` (plus ``scipy``/``networkx`` for ``fix_normals``). It is a
one-off authoring tool, NOT a project runtime dep, so it is intentionally absent from
``requirements.txt`` — install into a throwaway venv:

    uv venv /tmp/cncenv && uv pip install --python /tmp/cncenv/bin/python trimesh scipy networkx
    /tmp/cncenv/bin/python scripts/vivarium_obj_to_glb.py \\
        --in build/cnc_parts.obj \\
        --out dashboard/static/vivarium/models/cnc3018_parts.glb

The output lives in the git-ignored ``models/`` dir; clear the GrabCAD model's license before
committing the asset.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import trimesh


def parse_grouped_obj(path: Path) -> tuple[np.ndarray, dict[str, list[tuple[int, int, int]]]]:
    """Return (global vertices, {group_name: [triangle vertex-index triples]}).

    OBJ shares one global 1-based vertex list across all groups; faces are ``f v//vn`` (we keep
    only the vertex index). Faces are fan-triangulated defensively though FreeCAD emits triangles.
    """
    verts: list[tuple[float, float, float]] = []
    groups: dict[str, list[tuple[int, int, int]]] = {}
    cur: str | None = None
    with path.open() as fh:
        for line in fh:
            if line.startswith("v "):
                _, x, y, z = line.split()
                verts.append((float(x), float(y), float(z)))
            elif line.startswith("g "):
                cur = line[2:].strip()
                groups[cur] = []
            elif line.startswith("f ") and cur is not None:
                idx = [int(tok.split("//")[0]) - 1 for tok in line.split()[1:]]
                for k in range(1, len(idx) - 1):
                    groups[cur].append((idx[0], idx[k], idx[k + 1]))
    return np.asarray(verts, dtype=np.float64), groups


def main() -> int:
    ap = argparse.ArgumentParser(description="grouped OBJ -> multi-node glb")
    ap.add_argument("--in", dest="src", required=True, help="grouped OBJ from step 1")
    ap.add_argument("--out", required=True, help="output .glb path")
    args = ap.parse_args()

    verts, groups = parse_grouped_obj(Path(args.src))
    print("global verts:", len(verts), "groups:", len(groups))

    scene = trimesh.Scene()
    empty = 0
    for name, faces in groups.items():
        if not faces:
            empty += 1
            continue
        f = np.asarray(faces, dtype=np.int64)
        used = np.unique(f)  # per-group vertex remap so each node carries only its own verts
        remap = {int(g): i for i, g in enumerate(used)}
        fv = np.vectorize(remap.__getitem__)(f)
        mesh = trimesh.Trimesh(vertices=verts[used], faces=fv, process=True)
        mesh.fix_normals(multibody=False)  # consistent + outward winding for correct lighting
        scene.add_geometry(mesh, geom_name=name, node_name=name)

    print("scene geometries:", len(scene.geometry), "empty groups skipped:", empty)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    glb = scene.export(file_type="glb")
    out.write_bytes(glb)
    print("wrote", out, len(glb), "bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
