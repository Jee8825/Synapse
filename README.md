# SYNAPSE
### Fleet-Learning Intelligence at the Edge

> One machine develops a fault — the fleet catches it, because it **diverges from its identical
> peers**. A bad tool batch hits the line — the fleet catches it **before a single part is scrapped**.
> Peer-to-peer, on the shop floor, **no cloud**.

**Tata Technologies InnoVent — "AI at the Edge"**

▶ **[Watch the 2-minute demo](https://drive.google.com/file/d/1nW7owNeI5d6JXrEf4zLkPTlTpM_PNDBs/view?usp=sharing)**

---

## The problem
Predictive maintenance today watches each machine **alone**, against a fixed threshold — so it reacts
late, and it is blind to the two things that scrap parts line-wide:

- a machine quietly **diverging** from its identical peers, and
- a **bad batch** (tool / insert / material lot) hitting many machines at once.

Per-machine monitoring can't see either — and the cloud alternative means exporting raw telemetry off
the plant floor: latency plus an OT-security no-go.

## What SYNAPSE does
A decentralized, edge-AI, **multi-agent fleet**. Each machine runs an edge node; nodes share compact
**fault signatures** peer-to-peer — never raw telemetry, no central server, no cloud.

1. **Cross-machine federation** — a machine that diverges from N identical peers reveals a developing
   fault, flagged by the *fleet*, not a fixed threshold.
2. **Systemic batch-defect immunity** — the same premature signature across many machines at once = a
   bad lot, caught before it scraps the line.
3. **Calibrated tool RUL** — conformal prediction gives a calibrated confidence band, not a late alert.
4. **Serverless, signature-only, trust-gated** — brokerless P2P (Eclipse Zenoh peer mode); a node that
   can't trust itself stops teaching the fleet.

### The novelty — a drift-conscience with three states
1. **Confident** → detect, diagnose, and teach the fleet.
2. **Stale** → *"listen, don't teach"* — self-quarantine, so a drifted node can't poison its peers.
3. **Unknown** → no peer has seen this → escalate to a human.

## The three demo scenarios (deterministic, byte-for-byte reproducible)
| Scenario | What it proves |
|---|---|
| **Divergence catch** | Node A's fault-onset signature diverges from healthy peers → flagged by the fleet; B & C recognize it **born-wise** from the gossiped signature |
| **Batch-defect immunity** | The same onset hits A & B at once → identical premature signature → a **systemic** alarm, not per-machine wear |
| **Stale self-quarantine** | Node C drifts from its training distribution → self-trust drops → *"listen, don't teach"* |

…plus a **50-machine fleet** view of the same behaviours at scale (`fleet50_*`).

## Architecture — four real layers per node
| Layer | Role |
|---|---|
| **L1 · Worker** | Isolation Forest anomaly detection (< 5 ms/window) |
| **L2 · Drift-conscience** | ADWIN drift + conformal prediction → calibrated self-trust |
| **L3 · Case memory** | FAISS signature store — provenance · decay · dedup · bounded eviction |
| **L4 · Gossip** | Eclipse Zenoh **peer mode** — event-triggered, trust-gated, signature-only |

## What's REAL vs simulated (honest by design)
| Layer | Round-1 status |
|---|---|
| L1 anomaly (Isolation Forest) | **Real** production code |
| L2 drift + conformal (River / MAPIE) | **Real** production code |
| L3 FAISS case memory | **Real** production code |
| L4 Zenoh peer gossip (3 independent processes, true P2P) | **Real** |
| Sensor input | **Replayed** real bearing-rig data (CWRU + NASA IMS) + scripted fault injection |

**Only the sensor input is simulated — everything above it is production code.** Stage 2 is a single
interface swap (`DatasetReplaySource → HardwareSensorSource`) to a Raspberry Pi sensor rig; the
software risk is already retired.

## Run it
Requires **Python 3.11+**. Full steps: **[TEAMMATE_SETUP.md](TEAMMATE_SETUP.md)**.
```bash
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/run_dashboard.py --port 8092
# then open:
#   http://localhost:8092/3d   — 3D fleet twin (Vivarium)
#   http://localhost:8092/     — 2D dashboard
#   http://localhost:8092/ai   — cognition view
```
Pre-generated event logs are bundled, so **every scene replays on clone — no datasets needed.**
To re-run the *live* Zenoh scenarios:
```bash
.venv/bin/python scripts/download_data.py                # CWRU + NASA IMS
.venv/bin/python scripts/run_scenario.py divergence      # or batch_defect / stale_quarantine
```

## The 3D twin (Vivarium)
`/3d` renders a live 3D fleet twin — it **replays the real event logs; it never recomputes a
decision.** Every node colour, trust ring, gossip arc and alarm is a faithful replay of what the real
L1–L4 nodes decided. `/ai` makes the intelligence physical: each node's growing self-trust, the
signatures it learns from peers, and the fleet-wide alarm when a batch defect hits.

## Honest positioning
A **validated proof-of-concept with a credible path to deployment** — not production-ready. The
novelty is the *synthesis* (serverless, signature-only, batch-defect, trust-gated federation at the
edge), not the individual primitives. It **complements** Tata's AMP.IoT; it doesn't compete.

Known pilot-phase gaps we own openly: long-horizon trust-poisoning defense at scale, and cryptographic
tamper-evident audit logging for safety sign-off.

## Repo layout
```
synapse/     L1–L4 stack · sensors · scenarios
dashboard/   FastAPI server + 3D Vivarium twin (static/vivarium/)
scripts/     download_data · run_scenario · run_dashboard
tests/       one suite per layer
events/      pre-generated scenario logs (the twin replays these)
```
