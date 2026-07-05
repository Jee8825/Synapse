# SYNAPSE — Hackathon Pitch Deck (10 slides)

> Tata Technologies **InnoVent** — "AI at the Edge". Round-1 deliverable.
> This file holds, per slide: **on-slide content** (what the audience reads), **speaker notes**
> (what you say), and a **ready-to-paste image-generation prompt** (Midjourney / DALL·E / Ideogram /
> Firefly). The deck arc is deliberate: Hook → Problem → Idea → How → Novelty → Proof → Showpiece →
> Credibility → Roadmap → Close.

---

## Deck design system (apply to every slide)

- **Palette:** deep charcoal-navy background `#0A0E14 → #111827` · pale-cyan / electric-teal accents
  `#38E1D6` `#22D3EE` · amber = *safety / alarm only* `#F59E0B` · alert red `#F43F5E` ·
  born-wise violet `#A855F7`. (This is the real Vivarium twin palette — the deck should match the demo.)
- **Type:** a clean geometric sans — **Space Grotesk / Inter / Söhne** for headings, **Inter** for body.
- **Feel:** premium enterprise-keynote (NVIDIA / Siemens / Tata Technologies), lots of dark negative
  space, thin neon linework, one idea per slide.
- **Consistency:** keep the SYNAPSE wordmark bottom-left, slide number bottom-right, on every slide.

### Shared image-prompt style block (prepend to each slide's subject prompt)

```
Professional hackathon keynote illustration, 16:9 widescreen. Cinematic industrial-tech aesthetic.
Dark charcoal-to-deep-navy gradient background (#0A0E14 to #111827). Pale-cyan and electric-teal
glowing accents (#38E1D6, #22D3EE); sparse amber safety highlights (#F59E0B). Premium enterprise
keynote look (NVIDIA / Siemens / Tata Technologies style). Volumetric glow, thin neon linework,
soft depth of field, subtle particle haze, high detail, 8k render. No text, no watermark, no logos.
```

---

## SLIDE 1 — TITLE / HOOK

**On-slide**
- Wordmark: **SYNAPSE**
- Subtitle: *Fleet-Learning Intelligence at the Edge*
- Hook line: **"One machine develops a fault — the fleet catches it, because it diverges from its identical peers. A bad tool batch hits the line — the fleet catches it, before a single part is scrapped."**
- Footer strip: Tata Technologies InnoVent · *AI at the Edge* · Team [name] · [date]

**Speaker notes (20s)**
"Predictive maintenance today watches each machine alone. SYNAPSE makes the whole fleet learn together — peer-to-peer, on the shop floor, with no cloud. Here's how, and why the incumbents structurally can't."

**Image prompt**
> [style block] + A dark industrial shop floor at night, a long row of identical CNC machining
> centers receding into perspective depth. Each machine is crowned with a softly glowing cyan node;
> thin luminous teal arcs connect the machines peer-to-peer into a living mesh — deliberately NO
> central server, NO cloud. One distant machine glows faint amber, hinting a just-detected anomaly.
> Wide cinematic establishing shot, holographic and premium, volumetric fog, reflective polished floor.

---

## SLIDE 2 — THE PROBLEM

**On-slide**
- Headline: **"Every machine is monitored alone. The fleet is blind together."**
- Today's PdM (incl. cloud/centralized) scores each machine against a *fixed threshold* → it sees a
  machine degrade, **late**.
- Two failures it **structurally cannot** catch:
  1. A developing fault that only shows as **divergence from identical peers** — still under every
     single-machine threshold.
  2. A **systemic bad batch** (tool / insert / material lot) hitting many machines at once —
     invisible to per-machine monitoring.
- And the cloud answer costs you: **raw-telemetry export** (OT-security no-go), latency, a single
  point of failure.

**Speaker notes (30s)**
"A threshold on one machine can't see 'this machine is drifting away from its 49 identical siblings.'
And it definitely can't see 'the same premature signature just appeared on six machines at once —
that's a bad batch, not wear.' Those two blind spots scrap parts line-wide."

**Image prompt**
> [style block] + Split composition. LEFT: several CNC machines each isolated inside its own dim
> siloed glass bubble, each with a small red threshold dial — disconnected, blind to each other.
> RIGHT: a shop-floor line where the same red defect pattern silently ripples across many machines
> at once, unnoticed. A faint broken/latent link to a distant cloud icon overhead. Mood: risk,
> isolation, missed signal. Muted reds among the cyan.

