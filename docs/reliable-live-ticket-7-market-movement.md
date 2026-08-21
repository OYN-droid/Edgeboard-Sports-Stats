# Reliable Live Data Ticket 7: market movement and verified change explanations

## Scope and safety boundary

Ticket 7 adds normalized history for Ticket 5 MLB pregame game markets and Ticket 6 MLB pregame player props. It does not add live in-game odds, wager placement, settlement, recommendations, or Certified Live promotion. SportsDataIO Discovery Lab candidates remain scrambled/sample shadow evidence and never become primary user data.

The factual order is:

`provider adapter -> normalized current market -> canonical snapshot adapter -> bounded snapshot store -> movement/consensus analysis -> existing market research models`

Raw provider payloads never enter the store or browser. The canonical series identity includes event, optional player, canonical market, sportsbook, family, side, period, settlement scope, and alternate status. Line is deliberately excluded from the series key so a line change remains in one timeline. Sportsbooks, periods, scopes, and players are never merged.

## Retention determination

The repository's current provider terms do not explicitly permit an odds-history archive:

- `PROVIDER_ODDS_HISTORY_ALLOWED=false`
- normalized retention is allowed only within `PROVIDER_MAX_CACHE_SECONDS`
- the provider strategy documents still require written commercial archive/redistribution rights

Therefore the default state is `short_term_cache`: a capacity-bounded process-memory store with a provider-configured TTL. It does not write snapshots to SQLite. Fixture records are deterministic contract fixtures, not retained provider observations. The four modeled states are:

- `ephemeral_only`: no retained timeline beyond minimal in-process comparison
- `short_term_cache`: bounded memory and configured TTL; current default
- `historical_storage_allowed`: terms explicitly allow normalized odds history, but this ticket still does not silently enable a durable archive
- `unknown`: fails closed to effective `ephemeral_only`

If durable storage is approved later, add a separate migration with unique indexes on snapshot ID and `(series_id, observed_at)`, plus indexes for `(event_id, observed_at)`, `(player_id, observed_at)`, and `(canonical_market_id, sportsbook_id, observed_at)`. That migration must not ship before rights, deletion windows, backup retention, and export restrictions are resolved.

## Snapshot and change contracts

Each snapshot preserves canonical IDs, sportsbook, line, decimal/American price, status, suspension, period, scope, alternate flag, provider, source mode, verification, attribution, and observation timestamp. Provider-reported opening values remain distinct from EdgeBoard's earliest observation.

Meaningful changes are deduplicated into initial observation, line change, price change, combined change, suspended, reopened, closed, and corrected. Out-of-order observations are inserted chronologically. Same-timestamp provider corrections replace the old observation. Unchanged refreshes do not inflate history. Line movement and price movement are computed separately. Sportsbook-implied probability is explicitly labeled as price-derived and never as model win probability.

The default configurable significance thresholds are 0.5 line units and 0.02 implied-probability change. They can be changed with `MARKET_MOVEMENT_LINE_THRESHOLD` and `MARKET_MOVEMENT_IMPLIED_PROBABILITY_THRESHOLD`.

## Cause model

Observed movement is not itself a cause. A change event contains its own canonical ID, event/player/market scope, type, timestamp, provider, verification, causal relationship, summary, and evidence IDs. Only `verification=verified` plus `causalRelationship=verified_cause` may appear as a verified explanation. Verified events labeled `related_event` remain context only. Otherwise the exact disclosure is: **No verified cause has been identified.**

The fixture demonstrates both cases. It is transparently fixture evidence and does not assert anything about a real MLB market.

## APIs and consumers

Public normalized reads:

- `GET /api/market-movement`
- `GET /api/market-movement/recent`
- `GET /api/market-movement/consensus`

Protected operations:

- `GET /api/admin/mlb/market-movement/status`
- `POST /api/admin/mlb/market-movement/capture` with exact confirmation `CAPTURE MLB MARKET MOVEMENT`

`/api/provider-data` enriches normalized selections with `price_history`, `market_events`, and `movement_summary`. Existing Edge Markets, visuals, screener, parlay research, and Edge Intelligence consume those normalized fields. Recently-moved screener/parlay filters use observed movement only; they do not call it an opportunity recommendation.

Consensus preserves separate sportsbook observations and reports median/ranges plus provider agreement. It never creates a synthetic sportsbook or silently averages unlike scopes.

## Configuration

No secret values belong in source control. Ticket 7 adds only safe controls:

```text
MARKET_MOVEMENT_MAX_SNAPSHOTS=10000
MARKET_MOVEMENT_LINE_THRESHOLD=0.5
MARKET_MOVEMENT_IMPLIED_PROBABILITY_THRESHOLD=0.02
```

Existing terms controls remain authoritative. Public configuration does not expose credentials or internal provider diagnostics.

## Bounded shadow capture

Only run this opt-in command when shadow credentials and rollout configuration are already present:

```bash
python3 scripts/capture_mlb_ticket7.py --date YYYY-MM-DD --captures 2 --interval 30 --confirmation "CAPTURE MLB MARKET MOVEMENT"
```

The command permits at most three observations, sleeps at least 15 seconds between them, prints normalized counts/status only, stores no raw payload, and never exposes a key. Provider or plan limitations leave fixture behavior intact.

## Ticket 8 handoff

Ticket 8 should add provider-authorized lineup and injury observations, canonical invalidation relationships, and recalculation of affected Research Quality. It must retain the Ticket 7 rule that temporal proximity is not causality and must not enable durable market archives without resolved provider terms.
