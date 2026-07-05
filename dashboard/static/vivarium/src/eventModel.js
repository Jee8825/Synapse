// SYNAPSE · Vivarium — ADAPTER (the render-only boundary).
// Fetches the SAME read-only logs the 2D dashboard serves and maps each real FleetEvent into a
// normalized render event. It NEVER recomputes a detection, score, or state — it only re-shapes
// what the L1–L4 nodes already decided. sig_id / provenance / peers are parsed out of the real
// `detail` strings the emitter writes (synapse/scenarios/events.py), not invented.
//
// Real schema (synapse/scenarios/events.py :: FleetEvent / EventType):
//   TICK            per-node, per-tick snapshot   -> kind 'state'
//   GOSSIP_PUBLISH  node taught a signature       -> kind 'teach'   (detail: "taught <hex> to the fleet")
//   GOSSIP_RECEIVE  node ingested a peer signature-> kind 'learn'   (detail: "received <hex> from X")
//   SYSTEMIC_ALARM  >=K origins on one signature  -> kind 'alarm'   (detail: "BATCH DEFECT: <hex> from ['A','B']")
//   ESCALATE        confirmed novel fault -> human-> kind 'escal'
//   STALE_QUARANTINE node dropped to STALE         -> kind 'stale'
//   RECOVER         STALE node re-baselined -> CONFIDENT (teaching re-enabled) -> kind 'recover'
//   CHANNEL_REJECT  node's 2 channel copies DISAGREED (PRP + 1oo2D) -> kind 'reject' (tampered path
//                   B copy dropped before ingest; matched_origin = origin of the bad copy)
//   CHANNEL_DEGRADED only one channel delivered   -> kind 'degraded' (accepted on a single path)

const SIG_RE = /([0-9a-f]{16})/;            // signature hashes are 16 hex chars (e.g. 2be334a1e282a141)
const PEERS_RE = /\[([^\]]*)\]/;            // "... from ['A', 'B']"
const COUNT_RE = /(\d+)\s+sigs/;            // "N sigs in memory"
const SEQ_RE = /seq (\d+)/;                 // "... (seq 0)"  — PRP per-origin sequence number
const PATH_RE = /path ([AB])/;              // "... on path B" — which diverse channel failed

export async function fetchScenarios() {
  const r = await fetch("/api/scenarios");
  if (!r.ok) throw new Error(`/api/scenarios -> ${r.status}`);
  return r.json();
}

export async function fetchEvents(name) {
  const r = await fetch(`/api/events/${name}`);
  if (!r.ok) throw new Error(`/api/events/${name} -> ${r.status}`);
  return r.json();
}

const sigOf = (d) => (SIG_RE.exec(d || "") || [])[1] || null;
const countOf = (d) => { const m = COUNT_RE.exec(d || ""); return m ? +m[1] : 0; };
const seqOf = (d) => { const m = SEQ_RE.exec(d || ""); return m ? +m[1] : null; };
const pathOf = (d) => (PATH_RE.exec(d || "") || [])[1] || null;
function peersOf(d) {
  const m = PEERS_RE.exec(d || "");
  if (!m) return null;
  return m[1].split(",").map((s) => s.replace(/['"\s]/g, "")).filter(Boolean);
}

/** Map the verbatim FleetEvent log into normalized render events (one stream, fold + motion). */
export function toRenderEvents(raw) {
  const out = [];
  for (const e of raw) {
    const base = { t: e.tick, seq: e.seq, detail: e.detail };
    switch (e.event_type) {
      case "TICK":
        out.push({
          ...base, kind: "state", node: e.node_id, role: e.role, state: e.state,
          self_trust: e.self_trust, recognition_source: e.recognition_source,
          matched_origin: e.matched_origin, confirmed_fault: e.confirmed_fault,
          systemic: e.systemic, should_teach: e.should_teach, sig_count: countOf(e.detail),
        });
        break;
      case "GOSSIP_PUBLISH":  // teacher broadcasts; per-peer delivery shows up as 'learn' next tick
        out.push({ ...base, kind: "teach", node: e.node_id, from: e.node_id,
          sig_id: sigOf(e.detail), provenance: e.node_id });
        break;
      case "GOSSIP_RECEIVE":  // the real per-peer arc: matched_origin -> node_id
        out.push({ ...base, kind: "learn", node: e.node_id, from: e.matched_origin,
          sig_id: sigOf(e.detail), provenance: e.matched_origin,
          bornwise: e.recognition_source === "PEER" });
        break;
      case "SYSTEMIC_ALARM":
        out.push({ ...base, kind: "alarm", node: e.node_id, sig_id: sigOf(e.detail),
          peers: peersOf(e.detail) });
        break;
      case "ESCALATE":
        out.push({ ...base, kind: "escal", node: e.node_id });
        break;
      case "STALE_QUARANTINE":
        out.push({ ...base, kind: "stale", node: e.node_id });
        break;
      case "RECOVER":  // STALE -> CONFIDENT: re-baselined, trust re-earned, teaching re-enabled
        out.push({ ...base, kind: "recover", node: e.node_id });
        break;
      case "CHANNEL_REJECT":  // the on-node comparator caught a mismatch: tampered copy dropped
        out.push({ ...base, kind: "reject", node: e.node_id, from: e.matched_origin,
          seq: seqOf(e.detail), path: pathOf(e.detail) });
        break;
      case "CHANNEL_DEGRADED":  // only one path delivered -> accepted on a single channel (other down)
        out.push({ ...base, kind: "degraded", node: e.node_id, from: e.matched_origin,
          seq: seqOf(e.detail), path: pathOf(e.detail) });
        break;
      default:
        break; // unknown event types are ignored, never guessed at
    }
  }
  return out;
}

// transient kinds (everything except the carry-forward 'state') drive ticker + M4 motion
export const TRANSIENT_KINDS = new Set(["teach", "learn", "alarm", "escal", "stale", "recover", "reject", "degraded"]);
