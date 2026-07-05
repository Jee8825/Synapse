"""Scenario 1 — Divergence catch (CLAUDE.md §6).

3-act arc:
  setup    — A, B, C all healthy + CONFIDENT (identical peers running the same program).
  trigger  — A switches to inner-race(105); B, C stay healthy. A alone develops a fault,
             confirms it, and gossips a signature.
  response — B & C (healthy, never saw it) RECEIVE A's signature as PEER knowledge — the
             fleet has flagged A's divergence by peer comparison, not a fixed threshold.
"""

from __future__ import annotations

from synapse.scenarios.base import NodeData, ScenarioSpec, build_timeline
from synapse.scenarios.sources import cwru_fvs

SPEC = ScenarioSpec(
    name="divergence",
    narrative="A diverges from its identical healthy peers; the FLEET flags it (not a threshold).",
    n_ticks=14,
    nodes=("A", "B", "C"),
    roles={"A": "diverging", "B": "healthy-peer", "C": "healthy-peer"},
    acts=((0, "setup"), (4, "trigger"), (8, "response")),
    base_port=7501,
    settle_s=0.2,
)

_SWITCH = 4  # tick A switches healthy -> inner-race


def node_data(node_id: str) -> NodeData:
    normal = cwru_fvs("normal", node_id=node_id)
    cal, healthy = normal[:80], normal[80:]
    if node_id == "A":
        ir = cwru_fvs("inner_race", node_id=node_id)
        timeline = build_timeline(node_id, [(healthy, _SWITCH), (ir, SPEC.n_ticks - _SWITCH)])
    else:
        timeline = build_timeline(node_id, [(healthy, SPEC.n_ticks)])  # B, C stay healthy
    return NodeData(role=SPEC.roles[node_id], calibration_fvs=cal, timeline_fvs=timeline)
