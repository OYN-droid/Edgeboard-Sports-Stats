# Sport and league provider coverage matrix

Audit date: 2026-08-04. This is a procurement and proof-of-concept matrix, not a claim of subscribed coverage.

## Scoring method

- `3`: official public documentation explicitly identifies the league/product and the domain.
- `2`: official documentation identifies the sport/API family; exact competition/field entitlement must be confirmed in the provider coverage matrix and contract.
- `1`: plausible specialist or global-feed candidate, but public documentation reviewed here is insufficient.
- `0`: no suitable documented product found in this audit.
- `?`: cannot be scored without account access, a sample payload, or a commercial schedule.

Domain vector is `M/S/L/R/E/H/P/I/X/B/A/V`: metadata, schedules, live status, results, entity coverage, historical statistics, play-by-play, injuries, lineups, props, general odds/archive/movement, and spatial/visual data. For compactness, an `E` score is applied independently to athlete/competitor profiles, rosters, and standings unless a row's gap note says otherwise; an `A` score is applied independently to odds, archived odds, and line movement. Participant identity follows `M`; alternate-line and suspension support follow `B/A`. Thus every requested domain receives a score even though repeated equal values are printed once. `SR` Sportradar; `SD` SportsDataIO; `SP` Stats Perform/Opta; `OA` The Odds API; `SM` Sportmonks; `AS` API-Sports. Candidate numbers are fit scores, not data-quality scores.

Every row has these default legal/operational gates: commercial redistribution, retention, derived-stat publication, attribution, media/logo rights, latency/SLA, correction delivery, exact rate limits, and historical depth must be written into the agreement. Expected cost: `E` enterprise/quote, `C` commercial/quote, `S` self-serve published tiers. Reliability: `D` documented commercial/replay tooling exists, `U` unverified for EdgeBoard. Rate: `Q` quote/account-specific, `C` credit-based published, `P` published fixed.

## Team sports

| EdgeBoard league | Preferred candidates | Best documented vector | Betting candidate | Cost / reliability / rate | Current readiness and gaps |
| --- | --- | --- | --- | --- | --- |
| MLB | SR 3, SD 3 | SR `3/3/3/3/3/3/3/3/3/3/2/1` | SR or OA 3 | E/D/Q; OA S/U/C | certified candidate; contract, adapter, archive rights |
| WNBA | SR 3, SD 3 | SR `3/3/3/3/3/3/3/2/3/3/2/1` | SR or OA 3 | E/D/Q | certified candidate; combo props/lineup semantics |
| NBA | SR 3, SD 3 | SR `3/3/3/3/3/3/3/3/3/3/3/1` | SR or OA 3 | E/D/Q | planned seasonal; deep market volume cost |
| NFL | SR 3, SD 3 | SR `3/3/3/3/3/3/3/3/3/3/3/1` | SR or OA 3 | E/D/Q | planned seasonal; injury/depth chart workflow |
| NHL | SR 3, SD 3 | SR `3/3/3/3/3/3/3/3/2/2/3/1` | SR or OA 3 | E/D/Q | planned seasonal; goalie confirmation |
| NCAA Football | SR 3, SD 3 | SR `3/3/3/3/3/3/3/3/2/2/3/1` | SR or OA 3 | E/D/Q | planned seasonal; large entity/reconciliation volume |
| NCAA Men’s Basketball | SR 3, SD 3 | SR `3/3/3/3/3/3/3/3/2/2/3/1` | SR or OA 3 | E/D/Q | planned seasonal; tournament stages |
| NCAA Women’s Basketball | SR 3, SD 3 | SR `3/3/3/3/3/3/3/2/2/2/2/1` | SR/OA 2 | E/D/Q | planned seasonal; props coverage confirmation |
| CFL | SR 2, SD Global 2 | SR `2/2/2/2/2/2/2/2/?/?/2/0` | OA 2 | E/U/Q | fixture-ready; exact competition/domain contract check |
| KBO | SR Global Baseball 2, SD Global 2 | SR `2/2/2/2/2/2/2/2/?/?/2/0` | OA 1 | E/U/Q | provider gap until competition matrix verified |
| NPB | SR Global Baseball 2, SD Global 2 | SR `2/2/2/2/2/2/2/2/?/?/2/0` | OA 1 | E/U/Q | provider gap until competition matrix verified |
| EuroLeague | SR Global Basketball 2, SP 2 | SR `2/2/2/2/2/2/2/2/?/2/2/1` | OA 2 | E/U/Q | limited-live candidate after exact tier check |
| FIBA competitions | SR Global Basketball 2, SP 2 | SR `2/2/2/2/2/2/2/2/?/2/2/1` | OA 1 | E/U/Q | competition-by-competition licensing review |
| Olympic Basketball | SR 2, SP 2 | SR `2/2/2/2/2/2/2/2/?/2/1/1` | OA 1 | E/U/Q | event-rights and seasonal activation review |
| Basketball Champions League | SR Global Basketball 2, SP 2 | SR `2/2/2/2/2/2/2/2/?/2/1/1` | OA 1 | E/U/Q | exact coverage confirmation required |
| IIHF competitions | SR Global Hockey 2, SP 1 | SR `2/2/2/2/2/2/2/2/?/1/1/0` | OA 1 | E/U/Q | event and tournament-stage validation |
| SHL | SR Global Hockey 2, SP 1 | SR `2/2/2/2/2/2/2/2/?/1/1/0` | OA 1 | E/U/Q | exact tier/injury coverage confirmation |
| Liiga | SR Global Hockey 2, SP 1 | SR `2/2/2/2/2/2/2/2/?/1/1/0` | OA 1 | E/U/Q | exact tier/injury coverage confirmation |
| Swiss National League | SR Global Hockey 2, SP 1 | SR `2/2/2/2/2/2/2/2/?/1/1/0` | OA 1 | E/U/Q | exact tier/injury coverage confirmation |

