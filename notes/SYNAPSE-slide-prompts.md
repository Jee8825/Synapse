# SYNAPSE — Full-Slide Image Prompts (10 slides)

> Each prompt below generates the **entire finished slide** — layout + headline + bullets + visual +
> footer — as one 16:9 image. Paste into a text-capable generator (**GPT-4o image / Ideogram 2 /
> Adobe Firefly** render text best; Midjourney is weakest at text). Then **send the image back to me
> and I'll recreate it as an editable slide** (SVG/HTML or `.pptx`).
>
> **Palette (NOT cyan):** graphite-charcoal base · **amber-orange + gold** primary · **violet-magenta**
> = intelligence/AI accent · **crimson** = alarm. Warm, premium, industrial-AI.
>
> **Text tip:** keep each slide to a title + ≤4 short lines — image models garble long paragraphs.
> These prompts are already trimmed for clean, legible rendering.

---

## MASTER STYLE BLOCK — prepend to every slide prompt

```
Full-bleed 16:9 corporate keynote presentation slide, flat modern vector design, premium enterprise
look (Tata Technologies / Siemens / McKinsey AI keynote quality). PALETTE: rich graphite-charcoal
background #0E0E12 with a subtle deep-plum #1C1622 gradient; PRIMARY accent warm amber-orange #FF8A00
and gold #F6C453; INTELLIGENCE accent violet #8B5CF6 and magenta #C026D3; ALARM crimson #EF4444; text
warm off-white #F5F1EA, secondary muted warm-grey #B8B2A7. Clean geometric sans-serif typography
(Space Grotesk / Inter). Generous negative space, thin elegant linework, subtle film grain, soft glow
on accent elements only. Sharp, correctly-spelled, legible text. Small "SYNAPSE" wordmark bottom-left,
slide number bottom-right. Render EXACTLY the text specified, no extra/gibberish text, no stock logos.
```

*(Optional variety: for content slides 4 · 8 · 9 you can flip the background to a warm off-white
`#F7F4EF` "light" variant with charcoal text — tell the generator "light background variant." Keep
hero slides 1 · 7 · 10 dark.)*

---

## SLIDE 1 — TITLE / HOOK  *(dark hero)*

```
[MASTER STYLE BLOCK]
A dramatic title slide. Centered large wordmark headline "SYNAPSE" in bold amber-orange with a soft
gold glow. Directly beneath in smaller warm-white text: "Fleet-Learning Intelligence at the Edge".
Lower third, a single elegant italic line in muted grey: "One machine develops a fault — the fleet
catches it. A bad tool batch hits the line — the fleet catches it before a single part is scrapped."
BACKGROUND VISUAL: a dark industrial shop floor receding into depth, a row of identical CNC machines,
each crowned with a small glowing amber node, thin violet light-arcs linking the machines peer-to-peer
into a mesh (no central hub); one distant machine glows crimson. Cinematic, volumetric haze.
FOOTER: small text "Tata Technologies InnoVent · AI at the Edge · Team [Name]".
```

---

## SLIDE 2 — THE PROBLEM

```
[MASTER STYLE BLOCK]
Layout: bold headline top-left "Every machine is monitored alone. The fleet is blind together."
Below, three short stacked points in warm-white with small amber icons:
• "Threshold monitoring sees a machine degrade — late."
• "Blind to DIVERGENCE from identical peers."
• "Blind to a SYSTEMIC bad batch hitting many machines at once."
RIGHT-SIDE VISUAL: split illustration — several CNC machines isolated inside dim separate glass
bubbles each with a small crimson dial (siloed, blind), and behind them the same crimson defect
pattern rippling unnoticed across a whole line. A faint broken link to a distant cloud icon overhead,
labelled subtly "latency · raw-data export · single point of failure". Mood: risk and isolation.
```

---

## SLIDE 3 — THE BIG IDEA

```
[MASTER STYLE BLOCK]
Headline top-center: "Identical machines should behave identically." Subhead in gold: "So the fleet
notices when one doesn't — and when they all fail the same way at once."
TWO side-by-side cards:
CARD 1 (amber) titled "Cross-machine federation" — text "One machine diverges from N identical peers
= a developing fault. Flagged by the FLEET, not a threshold." with a small diagram of many amber
nodes and one crimson outlier with divergence lines.
CARD 2 (violet) titled "Batch-defect immunity" — text "The same premature signature on many machines
at once = a bad lot. Caught before it scraps the line." with a small cluster of nodes flaring crimson
in unison.
FOOTER strip in muted grey italic: "Peer-to-peer · no cloud · only compact signatures cross the wire —
never raw telemetry."
```

