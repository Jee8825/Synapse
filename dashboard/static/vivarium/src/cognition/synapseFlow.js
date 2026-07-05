// SYNAPSE · Cognition — the flow between and within minds.
// Three concerns, all render-only reads of the folded log except the idle spine flow (which is
// ILLUSTRATIVE — it animates the pipeline, exactly like the floor twin's pulses.js, and is flagged
// as such in the legend):
//   1. spine flow   — glowing packets climb sensor→L4 inside each tower (illustrative pipeline)
//   2. gossip mesh  — teacher L4 → peer L3 packets on a REAL teach/learn event ("peer talking");
//                     a gated node's outbound arcs mute ("can't teach")
//   3. fleet nexus  — a central "fleet mind" that brightens as knowledge converges and flares red
//                     on a REAL systemic batch-defect alarm ("fleet learning")

import * as THREE from "three";
import { COLORS, glowTexture } from "../theme.js";
import { STAGE_Y } from "./mind.js";

const glow = (color, scale, opacity) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(scale);
  return s;
};

export function createSynapseFlow(scene, minds) {
  const ids = Object.keys(minds);

  // ---- 1. per-tower spine flow (illustrative) ----------------------------------
  const rigs = {};
  for (const id of ids) {
    const m = minds[id];
    const base = m.group.position;
    // a local-space climb from sensor to just above L4
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, STAGE_Y.sensor, 0),
      new THREE.Vector3(0, STAGE_Y.l1, 0),
      new THREE.Vector3(0, STAGE_Y.l2, 0),
      new THREE.Vector3(0, STAGE_Y.l3, 0),
      new THREE.Vector3(0, STAGE_Y.l4 + 0.3, 0),
    ]);
    rigs[id] = { m, base, curve, timer: Math.random() * 2.4 };
  }
  let flowPackets = []; // { rig, p, sp, strong }

  function spawnFlow(id, strong = false) {
    const rig = rigs[id];
    if (!rig || flowPackets.length > 40) return;
    const sp = glow(strong ? COLORS.white : COLORS.cyan, strong ? 0.5 : 0.3, strong ? 0.95 : 0.5);
    rig.m.group.add(sp);
    flowPackets.push({ rig, p: 0, sp, strong });
  }

  // ---- 2. gossip mesh (peer talking) -------------------------------------------
  // faint static arcs between every tower top, so the mesh reads even when quiet
  const meshLines = new THREE.Group();
  scene.add(meshLines);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = minds[ids[i]].anchors.top(), b = minds[ids[j]].anchors.top();
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 1.2; // gentle bow
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: COLORS.cyanDim, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      meshLines.add(line);
    }
  }
  let gossipPackets = []; // { curve, p, sp, onArrive }
  const muted = new Set();

  function setMuted(id, on) { on ? muted.add(id) : muted.delete(id); }

  // teacher broadcasts a signature to every peer: L4(teacher) → L3(peer), with an absorb flash
  function teach(fromId, onArriveEach) {
    if (muted.has(fromId)) return; // gated node can't teach — nothing leaves
    const from = minds[fromId];
    if (!from) return;
    // teacher shockwave at its emitter
    spawnShock(from.anchors.l4(), COLORS.cyan);
    for (const pid of ids) {
      if (pid === fromId) continue;
      const to = minds[pid];
      const a = from.anchors.l4(), b = to.anchors.l3();
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 1.4;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const sp = glow(COLORS.cyan, 0.42, 0.95);
      scene.add(sp);
      gossipPackets.push({ curve, p: 0, sp, onArrive: () => onArriveEach && onArriveEach(pid) });
    }
    pulseNexus(COLORS.cyan);
  }

  // a single directed arc origin→node (used for the real per-peer GOSSIP_RECEIVE / born-wise)
  function relay(fromId, toId, born) {
    const from = minds[fromId], to = minds[toId];
    if (!from || !to) return;
    const a = from.anchors.l4(), b = to.anchors.l3();
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 1.4;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const sp = glow(born ? 0x2ee6c8 : COLORS.cyan, 0.42, 0.95);
    scene.add(sp);
    gossipPackets.push({ curve, p: 0, sp, onArrive: () => spawnShock(to.anchors.l3(), born ? 0x2ee6c8 : COLORS.cyan) });
    pulseNexus(born ? 0x2ee6c8 : COLORS.cyan);
  }

  // ---- shock rings (expanding torus) — reused for teach/absorb/alarm ----
  let shocks = []; // { mesh, t, dur, max }
  function spawnShock(atVec, color, max = 1.6, dur = 0.9) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.03, 8, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.position.copy(atVec); mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    shocks.push({ mesh, t: 0, dur, max });
  }

  // ---- 3. central fleet-mind nexus (fleet learning) ----------------------------
  // sits at the centroid of the towers, a bit above the floor — the "collective memory".
  const cx = ids.reduce((s, id) => s + minds[id].group.position.x, 0) / ids.length;
  const cz = ids.reduce((s, id) => s + minds[id].group.position.z, 0) / ids.length;
  const nexus = new THREE.Group();
  nexus.position.set(cx, 2.6, cz);
  scene.add(nexus);
  const nexusCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.42, 2),
    new THREE.MeshStandardMaterial({ color: 0x06181f, emissive: COLORS.cyan,
      emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.3 }),
  );
  nexus.add(nexusCore);
  const nexusWire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.6, 1),
    new THREE.MeshBasicMaterial({ color: COLORS.cyan, wireframe: true, transparent: true,
      opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  nexus.add(nexusWire);
  const nexusGlow = glow(COLORS.cyan, 2.2, 0.5);
  nexus.add(nexusGlow);
  const nexusLabel = new THREE.Object3D(); nexusLabel.position.set(0, 0.95, 0); nexus.add(nexusLabel);
  let nexusPulse = 0, nexusColor = COLORS.cyan, alarmed = false;

  function pulseNexus(color) { nexusPulse = 1; nexusColor = color; }
  function setAlarm(on) {
    // only BURST on the off→on edge, so renderTick can call this every tick idempotently
    if (on && !alarmed) { pulseNexus(COLORS.unknown); spawnShock(nexus.position.clone(), COLORS.unknown, 3.2, 1.4); }
    alarmed = on;
  }

  // faint "tendrils" from each tower's L3 to the nexus, so convergence reads
  const tendrils = new THREE.Group();
  scene.add(tendrils);
  for (const id of ids) {
    const a = minds[id].anchors.l3(), b = nexus.position.clone();
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 0.6;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(30));
    tendrils.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: COLORS.cyanDim, transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false })));
  }

  // ---- update ------------------------------------------------------------------
  function update(dt, now) {
    // relax + drive spine flow (idle cadence per tower + strong on demand)
    for (const id in rigs) {
      const rig = rigs[id];
      rig.timer -= dt;
      if (rig.timer <= 0) { rig.timer = 2.0 + Math.random() * 1.4; spawnFlow(id, false); }
    }
    for (let i = flowPackets.length - 1; i >= 0; i--) {
      const f = flowPackets[i];
      f.p += dt / 1.3;
      const u = THREE.MathUtils.clamp(f.p, 0, 1);
      f.sp.position.copy(f.rig.curve.getPointAt(u));
      f.sp.material.opacity = (f.strong ? 0.95 : 0.5) * (1 - u * 0.3);
      if (f.p >= 1) { f.rig.m.group.remove(f.sp); f.sp.material.dispose(); flowPackets.splice(i, 1); }
    }

    // gossip packets travel their arcs; fire onArrive at the far end
    for (let i = gossipPackets.length - 1; i >= 0; i--) {
      const g = gossipPackets[i];
      g.p += dt / 1.0;
      const u = THREE.MathUtils.clamp(g.p, 0, 1);
      g.sp.position.copy(g.curve.getPointAt(u));
      if (g.p >= 1) {
        if (g.onArrive) g.onArrive();
        scene.remove(g.sp); g.sp.material.dispose(); gossipPackets.splice(i, 1);
      }
    }

    // shocks expand + fade
    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i];
      s.t += dt / s.dur;
      const u = THREE.MathUtils.clamp(s.t, 0, 1);
      const r = 0.12 + u * s.max;
      s.mesh.scale.setScalar(r / 0.12);
      s.mesh.material.opacity = 0.9 * (1 - u);
      if (s.t >= 1) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); shocks.splice(i, 1); }
    }

    // mesh lines gently breathe; muted towers' lines can't be told apart here (arc-mute is at the
    // packet level — a gated node simply emits nothing), so keep the ambient mesh calm.
    meshLines.children.forEach((l, i) => (l.material.opacity = 0.1 + Math.sin(now * 1.2 + i) * 0.05));
    tendrils.children.forEach((l, i) => (l.material.opacity = 0.08 + Math.sin(now * 0.9 + i) * 0.04));

    // nexus: idle spin + breathe; pulse decays; colour follows alarm/teach
    nexus.rotation.y += dt * 0.3;
    nexusWire.rotation.y -= dt * 0.4;
    nexusPulse = Math.max(0, nexusPulse - dt * 1.2);
    const baseI = alarmed ? 1.4 : 0.6;
    nexusCore.material.emissive.setHex(alarmed ? COLORS.unknown : nexusColor);
    nexusCore.material.emissiveIntensity = baseI + nexusPulse * 1.6 + Math.sin(now * 2) * 0.15;
    nexusWire.material.color.setHex(alarmed ? COLORS.unknown : nexusColor);
    nexusGlow.material.color.setHex(alarmed ? COLORS.unknown : nexusColor);
    nexusGlow.material.opacity = 0.35 + nexusPulse * 0.5 + (alarmed ? 0.25 : 0);
    const ns = 1 + nexusPulse * 0.3 + (alarmed ? 0.2 : 0);
    nexusCore.scale.setScalar(ns);
  }

  function clear() {
    for (const f of flowPackets) { f.rig.m.group.remove(f.sp); f.sp.material.dispose(); }
    for (const g of gossipPackets) { scene.remove(g.sp); g.sp.material.dispose(); }
    for (const s of shocks) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
    flowPackets = []; gossipPackets = []; shocks = [];
    muted.clear(); alarmed = false; nexusPulse = 0; nexusColor = COLORS.cyan;
  }

  return {
    spawnFlow, teach, relay, setMuted, setAlarm, update, clear,
    nexusAnchor: nexusLabel,
  };
}
