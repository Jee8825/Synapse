"""Run a fleet-scale (N=50) scenario OFFLINE over an in-process gossip bus; write its jsonl log.

  python scripts/run_fleet_scenario.py <fleet50_divergence|fleet50_batch_defect|fleet50_stale_quarantine>

The SAME real L1-L4 stack runs for every one of the 50 nodes: real ``WorkerModel`` ->
``NodeAssessor`` -> ``CaseMemory``, plus the real ``should_publish`` / ``should_ingest`` /
``PublishLedger`` gossip rules. Only the TRANSPORT is swapped — instead of 50 Eclipse-Zenoh
processes, confirmed signatures are relayed over a deterministic **in-process bus** that
reproduces the multi-process settle timing exactly: a signature published at tick ``t`` is
delivered into every peer's L3 BEFORE any node processes tick ``t+1`` (mirroring the file-barrier
+ settle in ``run_scenario.py``). Fully seeded + a deterministic clock -> byte-for-byte
reproducible LOGICAL output (``FleetEvent.logical()``; only the wall-clock ``ts`` varies).

Honesty boundary: 50 nodes of REAL L1-L4 logic; the live Zenoh PEER P2P transport stays the
3-process core (``scripts/run_scenario.py``). This emits fleet-scale *visualization* data in the
existing ``FleetEvent`` schema — it is NOT a Round-1 scope change (CLAUDE.md §2) and NOT 50 real
Zenoh processes (addendum 2026-06-27).
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from synapse.l2_trust.state_machine import TrustState  # noqa: E402
from synapse.l3_memory.signature import FaultSignature  # noqa: E402
from synapse.l4_gossip.redundancy import ChannelComparator, Outcome, RedundantPublisher, tamper  # noqa: E402
from synapse.node.daemon import FleetNode  # noqa: E402
from synapse.scenarios.base import FLEET_SCENARIOS, load  # noqa: E402
from synapse.scenarios.events import EventType, FleetEvent  # noqa: E402


class _Clock:
    """Deterministic monotonic clock — advances a fixed step per tick.

    # why: the ONLY non-determinism the real multi-process run carries is wall-clock ``ts``. L3
    # decay and the systemic time-window (``now - contributor_ts <= SYSTEMIC_WINDOW_S``) read a
    # clock, so a real-time clock could make a slow machine flip a logical field. A fake clock makes
    # the log byte-for-byte reproducible. step=0.05 keeps even the 165-tick run at ~8s of virtual
    # time — inside the 60s systemic window, and negligible vs the 1800-3600s decay half-lives.
    """

    def __init__(self, step: float = 0.05, start: float = 1_000_000.0) -> None:
        self._t = start
        self._step = step

    def __call__(self) -> float:
        return self._t

    def advance(self) -> None:
        self._t += self._step


def _make_inbox(inbox: list):
    """FleetNode observability hook: record each ingested peer signature for next-tick draining."""
    def _on_received(sig: FaultSignature, result) -> None:
        inbox.append((sig, result))

    return _on_received


def simulate(name: str) -> list[FleetEvent]:
    """Run the whole N-node fleet offline and return the merged, ordered FleetEvent log."""
    spec, node_data_fn = load(name)
    clock = _Clock()

    nds = {nid: node_data_fn(nid) for nid in spec.nodes}
    inboxes: dict[str, list] = {nid: [] for nid in spec.nodes}
    nodes: dict[str, FleetNode] = {}
    for nid in spec.nodes:
        nodes[nid] = FleetNode(
            node_id=nid,
            healthy_fvs=nds[nid].calibration_fvs,
            listen_endpoints=None,          # transport OFF -> we relay over the in-process bus
            fleet_id=spec.name,
            now_fn=clock,
            on_peer_received=_make_inbox(inboxes[nid]),
            recover_after=spec.recover_after,   # None (default) for every scenario except stale_recovery
        )

    events: list[FleetEvent] = []
    seq: dict[str, int] = dict.fromkeys(spec.nodes, 0)
    prev_pub: dict[str, str | None] = dict.fromkeys(spec.nodes, None)
    alarmed: dict[str, set[str]] = {nid: set() for nid in spec.nodes}
    was_stale: dict[str, bool] = dict.fromkeys(spec.nodes, False)
    was_unknown: dict[str, bool] = dict.fromkeys(spec.nodes, False)

    # redundant dual-channel transport (opt-in via spec.dual_channel): one INDEPENDENT comparator
    # per node, one publisher per origin, + a reject inbox drained next tick (mirrors GOSSIP_RECEIVE
    # timing). Default off -> the relay below is byte-identical to the single-path scenarios.
    comparators = {nid: ChannelComparator() for nid in spec.nodes}
    publishers: dict[str, RedundantPublisher] = {}
    reject_inbox: dict[str, list[tuple[str, int]]] = {nid: [] for nid in spec.nodes}
    tamper_set = set(spec.channel_tamper)

    def emit(nid: str, tick: int, etype: str, a, detail: str, **over) -> None:
        node = nodes[nid]
        systemic = any(s.systemic for s in node.memory.signatures)
        events.append(FleetEvent(
            scenario=spec.name, tick=tick, seq=seq[nid], node_id=nid, role=nds[nid].role,
            act=spec.act_for(tick), event_type=etype,
            state=over.get("state", a.state.value if a else "CONFIDENT"),
            self_trust=over.get("self_trust", a.self_trust if a else 1.0),
            recognition_source=over.get("recognition_source",
                                        a.recognition_source.value if a else "NONE"),
            matched_origin=over.get("matched_origin", a.matched_origin_node_id if a else None),
            confirmed_fault=over.get("confirmed_fault", a.confirmed_fault if a else False),
            systemic=over.get("systemic", systemic),
            should_teach=over.get("should_teach", a.should_teach if a else True),
            detail=detail, ts=clock(),
        ))
        seq[nid] += 1

    for t in range(spec.n_ticks):
        # 1. Drain gossip delivered during the PREVIOUS tick's settle (attributed to THIS tick,
        #    exactly like the multi-process node drains its inbox before observing tick t).
        drained = {nid: inboxes[nid][:] for nid in spec.nodes}
        for nid in spec.nodes:
            inboxes[nid].clear()
        # channel rejects raised during the previous tick's cross-check, surfaced now (like gossip)
        rejected = {nid: reject_inbox[nid][:] for nid in spec.nodes}
        for nid in spec.nodes:
            reject_inbox[nid].clear()

        # 2. Every node observes tick t through the real L1-L4 pipeline (roster order).
        published: list[tuple[str, FaultSignature]] = []
        for nid in spec.nodes:
            node = nodes[nid]
            a = node.observe(nds[nid].timeline_fvs[t])
            emit(nid, t, EventType.TICK, a, f"{len(node.memory)} sigs in memory")

            for sig, result in drained[nid]:
                emit(nid, t, EventType.GOSSIP_RECEIVE, a,
                     f"received {sig.signature_id} from {sig.origin_node_id}",
                     recognition_source="PEER", matched_origin=sig.origin_node_id,
                     systemic=result.systemic)

            # dual-channel comparator rejects: the two copies disagreed -> tampered/faulted path,
            # dropped (never ingested) + flagged. matched_origin names the origin of the bad copy.
            for origin_id, rseq in rejected[nid]:
                emit(nid, t, EventType.CHANNEL_REJECT, a,
                     f"cross-check MISMATCH: rejected tampered copy of {origin_id}'s signature "
                     f"on path B (seq {rseq})", matched_origin=origin_id)

            if node.last_publish is not None and node.last_publish.signature_id != prev_pub[nid]:
                prev_pub[nid] = node.last_publish.signature_id
                emit(nid, t, EventType.GOSSIP_PUBLISH, a, f"taught {prev_pub[nid]} to the fleet")
                published.append((nid, node.last_publish))

            for s in node.memory.signatures:
                if s.systemic and s.signature_id not in alarmed[nid]:
                    alarmed[nid].add(s.signature_id)
                    emit(nid, t, EventType.SYSTEMIC_ALARM, a,
                         f"BATCH DEFECT: {s.signature_id} from {sorted(s.contributing_nodes)}",
                         systemic=True)

            if a.state is TrustState.UNKNOWN and not was_unknown[nid]:
                was_unknown[nid] = True
                emit(nid, t, EventType.ESCALATE, a, "confirmed novel fault -> escalate to human")
            if a.state is not TrustState.UNKNOWN:
                was_unknown[nid] = False

            if a.state is TrustState.STALE and not was_stale[nid]:
                was_stale[nid] = True
                emit(nid, t, EventType.STALE_QUARANTINE, a,
                     "self-trust below tau_stale -> listen, don't teach")
            # STALE -> CONFIDENT: the node re-baselined (recalibrate) and re-earned trust. Only a
            # genuine return to CONFIDENT counts as recovery (never UNKNOWN, never a mid-drift blip).
            if was_stale[nid] and a.state is TrustState.CONFIDENT:
                was_stale[nid] = False
                emit(nid, t, EventType.RECOVER, a,
                     "self-trust restored above tau_stale -> rejoin fleet (teaching re-enabled)")

        # 3. Settle: relay this tick's publications to every OTHER node (mirrors the Zenoh mesh).
        #    Each peer deserializes its OWN copy from the wire bytes — never a shared object — so
        #    to_peer_signature's down-weighting can't compound across receivers.
        for origin_id, sig in published:
            raw = sig.to_bytes()
            if not spec.dual_channel:
                for nid, node in nodes.items():
                    if nid == origin_id:
                        continue
                    node._on_peer_signature(FaultSignature.from_bytes(raw))
                continue
            # dual-channel: publish over A + B; each peer's INDEPENDENT comparator cross-checks the
            # two copies before ingest. A tampered path-B copy -> mismatch -> rejected, never enters L3.
            pub = publishers.setdefault(origin_id, RedundantPublisher(origin_id))
            frame_a, frame_b = pub.frames(raw)
            for nid, node in nodes.items():
                if nid == origin_id:
                    continue
                fb = tamper(frame_b) if (nid, origin_id) in tamper_set else frame_b
                comp = comparators[nid]
                comp.on_frame(frame_a)
                res = comp.on_frame(fb)  # the second copy resolves the pair
                if res.outcome in (Outcome.ACCEPT, Outcome.ACCEPT_DEGRADED):
                    node._on_peer_signature(FaultSignature.from_bytes(res.payload))
                elif res.outcome is Outcome.REJECT_MISMATCH:
                    reject_inbox[nid].append((origin_id, res.seq))
        clock.advance()

    for node in nodes.values():
        node.close()

    events.sort(key=lambda e: (e.tick, e.node_id, e.seq))
    return events


def _run(name: str) -> Path:
    events = simulate(name)
    out_dir = ROOT / "events"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"{name}.jsonl"
    out.write_text("\n".join(e.to_json() for e in events) + "\n")
    _print_timeline(name, load(name)[0].narrative, events)
    return out


_BEATS = {
    EventType.GOSSIP_PUBLISH: "TEACH",
    EventType.SYSTEMIC_ALARM: "ALARM",
    EventType.ESCALATE: "ESCAL",
    EventType.STALE_QUARANTINE: "STALE",
    EventType.RECOVER: "RECOVER",
    EventType.CHANNEL_REJECT: "REJECT",
    EventType.CHANNEL_DEGRADED: "DEGRADED",
}


def _print_timeline(name: str, narrative: str, events: list[FleetEvent]) -> None:
    n_nodes = len({e.node_id for e in events})
    print(f"\n=== FLEET SCENARIO: {name} (N={n_nodes} nodes) ===\n{narrative}\n")
    act = None
    receives: dict[int, int] = defaultdict(int)
    for e in events:
        if e.event_type == EventType.TICK:
            if e.act != act:  # one-line act header at each 3-act boundary
                act = e.act
                print(f"\n--- act: {act.upper()} (tick {e.tick}) ---")
            continue
        if e.event_type == EventType.GOSSIP_RECEIVE:
            receives[e.tick] += 1  # collapse the fan-out (up to 49 receivers) into a per-tick count
            continue
        print(f"  t={e.tick:>3} {e.node_id}({e.role}) [{_BEATS[e.event_type]}] {e.detail}"
              f"  state={e.state} trust={e.self_trust:.2f}")
    if receives:
        print("\n  born-wise fan-out (peer signatures ingested):")
        for t in sorted(receives):
            print(f"    t={t:>3}: {receives[t]:>2} machines armed from peer gossip")
    c = Counter(e.event_type for e in events)
    print(f"\n[ok] wrote events/{name}.jsonl ({len(events)} events; "
          f"{c.get(EventType.GOSSIP_PUBLISH, 0)} teach, {c.get(EventType.GOSSIP_RECEIVE, 0)} learn, "
          f"{c.get(EventType.SYSTEMIC_ALARM, 0)} alarm, {c.get(EventType.ESCALATE, 0)} escalate, "
          f"{c.get(EventType.STALE_QUARANTINE, 0)} stale)\n")


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if not argv or argv[0] not in FLEET_SCENARIOS:
        print(f"usage: run_fleet_scenario.py <{'|'.join(FLEET_SCENARIOS)}>")
        return 2
    _run(argv[0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
