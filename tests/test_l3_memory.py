"""L3 tests — signature serialization/compactness, dedup/merge, decay, eviction, conflict,
systemic batch-defect, and SELF/PEER/NONE recognition.
"""

from __future__ import annotations

import numpy as np
import pytest

from synapse.l2_trust.state_machine import RecognitionSource
from synapse.l3_memory.signature import FaultSignature, Provenance, schema_id_for
from synapse.l3_memory.store import CaseMemory
from synapse.sensors.base import FeatureVector

NAMES = tuple(f"f{i}" for i in range(11))
FLAT_NOW = 1000.0


def _mem(**kw) -> CaseMemory:
    return CaseMemory(
        node_id="A", feature_mean=np.zeros(11), feature_std=np.ones(11),
        feature_names=NAMES, now_fn=lambda: FLAT_NOW, **kw,
    )


def _fault_fv(direction: np.ndarray, tick: int) -> FeatureVector:
    return FeatureVector("A", tick, "fault", NAMES, np.asarray(direction, dtype=float))


def _dir(*idx: int) -> np.ndarray:
    v = np.zeros(11)
    for i in idx:
        v[i] = 5.0
    return v


# --------------------------------------------------------------------- signature compactness


def test_signature_roundtrip_and_compact_and_no_raw_window() -> None:
    mem = _mem()
    sig = mem.make_signature([_fault_fv(_dir(0, 1, 2), i) for i in range(3)], [0.9, 0.9, 0.9],
                             tick=3, now=FLAT_NOW)
    raw = sig.to_bytes()
    back = FaultSignature.from_bytes(raw)

    assert len(raw) < 256                       # "compact" claim, asserted
    assert sig.centroid.size == 11              # fingerprint, NOT a 2048-sample window
    assert back.signature_id == sig.signature_id
    assert np.allclose(back.centroid, sig.centroid)
    assert back.severity == pytest.approx(sig.severity, abs=1e-6)  # float32 wire precision
    # the "signatures only" guarantee: a raw window would be >8 KB; 11 floats can't hide one.
    assert len(raw) <= 11 * 4 + 128


# ---------------------------------------------------------------------------- add / dedup


def test_add_query_roundtrip() -> None:
    mem = _mem()
    sig = mem.make_signature([_fault_fv(_dir(0, 1, 2), 0)], [0.9], tick=0, now=FLAT_NOW)
    mem.add(sig, now=FLAT_NOW)
    match = mem.query(_dir(0, 1, 2), now=FLAT_NOW)
    assert match is not None
    assert match.similarity > 0.99
    assert match.signature.signature_id == sig.signature_id


def test_dedup_same_fault_twice_is_one_entry_count_two() -> None:
    mem = _mem()
    for tick in (0, 5):
        mem.add(mem.make_signature([_fault_fv(_dir(0, 1, 2), tick)], [0.9], tick=tick, now=FLAT_NOW),
                now=FLAT_NOW)
    assert len(mem) == 1
    assert mem.signatures[0].sample_count == 2


def test_merge_raises_bayesian_confidence() -> None:
    mem = _mem()
    s = mem.make_signature([_fault_fv(_dir(0, 1, 2), 0)], [0.9], tick=0, now=FLAT_NOW)
    mem.add(s, now=FLAT_NOW)
    c1 = mem.signatures[0].confidence
    mem.add(mem.make_signature([_fault_fv(_dir(0, 1, 2), 1)], [0.9], tick=1, now=FLAT_NOW), now=FLAT_NOW)
    assert mem.signatures[0].confidence > c1  # more evidence -> higher confidence


def test_decay_reduces_confidence_over_time() -> None:
    mem = _mem()
    sig = mem.make_signature([_fault_fv(_dir(0, 1, 2), 0)], [0.9], tick=0, now=FLAT_NOW)
    mem.add(sig, now=FLAT_NOW)
    fresh = mem.query(_dir(0, 1, 2), now=FLAT_NOW).decayed_confidence
    later = mem.query(_dir(0, 1, 2), now=FLAT_NOW + sig.half_life_s).decayed_confidence
    assert later < fresh
    assert later == pytest.approx(fresh * 0.5, rel=1e-6)


