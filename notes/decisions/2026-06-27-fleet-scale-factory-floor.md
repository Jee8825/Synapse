---
title: Decision — Fleet-scale 50-CNC factory floor (twin visualization)
type: decision
tags: [synapse, decision, vivarium, fleet-scale]
status: in-progress
date: 2026-06-27
updated: 2026-07-01
---

#decision

# Decision — Fleet-scale 50-CNC factory floor (twin visualization)

> Map of content: [[SYNAPSE-Home]]. Affects: [[vivarium-3d-twin]].
> Source of truth: [[CLAUDE]] addenda 2026-06-27 (plan) + 2026-07-01 (Phase 1 built).

## Status

**Phases 1 (data) + 2 (floor placement) built 2026-07-01; Phase 3+ pending.** Grow the
[[vivarium-3d-twin]] from 3 machines to a **50-CNC factory floor**. This is an **additive
visualization** and does **not** change the locked Round-1 deliverable ([[CLAUDE]] §2: a 3-node
fleet on real Zenoh).

**Phase 1 done — the data generator.** `synapse/scenarios/fleet.py` (50-CNC / 25-cell roster +
parametric specs) + `scripts/run_fleet_scenario.py` (in-process gossip bus + deterministic clock)
run the **real L1–L4 stack for all 50 nodes** and emit `events/fleet50_<scenario>.jsonl` in the
unchanged `FleetEvent` schema; the dashboard serves them via the same `/api/events/<scenario>`
path. 7 new fleet tests green (CWRU-only, no Zenoh). The one swap is transport only: an in-process
bus that reproduces the multi-process settle timing — **the live Zenoh peer P2P stays the 3-process
core**. Verified beats: [[divergence-catch]] (only `M23` teaches, 49 peers armed), [[batch-defect]]
(`M10`–`M15` → systemic alarm fleet-wide), [[stale-quarantine]] (`M49` matches the 3-node reference
exactly — teaches while trusted, then self-quarantines at t=150).

**Phase 2 done — the factory floor.** Selecting a `fleet50_*` scenario in the twin (`/3d`) swaps the
3-node CAD rig for an **InstancedMesh floor**: `src/floorLayout.js` (roster mirroring
`fleet.cell_of` — 50 CNCs in 25 cells on a 5×5 grid + conveyor spine + cutting/QC zones) +
`src/fleetFloor.js` (instanced bodies/spindles/status-discs/fault-halos = a handful of draw calls,
solving the ~15.7 M-tri unrenderable problem). Same fold/playback/HUD/inspector drive both modes;
only the scene branches on node count. Per-disc state colour + a red **confirmed-fault halo** (an
honest second channel — a diverged node is UNKNOWN for one tick then CONFIDENT-with-confirmed-fault,
which state colour alone would lose). Verified in-browser: divergence (`M23` haloed vs 49 cyan),
batch (`M10`–`M15` cluster + alarm banner), stale (`M49` amber, `M00` haloed). **Next: Phase 3** —
swap the proxy body for a decimated `cnc3018_fleet.glb` instance + hero-cell CAD swap-on-focus.

## Context

At 3 machines the flagship scenarios are convincing; at fleet scale they get far stronger —
[[divergence-catch]] (one outlier vs 49 *tight* identical peers) and [[batch-defect]] (a
cell-cluster sharing a bad tool/material lot lights up at once). Real lights-out shops cluster
machines into **robot-tended cells** chained by material flow, which is also the physical form of
the SYNAPSE thesis: many *identical* machines running the same part program.

## Decisions

1. **50-node behaviour comes from the real L1–L4 logic run OFFLINE**, emitted as a deterministic
   `events/fleet50_<scenario>.jsonl` in the existing `FleetEvent` schema, which the twin replays.
   Real [[L1-worker]]/[[L2-drift-conscience]]/[[L3-case-memory]] per node + real gossip-gating
   over an in-process bus (fully seeded). **NOT** 50 live [[L4-gossip-zenoh]] processes.
2. **Full factory floor** modelled: cutting zone (bandsaw → blanks) → conveyor spine → **25
   robot-tended cells** (2 CNC + robot arm + in/out conveyor each = 50) → deburr/QC → ship.

## Rationale

- **Honesty boundary preserved.** Running the *real* per-node L1–L4 logic keeps "the twin renders
  real decisions" true; only the transport for the extra nodes is in-process, not live Zenoh. We
  say so explicitly: *"50 nodes of real L1–L4 logic; live Zenoh **peer** P2P stays the 3-process
  core."* This respects the render-only spine of [[vivarium-3d-twin]] and the §2 lock.
- **Reuses the existing data path** — same schema, same `/api/events/<scenario>` route, no new
  backend surface.
- **Layout grounded in reality** — robot-tended cells (~1 robot per 2 CNCs), conveyor flow, U/linear
  aisles — not an invented arrangement.

## Rejected alternatives

- **50 real Zenoh peer processes** — maximal realism but heavy on a laptop and the scenarios aren't
  authored for 50 nodes; most work, most risk. (The live-P2P proof stays the real 3-node core.)
- **3 real + 47 purely scripted** — least code, but the 47 would be decoration; weaker honesty
  unless clearly labelled.

## Consequences / rendering note

Naive 50×222 meshes is unrenderable (~15.7 M tris). The build **must** use InstancedMesh +
decimation + LOD: a full-detail **hero cell** on focus, the other 49 instanced from a decimated
`cnc3018_fleet.glb`, per-instance spindle spin / carriage sweep / state colour. Target ~2 M tris,
<50 draw calls, 60 fps. Phased build order is in [[CLAUDE]] addendum 2026-06-27.

## Related

[[vivarium-3d-twin]] · [[divergence-catch]] · [[batch-defect]] · [[stale-quarantine]] · [[SYNAPSE-Home]] · [[CLAUDE]]
