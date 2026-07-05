// SYNAPSE · Vivarium — CNC machine factory (a *scaled spindle analog*, never a real CNC).
// Returns one machine Group + the refs the fold/motion layers drive. Built for realism on
// Three.js: rounded brushed-steel bodies that catch the scene's PBR environment map, a glass
// chip-guard, a control panel, real shadows, and a spindle head + table that move like the
// machine is cutting. Sensor rig (MPU6050/INA219/DS18B20) and the edge node with the L1–L4
// plate stack are unchanged in meaning — they remain the data-driven indicators.
//
// why shared geometry, per-instance materials: every machine is identical, so each shape is
// allocated ONCE and reused (fleet-scale ready, brief §9). Materials the motion layer animates
// per-node (spindle glow, plate sweep, trust ring, aura, hover accent) are cloned per machine so
// node A never lights up node B.

import * as THREE from "three";
import { RoundedBoxGeometry } from "../vendor/RoundedBoxGeometry.js";
import { COLORS, glowTexture } from "./theme.js";

const rbox = (w, h, d, r = 0.05, s = 3) => new RoundedBoxGeometry(w, h, d, s, r);

// --- shared geometries (allocated once) --------------------------------------
const G = {
  cabinet:  rbox(2.7, 1.15, 2.3, 0.07, 4),
  accent:   new THREE.BoxGeometry(2.74, 0.05, 2.34),
  column:   rbox(0.6, 2.0, 0.6, 0.05),
  gantry:   rbox(2.2, 0.4, 0.55, 0.05),
  table:    rbox(1.7, 0.16, 1.4, 0.04),
  carriage: rbox(0.56, 0.5, 0.5, 0.05),
  rail:     new THREE.CylinderGeometry(0.03, 0.03, 2.0, 12),
  spindle:  new THREE.CylinderGeometry(0.15, 0.13, 0.95, 28),
  collar:   new THREE.CylinderGeometry(0.19, 0.19, 0.16, 24),
  tool:     new THREE.ConeGeometry(0.085, 0.34, 20),
  nozzle:   new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8),
  panel:    rbox(0.5, 0.62, 0.08, 0.03),
  screen:   new THREE.PlaneGeometry(0.4, 0.46),
  glassF:   new THREE.BoxGeometry(1.7, 0.9, 0.04),
  glassS:   new THREE.BoxGeometry(0.04, 0.9, 1.4),
  sensor:   rbox(0.2, 0.12, 0.2, 0.03),
  pedestal: rbox(0.34, 1.0, 0.34, 0.04),
  pi:       rbox(0.92, 0.1, 0.62, 0.03),
  plate:    rbox(0.86, 0.11, 0.56, 0.03),
  ring:     new THREE.TorusGeometry(1.95, 0.045, 12, 80),
};

// --- shared static materials (env map gives them real reflections) -----------
const M = {
  steel:     new THREE.MeshStandardMaterial({ color: COLORS.steel, roughness: 0.34, metalness: 0.9, envMapIntensity: 1.1 }),
  steelDark: new THREE.MeshStandardMaterial({ color: COLORS.steelDark, roughness: 0.5, metalness: 0.85, envMapIntensity: 0.9 }),
  rail:      new THREE.MeshStandardMaterial({ color: 0xd9e6ec, roughness: 0.18, metalness: 1.0, envMapIntensity: 1.3 }),
  pi:        new THREE.MeshStandardMaterial({ color: 0x14633f, roughness: 0.6, metalness: 0.2 }),
  glass:     new THREE.MeshPhysicalMaterial({
    color: 0x9fd8e6, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.14,
    clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4,
  }),
  screen:    new THREE.MeshStandardMaterial({ color: 0x062a33, emissive: COLORS.cyan, emissiveIntensity: 0.7, roughness: 0.3 }),
};

