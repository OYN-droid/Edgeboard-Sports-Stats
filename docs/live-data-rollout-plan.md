# Live-data rollout and expansion plan

No entry below is live or certified today. `Certified candidate` means it has the best existing UI/fixture validation path, not that a provider has passed certification.

## Initial proving group

Keep MLB, WNBA, UFC, and MLS. This set exercises doubleheaders and baseball units, women's basketball overtime/combo props, non-team fight cards and opponent replacement, and three-way/tournament-aware soccer. MLS remains the soccer choice because EdgeBoard already has its Phase 10 adapter/fixtures and North American schedule context; replace it only if the selected contract cannot meet the domain targets while another configured competition can.

Domain sequence uses `F` fixture/shadow, `L` limited-live target, `C` certification target, and `—` deferred.

| Domain | MLB | WNBA | UFC | MLS | Gate |
| --- | --- | --- | --- | --- | --- |
| Entities and schedules | C | C | C | C | stable IDs, reschedule/card-change fixtures, 99%+ accepted records |
| Live status/results | C | C | L→C | C | sequence, finality, delay and outage replay |
| Historical stats | L→C | L→C | L | L→C | declared seasons, units, qualification, corrections |
| Standings | C | C | — | C | stage/tiebreak semantics |
| Injuries/availability | L | L→C | availability flags only | L | confirmation source and status taxonomy |
| Projected lineups | L | L | — | L | visibly projected, never confirmed |
| Confirmed lineups/cards | C | C | C | C | provider confirmation time and change invalidation |
| Core markets | L→C | L→C | L→C | L→C | event/entity/period/scope/book/freshness match |
| Props | L | L | L | L | only provider-confirmed mapped markets |
| Line movement | L | L | L | L | licensed snapshots and ordered history |
| Spatial/advanced visuals | — | — | — | — | explicit specialist license; existing honest unavailable state |
| Stories/Insights | L after stats | L after stats | L after stats | L after stats | structured evidence, coverage wording, correction invalidation |
| Edge Intelligence | L after evidence | L after evidence | L after evidence | L after evidence | citations to normalized rows; unsupported domains disclosed |
| Edge Trust | C first | C first | C first | C first | provenance envelope and domain readiness always present |
| Parlay Builder | L after markets | L after props | L after fight markets | L after soccer markets | mapped settlement/correlation; research only |

Activation sequence per league: fixture contract tests → internal adapter → shadow comparison → entities/schedules limited live → final results/stats → standings/injury/lineup domains → markets → derived research → explicit certification. Domains may remain unavailable while the rest of the league is limited live.

## Expansion order

1. **First certified group:** MLB, WNBA, UFC, MLS (`certified candidate`). Activate the leagues whose season and provider contract can actually be observed; do not wait for all four to promote together.
2. **High-reuse active group:** NBA, NFL, NHL, NCAA football, NCAA men/women basketball (`planned seasonal`, then `limited-live candidate`). Reuse league-specific team/event/stat adapters and market rules; activate near preseason with historical backfill before live polling.
3. **Major soccer:** Premier League, UCL, La Liga, Bundesliga, Serie A, Ligue 1, NWSL, Liga MX (`limited-live candidate` subject to competition rights). Reuse soccer phases, aggregate/advancement rules, three-way markets, transfers and lineups.
4. **Motorsport core:** F1 and NASCAR Cup, then Xfinity/Truck, IndyCar, MotoGP and WRC (`limited-live candidate` for schedules/results; telemetry `licensing review required`). Supercross/Motocross remain `provider gap` until a licensed feed is demonstrated.
5. **Combat expansion:** PFL and ONE (`fixture-ready`, then limited-live); Boxing, BKFC and Glory (`provider gap` / `licensing review required`). Reuse fight-card/bout rules but never infer sport-specific statistics.
6. **Tennis and golf:** ATP/WTA and PGA (`planned`, strong broad-provider candidates); LPGA (`planned`, exact coverage review). Start metadata/schedules/results, then stats/markets, then specialist depth.
7. **International team sports:** EuroLeague, FIBA, BCL, IIHF, SHL, Liiga, Swiss NL, KBO, NPB and CFL (`fixture-ready`; provider coverage confirmation required). Roll out by exact competition, never a generic “international” live flag.
8. **Event competitions:** World Cup, Euros, Copa América, Gold Cup, Nations League, women's internationals, Olympic basketball (`planned event-based` / `licensing review required`). Ingest identities and tournament structure before event activation; suppress polling off-cycle.
9. **Tier 3 registry:** rugby, cricket, volleyball, handball, table tennis, darts, snooker, esports and Olympic sports (`planned`); lacrosse, sailing, horse racing and undifferentiated emerging markets (`provider gap`). A specialty registry entry becomes a specific league/competition before live enablement.

## Rollback

Disable the affected league-domain flag, stop its jobs, serve fresh/stale verified cache only within policy, then show unavailable or explicitly labeled fixture mode. Preserve normalized rows, revisions, mappings, saved snapshots and audit logs. A rollback never converts live/cached values to sample labels or vice versa.
