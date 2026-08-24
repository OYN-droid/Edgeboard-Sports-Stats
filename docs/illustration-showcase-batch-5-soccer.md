# Illustration Showcase Batch 5 — Soccer

Batch 5 is a portrait-first production plan for the eight Tier 1 club competitions currently configured in EdgeBoard: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, MLS, NWSL, and Liga MX. The complete configured club universe is about 160 clubs, which is too large for a responsible first asset batch. This wave therefore prepares 40 canonical slots—five clubs per competition—and records the remaining 120 clubs as production backlog.

The role `team_representative` is a replaceable editorial assignment. It is not a claim that an athlete is the club's best player, and it does not alter canonical athlete identity.

## Architecture

- `src/config/sports-registry.js` remains the authority for supported competition IDs and priority tiers.
- `tools/illustration-qa/soccer-illustration-showcase-batch-5.js` owns the 40-slot production manifest, portrait prompts, deferred action prompts, planned asset paths, and validation.
- `src/data/canonical-entities.js` owns canonical athlete and club identity. Effective-dated showcase selection stays separate.
- `tools/illustration-qa/showcase-illustration-registry.js` records the replaceable assignments.
- `src/config/illustration-registry.js` activates only existing club, competition, sport, and neutral fallback assets. Planned portraits remain inactive until reviewed files exist.
- `scripts/report_soccer_showcase_batch_5.py` provides the focused coverage and missing-asset report.

## Production-wave coverage

| Competition | Configured tier | Estimated clubs | Batch 5 assigned | Remaining backlog |
| --- | ---: | ---: | ---: | ---: |
| Premier League | 1 | 20 | 5 | 15 |
| La Liga | 1 | 20 | 5 | 15 |
| Bundesliga | 1 | 18 | 5 | 13 |
| Serie A | 1 | 20 | 5 | 15 |
| Ligue 1 | 1 | 18 | 5 | 13 |
| MLS | 1 | 30 | 5 | 25 |
| NWSL | 1 | 16 | 5 | 11 |
| Liga MX | 1 | 18 | 5 | 13 |
| Total | — | 160 | 40 | 120 |

Counts are a production-planning snapshot, not a permanent league-format rule. Expansion, promotion, relegation, and roster changes require a new effective-dated coverage review.

## Representatives

