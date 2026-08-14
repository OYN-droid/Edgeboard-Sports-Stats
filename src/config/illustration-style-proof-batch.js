import { ILLUSTRATION_DIMENSIONS } from "./illustration-registry.js";
import { EDGEBOARD_ILLUSTRATION_STYLE_VERSION, EDGEBOARD_ILLUSTRATION_V1_PROMPT } from "./illustration-style-v1.js";

export const ILLUSTRATION_PROOF_PRODUCTION_STATES = Object.freeze([
  "awaiting_asset", "submitted", "approved", "rejected", "needs_revision",
]);

export const ILLUSTRATION_PROOF_REVIEW_STATES = Object.freeze([
  "awaiting_asset", "needs_review", "approved", "rejected", "needs_revision",
]);

export const ILLUSTRATION_PROOF_QA_FIELDS = Object.freeze([
  "recognizable_likeness", "crop_consistency", "line_weight_consistency", "shading_consistency",
  "facial_detail_consistency", "accent_usage_consistency", "transparent_background",
  "small_size_legibility", "dark_mode_fit", "light_mode_fit", "overall_approved",
  "stylization_consistency", "texture_drift", "background_compliance", "silhouette_consistency",
  "collection_consistency",
]);

export const ILLUSTRATION_PROOF_HUMAN_REVIEW_CHECKLIST = Object.freeze([
  "recognizable likeness", "crop consistency", "line-weight consistency", "shading consistency",
  "facial-detail consistency", "accent/color consistency", "stylization consistency", "texture drift",
  "realism drift", "silhouette consistency", "transparent background", "small-size legibility",
  "dark-mode fit", "light-mode fit", "overall consistency with the other five proof portraits",
]);

export const ILLUSTRATION_PROOF_PRODUCTION_SPEC = Object.freeze({
  styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  format: "png",
  dimensions: Object.freeze({ ...ILLUSTRATION_DIMENSIONS.portrait, maxBytes: 5000000 }),
  orientation: "portrait",
  transparentBackgroundRequired: true,
  composition: "isolated chest-up or upper-torso subject with a clean small-size silhouette",
  prohibitedComposition: Object.freeze(["scenery", "card background", "decorative frame", "embedded caption"]),
});

const RAW_PROOF_SLOTS = /* illustration-proof-json-start */ [
  {"canonicalEntityId":"mlb-aaron-judge","displayName":"Aaron Judge","sport":"baseball","league":"mlb","showcaseRole":"team_representative","entityType":"athlete","teamId":"NYY","weightClass":"","series":"","tour":"","assetPath":"assets/illustrations/proof/edgeboard--mlb-aaron-judge--portrait--v01.png","fallbackRegistryId":"art-team-nyy","productionStatus":"approved","reviewStatus":"approved"},
  {"canonicalEntityId":"nba-stephen-curry","displayName":"Stephen Curry","sport":"basketball","league":"nba","showcaseRole":"team_representative","entityType":"athlete","teamId":"GSW","weightClass":"","series":"","tour":"","assetPath":"assets/illustrations/proof/edgeboard--nba-stephen-curry--portrait--v01.png","fallbackRegistryId":"art-team-gsw","productionStatus":"approved","reviewStatus":"approved"},
  {"canonicalEntityId":"ufc-islam-makhachev","displayName":"Islam Makhachev","sport":"mma","league":"ufc","showcaseRole":"weight_class_representative","entityType":"fighter","teamId":"","weightClass":"Welterweight","series":"","tour":"","assetPath":"assets/illustrations/proof/edgeboard--ufc-islam-makhachev--portrait--v01.png","fallbackRegistryId":"art-weight-mma-welterweight","productionStatus":"approved","reviewStatus":"approved"},
  {"canonicalEntityId":"nhl-auston-matthews","displayName":"Auston Matthews","sport":"ice-hockey","league":"nhl","showcaseRole":"team_representative","entityType":"athlete","teamId":"TOR","weightClass":"","series":"","tour":"","assetPath":"assets/illustrations/proof/edgeboard--nhl-auston-matthews--portrait--v01.png","fallbackRegistryId":"art-team-tor","productionStatus":"approved","reviewStatus":"approved"},
  {"canonicalEntityId":"f1-lando-norris","displayName":"Lando Norris","sport":"motorsport","league":"f1","showcaseRole":"series_representative","entityType":"driver","teamId":"MCL","weightClass":"","series":"Formula 1","tour":"","assetPath":"assets/illustrations/proof/edgeboard--f1-lando-norris--portrait--v01.png","fallbackRegistryId":"art-team-mcl","productionStatus":"approved","reviewStatus":"approved"},
  {"canonicalEntityId":"wta-coco-gauff","displayName":"Coco Gauff","sport":"tennis","league":"wta","showcaseRole":"tour_representative","entityType":"athlete","teamId":"","weightClass":"","series":"","tour":"WTA","assetPath":"assets/illustrations/proof/edgeboard--wta-coco-gauff--portrait--v01.png","fallbackRegistryId":"art-tour-wta","productionStatus":"approved","reviewStatus":"approved"}
] /* illustration-proof-json-end */;

