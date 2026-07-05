"""Scenario — Comms integrity (the real redundant dual-channel transport + per-node comparator).

Demonstrates the industrial network the fleet uses in deployment, exercised for real in code:
every published signature travels TWO diverse paths — A ("wired" backbone) and B ("wireless"
per-batch router) — and each receiving node runs an INDEPENDENT comparator (PRP + 1oo2D) that
cross-checks the two copies before anything enters L3.

3-act arc:
  setup    — A, B, C healthy + CONFIDENT (identical peers).
  trigger  — A alone develops inner-race, confirms it, and TEACHES the signature. It is published
             over BOTH channels to every peer.
  response — B receives both copies, they AGREE -> accept once -> B learns born-wise. But node C's
             path-B copy from A is TAMPERED (a compromised wireless link): C's two copies DISAGREE
             -> C's comparator REJECTS the signature (never ingested) and flags the channel. The
             fleet still learns via the clean node; the poisoned copy is caught + quarantined at C
             — the integrity / anti-poisoning gate (CLAUDE.md §10 pilot gaps) working end to end.

Honesty boundary (identical to fleet50_* / stale_recovery): the SAME real L1-L4 stack runs for
every node; the redundant transport + comparator are REAL logic (synapse/l4_gossip/redundancy.py)
exercised over the deterministic in-process bus, not 3 Zenoh processes. Only the fault ONSET + the
tampered-link injection are scheduled; every accept/reject is DECIDED by the comparator.
"""

from __future__ import annotations

from synapse.scenarios.base import NodeData, ScenarioSpec, build_timeline
from synapse.scenarios.sources import cwru_fvs

SPEC = ScenarioSpec(
    name="comms_integrity",
    narrative="Every signature crosses two diverse paths; each node cross-checks them. A tampered "
              "wireless copy is caught and rejected at node C, while the fleet still learns via the "
              "clean path.",
    n_ticks=14,
    nodes=("A", "B", "C"),
    roles={"A": "teacher", "B": "peer (clean link)", "C": "peer (tampered link)"},
    acts=((0, "setup"), (4, "trigger"), (8, "response")),
    base_port=7561,
    settle_s=0.2,
    dual_channel=True,                 # relay every publication over channels A + B, cross-checked
    channel_tamper=(("C", "A"),),      # C's path-B copy from A is corrupted -> comparator mismatch
)

_SWITCH = 4  # tick A switches healthy -> inner-race (novel fault it will teach)


def node_data(node_id: str) -> NodeData:
    normal = cwru_fvs("normal", node_id=node_id)
    cal, healthy = normal[:80], normal[80:]
    if node_id == "A":
        ir = cwru_fvs("inner_race", node_id=node_id)
        timeline = build_timeline(node_id, [(healthy, _SWITCH), (ir, SPEC.n_ticks - _SWITCH)])
    else:
        timeline = build_timeline(node_id, [(healthy, SPEC.n_ticks)])  # B, C stay healthy peers
    return NodeData(role=SPEC.roles[node_id], calibration_fvs=cal, timeline_fvs=timeline)
