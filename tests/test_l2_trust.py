"""L2 tests — conformal coverage, ADWIN drift, the three-state machine, recovery, determinism.

Each test proves a behavior named in the spec, not just that code runs.
"""

from __future__ import annotations

import numpy as np

from synapse.l1_worker.detector import WorkerModel
from synapse.l2_trust.conformal import ConformalCalibrator
from synapse.l2_trust.drift import ADWINDriftDetector
from synapse.l2_trust.state_machine import (
    NodeAssessor,
    TrustState,
    decide_state,
)
from tests._helpers import (
    fault_stream_fvs,
    gradual_drift_fvs,
    many_healthy_fvs,
)


# --------------------------------------------------------------------- conformal coverage


def test_conformal_empirical_coverage_within_band() -> None:
    """On held-out HEALTHY data, empirical coverage ≈ target (1−alpha).

    Uses many exchangeable synthetic healthy windows so the estimate concentrates. The
    coverage guarantee assumes exchangeability between calibration and test; under genuine
    non-exchangeable drift the fix is ACI/weighted conformal (see conformal.py docstring) —
    here drift is instead surfaced by ADWIN, not hidden.
    """
    alpha = 0.05
    healthy = many_healthy_fvs(1600, seed=0)
    train, calib, test = healthy[:600], healthy[600:1000], healthy[1000:]

    model = WorkerModel(random_state=0).fit(train)
    calibrator = ConformalCalibrator.fit(model.score_many(calib), alpha=alpha)
    pvals = np.array([calibrator.p_value(model.score(fv)) for fv in test])

    coverage = float(np.mean(pvals > alpha))
    target = 1.0 - alpha
    print(f"[conformal] target={target:.2f} measured_coverage={coverage:.3f} (n_test={len(test)})")
    assert 0.90 <= coverage <= 0.98


# ------------------------------------------------------------------------------- ADWIN


def test_adwin_flags_distribution_shift() -> None:
    det = ADWINDriftDetector()
    rng = np.random.default_rng(0)
    for v in rng.normal(0.0, 0.1, 600):
        det.update(float(v))
    assert not det.drift_detected  # stationary first half -> no drift
    for v in rng.normal(5.0, 0.1, 600):
        det.update(float(v))
    assert det.drift_detected  # shifted -> drift flagged (and latched)


def test_adwin_stationary_no_false_drift() -> None:
    det = ADWINDriftDetector()
    rng = np.random.default_rng(1)
    flagged = any(det.update(float(v)) for v in rng.normal(0.0, 1.0, 1500))
    assert not flagged


# ----------------------------------------------------------------- state machine (pure)


def _decide(**kw) -> TrustState:
    base = dict(
        drift_detected=False,
        self_trust=1.0,
        confirmed_fault=False,
        local_case_match=False,
        peer_seen=False,
        trust_threshold=0.5,
    )
    base.update(kw)
    return decide_state(**base)


def test_state_drift_is_stale() -> None:
    assert _decide(drift_detected=True) is TrustState.STALE


def test_state_confirmed_novel_fault_is_unknown() -> None:
    assert _decide(confirmed_fault=True) is TrustState.UNKNOWN


def test_state_healthy_is_confident() -> None:
    assert _decide() is TrustState.CONFIDENT


def test_state_known_fault_is_confident() -> None:
    # confirmed but recognized locally -> not escalated.
    assert _decide(confirmed_fault=True, local_case_match=True) is TrustState.CONFIDENT


def test_low_trust_and_anomalous_is_stale_not_unknown() -> None:
    # Amendment 5: STALE precedence — a node that can't trust itself never escalates.
    assert _decide(self_trust=0.2, confirmed_fault=True) is TrustState.STALE


# ------------------------------------------------ assessor: fault vs drift separation


def _calibrated_assessor(seed: int = 0, **kw) -> tuple[NodeAssessor, list]:
    healthy = many_healthy_fvs(400, seed=seed)
    model = WorkerModel(random_state=0).fit(healthy[:250])
    assessor = NodeAssessor(model, node_id="A", **kw)
    assessor.calibrate(healthy[250:])
    return assessor, healthy


def test_sustained_fault_keeps_node_confident_not_stale() -> None:
    """Amendment 1: a sustained fault never trips drift; the node stays trusted (teaches)."""
    # local_case_match=True so a *confirmed* fault lands in CONFIDENT (not UNKNOWN); the point
    # under test is that drift is NOT tripped and should_teach stays True.
    assessor, _ = _calibrated_assessor(local_case_match_predicate=lambda sig: True)
    last = None
    for fv in fault_stream_fvs(30, seed=1):
        last = assessor.assess(fv)
    assert last is not None
    assert not last.drift_detected  # faults excluded from the staleness stream
    assert last.confirmed_fault
    assert last.should_teach
    assert last.state is TrustState.CONFIDENT


def test_gradual_drift_trips_stale() -> None:
    """Amendment 1: a shift in the NORMAL baseline trips ADWIN -> STALE, should_teach False."""
    assessor, healthy = _calibrated_assessor(seed=0)
    for fv in healthy[:60]:  # stationary baseline first: no drift yet
        assert not assessor.assess(fv).drift_detected
    last = None
    for fv in gradual_drift_fvs(220, seed=3, start_tick=60):
        last = assessor.assess(fv)
    assert last is not None
    assert last.drift_detected
    assert last.state is TrustState.STALE
    assert not last.should_teach


# ------------------------------------------------------------- m-of-n confirmation gate


def test_m_of_n_confirmation_gate() -> None:
    assessor, _ = _calibrated_assessor(confirm_m=3, confirm_n=5)
    faults = fault_stream_fvs(3, seed=1)
    a1 = assessor.assess(faults[0])
    a2 = assessor.assess(faults[1])
    a3 = assessor.assess(faults[2])
    assert not a1.confirmed_fault  # 1 of 5
    assert not a2.confirmed_fault  # 2 of 5
    assert a3.confirmed_fault      # 3 of 5 -> confirmed


# ---------------------------------------------------------------------- stale recovery


def test_stale_node_recovers_after_recalibration() -> None:
    """Amendment 4: a re-baselined node returns to CONFIDENT with full self-trust."""
    assessor, healthy = _calibrated_assessor(seed=0)
    for fv in gradual_drift_fvs(220, seed=3):
        assessor.assess(fv)
    assert assessor.assess(healthy[0]).state is TrustState.STALE  # latched stale

    assessor.recalibrate(many_healthy_fvs(400, seed=7)[250:])
    recovered = assessor.assess(many_healthy_fvs(1, seed=9)[0])
    assert recovered.state is TrustState.CONFIDENT
    assert not recovered.drift_detected
    assert recovered.self_trust == 1.0
    assert recovered.should_teach


# -------------------------------------------------------------------------- determinism


def test_assessment_sequence_is_deterministic() -> None:
    stream = many_healthy_fvs(40, seed=0) + fault_stream_fvs(15, seed=1, start_tick=40)

    def run() -> list:
        healthy = many_healthy_fvs(400, seed=0)
        model = WorkerModel(random_state=0).fit(healthy[:250])
        assessor = NodeAssessor(model, node_id="A")
        assessor.calibrate(healthy[250:])
        return [assessor.assess(fv) for fv in stream]

    assert run() == run()  # NodeAssessment is a scalar frozen dataclass -> exact equality
