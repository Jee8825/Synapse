# CLAUDE.md — SYNAPSE (Round 1 Simulation Prototype)

> **Read this fully before writing any code.** This file is the source of truth for design intent.
> The concept is **LOCKED**. Do not re-pitch the use case, swap the domain, or "improve" the
> architecture without an explicit instruction in the prompt. Your job is to **build and refine
> the system described here**, not to redesign it.

> **▶ Resuming with no prior context (fresh session)? ORIENT FIRST — do not start cold.**
> 1. Read this file's **addenda** (bottom of file, newest last) — they hold the current design state.
> 2. Skim `graphify-out/GRAPH_REPORT.md` and run `graphify query "<your task>"` to locate code.
> 3. Open the Obsidian map-of-content **`SYNAPSE-Home.md`** + the relevant `notes/` pages.
> 4. Jump to **`## Resume here`** at the very end of this file for current status + the next task.
> This orientation step is **mandatory** whenever you lack context — these three sources (this file,
> graphify, the vault) are the project's persistent memory.

---

## 0. One-paragraph orientation

SYNAPSE is a decentralized, edge-AI, multi-agent **fleet-learning** system for the Tata
Technologies InnoVent ("AI at the Edge") hackathon. The anchor use case is a fleet of identical
CNC machining centers on a shop floor. Each machine runs an edge node; nodes share compact
**fault signatures** peer-to-peer — **never raw telemetry** — with **no central server and no
cloud**. The capability incumbents structurally lack, and the thing we build, is
**cross-machine federation + systemic batch-defect immunity**: the fleet catches a developing
fault on one machine by noticing its behavior *diverges from identical peers*, and catches a bad
tool/material batch by noticing the *same premature signature appears across many machines at
once*.

**This repository is the Round 1 deliverable: a software simulation, on one developer machine,
with no physical hardware.** See §2 for exactly what that means and what is out of scope.

---

## 1. The locked idea (do not change)

**Positioning line (memorize, use in docs/comments):**
> "AMP.IoT shows you a machine is degrading. SYNAPSE predicts the tool's remaining life with
> calibrated confidence, lets the fleet catch a bad batch before it scraps parts, and schedules
> the swap — peer-to-peer, on the shop floor, no cloud round-trip. We complement Tata's product,
> we don't compete with it."

**The four capabilities that define the system:**

1. **Cross-machine federation.** Identical machines running the same part program should wear
   tools and behave near-identically. A machine whose signature **diverges** from its peers
   reveals a developing spindle/alignment fault — flagged by the **fleet**, not a fixed threshold.
2. **Systemic batch-defect immunity.** A bad tool/insert batch or bad material lot shows up as the
   **same premature signature across many machines at once** = a systemic defect that per-machine
   monitoring is blind to. The fleet catches it before it scraps parts line-wide.
3. **Calibrated tool Remaining-Useful-Life (RUL).** Conformal prediction gives a *calibrated
   confidence band*, not a late threshold alert.
4. **Serverless, signature-only, trust-gated.** Brokerless peer-to-peer; only compact signatures
   cross the wire; a node that can't trust itself stops teaching the fleet.

**Value framing (do not overclaim):** scrap reduction + tool-life optimization + batch-defect
catch. **NOT** "prevent catastrophic ₹-crore failure" — CNC maintenance is routine; overclaiming
loses credibility with judges who have shipped real systems.

---

## 2. ROUND 1 SCOPE — read this twice

### What we ARE building (Round 1)
- A **pure-software simulation** of a **3-node fleet**, running as **3 independent OS processes**
  on a single developer machine (Apple Silicon macOS), plus a 4th **dashboard** process.
- The **real L1→L4 intelligence stack** (see §4) running for real on each node.
- **Real Eclipse Zenoh peer-mode networking** between the three node processes over localhost.
- **Sensor input is the only thing simulated**: we **replay recorded real-machinery datasets**
  (CWRU + NASA IMS bearing data) window-by-window into the stack, with **scripted, deterministic
  fault injection** to produce the demo scenarios (§6).
- A **local web dashboard** at `http://localhost:8080`.
- A **deterministic, reproducible run** suitable for a **recorded demo video** + a clean public
  GitHub repo. (Round 1 / Stage 1 has **no live demo** — optimize for repeatable capture.)

### What we are NOT building (Round 1) — do not do these
- ❌ **No physical hardware code.** No GPIO, no I²C, no sensor drivers, no Raspberry Pi specifics.
  (Hardware is Stage 2 — see §9.) You *will* define the `HardwareSensorSource` **interface stub**
  so it slots in later, but you do **not** implement real drivers now.
- ❌ **No simulation software / digital twin / physics model.** No MATLAB/Simulink, ANSYS, Gazebo,
  SimPy, AnyLogic, discrete-event simulators. We **replay real recorded data**; we do **not**
  synthesize vibration or model cutting physics. If you reach for a physics simulator, stop.
- ❌ **No MQTT / Mosquitto / any broker.** Transport is **Zenoh peer mode only** (§4, L4). A prior
  project draft mentioned MQTT — that is **superseded and wrong**. Never use it.
- ❌ **No cloud, no central server, no external API for the core system.**
- ❌ **No raw telemetry on the wire.** Only compact signatures may be gossiped.

### The single most important design principle
> **Only the `SensorSource` is simulated. Everything above it is real production code.**

```python
class SensorSource:                         # interface (synapse/sensors/base.py)
    def next_window(self) -> FeatureWindow: ...

class DatasetReplaySource(SensorSource):    # ROUND 1: replays CWRU/NASA windows + fault injection
    ...

class HardwareSensorSource(SensorSource):   # STAGE 2 STUB: will read MPU6050 / INA219 / DS18B20
    ...                                      # interface only for now — do NOT implement drivers
```

In Stage 2 we swap `DatasetReplaySource` → `HardwareSensorSource`. **Nothing else changes.** Build
every layer so this is true. This is also the honest jury reframe: "Stage 2 is a pure
hardware-swap; the software risk is already retired."

---

## 3. What is REAL vs SIMULATED (state this honestly everywhere)

| Layer | Round 1 status |
|---|---|
| L1 anomaly detection (Isolation Forest / small 1D-CNN) | **Real production code** |
| L2 drift + conformal self-trust (ADWIN / MAPIE) | **Real production code** |
| L3 FAISS case memory (provenance / decay / confidence / dedup) | **Real production code** |
| L4 Zenoh **peer-mode** gossip | **Real** — 3 independent processes, true P2P over localhost |
| Sensor input | **Replayed** CWRU / NASA IMS lab-rig data + scripted fault injection |

The replayed data comes from **real instrumented machinery rigs** (the same datasets academic
predictive-maintenance work is built on). The motor rig planned for Stage 2 is described as a
**"scaled spindle analog, like the lab rigs that produced CWRU/NASA"** — never as a real CNC.

---

## 4. The 4-layer per-node architecture (the actual system)

Each node integrates four layers into one daemon (`synapse/node/daemon.py`).

- **L1 — Worker model** (`synapse/l1_worker/`)
  Lightweight on-edge anomaly detection: **Isolation Forest** (primary) or a small **1D-CNN**.
  Trained on healthy windows; scores incoming windows. Maps to **ISO 13374 / OSA-CBM**
  state-detection + health-assessment blocks. Inference must be cheap (target < ~5 ms/window).

- **L2 — Drift-conscience** (`synapse/l2_trust/`)
  **ADWIN** concept-drift detection (via **River**) + **conformal prediction** (via **MAPIE**) for
  a **calibrated self-trust score**. A node that detects it has drifted from its training
  distribution **lowers its own trust and STOPS teaching the fleet** (so it cannot poison peers).
  This layer owns the **three-state behavior** below.

- **L3 — Case memory** (`synapse/l3_memory/`)
  A compact **fault-signature** store: each signature carries a **feature vector + provenance +
  decay + confidence**. **FAISS-style** approximate nearest-neighbour similarity lookup.
  **Dedup/merge** repeats into one entry with a count (a recurring micro-stutter is one entry, not
  thousands). **Bounded store** with composite eviction (recency + access-frequency + severity) —
  memory is bounded by design, never crashes, never randomly deletes critical knowledge.
  *(This layer is the project's "Recall" memory engine — decay, conflict detection, provenance,
  Bayesian confidence — reused for fault signatures.)*

- **L4 — Gossip transport** (`synapse/l4_gossip/`)
  **Brokerless peer-to-peer via Eclipse Zenoh PEER MODE.** **Event-triggered** — a node gossips a
  signature **only on a confirmed new fault**, never a steady telemetry stream.
  **Trust-gated contribution** — a node only teaches when its L2 self-trust is high enough.
  Payload = **compact signature only**, never raw telemetry.

### The three-state behavior (the novelty)
1. **"I'm confident"** — high self-trust; detect, diagnose, and teach the fleet.
2. **"I'm stale — listen, don't teach"** — drift detected / self-trust low; consume peer knowledge
   but contribute nothing (self-quarantine).
3. **"Neither I nor any trusted peer has seen this"** — a **fleet-wide unknown** → escalate to a
   human.

### The upgrade ladder
`detect → diagnose → recommend → act-or-escalate`, with a **Planner→Critic guardrail**:
**self-heal only soft faults; escalate or refuse otherwise.** Never auto-act on a hard fault.

---

## 5. Node roles (Round 1: all three are replay-driven)

| Node | Role | Round 1 behavior |
|---|---|---|
| **Node A** | **Teacher** | Replays fault-onset data. Detects the fault first, creates the original signature, gossips it. |
| **Node B** | **Learner** | Replays healthy data. Receives A's signature via gossip → recognizes a fault it never experienced ("born wise"). |
| **Node C** | **Stale** | Replays data that drifts from the training distribution. L2 self-trust drops → self-quarantines ("listen, don't teach"). |

---

## 6. The three demo scenarios (anchor every module to these)

Build nothing that doesn't serve one of these three. They are the "money shots."

1. **Divergence catch** — Node A replays fault-onset windows while B and C stay healthy →
   A's signature **diverges from its identical peers** → flagged by the fleet (not a threshold).
2. **Systemic batch-defect immunity** — feed the **same** fault onset to **A and B at the same
   tick** → identical premature signature appears on two nodes at once → flagged as **systemic**,
   not per-machine wear.
3. **Stale self-quarantine** — Node C's replayed data drifts → ADWIN + conformal drop its
   self-trust → it transitions to "listen, don't teach" and stops contributing.

**Stretch (only after the three core scenarios are solid):**
- RUL with a **calibrated conformal confidence band** plotted on the dashboard.
- "Born-wise" highlight: Node B flags a fault purely from a gossiped signature.
- **Resilience proof:** kill Node A's process mid-run → B and C keep gossiping (no single point of
  failure). This works *because* Zenoh peer mode is real even on localhost.

**Determinism is mandatory:** every scenario run must be byte-for-byte reproducible (seed all RNGs;
fixed replay order; scripted tick schedule). Round 1 is a *recorded* demo — repeatability is the
whole point.

---

## 7. Tech stack (locked — pin every version)

- **Language:** Python 3.11+
- **L1:** `scikit-learn` (Isolation Forest); optional small 1D-CNN via `torch`/`onnxruntime` only
  if Isolation Forest proves insufficient — prefer Isolation Forest.
- **L2:** `river` (ADWIN concept drift) + `mapie` (conformal prediction).
- **L3:** `faiss-cpu` (or `numpy` cosine similarity if FAISS install is fiddly on arm64).
- **L4:** `eclipse-zenoh` (Python bindings), **peer mode**.
- **Dashboard:** `fastapi` + `uvicorn` backend; lightweight JS frontend (vanilla or a small
  framework). Served at `http://localhost:8080`.
- **Data:** CWRU Bearing Dataset + NASA IMS Bearing Dataset (download script into `data/`,
  which is git-ignored).

