# Illustration proof portrait: Islam Makhachev

Canonical fighter: `ufc-islam-makhachev`
Style version: `edgeboard-illustration-v1`
Style authority: `docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png`

## Production target

| Requirement | Locked value |
| --- | --- |
| Target path | `assets/illustrations/proof/edgeboard--ufc-islam-makhachev--portrait--v01.png` |
| Format | lossless PNG (8-bit RGBA) |
| Canvas | 640 × 800 portrait |
| Maximum size | 5,000,000 bytes |
| Background | Transparent |
| Variant | `portrait` |
| Canonical mapping | `ufc-islam-makhachev` |
| Current fallback | `art-weight-mma-welterweight` |

The physical file does not yet exist. The configured weight-class fallback remains active and must not be deleted when an individual portrait is eventually approved.

## Final production prompt

> Create one original illustrated portrait of Islam Makhachev for the canonical EdgeBoard fighter `ufc-islam-makhachev`. Explicitly use EdgeBoard Illustration Style v1 and the approved Islam Makhachev panel in `docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png` as the visual authority for stylization, facial simplification, line hierarchy, restrained shading, natural expression, fight-kit treatment, and overall collection weight; do not copy or crop that panel. Depict a recognizable Islam Makhachev likeness with a compact athletic fighter build, short dark hair, and a distinctive full dark beard. Use a serious, composed natural expression with a slight head turn permitted, and a simplified dark charcoal and black fight-kit context with restrained warm-gold accents so recognition does not depend on exact promotion trademarks, commercial logos, sponsor marks, or embedded lettering. An MMA glove may appear near the upper torso only if it supports the clean chest-up silhouette without obscuring the face or creating an awkward crop. Compose an isolated chest-up portrait on an exact 640 by 800 portrait canvas: head fully visible, upper torso and both shoulders readable, balanced crop, sufficient transparent space around the silhouette, and strong readability at small card sizes. The exported fighter asset must have a transparent background with no scenery, cage, arena, crowd, stadium, card background, caption, decorative frame, or baked-in UI surface. Use EdgeBoard Illustration Style v1: clean flat editorial cartoon/vector rendering; clearly non-photorealistic; recognizable likeness; bold controlled outer contour; thinner controlled facial linework; flat-color foundation; restrained cel shading with one principal shadow family and at most an occasional secondary shadow; simplified facial, hair, and facial-hair detail; minimal texture and gradients; realistic proportions with mild stylization; chest-up or waist-up transparent-background composition; clean silhouette; natural expression; strong small-card readability; consistent premium sports-editorial visual weight. Use simplified sport-specific clothing and equipment without requiring exact commercial logos or sponsor marks. No scenery, embedded text, photoreal skin, painterly texture, 3D rendering, cinematic lighting, anime, caricature, exaggerated comic-book anatomy, heavy crosshatching, extreme shadows or highlights, poster or trading-card effects, glow, splatter, or lens effects. Do not reproduce an existing photograph or illustration.

## Negative-style specification

> Exclude photorealism, photographic skin or pores, realistic photographic or cinematic lighting, painterly rendering, 3D rendering, heavy texture, excessive crosshatching, caricature, anime, exaggerated comic-book anatomy, extreme shadows or highlights, glow, splatter, poster or fight-poster effects, scenery, cage, arena, crowd, stadium, card background, decorative frame, captions, sponsor marks, and dependence on exact promotion trademarks or logos.

## Submission and review

The repository remains `productionStatus: awaiting_asset` and `reviewStatus: awaiting_asset` until the physical file exists and passes automated inspection. A valid candidate may then enter only:

```text
productionStatus: submitted
reviewStatus: needs_review
```

Human review must assess recognizable likeness, crop consistency, line-weight consistency, shading consistency, facial-detail consistency, stylization consistency, texture drift, realism drift, silhouette consistency, transparent background, small-size legibility, dark-mode fit, and light-mode fit. Only unanimous approval of the locked review fields makes the individual portrait eligible for the active registry.

## Validation workflow

Place the candidate at the exact configured path, then run:

```bash
python3 scripts/validate_illustration_style_proof.py
```

With the local server running, open:

```text
http://127.0.0.1:9010/browser-tests/illustration-proof-gallery.html
```

Confirm that the file passes structural ingestion, appears consistently on dark and light review surfaces, and remains `submitted` / `needs_review` until explicit human approval. Do not add it to the active illustration registry before that approval.
