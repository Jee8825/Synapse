"""Launch the SYNAPSE fleet dashboard (FastAPI + uvicorn) at http://localhost:8080.

    python scripts/run_dashboard.py

Reads events/<scenario>.jsonl read-only. Generate logs first with scripts/run_scenario.py.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn  # noqa: E402


def main() -> int:
    # CLAUDE.md targets 8080, but 8080 is taken on this machine (FinDesk) -> default to 8091.
    # Override with --port or SYNAPSE_DASH_PORT (e.g. set 8080 once that port is free).
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("SYNAPSE_DASH_PORT", "8091")))
    args = ap.parse_args()
    print(f"SYNAPSE dashboard -> http://localhost:{args.port}")
    uvicorn.run("dashboard.server:app", host="127.0.0.1", port=args.port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
