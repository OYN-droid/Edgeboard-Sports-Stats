from __future__ import annotations

import contextlib
import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .errors import DatabaseError


SCHEMA_VERSION = 1


MIGRATION_1 = """
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sports (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, source TEXT,
  provider_version TEXT, ingested_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY, sport_id TEXT NOT NULL, name TEXT NOT NULL, competition_id TEXT,
  source TEXT, provider_version TEXT, ingested_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_leagues_sport ON leagues(sport_id);
CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY, sport_id TEXT NOT NULL, name TEXT NOT NULL, stage TEXT,
  source TEXT, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, latitude REAL, longitude REAL,
  source TEXT, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, display_name TEXT NOT NULL,
  sport_id TEXT, league_id TEXT, active INTEGER NOT NULL DEFAULT 1,
  identity_confidence REAL NOT NULL DEFAULT 0, review_status TEXT NOT NULL,
  source TEXT, provider_version TEXT, ingested_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_entities_scope ON entities(entity_type, sport_id, league_id);
CREATE TABLE IF NOT EXISTS provider_mappings (
  provider TEXT NOT NULL, provider_id TEXT NOT NULL, entity_id TEXT NOT NULL,
  valid_from TEXT, valid_to TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(provider, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_provider_mappings_entity ON provider_mappings(entity_id);
CREATE TABLE IF NOT EXISTS entity_aliases (
  entity_id TEXT NOT NULL, alias TEXT NOT NULL, normalized_alias TEXT NOT NULL,
  source TEXT, valid_from TEXT, valid_to TEXT,
  PRIMARY KEY(entity_id, normalized_alias)
);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_normalized ON entity_aliases(normalized_alias);
CREATE TABLE IF NOT EXISTS entity_relationships (
  id TEXT PRIMARY KEY, source_entity_id TEXT NOT NULL, target_entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL, valid_from TEXT, valid_to TEXT, source TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, league_id TEXT NOT NULL, competition_id TEXT, venue_id TEXT,
  event_type TEXT NOT NULL, status TEXT NOT NULL, starts_at TEXT, effective_at TEXT,
  source TEXT NOT NULL, provider_version TEXT, source_updated_at TEXT,
  ingested_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL DEFAULT '{}', deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source_identity ON events(source, id);
CREATE INDEX IF NOT EXISTS idx_events_schedule ON events(league_id, starts_at, status);
CREATE TABLE IF NOT EXISTS event_participants (
  event_id TEXT NOT NULL, entity_id TEXT NOT NULL, role TEXT NOT NULL,
  status TEXT, source TEXT, effective_at TEXT, payload_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(event_id, entity_id, role)
);
CREATE TABLE IF NOT EXISTS standings (
  id TEXT PRIMARY KEY, league_id TEXT NOT NULL, competition_id TEXT, season TEXT,
  entity_id TEXT NOT NULL, rank INTEGER, source TEXT, effective_at TEXT,
  ingested_at TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_standings_scope ON standings(league_id, season, rank);
CREATE TABLE IF NOT EXISTS stat_rows (
  id TEXT PRIMARY KEY, event_id TEXT, entity_id TEXT NOT NULL, team_id TEXT,
  league_id TEXT NOT NULL, season TEXT, stage TEXT, stat_id TEXT NOT NULL,
  value REAL, unit TEXT NOT NULL, source TEXT NOT NULL, source_updated_at TEXT,
  ingested_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stat_row_unique ON stat_rows(event_id, entity_id, stat_id, source);
CREATE INDEX IF NOT EXISTS idx_stat_rows_query ON stat_rows(league_id, entity_id, stat_id, season);
CREATE TABLE IF NOT EXISTS game_logs (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, entity_id TEXT NOT NULL, league_id TEXT NOT NULL,
  completed_at TEXT, source TEXT NOT NULL, coverage_json TEXT NOT NULL DEFAULT '{}',
  payload_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_logs_unique ON game_logs(event_id, entity_id, source);
CREATE TABLE IF NOT EXISTS injuries (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, event_id TEXT, status TEXT NOT NULL,
  confirmation_state TEXT NOT NULL, reported_at TEXT, effective_at TEXT, source TEXT NOT NULL,
  freshness_state TEXT NOT NULL, notes TEXT, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_injuries_entity ON injuries(entity_id, effective_at);
CREATE TABLE IF NOT EXISTS lineups (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, entity_id TEXT NOT NULL, role TEXT,
  status TEXT NOT NULL, confirmation_state TEXT NOT NULL, reported_at TEXT,
  effective_at TEXT, source TEXT NOT NULL, freshness_state TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_lineups_event ON lineups(event_id, confirmation_state);
CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, canonical_market_id TEXT NOT NULL,
  provider_market_id TEXT NOT NULL, sportsbook_id TEXT NOT NULL, period TEXT NOT NULL,
  settlement_scope TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL,
  opened_at TEXT, updated_at TEXT NOT NULL, closed_at TEXT, deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_identity ON markets(source, provider_market_id, sportsbook_id, period, settlement_scope);
CREATE INDEX IF NOT EXISTS idx_markets_event ON markets(event_id, canonical_market_id, status);
CREATE TABLE IF NOT EXISTS odds_snapshots (
  id TEXT PRIMARY KEY, market_id TEXT NOT NULL, selection_id TEXT NOT NULL, side TEXT,
  line REAL, american_odds INTEGER, is_live INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL, provider_updated_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL, payload_hash TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_odds_snapshot_unique ON odds_snapshots(market_id, selection_id, provider_updated_at, payload_hash);
CREATE INDEX IF NOT EXISTS idx_odds_history ON odds_snapshots(market_id, selection_id, provider_updated_at);
CREATE TABLE IF NOT EXISTS line_history (
  id TEXT PRIMARY KEY, market_id TEXT NOT NULL, selection_id TEXT NOT NULL,
  old_line REAL, new_line REAL, old_odds INTEGER, new_odds INTEGER,
  effective_at TEXT NOT NULL, source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_health (
  provider TEXT PRIMARY KEY, state TEXT NOT NULL, success_rate REAL, latency_ms REAL,
  circuit_state TEXT, last_success_at TEXT, last_error_at TEXT, warning_codes_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id TEXT PRIMARY KEY, job_type TEXT NOT NULL, provider TEXT, sport_id TEXT, league_id TEXT,
  date_scope TEXT, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL,
  records_read INTEGER NOT NULL DEFAULT 0, records_accepted INTEGER NOT NULL DEFAULT 0,
  records_rejected INTEGER NOT NULL DEFAULT 0, warnings_json TEXT NOT NULL DEFAULT '[]',
  error_summary TEXT, retry_count INTEGER NOT NULL DEFAULT 0, next_scheduled_at TEXT,
  cancellation_requested INTEGER NOT NULL DEFAULT 0, lock_key TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_job_lock ON ingestion_jobs(lock_key) WHERE status = 'running' AND lock_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS data_quality_warnings (
  id TEXT PRIMARY KEY, record_type TEXT NOT NULL, record_id TEXT, warning_code TEXT NOT NULL,
  severity TEXT NOT NULL, source TEXT, details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, external_subject TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS cloud_workspaces (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, server_revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cloud_workspaces_owner ON cloud_workspaces(owner_id, deleted_at);
CREATE TABLE IF NOT EXISTS workspace_objects (
  id TEXT NOT NULL, workspace_id TEXT NOT NULL, object_type TEXT NOT NULL,
  object_version INTEGER NOT NULL, local_revision INTEGER, server_revision INTEGER NOT NULL,
  sync_state TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  PRIMARY KEY(workspace_id, id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_objects_sync ON workspace_objects(workspace_id, sync_state, updated_at);
CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, workspace_id TEXT NOT NULL, category TEXT NOT NULL,
  condition_json TEXT NOT NULL, frequency TEXT NOT NULL, cooldown_seconds INTEGER NOT NULL,
  last_known_json TEXT, last_triggered_json TEXT, quiet_hours_json TEXT,
  delivery_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_owner ON alert_rules(owner_id, enabled, deleted_at);
CREATE TABLE IF NOT EXISTS alert_events (
  id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, owner_id TEXT NOT NULL, old_value_json TEXT,
  new_value_json TEXT, condition_json TEXT NOT NULL, source TEXT, freshness_state TEXT,
  triggered_at TEXT NOT NULL, audit_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target_type TEXT,
  target_id TEXT, request_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sqlite_path(database_url: str) -> str:
    if database_url == "sqlite:///:memory:":
        return ":memory:"
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        raise DatabaseError("Only sqlite:/// database URLs are supported by the current deployment scaffold.")
    value = database_url[len(prefix):]
    if not value:
        raise DatabaseError("SQLite database path is empty.")
    return value


class Database:
    def __init__(self, database_url: str = "sqlite:///:memory:"):
        self.database_url = database_url
        path = sqlite_path(database_url)
        if path != ":memory:":
            Path(path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        try:
            self.connection = sqlite3.connect(path, check_same_thread=False)
            self.connection.row_factory = sqlite3.Row
            self.connection.execute("PRAGMA foreign_keys = ON")
            self.connection.execute("PRAGMA journal_mode = WAL")
        except sqlite3.Error as error:
            raise DatabaseError("Database connection failed.") from error
        self._lock = threading.RLock()

    def migrate(self) -> int:
        with self.transaction() as connection:
            connection.executescript(MIGRATION_1)
            connection.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)",
                (SCHEMA_VERSION, utc_now()),
            )
        return self.schema_version()

    def schema_version(self) -> int:
        try:
            row = self.connection.execute("SELECT MAX(version) AS version FROM schema_migrations").fetchone()
        except sqlite3.Error:
            return 0
        return int(row["version"] or 0)

    def health(self) -> dict[str, object]:
        try:
            row = self.connection.execute("SELECT 1 AS ok").fetchone()
            return {"connected": bool(row["ok"]), "schemaVersion": self.schema_version()}
        except sqlite3.Error:
            return {"connected": False, "schemaVersion": 0}

    @contextlib.contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            try:
                self.connection.execute("BEGIN")
                yield self.connection
                self.connection.commit()
            except Exception as error:
                self.connection.rollback()
                if isinstance(error, DatabaseError):
                    raise
                raise DatabaseError("Database transaction failed.") from error

    def upsert_event(self, event: dict[str, Any], provider: str, provider_version: str = "") -> dict[str, Any]:
        event_id = str(event.get("event_id") or "").strip()
        league_id = str(event.get("league_key") or "").strip()
        if not event_id or not league_id:
            raise DatabaseError("Normalized event requires event_id and league_key.")
        now = utc_now()
        payload_json = json.dumps(event, separators=(",", ":"), sort_keys=True)
        existing = self.connection.execute(
            "SELECT revision,starts_at,status,payload_json FROM events WHERE id = ?",
            (event_id,),
        ).fetchone()
        corrected = bool(existing and (
            existing["starts_at"] != event.get("starts_at")
            or existing["status"] != event.get("status")
            or existing["payload_json"] != payload_json
        ))
        revision = int(existing["revision"]) + int(corrected) if existing else 1
        with self.transaction() as connection:
            connection.execute(
                """INSERT INTO events(
                    id, league_id, event_type, status, starts_at, effective_at, source,
                    provider_version, source_updated_at, ingested_at, updated_at, revision, payload_json
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    league_id=excluded.league_id, event_type=excluded.event_type,
                    status=excluded.status, starts_at=excluded.starts_at,
                    effective_at=excluded.effective_at, source=excluded.source,
                    provider_version=excluded.provider_version,
                    source_updated_at=excluded.source_updated_at,
                    ingested_at=excluded.ingested_at, updated_at=excluded.updated_at,
                    revision=excluded.revision, payload_json=excluded.payload_json, deleted_at=NULL""",
                (
                    event_id, league_id, event.get("event_type", "individual"), event.get("status", "unknown"),
                    event.get("starts_at"), event.get("effective_at") or event.get("starts_at"), provider,
                    provider_version, event.get("provider_updated_at"), now, now, revision,
                    payload_json,
                ),
            )
        return {
            "eventId": event_id,
            "revision": revision,
            "corrected": corrected,
        }

    def insert_odds_snapshot(self, snapshot: dict[str, Any]) -> bool:
        values = (
            snapshot["id"], snapshot["market_id"], snapshot["selection_id"], snapshot.get("side"),
            snapshot.get("line"), snapshot.get("american_odds"), int(bool(snapshot.get("is_live"))),
            int(bool(snapshot.get("suspended"))), snapshot["source"], snapshot["provider_updated_at"],
            snapshot.get("ingested_at") or utc_now(), snapshot["payload_hash"],
        )
        with self.transaction() as connection:
            cursor = connection.execute(
                """INSERT OR IGNORE INTO odds_snapshots(
                    id, market_id, selection_id, side, line, american_odds, is_live,
                    suspended, source, provider_updated_at, ingested_at, payload_hash
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                values,
            )
        return cursor.rowcount == 1

    def execute(self, sql: str, parameters: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        try:
            cursor = self.connection.execute(sql, parameters)
            return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as error:
            raise DatabaseError("Database query failed.") from error

    def close(self) -> None:
        self.connection.close()
