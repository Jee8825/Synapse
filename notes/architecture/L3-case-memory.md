---
title: L3 — Case Memory
type: architecture
tags: [synapse, architecture, l3, memory, faiss, recall]
status: round-1-build
updated: 2026-06-23
---

# L3 — Case Memory

> Layer 3 of the 4-layer per-node stack. **Real production code** in Round 1.
> Source of truth: [[CLAUDE]] §4. Map of content: [[SYNAPSE-Home]].

## Responsibility

A compact **fault-signature** store — the node's long-term memory of what faults look like.
Each signature carries a **feature vector + provenance + decay + confidence** (see
[[glossary]]).

- **FAISS-style** approximate nearest-neighbour similarity lookup (`faiss-cpu`, or `numpy`
  cosine similarity if FAISS is fiddly on arm64).
- **Dedup/merge** — repeats collapse into one entry with a count. A recurring micro-stutter is
  *one* entry, not thousands.
- **Bounded store** with composite eviction (**recency + access-frequency + severity**) —
  memory is bounded by design, never crashes, and never randomly deletes critical knowledge.

> This layer is the project's **"Recall"** memory engine — decay, conflict detection,
> provenance, Bayesian confidence — reused here for fault signatures.

## Round 1 status

**Real.** The store, dedup/merge, decay, and bounded eviction all run for real.

## Why this choice

- **Approximate NN over exact search** — sub-linear lookup so a node can ask "have I (or a
  peer) seen something like this?" cheaply at the edge.
- **Composite eviction over plain LRU** — severity and access-frequency keep rare-but-critical
  signatures alive even if they haven't been seen recently.

## Anchored to

- [[divergence-catch]] — stores the original signature Node A creates.
- [[batch-defect]] — the matching signatures on A and B are what reveals a systemic batch defect.

## Related

[[L1-worker]] · [[L2-drift-conscience]] · [[L4-gossip-zenoh]] · [[glossary]]
