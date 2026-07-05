// SYNAPSE · Vivarium — CAD body loader (animated multi-part hybrid).
//
// Loads the real CNC 3018 as its 222 separate parts (re-exported from the source IGES assembly,
// FreeCAD-tessellated, one glTF node per part) so the machine's OWN spindle/carriage/bed move —
// no procedural stand-in. Parts are classified by CAD position into kinematic groups, mounted on
// pivots, coloured, and animated by the render loop. Render-only: motion is cosmetic "machine is
// running" whose intensity is scaled by the real folded state; it never computes fleet state.
//
// Honesty: a *scaled spindle analog* dressing (CLAUDE.md §11), never claimed to be a real CNC. If
// the glb is missing/unparseable, loadCadBody() returns null and createMachine falls back to the
// procedural body — the offline/air-gapped demo never hard-fails.

import * as THREE from "three";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import { mergeGeometries } from "../vendor/BufferGeometryUtils.js";

const MODEL_URL = "/static/vivarium/models/cnc3018_parts.glb";
const SCALE = 0.007; // CAD mm → scene units

// --- TUNE: kinematic classification in CAD space (Y up, mm; verified in-browser) ------------
// The central column (carriage + spindle + Z-stepper) rides the gantry and traverses; its lower
// barrel is the spindle that spins; the slotted table is the bed; everything else is static frame.
const REGION = {
  // carriage column: a box around the spindle stack, above the bed
  carriage: { x: [-40, 70], z: [-245, -150], yMin: 25 },
  // spindle barrel/bit = the lower part of that column (spins about vertical)
  spindleYMax: 100,
  // bed table: the flat slotted plate (thin in Y), low and central
  bed: { x: [-70, 270], z: [-370, -30], y: [-80, -10] },
};

// --- materials: give the CAD model colour (steel frame, dark bed, cyan accents) -------------
const MAT = {
  frame: new THREE.MeshStandardMaterial({ color: 0x9fb6c6, roughness: 0.5, metalness: 0.45, envMapIntensity: 1.1 }),
  rail: new THREE.MeshStandardMaterial({ color: 0xe6eef3, roughness: 0.25, metalness: 0.6, envMapIntensity: 1.2 }),
  bed: new THREE.MeshStandardMaterial({ color: 0x3f5663, roughness: 0.6, metalness: 0.35 }),
  carriage: new THREE.MeshStandardMaterial({ color: 0xc9d6df, roughness: 0.45, metalness: 0.4 }),
  spindle: new THREE.MeshStandardMaterial({ color: 0x1a8aa3, emissive: 0x22d3ee, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.5 }),
};
const DEBUG = false; // when true, colour parts by kinematic group for verification
const DEBUG_COLOR = { frame: 0x8aa0b0, bed: 0xff5555, carriage: 0x35d0a0, spindle: 0xc060ff };

function classify(c, s) {
  const [x, y, z] = c;
  const R = REGION;
  // long horizontal members in the carriage box are structural (X-rails / Z lead-screw) — they
  // stay STATIC frame so the compact head slides along them, not with them.
  const isRail = s[0] > 90 || s[2] > 90;
  if (x >= R.carriage.x[0] && x <= R.carriage.x[1] && z >= R.carriage.z[0] && z <= R.carriage.z[1] && y >= R.carriage.yMin && !isRail) {
    return y <= R.spindleYMax ? "spindle" : "carriage";
  }
  if (x >= R.bed.x[0] && x <= R.bed.x[1] && z >= R.bed.z[0] && z <= R.bed.z[1] && y >= R.bed.y[0] && y <= R.bed.y[1]) {
    return "bed";
  }
  return "frame";
}

// CAD-space center + size of a mesh (geometry-local; unaffected by node transforms).
function cadBounds(mesh) {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  return { c: bb.getCenter(new THREE.Vector3()), s: bb.getSize(new THREE.Vector3()) };
}

// Bake a mesh's world transform into a clean, MERGE-ABLE geometry: position + normal only, so the
// 222 CAD parts (some with UVs, some without) unify to identical attributes. why: mergeGeometries
// requires every input to share the same attribute set + index-ness; non-indexed position/normal is
// the robust common denominator (flat normals read fine as machined metal at fleet zoom).
function bakeMesh(mesh) {
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", mesh.geometry.getAttribute("position").clone());
  if (mesh.geometry.index) g.setIndex(mesh.geometry.index.clone());
  g = g.toNonIndexed();
  g.applyMatrix4(mesh.matrixWorld);
  g.computeVertexNormals();
  return g;
}

