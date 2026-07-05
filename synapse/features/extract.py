"""Feature extraction: SignalWindow -> FeatureVector (CLAUDE.md §12, Days 1-2).

Computes time-domain and FFT-band-energy features on the vibration channel. These features
are the compact representation L1 scores and L3 stores as fault signatures. Every feature
carries a ``# why:`` note on its diagnostic rationale — those rationales get challenged in
jury Q&A (CLAUDE.md §10), so they live next to the code that produces them.

Round 1 is vibration-only (CWRU). current/temp channels, when present in Stage 2, can add
their own features later without changing this contract.
"""

from __future__ import annotations

import numpy as np
from scipy import signal, stats

from synapse import config
from synapse.sensors.base import FeatureVector, SignalWindow

# Tiny floor to keep ratio features finite on (near-)silent windows.
_EPS = 1e-12

# Order of the names appended by _defect_frequency_features (kept in sync with that function).
_DEFECT_NAMES = (
    "env_bpfo", "env_bpfi", "env_bsf", "env_bpfo_h2", "env_bpfi_h2", "env_bpfi_sidebands",
)
N_DEFECT_FEATURES = len(_DEFECT_NAMES)


def _fft_band_energies(x: np.ndarray, fs: float, n_bands: int) -> np.ndarray:
    """Sum one-sided power-spectrum energy into ``n_bands`` equal-width bands over [0, fs/2].

    # why: bearing defects redistribute spectral energy (defect frequencies + their harmonics
    # and sidebands). Coarse band energies localize *where* energy sits and how it migrates as
    # a fault develops, without needing bearing geometry to compute exact defect frequencies —
    # and they stay low-dimensional and explainable for L1.
    """
    n = x.shape[0]
    power = np.abs(np.fft.rfft(x)) ** 2  # one-sided power spectrum
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    edges = np.linspace(0.0, fs / 2.0, n_bands + 1)
    # Assign each frequency bin to a band; clip so the Nyquist bin lands in the last band.
    band_idx = np.clip(np.searchsorted(edges, freqs, side="right") - 1, 0, n_bands - 1)
    return np.bincount(band_idx, weights=power, minlength=n_bands).astype(np.float64)


def _defect_frequency_features(x: np.ndarray, fs: float, shaft_hz: float | None) -> np.ndarray:
    """Envelope-spectrum energy at the bearing defect frequencies (relative to shaft speed).

    Returns ``N_DEFECT_FEATURES`` fractions of total envelope-spectrum energy, or all zeros when
    ``shaft_hz`` is unknown. Each fraction is amplitude- and load-invariant (it normalizes out
    overall energy), which is what makes the diagnosis comparable across machines and loads.

    Pipeline: band-pass to the bearing-resonance band -> Hilbert envelope -> rfft -> read the
    energy in a +/- tolerance window at each defect frequency.
    # why: a bearing fault excites a high-frequency structural resonance that is amplitude-
    # MODULATED at the defect frequency, so the discriminating signal lives in the envelope, not
    # the raw spectrum. Inner-race energy concentrates at BPFI (and, because the defect rotates
    # through the load zone, at shaft-rate SIDEBANDS BPFI +/- fr); outer-race energy sits at BPFO
    # with no shaft-rate sidebands (the defect is stationary). That asymmetry is the IR-vs-OR tell.
    """
    if shaft_hz is None or shaft_hz <= 0:
        return np.zeros(N_DEFECT_FEATURES, dtype=np.float64)

    n = x.shape[0]
    lo, hi = config.DEFECT_BAND
    hi = min(hi, 0.99 * fs / 2.0)
    if lo >= hi or n < 32:
        return np.zeros(N_DEFECT_FEATURES, dtype=np.float64)

    sos = signal.butter(4, [lo, hi], btype="band", fs=fs, output="sos")
    envelope = np.abs(signal.hilbert(signal.sosfiltfilt(sos, x)))
    envelope = envelope - envelope.mean()  # drop the DC term so it can't dominate the total
    power = np.abs(np.fft.rfft(envelope)) ** 2
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    total = float(power[1:].sum()) + _EPS
    tol = config.DEFECT_BAND_TOL_BINS * (fs / n)  # +/- tolerance computed from THIS node's bins

    def energy_at(fc: float) -> float:
        return float(power[(freqs >= fc - tol) & (freqs <= fc + tol)].sum()) / total

    bpfo = config.BPFO_MULT * shaft_hz
    bpfi = config.BPFI_MULT * shaft_hz
    bsf = config.BSF_MULT * shaft_hz
    return np.array([
        energy_at(bpfo),                                  # env_bpfo  -> outer race
        energy_at(bpfi),                                  # env_bpfi  -> inner race
        energy_at(bsf),                                   # env_bsf   -> ball
        energy_at(2 * bpfo),                              # env_bpfo_h2
        energy_at(2 * bpfi),                              # env_bpfi_h2
        energy_at(bpfi - shaft_hz) + energy_at(bpfi + shaft_hz),  # env_bpfi_sidebands -> IR tell
    ], dtype=np.float64)


