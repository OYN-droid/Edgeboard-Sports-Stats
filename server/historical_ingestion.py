from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .database import Database, utc_now
from .domain_validation import validate_records, validate_stat_row


@dataclass(frozen=True)
class HistoricalIngestionResult:
    accepted: int
    rejected: int
    corrections: int
    invalidated_cache_entries: int
    warnings: tuple[str, ...]


class HistoricalStatsIngestor:
    def __init__(self, database: Database, cache: Any | None = None):
        self.database = database
        self.cache = cache

    def ingest(self, rows: list[dict[str, Any]], provider: str) -> HistoricalIngestionResult:
        validation = validate_records(rows, validate_stat_row)
        accepted = 0
        corrections = 0
        invalidated = 0
        warnings = list(validation.warnings)
        for row in validation.accepted:
            event_id = row.get("event_id")
            if event_id:
                events = self.database.execute("SELECT status FROM events WHERE id=? AND deleted_at IS NULL", (event_id,))
                if not events or events[0]["status"] != "final":
                    warnings.append(f"Stat row '{row['id']}' was skipped because its event is not complete.")
                    continue
            existing = self.database.execute(
                """SELECT id,value,unit,revision FROM stat_rows
                   WHERE event_id=? AND entity_id=? AND stat_id=? AND source=? AND deleted_at IS NULL""",
                (event_id, row["entity_id"], row["stat_id"], provider),
            )
            revision = int(existing[0]["revision"]) + 1 if existing else 1
            corrected = bool(existing and (
                existing[0]["value"] != row.get("value") or existing[0]["unit"] != row["unit"]
            ))
            with self.database.transaction() as connection:
                if existing:
                    connection.execute(
                        """UPDATE stat_rows SET value=?,unit=?,source_updated_at=?,ingested_at=?,
                           revision=?,deleted_at=NULL WHERE id=?""",
                        (
                            row.get("value"), row["unit"], row.get("provider_updated_at"),
                            utc_now(), revision, existing[0]["id"],
                        ),
                    )
                else:
                    connection.execute(
                        """INSERT INTO stat_rows(
                            id,event_id,entity_id,team_id,league_id,season,stage,stat_id,
                            value,unit,source,source_updated_at,ingested_at,revision
                        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (
                            row["id"], event_id, row["entity_id"], row.get("team_id"), row["league_id"],
                            row.get("season"), row.get("stage"), row["stat_id"], row.get("value"),
                            row["unit"], provider, row.get("provider_updated_at"), utc_now(), revision,
                        ),
                    )
            accepted += 1
            corrections += int(corrected)
            if corrected and self.cache:
                invalidated += self.cache.invalidate(tag=f"entity:{row['entity_id']}")
                invalidated += self.cache.invalidate(tag=f"league:{row['league_id']}:leaderboard")
                invalidated += self.cache.invalidate(tag=f"entity:{row['entity_id']}:insights")
        return HistoricalIngestionResult(
            accepted, len(validation.rejected), corrections, invalidated, tuple(dict.fromkeys(warnings)),
        )