> ⚠️ **Library APIs drift.** River, MAPIE, and Zenoh change across versions. **Verify the actual
> current API before writing calls** (don't trust a remembered signature), and **pin exact
> versions** in `requirements.txt`. If a generated call fails, check the installed version's docs
> before "fixing" by guessing.

---

## 8. Proposed repository structure

Scaffold consistently with this layout. Adapt names if there's a strong reason, but keep the L1–L4
separation and the `sensors/` abstraction.

```
synapse/
├── CLAUDE.md                 # this file
├── README.md                 # honest POC framing (see §10)
├── requirements.txt          # pinned versions
├── data/                     # CWRU / NASA datasets (git-ignored)
├── scripts/
│   ├── download_data.py
│   ├── run_node.py           # launch one node daemon (args: role, source, config)
│   ├── run_dashboard.py
│   └── run_scenario.py       # orchestrates a full deterministic scenario
├── synapse/
│   ├── sensors/
│   │   ├── base.py           # SensorSource interface + FeatureWindow dataclass
│   │   ├── replay.py         # DatasetReplaySource (Round 1)
│   │   └── hardware.py       # HardwareSensorSource (Stage 2 STUB — interface only)
│   ├── features/
│   │   └── extract.py        # FFT bands, RMS, kurtosis, crest factor, current, temp
│   ├── l1_worker/
│   │   └── detector.py       # Isolation Forest worker model
│   ├── l2_trust/
│   │   ├── drift.py          # ADWIN wrapper
│   │   ├── conformal.py      # MAPIE wrapper → calibrated self-trust
│   │   └── state_machine.py  # confident / stale / unknown
│   ├── l3_memory/
│   │   ├── signature.py      # FaultSignature dataclass (vector, provenance, decay, confidence)
│   │   └── store.py          # FAISS store + dedup/merge + bounded eviction
│   ├── l4_gossip/
│   │   ├── transport.py      # Zenoh peer-mode session
│   │   └── protocol.py       # event-triggered + trust-gated contribution rules
│   ├── node/
│   │   └── daemon.py         # integrates L1–L4 into one running node
│   └── scenarios/
│       ├── divergence.py
│       ├── batch_defect.py
│       └── stale_quarantine.py
├── dashboard/
│   ├── server.py             # FastAPI; subscribes to the gossip bus
│   └── static/               # frontend (pale-cyan / light-blue aesthetic)
└── tests/                    # one test module per layer
```

---

## 9. Stage 2 (NOT Round 1 — context only, do not build now)

For awareness so your interfaces are future-proof. **Do not implement any of this in Round 1.**

- **Hardware (locked, ~₹35,000):** 3× Raspberry Pi 5 (8 GB) as fleet nodes + a sensor rig
  (**MPU6050** vibration, **INA219** current, **DS18B20** temperature, **DC motor + L298N** driver
  as a **scaled spindle analog**) + a travel router. (An **INMP441** acoustic mic is an optional
  add for an acoustic-emission parameter.)
- Stage 2 swaps `DatasetReplaySource` → `HardwareSensorSource`. Keep the `SensorSource` interface
  clean enough that this is the only change to the data path.

---

## 10. Coding conventions & guardrails

- **Style:** Python 3.11+, full type hints, `dataclass` for structured records, clear docstrings.
- **Explainability gate (important):** for every non-obvious algorithmic choice in L1–L4, add a
  short `# why:` comment. A teammate (Adhithya) will challenge each one — if a line can't be
  explained to a sharp jury, it doesn't ship. Favor clarity over cleverness.
- **Tests are part of "done."** Each layer needs a test that *proves the behavior*, not just that
  it runs. A scenario isn't done until it produces the expected fleet behavior deterministically.
- **Don't over-engineer.** No feature that doesn't serve one of the three scenarios in §6. No
  speculative abstraction beyond the `SensorSource` swap.
- **Determinism:** seed all RNGs; make replay order and tick schedules explicit and fixed.
- **Hard rules, never violate:** Zenoh peer mode only (never MQTT/broker); signatures only on the
  wire (never raw telemetry); no cloud/central server; trust-gated + event-triggered gossip.
- **Dashboard aesthetic:** clean, polished, **pale-cyan / light-blue**; technically accurate labels
  (fleet health, per-node trust state, divergence map, gossip event log, RUL band if built).

### Honest positioning (applies to README, comments, any generated copy)
- Frame everything as a **"validated proof-of-concept with a credible path to deployment,"**
  **not** production-ready. Concede gaps, then show the plan.
- **Novelty = the synthesis + application** (serverless, signature-only, batch-defect, trust-gated
  federation at the edge), **not** the primitives. Drift detection, conformal prediction, gossip,
  and federated distillation all exist separately. The honest claim: *"we could not find a system
  that does cross-machine, signature-only, batch-defect federation at the edge."*
- **Known pilot-phase gaps to own openly** (do not paper over):
  1. Long-horizon **trust-poisoning defense** at scale (not yet proven).
  2. **Cryptographic tamper-evident audit logging** for safety sign-off (append-only store is only
     a partial answer).
  3. **"Why not cloud"** answer = millisecond local decisions + OT segmentation forbidding raw-data
     export + no-single-point-of-failure resilience.

---

## 11. Glossary (use these terms precisely)

- **Signature / fault signature** — a compact feature-vector fingerprint of a fault, with
  provenance, decay, and confidence. The only thing that crosses the gossip wire.
- **Self-trust** — a node's calibrated confidence (from conformal + drift) that its own judgments
  are reliable. Drives the three-state behavior.
- **Drift-conscience (L2)** — the mechanism by which a node detects it has gone stale and
  voluntarily stops teaching.
- **Born-wise** — a node recognizing a fault it has never personally experienced, purely from a
  gossiped peer signature.
- **Trust-gate** — the rule that a node only contributes to the fleet when its self-trust is high.
- **Scaled spindle analog** — the Stage-2 motor rig; an honest stand-in for a CNC spindle, in the
  tradition of the lab rigs that produced the CWRU/NASA datasets. Never called a real CNC.

---

## 12. Build order (12-day sprint — follow this sequence)

Work layer by layer; do not attempt to "build SYNAPSE" in one shot.

1. **Days 1–2:** Repo scaffold + `SensorSource` interface + `FeatureWindow`. Dataset download +
   windowing. One node ingesting windows → feature extraction.
2. **Days 3–4:** L1 Isolation Forest (train on healthy). L2 ADWIN + MAPIE → self-trust +
   three-state machine on a single node.
3. **Days 5–6:** L3 FAISS case memory (signature, provenance, decay, dedup/merge, bounded
   eviction). L4 Zenoh peer-mode gossip between 3 processes (event-triggered + trust-gated).
4. **Days 7–8:** Script the three scenarios (§6) as deterministic timelines.
5. **Days 9–10:** Web dashboard (pale-cyan): fleet health, per-node trust state, divergence map,
   gossip log (+ RUL band if stretch).
6. **Day 11:** Record the 2–3 min demo video; finalize the README.
7. **Day 12:** Buffer / polish / fold artifacts into the Stage 1 deck.

---

## Addendum 2026-06-23 — Data contract (supersedes the "FeatureWindow" sketch)

> Appended during the Days 1–2 sensor/feature build. Clarifies — does not change — §2/§4/§8.

The exploratory **`FeatureWindow`** name used in §2's code sketch and the §8 `sensors/base.py`
comment is **superseded** by an explicit two-type contract, implemented in
`synapse/sensors/base.py`:

- **`SignalWindow`** — raw windowed multi-channel data + provenance metadata. Fields:
  `node_id`, `tick` (int), `fs` (sample rate), `channels` (dict with keys `"vibration"`,
  `"current"`, `"temp"`; `current`/`temp` may be `None`), and `label` (ground-truth fault
  class, **EVAL-ONLY — never fed to detection or gossiped**). CWRU is vibration-only;
  `current`/`temp` stay in the schema so the Stage-2 `HardwareSensorSource` fills the
  *identical* shape. This IS the "only the `SensorSource` changes" swap principle (§2) made
  concrete.
- **`FeatureVector`** — extracted features (`names` + `values`) carrying the same
  `node_id`/`tick`/`label` metadata. Feature values and the eval-only label are kept
  structurally separate so the label cannot leak into a detector.

Interfaces: `SensorSource.next_window() -> SignalWindow`; `features.extract(SignalWindow) ->
FeatureVector`. A new helper `synapse/sensors/windowing.py::segment()` turns a raw signal into
fixed-length overlapping windows (a small, justified addition to the §8 layout). Everything
else in §2/§4/§8 stands.

---

## Addendum 2026-06-25 — Vivarium (3D fleet twin)

> Appended during the Days 9-10 dashboard work. **Additive** — changes nothing in §2/§4/§5/§6.

A 3D, orbit-able digital twin of the fleet lives at `dashboard/static/vivarium/` and is served
by the existing FastAPI app at **`/3d`** (route added to `dashboard/server.py`). It is the visual
counterpart to the 2D dashboard and sits **alongside** it.

**Inviolable spine: the twin RENDERS, it does not COMPUTE.** It fetches the *same* read-only
`/api/events/<scenario>` logs the 2D dashboard serves and dramatizes them in 3D. It never
re-runs detection, recomputes a score, or invents a state. Every node colour, trust ring, gossip
arc, confidence band and alarm is a faithful replay of what the real L1–L4 nodes decided. The
boundary is `src/eventModel.js` (real `FleetEvent` → normalized render event; `sig_id`/
provenance/peers are **parsed** from the logged `detail` strings, never fabricated) and the pure
`src/foldState.js` (`events + t → fleet state`).

**Stack:** Three.js (modern, **vendored locally** in `vendor/` — no CDN, so the air-gapped demo
story holds), plain ES modules via an `importmap`, no build step. `OrbitControls` from the same
vendored drop.

**Two honest fidelity decisions** (the schema lacks these fields, so we do not fake them):
1. **No `anomaly` score in the log** → spindle vibration is driven by the real
   `state`/`confirmed_fault`/`self_trust`, not a fabricated number.
2. **No conformal interval in the log** → the on-node band is the conformal-derived **self-trust**
   scalar, labelled exactly *"self-trust (conformal-derived)"* — never drawn as a prediction
   interval or RUL band.
   Also: the brief's "gated-rejection" stale beat isn't in the data (C teaches valid sigs while
   trusted, then self-quarantines), so we render the **real** firebreak — a STALE node that still
   detects a fault but `should_teach=false` (L4 plate greys, "fault not taught") — rather than
   invent rejected signatures.

Data-flow / L1–L4 plate pulses are the one **illustrative** element (they animate the pipeline,
not a logged per-layer decision) and are flagged as such in the legend, visually distinct from
the replayed states/gossip/alarms.

**Constraints honoured:** additive only (the 60 tests stay green; the viewer is imported by no
test); no browser-storage APIs; Zenoh **peer** labelling throughout; the rig is a *scaled spindle
analog*, never a real CNC.

---

## Addendum 2026-06-26 — Codebase navigation aid (graphify)

> Tooling note, not a design change. Optional — the code is the ground truth.

A read-only structural knowledge graph of this repo can be built with `/graphify --obsidian`
(the vendored Three.js under `dashboard/static/vivarium/vendor/` is excluded via `.graphifyignore`,
so the real L1–L4 abstractions lead). Outputs land in `graphify-out/` (git-ignored):

- **`graphify-out/GRAPH_REPORT.md`** — community map + god nodes (`FeatureVector`, `FaultSignature`,
  `WorkerModel`, `SignalWindow`, `CaseMemory`, `NodeAssessor`). Skim it to orient before grepping.
- **`graphify query "<question>"`** — budgeted graph traversal to locate the symbols/files a task
  touches without opening the whole tree. Refresh with `/graphify --update` after code changes.

Caveat: it's a *navigation aid*, not authoritative — a few semantic edges are AST↔LLM id-mismatch
artifacts. Always confirm by reading the cited `file:line` before acting. The files under
`graphify-out/` are machine-generated and disposable; never hand-edit them.

---

## Addendum 2026-06-26 — Vivarium machine is now an animated CAD model

> Evolves the 2026-06-25 Vivarium addendum's *appearance only*. The inviolable spine is unchanged:
> the twin still **RENDERS, does not COMPUTE** — every state/colour/gossip/alarm is the same
> replayed `/api/events` log; only the mesh that dramatizes it changed.

Each fleet node now renders the **real CNC 3018 CAD model** (a GrabCAD SolidWorks assembly), not
the earlier hand-built procedural machine. The procedural builder is retained as the offline
fallback (see below). Pipeline that produced the asset:

- Source `CNC 3018.IGS` (IGES, 222-surface assembly) → FreeCAD headless tessellation → grouped OBJ
  (one `g` per part) → custom OBJ→glb (per-part vertex remap + `fix_normals`) → **`cnc3018_parts.glb`**
  (222 named nodes, ~6.4 MB). The two one-off scripts are committed and parameterized:
  `scripts/vivarium_export_cad_parts.py` (run under `freecadcmd`) then `scripts/vivarium_obj_to_glb.py`
  (run under a throwaway venv with `trimesh`/`scipy`/`networkx`); each script's docstring has the
  exact invocation. They regenerate the asset once the source CAD is on hand.
- `dashboard/static/vivarium/models/` is **git-ignored** — the GrabCAD model's license/attribution
  is not yet cleared, so the `.glb` must not be committed. The vendored `GLTFLoader.js` +
  `BufferGeometryUtils.js` (Three.js r160, MIT) and all `src/` code **are** committable.

Loader/animation (`src/cadBody.js`, wired in `src/main.js`):
- Parts are classified by **CAD-space position** into kinematic groups — `frame` (static),
  `carriage` + `spindle` (the central column), `bed` — and mounted on scene-space **pivots**
  (`Object3D.attach` bakes the mm→scene scale into each mesh). Long structural members (X-rails,
  Z lead-screw) are kept in `frame` by a size test so they don't travel with the head.
- The render loop **spins the spindle and sweeps the carriage in X** ("machine is running"); speed
  and jitter scale with the *real folded state* (`sh`), never a fabricated anomaly number — same
  honesty rule as the old procedural spindle. The CAD spindle's per-node material glows the node's
  **state colour** (cyan/amber/red), so divergence/stale/unknown still read at a glance.
- **Critical gotcha:** the re-exported glb carries **no vertex normals** → PBR lighting renders the
  whole machine black. `cadBody.js` calls `geometry.computeVertexNormals()` on load. Do not remove.
- Materials give the model colour (brushed-steel frame, dark bed, cyan-emissive spindle). If
  `cnc3018_parts.glb` is missing/unparseable, `loadCadBody()` returns `null` and `createMachine`
  builds the fully **procedural** machine — the air-gapped demo never hard-fails.

Still honoured: additive only (60 tests green; viewer imported by no test); render-only; Zenoh
**peer** labelling; the rig is a *scaled spindle analog*, **never** called a real CNC.

---

## Addendum 2026-06-27 — Fleet-scale factory floor (50-CNC twin) — PLAN, not yet built

> Direction for the next Vivarium expansion. **Additive visualization** — it does **not** change
> the locked Round-1 deliverable (§2: a 3-node fleet on real Zenoh). The twin still RENDERS, does
> not COMPUTE. Analysis + layout done 2026-06-27; build is phased and not started.

Goal: grow the 3-machine twin into a **50-CNC factory floor** so the two flagship scenarios get
far stronger — divergence (one outlier vs 49 *tight* identical peers) and batch-defect (a
cell-cluster sharing a bad tool/material lot lights up at once). Two decisions are **locked**:

1. **50-node behaviour = the real L1–L4 logic run OFFLINE → a deterministic event log the twin
   replays.** Generalize the scenario spec to N nodes and run the real `WorkerModel` →
   `NodeAssessor` → `CaseMemory` per node, with the real `should_publish`/`should_ingest`/
   `PublishLedger` gossip rules over an **in-process** bus (fully seeded). Emit
   `events/fleet50_<scenario>.jsonl` in the **existing `FleetEvent` schema** so the dashboard's
   `/api/events/<scenario>` serves it with no new data path. **NOT** 50 real Zenoh processes.
   Honesty boundary (state it everywhere): *"50 nodes of real L1–L4 logic; live Zenoh **peer**
   P2P transport stays the 3-process core."*
2. **Full factory floor** modelled (grounded in real lights-out cellular-manufacturing layouts):
   cutting zone (bandsaw → blanks) → conveyor spine → **25 robot-tended cells** (2 CNC + a robot
   arm + in/out conveyor each = 50 machines) → deburr/QC → ship. ~1 robot per 2 adjacent CNCs.

**Rendering (mandatory, not optional):** naive 50×222 meshes ≈ 15.7 M tris / ~11.8 k draw calls
= unrenderable. Use **InstancedMesh + decimation + LOD**: the focused/inspected cell upgrades to
the full 222-part animated CAD (the *hero* machine, see prior addendum); the other 49 are an
instanced, decimated `cnc3018_fleet.glb` (~30–40 k tris, merged per kinematic group). Per-instance
`instanceMatrix` drives each spindle spin + carriage sweep; per-instance `instanceColor` drives
each node's state colour. Robots/conveyors are procedural (no extra CAD/licensing), instanced per
cell. Budget: ~2 M tris, <50 draw calls, 60 fps; shadows + full detail only near the camera.

**Phased build:** (1) parametric N-node generator + `fleet50_*` logs (prove determinism + schema);
(2) floor zones/cell-grid/conveyor + place 50 from a node→cell→position roster; (3) instanced
decimated fleet + hero-cell swap-on-focus; (4) robot/conveyor/cutting-zone dressing + tend
animation on logged events; (5) LOD/shadow/perf pass to 60 fps + scenario beats; (6) tests green.

Still honoured: additive only · 60 tests stay green · render-only · Zenoh **peer** labelling ·
scaled spindle analog, never a real CNC · this is a fleet-scale *visualization*, not a Round-1
scope change.

---

## Addendum 2026-06-30 — Robotic cell + industrial environment (built)

> First slice of the factory-floor vision (Phase 4 dressing, ahead of the Phase 1 data work).
> Additive, render-only. Built this date; the 60 tests stay green (viewer imported by no test).

The twin now stages a **robot-tended machining cell** + an **industrial shop-floor bay** around
the 3-machine fleet. New modules under `dashboard/static/vivarium/src/`:

- **`conveyor.js`** — detailed heavy-duty roller conveyor: C-channel side frames + top lip, closely
  spaced spinning rollers with dark axle hubs, side guard rails, braced legs on foot plates, amber
  drive-motor. API: `xAt(t)` travel param, `spin(dt,speed)`.
- **`robotArm.js`** — procedural **6-axis-style industrial arm** shaped like the reference CAD:
  ribbed base plate, cylindrical housing, shoulder/elbow castings with side **stepper motors**,
  tapered upper-arm/forearm, wrist cluster, **3-finger claw**. Nested pivots; `setPose()`,
  `gripper(open)`, `tipWorld()` grasp anchor.
- **`cell.js`** — assembles infeed conveyor + arm + outfeed conveyor and runs a looping
  **pick-and-place** (infeed → reach-down → grab → lift → transfer → lower → release → outfeed). The
  arm works in ONE vertical plane (yaw=0, **facing the conveyor line**) and reaches **down onto the
  belt** — the claw is kept pointing straight down by deriving `wrist = π − shoulder − elbow`, so it
  grips from above the belt and lifts straight up (never "yanks from above"). Pick/place poses were
  solved in-browser against the belt ends; the part follows `tipWorld()` during carry (no IK).
- **`environment.js`** — concrete slab, painted cyan lanes + amber hazard borders, perimeter walls
  with cyan trim, overhead truss light-rigs (emissive strips, no RectAreaLight), amber safety
  railings, corner pallet/crate props. Pale-cyan SYNAPSE aesthetic kept (amber = safety).

**HONESTY:** the cell + conveyor motion is **cosmetic** ("the line is running") — NOT replayed from
the L1–L4 log, exactly like the data-flow pulses. Flagged *illustrative* in the legend. Only the
CNC node states/gossip/alarms remain log-driven.

**CAD-format blocker (why procedural):** the user's supplied models are **native SolidWorks**
(`.SLDPRT`/`.SLDASM`, conveyor) and **Parasolid** (`.x_t`, robot arm) — both closed formats the
open-source toolchain can't read (FreeCAD: "Unknown extension"; no assimp/meshlab/gmsh/blender).
Do **not** upload the user's proprietary CAD to an online converter without explicit permission.
These procedural builds are **swap-ready**: re-export the originals to **STEP** (preferred — keeps
the conveyor rollers + arm links as separate parts for animation) or glb, then run them through the
`vivarium_export_cad_parts.py` → `vivarium_obj_to_glb.py` pipeline and load via the same loader
pattern as the CNC (`models/*.glb`, procedural fallback if absent).

Still honoured: additive only · 60 tests green · render-only · Zenoh **peer** labelling · scaled
spindle analog never a real CNC.

---

## Addendum 2026-07-01 — Fleet-50 Phase 1: parametric N-node data generator (built)

> First slice of the addendum 2026-06-27 plan — the **data**, not yet the rendering (Phases 2-6
> remain). Additive; existing 60 tests stay green (+7 new fleet tests). The honesty boundary is
> the whole point of this phase, so it is enforced in code + docstrings, not just claimed.

The three `fleet50_*` scenarios now run the **real L1–L4 stack for all 50 nodes OFFLINE** and emit
`events/fleet50_<scenario>.jsonl` in the **unchanged `FleetEvent` schema**. The dashboard serves
them through the **same** read-only `/api/events/<scenario>` path — no new backend surface.

**The one swap (honesty boundary, stated everywhere):** *50 nodes of real `WorkerModel` →
`NodeAssessor` → `CaseMemory` + real `should_publish`/`should_ingest`/`PublishLedger` gossip
rules; only the TRANSPORT is swapped* — instead of 50 Eclipse-Zenoh processes, confirmed
signatures relay over a **deterministic in-process bus** that reproduces the multi-process settle
timing exactly (a signature published at tick `t` lands in every peer's L3 **before** any node
processes `t+1`, mirroring the file-barrier + settle in `run_scenario.py`). **The live Zenoh
peer P2P transport stays the 3-process core** (`scripts/run_scenario.py`). NOT 50 Zenoh processes.

New/changed files:
- **`synapse/scenarios/fleet.py`** — parametric roster + specs + per-node data. 50 CNCs
  (`M00`..`M49`) paired into **25 robot-tended cells** (`cell_of`, `cell_nodes` helpers, shared so
  later render phases place the same machines the data describes). Fault selection is fixed +
  explainable: divergence outlier `M23`; batch cluster `M10`..`M15` (contiguous cells 5-7 = a bad
  insert lot); stale drifter `M49` + teacher `M00`. Healthy peers replay the *same* CWRU `normal`
  recording → a genuinely identical-machine fleet (which is what makes the outlier/cluster pop).
- **`scripts/run_fleet_scenario.py`** — the in-process driver. `simulate(name) -> [FleetEvent]`
  (importable by the test) + `_run` writes the log + a compact fleet timeline. A deterministic
  `_Clock` (advances 0.05 s/tick) replaces wall-clock so L3 decay + the systemic 60 s window are
  **byte-for-byte reproducible** regardless of machine speed (the only non-determinism the real run
  carried in `ts`). Each peer deserializes its **own** copy of the wire bytes so
  `to_peer_signature`'s down-weighting can't compound across 49 receivers.
- **`synapse/scenarios/base.py`** — added `FLEET_SCENARIOS` + `ALL_SCENARIOS`; `load()` dispatches
  fleet names to `fleet.py` (lazy import, no circular dep). 3-node `SCENARIOS` unchanged →
  `run_scenario.py` still spawns exactly 3 Zenoh processes.
- **`dashboard/server.py`** — allowlist widened to `ALL_SCENARIOS` (path unchanged; still 404s
  unknown/traversal). `/api/scenarios` now also lists the fleet logs with 50-node metadata.
- **`tests/test_fleet_scenarios.py`** — 7 tests, CWRU-only (no Zenoh, no subprocess): each money-shot
  beat, schema round-trip + full roster, and determinism (two fresh runs, `logical()` equal).

**Verified beats** (deterministic): divergence — only `M23` teaches (+escalates), 49 identical peers
armed born-wise. batch — `M10`..`M15` teach at once → the *same* signature id (identical machines) →
**systemic alarm across all 50** (6 origins on one signature; healthy controls raise it from peer
knowledge alone). stale — `M49` matches the 3-node reference **exactly** (teaches valid sigs at
t=90/105 while still trusted, then STALE at t=150, trust 0.82, `should_teach=false` — the honest
firebreak from addendum 2026-06-25, not a faked "never teaches"); `M00` keeps arming 49 peers.

Run: `.venv/bin/python scripts/run_fleet_scenario.py fleet50_<divergence|batch_defect|stale_quarantine>`
(~12 s for the 14-tick scenarios, ~41 s for the 165-tick stale).

Still honoured: additive only · 60 existing tests green · render-only twin · Zenoh **peer**
labelling · scaled spindle analog never a real CNC · NOT a Round-1 §2 scope change.

---

## Addendum 2026-07-01 — Fleet-50 Phase 2: factory floor + 50-machine placement (built)

> Second slice of the 2026-06-27 plan — the **rendering** of the Phase-1 `fleet50_*` logs on a
> shop floor. Additive, render-only; the 3-node detailed rig is untouched. Verified in-browser.

Selecting a 50-node `fleet50_*` scenario now swaps the 3-node CAD rig for an **instanced factory
floor**; the 3-node path is byte-for-byte unchanged. The **same fold / playback / HUD / inspector**
drive both — only the *scene representation* branches on `meta.nodes.length` (`foldState.js` +
`eventModel.js` were already node-agnostic, so nothing below the log changed).

**Rendering crux resolved (addendum 2026-06-27):** 50 full 222-part CAD machines ≈ 15.7 M tris =
unrenderable. The fleet is drawn as **InstancedMesh proxies** — bodies + spindles + status discs +
fault halos = a handful of draw calls for all 50. Per-instance `instanceColor` carries each node's
**real folded state colour**; per-instance matrices spin the spindles. (Phase 3 upgrades the proxy
body to a *decimated CAD* instance + a hero-cell swap-on-focus.)

New/changed files (`dashboard/static/vivarium/`):
- **`src/floorLayout.js`** — pure roster mirroring `fleet.cell_of`: 50 CNCs (`M00`..`M49`) in **25
  cells** on a 5×5 grid (`cellCenter`/`machinePos`/`fleetRoster`), plus conveyor-spine + cutting +
  QC/ship zone anchors. The render-side twin of the Python roster, so data and floor agree.
- **`src/fleetFloor.js`** — the instanced fleet + static floor dressing (cell pads, robot-base
  nubs, roller spine, cutting/QC blocks). `applyStates(nodes)` snaps each disc to its state colour
  and toggles a **red confirmed-fault halo**. *Why the halo:* a diverged node is `UNKNOWN` for only
  the one escalation tick, then returns to `CONFIDENT` with `confirmed_fault` still true — so the
  three-state disc colour alone would lose the outlier after one tick. The halo is a second,
  **honest, log-driven** channel (`confirmed_fault`), legended as such — not a fabricated signal.
- **`src/main.js`** — a `fleetMode` branch through `select` / `renderTick` / render `loop` / `pick`
  / `focusFly`; instanced raycast → inspector; camera + fog reframing for the wider floor; toggles
  the 3-node rig (machines + robot cell + environment + their HTML labels) as one unit.
- **`index.html`** — one legend line for the fault-halo channel (under "Replayed from log").

**Verified in-browser** (preview, all deterministic): divergence — `M23` red-haloed among **49 cyan
peers**, 49 born-wise learns in the log. batch — the exact `M10`..`M15` cluster haloed + the
SYSTEMIC BATCH DEFECT banner. stale — `M49` amber (STALE, the only one), `M00` teacher red-haloed.
Clean 3-node ⇄ fleet switching (fold node count 3⇄50, rig visibility, labels), no console errors.

Still honoured: additive only · 60 existing tests green (viewer imported by no test) · render-only
(every disc/halo is the folded state; floor dressing flagged illustrative) · Zenoh **peer** ·
scaled spindle analog never a real CNC · NOT a Round-1 §2 scope change.

---

## Addendum 2026-07-01 — Stale→recover loop + immersive 3-node alarm/isolation twin (built)

> Two joined pieces: (1) a REAL recovery scenario so the drift-conscience's full three-state loop
> exists as data, and (2) a much richer, immersive rendering of it on the 3-node twin. Additive;
> the twin still **RENDERS, does not COMPUTE**. 72 tests green (60 + 7 fleet + 5 new). Verified
> in-browser at `/3d`.

**(1) `stale_recovery` — the recovery beat is now REAL data (not faked in the renderer).** The
shipped `stale_quarantine` log ends with C stuck STALE forever (the latched ADWIN flag, `drift.py`,
means a stale node can *never* clear on its own — natural recovery is impossible by design). To
show the honest "isolate → re-earn trust → rejoin" arc the L2 conscience was built for, the real
recovery path is now exercised end to end:
- **Opt-in auto-recovery in `NodeAssessor`** (`l2_trust/state_machine.py`, param `recover_after`,
  **default `None` → every existing scenario byte-identical**): while STALE, once the ADWIN window
  mean (`estimation`) returns within `recover_band` σ of the calibration baseline on
  `recover_after` consecutive non-anomalous windows, the node calls the *existing* `recalibrate()`
  (resets ADWIN, re-fits conformal) → self-trust →1.0 → CONFIDENT + teaching re-enabled next tick.
  The recovery is **COMPUTED by the real stack**, never scripted into a state. Threaded through
  `FleetNode(recover_after=…)` (`node/daemon.py`).
- **New `EventType.RECOVER`** (`scenarios/events.py`); `ScenarioSpec.recover_after`; new
  `OFFLINE_SCENARIOS=("stale_recovery",)` in `scenarios/base.py` (in `ALL_SCENARIOS`, served by the
  same `/api/events`). Scenario: `scenarios/stale_recovery.py` — C healthy→drift (proven
  plateau=0.010/ramp=20, trips STALE ~t150)→healthy-recover tail; **A teaches WHILE C is
  quarantined so C ingests A's signature born-wise = "listen, don't teach" made literal**; C
  recovers ~t169. Produced OFFLINE over the deterministic in-process bus
  (`scripts/run_offline_scenario.py stale_recovery` → the fleet runner's shared `simulate` emits
  RECOVER on the STALE→CONFIDENT edge). **Same honesty boundary as fleet50_\*: real L1–L4 for all
  nodes, only the TRANSPORT is the in-process bus; live Zenoh peer stays the 3-process core.**
  Test: `tests/test_stale_recovery.py` (5, CWRU-only) — isolate-then-rejoin ordering, listens
  while quarantined, never teaches while stale, schema, determinism.

**(2) Immersive 3-node twin — a louder read-out of the SAME folded state (never a new signal).**
New render-only modules under `dashboard/static/vivarium/src/`:
- **`audio.js`** — Web-Audio **synthesized** cues (no asset files → offline story holds): `fault`
  (escalate), `stale` (self-quarantine warble), `klaxon` (systemic), `teach`/`learn`, `recover`
  (all-clear chime). Fired only from the forward-play transient layer (a logged beat); autoplay-safe
  (context resumes on a user gesture); HUD 🔊/🔇 mute toggle.
- **`beacons.js`** — a rotating warning **light** on each machine: red (UNKNOWN / confirmed fault),
  amber (STALE low-trust), off (CONFIDENT) — mode straight from the fold.
- **`quarantine.js`** — a translucent amber **containment dome** that descends over a self-quarantined
  node (should_teach=false) and lifts on RECOVER; incoming gossip still lands (porous = "listen").
- **`gossip.js`** (enriched) — teacher broadcast **shockwave** on publish, comet-tail signature
  packets + **absorb ring** on born-wise arrival, and **arc-muting** (amber, dim) for a node that
  may not teach.
- **`main.js`/`index.html`** — cinematic lower-third **caption** narrating each beat from folded
  fields; a screen-edge alert **vignette** (red/amber/teal); the inspector upgraded into an
  **under-the-hood node console** (state + plain-English "why" + a self-trust **gauge vs the
  τ_stale=0.5 marker** + recognition/teaching/memory). Caption steps aside while the console is open.
  Legend documents every new channel as replayed-from-log (the pulses + robot cell stay the only
  *illustrative* elements).

Run: `.venv/bin/python scripts/run_offline_scenario.py stale_recovery` then open `/3d` → **stale
recovery** tab. Still honoured: additive · render-only · Zenoh **peer** · scaled spindle analog
never a real CNC · NOT a Round-1 §2 scope change.

---

## Addendum 2026-07-02 — Twin UX/fidelity pass + knowledge auto-sync hook (built)

> Interaction + presentation polish on the 3-node twin (no data/scenario change) plus a
> session-end knowledge-sync hook. Render-only spine unchanged; verified in-browser.

**Twin UX (`dashboard/static/vivarium/`):**
- **Robot cell relocated to a left-side station.** It used to sit at `[0,0,7.2]` — between the
  camera and the CNC line, cluttering the machines. A single `CELL_CENTER = [-12,0,4]` anchor in
  `main.js` now places the cell **and** its surrounding structure (hazard zone + safety railing,
  now parameterized in `environment.js` via `createEnvironment(scene,{cellCenter})`) as one
  separate material-handling station, clear of the CNC triangle.
- **Camera stays put across scenario switches.** `select()` now keeps a per-mode saved camera
  (`savedCam.three` / `savedCam.fleet`) and only reframes when the 3-node⇄fleet **mode** actually
  changes; same-mode scenario switches leave the camera exactly where the user left it (and
  returning to a mode restores that mode's view).
- **Controls feel responsive, not rigged** (`scene.js`): `zoomToCursor`, `screenSpacePanning`,
  arrow-key pan, wider range (min 3.2 / max 64), tuned zoom/rotate/damping. A pointer-down or
  wheel **cancels any in-progress fly-to** so the user can grab control mid-motion.
- **Legend red-rectangle bug fixed.** The legend swatch `class="sw alarm"` collided with the
  fixed-position `.alarm` banner class (inheriting `position:fixed` + padding + pulse → a stray red
  block). Renamed the swatch class to `sw-alarm`. Topbar scenario tabs now `flex-wrap` (3-node row
  + fleet50 row).
- **Higher fidelity** (`scene.js`): ACES exposure 1.12, added a soft frontal fill light, warmer
  key/rim, and a sealed-concrete floor sheen (slight metalness + env reflection).

**Knowledge auto-sync (`scripts/sync_knowledge.sh` + `.claude/settings.json` `Stop` hook):**
On each turn a guarded, detached script refreshes the **LLM-free** parts of the memory triad —
`graphify update .` (AST code-graph → `graph.json` + `GRAPH_REPORT.md`), `graphify export html`,
`graphify export obsidian` (to the git-ignored `graphify-out/obsidian`, **not** the hand-authored
`SYNAPSE-Home.md`/`notes/` vault). Guarded (no-op unless a `.py`/`.js` changed since the last
sync), single-flight (lock dir, stale after 10 min), detached (never blocks a turn), fail-open.
**CLAUDE.md design addenda + semantic doc extraction are intentionally NOT automated** — they need
reasoning and stay session-authored. (Hook changes take effect on the next session start.)

Still honoured: additive · render-only · Zenoh **peer** · scaled spindle analog never a real CNC ·
NOT a Round-1 §2 scope change.

---

## Addendum 2026-07-02 — Cognition view: the AI workflow made physical (built)

> A NEW render-only view **complementary** to the `/3d` factory-floor twin. The floor twin shows
> the *machines*; this shows the *intelligence deciding*. Same inviolable spine — it **RENDERS,
> does not COMPUTE**. Additive; the existing twin is byte-for-byte unchanged; 72 tests stay green
> (viewer imported by no test). Verified in-browser. **Not** a Round-1 §2 scope change.

The whole E2E AI workflow (learn · pattern-detect · trust · confidence-grow · fleet-learn ·
peer-talk · peer-isolate) now has an intuitive 3D read at **`/ai`** (route added to
`dashboard/server.py`, sibling to `/3d`). It reuses the **same** read-only `/api/events` +
`/api/scenarios` and the SAME render-only boundary (`eventModel.js` adapter → pure `foldState.js`
fold → snap the scene). No new data path, no L1–L4/scenario/schema touch.

**The L1→L4 stack made physical** — each node is a "mind" tower (bottom→top mirrors `synapse/`):
- SENSOR intake (replayed windows) → **L1 detection lens** (flares red on the real
  `confirmed_fault`) → **L2 self-trust CORE** (an orb that grows + brightens with the real
  `self_trust`, colour = state — "confidence growing") → **L3 memory orbit** (one signature crystal
  per real memory entry; **provenance-coloured** cyan=self / teal=born-wise-from-peer) → **L4
  gossip emitter** (greys out when `should_teach=false`).
- A state-coloured **trust halo** (radius ← self-trust) at the base + an amber **isolation shell**
  that closes over the whole tower on self-quarantine ("peer isolating — listen, don't teach").
- A central **fleet-mind nexus** the three towers feed: brightens as knowledge converges and
  **flares red with a shockwave on the real systemic batch-defect alarm** ("fleet learning").
- Click a mind → an **L1–L4 console** (one honest line per layer + self-trust gauge vs τ_stale +
  the signatures in memory). Caption narrates each beat from folded fields; audio cues + vignette
  reuse the floor twin's `audio.js`.

**Honesty (unchanged spine):** the per-tower **spine data-flow packets** are the ONE *illustrative*
element (flagged in the legend, exactly like the floor twin's `pulses.js`) — everything else (trust
core/halo, L1 flare, crystals, gossip arcs, isolation shell, nexus) is a faithful read of the
folded log. No fabricated **anomaly score** (L1 flare + core jitter come from real
`state`/`confirmed_fault`/`self_trust`, same rule as the twin's `shakeLevel`) and no fabricated
**conformal interval** (self-trust scalar only, labelled "self-trust (conformal-derived)"). Focused
on the deep **3-node** scenarios (`divergence`, `batch_defect`, `stale_quarantine`,
`stale_recovery`); the 50-node fleet floor stays the `/3d` view's job (tabs filtered by node count).

New files (`dashboard/static/vivarium/`): `cognition.html` + `src/cognition/{cogScene,mind,
synapseFlow,cogMain}.js`. Reused verbatim: `eventModel.js`, `foldState.js`, `theme.js`, `hud.js`,
`labels.js`, `audio.js`, vendored Three.js. Cross-links added both ways (`/3d` ⇆ `/ai`). Bloom is
faked with the project's additive glow-sprite technique — no new vendored dep, so the air-gapped
story holds. Open: `run_dashboard.py --port 8092` → `/ai`.

**Verified in-browser** (all four beats, deterministic): divergence — A's L1 flares red, escalates,
teaches; B/C stay confident then gain a born-wise teal crystal. stale — C's L2 core goes amber, the
isolation shell seals the tower, L4 greys/gated (console ladder highlights L2 drift). batch — the
fleet-mind nexus flares red + shockwave with the SYSTEMIC banner (A+B teach the same signature).
Clean `/3d` ⇆ `/ai` switching; no console errors; 72 tests green.

Still honoured: additive · render-only · Zenoh **peer** labelling · scaled spindle analog never a
real CNC · NOT a Round-1 §2 scope change.

---

## Addendum 2026-07-02 — Machine-stop-on-defect (3-node twin) (built)

> Small additive render-only beat on the 3-node twin (`/3d`). The upgrade-ladder's *act* step
> (§4 "detect → diagnose → recommend → **act-or-escalate**") made visible: a machine that confirms
> a defect **halts**. Same inviolable spine — the twin RENDERS, does not COMPUTE; nothing in
> §2/§4/§5/§6, no scenario, no log, no test changed. Verified in-browser.

**Behaviour:** in the 3-node render loop (`dashboard/static/vivarium/src/main.js`) each machine now
carries `m._halted = !!ns.confirmed_fault` (set in `applyNodeState` straight off the **real logged
`confirmed_fault`** — never a fabricated stop). The loop eases a per-machine motion factor `mo`
(1→0 via `m._motion`) when halted, and multiplies **both** the procedural and CAD spindle spin +
carriage/head sweep + jitter by `mo`, so a faulted machine visibly **spins down and parks** while
healthy peers keep running. Read-outs added, all from the same folded fields:
- node label gains a red `⏹ MACHINE STOPPED · defect detected` line (`.rhalt`, `index.html`);
- inspector gains a `machine: ⏹ STOPPED · defect` row + "→ machine halted" in the why-line;
- caption escalate/idle-faulted beats say the machine halted to prevent scrap;
- legend gains one "machine stopped — spindle halts on a confirmed defect" row (under *Replayed
  from log*, since `confirmed_fault` is a logged field).

This is keyed purely on `confirmed_fault`, so it fires honestly in every scenario a defect is
confirmed. **Verified in-browser** (preview on :8096, CAD present, no console errors):
- **divergence** — only **A** halts (spindle Δ=0, carriage parked) while **B/C** keep spinning
  (Δ≈29 rad/1.5 s); A teaches its signature (t=6) → **B & C learn it born-wise** (t=7). This is the
  first requested teach→alert→learn scenario, now with the diverging machine stopped.
- **batch_defect** — **A & B** both halt (both Δ=0) while **C** keeps running (Δ≈15); A & B teach
  the **same** signature (systemic banner) → **C learns it born-wise**. The second teach→learn
  scenario. Fleet mode (`fleet50_*`) is untouched — the loop returns early before `_halted` is read.

Still honoured: additive · render-only · Zenoh **peer** labelling · scaled spindle analog never a
real CNC · NOT a Round-1 §2 scope change.

---

## Addendum 2026-07-02 — Cross-learning scenario: the full learn→teach→predict cycle (built)

> A NEW 3-node scenario (`cross_learning`) that composes the whole fleet story into ONE arc, with
> **no fixed roles** — every identical machine both teaches and learns. Real L1-L4 for all nodes;
> only the fault ONSETS are scheduled. Same honesty boundary as `stale_recovery`/`fleet50_*` (real
> stack, in-process transport bus). Additive; 78 tests green (72 + 6 new). Verified in-browser.

**The one-arc story (every beat DECIDED by the real stack):**
- setup — A, B, C healthy + CONFIDENT (identical peers).
- new-fault (t7) — **A** develops a novel inner-race fault → no local/peer match → `UNKNOWN` →
  **escalate** + **teach** signature `2be3…`; B & C **receive** it born-wise (t8) = "A sent its
  data to B and C". (divergence mechanic)
- 2nd-fault (t15) — **B** develops a DIFFERENT novel fault (ball) → escalate + teach `803c…`; A & C
  arm. A **second, different machine teaches** ⇒ no fixed teacher/learner role.
- predict (t21→22) — **C**'s own machine starts showing the SAME inner-race pattern A taught.
  Because C was armed, its L3 recognizer returns `recognition_source=PEER` (born-wise) → C raises a
  warning **without escalating** (it predicted the fault from an existing pattern), then re-teaches
  → inner-race now has two origins {A,C} within the window → **SYSTEMIC batch-defect alarm**.
  (batch mechanic) Every node both TEACHES (A inner, B ball, C inner) and LEARNS (all receive).

Files: `synapse/scenarios/cross_learning.py` (spec + per-node timeline; onset ticks
`_A_INNER=5`/`_B_BALL=13`/`_C_INNER=20`), added to `OFFLINE_SCENARIOS`
(`synapse/scenarios/base.py`) so `run_offline_scenario.py cross_learning` produces
`events/cross_learning.jsonl` and the dashboard serves it via the same `/api/events`.
`tests/test_cross_learning.py` (6, CWRU-only): no-fixed-roles (all 3 teach+learn), two distinct
novel discoveries, C predicts born-wise **without escalating**, C's re-teach → systemic, schema
round-trip, determinism.

**Twin (render-only) — the born-wise "predict" beat made visible:** the recognizer's real
`recognition_source=PEER` is surfaced as a first-class beat. `foldState.js` marks the tick a node's
recognition flips to PEER as ACTIVE (it dwells, not zipped) and adds a derived **"born-wise warn"**
timeline beat (computed from the folded state, never fabricated). `main.js` adds a teal caption for
that tick ("NODE C sees a pattern in its own machine that matches one a peer taught — recognizing it
born-wise…") and enriches the SYSTEMIC alarm caption when it was triggered by a born-wise
recognizer. The machine-stop, gossip arcs, escalate vignette and inspector "born-wise" reason all
already applied. **Verified in-browser** (preview :8096): setup→A escalate+halt (B,C good, gossip
A→B,C)→B escalate+halt (different fault)→C born-wise recognize (teal caption, still running)→C
confirm+halt+SYSTEMIC. No spurious "born-wise warn" beat leaks into the other four 3-node scenarios.

Still honoured: additive · render-only · Zenoh **peer** labelling · scaled spindle analog never a
real CNC · NOT a Round-1 §2 scope change (the live 3-process Zenoh core is untouched).

---

## Addendum 2026-07-02 — Fault-flavour colours + slower playback + visible peer wires (built)

> Render-only presentation pass on the 3-node twin (`/3d`). Additive; no data/scenario/schema/test
> change; still RENDERS-not-COMPUTES (every colour is a folded field). Verified in-browser.

**(1) Three fault situations now read apart by COLOUR + label** (was: every confirmed fault looked
alike). One pure helper `situationColor(ns)` (`src/theme.js`) colours the ring, spindle glow, aura,
state label + beacon by WHY the machine stopped — all from real logged fields:
- **new defect pattern** (`confirmed_fault` + recognition SELF/NONE) → **orange** `#f97316` — the
  machine detected a novel fault first-hand. Label: "⏹ STOPPED · new defect pattern".
- **AI found the defect born-wise** (`confirmed_fault` + `recognition_source==="PEER"`) → **violet**
  `#a855f7` — recognized from a peer's taught pattern. Label: "⏹ STOPPED · defect found (born-wise)".
- **unknown pattern** (`state==="UNKNOWN"`) → **red** `#f43f5e` — novel + unresolved → stopped,
  escalated to a human. Label: "⏹ STOPPED · unknown pattern → human".
- STALE amber / healthy teal unchanged. `beacons.js` gained matching `orange`/`violet` strobe modes;
  the inspector's machine row + `index.html` legend ("MACHINE STOPPED · COLOUR = WHY") name all three.
  Verified: cross_learning t22 — A/B orange (new pattern), C violet (born-wise); divergence t6 A red
  (unknown) → t10 orange (new pattern). Wired in `applyNodeState`/`refreshInspector`/`readoutHTML`.

**(2) Playback slowed:** default speed `1× → 0.25×`, and a `0.1×` option added
(`src/main.js` initial `speed`, `index.html` `<select>`), so the beats are easy to follow.

**(3) Peer connection wires always visible:** the per-pair Zenoh peer-link tubes (`src/gossip.js`)
were a near-invisible hairline (opacity 0.1); raised to a clear cyan wire (opacity 0.32, radius
0.03, full-cyan) so the peer-to-peer mesh reads at rest — they still flare bright on a real
teach/learn. Muted (self-quarantined) links stay dimmer (0.12); added a per-frame colour relax.

Still honoured: additive · render-only · Zenoh **peer** labelling · scaled spindle analog never a
real CNC · NOT a Round-1 §2 scope change.

---

## Addendum 2026-07-02 — Real redundant dual-channel transport + per-node comparator (built, slice 1)

> Authorized extension of the transport (the user explicitly asked for a REAL second transport +
> validator, not just a depiction — so this is an instructed change to the otherwise-locked §2
> transport). Additive + **opt-in** (`dual_channel` defaults OFF) → every existing scenario is
> byte-identical and the prior 78 tests stay green (+7 new). First slice of the 50-machine
> "industrial line" expansion (research + architecture verdict below).

**Why this shape (research-grounded).** The user's sketch (two paths carrying the same telemetry,
cross-checked by an MCU) is essentially a real IEC standard: **Parallel Redundancy Protocol (PRP,
IEC 62439-3)** with **media diversity** (one wired, one wireless — kills common-cause failure; cf.
iPRP / Cisco PRP-over-wireless) + a **1oo2D comparator** (IEC 61508). Verdict given to the user:
approach is correct; three fixes — (1) batch-to-batch backbone should be an **HSR ring**, not a
single master (no single point of failure/trust); (2) the validator belongs on **every edge node
and independent of the main compute** (PRP does duplicate-discard at each node's Link Redundancy
Entity; 1oo2D wants diversity) — decided: a per-node independent co-MCU; (3) add **PTP/IEEE 1588**
time sync and reframe the comparator as an **integrity / anti-poisoning gate** (ties to the §10
tamper-evident-logging + trust-poisoning pilot gaps).

**Built (the real logic, not a render).**
- **`synapse/l4_gossip/redundancy.py`** — pure, transport-agnostic: `Channel` A/B, `ChannelFrame`
  (origin + shared per-origin `seq` = PRP's RCT role), `RedundantPublisher` (duplicate a signature
  onto both channels), and the **`ChannelComparator`** (per node, independent): both copies agree →
  `ACCEPT` once (duplicate suppressed); disagree → `REJECT_MISMATCH` (never ingested — can't tell
  which copy is authentic, so integrity wins); single copy → `sweep()` → `ACCEPT_DEGRADED` (PRP
  keeps the first). `tamper()` corrupts a frame for deterministic fault injection.
- **`synapse/scenarios/events.py`** — `EventType.CHANNEL_REJECT` (+ `CHANNEL_DEGRADED`).
- **`synapse/scenarios/base.py`** — `ScenarioSpec.dual_channel` + `channel_tamper`
  (`((receiver, origin), …)`), both defaulting off/empty; `comms_integrity` added to
  `OFFLINE_SCENARIOS`.
- **`scripts/run_fleet_scenario.py`** — when `dual_channel`, the settle relays each publication over
  **both channels through each peer's comparator** (one independent comparator per node, one
  publisher per origin); accepts ingest into L3, rejects go to a reject-inbox surfaced next tick as
  `CHANNEL_REJECT` (mirrors the GOSSIP_RECEIVE timing). Single-path relay unchanged when off.
- **`synapse/scenarios/comms_integrity.py`** — A teaches inner-race over both paths; **B**'s link is
  clean → both agree → B learns born-wise; **C**'s path-B copy is tampered (`channel_tamper=("C","A")`)
  → C's comparator **rejects** it (never enters L3) and flags the channel. The fleet still learns via
  the clean node; the poisoned copy is caught + quarantined at C.
- **`tests/test_channel_redundancy.py`** (7): comparator accept/reject/degraded, publisher seq,
  and the integration beat (B learns, C rejects + never ingests, determinism).

Honesty boundary (unchanged spine): the live **Zenoh peer** 3-process core (`run_scenario.py`) is
untouched; the redundant channels + comparator are REAL logic exercised over the deterministic
in-process bus (same boundary as `fleet50_*`/`cross_learning`). The comparator module is
transport-agnostic, so a live **second Zenoh session** can carry path B in a later slice.

**Next slices (not built):** P3 instanced decimated-CAD 50-machine fleet + hero-cell swap (hi-fi at
60fps); P4 behaviour parity for 50 (stop/colours/beacons/sound/gossip/relearn); **P5** render the
comms layer (5 batches × router + HSR ring + per-node validator) and surface `CHANNEL_REJECT` as a
distinct "path mismatch → rejected" alarm in the twin (`eventModel.js` currently ignores it); P6
perf + tests. Full architecture in this session's research answer + the diagram.

Still honoured: additive · opt-in (existing scenarios byte-identical) · signature-only on the wire ·
brokerless peer · no cloud/central server · scaled spindle analog never a real CNC.

---

## Addendum 2026-07-02 — Fleet-50 detailed robot-tended cells (built, instanced arms + conveyors)

> Render-only. The 50-machine floor (`/3d` → `fleet50_*`) now has **detailed conveyors + 6-axis
> robot arms** on every cell — the "conveyor belts + robot arms, arranged with the 50 machines,
> detailed not choppy" the user asked for. Additive; the 78+7 tests are untouched (viewer imported
> by none). Verified in-browser.

**The crux (detailed AND smooth).** The 3-node cell (`cell.js`) is a ~30-mesh arm + two ~70-mesh
conveyors; 25× naively ≈ 4,000 draw calls = choppy. So **`src/fleetCells.js`** draws every repeated
PART as ONE `InstancedMesh` across all 25 cells and poses every arm from a shared **forward-
kinematics** chain — the whole rig is **13 instanced meshes**. Measured on the fleet floor: **54
draw calls · ~85 k tris · ~0.4 ms/render** (i.e. easily 60 fps with all 50 CNCs + 25 arms + 50
conveyors + rollers + parts). Same detailed procedural shapes as `robotArm.js`/`conveyor.js`, merged
per kinematic segment (`mergeGeometries`), not simplified.

- **Arms:** 5 segment groups (base static; yaw→shoulder→elbow→wrist posed per frame via the FK
  chain `M0·T·Rz…`), 2 materials (light body / dark joints), 25 instances each. A keyframe tend
  cycle (home→pick→lift→place, wrist derived so the claw stays vertical, phase-offset per cell) —
  the same choreography idea as `cell.js`, run instanced.
- **Conveyors:** one merged frame geo (channels + legs), 50 instances; rollers one `InstancedMesh`
  (350) spun each frame; amber drive motors (50); travelling blanks one `InstancedMesh` (50) riding
  the belts. Placed per the real machine-tending layout (robot centred between its 2 CNCs, infeed
  −X / outfeed +X, `CONV_X`/`CELL_FRONT` in `fleetCells.js`) — grounded in the cellular-manufacturing
  research (robot-centred cell, U-flow, cells flank the spine).
- **Wiring:** `main.js` creates `fleetCells` once, `setVisible(fleetMode)` in `select()`, and
  `fleetCells.update(dt, now)` in the fleet-mode loop branch. `fleetFloor.js` lost its robot-nub
  placeholder (the real arm replaces it). Clean 3-node ⇄ fleet switching (cells hide on 3-node), no
  console errors.

**Honesty:** the tend motion + roller spin + part flow are COSMETIC ("the line is running"), NOT
from the L1-L4 log — flagged illustrative, exactly like the 3-node cell + the data-flow pulses. The
CNC node states/colours/gossip/halos stay log-driven (`fleetFloor.js`).

**Next (still open):** P3 decimated-CAD *bodies* + hero-cell swap (the CNC bodies are still low-poly
proxies); P4 fleet behaviour parity (machine-stop / 3 fault colours / sound / gossip on the 50);
P5 render the comms network (batches/router/HSR ring/per-node validator) + surface `CHANNEL_REJECT`.

Still honoured: additive · render-only · Zenoh **peer** labelling · scaled spindle analog never a
real CNC · NOT a Round-1 §2 scope change.

---

## Addendum 2026-07-02 — Fleet-50 P5: render the redundant comms network + reject alarm (built)

> The comms slice of the 2026-06-27 / 07-02 industrial-line direction. The REAL dual-channel
> transport + comparator (`redundancy.py`, slice 1) existed but was **invisible** — `eventModel.js`
> dropped `CHANNEL_REJECT`/`CHANNEL_DEGRADED` entirely. P5 makes it legible. Additive, render-only;
> **85 tests stay green** (no Python touched — the transport data was already built). Verified in-browser.

**Two honest halves, flagged apart in the legend:**

1. **The reject alarm is LOG-DRIVEN (3-node `comms_integrity`, where the real transport runs).**
   - `eventModel.js` now maps `CHANNEL_REJECT` → `kind:"reject"` and `CHANNEL_DEGRADED` →
     `kind:"degraded"` (parsing `matched_origin` + `seq N` + `path A/B` from the real detail string;
     both added to `TRANSIENT_KINDS`).
   - `foldState.js` carries a per-node `channel` field (`OK`|`REJECT`|`DEGRADED`) + `channel_from`,
     forward (a compromised link stays flagged — the log never clears it). The tampered copy never
     entered L3, so **memory is untouched — only the link is flagged**. New beat `✕ path mismatch`.
   - Twin surfacing (`main.js`): a **per-node validator badge** (co-MCU, `src/commsNetwork.js`
     `createNodeValidators`) at each machine — cyan OK, **magenta on a real reject** (`COLORS.integrity`
     `#d946ef`, distinct from red/amber/violet). On the reject tick: a **magenta "rejected copy"
     packet** flies the A→C arc and bursts (new `gossip.reject()`), the badge flashes, a new `reject`
     **audio cue** fires, a **magenta vignette + caption** narrate it, the ticker shows a `[REJECT]`
     tag, and the node read-out + inspector gain a **channel-integrity** line (`✕ path mismatch ·
     tampered copy from A rejected` / inspector `channel (co-MCU)` row).
   - Verified (comms_integrity): t6 A teaches+escalates+halts → t7 **B learns born-wise via the clean
     path (mem=1) while C's comparator REJECTS A's tampered path-B copy** (C stays CONFIDENT,
     `channel=REJECT` from A, memory untouched) — the anti-poisoning gate, end to end.

2. **The fleet-floor comms TOPOLOGY is illustrative architecture** (`src/commsNetwork.js`
   `createFleetComms`, shown only in `fleet50_*`): **5 batch wireless routers** (path B, teal, with
   expanding radio-wave rings) + a **wired HSR ring backbone** (path A, sky-blue racetrack loop with
   **two counter-travelling PRP frames** — same frame both ways) + a **validator chip on all 50
   machines** (instanced). Grounded in `floorLayout.js` new batch helpers (`BATCH_COUNT=5`,
   `batchOf`, `batchCenter`, `routerAnchor` off the −X edge, `batchRoster`) — 50 machines = 5 batches
   × 10 nodes, one batch per grid row. The fleet50 logs carry no channel events, so this is the
   network *architecture* (flagged illustrative, like the robot cell), NOT a live per-event decision.
   Perf: **~114 draw calls / ~95k tris** on the full floor (comms adds ~15 calls) — 60fps.

New/changed: `src/commsNetwork.js` (new); `eventModel.js`, `foldState.js`, `floorLayout.js`,
`gossip.js`, `audio.js`, `hud.js`, `theme.js` (+`integrity`/`wireA`/`wireB`), `main.js`, `index.html`
(legend: log-driven reject row under *Replayed from log*; path A/B topology under *Illustrative*).
Clean 3-node ⇄ fleet switching (fleetComms hides / nodeValidators show on 3-node), no console errors.
Run: `run_dashboard.py` → `/3d` → **comms integrity** (3-node reject) or any `fleet50_*` (topology).

Still honoured: additive · render-only (the reject verdict is the real logged comparator decision;
the floor topology is flagged architecture) · Zenoh **peer** labelling · signature-only on the wire
· scaled spindle analog never a real CNC · the live 3-process Zenoh core is untouched.

---

## Addendum 2026-07-02 — Fleet-50 P4: fleet behaviour parity (built)

> Brings the rich 3-node render channels to all 50 machines. Until now `fireTransients`
> early-returned in fleet mode and `fleetFloor.applyStates` only did a raw-state disc + a red halo —
> so the 50-floor had no machine-stop, no fault-flavour colours, no sound, no gossip. P4 closes that
> gap. Additive, render-only; **85 tests stay green** (no Python touched). Verified in-browser.

**Four parity channels, each the SAME folded field the 3-node rig already uses (never computed):**
1. **Machine-stop on defect** (`fleetFloor.js`): per-instance `halted[i] = ns.confirmed_fault` +
   an eased `motion` factor (1→0) that scales the spindle spin/jitter — a faulted machine visibly
   **spins down + parks**. Crucial detail: `spinAngle[i]` is now **accumulated** (`+= dt·rate·mo`),
   not `now·rate`, so scaling the rate by the easing motion can't wind the angle backwards. Verified:
   at batch t7, M10 (confirmed) spindle Δ≈0.001/0.25s = stopped, M20 (healthy) Δ≈0.6 = still spinning.
2. **3 fault-flavour colours**: `applyStates` now uses **`situationColor(ns)`** (not raw
   `STATE_COLOR`) for the disc, beacon **and halo** (halo switched to per-instance `instanceColor`,
   material white) — orange new-pattern · violet born-wise · red unknown · amber stale · teal, exactly
   as on the 3-node rig. Verified: divergence M23 = one orange outlier among 49 teal; batch M10..M15
   orange cluster.
3. **Throttled sound** (`main.js` `fireFleetTransients`): audio fires **once per event KIND per tick**
   (never 50 simultaneous beeps) — klaxon on systemic, teach/learn/fault/stale/recover/reject one
   each; a single vignette by priority. Same `audio.js` cues as 3-node.
4. **Gossip on all 50** (`fleetFloor.js` pooled FX): a teacher **broadcast shockwave** on each
   logged teach + a **per-learn arc** (short-lived fading line, capped `MAX_ARC=130`) + an **absorb
   pop** at each receiver; systemic → **red alarm pulses** over the contributing nodes. At 50-scale
   the arcs fade in <1s so a 294-learn batch tick reads as a spreading peer-to-peer mesh without a
   permanent draw-call blowup. Perf at the systemic burst: ~268 draw calls (settles back to ~114).

Wired via `main.js`: `fireTransients` now dispatches to `fireFleetTransients(evs)` in fleet mode
(was an early `return`); `select()` calls `fleetFloor.clearFx()` on scenario switch. No 3-node
regression (its transient path is unchanged; verified divergence still spawns gossip bursts). New
`fleetFloor` methods: `broadcast`/`gossipArc`/`alarmPulse`/`clearFx`. Changed: `fleetFloor.js`,
`main.js` only (+ `fleetFloor` added to the debug `window.__vivarium`).

Still honoured: additive · render-only (every disc/halo/stop/FX is a folded field; the router/ring
topology + robot cell stay the only *illustrative* floor elements) · Zenoh **peer** labelling ·
scaled spindle analog never a real CNC · NOT a Round-1 §2 scope change.

---

## Addendum 2026-07-03 — Fleet-50 cells upgraded: high-detail 6-axis arms + belt conveyors (built)

> Render-only fidelity pass on the fleet floor's material-handling rig, at the user's request ("more
> detailed, not chopped … conveyor belts + robo-arm 3D models that go well with the 50-machine setup —
> numbers, arrangement, workings"). Rewrites `src/fleetCells.js` **in place** (same instanced
> architecture); no data/scenario/test change. Web-researched the real machine-tending cell layout
> first (AMD/KUKA/Universal-Robots tending guides + 6-axis anatomy) — it confirmed the arrangement
> `floorLayout.js` already encodes, so the fix was **fidelity, not rearrangement**. Verified in-browser.

**Why keep procedural + instanced (not import CAD):** 25 arms must ARTICULATE (per-segment FK), and
a single rigged glTF instanced 25× can't pose its joints independently while staying a few draw
calls. So the win is **push the procedural detail way up while keeping one InstancedMesh per
kinematic segment** — detail is then ~free in draw calls (costs tris, which are cheap). (The user's
own conveyor/arm CAD is still native SolidWorks/Parasolid the open toolchain can't read — addendum
2026-06-30; STEP/glb re-exports remain swap-ready via the same loader path.)

**Robot arms — proper 6-axis articulated** (was faceted low-seg primitives): J1 waist turret → J2
shoulder + **CapsuleGeometry** lower arm → J3 elbow + capsule forearm → J4/J5/J6 **spherical wrist**
→ **3-finger gripper**; smooth high-segment castings (24–40 seg), rounded pedestal + foot flange +
bolt ring, **amber J2/J3 servo motors** (new `MAT.motor` "M" instance group per segment), a **cyan
accent ring** at the J1 seam (SYNAPSE palette). Kinematics unchanged (same FK chain / link lengths /
wrist-vertical derivation), so the tend choreography still lands on the belts; keyframes widened to a
clearer pick-infeed → carry-over-CNC → place-outfeed arc.

**Conveyor belts — real belt conveyors** (were exposed roller conveyors): steel C-channel side frames
+ guard rails + braced legs, a dark **rubber belt surface**, machined **head/tail pulley drums**
(spin about their own axis), **scrolling cleats** across the belt (so the surface visibly RUNS), an
amber **drive motor** at the head, and blanks riding the belt. 25 cells × (infeed + outfeed) = **50
belt conveyors**; 25 arms; 50 CNCs — the real "one robot per two machines" tending ratio.

**Instanced + smooth:** the whole 25-cell rig is **18 InstancedMesh** (arm segments L/D/M/A +
frame/belt/pulleys/cleats/motor/parts). Whole fleet floor incl. comms = **~129 draw calls · ~273k
tris** (was ~85k — the extra tris are the smooth capsules/spheres, trivially 60 fps). Verified:
close-up shows a clean articulated arm + running belt; belt motion pumped (pulleys spin, cleats
scroll, parts flow); overview composes; no console errors. Only `fleetCells.js` changed (+ `fleetCells`
added to the debug `window.__vivarium`).

Still honoured: additive · render-only (the arms/belts/flow are COSMETIC "line is running", flagged
illustrative — CNC states/gossip/halos stay log-driven) · Zenoh **peer** labelling · scaled spindle
analog never a real CNC · NOT a Round-1 §2 scope change.

---

## Addendum 2026-07-03 — Fleet-50 P3: real CAD machine bodies + hero-cell swap (built)

> The last open render slice: the 50 fleet CNC BODIES were low-poly procedural proxies
> (`fleetFloor.js` `bodyGeometry()`). At the user's request ("replace the chopped machines with the
> 3D model from the batch-defect scenario, more detailed") they're now the REAL CNC 3018 CAD — the
> SAME `cnc3018_parts.glb` the 3-node scenarios render. Render-only; no data/scenario/test change.
> Verified in-browser. Completes P3 of the 2026-06-27 fleet plan.

**The crux (why instancing + decimation):** the full model is **~325 k tris / 222 parts per machine**
→ 50× ≈ **16 M tris** = unrenderable as separate meshes. So `cadBody.js` gains **`buildFleet()`**:
it re-uses `make()`'s centre/floor-drop/scale, classifies parts (frame/bed/carriage/spindle), and
merges them into **one instanced-able geometry**, **decimated** by dropping sub-`bodyMinSize` (30 mm)
fasteners that don't read at fleet zoom → **~71 k tris/body**. Attributes are normalised (position +
normal only, non-indexed) so the mixed-attribute CAD parts merge. The **spindle group is kept whole
and re-centred on its own axis** so each instance can still spin + machine-stop (P4). Returns
`{ bodyGeo, spindleGeo, spindleOffset }`.

