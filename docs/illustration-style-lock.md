# EdgeBoard original illustration production style lock

Status: **EdgeBoard Illustration Style v1 human-approved and locked for future production**
Scope: athlete, fighter, driver, team-context, sport fallback, story, profile, comparison, and compact illustration assets
Applies to: original manual and original generated assets accepted into the EdgeBoard illustration registry

Style version: `edgeboard-illustration-v1`
Approval date: 2026-08-09
Reference target: `docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png`
Reference classification: `style_reference`—never production artwork, a fallback, or an illustration-registry entry

The human-approved six-athlete composite establishes the visual direction for v1. Its original PNG is stored byte-for-byte at the reference path, with its SHA-256 and dimensions recorded in adjacent metadata. The composite must not be reconstructed, regenerated, modified, automatically cropped, or treated as six approved athlete assets.

## Approved Style v1 characteristics

Style v1 is a clean editorial cartoon/vector portrait system: clearly illustrated rather than photorealistic, recognizable, approachable, and premium. It uses a bold dark outer contour; thinner controlled facial lines; medium-detail hair and facial hair; a flat-color foundation; one principal cel-shadow family; an occasional secondary shadow; minimal highlights, gradients, and texture; simplified facial planes; realistic proportions with mild stylization; natural expression; a clean chest-up or waist-up silhouette; and consistent visual weight across sports.

The reference rejects photorealism, painterly or photographic skin treatment, 3D rendering, hyper-detailed pores, cinematic lighting, heavy brush texture, watercolor, oil painting, anime, caricature, exaggerated comic-book anatomy, excessive crosshatching, extreme shadows or highlights, noisy scenery, poster or trading-card effects, glow, splatter, and lens effects. Any future change to these rules requires a new style version; v1 must not change silently.

Line hierarchy is deliberate: the outer silhouette carries the strongest contour, facial features use thinner controlled lines, hair and facial hair use selective medium detail, uniforms use clean structural lines, and shadow boundaries are primarily color-defined. Skin uses limited cel shading and must never simulate photographic lighting or texture.

This document defines one original visual language for future EdgeBoard sports illustrations. It is a production standard, not permission to copy, trace, scrape, or closely imitate another work. The abstract SVG files currently in `assets/illustrations/` are functional resolver placeholders. They verify layout and fallback behavior but are not final public-athlete likenesses and do not supersede this style lock.

## 1. The EdgeBoard visual language

EdgeBoard artwork is modern sports editorial illustration built with clean vector- and ink-inspired construction. People use recognizable human proportions, confident silhouettes, restrained detail, and subtle dimensional shading. The result should feel premium and energetic beside statistics and research—not photorealistic, childish, comic-book exaggerated, or decorative for its own sake.

Five principles govern the collection:

1. **Recognition through structure.** Pose, facial structure, hair, build, and sport equipment carry identity before surface detail.
2. **Evidence remains primary.** Artwork supports stories, profiles, comparisons, history, Edge Intelligence, and betting research; it never competes with or implies statistical evidence.
3. **One collection, many sports.** Linework, value structure, edge treatment, and rendering depth remain consistent while pose and equipment become sport-specific.
4. **Dark-first, theme-independent.** Every asset is composed for charcoal UI surfaces and is also checked on white and pale-gray surfaces.
5. **Original by construction.** No photograph, league graphic, fan art, broadcaster treatment, trading card, or living artist’s signature style is used as a template.

The collection should be identifiable as EdgeBoard through disciplined construction and selective use of its accent system—not by coloring every subject pink.

## 2. Core color language

The neutral foundation is charcoal, soft gray, and off-white. EdgeBoard magenta is an accent, not a skin, uniform, or global wash.

| Role | Production guidance |
| --- | --- |
| EdgeBoard accent | `#ce1141`; reserve for one or two focal details, motion marks, trim, or a controlled highlight |
| Deep charcoal | Approximately `#171920`–`#242733`; primary ink masses, equipment shadows, and dark uniform planes |
| Soft gray | Approximately `#9ba2b7`–`#aeb1bd`; secondary structure and subdued highlights |
| Off-white | Approximately `#f2f2f5`–`#f7f7fa`; highest-value highlights, never large glaring fields without testing |
| Sport/team accent | One or two restrained colors informed by context; simplify saturation and do not reproduce protected marks |

Skin, hair, and material colors should remain plausible. Team color families may inform uniforms, but protected logos, sponsor grids, branded tattoos, and exact trade dress are omitted unless separately approved. Avoid more than three strongly saturated colors in one asset. The magenta accent should usually occupy less than 15% of the visible figure.

