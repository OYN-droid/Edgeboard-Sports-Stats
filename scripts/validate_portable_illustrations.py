#!/usr/bin/env python3
"""Run every repository-portable illustration integrity gate."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VALIDATORS = (
    "validate_illustration_style_proof.py",
    "validate_mlb_illustration_batch_1.py",
    "validate_mlb_illustration_batch_2.py",
    "validate_mlb_illustration_batch_3.py",
    "validate_mlb_illustration_batch_4.py",
    "validate_mlb_illustration_batch_5.py",
    "validate_mlb_illustration_complete.py",
    "validate_nba_illustration_batch_1.py",
    "validate_nba_illustration_batch_2.py",
    "validate_nba_illustration_batch_3.py",
    "validate_nba_illustration_batch_4.py",
    "validate_nba_illustration_batch_5.py",
    "validate_nba_illustration_complete.py",
    "validate_wnba_featured_portraits.py",
    "validate_nfl_featured_portraits.py",
    "validate_ufc_featured_portraits.py",
    "validate_boxing_featured_portraits.py",
    "report_illustration_coverage.py",
)


def main() -> int:
    for index, script_name in enumerate(VALIDATORS, 1):
        print(f"\n[{index}/{len(VALIDATORS)}] {script_name}", flush=True)
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / script_name)],
            cwd=ROOT,
            check=False,
        )
        if result.returncode:
            print(f"FAIL · {script_name} exited with {result.returncode}", file=sys.stderr)
            return result.returncode
    print(f"\nPASS · all {len(VALIDATORS)} portable illustration gates passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
