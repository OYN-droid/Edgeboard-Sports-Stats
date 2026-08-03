from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from .database import Database, utc_now


class ProviderUsageMonitor:
    def __init__(self, database: Database, warning_thresholds: dict[str, int] | None = None):
        self.database = database
        self.thresholds = {"requestsPerHour": 5000, "retriesPerHour": 250, "expensiveRequestsPerHour": 100, **(warning_thresholds or {})}

    def record(self, *, provider: str, endpoint: str, league_id: str = "", response_bytes: int = 0, cache_hit: bool = False, retries: int = 0, error_code: str = "", rate_limit_remaining: int | None = None, cost_category: str = "unknown") -> None:
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO provider_usage(
                  id,provider,endpoint,league_id,response_bytes,cache_hit,retries,error_code,
                  rate_limit_remaining,cost_category,occurred_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (uuid.uuid4().hex, provider, endpoint, league_id or None, max(0, int(response_bytes)),
                 int(cache_hit), max(0, int(retries)), error_code or None, rate_limit_remaining, cost_category, utc_now()),
            )

    def summary(self, provider: str = "") -> dict[str, Any]:
        window_started_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        clause, parameters = (
            ("WHERE occurred_at>=? AND provider=?", (window_started_at, provider))
            if provider else ("WHERE occurred_at>=?", (window_started_at,))
        )
        rows = self.database.execute(
            f"""SELECT provider,league_id,endpoint,cost_category,COUNT(*) requests,SUM(response_bytes) response_bytes,
                SUM(cache_hit) cache_hits,SUM(retries) retries,SUM(CASE WHEN error_code IS NULL THEN 0 ELSE 1 END) errors
                FROM provider_usage {clause} GROUP BY provider,league_id,endpoint,cost_category""", parameters,
        )
        totals = {"requests": sum(row["requests"] for row in rows), "retries": sum(row["retries"] or 0 for row in rows), "cacheHits": sum(row["cache_hits"] or 0 for row in rows)}
        warnings = []
        if totals["requests"] > self.thresholds["requestsPerHour"]: warnings.append("Provider request usage exceeds the configured warning threshold.")
        if totals["retries"] > self.thresholds["retriesPerHour"]: warnings.append("Provider retries exceed the configured warning threshold.")
        expensive = sum(row["requests"] for row in rows if row["cost_category"] == "high")
        if expensive > self.thresholds["expensiveRequestsPerHour"]: warnings.append("High-cost endpoint usage exceeds the configured warning threshold.")
        return {
            "window": {"seconds": 3600, "startedAt": window_started_at},
            "totals": totals, "groups": rows, "warnings": warnings,
            "pricing": "Confidential provider pricing is not exposed.",
        }
