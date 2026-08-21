#!/usr/bin/env python3
"""Run the narrow server-only MLB Ticket 4 shadow validator.

Environment loading is deliberately left to the process/deployment. This script
never prints configuration, credentials, raw provider payloads, or provider IDs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.config import ProviderConfig
from server.runtime import build_runtime


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate MLB Ticket 4 shadow aggregates.")
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    runtime = build_runtime(ProviderConfig.from_env())
    try:
        report = runtime.mlb_standings_leaders.run_shadow_validation(
            season=args.season, refresh=args.refresh,
        )
        safe = {
            key: report.get(key) for key in (
                "provider", "season", "exposedAsPrimary", "candidateMode",
                "primarySource", "endpoints", "normalization", "canonicalIds",
                "discrepancies", "snapshot", "cache", "edgeTrust", "limitations",
            )
        }
        print(json.dumps(safe, indent=2, sort_keys=True))
        return 0 if report.get("normalization", {}).get("accepted") else 2
    finally:
        runtime.close()


if __name__ == "__main__":
    raise SystemExit(main())
