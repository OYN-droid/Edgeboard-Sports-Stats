# Reliable Live Data Track — Ticket 2

## Scope and certification status

Ticket 2 adds the first schedule/entity implementation behind the provider boundary. It covers MLB league identity, teams, venues, athletes, managers, schedules, game status, start times, and canonical game identity. It intentionally does not ingest odds, props, line movement, historical statistics, play-by-play, or live polling.

The checked-in source is a deterministic contract fixture, not a recorded vendor response and not live data. SportsDataIO Discovery Lab credentials are supplied only through the server environment; no vendor payload is recorded because fixture-recording and redistribution rights have not been established. MLB remains fixture-primary in `fixture_only`, `internal_testing`, and `shadow`, and the application does not claim `Certified Live`. Production still requires the existing audited rollout transition and certification checklist.

The optional SportsDataIO Discovery Lab adapter is now available for this proof of concept. Discovery Lab values can be scrambled, so the adapter runs only as a shadow candidate and cannot promote the MLB rollout, replace the primary fixture, or claim certified coverage.

## SportsDataIO free-trial configuration

`server/sportsdataio_mlb.py` calls only the MLB scores-product endpoints needed here: `AllTeams`, `Stadiums`, `Players`, and `GamesByDate` for yesterday, today, and tomorrow. It authenticates with the server-only `Ocp-Apim-Subscription-Key` header, validates responses, and emits the same provider-neutral MLB contract used by the fixture.

```dotenv
SPORTS_PROVIDER_ID=sportsdataio
SPORTS_PROVIDER_API_KEY=your_server_only_key
SPORTS_PROVIDER_BASE_URL=
SPORTS_PROVIDER_POC_ENABLED=true
MLB_ROLLOUT_STATE=shadow
```

A blank base URL selects SportsDataIO's official MLB scores URL. Both the explicit POC flag and the MLB `shadow` rollout are required; credentials alone never instantiate or call this adapter. The protected `POST /api/admin/mlb/shadow/validate` operation fetches, normalizes, compares, and records discrepancies. Optional `startDate`/`endDate` values are ISO dates, limited to seven days, and `refresh: true` bypasses the candidate cache. Its response is metadata-only. `GET /api/provider-data` continues to expose the validated fixture in shadow mode. If any required Discovery Lab endpoint is unavailable, validation reports a safe reason code and the application continues with fixture data.

SportsDataIO documents MLB timestamps as US Eastern time. The adapter attaches `America/New_York` before UTC conversion. Provider IDs stay internal; public game IDs are stable opaque canonical IDs. This integration does not add odds, props, line movement, historical stats, play-by-play, or polling.

## Data flow

```text
SportsDataIO server adapter (shadow candidate) + contract fixture (primary)
  -> separate MLB Ticket 2 normalized contracts
  -> discrepancy comparison and durable shadow log
  -> strict sibling-level validation
  -> private provider-ID-to-canonical-ID map
  -> normalized schedules and canonical entities
  -> provenance + Edge Trust
  -> process cache (provider/domain/league/version key)
  -> normalized API / provider bundle
  -> existing sports repository and entity registry
  -> existing homepage, discovery, search, profiles, research, workspace
```

The protected shadow report includes endpoint authentication state, accepted/rejected counts, canonical-ID uniqueness and reference checks, discrepancy categories, and Edge Trust. It excludes normalized entity/game rows to prevent unverified provider data from becoming an alternate public feed.

Frontend components never receive provider record IDs or raw payloads. Public identity is always canonical: for example `NYY`, `mlb-aaron-judge`, `venue-yankee-stadium`, and `mlb-2026-08-05-bos-nyy-2`.

## Provider contract

The provider-neutral contract is versioned as `edgeboard-mlb-schedule-entities-v1`. A future provider adapter must produce:

- one MLB league record;
- entities with provider ID, canonical ID, type, display name, aliases, and optional team/venue metadata;
- games with provider ID, stable canonical ID, venue-local schedule date, timezone-aware start time, status, team references, venue reference, and optional doubleheader number.

Provider IDs are used only while validating and resolving references. Public serialization removes them, including from per-record provenance. Provider aliases are adapter-local; for example, SportsDataIO's `CHW` key resolves to EdgeBoard's existing `CWS` canonical identity. Ambiguous city aliases remain unresolved instead of merging silently.

## Status and time rules

Accepted states normalize to `scheduled`, `live`, `final`, `postponed`, `cancelled`, `suspended`, and `delayed`. Rain delays are represented as `delayed` with a status detail. Each start time must contain an offset and its converted date in the declared IANA timezone must equal the provider schedule date. Doubleheader games must have separate canonical IDs and a game number of one or two.

