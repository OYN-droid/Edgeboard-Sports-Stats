#!/usr/bin/env python3
"""Run the narrow server-only MLB Ticket 5 odds shadow validator safely."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.config import ProviderConfig
from server.runtime import build_runtime


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate MLB Ticket 5 pregame odds in shadow mode.")
    parser.add_argument("--date", required=True, help="Bounded date in YYYY-MM-DD form")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    runtime = build_runtime(ProviderConfig.from_env())
    try:
        report = runtime.mlb_game_markets.run_shadow_validation(
            selected_date=args.date, refresh=args.refresh,
        )
        safe = {key: report.get(key) for key in (
            "provider", "exposedAsPrimary", "candidateMode", "primarySource",
            "endpoints", "normalization", "reconciliation", "discrepancies",
            "cache", "edgeTrust", "limitations",
        )}
        print(json.dumps(safe, indent=2, sort_keys=True))
        return 0 if report.get("normalization", {}).get("accepted") else 2
    finally:
        runtime.close()


if __name__ == "__main__":
    raise SystemExit(main())
