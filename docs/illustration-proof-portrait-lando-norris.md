# Illustration proof portrait: Lando Norris

Canonical driver: `f1-lando-norris`
Style version: `edgeboard-illustration-v1`
Style authority: `docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png`

## Production target

| Requirement | Locked value |
| --- | --- |
| Target path | `assets/illustrations/proof/edgeboard--f1-lando-norris--portrait--v01.png` |
| Format | lossless PNG (8-bit RGBA) |
| Canvas | 640 × 800 portrait |
| Maximum size | 5,000,000 bytes |
| Background | Transparent |
| Variant | `portrait` |
| Canonical mapping | `f1-lando-norris` |
| Current fallback | `art-team-mcl` |

The physical file does not yet exist. The configured McLaren team fallback remains active and must not be deleted when an individual portrait is eventually approved.

## Final production prompt

> Create one original illustrated portrait of Lando Norris for the canonical EdgeBoard driver `f1-lando-norris`. Explicitly use EdgeBoard Illustration Style v1 and the approved Lando Norris panel in `docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png` as the visual authority for stylization, facial simplification, line hierarchy, restrained shading, natural expression, race-suit treatment, and overall collection weight; do not copy or crop that panel. Depict a recognizable Lando Norris likeness with a lean racing-driver build, youthful facial structure, and distinctive short curly-to-wavy brown hair simplified for clean small-size readability. Use a friendly, confident natural expression with a slight head turn permitted, and a simplified McLaren-inspired race-suit context using vivid papaya orange, deep charcoal black, and restrained cool-blue accents. Keep the suit graphic language clean and minimal so recognition does not depend on exact constructor trademarks, commercial logos, sponsor panels, driver numbers, or embedded lettering. Compose an isolated chest-up portrait on an exact 640 by 800 portrait canvas: head fully visible, upper torso and both shoulders readable, balanced crop, sufficient transparent space around the silhouette, no helmet obscuring the face, no awkward limb cutoff, and strong readability at small card sizes. The exported driver asset must have a transparent background with no scenery, car, track, paddock, garage, grandstand, crowd, card background, caption, decorative frame, or baked-in UI surface. Use EdgeBoard Illustration Style v1: clean flat editorial cartoon/vector rendering; clearly non-photorealistic; recognizable likeness; bold controlled outer contour; thinner controlled facial linework; flat-color foundation; restrained cel shading with one principal shadow family and at most an occasional secondary shadow; simplified facial and hair detail; minimal texture and gradients; realistic proportions with mild stylization; chest-up or waist-up transparent-background composition; clean silhouette; natural expression; strong small-card readability; consistent premium sports-editorial visual weight. Use simplified sport-specific clothing and equipment without requiring exact commercial logos or sponsor marks. No scenery, embedded text, photoreal skin, painterly texture, 3D rendering, cinematic lighting, anime, caricature, exaggerated comic-book anatomy, heavy crosshatching, extreme shadows or highlights, poster or trading-card effects, glow, splatter, or lens effects. Do not reproduce an existing photograph or illustration.

## Negative-style specification

> Exclude photorealism, photographic skin or pores, realistic photographic or cinematic lighting, painterly rendering, 3D rendering, heavy texture, excessive crosshatching, caricature, anime, exaggerated comic-book anatomy, extreme shadows or highlights, glow, splatter, poster or trading-card effects, sponsor-heavy suit graphics, scenery, car, track, paddock, garage, grandstand, crowd, card background, decorative frame, captions, and dependence on exact constructor trademarks or logos.

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
