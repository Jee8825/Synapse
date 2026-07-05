"""Redundant dual-channel transport + per-node comparator (synapse/l4_gossip/redundancy.py).

Unit tests for the PRP + 1oo2D comparator (accept / reject / degraded), plus an integration test
over the deterministic in-process bus proving the tampered-copy REJECT path: node C's corrupted
path-B copy is caught and never enters L3, while node B still learns via the clean path.
"""

from __future__ import annotations

import functools

import pytest

import scripts.run_fleet_scenario as rf
from synapse.l4_gossip.redundancy import (
    Channel,
    ChannelComparator,
    ChannelFrame,
    Outcome,
    RedundantPublisher,
    tamper,
)
from synapse.scenarios.events import EventType, FleetEvent
from synapse.scenarios.sources import cwru_available

# --- pure comparator unit tests (no CWRU, no bus) -------------------------------------------


def _frames(payload=b"sig-bytes", origin="A", seq=0):
    return (
        ChannelFrame(origin, seq, Channel.A, payload),
        ChannelFrame(origin, seq, Channel.B, payload),
    )


def test_matching_copies_accept_once() -> None:
    comp = ChannelComparator()
    fa, fb = _frames()
    assert comp.on_frame(fa).outcome is Outcome.HOLD          # first copy: wait for the pair
    res = comp.on_frame(fb)
    assert res.outcome is Outcome.ACCEPT
    assert res.payload == b"sig-bytes"
    assert comp.pending == 0                                   # pair resolved, nothing left buffered


def test_disagreeing_copies_reject() -> None:
    comp = ChannelComparator()
    fa, fb = _frames()
    comp.on_frame(fa)
    res = comp.on_frame(tamper(fb))                            # path-B copy corrupted
    assert res.outcome is Outcome.REJECT_MISMATCH
    assert res.payload is None                                 # nothing is delivered on a mismatch
    assert comp.pending == 0


def test_single_path_sweeps_to_degraded() -> None:
    comp = ChannelComparator()
    fa, _ = _frames()
    assert comp.on_frame(fa).outcome is Outcome.HOLD           # only path A arrived
    swept = comp.sweep()
    assert len(swept) == 1
    assert swept[0].outcome is Outcome.ACCEPT_DEGRADED
    assert swept[0].payload == b"sig-bytes"                    # PRP keeps the copy it did get


def test_publisher_duplicates_with_shared_incrementing_seq() -> None:
    pub = RedundantPublisher("A")
    a0, b0 = pub.frames(b"one")
    a1, b1 = pub.frames(b"two")
    assert (a0.channel, b0.channel) == (Channel.A, Channel.B)
    assert a0.seq == b0.seq == 0 and a1.seq == b1.seq == 1     # both copies share the seq; it climbs
    assert a0.payload == b0.payload == b"one"


# --- integration over the offline bus (needs CWRU) ------------------------------------------

pytestmark = pytest.mark.skipif(
    not cwru_available("normal", "inner_race"),
    reason="comms_integrity replays CWRU normal + inner_race",
)


@functools.lru_cache(maxsize=None)
def _sim():
    return rf.simulate("comms_integrity")


def _beats(events, node, etype):
    return [e for e in events if e.node_id == node and e.event_type == etype]


def _sig_hex(events) -> str:
    return _beats(events, "A", EventType.GOSSIP_PUBLISH)[0].detail.split()[1]


def test_clean_node_learns_tampered_node_rejects() -> None:
    ev = _sim()
    sig = _sig_hex(ev)
    # B's link is clean -> both copies agree -> B ingests A's signature (born-wise)
    b_recv = _beats(ev, "B", EventType.GOSSIP_RECEIVE)
    assert any(sig in e.detail for e in b_recv), "B should have learned A's signature via the clean path"
    # C's path-B copy is tampered -> comparator MISMATCH -> C rejects and never ingests it
    c_reject = _beats(ev, "C", EventType.CHANNEL_REJECT)
    assert c_reject, "C never flagged the tampered copy"
    assert c_reject[0].matched_origin == "A"
    assert not _beats(ev, "C", EventType.GOSSIP_RECEIVE), "C ingested a signature it should have rejected"


def test_reject_follows_the_teach() -> None:
    ev = _sim()
    teach = _beats(ev, "A", EventType.GOSSIP_PUBLISH)[0]
    reject = _beats(ev, "C", EventType.CHANNEL_REJECT)[0]
    assert reject.tick >= teach.tick                          # you can only reject what was sent
    assert reject.state == "CONFIDENT" and reject.self_trust == 1.0  # C stays healthy; only the copy is bad


def test_schema_roundtrip_and_determinism() -> None:
    ev = _sim()
    assert {e.node_id for e in ev} == {"A", "B", "C"}
    for e in ev:
        assert FleetEvent.from_json(e.to_json()).logical() == e.logical()
    a = [e.logical() for e in rf.simulate("comms_integrity")]
    b = [e.logical() for e in rf.simulate("comms_integrity")]
    assert a == b
