"""Shared test/demo helpers — build FeatureVectors from real CWRU (if present) or synthetic.

Underscore-prefixed so pytest does not collect it as a test module.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from synapse.features.extract import extract
from synapse.sensors.base import FeatureVector, SignalWindow
from synapse.sensors.windowing import segment

FS = 12_000.0
WINDOW = 2048
_CWRU = Path(__file__).resolve().parent.parent / "data" / "cwru"


def cwru_available() -> bool:
    return (_CWRU / "normal.mat").exists() and (_CWRU / "inner_race.mat").exists()


def cwru_present(*names: str) -> bool:
    return all((_CWRU / f"{n}.mat").exists() for n in names)


def cwru_fvs(name: str, *, node_id: str = "A", limit: int | None = None) -> list[FeatureVector]:
    """FeatureVectors windowed from a named CWRU recording, with that file's real shaft_hz."""
    shaft_hz = SHAFT_HZ_BY_FILE[name]  # KeyError if unmapped -> never silently zero-fill defects
    fvs = _fvs_from_signal(_load_de(_CWRU / f"{name}.mat"), name, node_id=node_id, shaft_hz=shaft_hz)
    return fvs[:limit] if limit else fvs


def _load_de(path: Path) -> np.ndarray:
    from scipy import io as sio

    mat = sio.loadmat(str(path))
    key = next(k for k in mat if k.endswith("_DE_time"))
    return np.asarray(mat[key], dtype=np.float64).ravel()


# shaft rate (Hz) per CWRU file, from its motor load (rpm/60): 0hp=1797, 2hp=1750.
SHAFT_HZ_BY_FILE = {
    "normal": 29.95, "inner_race": 29.95, "ball": 29.95, "outer_race": 29.95,
    "normal_2hp": 29.17, "inner_race_2hp": 29.17,
    "outer_race_2hp": 29.17, "outer_race_3clock": 29.95,
}


def fv_from_window(
    win: np.ndarray, tick: int, label: str, node_id: str = "A", *, shaft_hz: float | None = None
) -> FeatureVector:
    sw = SignalWindow(
        node_id=node_id,
        tick=tick,
        fs=FS,
        channels={"vibration": np.asarray(win, dtype=np.float64), "current": None, "temp": None},
        label=label,
    )
    return extract(sw, fft_bands=5, shaft_hz=shaft_hz)


def _fvs_from_signal(
    signal: np.ndarray, label: str, node_id: str = "A", *, shaft_hz: float | None = None
) -> list[FeatureVector]:
    # non-overlapping windows -> better exchangeability for the conformal coverage check.
    wins = segment(signal, WINDOW, WINDOW)
    return [fv_from_window(w, i, label, node_id, shaft_hz=shaft_hz) for i, w in enumerate(wins)]


def healthy_fault_fvs() -> tuple[list[FeatureVector], list[FeatureVector]]:
    """(healthy, fault) FeatureVectors — real CWRU if present, else deterministic synthetic."""
    if cwru_available():
        return (
            _fvs_from_signal(_load_de(_CWRU / "normal.mat"), "healthy"),
            _fvs_from_signal(_load_de(_CWRU / "inner_race.mat"), "inner_race"),
        )
    rng = np.random.default_rng(0)
    n = WINDOW * 60
    healthy = _healthy_signal(rng, n)
    imp = np.zeros(n)
    imp[::400] = 1.0
    fault = healthy + 1.2 * imp * rng.standard_normal(n)
    return _fvs_from_signal(healthy, "healthy"), _fvs_from_signal(fault, "fault")


# --- controlled synthetic generators for L2 stream tests ----------------------------------


def _signal(rng: np.random.Generator, amp: float, freq: float, noise: float) -> np.ndarray:
    t = np.arange(WINDOW) / FS
    return amp * np.sin(2 * np.pi * freq * t) + noise * rng.standard_normal(WINDOW)


def healthy_window(rng: np.random.Generator) -> np.ndarray:
    """A healthy window with realistic operating-envelope spread (amp/freq/noise jitter).

    # why: a too-clean baseline gives the detector a razor-thin normal region where ANY change
    # reads as a fault. A healthy envelope leaves room for a genuine *baseline drift* that rides
    # the upper-normal tail — which is what staleness (vs a fault) looks like.
    """
    return _signal(rng, rng.uniform(0.45, 0.55), rng.uniform(58.0, 62.0), rng.uniform(0.04, 0.06))


def fault_window(rng: np.random.Generator) -> np.ndarray:
    """Strongly impulsive window -> clearly anomalous (p <= alpha) vs a healthy-trained model."""
    base = _signal(rng, 0.5, 60.0, 0.05)
    imp = np.zeros(WINDOW)
    imp[::128] = 1.0
    return base + 2.0 * imp * rng.standard_normal(WINDOW)


def drift_window(rng: np.random.Generator, severity: float) -> np.ndarray:
    """Normal-baseline noise floor raised by `severity` — a shift in the NORMAL baseline."""
    return _signal(rng, 0.5, 60.0, 0.05 + severity)


def many_healthy_fvs(n: int, *, seed: int = 0) -> list[FeatureVector]:
    rng = np.random.default_rng(seed)
    return [fv_from_window(healthy_window(rng), i, "healthy") for i in range(n)]


def fault_stream_fvs(n: int, *, seed: int = 1, start_tick: int = 0) -> list[FeatureVector]:
    rng = np.random.default_rng(seed)
    return [fv_from_window(fault_window(rng), start_tick + i, "fault") for i in range(n)]


def gradual_drift_fvs(
    n: int, *, seed: int = 2, start_tick: int = 0, plateau: float = 0.010, ramp: int = 30
) -> list[FeatureVector]:
    """Drift that ramps the noise floor in over `ramp` windows then HOLDS at `plateau`.

    # why: a pure ever-increasing ramp pushes windows past alpha (excluded as faults) before
    # ADWIN can confirm; a sustained plateau keeps a stream of elevated-but-normal windows
    # feeding ADWIN, which is what a genuine sustained baseline drift looks like.
    """
    rng = np.random.default_rng(seed)
    out = []
    for i in range(n):
        severity = plateau * min(1.0, (i + 1) / ramp)
        out.append(fv_from_window(drift_window(rng, severity), start_tick + i, "drift"))
    return out
