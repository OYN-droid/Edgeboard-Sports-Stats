# Reliable Live Data Ticket 10.2 — Identity Reconciliation

## Boundary and data flow

SportsDataIO records enter `SportsDataIoMlbTrialProvider`, are validated as provider records, and then pass through `MlbIdentityService` before the normalized MLB contract is built. Provider identifiers are stored only in `provider_mappings` and `provider_mapping_evidence`. Public objects continue to use EdgeBoard canonical IDs.

The consumer rule is fail-closed: only `confirmed` and `deterministic` mappings may enter normalized schedules, entities, search, profiles, research, or later market joins. `probable`, `ambiguous`, `unresolved`, `rejected`, `historical`, and `superseded` mappings remain internal review evidence.

The Discovery Lab provider remains Shadow. Its data is never selected as the public source, no certification state is changed automatically, and sample/fixture behavior remains available without credentials.

## Durable model

Schema version 7 adds:

- `provider_mapping_evidence`: state, method, confidence, bounded evidence, source version, and review fields.
- `provider_mapping_audit`: immutable mapping/review transitions with actor and reason.
- `entity_identity_metadata`: activity class, relevance tier, public eligibility, team/position context, and identity fingerprint.

Existing `entities`, `entity_aliases`, and `provider_mappings` remain canonical. No parallel identity store was introduced.

Mapping changes enqueue deterministic invalidation for profiles, search, research, comparisons, stories, and markets. Historical snapshots are not rewritten.

## Matching policy

- Teams: canonical league key plus matching normalized team name/nickname. Provider rebrands such as `OAK` map through the central alias registry to `ATH`.
- Venues: exact canonical name, or unique normalized name plus location. Home-team relationships are retained as evidence when available.
- Players: exact canonical alias, an existing name-plus-birth-date fingerprint, or controlled creation for a current active/injured player with name, birth date, MLB team, and position. Duplicate names without sufficient evidence remain unresolved. Two-way players retain one fingerprint and one canonical entity.
- Events: league, season/date, canonical away/home teams, and doubleheader number. Reschedule lineage reuses the prior canonical event identity. Provider game IDs never become EdgeBoard event IDs.

Player activity classes are `active`, `injured_list`, `historical_inactive`, `minor_league`, `free_agent`, and `unknown`. Relevance tiers are A (teams, venues, events), B (current relevant players), C (historical players), and D (outside current product scope).

## Operations

Protected API:

- `GET /api/admin/mlb/identity/status`
- `GET /api/admin/mlb/identity/review-queue?entityType=athlete&limit=100`
- `POST /api/admin/mlb/identity/review` with explicit confirmation `APPLY MLB IDENTITY REVIEW`

CLI:

```text
python3 scripts/mlb_shadow_window.py identity-status
python3 scripts/mlb_shadow_window.py identity-queue --entity-type athlete --limit 100
python3 scripts/mlb_shadow_window.py identity-review --provider-id <private-provider-id> --action defer --reason "needs roster evidence"
```

Review actions are `confirm`, `reject`, `create`, `add_alias`, and `defer`. Confirm/create/add-alias operations require a canonical ID; every action records actor, reason, timestamp, prior state, new state, and bounded evidence. Do not put credentials, raw payloads, or private notes in review reasons.

## Certification policy

Mapping quality is evaluated by entity type and domain. Schedule certification uses Tier A team/venue/event evidence and is not blocked solely by incomplete Tier C historical-player reconciliation. Player-profile certification separately requires relevant Tier B player coverage. No domain is promoted automatically; licensing, infrastructure, quota, owner approval, and explicit domain certification remain independent gates.

## Remaining limitations

- Discovery Lab values are sample/scrambled and cannot establish production correctness.
- Manager identity is intentionally suppressed pending a dedicated evidence policy.
- Minor-league affiliations, team-history intervals, and venue lineage require richer roster/transaction sources.
- Manual review changes are local to the configured database; multi-operator review requires authenticated shared persistence.
- A larger multi-day validation window is still required before Limited Live can be considered.
