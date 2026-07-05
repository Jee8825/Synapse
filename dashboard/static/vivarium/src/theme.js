// SYNAPSE · Vivarium — palette + layout constants.
// Pale-cyan / light-blue glows on deep slate, mirroring the 2D dashboard's state colours
// (see dashboard/static/style.css :root) so the two views read as one product.

import * as THREE from "three";

// Colours as Three.js hex ints (0xRRGGBB). State colours match the 2D dashboard exactly.
export const COLORS = {
  bg:          0x0a1622,  // deep slate-navy world background + fog
  floor:       0x0c1a28,
  grid:        0x163a47,  // subtle pale-cyan grid lines
  gridCenter:  0x0e7490,  // brighter cyan centre cross
  steel:       0x8a99a6,  // brushed-steel machine bodies
  steelDark:   0x4a5965,
  cyan:        0x22d3ee,  // data / gossip glow accent
  cyanDim:     0x0e7490,
  // node state colours (identical to 2D --confident / --stale / --unknown)
  confident:   0x10b5b0,  // teal/cyan
  stale:       0xd98a17,  // amber
  unknown:     0xf43f5e,  // red-pink (CLAUDE/brief §5.5)
  // fault "flavour" colours — the SAME confirmed fault, coloured by WHY the machine stopped:
  newFault:    0xf97316,  // orange  — a NEW pattern the machine detected first-hand
  peerFault:   0xa855f7,  // violet  — a defect the AI RECOGNIZED from a peer's taught pattern (born-wise)
  // comms integrity — the redundant-transport channel: the on-node comparator (PRP + 1oo2D) result.
  integrity:   0xd946ef,  // magenta — a rejected tampered copy (kept distinct from red/amber/violet)
  wireA:       0x38bdf8,  // sky-blue — wired path A (HSR ring backbone)
  wireB:       0x5eead4,  // teal     — wireless path B (per-batch router)
  white:       0xeaf6fb,
};

// State name -> aura/ring colour. One source of truth for every state-driven material.
export const STATE_COLOR = {
  CONFIDENT: COLORS.confident,
  STALE:     COLORS.stale,
  UNKNOWN:   COLORS.unknown,
};

// Fault-situation colour: the SAME folded state, coloured by WHY the machine is faulted so the
// three situations read apart at a glance. Pure — every branch is a real logged field, never faked.
//   STALE            -> amber   (drift -> self-quarantine, listen-don't-teach)
//   UNKNOWN          -> red     (novel + unresolved pattern -> stopped, escalate to a human)
//   confirmed + PEER -> violet  (defect the AI recognized born-wise from a peer's taught pattern)
//   confirmed + else -> orange  (a NEW defect pattern the machine detected first-hand)
//   healthy          -> teal
export function situationColor(ns) {
  if (!ns) return COLORS.confident;
  if (ns.state === "STALE") return COLORS.stale;
  if (ns.state === "UNKNOWN") return COLORS.unknown;
  if (ns.confirmed_fault) return ns.recognition_source === "PEER" ? COLORS.peerFault : COLORS.newFault;
  return COLORS.confident;
}

// Fleet triangle in the XZ plane (y is up). A at the back apex, B/C across the front,
// matching the 2D layout (A top, B bottom-left, C bottom-right). Architected as a lookup
// so the M6 fleet-scale mode can swap in a generated ring/grid of positions.
export const NODE_POS = {
  A: [0.0, 0.0, -3.6],
  B: [-3.8, 0.0, 2.2],
  C: [3.8, 0.0, 2.2],
};

// Soft radial glow texture (built once) — used for additive pulse sprites and the floor aura.
// why: a hard-edged disc reads as a flat plate; a radial-gradient sprite reads as light.
let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.75)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}
