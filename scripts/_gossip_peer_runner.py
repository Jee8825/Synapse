"""Test fixture — a long-lived, standalone Zenoh peer PROCESS.

Spawned (one OS process each) by the multi-process no-SPOF resilience test so the "kill a node"
case is a real process death (SIGKILL), not an in-process ``session.close()``. Each peer logs
every received signature_id to a file and can publish ONE signature after a delay.

Not a user-facing script (underscore-prefixed).
"""

from __future__ import annotations

import argparse
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np  # noqa: E402

from synapse.l3_memory.signature import FaultSignature, schema_id_for  # noqa: E402
from synapse.l4_gossip.transport import GossipTransport  # noqa: E402

NAMES = tuple(f"f{i}" for i in range(11))


def make_sig(indices: list[int], origin: str, severity: float = 0.9) -> FaultSignature:
    v = np.zeros(11)
    for i in indices:
        v[i] = 5.0
    return FaultSignature(centroid=v.astype(np.float32), schema_id=schema_id_for(NAMES),
                          origin_node_id=origin, severity=severity, sample_count=3)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--node-id", required=True)
    ap.add_argument("--listen", required=True)            # own port
    ap.add_argument("--connect", required=True)           # csv of peer ports (full mesh)
    ap.add_argument("--recv-file", required=True)
    ap.add_argument("--publish-indices", default="")      # csv ints; empty = pure subscriber
    ap.add_argument("--publish-delay", type=float, default=0.0)
    ap.add_argument("--duration", type=float, default=30.0)
    a = ap.parse_args()

    recv = Path(a.recv_file)

    def on_sig(sig: FaultSignature) -> None:
        with recv.open("a") as f:
            f.write(sig.signature_id + "\n")

    transport = GossipTransport(
        node_id=a.node_id,
        listen_endpoints=[f"tcp/127.0.0.1:{a.listen}"],
        connect_endpoints=[f"tcp/127.0.0.1:{p}" for p in a.connect.split(",") if p],
        on_signature=on_sig,
    )

    if a.publish_indices:
        indices = [int(x) for x in a.publish_indices.split(",")]

        def _publish_later() -> None:
            time.sleep(a.publish_delay)
            transport.publish(make_sig(indices, a.node_id))

        threading.Thread(target=_publish_later, daemon=True).start()

    time.sleep(a.duration)
    transport.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