---

## SLIDE 3 — THE BIG IDEA

**On-slide**
- Headline: **"Identical machines should behave identically — so the fleet notices when one doesn't, and when they all fail the same way at once."**
- **① Cross-machine federation** → catch **divergence**: one machine drifts from N identical peers =
  a developing spindle/alignment fault, flagged by the **fleet**, not a threshold.
- **② Systemic batch-defect immunity** → the *same* premature signature on many machines at once =
  a bad lot, caught **before it scraps the line**.
- **The wire rule:** peer-to-peer, no cloud, and **only compact fault signatures cross the wire —
  never raw telemetry.**
- Positioning footer: *"AMP.IoT shows you a machine is degrading. SYNAPSE lets the fleet catch a bad
  batch before it scraps parts — peer-to-peer, on the floor, no cloud round-trip. We complement
  Tata's product, we don't compete with it."*

**Speaker notes (30s)**
"The insight is almost obvious once you say it: identical machines running the same part program
should wear near-identically. So *divergence* is signal, and *simultaneous identical failure* is a
different signal. Federating that across the fleet is the capability incumbents lack."

**Image prompt**
> [style block] + An elegant constellation of identical machine-nodes rendered as glowing cyan
> hexagonal tokens arranged on a dark grid. ONE node pulses amber as a clear outlier, with bright
> divergence lines radiating to distinguish it from its calm peers. Separately, a small cluster of
> nodes flares red *in unison*. Where machines connect, only tiny compact "signature" glyph-packets
> travel the links — not thick data streams. Clean network-diagram-meets-factory aesthetic.

---

## SLIDE 4 — ARCHITECTURE (L1 → L4)

**On-slide**
- Headline: **"Four real layers, running on every edge node."**
- **L1 · Worker** — on-edge anomaly detection (**Isolation Forest**), < 5 ms/window.
- **L2 · Drift-conscience** — **ADWIN** drift + **conformal** prediction → a *calibrated self-trust* score.
- **L3 · Case memory** — **FAISS** fault-signature store: provenance · decay · dedup/merge · bounded eviction.
- **L4 · Gossip** — **Eclipse Zenoh peer mode**: event-triggered, trust-gated, **signature-only**.
- Caption band: **"Only the sensor input is simulated. Everything above it is production code."**

**Speaker notes (35s)**
"Each node integrates four layers. L1 scores the window. L2 is the conscience — it knows when it's
drifted. L3 is the memory of fault signatures with provenance and decay. L4 gossips a signature only
on a confirmed new fault, and only if the node trusts itself. It's real Zenoh peer-to-peer — three
independent OS processes even on one laptop."

**Image prompt**
> [style block] + A vertical exploded-stack schematic inside a translucent CNC machine silhouette.
> Four stacked glowing glass layers labelled conceptually bottom-to-top (sensor intake → detection
> lens → a bright trust-core orb → a memory-crystal ring → a gossip emitter at the top). Luminous
> cyan data particles rise from the sensor at the base through each layer and emit outward as
> signature packets at the top. Precise engineering-schematic style, teal wireframe, dark background.

---

## SLIDE 5 — THE NOVELTY: DRIFT-CONSCIENCE (three-state)

