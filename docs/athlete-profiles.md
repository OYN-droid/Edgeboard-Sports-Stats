# Athlete profiles (Phase 2)

EdgeBoard athlete profiles are a routed view over the Phase 1 canonical entity and
historical-stat systems. They do not introduce a second athlete identity model.

## Route and state

The frontend-only stack uses query routes:

```text
?player=<canonical-athlete-id>&tab=<profile-tab>
```

Opening and changing profile tabs use `history.pushState`. `popstate` restores the
athlete and tab, and a direct refresh rebuilds the profile from the canonical ID.
The existing mode, research query, navigation scope, filters, and in-memory bet
slip are not replaced by profile routing.

## Data flow

```text
canonical entity ID
  -> HistoricalStatsProvider profile methods
  -> AthleteProfileRepository
  -> normalized profile view model
  -> sport-aware profile renderer
```

UI rendering does not consume raw provider rows. The repository converts source
rows into header, overview, game-log, split, trend, props, matchup, insight,
related-query, and source view models.

## Provider methods

`HistoricalStatsProvider` now defines:

- `getAthleteProfile`
- `getAthleteSeasonSummary`
- `getAthleteRecentForm`
- `getAthleteGameLogs`
- `getAthleteSplits`
- `getAthleteTrends`
- `getAthleteUpcomingEvent`
- `getAthleteMatchupContext`
- `getAthleteInsights`
- `getAthleteMarkets`
- `searchAthletes`

The mock implementation remains the only configured implementation. A live
provider should implement these methods without exposing vendor response shapes
to `app.js`.

## Sport-specific configuration

`src/config/athlete-profile-config.js` selects summary stats, supporting stats,
game-log columns, split dimensions, role labels, and tab language using the
canonical athlete sport and role. Combat sports share one fight-profile strategy;
motorsports share one race-profile strategy. Team sports reuse a configurable
team-athlete strategy.

Unavailable source statistics are omitted. Countable season statistics use
source-row totals where appropriate; basketball and football summaries use
per-event averages. Rates and average-position fields remain averages.

## Insights and media

The deterministic insight service calculates structured evidence before creating
display language. Current rules cover recent highs, threshold streaks, home-away
differences, and high variation. Every result includes supporting event IDs,
sample size, method, source, freshness, warnings, and its selection reason. The
system does not claim league or career records from incomplete mock history.

Media candidates are attempted in this order: original illustration, licensed
headshot, approved silhouette, then initials. Only original abstract EdgeBoard
SVG placeholders are included. Rights status and commercial-use approval are
recorded; no athlete likeness or unlicensed photography is included.

## Current mocked areas

- all historical rows, schedules, matchup factors, and odds
- athlete biographical fields and availability status
- opponent, weather, injury, lineup, practice, and qualifying depth
- league ranks and percentiles
- model projections and edges supplied by the existing mock betting provider
- the follow action, which is a presentation placeholder

No profile should be interpreted as live, complete, or production-verified.
