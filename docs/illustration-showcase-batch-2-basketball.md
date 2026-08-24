# EdgeBoard Basketball Illustration Showcase — Batch 2

## NBA production state (2026-08-14)

The NBA manifest and all five production batches use `edgeboard-illustration-v1`. These remain replaceable editorial assignments (`showcaseRole: team_representative`), not best-player claims. All twenty-nine production sources were human-approved, verified for real alpha, exported deterministically to the canonical 640 × 800 targets, technically validated, and activated without changing Stephen Curry.

- Teams and representatives: 30/30
- Unique canonical athlete IDs: 30/30
- Approved exact portraits: 30/30 (Stephen Curry + Batches 1–5)
- Awaiting asset: 0/30
- Fallback coverage: 30/30
- Production batches: 5 (6, 6, 6, 6, 5)
- Production prompts retained: 29/29
- Style: `edgeboard-illustration-v1`
- Mode/variant: `standard` / `portrait`
- Production format: 640 × 800, 8-bit RGBA, non-interlaced PNG with meaningful alpha transparency

The machine-readable authority is [basketball-illustration-showcase-batch-2.js](../tools/illustration-qa/basketball-illustration-showcase-batch-2.js). Every pending row includes its complete one-at-a-time production prompt, controlled pose variation, batch/order, canonical mapping, unique target, and fallback metadata.

## Representative audit

| Team | Representative | Canonical athlete ID | Exact status | Fallback now | Batch | Target | Concern |
|---|---|---|---|---|---:|---|---|
| Atlanta Hawks | Jalen Johnson | `nba-jalen-johnson` | approved/active | exact | 2 | `assets/illustrations/nba/edgeboard--nba-jalen-johnson--portrait--v01.png` | none |
| Boston Celtics | Jayson Tatum | `nba-jayson-tatum` | approved/active | exact | 1 | `assets/illustrations/nba/edgeboard--nba-jayson-tatum--portrait--v01.png` | none |
| Brooklyn Nets | Julius Randle | `nba-julius-randle` | approved/active | exact | 2 | `assets/illustrations/nba/edgeboard--nba-julius-randle--portrait--v01.png` | none |
| Charlotte Hornets | Brandon Miller | `nba-brandon-miller` | approved/active | exact | 2 | `assets/illustrations/nba/edgeboard--nba-brandon-miller--portrait--v01.png` | final clean source |
| Chicago Bulls | Josh Giddey | `nba-josh-giddey` | approved/active | exact | 3 | `assets/illustrations/nba/edgeboard--nba-josh-giddey--portrait--v01.png` | none |
| Cleveland Cavaliers | Donovan Mitchell | `nba-donovan-mitchell` | approved/active | exact | 2 | `assets/illustrations/nba/edgeboard--nba-donovan-mitchell--portrait--v01.png` | none |
| Dallas Mavericks | Cooper Flagg | `nba-cooper-flagg` | approved/active | exact | 2 | `assets/illustrations/nba/edgeboard--nba-cooper-flagg--portrait--v01.png` | final reference-based source |
| Denver Nuggets | Nikola Jokic | `nba-nikola-jokic` | approved/active | exact | 1 | `assets/illustrations/nba/edgeboard--nba-nikola-jokic--portrait--v01.png` | final corrected source |
| Detroit Pistons | Cade Cunningham | `nba-cade-cunningham` | approved/active | exact | 3 | `assets/illustrations/nba/edgeboard--nba-cade-cunningham--portrait--v01.png` | none |
| Golden State Warriors | Stephen Curry | `nba-stephen-curry` | approved/active | exact | — | `assets/illustrations/proof/edgeboard--nba-stephen-curry--portrait--v01.png` | existing asset unchanged |
| Houston Rockets | Kevin Durant | `nba-kevin-durant` | approved/active | exact | 3 | `assets/illustrations/nba/edgeboard--nba-kevin-durant--portrait--v01.png` | none |
| Indiana Pacers | Tyrese Haliburton | `nba-tyrese-haliburton` | approved/active | exact | 4 | `assets/illustrations/nba/edgeboard--nba-tyrese-haliburton--portrait--v01.png` | final smiling source |
| LA Clippers | Kawhi Leonard | `nba-kawhi-leonard` | approved/active | exact | 3 | `assets/illustrations/nba/edgeboard--nba-kawhi-leonard--portrait--v01.png` | none |
| Los Angeles Lakers | Luka Doncic | `nba-luka-doncic` | approved/active | exact | 4 | `assets/illustrations/nba/edgeboard--nba-luka-doncic--portrait--v01.png` | final tattoo-free source |
| Memphis Grizzlies | Ja Morant | `nba-ja-morant` | approved/active | exact | 3 | `assets/illustrations/nba/edgeboard--nba-ja-morant--portrait--v01.png` | none |
| Miami Heat | Bam Adebayo | `nba-bam-adebayo` | approved/active | exact | 2 | `assets/illustrations/nba/edgeboard--nba-bam-adebayo--portrait--v01.png` | none |
| Milwaukee Bucks | Tyler Herro | `nba-tyler-herro` | approved/active | exact | 4 | `assets/illustrations/nba/edgeboard--nba-tyler-herro--portrait--v01.png` | final buzz-cut/fade source |
| Minnesota Timberwolves | Anthony Edwards | `nba-anthony-edwards` | approved/active | exact | 1 | `assets/illustrations/nba/edgeboard--nba-anthony-edwards--portrait--v01.png` | none |
| New Orleans Pelicans | Zion Williamson | `nba-zion-williamson` | approved/active | exact | 4 | `assets/illustrations/nba/edgeboard--nba-zion-williamson--portrait--v01.png` | none |
| New York Knicks | Jalen Brunson | `nba-jalen-brunson` | approved/active | exact | 1 | `assets/illustrations/nba/edgeboard--nba-jalen-brunson--portrait--v01.png` | none |
| Oklahoma City Thunder | Shai Gilgeous-Alexander | `nba-shai-gilgeous-alexander` | approved/active | exact | 4 | `assets/illustrations/nba/edgeboard--nba-shai-gilgeous-alexander--portrait--v01.png` | none |
| Orlando Magic | Paolo Banchero | `nba-paolo-banchero` | approved/active | exact | 3 | `assets/illustrations/nba/edgeboard--nba-paolo-banchero--portrait--v01.png` | none |
| Philadelphia 76ers | Tyrese Maxey | `nba-tyrese-maxey` | approved/active | exact | 5 | `assets/illustrations/nba/edgeboard--nba-tyrese-maxey--portrait--v01.png` | final braided-back, smiling source |
| Phoenix Suns | Devin Booker | `nba-devin-booker` | approved/active | exact | 4 | `assets/illustrations/nba/edgeboard--nba-devin-booker--portrait--v01.png` | none |
| Portland Trail Blazers | Damian Lillard | `nba-damian-lillard` | approved/active | exact | 5 | `assets/illustrations/nba/edgeboard--nba-damian-lillard--portrait--v01.png` | final Portland source |
| Sacramento Kings | Keegan Murray | `nba-keegan-murray` | approved/active | exact | 1 | `assets/illustrations/nba/edgeboard--nba-keegan-murray--portrait--v01.png` | replaces released DeMar DeRozan |
| San Antonio Spurs | Victor Wembanyama | `nba-victor-wembanyama` | approved/active | exact | 1 | `assets/illustrations/nba/edgeboard--nba-victor-wembanyama--portrait--v01.png` | final short-haired source |
| Toronto Raptors | Scottie Barnes | `nba-scottie-barnes` | approved/active | exact | 5 | `assets/illustrations/nba/edgeboard--nba-scottie-barnes--portrait--v01.png` | none |
| Utah Jazz | Lauri Markkanen | `nba-lauri-markkanen` | approved/active | exact | 5 | `assets/illustrations/nba/edgeboard--nba-lauri-markkanen--portrait--v01.png` | none |
| Washington Wizards | Trae Young | `nba-trae-young` | approved/active | exact | 5 | `assets/illustrations/nba/edgeboard--nba-trae-young--portrait--v01.png` | final tattoo-free Washington source |