## 3. Construction rules

### Line weight

At a 640-pixel-wide portrait master:

- outer silhouette and key overlaps: 6–9 px
- primary facial, clothing, and equipment structure: 3–5 px
- selective internal accents: 2–3 px
- do not rely on strokes below 2 px in the master

Line weight scales proportionally for larger variants. Use round or deliberately tapered joins where anatomy bends; avoid uniformly mechanical outlines. The darkest line should define the silhouette and important overlaps, not surround every color plane. At compact size, remove minor lines instead of making them thinner.

### Shading philosophy

Use a flat local-color base plus no more than two controlled value planes:

- one broad shadow describing volume
- one restrained highlight or reflected-light plane
- optional small contact shadow at an overlap

Favor deliberate shape design over soft airbrushing. Gradients may support a visor, helmet, or broad material transition, but should not replace drawn form. Do not use photographic texture, noise overlays, lens effects, dramatic bloom, or false depth-of-field.

### Facial-detail level

Faces preserve head shape, brow, eye spacing, nose structure, mouth shape, jaw, hairline, and distinctive hair or facial hair. Use simplified planes rather than pores, eyelashes, individual beard hairs, or hyper-detailed teeth. Eyes must remain naturally proportioned. Expression should fit the editorial context without grotesque distortion.

Public-athlete likenesses must preserve recognizable facial structure, general build, and relevant distinguishing features without caricature. Do not alter skin tone, disability, age cues, body type, hair texture, or other protected or sensitive characteristics for aesthetic convenience.

### Edge treatment

- primary silhouette: crisp and fully resolved
- internal shadow shapes: crisp or gently tapered
- motion: a small number of purposeful directional marks, never a full background effect
- transparent boundary: clean alpha with no white or dark matte fringe
- equipment overlap: readable at 96 px without tangencies that merge limbs and objects

### Contrast and saturation

The face, head, and sport-defining gesture receive the strongest local contrast. Secondary clothing and equipment recede. The illustration must remain legible on `#07080b`, `#13151c`, white, and `#f4f5f8` without a baked-in background panel. Do not solve light-mode contrast by adding an opaque rectangle; adjust boundary values or provide a controlled outline plane.

## 4. Composition and cropping

### Portrait language

- transparent background
- chest-up or waist-up figure
- head fully visible, normally in the upper third
- natural front or slight three-quarter orientation
- recognizably athletic but anatomically realistic posture
- 8% minimum transparent safe area around head and outer gesture
- 20–30% useful negative space on at least one side for story-card text
- hands may crop only when they are not central to the pose
- no stadium, crowd, sponsor wall, embedded type, or scenery

Hair, helmet, gloves, and key equipment must not be accidentally clipped. Cropping should be intentional and consistent across comparable entities.

### Action language

Action assets use the same face, line, value, and color systems as portraits. The full gesture must read at thumbnail size. Keep one dominant action axis and limit loose equipment or motion marks.

| Sport | Supported body language |
| --- | --- |
| Baseball | swing, pitch, or fielding transfer |
| Basketball | dribble, shot preparation, drive, or defensive stance |
| American football | throw, carry, receive, or defensive posture |
| Hockey | skating stride, shot preparation, or controlled save stance |
| Soccer | dribble, strike, pass, or defensive stance |
| MMA / boxing | authentic stance, controlled strike, or defensive movement |
| Motorsport | race-suit portrait, helmet pose, or cockpit-informed framing rather than invented driving action |
| Tennis | serve preparation, forehand, or backhand |
| Golf | backswing, impact-adjacent position, or follow-through |

Do not introduce a different rendering style for action variants. Anatomical exaggeration, impossible equipment positions, and invented technique are quality failures.

## 5. Subject-specific rules

### Uniforms and equipment

Communicate the sport and broad team context through color families, simplified construction, optional jersey number, and recognizable equipment. Do not depend on an exact logo for identification. Remove sponsor clutter and tiny marks that become noise. Equipment geometry must be plausible: bat grip, stick handedness, glove orientation, ball scale, racket strings, club position, helmet shape, and protective gear require review.

### Fighters

Use authentic stance, realistic reach, appropriate gloves, and varied body types. Weight-class diversity should be visible without stereotyping. Do not make every fighter extremely muscular, lean, aggressive, or physically identical. Belts or championship context appear only when the editorial context supports them and should be simplified without fabricated insignia.

### Drivers

Keep the person central. Race suits, helmets, helmet-under-arm poses, and restrained cockpit framing are appropriate. Simplify sponsor and manufacturer marks. Helmet patterns may use original geometric treatments but must not copy a protected design. A driver portrait should remain recognizable when suit branding is absent.