const SENSORS = [
  { key: "vibration", label: "MPU6050 · vibration", color: 0x22d3ee, pos: [0.5, 2.82, -0.3] },
  { key: "current",   label: "INA219 · current",    color: 0x7dd3fc, pos: [0.0, 2.66, -0.12] },
  { key: "temp",      label: "DS18B20 · temp",       color: 0xfbbf24, pos: [-0.5, 2.82, -0.3] },
];
const PLATES = ["L1 · Isolation Forest", "L2 · ADWIN + Conformal", "L3 · Case Memory", "L4 · Zenoh Gossip (peer)"];

// --- HYBRID: procedural extras that still sit on the CAD frame ----------------
// In hybrid mode the CAD model IS the machine and animates its own spindle/carriage (see
// cadBody.js + main.js loop); the procedural spindle/head is hidden. Only the sensor-rig chips
// remain as procedural detail, lifted onto the CAD frame at this height (verified in-browser).
const HYBRID = {
  sensorY: 1.68, // sensor-chip height on the CAD frame
};

function add(group, geo, mat, x, y, z, { cast = false, receive = false } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = receive;
  group.add(m);
  return m;
}
function makeAnchor(parent, x, y, z) {
  const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o;
}

// opts.cadBody: a normalized THREE.Object3D (the real CNC 3018 frame) or null. When present we
// run HYBRID — the CAD glb is the static enclosure and the procedural enclosure is suppressed;
// the spindle/head + indicators stay procedural so the data-driven motion survives. When null we
// build the fully procedural machine (the air-gapped fallback). Backward-compatible: callers that
// pass no opts get the original procedural body.
export function createMachine(id, labels, opts = {}) {
  const cadBody = opts.cadBody ?? null;
  const hybrid = !!cadBody;
  const group = new THREE.Group();
  group.name = `machine-${id}`;

  if (hybrid) {
    // the real CNC 3018 frame/enclosure is the static hero; procedural shell is skipped below
    group.add(cadBody);
  } else {
    // enclosure cabinet (procedural)
    add(group, G.cabinet, M.steelDark, 0, 0.575, 0, { cast: true, receive: true });
  }

  // glowing top accent rail — always (per-instance material -> hover highlight). In hybrid it
  // hugs the frame as a thin cyan light-bar selection cue rather than capping the procedural cabinet.
  const accentMat = new THREE.MeshStandardMaterial({
    color: COLORS.cyanDim, emissive: COLORS.cyan, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.4,
  });
  const accent = add(group, G.accent, accentMat, 0, hybrid ? 0.12 : 1.16, 0);
  accent.visible = !hybrid; // off by default in hybrid; hover brightens the trust ring instead

  if (!hybrid) {
    // control panel with an emissive screen on the cabinet's front-right
    const panel = new THREE.Group(); panel.position.set(0.92, 1.0, 1.16); panel.rotation.x = -0.18; group.add(panel);
    add(panel, G.panel, M.steel, 0, 0, 0, { cast: true });
    add(panel, G.screen, M.screen, 0, 0.02, 0.05);

    // working structure on top of the cabinet
    add(group, G.column, M.steel, -0.95, 2.0, -0.7, { cast: true });
    add(group, G.gantry, M.steel, 0, 2.85, -0.55, { cast: true });
    const rail1 = add(group, G.rail, M.rail, 0, 2.74, -0.34); rail1.rotation.z = Math.PI / 2;
    const rail2 = add(group, G.rail, M.rail, 0, 2.58, -0.34); rail2.rotation.z = Math.PI / 2;
  }

  // feed table — procedural; hidden in hybrid (the CAD frame already has a bed). Kept as a ref so
  // the motion loop's table-feed animation runs harmlessly on an invisible object.
  const table = add(group, G.table, M.steel, 0, 1.24, 0.05, { cast: true, receive: true });
  table.visible = !hybrid;

  // spindle head (procedural): traverses the gantry in X; spindle within it spins + shakes by real
  // state. Shown only in the procedural fallback — in hybrid the CAD model's own spindle moves.
  const head = new THREE.Group();
  head.position.set(0, 2.62, -0.42);
  head.visible = !hybrid; // in hybrid the CAD model's own spindle/carriage move instead
  group.add(head);
  add(head, G.carriage, M.steel, 0, 0, 0, { cast: true });
  const collar = add(head, G.collar, M.steel, 0, -0.28, 0, { cast: true });
  const spindleMat = new THREE.MeshStandardMaterial({
    color: COLORS.cyanDim, emissive: COLORS.cyan, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.6,
  });
  const spindle = add(head, G.spindle, spindleMat, 0, -0.6, 0, { cast: true });
  add(head, G.tool, M.steel, 0, -1.04, 0, { cast: true });
  const nozzle = add(head, G.nozzle, M.steelDark, 0.2, -0.55, 0.12); nozzle.rotation.z = 0.5;

  if (!hybrid) {
    // glass chip-guard around the work area (you see the spindle through it)
    add(group, G.glassF, M.glass, 0, 1.78, 0.78);
    add(group, G.glassS, M.glass, -0.83, 1.78, 0.05);
    add(group, G.glassS, M.glass, 0.83, 1.78, 0.05);
  }

  // detail labels (sensor rig + L1–L4 plates + edge node) gated on hover/focus to de-crowd
  const detailLabels = [];

  // sensor rig — chips on the frame (lifted to HYBRID.sensorY when riding the CAD body)
  const sensors = SENSORS.map((s) => {
    const pos = hybrid ? [s.pos[0], HYBRID.sensorY, s.pos[2]] : s.pos;
    const mat = new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.45, roughness: 0.5, metalness: 0.2 });
    const mesh = add(group, G.sensor, mat, ...pos, { cast: true });
    detailLabels.push(labels.add(makeAnchor(group, pos[0] - 0.5, pos[1], pos[2]), s.label, "sensor"));
    return { mesh, key: s.key, mat };
  });

  // edge node (Raspberry Pi 5) + L1–L4 plate stack
  const edge = new THREE.Group(); edge.position.set(2.15, 0, 0.7); group.add(edge);
  add(edge, G.pedestal, M.steelDark, 0, 0.5, 0, { cast: true });
  add(edge, G.pi, M.pi, 0, 1.06, 0, { cast: true });
  detailLabels.push(labels.add(makeAnchor(edge, 0, 1.06, 0.5), "edge node · Raspberry Pi 5", "muted"));
  const plates = PLATES.map((text, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.cyanDim, emissive: COLORS.cyan, emissiveIntensity: 0.16, roughness: 0.4, metalness: 0.3 });
    const y = 1.3 + i * 0.22;
    const plate = add(edge, G.plate, mat, 0, y, 0, { cast: true });
    detailLabels.push(labels.add(makeAnchor(edge, 0.62, y, 0), text, "plate"));
    return plate;
  });

  // state aura (soft floor glow) + trust ring (colour/scale ← state/self-trust; M4 loop)
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), new THREE.MeshBasicMaterial({
    map: glowTexture(), color: COLORS.confident, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  aura.rotation.x = -Math.PI / 2; aura.position.y = 0.04; group.add(aura);
  const ringMat = new THREE.MeshStandardMaterial({ color: COLORS.cyanDim, emissive: COLORS.confident, emissiveIntensity: 0.25, roughness: 0.6, metalness: 0.2 });
  const ring = new THREE.Mesh(G.ring, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; group.add(ring);

  // node title + live state readout (always shown; text/colour driven by the fold)
  const title = labels.add(makeAnchor(group, 0, 3.8, 0), `NODE ${id}`, "title");
  const stateLabel = labels.add(makeAnchor(group, 0, 3.45, 0), "", "readout");

  // invisible hit-box for click/hover raycasting (covers machine body + edge-node tower)
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(5.6, 4.6, 3.6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hitbox.position.set(0.7, 2.1, 0.2); hitbox.userData.machineId = id; group.add(hitbox);

  detailLabels.forEach((l) => (l.enabled = false)); // de-crowded by default

  return { id, group, spindle, head, table, accent, sensors, plates, ring, aura, title, stateLabel, hitbox, detailLabels };
}
