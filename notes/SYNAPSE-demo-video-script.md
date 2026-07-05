# SYNAPSE — 5-minute demo video script (Round 1)

> Recorded demo (no live). Deterministic runs — capture clean takes. Target **5:00**, ~650 words VO
> at ~150 wpm + ~40s of "watch it happen" pauses. Tone: confident, concrete, honest — no overclaiming.

## Production notes
- **Aspect/res:** 1920×1080, 30fps. Dark UI throughout — matches the deck + twin.
- **Voice:** one narrator, calm and precise. Let the demo breathe (don't talk over every second).
- **Music:** low, tense-but-clean synth bed; lift slightly at the twin reveal (3:28) and the close.
- **Captions:** burn in the on-screen text below (accessibility + judges often watch muted first).
- **Screen sources to capture ahead of time (B-roll):**
  1. Deck slides 1,2,3,4,8,9,10 (from `SYNAPSE_Deck.pptx`) as full-screen stills/animations.
  2. Terminal launching the real fleet: `.venv/bin/python scripts/run_scenario.py divergence`
     (shows 3 independent Zenoh peer processes) → then `run_dashboard.py --port 8092`.
  3. **2D dashboard** at `/` (fleet health, per-node trust, divergence map, gossip log).
  4. **3D twin** at `/3d` for each scenario (machine states, gossip arcs, machine-stop, halos, alarm).
  5. **Cognition view** at `/ai` (mind towers, self-trust core, memory crystals, fleet nexus).
  6. Record each scenario separately: `divergence`, `batch_defect`, `stale_quarantine` (and
     `fleet50_*` / `stale_recovery` for extra floor/recovery B-roll).

---

## THE SCRIPT (timed, end-to-end)

### 1 · COLD OPEN — the hook  ‖ 0:00–0:18
- **SCREEN:** Slow orbit of the `/3d` 50-machine floor, all calm amber. One distant machine flares **red**. Cut to the **SYNAPSE** title (deck slide 1).
- **ON-SCREEN:** `SYNAPSE — Fleet-Learning Intelligence at the Edge`
- **VO:** "On a shop floor, dozens of identical CNC machines run the same job. One starts to fail. Today you find out late — machine by machine. But what if the fleet caught it *together*? That's SYNAPSE."

### 2 · THE PROBLEM  ‖ 0:18–0:48
- **SCREEN:** Deck slide 2 — isolated machines in glass bubbles, red ripple across the line.
- **ON-SCREEN:** `Blind to divergence · Blind to bad batches`
- **VO:** "Predictive maintenance today watches each machine alone, against a fixed threshold — so it reacts late. And it's blind to the two things that scrap parts. One: a machine quietly drifting away from its identical peers. Two: a bad tool or material batch hitting many machines at once. Per-machine monitoring can't see either — and shipping raw telemetry to the cloud to try means latency and a security no-go on the plant floor."

### 3 · THE IDEA  ‖ 0:48–1:18
- **SCREEN:** Deck slide 3 — the two cards: Cross-machine federation + Batch-defect immunity.
- **ON-SCREEN:** `Signatures only · No cloud · Peer-to-peer`
- **VO:** "SYNAPSE flips it. Identical machines *should* behave identically — so when one diverges from the fleet, that's a developing fault, flagged by the fleet, not a threshold. And when the same premature signature shows up across many machines at once, that's a bad batch — caught before it scraps the line. It's peer-to-peer, no central server, and only compact fault *signatures* ever cross the wire — never raw telemetry."

### 4 · ARCHITECTURE + THE HONEST BOUNDARY  ‖ 1:18–1:54
- **SCREEN:** Deck slide 4 (L1→L4 stack), quick cut to slide 8 (Real vs Sim table), then **terminal**: `run_scenario.py divergence` spins up 3 node processes; open the dashboard.
- **ON-SCREEN:** `3 independent processes · real Eclipse Zenoh peer mode`
- **VO:** "Every node runs a real four-layer stack: on-edge anomaly detection; a drift-conscience that calibrates its own self-trust; a fault-signature memory; and event-triggered gossip over Eclipse Zenoh, peer mode, no broker. Here's the honest part — this whole stack is real production code, running as three independent processes over real peer-to-peer networking. The *only* thing simulated is the sensor input, where we replay real instrumented-bearing datasets. Let's run it."

### 5 · DEMO 1 — DIVERGENCE CATCH  ‖ 1:54–2:27  *(money shot)*
- **SCREEN:** 2D dashboard + `/3d` twin. Node A's vibration climbs; B, C calm. A's disc turns red, halo appears, spindle **halts**; gossip arc fires A→B,C; B & C gain a "born-wise" marker.
- **ON-SCREEN:** `Scenario 1 · Divergence catch → born-wise learning`
- **VO:** "Scenario one. Node A replays a developing bearing fault while B and C stay healthy. Watch — A's signature *diverges* from its identical peers, and the fleet flags it. A confirms the fault, halts its spindle to prevent scrap, and teaches that signature to the others. And here's the magic: B and C now recognize a fault they've *never personally seen* — born-wise — purely from A's gossiped signature." *(2s hold, no VO)*

### 6 · DEMO 2 — SYSTEMIC BATCH-DEFECT  ‖ 2:27–3:00  *(money shot)*
- **SCREEN:** `run_scenario.py batch_defect`. A **and** B fault on the same tick; twin raises the **SYSTEMIC BATCH DEFECT** banner across the fleet.
- **ON-SCREEN:** `Scenario 2 · Systemic batch-defect immunity`
- **VO:** "Scenario two — the one per-machine monitoring simply can't do. We feed the same fault onset to two machines at the same moment. Instead of reading it as two separate wear events, the fleet sees an identical premature signature appear across machines at once — and raises a *systemic batch-defect* alarm. That's a bad insert lot, caught before it scraps the whole line." *(2s hold on the banner)*

### 7 · DEMO 3 — DRIFT-CONSCIENCE / SELF-QUARANTINE  ‖ 3:00–3:30  *(money shot)*
- **SCREEN:** `run_scenario.py stale_quarantine` (or `stale_recovery`). Node C's self-trust gauge drops below τ; amber containment dome descends; gossip out is greyed; incoming still lands. (If using recovery: trust re-climbs, dome lifts, C rejoins.)
- **ON-SCREEN:** `Scenario 3 · "Listen, don't teach"`
- **VO:** "Scenario three is the safety mechanism. Node C's data drifts from its training distribution. Its drift-conscience detects it, its self-trust drops below the line — and it *voluntarily stops teaching* the fleet. Listen, don't teach. A node that can't trust itself can't poison its peers — and once it re-earns trust, it rejoins."

### 8 · THE 3D TWIN — SCALE + THE INTELLIGENCE MADE PHYSICAL  ‖ 3:30–4:10
- **SCREEN:** `/3d` 50-machine floor orbiting — gossip mesh, one red-haloed outlier, robot cells running. Cut to `/ai` cognition towers — self-trust cores glowing, memory crystals, the fleet nexus flaring on a systemic alarm.
- **ON-SCREEN:** `Digital twin — it renders, it never computes`
- **VO:** "Everything you just saw, we can watch at fleet scale. This is Vivarium — a living 3D twin of a fifty-machine floor. Every colour, every trust ring, every gossip arc is a faithful replay of what the real nodes decided — it *renders*, it never fakes a number. And a second view makes the intelligence itself physical: each machine's mind, its self-trust growing, the memories it learns from peers, and the fleet-wide alarm when a batch defect hits."

### 9 · ROADMAP — STAGE 2 IS ONE SWAP  ‖ 4:10–4:36
- **SCREEN:** Deck slide 9 — timeline; highlight the `DatasetReplaySource → HardwareSensorSource` junction; a Raspberry Pi + sensor-rig image.
- **ON-SCREEN:** `Stage 2 = one interface swap · software risk retired`
- **VO:** "Because only the sensor source is simulated, Stage 2 is a single interface swap — from replayed data to a Raspberry Pi sensor rig, a scaled spindle analog. Nothing else changes; the software risk is already retired. And we're honest about the pilot-phase gaps — trust-poisoning defense at scale, tamper-evident logging — with a plan for each."

### 10 · CLOSE + CTA  ‖ 4:36–5:00
- **SCREEN:** Deck slide 10 (close) over a calm twin hero shot; end card with repo link + team.
- **ON-SCREEN:** `github.com/<your-repo>  ·  complements Tata AMP.IoT`
- **VO:** "SYNAPSE reduces scrap, optimizes tool life, and catches bad batches line-wide — serverless, signature-only, trust-gated federation at the edge. It complements Tata's AMP.IoT; it doesn't compete. The whole thing runs today, deterministically, on one laptop — and it's ready for the floor. Thank you."

---

## Timing summary
| # | Beat | In | Out | Len |
|---|------|----|-----|-----|
| 1 | Cold open / hook | 0:00 | 0:18 | 18s |
| 2 | The problem | 0:18 | 0:48 | 30s |
| 3 | The idea | 0:48 | 1:18 | 30s |
| 4 | Architecture + honesty | 1:18 | 1:54 | 36s |
| 5 | Demo 1 — divergence | 1:54 | 2:27 | 33s |
| 6 | Demo 2 — batch-defect | 2:27 | 3:00 | 33s |
| 7 | Demo 3 — self-quarantine | 3:00 | 3:30 | 30s |
| 8 | 3D twin + cognition | 3:30 | 4:10 | 40s |
| 9 | Roadmap | 4:10 | 4:36 | 26s |
| 10 | Close + CTA | 4:36 | 5:00 | 24s |

## Capture checklist
- [ ] Clean terminal (big font, dark theme) for the `run_scenario.py` launch — shows 3 real peers.
- [ ] Each scenario recorded twice (safety takes); runs are deterministic, so framing is repeatable.
- [ ] Dashboard `/`, `/3d`, `/ai` at 1080p, browser chrome hidden (full-screen / kiosk).
- [ ] Slow, smooth orbit on the twin (don't yank the camera).
- [ ] End card holds ~3s with repo + team so judges can note the link.

## Trims if you run long (get to 4:30)
- Merge beats 2+3 (problem→idea) into ~45s total.
- Show 2 of 3 scenarios in full (divergence + batch-defect), name the third in one line over B-roll.
- Cut the `/ai` cognition view; keep only the `/3d` floor in beat 8.
