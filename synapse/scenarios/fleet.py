"""Parametric N-node fleet scenarios (``fleet50_*``) — the SAME real L1-L4 logic as the 3-node
scenarios, generalized to a 50-CNC factory floor and run OFFLINE (in-process bus) into a
deterministic FleetEvent log the Vivarium twin replays.

**Honesty boundary (state it everywhere):** 50 nodes of REAL L1-L4 logic — the real
``WorkerModel`` -> ``NodeAssessor`` -> ``CaseMemory`` plus the real ``should_publish`` /
``should_ingest`` / ``PublishLedger`` gossip rules — but the live Eclipse-Zenoh PEER P2P
transport stays the 3-process core (``scripts/run_scenario.py``). This module is a fleet-scale
*visualization* data source, **not** a change to the locked Round-1 3-node deliverable
(CLAUDE.md §2), and **NOT** 50 real Zenoh processes (addendum 2026-06-27).

**Floor layout** (grounded in lights-out cellular manufacturing): 50 CNCs paired into 25
robot-tended cells (2 machines per cell). Node ids ``M00``..``M49``; cell ``c`` holds ``M{2c}``
and ``M{2c+1}``. The roster + cell helpers are shared so the later rendering phases place the
same 50 machines the data describes.

Why these three anchor the same §6 money shots, only far stronger at fleet scale:
  * **divergence**   — ONE machine (``M23``) develops a fault while 49 *identical* peers stay
                       healthy; the fleet flags the outlier by peer comparison, not a threshold.
  * **batch_defect** — a bad insert/material lot hits a CONTIGUOUS cell cluster (cells 5-7,
                       ``M10``..``M15``) at the same tick -> the same premature signature appears
                       across many machines at once -> systemic, fleet-wide.
  * **stale**        — one drifting machine (``M49``) self-quarantines ("listen, don't teach")
                       while a teacher (``M00``) keeps arming the other 48 healthy peers.
"""

from __future__ import annotations

from synapse.scenarios.base import NodeData, ScenarioSpec, build_timeline
from synapse.scenarios.sources import cwru_fvs, synthetic_drift_fvs, synthetic_healthy_fvs

# --- floor roster -------------------------------------------------------------------------

FLEET_N = 50
CELL_SIZE = 2
N_CELLS = FLEET_N // CELL_SIZE  # 25 robot-tended cells


def fleet_nodes(n: int = FLEET_N) -> tuple[str, ...]:
    return tuple(f"M{i:02d}" for i in range(n))


def cell_of(node_id: str) -> int:
    """Cell index (0..N_CELLS-1) a machine belongs to (2 CNCs per cell)."""
    return int(node_id[1:]) // CELL_SIZE


def cell_nodes(cell: int) -> tuple[str, ...]:
    base = cell * CELL_SIZE
    return tuple(f"M{base + j:02d}" for j in range(CELL_SIZE))


NODES = fleet_nodes()

# --- scenario fault selection (deterministic, explainable) --------------------------------

_SWITCH = 4                       # tick a faulting machine switches healthy -> inner-race
_DIVERGE_NODE = "M23"             # the lone outlier (cell 11, machine 1) among 49 identical peers
# a bad insert lot delivered to a contiguous floor region: cells 5, 6, 7 (6 machines).
_BATCH_NODES = ("M10", "M11", "M12", "M13", "M14", "M15")
_STALE_DRIFTER = "M49"            # synthetic gradual drift -> STALE self-quarantine
_STALE_TEACHER = "M00"            # a real fault teacher so the drifter demonstrably keeps listening
_C_BASELINE = 60                  # healthy ticks the drifter needs before drift (ADWIN reference)
_A_SWITCH = 60                    # teacher starts teaching when the drifter starts drifting


def _roles(name: str) -> dict[str, str]:
    if name == "fleet50_divergence":
        return {n: ("diverging" if n == _DIVERGE_NODE else "healthy-peer") for n in NODES}
    if name == "fleet50_batch_defect":
        return {n: ("bad-batch" if n in _BATCH_NODES else "healthy") for n in NODES}
    if name == "fleet50_stale_quarantine":
        return {
            n: ("drifting" if n == _STALE_DRIFTER else "teacher" if n == _STALE_TEACHER
                else "healthy-peer")
            for n in NODES
        }
    raise KeyError(name)


