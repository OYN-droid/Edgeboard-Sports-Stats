# EdgeBoard provider integration

EdgeBoard remains usable with no credentials. The static application imports the existing mock payload by default. The Phase 9 Python API keeps credentials server-side and emits the same normalized payload consumed by the browser. Its default representative path is a recorded fixture and is not live.

MLB contextual data is documented in [Reliable Live Ticket 8](./reliable-live-ticket-8-mlb-context.md). Injuries, availability, rosters, projected/confirmed lineups, starters, transactions, and weather use the provider-neutral `edgeboard-mlb-context-v1` contract. SportsDataIO access remains server-only, opt-in, and shadow-only; unavailable entitlements preserve deterministic fixture behavior.

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

Open `http://127.0.0.1:9010/?provider=gateway`. The gateway returns its server-side normalized implementation. With `SPORTS_PROVIDER_ID=sportsdataio`, a server-only Discovery Lab key, `SPORTS_PROVIDER_POC_ENABLED=true`, and MLB in `shadow`, the protected validator can fetch and compare MLB schedules/entities while this public gateway continues to return the validated fixture. Credentials alone do not enable a provider call. Opening the same server without `?provider=gateway` continues to use the complete browser mock dataset.

Ticket 10.1 wraps credentialed validators in an explicitly authorized bounded
window with per-attempt request ceilings and durable, redacted evidence. See
[the controlled Shadow-window architecture](reliable-live-ticket-10-1-shadow-window.md).

Run the comparison through `POST /api/admin/mlb/shadow/validate` with an admin token and the exact confirmation `VALIDATE MLB SHADOW`. The response contains endpoint availability, normalized counts, canonical-ID checks, discrepancy totals, and Edge Trust only. `GET /api/admin/mlb/shadow/status` exposes the corresponding safe, protected diagnostics. Neither route returns raw SportsDataIO records, provider record IDs, or credentials.

Ticket 4 adds a separate aggregate-statistics validator at
`POST /api/admin/mlb/standings-leaders/validate` with confirmation
`VALIDATE MLB STANDINGS LEADERS`. It attempts only season standings, player-season
aggregates, and team-season aggregates. Public `/api/standings`,
`/api/leaderboards`, and `/api/team-records/{teamId}` remain fixture-primary.
See [Reliable Live Data Ticket 4](reliable-live-ticket-4-mlb.md) for the normalized
models, qualification rules, snapshot semantics, and remaining certification gates.

Ticket 5 adds a fixture-primary MLB game-market boundary at `/api/markets`,
`/api/odds`, `/api/sportsbooks`, and `/api/best-prices`. Its protected validator
uses `POST /api/admin/mlb/odds/validate` with the exact confirmation
`VALIDATE MLB ODDS`. SportsDataIO candidates remain private and shadow-only;
player props, live odds, parlays, settlement, and historical odds are not enabled.
See [Reliable Live Data Ticket 5](reliable-live-ticket-5-mlb-odds.md).

Run tests:

```bash
python3 -m unittest discover -s tests -v
```

## Ticket 1 provider boundary

`server/provider_contracts.py` is the single server vocabulary for provider domains,
capability declarations, provenance, and compatibility aliases. `server/provider_adapter.py`
defines the provider-neutral base adapter. Neither module selects a vendor or authorizes a
live call. Missing declarations, invalid domains, fixture support, configuration alone, and
shadow state all fail closed for public live claims.

A capability key is `(provider_id, league_id, canonical_domain)`. Its declaration separately
records support, rollout, permission, required configuration, contract confirmation, fixture
availability, freshness/cache/retention policy references, attribution, history, and limitations.
Only an explicit domain declaration can permit a call; certification is never inferred from
an adapter, fixture, endpoint description, or environment variable. The installed registry
contains sample/fixture declarations only, with `liveCallPermission=false`.

Every normalized source can carry `ProvenanceEnvelope`: source identity and safe upstream ID;
source mode; retrieval, upstream, normalization, validation, and expiration times; freshness
and completeness; reconciliation confidence; correction/fallback/agreement state; warnings;
and source/schema versions. Optional facts remain absent rather than being fabricated.

Legacy bundle identifiers remain accepted through explicit aliases:

| Legacy identifier | Canonical domain |
| --- | --- |
| `league_availability` | `availability` |
| `live_status` | `event_status` |
| `entity_search`, `athlete_profiles` | `entities` |
| `team_statistics`, `player_statistics`, `historical_stats` | `historical_statistics` |
| `lineups` | `projected_lineups` |
| `combat_cards` | `fight_cards` |
| `fighter_statistics` | `round_statistics` |
| `motorsport_sessions` | `race_sessions` |
| `lap_data` | `lap_positions` |
| `tennis_matches` | `tennis_events` |
| `props` | `player_props` |
| `spatial_data` | `spatial_events` |

These aliases preserve current API collections and database rollout rows; new adapters must use
canonical names. Canonical entity IDs are unchanged.

## Provider interfaces

`server/interfaces.py` retains narrow compatibility protocols while importing its domain list
from the canonical contract. The adapter boundary exposes:

- `provider_id` and `provider_name`
- `get_capabilities()` and `supports_domain()`
- `validate_configuration()` and `health_status()`
- `normalize_error()` and `attribution_metadata()`
- explicit `fetch()` failure for unsupported domains

Existing narrow protocols cover:

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

Ticket 9 adds a provider-neutral MLB live-state service above the general compatibility protocol. It validates event status, score, inning, outs, optional count/base state, canonical current participants, and inning lines before enriching any frontend payload. SportsDataIO-specific `BoxScoresByDate` fields remain in `server/sportsdataio_mlb.py`. The service never starts polling at application startup: every shadow poll is explicit, allowlisted, budgeted, coalesced, and kill-switch controlled. See [Reliable Live Data Ticket 9](reliable-live-ticket-9-mlb-live-state.md).

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

## Server and public configuration

`.env.example` is the source of truth. `ProviderConfig.from_env()` is the only parser and accepts
canonical `EDGEBOARD_*` application names plus documented legacy aliases. Sample and fixture
modes need no credentials. Live mode validates an identifier, base URL, and API key, but Ticket 1's
template adapter still rejects every outbound domain because none is certified.

`public_config()` is built from an explicit allowlist: version, environment, API path, data mode,
sample/fixture flags, public features, configuration readiness, warnings, and league rollouts.
It never serializes the server configuration. Provider credentials, account IDs, infrastructure
URLs, secret-manager references, and private diagnostics remain server-only.

`server/redaction.py` is the central non-mutating redactor for logs, errors, diagnostics, and
configuration summaries. It handles nested collections, bearer/assignment forms, infrastructure
connection strings, and query-string credentials. Protected diagnostics report boundary mode,
capability counts, fixture availability, validation state, and a health placeholder without raw
values or exceptions.

Do not put real credentials in `.env.example`, browser code, query parameters, or committed files. `.env` is ignored.

## Adding a live provider

1. Select the provider and confirm its permitted use, supported leagues, market depth, latency, historical access, stable IDs, and update semantics.
2. Implement a provider class satisfying the relevant protocols.
3. Implement a vendor-specific adapter that emits the normalized bundle fields.
4. Add fixture-based contract tests for every enabled domain.
5. Run shadow comparisons against the mock and verify event/participant ID reconciliation.
6. Configure credentials only in the server or deployment secret store.
7. Verify source attribution, freshness, outage behavior, and rate limits before changing any UI label from sample mode.

See [Provider adapter author guide](provider-adapter-author-guide.md) before starting Ticket 2.

The MLB Ticket 6 player-prop proof of concept is documented in
[Reliable Live Data Ticket 6](reliable-live-ticket-6-mlb-player-props.md). It remains fixture-primary
and shadow-only; a configured credential does not make the prop domain live.

## Recommended next provider decision

Decide whether EdgeBoard will use one broad provider or two specialized providers:

- a schedule/statistics provider with stable league, event, team, and participant IDs;
- an odds provider with the required sportsbook, prop, combat, soccer, and motorsports coverage.

Stable cross-sport identifiers and licensing should be the first gate. Price alone should not drive the choice: incomplete prop coverage or unstable IDs would create more integration work than a second adapter. Run a short proof of concept for NBA, MLS, UFC, Formula 1, and one international competition before committing.
