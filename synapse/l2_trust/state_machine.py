"""L2 — three-state machine + the single-node drift-conscience assessor.

Owns the CLAUDE.md §4 three-state behavior:
  CONFIDENT  — high self-trust; detect, diagnose, teach the fleet.
  STALE      — drift / low self-trust; "listen, don't teach" (self-quarantine).
  UNKNOWN    — a confirmed novel fault neither this node nor any trusted peer has seen →
               escalate to a human.

L3 (local case memory) and L4 (peer gossip) do not exist yet, so the "have I seen this?" and
"has a trusted peer seen this?" checks are **injected predicates** defaulting to "no" — the
same seam pattern as the SensorSource swap. L4 will later supply ``peer_seen_predicate`` and
L3 ``local_case_match_predicate`` without changing this module.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from enum import Enum

import numpy as np

from synapse import config
from synapse.l1_worker.detector import WorkerModel
from synapse.l2_trust.conformal import ConformalCalibrator
from synapse.l2_trust.drift import ADWINDriftDetector
from synapse.sensors.base import FeatureVector

_EPS = 1e-12


class TrustState(str, Enum):
    CONFIDENT = "CONFIDENT"
    STALE = "STALE"
    UNKNOWN = "UNKNOWN"


class RecognitionSource(str, Enum):
    """Where a recognized fault's knowledge came from."""

    SELF = "SELF"   # first-hand: this node has personally confirmed this fault before
    PEER = "PEER"   # born-wise: recognized from a gossiped peer signature
    NONE = "NONE"   # not recognized (novel, or the window is not anomalous)


@dataclass(frozen=True)
class RecognitionResult:
    """What L3 case memory returns for a window: did we recognize it, and from whom?"""

    source: RecognitionSource = RecognitionSource.NONE
    matched_signature_id: str | None = None
    matched_origin_node_id: str | None = None
    similarity: float = 0.0  # best cosine seen (even when below tau_match -> NONE), for observability


@dataclass(frozen=True)
class NodeAssessment:
    """The L2 verdict for one window."""

    node_id: str
    tick: int
    anomaly_score: float
    calibrated_pvalue: float
    drift_detected: bool
    self_trust: float
    state: TrustState
    should_teach: bool
    confirmed_fault: bool  # m-of-n persistence gate — exposed so L4 can event-trigger gossip
    # born-wise observables (CLAUDE.md §6): how this window was recognized, if at all
    recognition_source: RecognitionSource = RecognitionSource.NONE
    matched_signature_id: str | None = None
    matched_origin_node_id: str | None = None
    match_similarity: float = 0.0  # best cosine vs case memory (visible non-circularity)

    @property
    def escalate(self) -> bool:
        """UNKNOWN means escalate to a human (kept derived, not a separate field)."""
        return self.state is TrustState.UNKNOWN


def decide_state(
    *,
    drift_detected: bool,
    self_trust: float,
    confirmed_fault: bool,
    local_case_match: bool,
    peer_seen: bool,
    trust_threshold: float,
) -> TrustState:
    """Pure transition function. Precedence: STALE → UNKNOWN → CONFIDENT.

    # why: STALE wins first — a node that can't trust itself must self-quarantine before it
    # interprets anything (so low-trust + anomalous is STALE, never UNKNOWN). Only a *confirmed*
    # fault (not a single noisy window) that is novel both locally and fleet-wide escalates.
    """
    if drift_detected or self_trust < trust_threshold:
        return TrustState.STALE
    if confirmed_fault and not local_case_match and not peer_seen:
        return TrustState.UNKNOWN
    return TrustState.CONFIDENT


