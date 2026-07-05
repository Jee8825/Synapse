// SYNAPSE · Vivarium — fleet-scale robot-tended cells (25 six-axis arms + 50 belt conveyors), INSTANCED.
//
// The 3-node twin builds one detailed cell (cell.js: ~30-mesh arm + two conveyors). Doing that 25×
// naively = thousands of draw calls = choppy. So here each repeated PART is one InstancedMesh across
// all cells, and a shared forward-kinematics chain poses every arm from its own phase — the whole
// 25-cell rig is ~18 draw calls, so it renders detailed AND smooth (60 fps). The geometry is HIGH
// detail (smooth high-segment castings + CapsuleGeometry arm links + a spherical wrist + a 3-finger
// gripper + belt conveyors with head/tail pulleys and scrolling cleats), just merged per kinematic
// segment so the InstancedMesh count stays tiny.
//
// Arrangement mirrors the real CNC machine-tending cell (research: an articulated robot centred in
// front of its 2 CNCs, infeed conveyor one side / outfeed the other, linear in-one-side-out-the-
// other flow — AMD/KUKA/Universal-Robots tending-cell guides): one 6-axis arm per cell tends the
// cell's 2 CNCs, flanked by an infeed + outfeed belt conveyor, on the same 25-cell grid the CNCs
// stand on. 25 arms · 50 belt conveyors · 50 CNCs = "one robot per two machines".
//
// 6-axis anatomy modelled (standard articulated arm): J1 waist (yaw) → J2 shoulder + lower arm →
// J3 elbow + forearm → J4/J5/J6 spherical wrist → gripper. J1–J3 position the wrist centre; the
// wrist orients the tool (here derived so the gripper stays vertical over the belt).
//
// HONESTY: the tend motion + belt run + part flow are COSMETIC ("the line is running"), NOT from the
// L1-L4 log — exactly like the 3-node cell + the data-flow pulses. Flagged illustrative in the legend.

import * as THREE from "three";
import { mergeGeometries } from "../vendor/BufferGeometryUtils.js";
import { cellRoster, MACH_DX } from "./floorLayout.js";

const SCALE = 0.6;                 // arm scale so a full-size arm fits the cell footprint
const L_UPPER = 1.15, L_FORE = 0.92;
const CONV_X = 2.35, CONV_L = 2.5, CONV_W = 0.74, CONV_TOP = 0.56; // conveyor placement (world units)
const CELL_FRONT = 0.7;            // arm/conveyor stand this far in front of the 2 CNCs (+Z)
const CLEATS_PER = 6;              // belt cleats per conveyor (scroll to show the belt running)

const MAT = {
  // brushed-steel arm body + dark cast joints + amber joint motors + a cyan accent ring (SYNAPSE aesthetic)
  body:   new THREE.MeshStandardMaterial({ color: 0x9aa7b2, roughness: 0.42, metalness: 0.68, envMapIntensity: 1.1 }),
  joint:  new THREE.MeshStandardMaterial({ color: 0x39434d, roughness: 0.5, metalness: 0.72 }),
  motor:  new THREE.MeshStandardMaterial({ color: 0xd98a17, roughness: 0.45, metalness: 0.42, emissive: 0xd98a17, emissiveIntensity: 0.16 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.34, metalness: 0.5, emissive: 0x22d3ee, emissiveIntensity: 0.55 }),
  // belt conveyor: steel frame + dark rubber belt + machined end pulleys + dark cleats + amber motor
  frame:  new THREE.MeshStandardMaterial({ color: 0x37454f, roughness: 0.48, metalness: 0.8, envMapIntensity: 1.0 }),
  belt:   new THREE.MeshStandardMaterial({ color: 0x141a1f, roughness: 0.94, metalness: 0.06 }),
  pulley: new THREE.MeshStandardMaterial({ color: 0x8b98a3, roughness: 0.32, metalness: 0.95, envMapIntensity: 1.2 }),
  cleat:  new THREE.MeshStandardMaterial({ color: 0x252c33, roughness: 0.7, metalness: 0.3 }),
  part:   new THREE.MeshStandardMaterial({ color: 0xaebcc7, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.1 }),
};

