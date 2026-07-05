// SYNAPSE · Vivarium — controller + render loop.
// M4: motion layer. The scene SNAPS to the folded state (state colour, trust ring, confidence
// band, spindle shake) and SPAWNS transient effects (gossip pulses, plate flashes, data-flow
// pulses) for events crossing the playhead during forward play. Still render-only: every effect
// is triggered by a logged event or a folded value — nothing is computed here.

import * as THREE from "three";
import { createScene } from "./scene.js";
import { createMachine } from "./machine.js";
import { loadCadBody } from "./cadBody.js";
import { createLabels } from "./labels.js";
import { createGossip } from "./gossip.js";
import { createDataFlow } from "./pulses.js";
import { createRobotCell } from "./cell.js";
import { createEnvironment } from "./environment.js";
import { createFleetFloor } from "./fleetFloor.js";
import { createFleetCells } from "./fleetCells.js";
import { createAudio } from "./audio.js";
import { createBeacons } from "./beacons.js";
import { createQuarantine } from "./quarantine.js";
import { createNodeValidators, createFleetComms } from "./commsNetwork.js";
import { NODE_POS, STATE_COLOR, COLORS, situationColor } from "./theme.js";
import { fetchScenarios, fetchEvents, toRenderEvents } from "./eventModel.js";
import { buildFold } from "./foldState.js";
import { createHud } from "./hud.js";

const canvas = document.getElementById("viewport");
const { renderer, scene, camera, controls, key } = createScene(canvas);

// P6 shadow polish: the shadow-casting key light's frustum is sized to the 3-node triangle by
// default (±16). The fleet floor is far wider, so its edge cells + machines would fall outside the
// shadow map and read as ungrounded. Widen the frustum (+ a bigger map to keep texel density) in
// fleet mode; restore the tight, crisp frustum for the 3-node view. Called from select().
function setShadowMode(fleet) {
  const s = key.shadow;
  const half = fleet ? 26 : 16;
  s.camera.left = -half; s.camera.right = half; s.camera.top = half; s.camera.bottom = -half;
  s.camera.far = fleet ? 90 : 60;
  s.camera.updateProjectionMatrix();
  const size = fleet ? 4096 : 2048;      // 4096 over ±26 ≈ denser texels than 2048 over ±16
  if (s.mapSize.width !== size) {
    s.mapSize.set(size, size);
    s.map?.dispose(); s.map = null;      // force Three to rebuild the shadow map at the new size
  }
  s.needsUpdate = true;
}

// The robot-tended cell lives as a SEPARATE material-handling station off to the left of the CNC
// line, so it never sits between the camera and the machines. Its hazard zone + safety railing
// (built in the environment) track this same anchor, so the whole station moves as one unit.
const CELL_CENTER = [-12, 0, 4];
const environment = createEnvironment(scene, { cellCenter: CELL_CENTER }); // industrial shop-floor bay
const labels = createLabels(document.getElementById("labels"));

// Hybrid: load the real CNC 3018 CAD frame once (top-level await — the loading overlay covers it).
// null → the glb is missing/unparseable, and createMachine falls back to the procedural body.
const cad = await loadCadBody();

const machines = {};
const connectPts = {};
["A", "B", "C"].forEach((id, i) => {
  const built = cad ? cad.make() : null; // { group, anim } or null → procedural fallback
  const m = createMachine(id, labels, built ? { cadBody: built.group } : {});
  m._cad = built ? built.anim : null; // CAD kinematic handles (spindle/carriage/bed pivots)
  const [x, y, z] = NODE_POS[id];
  m.group.position.set(x, y, z);
  scene.add(m.group);
  m._spindleBase = m.spindle.position.clone();
  m._headBase = m.head.position.clone();
  m._tableBase = m.table.position.clone();
  m._phase = i * 2.1; // desync the working motion across machines
  machines[id] = m;
  connectPts[id] = new THREE.Vector3(x, y + 1.7, z); // gossip arc endpoints
});

const gossip = createGossip(scene, connectPts);
const dataflow = createDataFlow(machines);
// alarm channel: synthesized "beep" audio + rotating warning "lights" + self-quarantine dome.
// All three are driven by the folded log state / logged beats — a louder read-out, never a new signal.
const audio = createAudio();
const beacons = createBeacons(machines);
const quarantine = createQuarantine(scene, machines);
// redundant-transport comparator (PRP + 1oo2D): a per-node validator badge on the 3-node rig. Its
// status is LOG-DRIVEN — magenta only on a real CHANNEL_REJECT (folded `channel`), never faked.
const nodeValidators = createNodeValidators(scene, NODE_POS);

// robot-tended cell (illustrative pick-and-place: infeed conveyor → arm → outfeed). Sits at the
// left-side station (CELL_CENTER), clear of the CNC line; its motion is cosmetic, not from the
// log — flagged in the legend.
const cell = createRobotCell(scene, { position: CELL_CENTER, rotationY: 0 });

