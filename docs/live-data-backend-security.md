# Live-data backend and security requirements

## Server-only calls

All provider catalog, schedule, score, stats, injury, lineup, market, archive, media, weather, spatial, telemetry and correction calls must be server-side. This includes providers that document query-string keys. The browser calls only EdgeBoard's same-origin normalized API and receives no vendor credential or raw payload.

## API boundary

- Public: normalized, cacheable-by-policy endpoints scoped by league/domain/event; safe public config; coverage/freshness; liveness/readiness.
- Authenticated: workspace sync and user alerts only; user ownership and CSRF enforced.
- Protected admin: provider health, quota, ingestion, rejected-record samples, certification and rollout controls; no key value or raw sensitive payload.
- Internal worker: provider fetch/ingestion/correction routes authenticated by workload identity, not a public admin token.

Every input is size/type/scope bounded. Every provider payload is version-validated before normalization; malformed siblings are quarantined while valid siblings continue. Normalized output is validated again before cache/persistence. Errors expose a request ID and safe code, never a raw stack, credential, URL query key or payload.

## Secret and public configuration

Store provider keys, signing secrets, database/cache credentials and observability DSNs in local ignored `.env` or the deployment secret manager. Rotate per environment/provider, grant only entitled products, and support overlapping rotation. Public configuration may expose only data mode, enabled feature/domain/league flags, public provider display attribution when required, freshness/coverage and rollout state.

Current browser audit found only same-origin `/api/provider-data` and `/api/coverage` fetches and no provider keys/base URLs. Keep CSP `connect-src` constrained to same origin unless a non-secret public stream is explicitly designed and reviewed.

## Controls

- Provider/domain-scoped timeout, concurrency, token/credit budget, retry policy and circuit breaker.
- Restricted CORS, TLS/reverse proxy, request/body/rate limits, parameterized SQL and output encoding.
- Structured logs with secret/query-string/payload/private-note redaction; rejected records log schema path and hashed/provider record reference, not full bodies.
- Metrics for acceptance, latency, freshness, conflicts, corrections, retry/rate usage and cache mode.
- Separate liveness from database/cache/worker readiness; provider diagnostics protected.
- Feature and rollout flags never bypass authorization or certification.
- Raw fixtures recorded only when the contract allows it, scrubbed, inventoried, encrypted and expiration-controlled.

Before production, replace the single-process HTTP server, SQLite and memory locks/cache with production hosting, PostgreSQL, shared cache/locks and durable workers. The existing implementations remain the deterministic local test boundary.
