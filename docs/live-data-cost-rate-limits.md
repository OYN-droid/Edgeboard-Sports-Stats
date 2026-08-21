# Live-data cost and rate-limit plan

Exact vendor quotes are private and unavailable. Categories are relative: low (catalog/final results), medium (active schedules/current stats), high (frequent odds/PBP), and very high (telemetry/spatial or broad historical backfill).

## Usage models

| Stage | Leagues/domains | Operating model | Expected category |
| --- | --- | --- | --- |
| Development | fixtures plus one vendor sandbox, four proving leagues, manual/replay windows | no always-on live polling; shared recorded contract fixtures | low |
| Private beta | 1–4 limited-live leagues, core schedules/results, selected stats/markets | event-aware jobs, 1 odds region, allowlisted books/markets, hard daily budget | low–medium |
| Small public launch | 4 certified/limited leagues, live board, selected props, licensed movement | shared server ingestion independent of user count, Redis cache, active-event budgets | medium–high |
| Moderate public | major seasonal groups, multi-region books, deeper PBP/history | package negotiation, streams/push, tiered cache, backfill windows and capacity alerts | high/enterprise |

## Cost drivers and controls

| Driver | Risk | Required control |
| --- | --- | --- |
| Live odds and player props | credits multiply by sport/event/market/region; event-level prop fan-out | active-event allowlist, one region initially, market allowlist, change-aware persistence, per-league kill switch |
| Historical odds | snapshot queries can cost multiples of current odds and storage may be restricted | backfill manifest, date/market caps, approval and checkpoint, no automatic archive crawl |
| Live score/PBP polling | league-wide polling wastes calls when few events are live | event lifecycle scheduler, push where available, provider minimum cadence, stop after final |
| Telemetry/spatial | very high message/byte volume and premium licensing | separate feature flag/product budget, downsample only if permitted, no default retention |
| Historical stats backfill | seasons × competitions × entities can overwhelm quotas and corrections | bounded season batches, incremental checkpoints, accepted/rejected accounting, off-peak execution |
| Duplicate UI requests | per-user fan-out creates storms | server aggregation, cache, request coalescing; browser never calls vendor |
| Retries/outages | retry storms consume quota during provider failure | jitter, `Retry-After`, circuit breaker, retry budget, stale-if-error |
| Specialty fragmentation | minimum contracts and duplicate calls/IDs | require a measured uncovered domain and total-cost approval before adding provider |

The Odds API publishes response usage headers and credit formulas; store those metrics per request. Data Golf publishes 45 requests/minute, but its public terms are not a commercial license. Sportradar/Stats Perform production rates and pricing are account/quote-specific. SportsDataIO describes unlimited commercial calls, but EdgeBoard must still enforce concurrency and cost/fair-use budgets defined by its agreement.

## Budget guardrails

- Configuration: provider/domain/league enabled flag, calls per minute/hour/day, concurrent calls, expensive-request units, maximum events/markets/regions/history days and monthly soft/hard ceiling.
- Admission: reject or defer nonessential refresh when a budget reaches 80%; stop optional backfills at 90%; at 100%, preserve essential live status within contract or degrade honestly.
- Monitoring: request, returned-market and provider-credit units; cache hit ratio; retry ratio; cost per active event; forecast month end; alert at 50/75/90/100%.
- Isolation: development, staging and production keys/quotas; backfills never share the live critical-path budget.
- Approval: a human must enable a new league, product, region, archive or high-volume domain.
