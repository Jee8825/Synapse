# Prompt — rebuild SYNAPSE deck as a FULLY EDITABLE presentation

> Paste the block below into a design AI that accepts reference images (Claude in Figma Make /
> Figma Slides / Canva, or any AI deck builder). **Attach the 10 reference images**
> `Slide_01.png … Slide_10.png` (from `Downloads/Synapse Presentation Slides/`). The prompt tells it
> to recreate them 1:1 as native, editable objects — not flattened pictures.

---

You are a senior presentation designer. I'm attaching **10 reference images** (`Slide_01.png` …
`Slide_10.png`). Recreate them as **ONE fully editable, 16:9 pitch deck** where **every element is a
native editable object** — real text, vector shapes, editable tables/charts, and shared color
swatches — **NOT flattened images**. Match each reference **1:1** in layout, wording, color, hierarchy
and mood.

## Non-negotiable rules
1. **16:9** (1920×1080 px / 13.333×7.5 in).
2. **All text = real editable text boxes.** Never bake text into an image. Fonts must be live.
3. **All icons, diagrams, cards, arrows, nodes, badges, charts, tables = editable vector objects**
   (recolorable, resizable), logically **grouped and named** per slide.
4. Define a **shared theme**: named color swatches + reusable text styles, applied across all slides.
5. Build a **shared master/layout** for the repeating footer (wordmark left · credit center · page
   number right) so it's consistent and edit-once.
6. **Photographic hero backgrounds (slides 1, 7, 10):** you may keep the attached reference image as
   a *locked background layer*, but rebuild **every** text, panel, dashboard, badge, table and chart
   on top of it as editable native objects. All other slides (2,3,4,5,6,8,9): rebuild **fully as
   vectors + text**, no raster.
7. Deliverable: **export an editable `.pptx`** (plus the native design file) with the theme, master,
   named layers, and every element individually selectable/editable.

## Design system (define as reusable styles/swatches)
- **Colors:** background graphite `#0E0E12` → plum `#1C1622`; primary **amber `#FF8A00`** + gold
  `#F6C453`; intelligence **violet `#8B5CF6`** + magenta `#C026D3`; alarm **crimson `#EF4444`**; text
  warm-white `#F5F1EA`; muted grey `#B8B2A7`.
- **Type:** geometric sans (**Space Grotesk** or **Inter**) for headings, **Inter** for body. Styles:
  H1 ≈ 40–44pt bold · subhead ≈ 20pt · body ≈ 16pt · caption ≈ 11pt · footer ≈ 11pt.
- **Look:** premium dark keynote, soft glow on accent elements, thin neon linework, generous negative
  space. Amber/gold = strength, violet/magenta = intelligence, crimson = alarm.

## Reusable components (build once, reuse everywhere)
- **Footer:** left `SYNAPSE` (letter-spaced amber) · center credit text · right 2-digit page number.
- **Node glyph:** small circle containing a waveform, tinted by state color (amber / violet / crimson)
  — used in all the fleet/network diagrams.
- **Card:** rounded rectangle with a colored 1px border + header row (round icon + title + thin
  divider line trailing off).
- **Pill tag**, **timeline milestone node**, **KPI stat block** — as reusable components.

## Per-slide spec (use this EXACT wording; match the reference layout)

**Slide 1 — Title (photographic hero bg).** Center: giant wordmark **"SYNAPSE"** (amber-gold, soft
glow) → subtitle **"Fleet-Learning Intelligence at the Edge"** → italic grey line: *"One machine
develops a fault — the fleet catches it. A bad tool batch hits the line — the fleet catches it before
a single part is scrapped."* Footer credit: `Tata Technologies InnoVent · AI at the Edge · Team [Name]`.

**Slide 2 — Problem.** H1 two lines: **"Every machine is monitored alone."** + (amber) **"The fleet is
blind together."** Three icon+text points: "Threshold monitoring sees a machine degrade — late." /
"Blind to **DIVERGENCE** from identical peers." / "Blind to a **SYSTEMIC** bad batch hitting many
machines at once." Right visual: CNC machines in isolated glass bubbles with red gauges, a cloud icon
labelled "latency · raw-data export · single point of failure", and a machine row with a red defect
ripple.

**Slide 3 — Big idea.** H1 **"Identical machines should behave identically."** amber subhead **"So the
fleet notices when one doesn't — and when they all fail the same way at once."** Two cards:
- Amber card **"Cross-machine federation"** — "One machine diverges from N identical peers = a
  developing fault. Flagged by the **FLEET**, not a threshold." + amber node fan with one crimson outlier.
- Violet card **"Batch-defect immunity"** — "The same premature signature on many machines at once =
  a bad **lot**. Caught before it scraps the line." + a cluster of crimson nodes.
Footer strip (italic grey): *"Peer-to-peer · no cloud · only compact signatures cross the wire — never
raw telemetry."*  ⚠️ Use **"lot"** (the reference has a typo to fix).

**Slide 4 — Architecture.** H1 **"Four real layers, running on every edge node."** Vertical 4-layer
stack inside a translucent CNC silhouette, top→bottom, each a labelled glowing plate:
- **L4 · Gossip** — "Zenoh peer mode · event-triggered · signature-only" (violet)
- **L3 · Case memory** — "FAISS signatures · provenance · decay · bounded" (magenta)
- **L2 · Drift-conscience** — "ADWIN drift + conformal self-trust" (gold)
- **L1 · Worker** — "Isolation Forest anomaly detection · <5 ms/window" (amber)
Caption bar: **"Only the sensor input is simulated. Everything above it is production code."**

