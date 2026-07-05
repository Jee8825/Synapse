// SYNAPSE · Vivarium — peer-to-peer gossip arcs + traveling pulses + burst rings.
// Static dim quadratic-bézier tubes connect every node PAIR (no hub — Zenoh peer mode). On each
// real 'teach' the teacher emits a broadcast SHOCKWAVE; on each real 'learn' (GOSSIP_RECEIVE) a
// glowing signature packet travels the arc teacher -> peer and blooms an ABSORB ring as the peer
// arms born-wise. A self-quarantined node's arcs mute to amber (it may not teach). Nothing here
// decides anything — it only animates logged gossip + folded state.

import * as THREE from "three";
import { COLORS, glowTexture } from "./theme.js";

const PAIRS = [["A", "B"], ["A", "C"], ["B", "C"]];
const key = (a, b) => [a, b].sort().join("-");
// ARC_BASE / ARC_RADIUS: the idle peer-link wires are drawn always-on (not just during a gossip
// event) so the peer-to-peer mesh reads at a glance; raised from a near-invisible hairline to a
// clearly visible thin cyan wire. They still flare bright + thicken visually on a real teach/learn.
const ARC_BASE = 0.32, ARC_RADIUS = 0.03, MUTED_OPACITY = 0.12;
const PULSE_DUR = 0.9, MAX_PULSES = 30, MAX_RINGS = 24;
const _tmpColor = new THREE.Color();  // reused in the per-frame colour relax (no per-frame alloc)

function makeCurve(p1, p2) {
  const mid = p1.clone().add(p2).multiplyScalar(0.5);
  mid.y += p1.distanceTo(p2) * 0.26 + 0.8; // arch up so arcs read as peer links, not floor lines
  return new THREE.QuadraticBezierCurve3(p1.clone(), mid, p2.clone());
}

export function createGossip(scene, points) {
  const arcs = {};
  for (const [a, b] of PAIRS) {
    const [n1, n2] = [a, b].sort();
    const curve = makeCurve(points[n1], points[n2]);
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: ARC_BASE });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 44, ARC_RADIUS, 8, false), mat);
    scene.add(mesh);
    // baseColor/baseOpacity are what an idle arc relaxes to; setMuted swaps them to amber-dim.
    arcs[key(a, b)] = { n1, n2, curve, mat, baseColor: COLORS.cyan, baseOpacity: ARC_BASE };
  }

  const sprite = (color, scale, opacity = 1) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sp.scale.setScalar(scale);
    return sp;
  };

  let pulses = [];
  let rings = [];   // expanding burst rings (broadcast / absorb)

  /** an expanding, fading glow burst at a world point (teacher broadcast / peer absorb) */
  function burst(pos, color, { from = 0.5, to = 3.2, dur = 0.7 } = {}) {
    if (rings.length >= MAX_RINGS) return;
    const sp = sprite(color, from);
    sp.position.copy(pos);
    scene.add(sp);
    rings.push({ sp, from, to, dur, t: 0 });
  }

  /** Spawn a pulse travelling from -> to (a logged learn). onArrive fires the L3 flash.
   *  reject=true renders the tampered copy the comparator throws out: a MAGENTA packet whose arc
   *  flares magenta and which bursts magenta at the receiver (dropped, never absorbed). */
  function spawn(from, to, { born = false, reject = false, onArrive } = {}) {
    const arc = arcs[key(from, to)];
    if (!arc || pulses.length >= MAX_PULSES) return;
    const col = reject ? COLORS.integrity : born ? COLORS.cyan : COLORS.confident;
    const sp = sprite(col, 0.85);
    const tail = sprite(col, 0.5, 0.5); // trailing comet tail
    scene.add(sp); scene.add(tail);
    pulses.push({ arc, forward: arc.n1 === from, p: 0, sp, tail, to, born, reject, onArrive });
  }
  /** the on-node comparator rejected a tampered copy from `from` at `to` (logged CHANNEL_REJECT). */
  function reject(from, to, opts) { spawn(from, to, { ...opts, reject: true }); }

  /** teacher publishes -> a shockwave at its node (logged 'teach') */
  function broadcast(from) {
    if (points[from]) burst(points[from], COLORS.cyan, { to: 3.6, dur: 0.8 });
  }

  /** mute/unmute a node's arcs (folded should_teach=false -> amber, listen-don't-teach) */
  function setMuted(id, on) {
    for (const k in arcs) {
      const arc = arcs[k];
      if (arc.n1 !== id && arc.n2 !== id) continue;
      arc.baseColor = on ? COLORS.stale : COLORS.cyan;
      arc.baseOpacity = on ? MUTED_OPACITY : ARC_BASE;
      arc.mat.color.setHex(arc.baseColor);
    }
  }

  function update(dt) {
    for (const k in arcs) {
      const a = arcs[k];
      a.mat.opacity += (a.baseOpacity - a.mat.opacity) * Math.min(1, dt * 3); // relax to (muted?) baseline
      a.mat.color.lerp(_tmpColor.setHex(a.baseColor), Math.min(1, dt * 3));   // + relax colour to baseline
    }
    // traveling packets
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pu = pulses[i];
      pu.p += dt / PULSE_DUR;
      const u = THREE.MathUtils.clamp(pu.forward ? pu.p : 1 - pu.p, 0, 1);
      const uTail = THREE.MathUtils.clamp(pu.forward ? pu.p - 0.06 : 1 - (pu.p - 0.06), 0, 1);
      pu.sp.position.copy(pu.arc.curve.getPointAt(u));
      pu.tail.position.copy(pu.arc.curve.getPointAt(uTail));
      const flareCol = pu.reject ? COLORS.integrity : pu.born ? COLORS.cyan : COLORS.confident;
      pu.arc.mat.color.setHex(flareCol);
      pu.arc.mat.opacity = 0.9;                        // flare the traversed arc (overrides mute mid-flight)
      const fade = 1 - Math.max(0, pu.p - 0.85) / 0.15;
      pu.sp.material.opacity = fade;
      pu.tail.material.opacity = fade * 0.5;
      if (pu.p >= 1) {
        if (points[pu.to]) burst(points[pu.to], flareCol, { to: pu.reject ? 3.0 : 2.4, dur: pu.reject ? 0.55 : 0.6 });
        if (pu.onArrive) pu.onArrive();
        scene.remove(pu.sp); pu.sp.material.dispose();
        scene.remove(pu.tail); pu.tail.material.dispose();
        pulses.splice(i, 1);
      }
    }
    // expanding burst rings
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt / r.dur;
      const e = THREE.MathUtils.clamp(r.t, 0, 1);
      r.sp.scale.setScalar(r.from + (r.to - r.from) * e);
      r.sp.material.opacity = (1 - e) * 0.8;
      if (r.t >= 1) { scene.remove(r.sp); r.sp.material.dispose(); rings.splice(i, 1); }
    }
  }

  function clear() {
    for (const pu of pulses) {
      scene.remove(pu.sp); pu.sp.material.dispose();
      scene.remove(pu.tail); pu.tail.material.dispose();
    }
    for (const r of rings) { scene.remove(r.sp); r.sp.material.dispose(); }
    pulses = []; rings = [];
    for (const k in arcs) { arcs[k].baseColor = COLORS.cyan; arcs[k].baseOpacity = ARC_BASE; arcs[k].mat.opacity = ARC_BASE; arcs[k].mat.color.setHex(COLORS.cyan); }
  }

  return { spawn, reject, update, clear, broadcast, setMuted };
}
