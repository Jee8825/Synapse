// SYNAPSE · Vivarium — data-flow pulse system (ILLUSTRATIVE, not from the log).
// A glowing packet travels sensor -> L1 -> L2 -> L3 -> L4, lighting each plate as it passes, so
// the pipeline reads as "alive". Healthy nodes get a gentle idle pulse; a 'strong' pulse is fired
// on a real DETECT/teach/learn. This is explicitly flagged illustrative in the HUD legend — it
// animates the architecture, it does not replay a logged per-layer decision.

import * as THREE from "three";
import { COLORS, glowTexture } from "./theme.js";

const PLATE_BASE = 0.16, PLATE_HOT = 1.25, IDLE_EVERY = 2.6, DUR = 1.25, MAX = 24;

// stage points in machine-LOCAL space: sensor head -> the four L1..L4 plates (edge group @ x2.0,z0.7)
const STAGES = [
  [0.35, 2.5, -0.1],   // sensor cluster (no plate)
  [2.0, 1.30, 0.7],    // L1 plate
  [2.0, 1.52, 0.7],    // L2 plate
  [2.0, 1.74, 0.7],    // L3 plate
  [2.0, 1.96, 0.7],    // L4 plate
];

export function createDataFlow(machines) {
  const rigs = {};
  for (const id in machines) {
    const m = machines[id];
    const pts = STAGES.map(([x, y, z]) => m.group.localToWorld(new THREE.Vector3(x, y, z)));
    const curve = new THREE.CatmullRomCurve3(pts);
    rigs[id] = { m, curve, plates: m.plates, timer: Math.random() * IDLE_EVERY };
  }

  const sprite = () => new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: COLORS.cyan, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  let pulses = [];

  function spawn(id, { strong = false } = {}) {
    const rig = rigs[id];
    if (!rig || pulses.length >= MAX) return;
    const sp = sprite();
    sp.scale.setScalar(strong ? 0.55 : 0.32);
    sp.material.opacity = strong ? 0.95 : 0.5;
    rig.m.group.add(sp); // parent to machine so the path stays attached even if it moves later
    // store local-space curve through the same STAGE points (parented), so motion is in local frame
    pulses.push({ rig, p: 0, sp, strong, lastStage: -1, curveLocal: rig._localCurve || (rig._localCurve = new THREE.CatmullRomCurve3(STAGES.map(([x, y, z]) => new THREE.Vector3(x, y, z)))) });
  }

  function update(dt, hot = {}) {
    // relax every plate back to baseline glow
    for (const id in rigs) for (const pl of rigs[id].plates)
      pl.material.emissiveIntensity += (PLATE_BASE - pl.material.emissiveIntensity) * Math.min(1, dt * 4);

    // idle cadence per machine (a hot node pulses a touch faster)
    for (const id in rigs) {
      const rig = rigs[id];
      rig.timer -= dt * (hot[id] ? 1.8 : 1);
      if (rig.timer <= 0) { rig.timer = IDLE_EVERY * (0.8 + Math.random() * 0.5); spawn(id, { strong: false }); }
    }

    for (let i = pulses.length - 1; i >= 0; i--) {
      const pu = pulses[i];
      pu.p += dt / DUR;
      const u = THREE.MathUtils.clamp(pu.p, 0, 1);
      pu.sp.position.copy(pu.curveLocal.getPointAt(u));
      // light the plate when the packet reaches each L1..L4 stage (stage i>=1 -> plates[i-1])
      const stage = Math.min(STAGES.length - 1, Math.floor(u * (STAGES.length - 1) + 0.001));
      if (stage !== pu.lastStage && stage >= 1) {
        const pl = pu.rig.plates[stage - 1];
        if (pl) pl.material.emissiveIntensity = pu.strong ? PLATE_HOT : 0.55;
        pu.lastStage = stage;
      }
      if (pu.p >= 1) { pu.rig.m.group.remove(pu.sp); pu.sp.material.dispose(); pulses.splice(i, 1); }
    }
  }

  // flash a specific plate (L3 on learn, L4 on teach) — called from the transient layer
  function flashPlate(id, idx, strong = true) {
    const rig = rigs[id];
    if (rig && rig.plates[idx]) rig.plates[idx].material.emissiveIntensity = strong ? PLATE_HOT : 0.6;
  }

  function clear() {
    for (const pu of pulses) { pu.rig.m.group.remove(pu.sp); pu.sp.material.dispose(); }
    pulses = [];
  }

  return { spawn, update, flashPlate, clear };
}
