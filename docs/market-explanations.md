# Market Intelligence and Explain the Market architecture

Version 1.5 Sprint 2 extends the Sprint 1 canonical market-research model. It does
not create a second market, event, identity, statistics, story, insight, trust, or
research-session system.

## Data flow

1. Provider-shaped selections may supply `price_history`, `book_prices`,
   `market_events`, and `research_history`. The default implementation remains
   deterministic sample data and is labeled Sample throughout the UI.
2. `sports-repository.js` validates and normalizes those fields. Invalid odds,
   invalid timestamps, unsupported change types, and malformed events are dropped
   before application code consumes them.
3. `market-research-service.js` joins the normalized selection to the existing
   canonical league, event, entity, completed statistics, stories, insights, and
   Edge Trust systems. Its selection-level ID remains
   `market-research:<market id>:<selection id>`.
4. The service calculates observed movement, book comparison, historical
   threshold context, Research Quality changes, related impact references, and
   supporting evidence. `app.js` only renders this normalized view model.
5. Edge Intelligence receives a structured market context containing canonical
   market, selection, event, entity, source, trust, change, counterargument, and
   evidence fields. The research planner and answer service expose those fields;
   they do not strengthen or invent a cause.

## Explanation and causality rules

Timeline states are `opening`, `movement`, `current`, `suspended`, and `reopened`.
Each normalized state retains timestamp, provider, verification, line, odds, and
status when supplied.

Market events use an explicit relationship field:

- `verified-cause` means the provider explicitly attributed the observed change
  to that verified event.
- `related-context` means a verified lineup, injury, weather, schedule, opponent,
  or correction event occurred in related context, but EdgeBoard does not claim
  causality.
- `unknown` means no verified event was supplied. The UI says: “No verified cause
  has been identified.”

No name matching, timestamp proximity, market direction, historical trend, or
model output is used to infer why a market moved. Unverified events cannot enter
the contributing-evidence collection.

## Compare Books

Book comparison accepts only valid, explicitly verified prices for the same
canonical selection and numeric line. The view exposes best, worst, median,
average, freshness, verification, provider count, and agreement. A single or
unverified price produces an explicit limited state and no best-price claim.
Stale values remain labeled; they are not silently treated as current.

The included multi-book examples are sample provider fixtures. They demonstrate
the contract and calculations and are not live sportsbook data.

## Research impact

Structured differences answer what changed and what did not: line, supplied
projection history, provider-shaped quality evidence, and historical source-row
revision state. Projection and quality deltas require explicitly verified,
attributed snapshots; unverified snapshots remain unavailable rather than being
phrased as changes. Verified lineup and injury events expose canonical references to
affected markets, stories, insights, visual types, comparison queries,
projections, and events.

These references identify potentially affected research surfaces. They do not
claim that every linked calculation changed. Research Quality impact wording
therefore describes evidence completeness and never invents a numeric causal
adjustment.

## Edge Trust and visuals

Market Trust is the existing Edge Trust evaluation with market availability,
freshness, identity, completed-row coverage, completeness, provider agreement,
and applicable lineup or injury status. Research Quality remains evidence trust,
not betting confidence, win probability, or a recommendation.

Line movement and price history use normalized price snapshots. Threshold history
uses completed canonical statistic rows. Research Quality over time labels
provider-shaped evidence snapshots separately from the current independent Edge
Trust evaluation. Entity-based visual actions are disabled when a canonical
entity cannot be resolved.

## Search, routes, and accessibility

Deterministic intent classification recognizes explain-line, movement, compare
books/best odds, historical movement, related research, counterargument, and prop
queries. Results remain constrained by the selected league or sport. Details use
the existing refresh-safe `/markets/:league/:market/:selection` route.

Timeline states are textual, tables have scoped headers, action controls are real
buttons or links, unavailable charts are disabled with accessible labels, and
responsive grids collapse at tablet and mobile widths without changing the
application identity.

## Validation

- `browser-tests/market-explanations.html` covers movement, no movement, known and
  unknown cause, lineup and injury context, comparison calculations, Edge Trust,
  Research Quality, search, Edge Intelligence evidence, direct routes, desktop,
  tablet, mobile, themes, keyboard access, and browser errors.
- `browser-tests/market-research.html` retains the Sprint 1 market regression set.
- The existing Python suite continues to validate provider, backend, rollout,
  security, and normalized-data behavior without live credentials.

## Remaining provider requirements

Production use still requires a licensed provider to supply immutable price
snapshots, explicit causality metadata when known, sportsbook identifiers,
verification state, corrections, lineup and injury events, and stable canonical
mapping inputs. Sample fixtures never promote a league or domain to live status.
