# Statistical research architecture

EdgeBoard supports three research modes without replacing the existing betting workflow:

- **Stats** answers deterministic questions from provider-shaped historical sample rows.
- **Betting** retains the existing market, filter, analyst, and bet-slip workflow.
- **Both** renders the statistical answer first and attaches betting context only when a current normalized market matches the same league, participant, canonical stat, and settlement period.

The current historical provider is sample-only. The interface labels it as sample data and does not imply that the values are live, complete, or production-verified.

## Data flow

1. `research-mode-service.js` owns the valid modes and mode-aware prompt suggestions.
2. `query-classifier.js` deterministically classifies supported statistical, betting, mixed, ambiguous, and unsupported intents.
3. `stats-query-service.js` resolves canonical entities and stats and produces one normalized statistical-query object.
4. `stats-provider.js` exposes a provider-neutral historical-statistics interface. Its current implementation reads `mock-stats-provider.js`.
5. `stat-calculations.js` validates completed rows, removes duplicate/postponed/cancelled rows, applies windows and splits, and performs deterministic calculations.
6. `stats-results-service.js` converts provider results into normalized instant-stat, game-log, leaderboard, comparison, split, and combined view models.
7. `app.js` renders those view models while preserving the existing sports repository, navigation selection, filters, market cards, and bet slip.

## Canonical identifiers

`src/config/stat-registry.js` is the source of truth for supported statistical definitions. UI code and mock rows refer to its canonical stat IDs rather than display strings. `src/data/canonical-entities.js` holds the sample canonical athletes, competitors, and teams, including aliases, provider-ID mappings, and safe media fallback metadata.

Unknown entities are never assigned invented IDs. Duplicate names produce a candidate-selection state. Unsupported stats and filters produce explicit guidance instead of fabricated values.

## Historical provider contract

`HistoricalStatsProvider` defines:

- `searchEntities`
- `getPlayerSummary`
- `getPlayerGameLogs`
- `getTeamSummary`
- `getLeaderboard`
- `compareEntities`
- `getSplits`
- `getAvailableStats`
- `getDataFreshness`

A future live implementation should adapt vendor responses to canonical entity IDs, stat IDs, and completed-row shapes before the repository or UI sees them. Provider timestamps must remain visible, and stale snapshots must be marked rather than silently treated as current.

## Persistence and async behavior

The selected research mode, query text, selected ambiguity candidate, and result tab persist in the URL and local storage. Navigation continues to use its existing canonical selection state. A monotonically increasing request sequence prevents an older simulated provider response from replacing a newer query result.

Changing modes or running Stats research does not mutate the existing bet-slip array. Stats mode hides betting panels; it does not destroy them.

## Browser verification

With the local server running, open:

```text
http://127.0.0.1:9010/browser-tests/stats-research.html
```

The harness covers the registry, parser, entity resolution, calculations, normalized result models, mode persistence, stale responses, accessibility semantics, responsive overflow, sample labels, Both-mode compatibility, and bet-slip preservation.
