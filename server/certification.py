from __future__ import annotations

import json
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .database import Database, utc_now
from .errors import ValidationError
from .freshness import parse_timestamp
from .rollout import CERTIFICATION_CATEGORIES, CERTIFICATION_STATUSES


REQUIRED_CHECKS = {
    "identity": ("league_mapping", "participant_mapping", "venue_mapping", "duplicate_names", "historical_continuity"),
    "schedule": ("timestamps", "participant_order", "statuses", "postponements", "rescheduling", "finalization"),
    "statistics": ("definitions", "units", "missing_values", "corrections", "season_scope", "qualification"),
    "markets": ("identity", "participants", "line_odds", "period_scope", "sportsbook", "suspension", "timestamps"),
    "freshness": ("provider_timestamp", "ingestion_lag", "cache_age", "stale_fallback"),
    "ui": ("navigation", "market_board", "research_modes", "profiles", "filters", "slip", "workspace"),
    "reliability": ("timeout", "rate_limit", "outage", "malformed", "partial", "stale_cache", "recovery"),
}


@dataclass(frozen=True)
class HealthResult:
    score: float
    state: str
    components: dict[str, float]
    is_betting_confidence: bool = False


class CertificationService:
    def __init__(self, database: Database):
        self.database = database

    def record(
        self, league_id: str, category: str, check_key: str, status: str,
        *, evidence: dict[str, Any], actor: str, evidence_at: str | None = None,
        expires_at: str | None = None, notes: str = "",
    ) -> str:
        if category not in CERTIFICATION_CATEGORIES or check_key not in REQUIRED_CHECKS[category]:
            raise ValidationError("Unknown certification check.")
        if status not in CERTIFICATION_STATUSES:
            raise ValidationError("Unknown certification status.")
        if status in {"passing", "certified", "conditional"} and not evidence:
            raise ValidationError("Positive certification results require structured evidence.")
        timestamp = evidence_at or utc_now()
        if parse_timestamp(timestamp) is None or (expires_at and parse_timestamp(expires_at) is None):
            raise ValidationError("Certification evidence timestamps must be valid ISO timestamps.")
        result_id = uuid.uuid4().hex
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO certification_results(
                  id,league_id,category,check_key,status,evidence_json,evidence_at,expires_at,
                  decided_by,notes,created_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (result_id, league_id, category, check_key, status, json.dumps(evidence), timestamp,
                 expires_at, actor[:120], notes[:1000], utc_now()),
            )
        return result_id

    def checklist(self, league_id: str) -> dict[str, Any]:
        rows = self.database.execute(
            """SELECT c.* FROM certification_results c
               JOIN (SELECT category,check_key,MAX(created_at) AS latest FROM certification_results
                     WHERE league_id=? GROUP BY category,check_key) x
               ON c.category=x.category AND c.check_key=x.check_key AND c.created_at=x.latest
               WHERE c.league_id=?""",
            (league_id, league_id),
        )
        latest = {(row["category"], row["check_key"]): row for row in rows}
        now = datetime.now(timezone.utc)
        categories: list[dict[str, Any]] = []
        for category in CERTIFICATION_CATEGORIES:
            checks = []
            for key in REQUIRED_CHECKS[category]:
                row = latest.get((category, key))
                status = row["status"] if row else "not_started"
                if row and row["expires_at"] and parse_timestamp(row["expires_at"]) < now:
                    status = "failing"
                checks.append({
                    "key": key, "status": status,
                    "resultId": row["id"] if row else None,
                    "evidenceAt": row["evidence_at"] if row else None,
                    "expiresAt": row["expires_at"] if row else None,
                    "decidedBy": row["decided_by"] if row else None,
                    "decidedAt": row["created_at"] if row else None,
                    "evidence": json.loads(row["evidence_json"]) if row else {},
                    "notes": row["notes"] if row else "",
                })
            statuses = {check["status"] for check in checks}
            overall = (
                "certified" if statuses == {"certified"}
                else "failing" if "failing" in statuses or "suspended" in statuses
                else "passing" if statuses <= {"passing", "certified"}
                else "conditional" if statuses <= {"conditional", "passing", "certified"}
                else "not_started"
            )
            categories.append({"category": category, "status": overall, "checks": checks})
        return {"leagueId": league_id, "categories": categories, "productionReady": self.production_ready(league_id, categories)}

    def production_ready(self, league_id: str, categories: list[dict[str, Any]] | None = None) -> bool:
        evaluated = categories if categories is not None else self.checklist(league_id)["categories"]
        return bool(evaluated) and all(category["status"] == "certified" for category in evaluated)


def calculate_health(metrics: dict[str, float], weights: dict[str, float] | None = None) -> HealthResult:
    default_weights = {
        "provider_uptime": .16, "request_success": .14, "freshness": .14,
        "schedule_completeness": .11, "entity_reconciliation": .11, "stat_completeness": .09,
        "market_coverage": .08, "validation_success": .07, "discrepancy_success": .06,
        "cache_independence": .03, "ui_success": .01,
    }
    active = weights or default_weights
    if any(value < 0 for value in active.values()) or sum(active.values()) <= 0:
        raise ValidationError("Health weights must be non-negative and have a positive total.")
    components = {key: max(0.0, min(1.0, float(metrics.get(key, 0)))) for key in active}
    score = round(sum(components[key] * weight for key, weight in active.items()) / sum(active.values()) * 100, 1)
    state = "healthy" if score >= 90 else "watch" if score >= 75 else "degraded" if score >= 55 else "failing" if score >= 25 else "suspended"
    return HealthResult(score, state, components)


def evaluate_release_gate(observed: dict[str, float], thresholds: dict[str, dict[str, float]]) -> dict[str, Any]:
    checks = []
    for key, rule in thresholds.items():
        value = float(observed.get(key, 0))
        passed = value >= float(rule["min"]) if "min" in rule else value <= float(rule["max"])
        checks.append({"key": key, "value": value, "rule": dict(rule), "passed": passed})
    return {"passed": bool(checks) and all(check["passed"] for check in checks), "checks": checks}


def certification_summary(checklists: list[dict[str, Any]]) -> dict[str, int]:
    return dict(Counter(category["status"] for checklist in checklists for category in checklist["categories"]))