**`fleetFloor.js`:** takes `cad`; when present, the instanced `bodies` use `bodyGeo` (steel
`cadBody` material, `castShadow=false` for perf) and the instanced `spindles` use the CAD
`spindleGeo` placed at `spindleOffset` (spun/stopped exactly as before). Gossip-FX + label anchors
moved to a dedicated elevated `fxAnchor` (decoupled from the now-low CAD spindle origin). **Falls
back to the procedural proxy** if the glb is missing (air-gapped demo never hard-fails). Result:
50 real-CAD machines = **1 instanced draw call**; whole floor **~129 draw calls / ~4.5 M tris**, 60 fps.

**Hero-cell swap (`main.js`):** double-clicking a fleet machine (`focusFly`) stands the **full
222-part animated CAD** (`cad.make()`, one shared hero) at that machine's spot — `fleetFloor.setHidden`
scales the decimated instance to ~0 so the hero replaces it — and the hero's spindle spins/parks +
glows the node's `situationColor`, driven by the SAME folded fields. `hideHero()` on
reset/scenario-switch restores the instance. Verified: focus M12 → full 325 k-tri hero at (−8.25,−5.2),
instance hidden; switch away → instance restored (scale 1), hero hidden; M23 halt spindle Δ≈0 vs
healthy Δ≈0.6; no console errors; 3-node rig untouched.