class NodeAssessor:
    """Single-node L1+L2 brain: FeatureVector in → NodeAssessment out, tick by tick."""

    def __init__(
        self,
        model: WorkerModel,
        *,
        node_id: str,
        alpha: float = config.ALPHA,
        trust_threshold: float = config.TAU_STALE,
        confirm_m: int = config.CONFIRM_M,
        confirm_n: int = config.CONFIRM_N,
        adwin_delta: float = 0.002,
        trust_k: float = 3.0,
        recover_after: int | None = None,
        recover_band: float = 0.35,
        recognizer: Callable[[FeatureVector], RecognitionResult] | None = None,
        peer_seen_predicate: Callable[[FeatureVector], bool] = lambda fv: False,
        local_case_match_predicate: Callable[[FeatureVector], bool] = lambda fv: False,
    ) -> None:
        if not 0 < confirm_m <= confirm_n:
            raise ValueError("require 0 < confirm_m <= confirm_n")
        self._model = model
        self.node_id = node_id
        self.alpha = alpha
        self.trust_threshold = trust_threshold
        self.confirm_m = confirm_m
        self.trust_k = trust_k
        self._adwin_delta = adwin_delta
        # opt-in STALE self-recovery (default OFF -> every existing scenario is byte-identical).
        # A STALE node re-earns trust once it observes `recover_after` consecutive windows that are
        # back at its known-healthy baseline; it then re-baselines on exactly those windows.
        self._recover_after = recover_after
        self._recover_band = recover_band
        self._recovery_buf: list[FeatureVector] = []
        # recognizer (L3) supersedes the two bool predicates when provided. The predicates remain
        # for the pre-L3 seam / tests; the recognizer also yields the born-wise observables.
        self._recognizer = recognizer
        self._peer_seen = peer_seen_predicate
        self._local_match = local_case_match_predicate

        self._calibrator: ConformalCalibrator | None = None
        self._drift = ADWINDriftDetector(delta=adwin_delta)
        self._recent_anoms: deque[bool] = deque(maxlen=confirm_n)
        self._mu_calib = 0.0
        self._sigma_calib = 1.0

    # --- calibration & recovery -----------------------------------------------------------

    def calibrate(self, healthy_calib: Sequence[FeatureVector]) -> None:
        """Calibrate the conformal layer on a held-out HEALTHY split."""
        scores = self._model.score_many(healthy_calib)
        self._calibrator = ConformalCalibrator.fit(scores, alpha=self.alpha)
        self._mu_calib = float(np.mean(scores))
        # floor sigma so self-trust scaling can't divide by ~0 on a degenerate calibration.
        self._sigma_calib = max(float(np.std(scores)), _EPS)

    def recalibrate(
        self, healthy: Sequence[FeatureVector], *, refit_model: bool = False
    ) -> None:
        """STALE recovery: re-baseline on fresh healthy data and clear drift/fault history.

        # why: staleness is recoverable — once a node has fresh healthy data for the new
        # operating regime, it re-earns trust. We reset ADWIN (drop the latched drift), clear
        # the m-of-n window, and (optionally) retrain the detector, returning self-trust to 1.0.
        """
        if refit_model:
            self._model.fit(healthy)
        self._drift.reset()
        self._recent_anoms.clear()
        self.calibrate(healthy)

    # --- per-tick assessment --------------------------------------------------------------

    def assess(self, fv: FeatureVector) -> NodeAssessment:
        if self._calibrator is None:
            raise RuntimeError("NodeAssessor not calibrated; call calibrate() first")

        score = self._model.score(fv)
        pvalue = self._calibrator.p_value(score)
        is_anom = pvalue <= self.alpha

        # m-of-n confirmation: a single anomalous window is NOT a confirmed fault.
        self._recent_anoms.append(is_anom)
        confirmed_fault = sum(self._recent_anoms) >= self.confirm_m

        # Feed ADWIN ONLY normal windows (p > alpha), and feed the calibration-STANDARDIZED
        # score z = (score - mu_calib) / sigma_calib rather than the raw score.
        # why (normal-only): a sustained fault (p <= alpha) must not trip the *staleness* stream
        #   — only a shift in the NORMAL baseline indicates the calibration has gone stale. A
        #   single node can't perfectly separate a long fault from genuine drift; we take the
        #   conservative split here and let the fleet (L4) disambiguate via peer agreement.
        # why (standardize): ADWIN's change bound is sensitive to the absolute value scale, and
        #   IsoForest scores have an arbitrary magnitude. Standardizing to calibration-sigma
        #   units makes drift detection (and the `delta` setting) scale-invariant.
        if not is_anom:
            self._drift.update((score - self._mu_calib) / self._sigma_calib)
        drift_detected = self._drift.drift_detected

        self_trust = self._self_trust(drift_detected)

        recognition = self._recognize(fv)
        local_case_match = recognition.source is RecognitionSource.SELF
        peer_seen = recognition.source is RecognitionSource.PEER

        state = decide_state(
            drift_detected=drift_detected,
            self_trust=self_trust,
            confirmed_fault=confirmed_fault,
            local_case_match=local_case_match,
            peer_seen=peer_seen,
            trust_threshold=self.trust_threshold,
        )

        # --- opt-in STALE self-recovery (CLAUDE.md §4: "staleness is recoverable") -------------
        # why: the drift flag LATCHES (drift.py), so a stale node can never clear on its own — it
        # must re-baseline. We watch the ADWIN window-mean estimate return to within `recover_band`
        # sigma of the calibration mean on non-anomalous windows: the honest "my normal baseline is
        # back where I was calibrated" signal. After `recover_after` such windows in a row, we
        # recalibrate on exactly them (real recalibrate() path) -> next tick self-trust is 1.0 and
        # the node is CONFIDENT + teaching again. The recovery is COMPUTED, never scripted.
        if self._recover_after is not None:
            baseline_returned = (
                state is TrustState.STALE
                and not is_anom
                and abs(self._drift.estimation) < self._recover_band
            )
            if baseline_returned:
                self._recovery_buf.append(fv)
                if len(self._recovery_buf) >= self._recover_after:
                    self.recalibrate(list(self._recovery_buf))
                    self._recovery_buf.clear()
            else:
                self._recovery_buf.clear()  # streak broken -> baseline still shifted

        return NodeAssessment(
            node_id=self.node_id,
            tick=fv.tick,
            anomaly_score=score,
            calibrated_pvalue=pvalue,
            drift_detected=drift_detected,
            self_trust=self_trust,
            state=state,
            should_teach=state is not TrustState.STALE,  # trust-gate: STALE never teaches
            confirmed_fault=confirmed_fault,
            recognition_source=recognition.source,
            matched_signature_id=recognition.matched_signature_id,
            matched_origin_node_id=recognition.matched_origin_node_id,
            match_similarity=recognition.similarity,
        )

    def _recognize(self, fv: FeatureVector) -> RecognitionResult:
        """Resolve recognition via the L3 recognizer if wired, else the legacy bool predicates."""
        if self._recognizer is not None:
            return self._recognizer(fv)
        if self._local_match(fv):
            return RecognitionResult(RecognitionSource.SELF)
        if self._peer_seen(fv):
            return RecognitionResult(RecognitionSource.PEER)
        return RecognitionResult(RecognitionSource.NONE)

    def _self_trust(self, drift_detected: bool) -> float:
        """Confidence (0–1) that the calibration is still valid.

        # why: 1.0 while no drift; on drift it falls with how far the normal-window mean has
        # moved from the calibration mean, in calibration-sigma units. Tied to *baseline drift*,
        # never to per-window anomaly magnitude — so detecting a fault does NOT lower self-trust.
        """
        if not drift_detected:
            return 1.0
        # ADWIN's estimation is already in calibration-sigma units (we feed standardized z),
        # so it is directly "how many sigma the normal baseline has moved".
        shift = abs(self._drift.estimation)
        return float(np.clip(1.0 - shift / self.trust_k, 0.0, 1.0))
