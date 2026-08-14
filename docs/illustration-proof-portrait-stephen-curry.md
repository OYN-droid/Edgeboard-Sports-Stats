# Illustration production proof portrait — Stephen Curry

Status: **production brief ready; individual asset not produced**
Canonical athlete: `nba-stephen-curry`
Style: `edgeboard-illustration-v1`
Style authority: `docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png`

## Exact production target

| Requirement | Value |
| --- | --- |
| Target path | `assets/illustrations/proof/edgeboard--nba-stephen-curry--portrait--v01.png` |
| Format | lossless PNG (8-bit RGBA) |
| Canvas | 640 × 800 pixels, portrait orientation |
| Maximum encoded size | 5,000,000 bytes |
| Background | Transparent |
| Variant | `portrait` |
| Canonical mapping | `nba-stephen-curry` |
| Current fallback | `art-team-gsw` — Warriors team context |

The athlete must be isolated. The file must not contain scenery, an arena, crowd, court, card background, caption, decorative frame, embedded raster data, scripts, or external references. EdgeBoard supplies the surrounding surface.

## Final production prompt

> Create one original illustrated portrait of Stephen Curry for the canonical EdgeBoard athlete `nba-stephen-curry`. Explicitly use EdgeBoard Illustration Style v1 and the approved Stephen Curry panel in `docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png` as the visual authority for stylization, facial simplification, line hierarchy, restrained shading, natural expression, uniform treatment, and overall collection weight; do not copy or crop that panel. Depict a recognizable Stephen Curry likeness with a lean basketball-player build, short closely cropped hair, and a neatly trimmed beard. Use a relaxed, upbeat, confident natural expression with a slight head turn permitted, and a clean sleeveless Warriors-inspired basketball uniform context using controlled royal blue, warm gold, and off-white colors simplified so recognition does not depend on exact trademarks, commercial logos, sponsor marks, jersey lettering, or embedded text. Compose an isolated chest-up portrait on an exact 640 by 800 portrait canvas: head fully visible, upper torso and both shoulders readable, balanced crop, sufficient transparent space around the silhouette, no awkward limb cutoff, and strong readability at small card sizes. The exported athlete asset must have a transparent background with no scenery, arena, crowd, court, card background, caption, decorative frame, or baked-in UI surface. Use EdgeBoard Illustration Style v1: clean flat editorial cartoon/vector rendering; clearly non-photorealistic; recognizable likeness; bold controlled outer contour; thinner controlled facial linework; flat-color foundation; restrained cel shading with one principal shadow family and at most an occasional secondary shadow; simplified facial, hair, and facial-hair detail; minimal texture and gradients; realistic proportions with mild stylization; chest-up or waist-up transparent-background composition; clean silhouette; natural expression; strong small-card readability; consistent premium sports-editorial visual weight. Use simplified sport-specific clothing and equipment without requiring exact commercial logos or sponsor marks. No scenery, embedded text, photoreal skin, painterly texture, 3D rendering, cinematic lighting, anime, caricature, exaggerated comic-book anatomy, heavy crosshatching, extreme shadows or highlights, poster or trading-card effects, glow, splatter, or lens effects. Do not reproduce an existing photograph or illustration.

## Negative-style specification

Exclude photorealism, photographic skin or pores, realistic photographic or cinematic lighting, painterly or 3D rendering, heavy texture, excessive crosshatching, caricature, anime, exaggerated comic-book anatomy, extreme shadows or highlights, glow, splatter, poster or trading-card effects, scenery, arena, crowd, court, card background, decorative frame, captions, sponsor marks, and dependence on exact trademarks or logos.

## Submission and human review

The repository remains `productionStatus: awaiting_asset` and `reviewStatus: awaiting_asset` until the physical file exists and passes automated inspection. A valid candidate may then enter only:

```text
productionStatus: submitted
reviewStatus: needs_review
```

Human review must evaluate recognizable likeness, crop, line weight, shading, facial detail, Style v1 stylization, texture drift, realism drift, silhouette, transparent background, small-size legibility, and dark- and light-mode fit. Human approval is required before registry promotion. The Warriors fallback remains active and is never deleted.

## Validation workflow

1. Place the approved candidate at the exact target path without changing its canonical filename.
2. Run `python3 scripts/validate_illustration_style_proof.py` from the repository root.
3. Open `/browser-tests/illustration-proof-gallery.html` through the local EdgeBoard server and inspect dark, light, compact, and profile surfaces.
4. Record every QA result and realism drift. Do not activate the registry entry unless all required QA fields and human review are approved.

The other five proof entities remain `awaiting_asset`. This brief adds no physical portrait and changes no production status.