Changed: `cadBody.js` (`buildFleet` + `bakeMesh`), `fleetFloor.js` (cad param · CAD body/spindle ·
`setHidden`/`machineBasePos` · fxAnchor), `main.js` (pass `cad` · hero create/show/hide/animate).

Still honoured: additive · render-only (the CAD bodies replace the proxy 1:1; every state/spindle/
halo is the folded log) · Zenoh **peer** labelling · scaled spindle analog never a real CNC · glb
stays git-ignored (license uncleared) with a procedural fallback · NOT a Round-1 §2 scope change.

---

## Addendum 2026-07-03 — Fleet-50 P6: perf/shadow polish pass (built) — INDUSTRIAL LINE COMPLETE

> The final slice of the 2026-06-27 / 07-02 industrial-line plan. Render-only; no data/scenario/test
> change (85 tests green). Verified in-browser. **With P3–P6 done, the whole fleet-scale twin is
> complete** — real-CAD machines, detailed arms + belt conveyors, comms network, fleet behaviour
> parity, and now grounded shadows.

**Perf first (measured, not assumed):** a `gl.finish()`-synced micro-bench of the full fleet floor
(50 real-CAD machines + 25 arms + 50 belt conveyors + comms + gossip FX) renders in **~0.5–2.7 ms/
frame** (drawCalls ~129 · ~4.5 M tris) — i.e. **far** under the 16 ms / 60 fps budget, with large
headroom. So P6 spends that headroom on shadow QUALITY rather than chasing a perf problem that isn't
there.

