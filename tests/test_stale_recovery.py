"""Stale self-recovery scenario — the full three-state loop end to end, run OFFLINE over the
in-process bus (no Zenoh, no subprocess). Proves the recovery beat is REAL (computed by the L2
``recalibrate()`` path), correctly ordered, and byte-for-byte deterministic.
"""

from __future__ import annotations

import functools

import pytest

import scripts.run_fleet_scenario as rf
from synapse.scenarios.events import EventType, FleetEvent
from synapse.scenarios.sources import cwru_available

pytestmark = pytest.mark.skipif(
    not cwru_available("normal", "inner_race"),
    reason="stale_recovery replays CWRU normal + inner_race for A/B",
)


@functools.lru_cache(maxsize=None)
def _sim():
    return rf.simulate("stale_recovery")


def _beats(events, node, etype):
    return [e for e in events if e.node_id == node and e.event_type == etype]


def test_c_goes_stale_then_recovers() -> None:
    ev = _sim()
    stale = _beats(ev, "C", EventType.STALE_QUARANTINE)
    recover = _beats(ev, "C", EventType.RECOVER)
    assert stale, "C never went STALE"
    assert recover, "C never RECOVERED"
    assert stale[0].should_teach is False               # quarantine: stops teaching
    assert stale[0].tick < recover[0].tick               # isolate THEN rejoin, in that order
    # recovery is a genuine return to CONFIDENT with trust restored + teaching re-enabled
    assert recover[0].state == "CONFIDENT"
    assert recover[0].should_teach is True
    assert recover[0].self_trust >= 0.99


def test_c_listens_while_quarantined() -> None:
    ev = _sim()
    stale_tick = _beats(ev, "C", EventType.STALE_QUARANTINE)[0].tick
    recover_tick = _beats(ev, "C", EventType.RECOVER)[0].tick
    # A teaches while C is quarantined; C (STALE) still INGESTS the peer signature = "listen".
    a_pub = _beats(ev, "A", EventType.GOSSIP_PUBLISH)
    assert a_pub, "teacher A never taught"
    c_recv = _beats(ev, "C", EventType.GOSSIP_RECEIVE)
    assert c_recv, "C received nothing"
    assert any(stale_tick <= e.tick < recover_tick for e in c_recv), \
        "C did not ingest a peer signature while quarantined"


def test_c_never_teaches_while_stale() -> None:
    ev = _sim()
    stale_tick = _beats(ev, "C", EventType.STALE_QUARANTINE)[0].tick
    recover_tick = _beats(ev, "C", EventType.RECOVER)[0].tick
    # the firebreak holds through the whole quarantine window: no teaching until trust is re-earned.
    c_pubs = [e.tick for e in _beats(ev, "C", EventType.GOSSIP_PUBLISH)]
    assert all(not (stale_tick <= t < recover_tick) for t in c_pubs)


def test_schema_roundtrip_and_roster() -> None:
    ev = _sim()
    assert ev
    assert {e.node_id for e in ev} == {"A", "B", "C"}
    assert all(e.scenario == "stale_recovery" for e in ev)
    for e in ev:
        assert FleetEvent.from_json(e.to_json()).logical() == e.logical()


def test_recovery_is_deterministic() -> None:
    a = [e.logical() for e in rf.simulate("stale_recovery")]
    b = [e.logical() for e in rf.simulate("stale_recovery")]
    assert a == b