**On-slide**
- Headline: **"A node that can't trust itself stops teaching the fleet."**
- **① Confident** — high self-trust → detect, diagnose, **teach** the fleet.
- **② Stale** — drift detected → **"listen, don't teach"** (self-quarantine, so it can't poison peers).
- **③ Unknown** — *neither I nor any trusted peer has seen this* → **escalate to a human**.
- Upgrade ladder: **detect → diagnose → recommend → act-or-escalate**, with a Planner→Critic
  guardrail (*self-heal soft faults only; never auto-act on a hard fault*).
- Why it wins: the honest novelty is the **synthesis** — serverless + signature-only + trust-gated
  federation at the edge — not the individual primitives.

**Speaker notes (35s)**
"This is the part judges remember. A drifting node voluntarily *stops teaching* — it becomes a
learner, not a poisoner. That trust-gate is what makes federation safe without a central referee.
Drift detection, conformal prediction, gossip all exist separately — we couldn't find a system that
combines them into cross-machine, signature-only, batch-defect federation at the edge."

**Image prompt**
> [style block] + Three CNC machine-nodes side by side, each in a distinct glowing state.
> LEFT: a bright cyan node radiating knowledge outward (teaching). CENTER: a node sealed inside a
> translucent amber containment dome, with arrows flowing only INWARD (listening, self-quarantined).
> RIGHT: a node flaring red with a vertical escalation beacon rising toward a simple human silhouette
> at the top. Clean triptych, strong colour-coded storytelling, dark stage-lit background.

---

## SLIDE 6 — THE MONEY SHOTS (3 deterministic proofs)

**On-slide** — three columns:
1. **Divergence catch** — Node A replays fault-onset while peers stay healthy → A's signature
   diverges from its identical peers → **flagged by the fleet**, not a threshold.
2. **Batch-defect immunity** — feed the *same* onset to A **and** B at the same tick → identical
   premature signature on two nodes at once → flagged **systemic**, not per-machine wear.
3. **Stale self-quarantine** — Node C's data drifts → ADWIN + conformal drop self-trust → it goes
   **"listen, don't teach."**
- Footer: **"Byte-for-byte reproducible · real L1–L4 · real Zenoh peer P2P across independent processes."**

**Speaker notes (30s)**
"Three scenarios, each fully deterministic for a clean recorded demo. Divergence, batch-defect, and
self-quarantine — the three behaviours that define the system, all driven by the real stack."

**Image prompt**
> [style block] + A cinematic three-panel triptych of the SAME small fleet under three conditions,
> divided by thin glowing separators. Panel 1: one cyan node as a red-highlighted outlier with
> divergence lines. Panel 2: a cluster of nodes flaring red simultaneously with a "SYSTEMIC" pulse
> ring. Panel 3: one node under a translucent amber quarantine dome. Unified visual language across
> all three, dark premium background.

---

## SLIDE 7 — THE VIVARIUM 3D DIGITAL TWIN  *(showpiece)*

> **BEST OPTION: drop in a real screenshot of your `/3d` twin here** — a genuine render of the
> 50-machine floor beats any AI image and proves it's built. The prompt below is a fallback / cover art.

**On-slide**
- Headline: **"A living 3D twin of the fleet — it *renders* what the nodes decided; it never fakes a number."**
- Orbit-able **50-CNC factory floor**: real CAD machines, robot-tended cells, belt conveyors, comms network.
- Every node colour · trust ring · gossip arc · alarm is a **faithful replay of the real L1–L4 event log**.
- Two companion views: **`/3d`** factory floor + **`/ai`** cognition view (*the intelligence, made physical*).
- Real **redundant PRP + 1oo2D** dual-channel transport with a **per-node integrity comparator** (anti-poisoning gate).
- Footer: **"The twin RENDERS, it does not COMPUTE — honest by construction."**

**Speaker notes (35s)**
"To make this legible we built Vivarium — a 3D digital twin. Crucially, it doesn't compute anything;
it replays the exact event log the real nodes produced, so every colour and every gossip arc is
honest. It scales to a 50-machine floor with robot cells, and it renders our real redundant comms
network with an integrity comparator that rejects a tampered signature copy."

**Image prompt**
> [style block] + A breathtaking holographic 3D digital-twin of a smart factory floor floating above
> a dark control-room table. ~50 CNC machines arranged in robot-tended cells, articulated 6-axis
> robot arms mid-tend, belt conveyors carrying blanks. Overlaid on it: a glowing cyan peer-to-peer
> mesh plus a sky-blue ring backbone (network topology). One machine is haloed red (a caught fault),
> its peers calm cyan. Cinematic "digital twin" hologram aesthetic, depth, particle glow, awe-inspiring.

---

## SLIDE 8 — REAL vs SIMULATED (credibility)

**On-slide**
- Headline: **"Honest by design — a validated proof-of-concept, not a mock."**
- Table:

  | Layer | Round-1 status |
  |---|---|
  | L1 anomaly (Isolation Forest) | **REAL** production code |
  | L2 drift + conformal (River / MAPIE) | **REAL** production code |
  | L3 FAISS case memory | **REAL** production code |
  | L4 Zenoh **peer** gossip (3 processes, true P2P) | **REAL** |
  | Sensor input | **Replayed** real-rig data (CWRU + NASA IMS) + scripted fault injection |

- Tech: Python 3.11 · scikit-learn · river · mapie · faiss-cpu · **eclipse-zenoh (peer)** · FastAPI · Three.js
- Proof strip: **85 tests green · deterministic · air-gapped demo · no cloud · no broker · no raw telemetry on the wire.**

**Speaker notes (30s)**
"We're deliberately honest about the boundary. The entire intelligence stack and the real peer-to-peer
transport are production code. The *only* simulated thing is the sensor input — and even that is
replayed data from real instrumented bearing rigs, the same datasets academic PdM is built on."

**Image prompt**
> [style block] + A clean architecture diagram: a tall glowing-green vertical stack labelled
> conceptually as "real production layers," fed at its base by a single distinct inlet labelled as the
> only simulated input, into which flow real bearing-vibration waveform traces. Emphasize the contrast:
> a large solid real stack vs one small simulated inlet. Minimal, credible, engineering aesthetic.

---

## SLIDE 9 — ROADMAP / PATH TO DEPLOYMENT

**On-slide**
- Headline: **"Stage 2 is a pure hardware swap. The software risk is already retired."**
- Timeline:
  - **Now (Round 1):** 3-node fleet · real Zenoh peer P2P · replayed data — **done**.
  - **Fleet-scale:** 50-CNC twin · real redundant comms (**PRP + 1oo2D** integrity gate).
  - **Stage 2 hardware (~₹35k):** 3× Raspberry Pi 5 + sensor rig (MPU6050 vibration · INA219 current
    · DS18B20 temp · DC motor + L298N as a **scaled spindle analog**). **Swap
    `DatasetReplaySource → HardwareSensorSource`. Nothing else changes.**
- Owned gaps (stated openly): long-horizon trust-poisoning defense at scale · cryptographic
  tamper-evident audit log · *"why not cloud"* = ms-local decisions + OT segmentation + no single
  point of failure.

**Speaker notes (30s)**
"Because the only simulated piece is the sensor source, Stage 2 is a single interface swap to a
Raspberry Pi sensor rig — a scaled spindle analog, in the tradition of the lab rigs that produced our
datasets. The software risk is retired now. And we're upfront about the pilot-phase gaps."

**Image prompt**
> [style block] + A horizontal glowing roadmap timeline flowing left to right on a dark background:
> stage 1 a laptop showing a 3-node fleet, stage 2 a sprawling 50-machine factory floor, stage 3 a
> physical Raspberry Pi board wired to small vibration/current/temperature sensors and a small motor
> rig. At the junction between simulation and hardware, a highlighted "single swap" connector where a
> dataset icon flips into a sensor icon. Clean infographic timeline, teal accents.

---

## SLIDE 10 — IMPACT & CLOSE

**On-slide**
- Headline: **"SYNAPSE — the fleet that learns together, on the floor, with no cloud."**
- Value: **scrap reduction + tool-life optimization + line-wide batch-defect catch.**
- The honest claim: *"We could not find a system that does cross-machine, signature-only,
  batch-defect federation at the edge."*
- Complements **Tata AMP.IoT** — doesn't compete.
- Close / proof: public GitHub repo · recorded deterministic demo · live 3D twin (`/3d` + `/ai`).
- **Team [names] · Thank you.**

**Speaker notes (20s)**
"SYNAPSE reduces scrap, optimizes tool life, and catches bad batches line-wide — serverless,
signature-only, trust-gated federation at the edge. It complements Tata's product rather than
competing. Repo, recorded demo, and the live 3D twin are all ready. Thank you."

**Image prompt**
> [style block] + A triumphant wide hero shot: the full fleet mesh glowing confidently in unified
> cyan across a clean modern shop floor, one previously-red machine now resolved and calm, luminous
> peer-to-peer links steady and bright. A subtle sense of dawn light through high factory windows —
> optimistic but still dark-premium. Center-negative-space reserved for the SYNAPSE wordmark. Uplifting,
> "mission accomplished" cinematic tone.

---

## Using these prompts

- **One deck look:** always paste the **shared style block first**, then the slide's subject prompt.
  That keeps all 10 images in one visual family.
- **Reserve text space:** most generators bake in gibberish text — prompt "no text," then add your
  real headlines/bullets in PowerPoint/Keynote/Figma on top. Composition notes ("center negative
  space reserved for wordmark") help.
- **Aspect ratio:** append `--ar 16:9` (Midjourney) or pick 1792×1024 (DALL·E) for widescreen.
- **Slide 7 is your winner:** if you can, use a **real screenshot of the `/3d` twin** instead of the
  AI image — real proof > render. Same for slide 6 (screenshot the three scenario states).
- **Consistency trick:** generate slide 1 first, then in later prompts add "matching the visual style
  of the previous image" to lock palette/lighting.
