import { ILLUSTRATION_REGISTRY } from "../../src/config/illustration-registry.js";
import { EDGEBOARD_ILLUSTRATION_STYLE_VERSION, EDGEBOARD_ILLUSTRATION_V1_PROMPT } from "../../src/config/illustration-style-v1.js";

export const MLB_SHOWCASE_BATCH_1_METADATA = Object.freeze({
  id: "edgeboard-illustration-showcase-batch-1-mlb",
  styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  leagueId: "mlb",
  sportId: "baseball",
  requiredTeamCount: 30,
  showcaseRole: "team_representative",
  selectionEffectiveFrom: "2026-08-09",
  rosterVerifiedAt: "2026-08-09T14:30:00.000Z",
  rosterVerificationSource: "Official MLB 2026 team and 40-man roster endpoints",
  selectionDisclosure: "Editorial showcase assignments for production planning; not best-player rankings and replaceable without changing canonical identity.",
  portraitsRequiredBeforeActions: true,
  productionFormat: "png",
  productionDimensions: Object.freeze({ width: 640, height: 800 }),
  requiredColorModel: "8-bit RGBA",
  transparentBackgroundRequired: true,
  portraitMode: "standard",
  approvedExactCount: 30,
  awaitingAssetCount: 0,
  needsRevisionCount: 0,
  productionBatch1Status: Object.freeze({ physical: 6, technicallyValid: 6, humanApproved: 6, registryActive: 6 }),
  productionBatch2Status: Object.freeze({ physical: 6, technicallyValid: 6, humanApproved: 6, registryActive: 6 }),
  productionBatch3Status: Object.freeze({ physical: 6, technicallyValid: 6, humanApproved: 6, registryActive: 6 }),
  productionBatch4Status: Object.freeze({ physical: 6, technicallyValid: 6, humanApproved: 6, registryActive: 6 }),
  productionBatch5Status: Object.freeze({ supplied: 5, physical: 5, technicallyValid: 5, humanApproved: 5, registryActive: 5, needsRevision: 0 }),
  reviewAuthorities: Object.freeze([
    "docs/assets/illustration-style/edgeboard-illustration-style-v1-reference.png",
    "six active production_proof_exemplar portraits",
  ]),
});

