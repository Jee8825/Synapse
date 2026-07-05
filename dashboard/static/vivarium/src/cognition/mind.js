// SYNAPSE · Cognition — one node's "mind": the L1→L4 stack made physical.
// A vertical cognition tower rendered from the SAME folded fields the 2D dashboard proves correct
// (state, self_trust, confirmed_fault, should_teach, recognition_source, memory[]). It RENDERS,
// it does not COMPUTE — every colour, scale and crystal is a faithful read of what the real
// L1–L4 node already decided. The one illustrative element (data-flow packets on the spine) lives
// in synapseFlow.js and is flagged in the legend, exactly like the floor twin's pulses.js.
//
// Anatomy, bottom → top (mirrors synapse/ layers):
//   SENSOR   intake dish            — replayed CWRU/NASA windows arriving
//   L1       detection lens         — Isolation Forest; flares red on a real confirmed_fault
//   L2       self-trust CORE (orb)  — ADWIN+conformal self-trust; grows/brightens with trust
//   L3       memory orbit ring      — FAISS signatures; one crystal per real memory entry
//   L4       gossip emitter         — Zenoh peer teach; mutes when should_teach=false
// plus a base trust HALO (state colour, sized by trust) and an ISOLATION SHELL that closes over
// the tower on self-quarantine ("listen, don't teach").

import * as THREE from "three";
import { COLORS, STATE_COLOR, glowTexture } from "../theme.js";

// stage heights up the tower (metres). Kept as one table so labels/flow/gossip agree.
export const STAGE_Y = { sensor: 0.55, l1: 1.75, l2: 3.05, l3: 4.35, l4: 5.55 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const glowSprite = (color, scale, opacity) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(scale);
  return s;
};

