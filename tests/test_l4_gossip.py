"""L4 tests — pure protocol gating + publish-dedup, plus REAL Zenoh peer-mode networking:
cross-session born-wise recognition, systemic batch-defect, and no-SPOF 3-peer resilience.

The networked tests open real Zenoh peer sessions on localhost (no router). They are skipped
only if a session cannot be opened in this environment.
"""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pytest

from synapse import config
from synapse.features.extract import N_DEFECT_FEATURES
from synapse.l2_trust.state_machine import NodeAssessment, RecognitionSource, TrustState
from synapse.l3_memory.signature import FaultSignature, Provenance, schema_id_for
from synapse.l4_gossip.protocol import PublishLedger, should_ingest, should_publish, to_peer_signature
from synapse.node.daemon import FleetNode
from tests._helpers import cwru_fvs, cwru_present, fault_stream_fvs, many_healthy_fvs

NAMES = tuple(f"f{i}" for i in range(11))


def _sig(direction, *, origin="A", severity=0.9, n=3) -> FaultSignature:
    v = np.zeros(11)
    for i in direction:
        v[i] = 5.0
    return FaultSignature(centroid=v.astype(np.float32), schema_id=schema_id_for(NAMES),
                          origin_node_id=origin, severity=severity, sample_count=n)


def _assessment(**kw) -> NodeAssessment:
    base = dict(node_id="A", tick=1, anomaly_score=0.8, calibrated_pvalue=0.01, drift_detected=False,
                self_trust=0.9, state=TrustState.UNKNOWN, should_teach=True, confirmed_fault=True)
    base.update(kw)
    return NodeAssessment(**base)


# ------------------------------------------------------------------ protocol gating (no network)


def test_publish_only_when_confirmed_trusted_nonstale() -> None:
    assert should_publish(_assessment())                                   # confirmed + trusted
    assert not should_publish(_assessment(confirmed_fault=False))          # unconfirmed
    assert not should_publish(_assessment(should_teach=False, state=TrustState.STALE))  # stale
    assert not should_publish(_assessment(self_trust=0.6))                 # below tau_teach


def test_publish_dedup_by_similarity() -> None:
    ledger = PublishLedger()
    base = _sig([0, 1, 2], severity=0.6)
    assert ledger.register(base)                       # genuinely new fault -> publish
    progressing = _sig([0, 1, 2], severity=0.65)       # same fault, tiny severity change
    assert not ledger.register(progressing)            # suppressed (no spam)
    escalated = _sig([0, 1, 2], severity=0.6 + config.REPUBLISH_SEVERITY_DELTA + 0.05)
    assert ledger.register(escalated)                  # meaningful escalation -> re-publish
    other = _sig([7, 8, 9], severity=0.6)
    assert ledger.register(other)                      # a different fault -> publish


def test_received_peer_signature_is_downweighted_and_restamped() -> None:
    incoming = _sig([0, 1, 2], origin="B")
    incoming.conf_alpha = 5.0
    peer = to_peer_signature(incoming, now=1000.0)
    assert peer.provenance is Provenance.PEER
    assert peer.conf_alpha == pytest.approx(5.0 * config.PEER_CONFIDENCE_DISCOUNT)
    assert peer.half_life_s == config.PEER_HALF_LIFE_S
    assert should_ingest(_sig([0, 1, 2], origin="B"), self_node_id="A")
    assert not should_ingest(_sig([0, 1, 2], origin="A"), self_node_id="A")  # ignore own echo


# ------------------------------------------------------------------ real Zenoh networking helpers


def _zenoh_available() -> bool:
    try:
        import zenoh
        from synapse.l4_gossip.transport import peer_config
        s = zenoh.open(peer_config(["tcp/127.0.0.1:7599"], []))
        s.close()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _zenoh_available(), reason="Zenoh peer session unavailable here")


def _assert_defect_features_present(fvs) -> None:
    """Guard against zero-fill poisoning: the defect-frequency tail must be live (real shaft_hz)."""
    assert any(np.any(np.asarray(fv.values)[-N_DEFECT_FEATURES:] != 0.0) for fv in fvs), \
        "defect-frequency features are all-zero -> shaft_hz was not supplied (zero-fill poisoning)"


def _poll(predicate, timeout=6.0, interval=0.05) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def _node(node_id, port, peer_ports, healthy):
    return FleetNode(
        node_id=node_id, healthy_fvs=healthy,
        listen_endpoints=[f"tcp/127.0.0.1:{port}"],
        connect_endpoints=[f"tcp/127.0.0.1:{p}" for p in peer_ports],
    )


