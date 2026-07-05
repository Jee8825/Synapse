// SYNAPSE · Vivarium — industrial environment dressing (static).
//
// Turns the dark void into a shop-floor bay: a concrete working slab with painted safety lanes,
// perimeter back walls with cyan trim, overhead truss light-rigs, safety railings, and a few
// corner props. Purely cosmetic staging — no state, no log coupling. Keeps the pale-cyan SYNAPSE
// aesthetic (deep slate + cyan accents, amber = safety) so it reads as one product with the 2D view.

import * as THREE from "three";
import { COLORS } from "./theme.js";

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x16222e, roughness: 0.95, metalness: 0.05 }),
  lane: new THREE.MeshStandardMaterial({ color: COLORS.cyanDim, emissive: COLORS.cyan, emissiveIntensity: 0.35, roughness: 0.6 }),
  hazard: new THREE.MeshStandardMaterial({ color: COLORS.stale, emissive: COLORS.stale, emissiveIntensity: 0.2, roughness: 0.6 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x0e1b27, roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide }),
  trim: new THREE.MeshStandardMaterial({ color: COLORS.cyanDim, emissive: COLORS.cyan, emissiveIntensity: 0.5, roughness: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x2a3742, roughness: 0.6, metalness: 0.7 }),
  lightStrip: new THREE.MeshStandardMaterial({ color: COLORS.white, emissive: 0xbfeff8, emissiveIntensity: 1.4, roughness: 0.4 }),
  rail: new THREE.MeshStandardMaterial({ color: COLORS.stale, emissive: COLORS.stale, emissiveIntensity: 0.18, roughness: 0.5, metalness: 0.4 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x355063, roughness: 0.7, metalness: 0.3 }),
};

const box = (g, w, h, d, mat, x, y, z, { cast = false, rec = false } = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = rec; g.add(m); return m;
};

export function createEnvironment(scene, { cellCenter = [0, 0, 7.2] } = {}) {
  const g = new THREE.Group();
  g.name = "environment";
  const [cx, , cz] = cellCenter; // the robot-cell station anchor — its hazard zone + railing track it

  // --- concrete working slab (over the dark base floor) + painted lanes ---
  const slab = box(g, 40, 0.04, 34, MAT.concrete, 0, -0.01, 1, { rec: true });
  // longitudinal aisle lanes (cyan) running along X
  for (const z of [-7.5, 10.5]) box(g, 34, 0.02, 0.16, MAT.lane, 0, 0.02, z);
  // a hazard-bordered safety zone AROUND the robot cell (wherever the station is placed)
  for (const [w, h, d, x, z] of [[12, 0.02, 0.18, cx, cz - 4.2], [12, 0.02, 0.18, cx, cz + 4.2], [0.18, 0.02, 8.4, cx - 6, cz], [0.18, 0.02, 8.4, cx + 6, cz]])
    box(g, w, h, d, MAT.hazard, x, 0.02, z);

  // --- perimeter walls (far out) with a cyan trim strip + base kick ---
  const wallH = 7;
  const walls = [
    { w: 40, x: 0, z: -15.5, ry: 0 },          // back
    { w: 34, x: -19.5, z: 1, ry: Math.PI / 2 }, // left
    { w: 34, x: 19.5, z: 1, ry: Math.PI / 2 },  // right
  ];
  for (const wdef of walls) {
    box(g, wdef.w, wallH, 0.3, MAT.wall, wdef.x, wallH / 2, wdef.z).rotation.y = wdef.ry;
    const trim = box(g, wdef.w, 0.18, 0.34, MAT.trim, wdef.x, 2.4, wdef.z); trim.rotation.y = wdef.ry;
    const kick = box(g, wdef.w, 0.5, 0.36, MAT.steel, wdef.x, 0.25, wdef.z); kick.rotation.y = wdef.ry;
  }

  // --- overhead truss light-rigs (cross-beams + emissive strips) ---
  // why emissive strips (not real area lights): they read as "lights on" without the
  // RectAreaLight uniforms-lib dependency or extra shadow-casting lights in the budget.
  for (const z of [-6, 4, 12]) {
    box(g, 34, 0.25, 0.25, MAT.steel, 0, 8.6, z, { cast: true });
    box(g, 30, 0.12, 0.5, MAT.lightStrip, 0, 8.45, z);
  }
  // a few vertical truss legs so the rigs read as a gantry, not floating
  for (const x of [-15, 15]) for (const z of [-6, 12]) box(g, 0.2, 8.6, 0.2, MAT.steel, x, 4.3, z, { cast: true });

  // --- safety railing around the cell (posts + top rail, amber) — tracks the station anchor ---
  const railY = 1.0, zN = cz - 3.8, zF = cz + 3.8, xL = cx - 5.6, xR = cx + 5.6;
  const post = (x, z) => box(g, 0.08, railY, 0.08, MAT.rail, x, railY / 2, z, { cast: true });
  for (let x = xL; x <= xR + 0.01; x += 2.8) { post(x, zN); }
  box(g, xR - xL, 0.06, 0.06, MAT.rail, (xL + xR) / 2, railY, zN); // front top rail
  for (const x of [xL, xR]) { post(x, (zN + zF) / 2); box(g, 0.06, 0.06, zF - zN, MAT.rail, x, railY, (zN + zF) / 2); } // side rails

  // --- corner props: stacked pallets/crates ---
  for (const [bx, bz] of [[-16, 11], [16, -10]]) {
    box(g, 1.6, 0.2, 1.2, MAT.steel, bx, 0.1, bz, { cast: true, rec: true });
    box(g, 1.3, 0.9, 1.0, MAT.crate, bx, 0.65, bz, { cast: true });
    box(g, 1.0, 0.7, 0.9, MAT.crate, bx + 0.1, 1.45, bz, { cast: true });
  }

  scene.add(g);
  return { group: g };
}
