"""L2 — ADWIN drift-conscience wrapper (river).

Detects when the node's *normal-window* score distribution has drifted away from its
calibration distribution — the signal that the conformal coverage guarantee no longer holds
and the node has gone **stale**.

river 0.25.0 API (verified via Context7 `/online-ml/river` AND introspection of the pinned
build):
  - ``from river import drift``; ``drift.ADWIN(delta=0.002, clock=32, max_buckets=5,
    min_window_length=5, grace_period=10)``
  - ``adwin.update(x)`` — feeds one value. **Returns None in 0.25.0** (older release notes say
    "returns self"; the installed version does not — hence we never chain off update()).
  - ``adwin.drift_detected`` — bool property, True on the sample a change is confirmed.
  - ``adwin.estimation`` — current window mean estimate.
  - ADWIN **auto-resets** its internal window after a detection, so we **latch** the drifted
    state until an explicit recalibration (a node stays stale until it re-baselines).
"""

from __future__ import annotations

from river import drift


class ADWINDriftDetector:
    """Latching wrapper around river's ADWIN."""

    def __init__(self, *, delta: float = 0.002) -> None:
        # delta = ADWIN's confidence parameter (lower = fewer false alarms). 0.002 is river's
        # default; left as-is and exposed for tuning per CLAUDE.md §7.
        self._delta = delta
        self._adwin = drift.ADWIN(delta=delta)
        self._drifted = False  # latched until reset()

    def update(self, value: float) -> bool:
        """Feed one value; return the (latched) drift state."""
        self._adwin.update(float(value))
        if self._adwin.drift_detected:
            self._drifted = True
        return self._drifted

    @property
    def drift_detected(self) -> bool:
        return self._drifted

    @property
    def estimation(self) -> float:
        """Current window mean estimate (used to scale how far the baseline has moved)."""
        return float(self._adwin.estimation)

    def reset(self) -> None:
        """Clear drift state and ADWIN's window (called on recalibration / recovery)."""
        self._adwin = drift.ADWIN(delta=self._delta)
        self._drifted = False
