from __future__ import annotations

from datetime import datetime, timezone


FRESHNESS_RULES_SECONDS = {
    "league_availability": 300,
    "schedules": 300,
    "live_status": 10,
    "pregame_odds": 60,
    "live_odds": 8,
    "player_props": 60,
    "team_statistics": 3600,
    "player_statistics": 3600,
    "injuries": 300,
    "lineups": 90,
    "weather": 600,
    "line_movement": 30,
    "combat_cards": 300,
    "motorsport_sessions": 120,
    "completed_events": 86400,
}


def parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def freshness_state(domain: str, updated_at: object, now: datetime | None = None) -> str:
    timestamp = parse_timestamp(updated_at)
    if timestamp is None:
        return "stale"
    current = now or datetime.now(timezone.utc)
    age = max(0.0, (current - timestamp).total_seconds())
    limit = FRESHNESS_RULES_SECONDS.get(domain, 300)
    if age <= limit:
        return "fresh"
    if age <= limit * 3:
        return "delayed"
    return "stale"
