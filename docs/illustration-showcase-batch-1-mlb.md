# EdgeBoard Illustration Showcase — Batch 1 MLB

Status: **30/30 production slots prepared; 30 approved exact portraits; MLB production complete**
Effective selection date: **2026-08-09**
Coverage target: **30 current MLB teams / 30 replaceable team representatives**

## Purpose and selection policy

This batch prepares one recognizable current player slot per MLB team for original EdgeBoard portrait production. `team_representative` is an editorial showcase role, not a “best player,” ranking, performance, value, or betting claim. An assignment may be ended and replaced without changing the canonical identity of either athlete.

Team membership was checked against the official MLB 2026 team directory and official 40-man roster endpoints on the effective date. Rosters are time-sensitive. Revalidate a slot immediately before artwork generation and retain the prior effective-dated assignment when a player changes teams.

No provider ID is an asset key. Bare abbreviations collide across EdgeBoard sports (`KC`, `MIA`, `TOR`, `COL`, and `PHI`, for example), so new MLB team identities use league-qualified IDs such as `MLB-KC`. The existing `NYY`, `LAD`, `NYM`, and `DET` identities remain in place because current provider fixtures depend on them; this batch does not rewrite those contracts.

## Batch roster

| Team ID | Team | Athlete ID | Representative | Position |
| --- | --- | --- | --- | --- |
| `MLB-ATH` | Athletics | `mlb-brent-rooker` | Brent Rooker | Designated hitter |
| `MLB-PIT` | Pittsburgh Pirates | `mlb-paul-skenes` | Paul Skenes | Pitcher |
| `MLB-SD` | San Diego Padres | `mlb-fernando-tatis-jr` | Fernando Tatis Jr. | Outfielder |
| `MLB-SEA` | Seattle Mariners | `mlb-cal-raleigh` | Cal Raleigh | Catcher |
| `MLB-SF` | San Francisco Giants | `mlb-rafael-devers` | Rafael Devers | First baseman |
| `MLB-STL` | St. Louis Cardinals | `mlb-masyn-winn` | Masyn Winn | Shortstop |
| `MLB-TB` | Tampa Bay Rays | `mlb-junior-caminero` | Junior Caminero | Third baseman |
| `MLB-TEX` | Texas Rangers | `mlb-corey-seager` | Corey Seager | Shortstop |
| `MLB-TOR` | Toronto Blue Jays | `mlb-vladimir-guerrero-jr` | Vladimir Guerrero Jr. | First baseman |
| `MLB-MIN` | Minnesota Twins | `mlb-byron-buxton` | Byron Buxton | Outfielder |
| `MLB-PHI` | Philadelphia Phillies | `mlb-bryce-harper` | Bryce Harper | First baseman |
| `MLB-ATL` | Atlanta Braves | `mlb-ronald-acuna-jr` | Ronald Acuña Jr. | Outfielder |
| `MLB-CWS` | Chicago White Sox | `mlb-munetaka-murakami` | Munetaka Murakami | First baseman |
| `MLB-MIA` | Miami Marlins | `mlb-sandy-alcantara` | Sandy Alcantara | Pitcher |
| `NYY` | New York Yankees | `mlb-aaron-judge` | Aaron Judge | Outfielder |
| `MLB-MIL` | Milwaukee Brewers | `mlb-christian-yelich` | Christian Yelich | Designated hitter |
| `MLB-LAA` | Los Angeles Angels | `mlb-mike-trout` | Mike Trout | Outfielder |
| `MLB-AZ` | Arizona Diamondbacks | `mlb-corbin-carroll` | Corbin Carroll | Outfielder |
| `MLB-BAL` | Baltimore Orioles | `mlb-gunnar-henderson` | Gunnar Henderson | Shortstop |
| `MLB-BOS` | Boston Red Sox | `mlb-garrett-crochet` | Garrett Crochet | Pitcher |
| `MLB-CHC` | Chicago Cubs | `mlb-pete-crow-armstrong` | Pete Crow-Armstrong | Outfielder |
| `MLB-CIN` | Cincinnati Reds | `mlb-elly-de-la-cruz` | Elly De La Cruz | Shortstop |
| `MLB-CLE` | Cleveland Guardians | `mlb-jose-ramirez` | José Ramírez | Third baseman |
| `MLB-COL` | Colorado Rockies | `mlb-ezequiel-tovar` | Ezequiel Tovar | Shortstop |
| `DET` | Detroit Tigers | `mlb-riley-greene` | Riley Greene | Outfielder |
| `MLB-HOU` | Houston Astros | `mlb-jose-altuve` | José Altuve | Second baseman |
| `MLB-KC` | Kansas City Royals | `mlb-bobby-witt-jr` | Bobby Witt Jr. | Shortstop |
| `LAD` | Los Angeles Dodgers | `mlb-shohei-ohtani` | Shohei Ohtani | Two-way player |
| `MLB-WSH` | Washington Nationals | `mlb-james-wood` | James Wood | Outfielder |
| `NYM` | New York Mets | `mlb-juan-soto` | Juan Soto | Outfielder |