---

## SLIDE 4 — ARCHITECTURE (L1 → L4)

```
[MASTER STYLE BLOCK]
Headline top: "Four real layers, running on every edge node."
CENTER VISUAL: a clean vertical exploded stack of FOUR labelled layers inside a translucent CNC
machine silhouette, glowing accents, ascending data particles:
• "L4 · Gossip — Zenoh peer mode · event-triggered · signature-only" (top, violet)
• "L3 · Case memory — FAISS signatures · provenance · decay · bounded" (magenta)
• "L2 · Drift-conscience — ADWIN drift + conformal self-trust" (gold)
• "L1 · Worker — Isolation Forest anomaly detection · <5 ms/window" (amber, base)
Below the stack, a caption band in warm-white: "Only the sensor input is simulated. Everything above
it is production code." Precise engineering-schematic aesthetic.
```

---

## SLIDE 5 — THE NOVELTY: DRIFT-CONSCIENCE

```
[MASTER STYLE BLOCK]
Headline top: "A node that can't trust itself stops teaching the fleet."
THREE columns, each a machine-node in a distinct state with a caption:
COLUMN 1 (amber, radiating outward): "CONFIDENT — detect, diagnose, teach the fleet."
COLUMN 2 (violet, sealed inside a translucent dome with arrows flowing only inward): "STALE —
listen, don't teach. Self-quarantine so it can't poison peers."
COLUMN 3 (crimson, an escalation beacon rising to a small human silhouette): "UNKNOWN — no peer has
seen this. Escalate to a human."
FOOTER in muted grey: "detect → diagnose → recommend → act-or-escalate — self-heal soft faults only,
never auto-act on a hard fault."
```

---

## SLIDE 6 — THE MONEY SHOTS (3 proofs)

```
[MASTER STYLE BLOCK]
Headline top: "Three deterministic proofs."
A cinematic three-panel triptych of the SAME small fleet, divided by thin glowing separators, each
panel captioned:
PANEL 1 "Divergence catch" — one amber node as a crimson-highlighted outlier with divergence lines.
PANEL 2 "Batch-defect immunity" — a cluster of nodes flaring crimson simultaneously with a "SYSTEMIC"
pulse ring.
PANEL 3 "Stale self-quarantine" — one node under a translucent violet quarantine dome.
FOOTER strip in gold: "Byte-for-byte reproducible · real L1–L4 · real Zenoh peer P2P across
independent processes."
```

---

## SLIDE 7 — THE 3D DIGITAL TWIN (Vivarium)  *(dark hero / showpiece)*

> Best move: replace this generated image with a **real screenshot of your `/3d` twin**. Prompt below is cover art.

```
[MASTER STYLE BLOCK]
Headline top: "A living 3D twin of the fleet — it RENDERS what the nodes decided; it never fakes a
number." Small subhead: "50-CNC factory floor · /3d floor + /ai cognition views."
HERO VISUAL (fills most of slide): a breathtaking holographic 3D digital-twin of a smart factory
floor floating above a dark control table — ~50 CNC machines in robot-tended cells, articulated
6-axis robot arms mid-tend, belt conveyors. Overlaid: a glowing amber peer-to-peer mesh plus a violet
ring-backbone (network topology). One machine haloed crimson (a caught fault); peers calm amber/gold.
FOOTER in muted grey italic: "The twin RENDERS, it does not COMPUTE — honest by construction."
```

---

## SLIDE 8 — REAL vs SIMULATED (credibility)

```
[MASTER STYLE BLOCK]
Headline top: "Honest by design — a validated proof-of-concept, not a mock."
CENTER: a clean 2-column table with amber header row. Left column "Layer", right column "Round-1
status":
• "L1 anomaly (Isolation Forest)" → "REAL"
• "L2 drift + conformal (River / MAPIE)" → "REAL"
• "L3 FAISS case memory" → "REAL"
• "L4 Zenoh peer gossip (3 processes)" → "REAL"
• "Sensor input" → "Replayed real-rig data (CWRU + NASA IMS)"
The four "REAL" cells glow gold; the last cell is neutral grey.
BOTTOM strip of small pill tags in amber/violet: "85 tests green · deterministic · air-gapped · no
cloud · no broker · no raw telemetry on the wire".
```

