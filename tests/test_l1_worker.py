"""L1 WorkerModel tests — separation, score convention, determinism, persistence.

Labels are EVAL-ONLY: used here only to *measure* detection quality (AUC), never fed to fit.
"""

from __future__ import annotations

from dataclasses import replace

import numpy as np
import pytest
from sklearn.metrics import roc_auc_score

from synapse.l1_worker.detector import WorkerModel
from tests._helpers import cwru_available, healthy_fault_fvs


def test_l1_separates_healthy_from_fault() -> None:
    healthy, fault = healthy_fault_fvs()
    n_train = int(len(healthy) * 0.6)
    train, healthy_test = healthy[:n_train], healthy[n_train:]

    model = WorkerModel(random_state=0).fit(train)
    h_scores = model.score_many(healthy_test)
    f_scores = model.score_many(fault)

    y = np.r_[np.zeros(len(h_scores)), np.ones(len(f_scores))]
    auc = roc_auc_score(y, np.r_[h_scores, f_scores])
    print(
        f"[L1] source={'CWRU' if cwru_available() else 'synthetic'} "
        f"AUC={auc:.3f} healthy_mean={h_scores.mean():.4f} fault_mean={f_scores.mean():.4f}"
    )
    assert f_scores.mean() > h_scores.mean()  # higher score == more anomalous
    assert auc > 0.8


def test_scores_are_deterministic_with_seed() -> None:
    healthy, fault = healthy_fault_fvs()
    s1 = WorkerModel(random_state=0).fit(healthy[:30]).score_many(fault)
    s2 = WorkerModel(random_state=0).fit(healthy[:30]).score_many(fault)
    assert np.array_equal(s1, s2)


def test_feature_order_mismatch_is_rejected() -> None:
    healthy, _ = healthy_fault_fvs()
    model = WorkerModel(random_state=0).fit(healthy[:20])
    scrambled = replace(healthy[0], names=tuple(reversed(healthy[0].names)))
    with pytest.raises(ValueError):
        model.score(scrambled)


def test_unfitted_model_raises() -> None:
    healthy, _ = healthy_fault_fvs()
    with pytest.raises(RuntimeError):
        WorkerModel().score(healthy[0])


def test_save_load_roundtrip(tmp_path) -> None:
    healthy, fault = healthy_fault_fvs()
    model = WorkerModel(random_state=0).fit(healthy[:30])
    path = tmp_path / "baseline.joblib"
    model.save(path)
    loaded = WorkerModel.load(path)
    assert loaded.feature_names == model.feature_names
    assert np.array_equal(model.score_many(fault), loaded.score_many(fault))
