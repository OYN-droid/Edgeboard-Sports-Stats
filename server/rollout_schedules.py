from __future__ import annotations

from typing import Any


LEAGUE_SCHEDULES = {
    "mlb": {"schedule": 900, "probable_starters": 900, "lineups": 300, "live_status": 15, "completed_finalization": 300, "stats_corrections": 21600, "odds": 60},
    "wnba": {"schedule": 1800, "injuries": 600, "lineups": 300, "live_status": 15, "completed_finalization": 300, "odds": 60, "props": 90},
    "ufc": {"upcoming_events": 3600, "card_changes": 900, "fighter_updates": 21600, "weigh_ins": 600, "live_status": 30, "completed_finalization": 600, "odds": 90},
    "mls": {"schedule": 1800, "lineups": 300, "live_status": 20, "completed_finalization": 300, "standings": 1800, "odds": 90},
}


def league_schedule(league_id: str, *, event_state: str = "pregame", in_season: bool = True, rate_limited: bool = False) -> list[dict[str, Any]]:
    if league_id not in LEAGUE_SCHEDULES: return []
    multiplier = 6 if not in_season else 4 if event_state == "completed" else 0.25 if event_state == "live" else 0.5 if event_state == "imminent" else 1
    if rate_limited: multiplier = max(multiplier, 4)
    return [{"domain": domain, "intervalSeconds": max(5, round(seconds * multiplier)), "enabled": in_season or domain in {"schedule", "upcoming_events"}, "idempotent": True} for domain, seconds in LEAGUE_SCHEDULES[league_id].items()]
