# Reliable Live Data Ticket 4: MLB standings and league leaders

Ticket 4 adds a fixture-primary, server-normalized read model for MLB standings,
team records, season aggregate statistics, and qualified leaderboards. It does
not certify or publicly promote SportsDataIO data. Discovery Lab results may be
scrambled and are used only by the protected shadow validator.

## Architecture and data flow

```text
SportsDataIO (server-only, explicit opt-in)
  -> SportsDataIoMlbTrialProvider vendor-field adapter
  -> provider-neutral Ticket 4 aggregate contract
  -> MlbStandingsLeadersAdapter validation/quarantine
  -> private shadow cache and discrepancy comparison
  -> protected diagnostics only

Deterministic Ticket 4 fixture
  -> MlbStandingsLeadersAdapter
  -> fixture-primary cached read model
  -> /api/standings, /api/leaderboards, /api/team-records/{teamId}
```

The UI and public API never receive SportsDataIO field names, provider record
IDs, credentials, or raw payloads. A malformed sibling is quarantined without
discarding valid rows. Provider access failure leaves the fixture path intact.

## Canonical models

`server/mlb_standings_leaders.py` owns the server contract and uses the existing
client canonical baseball stat IDs. It normalizes:

- standings by canonical team ID, league, division, rank, record, split record,
  runs, streak, games back, wild-card rank, and explicit clinch flags;
- player season aggregates by canonical athlete/team IDs;
- team season aggregates by canonical team ID;
- leaderboard entries with source, sample size, qualification evidence, sort
  direction, shared competition rank, and Edge Trust.

The data is current-season aggregate evidence, not historical game logs. It is
kept separate from Historical Explorer and cannot support all-time wording.
One-run and extra-inning records remain explicitly unavailable because Ticket 4
does not have the required completed-game score and inning evidence.

## Qualification and ranking

Rate-stat qualification is explicit and inspectable:

- batting rate stats use 3.1 plate appearances per team game, rounded to the
  nearest whole appearance;
- pitching rate stats use one inning per team game;
- innings are stored as outs and never parsed as base-10 baseball notation;
- counting statistics do not inherit rate-stat thresholds;
- unknown team-game counts produce `qualification.status=unknown` and suppress
  official-leader wording.

Direction comes from the canonical stat definition. ERA and WHIP sort ascending.
Ties use shared competition rank (`1, 2, 2, 4`). Canonical ID only stabilizes
display order and never breaks the statistical tie. Fixture and incomplete
coverage use “Available-data leader,” never a universal or official claim.

## Cache, snapshots, corrections, and movement

Fixture reads cache by contract version, provider, league, season, and domain.
Shadow candidates use a private cache and are never returned by public endpoints.
Migration 4 adds `research_data_snapshots`, storing only a normalized fingerprint
and safe metadata. Movement is reported only when a prior snapshot with the same
scope and contract exists; the first snapshot suppresses movement.

Shadow comparison distinguishes standings, player-stat, and team-stat gaps and
value conflicts. It does not silently resolve disagreement. A later provider
correction creates a new fingerprint while prior snapshots remain immutable.

## SportsDataIO validation

The narrow validator attempts only:

- `Standings/{season}` on the scores service;
- `PlayerSeasonStats/{season}` on the stats service;
- `TeamSeasonStats/{season}` on the stats service.

It records authenticated, empty, entitlement, endpoint, rate-limit, timeout, and
malformed-response states independently. Partial entitlement preserves valid
sibling domains. Capability declaration means only “eligible for shadow testing”;
it is not evidence that the configured account is entitled or certified.

Run the protected validation with MLB rollout state `shadow`,
`SPORTS_PROVIDER_POC_ENABLED=true`, server-only provider configuration, and an
admin token:

```text
POST /api/admin/mlb/standings-leaders/validate
X-EdgeBoard-Admin: <server-admin-token>

{"confirmation":"VALIDATE MLB STANDINGS LEADERS","season":2026,"refresh":true}
```

Safe status is available at
`GET /api/admin/mlb/standings-leaders/status`. Neither endpoint returns the API
key or raw provider records.

For local, explicitly opted-in validation, load the server environment without
printing it and run `python3 scripts/validate_mlb_ticket4.py --season 2026 --refresh`.
The script emits only the same safe normalized diagnostics.

## Public behavior and remaining gaps

Sample and fixture modes remain credential-free. Public standings and leaderboards
continue to show the deterministic fixture until a later ticket supplies complete
certification evidence and an explicit rollout decision. Ticket 4 does not add
odds, props, projections, game logs, play-by-play, live polling, or betting feeds.

Before Limited Live, EdgeBoard still needs complete entitlement evidence, all 30
team mappings, season/stage validation, correction-window tests, full qualification
coverage, reliable freshness, discrepancy review, public redistribution approval,
and an explicit certification decision.
