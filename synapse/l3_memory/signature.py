"""FaultSignature — the compact, standardized fault fingerprint (the ONLY thing gossiped).

A signature is a centroid of confirmed-fault FeatureVectors **in z-space** (standardized by the
node's healthy per-feature stats), plus provenance, Bayesian confidence, and decay metadata. It
carries NO raw window samples — that is the "signatures only on the wire" guarantee (CLAUDE.md
§2), and it is enforced structurally (there is no field that can hold a window) and asserted by a
test on the serialized bytes.

Wire format (little-endian, versioned): header + float32 centroid + fixed metadata + two
length-prefixed strings (origin_node_id, signature_id). For 11 features this is ~106 bytes —
two orders of magnitude smaller than a single raw 2048-sample window.
"""

from __future__ import annotations

import hashlib
import struct
from dataclasses import dataclass, field
from enum import Enum

import numpy as np


class Provenance(str, Enum):
    FIRST_HAND = "first_hand"  # this node personally confirmed it
    PEER = "peer"              # learned from a gossiped peer signature (hearsay)


_WIRE_VERSION = 1
# fixed metadata block packed after the centroid: severity, sample_count, conf_alpha, conf_beta,
# first_seen_tick, last_seen_tick, created_ts, half_life_s
_META_FMT = "<f I f f i i d f"
_HEAD_FMT = "<B I H"  # version, schema_id, n_features


def schema_id_for(feature_names: tuple[str, ...]) -> int:
    """Stable 32-bit id of the feature schema (so two nodes never compare across schemas)."""
    h = hashlib.blake2b("\x1f".join(feature_names).encode(), digest_size=4).digest()
    return int.from_bytes(h, "little")


@dataclass
class FaultSignature:
    """A compact fault fingerprint. ``centroid`` is in standardized (z-score) feature space."""

    centroid: np.ndarray            # float32, shape (n_features,), z-space
    schema_id: int
    origin_node_id: str
    severity: float                 # [0,1] = mean (1 - p_value) of supporting windows
    sample_count: int               # supporting evidence count (Bayesian alpha contribution)
    provenance: Provenance = Provenance.FIRST_HAND
    conf_alpha: float = 1.0         # Beta posterior alpha (prior 1)
    conf_beta: float = 1.0          # Beta posterior beta  (prior 1)
    first_seen_tick: int = 0
    last_seen_tick: int = 0
    created_ts: float = 0.0
    last_refresh_ts: float = 0.0
    half_life_s: float = 3600.0
    # local-only aggregation (NOT serialized to the wire):
    contributor_ts: dict[str, float] = field(default_factory=dict)  # origin -> last contribution ts
    in_conflict: bool = False
    systemic: bool = False
    signature_id: str = ""

    def __post_init__(self) -> None:
        self.centroid = np.asarray(self.centroid, dtype=np.float32).ravel()
        if not self.signature_id:
            self.signature_id = self._content_hash()

    def _content_hash(self) -> str:
        # why: content-addressed id from the (quantized) centroid + schema -> identical faults get
        # identical ids, and the id is stable across serialization. Quantize so float noise in the
        # last bits doesn't change the id.
        q = np.round(self.centroid.astype(np.float64), 4).astype("<f4").tobytes()
        h = hashlib.blake2b(q + self.schema_id.to_bytes(4, "little"), digest_size=8)
        return h.hexdigest()

    @property
    def confidence(self) -> float:
        return self.conf_alpha / (self.conf_alpha + self.conf_beta)

    def decayed_confidence(self, now: float) -> float:
        """Confidence after exponential decay since last refresh (recency-weighted trust)."""
        dt = max(0.0, now - self.last_refresh_ts)
        return self.confidence * (0.5 ** (dt / self.half_life_s))

    @property
    def contributing_nodes(self) -> set[str]:
        return set(self.contributor_ts)

    # --- compact serialization (signatures only on the wire) -------------------------------

    def to_bytes(self) -> bytes:
        """Serialize to the compact wire form. Local-only fields are intentionally excluded."""
        head = struct.pack(_HEAD_FMT, _WIRE_VERSION, self.schema_id, self.centroid.size)
        body = self.centroid.astype("<f4").tobytes()
        meta = struct.pack(
            _META_FMT, float(self.severity), int(self.sample_count), float(self.conf_alpha),
            float(self.conf_beta), int(self.first_seen_tick), int(self.last_seen_tick),
            float(self.created_ts), float(self.half_life_s),
        )
        origin = self.origin_node_id.encode()
        sid = self.signature_id.encode()
        tail = struct.pack("<B", len(origin)) + origin + struct.pack("<B", len(sid)) + sid
        return head + body + meta + tail

    @classmethod
    def from_bytes(cls, raw: bytes) -> "FaultSignature":
        off = struct.calcsize(_HEAD_FMT)
        version, schema_id, n = struct.unpack(_HEAD_FMT, raw[:off])
        if version != _WIRE_VERSION:
            raise ValueError(f"unsupported signature wire version {version}")
        centroid = np.frombuffer(raw[off:off + 4 * n], dtype="<f4").copy()
        off += 4 * n
        meta_size = struct.calcsize(_META_FMT)
        (severity, sample_count, conf_alpha, conf_beta, first_seen, last_seen,
         created_ts, half_life) = struct.unpack(_META_FMT, raw[off:off + meta_size])
        off += meta_size
        olen = raw[off]; off += 1
        origin = raw[off:off + olen].decode(); off += olen
        slen = raw[off]; off += 1
        sid = raw[off:off + slen].decode(); off += slen
        return cls(
            centroid=centroid, schema_id=schema_id, origin_node_id=origin, severity=severity,
            sample_count=sample_count, conf_alpha=conf_alpha, conf_beta=conf_beta,
            first_seen_tick=first_seen, last_seen_tick=last_seen, created_ts=created_ts,
            half_life_s=half_life, signature_id=sid,
        )