SPECS: dict[str, ScenarioSpec] = {
    "fleet50_divergence": ScenarioSpec(
        name="fleet50_divergence",
        narrative=("One CNC (M23) diverges from 49 identical healthy peers; the FLEET flags the "
                   "outlier by peer comparison, not a fixed threshold."),
        n_ticks=14,
        nodes=NODES,
        roles=_roles("fleet50_divergence"),
        acts=((0, "setup"), (4, "trigger"), (8, "response")),
        base_port=7600,          # unused offline (no transport); kept for spec shape parity
        settle_s=0.0,
    ),
    "fleet50_batch_defect": ScenarioSpec(
        name="fleet50_batch_defect",
        narrative=("A bad insert lot hits cells 5-7 (M10-M15) at the same tick -> one premature "
                   "signature across many machines at once = a systemic batch defect the fleet catches."),
        n_ticks=14,
        nodes=NODES,
        roles=_roles("fleet50_batch_defect"),
        acts=((0, "setup"), (4, "trigger"), (8, "response")),
        base_port=7620,
        settle_s=0.0,
    ),
    "fleet50_stale_quarantine": ScenarioSpec(
        name="fleet50_stale_quarantine",
        narrative=("M49 drifts -> self-trust falls -> STALE: it stops teaching (can't poison) but "
                   "keeps listening, while M00 keeps arming the other 48 healthy peers."),
        n_ticks=165,
        nodes=NODES,
        roles=_roles("fleet50_stale_quarantine"),
        acts=((0, "setup"), (60, "trigger"), (150, "response")),
        base_port=7640,
        settle_s=0.0,
    ),
}


# --- per-node data ------------------------------------------------------------------------


def _normal_split(node_id: str) -> tuple[list, list]:
    """A machine's healthy CWRU windows split into (calibration, running-healthy)."""
    normal = cwru_fvs("normal", node_id=node_id)
    return normal[:80], normal[80:]


def node_data(name: str, node_id: str) -> NodeData:
    """Everything one machine needs to play its part in a fleet50 scenario (real FeatureVectors).

    Healthy peers replay the SAME CWRU ``normal`` recording (re-stamped per node) so the fleet is
    a genuinely *identical-machine* fleet — which is exactly what makes the outlier (divergence)
    and the cluster (batch) stand out. Faulting machines switch to CWRU ``inner_race`` at a fixed
    tick; the lone drifter is synthetic (no labelled CWRU drift recording exists — same mechanism
    the L2 drift-conscience was validated on).
    """
    spec = SPECS[name]

    if name == "fleet50_stale_quarantine" and node_id == _STALE_DRIFTER:
        cal = synthetic_healthy_fvs(400, node_id=node_id, seed=0)
        healthy = synthetic_healthy_fvs(_C_BASELINE, node_id=node_id, seed=9)
        drift = synthetic_drift_fvs(spec.n_ticks, node_id=node_id, seed=3, ramp=20, plateau=0.010)
        timeline = build_timeline(node_id, [(healthy, _C_BASELINE), (drift, spec.n_ticks - _C_BASELINE)])
        return NodeData(role="drifting", calibration_fvs=cal, timeline_fvs=timeline)

    cal, healthy = _normal_split(node_id)

    faults = _fault_switch(name, node_id, spec.n_ticks)
    if faults is not None:
        switch_tick = faults
        ir = cwru_fvs("inner_race", node_id=node_id)
        timeline = build_timeline(node_id, [(healthy, switch_tick), (ir, spec.n_ticks - switch_tick)])
    else:
        timeline = build_timeline(node_id, [(healthy, spec.n_ticks)])
    return NodeData(role=spec.roles[node_id], calibration_fvs=cal, timeline_fvs=timeline)


def _fault_switch(name: str, node_id: str, n_ticks: int) -> int | None:
    """Return the tick a machine switches to a real fault, or None if it stays healthy."""
    if name == "fleet50_divergence":
        return _SWITCH if node_id == _DIVERGE_NODE else None
    if name == "fleet50_batch_defect":
        return _SWITCH if node_id in _BATCH_NODES else None
    if name == "fleet50_stale_quarantine":
        return _A_SWITCH if node_id == _STALE_TEACHER else None
    raise KeyError(name)


# --- loader hooks (used by synapse.scenarios.base.load) ------------------------------------


def spec_for(name: str) -> ScenarioSpec:
    return SPECS[name]


def node_data_for(name: str):
    """Bind a scenario name -> a ``node_data(node_id)`` callable (same interface as 3-node modules)."""
    def _fn(node_id: str) -> NodeData:
        return node_data(name, node_id)

    return _fn
