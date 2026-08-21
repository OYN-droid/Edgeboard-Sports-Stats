# Reliable Live Data Ticket 9 — MLB live event progression

## Architecture

Ticket 9 adds the provider-neutral `edgeboard-mlb-live-state-v1` contract. `MlbLiveStateAdapter` accepts only canonical Ticket 2 games and athletes, validates status, score, inning, outs, count, bases, current participants, line scores, timestamps, and final-score consistency, and quarantines malformed siblings. Provider-specific status values and IDs remain inside the server adapter.

`MlbLiveStateService` owns current read models, deterministic fingerprints, bounded per-event history, transition audit records, corrections, fixture/live shadow comparison, Edge Trust, and explicit polling diagnostics. It enriches Today’s Games and game routes without replacing the schedule shell. It also marks pregame market context as historical once a game starts; saved prices remain research snapshots and are never silently refreshed.

Data flow:

`SportsDataIO BoxScoresByDate -> server-only SportsDataIO adapter -> Ticket 9 contract -> canonical validation -> deterministic version/transition store -> event-aware cache -> Today’s Games, game context, Edge Intelligence, Edge Trust, markets, and Parlay Builder`

Public routes:

- `/api/live/mlb`
- `/api/live/mlb/{eventId}`
- `/api/live/mlb/{eventId}/history`
- `/api/live/mlb/{eventId}/research?q=...`

Protected routes:

- `/api/admin/mlb/live-state/status`
- `/api/admin/mlb/live-state/validate`
- `/api/admin/mlb/live-state/poll`

## State and validation rules

Canonical status is one of `scheduled`, `pregame`, `in_progress`, `delayed`, `postponed`, `suspended`, `resumed`, `cancelled`, `final`, or `unknown`. Unknown provider values remain unknown. Scores must be non-negative. Innings have no arbitrary maximum. Active-half outs are 0–2; a provider value of three is treated as a transition marker and omitted from the public active state with a warning. Count and base occupancy appear only when supplied and valid. Names never resolve current participants; canonical provider-ID reconciliation is required.

Meaningful fields produce a deterministic fingerprint. Timestamp-only repeats do not create another version. State transitions are audited without synthesizing intermediate states. Illegal transitions remain visible with reduced Trust and a warning. Score regressions and changes after final are corrections with before/after states. Refreshable views may invalidate; immutable saved snapshots do not change.

## Polling safety

There is no timer, worker, background thread, startup poll, browser poll, or indefinite loop. Polling is disabled by default and requires all of:

1. server-side SportsDataIO POC configuration;
2. MLB `shadow` rollout;
3. `MLB_LIVE_POLLING_ENABLED=true`;
4. an explicit admin/development action;
5. a canonical per-event allowlist of at most three events;
6. remaining process-local request budget.

Default intervals are planning values, not automatic timers:

| State | Interval |
| --- | ---: |
| Scheduled | 3600 seconds |
| Pregame | 60 seconds |
| In progress | 8 seconds |
| Delayed | 30 seconds |
| Suspended | 120 seconds |
| Resumed | 8 seconds |
| Final correction window | 120 seconds |
| Final after correction window, postponed, cancelled, unknown | stopped |

Transient errors return bounded exponential-backoff instructions. Rate limits preserve `Retry-After`. Authentication or entitlement failures engage the kill switch. Concurrent requests coalesce. Events outside the allowlist or active policy are never requested.

The development command is bounded to one to three cycles, one to three events, and at most 120 seconds:

```bash
EDGEBOARD_RUN_LIVE_POC=1 python3 scripts/poll_mlb_live_state.py \
  --date YYYY-MM-DD --event-id CANONICAL_EVENT_ID --cycles 1 --max-duration 45 --confirm
```

It prints sanitized counts and state metadata only.

## Freshness, finalization, and retention

In-progress and resumed states use a 20-second freshness threshold; pregame 180 seconds; delayed 90 seconds; suspended 300 seconds; scheduled 3600 seconds; final 900 seconds. Values become delayed and then stale. A stale state retains its last validated value and timestamp but is not labeled live.

Final scores require validated totals. Complete inning lines must sum to the final totals; partial lines are never filled. Final states remain eligible only during the correction window, then polling stops. Per-event history is bounded to 50 meaningful versions by default, transitions to 200, and corrections to 100 in process memory. No raw response or every-poll archive is retained.

## Edge Trust

Live-state Trust evaluates provider validation, canonical event reconciliation, legal transitions, score consistency, freshness, participant mapping, and coverage. Fixture/sample evidence remains labeled sample. Stale state, invalid transitions, partial detail, and unresolved players reduce Trust. Freshness and Research Quality are never betting confidence, probability, projection, or win probability.

## Current limitations and rollout

SportsDataIO remains a Discovery Lab shadow candidate. `BoxScoresByDate/{date}` is the only Ticket 9 live-state operation implemented; no play-by-play or live-odds operation is called. Discovery Lab values may be scrambled. Fixture mode is primary, and the POC does not promote MLB to Limited Live or Certified Live.

Before Limited Live, EdgeBoard needs verified endpoint entitlement during representative in-progress games, measured provider delay and rate consumption, broader canonical batter/pitcher/runner reconciliation, durable but terms-compliant correction retention, completed-game and standings reconciliation against real finals, failover validation, alert idempotency review, monitored service-level thresholds, shadow discrepancy approval, and an explicit certification decision.

## Proposed Ticket 10 prompt (do not implement in Ticket 9)

> Continue working inside the EdgeBoard Sports Stats repository.
>
> Reliable Live Data Track Ticket 9 has been completed, reviewed, tested, and committed.
>
> Implement Reliable Live Data Track Ticket 10.
>
> MLB CERTIFICATION, LIMITED-LIVE ACTIVATION, FAILOVER, MONITORING, AND PRODUCTION-READINESS REVIEW
>
> Primary goal: certify only the MLB domains that have sufficient retained evidence, provider entitlement, canonical reconciliation, freshness, reliability, and frontend validation to enter Limited Live. Keep rollout state league- and domain-specific. Do not promote any domain automatically and do not mark MLB Certified Live unless every configured release gate passes with an explicit reviewer decision. Validate schedules, entities, standings, historical statistics, pregame game markets, player props, market movement, injuries, rosters, lineups, probable starters, weather, and live event state independently. Preserve fixture, sample, shadow, degraded, and offline modes. Implement monitored primary/fallback selection without mixing conflicting values, retain source attribution through every fallback, and never substitute sample data as live. Add bounded production polling schedules, provider request and cost budgets, retry-storm detection, circuit-breaker recovery, stale-while-revalidate and stale-if-error labeling, protected health diagnostics, alerting thresholds, audit records, rollback controls, and a public coverage view that excludes sensitive diagnostics. Verify corrections invalidate refreshable research, standings, leaderboards, stories, alerts, market context, and live-state views while immutable saved snapshots remain unchanged. Exercise rollback without losing workspace objects or relabeling fixture data. Run deterministic contract fixtures and standard CI without production credentials. Run narrow opt-in credentialed certification checks only when authorized. Test desktop, tablet, mobile, dark and light themes, browser console, backend rejection handling, graceful shutdown, secret scans, migration repeatability, cache behavior, and deployment configuration. Document every domain’s certification evidence, entitlement, source delay, freshness/error budget, reconciliation rate, discrepancy rate, failover behavior, provider terms, cost exposure, remaining blocker, reviewer decision, and rollback procedure. Do not commit unless explicitly asked.
