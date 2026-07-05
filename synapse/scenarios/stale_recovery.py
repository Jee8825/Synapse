"""Scenario 4 — Stale self-quarantine → RECOVERY → rejoin (CLAUDE.md §4 "staleness is recoverable").

The full three-state loop the drift-conscience was designed for, end to end:
  setup      — A, B, C healthy + CONFIDENT; C establishes its baseline.
  drift      — C's baseline gradually DRIFTS; its self-trust falls.
  quarantine — self-trust drops below tau_stale -> C goes STALE, should_teach=False ("listen,
               don't teach"). While quarantined C KEEPS LISTENING: it ingests A's freshly-taught
               fault signature (born-wise), even though it contributes nothing itself.
  recover    — C's drift SUBSIDES (operation returns to its known-healthy baseline). After a
               sustained run of baseline-returned windows the real ``recalibrate()`` path fires:
               ADWIN resets, conformal re-fits, self-trust climbs back to 1.0 -> C returns to
               CONFIDENT with teaching re-enabled (RECOVER), rejoining the fleet.

Honesty: the recovery is COMPUTED by the real L2 stack (``NodeAssessor`` auto-recovery via
``recalibrate()``), never scripted into the state. C is synthetic (there is no labelled CWRU
"drift" recording — drift is the seeded gradual baseline shift the L2 conscience was validated
on); A and B are real CWRU. Produced OFFLINE over the deterministic in-process bus
(``scripts/run_offline_scenario.py``) so the recovery beat is byte-for-byte reproducible; the
live Zenoh PEER P2P transport stays the 3-process core (``scripts/run_scenario.py``).
"""

from __future__ import annotations

from synapse.scenarios.base import NodeData, ScenarioSpec, build_timeline
from synapse.scenarios.sources import (
    cwru_fvs,
    synthetic_drift_fvs,
    synthetic_healthy_fvs,
)

# --- phase schedule (Node C) --------------------------------------------------------------
# Mirror the PROVEN stale_quarantine drift (plateau=0.010, ramp=20) so C trips STALE ~tick 150 via
# the DRIFT path (windows stay non-anomalous -> fed to ADWIN), NOT the fault path. Then a healthy
# recovery tail lets the real recalibrate() fire.
_C_BASELINE = 60    # healthy ticks before drift, for ADWIN to have a reference
_DRIFT_END = 155    # C drifts across [_C_BASELINE, _DRIFT_END); trips STALE ~150
_N_TICKS = 230      # C then runs healthy [_DRIFT_END, _N_TICKS) -> recalibrate -> CONFIDENT

_A_SWITCH = 150     # A replays a real inner-race fault so it teaches WHILE C is quarantined
                    # (C, though STALE, still LISTENS: it ingests A's signature born-wise).

SPEC = ScenarioSpec(
    name="stale_recovery",
    narrative="C drifts -> STALE (listens, doesn't teach) -> drift subsides -> re-earns trust -> rejoins.",
    n_ticks=_N_TICKS,
    nodes=("A", "B", "C"),
    roles={"A": "teacher", "B": "healthy-peer", "C": "drifting"},
    acts=((0, "setup"), (_C_BASELINE, "drift"), (150, "quarantine"), (166, "recover")),
    base_port=7551,
    settle_s=0.05,
    recover_after=12,   # consecutive baseline-returned windows before C re-baselines (recalibrate)
)


def node_data(node_id: str) -> NodeData:
    if node_id == "C":
        # synthetic: drift has no CWRU analog. Calibrate on a large synthetic-healthy split so the
        # conformal threshold is stable; then healthy baseline -> drift -> healthy again.
        cal = synthetic_healthy_fvs(400, node_id="C", seed=0)
        healthy = synthetic_healthy_fvs(_C_BASELINE, node_id="C", seed=9)
        drift = synthetic_drift_fvs(
            _DRIFT_END - _C_BASELINE, node_id="C", seed=3, ramp=20, plateau=0.010
        )
        recover = synthetic_healthy_fvs(_N_TICKS - _DRIFT_END, node_id="C", seed=21)
        timeline = build_timeline(
            "C",
            [(healthy, _C_BASELINE), (drift, _DRIFT_END - _C_BASELINE), (recover, _N_TICKS - _DRIFT_END)],
        )
        return NodeData(role="drifting", calibration_fvs=cal, timeline_fvs=timeline)

    normal = cwru_fvs("normal", node_id=node_id)
    cal, healthy = normal[:80], normal[80:]
    if node_id == "A":
        ir = cwru_fvs("inner_race", node_id=node_id)
        timeline = build_timeline("A", [(healthy, _A_SWITCH), (ir, _N_TICKS - _A_SWITCH)])
    else:  # B: healthy control throughout
        timeline = build_timeline("B", [(healthy, _N_TICKS)])
    return NodeData(role=SPEC.roles[node_id], calibration_fvs=cal, timeline_fvs=timeline)