## Production manifest

The machine-readable source is `src/config/mlb-illustration-showcase-batch-1.js`. Every exported slot contains:

- canonical athlete and team IDs
- display names and position
- `showcaseRole: team_representative`
- effective date and roster-verification metadata
- exact transparent PNG portrait target and deferred action path
- `productionStatus` and `reviewStatus` (`approved` for all 30 canonical representatives after technical validation and explicit human approval)
- original-source classification
- current fallback chain and registry IDs
- a consistent locked-style portrait prompt
- an optional position-aware action prompt
- an active existing Judge registry record or a planned, inactive registry draft

The 29 non-proof portraits use the single canonical target convention:

```text
assets/illustrations/mlb/edgeboard--[canonical-athlete-id]--portrait--v01.png
```

Aaron Judge continues to use the already-approved proof path and registry ID `art-mlb-aaron-judge-portrait`; no second Yankees target or registry record is created. Production Batches 1 through 4 have each supplied, technically validated, human-approved, and activated six additional portraits. Batch 5 activates Masyn Winn, James Wood, Ezequiel Tovar, Riley Greene, and Juan Soto. Every active portrait uses lossless PNG, exact 640×800 dimensions, 8-bit RGBA, meaningful alpha transparency, portrait variant, and `edgeboard-illustration-v1`.

Batch 1 export provenance—including preserved source paths, source and export dimensions, scale, offsets, byte sizes, SHA-256 values, review state, and export method—is recorded in `docs/assets/illustration-style/edgeboard-mlb-illustration-batch-1-exports.json`.

Batch 2 export provenance is recorded independently in `docs/assets/illustration-style/edgeboard-mlb-illustration-batch-2-exports.json`. It documents the final non-action Bryce Harper source and final forward-facing Fernando Tatis Jr. source; discarded experimental/action variants were not ingested.

Batch 2 activates Brent Rooker, Bryce Harper, Garrett Crochet, Fernando Tatis Jr., Bobby Witt Jr., and Sandy Alcantara. Validate the physical exports, preserved sources, canonical mappings, final-source decisions, review metadata, and active registry rows with:

```bash
python3 scripts/validate_mlb_illustration_batch_2.py
```

Batch 3 export provenance is recorded independently in `docs/assets/illustration-style/edgeboard-mlb-illustration-batch-3-exports.json`. Batch 3 activates Vladimir Guerrero Jr., Gunnar Henderson, Corbin Carroll, Corey Seager, José Altuve, and Pete Crow-Armstrong. Validate the physical exports, preserved sources, canonical mappings, review metadata, and active registry rows with:

```bash
python3 scripts/validate_mlb_illustration_batch_3.py
```

