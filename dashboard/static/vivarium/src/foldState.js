// SYNAPSE · Vivarium — pure fold: normalized events -> fleet state at tick t.
// No side effects, no DOM, no Three.js. Rendering reflects this fold, so scrubbing is just
// "fold at the new t and snap" (brief §4.3). Mirrors the carry-forward the 2D dashboard already
// proves correct (dashboard/static/app.js): same log -> same state, deterministically.

export const ACTIVE_MS = 800;  // dwell on ticks where something happens / a state flips
export const DEAD_MS = 16;     // zip through quiet ticks -> 165-tick stale run replays in ~15-20s

// first-occurrence beat markers on the timeline (mirror app.js BEAT_LABEL)
const BEAT_LABEL = { teach: "first teach", alarm: "⚠ systemic", escal: "escalate", stale: "stale lock", recover: "✓ rejoin", reject: "✕ path mismatch" };
// derived beat: a node recognizing a PEER's taught pattern in its OWN data (born-wise prediction).
// Not a transient event — it's a property of the folded TICK state (recognition_source), so it's
// computed from the carry-forward below, never fabricated.
const PREDICT_LABEL = "born-wise warn";

/**
 * Precompute every tick's snapshot once. Returns { maxTick, durations, beats, snapshotAt(t) }.
 * snapshotAt(t) -> { nodes: {A:{...}}, fleet: {alarm}|null }.
 */
export function buildFold(meta, events) {
  const nodes = meta.nodes;
  const maxTick = meta.n_ticks - 1;

  const byTick = new Map();
  for (const e of events) {
    if (!byTick.has(e.t)) byTick.set(e.t, []);
    byTick.get(e.t).push(e);
  }

  // working per-node state, carried forward across ticks
  const cur = {};
  nodes.forEach((n) => (cur[n] = {
    role: meta.roles[n], state: "CONFIDENT", self_trust: 1, recognition_source: "NONE",
    matched_origin: null, confirmed_fault: false, should_teach: true, sig_count: 0, memory: [],
    // channel integrity (dual-path PRP + 1oo2D comparator): OK until a logged CHANNEL_* event.
    // carried forward — a compromised link stays flagged (the log never clears it).
    channel: "OK", channel_from: null,
  }));

  // each node's case memory, built from real teach/learn gossip (provenance = who it came from)
  const addMem = (c, sig, prov, t) => {
    if (!c || !sig) return;
    if (!c.memory.some((m) => m.sig_id === sig)) c.memory.push({ sig_id: sig, provenance: prov, tick: t });
  };

  const snaps = [], fleetSnaps = [], durations = [];
  let fleetAlarm = null, prev = {};
  // born-wise prediction: track when a node first recognizes a PEER's pattern in its own data, so
  // that tick DWELLS (not zipped) and gets a timeline beat — the "predict from existing pattern" beat.
  const wasPeer = {}; let predictBeat = null;

  for (let t = 0; t <= maxTick; t++) {
    const evs = byTick.get(t) || [];
    let active = evs.some((e) => e.kind !== "state");

    for (const e of evs) {
      if (e.kind !== "state") continue;
      const c = cur[e.node];
      if (!c) continue;
      c.state = e.state; c.self_trust = e.self_trust; c.recognition_source = e.recognition_source;
      c.matched_origin = e.matched_origin; c.confirmed_fault = e.confirmed_fault;
      c.should_teach = e.should_teach; c.sig_count = e.sig_count; c.role = e.role;
    }
    for (const e of evs) {
      if (e.kind === "teach") addMem(cur[e.from], e.sig_id, e.from, t);            // origin = self
      else if (e.kind === "learn") addMem(cur[e.node], e.sig_id, e.from, t);       // born-wise from peer
      else if (e.kind === "alarm" && !fleetAlarm)
        fleetAlarm = { active: true, detail: e.detail, peers: e.peers, sig_id: e.sig_id, sinceTick: t };
      // comparator caught a tampered copy -> this node's link is flagged compromised (REJECT wins
      // over DEGRADED). matched_origin is the origin of the bad copy. The tampered copy never
      // entered L3 (decided by the real comparator), so memory is untouched — we only flag the link.
      else if (e.kind === "reject" && cur[e.node]) { cur[e.node].channel = "REJECT"; cur[e.node].channel_from = e.from; }
      else if (e.kind === "degraded" && cur[e.node] && cur[e.node].channel !== "REJECT") {
        cur[e.node].channel = "DEGRADED"; cur[e.node].channel_from = e.from;
      }
    }

    // a state flip also counts as an "active" tick for dead-tick compression
    const curStates = {};
    nodes.forEach((n) => (curStates[n] = cur[n].state));
    for (const n of nodes) if (prev[n] !== undefined && prev[n] !== curStates[n]) active = true;
    prev = curStates;

    // born-wise recognition onset: a node whose recognition_source flips to PEER is seeing a
    // pattern in ITS OWN data that a peer taught -> dwell on it + mark the first one as a beat.
    for (const n of nodes) {
      const peer = cur[n].recognition_source === "PEER";
      if (peer && !wasPeer[n]) { active = true; if (predictBeat === null) predictBeat = { tick: t, label: PREDICT_LABEL }; }
      wasPeer[n] = peer;
    }

    const snap = {};
    nodes.forEach((n) => { const c = cur[n]; snap[n] = { ...c, memory: c.memory.slice() }; });
    snaps[t] = snap;
    fleetSnaps[t] = fleetAlarm ? { ...fleetAlarm } : null;
    durations[t] = active ? ACTIVE_MS : DEAD_MS;
  }

  const beats = [], seen = new Set();
  for (const e of events) {
    if (BEAT_LABEL[e.kind] && !seen.has(e.kind)) { seen.add(e.kind); beats.push({ tick: e.t, label: BEAT_LABEL[e.kind] }); }
  }
  if (predictBeat) beats.push(predictBeat);  // derived born-wise-prediction beat (from folded state)

  return {
    maxTick, durations, beats, byTick,
    snapshotAt(t) {
      const tt = Math.max(0, Math.min(maxTick, t));
      return { nodes: snaps[tt], fleet: fleetSnaps[tt] };
    },
  };
}
