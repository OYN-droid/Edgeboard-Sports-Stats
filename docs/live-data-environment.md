# Live-data environment inventory

`.env.example` remains the source of truth and contains no secret values. Ticket 1 added canonical
application aliases, optional provider identifiers/account settings, odds regions/books,
infrastructure placeholders, and protected diagnostic switches. None are required in sample or
fixture mode. Live mode requires a complete server-side provider identifier, base URL, and API key,
but the Ticket 1 template rejects outbound calls until a provider-specific adapter and explicit
capabilities exist.

Only `ProviderConfig.from_env()` reads environment values. `public_config()` uses an explicit
allowlist and excludes provider keys, account IDs, internal URLs, queues, secret-manager references,
and private diagnostics. Legacy names remain accepted where documented in the integration guide.

| Group | Existing names | Public? | Decision/use |
| --- | --- | --- | --- |
| Canonical runtime | `EDGEBOARD_ENV`, `EDGEBOARD_DATA_MODE`, `EDGEBOARD_DEFAULT_PROVIDER`, `EDGEBOARD_DEFAULT_ODDS_PROVIDER`, `EDGEBOARD_LOG_LEVEL`, `EDGEBOARD_VERSION` | safe allowlisted subset only | canonical names; defaults do not select or certify a vendor |
| Runtime | `APP_ENV`, `APP_BASE_URL`, `API_BASE_URL`, `LOG_LEVEL`, `DATA_MODE`, `SAMPLE_MODE` | safe subset via `/api/config/public` | keep sample defaults |
| Primary sports | `SPORTS_PROVIDER_ID`, `SPORTS_PROVIDER_NAME`, `SPORTS_PROVIDER_BASE_URL`, `SPORTS_PROVIDER_API_KEY`, `SPORTS_PROVIDER_API_KEY_HEADER`, `SPORTS_PROVIDER_ACCOUNT_ID` | never URL/key/account; display identity is not currently public | SportsDataIO Discovery Lab selected for MLB schedule/entity shadow POC only; commercial provider unresolved |
| Secondary sports | `SECONDARY_SPORTS_PROVIDER_ID`, `SECONDARY_SPORTS_PROVIDER_NAME`, `SECONDARY_SPORTS_PROVIDER_BASE_URL`, `SECONDARY_SPORTS_PROVIDER_API_KEY` | no | shadow/failover only, not required initially |
| Odds providers | `ODDS_PROVIDER_ID`, `ODDS_PROVIDER_NAME`, `ODDS_PROVIDER_BASE_URL`, `ODDS_PROVIDER_API_KEY`, `ODDS_PROVIDER_REGIONS`, `ODDS_PROVIDER_BOOKS`, `SECONDARY_ODDS_PROVIDER_*` | no current provider identity exposure | POC provider unresolved |
| Resilience | `PROVIDER_REQUEST_TIMEOUT_SECONDS`, `PROVIDER_MAX_RETRIES`, `PROVIDER_RETRY_BASE_SECONDS`, `PROVIDER_CONCURRENCY`, circuit settings | no need | add per-domain overrides only with evidence |
| Persistence/cache | `DATABASE_URL`, `CACHE_URL`, `WORKER_QUEUE_URL`, `SECRET_MANAGER_REFERENCE`, TTL/stale settings | no | managed production services unresolved |
| Auth/ops | `AUTH_SECRET`, issuer/audience, `ERROR_REPORTING_DSN`, `ADMIN_TOKEN`, metrics/CORS/body limits | only safe flags/issuer if needed | workload identity and hosting unresolved |
| Feature flags | live/stats/injury/lineup/workspace/alerts/AI/telemetry/sample/rollout/coverage flags | yes | all live flags stay false |
| Rollout | `MLB_ROLLOUT_STATE`, `WNBA_ROLLOUT_STATE`, `UFC_ROLLOUT_STATE`, `MLS_ROLLOUT_STATE` | yes | all remain `fixture_only`; future states should be data-driven |
| Provider terms | attribution, raw/normalized retention, odds history, redistribution, logo/media and max-cache variables | safe boolean policy may be public only when useful | restrictive defaults remain |
| Usage | request/retry/expensive warning thresholds | protected diagnostics | add hard budgets after contract |
| Diagnostics | `PROVIDER_DIAGNOSTICS_ENABLED`, `PROVIDER_HEALTH_ENABLED`, `DATA_QUALITY_LOGGING_ENABLED` | no | protected/test foundation only |

Potential post-selection names: `SPORTS_PROVIDER_PRODUCT`, `SPORTS_PROVIDER_SCHEMA_VERSION`, `ODDS_PROVIDER_PRODUCT`, `ODDS_PROVIDER_SCHEMA_VERSION`, `PROVIDER_ENABLED_DOMAINS`, per-provider monthly hard budget, and secret rotation version. Do not add them until Ticket 2 has an exact selected product and validation semantics; unused environment names create false configuration confidence.

Legacy `EDGEBOARD_PROVIDER_*` aliases should be deprecated after deployment migration, not removed abruptly. Never prefix secrets with browser build conventions such as `VITE_`, `NEXT_PUBLIC_`, or similar.
