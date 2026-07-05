"""Pytest bootstrap: make the repo root (which holds the ``synapse`` package) importable.

Lets ``import synapse...`` work under a plain ``pytest`` invocation, regardless of cwd.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
