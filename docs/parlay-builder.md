# Edge Markets Parlay Builder

The Parlay Builder is an evidence workflow, not a sportsbook or probability model. It reuses normalized market research and the Market Screener rather than calculating a second set of statistics.

## Data flow

`SportsRepository → MarketResearchService → MarketScreenerService → ParlayBuilderService → Edge Markets UI`

Each candidate retains canonical market, selection, entity, event, source, timestamp, settlement, availability, historical-row, Edge Trust, and Research Quality metadata. Missing fields remain unavailable and fail any constraint that requires them.

The deterministic builder filters eligible current markets, sorts by the screener's evidence-only opportunity score, and chooses up to the requested maximum. Same-event and maximum-correlation constraints are applied during selection. It never optimizes or estimates a win probability.

## Correlation

Correlation labels use only supported shared relationships: entity, team, event/game, fight card, race, opponent, constructor, catalog market driver, and weather concern. Low means that none of these relationships was observed; it does not prove independence. Unsupported game-script, pace, quarterback, or travel relationships are not invented.

## Persistence and actions

Constraints are URL-restorable and can be saved as refreshable Workspace queries. Research sets save canonical references and an immutable snapshot. Track creates informational tracked research—not a wager. Share excludes private notes. Export includes evidence, source, timestamps, uncertainty, and sample disclosures. Refinements modify constraints and rebuild deterministically.

## Performance and safety

Build results use minute-bucket caching inherited from market screening. Async builds use sequence and AbortSignal cancellation. Visualizations remain lazy and open only on request. Only live-certified mode rejects sample, fixture, cached, and unverified records rather than relabeling them.

Run `browser-tests/parlay-builder.html` for focused service, route, Workspace, theme, responsive, accessibility, and console coverage. Sample data is intentionally sparse, so strict lineup or live-certification constraints may produce an honest empty state.

## Version 1.5.1 workflow refinement

Version 1.5.1 remains inside `ParlayBuilderService`; it does not introduce a second workflow engine.

- **Build Around This Leg** passes the canonical selection ID back into the same builder as a locked selection. The lock becomes part of the cache key. Compatible legs are selected under the unchanged constraints and the locked leg remains present.
- **Replace This Leg** holds every other canonical selection fixed and searches only for one compatible replacement. Same-event, sportsbook, availability, freshness, injury, lineup, historical-support, provider-agreement, and correlation rules remain active.
- **Why Not This Leg** runs each normalized market through named constraint checks. Candidates rejected during correlation or same-event selection retain those exact reasons. Markets that lose deterministic evidence ordering are labeled as lower-ranked alternatives rather than disappearing.
- **Explain Every Change** stores structured previous/new leg references plus labeled Research Quality, Edge Trust, historical coverage, freshness, correlation, and weather values. Display text is derived from this structure.
- **Favorites** store only canonical selection IDs locally. A returned selection produces an informational availability notice and never a success claim.
- **Versions** are immutable in-session results. Workspace saves retain version tags, canonical references, timestamps, constraints, evidence, and earlier snapshots. Refresh creates a new result; archive and tracking use the existing Workspace domain.
- **Comparison** displays identical portfolio fields without producing an overall score or winner. Potential return is the mechanical combination of current American prices and is not an expected return or success probability.

The exclusion list and version comparison render from lightweight view models. Market details, visualizations, comparisons, and Edge Intelligence research remain lazy. Async rebuilds continue to use the existing sequence and AbortSignal cancellation.