export const AARON_JUDGE_PROOF_PRODUCTION_BRIEF = Object.freeze({
  canonicalEntityId: "mlb-aaron-judge",
  displayName: "Aaron Judge",
  styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  styleReferencePath: "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png",
  targetAssetPath: "assets/illustrations/proof/edgeboard--mlb-aaron-judge--portrait--v01.png",
  requiredFormat: ILLUSTRATION_PROOF_PRODUCTION_SPEC.format,
  requiredDimensions: ILLUSTRATION_PROOF_PRODUCTION_SPEC.dimensions,
  transparentBackgroundRequired: true,
  currentFallbackRegistryId: "art-team-nyy",
  productionPrompt: `Create one original illustrated portrait of Aaron Judge for the canonical EdgeBoard athlete mlb-aaron-judge. Explicitly use EdgeBoard Illustration Style v1 and the approved Aaron Judge panel in docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png as the visual authority for stylization, facial simplification, line hierarchy, restrained shading, natural expression, uniform treatment, and overall collection weight; do not copy or crop that panel. Depict a recognizable Aaron Judge likeness with his very tall, powerful baseball-player build communicated naturally through broad shoulders and upper-torso proportions. Use a friendly, confident natural expression with a slight head turn permitted, a baseball cap, and a clean Yankees-inspired navy, off-white, and subtle pinstripe uniform context simplified so recognition does not depend on exact trademarks, commercial logos, sponsor marks, or embedded lettering. Compose an isolated chest-up portrait on an exact 640 by 800 portrait canvas: head fully visible, upper torso and both shoulders readable, balanced crop, sufficient transparent space around the silhouette, no awkward limb cutoff, and strong readability at small card sizes. The exported athlete asset must have a transparent background with no scenery, stadium, crowd, card background, caption, decorative frame, or baked-in UI surface. ${EDGEBOARD_ILLUSTRATION_V1_PROMPT}`,
  negativeStyleSpecification: "Exclude photorealism, photographic skin or pores, realistic photographic or cinematic lighting, painterly rendering, 3D rendering, heavy texture, excessive crosshatching, caricature, anime, exaggerated comic-book anatomy, extreme shadows or highlights, glow, splatter, poster or trading-card effects, scenery, crowd, stadium, card background, decorative frame, captions, sponsor marks, and dependence on exact trademarks or logos.",
  submissionState: Object.freeze({ productionStatus: "submitted", reviewStatus: "needs_review" }),
  humanReviewChecklist: ILLUSTRATION_PROOF_HUMAN_REVIEW_CHECKLIST,
  validationCommand: "python3 scripts/validate_illustration_style_proof.py",
});