## Validation and partial records

The league envelope and contract version fail closed. Malformed sibling entities or games are rejected individually so valid siblings remain usable. Validation covers duplicate provider/canonical IDs, missing or unknown teams, invalid dates or timezones, invalid statuses, duplicate games, invalid doubleheader numbers, and invalid venue references. A missing venue is retained as an explicit partial record with an Edge Trust warning; it is never invented.

## Cache and refresh

Schedules and entities share one normalized read model cached under provider, domain, league, and contract version. A process lock coalesces concurrent misses. The normalized team/venue/player contract is kept in a private one-hour cache, so changing the requested schedule date does not repeat static catalog calls; raw provider payloads are not retained. Shadow candidate keys include provider, domain, date scope, and schema version and are private. Scheduled data uses a five-minute TTL, delayed/postponed/suspended data one minute, and completed-only data one hour. A separate lock coalesces shadow misses. Stale-if-error is allowed only for diagnostic shadow data and is explicitly labeled. Cache tags support league/domain/provider invalidation. Manual refresh is available only through the admin endpoint and requires `REFRESH MLB SCHEDULES`; it cannot activate a rollout state.

## API integration

- `GET /api/events?leagueId=mlb&date=YYYY-MM-DD&status=scheduled`
- `GET /api/entities?leagueId=mlb&q=Yankees`
- `GET /api/entities/{canonicalEntityId}`
- `GET /api/games/{canonicalGameId}`
- `GET /api/provider-data` includes normalized MLB schedules/entities while retaining the original source metadata for other sample domains
- `POST /api/admin/mlb/refresh` is protected and confirmation-gated
- `POST /api/admin/mlb/shadow/compare` is protected and accepts only a provider-neutral candidate contract
- `POST /api/admin/mlb/shadow/validate` is protected and runs the configured SportsDataIO Discovery Lab comparison without returning candidate rows
- `GET /api/admin/mlb/shadow/status` is protected and returns only safe configuration, entitlement, cache, count, rollout, and error metadata

## Shadow and limited-live behavior

Shadow comparison requires the league’s audited `shadow` rollout state. Candidate data is normalized and validated, compared with the fixture, and logged as discrepancies; it is never exposed as primary data. Limited live requires an injected server-side provider loader. If no reviewed loader exists, the service fails closed rather than relabeling fixture data. Unsupported domains remain explicitly fixture/sample-backed through their own existing source metadata.

## Integration checklist for a real provider

1. Confirm contract, licensing, attribution, retention, and redistribution terms.
2. Implement a server-only adapter that maps vendor responses to the Ticket 2 contract.
3. Keep credentials in server configuration; never add them to public config or fixtures.
4. Add deterministic recorded contract fixtures only if provider terms permit recording.
5. Run shadow comparison across schedule corrections, postponements, doubleheaders, rain delays, and timezone boundaries.
6. Record domain certification evidence for entities, schedules, event status, freshness, reliability, and UI behavior.
7. Move to limited live explicitly; do not promote automatically.
8. Activate production only through the existing certification gate and league-specific confirmation phrase.

## Test coverage

`tests/test_mlb_schedule_entities_ticket2.py` covers the shared normalized contract and fixture-backed application path. `tests/test_sportsdataio_mlb.py` covers explicit opt-in, adapter capabilities, unsupported domains, normalization/quarantine rules, provider-only aliases, duplicate-name players, membership states, reschedules, unknown statuses, shadow categories, protected diagnostics, and scoped cache behavior. `tests/test_sportsdataio_mlb_live.py` is skipped unless `EDGEBOARD_RUN_LIVE_POC=true`; ordinary CI and browser startup therefore make no credentialed call.

## Current Discovery Lab validation

The read-only validation on 2026-08-04 authenticated `AllTeams`, `Stadiums`, `Players`, and `GamesByDate` for yesterday, today, and tomorrow. No implemented endpoint was rejected by the plan. It normalized one league, 30 clubs, 97 venues, 7,885 players, and 38 games; two `AllTeams` aggregate rows (`AL` and `NL`) were quarantined because they are not clubs. Zero duplicate provider records or invalid public team references survived validation. The 7,925 unresolved mappings are mostly provisional player and event identities plus ambiguous aliases; persistent reconciliation is required before any Limited Live decision. The fixture is intentionally narrow, so its 8,052 comparison differences (`missing_fixture`: 8,045; `missing_live`: 7) reduce Edge Trust and are not interpreted as provider failure. Edge Trust remains **Limited (57)** and explicitly states that Research Quality is not probability or betting confidence.
