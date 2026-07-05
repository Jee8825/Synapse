"""L3 — CaseMemory: the bounded, decaying, self-deduplicating fault-signature store.

Reuses the principles of Jee's "Recall" memory engine — provenance, decay, Bayesian
confidence, conflict detection — applied to fault signatures (CLAUDE.md §4).

Design choices (challenged hardest in Q&A, so each carries a `# why:`):
  - Similarity is **cosine on z-space centroids**. At N=3 nodes / ≤dozens of signatures we use
    exact numpy brute force, NOT FAISS: flat exact search is correct and fastest at this scale;
    an IVF/HNSW index would be deployment-scale theater here (CLAUDE.md §7 sanctions numpy).
  - Dedup/merge collapses the same fault into one entry; confidence is a Beta posterior updated
    with evidence; decay is recency-weighted; eviction is a composite (never random).
  - Systemic batch-defect: a signature seen by >= K distinct origins within a window is flagged
    systemic (Scenario 2) — the fleet capability per-machine monitoring is blind to.
"""

from __future__ import annotations

import time
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from synapse import config
from synapse.l2_trust.state_machine import RecognitionResult, RecognitionSource
from synapse.l3_memory.signature import FaultSignature, Provenance, schema_id_for
from synapse.sensors.base import FeatureVector

_EPS = 1e-9


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    if na < _EPS or nb < _EPS:
        return 0.0  # a (near-)zero vector (e.g. a healthy z-centroid) matches nothing
    return float(np.dot(a, b) / (na * nb))


@dataclass
class AddResult:
    signature_id: str
    merged: bool
    conflict: bool = False
    systemic: bool = False


@dataclass
class Match:
    signature: FaultSignature
    similarity: float
    decayed_confidence: float


