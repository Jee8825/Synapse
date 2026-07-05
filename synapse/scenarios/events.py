"""Structured fleet event schema — the dashboard contract (Days 9-10 will consume this).

Every scenario emits a stream of :class:`FleetEvent` as JSON lines. One shape, three scenarios,
so the dashboard has a single contract. The logical fields are deterministic per run (same
seed + fixed tick schedule); only ``ts`` (wall clock) varies, so determinism tests compare
:meth:`FleetEvent.logical`.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass


class EventType:
    TICK = "TICK"                     # per-node, per-tick assessment snapshot
    GOSSIP_PUBLISH = "GOSSIP_PUBLISH"  # node taught a confirmed signature to the fleet
    GOSSIP_RECEIVE = "GOSSIP_RECEIVE"  # node ingested a peer signature (born-wise arming)
    ESCALATE = "ESCALATE"             # confirmed novel fault -> human (UNKNOWN)
    SYSTEMIC_ALARM = "SYSTEMIC_ALARM"  # >= K distinct origins on one signature -> batch defect
    STALE_QUARANTINE = "STALE_QUARANTINE"  # node dropped to STALE -> stops teaching
    RECOVER = "RECOVER"               # STALE node re-baselined -> CONFIDENT, teaching re-enabled
    # redundant dual-channel transport (PRP + 1oo2D comparator, synapse/l4_gossip/redundancy.py):
    CHANNEL_REJECT = "CHANNEL_REJECT"     # a node's two channel copies DISAGREED -> tampered/faulted path, dropped
    CHANNEL_DEGRADED = "CHANNEL_DEGRADED"  # only one channel delivered -> accepted on a single path (other down)


@dataclass(frozen=True)
class FleetEvent:
    """One thing that happened to one node at one tick. JSON-serializable."""

    scenario: str
    tick: int
    seq: int                  # monotonic per node, for stable ordering within a tick
    node_id: str
    role: str
    act: str                  # "setup" | "trigger" | "response" (the 3-act beat)
    event_type: str
    state: str                # TrustState value
    self_trust: float
    recognition_source: str   # SELF | PEER | NONE
    matched_origin: str | None
    confirmed_fault: bool
    systemic: bool
    should_teach: bool
    detail: str
    ts: float                 # wall clock (the ONLY non-deterministic field)

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    def logical(self) -> dict:
        """Everything except the wall clock — deterministic across runs."""
        d = asdict(self)
        d.pop("ts")
        return d

    @classmethod
    def from_json(cls, line: str) -> "FleetEvent":
        return cls(**json.loads(line))