### Generic fallbacks

Fallback subjects must not resemble a known athlete. Use non-identifying facial construction, original color combinations, and neutral equipment. Vary apparent body type, gender presentation, stance, and skin tone across the fallback collection without encoding stereotypes. Generic assets follow all line, shading, crop, alpha, and theme rules in this document.

## 6. Standardized asset specifications

The registry’s `ILLUSTRATION_DIMENSIONS` object is the machine-readable authority for production dimensions and byte budgets.

| Deliverable | Canvas | Ratio | Composition | Maximum encoded size |
| --- | ---: | ---: | --- | ---: |
| Portrait | 640 × 800 | 4:5 | chest/waist up, negative space | 180 KB |
| Profile | 720 × 900 | 4:5 | highest-detail approved portrait | 220 KB |
| Action | 960 × 1200 | 4:5 | one complete readable gesture | 260 KB |
| Celebration | 960 × 1200 | 4:5 | controlled emotional/achievement pose | 260 KB |
| Story | 960 × 720 | 4:3 | editorial crop derived from approved art, text-safe side | 240 KB |
| Compact/avatar | 160 × 160 | 1:1 | head/shoulders or strongest silhouette | 50 KB |
| Comparison surface | 480 × 600 | 4:5 | approved portrait derivative with consistent crop | 140 KB |
| Fallback | Match target variant | varies | non-identifying subject using the same collection rules | target budget |

Create at the exact canvas size with transparency; do not rely on CSS to crop an arbitrary source. Preserve the source composition in a non-public working file, then export an optimized SVG or transparent AVIF/WebP. SVGs must have a correct `viewBox`, no embedded raster data, no scripts, no external references, and no editor-private metadata. Raster exports use sRGB and should not retain private author, location, or source-reference metadata.

### Minimum readable sizes

- 160 px and above: full approved portrait/detail system
- 96–159 px: reduced internal detail; face and silhouette remain readable
- 48–95 px: compact/avatar variant only
- below 48 px: use initials, a neutral icon, or another UI fallback; do not claim likeness recognition

## 7. Naming and versioning

New production exports use lower-case canonical IDs and immutable version suffixes:

```text
edgeboard--<canonical-entity-id>--<variant>--v<two-digits>.<ext>
edgeboard--sport-<sport-id>--fallback--<variant>--v<two-digits>.<ext>
edgeboard--team-<canonical-team-id>--fallback--<variant>--v<two-digits>.<ext>
edgeboard--weight-<sport-id>-<normalized-weight>--fallback--<variant>--v<two-digits>.<ext>
edgeboard--series-<canonical-series-id>--fallback--<variant>--v<two-digits>.<ext>
```

Examples:

```text
edgeboard--wnba-caitlin-clark--portrait--v01.svg
edgeboard--f1-max-verstappen--compact--v02.webp
edgeboard--sport-baseball--fallback--action--v01.svg
```

Do not put provider IDs, display-name-only slugs, team membership, dates of trades, betting data, or source-site names in exact-entity filenames. A new visual revision gets a new versioned file and registry entry update; do not silently overwrite a cached asset. Existing unversioned placeholder filenames are legacy system fixtures and should be replaced only through an explicit migration.

Registry IDs continue to use `art-<canonical-id>-<variant>` with a uniqueness suffix only when necessary. Alt text and provenance stay in registry metadata, not filenames.

## 8. Portrait specification

A portrait is approved only when:

- likeness and general build are recognizable without a logo
- pose is natural and sport-appropriate
- head, hair, and outer silhouette fit the safe area
- one text-safe side remains usable
- facial detail survives at 160 px
- EdgeBoard accent is restrained
- uniform context does not depend on protected artwork
- transparent edges pass dark and light matte checks

Portraits are the source for profile and compact derivatives when a separate action is not necessary. A portrait must not be mechanically stretched into a story crop.

## 9. Action and celebration specification

An action asset has one supported sport gesture and preserves the approved portrait’s face, build, palette, linework, and rendering depth. Equipment placement and technique receive sport-aware review. The entire action axis fits inside the safe area; motion marks occupy less visual weight than the athlete.

A celebration asset is optional. It must correspond to a general editorial pose or verified story context and must not fabricate a trophy, belt, score, record, or championship. Do not use celebration art to imply that a future outcome occurred.

## 10. Compact/avatar specification

