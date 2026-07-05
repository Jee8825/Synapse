"""Scenario 2 — Systemic batch-defect immunity (CLAUDE.md §6). The most differentiating one.

3-act arc:
  setup    — A, B, C all healthy + CONFIDENT.
  trigger  — A AND B switch to the SAME fault at the SAME tick (the "bad batch"); C stays healthy.
  response — the same premature signature now carries contributing_nodes = {A, B} within the
             window -> systemic=True -> a BATCH-DEFECT ALARM that single-node monitoring cannot
             raise. C, the healthy control, sees the systemic pattern from peer knowledge alone.
"""

from __future__ import annotations

from synapse.scenarios.base import NodeData, ScenarioSpec, build_timeline
from synapse.scenarios.sources import cwru_fvs

SPEC = ScenarioSpec(
    name="batch_defect",
    narrative="A and B hit the same premature fault at once -> systemic batch defect the fleet catches.",
    n_ticks=14,
    nodes=("A", "B", "C"),
    roles={"A": "bad-batch", "B": "bad-batch", "C": "healthy-control"},
    acts=((0, "setup"), (4, "trigger"), (8, "response")),
    base_port=7521,
    settle_s=0.2,
)

_SWITCH = 4  # A and B switch together = the bad batch


def node_data(node_id: str) -> NodeData:
    normal = cwru_fvs("normal", node_id=node_id)
    cal, healthy = normal[:80], normal[80:]
    if node_id in ("A", "B"):
        ir = cwru_fvs("inner_race", node_id=node_id)
        timeline = build_timeline(node_id, [(healthy, _SWITCH), (ir, SPEC.n_ticks - _SWITCH)])
    else:
        timeline = build_timeline(node_id, [(healthy, SPEC.n_ticks)])  # C: healthy control
    return NodeData(role=SPEC.roles[node_id], calibration_fvs=cal, timeline_fvs=timeline)
