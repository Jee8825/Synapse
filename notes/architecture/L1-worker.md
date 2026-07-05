---
title: L1 — Worker Model
type: architecture
tags: [synapse, architecture, l1, anomaly-detection]
status: round-1-build
updated: 2026-06-23
---

# L1 — Worker Model

> Layer 1 of the 4-layer per-node stack. **Real production code** in Round 1.
> Source of truth: [[CLAUDE]] §4. Map of content: [[SYNAPSE-Home]].

## Responsibility

Lightweight **on-edge anomaly detection**. Trained on healthy windows, it scores each
incoming `FeatureWindow` for how anomalous it looks. This is the node's first reflex —
"does this window look like a healthy machine?"

- **Primary model:** **Isolation Forest** (`scikit-learn`).
- **Alternative:** a small **1D-CNN** (`torch` / `onnxruntime`) — only if Isolation Forest
  proves insufficient. *Prefer Isolation Forest.*
- **Latency budget:** inference must be cheap — target **< ~5 ms/window**.

## Where it sits

Maps to the **ISO 13374 / OSA-CBM** state-detection + health-assessment blocks. It feeds
its score up to [[L2-drift-conscience]], which decides whether the node can be *trusted*
to act on that score. The feature vector it consumes is produced by the `features/`
extractor (FFT bands, RMS, kurtosis, crest factor, current, temperature).

## Round 1 status

**Real.** Only the *input* is simulated — windows are replayed from CWRU/NASA lab-rig data
via the `SensorSource` seam. The detector itself is the same code that would run on Stage-2
hardware.

## Why this choice

- **Isolation Forest over a deep net** — cheap, no GPU, trains fast on a small healthy set,
  and is explainable to a jury. Anomaly detection (not classification) fits "we only have
  healthy data and want to flag deviation."

## Anchored to

- [[divergence-catch]] — L1 is what first scores Node A's fault-onset windows as anomalous.
- [[batch-defect]] — the same premature L1 signature on A and B is the systemic tell.

## Related

[[L2-drift-conscience]] · [[L3-case-memory]] · [[L4-gossip-zenoh]] · [[glossary]]