class CaseMemory:
    """Per-node fault-signature store with dedup/merge, decay, eviction, conflict, systemic."""

    def __init__(
        self,
        *,
        node_id: str,
        feature_mean: np.ndarray,
        feature_std: np.ndarray,
        feature_names: tuple[str, ...],
        capacity: int = config.STORE_CAPACITY,
        tau_match: float = config.TAU_MATCH,
        z_clip: float = config.Z_CLIP,
        now_fn=time.time,
    ) -> None:
        self.node_id = node_id
        self._mean = np.asarray(feature_mean, dtype=np.float64).ravel()
        # floor std so a zero-variance feature can't blow up standardization.
        self._std = np.maximum(np.asarray(feature_std, dtype=np.float64).ravel(), _EPS)
        # winsorization bound. Normally HEALTHY-DERIVED (FleetNode passes max|z| over healthy
        # calibration) -> non-circular. config.Z_CLIP is only the fallback for direct construction.
        self._z_clip = float(z_clip)
        self.feature_names = tuple(feature_names)
        self.schema_id = schema_id_for(self.feature_names)
        self.capacity = capacity
        self.tau_match = tau_match
        self._now = now_fn
        self._sigs: dict[str, FaultSignature] = {}
        self._access: dict[str, int] = {}  # query-hit frequency, for eviction

    # --- helpers --------------------------------------------------------------------------

    def standardize(self, values: np.ndarray) -> np.ndarray:
        """z = clip((x - healthy_mean) / healthy_std, +/-Z_CLIP).

        Makes features comparable + cross-node aligned. The clip winsorizes heavy-tailed features
        (raw FFT-band energies have tiny healthy variance -> huge z) so no single feature dominates
        the cosine direction and the discriminative defect-frequency features actually count.
        Applied identically to stored centroids and query vectors, so comparisons stay consistent.
        """
        z = (np.asarray(values, dtype=np.float64).ravel() - self._mean) / self._std
        return np.clip(z, -self._z_clip, self._z_clip)

    def make_signature(
        self, fault_fvs: Sequence[FeatureVector], severities: Sequence[float], *, tick: int,
        now: float | None = None,
    ) -> FaultSignature:
        """Build a FIRST-HAND signature from confirmed-fault FeatureVectors (z-space centroid)."""
        if len(fault_fvs) == 0:
            raise ValueError("need at least one supporting FeatureVector")
        now = self._now() if now is None else now
        z = np.mean([self.standardize(fv.values) for fv in fault_fvs], axis=0).astype(np.float32)
        n = len(fault_fvs)
        return FaultSignature(
            centroid=z, schema_id=self.schema_id, origin_node_id=self.node_id,
            severity=float(np.mean(severities)), sample_count=n,
            provenance=Provenance.FIRST_HAND,
            conf_alpha=1.0 + n, conf_beta=1.0,            # Beta(1,1) prior + n supporting obs
            first_seen_tick=tick, last_seen_tick=tick,
            created_ts=now, last_refresh_ts=now, half_life_s=config.FIRST_HAND_HALF_LIFE_S,
            contributor_ts={self.node_id: now},
        )

    def _best_match(self, centroid: np.ndarray) -> tuple[str | None, float]:
        best_id, best = None, -1.0
        for sid, sig in self._sigs.items():
            c = _cosine(centroid, sig.centroid)
            if c > best:
                best_id, best = sid, c
        return best_id, best

    # --- add / dedup / merge / conflict / systemic ----------------------------------------

    def add(self, sig: FaultSignature, *, now: float | None = None) -> AddResult:
        now = self._now() if now is None else now
        if sig.schema_id != self.schema_id:
            raise ValueError("signature schema_id does not match this node's feature schema")

        best_id, best_cos = self._best_match(sig.centroid)
        if best_id is not None and best_cos >= self.tau_match:
            existing = self._sigs[best_id]
            # conflict: same region but the two assessments disagree on severity (Recall principle)
            if abs(existing.severity - sig.severity) > config.SEVERITY_CONFLICT_MARGIN:
                # why: don't let a disagreeing claim silently overwrite — flag it, lower confidence
                # (push Beta beta up), record the contributor, and surface for escalation.
                existing.in_conflict = True
                existing.conf_beta += sig.sample_count
                self._record_contributors(existing, sig, now)
                self._update_systemic(existing, now)
                return AddResult(best_id, merged=True, conflict=True, systemic=existing.systemic)

            # normal merge: evidence-weighted centroid + Bayesian confidence bump + recency refresh
            total = existing.sample_count + sig.sample_count
            existing.centroid = (
                (existing.centroid * existing.sample_count + sig.centroid * sig.sample_count) / total
            ).astype(np.float32)
            existing.sample_count = total
            existing.severity = max(existing.severity, sig.severity)
            existing.conf_alpha += sig.sample_count
            existing.last_seen_tick = max(existing.last_seen_tick, sig.last_seen_tick)
            existing.last_refresh_ts = now
            if sig.provenance is Provenance.FIRST_HAND:
                existing.provenance = Provenance.FIRST_HAND  # first-hand dominates hearsay
            self._record_contributors(existing, sig, now)
            self._update_systemic(existing, now)
            return AddResult(best_id, merged=True, conflict=False, systemic=existing.systemic)

        # new entry
        sig.contributor_ts.setdefault(sig.origin_node_id, now)
        self._sigs[sig.signature_id] = sig
        self._access.setdefault(sig.signature_id, 0)
        self._update_systemic(sig, now)
        self._evict_if_needed(now)
        return AddResult(sig.signature_id, merged=False, conflict=False, systemic=sig.systemic)

    def _record_contributors(self, existing: FaultSignature, incoming: FaultSignature, now: float) -> None:
        for origin in incoming.contributing_nodes | {incoming.origin_node_id}:
            existing.contributor_ts[origin] = now

    def _update_systemic(self, sig: FaultSignature, now: float) -> None:
        """systemic = >= K distinct origins contributed within the recent time window."""
        recent = [o for o, ts in sig.contributor_ts.items() if now - ts <= config.SYSTEMIC_WINDOW_S]
        sig.systemic = len(recent) >= config.SYSTEMIC_K

    # --- query / recognize ----------------------------------------------------------------

    def query(self, values: np.ndarray, *, now: float | None = None) -> Match | None:
        """Best matching signature for a (raw) feature vector, or None below tau_match."""
        now = self._now() if now is None else now
        z = self.standardize(values)
        best_id, best_cos = self._best_match(z)
        if best_id is None or best_cos < self.tau_match:
            return None
        sig = self._sigs[best_id]
        self._access[best_id] = self._access.get(best_id, 0) + 1  # frequency bump
        return Match(signature=sig, similarity=best_cos, decayed_confidence=sig.decayed_confidence(now))

    def recognize(self, values: np.ndarray, *, now: float | None = None) -> RecognitionResult:
        """Recognition for L2: SELF (first-hand) / PEER (born-wise) / NONE.

        Always reports the best cosine (``similarity``) — even when it falls below tau_match and
        resolves to NONE — so the discrimination margin is observable (visible non-circularity).
        """
        z = self.standardize(values)
        best_id, best_cos = self._best_match(z)
        if best_id is None:
            return RecognitionResult(RecognitionSource.NONE, similarity=0.0)
        if best_cos < self.tau_match:
            return RecognitionResult(RecognitionSource.NONE, similarity=best_cos)
        sig = self._sigs[best_id]
        self._access[best_id] = self._access.get(best_id, 0) + 1  # frequency bump
        source = (
            RecognitionSource.SELF if sig.provenance is Provenance.FIRST_HAND
            else RecognitionSource.PEER
        )
        return RecognitionResult(source, sig.signature_id, sig.origin_node_id, similarity=best_cos)

    # --- bounded eviction -----------------------------------------------------------------

    def _evict_if_needed(self, now: float) -> None:
        """Composite eviction (recency + frequency + severity) — never random (CLAUDE.md §4)."""
        if len(self._sigs) <= self.capacity:
            return
        max_freq = max(
            (self._access.get(s, 0) + sig.sample_count for s, sig in self._sigs.items()), default=1
        )
        while len(self._sigs) > self.capacity:
            worst_id, worst_score = None, None
            for sid, sig in self._sigs.items():
                recency = 0.5 ** (max(0.0, now - sig.last_refresh_ts) / sig.half_life_s)
                freq = (self._access.get(sid, 0) + sig.sample_count) / max(max_freq, 1)
                composite = (
                    config.EVICT_W_RECENCY * recency
                    + config.EVICT_W_FREQUENCY * freq
                    + config.EVICT_W_SEVERITY * sig.severity
                )
                if worst_score is None or composite < worst_score:
                    worst_id, worst_score = sid, composite
            del self._sigs[worst_id]
            self._access.pop(worst_id, None)

    # --- introspection --------------------------------------------------------------------

    @property
    def signatures(self) -> list[FaultSignature]:
        return list(self._sigs.values())

    def __len__(self) -> int:
        return len(self._sigs)
