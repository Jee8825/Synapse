"""Scenario integration tests — run each as a real multi-process fleet and assert its KEY beat
on the emitted event log, plus determinism. Heavy (spawns processes); skipped without CWRU/Zenoh.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import scripts.run_scenario as rs
from synapse.scenarios.events import EventType, FleetEvent
from synapse.scenarios.sources import cwru_available


def _zenoh_ok() -> bool:
    try:
        import zenoh

        from synapse.l4_gossip.transport import peer_config

        s = zenoh.open(peer_config(["tcp/127.0.0.1:7611"], []))
        s.close()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not (cwru_available("normal", "inner_race") and _zenoh_ok()),
    reason="scenarios need CWRU data + a Zenoh peer session",
)


def _events(name: str) -> list[FleetEvent]:
    out = rs._run(name)
    return [FleetEvent.from_json(ln) for ln in Path(out).read_text().splitlines() if ln.strip()]


def test_divergence_fleet_catches_and_arms_peers() -> None:
    ev = _events("divergence")
    assert any(e.node_id == "A" and e.event_type == EventType.GOSSIP_PUBLISH for e in ev)
    assert any(e.node_id == "A" and e.event_type == EventType.ESCALATE for e in ev)  # A diverges
    for peer in ("B", "C"):  # healthy peers receive A's signature -> born-wise armed
        assert any(
            e.node_id == peer and e.event_type == EventType.GOSSIP_RECEIVE and e.matched_origin == "A"
            for e in ev
        )


def test_batch_defect_systemic_alarm_fires() -> None:
    ev = _events("batch_defect")
    alarms = [e for e in ev if e.event_type == EventType.SYSTEMIC_ALARM]
    assert alarms, "systemic batch-defect alarm never fired"
    assert all(e.systemic for e in alarms)
    # the climax: the healthy control C raises the batch alarm from peer knowledge alone.
    assert any(e.node_id == "C" for e in alarms)


def test_stale_quarantine_listen_dont_teach() -> None:
    ev = _events("stale_quarantine")
    stale = [e for e in ev if e.node_id == "C" and e.event_type == EventType.STALE_QUARANTINE]
    assert stale, "C never went STALE"
    assert stale[0].should_teach is False  # stops teaching so it can't poison the fleet
    assert any(  # but keeps listening: it received A's knowledge
        e.node_id == "C" and e.event_type == EventType.GOSSIP_RECEIVE for e in ev
    )


def test_divergence_is_deterministic() -> None:
    a = [e.logical() for e in _events("divergence")]
    b = [e.logical() for e in _events("divergence")]
    assert a == b  # identical every run (logical fields; ts excluded)