**Slide 5 — The novelty.** H1 **"A node that can't trust itself stops teaching the fleet."** Three
machine columns with state visuals: **CONFIDENT** (amber, radiating out) — "detect, diagnose, teach the
fleet." / **STALE** (violet dome, arrows inward) — "listen, don't teach. Self-quarantine so it can't
poison peers." / **UNKNOWN** (crimson beacon to a human silhouette) — "no peer has seen this. Escalate
to a human." Footer strip: *"detect → diagnose → recommend → act-or-escalate — self-heal soft faults
only, never auto-act on a hard fault."*

**Slide 6 — Proofs.** H1 **"Three deterministic proofs."** Three captioned panels, each a small fleet
diagram over a machine row: **① Divergence catch** (one crimson outlier among amber) · **② Batch-defect
immunity** (a crimson cluster + a "SYSTEMIC" pulse ring) · **③ Stale self-quarantine** (one node under a
violet dome). Footer strip: *"Byte-for-byte reproducible · real L1–L4 · real Zenoh peer P2P across
independent processes."*

**Slide 7 — 3D twin (photographic hero bg).** H1 **"A living 3D twin of the fleet — it RENDERS what the
nodes decided; it never fakes a number."** (RENDERS in amber). Subhead "50-CNC factory floor · /3d floor
+ /ai cognition views." Over the hologram, rebuild these editable UI panels: **FLEET STATUS**
(Confident 47 · Stale 2 · Unknown 0 · Fault 1) · **NETWORK TOPOLOGY** (P2P links / ring backbone) ·
**NODE STATE LEGEND** · **FLEET COGNITION** donut (94% / 4% / 0% / 2%) · **EVENT STREAM** (live log
lines) · **SELECTED NODE (FAULT)** CNC-27 · a bottom **KPI bar** (Throughput / OEE / Quality / Alerts /
Top Action). Footer strip: *"The twin RENDERS, it does not COMPUTE — honest by construction."*
Mark these dashboard numbers as an **illustrative twin UI**.

**Slide 8 — Real vs simulated.** H1 **"Honest by design — a validated proof-of-concept, not a mock."**
An **editable 2-column table** (Layer | Round-1 status): L1 anomaly (Isolation Forest) → **REAL**; L2
drift + conformal (River / MAPIE) → **REAL**; L3 FAISS case memory → **REAL**; L4 Zenoh peer gossip (3
processes) → **REAL**; Sensor input → "Replayed real-rig data (CWRU + NASA IMS)". The four REAL cells
glow gold. Row of pill tags: `85 tests green` · `deterministic` · `air-gapped` · `no cloud` ·
`no broker` · `no raw telemetry on the wire`.

**Slide 9 — Roadmap.** H1 **"Stage 2 is a pure hardware swap. The software risk is already retired."**
Horizontal timeline, 3 milestones: **NOW** — "3-node fleet · real Zenoh peer P2P · replayed data";
**FLEET-SCALE** — "50-CNC twin · real redundant PRP + 1oo2D comms"; **STAGE 2** — "3× Raspberry Pi 5 +
sensor rig (~₹35k) · scaled spindle analog". A highlighted **SINGLE SWAP** junction: "DatasetReplaySource
→ HardwareSensorSource — nothing else changes." Bracket labels "SIMULATION (VALIDATED)" / "REAL
HARDWARE". Four bottom chips: "All algorithms, behaviors, thresholds already proven." / "Zero software
changes for Stage 2." / "Only the sensor source changes." / "All proofs, determinism, and honesty are
retained."

**Slide 10 — Close (photographic hero bg).** H1 (amber) **"The fleet that learns together, on the floor,
with no cloud."** Three lines: "Scrap reduction · tool-life optimization · line-wide batch-defect
catch." / "Serverless, signature-only, trust-gated federation at the edge." / "Complements Tata AMP.IoT
— it doesn't compete." Left panel **FLEET STATUS** (all systems CONFIDENT; donut) + **FLEET HEALTH 98%
Excellent**. Right panel **SYSTEM BENEFITS**: Scrap reduction ↓23.6% · Tool-life optimization ↑18.9% ·
Batch-defect catch ↑100% — **with a small caption "illustrative targets, not measured"** directly under
them. Footer: `GitHub repo · recorded demo · live 3D twin — Team [Names] · Thank you.`

## Corrections & placeholders (apply while rebuilding)
- **Slide 3:** the reference misspells the word — render it as **"a bad lot."**
- **Slide 10 (and Slide 7):** the benefit/dashboard numbers are **illustrative targets, not measured
  results** — keep them but include that caption so they aren't read as real results.
- **Team name:** leave `Team [Names]` / `Team [Name]` as an **editable placeholder** — do not invent a
  name.

## Editability checklist (confirm before export)
- [ ] Every headline, bullet, label, caption, table cell, KPI = live editable text.
- [ ] Every icon, node, card, arrow, timeline, donut, chart = editable vector (recolorable).
- [ ] Shared theme swatches + text styles applied everywhere (change one swatch → updates deck).
- [ ] Footer + wordmark + page number on a reusable master.
- [ ] Layers grouped and named per slide.
- [ ] Exported as an editable `.pptx` that opens with all elements selectable in PowerPoint/Keynote.