export const STEPHEN_CURRY_PROOF_PRODUCTION_BRIEF = Object.freeze({
  canonicalEntityId: "nba-stephen-curry",
  displayName: "Stephen Curry",
  styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  styleReferencePath: "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png",
  targetAssetPath: "assets/illustrations/proof/edgeboard--nba-stephen-curry--portrait--v01.png",
  requiredFormat: ILLUSTRATION_PROOF_PRODUCTION_SPEC.format,
  requiredDimensions: ILLUSTRATION_PROOF_PRODUCTION_SPEC.dimensions,
  transparentBackgroundRequired: true,
  currentFallbackRegistryId: "art-team-gsw",
  productionPrompt: `Create one original illustrated portrait of Stephen Curry for the canonical EdgeBoard athlete nba-stephen-curry. Explicitly use EdgeBoard Illustration Style v1 and the approved Stephen Curry panel in docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png as the visual authority for stylization, facial simplification, line hierarchy, restrained shading, natural expression, uniform treatment, and overall collection weight; do not copy or crop that panel. Depict a recognizable Stephen Curry likeness with a lean basketball-player build, short closely cropped hair, and a neatly trimmed beard. Use a relaxed, upbeat, confident natural expression with a slight head turn permitted, and a clean sleeveless Warriors-inspired basketball uniform context using controlled royal blue, warm gold, and off-white colors simplified so recognition does not depend on exact trademarks, commercial logos, sponsor marks, jersey lettering, or embedded text. Compose an isolated chest-up portrait on an exact 640 by 800 portrait canvas: head fully visible, upper torso and both shoulders readable, balanced crop, sufficient transparent space around the silhouette, no awkward limb cutoff, and strong readability at small card sizes. The exported athlete asset must have a transparent background with no scenery, arena, crowd, court, card background, caption, decorative frame, or baked-in UI surface. ${EDGEBOARD_ILLUSTRATION_V1_PROMPT}`,
  negativeStyleSpecification: "Exclude photorealism, photographic skin or pores, realistic photographic or cinematic lighting, painterly rendering, 3D rendering, heavy texture, excessive crosshatching, caricature, anime, exaggerated comic-book anatomy, extreme shadows or highlights, glow, splatter, poster or trading-card effects, scenery, arena, crowd, court, card background, decorative frame, captions, sponsor marks, and dependence on exact trademarks or logos.",
  submissionState: Object.freeze({ productionStatus: "submitted", reviewStatus: "needs_review" }),
  humanReviewChecklist: ILLUSTRATION_PROOF_HUMAN_REVIEW_CHECKLIST,
  validationCommand: "python3 scripts/validate_illustration_style_proof.py",
});

export const ISLAM_MAKHACHEV_PROOF_PRODUCTION_BRIEF = Object.freeze({
  canonicalEntityId: "ufc-islam-makhachev",
  displayName: "Islam Makhachev",
  styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  styleReferencePath: "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png",
  targetAssetPath: "assets/illustrations/proof/edgeboard--ufc-islam-makhachev--portrait--v01.png",
  requiredFormat: ILLUSTRATION_PROOF_PRODUCTION_SPEC.format,
  requiredDimensions: ILLUSTRATION_PROOF_PRODUCTION_SPEC.dimensions,
  transparentBackgroundRequired: true,
  currentFallbackRegistryId: "art-weight-mma-welterweight",
  productionPrompt: `Create one original illustrated portrait of Islam Makhachev for the canonical EdgeBoard fighter ufc-islam-makhachev. Explicitly use EdgeBoard Illustration Style v1 and the approved Islam Makhachev panel in docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png as the visual authority for stylization, facial simplification, line hierarchy, restrained shading, natural expression, fight-kit treatment, and overall collection weight; do not copy or crop that panel. Depict a recognizable Islam Makhachev likeness with a compact athletic fighter build, short dark hair, and a distinctive full dark beard. Use a serious, composed natural expression with a slight head turn permitted, and a simplified dark charcoal and black fight-kit context with restrained warm-gold accents so recognition does not depend on exact promotion trademarks, commercial logos, sponsor marks, or embedded lettering. An MMA glove may appear near the upper torso only if it supports the clean chest-up silhouette without obscuring the face or creating an awkward crop. Compose an isolated chest-up portrait on an exact 640 by 800 portrait canvas: head fully visible, upper torso and both shoulders readable, balanced crop, sufficient transparent space around the silhouette, and strong readability at small card sizes. The exported fighter asset must have a transparent background with no scenery, cage, arena, crowd, stadium, card background, caption, decorative frame, or baked-in UI surface. ${EDGEBOARD_ILLUSTRATION_V1_PROMPT}`,
  negativeStyleSpecification: "Exclude photorealism, photographic skin or pores, realistic photographic or cinematic lighting, painterly rendering, 3D rendering, heavy texture, excessive crosshatching, caricature, anime, exaggerated comic-book anatomy, extreme shadows or highlights, glow, splatter, poster or fight-poster effects, scenery, cage, arena, crowd, stadium, card background, decorative frame, captions, sponsor marks, and dependence on exact promotion trademarks or logos.",
  submissionState: Object.freeze({ productionStatus: "submitted", reviewStatus: "needs_review" }),
  humanReviewChecklist: ILLUSTRATION_PROOF_HUMAN_REVIEW_CHECKLIST,
  validationCommand: "python3 scripts/validate_illustration_style_proof.py",
});