Batch 4 export provenance is recorded independently in `docs/assets/illustration-style/edgeboard-mlb-illustration-batch-4-exports.json`. Batch 4 activates Rafael Devers, Mike Trout, Christian Yelich, Byron Buxton, Junior Caminero, and Munetaka Murakami. Validate the physical exports, preserved sources, canonical mappings, review metadata, and active registry rows with:

```bash
python3 scripts/validate_mlb_illustration_batch_4.py
```

Batch 5 export provenance is recorded in `docs/assets/illustration-style/edgeboard-mlb-illustration-batch-5-exports.json`. All five final sources have recorded source hashes, deterministic export metadata, technical validation, and human visual approval. The initial Ezequiel Tovar, Riley Greene, and Juan Soto candidates were rejected because they contained opaque checkerboard pixels. Their human-approved replacement sources contain genuine alpha and passed the unchanged transparent-PNG gate; all five Batch 5 portraits are now active. EdgeBoard did not remove or fabricate backgrounds.

```bash
python3 scripts/validate_mlb_illustration_batch_5.py
```

## Recommended production order

The batches intentionally mix divisions, positions, silhouettes, uniform color families, skin tones, hair, and facial-hair treatments so Style v1 drift can be caught before league-wide production continues.

| Batch | Count | Representatives |
| --- | ---: | --- |
| 1 | 6 | Paul Skenes (PIT), Cal Raleigh (SEA), Elly De La Cruz (CIN), Shohei Ohtani (LAD), Ronald Acuña Jr. (ATL), José Ramírez (CLE) — **6/6 approved and active** |
| 2 | 6 | Brent Rooker (ATH), Bryce Harper (PHI), Garrett Crochet (BOS), Fernando Tatis Jr. (SD), Bobby Witt Jr. (KC), Sandy Alcantara (MIA) — **6/6 approved and active** |
| 3 | 6 | Vladimir Guerrero Jr. (TOR), Gunnar Henderson (BAL), Corbin Carroll (AZ), Corey Seager (TEX), José Altuve (HOU), Pete Crow-Armstrong (CHC) — **6/6 approved and active** |
| 4 | 6 | Rafael Devers (SF), Mike Trout (LAA), Christian Yelich (MIL), Byron Buxton (MIN), Junior Caminero (TB), Munetaka Murakami (CWS) — **6/6 approved and active** |
| 5 | 5 | Masyn Winn (STL), James Wood (WSH), Ezequiel Tovar (COL), Riley Greene (DET), and Juan Soto (NYM) — **5/5 approved and active** |

Aaron Judge is complete and intentionally excluded from these five production batches. Batches 1 through 4 are each complete at 6/6 physical, 6/6 technically valid, 6/6 human approved, and 6/6 registry active. Batch 5 is complete at 5/5 physical, 5/5 technically valid, 5/5 human approved, and 5/5 registry active.

## Standard portrait mode and controlled diversity

Primary prompts use `portraitMode: standard`: a non-action chest/upper-torso athlete portrait, centered or near-centered, with the full head and shoulders visible, a natural posture, consistent apparent scale, and a clean transparent background. The collection may vary gaze, mild head turn, expression, hair, facial hair, and restrained subject-specific accessories such as eye black, a chain, a headband, or simple secondary equipment when factual and compositionally quiet. Those details must not become invented performance claims or sponsor clutter. Batting, pitching, fielding, running, and other complex equipment poses remain optional `action` variants. Canonical athlete selections, team assignments, IDs, and target paths are unchanged.

## Batch 1 finalized portrait prompts

All six prompts inherit the exact shared Style v1 contract and require review against both the approved reference sheet and all six production proof exemplars.

### Paul Skenes — Pittsburgh Pirates

