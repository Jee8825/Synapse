"""FastAPI dashboard — serves the recorded scenario event logs read-only for playback.

Rendering layer ONLY (CLAUDE.md §12 Days 9-10): it never mutates or regenerates the logs and
makes no model/scenario/schema change. ``events/<scenario>.jsonl`` is the read-only contract
(produced by ``scripts/run_scenario.py``); scenario metadata (narrative, roster, act marks) is
read from the frozen scenario specs.

Served at http://localhost:8091 (CLAUDE.md targets 8080, but that port is taken locally; the
launcher defaults to 8091 and accepts --port / SYNAPSE_DASH_PORT).
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from synapse.scenarios.base import ALL_SCENARIOS, load

_ROOT = Path(__file__).resolve().parent.parent
_EVENTS = _ROOT / "events"
_STATIC = Path(__file__).resolve().parent / "static"

app = FastAPI(title="SYNAPSE Fleet Dashboard")


@app.middleware("http")
async def _revalidate_vivarium(request: Request, call_next):
    """Force the 3D twin's ES modules to revalidate each load.

    why: the Vivarium is plain ES modules with no build/hashing; a sticky browser cache can
    pin a stale module (and serve a Frankenstein mix of old/new files). ``no-cache`` makes the
    browser revalidate, so an edited module is always re-fetched. Scoped to the viewer only.
    """
    response = await call_next(request)
    if request.url.path.startswith("/static/vivarium"):
        response.headers["Cache-Control"] = "no-cache"
    return response


def _log_path(scenario: str) -> Path:
    return _EVENTS / f"{scenario}.jsonl"


@app.get("/api/scenarios")
def list_scenarios() -> list[dict]:
    """Available scenarios (those with a recorded log) + frozen-spec metadata for the UI.

    Serves both the 3-node Zenoh-P2P scenarios and the offline fleet50_* logs from the SAME
    read-only path — a fleet log is just a bigger FleetEvent stream in the same schema.
    """
    out: list[dict] = []
    for name in ALL_SCENARIOS:
        if not _log_path(name).exists():
            continue
        spec, _ = load(name)
        out.append({
            "name": name,
            "narrative": spec.narrative,
            "n_ticks": spec.n_ticks,
            "nodes": list(spec.nodes),
            "roles": spec.roles,
            "acts": [{"tick": t, "label": label} for t, label in spec.acts],
        })
    return out


@app.get("/api/events/{scenario}")
def get_events(scenario: str) -> JSONResponse:
    """Return a scenario's recorded FleetEvent log verbatim (read-only)."""
    if scenario not in ALL_SCENARIOS:
        raise HTTPException(status_code=404, detail="unknown scenario")
    path = _log_path(scenario)
    if not path.exists():
        runner = "run_fleet_scenario.py" if scenario.startswith("fleet50_") else "run_scenario.py"
        raise HTTPException(status_code=404, detail=f"no log; run: scripts/{runner} {scenario}")
    events = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    return JSONResponse(events)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(_STATIC / "index.html")


@app.get("/3d")
def vivarium() -> FileResponse:
    """3D fleet twin (Vivarium) — render-only replay of the same read-only event logs.

    Additive: reuses /api/scenarios + /api/events/{scenario}; adds no second event path and
    touches no L1-L4 logic, scenario, threshold, or schema.
    """
    return FileResponse(_STATIC / "vivarium" / "index.html")


@app.get("/ai")
def cognition() -> FileResponse:
    """Cognition view — the AI's L1-L4 workflow made physical (learn/trust/gossip/isolate).

    Sibling to /3d: same render-only boundary and the SAME /api/events + /api/scenarios; it never
    recomputes a detection, score, or state. The floor twin shows the machines; this shows the
    intelligence deciding. Focused on the deep 3-node scenarios (the 50-node floor stays at /3d).
    """
    return FileResponse(_STATIC / "vivarium" / "cognition.html")


app.mount("/static", StaticFiles(directory=_STATIC), name="static")
