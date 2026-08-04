# Market Screener and Opportunity Explorer architecture

Version 1.5 Sprint 3 adds deterministic research screening on top of the existing
normalized Market Research, Edge Trust, statistics, story, insight,
visualization, research-session, and Workspace systems. It does not introduce a
second market model or a recommendation engine.

## Data flow

1. Provider adapters and `sports-repository.js` validate schedules, selections,
   prices, events, and provider metadata.
2. `market-research-service.js` builds the canonical selection-level research
   model and joins existing completed statistics, Edge Trust, stories, insights,
   movement, sportsbook comparison, counterarguments, and supporting evidence.
3. `market-screener-service.js` projects that model into a read-only screener
   record. Canonical market, selection, event, league, sport, and entity IDs are
   retained. The UI never reads provider payloads directly.
4. The service applies normalized filters, deterministic sorting and grouping,
   then returns one bounded result window to `app.js`.
5. Workspace saves retain the structured filter request and immutable result
   snapshot. Edge Intelligence receives the same normalized screener evidence.

## Filter contract

The normalized contract supports sport, league, competition, game/event, player,
team, fighter, driver, market type, sportsbook, current/opening line, absolute
line movement, odds, Research Quality, Market Trust, historical coverage and hit
rate, projection, projected edge, model confidence, Research Completeness,
provider, freshness, upcoming events, home/away, opponent, position, weight
class, track, and surface.

Evidence requirement flags cover projection above the line, fresh data,
confirmed lineups, absence of injury uncertainty, attached current stories,
milestones, streaks, recent trends, and absence of provider conflicts.

Unknown filter names are discarded. Invalid numbers and malformed URL state fail
safely. Missing values never pass a filter that requires that value. For example,
a missing projection cannot pass “projection above line,” and an unavailable
injury status cannot pass “no injury uncertainty.” This avoids turning missing
coverage into favorable evidence.

## Deterministic opportunity ordering

The default “Highest Research Quality” order uses the existing Edge Trust score.
“Strongest Supporting Evidence” combines configured weights for Research Quality,
Market Trust, attributed evidence count, completed-row coverage, freshness,
provider agreement, and current supported context. Odds, projected edge,
historical hit rate, and model confidence do not increase the general research
opportunity score.

Other explicit sorts expose largest observed provider movement, historical support,
event time, participant, line, and odds. Ties always fall back to the stable
screener result ID. Grouping reorganizes the same matched set and never changes
eligibility or ranking.

The product language is intentionally research-oriented: Highest Research
Quality, Most Interesting Research, Largest Observed Line Movement, Strongest
Supporting Evidence, and Highest Historical Support. No result is labeled a
best bet, lock, guarantee, or instruction to wager.

## Result model

Each result retains player or participant, market, current line, sportsbook,
Research Quality, Market Trust, projection, projected edge, historical trend,
current story, current streak, current milestone, related visualization,
counterarguments, freshness, coverage, agreement, provider, sample state, and
the complete canonical market model.

Unavailable story, streak, milestone, visualization, role, venue, and provider
fields remain explicit unavailable states. The screener does not derive a
position, weight class, track, surface, lineup, or injury status from names or
sport conventions.

## Workspace and actions

Configured example presets demonstrate strikeout, WNBA assist, combat finish,
shots-on-goal, and line-movement research. Saving a preset uses the existing
versioned Workspace `saved_query` contract. Favorite and Pin use the shared
`saved_research` contract, canonical references, duplicate detection, immutable
snapshots, and pinned state. No separate local-storage screener database exists.

Selected results can be compared across identical fields. Comparison preserves
units and unavailable values and never calculates an overall winner. Result
actions link to canonical market details, existing visual analytics, Edge
Intelligence, sharing, and Workspace.

## Edge Intelligence and Edge Trust

“Why is this market here?”, “Explain this screener,” “Show supporting evidence,”
“Remove weak research,” and “Compare these opportunities” attach structured
filters, result IDs, counts, source attribution, verification state, and evidence
values to the existing research planner. The research answer service exposes
that evidence and the screener limitation; generated language cannot change
eligibility or strengthen an unavailable field.

Every result exposes the existing Research Quality and Market Trust evaluation,
freshness, completed-row coverage, and provider agreement. Research Quality is
source trust, not win probability or betting confidence.

## Routes, performance, and cancellation

`/markets/screener` is refresh-safe. Normalized filters, sort, and group state are
encoded in bounded URL parameters for sharing and browser navigation.

The service caches normalized records and identical screen requests in bounded
one-minute evaluation buckets so normal renders reuse work while upcoming-event
status cannot remain cached indefinitely. Only one
18-result window is rendered at a time; Previous and Next replace that window so
large result sets do not expand the DOM indefinitely. New async requests
invalidate older requests through both an abort signal and request sequence,
preventing stale results from overwriting the current screen.

## Validation and current limitations

`browser-tests/market-screener.html` executes every configured filter, numeric and
missing-data behavior, sorting, grouping, caching, windowing, cancellation,
comparison, presets, Workspace actions, Edge Intelligence context, Edge Trust,
responsive layouts, themes, keyboard access, routes, and browser-error capture.

The default provider remains deterministic sample data. Sparse canonical entity
coverage means some position, fighter, driver, track, surface, story, milestone,
and streak filters honestly return empty sets. Production screening requires
licensed, verified provider fields and does not change the UI or filter contract.