**Mode-aware shadow frustum** (`scene.js` now returns the `key` light; `main.js` `setShadowMode()`,
called from `select()` on the mode axis): the shadow-casting key light was sized to the 3-node
triangle (**±16 / 2048**), so the far cells + edge machines of the much-wider fleet floor fell
outside the shadow map and read as ungrounded. Fleet mode now widens it to **±26 / 4096** (denser
texels than the 3-node map despite the larger area); the 3-node view restores **±16 / 2048** for
crisp close shadows. Switching disposes + rebuilds the map at the new size.

**Grounded machines:** the instanced CAD bodies + spindles had `castShadow=false` (a P3 perf hedge);
with the measured headroom they're back to **`castShadow=true`**, so all 50 machines throw real
contact shadows onto the floor + belts. Verified: whole-floor shadows across every row (was only the
centre ±16), clean (no acne/peter-panning) up close, 3-node view still crisp + unchanged, no console
errors, still far under 60 fps.

Changed: `scene.js` (return `key`), `main.js` (`setShadowMode` + call in `select`), `fleetFloor.js`
(bodies/spindles `castShadow=true`).

Still honoured: additive · render-only · Zenoh **peer** labelling · scaled spindle analog never a
real CNC · NOT a Round-1 §2 scope change.

---

## Resume here — current status & next task (updated 2026-07-02)

