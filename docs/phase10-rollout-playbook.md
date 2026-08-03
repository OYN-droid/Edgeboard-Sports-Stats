# Phase 10 verified-provider rollout playbook

## Current decision

No provider credentials, odds credentials, secondary provider, or admin token were present during the Phase 10 audit. No live endpoint was called and no league or domain is certified live. MLB, WNBA, UFC, and MLS therefore start at `fixture_only`; public labels say **Sample**, **Planned**, or **Unavailable**.

MLS is the provisional soccer competition because it already has a canonical EdgeBoard identity, is relevant to the active North American season, and minimizes timezone and competition-format expansion for the first rollout. This is an implementation-path choice, not a provider-coverage claim. NWSL, Liga MX, Premier League, and UEFA Champions League were not activated because authentication, schedules, markets, history, identity quality, reliability, contract limits, and freshness could not be compared without a provider.

## Phase 9 readiness audit

| Area | Existing foundation | Phase 10 result |
|---|---|---|
| Runtime | Python HTTP boundary, graceful shutdown, safe errors | League services are runtime-owned |
| Providers | Neutral adapters and server-only HTTP template | Four safe fixtures and league market validators |
| Environment | Server-only keys, validation, public redaction | Per-league states and usage budgets |
| Models | Canonical entities, events, stats, markets | Domain source modes and correction audit |
| Reconciliation | Exact mappings, aliases, ambiguity review | Certification requires evidence; no silent merge |
| Database | Repeatable v1 schema and unique rows | v2 rollout, certification, shadow, correction, gate, usage tables |
| Cache | Versioned provider/domain keys and stale policy | League/record invalidation for correction and rollback |
| Ingestion | Locks, idempotency, accepted/rejected counts | Disabled/suspended guards and league schedules |
| Health | Provider counters and circuit breakers | Rollout health remains distinct from betting confidence |
| Modes | sample/live/hybrid/degraded/offline | Per-league states and field/domain source modes |
| UI | Provider badge and status dialog | Public Data Coverage view |
| Diagnostics | Protected, redacted, read-only | Certification, shadow, schedules, usage, rollout status |
| CI | Credential-free fixture | Four-league rollout matrix |

## Readiness matrix

All entries describe fixture capability, not live coverage.

| Domain | MLB | WNBA | UFC | MLS |
|---|---|---|---|---|
| Metadata | Conditional fixture | Conditional fixture | Conditional fixture | Conditional; selection provisional |
| Teams/participants | Conditional fixture | Conditional fixture | Conditional fighters | Conditional fixture |
| Schedules/cards | Doubleheader fixture | Conditional fixture | Event-card fixture | Conditional fixture |
| Live status | Unavailable | Unavailable | Unavailable | Unavailable |
| Results/history | Representative fixture | Overtime fixture | Fight-stat fixture | Representative fixture |
| Profiles/rosters | Minimal entities; roster unavailable | Minimal entities; roster unavailable | Minimal fighter identity | Minimal entities; roster unavailable |
| Standings | Unavailable | Unavailable | Not applicable | Conditional fixture |
| Injuries/availability | Unavailable | Conditional fixture | Weigh-in unavailable | Unavailable |
| Lineups | Projected fixture | Projected fixture | Not applicable | Projected fixture |
| Markets/props | F5 and pitcher K fixture | Assists fixture | Method fixture | 3-way and shots-on-target fixture |
| Movement/spatial/media | Unavailable | Unavailable | Unavailable | Unavailable |
| Provider timestamps | Stable fixture timestamp | Stable fixture timestamp | Stable fixture timestamp | Stable fixture timestamp |

## Rollout states

- `disabled`: no live calls.
- `fixture_only`: recorded contract fixtures only.
- `internal_testing`: live calls restricted to development/admin diagnostics.
- `shadow`: live data compared but never primary.
- `limited_live`: only certified domains visible; incomplete domains remain unavailable, fixture, or hidden.
- `production`: certified live domains are primary after explicit confirmation and certification.
- `degraded`: stale cache, partial source, or explicit fallback; never silently relabeled live.
- `suspended`: calls blocked for reliability, quality, or contract reasons.

