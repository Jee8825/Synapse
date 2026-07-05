"""End-to-end smoke test for the data path: replay -> window -> extract (one node).

Proves the Day 1-2 pipeline runs together. Uses real CWRU data if present under
``data/cwru/``; otherwise falls back to a clearly-labelled SYNTHETIC vibration signal so the
pipeline is always demonstrable without the download. Prints the FeatureVector names, shape,
and a few values per tick.

Run:
    python scripts/smoke_test.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make the repo root importable when run directly as `python scripts/smoke_test.py`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np  # noqa: E402

from synapse.features.extract import extract  # noqa: E402
from synapse.sensors.replay import DatasetReplaySource  # noqa: E402

FS = 12_000.0  # CWRU 12 kHz drive-end sample rate
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "cwru"


def _load_cwru_signal(path: Path) -> np.ndarray:
    """Return the drive-end (``*_DE_time``) signal from a CWRU .mat file, flattened to 1-D."""
    from scipy import io as sio

    mat = sio.loadmat(str(path))
    key = next(k for k in mat if k.endswith("_DE_time"))
    return np.asarray(mat[key], dtype=np.float64).ravel()


def _synthetic(kind: str) -> np.ndarray:
    """Deterministic stand-in vibration signal (healthy = tone+noise; fault = + impulses)."""
    rng = np.random.default_rng(0 if kind == "healthy" else 1)
    n = 60_000
    t = np.arange(n) / FS
    base = 0.5 * np.sin(2 * np.pi * 60.0 * t) + 0.05 * rng.standard_normal(n)
    if kind == "healthy":
        return base
    # Fault: periodic impulsive bursts (what a developing bearing defect injects).
    impulses = np.zeros(n)
    impulses[:: 400] = 1.0
    return base + 0.8 * impulses * rng.standard_normal(n)


def main() -> int:
    normal = DATA_DIR / "normal.mat"
    fault = DATA_DIR / "inner_race.mat"
    if normal.exists() and fault.exists():
        print(f"[smoke] using REAL CWRU data from {DATA_DIR}")
        healthy_signal = _load_cwru_signal(normal)
        fault_signal = _load_cwru_signal(fault)
    else:
        print("[smoke] CWRU data not found -> using SYNTHETIC signals "
              "(run scripts/download_data.py for the real subset)")
        healthy_signal = _synthetic("healthy")
        fault_signal = _synthetic("fault")

    source = DatasetReplaySource(
        node_id="A",
        fs=FS,
        healthy_signal=healthy_signal,
        fault_signal=fault_signal,
        switch_tick=3,          # ticks 0-2 healthy, 3+ fault
        n_ticks=6,
        window_size=2048,
        hop=1024,
        seed=42,
    )

    print(f"[smoke] replaying {source.n_ticks} windows (switch -> fault at tick {source.switch_tick})\n")
    names_printed = False
    for window in source:
        fv = extract(window, fft_bands=5)
        if not names_printed:
            print(f"feature names ({len(fv.names)}): {fv.names}")
            print(f"feature-vector shape: {fv.values.shape}\n")
            names_printed = True
        preview = {k: round(v, 4) for k, v in list(fv.as_dict().items())[:4]}
        print(f"tick={fv.tick} label={fv.label:<10} sample features {preview}")

    print("\n[smoke] OK — replay -> window -> extract pipeline ran end to end.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