## Soccer

Soccer vectors deliberately remain `2` until the exact competition tier, lineup depth, event detail, historical seasons, and redistribution rights are confirmed in an account/contract. Stats Perform is the spatial/deep-history comparator; API-Sports or Sportmonks can be lower-cost schedule/standings comparators but must pass reliability and rights review.

| Competition | Preferred candidates | Core/data vector | Betting | Cost / reliability / rate | Readiness |
| --- | --- | --- | --- | --- | --- |
| MLS | SR 2, SP 2, SD 2, SM 2, AS 2 | SR `2/2/2/2/2/2/2/2/2/2/2/1` | SR/OA 2 | E/U/Q | certified proving candidate; selected Phase 10 competition |
| NWSL | SR 2, SP 2, SD/SM/AS 1 | SP `2/2/2/2/2/2/2/2/2/2/1/2` | SR/OA 1 | E/U/Q | licensing review; exact domain confirmation |
| Premier League | SR 2, SP 2, SM 2, AS 2 | SP `2/2/2/2/2/2/2/2/2/2/2/3` | SR/OA 3 | E/D/Q | limited-live candidate; premium rights likely |
| UEFA Champions League | SR 2, SP 2, SM 2, AS 2 | SP `2/2/2/2/2/2/2/2/2/2/2/3` | SR/OA 3 | E/D/Q | tournament/aggregate/rights validation |
| La Liga | SR 2, SP 2, SM 2, AS 2 | SP `2/2/2/2/2/2/2/2/2/2/2/3` | SR/OA 3 | E/D/Q | limited-live candidate after contract |
| Bundesliga | SR 2, SP 2, SM 2, AS 2 | SP `2/2/2/2/2/2/2/2/2/2/2/2` | SR/OA 3 | E/D/Q | limited-live candidate after contract |
| Serie A | SR 2, SP 2, SM 2, AS 2 | SP `2/2/2/2/2/2/2/2/2/2/2/2` | SR/OA 3 | E/D/Q | limited-live candidate after contract |
| Ligue 1 | SR 2, SP 2, SM 2, AS 2 | SP `2/2/2/2/2/2/2/2/2/2/2/2` | SR/OA 3 | E/D/Q | limited-live candidate after contract |
| Liga MX | SR 2, SP 2, SM 2, AS 2 | SR `2/2/2/2/2/2/2/2/2/2/2/1` | SR/OA 2 | E/U/Q | regional/provider terms review |
| FIFA World Cup | SR 2, SP 3 | SP `3/3/3/3/3/3/3/3/2/3/3/2` | licensed official feed/contract only | E/D/Q | licensing review required; no automatic activation |
| UEFA European Championship | SR 2, SP 2 | SP `2/2/2/2/2/2/2/2/2/2/2/2` | SR/OA 2 | E/U/Q | event-based planned |
| Copa América | SR 2, SP 2 | SP `2/2/2/2/2/2/2/2/2/2/2/2` | SR/OA 2 | E/U/Q | event-based planned |
| CONCACAF Gold Cup | SR 2, SP 2 | SR `2/2/2/2/2/2/2/2/2/2/2/1` | SR/OA 2 | E/U/Q | event-based planned |
| UEFA Nations League | SR 2, SP 2 | SP `2/2/2/2/2/2/2/2/2/2/2/2` | SR/OA 2 | E/U/Q | event-based planned |
| Women’s International Soccer | SR 2, SP 2 | SP `2/2/2/2/2/2/2/2/2/2/1/2` | SR/OA 1 | E/U/Q | competition IDs must be explicit, not one merged league |

