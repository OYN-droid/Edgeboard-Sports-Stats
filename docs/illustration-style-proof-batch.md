# EdgeBoard illustration style proof batch

Status: **Complete — 6/6 technically valid, human-approved, and active**
Scope: six canonical representatives used to validate the locked EdgeBoard illustration style across sports and interface contexts
Public behavior: exact approved portraits resolve first; all prior fallbacks remain active

The six individual 640×800 transparent PNG exports are active production proof exemplars for `edgeboard-illustration-v1`. The separately approved composite remains reference-only and is neither an athlete asset nor a fallback.

The pre-production briefs remain documented in the six `illustration-proof-portrait-*.md` files as historical production guidance. Final approval and activation state is authoritative in the manifest, export provenance record, and registry.

## Consolidated production readiness

All six source portraits use the locked `640 × 800` transparent lossless PNG specification: 8-bit RGBA with meaningful alpha transparency and a maximum source size of `5,000,000` bytes.

| Athlete | Canonical ID | Sport / league | Context | Target portrait | Current fallback | Production | Review | Style |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Aaron Judge | `mlb-aaron-judge` | Baseball / MLB | Yankees (`NYY`) | `assets/illustrations/proof/edgeboard--mlb-aaron-judge--portrait--v01.png` | `art-team-nyy` | `approved` | `approved` | `edgeboard-illustration-v1` |
| Stephen Curry | `nba-stephen-curry` | Basketball / NBA | Warriors (`GSW`) | `assets/illustrations/proof/edgeboard--nba-stephen-curry--portrait--v01.png` | `art-team-gsw` | `approved` | `approved` | `edgeboard-illustration-v1` |
| Islam Makhachev | `ufc-islam-makhachev` | MMA / UFC | Welterweight | `assets/illustrations/proof/edgeboard--ufc-islam-makhachev--portrait--v01.png` | `art-weight-mma-welterweight` | `approved` | `approved` | `edgeboard-illustration-v1` |
| Auston Matthews | `nhl-auston-matthews` | Hockey / NHL | Maple Leafs (`TOR`) | `assets/illustrations/proof/edgeboard--nhl-auston-matthews--portrait--v01.png` | `art-team-tor` | `approved` | `approved` | `edgeboard-illustration-v1` |
| Lando Norris | `f1-lando-norris` | Motorsport / Formula 1 | McLaren (`MCL`) | `assets/illustrations/proof/edgeboard--f1-lando-norris--portrait--v01.png` | `art-team-mcl` | `approved` | `approved` | `edgeboard-illustration-v1` |
| Coco Gauff | `wta-coco-gauff` | Tennis / WTA | WTA | `assets/illustrations/proof/edgeboard--wta-coco-gauff--portrait--v01.png` | `art-tour-wta` | `approved` | `approved` | `edgeboard-illustration-v1` |

These are replaceable showcase assignments, not claims that an athlete is the best in a sport, league, team, division, or tour. Identity remains attached only to the canonical entity ID. Team, weight-class, series, and tour context remain independently changeable.

Every slot inherits `ILLUSTRATION_PROOF_PRODUCTION_SPEC`: lossless PNG, 640×800 portrait orientation, meaningful transparent alpha, an isolated chest-up or upper-torso subject, a clean small-size silhouette, and no scenery, card background, decorative frame, or embedded caption. Each subject has exactly one exported production brief in `ILLUSTRATION_PROOF_PRODUCTION_BRIEFS`; the subject guidance supplements rather than replaces the shared Style v1 contract.

## Ingestion and approval workflow

1. An approved production process exports an original lossless PNG to the target path already assigned to the canonical entity. Filename parsing never assigns identity. The source PNG is not wrapped in SVG, vectorized, recompressed, or modified by ingestion.
2. Run `python3 scripts/validate_illustration_style_proof.py`. It checks the PNG signature, chunk boundaries and CRCs, valid decoding, 8-bit RGBA data, exact 640×800 dimensions, meaningful alpha transparency, byte budget, duplicate mappings, broken fallback references, and orphaned proof assets.
3. Move the asset from `awaiting_asset` to `needs_review` only after automated validation succeeds.
4. Review every field against Style v1: crop, line weight, shading, facial detail, accent/color use, transparency, small-size legibility, dark/light fit, stylization, texture drift, background compliance, silhouette consistency, and overall approval. Record realism drift as `none`, `minor`, or `excessive`.
5. Record `needs_revision`, `rejected`, or `approved`. Excessive realism drift blocks approval. Only an asset whose production state, review state, every QA field, style version, and canonical mapping are approved can be converted to an active registry entry.
6. Review or rejection never overwrites the active fallback. A new immutable `v02` path is used for a materially revised export rather than silently replacing approved bytes.

Portraits are processed independently. A valid first portrait can become `submitted / needs_review`, and later `approved / approved`, while every other slot remains `awaiting_asset`. The batch does not require 6/6 files for individual review or registry eligibility.

## Final 6/6 activation gate

`evaluateIllustrationProofActivation` is a read-only gate. It returns `ready: true` only when all six files exist, all six inspections pass, every production and review state is approved, every shared QA field is approved, all slots use Style v1, no slot has excessive realism drift, all six registry drafts remain canonically mapped, and every configured fallback remains active. It does not promote, copy, edit, or register artwork.

After all six files have separately passed human review:

1. Run `python3 scripts/validate_illustration_style_proof.py` to verify all six physical files and mappings.
2. Start the local server with `python3 -m server.app --port 9010`.
3. Open `http://127.0.0.1:9010/browser-tests/illustration-proof-gallery.html` and require every proof-ingestion check to pass with no captured browser errors.
4. Call `evaluateIllustrationProofActivation` with the six approved slot records and their six validated inspections. Require `ready: true`, `physicalAssets: 6`, `technicallyValid: 6`, `humanApproved: 6`, and `registryEligible: 6` before adding its immutable `approvedEntries` to the active registry.
5. Run the illustration and aggregate browser regressions before deployment. Never infer human approval from technical validation.

Current activation state is **ready: 6/6 physical, 6/6 technically valid, 6/6 human approved, and 6/6 registry eligible**.

The supported lifecycle states are `awaiting_asset`, `needs_review`, `approved`, `rejected`, and `needs_revision`. Rejected and revision-required assets remain unavailable to public resolution.

## Development gallery

The isolated gallery is available at `/browser-tests/illustration-proof-gallery.html` during local development. It is deliberately absent from primary application navigation. Each of the six consistent frames shows:

- canonical identity, sport, league, showcase role, expected path, and review state;
- the active exact portrait on dark and light surfaces, plus the preserved fallback registry ID;
- small and profile-scale previews;
- representative profile, story/fact, comparison, Edge Intelligence, and restrained market-research placements.

The gallery loads the six active exact portraits after approval and also verifies that removing each exact entry returns resolution to its configured fallback without a broken image or layout shift.

## Automated versus human checks

Automated checks can verify registry linkage, unique variants, PNG integrity and decoding, path conventions, dimensions, meaningful alpha transparency, file size, loading behavior, and promotion-state logic. Human review remains mandatory for identity accuracy, likeness quality, crop, style consistency, equipment correctness, facial detail, accent restraint, dark/light fit, and legibility. Passing PNG validation is not artistic approval.

No component hard-codes a proof portrait path. Product surfaces continue to resolve art through the centralized illustration service, and dense market rows remain data-first.