Transitions are constrained and audited. Health can demote but never promotes to production. Production requires every certification check to be current and `certified`, at least one explicitly attributed `live_verified` domain, and no fixture, sample, partial, or cached primary domain. Activation then requires `ACTIVATE <LEAGUE> PRODUCTION` through the protected endpoint.

## Certification and release gates

Certification stores structured evidence, timestamps, expiry, decision maker, and notes for identity, schedule, statistics, markets, freshness, UI, and reliability. Conditional fixture evidence cannot promote a league. Release gates accept configurable min/max thresholds. Starting gates should cover consecutive schedule success, zero critical identity conflicts, timezone/postponement parity, historical completeness, corrections, market mapping, and stale-odds rates.

## Shadow and limited-live operation

Shadow reports missing primary/secondary rows, identity, time, status, score, stat, market, and stale-source discrepancies. Conflicting values are never merged. In limited live, each domain independently carries `live_verified`, `live_partial`, `cached_fresh`, `cached_stale`, `fixture`, `sample`, or `unavailable`. A live schedule does not imply live props, injuries, or visuals.

## League playbooks

### MLB

Validate all active teams, divisions and venues; doubleheaders, suspended/postponed/rescheduled games and local dates; roles and trades; batter and pitcher units; innings notation as outs; game/F5 settlement; probable-pitcher and lineup invalidation. Start schedules/entities in shadow, then history, then markets.

### WNBA

Validate active teams, rosters, trades/waivers, Commissioner's Cup, playoffs, overtime rows, lineup/injury confirmation and staleness, combo/alternate props, and including-overtime settlement. Lineup changes target affected calculations only.

### UFC

Treat bouts as event-based. Validate card order, replacements, cancellations, catchweights, title/interim status, three/five rounds, result aliases, and no contests. Markets must exactly match fighter pairing and scheduled rounds. Opponent replacement invalidates old research and markets.

### MLS

Before live activation, prove provider coverage and terms against rejected candidates. Validate country/organizer identity, kickoff timezone, abandonment, rescheduling, regulation/extra-time/penalty/qualification scopes, transfers, lineup confirmation, three-way draw, shots, corners, and cards.

## Corrections and rollback

Corrections retain old/new values, provider correction time, detection time, and source. A targeted queue covers summaries, leaderboards, comparisons, insights, milestones, visualizations, projections, alerts, and tracked research; immutable snapshots remain unchanged. Model version and input time prevent stale replacement.

Rollback procedure:

1. Record the outage or quality reason.
2. Suspend a domain, or move `production → limited_live → shadow → fixture_only`.
3. Invalidate only public league/domain caches.
4. Confirm coverage updates and no sample value says Live.
5. Preserve workspaces and immutable snapshots.
6. Run fixture, outage/recovery, shadow, and certification checks.
7. Restore one safe state at a time; production still requires certification.

Ordinary rollback changes state and cache, not schema. Provider switches preserve canonical IDs and require fresh shadow evidence.

## Usage, fixtures, and incident response

Usage records provider, endpoint, league, bytes, cache hit, retries, errors, rate-limit remainder, and a non-confidential cost category. A rolling one-hour query window warns above 5,000 requests/hour, 250 retries/hour, or 100 high-cost calls/hour. Current live usage is zero. Pricing is excluded publicly.

The Phase 10 fixture declares versions, recording permission, no secrets, no personal data, and test-only redistribution. Update it only when terms permit. Run `python3 scripts/validate_rollout.py`; standard tests never call live providers. Credentialed tests belong only in protected CI.

## Limitations and recommended next order

There is no real provider integration, credentials, verified contract, seven-day evidence, or certified live league. Fixtures are narrow and do not prove complete teams, seasons, rosters, standings, injuries, markets, or media. The main board remains sample-first unless the gateway is explicitly selected.

After these four pass gates: NWSL (reuse soccer validation), NBA (reuse WNBA model), NHL (regulation/overtime scopes), then Formula 1 (distinct sessions/classification). This recommendation does not activate them.
