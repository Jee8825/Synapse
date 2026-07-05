---
title: Glossary
type: reference
tags: [synapse, glossary, reference]
status: round-1-build
updated: 2026-06-23
---

# Glossary

> Use these terms precisely. Source of truth: [[CLAUDE]] §11.
> Map of content: [[SYNAPSE-Home]].

- **Signature / fault signature** — a compact feature-vector fingerprint of a fault, with
  provenance, decay, and confidence. The **only** thing that crosses the gossip wire.
  Lives in [[L3-case-memory]].

- **Self-trust** — a node's *calibrated* confidence (from conformal + drift) that its own
  judgments are reliable. Drives the three-state behavior. Owned by [[L2-drift-conscience]].

- **Drift-conscience (L2)** — the mechanism by which a node detects it has gone stale and
  voluntarily stops teaching. See [[L2-drift-conscience]].

- **Born-wise** — a node recognizing a fault it has **never personally experienced**, purely
  from a gossiped peer signature. Enabled by [[L4-gossip-zenoh]] + [[L3-case-memory]].

- **Trust-gate** — the rule that a node only contributes to the fleet when its self-trust is
  high. Enforced in [[L4-gossip-zenoh]].

- **Scaled spindle analog** — the Stage-2 motor rig; an honest stand-in for a CNC spindle, in
  the tradition of the lab rigs that produced the CWRU/NASA datasets. **Never** called a real CNC.

## Related

[[L1-worker]] · [[L2-drift-conscience]] · [[L3-case-memory]] · [[L4-gossip-zenoh]] · [[SYNAPSE-Home]]
