# Reliable Live Data Ticket 5: MLB pregame game markets

Ticket 5 adds a fixture-primary, provider-neutral read model for MLB sportsbook
identity and full-game pregame moneyline, run-line, and total markets. It does
not certify SportsDataIO, expose a live market as primary, or add player props,
live odds, parlays, settlement, or a historical odds archive.

## Data flow and rollout boundary

```text
SportsDataIO (server-only; explicit protected validation)
  -> GameOddsByDate vendor adapter
  -> canonical event and sportsbook reconciliation
  -> provider-neutral Ticket 5 market contract
  -> validation and malformed-sibling quarantine
  -> private shadow cache and discrepancy comparison
  -> protected safe diagnostics only

Deterministic market fixture
  -> Ticket 5 market adapter
  -> fixture-primary cache
  -> /api/markets, /api/odds, /api/sportsbooks, /api/best-prices
  -> existing normalized offer repository, screener, and research boundary
```

The public browser never receives credentials, SportsDataIO response fields,
provider event IDs, or raw errors. Capability declarations mean only that a
domain is eligible for internal shadow validation. They do not prove account
entitlement, redistribution permission, or production readiness. Fixture,
sample, shadow, and provider candidate values remain explicitly distinct.

## Canonical identities and markets

Sportsbooks use explicit mappings from upstream identity to a stable canonical
ID. Display names are not identities. Known aliases may map only through the
mapping table; unknown books remain unresolved, inactive, and ineligible for
prices. Provider sportsbook IDs remain in the adapter's internal diagnostics.

Every accepted price is keyed by canonical event, canonical sportsbook, family,
side, line, period, settlement scope, alternate status, and pregame/live state.
That identity prevents comparison across games, doubleheader games, sportsbooks,
different totals, alternate lines, or settlement scopes. Only these Ticket 5
families are enabled:

- home/away full-game moneyline;
- home/away full-game run line;
- over/under full-game total.

The settlement scope is `including_extra_innings`. Regulation-only and
first-five markets are not relabeled as full-game markets. Live and partial
period markets fail closed. A two-sided market with a missing side is retained
only as unavailable evidence and cannot become actionable.

## Odds, opening values, and best price

Decimal odds are the canonical numeric representation. Valid American odds are
converted at normalization and a stable American display value is derived from
the decimal value. Zero, values between -100 and +100, non-finite decimals, and
decimal values at or below 1 are rejected.

`providerOpening*` and `providerOpenedAt` exist only when the provider actually
supplies those facts. Ticket 5 never calls the first observed snapshot an
opening line. `earliestObservedAt` therefore remains separate and is currently
unavailable. This ticket does not create a movement timeline or odds archive.

Best-price groups require an exact match on event, family, side, line, period,
settlement scope, and alternate status. Only fresh, available, non-suspended
prices enter the comparison. Output retains the best and worst book, median,
average, eligible book count, freshness, and Edge Trust. A one-book comparison
is labeled partial coverage rather than broad market consensus.

## Freshness, suspension, and Edge Trust

Freshness tightens as first pitch approaches: 30 minutes for games more than a
day away, 10 minutes on game day, and 3 minutes inside two hours. Suspended
prices use at most a two-minute freshness window. Delayed, stale, expired, and
missing-timestamp states are explicit. A game that has started makes its
pregame price expired. Stale or expired selections remain research evidence but
are unavailable in the normalized offer contract and excluded from best price.

Market Trust evaluates market validation, freshness, canonical identity,
coverage, and provider agreement. Research Quality and Market Trust are not
betting confidence, a win probability, or a recommendation. Fixture evidence
cannot appear certified or live. Edge Intelligence can state normalized market
facts and explicitly says that no verified cause is known when movement evidence
is unavailable.

## SportsDataIO shadow validation

The bounded validator attempts only these read-only operations for one date:

- `AllTeams` on the MLB scores service, for identity evidence;
- `GamesByDate/{date}` on the MLB scores service, for event evidence;
- `GameOddsByDate/{date}` on the MLB odds service, for pregame candidates.

The selected date must be within seven days of the server date. Entitlement,
authentication, endpoint, timeout, rate-limit, empty, and malformed-response
states remain distinct. One malformed odds sibling does not discard valid
siblings. Discovery Lab values may be scrambled, so even authenticated results
remain sample/shadow candidates and never replace fixtures.

With server-only configuration loaded, `SPORTS_PROVIDER_POC_ENABLED=true`, and
`MLB_ROLLOUT_STATE=shadow`, run:

```bash
python3 scripts/validate_mlb_ticket5.py --date 2026-08-07 --refresh
```

Or call the protected route with an admin token:

```text
POST /api/admin/mlb/odds/validate
{"confirmation":"VALIDATE MLB ODDS","date":"2026-08-07","refresh":true}
```

Safe status is available at `GET /api/admin/mlb/odds/status`. These outputs
contain endpoint operation names, safe entitlement states, counts, discrepancy
categories, and Edge Trust—not raw payloads, credentials, or provider IDs.

## Remaining gates before Limited Live

MLB odds remain shadow-only. Limited Live requires verified odds entitlement;
complete canonical mappings for every returned sportsbook and event; current
and doubleheader coverage; correction, suspension, and stale-cache exercises;
acceptable shadow discrepancies; provider usage and redistribution approval;
public UI verification against current games; operational monitoring; and an
explicit certification decision. No automatic state transition exists.
