"use strict";
// SYNAPSE fleet dashboard — read-only playback of events/<scenario>.jsonl.
// Deterministic: same log -> same visuals. No storage APIs; all state in memory.

const POS = { A: [310, 95], B: [130, 365], C: [490, 365] };  // triangle layout (viewBox 620x470)
const R = 46, RING = 2 * Math.PI * R;
const SCLASS = { CONFIDENT: "confident", STALE: "stale", UNKNOWN: "unknown" };
const ACTIVE_MS = 800, DEAD_MS = 16;  // dwell on active ticks; zip through dead ones
const BEAT_LABEL = {
  GOSSIP_PUBLISH: "first teach", SYSTEMIC_ALARM: "⚠ systemic",
  ESCALATE: "escalate", STALE_QUARANTINE: "stale lock", RECOVER: "✓ rejoin",
};

let scenarios = [], meta = null, events = [], byTick = new Map();
let maxTick = 0, durations = [], nodeSnap = [], beats = [], firstAlarm = null;
let tick = 0, playing = false, raf = null, acc = 0, lastTs = null, speed = 1, lastRendered = -1;

const $ = (id) => document.getElementById(id);

async function init() {
  scenarios = await fetch("/api/scenarios").then((r) => r.json());
  const tabs = $("scenario-tabs");
  tabs.innerHTML = "";
  scenarios.forEach((s) => {
    const b = document.createElement("button");
    b.textContent = s.name.replace(/_/g, " ");
    b.dataset.name = s.name;
    b.onclick = () => select(s.name);
    tabs.appendChild(b);
  });
  $("play").onclick = togglePlay;
  $("scrub").oninput = (e) => { pause(); setTick(+e.target.value); };
  $("speed").onchange = (e) => { speed = +e.target.value; };
  if (scenarios.length) select(scenarios[0].name);
}

async function select(name) {
  meta = scenarios.find((s) => s.name === name);
  events = await fetch(`/api/events/${name}`).then((r) => r.json());
  [...document.querySelectorAll("#scenario-tabs button")]
    .forEach((b) => b.classList.toggle("active", b.dataset.name === name));
  $("narrative").textContent = meta.narrative;
  build();
  drawEdges();
  pause();
  setTick(0);
}

function build() {
  byTick = new Map();
  for (const e of events) {
    if (!byTick.has(e.tick)) byTick.set(e.tick, []);
    byTick.get(e.tick).push(e);
  }
  maxTick = meta.n_ticks - 1;
  $("scrub").max = maxTick;

  // carry-forward per-node snapshot for every tick
  nodeSnap = [];
  const last = {};
  meta.nodes.forEach((n) => (last[n] = {
    state: "CONFIDENT", self_trust: 1, recognition_source: "NONE", matched_origin: null,
    role: meta.roles[n],
  }));
  durations = [];
  let prev = {};
  for (let t = 0; t <= maxTick; t++) {
    const evs = byTick.get(t) || [];
    let active = evs.some((e) => e.event_type !== "TICK");
    const cur = {};
    for (const e of evs) if (e.event_type === "TICK") {
      last[e.node_id] = {
        state: e.state, self_trust: e.self_trust, recognition_source: e.recognition_source,
        matched_origin: e.matched_origin, role: e.role,
      };
      cur[e.node_id] = e.state;
    }
    for (const n in cur) if (prev[n] !== undefined && prev[n] !== cur[n]) active = true;
    Object.assign(prev, cur);
    nodeSnap[t] = JSON.parse(JSON.stringify(last));
    durations[t] = active ? ACTIVE_MS : DEAD_MS;
  }

  // beats (first occurrence of each) + first systemic alarm detail
  beats = [];
  const seen = new Set();
  firstAlarm = null;
  for (const e of events) {
    if (BEAT_LABEL[e.event_type] && !seen.has(e.event_type)) {
      seen.add(e.event_type);
      beats.push({ tick: e.tick, label: BEAT_LABEL[e.event_type] });
    }
    if (e.event_type === "SYSTEMIC_ALARM" && firstAlarm === null) firstAlarm = e;
  }
  renderBeats();
}

// --- geometry helpers ---------------------------------------------------------
function trim([x1, y1], [x2, y2], pad) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  return [[x1 + ux * pad, y1 + uy * pad], [x2 - ux * pad, y2 - uy * pad]];
}