export const AUSTON_MATTHEWS_PROOF_PRODUCTION_BRIEF = Object.freeze({
  canonicalEntityId: "nhl-auston-matthews",
  displayName: "Auston Matthews",
  styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  styleReferencePath: "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png",
  targetAssetPath: "assets/illustrations/proof/edgeboard--nhl-auston-matthews--portrait--v01.png",
  requiredFormat: ILLUSTRATION_PROOF_PRODUCTION_SPEC.format,
  requiredDimensions: ILLUSTRATION_PROOF_PRODUCTION_SPEC.dimensions,
  transparentBackgroundRequired: true,
  currentFallbackRegistryId: "art-team-tor",
  productionPrompt: `Create one original illustrated portrait of Auston Matthews for the canonical EdgeBoard athlete nhl-auston-matthews. Explicitly use EdgeBoard Illustration Style v1 and the approved Auston Matthews panel in docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png as the visual authority for stylization, facial simplification, line hierarchy, restrained shading, natural expression, hockey-uniform treatment, and overall collection weight; do not copy or crop that panel. Depict a recognizable Auston Matthews likeness with a strong natural hockey-player build, distinctive dark wavy hair, and his characteristic dark mustache with restrained facial-hair detail. Use a calm, confident natural expression with a slight head turn permitted, and a simplified Toronto-inspired hockey uniform context using deep royal blue and clean white with restrained silver-gray details so recognition does not depend on exact team trademarks, commercial logos, sponsor marks, jersey numbers, or embedded lettering. Compose an isolated chest-up portrait on an exact 640 by 800 portrait canvas: head fully visible, upper torso and both shoulders readable, balanced crop, sufficient transparent space around the silhouette, no awkward limb cutoff, and strong readability at small card sizes. The exported athlete asset must have a transparent background with no scenery, rink, ice, boards, arena, crowd, card background, caption, decorative frame, or baked-in UI surface. ${EDGEBOARD_ILLUSTRATION_V1_PROMPT}`,
  negativeStyleSpecification: "Exclude photorealism, photographic skin or pores, realistic photographic or cinematic lighting, painterly rendering, 3D rendering, heavy texture, excessive crosshatching, caricature, anime, exaggerated comic-book anatomy, extreme shadows or highlights, glow, splatter, poster or trading-card effects, scenery, rink, ice, boards, arena, crowd, card background, decorative frame, captions, sponsor marks, and dependence on exact team trademarks or logos.",
  submissionState: Object.freeze({ productionStatus: "submitted", reviewStatus: "needs_review" }),
  humanReviewChecklist: ILLUSTRATION_PROOF_HUMAN_REVIEW_CHECKLIST,
  validationCommand: "python3 scripts/validate_illustration_style_proof.py",
});

