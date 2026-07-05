"""L4 — Zenoh PEER-mode transport. Brokerless, no router, signatures-only on the wire.

Verified against the pinned ``eclipse-zenoh==1.9.0`` build (Context7 gave the API shape;
the pinned build is authoritative and confirmed it):
  - ``zenoh.Config()`` + ``config.insert_json5(key, json_value)``; ``zenoh.open(config)``.
  - ``session.declare_subscriber(key_expr, callback)``; callback gets a ``Sample`` whose
    ``sample.payload.to_bytes()`` returns the raw bytes.
  - ``session.declare_publisher(key_expr)`` + ``publisher.put(bytes)``.

Topology is a NO-SPOF full mesh: every peer listens on its own endpoint and connects to the
others — there is no rendezvous/router node to kill (CLAUDE.md §4: no single point of failure).
Multicast/gossip scouting is the zero-config LAN path for Stage 2; we disable it here and use
explicit localhost endpoints for deterministic, sandbox-safe discovery.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence

import zenoh

from synapse import config
from synapse.l3_memory.signature import FaultSignature


def peer_config(listen_endpoints: Sequence[str], connect_endpoints: Sequence[str]) -> zenoh.Config:
    """Build a brokerless PEER-mode Zenoh config (no router; explicit mesh endpoints)."""
    conf = zenoh.Config()
    conf.insert_json5("mode", json.dumps("peer"))
    # why: disable multicast scouting so discovery is deterministic on localhost/CI; the explicit
    # listen+connect endpoints form a direct peer mesh with NO router process.
    conf.insert_json5("scouting/multicast/enabled", "false")
    conf.insert_json5("listen/endpoints", json.dumps(list(listen_endpoints)))
    conf.insert_json5("connect/endpoints", json.dumps(list(connect_endpoints)))
    return conf


class GossipTransport:
    """A node's Zenoh peer session: publishes its signatures, routes peers' into a callback."""

    def __init__(
        self,
        *,
        node_id: str,
        listen_endpoints: Sequence[str],
        connect_endpoints: Sequence[str],
        on_signature: Callable[[FaultSignature], None],
        fleet_id: str = config.FLEET_ID,
    ) -> None:
        self.node_id = node_id
        self._on_signature = on_signature
        self._session = zenoh.open(peer_config(listen_endpoints, connect_endpoints))
        base = f"{config.KEY_PREFIX}/{fleet_id}/signatures"
        self._pub_key = f"{base}/{node_id}"            # this node publishes under its own origin
        self._sub_key = f"{base}/**"                   # subscribe to every peer
        self._subscriber = self._session.declare_subscriber(self._sub_key, self._on_sample)
        self._publisher = self._session.declare_publisher(self._pub_key)

    def _on_sample(self, sample: "zenoh.Sample") -> None:
        # Only compact signature bytes ever cross the wire; reconstruct and hand off.
        sig = FaultSignature.from_bytes(sample.payload.to_bytes())
        self._on_signature(sig)

    def publish(self, sig: FaultSignature) -> None:
        """Publish a signature (compact bytes only — never raw telemetry)."""
        self._publisher.put(sig.to_bytes())

    @property
    def pub_key(self) -> str:
        return self._pub_key

    def close(self) -> None:
        self._session.close()

    def __enter__(self) -> "GossipTransport":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