## Combat sports

| Promotion | Preferred candidates | Core/data vector | Betting | Cost / reliability / rate | Readiness |
| --- | --- | --- | --- | --- | --- |
| UFC | SR MMA 2, SD MMA 3 | SD `3/3/2/3/3/3/2/1/?/?/2/0` | SR/OA/SD 2 | C–E/U/Q | certified candidate; bout/card replacement and round stats POC |
| Boxing | SR/Stats Perform 1 | `1/1/1/1/1/1/?/0/0/0/1/0` | OA 1 | E/U/Q | provider gap and licensing review; do not scrape BoxRec |
| PFL | SR MMA 2, SD MMA 2 | `2/2/2/2/2/2/1/1/0/0/1/0` | OA/SR 1 | C–E/U/Q | combat expansion after exact promotion check |
| ONE Championship | SR MMA 2 | `2/2/2/2/2/2/1/1/0/0/1/0` | OA/SR 1 | E/U/Q | mixed rules and event identity validation |
| BKFC | SR/other licensed combat 1 | `1/1/1/1/1/1/?/?/0/0/1/0` | OA 1 | ?/U/? | provider gap; licensing review required |
| Glory Kickboxing | SR/other licensed combat 1 | `1/1/1/1/1/1/?/?/0/0/1/0` | OA 1 | ?/U/? | provider gap; ruleset validation required |

## Motorsports

| Series | Preferred candidates | Core/data vector | Betting | Cost / reliability / rate | Readiness |
| --- | --- | --- | --- | --- | --- |
| Formula 1 | SR 3, SD 3, Sportmonks 2 | SR `3/3/3/3/3/3/2/2/0/0/2/2` | OA/SR 2 | E/D/Q | limited-live candidate; telemetry separately licensed |
| NASCAR Cup Series | SR 3, SD 3 | SR/SD `3/3/3/3/3/3/2/2/0/0/2/1` | SR/OA/SD 2 | C–E/D/Q | limited-live candidate |
| NASCAR Xfinity Series | SR 2, SD 2 | `2/2/2/2/2/2/2/2/0/0/1/1` | SR/OA 1 | C–E/U/Q | exact series/feed entitlement required |
| NASCAR Craftsman Truck Series | SR 2, SD 2 | `2/2/2/2/2/2/2/2/0/0/1/1` | SR/OA 1 | C–E/U/Q | exact series/feed entitlement required |
| IndyCar | SR 3 | `3/3/3/3/3/3/2/2/0/0/1/2` | OA/SR 1 | E/D/Q | motorsport expansion; telemetry contract-specific |
| MotoGP | SR 3 | `3/3/3/3/3/3/2/2/0/0/1/2` | OA/SR 1 | E/D/Q | motorsport expansion; official timing rights review |
| Supercross | global/specialist 1 | `1/1/1/1/1/1/?/?/0/0/1/0` | OA 1 | ?/U/? | provider gap |
| Motocross | global/specialist 1 | `1/1/1/1/1/1/?/?/0/0/1/0` | OA 1 | ?/U/? | provider gap |
| WRC | SR Rally 3 | `3/3/3/3/3/3/2/2/0/0/1/2` | OA/SR 1 | E/D/Q | expansion candidate; stage/telemetry terms |

