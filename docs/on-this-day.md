# On This Day architecture

Version 1.4 Sprint 5 extends the Historical Explorer with deterministic sports anniversaries. It does not create a second statistics, story, identity, or trust system.

## Data flow

1. `mock-historical-fixtures.js` supplies clearly labeled illustrative completed-event evidence and explicit coverage limits.
2. `historical-service.js` validates canonical sport, league, entity, event, source, completion, and claim-language requirements.
3. `anniversary-service.js` matches validated evidence by local calendar month and day, derives the original year and years ago, applies exact scope filters, and ranks eligible cards with configurable non-betting weights.
4. `home-discovery-service.js` requests a small scoped set after the historical bundle loads. Current stories, games, and markets render independently.
5. Historical routes render the date explorer, stable detail pages, evidence tables, a before/event/after timeline, current connections, and structured Edge Intelligence research paths.

The normalized `historical_anniversary` model retains the historical item ID, event ID, canonical entities, sport and league IDs, evidence, source, coverage, validation state, Edge Trust result, Research Quality, sample disclosure, timeline, and current connections. Phrased titles and summaries never replace the structured historical item as the factual source.

## Determinism and safety

- Date matching uses local calendar components rather than UTC string truncation.
- Invalid dates and non-leap February 29 dates return an explicit empty state.
- Events later than the selected anniversary year are excluded.
- Selected league, sport, category, and original-year filters are exact; an empty result never falls back to another sport.
- Scores use configured historical significance, Edge Trust, Research Quality, explicit scope relevance, current canonical connections, coverage, recency, and novelty. Betting confidence and win probability are not inputs.
- Current markets are attached only outside Stats mode and only when a provider-confirmed available market matches a normalized current event. Missing compatibility remains unavailable.
- Share snapshots contain source, coverage, validation, quality, and sample status. Workspace saves preserve immutable historical and anniversary values.
- Fixture statements are illustrative and explicitly say they are not real-world historical claims.

## Routes

- `/history/on-this-day?date=YYYY-MM-DD&sport=...&league=...&year=...&category=...`
- `/history/anniversaries/:anniversaryId`

The date explorer supports today, yesterday, tomorrow, an explicit date, original year, sport, league, and category. Browser back, forward, refresh, and deep links use the same route state.

## Provider extension point

A future historical provider should continue to enter through the Historical Explorer adapter and normalized historical-item validation. The anniversary service should receive only completed, canonical, source-attributed historical items; UI components must not consume provider aliases or raw payloads.

Corrections should invalidate the affected historical item through `invalidateHistoricalItem`. Saved snapshots remain unchanged while refreshable research can rebuild from corrected normalized evidence.

## Sample coverage

Illustrative anniversary fixtures demonstrate basketball/WNBA, football/NFL, baseball/MLB, hockey/NHL, soccer/MLS, UFC, Formula 1, golf/PGA, tennis/ATP, and Olympic basketball. The fixtures test presentation and scope isolation; they are not curated trivia or claims about real-world events.

## Testing

Run the app at `http://127.0.0.1:9010/`, then open:

`http://127.0.0.1:9010/browser-tests/anniversaries.html`

The harness covers normalized fields, date math, leap-day handling, scoring, cache invalidation, async cancellation, scope isolation, sample labeling, trust, search, share snapshots, routes, evidence, timeline accessibility, themes, and mobile overflow.
