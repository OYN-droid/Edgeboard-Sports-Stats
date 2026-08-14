# EdgeBoard Illustration Style v1 future-production prompt

Machine-readable authority: `src/config/illustration-style-v1.js`
Style version: `edgeboard-illustration-v1`

Default portrait mode: `standard`

`standard` is the Aaron Judge-style collection composition: one athlete, non-action chest/upper-torso framing, centered or near-centered, full head and shoulders visible, a simple natural posture, consistent apparent scale, and a clean transparent background. Batting, pitching, fighting, running, swinging, and other complex equipment/action poses belong only to a separately requested optional `action` variant.

Collection consistency does not require cloning one pose. Controlled diversity is encouraged through natural gaze direction, mild head turns, expressions, hairstyles, facial hair, body silhouettes, and restrained subject-specific accessories. Accessories such as eye black, a chain, headband, or simple secondary equipment must be factually grounded, visually quiet, and must not introduce sponsor clutter, achievements, or unsupported narrative claims.

Use this parameterized template only with an approved original-art production workflow:

> Create an original EdgeBoard sports editorial portrait of `[ATHLETE]`.
>
> Sport: `[SPORT]`. Position or role: `[POSITION_OR_ROLE]`.
>
> Portrait mode: `standard`. Non-action chest/upper-torso crop, centered or near-centered, full head and shoulders visible, natural posture, consistent apparent subject scale, and clean transparent space around the silhouette.
>
> Recognizable characteristics: `[FACTUALLY_VERIFIED_CHARACTERISTICS]`.
>
> Simplified clothing context: `[UNIFORM_COLOR_CONTEXT]`. Keep equipment secondary and omit complex equipment poses from the primary portrait.
>
> Use EdgeBoard Illustration Style v1: clean flat editorial cartoon/vector rendering; clearly non-photorealistic; recognizable likeness; bold controlled outer contour; thinner facial linework; restrained cel shading; simplified facial, hair, and facial-hair detail; minimal texture and gradients; realistic proportions with mild stylization; natural expression; clean chest-up or waist-up composition; transparent background; strong small-card silhouette; consistent premium sports-editorial weight.
>
> Simplify branding and sponsor clutter. Do not depend on exact commercial logos. No batting stance, pitching motion, fighting stance, swing, run, complex equipment pose, scenery, stadium, decorative background, baked gradient, embedded text, photoreal skin, painterly texture, 3D rendering, cinematic lighting, anime, caricature, exaggerated comic-book anatomy, heavy crosshatching, extreme shadows or highlights, poster or trading-card effects, glow, splatter, or lens effects. Do not reproduce an existing photograph or illustration.

The configured helper `buildEdgeBoardIllustrationV1Prompt()` composes this shared contract with each existing manifest’s canonical entity, sport, position, factual likeness notes, and uniform context. Showcase selections remain unchanged. Optional action variants remain supported but are not required for showcase portrait coverage.
