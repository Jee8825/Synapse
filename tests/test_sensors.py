"""Behavioral tests for the sensor layer: windowing + deterministic replay.

These prove behavior (determinism, count, ordering, the healthy->fault switch), not just
that the code imports. No dataset or network needed — signals are generated in-process.
"""

from __future__ import annotations

import numpy as np
import pytest

from synapse.sensors.base import SensorSource, SignalWindow
from synapse.sensors.replay import DatasetReplaySource
from synapse.sensors.windowing import segment


def _ramp(n: int) -> np.ndarray:
    """A signal whose every sample is distinct, so windows are trivially distinguishable."""
    return np.arange(n, dtype=np.float64)


# --------------------------------------------------------------------------- windowing


def test_segment_count_shape_and_overlap() -> None:
    sig = _ramp(1000)
    w, hop = 100, 50
    windows = segment(sig, window_size=w, hop=hop)
    expected_n = 1 + (1000 - w) // hop
    assert windows.shape == (expected_n, w)
    # Window i must start exactly at i*hop (overlap is exact, not approximate).
    for i in range(expected_n):
        assert np.array_equal(windows[i], sig[i * hop : i * hop + w])


def test_segment_drops_partial_trailing_window() -> None:
    # 250 samples, window 100, hop 100 -> windows at [0:100],[100:200]; trailing 50 dropped.
    windows = segment(_ramp(250), window_size=100, hop=100)
    assert windows.shape == (2, 100)


def test_segment_shorter_than_window_is_empty() -> None:
    windows = segment(_ramp(50), window_size=100, hop=10)
    assert windows.shape == (0, 100)


# --------------------------------------------------------------------------- replay


def _source(**overrides) -> DatasetReplaySource:
    cfg = dict(
        node_id="A",
        fs=1000.0,
        healthy_signal=_ramp(5000),
        fault_signal=_ramp(5000) + 10_000.0,  # disjoint values -> healthy/fault easily told apart
        switch_tick=4,
        n_ticks=8,
        window_size=256,
        hop=128,
        seed=7,
        selection="sampled",
    )
    cfg.update(overrides)
    return DatasetReplaySource(**cfg)


def test_is_sensor_source_and_iterable() -> None:
    src = _source()
    assert isinstance(src, SensorSource)
    windows = list(src)
    assert all(isinstance(w, SignalWindow) for w in windows)


def test_replay_count_and_tick_ordering() -> None:
    windows = list(_source(n_ticks=10))
    assert len(windows) == 10
    assert [w.tick for w in windows] == list(range(10))


def test_replay_raises_stopiteration_when_exhausted() -> None:
    src = _source(n_ticks=2)
    src.next_window()
    src.next_window()
    with pytest.raises(StopIteration):
        src.next_window()


def test_replay_determinism_same_seed_identical_sequence() -> None:
    # Same seed + config -> byte-for-byte identical window sequence (the core guarantee).
    a = list(_source(seed=123))
    b = list(_source(seed=123))
    assert a == b  # uses numpy-aware SignalWindow.__eq__


def test_replay_different_seed_changes_sampled_order() -> None:
    a = list(_source(seed=1))
    b = list(_source(seed=2))
    # With sampled selection, a different seed should change at least one drawn window.
    assert a != b


def test_healthy_to_fault_switch_at_tick() -> None:
    windows = list(_source(switch_tick=4, n_ticks=8))
    labels = [w.label for w in windows]
    assert labels[:4] == ["healthy"] * 4
    assert labels[4:] == ["fault"] * 4
    # Sanity: fault windows carry the disjoint (>=10000) value range.
    assert windows[0].vibration.max() < 10_000.0
    assert windows[4].vibration.min() >= 10_000.0


def test_sequential_selection_cycles_pool_in_order() -> None:
    # Healthy-only, sequential: tick t must equal healthy window (t mod pool_size), in order.
    src = DatasetReplaySource(
        node_id="A", fs=1000.0, healthy_signal=_ramp(2000),
        n_ticks=6, window_size=500, hop=500, selection="sequential",
    )
    pool = segment(_ramp(2000), window_size=500, hop=500)  # 4 windows
    for t, window in enumerate(src):
        assert np.array_equal(window.vibration, pool[t % pool.shape[0]])


def test_channels_carry_full_schema_with_nulls() -> None:
    window = _source().next_window()
    assert set(window.channels) == {"vibration", "current", "temp"}
    assert window.channels["current"] is None  # CWRU has no current/temp; schema kept for Stage 2
    assert window.channels["temp"] is None


def test_switch_tick_requires_fault_signal() -> None:
    with pytest.raises(ValueError):
        DatasetReplaySource(
            node_id="A", fs=1000.0, healthy_signal=_ramp(2000),
            n_ticks=4, switch_tick=2,  # no fault_signal
        )
