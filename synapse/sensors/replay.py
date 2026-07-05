"""DatasetReplaySource — deterministic replay of recorded windows (Round 1).

Replays a configured, ordered track of :class:`~synapse.sensors.base.SignalWindow`s drawn
from one or two pre-loaded signals (a healthy condition and, optionally, a fault condition
that the track switches to at a fixed tick). The source only yields a configured track in
order — *timing and cross-node orchestration live in the scenario layer*, not here
(CLAUDE.md §6/§12).

Determinism (CLAUDE.md §6/§10): given the same config + ``seed``, the emitted sequence of
windows is byte-for-byte identical. Two sources built with the same seed/switch produce the
*same premature signature at the same tick* — exactly what the batch-defect scenario needs.
"""

from __future__ import annotations

import numpy as np

from .base import SensorSource, SignalWindow
from .windowing import segment


class DatasetReplaySource(SensorSource):
    """Yield ``n_ticks`` SignalWindows, switching healthy -> fault at ``switch_tick``.

    Args:
        node_id:       node label stamped on every window (e.g. ``"A"``).
        fs:            sample rate (Hz) of the supplied signals.
        healthy_signal: 1-D raw signal for the healthy condition.
        fault_signal:  1-D raw signal for the fault condition. Required iff ``switch_tick``
                       is set; rejected otherwise (ambiguous).
        switch_tick:   tick at which the track switches to the fault condition. ``None`` =>
                       healthy for the whole run.
        n_ticks:       number of windows to emit before the source is exhausted.
        window_size:   samples per window.
        hop:           step between window starts (``window_size`` => non-overlapping).
        seed:          seeds the RNG used by ``selection="sampled"`` (ignored when
                       ``"sequential"``, which is already deterministic).
        selection:     ``"sequential"`` cycles each condition's window pool in dataset order;
                       ``"sampled"`` draws windows from the pool via the seeded RNG.
        healthy_label / fault_label: eval-only ground-truth labels for each condition.
    """

    def __init__(
        self,
        *,
        node_id: str,
        fs: float,
        healthy_signal: np.ndarray,
        n_ticks: int,
        fault_signal: np.ndarray | None = None,
        switch_tick: int | None = None,
        window_size: int = 2048,
        hop: int = 1024,
        seed: int = 0,
        selection: str = "sequential",
        healthy_label: str = "healthy",
        fault_label: str = "fault",
    ) -> None:
        if selection not in ("sequential", "sampled"):
            raise ValueError(f"selection must be 'sequential' or 'sampled', got {selection!r}")
        if n_ticks < 0:
            raise ValueError("n_ticks must be >= 0")
        if switch_tick is not None:
            if fault_signal is None:
                raise ValueError("switch_tick set but no fault_signal provided")
            if switch_tick < 0:
                raise ValueError("switch_tick must be >= 0")
        elif fault_signal is not None:
            raise ValueError("fault_signal provided but switch_tick is None (ambiguous)")

        self.node_id = node_id
        self.fs = float(fs)
        self.n_ticks = int(n_ticks)
        self.switch_tick = switch_tick
        self.selection = selection

        # Pre-window each condition once (# why: windowing is fixed work; doing it up front
        # keeps next_window() O(1) and the emitted order obviously deterministic).
        self._pools: dict[str, np.ndarray] = {
            healthy_label: segment(healthy_signal, window_size, hop)
        }
        self._labels = {"healthy": healthy_label, "fault": fault_label}
        if self._pools[healthy_label].shape[0] == 0:
            raise ValueError("healthy_signal is shorter than one window")
        if fault_signal is not None:
            self._pools[fault_label] = segment(fault_signal, window_size, hop)
            if self._pools[fault_label].shape[0] == 0:
                raise ValueError("fault_signal is shorter than one window")

        self._rng = np.random.default_rng(seed)
        self._tick = 0
        self._cursors: dict[str, int] = {k: 0 for k in self._pools}  # sequential cursors

    def _condition_label(self, tick: int) -> str:
        if self.switch_tick is not None and tick >= self.switch_tick:
            return self._labels["fault"]
        return self._labels["healthy"]

    def next_window(self) -> SignalWindow:
        if self._tick >= self.n_ticks:
            raise StopIteration

        tick = self._tick
        label = self._condition_label(tick)
        pool = self._pools[label]

        if self.selection == "sequential":
            idx = self._cursors[label] % pool.shape[0]
            self._cursors[label] += 1
        else:  # "sampled"
            idx = int(self._rng.integers(pool.shape[0]))

        # .copy() so downstream mutation can't corrupt the shared pool.
        vibration = pool[idx].copy()
        window = SignalWindow(
            node_id=self.node_id,
            tick=tick,
            fs=self.fs,
            # current/temp are None for CWRU but stay in the schema for the Stage-2 swap.
            channels={"vibration": vibration, "current": None, "temp": None},
            label=label,
        )
        self._tick += 1
        return window
