"""Deterministic FeatureVector sources for scenarios — real CWRU replay + synthetic drift.

Orchestration data layer: reuses the FROZEN extractor (`features.extract`) and windowing. CWRU
files drive healthy/fault timelines; drift (which has no labelled CWRU recording) is a seeded
synthetic gradual baseline shift — the same mechanism the L2 drift-conscience was validated on.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from synapse.features.extract import extract
from synapse.sensors.base import FeatureVector, SignalWindow
from synapse.sensors.windowing import segment

FS = 12_000.0
WINDOW = 2048
_CWRU = Path(__file__).resolve().parent.parent.parent / "data" / "cwru"

# shaft rate (Hz) per CWRU file, from its motor load (rpm/60): 0hp=1797, 2hp=1750.
SHAFT_HZ_BY_FILE = {
    "normal": 29.95, "inner_race": 29.95, "ball": 29.95, "outer_race": 29.95,
    "normal_2hp": 29.17, "inner_race_2hp": 29.17,
    "outer_race_2hp": 29.17, "outer_race_3clock": 29.95,
}


def cwru_available(*names: str) -> bool:
    return all((_CWRU / f"{n}.mat").exists() for n in names)


def _load_de(name: str) -> np.ndarray:
    from scipy import io as sio

    mat = sio.loadmat(str(_CWRU / f"{name}.mat"))
    key = next(k for k in mat if k.endswith("_DE_time"))
    return np.asarray(mat[key], dtype=np.float64).ravel()


def _fv(win: np.ndarray, tick: int, label: str, node_id: str, shaft_hz: float | None) -> FeatureVector:
    sw = SignalWindow(node_id=node_id, tick=tick, fs=FS,
                      channels={"vibration": np.asarray(win, float), "current": None, "temp": None},
                      label=label)
    return extract(sw, fft_bands=5, shaft_hz=shaft_hz)


def cwru_fvs(name: str, *, node_id: str = "?", limit: int | None = None) -> list[FeatureVector]:
    """Windowed FeatureVectors from a CWRU recording, with that file's real shaft_hz."""
    shaft = SHAFT_HZ_BY_FILE[name]
    wins = segment(_load_de(name), WINDOW, WINDOW)
    out = [_fv(w, i, name, node_id, shaft) for i, w in enumerate(wins)]
    return out[:limit] if limit else out


# --- synthetic healthy + gradual drift (no CWRU drift recording exists) -------------------


def _synthetic_window(rng: np.random.Generator, noise: float) -> np.ndarray:
    t = np.arange(WINDOW) / FS
    return (rng.uniform(0.45, 0.55) * np.sin(2 * np.pi * rng.uniform(58, 62) * t)
            + noise * rng.standard_normal(WINDOW))


def synthetic_healthy_fvs(n: int, *, node_id: str = "?", seed: int = 0) -> list[FeatureVector]:
    """Healthy windows with a realistic operating envelope (for a drift node's calibration).

    # why: shaft_hz=None -> defect-frequency features are zero. A baseline-DRIFT node has no
    # bearing-defect content; computing defect features on it only dilutes the drift signal the
    # ADWIN conscience watches (this matches the L2 drift dynamics the conscience was tuned on).
    """
    rng = np.random.default_rng(seed)
    return [_fv(_synthetic_window(rng, rng.uniform(0.04, 0.06)), i, "healthy", node_id, None)
            for i in range(n)]


def synthetic_drift_fvs(
    n: int, *, node_id: str = "?", seed: int = 1, ramp: int = 6, plateau: float = 0.010,
) -> list[FeatureVector]:
    """Gradual baseline drift: noise floor ramps in then holds at `plateau`.

    # why: a sustained shift of the NORMAL baseline (not a clean fault) is what trips ADWIN ->
    # STALE. Ramp-then-plateau keeps elevated-but-normal windows feeding the staleness stream;
    # this is the exact drift the L2 conscience was validated against (plateau 0.010).
    """
    rng = np.random.default_rng(seed)
    out = []
    for i in range(n):
        sev = plateau * min(1.0, (i + 1) / ramp)
        out.append(_fv(_synthetic_window(rng, 0.05 + sev), i, "drift", node_id, None))
    return out
