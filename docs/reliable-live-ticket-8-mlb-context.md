# Reliable Live Data Ticket 8 — MLB context

## Architecture

Ticket 8 adds one provider-neutral `edgeboard-mlb-context-v1` contract. `MlbContextAdapter` validates canonical MLB players, teams, and games supplied by Ticket 2, quarantines malformed siblings, removes provider record IDs, and emits normalized availability, roster, lineup, starter, weather, transaction, and contextual-event records. `MlbContextService` provides cached read models, profile/game context, provider-bundle enrichment, Edge Trust metadata, and shadow comparison.

SportsDataIO remains a server-only shadow candidate. Its capabilities are declared independently for injuries, availability, rosters, projected lineups, confirmed lineups, and weather. The adapter attempts `Injuries`, `StartingLineupsByDate/{date}`, `Transactions`, and `GamesByDate/{date}`. A failed or unentitled endpoint is reported independently and never causes fixture data to be relabeled as live. Discovery Lab values remain sample/shadow evidence.

Public normalized routes are `/api/availability`, `/api/injuries`, `/api/rosters`, `/api/lineups`, `/api/probable-starters`, `/api/weather`, `/api/transactions`, `/api/mlb-context`, and `/api/mlb-context/events`. Canonical entity and game routes include the same context. Admin-only `/api/admin/mlb/context/status` and `/api/admin/mlb/context/validate` expose safe shadow diagnostics.

## Certainty and safety

- Availability: `available`, `probable`, `questionable`, `doubtful`, `out`, `inactive`, `suspended`, `injured_list`, `day_to_day`, or `unknown`.
- Lineups: `unavailable`, `projected`, `probable`, `confirmed`, `changed`, `stale`, or `conflicting`.
- Starters: `projected`, `probable`, `confirmed`, `changed`, `unavailable`, `stale`, or `conflicting`.
- Weather: `forecast`, `observed`, `unavailable`, `stale`, or `conflicting`.

Provider wording is attributed and retained as reported context. EdgeBoard does not infer a diagnosis, severity, recovery date, lineup slot, delay probability, market impact, or causal explanation. Market context events use `related_event`; only an explicitly provider-verified causal record could ever use a causal relationship. Current and saved values remain distinct.

## Data flow and invalidation

`SportsDataIO -> server-only raw rows -> SportsDataIO context adapter -> MLB context contract -> canonical validation -> cache/Edge Trust -> profiles, games, props, market research, screener, and research slip`

The process-local cache uses league/domain tags and event-aware freshness thresholds. Prop-research cache keys include the context update timestamp. Context changes add review metadata to affected selections. A locked research-slip leg remains visible and requires explicit review; it is never silently replaced. This scaffold is ready for targeted player/team/event invalidation when provider corrections are ingested durably.

## Current fixture coverage

The deterministic fixture covers two player availability records, two active-roster records, one partial confirmed batting lineup, one confirmed starter, two weather forecasts, one transaction, and five contextual events including one starter-change event. Partial means partial: missing batting-order slots, opponents, or unavailable context are not synthesized.

## Rollout and limitations

Fixture/sample mode remains the default. Shadow candidates are never primary. No injury, roster, lineup, starter, or weather domain is Limited Live or Certified Live. Before Limited Live, EdgeBoard still needs successful entitled endpoint validation across a representative date range, durable correction/event snapshots where provider terms permit, monitored freshness/error budgets, broader canonical player reconciliation, complete doubleheader and scratch/change fixtures, shadow discrepancy review, and explicit certification.

## Proposed Ticket 9 prompt (do not implement in Ticket 8)

> Continue working inside the EdgeBoard Sports Stats repository.
>
> Reliable Live Data Track Ticket 8 has been completed, reviewed, and committed.
>
> Implement Reliable Live Data Track Ticket 9.
>
> LIVE EVENT PROGRESSION, SCORES, INNINGS, AND CONTROLLED POLLING — MLB PROOF OF CONCEPT
>
> Primary goal: extend the provider-neutral MLB boundary with live game progression while preserving fixture, sample, shadow, and offline behavior. Normalize game scores, inning number, inning half, outs, delay/suspension/resumption state, last provider update, source delay, and correction events. Keep provider payloads and credentials server-side. Use bounded, visibility-aware polling with cancellation, deduplication, backoff, jitter, rate-limit handling, circuit breaking, reconnect protection, stale-if-error, and explicit offline/degraded states. Do not add play-by-play, pitch tracking, betting settlement, live odds, or prediction logic. Never fabricate a score, inning, out, transition, cause, or final result. Handle duplicate and out-of-order messages deterministically. Preserve canonical game identity through delays, suspensions, postponements, resumption, doubleheaders, and provider corrections. Add Edge Trust freshness, coverage, provider delay, and validation states. Update Today’s Games, game pages, stories, discovery, research sessions, and alerts only through normalized events. Standard tests must not call live providers; credentialed validation must be narrow and opt-in. Run all tests, browser regression, console inspection, compilation, documentation, and secret scans. Document endpoints attempted, entitlement results, accepted/rejected counts, polling behavior, correction behavior, remaining Limited Live blockers, and every changed file. Do not commit.
