// SYNAPSE · Cognition — controller + render loop for the "AI at work" view.
// The end-to-end AI workflow (learn · pattern-detect · trust · confidence grow · fleet-learn ·
// peer-talk · peer-isolate) rendered as three living minds. It reuses the SAME render-only
// boundary as the floor twin: fetch the read-only /api/events log → toRenderEvents (adapter) →
// buildFold (pure) → snap the scene to the folded state. It RENDERS, it does not COMPUTE.
//
// Reused verbatim from the floor twin: eventModel.js, foldState.js, theme.js, hud.js, labels.js,
// audio.js. New here: the abstract mind-space scene + the L1–L4 towers + the synapse flow.

import * as THREE from "three";
import { createCogScene } from "./cogScene.js";
import { createMind } from "./mind.js";
import { createSynapseFlow } from "./synapseFlow.js";
import { createLabels } from "../labels.js";
import { createAudio } from "../audio.js";
import { COLORS, STATE_COLOR } from "../theme.js";
import { fetchScenarios, fetchEvents, toRenderEvents } from "../eventModel.js";
import { buildFold } from "../foldState.js";
import { createHud } from "../hud.js";

const canvas = document.getElementById("viewport");
const { renderer, scene, camera, controls, updateAmbient } = createCogScene(canvas);
const labels = createLabels(document.getElementById("labels"));
const audio = createAudio();

// Tower layout: the A/B/C triangle (A back, B left, C right), spread wider than the floor twin so
// the three minds and the central fleet-nexus all read. Matches theme.NODE_POS orientation.
const COG_POS = {
  A: [0.0, 0.0, -6.2],
  B: [-6.6, 0.0, 3.6],
  C: [6.6, 0.0, 3.6],
};

const minds = {};
["A", "B", "C"].forEach((id) => {
  const m = createMind(id, id === "A" ? "teacher" : "peer", COG_POS[id], labels);
  scene.add(m.group);
  minds[id] = m;
});
const flow = createSynapseFlow(scene, minds);
// label the central fleet-mind nexus
labels.add(flow.nexusAnchor, "FLEET MIND · shared knowledge", "nexus");

// --- interaction: hover / click-inspect / double-click focus -----------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hitboxes = Object.values(minds).map((m) => m.hitbox);
let hovered = null, selected = null, focusedId = null, downPos = null;
const HOME = { pos: new THREE.Vector3(0.5, 8.5, 17), tgt: new THREE.Vector3(0, 2.6, 0) };
let camTween = null;

function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(hitboxes, false)[0];
  return hit ? hit.object.userData.mindId : null;
}
function flyTo(pos, tgt) {
  camTween = { fromPos: camera.position.clone(), toPos: pos.clone(), fromTgt: controls.target.clone(), toTgt: tgt.clone(), t: 0, dur: 0.9 };
}
function focusFly(id) {
  focusedId = id;
  const p = minds[id].group.position;
  flyTo(new THREE.Vector3(p.x * 0.6, 4.2, p.z + 7.5), new THREE.Vector3(p.x, 3.0, p.z));
}
function resetView() { focusedId = null; flyTo(HOME.pos, HOME.tgt); }

