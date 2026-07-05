"""L2 — split-conformal anomaly calibration → calibrated anomaly p-values.

We do NOT use MAPIE here. MAPIE is a *supervised* conformal library (prediction intervals /
sets, requires ``y``); it does not cover the *unsupervised one-class* anomaly setting we have
(train on healthy only; fault labels are EVAL-ONLY, CLAUDE.md §2). So we implement textbook
**split-conformal on the IsolationForest nonconformity score** over a held-out HEALTHY
calibration set (Laxhammar & Falkman, "conformal anomaly detection"). This is ~10 lines,
exact, and fully inspectable — the honest choice over forcing a tool that doesn't fit.
(MAPIE stays pinned for the RUL conformal-*regression* stretch, where it genuinely fits.)

Exchangeability: the coverage guarantee holds when calibration and live windows are
exchangeable (same operating condition). Under genuine non-exchangeable drift the guarantee
degrades — the deployment fix is Adaptive Conformal Inference (ACI) / weighted conformal. We
do not paper over this: drift is surfaced separately by L2's ADWIN drift-conscience, which
lowers self-trust → STALE rather than silently emitting invalid p-values.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class ConformalCalibrator:
    """Holds sorted healthy calibration scores and emits conformal p-values.

    Convention (matches WorkerModel): higher score == more anomalous, so a more anomalous
    window gets a *lower* p-value.
    """

    calib_scores: np.ndarray  # sorted ascending
    alpha: float = 0.05

    @classmethod
    def fit(cls, healthy_scores: np.ndarray, *, alpha: float = 0.05) -> "ConformalCalibrator":
        scores = np.asarray(healthy_scores, dtype=np.float64).ravel()
        if scores.size == 0:
            raise ValueError("need at least one calibration score")
        if not 0.0 < alpha < 1.0:
            raise ValueError("alpha must be in (0, 1)")
        return cls(calib_scores=np.sort(scores), alpha=alpha)

    @property
    def n(self) -> int:
        return int(self.calib_scores.size)

    def p_value(self, score: float) -> float:
        """Conformal p-value ``p = (1 + #{calib >= score}) / (n + 1)``.

        # why: this is the standard split-conformal anomaly p-value. Under exchangeability with
        # the healthy calibration set, p-values are ~Uniform(0,1) for healthy data, so
        # P(p <= alpha) = alpha — a *calibrated* false-alarm rate, not a hand-tuned threshold.
        """
        # #{calib >= score} = n - (index of first element >= score)
        ge = self.n - int(np.searchsorted(self.calib_scores, score, side="left"))
        return (1.0 + ge) / (self.n + 1.0)

    def is_anomalous(self, score: float) -> bool:
        """True when the window falls outside the calibrated normal region (p <= alpha)."""
        return self.p_value(score) <= self.alpha
