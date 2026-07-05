"""Cross-learning scenario — the full learn→teach→predict cycle in one arc, run OFFLINE over the
in-process bus (no Zenoh, no subprocess). Proves each beat is REAL (decided by the L1-L4 stack,
only the fault onsets are scheduled): a novel fault is detected + taught, a SECOND node teaches a
DIFFERENT novel fault (no fixed roles), and a THIRD node recognizes the first pattern in its own
data BORN-WISE (recognition_source=PEER, no escalation) and raises a systemic warning. Byte-for-
byte deterministic.
"""

from __future__ import annotations

import functools

import pytest

import scripts.run_fleet_scenario as rf
from synapse.scenarios.events import EventType, FleetEvent
from synapse.scenarios.sources import cwru_available

pytestmark = pytest.mark.skipif(
    not cwru_available("normal", "inner_race", "ball"),
    reason="cross_learning replays CWRU normal + inner_race + ball",
)


@functools.lru_cache(maxsize=None)
def _sim():
    return rf.simulate("cross_learning")


def _beats(events, node, etype):
    return [e for e in events if e.node_id == node and e.event_type == etype]


def test_no_fixed_roles_all_three_teach_and_learn() -> None:
    """Every node both TEACHES (publishes) and LEARNS (receives) — no fixed teacher/learner."""
    ev = _sim()
    for n in ("A", "B", "C"):
        assert _beats(ev, n, EventType.GOSSIP_PUBLISH), f"{n} never taught"
        assert _beats(ev, n, EventType.GOSSIP_RECEIVE), f"{n} never learned from a peer"


def test_two_distinct_new_patterns_are_detected_and_taught() -> None:
    """A and B each DISCOVER a genuinely novel fault (escalate) and teach a DIFFERENT signature."""
    ev = _sim()
    a_esc = _beats(ev, "A", EventType.ESCALATE)
    b_esc = _beats(ev, "B", EventType.ESCALATE)
    assert a_esc and b_esc, "both A and B should escalate a novel fault"
    a_sig = _beats(ev, "A", EventType.GOSSIP_PUBLISH)[0]
    b_sig = _beats(ev, "B", EventType.GOSSIP_PUBLISH)[0]
    # the two discoveries are different fault families -> different signatures
    a_hex = a_sig.detail.split()[1]
    b_hex = b_sig.detail.split()[1]
    assert a_hex != b_hex, "A and B taught the same signature; they should be distinct new faults"
    # A teaches before B -> two different machines take the teacher turn, in order.
    assert a_sig.tick < b_sig.tick


def test_c_predicts_from_existing_pattern_bornwise_without_escalating() -> None:
    """C recognizes A's taught pattern IN ITS OWN DATA (recognition_source=PEER) and warns — it
    does NOT escalate, because the fleet already knew the pattern (predict, not discover)."""
    ev = _sim()
    # C never escalates (it recognized the pattern rather than seeing a novel one)
    assert not _beats(ev, "C", EventType.ESCALATE), "C escalated; it should have recognized born-wise"
    # there is a tick where C has a confirmed fault recognized from a PEER signature
    c_bornwise = [
        e for e in ev
        if e.node_id == "C" and e.event_type == EventType.TICK
        and e.confirmed_fault and e.recognition_source == "PEER"
    ]
    assert c_bornwise, "C never recognized a confirmed fault born-wise (PEER)"
    assert c_bornwise[0].state == "CONFIDENT"  # born-wise recognition -> stays CONFIDENT, no escalate


def test_c_reteach_raises_systemic_batch_defect() -> None:
    """C re-teaching A's pattern makes it two-origin -> a SYSTEMIC alarm the fleet raises."""
    ev = _sim()
    c_pub = _beats(ev, "C", EventType.GOSSIP_PUBLISH)
    assert c_pub, "C never re-taught the recognized pattern"
    alarms = [e for e in ev if e.event_type == EventType.SYSTEMIC_ALARM]
    assert alarms, "no systemic alarm was raised"
    # the systemic signature is the one A originally taught (A and C are the two origins)
    a_hex = _beats(ev, "A", EventType.GOSSIP_PUBLISH)[0].detail.split()[1]
    assert any(a_hex in e.detail for e in alarms)
    assert all(e.tick >= c_pub[0].tick for e in alarms), "systemic alarm must follow C's re-teach"


def test_schema_roundtrip_and_roster() -> None:
    ev = _sim()
    assert ev
    assert {e.node_id for e in ev} == {"A", "B", "C"}
    assert all(e.scenario == "cross_learning" for e in ev)
    for e in ev:
        assert FleetEvent.from_json(e.to_json()).logical() == e.logical()


def test_cross_learning_is_deterministic() -> None:
    a = [e.logical() for e in rf.simulate("cross_learning")]
    b = [e.logical() for e in rf.simulate("cross_learning")]
    assert a == b