// JSON-compatible for the production-readiness report. These are editorial
// assignments, not claims that a player is the best member of the team.
const RAW_MLB_SHOWCASE_SLOTS = /* mlb-showcase-json-start */ [
  {"canonicalAthleteId":"mlb-brent-rooker","displayName":"Brent Rooker","canonicalTeamId":"MLB-ATH","teamDisplayName":"Athletics","position":"Designated hitter","portraitPose":"waist-up three-quarter batting portrait with a bat resting behind the shoulder","physicalCharacteristics":"powerful athletic build, short dark hair, and close facial hair","uniformColorContext":"simplified deep green, muted gold, and off-white baseball uniform without logos","actionDescription":"controlled right-handed batting follow-through"},
  {"canonicalAthleteId":"mlb-paul-skenes","displayName":"Paul Skenes","canonicalTeamId":"MLB-PIT","teamDisplayName":"Pittsburgh Pirates","position":"Pitcher","portraitPose":"waist-up three-quarter pitching portrait holding a baseball at chest height","physicalCharacteristics":"very tall athletic build, dark hair, and a distinct dark mustache","uniformColorContext":"simplified black, muted gold, and off-white pitching uniform without logos","actionDescription":"power pitching delivery at front-foot plant"},
  {"canonicalAthleteId":"mlb-fernando-tatis-jr","displayName":"Fernando Tatis Jr.","canonicalTeamId":"MLB-SD","teamDisplayName":"San Diego Padres","position":"Outfielder","portraitPose":"waist-up confident three-quarter portrait with batting gloves and bat held low","physicalCharacteristics":"lean muscular build, long dark locs, and expressive athletic posture","uniformColorContext":"simplified deep brown, muted gold, and off-white uniform without logos","actionDescription":"explosive outfield-to-batting transition with one clear motion axis"},
  {"canonicalAthleteId":"mlb-cal-raleigh","displayName":"Cal Raleigh","canonicalTeamId":"MLB-SEA","teamDisplayName":"Seattle Mariners","position":"Catcher","portraitPose":"chest-up three-quarter catcher portrait with mask held at the side","physicalCharacteristics":"sturdy catcher build, short brown hair, and close beard","uniformColorContext":"simplified deep navy, restrained teal, silver-gray, and off-white catching gear without logos","actionDescription":"rising from a receiving crouch into a compact throwing pose"},
  {"canonicalAthleteId":"mlb-rafael-devers","displayName":"Rafael Devers","canonicalTeamId":"MLB-SF","teamDisplayName":"San Francisco Giants","position":"First baseman","portraitPose":"waist-up left-handed hitter portrait with relaxed bat and slight three-quarter turn","physicalCharacteristics":"stocky powerful build, close-cropped dark hair, and trimmed facial hair","uniformColorContext":"simplified charcoal, warm orange, and off-white uniform without logos","actionDescription":"left-handed batting follow-through with balanced lower body"},
  {"canonicalAthleteId":"mlb-masyn-winn","displayName":"Masyn Winn","canonicalTeamId":"MLB-STL","teamDisplayName":"St. Louis Cardinals","position":"Shortstop","portraitPose":"waist-up three-quarter infield portrait with glove open at the waist","physicalCharacteristics":"lean athletic build, short dark hair, and alert infield posture","uniformColorContext":"simplified deep red, navy, and warm off-white uniform without logos","actionDescription":"shortstop backhand fielding motion preparing to throw"},
  {"canonicalAthleteId":"mlb-junior-caminero","displayName":"Junior Caminero","canonicalTeamId":"MLB-TB","teamDisplayName":"Tampa Bay Rays","position":"Third baseman","portraitPose":"waist-up three-quarter batting portrait with bat upright beside the shoulder","physicalCharacteristics":"powerful athletic build, close-cropped dark hair, and broad shoulders","uniformColorContext":"simplified deep navy, soft blue, and off-white uniform without logos","actionDescription":"third-base fielding setup transitioning into an across-diamond throw"},
  {"canonicalAthleteId":"mlb-corey-seager","displayName":"Corey Seager","canonicalTeamId":"MLB-TEX","teamDisplayName":"Texas Rangers","position":"Shortstop","portraitPose":"waist-up left-handed hitter portrait in a calm three-quarter stance","physicalCharacteristics":"tall athletic build, short light-brown hair, and trimmed beard","uniformColorContext":"simplified royal blue, restrained red, and off-white uniform without logos","actionDescription":"smooth left-handed batting follow-through"},
  {"canonicalAthleteId":"mlb-vladimir-guerrero-jr","displayName":"Vladimir Guerrero Jr.","canonicalTeamId":"MLB-TOR","teamDisplayName":"Toronto Blue Jays","position":"First baseman","portraitPose":"waist-up three-quarter power-hitter portrait with bat resting across the rear shoulder","physicalCharacteristics":"broad powerful build, long dark braids or locs, and full facial hair","uniformColorContext":"simplified royal blue, soft blue, and off-white uniform without logos","actionDescription":"compact right-handed power swing through contact"},
  {"canonicalAthleteId":"mlb-byron-buxton","displayName":"Byron Buxton","canonicalTeamId":"MLB-MIN","teamDisplayName":"Minnesota Twins","position":"Outfielder","portraitPose":"waist-up three-quarter outfield portrait with glove held near the hip","physicalCharacteristics":"lean rangy build, short dark hair, and poised athletic posture","uniformColorContext":"simplified deep navy, restrained red, and off-white uniform without logos","actionDescription":"center-field running catch with controlled extension"},
  {"canonicalAthleteId":"mlb-bryce-harper","displayName":"Bryce Harper","canonicalTeamId":"MLB-PHI","teamDisplayName":"Philadelphia Phillies","position":"First baseman","portraitPose":"waist-up left-handed hitter portrait with bat angled behind the shoulder","physicalCharacteristics":"muscular build, swept-back dark hair, and thick beard","uniformColorContext":"simplified deep red, muted blue, and warm off-white uniform without logos","actionDescription":"forceful left-handed batting follow-through"},
  {"canonicalAthleteId":"mlb-ronald-acuna-jr","displayName":"Ronald Acuña Jr.","canonicalTeamId":"MLB-ATL","teamDisplayName":"Atlanta Braves","position":"Outfielder","portraitPose":"waist-up confident three-quarter portrait with bat held low and relaxed","physicalCharacteristics":"lean muscular build, dark braids or locs, and trimmed facial hair","uniformColorContext":"simplified deep navy, red, and off-white uniform without logos","actionDescription":"athletic right-handed swing beginning a running transition"},
  {"canonicalAthleteId":"mlb-munetaka-murakami","displayName":"Munetaka Murakami","canonicalTeamId":"MLB-CWS","teamDisplayName":"Chicago White Sox","position":"First baseman","portraitPose":"waist-up left-handed power-hitter portrait with bat vertical beside the shoulder","physicalCharacteristics":"sturdy powerful build, short dark hair, and composed expression","uniformColorContext":"simplified black, silver-gray, and off-white uniform without logos","actionDescription":"left-handed power swing through the hitting zone"},
  {"canonicalAthleteId":"mlb-sandy-alcantara","displayName":"Sandy Alcantara","canonicalTeamId":"MLB-MIA","teamDisplayName":"Miami Marlins","position":"Pitcher","portraitPose":"waist-up three-quarter pitching portrait with glove and baseball together at chest height","physicalCharacteristics":"tall lean build, close-cropped dark hair, and trimmed facial hair","uniformColorContext":"simplified charcoal, restrained teal, coral accent, and off-white uniform without logos","actionDescription":"long athletic pitching delivery approaching release"},
  {"canonicalAthleteId":"mlb-aaron-judge","displayName":"Aaron Judge","canonicalTeamId":"NYY","teamDisplayName":"New York Yankees","position":"Outfielder","portraitPose":"waist-up three-quarter power-hitter portrait with bat resting behind the shoulder","physicalCharacteristics":"exceptionally tall broad athletic build and close-cropped dark hair","uniformColorContext":"simplified deep navy, charcoal, and off-white pinstripe-inspired uniform without logos","actionDescription":"powerful right-handed batting follow-through"},
  {"canonicalAthleteId":"mlb-christian-yelich","displayName":"Christian Yelich","canonicalTeamId":"MLB-MIL","teamDisplayName":"Milwaukee Brewers","position":"Designated hitter","portraitPose":"waist-up left-handed hitter portrait with relaxed bat and narrow three-quarter stance","physicalCharacteristics":"tall lean build, short dark hair, and light facial hair","uniformColorContext":"simplified deep navy, muted gold, and off-white uniform without logos","actionDescription":"fluid left-handed batting follow-through"},
  {"canonicalAthleteId":"mlb-mike-trout","displayName":"Mike Trout","canonicalTeamId":"MLB-LAA","teamDisplayName":"Los Angeles Angels","position":"Outfielder","portraitPose":"waist-up three-quarter outfielder portrait with glove under one arm","physicalCharacteristics":"muscular athletic build, short light-brown hair, and strong jawline","uniformColorContext":"simplified deep red, charcoal, and off-white uniform without logos","actionDescription":"center-field tracking pose moving into a catch"},
  {"canonicalAthleteId":"mlb-corbin-carroll","displayName":"Corbin Carroll","canonicalTeamId":"MLB-AZ","teamDisplayName":"Arizona Diamondbacks","position":"Outfielder","portraitPose":"waist-up three-quarter batting portrait with compact bat position","physicalCharacteristics":"compact athletic build, short brown hair, and clean-shaven youthful features","uniformColorContext":"simplified deep red, charcoal, sand, and off-white uniform without logos","actionDescription":"quick left-handed swing transitioning out of the batter's box"},
  {"canonicalAthleteId":"mlb-gunnar-henderson","displayName":"Gunnar Henderson","canonicalTeamId":"MLB-BAL","teamDisplayName":"Baltimore Orioles","position":"Shortstop","portraitPose":"waist-up left-handed hitter portrait with glove tucked beneath the opposite arm","physicalCharacteristics":"tall athletic build, medium light-brown hair, and light beard","uniformColorContext":"simplified black, warm orange, and off-white uniform without logos","actionDescription":"shortstop fielding motion with a strong planted throw"},
  {"canonicalAthleteId":"mlb-garrett-crochet","displayName":"Garrett Crochet","canonicalTeamId":"MLB-BOS","teamDisplayName":"Boston Red Sox","position":"Pitcher","portraitPose":"waist-up three-quarter left-handed pitching portrait holding the baseball inside the glove","physicalCharacteristics":"very tall lean build, short brown hair, and visible facial hair","uniformColorContext":"simplified deep red, navy, and off-white pitching uniform without logos","actionDescription":"left-handed pitching delivery at high leg lift"},
  {"canonicalAthleteId":"mlb-pete-crow-armstrong","displayName":"Pete Crow-Armstrong","canonicalTeamId":"MLB-CHC","teamDisplayName":"Chicago Cubs","position":"Outfielder","portraitPose":"waist-up energetic three-quarter outfield portrait with glove near the chest","physicalCharacteristics":"lean athletic build, medium brown hair, and light stubble","uniformColorContext":"simplified royal blue, restrained red, and off-white uniform without logos","actionDescription":"center-field diving-catch approach with believable body alignment"},
  {"canonicalAthleteId":"mlb-elly-de-la-cruz","displayName":"Elly De La Cruz","canonicalTeamId":"MLB-CIN","teamDisplayName":"Cincinnati Reds","position":"Shortstop","portraitPose":"waist-up switch-hitter portrait with a tall relaxed stance and bat held low","physicalCharacteristics":"exceptionally tall lean build and long dark braids or locs","uniformColorContext":"simplified deep red, black, and off-white uniform without logos","actionDescription":"long-stride infield play transitioning into a throw"},
  {"canonicalAthleteId":"mlb-jose-ramirez","displayName":"José Ramírez","canonicalTeamId":"MLB-CLE","teamDisplayName":"Cleveland Guardians","position":"Third baseman","portraitPose":"waist-up switch-hitter portrait with compact bat position and slight three-quarter turn","physicalCharacteristics":"compact powerful build, short dark hair, and close facial hair","uniformColorContext":"simplified deep navy, restrained red, and off-white uniform without logos","actionDescription":"compact third-base fielding motion into a quick throw"},
  {"canonicalAthleteId":"mlb-ezequiel-tovar","displayName":"Ezequiel Tovar","canonicalTeamId":"MLB-COL","teamDisplayName":"Colorado Rockies","position":"Shortstop","portraitPose":"waist-up three-quarter infield portrait with glove open at waist height","physicalCharacteristics":"lean athletic build, short dark hair, and alert expression","uniformColorContext":"simplified deep purple, charcoal, silver-gray, and off-white uniform without logos","actionDescription":"shortstop lateral fielding move with balanced throwing setup"},
  {"canonicalAthleteId":"mlb-riley-greene","displayName":"Riley Greene","canonicalTeamId":"DET","teamDisplayName":"Detroit Tigers","position":"Outfielder","portraitPose":"waist-up left-handed hitter portrait with glove and bat represented sparingly","physicalCharacteristics":"athletic build, short brown hair, and trimmed facial hair","uniformColorContext":"simplified deep navy, charcoal, and off-white uniform without logos","actionDescription":"left-handed batting follow-through with controlled rotation"},
  {"canonicalAthleteId":"mlb-jose-altuve","displayName":"José Altuve","canonicalTeamId":"MLB-HOU","teamDisplayName":"Houston Astros","position":"Second baseman","portraitPose":"waist-up three-quarter infield portrait with glove near the waist","physicalCharacteristics":"compact athletic build, short dark hair, and close beard","uniformColorContext":"simplified deep navy, warm orange, and off-white uniform without logos","actionDescription":"second-base fielding transfer into a quick throw"},
  {"canonicalAthleteId":"mlb-bobby-witt-jr","displayName":"Bobby Witt Jr.","canonicalTeamId":"MLB-KC","teamDisplayName":"Kansas City Royals","position":"Shortstop","portraitPose":"waist-up three-quarter infield portrait with glove tucked under one arm","physicalCharacteristics":"tall athletic build, short light-brown hair, and clean facial lines","uniformColorContext":"simplified royal blue, pale blue, and off-white uniform without logos","actionDescription":"athletic shortstop backhand and across-body throw"},
  {"canonicalAthleteId":"mlb-shohei-ohtani","displayName":"Shohei Ohtani","canonicalTeamId":"LAD","teamDisplayName":"Los Angeles Dodgers","position":"Two-way player","portraitPose":"waist-up three-quarter baseball portrait with bat held upright and pitcher's glove secondary","physicalCharacteristics":"tall powerful athletic build, short dark hair, and clean-shaven facial structure","uniformColorContext":"simplified royal blue, restrained red, and off-white uniform without logos","actionDescription":"left-handed batting follow-through; do not combine a pitching motion into the same action axis"},
  {"canonicalAthleteId":"mlb-james-wood","displayName":"James Wood","canonicalTeamId":"MLB-WSH","teamDisplayName":"Washington Nationals","position":"Outfielder","portraitPose":"waist-up left-handed hitter portrait with a long relaxed stance","physicalCharacteristics":"exceptionally tall lean power-hitter build and short dark hair","uniformColorContext":"simplified deep red, navy, and off-white uniform without logos","actionDescription":"long-lever left-handed batting follow-through"},
  {"canonicalAthleteId":"mlb-juan-soto","displayName":"Juan Soto","canonicalTeamId":"NYM","teamDisplayName":"New York Mets","position":"Outfielder","portraitPose":"waist-up left-handed hitter portrait with bat near the shoulder and confident three-quarter orientation","physicalCharacteristics":"strong athletic build, short dark hair, and trimmed beard","uniformColorContext":"simplified royal blue, warm orange, and off-white uniform without logos","actionDescription":"controlled left-handed batting follow-through with strong plate balance"}
] /* mlb-showcase-json-end */;