def extract(
    window: SignalWindow, *, fft_bands: int = 5, shaft_hz: float | None = None
) -> FeatureVector:
    """Extract a :class:`FeatureVector` from one :class:`SignalWindow`'s vibration channel.

    Args:
        window:    the source window (must carry a ``vibration`` channel).
        fft_bands: number of equal-width FFT energy bands (>= 1).
        shaft_hz:  shaft rotation rate (Hz) for this window's operating condition. When known,
                   appends defect-frequency diagnosis features; when ``None`` they are zero-filled
                   (vector length is fixed regardless, so the schema never changes).

    Returns:
        A FeatureVector whose ``values`` are
        ``[time-domain..., fft_band_0..N-1, env_bpfo, env_bpfi, env_bsf, env_bpfo_h2,
        env_bpfi_h2, env_bpfi_sidebands]`` with the window's eval-only metadata.
    """
    if fft_bands < 1:
        raise ValueError("fft_bands must be >= 1")

    x = np.asarray(window.vibration, dtype=np.float64).ravel()
    if x.size == 0:
        raise ValueError("vibration channel is empty")

    abs_x = np.abs(x)
    rms = float(np.sqrt(np.mean(x**2)))  # why: overall vibration energy; rises as faults inject energy.
    peak = float(np.max(abs_x))          # why: largest instantaneous impact — spalls cause sharp impulses.
    mean_abs = float(np.mean(abs_x))
    std = float(np.std(x))

    # why: crest factor = peak / RMS captures impulsiveness normalized by energy, so it flags
    # sharp impacts even before overall RMS climbs.
    crest = peak / rms if rms > _EPS else 0.0
    # why: shape factor = RMS / mean(|x|) describes waveform shape independent of amplitude,
    # complementing crest and kurtosis.
    shape = rms / mean_abs if mean_abs > _EPS else 0.0

    if std > _EPS:
        # why: Fisher (excess) kurtosis measures peakedness/impulsiveness — a healthy ~Gaussian
        # signal sits near 0, while incipient bearing impacts push it well above 0. Classic
        # early-fault indicator.
        kurtosis = float(stats.kurtosis(x, fisher=True, bias=True))
        # why: skewness flags asymmetry in the amplitude distribution (directional impacts).
        skewness = float(stats.skew(x, bias=True))
    else:
        kurtosis = 0.0  # constant window: higher moments are undefined -> report 0, not NaN.
        skewness = 0.0

    band_energies = _fft_band_energies(x, window.fs, fft_bands)
    defect = _defect_frequency_features(x, window.fs, shaft_hz)

    names: list[str] = ["rms", "peak", "kurtosis", "crest_factor", "skewness", "shape_factor"]
    values: list[float] = [rms, peak, kurtosis, crest, skewness, shape]
    names += [f"fft_band_{i}" for i in range(fft_bands)]
    values += band_energies.tolist()
    names += list(_DEFECT_NAMES)
    values += defect.tolist()

    return FeatureVector(
        node_id=window.node_id,
        tick=window.tick,
        label=window.label,  # eval-only metadata, kept out of `values`.
        names=tuple(names),
        values=np.asarray(values, dtype=np.float64),
    )
