# Historical Explorer architecture and coverage

Version 1.4 Sprint 4 adds an on-demand historical domain over EdgeBoard's existing canonical entities, completed statistic rows, records, insights, stories, visualizations, Edge Trust, Discovery, Edge Intelligence, and local workspaces. It does not introduce a second identity system or claim that the illustrative fixtures are real-world history.

## Data flow

1. `mock-historical-fixtures.js` supplies provider-shaped sample coverage, explicit historical events, evidence, sources, corrections, and validation states.
2. `historical-service.js` resolves every entity through the canonical entity registry, applies coverage-aware claim validation, and returns immutable view models.
   Historical event IDs must match completed supporting-evidence rows; postponed or unmatched event references are rejected.
3. Historical queries are parsed into a structured intent, scope, seasons, entities, validation requirement, unsupported portions, and warnings.
4. The UI requests history only when `/history` is opened or history search is used. Completed-season query results are cached; corrections invalidate only affected history keys.
5. Edge Intelligence receives structured evidence and coverage warnings. Dataset-only evidence cannot become an all-time claim.

## Sample historical coverage audit

| Sport | League | Earliest | Latest complete | Events | Athletes/teams | Standings | Playoffs/tournament | Championships | Play-by-play | Spatial | All-time claims |
|---|---|---:|---:|---|---|---|---|---|---|---|---|
| Basketball | WNBA | 2026 | 2026 | Current season only | Partial | Partial | Partial | Partial | Unavailable | Unavailable | No |
| Basketball | NBA | 2026 | 2026 | Current season only | Partial | Unavailable | Partial | Partial | Unavailable | Unavailable | No |
| Football | NFL | 2026 | 2026 | Current season only | Partial | Unavailable | Partial | Partial | Unavailable | Unavailable | No |
| Baseball | MLB | 2026 | 2026 | Current season only | Partial | Unavailable | Partial | Partial | Unavailable | Unavailable | No |
| Hockey | NHL | 2026 | 2026 | Current season only | Partial | Unavailable | Partial | Unavailable | Unavailable | Unavailable | No |
| Soccer | MLS | 2026 | 2026 | Partial | Partial | Unavailable | Partial | Partial | Unavailable | Unavailable | No |
| MMA | UFC | 2025 | 2026 | Partial | Partial | Unavailable | Unavailable | Partial title fixtures | Unavailable | Unavailable | No |
| Boxing | Boxing | 2024 | 2026 | Partial | Partial | Unavailable | Unavailable | Partial title fixtures | Unavailable | Unavailable | No |
| Motorsports | Formula 1 | 2025 | 2026 | Partial | Partial | Partial | Not applicable | Partial | Unavailable | Unavailable | No |
| Motorsports | NASCAR Cup | 2026 | 2026 | Current season only | Partial | Partial | Not applicable | Unavailable | Unavailable | Unavailable | No |
| Golf | PGA Tour | 2026 | 2026 | Current season only | Partial | Unavailable | Partial tournaments | Partial | Unavailable | Unavailable | No |
| Tennis | ATP | 2026 | 2026 | Current season only | Partial | Unavailable | Partial tournaments | Partial | Unavailable | Unavailable | No |

Every other registered league returns an explicit unavailable-coverage object. No unrelated league is used as a fallback.

## Claim validation

- `verified_complete`: record wording is allowed only inside the explicitly bounded complete scope.
- `provider_asserted`: uses “provider-recognized” wording with attribution.
- `dataset_only`: uses “highest in the available dataset” or equivalent.
- `partial_coverage`: uses “notable within available coverage.”
- `incomplete` and `unknown`: record claims are withheld.
- `corrected`: preserves old value, new value, correction time, and reason.

Historical age is not treated as staleness. Freshness describes ingestion and corrections.

Performance rankings never compare unrelated sports, leagues, statistics, or units. Raw values are ranked inside a disclosed cohort, equal values share a rank, explicitly unqualified rows are excluded, and canonical IDs provide only a stable display tie-break. No composite greatness score or undocumented era adjustment is used.

## Rivalries, dynasties, comebacks, and upsets

- A rivalry requires an explicit configured registry entry, combat trilogy, or other supplied classification. Direct meetings remain separately labeled.
- Dynasty candidates require configured title and time-window criteria and remain candidates; the fixture does not assert a verified dynasty.
- Comebacks require a sport-specific score deficit, set deficit, or starting/finishing position.
- Upsets require a supplied odds, seed, ranking, or standings baseline plus a completed result.

## Routes

The development server returns the SPA for `/history` paths. Supported paths include overview, records, performances, championships, rivalries, items, league scopes, and seasons. Browser navigation restores the route without resetting the research slip or workspace storage.

## Remaining gaps

No provider supplies complete real-world league history, historical odds, full brackets, title lineage, play-by-play, spatial data, rule-change metadata, or verified era normalization. Those surfaces remain unavailable rather than inferred.