> The single place a fresh session checks to know **what's done** and **what to build next**.
> Persistent memory lives in three synced places: **this file** (design source of truth), the
> **graphify graph** (`graphify-out/`, code map — `graphify query "..."`), and the **Obsidian vault**
> (`SYNAPSE-Home.md` + `notes/`). Keep all three updated after meaningful work.

### Done (do not rebuild)
- **Round-1 core (the locked §2 deliverable):** real 3-node fleet, full L1–L4 stack, real Zenoh
  **peer** P2P over localhost. Run it: `.venv/bin/python scripts/run_scenario.py <divergence|
  batch_defect|stale_quarantine>` → writes `events/<name>.jsonl`. Dashboard:
  `.venv/bin/python scripts/run_dashboard.py --port 8092` → 2D at `/`, 3D twin at `/3d`. 60 tests
  green (one known flaky: `test_divergence_is_deterministic`, real-Zenoh timing — re-run to confirm).
- **Vivarium 3D twin** (`dashboard/static/vivarium/`, render-only): animated **CAD CNC machines**
  (`cnc3018_parts.glb`, spindle spin + carriage sweep + state-coloured spindle), a **robot-tended
  cell** (6-axis arm + 2 roller conveyors + working pick-and-place), and an **industrial
  environment** (floor lanes, walls, trusses, railings). See addenda 2026-06-26 / 06-30.
