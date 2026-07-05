// SYNAPSE · Vivarium — self-quarantine containment shell.
// When a node's folded state says should_teach=false (STALE self-quarantine, CLAUDE.md §4), a
// translucent amber containment dome descends over it and a scan-ring sweeps its base: the node
// has walled itself off from TEACHING the fleet. It keeps listening (incoming gossip pulses still
// reach it), so the dome is porous by design — it dramatizes "listen, don't teach", the real
// firebreak, and lifts the moment the node re-earns trust (RECOVER). Driven only by folded state.

import * as THREE from "three";
import { COLORS, glowTexture } from "./theme.js";

const R = 2.7;   // dome radius (encloses the machine + its trust ring)

export function createQuarantine(scene, machines) {
  const rigs = {};

  for (const id in machines) {
    const g = new THREE.Group();

    // porous hemisphere shell — hex-ish look via wireframe over a faint solid
    const shellMat = new THREE.MeshBasicMaterial({
      color: COLORS.stale, transparent: true, opacity: 0.0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
    g.add(shell);
    const wireMat = new THREE.MeshBasicMaterial({
      color: COLORS.stale, wireframe: true, transparent: true, opacity: 0.0, depthWrite: false,
    });
    const wire = new THREE.Mesh(new THREE.SphereGeometry(R * 1.005, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), wireMat);
    g.add(wire);

    // sweeping scan-ring at the base
    const ringMat = new THREE.MeshBasicMaterial({
      map: glowTexture(), color: COLORS.stale, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.72, R * 0.96, 40), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);

    machines[id].group.add(g);
    rigs[id] = { g, shell, wire, ring, target: 0, cur: 0 };
  }

  function setIsolated(id, on) {
    const r = rigs[id];
    if (r) r.target = on ? 1 : 0;
  }

  function update(dt, now) {
    for (const id in rigs) {
      const r = rigs[id];
      r.cur += (r.target - r.cur) * Math.min(1, dt * 4); // ease the dome up/down
      const c = r.cur;
      if (c < 0.002) { r.g.visible = false; continue; }
      r.g.visible = true;
      const pulse = 0.5 + 0.5 * Math.sin(now * 2.2);
      r.shell.material.opacity = c * (0.05 + pulse * 0.06);
      r.wire.material.opacity = c * (0.14 + pulse * 0.1);
      r.shell.scale.set(1, 0.6 + 0.4 * c, 1); // "descends" — flattens in as it settles
      r.wire.scale.copy(r.shell.scale);
      r.ring.rotation.z += dt * 1.4;
      r.ring.material.opacity = c * (0.18 + pulse * 0.22);
    }
  }

  return { setIsolated, update };
}
