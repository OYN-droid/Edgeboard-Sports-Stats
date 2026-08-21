# Reliable live-data architecture audit

Status: SportsDataIO Discovery Lab is connected for the MLB schedule/entity shadow POC. No provider data is public primary, no league is certified live, and sample/fixture mode remains the default.

## Current architecture

```text
Browser (vanilla ES modules)
  -> local provider-shaped fixtures by default
  -> optional /api/provider-data normalized bundle
Python HTTP/API boundary
  -> provider manager (priority, validation, failover, circuit breaker)
  -> vendor-neutral adapters and canonical reconciliation
  -> freshness/cache/ingestion/corrections/rollout certification
  -> SQLite repository (development/single instance)
  -> fixture provider or future server-only vendor adapter
```

The browser owns presentation, deterministic calculations, local research sessions/workspaces, navigation scope, Edge Intelligence orchestration, and the research slip. The Python boundary owns credentials, outbound calls, payload validation, provider reconciliation, caching, ingestion, correction audit, rollout state, and protected diagnostics. This boundary is appropriate and should be retained.

The shared entity taxonomy already represents athletes, teams, fighters, boxers, drivers, golfers, tennis players, coaches, managers, promotions, constructors, manufacturers, national teams, leagues, competitions, venues, and organizations. Events reference those canonical IDs through participant roles. Current sample relationships are static arrays; live membership, employment, transfers, and venue/event assignments need effective-dated provider mappings rather than a second identity system.

## Component inventory

| Area | Current source of truth | Live-data extension point | Audit result |
| --- | --- | --- | --- |
| Sports/leagues/markets | `src/config/sports-registry.js`, `market-catalog.js`, `stat-registry.js` | catalog adapters plus canonical mappings | 66 configured league/competition entries; only four have certification fixtures |
| Events/markets | `sports-repository.js` over `mock-provider.js` or normalized gateway bundle | `server/adapters.py`, `gateway.py` | UI is normalized; browser default is intentionally fixture-shaped |
| Stats/logs | `stats-provider.js` over `mock-stats-provider.js` | historical/stat adapters and stored stat rows | provider-shaped but separate from gateway bundle |
| Profiles/entities | canonical entity files, entity registry/resolver, mock profile files | entity search/profile adapter and reconciliation | canonical IDs are reusable; organization history is incomplete |
| Visuals | visualization registry/service and mock visualization payload | provider capability registry plus spatial/telemetry domains | capability gates exist; real spatial provenance and units need contracts |
| Stories/history/insights | deterministic services over normalized stats and explicit fixtures | stored evidence/correction invalidation | no free-text claim is the factual source; live invalidation must connect all client caches |
| Research sessions/Edge Intelligence | planner, analyst, answer, session, Edge Lab services | normalized evidence API | structure is provider-neutral; live evidence hydration is not centralized yet |
| Edge Trust | browser and server trust evaluators | domain readiness, freshness and conflicts | semantics are sound; provenance metadata needs a stricter envelope |
| Markets/screener/parlays | canonical market catalog and normalized offers | odds adapter, market validation, odds snapshots | settlement identity is strong; alternate-line identity and book rules need expansion |
| Workspace/alerts | IndexedDB local workspace, optional server sync scaffold | authenticated cloud store and fresh alert inputs | provider data is referenced/snapshotted, not used as an identity store |
| Operations | Python API, SQLite, memory cache, ingestion scripts | managed DB/cache/queue/scheduler | sufficient for a proof of concept, not multi-instance production |

## Fixture-shaped assumptions

These are safe in sample mode but must be replaced or dependency-injected before a live domain is enabled:

- `provider-client.js` returns `mockProviderPayload` unless `?provider=gateway` is present and falls back to that payload when the gateway fails.
- `sports-repository.js` defaults directly to `mockProviderPayload`; its normalizers also accept display conveniences such as string lines and fixture `display` objects.
- `stats-provider.js`, `visualization-service.js`, `entity-profile-service.js`, `story-engine.js`, `discovery-service.js`, and `historical-service.js` default to domain-specific mock payloads rather than a single server evidence envelope.
- `app.js` contains fixture-only labels, fixture timestamp test plumbing, and one historical workspace source label. These are disclosures, not live-data bugs.
- Browser coverage failure returns an explicitly labeled fixture/unavailable projection. It never promotes fallback data to live.
- Story, history, discovery, and profile services accept constructor injection, but application composition currently uses their fixture defaults.
- The normalized gateway bundle covers events and betting offers more completely than profiles, stats, historical evidence, story inputs, spatial data, and workspace refresh evidence.