Compact art is a deliberate derivative, not an automatic square crop. Use head/shoulders or the strongest sport silhouette; remove small interior lines and secondary equipment. Center the visual mass, keep 10% alpha padding, and test at 48, 64, 96, and 160 px. At 48 px, the asset must not turn into an indistinct magenta shape. Compact illustrations may be meaningful on profiles or decorative where adjacent text already identifies the entity.

## 11. Fallback specification

Fallbacks are original, non-identifying members of the same collection. Each should communicate exactly one level of context—team, weight class/division, series, sport, or neutral—and must not imply a specific athlete. The fallback hierarchy remains defined by the resolver; artwork must not bypass it.

Use broad color context only when the fallback metadata supports it. Team fallbacks avoid logos. Weight-class fallbacks vary realistic proportions. Series fallbacks use generic race equipment without manufacturer or sponsor marks. Neutral fallback art must remain genuinely multi-sport.

## 12. Originality and reference safety

Never:

- copy or trace StatMuse illustrations, ESPN photography, league promotional art, trading cards, fan art, social graphics, or stock vectors
- reproduce another artist’s recognizable signature style
- use a third-party image as the compositional skeleton of the final drawing
- scrape images or remove watermarks
- preserve protected logos or sponsor systems merely because they appear in a reference
- enter an asset with unknown provenance into the registry

Permitted factual reference use is limited to independently confirming anatomy, general appearance, equipment, and uniform color context from appropriately authorized sources. References do not become repository assets. If originality or rights cannot be established, reject the illustration and retain the deterministic fallback.

Any generated candidate requires the same human review as manual art, including originality, anatomy, identity, logo, metadata, and UI checks. Prompts must describe the EdgeBoard rules directly and must not name a living artist or request imitation. Generation history and approval evidence should be retained outside public production assets according to the project’s future rights-review process.

## 13. Quality checklist

### Identity and editorial accuracy

- [ ] Canonical entity ID is confirmed; no provider ID is used.
- [ ] Face, hair, build, skin tone, and distinctive features are represented respectfully.
- [ ] Pose, equipment, handedness/stance, and sport context are plausible.
- [ ] Uniform context is current for the effective-dated assignment or intentionally neutral.
- [ ] No trophy, belt, achievement, injury, result, or historical event is fabricated.

### Style consistency

- [ ] Silhouette reads at 96 px.
- [ ] Line hierarchy follows the locked master-width ranges.
- [ ] Shading uses controlled value planes rather than photographic effects.
- [ ] Facial detail matches the approved Style v1 stylization rather than drifting toward photorealism, painterly rendering, anime, or caricature.
- [ ] Realism drift is recorded as `none`, `minor`, or `excessive`; `excessive` blocks approval.
- [ ] Texture, background, silhouette, and overall stylization match the approved v1 reference.
- [ ] Saturation is restrained and EdgeBoard magenta is an accent.
- [ ] Crop, safe area, and text-negative space match the target variant.

### Originality and brand safety

- [ ] Asset is original and its source metadata is complete.
- [ ] No artwork, photo, pose tracing, watermark, signature-style imitation, or scraped graphic is present.
- [ ] Logos, sponsors, tattoos, and manufacturer marks are omitted or separately approved.
- [ ] Generic fallback does not resemble a real athlete.

### Technical delivery

- [ ] Filename, canonical ID, variant, and version agree.
- [ ] Dimensions, ratio, transparency, color space, and byte budget pass.
- [ ] Alpha edge is clean on all four required UI surfaces.
- [ ] SVG contains no script, embedded raster, external reference, or private metadata.
- [ ] Compact derivative is reviewed independently; it is not an unsafe automatic crop.
- [ ] Registry validation and missing-asset report pass with no orphaned file.

### Product and accessibility

- [ ] Profile alt text identifies the subject without unnecessary visual prose.
- [ ] Decorative usage has empty alt text and is hidden from assistive technology.
- [ ] Broken-image fallback still resolves.
- [ ] Dark, light, desktop, tablet, mobile, large-text, and reduced-motion contexts remain usable.
- [ ] Artwork does not obscure statistics, evidence, controls, trust labels, or market status.
- [ ] Reviewer records approval, rejection reasons, and the effective date.

An asset enters the active registry only after every applicable item passes. A failed asset remains outside the registry; the existing fallback continues to render.

## 14. Production handoff

For each future asset batch, provide the canonical entity list, requested variants, effective-dated showcase assignments, approved source/provenance record, exported files, and completed checklist. Run:

```bash
python3 scripts/report_illustration_coverage.py
```

Then run the illustration browser suite and complete regression. Illustration approval never changes sports-data certification, Edge Trust, Research Quality, or live-provider status.
