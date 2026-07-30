# Deterministic research analyst

Phase 5 adds a research-orchestration layer above EdgeBoard's existing canonical
statistics, comparisons, leaderboards, profiles, insights, and betting services.
It does not add a generative model or make free-form factual claims.

## Data flow

```text
User query
  -> deterministic intent classification
  -> structured research plan
  -> canonical statistics retrieval
  -> provider-confirmed betting retrieval (Betting/Both only)
  -> comparison/leaderboard engine when requested
  -> deterministic insight engine when requested
  -> normalized evidence records
  -> template-based explanation
  -> reusable research-answer view
```

`src/services/research-planner-service.js` converts the query, selected research
mode, parsed statistical query, and current league context into an eight-stage
plan. The plan contains canonical entity, statistic, market, sport, and league
IDs. It also declares which engines and evidence disclosures are required.

`src/services/research-answer-service.js` is the evidence boundary. It accepts
only structured engine results and provider-confirmed market selections. Every
factual item receives an evidence ID, source, validation state, and available
sample metadata before the explanation templates run. Phrased text is never
read back as a numeric source.

## Answer contract

The reusable answer view exposes:

- summary;
- structured evidence;
- supporting statistics and tables;
- validated trends, or an explicit statement that none were returned;
- counterpoints and missing-data warnings;
- betting relevance kept separate from historical statistics;
- source, sample size, date range, coverage, validation, and freshness;
- canonical related entities, provider-confirmed related props, validated
  insights, and deterministic follow-up queries;
- the interpreted eight-stage research plan.

When an engine returns no supported result, the analyst renders an incomplete
answer and does not substitute a random fact, near match, market, or ranking.

## Research Completeness

Research Completeness is an evidence-quality label:

- `Excellent`
- `Good`
- `Limited`
- `Incomplete`

It is derived from evidence availability, sample size, provider freshness,
sample/production coverage, warnings, and missing compatible markets. It is not
AI confidence, betting confidence, a projected edge, or win probability.

## Mode behavior

- **Stats:** statistical evidence only. Odds and model fields are not retrieved
  unless the query explicitly belongs in a betting-capable mode.
- **Betting:** current provider-confirmed markets, lines, odds, projections,
  edge fields, model-signal confidence, historical hit-rate fields, timestamps,
  and data-quality limitations.
- **Both:** statistics render first. Betting evidence is attached only when it
  is fresh and compatible with the canonical entity, event, statistic, period,
  and settlement scope already validated by the stats result.

Historical hit rate, projection, edge, odds, and model confidence remain distinct
fields. Model confidence is always described as signal strength, never win
probability.

## Provider limitations

The default browser configuration is sample mode. Current answers disclose that
the historical rows and markets are illustrative and incomplete. Record-like
findings remain dataset-scoped unless a provider supplies a validated,
attributed record assertion. Live schedules, injuries, rankings, and markets
are never inferred when a provider does not return them.

## Test harness

Serve the repository and open:

```text
http://127.0.0.1:9010/browser-tests/research-analyst.html
```

The harness checks planning, evidence identity, no-fallback behavior, mode
separation, freshness, market compatibility, transparency, follow-ups,
accessibility affordances, themes, mobile overflow, and application errors.
