"""Single-node L1+L2 assessment demo (CLAUDE.md §12, Days 3-4).

Shows the drift-conscience three-state behavior on ONE node:

  Section 1 — Detection + escalation (real CWRU if present, else synthetic):
      healthy windows -> CONFIDENT; fault onset -> anomalies accumulate (still CONFIDENT until
      the m-of-n gate confirms) -> CONFIRMED novel fault -> UNKNOWN (escalate to a human).
  Section 2 — Stale self-quarantine + recovery (synthetic baseline drift):
      healthy -> CONFIDENT; gradual baseline drift -> STALE ("listen, don't teach")
      -> recalibrate on fresh healthy -> CONFIDENT again.

Run:  python scripts/single_node_demo.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from synapse.features.extract import extract  # noqa: E402
from synapse.l1_worker.detector import WorkerModel  # noqa: E402
from synapse.l2_trust.state_machine import NodeAssessor  # noqa: E402
from synapse.sensors.base import SignalWindow  # noqa: E402
from synapse.sensors.replay import DatasetReplaySource  # noqa: E402
from synapse.sensors.windowing import segment  # noqa: E402

FS = 12_000.0
WINDOW = 2048
CWRU = Path(__file__).resolve().parent.parent / "data" / "cwru"
_HEADER = f"{'tick':>4} {'label':>10} {'score':>7} {'pval':>6} {'anom':>5} {'conf':>5} {'drift':>5} {'trust':>6} {'state':>10} {'teach':>5}"


def _row(a) -> str:
    return (
        f"{a.tick:>4} {a.label_for_display:>10} {a.anomaly_score:>7.3f} {a.calibrated_pvalue:>6.3f} "
        f"{str(a.is_anom):>5} {str(a.confirmed_fault):>5} {str(a.drift_detected):>5} "
        f"{a.self_trust:>6.2f} {a.state.value:>10} {str(a.should_teach):>5}"
    )


def _fv(win: np.ndarray, tick: int, label: str):
    sw = SignalWindow(node_id="A", tick=tick, fs=FS,
                      channels={"vibration": np.asarray(win, float), "current": None, "temp": None},
                      label=label)
    return extract(sw, fft_bands=5)


def _load_de(path: Path) -> np.ndarray:
    from scipy import io as sio

    mat = sio.loadmat(str(path))
    key = next(k for k in mat if k.endswith("_DE_time"))
    return np.asarray(mat[key], dtype=np.float64).ravel()


# ---- section 1: detection + escalation ---------------------------------------------------


def section1() -> None:
    cwru = (CWRU / "normal.mat").exists() and (CWRU / "inner_race.mat").exists()
    print(f"\n=== SECTION 1 — detection + escalation ({'REAL CWRU' if cwru else 'synthetic'}) ===")
    if cwru:
        healthy_sig, fault_sig = _load_de(CWRU / "normal.mat"), _load_de(CWRU / "inner_race.mat")
    else:
        rng = np.random.default_rng(0)
        t = np.arange(WINDOW * 80) / FS
        healthy_sig = 0.5 * np.sin(2 * np.pi * 60 * t) + 0.05 * rng.standard_normal(t.size)
        imp = np.zeros(t.size); imp[::128] = 1.0
        fault_sig = healthy_sig + 2.0 * imp * rng.standard_normal(t.size)

    healthy_fvs = [_fv(w, i, "healthy") for i, w in enumerate(segment(healthy_sig, WINDOW, WINDOW))]
    model = WorkerModel(random_state=0).fit(healthy_fvs[: int(len(healthy_fvs) * 0.6)])
    assessor = NodeAssessor(model, node_id="A")  # no L3/L4 yet -> predicates default to "no"
    assessor.calibrate(healthy_fvs[int(len(healthy_fvs) * 0.6):])

    source = DatasetReplaySource(
        node_id="A", fs=FS, healthy_signal=healthy_sig, fault_signal=fault_sig,
        switch_tick=6, n_ticks=14, window_size=WINDOW, hop=WINDOW, seed=42,
    )
    print(_HEADER)
    for window in source:
        a = _attach(assessor.assess(extract(window, fft_bands=5)), window.label)
        print(_row(a))
    print("note: ticks 6-7 are anomalous but NOT yet confirmed (m-of-n) -> still CONFIDENT;")
    print("      a CONFIRMED novel fault -> UNKNOWN = escalate to a human (and gossip via L4 later).")


# ---- section 2: stale self-quarantine + recovery -----------------------------------------


def _healthy_win(rng):
    return (rng.uniform(0.45, 0.55) * np.sin(2 * np.pi * rng.uniform(58, 62) * np.arange(WINDOW) / FS)
            + rng.uniform(0.04, 0.06) * rng.standard_normal(WINDOW))


def _drift_win(rng, sev):
    return 0.5 * np.sin(2 * np.pi * 60 * np.arange(WINDOW) / FS) + (0.05 + sev) * rng.standard_normal(WINDOW)


def section2() -> None:
    print("\n=== SECTION 2 — stale self-quarantine + recovery (synthetic baseline drift) ===")
    rng = np.random.default_rng(0)
    healthy = [_fv(_healthy_win(rng), i, "healthy") for i in range(400)]
    model = WorkerModel(random_state=0).fit(healthy[:250])
    assessor = NodeAssessor(model, node_id="A")
    assessor.calibrate(healthy[250:])

    def show(label, a):
        print(f"  {label:<22} -> state={a.state.value:<10} drift={str(a.drift_detected):<5} "
              f"self_trust={a.self_trust:.2f} should_teach={a.should_teach}")

    show("healthy baseline", assessor.assess(healthy[0]))
    drng = np.random.default_rng(3)
    last = None
    for i in range(220):
        sev = 0.010 * min(1.0, (i + 1) / 30)  # ramp-in then hold (matches tuned plateau)
        last = assessor.assess(_fv(_drift_win(drng, sev), 100 + i, "drift"))
    show("after baseline drift", last)
    assessor.recalibrate([_fv(_healthy_win(np.random.default_rng(7)), i, "healthy") for i in range(150)])
    show("after recalibration", assessor.assess(_fv(_healthy_win(np.random.default_rng(9)), 0, "healthy")))


# NodeAssessment has no label/is_anom fields (label is eval-only); attach for display only.
class _Display:
    def __init__(self, a, label):
        self._a = a
        self.label_for_display = label or "?"
        self.is_anom = a.calibrated_pvalue <= 0.05

    def __getattr__(self, name):
        return getattr(self._a, name)


def _attach(a, label):
    return _Display(a, label)


if __name__ == "__main__":
    section1()
    section2()
    print("\n[demo] OK — single-node L1+L2 drift-conscience exercised across all three states.")
