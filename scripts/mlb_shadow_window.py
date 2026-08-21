#!/usr/bin/env python3
"""Bounded MLB Shadow validation control. Never prints credentials or raw provider payloads."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.runtime import build_runtime


def _services(runtime, status):
    selected_date = status.get("dateRange", {}).get("start") or datetime.now(timezone.utc).date().isoformat()
    end_date = status.get("dateRange", {}).get("end") or selected_date
    season = datetime.fromisoformat(selected_date).year
    return {
        "schedule_entities": lambda: runtime.mlb_schedule_entities.run_shadow_validation(start_date=selected_date, end_date=end_date, refresh=True),
        "standings_leaders": lambda: runtime.mlb_standings_leaders.run_shadow_validation(season=season, refresh=True),
        "markets": lambda: runtime.mlb_game_markets.run_shadow_validation(selected_date=selected_date, refresh=True),
        "player_props": lambda: runtime.mlb_player_props.run_shadow_validation(selected_date=selected_date, refresh=True),
        "context": lambda: runtime.mlb_context.run_shadow_validation(selected_date=selected_date, refresh=True),
        "live_state": lambda: runtime.mlb_live_state.run_shadow_validation(selected_date=selected_date, event_ids=status.get("eventIds") or []),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Control one explicit, bounded, internal-only MLB Shadow validation window.")
    sub = parser.add_subparsers(dest="command", required=True)
    start = sub.add_parser("start")
    start.add_argument("--date", required=True, help="YYYY-MM-DD; a single representative date.")
    start.add_argument("--end-date", default="")
    start.add_argument("--duration-minutes", type=int, default=15)
    start.add_argument("--request-budget", type=int, required=True)
    start.add_argument("--domains", default="schedules,teams,venues,players,event_identity,event_status")
    start.add_argument("--run", action="store_true", help="Run one bounded cycle immediately, then stop.")
    for name in ("status", "report", "reviews", "mappings"):
        command = sub.add_parser(name)
        command.add_argument("--window-id", required=name != "status", default="")
    stop = sub.add_parser("stop")
    stop.add_argument("--window-id", required=True)
    stop.add_argument("--reason", required=True)
    run = sub.add_parser("run")
    run.add_argument("--window-id", required=True)
    identity = sub.add_parser("identity-status")
    identity_queue = sub.add_parser("identity-queue")
    identity_queue.add_argument("--entity-type", default="")
    identity_queue.add_argument("--limit", type=int, default=100)
    identity_review = sub.add_parser("identity-review")
    identity_review.add_argument("--provider-id", required=True)
    identity_review.add_argument("--action", choices=("confirm", "reject", "create", "add_alias", "defer"), required=True)
    identity_review.add_argument("--canonical-id", default="")
    identity_review.add_argument("--alias", default="")
    identity_review.add_argument("--reason", required=True)
    args = parser.parse_args()

    runtime = build_runtime()
    try:
        service = runtime.mlb_shadow_window
        if args.command == "identity-status":
            result = runtime.mlb_identity.metrics()
        elif args.command == "identity-queue":
            result = {"items": runtime.mlb_identity.list_review_queue(
                entity_type=args.entity_type or None, limit=args.limit,
            )}
        elif args.command == "identity-review":
            result = runtime.mlb_identity.review(
                args.provider_id, args.action, canonical_id=args.canonical_id or None,
                actor="local-operator", reason=args.reason, alias=args.alias or None,
            )
        elif args.command == "start":
            result = service.start(
                confirmation="START BOUNDED MLB SHADOW WINDOW", actor="local-operator",
                request_budget=args.request_budget, duration_minutes=args.duration_minutes,
                date_start=args.date, date_end=args.end_date,
                domains=[item.strip() for item in args.domains.split(",") if item.strip()],
            )
            if args.run:
                result = service.run_once(result["id"], _services(runtime, result))
        elif args.command == "run":
            status = service.status(args.window_id)
            result = service.run_once(args.window_id, _services(runtime, status))
        elif args.command == "stop":
            result = service.stop(args.window_id, confirmation="STOP MLB SHADOW WINDOW", reason=args.reason, actor="local-operator")
        elif args.command == "report":
            result = service.report(args.window_id)
        elif args.command == "reviews":
            result = {"items": service.reviews(args.window_id)}
        elif args.command == "mappings":
            result = {"items": service.mappings(args.window_id)}
        else:
            result = service.status(args.window_id)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    finally:
        runtime.close()


if __name__ == "__main__":
    raise SystemExit(main())
