// SYNAPSE · Vivarium — procedural 6-axis industrial robot arm (machine-tending).
//
// Shaped to read like a real articulated robot (cf. the user's reference CAD): a ribbed base
// plate, cylindrical base housing, shoulder + elbow castings with side-mounted stepper motors,
// tapered upper-arm / forearm castings, a wrist cluster, and a 3-finger claw. Built as nested
// pivots so one setPose() swings the whole linkage in a single vertical plane (yaw + shoulder +
// elbow + wrist, all kept so the claw can point straight DOWN onto a conveyor). A tip anchor at
// the grasp point lets the choreography parent the carried part to wherever the claw is (no IK).
//
// Swap-ready stand-in for the user's Parasolid arm (.x_t — closed format the open-source toolchain
// can't read). Motion is cosmetic/illustrative, never from the L1–L4 log.

import * as THREE from "three";

const MAT = {
  cast: new THREE.MeshStandardMaterial({ color: 0x9aa7b2, roughness: 0.5, metalness: 0.6, envMapIntensity: 1.0 }),
  castDark: new THREE.MeshStandardMaterial({ color: 0x6e7b86, roughness: 0.55, metalness: 0.65 }),
  motor: new THREE.MeshStandardMaterial({ color: 0x1e262e, roughness: 0.5, metalness: 0.55 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x0e7490, emissive: 0x22d3ee, emissiveIntensity: 0.45, roughness: 0.4, metalness: 0.6 }),
  claw: new THREE.MeshStandardMaterial({ color: 0x4a5762, roughness: 0.45, metalness: 0.8 }),
};

const L_UPPER = 1.15;
const L_FORE = 0.92;

const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; parent.add(m); return m;
};
// a stepper-motor block + boss, mounted on the side of a joint (the NEMA cue from the reference)
function motor(parent, x, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
  add(g, new THREE.BoxGeometry(0.26, 0.26, 0.3), MAT.motor, 0, 0, 0);
  add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.1, 12), MAT.castDark, 0, 0, 0.2, Math.PI / 2);
  return g;
}

export function createRobotArm() {
  const group = new THREE.Group();
  group.name = "robot-arm";

  // --- base: bolted square plate + triangular gussets + cylindrical housing ---
  add(group, new THREE.BoxGeometry(0.95, 0.06, 0.95), MAT.castDark, 0, 0.03, 0, 0, 0, 0).receiveShadow = true;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    add(group, new THREE.BoxGeometry(0.06, 0.16, 0.34), MAT.castDark, Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3, 0, -a, 0);
  }
  add(group, new THREE.CylinderGeometry(0.34, 0.4, 0.34, 28), MAT.cast, 0, 0.23, 0);
  add(group, new THREE.TorusGeometry(0.3, 0.02, 8, 28), MAT.accent, 0, 0.4, 0, Math.PI / 2);

  // --- J1 yaw turret ---
  const yaw = new THREE.Object3D(); yaw.position.y = 0.4; group.add(yaw);
  add(yaw, new THREE.CylinderGeometry(0.3, 0.32, 0.28, 28), MAT.cast, 0, 0.14, 0);

  // --- J2 shoulder (pitch) with side stepper ---
  const shoulder = new THREE.Object3D(); shoulder.position.y = 0.32; yaw.add(shoulder);
  add(shoulder, new THREE.BoxGeometry(0.46, 0.4, 0.5), MAT.cast, 0, 0.05, 0); // shoulder casting
  add(shoulder, new THREE.CylinderGeometry(0.19, 0.19, 0.52, 24), MAT.castDark, 0, 0.05, 0, Math.PI / 2); // pitch hub
  motor(shoulder, 0, 0.42, 0);
  // upper-arm: tapered casting extending +Y
  add(shoulder, new THREE.CylinderGeometry(0.12, 0.17, L_UPPER, 20), MAT.cast, 0, 0.05 + L_UPPER / 2, 0);

  // --- J3 elbow (pitch) with side stepper ---
  const elbow = new THREE.Object3D(); elbow.position.y = 0.05 + L_UPPER; shoulder.add(elbow);
  add(elbow, new THREE.CylinderGeometry(0.15, 0.15, 0.42, 22), MAT.castDark, 0, 0, 0, Math.PI / 2); // elbow hub
  motor(elbow, 0, 0.34, 0);
  add(elbow, new THREE.CylinderGeometry(0.09, 0.13, L_FORE, 18), MAT.cast, 0, L_FORE / 2, 0); // forearm taper

  // --- J5 wrist (pitch) cluster ---
  const wrist = new THREE.Object3D(); wrist.position.y = L_FORE; elbow.add(wrist);
  add(wrist, new THREE.CylinderGeometry(0.11, 0.11, 0.26, 18), MAT.castDark, 0, 0, 0, Math.PI / 2);
  add(wrist, new THREE.CylinderGeometry(0.08, 0.08, 0.18, 16), MAT.cast, 0, 0.16, 0);
  add(wrist, new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20), MAT.castDark, 0, 0.26, 0); // tool flange

  // --- 3-finger claw: fingers splay 120° and curve inward; close = rotate inward ---
  const claw = new THREE.Object3D(); claw.position.y = 0.28; wrist.add(claw);
  const fingers = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const pivot = new THREE.Object3D();
    pivot.position.set(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08);
    pivot.rotation.y = -a; // orient finger outward along +X of pivot
    claw.add(pivot);
    // proximal (angled out) + distal (curved back in) — knuckle look
    add(pivot, new THREE.CylinderGeometry(0.025, 0.03, 0.22, 10), MAT.claw, 0.04, 0.1, 0, 0, 0, -0.5);
    const tip = new THREE.Object3D(); tip.position.set(0.13, 0.19, 0); pivot.add(tip);
    add(tip, new THREE.CylinderGeometry(0.02, 0.025, 0.18, 10), MAT.claw, -0.02, 0.08, 0, 0, 0, 0.7);
    fingers.push(pivot);
  }
  // grasp anchor (where a held part sits, between the finger tips)
  const tipAnchor = new THREE.Object3D(); tipAnchor.position.y = 0.24; claw.add(tipAnchor);

  function setPose({ yaw: y = 0, shoulder: s = 0, elbow: e = 0, wrist: w = 0 } = {}) {
    yaw.rotation.y = y; shoulder.rotation.z = s; elbow.rotation.z = e; wrist.rotation.z = w;
  }
  // open in [0..1]: 0 = clamped, 1 = splayed wide
  function gripper(open) {
    const close = (1 - THREE.MathUtils.clamp(open, 0, 1)) * 0.6;
    fingers.forEach((f) => (f.rotation.z = close));
  }
  function tipWorld(out = new THREE.Vector3()) { tipAnchor.getWorldPosition(out); return out; }

  setPose({ shoulder: -0.5, elbow: 0.9, wrist: -0.4 });
  gripper(1);
  return { group, setPose, gripper, tipWorld, tip: tipAnchor, joints: { yaw, shoulder, elbow, wrist } };
}
