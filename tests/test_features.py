"""Feature-correctness tests: feed signals with known analytic features and assert them.

A pure sine has closed-form time-domain features, so these tests pin the extractor to ground
truth (not just "it returns six numbers"). Frequency tests assert energy lands in the right
FFT band.
"""

from __future__ import annotations

import numpy as np
import pytest

from synapse.features.extract import extract
from synapse.sensors.base import SignalWindow

FS = 12_000.0


def _sine_window(freq: float, amp: float, *, label: str | None = "healthy",
                 periods: int = 60, node_id: str = "A", tick: int = 5) -> SignalWindow:
    """A SignalWindow holding ``periods`` whole cycles of a sine (integer-period, oversampled).

    # why: time-domain features (RMS, shape factor) only match their continuous closed forms
    # when the window spans whole periods and is well oversampled — see the verification run.
    """
    n = int(round(FS / freq * periods))
    t = np.arange(n) / FS
    x = amp * np.sin(2 * np.pi * freq * t)
    return SignalWindow(node_id=node_id, tick=tick, fs=FS,
                        channels={"vibration": x, "current": None, "temp": None}, label=label)


def test_time_domain_features_match_pure_sine() -> None:
    amp = 2.0
    fv = extract(_sine_window(50.0, amp), fft_bands=5)
    f = fv.as_dict()
    assert f["rms"] == pytest.approx(amp / np.sqrt(2), rel=1e-3)
    assert f["peak"] == pytest.approx(amp, rel=1e-3)
    assert f["crest_factor"] == pytest.approx(np.sqrt(2), rel=1e-3)
    assert f["skewness"] == pytest.approx(0.0, abs=1e-3)
    # Fisher (excess) kurtosis of a pure sine is exactly -1.5.
    assert f["kurtosis"] == pytest.approx(-1.5, abs=1e-3)
    # Shape factor of a sine = RMS/mean(|x|) = (1/√2)/(2/π) = π/(2√2) ≈ 1.1107.
    assert f["shape_factor"] == pytest.approx(np.pi / (2 * np.sqrt(2)), abs=1e-2)


def test_rms_scales_with_amplitude() -> None:
    f1 = extract(_sine_window(50.0, 1.0)).as_dict()
    f2 = extract(_sine_window(50.0, 3.0)).as_dict()
    assert f2["rms"] == pytest.approx(3.0 * f1["rms"], rel=1e-3)


@pytest.mark.parametrize(
    "freq, expected_band",
    [
        (600.0, 0),   # bands over [0,6000] in 5 -> edges 0,1200,2400,3600,4800,6000
        (3000.0, 2),  # 3000 in [2400, 3600) -> band 2
        (5400.0, 4),  # 5400 in [4800, 6000] -> band 4
    ],
)
def test_fft_band_localization(freq: float, expected_band: int) -> None:
    fv = extract(_sine_window(freq, 1.0), fft_bands=5)
    f = fv.as_dict()
    band_energy = [f[f"fft_band_{i}"] for i in range(5)]
    assert int(np.argmax(band_energy)) == expected_band


def test_metadata_preserved_and_label_excluded_from_values() -> None:
    fv = extract(_sine_window(50.0, 1.0, label="inner_race", node_id="C", tick=42))
    assert (fv.node_id, fv.tick, fv.label) == ("C", 42, "inner_race")
    # Feature vector aligns names<->values and carries no label/string contamination.
    assert len(fv.names) == len(fv.values)
    assert fv.values.dtype == np.float64
    assert "inner_race" not in fv.names


def test_fft_bands_count_is_configurable() -> None:
    fv = extract(_sine_window(50.0, 1.0), fft_bands=8)
    assert sum(n.startswith("fft_band_") for n in fv.names) == 8


def test_silent_window_has_finite_ratio_features() -> None:
    # All-zero window: ratio/higher-moment features must be finite (0.0), never NaN/inf.
    w = SignalWindow(node_id="A", tick=0, fs=FS,
                     channels={"vibration": np.zeros(2048), "current": None, "temp": None},
                     label="healthy")
    fv = extract(w)
    assert np.all(np.isfinite(fv.values))