# ------------------------------------------------------------------ THE test: born-wise over Zenoh
#
# Non-circularity is enforced by DATA PROVENANCE: A learns the fault from inner-race @ 0 hp
# (file 105) calibrated on Normal_0 (97); B encounters a DIFFERENT instance — inner-race @ 2 hp
# (file 107) — calibrated on its OWN Normal_2 baseline (99). Same fault CLASS, different
# recording, load, and healthy baseline. Recognition must STILL fire.

_CWRU_BORNWISE = pytest.mark.skipif(
    not cwru_present("normal", "normal_2hp", "inner_race", "inner_race_2hp", "ball"),
    reason="CWRU files (97/99/105/107/118) not downloaded",
)


@_CWRU_BORNWISE
def test_born_wise_recognition_cross_instance_over_real_zenoh() -> None:
    A = _node("A", 7461, [7462], cwru_fvs("normal"))            # baseline Normal_0 (file 97)
    B = _node("B", 7462, [7461], cwru_fvs("normal_2hp"))        # baseline Normal_2 (file 99)
    try:
        time.sleep(1.0)
        a_faults = cwru_fvs("inner_race", limit=12)            # A learns IR @ 0 hp (file 105)
        b_faults = cwru_fvs("inner_race_2hp", node_id="B", limit=12)  # B sees IR @ 2 hp (file 107)
        _assert_defect_features_present(a_faults)              # both nodes use a real shaft_hz
        _assert_defect_features_present(b_faults)
        for fv in a_faults:
            A.observe(fv)
        assert A.last_publish is not None

        assert _poll(lambda: len(B.memory) >= 1), "B never received A's signature"

        # B sees a DIFFERENT instance of the same fault class it never experienced (file 107).
        b = [B.observe(fv) for fv in b_faults]
        peer_hits = [a for a in b if a.recognition_source is RecognitionSource.PEER]
        assert peer_hits, "B failed to recognize A's fault from a different instance"
        assert all(a.matched_origin_node_id == "A" for a in peer_hits)
        assert all(a.state is not TrustState.UNKNOWN for a in b), "born-wise must not escalate"
        cos = max(a.match_similarity for a in peer_hits)
        print(f"\n[born-wise] A=inner_race(105)/Normal_0(97)  B=inner_race_2hp(107)/Normal_2(99)")
        print(f"[born-wise] cross-instance recognition cosine = {cos:.3f} (>= tau_match)")
        assert cos >= 0.95
    finally:
        A.close()
        B.close()


@_CWRU_BORNWISE
def test_control_without_gossip_escalates_to_unknown() -> None:
    # Same fault instance, but no peer knowledge -> must escalate (UNKNOWN). The contrast.
    B = FleetNode(node_id="B", healthy_fvs=cwru_fvs("normal_2hp"))  # no transport, empty memory
    states = [B.observe(fv).state for fv in cwru_fvs("inner_race_2hp", node_id="B", limit=12)]
    assert TrustState.UNKNOWN in states


@_CWRU_BORNWISE
def test_winsorization_clip_is_healthy_derived_and_in_plateau() -> None:
    """The clip is set from HEALTHY calibration ONLY (max|z|) and lands in the 4..16 plateau."""
    healthy = cwru_fvs("normal")
    node = FleetNode(node_id="A", healthy_fvs=healthy)
    X = np.vstack([fv.values for fv in healthy])
    expected = float(np.abs((X - X.mean(0)) / np.maximum(X.std(0), 1e-9)).max())
    assert node.memory._z_clip == pytest.approx(expected)  # derived from healthy, never from faults
    assert 4.0 <= node.memory._z_clip <= 16.0              # inside the validated separation plateau


