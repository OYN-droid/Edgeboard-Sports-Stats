# Edge Markets architecture

Version 1.5 Sprint 1 adds a market-intelligence workflow on top of EdgeBoard's existing normalized provider, statistics, entity, story, insight, Edge Trust, visualization, workspace, research-session, and research-slip systems. It does not introduce a second odds or identity model.

## Data flow

1. `mock-provider.js` supplies provider-shaped offers. A selection may contain an observed `price_history`; missing history remains unavailable.
2. `sports-repository.js` validates and normalizes offers and price snapshots. Invalid odds and timestamps are rejected before they reach research views.
3. `market-research-service.js` creates a canonical selection-level research model: `market-research:<market id>:<selection id>`. It resolves canonical entities only through existing provider IDs or an unambiguous exact name.
4. Existing completed statistics rows provide threshold history, Last 5/10, home/away, opponent splits, and game logs. Missing canonical statistics return unavailable states rather than fabricated values.
5. Existing stories, insights, Edge Trust, profiles, visualizations, historical exploration, workspace, research sessions, Edge Intelligence, and the research slip consume references from that model.
6. `app.js` renders `/markets`, `/markets/movement`, and `/markets/:league/:market/:selection` with the canonical top-navigation scope.

## Deterministic rules

Hub ranking uses only configured Research Quality, availability, historical coverage, observed movement evidence, and event context weights. Model confidence, projected edge, sportsbook odds, and historical hit rate do not determine Research Quality or general relevance.

“Trending Markets” means deterministic research relevance, never public popularity. “Today” requires a valid event time whose local calendar date matches the user’s date. An unknown event time is not silently treated as today.

Movement is calculated only from ordered provider snapshots. The model separates opening, previous, and current values. Unless a provider supplies a verified event explaining a move, cause remains `unknown`; EdgeBoard does not infer injury, lineup, news, or sharp-action causes.

## Price comparison

Only normalized, valid, provider-attributed sportsbook prices may enter comparison. The current sample provider supplies one sportsbook, so the UI explicitly says cross-book comparison is unavailable. It does not create synthetic books, consensus lines, opening lines, or causes.

## Status and safety

Supported market research states are available, suspended, stale, unavailable, partial, and error. Stale or unavailable selections remain researchable with clear warnings but cannot be added to the shared research slip. Confidence is labeled model signal agreement, never probability. Historical hit rates are labeled historical context, never projection.

## Routes and integration

- `/markets` — scoped Edge Markets hub
- `/markets/movement` — observed movement and recently changed sections
- `/markets/:leagueId/:marketId/:selectionId` — refresh-safe canonical detail route

The existing backend static handler falls back to `index.html` for `/markets` paths, matching Historical Explorer deep-link behavior. The basic `python -m http.server` development command does not provide SPA fallback; use the application server when directly refreshing a path route.

Relevant Markets are grouped into the existing search results. Prop cards link into the same route. Detail pages link to canonical profiles, comparisons, leaderboards, visual analytics, Historical Explorer, Edge Intelligence, related stories and insights, related same-event markets, workspace saving, and the shared research slip when the current offer is fresh.

## Provider gaps

The default provider is deterministic sample data, not live data. It currently has one sportsbook, sparse historical price snapshots, and no verified movement causes, public-betting metrics, confirmed lineup-change feed, confirmed injury-change feed, or universally supported canonical statistic for every market type. Each gap renders an explicit empty or unavailable state. A future live adapter should populate the existing normalized contracts; UI components must never read its raw payload.

## Validation

`browser-tests/market-research.html` validates identities, threshold samples, price history, unknown-cause handling, single-book disclosure, Edge Trust separation, scoped search, hub lanes, invalid prices, request cancellation, routes, responsive layout, keyboard focus, themes, and browser errors.