> Create an original editorial portrait of Paul Skenes, a current MLB pitcher assigned as the replaceable Pittsburgh Pirates team representative. Use a waist-up three-quarter pitching portrait with a baseball held at chest height; show his very tall athletic build, dark hair, distinct dark mustache, and a composed focused expression. Use a simplified black, muted-gold, and off-white pitching uniform with a baseball cap and no exact commercial logos. Produce an isolated upper-torso subject on a transparent 640×800 8-bit RGBA canvas. Apply EdgeBoard Illustration Style v1: clean non-photorealistic editorial cartoon/vector rendering, bold controlled outer contour, thinner facial linework, restrained cel shading and highlights, minimal texture, natural proportions, and a strong small-size silhouette. No scenery, card background, decorative frame, caption, painterly realism, cinematic lighting, 3D rendering, caricature, anime, or excessive texture. Review against the approved Style v1 reference sheet and all six production proof exemplars. Do not reproduce or trace an existing photograph or artwork.

### Cal Raleigh — Seattle Mariners

> Create an original editorial portrait of Cal Raleigh, a current MLB catcher assigned as the replaceable Seattle Mariners team representative. Use a chest-up three-quarter catcher portrait with a mask held unobtrusively at the side; show his sturdy catcher build, short brown hair, close beard, and a calm confident expression. Use simplified deep-navy, restrained-teal, silver-gray, and off-white catcher context without exact commercial logos. Produce an isolated upper-torso subject on a transparent 640×800 8-bit RGBA canvas. Apply EdgeBoard Illustration Style v1 with controlled contours, restrained cel shading, minimal texture, natural proportions, and strong small-size readability. No scenery, field, crowd, card background, frame, caption, photorealism, painterly or cinematic lighting, 3D rendering, caricature, anime, or excessive equipment detail. Review against the approved Style v1 reference sheet and all six production proof exemplars. Do not reproduce or trace an existing photograph or artwork.

### Elly De La Cruz — Cincinnati Reds

> Create an original editorial portrait of Elly De La Cruz, a current MLB shortstop assigned as the replaceable Cincinnati Reds team representative. Use a waist-up portrait with a tall relaxed switch-hitter stance and bat held low; show his exceptionally tall lean build, long dark braids or locs, and a confident natural expression. Use simplified deep-red, black, and off-white baseball uniform context with a cap where appropriate and no exact commercial logos. Produce an isolated transparent 640×800 8-bit RGBA upper-torso portrait in EdgeBoard Illustration Style v1: clearly non-photorealistic, bold controlled silhouette, thinner facial linework, restrained cel shading, limited highlights, minimal texture, and natural proportions. No action scene, scenery, card background, frame, caption, painterly realism, cinematic lighting, 3D rendering, caricature, anime, or excessive hair texture. Review against the approved Style v1 reference sheet and all six production proof exemplars. Do not reproduce or trace existing photography or artwork.

### Shohei Ohtani — Los Angeles Dodgers

> Create an original editorial portrait of Shohei Ohtani, a current MLB two-way player assigned as the replaceable Los Angeles Dodgers team representative. Use a waist-up three-quarter baseball portrait with the bat upright and pitching glove only as restrained secondary context; show his tall powerful athletic build, short dark hair, clean-shaven facial structure, and a composed confident expression. Use simplified royal-blue, restrained-red, and off-white uniform context without exact commercial logos. Do not combine batting and pitching into a full action scene. Produce an isolated transparent 640×800 8-bit RGBA portrait using EdgeBoard Illustration Style v1, with bold controlled contours, thinner facial linework, restrained cel shading, limited highlights, minimal texture, natural proportions, and strong small-size readability. No scenery, card surface, decorative frame, caption, photorealism, painterly or cinematic lighting, 3D rendering, caricature, or anime. Review against the approved Style v1 reference sheet and all six production proof exemplars. Do not reproduce or trace an existing photograph or artwork.

### Ronald Acuña Jr. — Atlanta Braves

