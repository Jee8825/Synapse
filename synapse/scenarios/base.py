"""Scenario spec + per-node data contract shared by the three scenarios and the runners.

A scenario is pure orchestration: a fixed roster, a fixed tick schedule, 3-act boundaries, and
a per-node FeatureVector timeline. It schedules WHEN each node switches source; the real L1-L4
stack decides WHAT happens.
"""

from __future__ import annotations

import importlib
from dataclasses import dataclass, replace

from synapse.sensors.base import FeatureVector


@dataclass(frozen=True)
class ScenarioSpec:
    name: str
    narrative: str
    n_ticks: int
    nodes: tuple[str, ...]            # roster, e.g. ("A", "B", "C")
    roles: dict[str, str]
    acts: tuple[tuple[int, str], ...]  # (start_tick, label), ascending; labels: setup/trigger/response
    base_port: int
    settle_s: float = 0.15            # per-tick gossip-propagation pause in the barrier                   # full-mesh ports: base_port + index(node)
    recover_after: int | None = None  # if set, STALE nodes auto-recover after N baseline-returned windows
    # opt-in redundant dual-channel transport (default OFF -> every existing scenario byte-identical).
    # When True, the offline bus relays each publication over TWO channels through a per-node
    # comparator (PRP + 1oo2D). channel_tamper = ((receiver, origin), ...): corrupt that receiver's
    # path-B copy from that origin, so the comparator's mismatch/reject path is exercised.
    dual_channel: bool = False
    channel_tamper: tuple[tuple[str, str], ...] = ()

    def act_for(self, tick: int) -> str:
        act = self.acts[0][1]
        for start, label in self.acts:
            if tick >= start:
                act = label
        return act

    def endpoints(self, node_id: str) -> tuple[list[str], list[str]]:
        """Full-mesh peer endpoints (no rendezvous): listen on own port, connect to the others."""
        ports = {n: self.base_port + i for i, n in enumerate(self.nodes)}
        listen = [f"tcp/127.0.0.1:{ports[node_id]}"]
        connect = [f"tcp/127.0.0.1:{p}" for n, p in ports.items() if n != node_id]
        return listen, connect


@dataclass(frozen=True)
class NodeData:
    """Everything a single node process needs to play its part."""

    role: str
    calibration_fvs: list[FeatureVector]   # healthy windows for L1/L2 calibration
    timeline_fvs: list[FeatureVector]      # one FeatureVector per tick (len == spec.n_ticks)


def build_timeline(
    node_id: str, segments: list[tuple[list[FeatureVector], int]]
) -> list[FeatureVector]:
    """Concatenate source segments (each cycled to its length) into a tick-stamped timeline.

    Each segment ``(source_fvs, length)`` is filled by cycling its source, so a short CWRU
    recording can drive a longer phase deterministically. FVs are re-stamped with sequential
    ticks and this node's id (label kept — it's eval-only).
    """
    flat: list[FeatureVector] = []
    for src, length in segments:
        if not src:
            raise ValueError("empty source segment")
        flat += [src[i % len(src)] for i in range(length)]
    return [replace(fv, tick=i, node_id=node_id) for i, fv in enumerate(flat)]


def load(name: str):
    """Return (spec, node_data_fn) for a scenario by name (3-node module or fleet50_* parametric)."""
    if name in FLEET_SCENARIOS:
        # why: fleet50_* scenarios are parametric (one generator for N=50 nodes), not one module
        # each — so they dispatch to synapse.scenarios.fleet instead of a per-name module. Lazy
        # import keeps base.py free of a circular dependency (fleet imports from base).
        from synapse.scenarios import fleet
        return fleet.spec_for(name), fleet.node_data_for(name)
    mod = importlib.import_module(f"synapse.scenarios.{name}")
    return mod.SPEC, mod.node_data


# The locked Round-1 deliverable: 3 nodes on REAL Zenoh peer P2P (scripts/run_scenario.py).
SCENARIOS = ("divergence", "batch_defect", "stale_quarantine")

# Offline 3-node scenarios exercising the same real L1-L4 stack over the deterministic in-process
# bus (scripts/run_offline_scenario.py) — same honesty boundary as the fleet50_* logs: real
# WorkerModel->NodeAssessor->CaseMemory + gossip rules; only the TRANSPORT is the in-process bus,
# not 3 Zenoh processes. Used where byte-for-byte determinism matters (the recovery demo beat) or
# a beat the latched-drift Zenoh core does not exercise (STALE self-recovery via recalibrate()).
OFFLINE_SCENARIOS = ("cross_learning", "stale_recovery", "comms_integrity")

# Fleet-scale VISUALIZATION data: the SAME real L1-L4 logic run OFFLINE for N=50 nodes over an
# in-process bus -> events/fleet50_*.jsonl (scripts/run_fleet_scenario.py). NOT 50 Zenoh
# processes; the live peer P2P transport stays the 3-process core above (addendum 2026-06-27).
FLEET_SCENARIOS = ("fleet50_divergence", "fleet50_batch_defect", "fleet50_stale_quarantine")

# Everything the dashboard's read-only /api/events/{scenario} path may serve.
ALL_SCENARIOS = SCENARIOS + OFFLINE_SCENARIOS + FLEET_SCENARIOS
