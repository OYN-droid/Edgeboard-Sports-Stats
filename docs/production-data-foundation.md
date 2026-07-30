# Phase 9 production data foundation

EdgeBoard remains a vanilla ES-module frontend. A dependency-free Python service
serves static assets and a normalized `/api` boundary. This avoids a frontend
rewrite while moving credentials, provider traffic, validation, caching,
ingestion, persistence, optional sessions, cloud-sync foundations, and
operational diagnostics server-side.

No live provider is configured in the repository. The representative NBA
schedule and moneyline path uses `server/fixtures/representative_provider.json`
and is always labeled recorded fixture/sample data.

## Architecture and responsibility boundary

```text
Browser UI and deterministic client engines
  -> /api normalized contracts
  -> input/security/rate-limit layer
  -> provider manager and domain adapters
  -> runtime validation and entity reconciliation
  -> provider-aware cache / stale fallback
  -> normalized SQLite persistence
  -> fixture, primary provider, or explicit secondary provider
```

Client-side:

- presentation and accessibility;
- local anonymous Phase 8 workspaces;
- the existing deterministic calculations, charts, and insight phrasing;
- sample providers and offline saved snapshots;
- navigation, filtering, research slip, and themes.

Server-side:

- provider and future AI credentials;
- provider calls, retries, rate limits, circuit breakers, failover, validation,
  attribution, and terms controls;
- normalized persistence, ingestion, health, audit, optional sessions, cloud
  workspace sync, and server-capable alerts.

Provider-specific aliases stay in adapters. The UI consumes canonical IDs and
normalized response fields only. Raw payload storage is disabled by default.
Provider collection structure and timestamps are validated before adapter input
can enter cache; partially malformed collections retain valid siblings but
bypass caching and surface safe rejection diagnostics.

## Runtime modules

- `server/config.py`: environment validation, public flags, redaction, terms.
- `server/api.py`: normalized routes, input bounds, rate policies, safe errors.
- `server/app.py`: HTTP boundary, restrictive CORS and security headers.
- `server/domain_validation.py`: event/stat/market/status quarantine.
- `server/reconciliation.py`: provider mappings, aliases, ambiguity, history.
- `server/database.py`: SQLite migration and normalized tables.
- `server/cache.py`: versioned provider keys, TTL policy, stale reads.
- `server/resilience.py`: concurrency, request deduplication, circuit breaker.
- `server/provider_manager.py`: priority/failover and conflict reporting.
- `server/ingestion.py`: idempotent jobs, locks, partial results, audit counts.
- `server/live_updates.py`: bounded visibility-aware polling foundation.
- `server/auth.py`: optional opaque sessions and CSRF checks.
- `server/workspace_sync.py`: user-scoped object sync and tombstones.
- `server/server_alerts.py`: freshness-aware, in-app-only evaluation.
- `server/observability.py`: structured redacted logs and process metrics.

## Normalized data and validation

Events require canonical event/league IDs, supported status, valid timestamps,
unique participants, and valid coordinates. Stats require canonical entity,
league, and stat IDs, a supported unit, finite numeric values, and a source.
Markets require canonical/provider market IDs, event and league identity,
sportsbook/source attribution, supported side, period, settlement scope, status,
and valid odds. Invalid siblings are quarantined while valid records continue.

American and decimal odds may be normalized. Missing sides are never generated.
Suspended and non-open markets remain unavailable. Regulation-only and
overtime-inclusive scopes remain separate.

Every provider response should carry source, fetch/provider/normalization
timestamps, expiry, freshness, completeness, and warnings. Data-quality scoring
is operational quality and is explicitly not betting confidence.

## Entity reconciliation

Resolution order:

1. Explicit manual override.
2. Exact `(provider, provider ID)` mapping.
3. Accent-insensitive canonical alias within sport/league scope.
4. Historical team/league relationship when a date scope exists.
5. Ambiguous, conflicting, or unresolved result.