@_CWRU_BORNWISE
def test_discrimination_different_fault_class_not_recognized() -> None:
    """A node holding A's INNER-race signature must NOT recognize a DIFFERENT fault class.

    The headline is OUTER-RACE (130): inseparable from inner-race before defect-frequency features
    (~0.97), now distinct. Ball (118) is checked too. tau_match discriminates — it is unchanged.
    """
    A = FleetNode(node_id="A", healthy_fvs=cwru_fvs("normal"))
    ir = cwru_fvs("inner_race", limit=12)
    _assert_defect_features_present(ir)
    for fv in ir:
        A.observe(fv)
    assert A.last_publish is not None
    # the widened (17-feature) signature stays compact and carries no raw window
    assert A.last_publish.centroid.size == 11 + N_DEFECT_FEATURES
    assert len(A.last_publish.to_bytes()) < 256

    # outer-race across instances (load + clock position) + ball — all must be rejected.
    # each negative node is calibrated to ITS OWN operating condition (baseline matches load).
    for neg_name, baseline in (
        ("outer_race", "normal"),            # OR @6:00, 0 hp
        ("outer_race_2hp", "normal_2hp"),    # OR @6:00, 2 hp  (different load + cross-baseline)
        ("outer_race_3clock", "normal"),     # OR @3:00, 0 hp  (different clock position)
        ("ball", "normal"),                  # ball, 0 hp
    ):
        D = FleetNode(node_id="D", healthy_fvs=cwru_fvs(baseline))
        D._on_peer_signature(A.last_publish)
        assert len(D.memory) == 1
        neg = cwru_fvs(neg_name, node_id="D", limit=12)
        _assert_defect_features_present(neg)
        recs = [D.memory.recognize(fv.values) for fv in neg]
        best = max(r.similarity for r in recs)
        print(f"[discrimination] {neg_name:11s}-vs-inner-race best cosine = {best:.3f} (< 0.95 -> NONE)")
        assert all(r.source is RecognitionSource.NONE for r in recs), f"{neg_name} must not match inner-race"
        assert best < 0.95
        # ...and through the full pipeline the unrecognized confirmed fault ESCALATES.
        states = [D.observe(fv).state for fv in neg]
        assert TrustState.UNKNOWN in states, "an unrecognized confirmed fault must escalate"


# ------------------------------------------------------------------ systemic batch-defect over wire


def test_systemic_flag_when_two_nodes_confirm_same_fault() -> None:
    healthy = many_healthy_fvs(400, seed=0)
    A = _node("A", 7463, [7464], healthy)
    B = _node("B", 7464, [7463], healthy)
    try:
        time.sleep(1.0)
        faults = fault_stream_fvs(8, seed=1)
        for fv in faults:
            A.observe(fv)
        for fv in faults:                       # SAME fault onset on B
            B.observe(fv)
        # B's memory should now hold the fault with contributions from BOTH A and B -> systemic.
        assert _poll(lambda: any(s.systemic for s in B.memory.signatures)), "systemic flag never fired"
        systemic_sig = next(s for s in B.memory.signatures if s.systemic)
        assert systemic_sig.contributing_nodes >= {"A", "B"}
    finally:
        A.close()
        B.close()


# ------------------------------------------------------------ no-SPOF resilience (REAL processes)


def _runner_cmd(node_id, listen, connect_ports, recv_file, *, pub="", delay=0.0, duration=30.0):
    import sys as _sys
    runner = str(Path(__file__).resolve().parent.parent / "scripts" / "_gossip_peer_runner.py")
    return [_sys.executable, runner, "--node-id", node_id, "--listen", str(listen),
            "--connect", ",".join(str(p) for p in connect_ports), "--recv-file", str(recv_file),
            "--publish-indices", pub, "--publish-delay", str(delay), "--duration", str(duration)]


def _file_has(path: Path, token: str, timeout=15.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if path.exists() and token in path.read_text():
            return True
        time.sleep(0.1)
    return False


def test_three_peer_resilience_no_spof_multiprocess(tmp_path) -> None:
    """THREE separate OS processes in a full mesh. SIGKILL the would-be-rendezvous node; the two
    survivors must still gossip a FRESH signature end-to-end (no router => no single point of failure).
    """
    import subprocess

    fa, fb, fc = (tmp_path / f"{n}.recv" for n in "abc")
    for f in (fa, fb, fc):
        f.touch()
    s1 = _sig([0, 1, 2]).signature_id   # A publishes this at t≈1s (id is content-hash, origin-independent)
    s2 = _sig([5, 6, 7]).signature_id   # B publishes this at t≈6s (after A is killed)

    # full mesh on ports 7491/7492/7493; A and B each publish once, C is a pure subscriber.
    pA = subprocess.Popen(_runner_cmd("A", 7491, [7492, 7493], fa, pub="0,1,2", delay=1.0))
    pB = subprocess.Popen(_runner_cmd("B", 7492, [7491, 7493], fb, pub="5,6,7", delay=6.0))
    pC = subprocess.Popen(_runner_cmd("C", 7493, [7491, 7492], fc))
    procs = [pA, pB, pC]
    try:
        # mesh is up and A participates: B and C both receive A's signature.
        assert _file_has(fb, s1), "B never received A's signature (mesh didn't form)"
        assert _file_has(fc, s1), "C never received A's signature"

        # KILL A's process (a star topology would center on it). No router exists.
        pA.kill()
        pA.wait(timeout=5)

        # B publishes a FRESH signature AFTER A is dead -> C must still receive it via B<->C.
        assert _file_has(fc, s2, timeout=15.0), \
            "C did not receive B's fresh signature after A was killed -> single point of failure!"
    finally:
        for p in procs:
            if p.poll() is None:
                p.kill()
