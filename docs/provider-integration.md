# EdgeBoard provider integration

EdgeBoard remains usable with no credentials. The static application imports the existing mock payload by default. The Phase 9 Python API keeps credentials server-side and emits the same normalized payload consumed by the browser. Its default representative path is a recorded fixture and is not live.

## Data flow

```text
Vendor API
  -> server-only provider implementation
  -> domain adapters
  -> normalized bundle validation
  -> cache / stale fallback
  -> GET /api/provider-data
  -> createSportsRepository(payload)
  -> existing navigation, research, cards, event views, and bet slip
```

UI components never import or inspect vendor response fields. A provider change is contained to a server provider implementation and its adapter.

## Market identity and availability

Provider adapters map vendor market names into `canonical_market_id`; UI code reads the matching definition from `src/config/market-catalog.js`. Adapters also preserve `provider_market_id`, period or segment, settlement scope, source, open/update timestamps, live/alternate/SGP flags, selection side and line, and participant/team/competitor IDs.

The catalog describes theoretical EdgeBoard support only. An event or league market is promoted in the browser when a normalized provider offer confirms it as open; suspended instances remain explicitly disabled. Unknown aliases do not become a nearby market automatically. Add an alias to a catalog definition or a vendor-specific adapter mapping after its settlement rules have been verified.

## Local development

Static sample mode:

```bash
python3 -m http.server 9001 --bind 127.0.0.1
```

Open `http://127.0.0.1:9001/`. This uses the complete browser mock dataset and makes no provider request.

Gateway sample mode:

```bash
python3 -m server.app --port 9010
```

Open `http://127.0.0.1:9010/?provider=gateway`. The gateway returns its server-side mock implementation. Opening the same server without `?provider=gateway` continues to use the complete browser mock dataset.

Run tests:

```bash
python3 -m unittest discover -s tests -v
```

## Provider interfaces

`server/interfaces.py` defines independent contracts for:

- league availability
- schedules and events
- live event status
- odds
- player props
- team and player statistics
- injuries and lineups
- weather
- line movement
- combat cards and participants
- motorsports sessions and competitors

`server/providers.py` contains the recorded fixture provider and a server-only HTTP template. `server/adapters.py` maps upstream staging fields to the existing normalized EdgeBoard contract. Exact vendor field names belong in a vendor-specific adapter, not in the UI or repository. Extended provider, database, ingestion, security, and deployment details are documented in [Production data foundation](production-data-foundation.md).

## Normalized output

The gateway always returns these collections, even when a source is unavailable:

- `league_statuses`
- `events`
- `offers`
- `team_statistics`
- `player_statistics`
- `injuries`
- `lineups`
- `weather`
- `line_movements`
- `combat_cards`
- `motorsport_sessions`

`provider_status` carries source attribution, per-domain state, validation warnings, mapped provider errors, partial status, offline-fallback state, and the last successful update.

## Resilience and validation

- Requests use a configurable timeout.
- Retryable timeouts, HTTP 429 responses, and provider 5xx responses use bounded exponential backoff with jitter.
- `Retry-After` is honored when supplied.
- Authentication and malformed-response failures are mapped separately.
- The in-process cache exposes fresh and stale reads. Replace `MemoryCache` behind the same interface with Redis or a platform cache when deploying multiple instances.
- A domain outage uses stale cached data when available and marks the bundle `offline-fallback`.
- Missing domains remain empty and mark the bundle `partial`.
- Invalid odds become unavailable instead of being displayed as real prices.
- Duplicate events are merged.
- changed start times retain `previous_starts_at` and set `schedule_changed`.
- postponed and cancelled events suspend associated markets.

## Freshness rules

Rules live in `server/freshness.py`:

| Domain | Fresh for |
| --- | ---: |
| Schedules | 5 minutes |
| Pregame odds | 60 seconds |
| Live odds | 8 seconds |
| Injuries | 5 minutes |
| Lineups | 90 seconds |
| Player statistics | 1 hour |
| Completed events | 24 hours |

Values between one and three times the limit are `delayed`; older values are `stale`.

## Environment variables

`.env.example` is the source of truth for Phase 9 environment names. It groups
application, sports and odds providers, secondary providers, cache/database,
optional authentication, observability, public feature flags, provider terms,
and server settings. Legacy `EDGEBOARD_PROVIDER_*` names remain readable for
local compatibility, but new deployments should use `SPORTS_PROVIDER_*`,
`PROVIDER_*`, `CACHE_*`, and the named feature flags.

Do not put real credentials in `.env.example`, browser code, query parameters, or committed files. `.env` is ignored.

## Adding a live provider

1. Select the provider and confirm its permitted use, supported leagues, market depth, latency, historical access, stable IDs, and update semantics.
2. Implement a provider class satisfying the relevant protocols.
3. Implement a vendor-specific adapter that emits the normalized bundle fields.
4. Add fixture-based contract tests for every enabled domain.
5. Run shadow comparisons against the mock and verify event/participant ID reconciliation.
6. Configure credentials only in the server or deployment secret store.
7. Verify source attribution, freshness, outage behavior, and rate limits before changing any UI label from sample mode.

## Recommended next provider decision

Decide whether EdgeBoard will use one broad provider or two specialized providers:

- a schedule/statistics provider with stable league, event, team, and participant IDs;
- an odds provider with the required sportsbook, prop, combat, soccer, and motorsports coverage.

Stable cross-sport identifiers and licensing should be the first gate. Price alone should not drive the choice: incomplete prop coverage or unstable IDs would create more integration work than a second adapter. Run a short proof of concept for NBA, MLS, UFC, Formula 1, and one international competition before committing.
