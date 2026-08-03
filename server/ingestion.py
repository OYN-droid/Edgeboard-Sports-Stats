from __future__ import annotations

import json
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from .database import Database, utc_now
from .domain_validation import validate_event, validate_records
from .errors import DatabaseError


JOB_TYPES = {
    "refresh_league_catalog", "refresh_active_schedules", "refresh_live_events",
    "finalize_completed_events", "ingest_historical_statistics", "refresh_standings",
    "refresh_injuries", "refresh_lineups", "refresh_odds", "refresh_line_movement",
    "refresh_provider_health", "reconcile_entities", "evaluate_server_alerts",
    "clean_stale_cache", "clean_expired_raw_payloads",
}
JOB_STATUSES = {"queued", "running", "partial", "succeeded", "failed", "cancelled"}


@dataclass(frozen=True)
class JobResult:
    job_id: str
    status: str
    records_read: int
    records_accepted: int
    records_rejected: int
    warnings: tuple[str, ...]
    error_summary: str | None = None


class IngestionRunner:
    def __init__(self, database: Database, provider_manager: Any, cache: Any | None = None, correction_service: Any | None = None, rollout_service: Any | None = None):
        self.database = database
        self.provider_manager = provider_manager
        self.cache = cache
        self.correction_service = correction_service
        self.rollout_service = rollout_service
        self.handlers: dict[str, Callable[[dict[str, Any]], JobResult]] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()
        self.register("refresh_active_schedules", self._refresh_schedules)
        self.register("refresh_live_events", self._refresh_live_events)
        self.register("finalize_completed_events", self._finalize_events)

    def register(self, job_type: str, handler: Callable[[dict[str, Any]], JobResult]) -> None:
        if job_type not in JOB_TYPES:
            raise ValueError("Unsupported ingestion job type.")
        self.handlers[job_type] = handler

    def run(
        self,
        job_type: str,
        *,
        provider: str = "",
        sport_id: str = "",
        league_id: str = "",
        date_scope: str = "",
        retry_count: int = 0,
    ) -> JobResult:
        if job_type not in JOB_TYPES:
            raise ValueError("Unsupported ingestion job type.")
        if league_id and self.rollout_service:
            rollout = self.rollout_service.get(league_id)
            if rollout["rolloutState"] in {"disabled", "suspended"}:
                raise ValueError(f"Ingestion is disabled while {league_id} is {rollout['rolloutState']}.")
        lock_key = f"{job_type}:{provider}:{sport_id}:{league_id}:{date_scope}"
        with self._guard:
            lock = self._locks.setdefault(lock_key, threading.Lock())
        if not lock.acquire(blocking=False):
            raise DatabaseError("An identical ingestion job is already running.")
        job_id = uuid.uuid4().hex
        started = utc_now()
        try:
            with self.database.transaction() as connection:
                connection.execute(
                    """INSERT INTO ingestion_jobs(
                        id, job_type, provider, sport_id, league_id, date_scope, started_at,
                        status, retry_count, lock_key
                    ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                    (job_id, job_type, provider, sport_id, league_id, date_scope, started, "running", retry_count, lock_key),
                )
            context = {
                "jobId": job_id, "jobType": job_type, "provider": provider,
                "sportId": sport_id, "leagueId": league_id, "dateScope": date_scope,
            }
            if self.cancel_requested(job_id):
                result = JobResult(job_id, "cancelled", 0, 0, 0, ())
            elif job_type in self.handlers:
                result = self.handlers[job_type](context)
            else:
                result = JobResult(job_id, "partial", 0, 0, 0, ("Job foundation has no configured domain handler.",))
            self._finish(result)
            return result
        except Exception as error:
            result = JobResult(job_id, "failed", 0, 0, 0, (), str(error)[:500])
            self._finish(result)
            return result
        finally:
            lock.release()

    def cancel(self, job_id: str) -> bool:
        with self.database.transaction() as connection:
            cursor = connection.execute(
                "UPDATE ingestion_jobs SET cancellation_requested = 1 WHERE id = ? AND status IN ('queued','running')",
                (job_id,),
            )
        return cursor.rowcount == 1

    def cancel_requested(self, job_id: str) -> bool:
        rows = self.database.execute("SELECT cancellation_requested FROM ingestion_jobs WHERE id = ?", (job_id,))
        return bool(rows and rows[0]["cancellation_requested"])

    def recent(self, limit: int = 20) -> list[dict[str, Any]]:
        return self.database.execute(
            """SELECT id, job_type, provider, sport_id, league_id, date_scope, started_at, ended_at,
               status, records_read, records_accepted, records_rejected, warnings_json,
               error_summary, retry_count, next_scheduled_at
               FROM ingestion_jobs ORDER BY started_at DESC LIMIT ?""",
            (max(1, min(100, limit)),),
        )

    def _refresh_schedules(self, context: dict[str, Any]) -> JobResult:
        fetched = self.provider_manager.fetch(
            "schedules", {"leagueId": context["leagueId"]} if context["leagueId"] else None, allow_sample=True,
        )
        records = fetched.data.get("items", []) if isinstance(fetched.data, dict) else fetched.data
        validation = validate_records(records, validate_event)
        self._record_rejections(context, fetched.provider, validation.rejected)
        accepted = 0
        for event in validation.accepted:
            persisted = self.database.upsert_event(event, fetched.provider, "fixture-v1")
            if persisted["corrected"] and self.cache:
                self.cache.invalidate(tag=f"event:{persisted['eventId']}")
                self.cache.invalidate(tag=f"league:{event['league_key']}:schedule")
                self.cache.invalidate(tag="domain:schedules")
            if persisted["corrected"] and self.correction_service:
                self.correction_service.record(
                    league_id=event["league_key"], domain="event", record_id=persisted["eventId"],
                    provider=fetched.provider, old_value=persisted["previous"] or {}, new_value=persisted["current"],
                    provider_corrected_at=event.get("provider_updated_at"),
                )
            accepted += 1
        status = "partial" if validation.partial else "succeeded"
        return JobResult(
            context["jobId"], status, len(records), accepted, len(validation.rejected),
            tuple([
                *validation.warnings,
                *([f"{len(validation.rejected)} malformed record(s) were quarantined."] if validation.rejected else []),
                *fetched.warnings,
            ]),
        )

    def _refresh_live_events(self, context: dict[str, Any]) -> JobResult:
        fetched = self.provider_manager.fetch("live_status", allow_sample=False)
        records = fetched.data.get("items", []) if isinstance(fetched.data, dict) else fetched.data
        return JobResult(context["jobId"], "succeeded", len(records), len(records), 0, fetched.warnings)

    def _finalize_events(self, context: dict[str, Any]) -> JobResult:
        rows = self.database.execute("SELECT id FROM events WHERE status = 'final' AND deleted_at IS NULL")
        if self.cache:
            for row in rows:
                self.cache.invalidate(tag=f"event:{row['id']}")
        return JobResult(context["jobId"], "succeeded", len(rows), len(rows), 0, ())

    def _finish(self, result: JobResult) -> None:
        with self.database.transaction() as connection:
            connection.execute(
                """UPDATE ingestion_jobs SET ended_at=?, status=?, records_read=?, records_accepted=?,
                   records_rejected=?, warnings_json=?, error_summary=? WHERE id=?""",
                (
                    utc_now(), result.status, result.records_read, result.records_accepted,
                    result.records_rejected, json.dumps(result.warnings), result.error_summary, result.job_id,
                ),
            )

    def _record_rejections(
        self,
        context: dict[str, Any],
        provider: str,
        rejected: tuple[dict[str, Any], ...],
    ) -> None:
        if not rejected:
            return
        with self.database.transaction() as connection:
            for item in rejected:
                connection.execute(
                    """INSERT INTO data_quality_warnings(
                        id,record_type,record_id,warning_code,severity,source,details_json,created_at
                    ) VALUES(?,?,?,?,?,?,?,?)""",
                    (
                        uuid.uuid4().hex,
                        context["jobType"],
                        item.get("recordId"),
                        item.get("code") or "validation_error",
                        "warning",
                        provider,
                        json.dumps({
                            "jobId": context["jobId"],
                            "index": item.get("index"),
                            "message": str(item.get("message") or "Record rejected.")[:240],
                        }, separators=(",", ":")),
                        utc_now(),
                    ),
                )


def schedule_manifest(environment: str) -> list[dict[str, object]]:
    enabled = environment in {"staging", "production"}
    return [
        {"jobType": "refresh_active_schedules", "intervalSeconds": 300, "enabled": enabled},
        {"jobType": "refresh_live_events", "intervalSeconds": 10, "enabled": False},
        {"jobType": "refresh_odds", "intervalSeconds": 45, "enabled": False},
        {"jobType": "refresh_provider_health", "intervalSeconds": 60, "enabled": enabled},
        {"jobType": "clean_stale_cache", "intervalSeconds": 3600, "enabled": enabled},
    ]
