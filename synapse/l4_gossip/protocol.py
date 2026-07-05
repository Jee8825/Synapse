"""L4 — gossip contribution rules (pure logic, transport-agnostic).

Separated from the Zenoh transport so the trust-gate + dedup + peer-ingest rules are testable
WITHOUT a live network. Two guarantees live here:

  - **Trust-gated, event-triggered publish** (CLAUDE.md §4): a node teaches only a CONFIRMED
    fault, only while self-trusting enough, and only once per genuinely-new fault.
  - **First-hand > hearsay**: received peer signatures are re-stamped PEER and down-weighted
    (lower confidence, faster decay) before they enter L3.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np

from synapse import config
from synapse.l2_trust.state_machine import NodeAssessment
from synapse.l3_memory.signature import FaultSignature, Provenance


def should_publish(assessment: NodeAssessment, *, tau_teach: float = config.TAU_TEACH) -> bool:
    """Trust-gate: publish iff a CONFIRMED fault on a self-trusting, non-stale node.

    # why: three independent gates — confirmed_fault (m-of-n, not a single noisy window),
    # should_teach (state != STALE), and self_trust >= tau_teach (a stricter bar than the 0.5
    # stale threshold: a node listens at 0.5 but must be solidly confident to *teach* peers).
    """
    return (
        assessment.confirmed_fault
        and assessment.should_teach
        and assessment.self_trust >= tau_teach
    )


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


@dataclass
class PublishLedger:
    """Dedups outbound publishing by SIMILARITY, so an evolving fault can't spam the wire.

    Republishes only for a genuinely new fault (cosine < tau_match vs everything taught) or a
    meaningful severity escalation (Δseverity > republish_delta) — keeping "event-triggered" true.
    """

    tau_match: float = config.TAU_MATCH
    republish_delta: float = config.REPUBLISH_SEVERITY_DELTA
    _taught: list[tuple[np.ndarray, float]] = field(default_factory=list)  # (centroid, severity)

    def register(self, sig: FaultSignature) -> bool:
        """Return True (and record) if this signature should be published; False to suppress."""
        for i, (centroid, severity) in enumerate(self._taught):
            if _cosine(centroid, sig.centroid) >= self.tau_match:
                if sig.severity - severity > self.republish_delta:
                    self._taught[i] = (sig.centroid.copy(), sig.severity)  # escalation -> re-teach
                    return True
                return False  # same fault, no meaningful change -> suppress
        self._taught.append((sig.centroid.copy(), sig.severity))  # genuinely new fault
        return True


def should_ingest(sig: FaultSignature, self_node_id: str) -> bool:
    """Ignore our own echoed signatures; ingest everyone else's."""
    return sig.origin_node_id != self_node_id


def to_peer_signature(sig: FaultSignature, *, now: float | None = None) -> FaultSignature:
    """Re-stamp a received signature as PEER and down-weight it before it enters L3.

    # why: trust first-hand evidence over hearsay — peer signatures get reduced confidence and a
    # shorter half-life so they help (born-wise recognition) but never dominate first-hand truth.
    """
    now = time.time() if now is None else now
    sig.provenance = Provenance.PEER
    sig.conf_alpha = max(1.0, sig.conf_alpha * config.PEER_CONFIDENCE_DISCOUNT)
    sig.half_life_s = config.PEER_HALF_LIFE_S
    sig.last_refresh_ts = now
    # the origin remains the teaching node; record it as a contributor for systemic detection.
    sig.contributor_ts = {sig.origin_node_id: now}
    return sig
