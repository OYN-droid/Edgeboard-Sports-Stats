const RAW_STYLE_REFERENCE = /* style-reference-json-start */ {
  "assetType": "style_reference",
  "assetPath": "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png",
  "ingestionStatus": "ingested",
  "fileSizeBytes": 3049311,
  "width": 1369,
  "height": 1149,
  "sha256": "223ff10408d12be286a9311d5c9d4f8dce73a7b6f8881bc034737b635ced8ae6",
  "productionAsset": false,
  "fallbackEligible": false,
  "registryEligible": false,
  "composite": true,
  "subjectCanonicalIds": ["mlb-aaron-judge", "nba-stephen-curry", "ufc-islam-makhachev", "nhl-auston-matthews", "f1-lando-norris", "wta-coco-gauff"]
} /* style-reference-json-end */;

export const EDGEBOARD_ILLUSTRATION_STYLE_V1 = Object.freeze({
  styleVersion: "edgeboard-illustration-v1",
  displayName: "EdgeBoard Illustration Style v1",
  approvalStatus: "human_approved",
  approvedAt: "2026-08-09",
  reference: Object.freeze({ ...RAW_STYLE_REFERENCE, subjectCanonicalIds: Object.freeze(RAW_STYLE_REFERENCE.subjectCanonicalIds) }),
  positiveCharacteristics: Object.freeze([
    "clean editorial cartoon/vector portrait", "clearly illustrated rather than photorealistic",
    "recognizable athlete likeness", "bold clean outer contour", "controlled thinner facial linework",
    "flat-color foundation", "restrained cel-style shading", "limited gradients", "minimal texture",
    "simplified facial detail", "expressive but natural faces", "realistic proportions with mild stylization",
    "clean silhouette", "chest/waist-up portrait composition", "strong small-card readability",
    "consistent visual weight across sports", "premium approachable sports-editorial finish",
  ]),
  prohibitedCharacteristics: Object.freeze([
    "photorealism", "painterly realism", "photographic skin texture", "3D rendering", "hyper-detailed pores",
    "cinematic lighting", "heavy brush texture", "watercolor", "oil painting", "anime", "caricature",
    "exaggerated comic-book anatomy", "excessive crosshatching", "extreme shadows", "excessive highlights",
    "noisy backgrounds", "sports-poster effects", "trading-card effects", "glowing effects",
    "excessive splatter", "lens effects",
  ]),
  portraitMode: "standard",
  standardPortraitPresentation: "Use the standard EdgeBoard portrait presentation established by the approved Aaron Judge portrait and final MLB Batch 2 portraits: one athlete, non-action chest/upper-torso framing, centered or near-centered, full head and shoulders visible, simple natural posture, consistent apparent subject scale, and a clean transparent canvas. Do not use a batting stance, pitching motion, fighting stance, swing, run, complex equipment pose, scenery, stadium, poster background, or baked gradient. Action artwork is a separate optional variant.",
  promptContract: "Use EdgeBoard Illustration Style v1 and portraitMode standard: one athlete in a non-action chest/upper-torso portrait, centered or near-centered, with the full head and shoulders visible, a simple natural posture, consistent apparent scale, and a clean transparent canvas. No batting stance, pitching motion, fighting stance, swing, run, or complex equipment pose; action artwork is a separate optional variant. Use clean flat editorial cartoon/vector rendering; clearly non-photorealistic; recognizable likeness; bold controlled outer contour; thinner controlled facial linework; flat-color foundation; restrained cel shading with one principal shadow family and at most an occasional secondary shadow; simplified facial, hair, and facial-hair detail; minimal texture and gradients; realistic proportions with mild stylization; clean silhouette; natural expression; strong small-card readability; consistent premium sports-editorial visual weight. Use simplified sport-specific clothing without requiring exact commercial logos or sponsor marks. No scenery, stadium, decorative background, poster background, baked gradient, embedded text, photoreal skin, painterly texture, 3D rendering, cinematic lighting, anime, caricature, exaggerated comic-book anatomy, heavy crosshatching, extreme shadows or highlights, trading-card effects, glow, splatter, or lens effects. Do not reproduce an existing photograph or illustration.",
  realismDriftValues: Object.freeze(["none", "minor", "excessive"]),
});

export const EDGEBOARD_ILLUSTRATION_STYLE_VERSION = EDGEBOARD_ILLUSTRATION_STYLE_V1.styleVersion;
export const EDGEBOARD_ILLUSTRATION_V1_PROMPT = EDGEBOARD_ILLUSTRATION_STYLE_V1.promptContract;

export function buildEdgeBoardIllustrationV1Prompt({ athlete, sport, position, pose, characteristics, uniformContext, equipment = "" } = {}) {
  return [
    `Create an original EdgeBoard sports editorial portrait of ${athlete || "the canonical athlete"}.`,
    `Sport: ${sport || "configured sport"}. Position or role: ${position || "configured role"}.`,
    `Portrait mode: standard. Pose and crop: ${pose || "non-action chest/upper-torso portrait, centered or near-centered, with the full head and shoulders visible and a natural posture"}.`,
    characteristics ? `Recognizable characteristics: ${characteristics}.` : "Preserve recognizable characteristics using an approved factual reference package.",
    uniformContext ? `Simplified clothing color context: ${uniformContext}.` : "Use clean sport-specific clothing without depending on trademarks.",
    equipment ? `Sport-specific equipment: ${equipment}.` : "Adapt sport-specific clothing or equipment only where appropriate.",
    EDGEBOARD_ILLUSTRATION_V1_PROMPT,
  ].join(" ");
}
