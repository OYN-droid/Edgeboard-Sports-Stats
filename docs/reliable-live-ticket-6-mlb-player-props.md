# Reliable Live Data Ticket 6: MLB player props

Ticket 6 adds a fixture-primary, shadow-only player-prop research boundary. It does not enable
Certified Live, wagering, live polling, projections, settlement, or provider data as a primary
user-facing source.

## Data flow

```text
SportsDataIO Betting Player Props by Game (server only, opt-in)
  -> SportsDataIO trial adapter (scrambled/sample)
  -> canonical event + athlete + team + sportsbook reconciliation
  -> centralized MLB prop/stat registry
  -> normalized over/under prop rows
  -> completed canonical game-log evidence
  -> deterministic threshold analysis + Edge Trust
  -> provider bundle -> existing Markets / Screener / Parlay research components
```

`server/mlb_player_props.py` owns the Ticket 6 contract, its 13-family registry, validation,
historical threshold calculation, exact-line price comparison, provider-bundle view model, cache,
and shadow comparison. Provider aliases remain in `server/sportsdataio_mlb.py`. Browser code only
receives canonical IDs. The existing market catalog and stat registry remain the UI source of
display semantics.

## Canonical mappings

| Provider-neutral family | Canonical market | Canonical statistic |
| --- | --- | --- |
| pitcher_strikeouts | baseball-pitcher-strikeouts | baseball-pitcher-strikeouts |
| pitcher_outs_recorded | baseball-pitcher-outs | baseball-innings-pitched (integer outs) |
| pitcher_hits_allowed | baseball-hits-allowed | baseball-hits-allowed |
| pitcher_walks_allowed | baseball-walks-allowed | baseball-walks-allowed |
| pitcher_earned_runs_allowed | baseball-earned-runs-allowed | baseball-earned-runs |
| batter_hits | baseball-hits | baseball-hits |
| batter_total_bases | baseball-total-bases | baseball-total-bases |
| batter_home_runs | baseball-home-runs | baseball-home-runs |
| batter_rbi | baseball-runs-batted-in | baseball-runs-batted-in |
| batter_runs | baseball-runs | baseball-runs |
| batter_stolen_bases | baseball-stolen-bases | baseball-stolen-bases |
| batter_walks | baseball-walks | baseball-walks |
| batter_strikeouts | baseball-strikeouts-batter | baseball-strikeouts |

Pitcher innings are never compared as base-10 decimals. The canonical row stores outs (19), while
traditional display is derived (`6.1`). Equal integer lines are pushes. Pushes remain visible but
are excluded from the decided hit-rate denominator.

## Research and prices

`GET /api/player-props` returns normalized props and the inspectable registry.
`GET /api/prop-research/{propId}` returns Last 5, Last 10, Last 20, season, home, away, and opponent
windows with source rows, sample size, hits, misses, pushes, and explicit descriptive-only wording.
`GET /api/prop-best-prices` compares books only when event, athlete, family, side, line, period, and
settlement scope are identical. A better price at the same line is not called a better line.

The existing provider bundle receives these offers, so the existing screener can filter them and
the existing market-research service can use the canonical stat ID. `sgp_eligible` remains false:
Ticket 6 provides research legs for explicit POC inspection but does not claim verified SGP rules
or create wager execution. Existing qualitative same-player, same-team, same-game, and opposing
participant relationships remain explanations, never invented numeric correlations.

## SportsDataIO boundary

The server attempts `AllTeams`, `Players`, `GamesByDate/{date}`, then the documented
`BettingPlayerPropsByGame/{gameId}` operation for a bounded set of games. Credentials use the
server-only header already established in Ticket 1. Discovery Lab records are treated as scrambled
sample candidates. Raw responses, provider IDs, and credentials are not returned, logged, cached in
public caches, exported, or written to fixtures.

Run a credentialed check only with explicit opt-in:

```bash
EDGEBOARD_RUN_LIVE_POC=true python3 -m unittest tests.test_sportsdataio_mlb_live.SportsDataIoLivePocTests.test_current_mlb_player_prop_entitlement -v
python3 scripts/validate_mlb_ticket6.py --date YYYY-MM-DD
```

If the plan lacks the prop operation, the report retains the entitlement/error code and the
fixture stays primary. Ordinary tests make no live calls.

## Blockers before Limited Live

- Verify plan entitlement and actual response shapes for the prop operation.
- Review every provider bet-type alias and every sportsbook mapping against recorded, permitted fixtures.
- Reconcile all provider players and events at production confidence; ambiguous identities fail closed.
- Connect licensed completed player-game history beyond the small deterministic fixture.
- Establish freshness, suspension, correction, and cache-invalidation observations under real updates.
- Certify league/domain rollout explicitly; no successful request promotes a domain automatically.
- Define and validate provider-specific SGP eligibility before enabling parlay combinations.

## Exact proposed Ticket 7 prompt (not implemented)

> Continue working inside the EdgeBoard Sports Stats repository. Reliable Live Data Track Ticket 6
> has been completed, reviewed, and committed. Implement Reliable Live Data Track Ticket 7:
> CERTIFIED MLB MARKET MOVEMENT & PRICE-HISTORY INTEGRATION. Preserve the provider-neutral boundary,
> canonical event/player/sportsbook/market/stat identities, fixture/sample/shadow modes, Edge Trust,
> Edge Intelligence, Markets, Screener, Parlay Builder, and Workspace. Ingest only provider-observed
> opening and subsequent price/line snapshots for Ticket 5 game markets and Ticket 6 player props.
> Preserve provider timestamp, sportsbook, event, athlete, family, side, line, period, settlement
> scope, alternate flag, availability, suspension, reopening, and correction metadata. Deduplicate
> out-of-order snapshots deterministically. Never infer a movement cause. Explain verified related
> lineup, injury, weather, schedule, and participant changes only as related context unless the
> provider explicitly establishes causality; otherwise say “No verified cause has been identified.”
> Keep best price and best line distinct. Add bounded private caches, targeted invalidation, shadow
> discrepancies, safe diagnostics, opt-in live contract tests, fixture tests for opening/movement/
> suspension/reopening/correction/out-of-order/duplicate states, browser regression, documentation,
> secret scans, and a Limited Live blocker report. Do not enable live polling, wagering, settlement,
> Certified Live, or any unsupported market. Do not commit.