function drawEdges() {
  const pairs = [["A", "B"], ["A", "C"], ["B", "C"]];
  $("edges").innerHTML = pairs.map(([a, b]) => {
    const [[x1, y1], [x2, y2]] = trim(POS[a], POS[b], R + 6);
    return `<line class="edge" data-a="${a}" data-b="${b}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join("");
}

// --- rendering ----------------------------------------------------------------
function renderTick(t) {
  lastRendered = t;
  const snap = nodeSnap[t];
  const evs = byTick.get(t) || [];
  const publishers = new Set(evs.filter((e) => e.event_type === "GOSSIP_PUBLISH").map((e) => e.node_id));

  // nodes
  $("nodes").innerHTML = meta.nodes.map((n) => {
    const s = snap[n], cls = SCLASS[s.state] || "confident";
    const [cx, cy] = POS[n];
    const off = RING * (1 - Math.max(0, Math.min(1, s.self_trust)));
    const bornwise = s.recognition_source === "PEER";
    return `
      <circle class="node-ring" cx="${cx}" cy="${cy}" r="${R}"/>
      <circle class="node-trust ${cls}" cx="${cx}" cy="${cy}" r="${R}"
              stroke="${trustColor(s.state)}" stroke-dasharray="${RING}" stroke-dashoffset="${off}"
              transform="rotate(-90 ${cx} ${cy})"/>
      <circle class="node-core ${cls}${publishers.has(n) ? " publishing" : ""}" cx="${cx}" cy="${cy}" r="${R}"/>
      <text class="node-letter" x="${cx}" y="${cy}">${n}</text>
      <text class="node-role" x="${cx}" y="${cy + R + 16}">${s.role}</text>
      <text class="node-state ${cls}" x="${cx}" y="${cy + R + 32}">${s.state} · trust ${s.self_trust.toFixed(2)}</text>
      ${bornwise ? `<text class="node-badge" x="${cx}" y="${cy - R - 10}">born-wise ⟵ ${s.matched_origin}</text>` : ""}
    `;
  }).join("");

  renderFlows(evs);
  renderAlarm(t);
  renderTicker(t);

  // playbar
  $("scrub").value = t;
  $("tickno").textContent = `t=${t}`;
  $("act").textContent = actFor(t);
  // highlight active edges
  const active = new Set(evs.filter((e) => e.event_type === "GOSSIP_RECEIVE")
    .map((e) => [e.matched_origin, e.node_id].sort().join("-")));
  [...document.querySelectorAll("#edges .edge")].forEach((ln) => {
    const key = [ln.dataset.a, ln.dataset.b].sort().join("-");
    ln.classList.toggle("active", active.has(key));
  });
}

function trustColor(state) {
  return state === "STALE" ? "#d98a17" : state === "UNKNOWN" ? "#dc2626" : "#0ea5a3";
}

function renderFlows(evs) {
  const flows = $("flows");
  flows.innerHTML = "";
  for (const e of evs) {
    if (e.event_type !== "GOSSIP_RECEIVE" || !e.matched_origin) continue;
    const from = POS[e.matched_origin], to = POS[e.node_id];
    if (!from || !to) continue;
    const [[x1, y1], [x2, y2]] = trim(from, to, R + 8);
    const bw = e.recognition_source === "PEER";
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", "7");
    dot.setAttribute("class", "flow-dot" + (bw ? " bornwise" : ""));
    dot.setAttribute("cx", "0"); dot.setAttribute("cy", "0");
    dot.style.offsetPath = `path('M ${x1} ${y1} L ${x2} ${y2}')`;
    flows.appendChild(dot);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lbl.setAttribute("class", "edge-label" + (bw ? " bornwise" : ""));
    lbl.setAttribute("x", mx); lbl.setAttribute("y", my - 6);
    lbl.setAttribute("text-anchor", "middle");
    lbl.textContent = (bw ? "born-wise ⟵ " : "⟵ ") + e.matched_origin;
    flows.appendChild(lbl);
  }
}

function renderAlarm(t) {
  const el = $("alarm");
  if (firstAlarm && t >= firstAlarm.tick) {
    el.classList.remove("hidden");
    el.innerHTML = `⚠ SYSTEMIC BATCH DEFECT DETECTED`
      + `<div class="sub">${escapeHtml(firstAlarm.detail)} — caught fleet-wide; single-node monitoring is blind to this.</div>`;
  } else {
    el.classList.add("hidden");
  }
}

const TAG = {
  GOSSIP_PUBLISH: "TEACH", GOSSIP_RECEIVE: "LEARN", SYSTEMIC_ALARM: "ALARM",
  ESCALATE: "ESCAL", STALE_QUARANTINE: "STALE", RECOVER: "REJOIN",
};

function renderTicker(t) {
  const items = events.filter((e) => e.tick <= t && TAG[e.event_type]);
  const tail = items.slice(-14);
  $("ticker").innerHTML = tail.map((e) => {
    const now = e.tick === t ? " now" : "";
    return `<li class="${now}"><span class="tag ${TAG[e.event_type]}">[${TAG[e.event_type]}]</span>`
      + `<span class="who">t=${e.tick} ${e.node_id}</span> ${escapeHtml(e.detail)}</li>`;
  }).join("");
  const ul = $("ticker");
  ul.scrollTop = ul.scrollHeight;
}

function renderBeats() {
  // merge beats that share a tick so labels don't overlap
  const byTickLabel = new Map();
  for (const b of beats) {
    byTickLabel.set(b.tick, byTickLabel.has(b.tick) ? `${byTickLabel.get(b.tick)} · ${b.label}` : b.label);
  }
  $("beats").innerHTML = [...byTickLabel.entries()].map(([t, label]) =>
    `<span class="beat" style="left:${maxTick ? (t / maxTick) * 100 : 0}%">${label}</span>`
  ).join("");
}

function actFor(t) {
  let label = meta.acts[0].label;
  for (const a of meta.acts) if (t >= a.tick) label = a.label;
  return label;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// --- playback -----------------------------------------------------------------
function setTick(t) {
  tick = Math.max(0, Math.min(maxTick, t));
  acc = 0;
  renderTick(tick);
}

function togglePlay() { playing ? pause() : play(); }

function play() {
  if (tick >= maxTick) setTick(0);
  playing = true; lastTs = null; $("play").textContent = "⏸";
  raf = requestAnimationFrame(frame);
}

function pause() {
  playing = false; $("play").textContent = "▶";
  if (raf) cancelAnimationFrame(raf), (raf = null);
}

function frame(ts) {
  if (!playing) return;
  if (lastTs === null) lastTs = ts;
  acc += (ts - lastTs) * speed; lastTs = ts;
  let advanced = false;
  while (tick < maxTick && acc >= durations[tick]) { acc -= durations[tick]; tick++; advanced = true; }
  if (advanced && tick !== lastRendered) renderTick(tick);
  if (tick >= maxTick) pause();
  else raf = requestAnimationFrame(frame);
}

init();
