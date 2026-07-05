"""Download a defined CWRU bearing-data subset into ``data/cwru/`` (git-ignored).

Subset — 12 kHz Drive-End data, 0.007" defects, motor load 0 (~1797 rpm):

    name         file     condition
    ----         ----     ---------
    normal       97.mat   healthy baseline
    inner_race  105.mat   Drive-End inner-race fault
    ball        118.mat   Drive-End ball fault
    outer_race  130.mat   Drive-End outer-race fault (centered @ 6:00)

CWRU is vibration-only. NASA IMS run-to-failure is deferred to the RUL stretch (CLAUDE.md
§6) and is intentionally *not* downloaded here.

The CWRU Bearing Data Center has reorganized its URLs over the years, so the automated
download may fail. If it does, this script prints the exact source URLs and target paths so
you can fetch the four ``.mat`` files manually and drop them in ``data/cwru/``.

Usage:
    python scripts/download_data.py            # download missing files
    python scripts/download_data.py --force    # re-download everything
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Canonical CWRU file numbers for the subset (widely cited in the PdM literature).
FILES: dict[str, int] = {
    "normal": 97,            # Normal baseline, 0 hp / 1797 rpm  (Node A healthy baseline)
    "normal_2hp": 99,        # Normal baseline, 2 hp / 1750 rpm  (Node B healthy baseline)
    "inner_race": 105,       # Inner-race 0.007", 0 hp           (Node A fault INSTANCE)
    "inner_race_2hp": 107,   # Inner-race 0.007", 2 hp           (Node B fault INSTANCE — same CLASS)
    "ball": 118,             # Ball 0.007", 0 hp                 (negative: different fault class)
    "outer_race": 130,       # Outer-race 0.007" @6:00, 0 hp     (negative: different fault class)
    "outer_race_2hp": 132,   # Outer-race 0.007" @6:00, 2 hp     (2nd OR instance: different load)
    "outer_race_3clock": 144,  # Outer-race 0.007" @3:00, 0 hp   (2nd OR instance: different clock pos.)
}

# CWRU hosts the .mat files under this path. Kept as a single constant so a future URL change
# is a one-line edit (and is echoed in the manual-fallback message).
BASE_URL = "https://engineering.case.edu/sites/default/files"

# SHA-256 of each file, pinned from a verified download on 2026-06-23 (downloaded from the
# CWRU Bearing Data Center, loadmat-verified). # why: determinism (CLAUDE.md §6) requires
# pinned inputs — a re-download that doesn't match these is rejected as tampered/corrupt.
CHECKSUMS: dict[str, str] = {
    "normal": "16bf48babcf1c7ac224bc1a81cd9eafdb27e42d5cf559761907e067e8eeadf3c",
    "normal_2hp": "4b97e6b5361f45efb6951dc3b1aebcdb3b89cb69d0f96d6f5c297dd9f45eee75",
    "inner_race": "f80b0ea04fd06b372a0eaec7c056543ea37e4bb4727a5b173d2a5bacd2aa9cab",
    "inner_race_2hp": "111ba8996a115684661a13c913bd74d8029a59294492f88aec7b03e175fdd388",
    "ball": "b00628f8dd8d1d930af77fa465d1e5cdb385fe259489053f91f3680bda7f640e",
    "outer_race": "35a095307d0971477049b343a1b5981dde465a58fb7f233ad89b035068c1717d",
    "outer_race_2hp": "17a69ed5d2270b42532e678e35bbe2fa04a2cc413cf2bf9e88c7692de8662d18",
    "outer_race_3clock": "f1f51d8c3b66e90fcdd8de15be95c2d4d3e9bac018dbba57f3006e930eec6b22",
}

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "cwru"
_UA = "Mozilla/5.0 (SYNAPSE dataset fetcher; research use)"


def _url(file_num: int) -> str:
    return f"{BASE_URL}/{file_num}.mat"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _verify_mat(path: Path) -> bool:
    """A valid CWRU file loads via loadmat and exposes a ``*_DE_time`` (drive-end) signal."""
    try:
        from scipy import io as sio  # local import: keep the manual-fallback path dependency-free
    except ImportError:
        print("  ! scipy not installed — cannot verify .mat contents (install requirements).")
        return False
    try:
        mat = sio.loadmat(str(path))
    except Exception as exc:  # noqa: BLE001 - report any load failure verbatim
        print(f"  ! loadmat failed: {exc}")
        return False
    if not any(k.endswith("_DE_time") for k in mat):
        print("  ! no '*_DE_time' variable found — not a CWRU drive-end file?")
        return False
    return True


def _download_one(name: str, file_num: int, dest: Path) -> bool:
    url = _url(file_num)
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 - fixed https host
            dest.write_bytes(resp.read())
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"  ! download failed for {name} ({url}): {exc}")
        return False
    if not _verify_mat(dest):
        return False
    digest = _sha256(dest)
    expected = CHECKSUMS.get(name)
    if expected and digest != expected:
        print(f"  ! checksum mismatch for {name}: got {digest}, expected {expected}")
        return False
    pin_note = "matches pin" if expected else "PIN THIS into CHECKSUMS"
    print(f"  ok {name}: {dest.name}  sha256={digest}  ({pin_note})")
    return True


def _print_manual_instructions(missing: list[str]) -> None:
    print("\nAutomated download did not complete. Fetch these manually and place them in:")
    print(f"  {DATA_DIR}")
    print("\nSource URLs (CWRU Bearing Data Center):")
    for name in missing:
        num = FILES[name]
        print(f"  {name:<12} -> {_url(num)}   (save as {name}.mat)")
    print(
        "\nIf those URLs 404, browse the CWRU Bearing Data Center download pages "
        "('Normal Baseline Data' and '12k Drive End Bearing Fault Data') and grab files "
        f"{', '.join(str(FILES[n]) for n in missing)}.mat."
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download the CWRU subset for SYNAPSE.")
    parser.add_argument("--force", action="store_true", help="re-download even if present")
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR, help="target directory")
    args = parser.parse_args(argv)

    data_dir: Path = args.data_dir
    data_dir.mkdir(parents=True, exist_ok=True)

    missing: list[str] = []
    for name, num in FILES.items():
        dest = data_dir / f"{name}.mat"
        if dest.exists() and not args.force:
            status = "ok (cached)" if _verify_mat(dest) else "present but UNVERIFIED"
            print(f"  {status}: {dest.name}")
            if "UNVERIFIED" in status:
                missing.append(name)
            continue
        print(f"  downloading {name} ({num}.mat) ...")
        if not _download_one(name, num, dest):
            missing.append(name)

    if missing:
        _print_manual_instructions(missing)
        return 1
    print("\nAll CWRU subset files present and verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
