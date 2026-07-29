# Advanced statistical research

Phase 3 extends the existing canonical statistics pipeline; it does not create a second athlete, team, event, or stat identity system. All results remain illustrative sample data.

## Query and result flow

1. `query-classifier.js` assigns a deterministic intent.
2. `stats-query-service.js` resolves canonical entities, league scope, stat IDs, date windows, splits, thresholds, qualification rules, sort direction, and display preferences.
3. `stats-provider.js` applies identical completed-event and split filters to every entity. UI code never reads provider rows directly.
4. `stat-calculations.js` removes malformed, duplicate, postponed, cancelled, and incomplete rows before calculating direct or derived statistics.
5. `advanced-stats-results-service.js` converts service results into comparison, leaderboard, filtered-list, record, head-to-head, and event-explorer view models.
6. `app.js` renders the normalized view models and keeps the bet slip separate.

## Supported advanced intents

- `athlete_comparison`
- `team_comparison`
- `multi_entity_comparison`
- `league_leaderboard`
- `team_leaderboard`
- `event_leaderboard`
- `performance_ranking`
- `single_game_high`
- `season_high`
- `career_high`
- `streak_leaderboard`
- `threshold_leaderboard`
- `historical_record`
- `record_progression`
- `statistical_filter`
- `multi_stat_filter`
- `cohort_analysis`
- `head_to_head_history`
- `event_search`
- `game_log_search`
- `mixed_stats_betting`
- `unsupported`
- `ambiguous`

Persisted Phase 1 intent aliases remain valid for safe migration.

## Comparison calculations

Every entity receives the same date boundary, completed-event criteria, aggregation, and split filters. Derived stats are computed only from supplied source values; a zero or missing denominator returns unavailable. Each stat exposes its raw value, sample size, missing count, comparison-pool baseline, absolute difference, valid percent difference, population variance, consistency indicator, and supporting event IDs.

The UI never declares an overall winner. Headline differences name the leading value for a specific stat and state whether higher or lower ranks first. Sport and role presets live in `comparison-presets.js`; users can still request a custom set of canonical stats.

## Leaderboards, ranks, and qualification

Qualification defaults are centralized by sport and refined by stat type. For example, baseball batting leaderboards use plate appearances while pitching leaderboards use innings; one is never required for the other. Football passing, soccer minutes, combat fights and rounds, and motorsports starts have separate rules.

Sorting uses `higherIsBetter` from the stat registry unless the query explicitly supplies a direction. Equal primary values receive shared competition rank (`1, 1, 3`). Secondary canonical stat IDs break display order without changing the shared primary rank. Canonical entity ID is the final stable ordering fallback.

Percentile is:

```text
(qualified pool size - shared rank) / (qualified pool size - 1) × 100
```

Unqualified entities are excluded first. A pool smaller than three receives a warning, and a one-entity pool has no percentile.

## Records and historical highs

The mock provider can prove only values inside its supplied rows. Record view models therefore use labels such as “Highest in the available dataset,” “Season high in available records,” or “Career high in available records.”

Validation states are:

- `verified_complete`
- `provider_asserted`
- `dataset_only`
- `incomplete`
- `unknown`

The current mock implementation always returns `dataset_only` and explicitly prohibits all-time, league-record, franchise-record, and world-record claims.

## Head-to-head and event exploration

Direct meetings and common-opponent rows are separate collections. Common-opponent context is labeled indirect and never implies causality. Event exploration groups completed normalized rows by event ID and attaches canonical entities at the service boundary. Completed historical events do not receive current odds.

## Betting context

Both mode attaches only normalized markets matching league, participant, canonical stat, event period, and settlement scope. Stale or suspended selections are not actionable. Historical hit rate, model projection, projected edge, and confidence remain separate fields; confidence is model-signal strength, not win probability. Statistical ranks are never changed by betting confidence.

## Sharing and export

Mode, query, scope, entity disambiguation, result tab, display view, and sort are represented in the URL. Submissions create history entries; refresh, browser back, and browser forward recompute the deterministic sample result. Bet-slip state is not serialized into research URLs.

Comparison and leaderboard results can be copied as tab-separated text or downloaded as CSV. Exports include scope, date range, aggregation, sample sizes, source, freshness, and a sample-data warning. Cells beginning with spreadsheet formula characters are prefixed before CSV encoding.

## Provider interface additions

`HistoricalStatsProvider` now defines:

- `compareAthletes`
- `compareTeams`
- `compareEntityToCohort`
- `getPlayerLeaderboard`
- `getTeamLeaderboard`
- `getEventLeaderboard`
- `getFilteredEntitySet`
- `getSingleEventHighs`
- `getSeasonHighs`
- `getStreakLeaderboard`
- `getThresholdLeaderboard`
- `getHeadToHeadHistory`
- `searchHistoricalEvents`
- `getRecordCandidate`
- `validateRecordScope`
- `getComparisonPool`
- `getQualificationRules`
- `getAvailableLeaderboardStats`

## Current limitations

- Data is intentionally small, provider-shaped sample data rather than complete live history.
- Pagination metadata exists, but the sample UI does not fetch additional remote pages.
- Trend view currently provides an accessible textual overlay; a production provider can add lazily loaded chart series.
- Team summaries cover selected basketball, baseball, and soccer examples rather than every registered league.
- No sample dataset is complete enough to verify official records.
- Current betting context exists only where the separate mock market provider has an exact compatible selection.