Ambiguous entities are never merged automatically. Provider IDs and historical
relationships are retained. Saved workspace records continue to reference the
canonical ID rather than a provider ID.

## Database

The current adapter is SQLite through Python's standard library and uses
parameterized statements and transactions. `DATABASE_URL=sqlite:///:memory:` is
the safe sample/test default. A durable deployment can use a file URL; a
multi-instance rollout should replace this adapter with managed PostgreSQL
behind the same repository boundary.

Tables:

- `schema_migrations`
- `sports`, `leagues`, `competitions`, `venues`
- `entities`, `provider_mappings`, `entity_aliases`,
  `entity_relationships`
- `events`, `event_participants`, `standings`
- `stat_rows`, `game_logs`
- `injuries`, `lineups`
- `markets`, `odds_snapshots`, `line_history`
- `provider_health`, `ingestion_jobs`, `data_quality_warnings`
- `users`, `sessions`
- `cloud_workspaces`, `workspace_objects`
- `alert_rules`, `alert_events`, `audit_log`

Events, entities, stats, logs, markets, workspaces, injuries, and lineups support
soft deletion where applicable. Event corrections increment revisions.
Duplicate odds snapshots are rejected by a unique constraint.

## Cache and freshness

Keys include schema version, provider, domain, and scope. TTL policy considers
domain, event status, and provider maximum retention. The process-local cache
supports fresh reads, stale-if-error, explicit prefix/tag invalidation, private
entries, and diagnostics. Private workspace data must never use public cache
entries. Redis or a platform cache is still required for multiple API instances.

States: `live`, `fresh`, `delayed`, `stale`, `expired`, `partial`,
`unavailable`, `error`, and `sample`.

## Provider control and failover

Requests use bounded timeouts, exponential backoff with jitter, `Retry-After`,
global concurrency control, request deduplication, and a circuit breaker.
Authentication/schema errors are not retried. Primary and secondary providers
are endpoint-level choices. Conflicting values are reported and primary values
remain intact; values are not silently mixed. Fixture fallback requires an
explicit caller decision and retains a sample warning.

Provider terms fields cover attribution, raw/normalized retention, odds-history
storage, redistribution, logos, media, and maximum caching. Defaults are
restrictive. Live provider-shaped payloads are not placed in the memory cache
unless `PROVIDER_RAW_RETENTION_ALLOWED` is explicitly enabled; fixture caching
remains available for deterministic sample operation.

## Ingestion and scheduled deployment

Run one job manually:

```bash
python3 scripts/run_job.py refresh_active_schedules --league nba
```

Every job records identity, scope, times, status, counts, rejection/warning
details, retry count, and scheduling placeholder. Lock keys prevent overlapping
identical jobs. Reruns upsert canonical events. Scheduled jobs are declarations
only; no recurring production worker is claimed. A platform scheduler should
invoke `scripts/run_job.py` with environment-specific schedules.

## Authentication, sync, and alerts

Anonymous local mode remains the default. Optional opaque sessions use a
server-side hash and CSRF token. No password store or social login is included.
Cloud workspace APIs stay disabled unless their feature flag, database, and
auth secret are configured. Sync is private, user-scoped, object-versioned, and
uses server revisions, conflicts, and deletion tombstones. Local-to-cloud
migration must remain explicit.

Server alert delivery exposes only configured capabilities. The scaffold enables
in-app records only, ignores stale values except stale-data rules, applies
cooldowns and duplicate suppression, and records old/new values. It does not
claim background monitoring, email, or push. Evaluation loads the stored rule
under the authenticated owner rather than trusting client-supplied rule fields.

## Security and operations

- Production CORS is an explicit allowlist; no wildcard is used.
- JSON request bodies are bounded.
- API categories have separate fixed-window anonymous limits.
- Static access to server, tests, scripts, and hidden paths is blocked.
- CSP, frame, content-type, referrer, and permissions headers are set.
- Database statements are parameterized.
- Errors expose code, safe message, retryability, request ID, partial status,
  and fallback state—not stack traces or provider secrets.
