# Reliable Live Data Ticket 10 — MLB certification and production review

## Decision

MLB is **not ready for owner-approved user-facing live activation**. All 41
reviewed domains remain `fixture_supported`; `shadow` is the recommended next
state. No domain is Limited Live or Certified Live. A successful API response,
fixture test, or adapter test never changes that state automatically.

The blockers are common but must be cleared per domain: retained authorized
live-integration evidence, representative shadow denominators, entitlement and
quota confirmation, commercial display/retention/derived-data rights, and
shared production database/cache/locking/worker/monitoring infrastructure.

## Architecture

`MlbCertificationService` is the single fine-grained certification layer above
the existing provider adapters, broad rollout service, shadow store, provider
manager, Edge Trust, cache, markets, context, and live-state services.

```text
Tickets 2–9 normalized contracts and diagnostics
              ↓
mlb_domain_certification (41 independent domains, versioned criteria)
              ↓
effective state = configured state + provider/league/domain/domain-family controls
              ↓
health-aware source selection (live → labeled stale cache → labeled fixture → unavailable)
              ↓
public coverage / Edge Intelligence / Markets / Parlay / live-score presentation
```

Public consumers receive labels, coverage, limitations, timestamps, and a
coarse health state. Protected endpoints receive all 30 criteria, controls,
blockers, and shadow diagnostics. Credentials, raw payloads, provider IDs,
internal metrics, and stack traces are never public.

## Certification matrix

Every row currently has state `fixture_supported`, provider candidate
`sportsdataio`, unverified entitlement, representative fixture coverage,
fixture Edge Trust, no certification timestamp, certification version
`mlb-ticket10-v1`, and recommended state `shadow`.

| Group | Domains |
| --- | --- |
| Core | League metadata; Teams; Venues; Players; Schedules; Event identity; Event status |
| Statistics | Completed-game results; Batter game logs; Pitcher game logs; Team game logs; Season statistics; Historical summaries |
| League context | Standings; Division standings; Qualified leaderboards; Team records; Rank movement |
| Markets | Sportsbooks; Moneyline; Run line; Totals; Player props; Best available price; Market status; Market movement; Price history |
| Context | Injuries; Roster status; Projected lineups; Confirmed lineups; Probable starters; Weather; Contextual events |
| Live | Live event status; Live score; Inning state; Outs; Live participants; Finalization; Corrections |

The complete machine-readable matrix is available from
`GET /api/certification/mlb`; the protected report is
`GET /api/admin/mlb/certification/status`.

## Criteria

Each domain expands the same 30 required criteria: entitlement, adapter
capability, canonical entity and event reconciliation, response validation,
malformed rows, corrections, duplicates, freshness, cache, stale-if-error,
provenance, Edge Trust, health, rate limits, timeouts, retries, failover,
diagnostics, browser-safe state, regression tests, live integration tests,
shadow discrepancy rate, unresolved mapping rate, rejection rate,
completeness, production monitoring, security, licensing/retention, and
rollback.

Fixture/adapter evidence passes only the technical criteria it actually proves.
Entitlement and live tests are blocked. Shadow, mapping, rejection, and
completeness rates require manual review because representative denominators do
not exist. Monitoring and licensing remain blocked. `not_applicable` is used
only where a contract genuinely has no relevant event or correction lifecycle.

## Promotion and rollback

No check command or health evaluation promotes a domain. A state change uses
the protected endpoint and exact domain confirmation:

```text
SET MLB {DOMAIN_ID} {TARGET_STATE}
```

Limited Live and Certified Live require every applicable criterion to pass.
Shadow requires a configured server-side provider. Demotion remains explicit
and audited. Provider, MLB league, individual domain, market-data, live-event,
and polling controls can be changed independently through protected controls or
deployment environment settings.

Environment kill switches:

- `SPORTS_PROVIDER_KILL_SWITCH`
- `MLB_KILL_SWITCH`
- `MLB_DOMAIN_KILL_SWITCHES`
- `MLB_MARKET_DATA_KILL_SWITCH`
- `MLB_LIVE_EVENT_KILL_SWITCH`
- `MLB_LIVE_POLLING_ENABLED`

## Failover and degraded mode

The source decision returns one complete value and one provenance mode; it does
not merge live and fixture records. Eligible live values are used only for
Limited Live or Certified Live domains with acceptable health. A provider
failure may use a validated stale cache labeled **Delayed**. Otherwise a
permitted fixture is labeled **Fixture**. If neither exists, the result is
**Unavailable**. Unsupported domains never receive a fabricated fallback.

Health is evaluated independently by domain from request count, failures,
timeouts, rate limits, validation rejections, stale-cache use, malformed
payloads, authentication/entitlement failures, and latency. States are
`healthy`, `impaired`, `degraded`, `unavailable`, and `misconfigured`. An
injury outage does not demote schedules; a prop outage does not disable game
odds. Authentication and entitlement failures stop live eligibility rather
than retrying indefinitely.

Internal warning thresholds for failure rate, stale use, rejection rate,
rate-limit pressure, mapping failures, polling-budget exhaustion, correction
spikes, and shadow-discrepancy spikes are environment configurable through the
`MLB_CERT_*_ALERT` settings in `.env.example`. The defaults are conservative
development warnings, not universal certification tolerances; production
thresholds require an owner-approved SLA and representative denominators.

## Public behavior

- Data Coverage renders all 41 MLB domains instead of a single green MLB badge.
- Edge Intelligence uses certified, limited, degraded, unavailable, or fixture
  wording from structured state.
- Live badges require a Limited/Certified live-score domain, an active game,
  fresh state, and acceptable health. Stale state reads **Delayed update**.
- Live market records from an ineligible/degraded/suspended domain are excluded
  from new Parlay Builder candidates. Locked research remains an immutable
  snapshot with a review reason. Fixture markets are never substituted as live.
- Research Quality remains source quality, never betting confidence or
  probability.

## Certification command

```bash
python3 scripts/check_mlb_certification.py
python3 scripts/check_mlb_certification.py --json
```

The command validates every domain and criterion and generates a report. A
successful check says only that the matrix is structurally complete. Promotion
still requires explicit owner approval and evidence.

## Shadow and rate findings

The current database contains no representative Ticket 10 live comparison
window. Discrepancy counts therefore have no defensible rate denominator.
Unresolved mapping, validation rejection, stale/fallback, and completeness
rates are reported as unavailable/manual review—not zero.

SportsDataIO Discovery Lab entitlement and quotas were not verified in this
ticket. Trial behavior must not be extrapolated into commercial request,
burst, or polling budgets. Odds, props, historical backfill, and active-game
polling need separately priced and measured budgets before activation.

## Production and licensing blockers

The current SQLite and process-local cache/locks/history are appropriate for
development, not production certification. Production requires PostgreSQL or
equivalent durable storage, a shared cache, distributed coordination, durable
correction/certification evidence, worker ownership, monitored request and
polling budgets, alert routing, deployment health checks, and tested rollback.

Provider terms must explicitly approve display, attribution, caching, maximum
TTL, normalized retention, historical storage, archived odds, derived
analytics, public redistribution, and any logo/media use for each domain.

## Next-league rollout recommendation

- **WNBA:** repeat schedule/entity/stat/standings first, then injuries and
  lineups, then markets; validate overtime, combo-stat mappings, and roster
  changes independently.
- **MMA/UFC:** start with promotion/card/fighter/bout identity and status;
  preserve replacement-opponent and cancellation invalidation; certify markets
  separately by round and method scope.
- **Soccer:** select one competition; certify regulation status and three-way
  identity before extra time, penalties, aggregates, advancement, cards, or
  corners. Never generalize one competition’s coverage to all soccer.

These are rollout plans only. Ticket 10 does not begin those integrations.
