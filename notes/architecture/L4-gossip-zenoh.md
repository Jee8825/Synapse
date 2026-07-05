---
title: L4 — Gossip Transport (Zenoh peer mode)
type: architecture
tags: [synapse, architecture, l4, gossip, zenoh, p2p]
status: round-1-build
updated: 2026-06-23
---

# L4 — Gossip Transport (Zenoh peer mode)

> Layer 4 of the 4-layer per-node stack. **Real** in Round 1 — 3 independent processes,
> true peer-to-peer over localhost. Source of truth: [[CLAUDE]] §4.
> Map of content: [[SYNAPSE-Home]].

## Responsibility

How a node shares what it has learned with the fleet — **brokerless peer-to-peer via
Eclipse Zenoh PEER MODE**. No broker, no central server, no cloud round-trip.

- **Event-triggered** — a node gossips a signature **only on a confirmed new fault**, never a
  steady telemetry stream.
- **Trust-gated contribution** — a node only teaches when its [[L2-drift-conscience]]
  self-trust is high enough (see [[glossary]] → trust-gate).
- **Payload = compact signature only** — *never* raw telemetry on the wire.

## Round 1 status

**Real** — the three node processes form a genuine Zenoh peer mesh over localhost. Because the
mesh is real even on one machine, the **resilience proof** works: kill one node mid-run and the
others keep gossiping (no single point of failure).

## Why this choice

- **Peer mode, no broker** — a broker is a single point of failure and a central server we have
  explicitly ruled out. Peer-to-peer matches the "serverless, on the shop floor" positioning.
  The locked transport rationale (and the rejected broker option) is recorded as a dated
  `#decision` note under `notes/decisions/` — see its backlink below.
- **Event-triggered, not streaming** — keeps the wire quiet and the design honest: we share
  *knowledge*, not telemetry.

## Hard rules (never violate)

- Peer mode only — no broker of any kind.
- Signatures only on the wire — never raw telemetry.
- No cloud / no central server.
- Gossip is trust-gated **and** event-triggered.

## Anchored to

- [[divergence-catch]] — A gossips its new signature; the fleet does the flagging.
- [[batch-defect]] — two nodes surfacing the same premature signature is the systemic tell.
- [[stale-quarantine]] — a stale node stops contributing here (still listens).

## Related

[[L1-worker]] · [[L2-drift-conscience]] · [[L3-case-memory]] · [[glossary]]
