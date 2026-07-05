# SYNAPSE — run it on your laptop (teammate setup)

Requires **Python 3.11+**. Smoothest on **macOS Apple Silicon** (the `eclipse-zenoh` and
`faiss-cpu` deps are the only finicky ones on other OS/arch).

## 1. Create the environment (the zip does NOT include a working venv — you build your own)
```bash
cd synapse                       # the unzipped folder
python3.11 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

## 2a. View the full 3D twin + dashboards (all scenes, detailed CAD)
The twin renders from event logs that are already included (`events/*.jsonl`), and the detailed
**CNC CAD model is included** (`dashboard/static/vivarium/models/`).
```bash
.venv/bin/python scripts/run_dashboard.py --port 8092
```
Then open:
- **3D fleet twin** → http://localhost:8092/3d
- **2D dashboard** → http://localhost:8092/
- **Cognition view** → http://localhost:8092/ai

Every scenario tab works out of the box:
- **3-node:** divergence · batch defect · stale quarantine · stale recovery · cross learning · comms integrity
- **50-machine fleet:** fleet50 divergence · fleet50 batch defect · fleet50 stale quarantine

Pick a tab and press ▶.

## 2b. Re-run the LIVE scenarios (real Eclipse Zenoh peer-to-peer)
The **datasets are already included** (`data/`), so no download step is needed:
```bash
.venv/bin/python scripts/run_scenario.py divergence       # or batch_defect / stale_quarantine
```
This spins up 3 independent node processes over real Zenoh peer mode and writes a fresh
`events/<name>.jsonl`; refresh the dashboard to watch it. (If `data/` is ever missing, run
`.venv/bin/python scripts/download_data.py` to re-fetch it.)

## 3. Run the tests
```bash
.venv/bin/python -m pytest -q
```

## Notes
- The detailed **CNC 3018 CAD model** (`.glb`) is included so the twin looks exactly like Jee's.
  It's a GrabCAD model with attribution not yet formally cleared — fine for internal team testing,
  but **don't redistribute it publicly** (keep it out of any public GitHub push).
- Deterministic: same seed → byte-identical playback, so your run should match Jee's exactly.
