# EdgeBoard illustration system

The six-entity asset-ingestion proof and manual promotion gate are documented in [illustration-style-proof-batch.md](./illustration-style-proof-batch.md). Approved production artwork now builds on the human-reviewed, immutable `edgeboard-illustration-v1` contract in `src/config/illustration-style-v1.js`; proof records remain separate from active production registry entries.

The approved composite is classified as `style_reference`, with metadata at `docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.json` and the byte-for-byte source PNG at `docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png`. It is not a production portrait, registry entry, fallback, or source for automatic crops.

EdgeBoard illustrations are a presentation layer over canonical sports entities. They never create identity, alter statistics, certify provider data, or substitute for evidence. The system is provider-neutral and works in sample, fixture, shadow, limited-live, and certified-live modes.

## Architecture

- `src/config/illustration-registry.js` is the canonical asset manifest. Every entry identifies a canonical entity or fallback group and records type, variant, path, provenance, priority, status, and accessible alternative text.
- `tools/illustration-qa/showcase-illustration-registry.js` keeps editorial assignments and league coverage targets separate from roster identity. Assignments are effective-dated, so trades, team changes, promotion changes, or weight-class changes do not silently change old editorial decisions.
- `src/services/illustration-service.js` exposes `getIllustration(entity, context)` and the injectable `IllustrationResolver`. It validates registry data and returns one normalized presentation result.
- `src/services/athlete-media-service.js` makes the registry the first approved media candidate while retaining the existing licensed-media and initials fallback chain.
- `scripts/report_illustration_coverage.py` validates paths, IDs, provenance, variants, duplicate canonical variants, orphan files, target coverage, and the next production queue.
- `tools/illustration-qa/combat-illustration-showcase-batch-3.js` prepares canonical UFC/MMA and boxing portrait and stance-action production without activating unreviewed art. `scripts/report_combat_showcase_batch_3.py` validates its 19 weight classes, 38 fighter assignments, and complete fallback chains.
- `tools/illustration-qa/football-hockey-illustration-showcase-batch-4.js` prepares 32 NFL and 32 NHL team representatives with portrait-first production, league-appropriate deferred actions, simplified uniforms, and safe team-level fallbacks. `scripts/report_football_hockey_showcase_batch_4.py` validates all 64 mappings.

The resolver uses one deterministic order:

1. exact canonical athlete, fighter, or driver
2. current team fallback
3. weight-class, division, or series fallback
4. generic sport fallback
5. neutral EdgeBoard placeholder

Provider IDs are rejected by registry validation and are never public lookup keys. An exact canonical illustration remains stable after team or division metadata changes. Fallback results intentionally follow the supplied current context.

## Asset policy and naming

The locked production language, dimensions, construction rules, naming/versioning scheme, and review checklist are defined in [`docs/illustration-style-lock.md`](illustration-style-lock.md). That document governs all new athlete, fighter, driver, action, compact, and fallback production assets. The current abstract SVGs are resolver/layout placeholders rather than final public-athlete likenesses.

The default future showcase composition is now `portraitMode: standard`, using the approved Aaron Judge and final MLB Batch 2 presentation as its composition benchmark: one athlete, non-action chest/upper-torso framing, centered or near-centered, full head and shoulders visible, natural posture, consistent apparent scale, and a clean transparent canvas. Every sport manifest inherits this portrait-first contract. Sport-specific motion and complex equipment poses remain supported only as optional later `action` variants and are not required for showcase coverage.

Only EdgeBoard-original or separately approved assets may enter the registry. Do not copy league, team, broadcaster, athlete, or editorial artwork. Logos, uniform marks, sponsor marks, tattoos, trademarks, and source-site styling are not part of the generic fallback library.

Store files under `assets/illustrations/<category>/` and use lower-case kebab-case names beginning with `edgeboard-`. Keep an artwork reusable only when it is intentionally generic; a future athlete-specific file should use the canonical entity ID in its filename.

Allowed provenance values currently resolve to `edgeboard_original`. The report fails if a registry entry omits or changes that value. Any future licensed source requires a deliberate policy change, retained rights metadata, and review before inclusion.

## Variants and dimensions

Supported variants are `portrait`, `action`, `celebration`, `profile`, `story`, and `compact`. Context chooses the preferred variant but falls back deterministically when that rendition does not exist.

Recommended production dimensions and byte budgets are exported as `ILLUSTRATION_DIMENSIONS`. Portrait/profile art uses 4:5; story art uses 4:3; compact art uses 1:1. Prefer SVG for original abstract fallbacks and optimized AVIF/WebP for future raster illustrations. Keep assets outside initial HTML, use native lazy loading and asynchronous decoding, and do not inline hundreds of illustrations into JavaScript.

## Adding or updating an illustration

1. Confirm the canonical entity ID in the existing entity registry. Never use a provider ID.
2. Add the reviewed original asset to the appropriate `assets/illustrations/` folder.
3. Add one registry row for each deliberate variant. Record canonical ID, sport, league/context fields, asset type, fallback group, source, status, priority, and alt text.
4. Add or update the effective-dated showcase assignment only when editorial coverage changes. Do not encode team membership into identity.
5. Run `python3 scripts/report_illustration_coverage.py` and the browser regression suite.

Duplicate IDs, duplicate canonical variants, missing assets, missing provenance, provider-shaped IDs, inactive entries, and orphaned files fail validation.

## Presentation and accessibility

Profiles use meaningful alt text because the illustration identifies the subject. Story/discovery cards and expanded parlay research use empty alt text and `aria-hidden` because adjacent text already communicates the entity and the image is decorative. Broken images continue through the existing candidate chain and end with initials. Dark/light surfaces, large text, keyboard actions, and mobile layouts inherit existing EdgeBoard components.

Illustrations are intentionally selective: major profiles, prominent deterministic stories, comparison/leaderboard entity media, and user-requested research surfaces may show them. Dense market cards, parlay summaries, tables, and utility rows remain data-first. A parlay leg shows art only inside its expanded research explanation.

## Coverage status

The active exact-portrait registry contains 30 MLB, 30 NBA, 8 WNBA, 5 NFL, 10 UFC, and 13 boxing illustrations. The MLB and NBA showcase sets are complete at 30/30; other league targets remain intentionally selective and continue through the documented fallback chain. Live-provider certification and sports-data validation are independent of illustration coverage.

Run `python3 scripts/validate_portable_illustrations.py` to validate the style proof, every MLB and NBA production batch, WNBA/NFL/UFC/boxing featured portraits, canonical registry activation, hashes, PNG structure, alpha channels, provenance, and global coverage. Historical contributor source paths may be retained as provenance, but an unavailable external source archive is reported rather than required. When a recorded source is present, its expected byte size, hash, dimensions, and alpha are still checked; committed production assets and mappings are always strict.

The first complete team-based production manifest is documented in [`docs/illustration-showcase-batch-1-mlb.md`](illustration-showcase-batch-1-mlb.md). The NBA/WNBA portrait-first collection is documented in [`docs/illustration-showcase-batch-2-basketball.md`](illustration-showcase-batch-2-basketball.md). The NFL/NHL planning collection is documented in [`docs/illustration-showcase-batch-4-football-hockey.md`](illustration-showcase-batch-4-football-hockey.md); unproduced entries remain plans rather than coverage claims.