canvas.addEventListener("pointerdown", (e) => { audio.unlock(); camTween = null; downPos = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener("wheel", () => { camTween = null; }, { passive: true });
canvas.addEventListener("pointermove", (e) => { hovered = pick(e); canvas.style.cursor = hovered ? "pointer" : "default"; });
canvas.addEventListener("click", (e) => {
  if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) return; // was an orbit drag
  const id = pick(e);
  if (id) { selected = id; refreshInspector(); } else closeInspector();
});
canvas.addEventListener("dblclick", (e) => {
  const id = pick(e);
  if (id) { selected = id; refreshInspector(); focusFly(id); } else { closeInspector(); resetView(); }
});

// --- playback state ----------------------------------------------------------
let scenarios = [], meta = null, fold = null, normEvents = [];
let tick = 0, playing = false, speed = 1, acc = 0, lastTs = null, lastRendered = -1;

const hud = createHud({
  onSelectScenario: (name) => select(name),
  onPlayToggle: () => (playing ? pause() : play()),
  onScrub: (t) => { pause(); setTick(t); },
  onSpeed: (s) => { speed = s; },
});

// sound toggle
const soundBtn = document.getElementById("sound");
if (soundBtn) {
  const paint = () => {
    const on = audio.isEnabled();
    soundBtn.textContent = on ? "🔊" : "🔇";
    soundBtn.classList.toggle("off", !on);
    soundBtn.title = on ? "sound on — mute cues" : "sound off — unmute cues";
  };
  soundBtn.onclick = () => { audio.unlock(); audio.setEnabled(!audio.isEnabled()); paint(); };
  paint();
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const hexCss = (n) => "#" + n.toString(16).padStart(6, "0");
function actFor(t) {
  let label = meta.acts[0].label;
  for (const a of meta.acts) if (t >= a.tick) label = a.label;
  return label;
}

async function init() {
  const all = await fetchScenarios();
  // the cognition view is the DEEP 3-node story (learn/trust/gossip/isolate). The 50-node fleet
  // floor is the /3d view's job — filter it out here so the tabs stay focused.
  scenarios = all.filter((s) => (s.nodes || []).length <= 3);
  hud.setScenarios(scenarios, scenarios[0]?.name);
  if (scenarios.length) await select(scenarios[0].name);
}

async function select(name) {
  meta = scenarios.find((s) => s.name === name);
  const raw = await fetchEvents(name);
  normEvents = toRenderEvents(raw);
  fold = buildFold(meta, normEvents);
  flow.clear();
  closeInspector();
  focusedId = null;
  hud.setActiveScenario(name);
  hud.setNarrative(meta.narrative);
  hud.renderBeats(fold.beats, fold.maxTick);
  pause();
  setTick(0);
}

function setTick(t) {
  if (!fold) return;
  tick = Math.max(0, Math.min(fold.maxTick, t));
  acc = 0;
  renderTick(tick);
}

function renderTick(t) {
  lastRendered = t;
  const snap = fold.snapshotAt(t);
  for (const id in minds) {
    const ns = snap.nodes[id];
    if (!ns) continue;
    minds[id].apply(ns);
    flow.setMuted(id, ns.should_teach === false); // gated node can't teach
  }
  flow.setAlarm(!!(snap.fleet && snap.fleet.active)); // persistent; bursts on the edge only
  hud.setTransport({ tick: t, maxTick: fold.maxTick, playing, act: actFor(t) });
  hud.renderTicker(normEvents, t);
  hud.setAlarm(snap.fleet);
  updateCaption(t, snap);
  if (selected) refreshInspector();
}

// lower-third narration — a plain-English read of the folded workflow. Every line is derived from
// real logged fields; it explains the AI's decision, it never invents one.
function updateCaption(t, snap) {
  const el = document.getElementById("caption");
  if (!el) return;
  if (selected) { el.classList.add("hidden"); return; } // the node console IS the narration then
  el.classList.remove("hidden");
  const evs = fold.byTick.get(t) || [];
  const find = (k) => evs.find((e) => e.kind === k);
  let cls = "cyan", text = null;
  const alarm = find("alarm"), esc = find("escal"), st = find("stale"),
        rec = find("recover"), tc = find("teach"), ln = find("learn");
  if (alarm) { cls = "red"; text = "⚠ FLEET LEARNING — the same premature signature surfaced on multiple minds at once. The fleet mind flags a systemic batch defect no single node could see."; }
  else if (esc) { cls = "red"; text = `NODE ${esc.node} · L1 confirmed a novel fault, and no peer memory matches it — the fleet has never seen this. Escalating to a human.`; }
  else if (st) { cls = "amber"; text = `NODE ${st.node} · L2 drift-conscience — self-trust fell below τ. It seals itself off (listen, don't teach) so a stale mind can't poison the fleet.`; }
  else if (rec) { cls = "teal"; text = `NODE ${rec.node} · re-earned trust from sustained healthy windows — re-baselined, shell lifts, teaching back on.`; }
  else if (tc) { cls = "cyan"; text = `NODE ${tc.from} · L4 — taught its fault signature to the fleet, peer-to-peer. Only the compact signature crosses the wire, never raw telemetry.`; }
  else if (ln) { cls = "cyan"; text = ln.bornwise ? `NODE ${ln.node} · L3 — recognized the fault from ${ln.from}'s signature. Born-wise: it knows a fault it never experienced.` : `NODE ${ln.node} · L3 — ingested a peer signature from ${ln.from}.`; }
  else {
    const ns = snap.nodes;
    const stale = Object.keys(ns).find((id) => ns[id].state === "STALE");
    const faulted = Object.keys(ns).find((id) => ns[id].confirmed_fault || ns[id].state === "UNKNOWN");
    if (stale) { cls = "amber"; text = `NODE ${stale} is quarantined — L2 sealed it off; it still listens to peers while it re-earns trust.`; }
    else if (faulted) { cls = "red"; text = `NODE ${faulted} · L1 is holding a confirmed fault under watch.`; }
    else { cls = "cyan"; text = "Three identical minds, all confident. Sensor windows climb each L1→L4 stack; the trust cores glow full. The fleet is the baseline each one is judged against."; }
  }
  el.className = "caption " + cls;
  el.textContent = text;
}

function lastActivity(id, t) {
  for (let i = normEvents.length - 1; i >= 0; i--) {
    const e = normEvents[i];
    if (e.t > t) continue;
    if (e.kind === "teach" && e.from === id) return "L4 · taught a signature to the fleet";
    if (e.kind === "learn" && e.node === id) return "L3 · born-wise learn from " + e.from;
    if (e.kind === "alarm" && e.node === id) return "L4 · systemic match";
    if (e.kind === "escal" && e.node === id) return "escalated to a human";
    if (e.kind === "stale" && e.node === id) return "L2 · drift-conscience self-quarantine";
  }
  return null;
}

// under-the-hood node console: what each L1–L4 layer is doing for this mind right now.
function refreshInspector() {
  if (!selected || !fold) return;
  const ns = fold.snapshotAt(tick).nodes[selected];
  if (!ns) return;
  const color = STATE_COLOR[ns.state] ?? COLORS.confident;
  const css = hexCss(color);
  const trust = clamp01(ns.self_trust);
  const pct = Math.round(trust * 100);
  const gated = ns.should_teach === false;

  // one honest line per layer, read straight off the folded fields
  const L = [
    ["L1", "Isolation Forest", ns.confirmed_fault ? "▲ fault detected" : "monitoring · healthy", ns.confirmed_fault],
    ["L2", "ADWIN + conformal", ns.state === "STALE" ? "▲ drift → self-quarantine" : `self-trust ${pct}%`, ns.state === "STALE"],
    ["L3", "FAISS memory", `${(ns.memory || []).length} signature${(ns.memory || []).length === 1 ? "" : "s"}`, false],
    ["L4", "Zenoh peer gossip", gated ? "⊘ gated · listen-only" : (ns.should_teach ? "teaching enabled" : "—"), gated],
  ].map(([k, algo, msg, hot]) =>
    `<div class="lrow${hot ? " hot" : ""}"><span class="lk">${k}</span><span class="la">${algo}</span><span class="lm">${msg}</span></div>`
  ).join("");

  const reason = ns.state === "STALE" ? "baseline drift → sealed off (listen, don't teach)"
    : ns.state === "UNKNOWN" ? "confirmed novel fault, unseen fleet-wide → escalating"
    : ns.confirmed_fault ? (ns.recognition_source === "PEER" ? "confirmed fault — recognized from a peer signature (born-wise)" : "confirmed fault — recognized first-hand")
    : "healthy — no drift, no confirmed fault";

  const gauge = `<div class="gauge"><div class="gfill" style="width:${pct}%;background:${css}"></div>`
    + `<div class="gtau" title="τ_stale = 0.50"></div></div>`
    + `<div class="gcap"><span style="color:${css}">self-trust ${pct}%</span><span>τ_stale 50%</span></div>`;

  const mem = (ns.memory || []).length
    ? ns.memory.map((m) => `<li><code>${m.sig_id.slice(0, 12)}</code> ← <b>${m.provenance}</b> <span class="dim">@t${m.tick}</span></li>`).join("")
    : `<li class="dim">— none —</li>`;

  const el = document.getElementById("inspector");
  el.innerHTML = `<div class="ihead"><b style="color:${css}">NODE ${selected}</b> · ${ns.role}`
    + `<button id="iclose" aria-label="close">×</button></div>`
    + `<div class="istate" style="color:${css}">● ${ns.state}</div>`
    + `<div class="ireason">${reason}</div>${gauge}`
    + `<div class="ladder">${L}</div>`
    + `<div class="irow"><span>recognition</span><span>${ns.recognition_source}</span></div>`
    + `<div class="irow"><span>last activity</span><span>${lastActivity(selected, tick) || "—"}</span></div>`
    + `<div class="isig">signatures in memory (${(ns.memory || []).length})<ul>${mem}</ul></div>`;
  el.classList.remove("hidden");
  document.getElementById("iclose").onclick = closeInspector;
}

function closeInspector() {
  selected = null;
  document.getElementById("inspector").classList.add("hidden");
  if (fold) updateCaption(tick, fold.snapshotAt(tick));
}

// spawn transient motion + audio for the events at tick t (only while playing forward). Every cue
// is triggered by a REAL logged beat — audio-visual mirror of the log.
function fireTransients(t) {
  const evs = fold.byTick.get(t);
  if (!evs) return;
  for (const e of evs) {
    if (e.kind === "teach" && e.from) {
      flow.teach(e.from); audio.cue("teach"); flow.spawnFlow(e.from, true);
    } else if (e.kind === "learn" && e.from && e.node) {
      flow.relay(e.from, e.node, e.bornwise); audio.cue("learn"); flow.spawnFlow(e.node, true);
    } else if (e.kind === "escal" && e.node) {
      audio.cue("fault"); flashScreen("red");
    } else if (e.kind === "stale" && e.node) {
      audio.cue("stale"); flashScreen("amber");
    } else if (e.kind === "alarm") {
      audio.cue("klaxon"); flashScreen("red"); flow.setAlarm(true);
    } else if (e.kind === "recover" && e.node) {
      audio.cue("recover"); flashScreen("teal"); flow.teach(e.node);
    }
  }
}

let _flashTimer = null;
function flashScreen(kind) {
  const el = document.getElementById("vignette");
  if (!el) return;
  el.className = "vignette " + kind;
  void el.offsetWidth;
  el.classList.add("on");
  clearTimeout(_flashTimer);
  _flashTimer = setTimeout(() => el.classList.remove("on"), 700);
}

function play() {
  if (!fold) return;
  audio.unlock();
  if (tick >= fold.maxTick) setTick(0);
  playing = true; lastTs = null;
  hud.setTransport({ tick, maxTick: fold.maxTick, playing, act: actFor(tick) });
}
function pause() {
  playing = false; lastTs = null;
  if (fold) hud.setTransport({ tick, maxTick: fold.maxTick, playing, act: actFor(tick) });
}

// --- single render loop ------------------------------------------------------
const clock = new THREE.Clock();
function loop() {
  const dt = clock.getDelta();
  const now = clock.elapsedTime;

  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / camTween.dur);
    const e = camTween.t * camTween.t * (3 - 2 * camTween.t);
    camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
    controls.target.lerpVectors(camTween.fromTgt, camTween.toTgt, e);
    if (camTween.t >= 1) camTween = null;
  }
  controls.update();
  updateAmbient(dt, now);

  // de-crowd stage labels to the hovered / selected / focused mind
  for (const id in minds) {
    const m = minds[id];
    const show = id === hovered || id === selected || id === focusedId;
    for (const l of m.detailLabels) l.enabled = show;
    m.setHovered(id === hovered);
  }

  // playback advance (dead-tick compression); fire transients for each crossed tick
  if (playing && fold) {
    if (lastTs === null) lastTs = now;
    acc += (now - lastTs) * 1000 * speed;
    lastTs = now;
    let advanced = false;
    while (tick < fold.maxTick && acc >= fold.durations[tick]) {
      acc -= fold.durations[tick]; tick++; fireTransients(tick); advanced = true;
    }
    if (advanced && tick !== lastRendered) renderTick(tick);
    if (tick >= fold.maxTick) pause();
  }

  for (const id in minds) minds[id].update(dt, now);
  flow.update(dt, now);

  renderer.render(scene, camera);
  labels.update(camera, canvas.clientWidth, canvas.clientHeight);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

init()
  .then(() => {
    document.getElementById("loading")?.classList.add("hidden");
    window.__cognitionReady = true;
    window.__cognition = {
      THREE, scene, camera, controls, renderer, minds, flow,
      get fold() { return fold; }, get tick() { return tick; },
      _fire: fireTransients, _inspect: (id) => { selected = id; refreshInspector(); },
      _focus: focusFly, _reset: resetView, _select: select,
    };
    console.log("[cognition] ready — L1–L4 minds, trust cores, gossip mesh, fleet nexus");
  })
  .catch((e) => console.error("[cognition] init failed:", e));
