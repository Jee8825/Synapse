"""L4 — redundant dual-channel transport + per-node comparator (the real second path).

Implements the industrial pattern the fleet's networked deployment uses, in code:
**Parallel Redundancy Protocol (PRP, IEC 62439-3) + a 1oo2D comparator** (IEC 61508). Every
signature is published over TWO independent channels — ``A`` ("wired" backbone) and ``B``
("wireless" per-batch router) — each frame carrying a per-origin **sequence number** (the role
PRP's Redundancy Control Trailer plays). At EVERY receiving node an INDEPENDENT comparator
cross-checks the two copies before the payload may enter L3 case memory:

  - both copies agree      -> ``ACCEPT`` once      (duplicate suppressed, PRP-style)
  - only one copy arrived   -> ``ACCEPT_DEGRADED``  (keep the first; the other path is down)
  - the two copies DISAGREE -> ``REJECT_MISMATCH``  (a tampered / faulted channel — never ingested,
                                                     flagged: integrity + anti-poisoning gate)

why per-node + independent (CLAUDE.md §2/§4): PRP does duplicate-discard at each end node's Link
Redundancy Entity, never in a central box, and 1oo2D diversity wants the comparator independent of
the compute it guards — so there is no single point of failure or trust. This module is pure and
transport-agnostic (bytes in, decision out), so it is testable without a live network and is reused
by both the live path and the deterministic in-process bus.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Channel(str, Enum):
    """The two diverse, fail-independent paths (media diversity avoids common-cause failure)."""

    A = "A"  # wired backbone (e.g. HSR ring between batches)
    B = "B"  # wireless (per-batch Wi-Fi / private-5G router)


@dataclass(frozen=True)
class ChannelFrame:
    """One copy of a signature on one channel. Both copies share ``origin`` + ``seq`` (PRP RCT)."""

    origin: str       # origin node id of the signature
    seq: int          # per-origin sequence number, identical on both channel copies
    channel: Channel
    payload: bytes    # the exact signature wire bytes carried on this channel


class Outcome(str, Enum):
    HOLD = "HOLD"                        # first copy in; waiting for the second
    ACCEPT = "ACCEPT"                    # both copies agreed -> deliver once
    ACCEPT_DEGRADED = "ACCEPT_DEGRADED"  # only one path delivered in time -> keep it, flag degraded
    REJECT_MISMATCH = "REJECT_MISMATCH"  # copies disagree -> tampered/faulted path, drop + flag


@dataclass(frozen=True)
class CompareResult:
    outcome: Outcome
    origin: str
    seq: int
    payload: bytes | None = None            # the bytes to deliver (ACCEPT / ACCEPT_DEGRADED)
    channels_seen: tuple[Channel, ...] = ()


class RedundantPublisher:
    """Turns one signature into its two channel frames — duplicate + a per-origin sequence number.

    One instance per ORIGIN node so the sequence numbers are monotonic per source (exactly how a
    PRP source node stamps the Redundancy Control Trailer).
    """

    def __init__(self, origin: str) -> None:
        self._origin = origin
        self._seq = 0

    def frames(self, payload: bytes) -> tuple[ChannelFrame, ChannelFrame]:
        seq = self._seq
        self._seq += 1
        return (
            ChannelFrame(self._origin, seq, Channel.A, payload),
            ChannelFrame(self._origin, seq, Channel.B, payload),
        )


class ChannelComparator:
    """Per-node 1oo2D cross-check. Feed frames as they arrive; it decides accept / reject / degraded.

    Buffers by ``(origin, seq)`` until the pair completes, then compares the raw bytes. Independent
    of L1-L4 (models a co-MCU): it sees only opaque frames, so a compromised main compute cannot
    fake a match. ``sweep()`` resolves frames whose partner never arrived (a downed path).
    """

    def __init__(self) -> None:
        self._pending: dict[tuple[str, int], dict[Channel, bytes]] = {}

    def on_frame(self, frame: ChannelFrame) -> CompareResult:
        key = (frame.origin, frame.seq)
        slot = self._pending.setdefault(key, {})
        slot[frame.channel] = frame.payload
        if Channel.A in slot and Channel.B in slot:
            del self._pending[key]
            a, b = slot[Channel.A], slot[Channel.B]
            if a == b:
                return CompareResult(Outcome.ACCEPT, frame.origin, frame.seq, a, (Channel.A, Channel.B))
            # why reject BOTH, not pick one: with two disagreeing copies the node cannot know which
            # is authentic, so accepting either risks ingesting a poisoned signature. Integrity wins.
            return CompareResult(Outcome.REJECT_MISMATCH, frame.origin, frame.seq, None,
                                 (Channel.A, Channel.B))
        return CompareResult(Outcome.HOLD, frame.origin, frame.seq, None, tuple(slot.keys()))

    def sweep(self) -> list[CompareResult]:
        """Resolve still-pending single-copy frames as degraded-accept (PRP keeps the first copy)."""
        out: list[CompareResult] = []
        for (origin, seq), slot in list(self._pending.items()):
            payload = next(iter(slot.values()))
            out.append(CompareResult(Outcome.ACCEPT_DEGRADED, origin, seq, payload, tuple(slot.keys())))
            del self._pending[(origin, seq)]
        return out

    @property
    def pending(self) -> int:
        return len(self._pending)


def tamper(frame: ChannelFrame) -> ChannelFrame:
    """Return a corrupted copy of a frame (flip the last payload byte) — for fault/tamper injection.

    Used by scenarios to model a compromised or faulted channel B on a specific link, so the
    comparator's mismatch path can be exercised deterministically. Never used in production code.
    """
    p = frame.payload
    corrupted = (p[:-1] + bytes([p[-1] ^ 0xFF])) if p else b"\x00"
    return ChannelFrame(frame.origin, frame.seq, frame.channel, corrupted)
