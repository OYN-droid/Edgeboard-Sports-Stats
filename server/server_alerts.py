from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .database import Database, utc_now


SERVER_ALERT_CATEGORIES = {
    "line_movement", "odds_threshold", "market_availability", "event_start",
    "lineup_confirmation", "injury_update", "milestone", "streak",
    "leaderboard_change", "stale_data", "tracked_entity_update",
}


@dataclass(frozen=True)
class AlertEvaluation:
    triggered: bool
    reason: str
    event: dict[str, Any] | None = None


class ServerAlertService:
    def __init__(self, database: Database, configured_channels: set[str] | None = None):
        self.database = database
        self.configured_channels = {"in_app"} & set(configured_channels or {"in_app"})

    def capabilities(self) -> dict[str, bool]:
        return {
            "inApp": "in_app" in self.configured_channels,
            "email": "email" in self.configured_channels,
            "push": "push" in self.configured_channels,
            "continuousMonitoring": False,
        }

    def evaluate(self, rule: dict[str, Any], reading: dict[str, Any], now: datetime | None = None) -> AlertEvaluation:
        current = now or datetime.now(timezone.utc)
        if rule.get("category") not in SERVER_ALERT_CATEGORIES:
            return AlertEvaluation(False, "unsupported_category")
        if reading.get("freshnessState") in {"stale", "expired", "unavailable", "error"} and rule.get("category") != "stale_data":
            return AlertEvaluation(False, "stale_data_ignored")
        old_value = rule.get("lastKnownValue")
        new_value = reading.get("value", reading.get("status"))
        cooldown = max(0, int(rule.get("cooldownSeconds") or 0))
        last_triggered = rule.get("lastTriggeredAt")
        if last_triggered:
            then = datetime.fromisoformat(str(last_triggered).replace("Z", "+00:00"))
            if (current - then).total_seconds() < cooldown:
                return AlertEvaluation(False, "cooldown")
        condition = rule.get("condition") or {}
        triggered = condition_matches(condition, old_value, new_value, reading)
        if not triggered:
            return AlertEvaluation(False, "condition_not_met")
        if rule.get("lastTriggeredValue") == new_value and old_value == new_value:
            return AlertEvaluation(False, "duplicate_suppressed")
        event = {
            "id": uuid.uuid4().hex,
            "ruleId": rule["id"],
            "ownerId": rule["ownerId"],
            "oldValue": old_value,
            "newValue": new_value,
            "condition": condition,
            "source": reading.get("source"),
            "freshnessState": reading.get("freshnessState"),
            "triggeredAt": current.isoformat().replace("+00:00", "Z"),
            "message": f"{condition.get('metric', 'value')} changed from {old_value if old_value is not None else 'unavailable'} to {new_value}.",
            "delivery": [channel for channel in rule.get("delivery", ["in_app"]) if channel in self.configured_channels],
            "guaranteedOutcome": False,
        }
        return AlertEvaluation(True, "triggered", event)

    def persist_event(self, event: dict[str, Any]) -> None:
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO alert_events(
                    id,rule_id,owner_id,old_value_json,new_value_json,condition_json,
                    source,freshness_state,triggered_at,audit_json
                ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (
                    event["id"], event["ruleId"], event["ownerId"], json.dumps(event["oldValue"]),
                    json.dumps(event["newValue"]), json.dumps(event["condition"]), event.get("source"),
                    event.get("freshnessState"), event["triggeredAt"],
                    json.dumps({"delivery": event["delivery"], "guaranteedOutcome": False}),
                ),
            )
            connection.execute(
                """UPDATE alert_rules SET last_known_json=?,last_triggered_json=?,updated_at=?
                   WHERE id=? AND owner_id=? AND deleted_at IS NULL""",
                (
                    json.dumps({"value": event["newValue"]}, separators=(",", ":")),
                    json.dumps({"value": event["newValue"], "at": event["triggeredAt"]}, separators=(",", ":")),
                    utc_now(), event["ruleId"], event["ownerId"],
                ),
            )


def condition_matches(condition: dict[str, Any], old_value: Any, new_value: Any, reading: dict[str, Any]) -> bool:
    operator = condition.get("operator")
    threshold = condition.get("value")
    try:
        if operator == "greater_than": return float(new_value) > float(threshold)
        if operator == "greater_than_or_equal": return float(new_value) >= float(threshold)
        if operator == "less_than": return float(new_value) < float(threshold)
        if operator == "less_than_or_equal": return float(new_value) <= float(threshold)
        if operator == "changed_by_at_least": return old_value is not None and abs(float(new_value) - float(old_value)) >= float(threshold)
    except (TypeError, ValueError):
        return False
    if operator == "equals": return new_value == threshold
    if operator == "became_available": return new_value == "available" and old_value != "available"
    if operator == "became_stale": return reading.get("freshnessState") == "stale" and old_value != "stale"
    return False
