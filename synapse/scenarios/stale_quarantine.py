"""Scenario 3 — Stale self-quarantine (CLAUDE.md §6).

3-act arc (the slow one — gradual drift is inherently gradual at the frozen ADWIN delta):
  setup    — A, B, C healthy + CONFIDENT; C establishes its baseline (~60 ticks).
  trigger  — C undergoes gradual baseline DRIFT (not a clean fault); A teaches a real fault so
             C demonstrably RECEIVES peer knowledge.
  response — ADWIN trips, C's self_trust falls below tau_stale -> C goes STALE, should_teach=False
             ("listen, don't teach") so it cannot poison A/B. C keeps RECEIVING while muted.

C is synthetic: there is no labelled CWRU "drift" recording — drift is a seeded gradual baseline
shift (the mechanism the L2 conscience was validated on). A and B are real CWRU. C trips ~tick 150.
"""

from __future__ import annotations

from synapse.scenarios.base import NodeData, ScenarioSpec, build_timeline
from synapse.scenarios.sources import (
    cwru_fvs,
    synthetic_drift_fvs,
    synthetic_healthy_fvs,
)

SPEC = ScenarioSpec(
    name="stale_quarantine",
    narrative="C drifts -> self-trust falls -> STALE: it stops teaching (can't poison) but keeps listening.",
    n_ticks=165,
    nodes=("A", "B", "C"),
    roles={"A": "teacher", "B": "healthy-peer", "C": "drifting"},
    # C needs ~60 healthy baseline + ~90 drift windows before ADWIN confirms drift (~tick 150).
    acts=((0, "setup"), (60, "trigger"), (150, "response")),
    base_port=7541,
    settle_s=0.05,  # only one gossip event (A->C); keep the long timeline fast
)

_C_BASELINE = 60   # healthy ticks C needs before drift, for ADWIN to have a reference
_A_SWITCH = 60     # A starts teaching when C starts drifting (C receives while still confident)


def node_data(node_id: str) -> NodeData:
    if node_id == "C":
        # synthetic: drift has no CWRU analog. Calibrate on synthetic healthy, then drift.
        # why 400: a large healthy calibration sets a stable conformal threshold so gentle drift
        # stays NORMAL (feeding ADWIN) instead of tripping per-window as spurious faults.
        cal = synthetic_healthy_fvs(400, node_id="C", seed=0)
        healthy = synthetic_healthy_fvs(_C_BASELINE, node_id="C", seed=9)
        drift = synthetic_drift_fvs(SPEC.n_ticks, node_id="C", seed=3, ramp=20, plateau=0.010)
        timeline = build_timeline("C", [(healthy, _C_BASELINE), (drift, SPEC.n_ticks - _C_BASELINE)])
        return NodeData(role="drifting", calibration_fvs=cal, timeline_fvs=timeline)

    normal = cwru_fvs("normal", node_id=node_id)
    cal, healthy = normal[:80], normal[80:]
    if node_id == "A":
        ir = cwru_fvs("inner_race", node_id=node_id)
        timeline = build_timeline("A", [(healthy, _A_SWITCH), (ir, SPEC.n_ticks - _A_SWITCH)])
    else:  # B: healthy control throughout
        timeline = build_timeline("B", [(healthy, SPEC.n_ticks)])
    return NodeData(role=SPEC.roles[node_id], calibration_fvs=cal, timeline_fvs=timeline)