All rows have complete prompt readiness. The `Concern` column records only confirmed production-relevant issues; routine revalidation is still required immediately before generation.

## Representative correction

Sacramento changed from DeMar DeRozan to Keegan Murray. Official NBA reporting states that Sacramento released DeRozan on 2026-07-06, while the official Keegan Murray profile identifies him with Sacramento. The new public canonical athlete is `nba-keegan-murray`; DeRozan's existing identity is preserved and was not repurposed. The pending target changes from `assets/illustrations/nba/edgeboard--nba-demar-derozan--portrait--v01.png` to `assets/illustrations/nba/edgeboard--nba-keegan-murray--portrait--v01.png`. This is an editorial showcase-role change, not a deletion or claim about player quality.

## Deterministic batches

1. Jayson Tatum; Nikola Jokic; Anthony Edwards; Victor Wembanyama; Jalen Brunson; Keegan Murray
2. Jalen Johnson; Julius Randle; Brandon Miller; Donovan Mitchell; Cooper Flagg; Bam Adebayo
3. Josh Giddey; Cade Cunningham; Kevin Durant; Kawhi Leonard; Ja Morant; Paolo Banchero
4. Tyrese Haliburton; Luka Doncic; Tyler Herro; Zion Williamson; Shai Gilgeous-Alexander; Devin Booker
5. Tyrese Maxey; Damian Lillard; Scottie Barnes; Lauri Markkanen; Trae Young

The sequence mixes positions, builds, hair/facial-hair treatments, expressions, and team palettes. Curry is excluded because his exact portrait is already approved.

## Production and fallback contract

Batch 1 through Batch 5 portraits are `productionStatus: approved`, `reviewStatus: approved`, and registry-active. Standard portraits prohibit balls and action poses. Athlete-specific accessories are included only when verified and useful within the crop. Tyrese Maxey replaces LeBron James only in the mutable Philadelphia `team_representative` showcase role; LeBron's canonical identity remains unchanged and no LeBron production portrait was created.

Resolution remains:

```text
approved exact athlete → team fallback → generic basketball fallback → neutral fallback
```

## WNBA scope

The existing 15-team WNBA planning state is unchanged by the NBA readiness pass, including its existing paths, statuses, prompts, and fallbacks.

## Validation

```bash
python3 scripts/validate_nba_illustration_readiness.py
python3 scripts/validate_nba_illustration_batch_1.py
python3 scripts/validate_nba_illustration_batch_2.py
python3 scripts/validate_nba_illustration_batch_3.py
python3 scripts/validate_nba_illustration_batch_4.py
python3 scripts/report_basketball_showcase_batch_2.py
python3 scripts/report_illustration_coverage.py
python3 scripts/validate_illustration_style_proof.py
```

The readiness and completion validators check the 30-team canonical roster, uniqueness, assignment synchronization, unique target contract, batch membership, prompt contract, fallback chain, and all thirty exact activations. The Batch 1 through Batch 5 validators independently verify source preservation, production hashes, alpha, PNG decoding, canonical mappings, approval metadata, and registry activation.
