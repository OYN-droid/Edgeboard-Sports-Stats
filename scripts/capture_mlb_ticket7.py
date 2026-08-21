#!/usr/bin/env python3
"""Bounded, opt-in MLB Ticket 7 shadow capture. Never prints credentials or raw payloads."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.config import ProviderConfig
from server.runtime import build_runtime


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture up to three normalized MLB shadow observations.")
    parser.add_argument("--date", required=True, help="Bounded date in YYYY-MM-DD form")
    parser.add_argument("--captures", type=int, default=1, choices=(1, 2, 3))
    parser.add_argument("--interval", type=int, default=30, help="Seconds between captures (15-60)")
    parser.add_argument("--confirmation", required=True, help='Must be exactly "CAPTURE MLB MARKET MOVEMENT".')
    args = parser.parse_args()
    if args.confirmation != "CAPTURE MLB MARKET MOVEMENT":
        parser.error("The exact capture confirmation is required.")
    if not 15 <= args.interval <= 60:
        parser.error("Capture interval must be between 15 and 60 seconds.")

    runtime = build_runtime(ProviderConfig.from_env())
    reports = []
    try:
        if runtime.mlb_game_markets.shadow_validator is None:
            print(json.dumps({"accepted": False, "reason": "No shadow provider is configured; fixture history remains available."}, indent=2))
            return 2
        for index in range(args.captures):
            game_candidate, game_endpoints, game_error = runtime.mlb_game_markets.shadow_validator(selected_date=args.date)
            prop_candidate, prop_endpoints, prop_error = runtime.mlb_player_props.shadow_validator(selected_date=args.date)
            accepted = {"gameMarkets": 0, "playerProps": 0}
            rejected = {"gameMarkets": 0, "playerProps": 0}
            if game_candidate is not None:
                schedule = runtime.mlb_schedule_entities.adapter.normalize(game_candidate["scheduleContract"], source_mode="sample")
                normalized = runtime.mlb_game_markets.adapter.normalize(game_candidate, schedule, source_mode="sample")
                result = runtime.market_movement.capture_normalized(normalized, {"provider":"shadow","sourceMode":"sample","props":[]})
                accepted["gameMarkets"] = result["accepted"]
                rejected["gameMarkets"] = len(result["rejected"])
            if prop_candidate is not None:
                schedule = runtime.mlb_schedule_entities.adapter.normalize(prop_candidate["scheduleContract"], source_mode="sample")
                normalized = runtime.mlb_player_props.adapter.normalize(prop_candidate, schedule, source_mode="sample")
                result = runtime.market_movement.capture_normalized({"provider":"shadow","sourceMode":"sample","prices":[]}, normalized)
                accepted["playerProps"] = result["accepted"]
                rejected["playerProps"] = len(result["rejected"])
            reports.append({
                "capture": index + 1, "accepted": accepted, "rejected": rejected,
                "gameMarketEndpoints": game_endpoints, "playerPropEndpoints": prop_endpoints,
                "gameMarketErrorCode": game_error.code if game_error else None,
                "playerPropErrorCode": prop_error.code if prop_error else None,
            })
            if index + 1 < args.captures:
                time.sleep(args.interval)
        print(json.dumps({
            "exposedAsPrimary": False, "rawPayloadStored": False,
            "retention": runtime.market_movement.policy, "captures": reports,
            "diagnostics": runtime.market_movement.diagnostics(),
        }, indent=2, sort_keys=True))
        return 0 if any(sum(report["accepted"].values()) for report in reports) else 2
    finally:
        runtime.close()


if __name__ == "__main__":
    raise SystemExit(main())
