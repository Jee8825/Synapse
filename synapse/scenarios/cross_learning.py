"""Scenario — Cross-learning (the full learn→teach→predict cycle in one arc).

The single end-to-end story the fleet is built for, with **no fixed roles**: three IDENTICAL
machines, each of which can BOTH discover-and-teach a new fault AND recognize-and-warn on a
pattern a peer taught. It composes the two proven mechanics (divergence + batch-defect) into one
timeline so a single tab walks the whole cycle:

  setup     — A, B, C all healthy + CONFIDENT (identical peers, self-trust 1.0).
  new-fault — A alone develops inner-race. Novel to the whole fleet -> A escalates (UNKNOWN),
              then teaches the signature peer-to-peer. B & C receive it (born-wise armed) — "A
              sent its data to B and C". (This is the divergence mechanic.)
  2nd-fault — B alone develops a DIFFERENT novel fault (ball). B escalates + teaches it. Now a
              SECOND machine has taught -> there is no fixed teacher; every node both teaches and
              learns. A & C arm born-wise on B's ball signature.
  predict   — C's OWN machine starts showing the SAME inner-race pattern A taught. Because C was
              armed, it recognizes it born-wise (recognition_source=PEER) and raises a warning
              WITHOUT escalating — it predicted the fault from an existing pattern. As C confirms
              it first-hand and re-teaches, inner-race now has two contributing origins {A, C}
              within the window -> a SYSTEMIC batch-defect alarm the fleet raises. (batch mechanic.)

Honesty boundary (identical to fleet50_* / stale_recovery): the SAME real L1-L4 stack runs for
every node — WorkerModel -> NodeAssessor -> CaseMemory + the real should_publish/should_ingest/
PublishLedger gossip rules. Only the TRANSPORT is the deterministic in-process bus, not 3
Eclipse-Zenoh processes. The live Zenoh PEER P2P transport stays the 3-process core
(scripts/run_scenario.py); this is additive VISUALIZATION data in the existing FleetEvent schema,
NOT a Round-1 §2 scope change. Every beat below is DECIDED by the real stack — only the fault
ONSET ticks are scheduled here.
"""

from __future__ import annotations

from synapse.scenarios.base import NodeData, ScenarioSpec, build_timeline
from synapse.scenarios.sources import cwru_fvs

SPEC = ScenarioSpec(
    name="cross_learning",
    narrative="No fixed roles — every machine both teaches and learns. One detects a new fault and "
              "teaches it; another detects a different one; a third later sees the first pattern in "
              "its own data and raises a born-wise warning.",
    n_ticks=32,
    nodes=("A", "B", "C"),
    # symmetric roles: all three are identical peers (the label is not a fixed teacher/learner).
    roles={"A": "peer", "B": "peer", "C": "peer"},
    acts=((0, "setup"), (5, "new-fault"), (13, "2nd-fault"), (20, "predict")),
    base_port=7541,
    settle_s=0.2,
)

# fault-onset ticks (the ONLY thing scheduled; the stack decides detect/teach/recognize/systemic).
_A_INNER = 5    # A discovers inner-race first  -> novel -> escalate + teach
_B_BALL = 13    # B discovers a DIFFERENT novel fault (ball) -> escalate + teach (2nd teacher)
_C_INNER = 20   # C later develops the SAME inner-race A taught -> born-wise recognize + warn


def node_data(node_id: str) -> NodeData:
    normal = cwru_fvs("normal", node_id=node_id)
    cal, healthy = normal[:80], normal[80:]
    if node_id == "A":
        ir = cwru_fvs("inner_race", node_id=node_id)
        timeline = build_timeline(node_id, [(healthy, _A_INNER), (ir, SPEC.n_ticks - _A_INNER)])
    elif node_id == "B":
        ball = cwru_fvs("ball", node_id=node_id)
        timeline = build_timeline(node_id, [(healthy, _B_BALL), (ball, SPEC.n_ticks - _B_BALL)])
    else:  # C: healthy until it develops the inner-race pattern A already taught (born-wise)
        ir = cwru_fvs("inner_race", node_id=node_id)
        timeline = build_timeline(node_id, [(healthy, _C_INNER), (ir, SPEC.n_ticks - _C_INNER)])
    return NodeData(role=SPEC.roles[node_id], calibration_fvs=cal, timeline_fvs=timeline)
