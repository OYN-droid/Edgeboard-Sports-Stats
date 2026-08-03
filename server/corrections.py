from __future__ import annotations

import json
import uuid
from typing import Any

from .database import Database, utc_now
from .freshness import parse_timestamp


AFFECTED_OUTPUTS = (
    "summaries", "leaderboards", "comparisons", "insights", "milestones",
    "visualizations", "projections", "alerts", "tracked_research",
)


class CorrectionService:
    def __init__(self, database: Database, cache: Any | None = None):
        self.database = database
        self.cache = cache

    def record(
        self, *, league_id: str, domain: str, record_id: str, provider: str,
        old_value: dict[str, Any], new_value: dict[str, Any], provider_corrected_at: str | None = None,
        model_version: str = "",
    ) -> dict[str, Any]:
        correction_id = uuid.uuid4().hex
        queue_id = uuid.uuid4().hex
        now = utc_now()
        input_timestamp = provider_corrected_at or now
        previous_inputs = self.database.execute(
            "SELECT input_timestamp FROM recalculation_queue WHERE league_id=? AND record_id=? ORDER BY created_at DESC LIMIT 1",
            (league_id, record_id),
        )
        queue_status = "superseded" if previous_inputs and _newer(previous_inputs[0]["input_timestamp"], input_timestamp) else "queued"
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO data_corrections(
                  id,league_id,domain,record_id,provider,old_value_json,new_value_json,provider_corrected_at,detected_at
                ) VALUES(?,?,?,?,?,?,?,?,?)""",
                (correction_id, league_id, domain, record_id, provider, json.dumps(old_value, sort_keys=True),
                 json.dumps(new_value, sort_keys=True), provider_corrected_at, now),
            )
            connection.execute(
                """INSERT INTO recalculation_queue(
                  id,league_id,trigger_type,record_id,affected_outputs_json,model_version,input_timestamp,status,created_at
                ) VALUES(?,?,?,?,?,?,?,?,?)""",
                (queue_id, league_id, f"{domain}_correction", record_id, json.dumps(AFFECTED_OUTPUTS),
                 model_version or None, input_timestamp, queue_status, now),
            )
        invalidated = 0
        if self.cache:
            invalidated += self.cache.invalidate(tag=f"record:{record_id}")
            invalidated += self.cache.invalidate(tag=f"event:{record_id}")
            invalidated += self.cache.invalidate(tag=f"league:{league_id}")
        return {
            "correctionId": correction_id, "queueId": queue_id, "queueStatus": queue_status,
            "invalidated": invalidated, "affectedOutputs": list(AFFECTED_OUTPUTS),
        }

    def complete(self, queue_id: str) -> bool:
        """Complete only the newest evidence for a record; older work cannot win a race."""
        rows = self.database.execute("SELECT * FROM recalculation_queue WHERE id=?", (queue_id,))
        if not rows:
            return False
        item = rows[0]
        candidates = self.database.execute(
            "SELECT id,input_timestamp FROM recalculation_queue WHERE league_id=? AND record_id=? AND id<>?",
            (item["league_id"], item["record_id"], queue_id),
        )
        status = "superseded" if any(_newer(candidate["input_timestamp"], item["input_timestamp"]) for candidate in candidates) else "completed"
        with self.database.transaction() as connection:
            connection.execute(
                "UPDATE recalculation_queue SET status=?,completed_at=? WHERE id=? AND status IN ('queued','running')",
                (status, utc_now(), queue_id),
            )
        return status == "completed"


def _newer(candidate: str | None, reference: str | None) -> bool:
    candidate_time, reference_time = parse_timestamp(candidate), parse_timestamp(reference)
    return bool(candidate_time and reference_time and candidate_time > reference_time)