- **Fleet-50 Phase 1 — the data generator (addendum 2026-07-01):** `synapse/scenarios/fleet.py`
  (50-CNC/25-cell roster + parametric specs) + `scripts/run_fleet_scenario.py` (in-process bus,
  deterministic clock) emit `events/fleet50_<divergence|batch_defect|stale_quarantine>.jsonl` from
  the **real L1–L4 stack for all 50 nodes**; dashboard serves them via the same `/api/events`. 7
  new fleet tests green (CWRU-only). Regenerate a log: `.venv/bin/python
  scripts/run_fleet_scenario.py fleet50_<name>`.
- **Fleet-50 Phase 2 — the factory floor (addendum 2026-07-01):** selecting a `fleet50_*` scenario
  in the twin (`/3d`) renders the 50 CNCs as an **InstancedMesh floor** (`src/floorLayout.js` roster
  + `src/fleetFloor.js`); state colour per disc + a red confirmed-fault halo, driven by the same
  fold. 3-node ⇄ fleet switching is clean; verified in-browser. All three money shots read at scale.
- **Stale→recover loop + immersive 3-node twin (addendum 2026-07-01):** new **REAL** recovery
  scenario `stale_recovery` (opt-in `NodeAssessor` auto-recovery via `recalibrate()`; deterministic
  in-process log; `EventType.RECOVER`) + an immersive render layer on the 3-node rig — synthesized
  **beep** alarms (`src/audio.js`), rotating warning **beacons** (`src/beacons.js`), a
  self-quarantine **containment dome** (`src/quarantine.js`), enriched gossip
  (shockwave/absorb/arc-mute), a narration **caption**, an alert **vignette**, and an under-the-hood
  **node console** (self-trust gauge vs τ). All driven by the folded log. 72 tests green (60 + 7
  fleet + 5 recovery). Run: `scripts/run_offline_scenario.py stale_recovery`, view `/3d`.
- **Twin UX/fidelity pass + knowledge auto-sync (addendum 2026-07-02):** robot cell relocated to a
  separate left-side station (clear of the CNC line); camera **persists across same-mode scenario
  switches**; responsive controls (zoom-to-cursor, wider range, interruptible fly-to); legend
  red-rectangle bug fixed + tabs wrap; higher fidelity (exposure/fill light/floor sheen). New
  `scripts/sync_knowledge.sh` wired to a `Stop` hook auto-refreshes graphify + HTML + Obsidian
  export (LLM-free) after each turn; CLAUDE.md addenda stay session-authored.
- **Cognition view — the AI workflow made physical (addendum 2026-07-02):** a NEW render-only view
  at **`/ai`** (sibling to `/3d`) that dramatizes the internal L1→L4 intelligence as three "mind"
  towers — SENSOR→L1 lens→**L2 self-trust core** (grows with confidence)→L3 memory crystals
  (provenance-coloured)→L4 gossip emitter, + a base trust halo, an **isolation shell** for
  self-quarantine, and a central **fleet-mind nexus** that flares on systemic alarm. Reuses the
  same `/api/events` + `eventModel`/`foldState`/`hud`/`labels`/`audio`; click a mind → L1–L4
  console. Files: `cognition.html` + `src/cognition/{cogScene,mind,synapseFlow,cogMain}.js`.
  Cross-linked `/3d` ⇆ `/ai`. Verified in-browser; 72 tests green. View: `run_dashboard.py
  --port 8092` → `/ai`.