// --- geometry helpers: bake a shape's local transform, then merge a list into ONE geometry -------
const _mm = new THREE.Matrix4();
const _qq = new THREE.Quaternion();
const _ee = new THREE.Euler();
const _vv = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

function bake(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.clone();
  _qq.setFromEuler(_ee.set(rx, ry, rz));
  _mm.compose(_vv.set(x, y, z), _qq, _one);
  g.applyMatrix4(_mm);
  geo.dispose();
  return g;
}
function mergeSpecs(specs) {
  if (!specs.length) return null;
  return mergeGeometries(specs.map((s) => bake(...s)), false);
}

// --- arm segment geometries (each in ITS joint's local frame): light body / dark joint / amber motor
function armSegments() {
  const CYL = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);
  const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const CAP = (r, len, cs = 6, rs = 18) => new THREE.CapsuleGeometry(r, len, cs, rs); // smooth rounded link
  const TOR = (r, t, rs = 22) => new THREE.TorusGeometry(r, t, 12, rs);
  const SPH = (r, s = 20) => new THREE.SphereGeometry(r, s, s);

  // ---- base (static, arm-origin frame): bolted pedestal + flange + cable box ----
  const baseL = [
    [CYL(0.3, 0.44, 0.52, 32), 0, 0.3, 0],           // tapered pedestal
    [CYL(0.5, 0.52, 0.1, 40), 0, 0.05, 0],           // wide foot flange
    [SPH(0.32, 24), 0, 0.56, 0],                     // rounded shoulder-mount dome
  ];
  const baseD = [
    [TOR(0.44, 0.035, 40), 0, 0.1, 0, Math.PI / 2],  // bolt ring on the flange
    [BOX(0.34, 0.3, 0.26), 0, 0.34, -0.34],          // cable/controller box at the back
    [CYL(0.06, 0.06, 0.12, 8), 0.22, 0.5, -0.34, Math.PI / 2, 0, Math.PI / 2], // cable conduit stub
  ];
  for (let i = 0; i < 8; i++) {                       // foot bolts around the flange
    const a = (i / 8) * Math.PI * 2;
    baseD.push([CYL(0.03, 0.03, 0.06, 8), Math.cos(a) * 0.44, 0.11, Math.sin(a) * 0.44]);
  }
  const baseA = [[TOR(0.34, 0.022, 28), 0, 0.62, 0, Math.PI / 2]]; // cyan accent ring at the J1 seam

  // ---- J1 waist / yaw turret (yaw frame) ----
  const yawL = [
    [CYL(0.31, 0.33, 0.3, 32), 0, 0.15, 0],
    [SPH(0.3, 24), 0, 0.28, 0],
  ];

  // ---- J2 shoulder + LOWER ARM (shoulder frame): yoke casting + pitch drum + smooth capsule link ----
  const shL = [
    [BOX(0.44, 0.42, 0.34), 0, 0.06, 0],             // shoulder yoke body
    [CAP(0.145, L_UPPER - 0.34), 0, 0.06 + L_UPPER / 2, 0], // lower arm — rounded capsule (smooth)
    [SPH(0.15, 18), 0, 0.06 + L_UPPER, 0],           // elbow-end knuckle
  ];
  const shD = [
    [CYL(0.2, 0.2, 0.56, 28), 0, 0.06, 0, Math.PI / 2], // J2 pitch drum (axis across Z)
  ];
  const shM = [
    [CYL(0.17, 0.17, 0.14, 20), 0, 0.06, 0.4, Math.PI / 2],  // J2 servo motor (one side)
    [CYL(0.055, 0.055, 0.08, 12), 0, 0.06, 0.55, Math.PI / 2],
  ];

  // ---- J3 elbow + FOREARM (elbow frame): elbow drum + tapered capsule forearm + wrist roll motor ----
  const elL = [
    [CAP(0.105, L_FORE - 0.24), 0, L_FORE / 2, 0],   // forearm — rounded capsule
    [BOX(0.26, 0.26, 0.3), 0, 0.02, 0],              // elbow body
  ];
  const elD = [
    [CYL(0.16, 0.16, 0.46, 24), 0, 0.02, 0, Math.PI / 2], // J3 elbow drum
  ];
  const elM = [
    [CYL(0.14, 0.14, 0.13, 18), 0, 0.02, 0.36, Math.PI / 2], // J3 servo motor
  ];

  // ---- J4/J5/J6 spherical wrist + gripper (wrist frame) ----
  const wrL = [
    [CYL(0.09, 0.1, 0.2, 20), 0, 0.13, 0],           // J4 wrist-roll tube
    [SPH(0.115, 18), 0, 0.3, 0],                     // J5 spherical wrist
    [CYL(0.1, 0.1, 0.05, 24), 0, 0.4, 0],            // J6 tool flange
    [BOX(0.16, 0.1, 0.16), 0, 0.46, 0],              // gripper base plate
  ];
  const wrD = [
    [CYL(0.12, 0.12, 0.26, 20), 0, 0.3, 0, Math.PI / 2], // J5 pitch hub
  ];
  // 3-finger gripper: each finger = a knuckle (dark) + a tapered tip (body), splayed and pointing down
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fx = Math.cos(a) * 0.1, fz = Math.sin(a) * 0.1;
    wrD.push([BOX(0.05, 0.07, 0.05), fx, 0.52, fz]);                     // knuckle
    wrL.push([CYL(0.02, 0.03, 0.2, 8), fx * 1.4, 0.62, fz * 1.4,        // finger tip (splayed down)
      Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45]);
  }

  return {
    base:     { l: mergeSpecs(baseL), d: mergeSpecs(baseD), m: null, a: mergeSpecs(baseA) },
    yaw:      { l: mergeSpecs(yawL), d: null, m: null },
    shoulder: { l: mergeSpecs(shL), d: mergeSpecs(shD), m: mergeSpecs(shM) },
    elbow:    { l: mergeSpecs(elL), d: mergeSpecs(elD), m: mergeSpecs(elM) },
    wrist:    { l: mergeSpecs(wrL), d: mergeSpecs(wrD), m: null },
  };
}

