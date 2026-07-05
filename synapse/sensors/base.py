"""SensorSource interface + the SignalWindow / FeatureVector data contract.

This module is the single seam where simulation meets the real stack (CLAUDE.md §2):
a ``SensorSource`` yields ``SignalWindow``s; everything above consumes them. In Round 1
the only concrete source is :class:`~synapse.sensors.replay.DatasetReplaySource` (replayed
CWRU data); in Stage 2 it is :class:`~synapse.sensors.hardware.HardwareSensorSource` — and
*nothing above this layer changes*.

Data contract (supersedes the exploratory "FeatureWindow" sketch in CLAUDE.md §2/§8 — see
the dated addendum at the end of CLAUDE.md):

    SignalWindow   raw windowed multi-channel signal + provenance metadata
    FeatureVector  features extracted from a SignalWindow + the same metadata

The ground-truth ``label`` on both types is **EVAL-ONLY**: it exists so scenarios and tests
can score the fleet, and must never be fed into detection (L1) or gossiped (L4).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterator

import numpy as np

# The fixed channel set. CWRU is vibration-only, but current/temp stay in the schema so the
# Stage-2 HardwareSensorSource (INA219 current, DS18B20 temperature) fills the *identical*
# shape — this is the "only the SensorSource changes" principle made concrete (CLAUDE.md §2).
CHANNELS: tuple[str, ...] = ("vibration", "current", "temp")


@dataclass(eq=False)
class SignalWindow:
    """One window of raw, multi-channel sensor data plus provenance metadata.

    Attributes:
        node_id:  which fleet node produced this window (e.g. ``"A"``).
        tick:     monotonic 0-based window index within a run. Drives determinism.
        fs:       sample rate of the channel arrays, in Hz.
        channels: maps channel name -> 1-D float array, or ``None`` if this source lacks the
                  channel. Keys are drawn from :data:`CHANNELS`.
        label:    ground-truth fault class for **EVAL ONLY** (e.g. ``"healthy"``,
                  ``"inner_race"``). Never fed to detection. ``None`` when unknown.
    """

    node_id: str
    tick: int
    fs: float
    channels: dict[str, np.ndarray | None]
    label: str | None = None

    @property
    def vibration(self) -> np.ndarray:
        """Convenience accessor for the primary channel (raises if absent)."""
        v = self.channels.get("vibration")
        if v is None:
            raise KeyError("SignalWindow has no 'vibration' channel")
        return v

    # why: dataclasses auto-generate __eq__ as a field-tuple comparison, which raises
    # "truth value of an array is ambiguous" once a field holds a numpy array. We define a
    # numpy-aware equality so tests (determinism) can compare windows with `==` safely.
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, SignalWindow):
            return NotImplemented
        if (self.node_id, self.tick, self.fs, self.label) != (
            other.node_id,
            other.tick,
            other.fs,
            other.label,
        ):
            return False
        if self.channels.keys() != other.channels.keys():
            return False
        for key in self.channels:
            a, b = self.channels[key], other.channels[key]
            if a is None or b is None:
                if a is not b:  # exactly one is None
                    return False
            elif not np.array_equal(a, b):
                return False
        return True

    __hash__ = None  # type: ignore[assignment]  # mutable + array-bearing -> unhashable


@dataclass(eq=False)
class FeatureVector:
    """Features extracted from a :class:`SignalWindow`, carrying the same metadata.

    ``values`` is a 1-D float array aligned 1:1 with ``names``. Feature values and the
    eval-only ``label`` are kept structurally separate so the label can never leak into a
    detector that consumes ``values``.
    """

    node_id: str
    tick: int
    label: str | None
    names: tuple[str, ...]
    values: np.ndarray

    def as_dict(self) -> dict[str, float]:
        """Return ``{feature_name: value}`` (convenient for inspection/tests)."""
        return {n: float(v) for n, v in zip(self.names, self.values)}

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, FeatureVector):
            return NotImplemented
        return (
            (self.node_id, self.tick, self.label) == (other.node_id, other.tick, other.label)
            and self.names == other.names
            and np.array_equal(self.values, other.values)
        )

    __hash__ = None  # type: ignore[assignment]


class SensorSource(ABC):
    """Abstract source of :class:`SignalWindow`s — the only simulated boundary (CLAUDE.md §2).

    Concrete sources implement :meth:`next_window`. The source is iterable: iterating drains
    its configured track and stops (``StopIteration``) when exhausted.
    """

    @abstractmethod
    def next_window(self) -> SignalWindow:
        """Return the next window; raise ``StopIteration`` when the track is exhausted."""
        raise NotImplementedError

    def __iter__(self) -> Iterator[SignalWindow]:
        return self

    def __next__(self) -> SignalWindow:
        return self.next_window()