---

## SLIDE 9 — ROADMAP / PATH TO DEPLOYMENT

```
[MASTER STYLE BLOCK]
Headline top: "Stage 2 is a pure hardware swap. The software risk is already retired."
CENTER VISUAL: a horizontal glowing roadmap timeline flowing left→right, three milestone nodes:
• "NOW — 3-node fleet · real Zenoh peer P2P · replayed data" (amber, a laptop icon)
• "FLEET-SCALE — 50-CNC twin · real redundant PRP + 1oo2D comms" (gold, a factory-floor icon)
• "STAGE 2 — 3× Raspberry Pi 5 + sensor rig (~₹35k) · scaled spindle analog" (violet, a small
circuit-board-with-sensors icon)
At the junction between simulation and hardware, a highlighted crimson "SINGLE SWAP" connector where
a dataset icon flips into a sensor icon, captioned "DatasetReplaySource → HardwareSensorSource —
nothing else changes."
```

---

## SLIDE 10 — IMPACT & CLOSE  *(dark hero)*

```
[MASTER STYLE BLOCK]
A triumphant closing slide. Center headline in bold amber-gold: "The fleet that learns together, on
the floor, with no cloud." Beneath, three short value lines in warm-white:
• "Scrap reduction · tool-life optimization · line-wide batch-defect catch."
• "Serverless, signature-only, trust-gated federation at the edge."
• "Complements Tata AMP.IoT — it doesn't compete."
BACKGROUND: a wide hero shot of the full fleet mesh glowing confidently in unified amber/gold across
a clean modern shop floor, one previously-crimson machine now resolved and calm, steady violet
peer-links, soft dawn light through high factory windows — optimistic but premium-dark.
FOOTER: "GitHub repo · recorded demo · live 3D twin  —  Team [Names] · Thank you."
```

---

## Post-generation fixes (round 1 review)

The first generation (`Downloads/Synapse Presentation Slides/Slide_01..10.png`) came out
presentation-grade. Only two slides need an image-level fix; do them as **image edits** (attach the
original PNG as reference so only the named text changes — everything else stays pixel-identical).

**Slide 3 — fix typo:**
```
Using the attached image as an EXACT reference, recreate it identically — same layout, same warm
amber-gold + violet palette, same fonts, same two cards, same node diagrams, same footer. Change ONLY
one word: in the right "Batch-defect immunity" card the body text reads "...at once = a bad loit.
Caught before it scraps the line." — correct the misspelling "loit" to "lot" so it reads
"...at once = a bad lot. Caught before it scraps the line." Keep everything else pixel-identical.
16:9, sharp legible text.
```

**Slide 10 — relabel invented stats as illustrative (team name STAYS a placeholder):**
```
Using the attached image as an EXACT reference, recreate it identically — same photographic
factory-floor hero, same amber-gold + violet palette, same headline "The fleet that learns together,
on the floor, with no cloud.", same three value lines, same left FLEET STATUS panel, same footer
(keep "Team [Names]" exactly as a placeholder — do NOT change it). ONE change only: in the right
"SYSTEM BENEFITS" panel, change its heading to "SYSTEM BENEFITS — ILLUSTRATIVE TARGETS" and add a
small muted-grey caption under the three metrics reading "illustrative targets — not measured
results" (keep the metrics ↓23.6% scrap, ↑18.9% tool-life, ↑100% batch-catch). Everything else
pixel-identical. 16:9, sharp text.
```

- **Team name (both slide 1 "Team [Name]" and slide 10 "Team [Names]") STAYS a placeholder.** User
  fills all 5 member names themselves. At `.pptx` assembly, cover each footer slot with a matching
  **editable text box** so the names can be typed directly in PowerPoint (not baked into the image).
- **Slide 7** dashboard KPIs are invented but read as twin-UI mock values — left as-is (optional: add
  a tiny "illustrative twin UI" caption).

## After you generate them

1. Send me the generated slide image(s).
2. I'll **recreate each as an editable slide** — either a crisp **SVG/HTML** widget (pixel-matched to
   the reference, fully editable text) or a real **`.pptx`** deck.
3. I'll keep the exact palette + layout from your reference so the recreation matches 1:1.

**Consistency trick:** generate Slide 1 first, then append to slides 2–10 *"match the exact visual
style, palette, and typography of the reference image"* and attach slide 1 — locks the whole deck to
one look.
