# Featured portrait production readiness

EdgeBoard's first cross-sport featured portrait wave is a deliberately partial editorial set. It is not full league coverage and does not identify any athlete as the best player or fighter. The canonical manifest is `src/config/featured-portrait-coverage.js`.

## Scope and terminology

- WNBA: 8 featured athletes
- NFL: 5 featured athletes
- UFC: 10 featured fighters
- Boxing: 13 featured boxers with 13 active exact portraits
- Required Boxing reporting label: `Boxing featured exact portraits: 13 active`
- Coverage type: `featured_partial`

The selections are replaceable production priorities attached to canonical IDs. Existing complete MLB and NBA illustration work is unchanged.

## Ranking policy

Story quality, supporting evidence, freshness, validation, Research Quality, and Edge Trust determine story eligibility and score. Artwork never makes an otherwise ineligible story eligible and never adds to factual story quality. An approved exact portrait may break a tie only after two stories have the same calculated story score. Deterministic ID order remains the final tie-breaker.

## Production contract

- Canonical source: lossless PNG
- Dimensions: exactly 640 × 800
- Color: 8-bit RGBA
- Background: meaningful alpha transparency
- Interlace: disabled
- Orientation: portrait
- Variant: `portrait`
- Portrait mode: standard chest/upper-torso
- Style: `edgeboard-illustration-v1`

Planned registry drafts remain inactive until a physical file passes technical validation and explicit human review. The Boxing featured production ingestion records source/export hashes in `docs/assets/illustration-style/edgeboard-boxing-featured-portrait-exports.json`. All thirteen technically valid sources are active. Teofimo Lopez's previously rejected gradient-backed source remains recorded in rejection history, while the clean replacement is the approved production source; EdgeBoard did not remove or repair either supplied image.

## Fallback contracts

- WNBA and NFL: exact athlete → team → sport → neutral
- UFC: exact fighter → organization when an approved organization asset exists → MMA → neutral
- Boxing: exact fighter → boxing → neutral

EdgeBoard does not currently have an organization-owned UFC illustration, so UFC entries intentionally continue to the MMA fallback. Deterministic sample identities are never assigned a real athlete portrait and continue to use their intentional combat/sport fallback.

## Validation

The focused illustration browser suite validates canonical mappings, category-specific partial targets, unique paths, production states, Style v1, the PNG production contract, exact resolution across supported contexts, and active fallback IDs. `scripts/validate_boxing_featured_portraits.py` locks the thirteen active source/export hashes, Teofimo's superseded rejection history, centralized registry rows, and Boxing/neutral fallbacks. Current assignment verification is dated in the manifest and must be repeated before future production because divisions can change.