# --------------------------------------------------------------------------- conflict / systemic


def test_conflict_fires_on_severity_disagreement() -> None:
    mem = _mem()
    mem.add(mem.make_signature([_fault_fv(_dir(0, 1, 2), 0)], [0.95], tick=0, now=FLAT_NOW), now=FLAT_NOW)
    # same region, but a contradictory low-severity assessment
    benign = mem.make_signature([_fault_fv(_dir(0, 1, 2), 1)], [0.1], tick=1, now=FLAT_NOW)
    result = mem.add(benign, now=FLAT_NOW)
    assert result.conflict
    assert mem.signatures[0].in_conflict


def test_systemic_fires_for_two_distinct_origins_not_one_twice() -> None:
    schema = schema_id_for(NAMES)
    # one node seeing it twice -> NOT systemic
    solo = _mem()
    for tick in (0, 1):
        solo.add(solo.make_signature([_fault_fv(_dir(3, 4), tick)], [0.9], tick=tick, now=FLAT_NOW),
                 now=FLAT_NOW)
    assert not solo.signatures[0].systemic
    assert solo.signatures[0].contributing_nodes == {"A"}

    # same fault confirmed on TWO nodes -> systemic
    fleet = _mem()
    fleet.add(fleet.make_signature([_fault_fv(_dir(3, 4), 0)], [0.9], tick=0, now=FLAT_NOW), now=FLAT_NOW)
    peer = FaultSignature(centroid=fleet.signatures[0].centroid.copy(), schema_id=schema,
                          origin_node_id="B", severity=0.9, sample_count=1, provenance=Provenance.PEER,
                          contributor_ts={"B": FLAT_NOW})
    res = fleet.add(peer, now=FLAT_NOW)
    assert res.systemic
    assert fleet.signatures[0].contributing_nodes == {"A", "B"}


# --------------------------------------------------------------------------- eviction


def test_bounded_eviction_drops_lowest_composite() -> None:
    mem = _mem(capacity=2)
    # three distinct fault directions, same recency/frequency -> severity decides who is evicted.
    mem.add(mem.make_signature([_fault_fv(_dir(0), 0)], [0.9], tick=0, now=FLAT_NOW), now=FLAT_NOW)
    mem.add(mem.make_signature([_fault_fv(_dir(5), 1)], [0.8], tick=1, now=FLAT_NOW), now=FLAT_NOW)
    mem.add(mem.make_signature([_fault_fv(_dir(9), 2)], [0.1], tick=2, now=FLAT_NOW), now=FLAT_NOW)
    assert len(mem) == 2
    severities = sorted(s.severity for s in mem.signatures)
    assert 0.1 not in severities  # the weakest (lowest composite) was evicted


# --------------------------------------------------------------------------- recognition


def test_recognition_self_peer_none() -> None:
    mem = _mem()
    mem.add(mem.make_signature([_fault_fv(_dir(0, 1, 2), 0)], [0.9], tick=0, now=FLAT_NOW), now=FLAT_NOW)
    assert mem.recognize(_dir(0, 1, 2), now=FLAT_NOW).source is RecognitionSource.SELF
    assert mem.recognize(np.zeros(11), now=FLAT_NOW).source is RecognitionSource.NONE  # healthy

    peermem = _mem()
    peer = FaultSignature(centroid=_dir(0, 1, 2).astype(np.float32), schema_id=schema_id_for(NAMES),
                          origin_node_id="B", severity=0.9, sample_count=1, provenance=Provenance.PEER,
                          contributor_ts={"B": FLAT_NOW})
    peermem.add(peer, now=FLAT_NOW)
    rec = peermem.recognize(_dir(0, 1, 2), now=FLAT_NOW)
    assert rec.source is RecognitionSource.PEER
    assert rec.matched_origin_node_id == "B"
