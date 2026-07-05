"""Vivarium CAD asset pipeline (step 1 of 2): IGES assembly → per-part OBJ + metadata.

Re-exports the CNC 3018 source CAD (a ~222-part IGES *assembly*) as a single Wavefront OBJ with
one ``g`` group per part, plus a JSON of per-part bounding boxes. why: an earlier conversion
flattened the assembly into one STL/glb mesh, which cannot animate. Preserving the parts lets the
3D twin (``dashboard/static/vivarium``) move the machine's OWN spindle and carriage instead of a
procedural stand-in. Step 2 (``vivarium_obj_to_glb.py``) turns this OBJ into a multi-node glb.

This step runs under **FreeCAD's bundled Python** (it imports ``FreeCAD``/``Part``/``Mesh``/
``MeshPart``), NOT the project venv. On macOS:

    /Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd \\
        scripts/vivarium_export_cad_parts.py \\
        --src "/path/to/CNC 3018.IGS" \\
        --out-obj build/cnc_parts.obj --out-json build/cnc_parts.json

Args may also be supplied via env vars (CNC_IGES / CNC_OUT_OBJ / CNC_OUT_JSON) — handy because
some freecadcmd builds swallow CLI flags.

The resulting model is a *scaled spindle analog* dressing (CLAUDE.md §11), never a real CNC, and
the final glb is git-ignored (``dashboard/static/vivarium/models/``) until the GrabCAD model's
license/attribution is cleared.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import FreeCAD  # noqa: E402  — all four are provided by the freecadcmd runtime
import Mesh  # noqa: E402
import MeshPart  # noqa: E402
import Part  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="IGES assembly -> per-part OBJ + metadata JSON")
    ap.add_argument("--src", default=os.environ.get("CNC_IGES", ""), help="source IGES (.igs/.iges) file")
    ap.add_argument("--out-obj", default=os.environ.get("CNC_OUT_OBJ", "build/cnc_parts.obj"))
    ap.add_argument("--out-json", default=os.environ.get("CNC_OUT_JSON", "build/cnc_parts.json"))
    ap.add_argument("--deflection", type=float, default=0.3, help="linear tessellation tolerance (mm)")
    ap.add_argument("--angular", type=float, default=0.6, help="angular tessellation tolerance (rad)")
    # parse_known_args: tolerate any flags freecadcmd injects ahead of ours.
    args, _ = ap.parse_known_args()

    if not args.src:
        print("error: pass --src /path/to/CNC.IGS (or set CNC_IGES)")
        return 2

    out_obj = Path(args.out_obj)
    out_json = Path(args.out_json)
    out_obj.parent.mkdir(parents=True, exist_ok=True)
    out_json.parent.mkdir(parents=True, exist_ok=True)

    doc = FreeCAD.newDocument("cnc")
    Part.insert(args.src, doc.Name)  # IGES importer (FreeCAD.open treats .igs as a project file)
    doc.recompute()
    print("objects:", len(doc.Objects), flush=True)

    mesh_objs = []
    meta: list[dict] = []
    for idx, obj in enumerate(list(doc.Objects)):
        shape = getattr(obj, "Shape", None)
        if shape is None or not shape.Faces:
            continue
        try:
            mesh = MeshPart.meshFromShape(
                Shape=shape,
                LinearDeflection=args.deflection,
                AngularDeflection=args.angular,
                Relative=False,
            )
        except Exception as exc:  # noqa: BLE001 — log + skip a bad part, don't abort the run
            print("skip", obj.Name, exc, flush=True)
            continue
        if mesh.CountFacets == 0:
            continue
        # why p%03d: a stable, order-based node name the JS loader groups by position (the IGES
        # part labels are just sequential numbers and carry no kinematic meaning).
        name = "p%03d" % idx
        feature = doc.addObject("Mesh::Feature", name)
        feature.Mesh = mesh
        feature.Label = name  # becomes the OBJ ``g`` group name
        mesh_objs.append(feature)
        bb = shape.BoundBox
        meta.append({
            "name": name,
            "ctr": [round(bb.Center.x, 1), round(bb.Center.y, 1), round(bb.Center.z, 1)],
            "size": [round(bb.XLength, 1), round(bb.YLength, 1), round(bb.ZLength, 1)],
            "ntri": mesh.CountFacets,
        })

    print("meshed parts:", len(mesh_objs), flush=True)
    Mesh.export(mesh_objs, str(out_obj))  # one ``g <Label>`` group per part
    out_json.write_text(json.dumps(meta))
    print("wrote", out_obj, "and", out_json, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
