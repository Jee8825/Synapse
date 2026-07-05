#!/usr/bin/env bash
#
# Auto-sync the project's machine-readable knowledge artifacts after a chat/session.
#
# Wired to the Claude Code **Stop** hook (.claude/settings.json), so it runs when the assistant
# finishes a turn. It refreshes the parts of SYNAPSE's persistent-memory triad that can be rebuilt
# WITHOUT an LLM:
#   • graphify code-graph  (`graphify update .`   — AST re-extraction, no LLM)  -> graphify-out/graph.json + GRAPH_REPORT.md
#   • interactive HTML     (`graphify export html`)
#   • Obsidian vault       (`graphify export obsidian` -> graphify-out/obsidian, git-ignored;
#                           it does NOT touch the hand-authored SYNAPSE-Home.md / notes/ vault)
#
# NOT touched: CLAUDE.md design addenda. Those capture *intent* and need reasoning — they are
# authored during a session, not mechanically regenerated. (Semantic graphify extraction of docs
# also needs an LLM and is intentionally skipped here; code structure is what stays fresh.)
#
# Design notes:
#   • Guarded: no-op unless a tracked .py/.js source changed since the last sync (cheap on quiet turns).
#   • Detached: the heavy work is backgrounded so a turn never waits on it.
#   • Single-flight: a lock dir prevents overlapping runs; a >10-min-old lock is treated as stale.
#   • Fail-open: every step is best-effort; the hook always exits 0 and never blocks the session.

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT" 2>/dev/null || exit 0

command -v graphify >/dev/null 2>&1 || exit 0     # graphify not installed -> nothing to do
[ -f graphify-out/graph.json ] || exit 0          # no graph built yet -> nothing to update

MARKER="graphify-out/.last_sync"
LOCK="graphify-out/.sync.lock"

# --- guard: only sync when a code file actually changed since the last sync -------------------
if [ -f "$MARKER" ]; then
  changed=$(find synapse dashboard scripts tests -type f \( -name '*.py' -o -name '*.js' \) \
              -newer "$MARKER" 2>/dev/null | head -n1)
  [ -z "$changed" ] && exit 0
fi

# --- single-flight: drop a stale lock (>10 min), then try to claim it -------------------------
find "$LOCK" -maxdepth 0 -mmin +10 -exec rm -rf {} + 2>/dev/null || true
mkdir "$LOCK" 2>/dev/null || exit 0               # another sync is in progress -> skip this turn

# --- detach the heavy work so the turn returns immediately ------------------------------------
nohup bash -c '
  cd "'"$ROOT"'" 2>/dev/null || exit 0
  graphify update . >/dev/null 2>&1 || true
  graphify export html >/dev/null 2>&1 || true
  graphify export obsidian >/dev/null 2>&1 || true
  touch "'"$MARKER"'"
  rmdir "'"$LOCK"'" 2>/dev/null || true
' >/dev/null 2>&1 &

exit 0