> Create an original editorial portrait of Ronald Acuña Jr., a current MLB outfielder assigned as the replaceable Atlanta Braves team representative. Use a waist-up confident three-quarter pose with a bat held low and relaxed; show his lean muscular build, dark braids or locs, trimmed facial hair, and expressive athletic posture. Use simplified deep-navy, red, and off-white uniform context with no exact commercial logos or sponsor clutter. Produce an isolated transparent 640×800 8-bit RGBA upper-torso portrait in EdgeBoard Illustration Style v1: clean editorial cartoon/vector rendering, clearly non-photorealistic, bold controlled outer contour, thinner facial details, restrained cel shading and highlights, minimal texture, natural proportions, and strong silhouette. No scenery, stadium, action scene, card background, decorative frame, caption, painterly realism, cinematic lighting, 3D rendering, caricature, anime, or excessive braid detail. Review against the approved Style v1 reference sheet and all six production proof exemplars. Do not reproduce or trace existing photography or artwork.

### José Ramírez — Cleveland Guardians

> Create an original editorial portrait of José Ramírez, a current MLB third baseman assigned as the replaceable Cleveland Guardians team representative. Use a waist-up compact switch-hitter portrait with a slight three-quarter turn; show his compact powerful build, short dark hair, close facial hair, and focused natural expression. Use simplified deep-navy, restrained-red, and off-white uniform context with a baseball cap where appropriate and no exact commercial logos. Produce an isolated transparent 640×800 8-bit RGBA upper-torso portrait in EdgeBoard Illustration Style v1, with controlled bold silhouette, thinner facial linework, restrained cel shading, limited highlights, minimal texture, natural proportions, and strong small-card legibility. No scenery, field, card background, decorative frame, caption, painterly or photographic realism, cinematic lighting, 3D rendering, caricature, anime, or excessive texture. Review against the approved Style v1 reference sheet and all six production proof exemplars. Do not reproduce or trace an existing photograph or artwork.

Prompts do not request reproduction of an existing photograph. Physical-characteristic notes must be checked against an approved factual reference package before generation; they are not permission to copy a source composition.

## Activation gates

Portrait coverage is the first requirement. Action assets remain `deferred_until_portraits_complete` until 30 portraits have been generated and reviewed.

A planned portrait may become active only after:

1. current roster membership and canonical identity are revalidated;
2. the original file exists at its immutable versioned path;
3. likeness, anatomy, uniform simplification, originality, and logo checks pass;
4. dark, light, profile, story, comparison, and compact presentation checks pass;
5. source metadata and review decision are retained;
6. registry and browser validation pass.

Draft registry rows deliberately use `status: planned` and are not merged into `ILLUSTRATION_REGISTRY`; doing so before files exist would create broken images. The twenty-four Batch 1–4 rows and all five Batch 5 rows were promoted only after their physical exports passed PNG validation and the supplied approval was recorded.

Human review reuses the proof QA contract: recognizable likeness, crop, line weight, shading, facial detail, accent/color use, stylization, texture drift, acceptable realism drift, silhouette, transparency, small-size legibility, dark-mode fit, light-mode fit, Style v1 verification, and consistency with the six production proof exemplars. Technical validation never auto-approves an asset.

## Fallback readiness

Before portraits exist, every selected athlete resolves through:

```text
exact athlete → team fallback → generic baseball → neutral EdgeBoard placeholder
```

The active registry contains one team-fallback mapping per MLB team. All team mappings reuse the approved original abstract team-context asset without logos. The baseball and neutral fallbacks remain the final shared safeguards. Current coverage is 30/30 exact approved and 30/30 fallback covered.

## Reporting

Run:

```bash
python3 scripts/report_mlb_showcase_batch_1.py
python3 scripts/validate_mlb_illustration_batch_1.py
python3 scripts/validate_mlb_illustration_batch_5.py
python3 scripts/validate_mlb_illustration_complete.py
python3 scripts/report_illustration_coverage.py
```

The MLB showcase reports fail on missing or duplicate teams, athletes, canonical mappings, showcase assignments, production descriptions, provenance, invalid PNG data, or fallback entries. Current state is 30/30 assigned, physically present, technically valid, human approved, registry active, and fallback covered.

The active portraits retain their recorded original-asset provenance and human-review decisions; no source artwork was modified during ingestion.
