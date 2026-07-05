"""L1 worker model — IsolationForest anomaly detector (single node).

Each node trains its OWN model on its OWN healthy windows (federated: no shared training
data ever leaves a node). The model scores incoming windows; L2 decides whether the node can
be *trusted* to act on those scores.

# why: IsolationForest is the right L1 primitive — unsupervised (we have only healthy data;
# fault labels are EVAL-ONLY, CLAUDE.md §2), lightweight (<5 ms/window, ~tens of MB),
# train-fast on a small healthy set, and produces an inspectable real-valued score. Maps to
# ISO 13374 / OSA-CBM state-detection + health-assessment.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

from synapse.sensors.base import FeatureVector


class WorkerModel:
    """IsolationForest over ``FeatureVector.values``. Higher score == more anomalous."""

    def __init__(
        self,
        *,
        n_estimators: int = 200,
        max_samples: str | int = "auto",
        contamination: str | float = "auto",
        random_state: int = 0,
    ) -> None:
        # random_state pinned for determinism (CLAUDE.md §6/§10).
        self._params = dict(
            n_estimators=n_estimators,
            max_samples=max_samples,
            contamination=contamination,
            random_state=random_state,
        )
        self._model: IsolationForest | None = None
        self._feature_names: tuple[str, ...] | None = None

    @property
    def is_fitted(self) -> bool:
        return self._model is not None

    @property
    def feature_names(self) -> tuple[str, ...] | None:
        return self._feature_names

    def fit(self, healthy: Sequence[FeatureVector]) -> "WorkerModel":
        """Train on healthy FeatureVectors. Uses ``.values`` ONLY — never ``.label``."""
        if len(healthy) == 0:
            raise ValueError("cannot fit on an empty healthy set")
        self._feature_names = healthy[0].names
        X = self._stack(healthy)
        # NOTE: y is intentionally never passed — labels are EVAL-ONLY (CLAUDE.md §2).
        self._model = IsolationForest(**self._params).fit(X)
        return self

    def score(self, fv: FeatureVector) -> float:
        """Anomaly score for one window. Convention: **higher == more anomalous**.

        # why: sklearn's ``score_samples`` returns higher == more *normal*, so we negate it to
        # get an intuitive "bigger = worse" nonconformity score that L2's conformal layer and
        # ADWIN both consume directly.
        """
        return float(self.score_many([fv])[0])

    def score_many(self, fvs: Sequence[FeatureVector]) -> np.ndarray:
        self._check_fitted()
        X = self._stack(fvs)
        return -self._model.score_samples(X)  # type: ignore[union-attr]

    def _stack(self, fvs: Sequence[FeatureVector]) -> np.ndarray:
        if self._feature_names is not None:
            for fv in fvs:
                # why: feature order must be identical to training; a reordered/renamed vector
                # would silently corrupt scores, so we fail loud instead.
                if fv.names != self._feature_names:
                    raise ValueError(
                        "FeatureVector names do not match the trained model's feature order"
                    )
        return np.vstack([np.asarray(fv.values, dtype=np.float64) for fv in fvs])

    def _check_fitted(self) -> None:
        if self._model is None:
            raise RuntimeError("WorkerModel is not fitted; call fit() first")

    # --- persistence: each node saves/loads its own baseline -------------------------------

    def save(self, path: str | Path) -> None:
        self._check_fitted()
        joblib.dump(
            {"model": self._model, "params": self._params, "feature_names": self._feature_names},
            Path(path),
        )

    @classmethod
    def load(cls, path: str | Path) -> "WorkerModel":
        blob = joblib.load(Path(path))
        obj = cls(**blob["params"])
        obj._model = blob["model"]
        obj._feature_names = blob["feature_names"]
        return obj
