---
title: SYNAPSE — Home
type: moc
tags: [synapse, index, innovent]
status: round-1-build
updated: 2026-06-23
---

# SYNAPSE — Home

> **Collective Nervous System for Offline Edge Fleets**
> Tata Technologies InnoVent — "AI at the Edge" · Automotive + Industrial Heavy Machinery
> Team: Jee & Adhithya · Sri Eshwar College of Engineering

This is the entry point to the vault. Everything links from here. The authoritative
build spec is [[CLAUDE]] — when in doubt, that file wins.

---

## North Star (Round 1)

A **software simulation** of a 3-node CNC fleet, on one machine, no hardware.
The real L1–L4 stack runs for real; only the **sensor input is replayed** (CWRU/NASA
lab-rig data) with scripted fault injection. Deliverable = recorded demo + clean repo
+ deck. **Stage 1 closes ~5 July 2026.**

**Positioning line:**
> AMP.IoT shows you a machine is degrading. SYNAPSE predicts the tool's remaining life
> with calibrated confidence, lets the fleet catch a bad batch before it scraps parts,
> and schedules the swap — peer-to-peer, on the shop floor, no cloud round-trip.
> We complement Tata's product, we don't compete with it.

---

## The system

- [[CLAUDE]] — full build spec (ground truth for Claude Code)
- [[README]] — public, judge-readable framing

**Architecture (4 layers per node):**
- [[L1-worker]] — on-edge anomaly detection (Isolation Forest)
- [[L2-drift-conscience]] — ADWIN drift + conformal self-trust + three-state machine
- [[L3-case-memory]] — FAISS signature store (provenance, decay, dedup)
- [[L4-gossip-zenoh]] — brokerless P2P gossip (Zenoh peer mode — **never MQTT**)

**The three demo scenarios (anchor everything here):**
- [[divergence-catch]] — fleet flags a node that drifts from identical peers
- [[batch-defect]] — same premature signature on multiple nodes = systemic defect
- [[stale-quarantine]] — a drifted node lowers self-trust and stops teaching

**Visualization:**
- [[vivarium-3d-twin]] — 3D fleet twin at `/3d` (render-only; animated CAD machine)
- [[2026-06-27-fleet-scale-factory-floor]] — planned 50-CNC factory-floor expansion

---

## Reference

- [[glossary]] — signature, self-trust, drift-conscience, born-wise, scaled spindle analog
- `docs/` — source deliverables (feasibility report, use-case doc, jury prep, hardware spec)
- `notes/jury-qa/` — anticipated questions (concede → answer → reframe)
- `notes/decisions/` — decision log, one dated note each
- `notes/logs/` — per-session dev logs

---

## Honest positioning (always maintain)

Validated **proof-of-concept** with a credible path to deployment — **not** production-ready.
Novelty is the **synthesis + application** (serverless, signature-only, batch-defect,
trust-gated federation at the edge), not the primitives. Known pilot-phase gaps to own
openly: long-horizon trust-poisoning defense; cryptographic tamper-evident audit logging;
the "why not cloud" answer (millisecond local decisions + OT segmentation + no single
point of failure).

---

## Working notes (graph-view filters)

- `-path:graphify-out` → hide the machine-generated code map, see only hand-written notes
- `path:graphify-out` → see Graphify's code/doc graph
- `tag:#decision` → just the decision log