export const LANDO_NORRIS_PROOF_PRODUCTION_BRIEF = Object.freeze({
  canonicalEntityId: "f1-lando-norris",
  displayName: "Lando Norris",
  styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  styleReferencePath: "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png",
  targetAssetPath: "assets/illustrations/proof/edgeboard--f1-lando-norris--portrait--v01.png",
  requiredFormat: ILLUSTRATION_PROOF_PRODUCTION_SPEC.format,
  requiredDimensions: ILLUSTRATION_PROOF_PRODUCTION_SPEC.dimensions,
  transparentBackgroundRequired: true,
  currentFallbackRegistryId: "art-team-mcl",
  productionPrompt: `Create one original illustrated portrait of Lando Norris for the canonical EdgeBoard driver f1-lando-norris. Explicitly use EdgeBoard Illustration Style v1 and the approved Lando Norris panel in docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png as the visual authority for stylization, facial simplification, line hierarchy, restrained shading, natural expression, race-suit treatment, and overall collection weight; do not copy or crop that panel. Depict a recognizable Lando Norris likeness with a lean racing-driver build, youthful facial structure, and distinctive short curly-to-wavy brown hair simplified for clean small-size readability. Use a friendly, confident natural expression with a slight head turn permitted, and a simplified McLaren-inspired race-suit context using vivid papaya orange, deep charcoal black, and restrained cool-blue accents. Keep the suit graphic language clean and minimal so recognition does not depend on exact constructor trademarks, commercial logos, sponsor panels, driver numbers, or embedded lettering. Compose an isolated chest-up portrait on an exact 640 by 800 portrait canvas: head fully visible, upper torso and both shoulders readable, balanced crop, sufficient transparent space around the silhouette, no helmet obscuring the face, no awkward limb cutoff, and strong readability at small card sizes. The exported driver asset must have a transparent background with no scenery, car, track, paddock, garage, grandstand, crowd, card background, caption, decorative frame, or baked-in UI surface. ${EDGEBOARD_ILLUSTRATION_V1_PROMPT}`,
  negativeStyleSpecification: "Exclude photorealism, photographic skin or pores, realistic photographic or cinematic lighting, painterly rendering, 3D rendering, heavy texture, excessive crosshatching, caricature, anime, exaggerated comic-book anatomy, extreme shadows or highlights, glow, splatter, poster or trading-card effects, sponsor-heavy suit graphics, scenery, car, track, paddock, garage, grandstand, crowd, card background, decorative frame, captions, and dependence on exact constructor trademarks or logos.",
  submissionState: Object.freeze({ productionStatus: "submitted", reviewStatus: "needs_review" }),
  humanReviewChecklist: ILLUSTRATION_PROOF_HUMAN_REVIEW_CHECKLIST,
  validationCommand: "python3 scripts/validate_illustration_style_proof.py",
});

export const COCO_GAUFF_PROOF_PRODUCTION_BRIEF = Object.freeze({
  canonicalEntityId: "wta-coco-gauff",
  displayName: "Coco Gauff",
  styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  styleReferencePath: "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png",
  targetAssetPath: "assets/illustrations/proof/edgeboard--wta-coco-gauff--portrait--v01.png",
  requiredFormat: ILLUSTRATION_PROOF_PRODUCTION_SPEC.format,
  requiredDimensions: ILLUSTRATION_PROOF_PRODUCTION_SPEC.dimensions,
  transparentBackgroundRequired: true,
  currentFallbackRegistryId: "art-tour-wta",
  productionPrompt: `Create one original illustrated portrait of Coco Gauff for the canonical EdgeBoard athlete wta-coco-gauff. Explicitly use EdgeBoard Illustration Style v1 and the approved Coco Gauff panel in docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png as the visual authority for stylization, facial simplification, line hierarchy, restrained shading, natural expression, tennis-clothing treatment, and overall collection weight; do not copy or crop that panel. Depict a recognizable Coco Gauff likeness with a strong athletic tennis-player build and a neatly simplified braided hairstyle held by a navy headband, preserving the approved reference's readable braid silhouette without excessive strand-level texture. Use a composed, confident natural expression with a slight head turn permitted, and a clean sleeveless tennis-clothing context using deep navy, off-white, and restrained cool-gray details so recognition does not depend on exact apparel trademarks, commercial logos, sponsor marks, or embedded lettering. Compose an isolated chest-up portrait on an exact 640 by 800 portrait canvas: head and full hairstyle visible, upper torso and both shoulders readable, balanced crop, sufficient transparent space around the silhouette, no tennis racket or limb creating an awkward crop, and strong readability at small card sizes. The exported athlete asset must have a transparent background with no scenery, court, net, stadium, crowd, card background, caption, decorative frame, or baked-in UI surface. ${EDGEBOARD_ILLUSTRATION_V1_PROMPT}`,
  negativeStyleSpecification: "Exclude photorealism, photographic skin or pores, realistic photographic or cinematic lighting, painterly rendering, 3D rendering, heavy texture, excessive braid or strand detail, excessive crosshatching, caricature, anime, exaggerated comic-book anatomy, extreme shadows or highlights, glow, splatter, poster or trading-card effects, scenery, court, net, stadium, crowd, card background, decorative frame, captions, sponsor marks, and dependence on exact apparel trademarks or logos.",
  submissionState: Object.freeze({ productionStatus: "submitted", reviewStatus: "needs_review" }),
  humanReviewChecklist: ILLUSTRATION_PROOF_HUMAN_REVIEW_CHECKLIST,
  validationCommand: "python3 scripts/validate_illustration_style_proof.py",
});

