"""FleetNode — minimal L1→L2→L3→L4 integrator for a single node.

Enough wiring to make the fleet real and testable: detect (L1) → self-trust (L2) → remember
(L3) → gossip (L4), with the L2 recognizer now backed by L3 case memory. Full multi-node
scenario orchestration is Days 7-8; this stays deliberately minimal (CLAUDE.md §12 scope).

The seam that was a stub in L2 is now live: ``recognizer`` queries L3 over a short rolling
mini-centroid, so a window matching a PEER signature resolves to born-wise CONFIDENT instead
of UNKNOWN — no human in the loop.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable, Sequence

import numpy as np

from synapse import config
from synapse.l1_worker.detector import WorkerModel
from synapse.l2_trust.state_machine import NodeAssessment, NodeAssessor
from synapse.l3_memory.signature import FaultSignature
from synapse.l3_memory.store import AddResult, CaseMemory
from synapse.l4_gossip.protocol import PublishLedger, should_ingest, should_publish, to_peer_signature
from synapse.l4_gossip.transport import GossipTransport
from synapse.sensors.base import FeatureVector


class FleetNode:
    """One fleet node: ingest windows, detect+trust, remember, and gossip confirmed faults."""

    def __init__(
        self,
        *,
        node_id: str,
        healthy_fvs: Sequence[FeatureVector],
        train_frac: float = 0.6,
        listen_endpoints: Sequence[str] | None = None,
        connect_endpoints: Sequence[str] | None = None,
        fleet_id: str = config.FLEET_ID,
        sig_window: int = config.RECOGNITION_WINDOW,
        random_state: int = 0,
        now_fn=time.time,
        on_peer_received: "Callable[[FaultSignature, AddResult], None] | None" = None,
        recover_after: int | None = None,
    ) -> None:
        if len(healthy_fvs) < 4:
            raise ValueError("need a few healthy FeatureVectors to train + calibrate")
        self.node_id = node_id
        self._now = now_fn
        self._on_peer_received = on_peer_received  # observability hook (no behavior change)
        self._lock = threading.Lock()  # transport callbacks mutate L3 from another thread

        split = max(2, int(len(healthy_fvs) * train_frac))
        train, calib = list(healthy_fvs[:split]), list(healthy_fvs[split:]) or list(healthy_fvs[-2:])

        # L1
        self.model = WorkerModel(random_state=random_state).fit(train)
        # per-feature healthy stats for L3 z-standardization (cross-node comparable for an
        # identical-machine fleet — CLAUDE.md §4)
        X = np.vstack([fv.values for fv in healthy_fvs])
        feature_mean, feature_std = X.mean(axis=0), X.std(axis=0)
        names = healthy_fvs[0].names

        # Winsorization bound derived from HEALTHY calibration ONLY (max |z| over healthy windows)
        # -> non-circular: the clip never sees a fault. Validated to land inside a broad 4..16
        # separation plateau (see "test: winsorization robustness").
        z_healthy = np.abs((X - feature_mean) / np.maximum(feature_std, 1e-9))
        z_clip = float(z_healthy.max())

        # L3
        self.memory = CaseMemory(
            node_id=node_id, feature_mean=feature_mean, feature_std=feature_std,
            feature_names=names, z_clip=z_clip, now_fn=now_fn,
        )

        # L2 recognizer over a short rolling mini-centroid (not a single window) -> L3
        self._recent: deque[np.ndarray] = deque(maxlen=sig_window)

        def recognizer(fv: FeatureVector):
            self._recent.append(np.asarray(fv.values, dtype=np.float64))
            mini = np.mean(self._recent, axis=0)
            with self._lock:
                return self.memory.recognize(mini, now=self._now())

        self.assessor = NodeAssessor(
            self.model, node_id=node_id, recognizer=recognizer, recover_after=recover_after
        )
        self.assessor.calibrate(calib)

        # L4
        self.ledger = PublishLedger()
        self._fault_evidence: deque[tuple[FeatureVector, float]] = deque(maxlen=sig_window)
        self.last_publish: FaultSignature | None = None
        self.transport: GossipTransport | None = None
        if listen_endpoints is not None:
            self.transport = GossipTransport(
                node_id=node_id, listen_endpoints=listen_endpoints,
                connect_endpoints=connect_endpoints or [], on_signature=self._on_peer_signature,
                fleet_id=fleet_id,
            )

    # --- inbound peer gossip --------------------------------------------------------------

    def _on_peer_signature(self, sig: FaultSignature) -> AddResult | None:
        """Transport callback: ingest a peer signature (down-weighted) into L3."""
        if not should_ingest(sig, self.node_id):
            return None
        peer = to_peer_signature(sig, now=self._now())
        with self._lock:
            result = self.memory.add(peer, now=self._now())
        if self._on_peer_received is not None:
            self._on_peer_received(peer, result)  # observability only
        return result

    # --- per-window pipeline --------------------------------------------------------------

    def observe(self, fv: FeatureVector) -> NodeAssessment:
        """Run one window through L1→L2; on a trusted confirmed fault, remember + gossip it."""
        assessment = self.assessor.assess(fv)

        # accumulate anomalous windows (incl. those leading up to confirmation) as the evidence
        # the signature centroid is built from — a richer fingerprint than a single window.
        if assessment.calibrated_pvalue <= config.ALPHA:
            self._fault_evidence.append((fv, 1.0 - assessment.calibrated_pvalue))

        if should_publish(assessment) and self._fault_evidence:
            fvs = [f for f, _ in self._fault_evidence]
            sevs = [s for _, s in self._fault_evidence]
            sig = self.memory.make_signature(fvs, sevs, tick=assessment.tick, now=self._now())
            with self._lock:
                self.memory.add(sig, now=self._now())          # first-hand into own memory
            if self.ledger.register(sig):                      # dedup by similarity -> event-triggered
                # snapshot the exact wire payload — `sig` is aliased to the stored L3 entry and
                # would keep mutating as the fault re-merges on later ticks.
                self.last_publish = FaultSignature.from_bytes(sig.to_bytes())
                if self.transport is not None:
                    self.transport.publish(sig)
        return assessment

    def close(self) -> None:
        if self.transport is not None:
            self.transport.close()

    def __enter__(self) -> "FleetNode":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