## Provider-specific assumptions

No actual vendor aliases are present in UI logic. The only upstream assumption is the generic `TemplateHttpProvider` convention of `v1/{domain-name}` plus bearer-or-configured-header authentication. That class is a scaffold and must not be used unchanged for a vendor. Provider IDs, endpoint paths, pagination, locale, version, push delivery, and market aliases belong in a vendor adapter.

`adapters.py` accepts several common snake/camel case aliases. This is convenient for fixtures but is not a substitute for vendor schema validation. A selected adapter should consume one exact versioned raw contract, then emit the canonical model.

## Duplicated transformations

- Freshness rules exist in `server/freshness.py`, cache TTLs in `server/cache.py`, league polling in `server/rollout_schedules.py`, and browser stale logic in `sports-repository.js`. Different concerns justify separate policies, but they need one documented domain vocabulary and tests preventing contradictory states.
- League/domain vocabularies are split across `interfaces.py`, `providers.py`, `rollout.py`, `freshness.py`, cache policy, and ingestion job names. Ticket 1 should create a shared server capability registry without changing runtime behavior.
- Entity/profile fixture assembly is split between canonical entity files, athlete mock profiles, generic mock profiles, and service fallback construction.
- Market normalization occurs in the server odds adapter, normalized bundle validator, browser sports repository, and canonical catalog resolver. Vendor mapping, normalized validation, presentation fallback, and canonical lookup are legitimate layers; field coercion must not be repeated at more than one boundary.
- Historical/stat normalization is separate from event/market normalization and must converge on the same source envelope and correction revision.

## Browser credential exposure audit

Browser network calls are limited to same-origin `/api/provider-data` and `/api/coverage`. No browser `Authorization`, provider key, vendor base URL, WebSocket credential, or direct third-party fetch was found. `.env.example` contains names and blank values only. `server/config.py` redacts key/secret/token/DSN fields from diagnostics. Keep all vendor calls server-side; query-string API keys are forbidden because URLs leak through logs and history.

## Canonical-model gaps confirmed

Existing tables already support provider mappings, aliases, entity relationships, event revision, rescheduling, participant roles, market period/scope, odds snapshots, corrections, and tombstones. Necessary additions should be incremental:

1. A shared provider capability/domain registry with exact raw, normalized, cache, trust, and rollout names.
2. Competition-season and membership history for trades, promotions, constructors, coaches, league changes, and date-scoped aliases.
3. Explicit event instance keys for doubleheaders and multi-session/multi-stage weekends.
4. Event phase/segment and ruleset references for regulation, overtime, extra time, penalties, aggregate ties, scheduled fight rounds, racing stages, sets, rounds, and holes.
5. Line/selection identity including alternate flag, book rule version, dead-heat rule, settlement authority, and void/suspension reason.
6. Partial-stat coverage and correction lineage at record/field granularity.
7. One provenance envelope on every persisted normalized record.

Do not change stable canonical IDs or duplicate the client identity registry. Provider mappings must point into it.

## Operational gaps

- SQLite and the process-local cache are correct for local and single-instance validation; production requires managed PostgreSQL, Redis-compatible shared cache/locks, and a durable job runner.
- Only MLB, WNBA, UFC, and MLS have rollout/certification fixtures and schedules. All other registry entries remain fixture-ready/planned, not unsupported.
- No selected vendor adapter, contract fixture, provider account, data-use agreement, availability SLA, or correction SLA exists.
- Push/webhook/stream sequencing, replay cursors, and out-of-order live-event tests are generic rather than vendor-specific.
- UI data hydration is split by domain; a future evidence API should avoid blocking the home board and allow partial domains.
- Media/logo rights are deliberately disabled by default and must remain separate from data-feed access.

## Ticket 1 implementation note

The duplicated server domain list identified above is now consolidated in
`server/provider_contracts.py`. Existing API, freshness, cache, and rollout spellings are retained
through documented compatibility aliases; no database identifiers or browser collections changed.
The shared registry is fail-closed and currently declares fixture capability only. The base adapter,
provenance envelope, centralized redaction, protected diagnostic summary, and public-config allowlist
are implemented without enabling a live provider.

## Decision

The architecture is ready for a server-side proof of concept without a frontend rewrite. Ticket 1
has established the contract boundary without activating live mode. Ticket 2 may implement one
provider POC in internal/shadow state only; it must not change fixture defaults or certify a league.