const PORTRAIT_STYLE = EDGEBOARD_ILLUSTRATION_V1_PROMPT;
const PROOF_EXEMPLAR_REVIEW = "Review the finished portrait against the approved EdgeBoard Illustration Style v1 reference sheet and all six active production proof exemplars.";
const ACTION_STYLE = "Match the approved portrait exactly in facial structure, build, line hierarchy, shading, and color treatment. Keep one readable action axis, plausible baseball technique, transparent background, restrained motion marks, no logos, no text, and no invented achievement context.";

function slugPath(canonicalAthleteId, variant) {
  return `assets/illustrations/mlb/edgeboard--${canonicalAthleteId}--${variant}--v01.png`;
}

export const MLB_SHOWCASE_PRODUCTION_BATCHES = Object.freeze([
  Object.freeze({ batchNumber: 1, canonicalAthleteIds: Object.freeze(["mlb-paul-skenes", "mlb-cal-raleigh", "mlb-elly-de-la-cruz", "mlb-shohei-ohtani", "mlb-ronald-acuna-jr", "mlb-jose-ramirez"]) }),
  Object.freeze({ batchNumber: 2, canonicalAthleteIds: Object.freeze(["mlb-brent-rooker", "mlb-bryce-harper", "mlb-garrett-crochet", "mlb-fernando-tatis-jr", "mlb-bobby-witt-jr", "mlb-sandy-alcantara"]) }),
  Object.freeze({ batchNumber: 3, canonicalAthleteIds: Object.freeze(["mlb-vladimir-guerrero-jr", "mlb-gunnar-henderson", "mlb-corbin-carroll", "mlb-corey-seager", "mlb-jose-altuve", "mlb-pete-crow-armstrong"]) }),
  Object.freeze({ batchNumber: 4, canonicalAthleteIds: Object.freeze(["mlb-rafael-devers", "mlb-mike-trout", "mlb-christian-yelich", "mlb-byron-buxton", "mlb-junior-caminero", "mlb-munetaka-murakami"]) }),
  Object.freeze({ batchNumber: 5, canonicalAthleteIds: Object.freeze(["mlb-masyn-winn", "mlb-ezequiel-tovar", "mlb-riley-greene", "mlb-james-wood", "mlb-juan-soto"]) }),
]);
const PRODUCTION_BATCH_BY_ATHLETE = new Map(MLB_SHOWCASE_PRODUCTION_BATCHES.flatMap((batch) => batch.canonicalAthleteIds.map((id) => [id, batch.batchNumber])));
const NEEDS_REVISION_ATHLETE_IDS = new Set();