export function createMind(id, role, pos, labels) {
  const group = new THREE.Group();
  group.position.set(pos[0], 0, pos[2]);

  // --- central spine: a translucent nerve the data-flow packets climb ---
  const spine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, STAGE_Y.l4 + 0.4, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: COLORS.cyanDim, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  spine.position.y = (STAGE_Y.l4 + 0.4) / 2;
  group.add(spine);

  // --- base trust halo (state colour, radius scales with self-trust) ---
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.05, 12, 64),
    new THREE.MeshStandardMaterial({ color: COLORS.confident, emissive: COLORS.confident,
      emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.3 }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.05;
  group.add(halo);
  const haloGlow = glowSprite(COLORS.confident, 3.4, 0.28);
  haloGlow.position.y = 0.1;
  group.add(haloGlow);

  // a slim pedestal so the tower reads as "standing"
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 1.0, 0.18, 32),
    new THREE.MeshStandardMaterial({ color: COLORS.steelDark, roughness: 0.6, metalness: 0.5,
      envMapIntensity: 0.7 }),
  );
  pedestal.position.y = 0.09; pedestal.castShadow = true; pedestal.receiveShadow = true;
  group.add(pedestal);

  // ---- helper: a flat "layer plate" disc at a given height ----
  const plate = (y, r, color) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.08, 40),
      new THREE.MeshStandardMaterial({ color: COLORS.steel, emissive: color,
        emissiveIntensity: 0.25, roughness: 0.45, metalness: 0.6, envMapIntensity: 0.8 }),
    );
    m.position.y = y; m.castShadow = true;
    group.add(m);
    return m;
  };

  // --- SENSOR intake: a shallow dish + a soft intake glow (windows arriving) ---
  const sensor = plate(STAGE_Y.sensor, 0.62, COLORS.cyan);
  const sensorGlow = glowSprite(COLORS.cyan, 0.9, 0.5);
  sensorGlow.position.y = STAGE_Y.sensor + 0.15;
  group.add(sensorGlow);

  // --- L1 detection lens: an icosahedron "eye" that flares on a real confirmed_fault ---
  const l1Plate = plate(STAGE_Y.l1, 0.7, COLORS.cyan);
  const l1Lens = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 1),
    new THREE.MeshStandardMaterial({ color: 0x0b2733, emissive: COLORS.cyan,
      emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.4 }),
  );
  l1Lens.position.y = STAGE_Y.l1 + 0.36;
  group.add(l1Lens);
  const l1Flare = glowSprite(COLORS.unknown, 1.4, 0);
  l1Flare.position.y = STAGE_Y.l1 + 0.36;
  group.add(l1Flare);

  // --- L2 self-trust CORE: the emotional centre. Orb grows/brightens with self-trust; a
  //     wireframe conscience shell wraps it; a gauge ring below shows the trust fill. ---
  const l2Plate = plate(STAGE_Y.l2, 0.78, COLORS.confident);
  const coreY = STAGE_Y.l2 + 0.5;
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5, 3),
    new THREE.MeshStandardMaterial({ color: 0x06181f, emissive: COLORS.confident,
      emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.2 }),
  );
  core.position.y = coreY;
  group.add(core);
  const coreWire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.62, 1),
    new THREE.MeshBasicMaterial({ color: COLORS.confident, wireframe: true, transparent: true,
      opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  coreWire.position.y = coreY;
  group.add(coreWire);
  const coreGlow = glowSprite(COLORS.confident, 2.0, 0.7);
  coreGlow.position.y = coreY;
  group.add(coreGlow);
  // trust gauge ring (a torus whose emissive arc-brightness reads as fill)
  const gauge = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.03, 8, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.confident, transparent: true, opacity: 0.9 }),
  );
  gauge.rotation.x = -Math.PI / 2;
  gauge.position.y = STAGE_Y.l2 + 0.06;
  group.add(gauge);

  // --- L3 memory orbit: signature crystals orbit a tilted ring (one per real memory entry) ---
  const l3Plate = plate(STAGE_Y.l3, 0.72, COLORS.cyan);
  const memRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.02, 8, 64),
    new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  memRing.rotation.x = -Math.PI / 2.35; // slight tilt so orbiting crystals read in 3D
  memRing.position.y = STAGE_Y.l3 + 0.45;
  group.add(memRing);
  const memHub = new THREE.Group();
  memHub.position.y = STAGE_Y.l3 + 0.45;
  memHub.rotation.x = memRing.rotation.x;
  group.add(memHub);
  const crystals = []; // { mesh, sig_id, born:number } — reconciled to ns.memory in apply()

  // --- L4 gossip emitter: a dish + upward beam; teach shockwaves launch from here ---
  const l4Plate = plate(STAGE_Y.l4, 0.6, COLORS.cyan);
  const emitter = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.5, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x0b2733, emissive: COLORS.cyan,
      emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.5, side: THREE.DoubleSide }),
  );
  emitter.position.y = STAGE_Y.l4 + 0.3;
  group.add(emitter);
  const emitterGlow = glowSprite(COLORS.cyan, 1.1, 0.55);
  emitterGlow.position.y = STAGE_Y.l4 + 0.45;
  group.add(emitterGlow);

  // --- isolation shell: a translucent amber cage that closes over the tower on self-quarantine.
  //     It's porous (wireframe) — incoming gossip still lands: "listen, don't teach". ---
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.9, 2),
    new THREE.MeshBasicMaterial({ color: COLORS.stale, wireframe: true, transparent: true,
      opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  shell.position.y = 3.0; shell.scale.setScalar(0.01);
  group.add(shell);

  // --- an invisible hitbox spanning the whole tower for click/hover picking ---
  const hitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, STAGE_Y.l4 + 1.2, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.y = (STAGE_Y.l4 + 1.2) / 2;
  hitbox.userData.mindId = id;
  group.add(hitbox);

  // --- projected labels (crisp HTML, de-crowded to hovered/selected node in the loop) ---
  const titleAnchor = new THREE.Object3D(); titleAnchor.position.set(0, STAGE_Y.l4 + 1.15, 0); group.add(titleAnchor);
  const stateAnchor = new THREE.Object3D(); stateAnchor.position.set(0, STAGE_Y.l4 + 0.78, 0); group.add(stateAnchor);
  const title = labels.add(titleAnchor, `NODE ${id} · ${role}`, "title");
  const stateLabel = labels.add(stateAnchor, "", "readout");
  const stageLabel = (y, text, cls) => {
    const a = new THREE.Object3D(); a.position.set(0.95, y + 0.2, 0); group.add(a);
    return labels.add(a, text, cls);
  };
  const detailLabels = [
    stageLabel(STAGE_Y.sensor, "SENSOR · replayed window", "sensor"),
    stageLabel(STAGE_Y.l1, "L1 · Isolation Forest", "plate"),
    stageLabel(STAGE_Y.l2, "L2 · self-trust (conformal)", "plate"),
    stageLabel(STAGE_Y.l3, "L3 · FAISS memory", "plate"),
    stageLabel(STAGE_Y.l4, "L4 · Zenoh gossip", "plate"),
  ];

  // world-space anchors for the flow/gossip systems (recomputed lazily; towers don't move)
  const worldAt = (y) => group.localToWorld(new THREE.Vector3(0, y, 0));

  // ---- state carried between frames, all from the folded log ----
  let cur = null, shakeT = 0;

  function makeCrystal(provColor) {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11, 0),
      new THREE.MeshStandardMaterial({ color: 0x08202a, emissive: provColor,
        emissiveIntensity: 1.0, roughness: 0.2, metalness: 0.3 }),
    );
    memHub.add(m);
    return m;
  }

  // reconcile the orbiting crystals to the node's REAL memory list (add new, drop removed)
  function syncMemory(memory, selfColor) {
    const ids = new Set(memory.map((e) => e.sig_id));
    for (let i = crystals.length - 1; i >= 0; i--) {
      if (!ids.has(crystals[i].sig_id)) { memHub.remove(crystals[i].mesh); crystals.splice(i, 1); }
    }
    for (const e of memory) {
      if (crystals.some((c) => c.sig_id === e.sig_id)) continue;
      // provenance colour: self-authored = the node's own state colour; peer = a warm teal so
      // "born-wise from a peer" reads distinctly (fleet learning).
      const born = e.provenance !== id;
      const col = born ? 0x2ee6c8 : selfColor;
      const mesh = makeCrystal(col);
      mesh.scale.setScalar(0.01); // pop-in
      crystals.push({ mesh, sig_id: e.sig_id, born, t: 0 });
    }
    // spread crystals evenly around the ring
    crystals.forEach((c, i) => (c.angle = (i / Math.max(1, crystals.length)) * Math.PI * 2));
  }

  // snap the tower to a folded snapshot (called on every rendered tick)
  function apply(ns) {
    cur = ns;
    const color = STATE_COLOR[ns.state] ?? COLORS.confident;
    const trust = clamp01(ns.self_trust);

    // trust halo: colour = state, radius scales with self-trust (shrinks as trust falls)
    const hs = 0.55 + 0.45 * trust;
    halo.scale.set(hs, hs, 1);
    halo.material.color.setHex(color); halo.material.emissive.setHex(color);
    haloGlow.material.color.setHex(color);
    haloGlow.scale.setScalar(2.6 + trust * 1.2);

    // L2 self-trust core: grows + brightens with trust; colour = state
    const cs = 0.6 + 0.55 * trust;
    core.scale.setScalar(cs);
    core.material.emissive.setHex(color);
    core.material.emissiveIntensity = 0.5 + trust * 1.1;
    coreWire.material.color.setHex(color);
    coreWire.scale.setScalar(cs * 1.18);
    coreGlow.material.color.setHex(color);
    coreGlow.scale.setScalar((1.4 + trust * 1.3) * cs);
    gauge.material.color.setHex(color);
    gauge.material.opacity = 0.25 + trust * 0.7;      // gauge "fills" (brightens) with trust
    l2Plate.material.emissive.setHex(color);

    // L1 detection lens: red flare + emissive spike on a REAL confirmed_fault
    const fault = !!ns.confirmed_fault;
    l1Lens.material.emissive.setHex(fault ? COLORS.unknown : COLORS.cyan);
    l1Lens.material.emissiveIntensity = fault ? 1.6 : 0.5;
    l1Flare.material.opacity = fault ? 0.9 : 0.0;
    l1Plate.material.emissive.setHex(fault ? COLORS.unknown : COLORS.cyan);

    // L4 gossip emitter: greys out (offline) when the node may not teach — the visible firebreak
    const gated = ns.should_teach === false;
    emitter.material.emissive.setHex(gated ? COLORS.steelDark : COLORS.cyan);
    emitter.material.emissiveIntensity = gated ? 0.2 : 0.7;
    emitterGlow.material.opacity = gated ? 0.12 : 0.55;
    l4Plate.material.emissive.setHex(gated ? COLORS.steelDark : COLORS.cyan);

    // isolation shell target: closed while self-quarantined (should_teach false / STALE)
    shell._target = gated ? 1 : 0;

    // memory crystals ← the real memory list
    syncMemory(ns.memory || [], color);

    // update labels
    title.el.textContent = `NODE ${id} · ${ns.role || role}`;
    const pct = Math.round(trust * 100);
    const css = "#" + color.toString(16).padStart(6, "0");
    stateLabel.el.innerHTML =
      `<div class="rdline" style="color:${css}">${ns.state} · trust ${ns.self_trust.toFixed(2)}</div>`
      + `<div class="cband"><i style="width:${pct}%;background:${css}"></i></div>`
      + `<div class="ccap">self-trust (conformal-derived)</div>`
      + (gated ? `<div class="rgate">⊘ gossip gated · listen-only${fault ? " · fault not taught" : ""}</div>` : "");

    // spindle-equivalent "cognitive stress" for the loop: how hard the core jitters. From the REAL
    // state/trust, never a fabricated anomaly number (same rule as the floor twin's shakeLevel).
    shakeT = ns.state === "UNKNOWN" ? 1.0 : ns.state === "STALE" ? 0.5 : fault ? 0.55 : (1 - trust) * 0.5;
  }

  function update(dt, now) {
    const color = cur ? (STATE_COLOR[cur.state] ?? COLORS.confident) : COLORS.confident;
    // core: slow spin + breathe; jitter grows with cognitive stress
    core.rotation.y += dt * (0.4 + shakeT * 1.2);
    core.rotation.x += dt * 0.15;
    coreWire.rotation.y -= dt * (0.3 + shakeT * 0.8);
    const jit = shakeT * 0.03;
    core.position.set(Math.sin(now * 37) * jit, coreY + Math.cos(now * 29) * jit, Math.cos(now * 31) * jit);
    coreGlow.material.opacity = 0.45 + Math.sin(now * 2.2) * 0.12 + shakeT * 0.2;

    // L1 lens spins; flare breathes when faulted
    l1Lens.rotation.y += dt * (0.6 + shakeT * 1.0);
    if (l1Flare.material.opacity > 0.01) l1Flare.material.opacity = 0.6 + Math.sin(now * 8) * 0.35;

    // sensor intake: gentle pulse (windows arriving)
    sensorGlow.material.opacity = 0.35 + Math.sin(now * 3 + pos[0]) * 0.15;

    // emitter beam breathes when able to teach
    emitter.rotation.y += dt * 0.5;

    // memory crystals orbit + pop-in; peer-authored ones twinkle
    memHub.rotation.z += dt * 0.35;
    for (const c of crystals) {
      c.t = Math.min(1, c.t + dt * 3);
      const target = 1;
      c.mesh.scale.setScalar(c.mesh.scale.x + (target - c.mesh.scale.x) * Math.min(1, dt * 6));
      const a = (c.angle || 0);
      c.mesh.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95);
      c.mesh.rotation.y += dt * (c.born ? 1.6 : 0.9);
      c.mesh.material.emissiveIntensity = (c.born ? 1.0 : 0.8) + Math.sin(now * 4 + a) * 0.25;
    }

    // spine pulse
    spine.material.opacity = 0.25 + Math.sin(now * 2) * 0.08;

    // isolation shell ease in/out toward its target
    const cur01 = shell.scale.x < 1 ? shell.scale.x : 1;
    const tgt = shell._target || 0;
    const k = Math.min(1, dt * 3);
    const sc = THREE.MathUtils.lerp(shell.scale.x, tgt < 0.5 ? 0.01 : 1.0, k);
    shell.scale.setScalar(sc);
    shell.material.opacity = THREE.MathUtils.lerp(shell.material.opacity, tgt * 0.32, k);
    shell.rotation.y += dt * 0.25;

    // halo breathe
    haloGlow.material.opacity = 0.2 + Math.sin(now * 1.8) * 0.06;
    void color;
  }

  function setHovered(on) {
    emitterGlow.scale.setScalar(on ? 1.5 : 1.1);
  }

  return {
    id, role, group, hitbox, title, stateLabel, detailLabels,
    apply, update, setHovered,
    get state() { return cur; },
    anchors: {
      sensor: () => worldAt(STAGE_Y.sensor),
      l1: () => worldAt(STAGE_Y.l1 + 0.36),
      l3: () => worldAt(STAGE_Y.l3 + 0.45),
      l4: () => worldAt(STAGE_Y.l4 + 0.3),
      top: () => worldAt(STAGE_Y.l4 + 0.9),
    },
  };
}
