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
    "standings": 600,
    "historical_stats": 86400,
    "play_by_play": 5,
    "telemetry": 3,
}

FRESHNESS_STATES = {
    "live", "fresh", "delayed", "stale", "expired", "partial",
    "unavailable", "error", "sample",
}


def parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def freshness_state(domain: str, updated_at: object, now: datetime | None = None, *, sample: bool = False) -> str:
    if sample:
        return "sample"
    timestamp = parse_timestamp(updated_at)
    if timestamp is None:
        return "unavailable"
    current = now or datetime.now(timezone.utc)
    age = max(0.0, (current - timestamp).total_seconds())
    limit = FRESHNESS_RULES_SECONDS.get(domain, 300)
    if age <= limit:
        return "fresh"
    if age <= limit * 3:
        return "delayed"
    if age <= limit * 120:
        return "stale"
    return "expired"


def freshness_metadata(
    domain: str,
    *,
    source: str,
    fetched_at: object,
    provider_updated_at: object = None,
    normalized_at: object = None,
    completeness: float = 1.0,
    warnings: list[str] | None = None,
    sample: bool = False,
    now: datetime | None = None,
) -> dict[str, object]:
    current = now or datetime.now(timezone.utc)
    fetched = parse_timestamp(fetched_at) or current
    provider_time = parse_timestamp(provider_updated_at) or fetched
    normalized = parse_timestamp(normalized_at) or current
    limit = FRESHNESS_RULES_SECONDS.get(domain, 300)
    state = freshness_state(domain, provider_time.isoformat(), current, sample=sample)
    return {
        "source": source,
        "fetchedAt": fetched.isoformat().replace("+00:00", "Z"),
        "providerUpdatedAt": provider_time.isoformat().replace("+00:00", "Z"),
        "normalizedAt": normalized.isoformat().replace("+00:00", "Z"),
        "expiresAt": (fetched.timestamp() + limit),
        "freshnessState": state,
        "completeness": min(1.0, max(0.0, float(completeness))),
        "warnings": list(warnings or []),
    }


def data_quality_score(
    *,
    completeness: float,
    freshness: str,
    reconciliation_confidence: float,
    provider_health: float,
    duplicate_count: int = 0,
    invalid_unit_count: int = 0,
    consistent_event_status: bool = True,
) -> dict[str, object]:
    freshness_weight = {
        "live": 1.0, "fresh": 1.0, "sample": 0.65, "delayed": 0.75,
        "partial": 0.6, "stale": 0.4, "expired": 0.15, "unavailable": 0.0, "error": 0.0,
    }.get(freshness, 0.0)
    penalties = min(0.35, duplicate_count * 0.03 + invalid_unit_count * 0.05 + (0 if consistent_event_status else 0.15))
    raw = (
        min(1.0, max(0.0, completeness)) * 0.3
        + freshness_weight * 0.25
        + min(1.0, max(0.0, reconciliation_confidence)) * 0.2
        + min(1.0, max(0.0, provider_health)) * 0.25
        - penalties
    )
    score = round(max(0.0, min(1.0, raw)) * 100)
    return {
        "score": score,
        "status": "good" if score >= 80 else "limited" if score >= 55 else "poor",
        "isBettingConfidence": False,
    }
