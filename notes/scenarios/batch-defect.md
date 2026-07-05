---
title: Scenario 2 — Systemic Batch-Defect Immunity
type: scenario
tags: [synapse, scenario, batch-defect, demo]
status: round-1-build
updated: 2026-06-23
---

# Scenario 2 — Systemic Batch-Defect Immunity

> One of the three demo "money shots." Source of truth: [[CLAUDE]] §6.
> Map of content: [[SYNAPSE-Home]].

## The claim

A bad tool/insert batch or bad material lot shows up as the **same premature signature across
many machines at once** = a systemic defect that per-machine monitoring is blind to. The fleet
catches it **before it scraps parts line-wide**.

## The setup

- Feed the **same fault onset** to **Node A and Node B at the same tick**.

## What happens

1. [[L1-worker]] on both A and B independently scores the same premature anomaly.
2. Each creates a near-identical signature in [[L3-case-memory]] and gossips it via
   [[L4-gossip-zenoh]].
3. The fleet sees the **same premature signature appear on two nodes simultaneously** → flags it
   as **systemic** (a batch/material defect), not ordinary per-machine wear.

## Why it matters

Normal wear shows up on one machine at a time, at the expected age. A premature, *identical*
signature on multiple machines at once is the fingerprint of a bad batch — only a fleet view
can tell the two apart.

## Pass condition (deterministic)

With seeded RNGs and a fixed tick schedule, the run reproducibly ends with the shared signature
flagged as systemic across A and B. Byte-for-byte repeatable.

## Related

[[divergence-catch]] · [[stale-quarantine]] · [[L3-case-memory]] · [[L4-gossip-zenoh]] · [[glossary]]