| Competition | Club | Canonical club ID | Representative | Canonical athlete ID | Position |
| --- | --- | --- | --- | --- | --- |
| Premier League | Arsenal | `EPL-ARS` | Bukayo Saka | `epl-bukayo-saka` | Winger |
| Premier League | Manchester City | `EPL-MCI` | Erling Haaland | `epl-erling-haaland` | Forward |
| Premier League | Liverpool | `EPL-LIV` | Florian Wirtz | `epl-florian-wirtz` | Attacking midfielder |
| Premier League | Chelsea | `EPL-CHE` | Cole Palmer | `epl-cole-palmer` | Attacking midfielder |
| Premier League | Manchester United | `EPL-MUN` | Bruno Fernandes | `epl-bruno-fernandes` | Midfielder |
| La Liga | FC Barcelona | `LALIGA-BAR` | Lamine Yamal | `la-liga-lamine-yamal` | Winger |
| La Liga | Real Madrid | `LALIGA-RMA` | Kylian Mbappé | `la-liga-kylian-mbappe` | Forward |
| La Liga | Atlético de Madrid | `LALIGA-ATM` | Julián Álvarez | `la-liga-julian-alvarez` | Forward |
| La Liga | Athletic Club | `LALIGA-ATH` | Nico Williams | `la-liga-nico-williams` | Winger |
| La Liga | Real Sociedad | `LALIGA-RSO` | Mikel Oyarzabal | `la-liga-mikel-oyarzabal` | Forward |
| Bundesliga | FC Bayern München | `BUN-BAY` | Harry Kane | `bundesliga-harry-kane` | Forward |
| Bundesliga | Borussia Dortmund | `BUN-BVB` | Serhou Guirassy | `bundesliga-serhou-guirassy` | Forward |
| Bundesliga | Bayer 04 Leverkusen | `BUN-B04` | Alejandro Grimaldo | `bundesliga-alejandro-grimaldo` | Wing-back |
| Bundesliga | RB Leipzig | `BUN-RBL` | David Raum | `bundesliga-david-raum` | Left-back |
| Bundesliga | Eintracht Frankfurt | `BUN-SGE` | Mario Götze | `bundesliga-mario-gotze` | Attacking midfielder |
| Serie A | Inter | `SEA-INT` | Lautaro Martínez | `serie-a-lautaro-martinez` | Forward |
| Serie A | Juventus | `SEA-JUV` | Kenan Yıldız | `serie-a-kenan-yildiz` | Forward |
| Serie A | AC Milan | `SEA-MIL` | Rafael Leão | `serie-a-rafael-leao` | Winger |
| Serie A | Napoli | `SEA-NAP` | Scott McTominay | `serie-a-scott-mctominay` | Midfielder |
| Serie A | AS Roma | `SEA-ROM` | Mile Svilar | `serie-a-mile-svilar` | Goalkeeper |
| Ligue 1 | Paris Saint-Germain | `L1-PSG` | Ousmane Dembélé | `ligue-1-ousmane-dembele` | Forward |
| Ligue 1 | Olympique de Marseille | `L1-OM` | Mason Greenwood | `ligue-1-mason-greenwood` | Forward |
| Ligue 1 | AS Monaco | `L1-ASM` | Maghnes Akliouche | `ligue-1-maghnes-akliouche` | Attacking midfielder |
| Ligue 1 | Olympique Lyonnais | `L1-OL` | Corentin Tolisso | `ligue-1-corentin-tolisso` | Midfielder |
| Ligue 1 | LOSC Lille | `L1-LOSC` | Olivier Giroud | `ligue-1-olivier-giroud` | Forward |
| MLS | Inter Miami CF | `MIA` | Lionel Messi | `mls-lionel-messi` | Forward |
| MLS | Los Angeles Football Club | `MLS-LAFC` | Son Heung-min | `mls-son-heung-min` | Forward |
| MLS | Atlanta United | `MLS-ATL` | Miguel Almirón | `mls-miguel-almiron` | Attacking midfielder |
| MLS | FC Cincinnati | `MLS-CIN` | Evander | `mls-evander` | Midfielder |
| MLS | Vancouver Whitecaps FC | `MLS-VAN` | Thomas Müller | `mls-thomas-muller` | Forward |
| NWSL | Kansas City Current | `NWSL-KC` | Temwa Chawinga | `nwsl-temwa-chawinga` | Forward |
| NWSL | Washington Spirit | `NWSL-WAS` | Trinity Rodman | `nwsl-trinity-rodman` | Forward |
| NWSL | Orlando Pride | `NWSL-ORL` | Barbra Banda | `nwsl-barbra-banda` | Forward |
| NWSL | Portland Thorns FC | `NWSL-POR` | Sophia Wilson | `nwsl-sophia-wilson` | Forward |
| NWSL | Gotham FC | `NWSL-GFC` | Rose Lavelle | `nwsl-rose-lavelle` | Midfielder |
| Liga MX | Club América | `LMX-AME` | Henry Martín | `liga-mx-henry-martin` | Forward |
| Liga MX | Guadalajara | `LMX-CHV` | Roberto Alvarado | `liga-mx-roberto-alvarado` | Winger |
| Liga MX | Cruz Azul | `LMX-CAZ` | Carlos Rodríguez | `liga-mx-carlos-rodriguez` | Midfielder |
| Liga MX | Monterrey | `LMX-MTY` | Sergio Canales | `liga-mx-sergio-canales` | Midfielder |
| Liga MX | Tigres UANL | `LMX-TIG` | Ángel Correa | `liga-mx-angel-correa` | Forward |

## Production and fallback behavior

Portrait prompts are ready for all 40 slots and inherit `docs/illustration-style-lock.md`. Optional dribbling, striking, passing, and goalkeeper action descriptions are present but remain `deferred_until_all_batch_5_portraits_complete`. No image was generated, downloaded, copied, or activated.

Runtime resolution is deterministic:

1. exact canonical athlete art
2. canonical club fallback
3. configured competition fallback
4. generic soccer fallback
5. neutral EdgeBoard placeholder

Run `python3 scripts/report_soccer_showcase_batch_5.py` for the canonical mapping, prompt, assignment, registry, fallback, and backlog report.