- Logs omit tokens, credentials, notes, and imported payloads.
- Admin diagnostics require `ADMIN_TOKEN` and are read-only.

Health:

- `/api/status`: liveness
- `/api/status/ready`: database/cache readiness
- `/api/provider-status`: safe provider summary
- `/api/admin/diagnostics`: protected configuration, provider, cache, jobs,
  metrics, and sample-mode state

Sample, live, hybrid, degraded, and offline remain distinct public operating
modes. A recorded fixture used during degraded operation keeps its sample
source flag and original provider timestamp; EdgeBoard retrieval time is stored
separately.

## Local development and deployment

```bash
cp .env.example .env
python3 -m server.app --check-config
python3 scripts/migrate.py
python3 -m unittest discover -s tests -v
python3 scripts/smoke.py
python3 -m server.app --port 9010
```

Staging/production:

1. Store environment secrets in the hosting secret manager.
2. Use durable `DATABASE_URL`; run `scripts/migrate.py` once.
3. Run tests and sample smoke checks without provider credentials.
4. Configure a provider in staging and shadow the fixture path.
5. Verify attribution, terms, reconciliation, freshness, failure, and cache
   behavior before enabling public feature flags.
6. Start `python3 -m server.app` behind TLS and a production reverse proxy.
7. Configure platform health checks and scheduled jobs.
8. Keep at least one prior application artifact and database backup.

Graceful SIGTERM/SIGINT shutdown is implemented. TLS termination, multi-process
serving, shared rate limits, PostgreSQL, Redis, and a real background queue remain
deployment responsibilities.

## Rollback

1. Disable live and server-side feature flags.
2. Restore `DATA_MODE=sample` and `SAMPLE_MODE=true`.
3. Stop scheduled ingestion.
4. Deploy the previous application artifact.
5. Do not delete the Phase 9 tables; preserve revisions and audit metadata.
6. Restore the database backup only if a migration itself corrupted data.
7. The browser continues to use its mock providers and local IndexedDB
   workspaces throughout a backend rollback.

## Mock-to-live migration matrix

| Domain | Current | Target adapter | Flag | Fallback | Gap |
| --- | --- | --- | --- | --- | --- |
| League catalog | Fixture/browser mock | Broad sports provider | `live_data_enabled` | Explicit sample | Provider selection |
| Schedules/status | Recorded NBA fixture | Schedule adapter | `live_data_enabled` | Stale cache, then labeled fixture | Staging verification |
| Entities/rosters | Canonical browser fixtures | Metadata adapter + reconciliation | `live_data_enabled` | Existing canonical registry | Persistent mapping population |
| Historical stats | Browser mock rows | Historical adapter | `historical_stats_enabled` | Existing sample rows | Coverage/licensing |
| Injuries | Empty fixture | Injury adapter | `injuries_enabled` | Honest unavailable | Confirmation semantics |
| Lineups | Empty fixture | Lineup adapter | `lineups_enabled` | Honest unavailable | Official/projected mapping |
| Standings | Empty fixture | Standings adapter | `live_data_enabled` | Honest unavailable | Competition stages |
| Odds/props | Recorded moneyline fixture | Specialized odds adapter | `live_odds_enabled` | Never silently use sample as current | Sportsbook coverage/terms |
| Line movement | Empty fixture | Odds archive adapter | `live_odds_enabled` | Honest unavailable | History permission |
| Spatial/telemetry | Browser sample visuals | Sport-specific adapters | `visual_telemetry_enabled` | Existing explicit fallbacks | Licensing and volume |

## Integration status

- Live: none.
- Fixture-backed: NBA schedule/event status scaffold and one recorded moneyline.
- Sample-only: existing browser sports, stats, props, profiles, insights,
  visualizations, and personal workspace demonstrations.
- Incomplete by design: provider selection, durable production database,
  shared cache, background scheduler, upstream identity population,
  authenticated account issuance, external alert channels, and cloud hosting.