function buildSlot(slot) {
  const portraitAssetPath = slugPath(slot.canonicalAthleteId, "portrait");
  const actionAssetPathPlaceholder = slugPath(slot.canonicalAthleteId, "action");
  const fallbackRegistryId = `art-team-${slot.canonicalTeamId.toLowerCase()}`;
  const activeExact = ILLUSTRATION_REGISTRY.find((entry) => entry.status === "active" && entry.entityType === "athlete" && entry.canonicalEntityId === slot.canonicalAthleteId && entry.variant === "portrait");
  const needsRevision = NEEDS_REVISION_ATHLETE_IDS.has(slot.canonicalAthleteId);
  const productionBatch = slot.canonicalAthleteId === "mlb-aaron-judge" ? 0 : PRODUCTION_BATCH_BY_ATHLETE.get(slot.canonicalAthleteId);
  const registryDraft = activeExact ? Object.freeze({ ...activeExact, status: "active_existing_reference" }) : Object.freeze({
    id: `art-${slot.canonicalAthleteId}-portrait`, entityType: "athlete",
    canonicalEntityId: slot.canonicalAthleteId, sport: "baseball", league: "mlb",
    teamId: slot.canonicalTeamId, assetPath: portraitAssetPath,
    assetType: "original_manual", variant: "portrait", priority: 90,
    fallbackGroup: `team:${slot.canonicalTeamId}`, status: "planned",
    source: "edgeboard_original", altText: `${slot.displayName} editorial illustration`,
    styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  });
  return Object.freeze({
    ...slot,
    styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
    showcaseRole: "team_representative",
    portraitAssetPath: activeExact?.assetPath || portraitAssetPath,
    productionTargetPath: activeExact?.assetPath || portraitAssetPath,
    actionAssetPathPlaceholder,
    productionBatch,
    productionStatus: activeExact ? "approved" : needsRevision ? "needs_revision" : "awaiting_asset",
    generationStatus: activeExact ? "approved_existing" : needsRevision ? "needs_revision" : "awaiting_asset",
    actionGenerationStatus: "deferred_until_portraits_complete",
    reviewStatus: activeExact ? "approved" : needsRevision ? "needs_revision" : "awaiting_asset",
    identityReferenceReviewStatus: activeExact ? "approved_existing" : "required_before_generation",
    sourceType: activeExact ? "edgeboard_original_existing" : "edgeboard_original_planned",
    selectionEffectiveFrom: MLB_SHOWCASE_BATCH_1_METADATA.selectionEffectiveFrom,
    fallback: Object.freeze({
      hierarchy: Object.freeze(["exact_athlete", "team", "generic_baseball", "neutral"]),
      currentExpectedLevel: activeExact ? "exact" : "team",
      teamFallbackRegistryId: fallbackRegistryId,
      baseballFallbackRegistryId: "art-generic-baseball",
      neutralFallbackRegistryId: "art-placeholder-neutral",
    }),
    portraitMode: "standard",
    portraitPrompt: `Create an original standard editorial portrait of ${slot.displayName}, a current MLB ${slot.position} assigned as the replaceable ${slot.teamDisplayName} team representative. Use a non-action chest/upper-torso composition, centered or near-centered, with the full head and shoulders visible, a simple natural posture, consistent apparent subject scale, no batting stance, pitching motion, glove-up action, swing, run, or complex equipment pose, and a clean transparent background. Recognizable production characteristics to confirm against an approved factual reference package: ${slot.physicalCharacteristics}. Uniform context: ${slot.uniformColorContext}. Do not reproduce or trace any existing photograph or artwork. ${PORTRAIT_STYLE} ${PROOF_EXEMPLAR_REVIEW}`,
    actionPrompt: `Create an optional original action variant of ${slot.displayName}, MLB ${slot.position}: ${slot.actionDescription}. Do not reproduce or trace an existing photograph. ${ACTION_STYLE}`,
    registryDraft,
  });
}

