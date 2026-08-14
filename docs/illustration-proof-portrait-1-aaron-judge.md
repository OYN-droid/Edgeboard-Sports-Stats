# Illustration production proof portrait 1 of 6 — Aaron Judge

Status: **production brief ready; individual asset not produced**
Canonical athlete: `mlb-aaron-judge`
Style: `edgeboard-illustration-v1`
Style authority: `docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png`

## Exact production target

| Requirement | Value |
| --- | --- |
| Target path | `assets/illustrations/proof/edgeboard--mlb-aaron-judge--portrait--v01.png` |
| Format | lossless PNG (8-bit RGBA) |
| Canvas | 640 × 800 pixels, portrait orientation |
| Maximum encoded size | 5,000,000 bytes |
| Background | Transparent |
| Variant | `portrait` |
| Canonical mapping | `mlb-aaron-judge` |
| Current fallback | `art-team-nyy` — Yankees team context |

The athlete must be isolated. The file must not contain scenery, a stadium, crowd, card background, caption, decorative frame, embedded raster data, scripts, or external references. The UI supplies the surrounding surface.

## Final production prompt

> Create one original illustrated portrait of Aaron Judge for the canonical EdgeBoard athlete `mlb-aaron-judge`. Explicitly use EdgeBoard Illustration Style v1 and the approved Aaron Judge panel in `docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png` as the visual authority for stylization, facial simplification, line hierarchy, restrained shading, natural expression, uniform treatment, and overall collection weight; do not copy or crop that panel. Depict a recognizable Aaron Judge likeness with his very tall, powerful baseball-player build communicated naturally through broad shoulders and upper-torso proportions. Use a friendly, confident natural expression with a slight head turn permitted, a baseball cap, and a clean Yankees-inspired navy, off-white, and subtle pinstripe uniform context simplified so recognition does not depend on exact trademarks, commercial logos, sponsor marks, or embedded lettering. Compose an isolated chest-up portrait on an exact 640 by 800 portrait canvas: head fully visible, upper torso and both shoulders readable, balanced crop, sufficient transparent space around the silhouette, no awkward limb cutoff, and strong readability at small card sizes. The exported athlete asset must have a transparent background with no scenery, stadium, crowd, card background, caption, decorative frame, or baked-in UI surface. Use EdgeBoard Illustration Style v1: clean flat editorial cartoon/vector rendering; clearly non-photorealistic; recognizable likeness; bold controlled outer contour; thinner controlled facial linework; flat-color foundation; restrained cel shading with one principal shadow family and at most an occasional secondary shadow; simplified facial, hair, and facial-hair detail; minimal texture and gradients; realistic proportions with mild stylization; chest-up or waist-up transparent-background composition; clean silhouette; natural expression; strong small-card readability; consistent premium sports-editorial visual weight. Use simplified sport-specific clothing and equipment without requiring exact commercial logos or sponsor marks. No scenery, embedded text, photoreal skin, painterly texture, 3D rendering, cinematic lighting, anime, caricature, exaggerated comic-book anatomy, heavy crosshatching, extreme shadows or highlights, poster or trading-card effects, glow, splatter, or lens effects. Do not reproduce an existing photograph or illustration.

## Negative-style specification

Exclude photorealism, photographic skin or pores, realistic photographic or cinematic lighting, painterly rendering, 3D rendering, heavy texture, excessive crosshatching, caricature, anime, exaggerated comic-book anatomy, extreme shadows or highlights, glow, splatter, poster or trading-card effects, scenery, crowd, stadium, card background, decorative frame, captions, sponsor marks, and dependence on exact trademarks or logos.

## Submission and human review

The repository remains `productionStatus: awaiting_asset` and `reviewStatus: awaiting_asset` until the physical file exists and passes automated inspection. A valid file may then enter only:

```text
productionStatus: submitted
reviewStatus: needs_review
```

Human review must evaluate recognizable likeness, crop, line weight, shading, facial detail, Style v1 stylization, texture drift, realism drift, silhouette, transparent background, small-size legibility, and dark- and light-mode fit. Human approval is required before registry promotion. The Yankees fallback remains active and is never deleted.

## Validation workflow

1. Place the approved candidate at the exact target path without changing its canonical filename.
2. Run `python3 scripts/validate_illustration_style_proof.py` from the repository root.
3. Open `/browser-tests/illustration-proof-gallery.html` through the local EdgeBoard server and verify the submitted portrait on dark, light, compact, and profile surfaces.
4. Record every QA result and realism drift. Do not activate the registry entry unless all required QA fields and human review are approved.

The other five proof entities remain `awaiting_asset` and are outside this production brief.
