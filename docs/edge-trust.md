# Edge Trust architecture

Edge Trust is EdgeBoard’s centralized research-quality boundary. It answers
whether the underlying evidence is trustworthy enough to show and explain. It
does not estimate an outcome and is never betting confidence, model confidence,
historical hit rate, projection, edge, or probability.

## Pipeline

```text
Provider
  -> runtime validation
  -> normalized models
  -> canonical identity resolution
  -> freshness evaluation
  -> applicable-domain coverage
  -> provider conflict detection
  -> certification verification
  -> Edge Trust
  -> EdgeBoard result
```

Provider payloads remain quarantined until existing adapters and validators
accept them. Edge Trust consumes normalized validation metadata; it never repairs
or invents a provider value.

## Components and applicability

The internal evaluation considers historical data, markets, lineups, injuries,
provider agreement, freshness, coverage, identity resolution, visualization
support, and research completeness. Only applicable components participate. A
fight-card query is not penalized for missing team lineups, and a statistical
lookup is not penalized for absent telemetry or betting markets.

Weights and raw internal component values are available only through protected
administrative diagnostics. Public responses contain:

- Research Quality label and percentage;
- component status such as Verified, Validated Sample, Partial, Stale, or Waiting
  for Confirmation;
- last validation time;
- honest limitations and unresolved conflicts.

Labels are Excellent, Good, Limited, and Incomplete. Fixture/sample evidence is
capped at Limited so it cannot visually resemble Certified Live research.

## Conflict policy

Shadow discrepancies feed Provider Agreement. Identity, time, event status,
score, statistic, and market conflicts reduce Research Quality. Edge Trust
preserves the conflicting sources and recommends waiting for official
confirmation. It never silently chooses a winner or combines conflicting values.

## Research integration

Every deterministic analyst answer now includes an `edgeTrust` object. The UI
orders the research plan and trust summary before the research summary. Opening
Research Quality displays applicable checks, freshness, limitations, provider
agreement, and Research Completeness. Unavailable lineups, stale markets, or
other missing applicable evidence produce conversational uncertainty text.

## League certification and coverage

The public Data Coverage view projects every enabled league in the normalized
sports registry. Each league has one of these user-facing states:

- Disabled
- Fixture
- Shadow
- Limited Live
- Certified Live
- Degraded
- Suspended

Certification categories are Schedules, Entities, Historical Statistics,
Standings, Markets, Props, Visualizations, Insights, Research, and Overall. The
first rollout group remains MLB, WNBA, UFC, and the provider-quality-selected
soccer competition (currently MLS in fixture mode). Later groups remain supported
but disabled or fixture-only until evidence exists. Nothing promotes
automatically.

## Backend and administrative boundaries

- `server/edge_trust.py` owns backend aggregation and public redaction.
- `src/services/edge-trust-service.js` applies the same public semantics to the
  frontend-only deterministic sample path.
- `/api/coverage` returns public Edge Trust results without weights.
- protected diagnostics and certification responses include component inputs,
  current provider health, shadow discrepancies, validation failures, coverage,
  and Research Quality history.
- migration 3 stores league-scoped Research Quality snapshots after startup,
  rollout transitions, domain validations, provider changes, and certification
  decisions.

## Current production status

No league is certified live by this release. Existing fixture and sample modes
remain explicitly labeled. Provider credentials, parity evidence, licensing,
freshness validation, and explicit certification decisions are still required
before any league can move to Certified Live.