// Fleet-scale floor: 50 CNCs as InstancedMesh proxies on a 25-cell grid. Built once, hidden until
// a fleet50_* scenario (50 nodes) is selected — the 3-node detailed rig and this share the same
// fold/playback/HUD; only the scene representation swaps (see select()).
const fleetFloor = createFleetFloor(scene, { n: 50, cad });
fleetFloor.setVisible(false);
// detailed robot-tended cells for the fleet floor: 25 instanced arms + 50 conveyors (workings +
// part flow), one arm per cell tending its 2 CNCs. Illustrative motion, like the 3-node cell.
const fleetCells = createFleetCells(scene, { nCells: 25 });
fleetCells.setVisible(false);
// fleet-floor comms topology: 5 batch wireless routers (path B) + wired HSR ring backbone (path A)
// + a validator chip per machine. Illustrative network architecture (flagged), like the robot cell.
const fleetComms = createFleetComms(scene, { n: 50 });
// hero-cell: one full 222-part animated CAD machine that stands in for whichever fleet machine the
// user focuses (double-click), so close inspection shows the complete model (the 50 instanced bodies
// are decimated for perf). Null if the glb is missing. Hidden until a fleet machine is focused.
const heroCad = cad ? cad.make() : null;
if (heroCad) { heroCad.group.visible = false; scene.add(heroCad.group); }
let heroId = null, heroMotion = 1;
let fleetMode = false;

function showHero(id) {
  if (!heroCad) return;
  const p = fleetFloor.machineBasePos(id);
  if (!p) return;
  heroCad.group.position.set(p.x, 0, p.z);
  heroCad.group.visible = true;
  fleetFloor.setHidden(id, true);   // hide the decimated instance so the hero replaces it
  heroId = id; heroMotion = 1;
}
function hideHero() {
  if (!heroCad || heroId == null) return;
  heroCad.group.visible = false;
  fleetFloor.setHidden(heroId, false);
  heroId = null;
}

// show/hide the 3-node detailed rig (machines + robot cell + shop-floor bay) as one unit
function setThreeNodeRigVisible(v) {
  for (const id in machines) {
    const m = machines[id];
    m.group.visible = v;
    // the projected HTML labels track world anchors regardless of group.visible, so gate them too
    m.title.enabled = v;
    m.stateLabel.enabled = v;
    if (!v) m.detailLabels.forEach((l) => (l.enabled = false));
  }
  cell.group.visible = v;
  cell.part.visible = v;
  environment.group.visible = v;
  nodeValidators.setVisible(v);   // per-node comparator badges belong to the 3-node rig
}

// camera framing per mode: the fleet floor is much wider than the 3-node triangle
const FLEET_HOME = { pos: new THREE.Vector3(0, 30, 40), tgt: new THREE.Vector3(0, 0.5, 1.5) };

// --- interaction: hover / click-inspect / double-click focus -----------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hitboxes = Object.values(machines).map((m) => m.hitbox);
let hovered = null, selected = null, focusedId = null, downPos = null;
const HOME = { pos: new THREE.Vector3(2.5, 13, 20.5), tgt: new THREE.Vector3(0.5, 0.9, -0.3) };
let camTween = null;

function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (fleetMode) return fleetFloor.pick(raycaster);
  const hit = raycaster.intersectObjects(hitboxes, false)[0];
  return hit ? hit.object.userData.machineId : null;
}

function flyTo(pos, tgt) {
  camTween = { fromPos: camera.position.clone(), toPos: pos.clone(), fromTgt: controls.target.clone(), toTgt: tgt.clone(), t: 0, dur: 0.9 };
}
function focusFly(id) {
  focusedId = id; // reveal this node's sensor rig + L1–L4 labels while focused
  if (fleetMode) {
    const p = fleetFloor.nodeWorldPos(id);
    if (heroId !== id) hideHero();
    showHero(id);   // upgrade the focused machine to the full 222-part CAD for close inspection
    if (p) flyTo(new THREE.Vector3(p.x + 3.2, 3.6, p.z + 6), new THREE.Vector3(p.x, 1.2, p.z));
    return;
  }
  const p = machines[id].group.position;
  flyTo(new THREE.Vector3(p.x + 3.2, 4.4, p.z + 7), new THREE.Vector3(p.x + 1.0, 1.6, p.z)); // bias to edge node so L1–L4 read
}
function resetView() { focusedId = null; hideHero(); flyTo(fleetMode ? FLEET_HOME.pos : HOME.pos, fleetMode ? FLEET_HOME.tgt : HOME.tgt); }
// remembered camera per mode, so switching scenarios restores where you left THIS mode's view
const savedCam = { three: null, fleet: null };

