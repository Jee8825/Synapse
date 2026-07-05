"""Run a 3-node OFFLINE scenario over the deterministic in-process bus; write its jsonl log.

  python scripts/run_offline_scenario.py stale_recovery

Same engine as the fleet runner (``scripts/run_fleet_scenario.py`` — the ``simulate`` /
in-process bus / deterministic clock are shared), but for the 3-node ``OFFLINE_SCENARIOS`` that
exercise a beat the live-Zenoh core cannot: e.g. STALE **self-recovery**, where the latched
drift flag means a node can only re-earn trust by re-baselining (``recalibrate()``), and where
byte-for-byte determinism makes the recovery a clean, repeatable demo beat.

Honesty boundary (identical to the fleet50_* logs): the SAME real L1-L4 stack runs for every
node — ``WorkerModel`` -> ``NodeAssessor`` (with real ``recalibrate()`` recovery) -> ``CaseMemory``
+ the real ``should_publish`` / ``should_ingest`` / ``PublishLedger`` gossip rules. Only the
TRANSPORT is the in-process bus, not 3 Eclipse-Zenoh processes. The live Zenoh PEER P2P transport
stays the 3-process core (``scripts/run_scenario.py``); this is additive VISUALIZATION data in
the existing ``FleetEvent`` schema, NOT a Round-1 §2 scope change.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.run_fleet_scenario import _run  # noqa: E402  (shared in-process engine)
from synapse.scenarios.base import OFFLINE_SCENARIOS  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if not argv or argv[0] not in OFFLINE_SCENARIOS:
        print(f"usage: run_offline_scenario.py <{'|'.join(OFFLINE_SCENARIOS)}>")
        return 2
    _run(argv[0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
