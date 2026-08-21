# Reliable live-data implementation backlog

Tickets are intentionally small. Tickets 1 and 2 now have their foundation and MLB Discovery Lab shadow POC implemented; later tickets remain gated.

## Ticket 1 — provider boundary, capability registry, and environment validation

- Goal: consolidate canonical server domain/capability names; declare provider entitlements per league/domain; validate environment/product configuration without calling a vendor or enabling live mode.
- Likely files: `server/interfaces.py`, new `server/provider_capabilities.py`, `server/config.py`, `server/providers.py`, `.env.example`, `tests/test_provider_capabilities.py`, provider docs.
- Dependencies: satisfied for the MLB schedule/entity POC through SportsDataIO Discovery Lab; no key is required for fixture tests.
- Acceptance: one vocabulary feeds adapter eligibility, freshness/cache lookup and rollout domain mapping; unknown domains/products fail closed; public config redacts secrets; sample defaults unchanged; contract fixtures pass.
- Tests: config combinations, secret redaction, unknown/disabled domain, capability serialization, no browser key scan, full regression suite.
- Rollback: remove the new registry imports and retain existing tuples; no data migration.
- Credentials: not for implementation; needed only for a later staging smoke call.

## Ticket 2 — primary schedules and entities adapter

- Goal: implement one exact versioned vendor adapter for catalog, entities, schedules and event status for one proving league.
- Files: new vendor provider/adapter modules, runtime composition, domain validation, recorded permitted fixtures, tests.
- Dependencies: Ticket 1, API docs/sample, fixture-recording permission.
- Acceptance: stable canonical mapping, partial-record quarantine, reschedule/doubleheader/event-status handling and source envelope.
- Tests: malformed sibling, duplicate/ambiguous identity, postponement/cancellation/start change, rate/auth errors.
- Rollback: disable provider/domain; fixture mode remains.
- Credentials: configured server-side for the Discovery Lab shadow smoke test; never required by CI.

## Ticket 3 — canonical reconciliation and membership mappings

- Goal: persist provider IDs, aliases, effective-dated memberships and manual ambiguity resolution.
- Files: reconciliation/database/migration, adapter hooks, admin audit endpoint, tests.
- Dependencies: Ticket 2 sample IDs.
- Acceptance: no silent merge; trades/league changes/replacement opponents survive corrections; saved canonical references stable.
- Tests: ambiguous aliases, provider merge/split, effective dates, rollback migration.
- Rollback: stop new mapping writes; preserve audit/mappings.
- Credentials: no.

## Ticket 4 — historical statistics adapter

- Goal: ingest final box scores/logs with declared coverage, units and corrections for one league.
- Files: historical ingestion, stat adapter/validation, storage, fixtures/tests.
- Dependencies: Tickets 2–3, licensed seasons.
- Acceptance: complete-event filtering, no duplicates, correct sport units, coverage envelope and correction invalidation.
- Tests: incomplete/postponed, duplicate rows, changed final, small coverage, unit edge cases.
- Rollback: disable domain and retain revisions.
- Credentials: staging/backfill access.

## Ticket 5 — odds, props and snapshot adapter

- Goal: map one odds provider into canonical events/markets/selections with book, period, scope, status and licensed snapshots.
- Files: provider/adapter, odds ingestion, market validation, cache/budget metrics, fixtures/tests.
- Dependencies: event reconciliation and written storage terms.
- Acceptance: no missing side invented; alternates, suspensions/reopens and stale data handled; archive writes obey terms.
- Tests: malformed odds, book conflict, unmatched event/entity, period/scope mismatch, quota response.
- Rollback: stop jobs, mark domain unavailable, preserve permitted snapshots.
- Credentials: staging odds key.

## Ticket 6 — league-specific contract validation

- Goal: add MLB, WNBA, UFC and MLS real-provider contract suites.
- Files: league validation, provider fixtures/tests, canonical market/stat mappings.
- Dependencies: Tickets 2–5.
- Acceptance: Phase 10 edge cases pass against provider-shaped fixtures and unmapped partial markets reject.
- Tests: doubleheaders/innings, overtime/combo props, replacement/cancelled bouts/rounds, regulation/ET/penalties/aggregate/abandonment.
- Rollback: domain remains shadow/fixture.
- Credentials: no for CI.

## Ticket 7 — Edge Trust provenance integration

- Goal: evaluate the common source envelope, conflicts, coverage, confirmation and correction state.
- Files: server/client Edge Trust, gateway contracts, coverage API, UI status components, tests.
- Dependencies: validated domain envelopes.
- Acceptance: public states follow the requirements document; single source is not false agreement; no probability semantics.
- Tests: all trust states, historical age versus ingestion freshness, fallback/stale/conflict.
- Rollback: retain existing trust evaluator behind feature flag.
- Credentials: no.

## Ticket 8 — limited-live frontend activation

- Goal: consume enabled normalized domains without replacing unrelated fixture domains or blocking home discovery.
- Files: provider client/composition, repositories, status UI, feature/rollout flags, browser tests.
- Dependencies: Tickets 2–7 and domain certification evidence.
- Acceptance: league/domain labels are honest; partial empty states; no fixture/live blending; current workflows remain.
- Tests: desktop/mobile/keyboard/themes, outage, scope changes, stale response cancellation, console.
- Rollback: domain flag off restores current sample path.
- Credentials: server deployment only.

## Ticket 9 — shadow comparison and operational gates

- Goal: compare candidate/secondary records without exposing them as primary and measure acceptance, latency, freshness, conflicts and cost units.
- Files: shadow service, metrics, job runner, protected diagnostics, tests/runbook.
- Dependencies: deployed candidate adapter.
- Acceptance: no silent merge, discrepancy categories actionable, budgets/circuit recovery verified.
- Tests: outage, 429, out-of-order/duplicate, correction and conflict scenarios.
- Rollback: stop shadow jobs; no UI impact.
- Credentials: candidate and optional comparator staging keys.

## Ticket 10 — certification and explicit production activation

- Goal: record reviewer evidence and promote one league-domain through safe transitions.
- Files: certification/rollout, migration if needed, admin workflow, public coverage, end-to-end tests/runbook.
- Dependencies: passing shadow window, contract signoff, operations approval.
- Acceptance: human confirmation, current evidence, rollback drill, no global live flag, provider terms recorded.
- Tests: transition gates, expired evidence, health demotion, rollback, sample/degraded/offline regression.
- Rollback: domain/league demotion with snapshots and workspaces preserved.
- Credentials: production secret-manager entries required only at deployment.

## Exact next Codex prompt

> Continue working inside the EdgeBoard Sports Stats repository. Implement Reliable Live Data Integration Track Ticket 1 only: backend provider boundary, shared capability registry, and environment validation. Do not connect or call a live provider. Preserve sample and fixture defaults. Consolidate the server-side provider domain vocabulary used by interfaces, adapters, freshness, cache, ingestion, and rollout without changing public behavior. Add fail-closed league/domain capability declarations, server-only environment validation, secret redaction tests, and deterministic contract fixtures. Update `.env.example` with names only and document the boundary. Run all repository tests and browser harnesses, check the console, and report files changed, tests, risks, and rollback. Do not commit.