// --- belt-conveyor frame geometry (local: travel along X), merged; belt/pulleys/cleats separate ----
function beltFrameGeo() {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const specs = [];
  // two C-channel side beams with a top flange, running the belt length
  for (const z of [CONV_W / 2, -CONV_W / 2]) {
    specs.push([B(CONV_L, 0.16, 0.06), 0, CONV_TOP - 0.04, z]);       // web
    specs.push([B(CONV_L, 0.05, 0.12), 0, CONV_TOP + 0.05, z]);       // top flange
    specs.push([B(CONV_L, 0.05, 0.03), 0, CONV_TOP + 0.2, z]);        // side guard rail
  }
  // cross members near the ends
  for (const cx of [-CONV_L / 2 + 0.25, CONV_L / 2 - 0.25])
    specs.push([B(0.08, 0.08, CONV_W), cx, CONV_TOP - 0.06, 0]);
  // braced legs on foot plates
  for (const lx of [-CONV_L / 2 + 0.35, CONV_L / 2 - 0.35]) {
    for (const lz of [CONV_W / 2 - 0.05, -CONV_W / 2 + 0.05]) {
      specs.push([B(0.09, CONV_TOP, 0.09), lx, CONV_TOP / 2, lz]);
      specs.push([B(0.24, 0.04, 0.24), lx, 0.02, lz]);                // foot plate
    }
    specs.push([B(0.06, 0.06, CONV_W - 0.05), lx, 0.2, 0]);           // leg cross-brace
  }
  return mergeSpecs(specs);
}