export async function loadCadBody() {
  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  } catch (e) {
    console.warn("[vivarium] CAD body unavailable — procedural fallback:", e?.message || e);
    return null;
  }
  const proto = gltf.scene;
  let n = 0;
  proto.traverse((o) => {
    if (o.isMesh) {
      // why: the re-exported glb carries no vertex normals (the OBJ→glb step dropped them), so
      // PBR lighting renders the whole machine black. Recompute once on the shared geometry — all
      // per-node clones inherit it. Without this the model is an unlit silhouette.
      o.geometry.computeVertexNormals();
      o.castShadow = true;
      o.receiveShadow = true;
      n++;
    }
  });
  console.log(`[vivarium] CAD parts loaded — ${n} nodes`);

  return {
    // --- FLEET instancing: merge the real CAD into a few geometries so all 50 machines can share
    // ONE InstancedMesh each (the full 222-part model × 50 ≈ 16 M tris = unrenderable). The static
    // body (frame + bed + carriage) is decimated by dropping sub-`bodyMinSize` fasteners that don't
    // read at fleet zoom; the spindle group is kept whole and RE-CENTRED on its own axis so each
    // instance can spin/stop it (P4 machine-stop). Same centred/floor-dropped/scaled local frame as
    // make(), so instances drop straight onto the roster positions. Returns null geoms if empty.
    buildFleet({ bodyMinSize = 30 } = {}) {
      const scaled = new THREE.Group();
      scaled.add(proto.clone(true));
      scaled.scale.setScalar(SCALE);
      // center on footprint + drop base to floor (identical to make())
      const box0 = new THREE.Box3().setFromObject(scaled);
      const c0 = box0.getCenter(new THREE.Vector3());
      scaled.position.set(-c0.x, -box0.min.y, -c0.z);
      scaled.updateMatrixWorld(true);

      const bodyParts = [], spindleParts = [];
      scaled.traverse((o) => {
        if (!o.isMesh) return;
        const b = cadBounds(o);                 // geometry-local (mm) center + size
        const grp = classify([b.c.x, b.c.y, b.c.z], [b.s.x, b.s.y, b.s.z]);
        if (grp === "spindle") { spindleParts.push(bakeMesh(o)); return; }
        // carriage rides with the head in make(); on the fleet it's static structure -> keep in body.
        if (Math.max(b.s.x, b.s.y, b.s.z) >= bodyMinSize) bodyParts.push(bakeMesh(o));
      });

      const bodyGeo = bodyParts.length ? mergeGeometries(bodyParts, false) : null;
      bodyParts.forEach((g) => g.dispose());

      let spindleGeo = null;
      const spindleOffset = new THREE.Vector3();
      if (spindleParts.length) {
        spindleGeo = mergeGeometries(spindleParts, false);
        spindleParts.forEach((g) => g.dispose());
        spindleGeo.computeBoundingBox();
        const sc = spindleGeo.boundingBox.getCenter(new THREE.Vector3());
        spindleOffset.set(sc.x, 0, sc.z);       // where the spindle sits within the machine footprint
        spindleGeo.translate(-sc.x, 0, -sc.z);  // re-center on its spin axis so instances rotate in place
      }
      return { bodyGeo, spindleGeo, spindleOffset };
    },

    make() {
      // root (scale 1, scene space) holds: a scaled sub-group with the static frame, plus
      // scale-1 pivots that the moving parts are re-attached to (scale baked into each mesh).
      const root = new THREE.Group();
      root.name = "cad-body";
      const scaled = new THREE.Group();
      scaled.add(proto.clone(true));
      scaled.scale.setScalar(SCALE);
      root.add(scaled);

      // center on footprint + drop base to floor (operate on `scaled` so root stays at origin)
      const box0 = new THREE.Box3().setFromObject(root);
      const c0 = box0.getCenter(new THREE.Vector3());
      scaled.position.x -= c0.x;
      scaled.position.z -= c0.z;
      scaled.position.y -= box0.min.y;
      root.updateMatrixWorld(true);

      // per-machine spindle material so each node's spindle can glow its own state colour
      const spindleMat = MAT.spindle.clone();

      // sort meshes by kinematic group and apply colour
      const groups = { frame: [], bed: [], carriage: [], spindle: [] };
      scaled.traverse((o) => {
        if (!o.isMesh) return;
        const b = cadBounds(o);
        const g = classify([b.c.x, b.c.y, b.c.z], [b.s.x, b.s.y, b.s.z]);
        groups[g].push(o);
        o.material = DEBUG
          ? new THREE.MeshStandardMaterial({ color: DEBUG_COLOR[g], roughness: 0.6, metalness: 0.3 })
          : g === "spindle" ? spindleMat : MAT[g];
      });

      // build pivots in scene space. carriage translates; spindle (child of carriage) spins;
      // bed translates. attach() bakes each mesh's world transform (incl. SCALE) into its local.
      const worldCenter = (meshes) => {
        const b = new THREE.Box3();
        meshes.forEach((m) => b.expandByObject(m));
        return b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3());
      };

      const carriagePivot = new THREE.Group();
      carriagePivot.name = "carriage";
      root.add(carriagePivot);
      groups.carriage.forEach((m) => carriagePivot.attach(m));

      const spindleCenter = worldCenter(groups.spindle);
      const spindlePivot = new THREE.Group();
      spindlePivot.name = "spindle";
      spindlePivot.position.copy(spindleCenter); // spin axis through the spindle barrel
      carriagePivot.add(spindlePivot);
      spindlePivot.updateMatrixWorld(true);
      groups.spindle.forEach((m) => spindlePivot.attach(m));

      const bedPivot = new THREE.Group();
      bedPivot.name = "bed";
      root.add(bedPivot);
      groups.bed.forEach((m) => bedPivot.attach(m));

      root.userData.counts = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));

      return {
        group: root,
        anim: {
          spindle: spindlePivot,
          carriage: carriagePivot,
          bed: bedPivot,
          spindleMat,
          carriageBase: carriagePivot.position.clone(),
          bedBase: bedPivot.position.clone(),
        },
      };
    },
  };
}
