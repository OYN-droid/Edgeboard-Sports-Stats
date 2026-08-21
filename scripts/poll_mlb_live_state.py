#!/usr/bin/env python3
"""Bounded, sanitized Ticket 9 development poll. Never runs in ordinary CI."""

from __future__ import annotations

import argparse
import os
import time
from datetime import date

from server.config import ProviderConfig
from server.mlb_live_state import LivePollingPolicy, MlbLiveStateService
from server.mlb_schedule_entities import MlbScheduleEntityService
from server.sportsdataio_mlb import SportsDataIoMlbTrialProvider, is_sportsdataio
from server.cache import MemoryCache


class _Rollout:
    def get(self, _league: str) -> dict[str, str]:
        return {"rolloutState": "shadow"}


class _Shadow:
    def record(self, *_args: object) -> int:
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Run one to three bounded MLB live-state shadow polls.")
    parser.add_argument("--date", default=date.today().isoformat())
    parser.add_argument("--event-id", action="append", required=True)
    parser.add_argument("--cycles", type=int, default=1)
    parser.add_argument("--max-duration", type=int, default=45)
    parser.add_argument("--confirm", action="store_true")
    args = parser.parse_args()
    if not args.confirm or os.environ.get("EDGEBOARD_RUN_LIVE_POC") != "1":
        raise SystemExit("Set EDGEBOARD_RUN_LIVE_POC=1 and pass --confirm for an explicit read-only run.")
    if not 1 <= args.cycles <= 3 or not 1 <= len(args.event_id) <= 3 or not 1 <= args.max_duration <= 120:
        raise SystemExit("Use 1–3 cycles, 1–3 events, and a 1–120 second duration.")
    config = ProviderConfig.from_env()
    if not is_sportsdataio(config):
        raise SystemExit("SportsDataIO server configuration is unavailable.")
    cache, rollout, shadow = MemoryCache(), _Rollout(), _Shadow()
    schedule = MlbScheduleEntityService(cache, rollout, shadow)
    provider = SportsDataIoMlbTrialProvider(config, cache=cache)
    service = MlbLiveStateService(cache, rollout, shadow, schedule,
        shadow_validator=provider.validate_live_state_access,
        polling_policy=LivePollingPolicy(enabled=True, request_budget=args.cycles))
    service.configure_polling(enabled=True, event_ids=args.event_id)
    started = time.monotonic()
    for cycle in range(args.cycles):
        if time.monotonic() - started >= args.max_duration:
            break
        result = service.poll_shadow_once(selected_date=args.date)
        print({"cycle": cycle + 1, "status": result.get("status"), "requested": result.get("requested", 0),
               "accepted": result.get("accepted", 0), "duplicates": result.get("duplicates", 0),
               "rejected": result.get("rejected", 0), "safeErrorCode": result.get("errorCode")})
        if result.get("status") in {"stopped", "backoff"}:
            break
    print({"diagnostics": service.diagnostics()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
