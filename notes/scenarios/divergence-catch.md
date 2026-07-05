---
title: Scenario 1 — Divergence Catch
type: scenario
tags: [synapse, scenario, divergence, demo]
status: round-1-build
updated: 2026-06-23
---

# Scenario 1 — Divergence Catch

> One of the three demo "money shots." Source of truth: [[CLAUDE]] §6.
> Map of content: [[SYNAPSE-Home]].

## The claim

The fleet catches a developing fault on one machine by noticing its behavior **diverges from
identical peers** — flagged by the **fleet**, not a fixed threshold.

## The setup

- **Node A** (Teacher) replays **fault-onset** windows.
- **Node B** and **Node C** stay **healthy**.

## What happens

1. [[L1-worker]] on Node A scores its windows as increasingly anomalous.
2. [[L2-drift-conscience]] confirms A still trusts itself (it's healthy-but-faulting, not stale).
3. A creates a fault signature in [[L3-case-memory]] and gossips it via [[L4-gossip-zenoh]].
4. Because identical machines running the same part program should behave near-identically,
   A's signature **diverges from its peers** → the fleet flags it.

## Why it matters

Per-machine threshold monitoring is blind to this — a single machine drifting *relative to
identical peers* is exactly the signal a fleet can see that a lone machine cannot.

## Pass condition (deterministic)

With seeded RNGs and a fixed tick schedule, the run reproducibly ends with A flagged as
divergent while B and C remain healthy. Byte-for-byte repeatable — Round 1 is a *recorded* demo.

## Related

[[batch-defect]] · [[stale-quarantine]] · [[L1-worker]] · [[L4-gossip-zenoh]] · [[glossary]]