- **Machine-stop-on-defect (addendum 2026-07-02):** on the 3-node twin (`/3d`) a machine that
  confirms a defect (`confirmed_fault`) now **halts** — spindle spins down + carriage parks (eased
  `mo` factor in `main.js`), with a `⏹ MACHINE STOPPED` read-out on the label/inspector/caption and
  a legend row. Render-only, keyed off the real logged field. Verified: divergence (only A stops;
  B/C learn born-wise) + batch_defect (A & B stop; C learns). Fleet mode untouched.
- **Cross-learning scenario (addendum 2026-07-02):** NEW 3-node offline scenario `cross_learning`
  — the full learn→teach→predict cycle in one arc with **no fixed roles** (A detects+teaches inner;
  B detects+teaches a different fault; C recognizes A's pattern in its OWN data born-wise
  (`recognition_source=PEER`) without escalating → systemic warning). Every node teaches AND learns.
  `synapse/scenarios/cross_learning.py` + `tests/test_cross_learning.py` (6, CWRU-only); the twin
  surfaces a derived "born-wise warn" beat + caption. **78 tests green** (72 + 6). Regenerate:
  `.venv/bin/python scripts/run_offline_scenario.py cross_learning`.
- **Fault-flavour colours + slower playback + visible peer wires (addendum 2026-07-02):** the 3-node
  twin now colours a stopped machine by WHY (`situationColor` in `src/theme.js`): **orange** = new
  pattern (first-hand), **violet** = AI found it born-wise (peer's pattern), **red** = unknown →
  human; matching labels + legend + beacon modes. Default playback speed lowered to **0.25×** (+0.1×
  option); the Zenoh peer-link **wires are now always visible** (`src/gossip.js`). Render-only.
- **Real redundant dual-channel transport + per-node comparator (addendum 2026-07-02, slice 1):**
  PRP + 1oo2D in code — `synapse/l4_gossip/redundancy.py` (`RedundantPublisher` + independent
  per-node `ChannelComparator`: accept/reject-mismatch/degraded). Opt-in via `ScenarioSpec.dual_channel`
  (+ `channel_tamper`); `comms_integrity` scenario (B learns via the clean path, C rejects a tampered
  path-B copy → never ingested = anti-poisoning gate). `EventType.CHANNEL_REJECT`; 7 new tests. All
  existing scenarios byte-identical (default off). First slice of the 50-machine industrial-line
  expansion. Run: `.venv/bin/python scripts/run_offline_scenario.py comms_integrity`.
- **Fleet-50 robot-tended cells — high-detail (addenda 2026-07-02 + 07-03):** the `fleet50_*` floor
  has **detailed 6-axis robot arms + belt conveyors on all 25 cells** (`src/fleetCells.js`), every
  part instanced across cells + a shared FK chain posing each arm. The 07-03 pass upgraded fidelity:
  proper 6-axis anatomy (waist→shoulder+**capsule** lower arm→elbow+forearm→**spherical wrist**→
  3-finger gripper + amber servo motors + cyan accent), and roller conveyors → real **belt
  conveyors** (belt surface + head/tail pulleys + scrolling cleats + drive motor). 18 instanced
  meshes; whole floor incl. comms **~129 draw calls / ~273k tris**, 60 fps (detailed AND smooth).
  Arms tend (phase-offset pick→carry→place), belts run, blanks flow (cosmetic, flagged illustrative).
  Fleet-mode only; 3-node rig untouched.
- **Fleet-50 P3 — real CAD machine bodies + hero-cell swap (addendum 2026-07-03):** the 50 fleet CNC
  bodies are now the **real CNC 3018 CAD** (same `cnc3018_parts.glb` as the 3-node rig), not low-poly
  proxies. `cadBody.buildFleet()` merges + **decimates** the 325k-tri/222-part model to ~71k tris
  (drops sub-30mm fasteners) so all 50 share **1 instanced draw call**; the spindle is a separate
  axis-centred group that still spins/stops (P4). Double-clicking a machine swaps in the **full
  222-part animated hero CAD** (`fleetFloor.setHidden` parks the instance). Procedural fallback if the
  glb is missing. Whole floor **~129 draw calls / ~4.5M tris**, 60fps. `fleetFloor.js` + `cadBody.js`
  + `main.js`; verified in-browser; 3-node rig untouched.
- **Fleet-50 P6 — perf/shadow polish (addendum 2026-07-03) — INDUSTRIAL LINE COMPLETE:** measured
  the full fleet floor at **~0.5–2.7 ms/frame** (far under 60fps), then spent the headroom on shadow
  quality: a **mode-aware shadow frustum** (`scene.js` returns `key`; `main.js` `setShadowMode()`) —
  fleet **±26 / 4096**, 3-node **±16 / 2048** — and re-enabled `castShadow` on the instanced CAD
  bodies/spindles so all 50 machines throw grounded contact shadows across the whole floor (was only
  the centre ±16). Verified clean (no acne) + 3-node unchanged. With P3–P6 done the fleet-scale twin
  is complete. `scene.js` + `main.js` + `fleetFloor.js`.
- **Fleet-50 P5 — comms network render + reject alarm (addendum 2026-07-02):** the redundant
  transport is now VISIBLE. `eventModel.js` maps `CHANNEL_REJECT`/`CHANNEL_DEGRADED` (previously
  dropped) → folded per-node `channel` field. 3-node `comms_integrity` gets a **log-driven** reject
  read-out: a per-node **validator badge** (`src/commsNetwork.js` `createNodeValidators`) goes
  **magenta** on a real reject + magenta arc packet (`gossip.reject()`) + `reject` audio + vignette +
  caption + `[REJECT]` ticker tag + inspector `channel (co-MCU)` row. The `fleet50_*` floor gets the
  **illustrative** PRP topology (`createFleetComms`): 5 batch wireless routers (path B) + wired HSR
  ring backbone (path A, 2 counter-PRP frames) + 50 validator chips (`floorLayout.js` batch helpers).
  ~114 draw calls / 60fps. 85 tests green (no Python change). View `/3d` → comms integrity / fleet50_*.
- **Fleet-50 P4 — fleet behaviour parity (addendum 2026-07-02):** the 50-floor now has the 3-node
  render channels — **machine-stop on defect** (spindle spins down + parks, accumulated `spinAngle`),
  the **3 fault-flavour colours** via `situationColor` on disc/beacon/**halo** (orange/violet/red/
  amber/teal), **throttled sound** (one cue per event-kind per tick — no 50-beep pileup), and
  **gossip on all 50** (teacher shockwave + per-learn arcs/pops + systemic red pulses, pooled +
  capped so a 294-learn tick reads as a spreading mesh). `fireTransients` → `fireFleetTransients`
  (was a no-op in fleet mode); `fleetFloor.js` gained `broadcast/gossipArc/alarmPulse/clearFx`.
  Verified: divergence one orange outlier + radiating gossip; batch orange cluster + systemic klaxon;
  M10 spindle Δ→0 vs healthy M20 still spinning. 85 tests green (JS only). Files: `fleetFloor.js`, `main.js`.

### NEXT TASK — 50-machine industrial line + redundant comms network (active direction)
> New direction set 2026-07-02 with the user (image `IMG_9208.heic` + web research). Grows the
> fleet floor into a full networked industrial line. The old fleet50 Phase-1/2 are done; the
> **detailed robot arms + conveyors are now built** (`src/fleetCells.js`, addendum above); the
> **real redundant transport slice 1 is built** (`redundancy.py` + `comms_integrity`, addendum
> above). Remaining slices below. Twin still **RENDERS, does not COMPUTE**; the comms transport is
> an authorized extension of §2 (the user explicitly asked for a REAL second transport).

**Locked architecture decisions (from the research answer + the `fleet_comms_diverse_redundant_paths`
diagram; user's sketch was validated as correct):**
- Comms = **PRP (IEC 62439-3) with media diversity** (one wired, one wireless) + a **1oo2D
  comparator** — the user's two-paths-cross-checked design IS this real standard.
- **50 machines = 5 batches × 10 nodes** (network/router domains). 25 cells (2 CNC each) nest as
  **5 cells per batch**. One **wireless router per batch** (path B); batch-to-batch backbone is a
  **wired HSR ring** (path A) — NOT a single master (avoid single point of failure/trust).
- The **validator sits on EVERY edge node, independent of the main compute** (a co-MCU) — PRP does
  duplicate-discard per node; 1oo2D wants diversity. Decided; do not centralise it.
- Add **PTP / IEEE 1588 time sync** and treat the comparator as an **integrity / anti-poisoning
  gate** (ties to the §10 tamper-evidence + trust-poisoning pilot gaps).

**Open slices (pick up here):**
- **P3 — high-detail CNC bodies. ✅ DONE (addendum 2026-07-03).** The 50 fleet bodies are the real
  CNC 3018 CAD (`cadBody.buildFleet()` — merged + decimated ~71k tris, 1 instanced draw call) with a
  full-222-part **hero-cell swap** on `focusFly` (`fleetFloor.setHidden` parks the instance).
  Procedural fallback preserved. Only P6 remains open.
- **P4 — fleet behaviour parity. ✅ DONE (addendum 2026-07-02).** Machine-stop, 3 fault-flavour
  colours (`situationColor` on disc/beacon/halo), throttled sound, and gossip FX (shockwave + arcs +
  pops + systemic pulses) are live on the 50-floor. `fireFleetTransients` in `main.js`;
  `broadcast/gossipArc/alarmPulse/clearFx` in `fleetFloor.js`. (Beacons on the floor = the instanced
  status sphere; the rotating `beacons.js` rig stays 3-node.)
- **P5 — render the comms network + surface the reject. ✅ DONE (addendum 2026-07-02).** 5 batch
  routers + wired HSR ring + per-node validators (`src/commsNetwork.js`); `eventModel.js` maps
  `CHANNEL_REJECT`/`CHANNEL_DEGRADED` → folded `channel` → a magenta "path mismatch → rejected"
  alarm on the 3-node `comms_integrity` view. *Still-open follow-on (optional):* take the comparator
  **live** — `redundancy.py` is transport-agnostic, so a second Zenoh session can carry path B in the
  3-process core; and a `fleet50_comms_*` dual-channel scenario would light a reject ON the floor
  topology (fleet50_* logs currently carry no channel events, so the floor topology is illustrative).
- **P6 — perf/shadow polish. ✅ DONE (addendum 2026-07-03).** Measured ~0.5–2.7 ms/frame; added a
  mode-aware shadow frustum (fleet ±26/4096, 3-node ±16/2048) + grounded contact shadows on all 50
  machines. `scene.js` + `main.js` (`setShadowMode`) + `fleetFloor.js`.

> **✅ INDUSTRIAL-LINE DIRECTION COMPLETE (P3–P6 all done, 2026-07-03).** The fleet-scale twin now
> has: real redundant PRP+1oo2D transport (code) + its comms-network render, real-CAD machines with
> a hero-cell swap, detailed 6-axis arms + belt conveyors, full fleet behaviour parity, and grounded
> shadows — verified in-browser, 85 tests green. **Optional follow-ons only** (no active must-do):
> take the comparator LIVE (2nd Zenoh session for path B — `redundancy.py` is transport-agnostic) +
> a `fleet50_comms_*` dual-channel scenario so a reject lights ON the floor topology; and the deeper
> Round-1 stretch goals in §6 (RUL conformal band, resilience kill-a-node proof).

**Key files:** `src/commsNetwork.js` (comms — done), `src/fleetCells.js` (detailed arms+belt
conveyors, done), `src/fleetFloor.js` (instanced real-CAD bodies + machine-stop + gossip-FX +
hero `setHidden` + shadows, done), `src/cadBody.js` (`buildFleet()` decimated instancing + `make()`
hero, done), `src/floorLayout.js` (roster/cells + batch grouping, done), `main.js` (`fleetMode`
branch — `fireFleetTransients` + hero-cell swap + `setShadowMode`, done), `src/eventModel.js`/
`foldState.js` (CHANNEL_* mapped, done), `synapse/l4_gossip/redundancy.py` +
`scripts/run_fleet_scenario.py` (dual-channel engine, done). Architecture memory:
`industrial-line-comms-plan.md`.