canvas.addEventListener("pointerdown", (e) => { audio.unlock(); camTween = null; downPos = { x: e.clientX, y: e.clientY }; });
// any scroll/zoom immediately hands control to the user — no fighting an in-progress fly-to
canvas.addEventListener("wheel", () => { camTween = null; }, { passive: true });
canvas.addEventListener("pointermove", (e) => {
  hovered = pick(e);
  canvas.style.cursor = hovered ? "pointer" : "default";
});
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
let tick = 0, playing = false, speed = 0.25, acc = 0, lastTs = null, lastRendered = -1;

const hud = createHud({
  onSelectScenario: (name) => select(name),
  onPlayToggle: () => (playing ? pause() : play()),
  onScrub: (t) => { pause(); setTick(t); },
  onSpeed: (s) => { speed = s; },
});

// sound on/off toggle (default on; audio still needs a user gesture to actually start — the click
// that flips this counts, and so do play / canvas interactions).
const soundBtn = document.getElementById("sound");
if (soundBtn) {
  const paint = () => {
    const on = audio.isEnabled();
    soundBtn.textContent = on ? "🔊" : "🔇";
    soundBtn.classList.toggle("off", !on);
    soundBtn.title = on ? "sound on — mute alarms" : "sound off — unmute alarms";
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

// how hard the spindle shakes — from the REAL state/trust, never a fabricated anomaly number
function shakeLevel(ns) {
  if (ns.state === "UNKNOWN") return 1.0;
  if (ns.state === "STALE") return 0.4;
  return ns.confirmed_fault ? 0.5 : (1 - clamp01(ns.self_trust)) * 0.6;
}

function readoutHTML(ns, color) {
  const pct = Math.round(clamp01(ns.self_trust) * 100);
  const css = hexCss(color);
  // trust-gate firebreak (brief §6.3): a node that may not teach is shown listen-only, and if it
  // still detects a fault while gated we say so — the anti-cascade beat, straight from the log.
  const gated = ns.should_teach === false;
  const gateLine = gated
    ? `<div class="rgate">⊘ gossip gated · listen-only${ns.confirmed_fault ? " · fault not taught" : ""}</div>`
    : "";
  // machine-stop read-out: a confirmed defect HALTS the machine (detect → act: stop the spindle so
  // it can't scrap parts). Keyed on the REAL logged confirmed_fault, never a fabricated stop. The
  // TEXT + colour say WHY it stopped (new pattern / born-wise / unknown) — matching the ring glow.
  const haltTxt = ns.state === "UNKNOWN" ? "⏹ STOPPED · unknown pattern → human"
    : ns.recognition_source === "PEER" ? "⏹ STOPPED · defect found (born-wise)"
    : "⏹ STOPPED · new defect pattern";
  const haltLine = ns.confirmed_fault ? `<div class="rhalt" style="color:${css};border-top-color:${css}66">${haltTxt}</div>` : "";
  // channel-integrity read-out (dual-path comparator): shown only when the log flagged this node's
  // link — a rejected tampered copy (REJECT) or a single-path delivery (DEGRADED). Straight from the fold.
  const chanLine = ns.channel && ns.channel !== "OK"
    ? `<div class="rchan">${ns.channel === "REJECT"
        ? `✕ path mismatch · tampered copy from ${ns.channel_from ?? "peer"} rejected`
        : `△ single-path · degraded${ns.channel_from ? ` (from ${ns.channel_from})` : ""}`}</div>`
    : "";
  return `<div class="rdline" style="color:${css}">${ns.state} · trust ${ns.self_trust.toFixed(2)}</div>`
    + `<div class="cband"><i style="width:${pct}%;background:${css}"></i></div>`
    + `<div class="ccap">self-trust (conformal-derived)</div>`
    + haltLine + gateLine + chanLine;
}

async function init() {
  scenarios = await fetchScenarios();
  hud.setScenarios(scenarios, scenarios[0]?.name);
  if (scenarios.length) await select(scenarios[0].name);
}

async function select(name) {
  meta = scenarios.find((s) => s.name === name);
  const raw = await fetchEvents(name);
  normEvents = toRenderEvents(raw);
  fold = buildFold(meta, normEvents);
  gossip.clear();
  dataflow.clear();
  fleetFloor.clearFx();   // drop any in-flight fleet gossip shockwaves/arcs from the prior scenario
  hideHero();             // retire the hero-cell CAD (and un-hide its instanced body) on switch
  closeInspector();
  focusedId = null;

  // mode swap: a 50-node fleet50_* scenario renders on the instanced factory floor; the 3-node
  // scenarios keep the detailed CAD rig. Same fold/playback/HUD either way — only the scene swaps.
  // remember where the user left the OUTGOING mode's camera before we (maybe) swap framing
  const prevMode = fleetMode ? "fleet" : "three";
  savedCam[prevMode] = { pos: camera.position.clone(), tgt: controls.target.clone() };

  fleetMode = meta.nodes.length > 3;
  const newMode = fleetMode ? "fleet" : "three";
  setThreeNodeRigVisible(!fleetMode);
  fleetFloor.setVisible(fleetMode);
  fleetCells.setVisible(fleetMode);
  fleetComms.setVisible(fleetMode);   // 5-batch router + HSR ring topology (fleet floor only)
  document.getElementById("caption")?.classList.toggle("hidden", fleetMode); // caption is 3-node only
  scene.fog.density = fleetMode ? 0.008 : 0.019;   // wider floor -> thinner fog so far cells read
  controls.maxDistance = fleetMode ? 100 : 64;
  setShadowMode(fleetMode);                        // widen the shadow frustum for the fleet floor
  camTween = null;                                  // stop any in-progress fly (camera stays put)

  // camera only reframes when the MODE actually changes (3-node <-> fleet need different framing).
  // switching between same-mode scenarios KEEPS the camera exactly where the user left it.
  if (newMode !== prevMode) {
    const c = savedCam[newMode] || (fleetMode ? FLEET_HOME : HOME);
    camera.position.copy(c.pos); controls.target.copy(c.tgt); controls.update();
  }

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
  if (fleetMode) fleetFloor.applyStates(snap.nodes);
  else for (const id in machines) applyNodeState(machines[id], snap.nodes[id], id);
  hud.setTransport({ tick: t, maxTick: fold.maxTick, playing, act: actFor(t) });
  hud.renderTicker(normEvents, t);
  hud.setAlarm(snap.fleet);
  if (!fleetMode) updateCaption(t, snap);
  if (selected) refreshInspector(); // keep an open inspector in sync while scrubbing/playing
}

// lower-third narration — a plain-English read of what the fold + this tick's beats mean. Every
// line is derived from real logged fields; it explains the state, it never invents one.
function updateCaption(t, snap) {
  const el = document.getElementById("caption");
  if (!el) return;
  // when a node is under inspection its live console IS the detailed narration — the ambient
  // caption steps aside so the two never fight for the same bottom strip.
  if (selected) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const evs = fold.byTick.get(t) || [];
  const find = (k) => evs.find((e) => e.kind === k);
  let cls = "cyan", text = null;
  const alarm = find("alarm"), esc = find("escal"), st = find("stale"),
        rec = find("recover"), tc = find("teach"), ln = find("learn"), rej = find("reject");
  // born-wise predictor: a node recognizing a PEER's taught pattern in its OWN data (real
  // recognition_source field). This is the "predict from an existing pattern" beat.
  const bw = Object.keys(snap.nodes).find((id) => snap.nodes[id].recognition_source === "PEER");
  if (alarm) {
    cls = "red";
    text = bw
      ? `⚠ SYSTEMIC BATCH DEFECT — NODE ${bw} saw the SAME pattern in its own machine that a peer already taught. Two machines, one signature → a bad batch caught fleet-wide.`
      : "⚠ SYSTEMIC BATCH DEFECT — the same premature signature on multiple machines at once. A bad tool/material lot, caught fleet-wide.";
  }
  else if (esc) { cls = "red"; text = `NODE ${esc.node} confirmed a novel fault no peer has seen — machine halted to prevent scrap, escalating to a human.`; }
  else if (st) { cls = "amber"; text = `NODE ${st.node} self-quarantined — self-trust fell below the safety threshold. It keeps listening, but stops teaching so it can't poison the fleet.`; }
  else if (rec) { cls = "teal"; text = `NODE ${rec.node} re-earned trust from sustained healthy operation — re-baselined and rejoining the fleet, teaching re-enabled.`; }
  else if (rej) { cls = "magenta"; text = `NODE ${rej.node}'s on-node comparator caught a tampered copy of ${rej.from ?? "a peer"}'s signature on path B — the two diverse channel copies disagreed, so it was rejected before it could poison memory. The fleet still learns via the clean path.`; }
  else if (tc) { cls = "cyan"; text = `NODE ${tc.from} taught its fault signature to the fleet — peer-to-peer, only the signature crosses the wire.`; }
  else if (ln) { cls = "cyan"; text = ln.bornwise ? `NODE ${ln.node} recognized the fault from ${ln.from}'s signature — born-wise, though it never experienced it.` : `NODE ${ln.node} ingested a peer signature from ${ln.from}.`; }
  else if (bw) { cls = "teal"; text = `NODE ${bw} sees a pattern in its own machine that matches one a peer taught — recognizing it born-wise and raising a warning, no human needed (predicted from an existing pattern).`; }
  else {
    // idle dwell: describe the fleet from the folded snapshot
    const ns = snap.nodes;
    const stale = Object.keys(ns).find((id) => ns[id].state === "STALE");
    const faulted = Object.keys(ns).find((id) => ns[id].confirmed_fault || ns[id].state === "UNKNOWN");
    const compromised = Object.keys(ns).find((id) => ns[id].channel === "REJECT");
    if (stale) { cls = "amber"; text = `NODE ${stale} is quarantined — listening to peers, not teaching, while it waits to re-earn trust.`; }
    else if (faulted) { cls = "red"; text = `NODE ${faulted} halted on a confirmed defect — the machine stopped so it can't scrap parts. Its signature is already armed across the fleet.`; }
    else if (compromised) { cls = "magenta"; text = `NODE ${compromised}'s wireless path (B) is flagged — a tampered copy from ${ns[compromised].channel_from ?? "a peer"} was cross-checked against the wired copy and rejected. Its comparator keeps guarding memory.`; }
    else { cls = "cyan"; text = "Fleet healthy — three identical machines, all confident. The fleet is the baseline each one is judged against."; }
  }
  el.className = "caption " + cls;
  el.textContent = text;
}

// derive a node's most recent activity (and the layer it came from) at tick t — honest mapping
// from the last logged event, NOT a fabricated "active layer".
function lastActivity(id, t) {
  for (let i = normEvents.length - 1; i >= 0; i--) {
    const e = normEvents[i];
    if (e.t > t) continue;
    if (e.kind === "teach" && e.from === id) return "L4 · Zenoh Gossip — taught a signature";
    if (e.kind === "learn" && e.node === id) return "L3 · Case Memory — born-wise learn from " + e.from;
    if (e.kind === "alarm" && e.node === id) return "L4 · Zenoh Gossip — systemic match";
    if (e.kind === "escal" && e.node === id) return "escalated to human";
    if (e.kind === "stale" && e.node === id) return "L2 · drift-conscience — self-quarantine";
  }
  return null;
}

function refreshInspector() {
  if (!selected || !fold) return;
  const ns = fold.snapshotAt(tick).nodes[selected];
  if (!ns) return;
  const color = situationColor(ns);   // colour by fault flavour (matches the machine's ring/spindle)
  const css = hexCss(color);
  const faultKind = ns.state === "UNKNOWN" ? "unknown pattern → human"
    : ns.recognition_source === "PEER" ? "born-wise (found from a peer's pattern)"
    : "new pattern (first-hand)";
  const act = ns.confirmed_fault ? "L1 · Isolation Forest — fault detected" : "L1–L2 · monitoring (healthy)";
  const last = lastActivity(selected, tick) || act;
  const mem = ns.memory.length
    ? ns.memory.map((m) => `<li><code>${m.sig_id.slice(0, 12)}</code> ← <b>${m.provenance}</b> <span class="dim">@t${m.tick}</span></li>`).join("")
    : `<li class="dim">— none —</li>`;
  // "why this state" — read straight off the folded fields (never fabricated)
  const reason = ns.state === "STALE" ? "baseline drift detected → self-quarantined (listen, don't teach)"
    : ns.state === "UNKNOWN" ? "confirmed novel fault, unseen fleet-wide → machine halted, escalating to a human"
    : ns.confirmed_fault ? (ns.recognition_source === "PEER"
        ? "confirmed fault — recognized from a peer signature (born-wise) → machine halted"
        : "confirmed fault — recognized first-hand → machine halted")
    : "healthy — no drift, no confirmed fault";
  const pct = Math.round(clamp01(ns.self_trust) * 100);
  // self-trust gauge with the τ_stale threshold marker (50%): below it the node self-quarantines
  const gauge = `<div class="gauge"><div class="gfill" style="width:${pct}%;background:${css}"></div>`
    + `<div class="gtau" title="τ_stale = 0.50"></div></div>`
    + `<div class="gcap"><span style="color:${css}">self-trust ${pct}%</span><span>τ_stale 50%</span></div>`;
  // dual-path comparator (PRP + 1oo2D) verdict — straight from the folded channel field
  const chanTxt = ns.channel === "REJECT"
    ? `<b style='color:var(--integrity)'>✕ path mismatch → rejected</b>`
    : ns.channel === "DEGRADED" ? "<b style='color:var(--stale)'>△ single-path (degraded)</b>"
    : "<span style='color:var(--confident)'>✓ 2-path verified</span>";
  const rows = [
    ["recognition", ns.recognition_source],
    ["confirmed fault", ns.confirmed_fault ? "yes" : "no"],
    ["machine", ns.confirmed_fault ? `<b style='color:${css}'>⏹ STOPPED · ${faultKind}</b>` : "running"],
    ["teaching", ns.should_teach ? "enabled" : "<b style='color:var(--stale)'>gated · listen-only</b>"],
    ["channel (co-MCU)", chanTxt],
    ["last activity", last],
  ].map(([k, v]) => `<div class="irow"><span>${k}</span><span>${v}</span></div>`).join("");
  const el = document.getElementById("inspector");
  el.innerHTML = `<div class="ihead"><b style="color:${css}">NODE ${selected}</b> · ${ns.role}`
    + `<button id="iclose" aria-label="close">×</button></div>`
    + `<div class="istate" style="color:${css}">● ${ns.state}</div>`
    + `<div class="ireason">${reason}</div>${gauge}${rows}`
    + `<div class="isig">signatures in memory (${ns.memory.length})<ul>${mem}</ul></div>`;
  el.classList.remove("hidden");
  document.getElementById("iclose").onclick = closeInspector;
}

function closeInspector() {
  selected = null;
  document.getElementById("inspector").classList.add("hidden");
  if (fold && !fleetMode) updateCaption(tick, fold.snapshotAt(tick)); // bring the caption back
}

function applyNodeState(m, ns, id) {
  if (!ns) return;
  // colour by the fault SITUATION (new pattern / born-wise / unknown / stale / healthy), not just
  // the raw state — so the three fault flavours read apart on the ring, spindle, aura + label.
  const color = situationColor(ns);
  m.ring.material.color.setHex(color);
  m.ring.material.emissive.setHex(color);
  const s = 0.62 + 0.38 * clamp01(ns.self_trust); // trust ring shrinks as self-trust falls
  m.ring.scale.set(s, s, 1);
  m.aura.material.color.setHex(color);
  m.spindle.material.emissive.setHex(color);
  if (m._cad) m._cad.spindleMat.emissive.setHex(color); // CAD spindle glows the state colour too
  m.title.el.textContent = `NODE ${id} · ${ns.role}`;
  m.stateLabel.el.innerHTML = readoutHTML(ns, color);
  // L4 (Zenoh gossip) plate goes grey/offline when the node may not teach — the visible firebreak
  m.plates[3].material.emissive.setHex(ns.should_teach === false ? COLORS.steelDark : COLORS.cyan);
  // warning beacon + self-quarantine dome + arc-mute, all from the SAME folded state:
  //   STALE -> amber (listen, don't teach) · UNKNOWN/active fault -> red · else off.
  const gated = ns.should_teach === false;
  // beacon mode matches the situation colour: amber STALE · red UNKNOWN · violet born-wise defect ·
  // orange new-pattern defect · off healthy.
  const beaconMode = ns.state === "STALE" ? "amber"
    : ns.state === "UNKNOWN" ? "red"
    : ns.confirmed_fault ? (ns.recognition_source === "PEER" ? "violet" : "orange")
    : "off";
  beacons.setMode(id, beaconMode);
  quarantine.setIsolated(id, gated);   // dome descends while self-quarantined
  gossip.setMuted(id, gated);          // its peer arcs mute (can't teach) but pulses still arrive
  // dual-path comparator badge: LOG-DRIVEN from the folded channel field (magenta only on a real
  // CHANNEL_REJECT; amber on a single-path degraded delivery; otherwise a healthy link).
  nodeValidators.setStatus(id, ns.channel === "REJECT" ? "reject" : ns.channel === "DEGRADED" ? "degraded" : "ok");
  // machine-stop: a confirmed defect halts this machine (the render loop eases it to rest). Straight
  // off the real logged confirmed_fault — the "detect → act (stop)" step made visible, not computed.
  m._halted = !!ns.confirmed_fault;
  m._shake = shakeLevel(ns);
  m._auraBase = ns.state === "UNKNOWN" ? 0.4 : ns.state === "STALE" ? 0.3 : 0.22;
  m._ns = ns;
}

// spawn transient motion + audio for the events at tick t (only while playing forward). Every cue
// here is triggered by a REAL logged beat — the audio-visual "beep + lights" mirror the log.
function fireTransients(t) {
  const evs = fold.byTick.get(t);
  if (!evs) return;
  if (fleetMode) return fireFleetTransients(evs);   // P4: fleet-scale gossip FX + throttled audio
  for (const e of evs) {
    if (e.kind === "learn" && e.from && e.node) {
      gossip.spawn(e.from, e.node, { born: e.bornwise, onArrive: () => dataflow.flashPlate(e.node, 2) }); // L3 absorb
      dataflow.spawn(e.node, { strong: true });
      audio.cue("learn");
    } else if (e.kind === "teach" && e.from) {
      dataflow.flashPlate(e.from, 3);   // L4 (Zenoh gossip) lights on publish
      dataflow.spawn(e.from, { strong: true });
      gossip.broadcast(e.from);         // shockwave: teacher pushes to the mesh
      audio.cue("teach");
    } else if (e.kind === "escal" && e.node) {
      audio.cue("fault"); flashScreen("red");     // confirmed novel fault -> escalate
    } else if (e.kind === "stale" && e.node) {
      audio.cue("stale"); flashScreen("amber");   // self-quarantine (down-swing)
    } else if (e.kind === "alarm") {
      audio.cue("klaxon"); flashScreen("red");    // systemic batch defect
    } else if (e.kind === "recover" && e.node) {
      audio.cue("recover"); flashScreen("teal");  // re-earned trust -> rejoin
      gossip.broadcast(e.node);                    // reconnects to the mesh
    } else if (e.kind === "reject" && e.node) {
      // the on-node comparator caught a tampered copy on path B -> dropped before ingest. Send the
      // rejected copy down the arc (magenta) + flash the validator badge: the anti-poisoning gate.
      if (e.from) gossip.reject(e.from, e.node);
      nodeValidators.flagReject(e.node);
      audio.cue("reject"); flashScreen("magenta");
    } else if (e.kind === "degraded" && e.node) {
      flashScreen("amber");                        // only one path delivered -> accepted degraded
    }
  }
}

// fleet-scale transient layer (P4 parity): the SAME logged beats as the 3-node rig, scaled to 50 —
// a teacher broadcast shockwave + per-learn arcs/absorb pops on the floor, and audio fired ONCE per
// event KIND per tick (never 50 simultaneous beeps). Every cue is a real logged beat, never computed.
function fireFleetTransients(evs) {
  const kinds = new Set();
  let vig = null;
  for (const e of evs) {
    if (e.kind === "teach" && e.from) { fleetFloor.broadcast(e.from); kinds.add("teach"); }
    else if (e.kind === "learn" && e.from && e.node) { fleetFloor.gossipArc(e.from, e.node, e.bornwise); kinds.add("learn"); }
    else if (e.kind === "escal") { kinds.add("escal"); vig = vig || "red"; }
    else if (e.kind === "stale") { kinds.add("stale"); vig = vig || "amber"; }
    else if (e.kind === "alarm") { if (!kinds.has("alarm")) fleetFloor.alarmPulse(e.peers); kinds.add("alarm"); vig = "red"; }
    else if (e.kind === "recover") { kinds.add("recover"); vig = vig || "teal"; }
    else if (e.kind === "reject") { kinds.add("reject"); vig = vig || "magenta"; }
  }
  // one cue per kind (systemic dominates); the visual channels already show every individual node
  if (kinds.has("alarm")) audio.cue("klaxon");
  if (kinds.has("escal")) audio.cue("fault");
  if (kinds.has("stale")) audio.cue("stale");
  if (kinds.has("recover")) audio.cue("recover");
  if (kinds.has("reject")) audio.cue("reject");
  if (kinds.has("teach")) audio.cue("teach");
  if (kinds.has("learn")) audio.cue("learn");
  if (vig) flashScreen(vig);
}

// screen-space alert vignette (DOM overlay) — a brief flash on a major beat. Colour ← the beat.
let _flashTimer = null;
function flashScreen(kind) {
  const el = document.getElementById("vignette");
  if (!el) return;
  el.className = "vignette " + kind;      // retrigger the CSS pulse
  void el.offsetWidth;                     // force reflow so re-adding the class replays the animation
  el.classList.add("on");
  clearTimeout(_flashTimer);
  _flashTimer = setTimeout(() => el.classList.remove("on"), 700);
}

function play() {
  if (!fold) return;
  audio.unlock(); // resume the AudioContext inside this user gesture (autoplay policy)
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
function loop(ts) {
  const dt = clock.getDelta();
  const now = clock.elapsedTime;

  // camera fly-to (focus / reset); hands control back to OrbitControls when done
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / camTween.dur);
    const e = camTween.t * camTween.t * (3 - 2 * camTween.t); // smoothstep
    camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
    controls.target.lerpVectors(camTween.fromTgt, camTween.toTgt, e);
    if (camTween.t >= 1) camTween = null;
  }
  controls.update();

  // de-crowd: detail labels (sensor rig + L1–L4 + edge) only for the hovered or selected node
  for (const id in machines)
    for (const l of machines[id].detailLabels) l.enabled = (id === hovered || id === selected || id === focusedId);

  // playback advance (dead-tick compression); fire transients for each crossed tick
  if (playing && fold) {
    if (lastTs === null) lastTs = ts;
    acc += (ts - lastTs) * speed;
    lastTs = ts;
    let advanced = false;
    while (tick < fold.maxTick && acc >= fold.durations[tick]) {
      acc -= fold.durations[tick]; tick++; fireTransients(tick); advanced = true;
    }
    if (advanced && tick !== lastRendered) renderTick(tick);
    if (tick >= fold.maxTick) pause();
  }

  // fleet mode: one instanced update drives all 50 spindles + state discs (3-node rig is hidden)
  if (fleetMode) {
    fleetFloor.update(dt, now);
    fleetCells.update(dt, now);   // detailed instanced arms tend + conveyors run + parts flow
    fleetComms.update(dt, now);   // batch routers pulse + PRP frames chase the wired HSR ring
    // hero-cell: the focused machine's full CAD spins/parks + glows its state, driven by the SAME
    // folded fields as the instanced fleet (situationColor / confirmed_fault) — never a fake number.
    if (heroCad && heroId != null) {
      const hns = fold?.snapshotAt(tick)?.nodes[heroId];
      const sh = hns ? shakeLevel(hns) : 0;
      heroMotion += ((hns && hns.confirmed_fault ? 0 : 1) - heroMotion) * Math.min(1, dt * 2.4);
      const a = heroCad.anim;
      a.spindle.rotation.y += dt * (3.0 + sh * 9) * heroMotion;
      a.carriage.position.x = a.carriageBase.x + Math.sin(now * (0.5 + sh * 0.8)) * (0.45 + sh * 0.15) * heroMotion;
      if (hns) a.spindleMat.emissive.setHex(situationColor(hns));
    }
    gossip.update(dt);       // no-op: cleared on select, nothing spawned in fleet mode
    renderer.render(scene, camera);
    labels.update(camera, canvas.clientWidth, canvas.clientHeight);
    requestAnimationFrame(loop);
    return;
  }

  // per-machine continuous animation driven by folded state (+ cosmetic "machine is working")
  const hot = {};
  for (const id in machines) {
    const m = machines[id];
    const sh = m._shake || 0;
    const ph = m._phase || 0;
    if (sh > 0.45 && !m._halted) hot[id] = true;
    // machine-stop on defect: a node with a confirmed fault HALTS. `mo` eases 1→0 so the spindle
    // visibly spins DOWN and the carriage/head PARK back to base — a real "detect → act: stop the
    // machine" beat, driven only by the logged confirmed_fault (via m._halted), never fabricated.
    const target = m._halted ? 0 : 1;
    m._motion = (m._motion ?? 1) + (target - (m._motion ?? 1)) * Math.min(1, dt * 2.4);
    const mo = m._motion;
    // spindle: spins (× mo → spins down to a full stop when halted), jitters as the state degrades
    m.spindle.rotation.y += dt * (2.4 + sh * 7) * mo;
    m.spindle.position.x = m._spindleBase.x + Math.sin(now * 41) * 0.02 * sh * mo;
    m.spindle.position.z = m._spindleBase.z + Math.cos(now * 33) * 0.02 * sh * mo;
    // working motion: head traverses the gantry (X), table feeds (Z) — idle "alive", faster when
    // hot, and parks to base (× mo) when the machine is halted on a defect.
    m.head.position.x = m._headBase.x + Math.sin(now * (0.6 + sh * 0.9) + ph) * (0.55 + sh * 0.2) * mo;
    m.table.position.z = m._tableBase.z + Math.sin(now * (0.5 + sh * 0.5) + ph * 1.7) * 0.2 * mo;
    // hybrid: drive the CAD model's OWN spindle + carriage (the procedural ones are hidden).
    // spindle spins, carriage sweeps the gantry in X — "machine is running"; speed/jitter scale
    // with the REAL folded state (sh), and × mo so a halted machine spins down + parks too.
    const cad = m._cad;
    if (cad) {
      cad.spindle.rotation.y += dt * (3.0 + sh * 9) * mo;
      const sweep = Math.sin(now * (0.5 + sh * 0.8) + ph) * (0.45 + sh * 0.15);
      cad.carriage.position.x = cad.carriageBase.x + (sweep + (sh > 0.01 ? Math.sin(now * 47) * 0.02 * sh : 0)) * mo;
      cad.carriage.position.z = cad.carriageBase.z + (sh > 0.01 ? Math.cos(now * 39) * 0.015 * sh : 0) * mo;
    }
    // aura / ring breathe with state; hover brightens the accent rail (procedural) or, when it's
    // hidden in hybrid, the trust ring — so the selection cue survives either body.
    const hov = id === hovered ? 1.0 : 0;
    m.aura.material.opacity = (m._auraBase || 0.22) + Math.sin(now * 2.4) * 0.06 + sh * 0.16;
    m.ring.material.emissiveIntensity = 0.25 + Math.sin(now * 2.0) * 0.08 + sh * 0.22 + hov * 0.9;
    m.accent.material.emissiveIntensity = 0.45 + hov * 1.3 + Math.sin(now * 2) * 0.05;
  }

  gossip.update(dt);
  dataflow.update(dt, hot);
  beacons.update(dt, now);      // rotating warning lights (mode ← folded state)
  quarantine.update(dt, now);   // self-quarantine dome ease in/out
  nodeValidators.update(dt, now); // per-node comparator badges (status ← folded channel field)
  cell.update(dt); // illustrative pick-and-place choreography

  renderer.render(scene, camera);
  labels.update(camera, canvas.clientWidth, canvas.clientHeight);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

init()
  .then(() => {
    document.getElementById("loading")?.classList.add("hidden");
    window.__vivariumReady = true;
    window.__vivarium = {
      THREE, scene, camera, controls, renderer, machines, gossip, dataflow, cell,
      nodeValidators, fleetComms, fleetFloor, fleetCells,
      _render: () => renderer.render(scene, camera),
      get fold() { return fold; }, get tick() { return tick; },
      _fire: fireTransients, // exposed for in-browser verification (hidden-tab rAF is throttled)
      _inspect: (id) => { selected = id; refreshInspector(); },
      _focus: focusFly, _reset: resetView,
    };
    console.log("[vivarium] ready — realistic machines (PBR env, shadows, glass), working motion, inspector");
  })
  .catch((e) => console.error("[vivarium] init failed:", e));
