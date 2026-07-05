"""Fixed-length overlapping windowing of a raw 1-D signal (CLAUDE.md §12, task 6).

Turning a long recorded signal into uniform windows is upstream of both the replay source
and feature extraction, so it lives in ``sensors/`` as a small pure helper.
"""

from __future__ import annotations

import numpy as np


def segment(signal: np.ndarray, window_size: int, hop: int) -> np.ndarray:
    """Slice a 1-D ``signal`` into overlapping windows.

    Args:
        signal:      1-D array (anything array-like; flattened to 1-D, cast to float64).
        window_size: samples per window (> 0).
        hop:         step between consecutive window starts (> 0). ``hop == window_size``
                     gives non-overlapping windows; ``hop < window_size`` overlaps them.

    Returns:
        Array of shape ``(n_windows, window_size)`` where
        ``n_windows = 1 + (len(signal) - window_size) // hop`` (0 if the signal is shorter
        than one window).

    Trailing samples that cannot fill a full window are dropped.
    # why: a partial last window would have a different length and would bias time- and
    # frequency-domain features (RMS, FFT band energies) relative to full windows.
    """
    if window_size <= 0 or hop <= 0:
        raise ValueError("window_size and hop must be positive")

    sig = np.asarray(signal, dtype=np.float64).ravel()
    n = sig.shape[0]
    if n < window_size:
        return np.empty((0, window_size), dtype=np.float64)

    n_windows = 1 + (n - window_size) // hop
    # why: an explicit index grid (n_windows × window_size) yields an owned copy — clearer and
    # safer than as_strided views, at negligible cost for our window counts.
    idx = np.arange(window_size)[None, :] + hop * np.arange(n_windows)[:, None]
    return sig[idx]
