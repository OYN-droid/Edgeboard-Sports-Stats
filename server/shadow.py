from __future__ import annotations

import json
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from .database import Database, utc_now
from .freshness import parse_timestamp


DISCREPANCY_CATEGORIES = (
    "missing_primary", "missing_secondary", "identity_conflict", "time_conflict",
    "status_conflict", "score_conflict", "stat_conflict", "market_conflict",
    "stale_primary", "stale_secondary", "unsupported_comparison",
)


def compare_shadow(
    primary: Any, secondary: Any, *, domain: str, timestamp_tolerance_seconds: int = 60,
    stale_after_seconds: int = 300, now: datetime | None = None,
) -> list[dict[str, Any]]:
    current = now or datetime.now(timezone.utc)
    left = _items(primary)
    right = _items(secondary)
    left_map = {_identity(item): item for item in left if _identity(item)}
    right_map = {_identity(item): item for item in right if _identity(item)}
    discrepancies: list[dict[str, Any]] = []
    for record_id in sorted(set(left_map) | set(right_map)):
        first, second = left_map.get(record_id), right_map.get(record_id)
        if first is None:
            discrepancies.append(_discrepancy("missing_primary", record_id))
            continue
        if second is None:
            discrepancies.append(_discrepancy("missing_secondary", record_id))
            continue
        first_participants = _participants(first)
        second_participants = _participants(second)
        if first_participants and second_participants and first_participants != second_participants:
            discrepancies.append(_discrepancy("identity_conflict", record_id, {"primary": first_participants, "secondary": second_participants}))
        first_time = parse_timestamp(first.get("starts_at") or first.get("start_time"))
        second_time = parse_timestamp(second.get("starts_at") or second.get("start_time"))
        if first_time and second_time and abs((first_time - second_time).total_seconds()) > timestamp_tolerance_seconds:
            discrepancies.append(_discrepancy("time_conflict", record_id, {
                "primary": first_time.isoformat(), "secondary": second_time.isoformat(),
                "deltaSeconds": abs((first_time - second_time).total_seconds()),
            }))
        if first.get("status") is not None and second.get("status") is not None and first["status"] != second["status"]:
            discrepancies.append(_discrepancy("status_conflict", record_id, {"primary": first["status"], "secondary": second["status"]}))
        if first.get("score") is not None and second.get("score") is not None and first["score"] != second["score"]:
            discrepancies.append(_discrepancy("score_conflict", record_id, {"primary": first["score"], "secondary": second["score"]}))
        comparison_field = "value" if domain in {"statistics", "historical_statistics"} else "selections" if domain in {"markets", "odds", "props"} else ""
        if comparison_field and first.get(comparison_field) != second.get(comparison_field):
            discrepancies.append(_discrepancy(
                "stat_conflict" if comparison_field == "value" else "market_conflict", record_id,
                {"field": comparison_field, "primary": first.get(comparison_field), "secondary": second.get(comparison_field)},
            ))
    for label, records in (("stale_primary", left), ("stale_secondary", right)):
        timestamps = [parse_timestamp(item.get("provider_updated_at") or item.get("updated_at")) for item in records]
        valid = [stamp for stamp in timestamps if stamp]
        if records and (not valid or all((current - stamp).total_seconds() > stale_after_seconds for stamp in valid)):
            newest = max(valid) if valid else None
            discrepancies.append(_discrepancy(label, "*", {
                "latestTimestamp": newest.isoformat() if newest else None,
                "ageSeconds": (current - newest).total_seconds() if newest else None,
                "thresholdSeconds": stale_after_seconds,
            }))
    if not isinstance(primary, (dict, list)) or not isinstance(secondary, (dict, list)):
        discrepancies.append(_discrepancy("unsupported_comparison", "*"))
    return discrepancies


class ShadowService:
    def __init__(self, database: Database):
        self.database = database

    def record(self, league_id: str, domain: str, primary_provider: str, comparison_provider: str, discrepancies: list[dict[str, Any]]) -> int:
        if not discrepancies:
            return 0
        now = utc_now()
        with self.database.transaction() as connection:
            for item in discrepancies:
                connection.execute(
                    """INSERT INTO shadow_discrepancies(
                      id,league_id,domain,primary_provider,comparison_provider,category,record_id,details_json,detected_at
                    ) VALUES(?,?,?,?,?,?,?,?,?)""",
                    (uuid.uuid4().hex, league_id, domain, primary_provider, comparison_provider,
                     item["category"], item.get("recordId"), json.dumps(item.get("details", {})), now),
                )
        return len(discrepancies)

    def summary(self, league_id: str = "") -> dict[str, Any]:
        clause, parameters = ("WHERE resolved_at IS NULL AND league_id=?", (league_id,)) if league_id else ("WHERE resolved_at IS NULL", ())
        rows = self.database.execute(f"SELECT league_id,domain,category,COUNT(*) count FROM shadow_discrepancies {clause} GROUP BY league_id,domain,category", parameters)
        return {"leagueId": league_id or None, "total": sum(row["count"] for row in rows), "groups": rows}


def _items(value: Any) -> list[dict[str, Any]]:
    items = value.get("items", []) if isinstance(value, dict) else value if isinstance(value, list) else []
    return [item for item in items if isinstance(item, dict)]


def _identity(item: dict[str, Any]) -> str:
    return str(item.get("event_id") or item.get("id") or item.get("provider_market_id") or item.get("stat_id") or "")


def _participants(item: dict[str, Any]) -> tuple[str, ...]:
    values = item.get("participants") if isinstance(item.get("participants"), list) else []
    return tuple(str(value.get("id") or value.get("provider_id") or "") for value in values if isinstance(value, dict))


def _discrepancy(category: str, record_id: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"category": category, "recordId": record_id, "details": details or {}}