export const MLB_SHOWCASE_BATCH_1 = Object.freeze(RAW_MLB_SHOWCASE_SLOTS.map(buildSlot));

export function validateMlbShowcaseBatch(entries = MLB_SHOWCASE_BATCH_1, { canonicalEntities = [], illustrationEntries = ILLUSTRATION_REGISTRY } = {}) {
  const errors = [];
  const teams = new Set(); const athletes = new Set(); const plannedPaths = new Set();
  const canonicalById = new Map(canonicalEntities.map((item) => [item.id, item]));
  const illustrationIds = new Set(illustrationEntries.map((item) => item.id));
  if (entries.length !== MLB_SHOWCASE_BATCH_1_METADATA.requiredTeamCount) errors.push(`Expected 30 MLB showcase slots; received ${entries.length}.`);
  entries.forEach((entry) => {
    if (teams.has(entry.canonicalTeamId)) errors.push(`Duplicate MLB team slot: ${entry.canonicalTeamId}.`);
    if (athletes.has(entry.canonicalAthleteId)) errors.push(`Duplicate MLB athlete slot: ${entry.canonicalAthleteId}.`);
    teams.add(entry.canonicalTeamId); athletes.add(entry.canonicalAthleteId);
    const athlete = canonicalById.get(entry.canonicalAthleteId); const team = canonicalById.get(entry.canonicalTeamId);
    if (canonicalEntities.length && (!athlete || athlete.sportId !== "baseball" || athlete.leagueId !== "mlb" || athlete.teamId !== entry.canonicalTeamId)) errors.push(`Missing or inconsistent canonical athlete mapping: ${entry.canonicalAthleteId}.`);
    if (canonicalEntities.length && (!team || team.entityType !== "team" || team.sportId !== "baseball" || team.leagueId !== "mlb")) errors.push(`Missing canonical MLB team mapping: ${entry.canonicalTeamId}.`);
    if (entry.showcaseRole !== "team_representative") errors.push(`Invalid showcase role: ${entry.canonicalAthleteId}.`);
    if (!entry.portraitPrompt || !entry.actionPrompt || !entry.portraitAssetPath || !entry.actionAssetPathPlaceholder) errors.push(`Incomplete production manifest: ${entry.canonicalAthleteId}.`);
    const activeExisting = illustrationIds.has(entry.registryDraft.id);
    if (activeExisting && (entry.productionStatus !== "approved" || entry.reviewStatus !== "approved" || entry.registryDraft.status !== "active_existing_reference")) errors.push(`Approved portrait state is not preserved: ${entry.canonicalAthleteId}.`);
    if (!activeExisting && (!["awaiting_asset", "needs_revision"].includes(entry.productionStatus) || entry.reviewStatus !== entry.productionStatus || entry.registryDraft.status !== "planned")) errors.push(`Inactive portrait state is invalid: ${entry.canonicalAthleteId}.`);
    if (!activeExisting && (!entry.productionTargetPath.endsWith(`edgeboard--${entry.canonicalAthleteId}--portrait--v01.png`) || plannedPaths.has(entry.productionTargetPath))) errors.push(`Missing or duplicate canonical PNG target: ${entry.canonicalAthleteId}.`);
    if (!activeExisting) plannedPaths.add(entry.productionTargetPath);
    if (entry.styleVersion !== EDGEBOARD_ILLUSTRATION_STYLE_VERSION || entry.registryDraft.styleVersion !== EDGEBOARD_ILLUSTRATION_STYLE_VERSION) errors.push(`Style v1 assignment is missing: ${entry.canonicalAthleteId}.`);
    if (!illustrationIds.has(entry.fallback.teamFallbackRegistryId) || !illustrationIds.has(entry.fallback.baseballFallbackRegistryId) || !illustrationIds.has(entry.fallback.neutralFallbackRegistryId)) errors.push(`Incomplete fallback chain: ${entry.canonicalAthleteId}.`);
  });
  const productionIds = MLB_SHOWCASE_PRODUCTION_BATCHES.flatMap((batch) => batch.canonicalAthleteIds);
  if (productionIds.length !== 29 || new Set(productionIds).size !== 29 || productionIds.includes("mlb-aaron-judge")) errors.push("Production batches must contain each of the 29 non-proof athletes exactly once and exclude Aaron Judge.");
  if (productionIds.some((id) => !athletes.has(id))) errors.push("Production batches contain an athlete outside the canonical MLB showcase manifest.");
  return Object.freeze({
    valid: errors.length === 0, errors: Object.freeze(errors), required: 30,
    assigned: entries.length, uniqueAthletes: athletes.size, uniqueTeams: teams.size,
    portraitPrompts: entries.filter((item) => item.portraitPrompt).length,
    actionPrompts: entries.filter((item) => item.actionPrompt).length,
    registryReady: entries.filter((item) => ["planned", "active_existing_reference"].includes(item.registryDraft.status)).length,
    exactApproved: entries.filter((item) => item.productionStatus === "approved" && item.reviewStatus === "approved").length,
    awaitingAsset: entries.filter((item) => item.productionStatus === "awaiting_asset" && item.reviewStatus === "awaiting_asset").length,
    needsRevision: entries.filter((item) => item.productionStatus === "needs_revision" && item.reviewStatus === "needs_revision").length,
    fallbackCovered: entries.filter((item) => illustrationIds.has(item.fallback.teamFallbackRegistryId) && illustrationIds.has(item.fallback.baseballFallbackRegistryId) && illustrationIds.has(item.fallback.neutralFallbackRegistryId)).length,
    batch1: Object.freeze({
      physical: entries.filter((item) => item.productionBatch === 1 && item.productionStatus === "approved").length,
      technicallyValid: entries.filter((item) => item.productionBatch === 1 && item.productionStatus === "approved").length,
      humanApproved: entries.filter((item) => item.productionBatch === 1 && item.reviewStatus === "approved").length,
      registryActive: entries.filter((item) => item.productionBatch === 1 && item.registryDraft.status === "active_existing_reference").length,
    }),
    batch2: Object.freeze({
      physical: entries.filter((item) => item.productionBatch === 2 && item.productionStatus === "approved").length,
      technicallyValid: entries.filter((item) => item.productionBatch === 2 && item.productionStatus === "approved").length,
      humanApproved: entries.filter((item) => item.productionBatch === 2 && item.reviewStatus === "approved").length,
      registryActive: entries.filter((item) => item.productionBatch === 2 && item.registryDraft.status === "active_existing_reference").length,
    }),
    batch3: Object.freeze({
      physical: entries.filter((item) => item.productionBatch === 3 && item.productionStatus === "approved").length,
      technicallyValid: entries.filter((item) => item.productionBatch === 3 && item.productionStatus === "approved").length,
      humanApproved: entries.filter((item) => item.productionBatch === 3 && item.reviewStatus === "approved").length,
      registryActive: entries.filter((item) => item.productionBatch === 3 && item.registryDraft.status === "active_existing_reference").length,
    }),
    batch4: Object.freeze({
      physical: entries.filter((item) => item.productionBatch === 4 && item.productionStatus === "approved").length,
      technicallyValid: entries.filter((item) => item.productionBatch === 4 && item.productionStatus === "approved").length,
      humanApproved: entries.filter((item) => item.productionBatch === 4 && item.reviewStatus === "approved").length,
      registryActive: entries.filter((item) => item.productionBatch === 4 && item.registryDraft.status === "active_existing_reference").length,
    }),
    batch5: Object.freeze({
      supplied: entries.filter((item) => item.productionBatch === 5 && ["approved", "needs_revision"].includes(item.productionStatus)).length,
      physical: entries.filter((item) => item.productionBatch === 5 && item.productionStatus === "approved").length,
      technicallyValid: entries.filter((item) => item.productionBatch === 5 && item.productionStatus === "approved").length,
      humanApproved: entries.filter((item) => item.productionBatch === 5 && ["approved", "needs_revision"].includes(item.reviewStatus)).length,
      registryActive: entries.filter((item) => item.productionBatch === 5 && item.registryDraft.status === "active_existing_reference").length,
      needsRevision: entries.filter((item) => item.productionBatch === 5 && item.productionStatus === "needs_revision").length,
    }),
    productionBatchCounts: Object.freeze(Object.fromEntries(MLB_SHOWCASE_PRODUCTION_BATCHES.map((batch) => [batch.batchNumber, entries.filter((item) => item.productionBatch === batch.batchNumber).length]))),
  });
}
