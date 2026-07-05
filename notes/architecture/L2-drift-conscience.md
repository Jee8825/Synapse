---
title: L2 — Drift-Conscience
type: architecture
tags: [synapse, architecture, l2, drift, conformal, self-trust]
status: round-1-build
updated: 2026-06-23
---

# L2 — Drift-Conscience

> Layer 2 of the 4-layer per-node stack. **Real production code** in Round 1.
> Source of truth: [[CLAUDE]] §4. Map of content: [[SYNAPSE-Home]].

## Responsibility

The node's **conscience**: it decides how much the node should trust *its own* judgments.

- **ADWIN concept-drift detection** (via **River**) — detects when the live data has drifted
  away from the node's training distribution.
- **Conformal prediction** (via **MAPIE**) — turns raw detector scores into a **calibrated
  self-trust score** (a confidence band, not a late threshold alert).

A node that detects it has drifted **lowers its own trust and STOPS teaching the fleet** —
so a stale node cannot poison its peers. This layer owns the three-state behavior.

## The three-state behavior (the novelty)

1. **"I'm confident"** — high self-trust → detect, diagnose, and teach the fleet.
2. **"I'm stale — listen, don't teach"** — drift detected / self-trust low → consume peer
   knowledge but contribute nothing (self-quarantine).
3. **"Neither I nor any trusted peer has seen this"** — a fleet-wide unknown → escalate to a
   human.

## The upgrade ladder

`detect → diagnose → recommend → act-or-escalate`, with a **Planner→Critic guardrail**:
self-heal **soft** faults only; escalate or refuse otherwise. **Never auto-act on a hard fault.**

## Round 1 status

**Real.** Drift and conformal calibration run for real on each node; only the replayed input
is simulated.

## Why this choice

- **Conformal over a fixed threshold** — gives a *calibrated* confidence the jury can trust,
  and degrades gracefully instead of firing late.
- **ADWIN** — adaptive windowing detects gradual drift without a hand-tuned window size.

## Anchored to

- [[stale-quarantine]] — this layer is the whole scenario: Node C drifts, self-trust drops,
  it transitions to "listen, don't teach."

## Related

[[L1-worker]] · [[L3-case-memory]] · [[L4-gossip-zenoh]] · [[glossary]]
