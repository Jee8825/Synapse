"""One scenario node, as its own OS process (real multi-process Zenoh peer).

Driven by a file-based tick BARRIER from run_scenario.py: it waits for ``go.<t>``, processes its
scheduled FeatureVector for tick t through the real L1-L4 FleetNode, emits FleetEvents to its own
jsonl, then writes ``ack.<node>.<t>``. The barrier (plus a settle pause on the coordinator side)
makes the run deterministic despite async gossip: a signature published at tick t is delivered
before any node processes tick t+1. Gossip itself still flows over real Zenoh; only coordination
and event capture use files (the signature wire stays signatures-only).
"""

from __future__ import annotations

import argparse
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from synapse.l2_trust.state_machine import TrustState  # noqa: E402
from synapse.l3_memory.signature import FaultSignature  # noqa: E402
from synapse.l3_memory.store import AddResult  # noqa: E402
from synapse.node.daemon import FleetNode  # noqa: E402
from synapse.scenarios.base import load  # noqa: E402
from synapse.scenarios.events import EventType, FleetEvent  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", required=True)
    ap.add_argument("--node-id", required=True)
    ap.add_argument("--run-dir", required=True)
    args = ap.parse_args()

    spec, node_data = load(args.scenario)
    nd = node_data(args.node_id)
    listen, connect = spec.endpoints(args.node_id)
    run_dir = Path(args.run_dir)
    out = run_dir / f"{args.node_id}.jsonl"
    out.write_text("")  # truncate

    received: list[tuple[FaultSignature, AddResult]] = []
    rlock = threading.Lock()

    def on_recv(sig: FaultSignature, result: AddResult) -> None:
        with rlock:
            received.append((sig, result))

    node = FleetNode(
        node_id=args.node_id, healthy_fvs=nd.calibration_fvs,
        listen_endpoints=listen, connect_endpoints=connect, fleet_id=spec.name,
        on_peer_received=on_recv,
    )

    seq = 0
    fh = out.open("a")

    def emit(tick: int, etype: str, a, detail: str, **over) -> None:
        nonlocal seq
        systemic = any(s.systemic for s in node.memory.signatures)
        ev = FleetEvent(
            scenario=spec.name, tick=tick, seq=seq, node_id=args.node_id, role=nd.role,
            act=spec.act_for(tick), event_type=etype,
            state=over.get("state", a.state.value if a else "CONFIDENT"),
            self_trust=over.get("self_trust", a.self_trust if a else 1.0),
            recognition_source=over.get("recognition_source", a.recognition_source.value if a else "NONE"),
            matched_origin=over.get("matched_origin", a.matched_origin_node_id if a else None),
            confirmed_fault=over.get("confirmed_fault", a.confirmed_fault if a else False),
            systemic=over.get("systemic", systemic),
            should_teach=over.get("should_teach", a.should_teach if a else True),
            detail=detail, ts=time.time(),
        )
        fh.write(ev.to_json() + "\n")
        fh.flush()
        seq += 1

    prev_pub: str | None = None
    alarmed: set[str] = set()
    was_stale = False
    was_unknown = False

    for t in range(spec.n_ticks):
        while not (run_dir / f"go.{t}").exists():
            if (run_dir / "abort").exists():
                fh.close(); node.close(); return 1
            time.sleep(0.004)

        # Snapshot inbound gossip BEFORE observing/publishing this tick. # why: this fixes the
        # tick a peer signature is attributed to (a publish at tick t settles and is drained at
        # t+1, never same-tick) -> the event log is deterministic despite async delivery.
        with rlock:
            drained = received[:]; received.clear()

        a = node.observe(nd.timeline_fvs[t])
        emit(t, EventType.TICK, a, f"{node.memory.__len__()} sigs in memory")

        # inbound peer signatures that arrived during the previous settle -> born-wise arming
        for sig, result in drained:
            emit(t, EventType.GOSSIP_RECEIVE, a,
                 f"received {sig.signature_id} from {sig.origin_node_id}",
                 recognition_source="PEER", matched_origin=sig.origin_node_id, systemic=result.systemic)

        # this node published a confirmed signature
        if node.last_publish is not None and node.last_publish.signature_id != prev_pub:
            prev_pub = node.last_publish.signature_id
            emit(t, EventType.GOSSIP_PUBLISH, a, f"taught {prev_pub} to the fleet")

        # systemic batch-defect: any signature now backed by >= K distinct origins
        for s in node.memory.signatures:
            if s.systemic and s.signature_id not in alarmed:
                alarmed.add(s.signature_id)
                emit(t, EventType.SYSTEMIC_ALARM, a,
                     f"BATCH DEFECT: {s.signature_id} from {sorted(s.contributing_nodes)}", systemic=True)

        if a.state is TrustState.UNKNOWN and not was_unknown:
            was_unknown = True
            emit(t, EventType.ESCALATE, a, "confirmed novel fault -> escalate to human")
        if a.state is not TrustState.UNKNOWN:
            was_unknown = False

        if a.state is TrustState.STALE and not was_stale:
            was_stale = True
            emit(t, EventType.STALE_QUARANTINE, a, "self-trust below tau_stale -> listen, don't teach")

        (run_dir / f"ack.{args.node_id}.{t}").write_text("1")

    # wait for the coordinator's stop, then close cleanly
    deadline = time.time() + 10
    while not (run_dir / "stop").exists() and time.time() < deadline:
        time.sleep(0.02)
    fh.close()
    node.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