## Tennis, golf, and specialty registry entries

| League/sport | Candidates | Best vector | Betting | Cost/rate | Readiness |
| --- | --- | --- | --- | --- | --- |
| ATP | SR Tennis 3, SP 2 | SR `3/3/3/3/3/3/3/2/1/0/3/1` | SR/OA 3 | E/Q | planned after team sports |
| WTA | SR Tennis 3, SP 3 | SR/SP `3/3/3/3/3/3/3/2/1/0/3/1` | SR/OA 3 | E/Q | planned after ATP identity POC |
| PGA Tour | SR Golf 3, SD Golf 3, Data Golf 2 | SR `3/3/3/3/3/3/3/2/0/0/3/2` | SR/OA/Data Golf 2 | C–E/Q; DG 45 rpm | limited-live candidate; shot-level terms critical |
| LPGA | SR Golf 2, SP 2 | `2/2/2/2/2/2/2/1/0/0/2/1` | OA 1 | E/Q | exact tour and historical entitlement required |
| Rugby | SR 3, SP 2, AS 2 | `3/3/3/3/3/2/2/2/1/1/2/1` | OA/SR 2 | E/Q | fixture-ready/planned |
| Cricket | SR 3, SP 2 | `3/3/3/3/3/2/2/2/1/1/2/1` | OA/SR 2 | E/Q | fixture-ready/planned |
| Lacrosse | global provider 1 | `1/1/1/1/1/1/?/?/?/?/1/0` | OA 1 | ? | provider gap |
| Volleyball | SR 3, AS 2 | `3/3/3/3/3/2/2/2/?/?/2/0` | OA/SR 2 | E/Q | planned |
| Handball | SR 3, AS 2 | `3/3/3/3/3/2/2/2/?/?/2/0` | OA/SR 2 | E/Q | planned |
| Table Tennis | SR 3 | `3/3/3/3/3/2/2/2/0/0/2/0` | OA/SR 2 | E/Q | planned |
| Darts | SR 3 | `3/3/3/3/3/2/2/2/0/0/2/0` | OA/SR 2 | E/Q | planned |
| Snooker | SR 3 | `3/3/3/3/3/2/2/2/0/0/2/0` | OA/SR 2 | E/Q | planned |
| Sailing | specialist 1 | `1/1/1/1/1/1/?/?/0/0/1/1` | OA 1 | ? | provider gap |
| Horse Racing | specialist required | `1/1/1/1/1/1/?/?/0/0/2/1` | specialist | ? | licensing review required |
| Esports | SR/global 2 | `2/2/2/2/2/1/1/1/0/0/2/0` | OA/SR 2 | E/Q | planned, title-specific identities |
| Olympic Sports | SR Olympics/general 2 | `2/2/2/2/2/1/1/1/0/0/1/0` | contract-specific | E/Q | event-based licensing review |
| Emerging Markets | none predetermined | `?/ ?/ ?/ ?/ ?/ ?/ ?/ ?/ ?/ ?/ ?/ ?` | none predetermined | ? | provider gap until a sport is explicitly configured |

## Interpretation

Public product lists verify that an API family exists; they do not verify the exact fields, live latency, historical seasons, bookmaker set, publication rights, or EdgeBoard use. A row cannot move beyond `fixture-ready` until contract exhibits, real/scrambled sample payloads, correction behavior, and rate limits are recorded as certification evidence.
