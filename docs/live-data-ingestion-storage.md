# Live-data ingestion, cache, and storage plan

These are target policies, not running production jobs. Provider maximum cache and retention terms always win when more restrictive.

## Event-aware refresh schedule

| Domain/lifecycle | Target cadence | Cache fresh / stale-if-error | Notes |
| --- | ---: | ---: | --- |
| Sport/league/competition catalog | 24h | 24h / 7d | invalidate on provider schema/catalog notice |
| Active schedules | 5–30m | 5m / 24h | 30m far from event; 5m within 24h |
| Upcoming fight cards/race weekends | 30–60m | 15m / 24h | increase for weigh-ins/session changes |
| Pregame injuries | 5–15m | 3m / 30m | only sources with confirmation semantics |
| Projected lineups | 5m within 6h | 3m / 15m | always projected |
| Confirmed lineups | 30–60s near lock | 30s / 3m | event-specific burst, stop after start |
| Live status/scores | 5–15s | 8s / 60s | respect sport/provider cadence and visibility |
| Live stats/PBP | 1–10s | 2–5s / 30s | stream/push preferred; sequence/dedupe required |
| Pregame odds/props | 30–90s | 30–45s / 5m | poll only open events/markets |
| Live odds/suspensions | 2–8s or push | 2–5s / 20s | suspension transitions prioritized; quota gated |
| Line movement snapshots | on change; max 15–30s | 15s / 5m | write only licensed distinct snapshots |
| Standings | 10m on game days, 1h otherwise | 10m / 6h | recompute after corrected finals |
| Event finalization | 1, 5, 30m after final | stored / 24h | do not finalize abandoned/postponed events |
| Provider corrections | notices + 6h for recent finals, daily history | 1h / 24h | append correction lineage and invalidate derived data |
| Historical backfill | bounded batches off-peak | stored | checkpoint, idempotent, league/season budgets |
| Off-season | daily/weekly catalog/schedule only | 24h / 7d | live/stat/odds jobs disabled without events |

Use conditional requests/ETags where provided. Honor `Retry-After`; exponential backoff with jitter for 429/5xx/timeouts; no retry for authentication, entitlement, or schema errors. A circuit breaker is provider+domain scoped so one failing product does not suppress unrelated domains. Visibility-aware browser polling never controls durable ingestion.

SWR serves a fresh normalized cache entry and schedules one deduplicated refresh. Stale-if-error is used only inside the domain stale window and is labeled with original provider time, cache age, fallback state and outage. Expired/current-sensitive records become unavailable; they do not fall back silently to fixtures.

## Storage classification

| Data | On demand | Temporary cache | Normalize/store | Historical snapshots | Never retain / terms gate |
| --- | --- | --- | --- | --- | --- |
| catalogs/profiles | yes | yes | canonical IDs/mappings/membership history | effective-dated changes | raw portraits/logos without rights |
| events/participants/results | yes | yes | yes, revisions and finality | final events and corrections | raw payload if prohibited |
| stats/logs/standings | current query | yes | final normalized rows | licensed seasons + revision lineage | unlicensed advanced metrics |
| injuries/lineups | current event | short | current + effective history if permitted | status changes only as required | sensitive/non-public medical detail |
| live PBP/spatial/telemetry | live pages | very short | only if licensed and needed | contract-specific | raw high-volume streams by default |
| odds/props | current pages | very short | current normalized offer | distinct snapshots if licensed | indefinite archive without explicit right |
| line history | derived query | yes | permitted normalized changes | licensed open/current/close snapshots | invented opening/closing designations |
| media/logos | on demand/CDN | licensed TTL | metadata and rights reference | no asset archive by default | asset bytes after license expiry |
| corrections/provenance | no | yes | permanent audit metadata | old/new values and source revision | credentials/private payload fragments |
| raw provider payload | no UI access | validation-memory only | default no | short encrypted quarantine only if contract and incident policy allow | permanent raw retention by default |

## Production infrastructure

- PostgreSQL: normalized durable data, provider mappings, revisions, jobs, rollout/certification and audit.
- Redis-compatible service: shared cache, request coalescing, rate budgets, idempotency locks and short live-state buffers; no private workspace in public keys.
- Queue/scheduler: domain/league/event jobs, retry metadata, dead-letter/quarantine and graceful shutdown.
- Object storage only for permitted contract fixtures or large licensed archives, encrypted with lifecycle deletion.
- Observability: provider/domain latency, acceptance/rejection, freshness lag, conflicts, corrections, rate usage, cache state, job duplication and cost units; never log credentials, raw private notes or full payloads.

The current SQLite, memory cache and scripts remain the local/sample implementation and should not be removed.
