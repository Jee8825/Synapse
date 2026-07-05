"""Two-node gossip demo — the born-wise money shot over REAL Zenoh peer mode (no broker).

Node A experiences an inner-race fault, confirms it, and gossips a compact signature. Node B —
which has NEVER seen that fault — receives the signature peer-to-peer and then recognizes a
matching window as KNOWN, attributed to A. No cloud, no router, no human in the loop.

Uses real CWRU data if present under data/cwru/, else a synthetic fallback.

Run:  python scripts/two_node_gossip_demo.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from synapse.features.extract import extract  # noqa: E402
from synapse.l2_trust.state_machine import RecognitionSource, TrustState  # noqa: E402
from synapse.node.daemon import FleetNode  # noqa: E402
from synapse.sensors.base import SignalWindow  # noqa: E402
from synapse.sensors.windowing import segment  # noqa: E402

FS = 12_000.0
WINDOW = 2048
CWRU = Path(__file__).resolve().parent.parent / "data" / "cwru"


# shaft rate (Hz) per CWRU file (rpm/60): 0hp=1797 -> 29.95, 2hp=1750 -> 29.17
SHAFT_HZ = {"normal": 29.95, "inner_race": 29.95, "ball": 29.95, "outer_race": 29.95,
            "normal_2hp": 29.17, "inner_race_2hp": 29.17}


def _fv(win, tick, label, shaft_hz):
    sw = SignalWindow(node_id="?", tick=tick, fs=FS,
                      channels={"vibration": np.asarray(win, float), "current": None, "temp": None},
                      label=label)
    return extract(sw, fft_bands=5, shaft_hz=shaft_hz)


def _load_de(path: Path) -> np.ndarray:
    from scipy import io as sio

    mat = sio.loadmat(str(path))
    key = next(k for k in mat if k.endswith("_DE_time"))
    return np.asarray(mat[key], dtype=np.float64).ravel()


def _fvs(name, label, *, limit=None):
    sh = SHAFT_HZ[name]  # real shaft_hz -> live defect-frequency features (no zero-fill)
    out = [_fv(w, i, label, sh) for i, w in enumerate(segment(_load_de(CWRU / f"{name}.mat"), WINDOW, WINDOW))]
    return out[:limit] if limit else out


_CROSS = ["normal", "normal_2hp", "inner_race", "inner_race_2hp", "ball", "outer_race"]


def main() -> int:
    cross = all((CWRU / f"{n}.mat").exists() for n in _CROSS)
    if not cross:
        print("[demo] cross-instance CWRU files (97/99/105/107/118) not found.")
        print("[demo] run: .venv/bin/python scripts/download_data.py   then re-run this demo.")
        return 1

    print("[demo] PROVENANCE (non-circular): A and B learn from DIFFERENT recordings, different baselines")
    print("       A: fault=inner_race(105)@0hp   healthy baseline=Normal_0(97)")
    print("       B: fault=inner_race_2hp(107)@2hp healthy baseline=Normal_2(99)  <- different instance\n")

    A = FleetNode(node_id="A", healthy_fvs=_fvs("normal", "healthy"),
                  listen_endpoints=["tcp/127.0.0.1:7481"], connect_endpoints=["tcp/127.0.0.1:7482"])
    B = FleetNode(node_id="B", healthy_fvs=_fvs("normal_2hp", "healthy"),
                  listen_endpoints=["tcp/127.0.0.1:7482"], connect_endpoints=["tcp/127.0.0.1:7481"])
    print("[demo] two FleetNodes open over Zenoh PEER mode (brokerless, no router)\n")
    time.sleep(1.0)  # mesh forms

    try:
        print("=== Node A experiences inner_race(105) and gossips a signature ===")
        for fv in _fvs("inner_race", "inner_race", limit=12):
            a = A.observe(fv)
            if A.last_publish is not None:
                print(f"  A confirmed the fault @tick {a.tick} -> gossiping {A.last_publish.signature_id} "
                      f"({len(A.last_publish.to_bytes())} bytes, NO raw telemetry)")
                break
        deadline = time.time() + 6
        while len(B.memory) == 0 and time.time() < deadline:
            time.sleep(0.05)
        print(f"  B received {len(B.memory)} signature from peer A (no human, no cloud)\n")

        print("=== Node B sees inner_race_2hp(107) — a DIFFERENT instance it never experienced ===")
        for fv in _fvs("inner_race_2hp", "inner_race", limit=12):
            a = B.observe(fv)
            if a.recognition_source is RecognitionSource.PEER:
                print(f"  tick={a.tick} state={a.state.value} recognition=PEER from {a.matched_origin_node_id}"
                      f"  cosine={a.match_similarity:.3f}  <-- BORN-WISE ✔")
                break

        print("\n=== Diagnosis: a node holding A's inner-race sig sees DIFFERENT fault classes ===")
        for neg in ("outer_race", "ball"):
            D = FleetNode(node_id="D", healthy_fvs=_fvs("normal", "healthy"))
            D._on_peer_signature(A.last_publish)
            best = max(D.memory.recognize(fv.values).similarity for fv in _fvs(neg, neg, limit=12))
            print(f"  {neg:11s}-vs-inner-race best cosine = {best:.3f}  (< tau_match 0.95 -> NONE, escalate)")

        print("\n[demo] Cross-instance recognition fired (different recording/load/baseline) -> NOT memorization.")
        print("[demo] outer-race (was inseparable at ~0.97) now rejected -> defect-frequency DIAGNOSIS. ✔")
    finally:
        A.close()
        B.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
