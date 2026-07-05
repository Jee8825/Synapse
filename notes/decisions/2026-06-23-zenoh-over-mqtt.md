---
title: Decision — Eclipse Zenoh peer mode over a broker
type: decision
tags: [synapse, decision]
status: round-1-build
date: 2026-06-23
updated: 2026-06-23
---

#decision

# Decision — Eclipse Zenoh peer mode over a broker

> Map of content: [[SYNAPSE-Home]]. Affects layer: [[L4-gossip-zenoh]].
> This is the **only** note in the vault permitted to name the rejected option.

## Status

**Locked.** Eclipse Zenoh **peer mode** is the transport for [[L4-gossip-zenoh]]. This is
fixed by [[CLAUDE]] §2 / §4 / §10 and is not up for re-litigation.

## Context

Nodes must share compact fault signatures peer-to-peer on a shop floor with **no central
server and no cloud**. A prior project draft proposed a **broker-based MQTT** bus. That draft
is **superseded and wrong** for this system.

## Decision

Use **Eclipse Zenoh in peer mode** — brokerless, peer-to-peer over localhost in Round 1 (three
independent processes forming a real mesh), and over the LAN/travel-router in Stage 2.

## Rationale

- **No broker = no single point of failure.** A broker is a central component whose failure
  takes down fleet learning. Peer mode has no such node — kill any one peer and the rest keep
  gossiping (this is the Round-1 *resilience proof*).
- **"Serverless, on the shop floor"** is a core positioning claim ([[CLAUDE]] §1). A broker
  reintroduces exactly the central dependency we tell judges we removed.
- **OT segmentation** on real shop floors forbids raw-data export and central collection; a
  peer mesh that ships only signatures fits that reality.
- **Real even on localhost** — Zenoh peer mode gives true P2P between the three node processes,
  so the demo's resilience and "born-wise" behaviors are genuine, not faked.

## Rejected alternative

- **A broker-based MQTT bus** — rejected. It is a central component (single point of failure),
  contradicts the serverless positioning, and a broker is exactly the cloud/central dependency
  this project exists to avoid. Per [[CLAUDE]] §2 this option is superseded and must never be
  used anywhere in the system.

## Consequences

- The word "MQTT" appears **only** in this note (as the rejected option) and nowhere else in
  the vault or codebase — a guardrail from [[CLAUDE]].
- [[L4-gossip-zenoh]] is built strictly on Zenoh peer mode, event-triggered and trust-gated,
  carrying signatures only.

## Related

[[L4-gossip-zenoh]] · [[SYNAPSE-Home]] · [[CLAUDE]]
