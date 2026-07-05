---
title: Vivarium — 3D fleet twin
type: architecture
tags: [synapse, architecture, vivarium, dashboard, threejs, render-only]
status: round-1-build
updated: 2026-06-27
---

# Vivarium — 3D fleet twin

> The visual counterpart to the 2D dashboard, served at **`/3d`**. Source of truth:
> [[CLAUDE]] addenda 2026-06-25, 2026-06-26 (CAD model), 2026-06-27 (fleet-scale plan).
> Map of content: [[SYNAPSE-Home]].

## Responsibility

A 3D, orbit-able digital twin of the fleet that **dramatizes the same read-only event logs** the
2D dashboard serves. It lives at `dashboard/static/vivarium/` and is mounted by the existing
FastAPI app — no second backend.

## Inviolable spine — RENDERS, does not COMPUTE

Every node colour, trust ring, gossip arc, confidence band and alarm is a faithful **replay** of
what the real [[L1-worker]]→[[L2-drift-conscience]]→[[L3-case-memory]]→[[L4-gossip-zenoh]] nodes
decided. The twin never re-runs detection, recomputes a score, or invents a state. It fetches the
same `/api/events/<scenario>` logs and folds them to a per-tick fleet state.

## Stack

Three.js, **vendored locally** (no CDN → the air-gapped demo story holds), plain ES modules via an
`importmap`, no build step. `OrbitControls` + `GLTFLoader` from the same vendored r160 drop.

## Machine appearance (CAD hybrid, animated)

Each node renders the **real CNC 3018 CAD model** (a GrabCAD assembly), re-exported from its source
IGES as **222 separate parts** so the machine's own **spindle spins** and **carriage sweeps** —
not a procedural stand-in. Parts are classified by CAD position into kinematic groups
(frame / carriage / spindle); the spindle glows the node's **state colour**. Motion speed/jitter
scale with the *real folded state*, never a fabricated number — the same honesty rule as the old
procedural spindle. If the `.glb` is missing the loader falls back to a fully procedural machine,
so the demo never hard-fails. The model is *scaled spindle analog* dressing, **never** a real CNC.

> Asset is git-ignored pending GrabCAD license clearance; the two pipeline scripts
> (`scripts/vivarium_export_cad_parts.py`, `scripts/vivarium_obj_to_glb.py`) regenerate it.

## Honest fidelity decisions

- No `anomaly` score in the log → spindle vibration is driven by `state`/`confirmed_fault`/
  `self_trust`, not a fabricated number.
- No conformal interval in the log → the on-node band is the conformal-derived **self-trust**
  scalar, labelled exactly *"self-trust (conformal-derived)"* — never a prediction/RUL band.
- The stale beat renders the **real** firebreak: a STALE node that still detects a fault but
  `should_teach=false` (L4 plate greys, "fault not taught") — not invented rejected signatures.

## Robot-tended cell + industrial environment (built 2026-06-30)

Around the fleet sits a **robotic machining cell** + an **industrial shop-floor bay**, all
render-only/illustrative (cosmetic "line is running", not from the log). Modules:
`conveyor.js` (roller conveyor), `robotArm.js` (6-axis-style arm with stepper motors + 3-finger
claw, shaped like the reference CAD), `cell.js` (infeed → arm → outfeed **pick-and-place**:
reaches **down onto the belt**, grips, lifts straight up, transfers, lowers — claw kept pointing
down via `wrist = π − shoulder − elbow`), and `environment.js` (concrete floor, painted lanes,
walls, truss light-rigs, safety railings). The user's real conveyor/arm CAD are closed formats
(SolidWorks `.SLDPRT`, Parasolid `.x_t`) the toolchain can't read → these are **swap-ready**
procedural stand-ins (re-export to STEP/glb to drop in real meshes). See [[CLAUDE]] addendum 2026-06-30.

## Next step — fleet scale

Planned expansion to a **50-CNC factory floor** (instanced + decimated fleet, hero-cell on focus,
offline real-L1–L4 50-node logs). See [[2026-06-27-fleet-scale-factory-floor]]. **This is the next
build task** — start at Phase 1 (the parametric N-node `events/fleet50_<scenario>.jsonl` generator).

## Anchored to

- [[divergence-catch]] · [[batch-defect]] · [[stale-quarantine]]

## Related

[[L1-worker]] · [[L2-drift-conscience]] · [[L3-case-memory]] · [[L4-gossip-zenoh]] · [[SYNAPSE-Home]]
