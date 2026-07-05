"""Run a demo scenario across a real multi-process Zenoh fleet; write its jsonl event log.

  python scripts/run_scenario.py <divergence|batch_defect|stale_quarantine>

Spawns one OS process per node (full mesh, no rendezvous), drives a deterministic tick barrier
(release tick t -> wait all acks -> settle for gossip -> tick t+1), merges every node's events
into events/<name>.jsonl, and prints a human-readable 3-act timeline. Gossip flows over real
Zenoh peer mode; only the barrier + event capture use files.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from synapse.scenarios.base import SCENARIOS, load  # noqa: E402
from synapse.scenarios.events import EventType, FleetEvent  # noqa: E402

_ACK_TIMEOUT = 30.0


def _run(name: str) -> Path:
    spec, _ = load(name)
    run_dir = Path(tempfile.mkdtemp(prefix=f"synapse_{name}_"))
    procs = []
    for node_id in spec.nodes:
        procs.append(subprocess.Popen(
            [sys.executable, str(ROOT / "scripts" / "_scenario_node.py"),
             "--scenario", name, "--node-id", node_id, "--run-dir", str(run_dir)]
        ))
    try:
        for t in range(spec.n_ticks):
            (run_dir / f"go.{t}").write_text("1")
            deadline = time.time() + _ACK_TIMEOUT
            while not all((run_dir / f"ack.{n}.{t}").exists() for n in spec.nodes):
                if time.time() > deadline:
                    (run_dir / "abort").write_text("1")
                    raise TimeoutError(f"tick {t}: nodes did not all ack")
                if any(p.poll() is not None for p in procs):
                    (run_dir / "abort").write_text("1")
                    raise RuntimeError("a node process exited early")
                time.sleep(0.004)
            time.sleep(spec.settle_s)  # let gossip propagate before the next tick
        (run_dir / "stop").write_text("1")
        for p in procs:
            p.wait(timeout=15)
    finally:
        for p in procs:
            if p.poll() is None:
                p.kill()

    # merge per-node logs -> events/<name>.jsonl, ordered by (tick, node, seq)
    events: list[FleetEvent] = []
    for node_id in spec.nodes:
        f = run_dir / f"{node_id}.jsonl"
        if f.exists():
            events += [FleetEvent.from_json(ln) for ln in f.read_text().splitlines() if ln.strip()]
    events.sort(key=lambda e: (e.tick, e.node_id, e.seq))
    out_dir = ROOT / "events"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"{name}.jsonl"
    out.write_text("\n".join(e.to_json() for e in events) + "\n")
    shutil.rmtree(run_dir, ignore_errors=True)
    _print_timeline(name, spec.narrative, events)
    return out


_BEATS = {
    EventType.GOSSIP_PUBLISH: "TEACH ",
    EventType.GOSSIP_RECEIVE: "LEARN ",
    EventType.SYSTEMIC_ALARM: "ALARM ",
    EventType.ESCALATE: "ESCAL ",
    EventType.STALE_QUARANTINE: "STALE ",
}


def _print_timeline(name: str, narrative: str, events: list[FleetEvent]) -> None:
    print(f"\n=== SCENARIO: {name} ===\n{narrative}\n")
    act = None
    for e in events:
        if e.event_type == EventType.TICK:
            if e.act != act:  # print a one-line act header at each act boundary
                act = e.act
                print(f"\n--- act: {act.upper()} (tick {e.tick}) ---")
            continue
        beat = _BEATS.get(e.event_type, e.event_type)
        print(f"  t={e.tick:>3} {e.node_id}({e.role}) [{beat}] {e.detail}"
              f"  state={e.state} trust={e.self_trust:.2f} teach={e.should_teach}")
    print(f"\n[ok] wrote events/{name}.jsonl ({len(events)} events)\n")


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if not argv or argv[0] not in SCENARIOS:
        print(f"usage: run_scenario.py <{'|'.join(SCENARIOS)}>")
        return 2
    _run(argv[0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
