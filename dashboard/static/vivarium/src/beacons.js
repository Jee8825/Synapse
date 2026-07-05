// SYNAPSE · Vivarium — per-machine warning beacon (the "lights" half of the fault indicator).
// A rotating strobe light mounted on top of each machine. Its MODE is driven purely by the folded
// state — off when CONFIDENT, amber when STALE (low self-trust, listen-don't-teach), red when
// UNKNOWN / confirmed fault. Honest: it is a second, louder read-out of the SAME logged state the
// trust ring and spindle glow already show — never a fabricated signal.

import * as THREE from "three";
import { COLORS, glowTexture } from "./theme.js";

// beacon modes match the fault-situation palette: amber STALE · red UNKNOWN · orange new-pattern
// defect · violet born-wise defect · off healthy.
const MODE_COLOR = {
  off: 0x223140, amber: COLORS.stale, red: COLORS.unknown,
  orange: COLORS.newFault, violet: COLORS.peerFault,
};
const FAST_MODES = new Set(["red", "orange", "violet"]);  // any confirmed-fault beacon strobes hard
const Y = 2.98; // sits just above the machine frame, below the floating labels

// shared geometry (allocated once; materials cloned per machine so beacons glow independently)
const G = {
  post: new THREE.CylinderGeometry(0.05, 0.06, 0.22, 12),
  cap: new THREE.CylinderGeometry(0.17, 0.19, 0.05, 16),
  dome: new THREE.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  beam: new THREE.BoxGeometry(0.5, 0.11, 0.05),
};
const M_DARK = new THREE.MeshStandardMaterial({ color: COLORS.steelDark, roughness: 0.5, metalness: 0.8 });

export function createBeacons(machines) {
  const rigs = {};

  for (const id in machines) {
    const g = new THREE.Group();
    g.position.set(0, Y, 0);

    g.add(new THREE.Mesh(G.post, M_DARK));
    const cap = new THREE.Mesh(G.cap, M_DARK); cap.position.y = 0.13; g.add(cap);

    // translucent coloured dome (the lamp housing)
    const domeMat = new THREE.MeshStandardMaterial({
      color: MODE_COLOR.off, emissive: MODE_COLOR.off, emissiveIntensity: 0.2,
      transparent: true, opacity: 0.55, roughness: 0.25, metalness: 0.1,
    });
    const dome = new THREE.Mesh(G.dome, domeMat); dome.position.y = 0.16; g.add(dome);

    // rotating light bar inside the dome -> the classic sweeping strobe
    const beamMat = new THREE.MeshBasicMaterial({
      color: MODE_COLOR.off, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const beam = new THREE.Mesh(G.beam, beamMat); beam.position.y = 0.19; g.add(beam);

    // additive glow sprite so an active beacon reads as emitted light, not a painted ball
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: MODE_COLOR.off, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(1.2); glow.position.y = 0.2; g.add(glow);

    machines[id].group.add(g);
    rigs[id] = { g, dome, beam, glow, mode: "off", lvl: 0 };
  }

  function setMode(id, mode) {
    const r = rigs[id];
    if (!r || r.mode === mode) return;
    r.mode = mode;
    const c = MODE_COLOR[mode] ?? MODE_COLOR.off;
    r.dome.material.color.setHex(c);
    r.dome.material.emissive.setHex(c);
    r.beam.material.color.setHex(c);
    r.glow.material.color.setHex(c);
  }

  function update(dt, now) {
    for (const id in rigs) {
      const r = rigs[id];
      const active = r.mode !== "off";
      // ease an activity level 0..1 so beacons fade in/out rather than snap
      r.lvl += ((active ? 1 : 0) - r.lvl) * Math.min(1, dt * 6);
      const fast = FAST_MODES.has(r.mode); // confirmed-fault beacons strobe faster + brighter than amber
      r.beam.rotation.y += dt * (fast ? 9 : 4.5) * (0.3 + r.lvl);
      // blink: dome + glow pulse; red blinks harder
      const blink = 0.5 + 0.5 * Math.sin(now * (fast ? 12 : 6));
      r.dome.material.emissiveIntensity = 0.2 + r.lvl * (0.6 + blink * (fast ? 1.6 : 0.9));
      r.dome.material.opacity = 0.5 + r.lvl * 0.25;
      r.beam.material.opacity = r.lvl * (0.35 + blink * 0.5);
      r.glow.material.opacity = r.lvl * (0.25 + blink * (fast ? 0.6 : 0.35));
      r.glow.scale.setScalar(1.0 + r.lvl * (0.5 + blink * 0.3));
    }
  }

  return { setMode, update };
}