export const ILLUSTRATION_PROOF_PRODUCTION_BRIEFS = Object.freeze([
  AARON_JUDGE_PROOF_PRODUCTION_BRIEF, STEPHEN_CURRY_PROOF_PRODUCTION_BRIEF,
  ISLAM_MAKHACHEV_PROOF_PRODUCTION_BRIEF, AUSTON_MATTHEWS_PROOF_PRODUCTION_BRIEF,
  LANDO_NORRIS_PROOF_PRODUCTION_BRIEF, COCO_GAUFF_PROOF_PRODUCTION_BRIEF,
]);

const PRODUCTION_BRIEFS = new Map(ILLUSTRATION_PROOF_PRODUCTION_BRIEFS.map((brief) => [brief.canonicalEntityId, brief]));

function proofSlot(slot) {
  const productionStatus = slot.productionStatus || "awaiting_asset";
  const reviewStatus = slot.reviewStatus || "awaiting_asset";
  const reviewMetadata = Object.freeze(Object.fromEntries(ILLUSTRATION_PROOF_QA_FIELDS.map((field) => [field, reviewStatus])));
  const approved = productionStatus === "approved" && reviewStatus === "approved";
  return Object.freeze({
    ...slot,
    variant: "portrait",
    expectedFileType: ILLUSTRATION_PROOF_PRODUCTION_SPEC.format,
    expectedDimensions: ILLUSTRATION_PROOF_PRODUCTION_SPEC.dimensions,
    transparentBackgroundRequired: ILLUSTRATION_PROOF_PRODUCTION_SPEC.transparentBackgroundRequired,
    styleReferenceApproved: true,
    styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
    qaStyleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
    realismDrift: approved ? "none" : null,
    productionStatus,
    reviewStatus,
    reviewMetadata,
    registryEligible: approved,
    styleRole: "production_proof_exemplar",
    source: "edgeboard_original",
    productionBrief: PRODUCTION_BRIEFS.get(slot.canonicalEntityId) || null,
    registryDraft: Object.freeze({
      id: `art-${slot.canonicalEntityId}-portrait`, canonicalEntityId: slot.canonicalEntityId,
      entityType: slot.entityType, sport: slot.sport, league: slot.league, teamId: slot.teamId,
      weightClass: slot.weightClass, series: slot.series, tour: slot.tour,
      assetPath: slot.assetPath, assetType: "original_manual", variant: "portrait",
      priority: 110, status: "awaiting_asset", source: "edgeboard_original",
      styleRole: "production_proof_exemplar",
      styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
      altText: `${slot.displayName} editorial illustration`,
    }),
  });
}

export const ILLUSTRATION_STYLE_PROOF_BATCH = Object.freeze(RAW_PROOF_SLOTS.map(proofSlot));
