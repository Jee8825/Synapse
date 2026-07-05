---
title: Scenario 3 — Stale Self-Quarantine
type: scenario
tags: [synapse, scenario, stale, self-trust, demo]
status: round-1-build
updated: 2026-06-23
---

# Scenario 3 — Stale Self-Quarantine

> One of the three demo "money shots." Source of truth: [[CLAUDE]] §6.
> Map of content: [[SYNAPSE-Home]].

## The claim

A node that has gone stale **knows it** and voluntarily stops teaching — so it cannot poison
the fleet with judgments it can no longer trust.

## The setup

- **Node C** (Stale) replays data that **drifts** from the training distribution.

## What happens

1. [[L2-drift-conscience]] — ADWIN detects the drift and conformal calibration drops C's
   **self-trust**.
2. C transitions to the **"I'm stale — listen, don't teach"** state.
3. C keeps *consuming* peer knowledge over [[L4-gossip-zenoh]] but **contributes nothing**
   (trust-gated → self-quarantine).

## Why it matters

This is the drift-conscience in action: the trust-gate means a node that can't trust itself
can't degrade its peers. It's the safety property behind "the fleet only learns from nodes that
are sure of themselves."

## Pass condition (deterministic)

With seeded RNGs and a fixed drift schedule, the run reproducibly ends with C in the
"listen, don't teach" state, still receiving but no longer gossiping. Byte-for-byte repeatable.

## Related

[[divergence-catch]] · [[batch-defect]] · [[L2-drift-conscience]] · [[L4-gossip-zenoh]] · [[glossary]]
