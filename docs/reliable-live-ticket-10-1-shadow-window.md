# Reliable Live Data Ticket 10.1: MLB controlled Shadow window

## Decision

Ticket 10.1 does not activate public live data. The ordinary application still
uses fixture/sample schedules, scores, markets, props, research, and live
labels. SportsDataIO is an internal comparison source only. A completed window
adds evidence to certification criteria but never mutates rollout state.

## Architecture

`MlbShadowWindowService` coordinates the existing provider adapters and six
existing validation groups:

```text
explicit bounded window
  -> per-attempt request gate
  -> SportsDataIO server adapter
  -> existing normalized MLB adapters
  -> fixture/canonical comparison
  -> domain evidence + reviews + safe report
  -> Ticket 10 checker (read-only evidence consumption)
```

The provider key remains in the server process. Provider payloads never enter
the browser, reports, logs, review records, or public cache. Only normalized
values, safe provider identifiers, safe error codes, provenance, and aggregate
metrics are retained.

Schema version 6 adds durable tables for windows, request attempts, domain
evidence, discrepancy reviews, and mapping reviews. SQLite remains suitable for
local or single-process staging only.

## Window controls and budgets

A window requires all of the following:

- a configured server credential;
- `SPORTS_PROVIDER_POC_ENABLED=true`;
- `MLB_ROLLOUT_STATE=shadow`;
- the exact start confirmation;
- a hard request budget between 1 and 250;
- a fixed duration, date range of no more than seven days, or fixed event set.

Only one window may be active. The HTTP client asks the window service for
permission before every physical attempt, including retries. Global,
per-domain, and per-endpoint ceilings are supported. Cache hits and coalesced
consumers do not consume a provider request because no physical attempt occurs.
Budget exhaustion stops new calls and preserves evidence. A window also stops
on expiration, explicit operator action, or completion of one bounded CLI/API
cycle. No indefinite local daemon is introduced.

## Evidence and metrics

Every tested certification domain receives a versioned evidence envelope with:

- entitlement classification based on observed account behavior;
- provider request counts, outcomes, retries, rate limits, timeouts, and latency;
- accepted/rejected validation counts;
- canonical mapping outcomes;
- fixture/provider comparison outcomes and classified discrepancies;
- freshness and stale-fallback observations;
- correction, cache, market, and live-state observations when available;
- Edge Trust, limitations, and an evidence-only recommendation.

Rates require a denominator of at least five. Otherwise the value is
`insufficient_sample`; zero denominators never become zero-percent claims. p95
latency requires at least 20 observations.

Entitlement states are `entitled_and_working`, `entitled_but_empty`,
`entitlement_denied`, `endpoint_unavailable`, `unsupported_by_plan`,
`provider_error`, `configuration_error`, and `not_tested`. Documentation or an
implemented adapter is never treated as account entitlement.

Recommendations are evidence only: `insufficient_sample`, `remain_fixture`,
`remain_shadow`, `candidate_limited_live`, `candidate_certified_live`, or a
specific entitlement, licensing, infrastructure, or quality block. Ticket 10.1
does not promote domains.

## Discrepancy and mapping review

Differences are classified before scoring. Expected fixture/live coverage gaps
are not provider failures and do not create noisy review items. Identity,
event, value, status, scope, timestamp, correction, staleness, unsupported, and
unresolved differences can enter the manual queue.

Ambiguous mappings remain unresolved. A correction requires the exact
`APPLY EXPLICIT MLB MAPPING` confirmation plus an actor, canonical ID, and
reason. The workflow does not rewrite historical window evidence.

Simulated failures use a separate flag and summary. They never inflate observed
provider reliability metrics.

## Safe local commands

Use a durable, ignored local SQLite database so separate commands see the same
window. Export the existing `.env` into the process without printing it:

```bash
set -a
source .env
set +a
export DATABASE_URL=sqlite:///data/mlb-shadow-validation.db
export SPORTS_PROVIDER_POC_ENABLED=true
export MLB_ROLLOUT_STATE=shadow
```

Start and immediately run one small schedule/entity cycle:

```bash
python3 scripts/mlb_shadow_window.py start \
  --date 2026-08-08 \
  --duration-minutes 15 \
  --request-budget 6 \
  --domains schedules,teams,venues,players,event_identity,event_status \
  --run
```

For a separately started window:

```bash
python3 scripts/mlb_shadow_window.py status
python3 scripts/mlb_shadow_window.py run --window-id WINDOW_ID
python3 scripts/mlb_shadow_window.py stop --window-id WINDOW_ID --reason "Operator stop"
python3 scripts/mlb_shadow_window.py report --window-id WINDOW_ID
python3 scripts/mlb_shadow_window.py reviews --window-id WINDOW_ID
python3 scripts/mlb_shadow_window.py mappings --window-id WINDOW_ID
python3 scripts/check_mlb_certification.py
```

The commands print normalized reports only. They never print credentials, raw
provider payloads, credential-bearing URLs, or internal authorization headers.

## Public behavior and independent gates

- Fixture/sample remains the public source.
- No public SportsDataIO schedule, score, odds, prop, or live badge is enabled.
- Edge Intelligence continues using eligible public evidence.
- Edge Trust can consume measured internal evidence while public labels remain
  Fixture until an independently approved future transition.
- Owner approval remains mandatory.
- Licensing, quota, and production infrastructure remain independent blockers.

## Remaining production infrastructure

The repository can run a bounded single-process window with SQLite and a
process-local cache. Multi-day staging or production validation still requires:

- managed PostgreSQL with backups and migration controls;
- shared private cache and distributed request coalescing;
- durable scheduled workers and distributed locks;
- metrics storage, dashboards, and operational alert delivery;
- deployment secret management and rotation;
- provider quota/usage reconciliation;
- approved display, redistribution, fixture-retention, archived-odds, and
  derived-commercial-product rights.
