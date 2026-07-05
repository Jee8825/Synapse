"""Fleet-scale (N=50) scenario tests — the SAME real L1-L4 logic run OFFLINE over an in-process
bus (no Zenoh, no subprocess), asserting each money-shot beat, the schema, and determinism.

Unlike ``test_scenarios.py`` (real multi-process Zenoh), these need ONLY CWRU data: the fleet50_*
generator swaps the transport for an in-process bus, so it runs fast and needs no network.
"""

from __future__ import annotations

import functools

import pytest

import scripts.run_fleet_scenario as rf
from synapse.scenarios.base import FLEET_SCENARIOS
from synapse.scenarios.events import EventType, FleetEvent
from synapse.scenarios.fleet import _BATCH_NODES, _DIVERGE_NODE, _STALE_DRIFTER, _STALE_TEACHER
from synapse.scenarios.sources import cwru_available

pytestmark = pytest.mark.skipif(
    not cwru_available("normal", "inner_race"),
    reason="fleet50 scenarios replay CWRU normal + inner_race",
)


@functools.lru_cache(maxsize=None)
def _sim(name: str):
    """Simulate a scenario once and reuse it across assertions (each run is seconds of L1-L4)."""
    return rf.simulate(name)


def _ids(events, etype, **match) -> set[str]:
    return {
        e.node_id for e in events
        if e.event_type == etype and all(getattr(e, k) == v for k, v in match.items())
    }


def test_divergence_one_outlier_vs_identical_peers() -> None:
    ev = _sim("fleet50_divergence")
    # the lone outlier teaches AND escalates (novel, no peer taught it yet).
    assert _DIVERGE_NODE in _ids(ev, EventType.GOSSIP_PUBLISH)
    assert _DIVERGE_NODE in _ids(ev, EventType.ESCALATE)
    # ONLY the outlier ever teaches — the 49 identical peers stay a tight, silent cluster.
    assert _ids(ev, EventType.GOSSIP_PUBLISH) == {_DIVERGE_NODE}
    # the fleet arms itself: most peers ingest the outlier's signature (born-wise).
    armed = _ids(ev, EventType.GOSSIP_RECEIVE, matched_origin=_DIVERGE_NODE)
    assert len(armed) >= 40


def test_batch_defect_systemic_alarm_across_cluster() -> None:
    ev = _sim("fleet50_batch_defect")
    alarms = [e for e in ev if e.event_type == EventType.SYSTEMIC_ALARM]
    assert alarms, "systemic batch-defect alarm never fired"
    assert all(e.systemic for e in alarms)
    # the whole bad-batch cluster shows the SAME premature signature at once = systemic.
    alarm_nodes = {e.node_id for e in alarms}
    assert set(_BATCH_NODES) & alarm_nodes, "no bad-batch machine raised the systemic alarm"
    assert len(alarm_nodes) >= len(_BATCH_NODES)  # cluster + healthy controls all see it systemic


def test_stale_quarantine_listen_dont_teach_at_scale() -> None:
    ev = _sim("fleet50_stale_quarantine")
    stale = [e for e in ev if e.node_id == _STALE_DRIFTER
             and e.event_type == EventType.STALE_QUARANTINE]
    assert stale, f"{_STALE_DRIFTER} never went STALE"
    stale_tick = stale[0].tick
    assert stale[0].should_teach is False              # the firebreak: stops teaching once stale
    assert _STALE_DRIFTER in _ids(ev, EventType.GOSSIP_RECEIVE)  # but keeps listening
    assert _STALE_TEACHER in _ids(ev, EventType.GOSSIP_PUBLISH)  # teacher keeps arming peers
    # honest firebreak (matches the 3-node reference exactly): the drifter may teach while still
    # trusted, but once it detects its own staleness it never teaches again -> can't poison peers.
    drifter_pubs = [e.tick for e in ev if e.node_id == _STALE_DRIFTER
                    and e.event_type == EventType.GOSSIP_PUBLISH]
    assert all(t < stale_tick for t in drifter_pubs)


@pytest.mark.parametrize("name", FLEET_SCENARIOS)
def test_schema_and_roster(name: str) -> None:
    ev = _sim(name)
    assert ev, "empty log"
    assert {e.node_id for e in ev} == set(rf.load(name)[0].nodes)  # every one of the 50 present
    assert all(e.scenario == name for e in ev)
    for e in ev:  # round-trips the exact FleetEvent schema the dashboard consumes
        assert FleetEvent.from_json(e.to_json()).logical() == e.logical()


def test_divergence_is_deterministic() -> None:
    a = [e.logical() for e in rf.simulate("fleet50_divergence")]
    b = [e.logical() for e in rf.simulate("fleet50_divergence")]
    assert a == b  # identical every run (logical fields; wall-clock ts excluded)
