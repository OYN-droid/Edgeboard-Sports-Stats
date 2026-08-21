# Live-data domain inventory

This inventory defines the target contract. `P` means provider timestamp, retrieval timestamp, source identity, validation timestamp, completeness, warnings, correction revision, and source mode are required on the normalized record or its envelope. Cache values are starting ceilings and must be reduced by provider terms.

| Domain | Current implementation / normalized model | Required fields (plus `P`) | Optional fields | Freshness / history / correction | Cache policy | Edge Trust inputs / affected features |
| --- | --- | --- | --- | --- | --- | --- |
| Sport, league, competition catalog | sports registry; catalog adapters | canonical IDs, names, hierarchy, active dates | region, gender, tier, ruleset | daily; retain season lineage; corrections revisioned | 24h SWR | identity, coverage / navigation, search |
| Schedules | events table and normalized event | event/provider IDs, league/competition, start, status, participants | venue, broadcast, round/stage | 5m active; complete history; reschedules retain identity | 5m, 24h stale-if-error | freshness, identity / games, stories, research |
| Event status and live scores | live status adapter/event revision | event ID, status, score/clock/period, sequence | possession, situation | 5–15s live; final retained; corrections append revision | 8s live | finality, freshness / live board, alerts |
| Participants | event participants/entities | canonical/provider IDs, role, event ID | starter/order/seed | with event; permanent history | event TTL | identity/completeness / every entity-aware feature |
| Athlete/competitor profiles | canonical registry and profile services | canonical/provider ID, type, name, sport | bio, handedness/stance, media ref | 1–24h; effective-dated changes | 1h | identity, source / profiles, search, graph |
| Teams and organizations | canonical entity hierarchy | canonical/provider ID, type, name, competition membership | aliases, colors, parent org | daily; effective-dated lineage | 6h | identity / teams, promotions, constructors |
| Rosters | roster adapter target; DB relationships | team, athlete, role, effective time, status | jersey, position, two-way/designation | 15m in season; season history | 10m | completeness, identity / profiles, research |
| Standings | standings table/adapter | competition, season/stage, entity, rank, played, record | tiebreakers, points deductions | 10m live days/1h otherwise; season history | 10m | coverage/freshness / leaders, stories |
| Injuries and availability | injuries table | entity, status, body area/reason category, effective/update time, confirmation, source | expected return, practice state | 5m pregame; immutable change log | 3m | confirmation, freshness / markets, stories, alerts |
| Projected lineups | lineups table with confirmation flag | event, entity/team, position/order, projected state, source | confidence rationale (non-probability) | 5m pregame; retain revisions | 3m | awaiting confirmation / props, research |
| Confirmed lineups | same model, confirmed state | event, entity/team, position/order, confirmed time/source | formation, batting slot | 30–60s near lock | 30s | confirmation/freshness / props, alerts |
| Depth charts | provider domain, not normalized end-to-end | team, role/position, ordered entities, effective date | package/formational grouping | daily plus official changes; seasonal | 6h | completeness / profile and injury context |
| Historical box scores | stat rows + event finality | event/entity/stat/value/unit/scope, final status, source | period splits, qualifier | post-final + correction checks; target 5–10 years initially | store normalized | historical coverage/finality / stats, insights |
| Game logs | game_logs/stat provider | canonical event/entity, date, opponent, status, stat values | starter, context/splits | after final; same historical target | store normalized | samples, coverage / profiles, comparisons |
| Play-by-play | declared provider domain | event, sequence, period/clock, type, participants, score state | coordinates, qualifiers | 1–5s live; retain only if licensed | 2–5s + store permitted | completeness/freshness / event explorer, visuals |
| Spatial event data | visualization capability model | event/action IDs, coordinate system, units, timestamp, participants | freeze frame/tracking links | live/post-match by product; licensed history | short cache; store only by terms | visualization coverage / charts |
| Fight cards | combat adapter | event/bout IDs, promotion, participants, order, scheduled rounds, status | weight class, title, catchweight | 5m; 30s near fight; full card history | 5m | identity/finality / combat views |
| Fighter records and round stats | profile/stat targets | fighter/bout/round, stat definition, value, result/finality | stance, reach, knockdowns, control | post-round/live if licensed; career history scoped | live 5s; store final | coverage/sample / profiles, insights |
| Driver results and race sessions | motorsport adapter | series/weekend/session/competitor IDs, type, status, start/result | grid, constructor, tyre/weather | 15–60s live; full season history | 15s live | identity/finality / race weekend |
| Lap positions and telemetry | lap/telemetry domains | session, lap/segment, competitor, sequence, units, timestamp | sectors, speed, tyre, GPS | 1–5s; storage contract-specific | stream/very short | freshness/coverage / motorsport visuals |
| Golf events/player stats | golf provider domain | tour/event/round/player IDs, status, score, position | hole/shot/SG data if licensed | 15–60s live; multi-year rounds | 30s live | coverage/finality / golf profiles, leaders |
| Tennis matches/player stats | tennis provider domain | tour/tournament/match/player IDs, sets/games/status | point sequence, surface, serve stats | 5–15s live; multi-year matches | 10s live | coverage/finality / profiles, comparisons |
| Media and logos | media references, fallbacks | asset ID, entity relation, license owner, permitted uses, expiry | crop/credit/alt variants | contract-driven; correction/delete honored | CDN by license | source/rights / cards and profiles |
| Sportsbooks | implicit source fields | canonical book ID, provider book ID, jurisdiction, display name | brand asset under separate rights | daily; effective history | 24h | source agreement / compare books |
| Markets | market catalog + markets table | canonical/provider IDs, event, type, period, scope, book, status | SGP/live/alternate flags | 30–60s pregame; revisions stored if permitted | 30s | availability/source / markets, slip |
| Player props/alternate lines/futures | offers/selections | market + entity, side, line, price, book, status | qualifier/alternate/future horizon | 30–90s; archive only by terms | 30s | identity/freshness / screener, parlays |
| Live odds/suspension | odds snapshots | market/selection/book, price/line, observed/provider time, status/reason | limit indicator if licensed | 2–8s; every transition ordered | 2–5s | freshness/suspension / live markets |
| Archived odds/line movement | odds snapshots/line history | immutable snapshot identity, old/new line/price/status/times | opening/closing designation from source only | licensed depth; provider corrections append | store if licensed | source agreement/correction / explain market |
| Settlement scope | canonical market fields | period, regulation/OT/ET, side, rule version, authority | dead-heat/void clauses | immutable per offer version | with market | completeness / slip, explanations |
| Weather | weather collection | venue/event, observed/forecast time, units, source | wind direction, precipitation, track state | 5–15m; retain event observations | 10m | freshness/source / research impact |
| Historical corrections | corrections service and revisions | provider, target record/field, old/new, reason, effective/received times | upstream ticket/reference | poll 6–24h and on notices; permanent audit | invalidate tags | correction status / all deterministic outputs |

## Source envelope

Ticket 1 formalizes the provider-neutral `ProvenanceEnvelope` in
`server/provider_contracts.py`: `providerId`, optional safe `providerRecordId`, `sourceMode`,
`fetchedAt`, `providerUpdatedAt`, `normalizedAt`, `validatedAt`, `expiresAt`, `freshnessState`,
`completenessState`, `identityConfidence`, `correctionStatus`, `fallbackUsed`, optional
`fallbackProviderId`, `providerAgreementState`, `validationWarnings`, `sourceVersion`, and
`schemaVersion`. Missing optional metadata remains absent and reduces trust where applicable.
Request/cache metadata may wrap the record envelope but cannot replace it.

## Correction fan-out

An event/stat/entity/market correction invalidates cache tags for the source record, canonical entity, event, league, season, derived leaderboard, insight/story candidate, visualization, research session refresh, alert rule, screener result, and market explanation. Saved immutable snapshots remain unchanged and show that newer data exists.