export function createFleetCells(scene, { nCells = 25 } = {}) {
  const group = new THREE.Group();
  group.name = "fleetCells";
  const cells = cellRoster(nCells);
  const nConv = nCells * 2;
  const nPulley = nConv * 2;                // head + tail pulley per conveyor
  const nCleat = nConv * CLEATS_PER;

  // ---- instanced belt conveyors: frame · belt surface · end pulleys · cleats · drive motor · part
  const frames = new THREE.InstancedMesh(beltFrameGeo(), MAT.frame, nConv);
  frames.castShadow = frames.receiveShadow = true;
  const belts = new THREE.InstancedMesh(new THREE.BoxGeometry(CONV_L - 0.28, 0.05, CONV_W - 0.08), MAT.belt, nConv);
  belts.receiveShadow = true;
  const pulleyGeo = new THREE.CylinderGeometry(0.15, 0.15, CONV_W - 0.04, 20).rotateX(Math.PI / 2); // axis across Z
  const pulleys = new THREE.InstancedMesh(pulleyGeo, MAT.pulley, nPulley);
  const cleats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, CONV_W - 0.14), MAT.cleat, nCleat);
  const motors = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.28, 0.24), MAT.motor, nConv);
  const partGeo = new THREE.BoxGeometry(0.34, 0.09, 0.24);
  const partsMesh = new THREE.InstancedMesh(partGeo, MAT.part, nConv);
  partsMesh.castShadow = true;

  const pulleyBase = new Array(nPulley);   // world anchor for each pulley (spun each frame)
  const cleatBase = new Array(nCleat);     // { cx, cz } belt-start anchor for each cleat (scrolled)
  const partBase = [];                     // { cx, cz, phase } travelling blank per conveyor
  let ci = 0, pi = 0, ki = 0;
  for (const { x, z } of cells) {
    const cz = z + CELL_FRONT;
    for (const dir of [-1, 1]) {           // infeed (−X side), outfeed (+X side)
      const cx = x + dir * CONV_X;
      _mm.compose(_vv.set(cx, 0, cz), _qq.identity(), _one);
      frames.setMatrixAt(ci, _mm);
      _mm.compose(_vv.set(cx, CONV_TOP, cz), _qq.identity(), _one);
      belts.setMatrixAt(ci, _mm);
      _mm.compose(_vv.set(cx + (CONV_L / 2 - 0.02), CONV_TOP - 0.12, cz + CONV_W / 2 + 0.14), _qq.identity(), _one);
      motors.setMatrixAt(ci, _mm);          // drive motor at the head pulley
      // head + tail pulleys
      for (const end of [-1, 1]) {
        pulleyBase[pi] = { x: cx + end * (CONV_L / 2 - 0.14), y: CONV_TOP - 0.02, z: cz };
        _mm.compose(_vv.set(pulleyBase[pi].x, pulleyBase[pi].y, pulleyBase[pi].z), _qq.identity(), _one);
        pulleys.setMatrixAt(pi, _mm); pi++;
      }
      // cleats spread along the belt (scroll in update)
      for (let k = 0; k < CLEATS_PER; k++) { cleatBase[ki] = { cx, cz, k }; ki++; }
      partBase.push({ cx, cz, phase: (ci * 0.137) % 1 });
      ci++;
    }
  }
  frames.instanceMatrix.needsUpdate = true;
  belts.instanceMatrix.needsUpdate = true;
  motors.instanceMatrix.needsUpdate = true;
  pulleys.instanceMatrix.needsUpdate = true;
  group.add(frames, belts, pulleys, cleats, motors, partsMesh);

  // ---- instanced 6-axis arms (base static; yaw/shoulder/elbow/wrist posed per frame) ----
  const seg = armSegments();
  const armOrigin = cells.map(({ x, z }) => new THREE.Vector3(x, 0, z + CELL_FRONT));
  const M0 = armOrigin.map((o) => new THREE.Matrix4().compose(o, _qq.identity(), _vv.set(SCALE, SCALE, SCALE).clone()));

  const parts = {};
  const makeInst = (key, geo, mat, cast = true) => {
    if (!geo) return;
    parts[key] = new THREE.InstancedMesh(geo, mat, nCells);
    parts[key].castShadow = cast;
    group.add(parts[key]);
  };
  for (const [name, mats] of Object.entries(seg)) {
    makeInst(name + "L", mats.l, MAT.body);
    makeInst(name + "D", mats.d, MAT.joint);
    makeInst(name + "M", mats.m, MAT.motor);
    makeInst(name + "A", mats.a, MAT.accent, false);
  }
  // static segments (base + its accent ring) -> set once
  for (let i = 0; i < nCells; i++) {
    parts.baseL?.setMatrixAt(i, M0[i]);
    parts.baseD?.setMatrixAt(i, M0[i]);
    parts.baseA?.setMatrixAt(i, M0[i]);
  }
  ["baseL", "baseD", "baseA"].forEach((k) => parts[k] && (parts[k].instanceMatrix.needsUpdate = true));

  scene.add(group);

  // --- arm pose keyframes: (shoulder, elbow); wrist derived so the claw points straight down -------
  // home → reach the infeed (−X) → grip + lift → carry over a CNC → reach the outfeed (+X) → place → home
  const wristFor = (s, e) => Math.PI - s - e;
  const K = [
    [0.2, 0.55], [1.0, 0.2], [0.75, 0.5], [-0.1, 0.55], [-0.45, -0.22], [-1.0, -0.2], [-0.7, 0.4], [0.2, 0.55],
  ];
  const ease = (k) => k * k * (3 - 2 * k);
  function poseAt(p) {                       // p in [0,1) around the tend cycle
    const f = p * (K.length - 1);
    const i = Math.min(K.length - 2, Math.floor(f));
    const k = ease(f - i);
    const s = K[i][0] + (K[i + 1][0] - K[i][0]) * k;
    const e = K[i][1] + (K[i + 1][1] - K[i][1]) * k;
    return { s, e, w: wristFor(s, e) };
  }

  // temp matrices for the FK chain (reused across arms; no per-frame alloc)
  const B = new THREE.Matrix4();
  const mYaw = new THREE.Matrix4(), mSh = new THREE.Matrix4();
  const mEl = new THREE.Matrix4(), mWr = new THREE.Matrix4();
  const local = (ty, rotZ = 0, rotY = 0) => {
    _ee.set(0, rotY, rotZ); _qq.setFromEuler(_ee);
    return B.compose(_vv.set(0, ty, 0), _qq, _one);
  };
  const setSeg = (name, i, M) => {
    parts[name + "L"]?.setMatrixAt(i, M);
    parts[name + "D"]?.setMatrixAt(i, M);
    parts[name + "M"]?.setMatrixAt(i, M);
  };

  const CYCLE = 7.5; // seconds per tend cycle
  function update(dt, now) {
    // belt "runs": end pulleys spin about their own axis (baked axis = Z)
    for (let i = 0; i < nPulley; i++) {
      const b = pulleyBase[i];
      _qq.setFromEuler(_ee.set(0, 0, now * 3.4));
      _mm.compose(_vv.set(b.x, b.y, b.z), _qq, _one);
      pulleys.setMatrixAt(i, _mm);
    }
    pulleys.instanceMatrix.needsUpdate = true;
    // cleats scroll along X (wrap) so the belt surface visibly moves
    const run = CONV_L - 0.36;
    for (let i = 0; i < nCleat; i++) {
      const b = cleatBase[i];
      const t = ((now * 0.28) + b.k / CLEATS_PER) % 1;
      _mm.compose(_vv.set(b.cx - run / 2 + t * run, CONV_TOP + 0.045, b.cz), _qq.identity(), _one);
      cleats.setMatrixAt(i, _mm);
    }
    cleats.instanceMatrix.needsUpdate = true;

    // pose every arm from its own phase (phase-offset so the floor isn't in lock-step)
    // FK: base(M0) → yaw → shoulder → elbow → wrist (yaw held 0; the tend works in one plane).
    for (let i = 0; i < nCells; i++) {
      const p = ((now / CYCLE) + i * 0.111) % 1;
      const { s, e, w } = poseAt(p);
      mYaw.multiplyMatrices(M0[i], local(0.4, 0));           setSeg("yaw", i, mYaw);
      mSh.multiplyMatrices(mYaw, local(0.32, s));            setSeg("shoulder", i, mSh);
      mEl.multiplyMatrices(mSh, local(0.05 + L_UPPER, e));   setSeg("elbow", i, mEl);
      mWr.multiplyMatrices(mEl, local(L_FORE, w));           setSeg("wrist", i, mWr);
    }
    for (const name of ["yaw", "shoulder", "elbow", "wrist"])
      for (const suf of ["L", "D", "M"])
        parts[name + suf] && (parts[name + suf].instanceMatrix.needsUpdate = true);

    // travelling blanks ride each belt and wrap around
    for (let i = 0; i < nConv; i++) {
      const b = partBase[i];
      const t = ((now / 6) + b.phase) % 1;
      _mm.compose(_vv.set(b.cx - run / 2 + t * run, CONV_TOP + 0.09, b.cz), _qq.identity(), _one);
      partsMesh.setMatrixAt(i, _mm);
    }
    partsMesh.instanceMatrix.needsUpdate = true;
  }

  const setVisible = (v) => (group.visible = v);
  return { group, update, setVisible };
}
