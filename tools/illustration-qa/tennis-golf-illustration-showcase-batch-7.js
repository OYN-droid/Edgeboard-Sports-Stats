import { ILLUSTRATION_REGISTRY } from "../../src/config/illustration-registry.js";
import { SPORTS_REGISTRY } from "../../src/config/sports-registry.js";
import { EDGEBOARD_ILLUSTRATION_STYLE_VERSION, EDGEBOARD_ILLUSTRATION_V1_PROMPT } from "../../src/config/illustration-style-v1.js";

export const TENNIS_GOLF_SHOWCASE_BATCH_7_METADATA = Object.freeze({
  id: "edgeboard-illustration-showcase-batch-7-tennis-golf",
  styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  configuredTourIds: Object.freeze(["atp", "wta", "pga", "lpga"]),
  requiredTourCounts: Object.freeze({ atp: 6, wta: 6, pga: 6, lpga: 6 }),
  requiredSlotCount: 24,
  showcaseRole: "tour_representative",
  selectionEffectiveFrom: "2026-08-09",
  rosterVerifiedAt: "2026-08-09T23:00:00.000Z",
  selectionDisclosure: "Replaceable editorial production assignments spanning rankings and major-event relevance; not rankings, endorsements, or part of athlete identity.",
  portraitsRequiredBeforeActions: true,
  portraitMode: "standard",
});

// JSON-compatible for the focused production-readiness report.
const RAW_TENNIS_GOLF_SHOWCASE_SLOTS = /* tennis-golf-showcase-json-start */ [
  {"tourId":"atp","canonicalAthleteId":"atp-jannik-sinner","displayName":"Jannik Sinner","sportId":"tennis","discipline":"Tennis player","likenessNotes":"tall lean build, fair complexion, short wavy red hair","outfitColorContext":"restrained off-white, navy, and muted green","optionalAction":"two-handed backhand with balanced footwork"},
  {"tourId":"atp","canonicalAthleteId":"atp-alexander-zverev","displayName":"Alexander Zverev","sportId":"tennis","discipline":"Tennis player","likenessNotes":"very tall athletic build, short dark-blond hair, defined jawline","outfitColorContext":"restrained navy, pale blue, and off-white","optionalAction":"serve at full extension"},
  {"tourId":"atp","canonicalAthleteId":"atp-carlos-alcaraz","displayName":"Carlos Alcaraz","sportId":"tennis","discipline":"Tennis player","likenessNotes":"compact muscular build, short dark hair, energetic expression","outfitColorContext":"restrained deep blue, warm red, and off-white","optionalAction":"open-stance forehand with controlled rotation"},
  {"tourId":"atp","canonicalAthleteId":"atp-felix-auger-aliassime","displayName":"Félix Auger-Aliassime","sportId":"tennis","discipline":"Tennis player","likenessNotes":"tall athletic build, close-cropped dark hair, composed expression","outfitColorContext":"restrained charcoal, burgundy, and off-white","optionalAction":"return stance with racket centered"},
  {"tourId":"atp","canonicalAthleteId":"atp-ben-shelton","displayName":"Ben Shelton","sportId":"tennis","discipline":"Tennis player","likenessNotes":"powerful athletic build, short dark curls, youthful facial lines","outfitColorContext":"restrained teal, navy, and off-white","optionalAction":"left-handed serve at trophy position"},
  {"tourId":"atp","canonicalAthleteId":"atp-novak-djokovic","displayName":"Novak Djokovic","sportId":"tennis","discipline":"Tennis player","likenessNotes":"lean athletic build, short dark hair, angular facial structure","outfitColorContext":"restrained deep blue, muted red, and off-white","optionalAction":"two-handed backhand return with low stance"},
  {"tourId":"wta","canonicalAthleteId":"wta-aryna-sabalenka","displayName":"Aryna Sabalenka","sportId":"tennis","discipline":"Tennis player","likenessNotes":"tall powerful build, long light-brown hair tied back, strong brows","outfitColorContext":"restrained deep red, charcoal, and off-white","optionalAction":"power forehand with open stance"},
  {"tourId":"wta","canonicalAthleteId":"wta-elena-rybakina","displayName":"Elena Rybakina","sportId":"tennis","discipline":"Tennis player","likenessNotes":"tall lean build, long light-brown hair tied back, composed expression","outfitColorContext":"restrained pale blue, navy, and off-white","optionalAction":"serve at full extension"},
  {"tourId":"wta","canonicalAthleteId":"wta-jessica-pegula","displayName":"Jessica Pegula","sportId":"tennis","discipline":"Tennis player","likenessNotes":"athletic build, long dark hair tied back, focused expression","outfitColorContext":"restrained navy, lilac, and off-white","optionalAction":"compact two-handed backhand"},
  {"tourId":"wta","canonicalAthleteId":"wta-coco-gauff","displayName":"Coco Gauff","sportId":"tennis","discipline":"Tennis player","likenessNotes":"tall athletic build, long dark braids tied back, determined expression","outfitColorContext":"restrained warm yellow, black, and off-white","optionalAction":"return stance with a wide athletic base"},
  {"tourId":"wta","canonicalAthleteId":"wta-mirra-andreeva","displayName":"Mirra Andreeva","sportId":"tennis","discipline":"Tennis player","likenessNotes":"lean build, long brown hair tied back, youthful facial lines","outfitColorContext":"restrained coral, navy, and off-white","optionalAction":"two-handed backhand with compact preparation"},
  {"tourId":"wta","canonicalAthleteId":"wta-naomi-osaka","displayName":"Naomi Osaka","sportId":"tennis","discipline":"Tennis player","likenessNotes":"tall athletic build, voluminous dark curls, calm focused expression","outfitColorContext":"restrained black, warm orange, and off-white","optionalAction":"forehand at contact with controlled follow-through"},
  {"tourId":"pga","canonicalAthleteId":"pga-scottie-scheffler","displayName":"Scottie Scheffler","sportId":"golf","discipline":"Golfer","likenessNotes":"tall athletic build, short brown hair, trimmed beard","outfitColorContext":"restrained navy, soft blue, and off-white","optionalAction":"iron impact with stable posture"},
  {"tourId":"pga","canonicalAthleteId":"pga-matt-fitzpatrick","displayName":"Matt Fitzpatrick","sportId":"golf","discipline":"Golfer","likenessNotes":"lean build, short brown hair, clean facial lines","outfitColorContext":"restrained deep blue, burgundy, and off-white","optionalAction":"address position with an iron"},
  {"tourId":"pga","canonicalAthleteId":"pga-cameron-young","displayName":"Cameron Young","sportId":"golf","discipline":"Golfer","likenessNotes":"tall solid build, short dark hair, composed expression","outfitColorContext":"restrained black, pale blue, and off-white","optionalAction":"driver backswing near the top"},
  {"tourId":"pga","canonicalAthleteId":"pga-collin-morikawa","displayName":"Collin Morikawa","sportId":"golf","discipline":"Golfer","likenessNotes":"lean athletic build, short dark hair, clean facial lines","outfitColorContext":"restrained navy, muted green, and off-white","optionalAction":"balanced iron follow-through"},
  {"tourId":"pga","canonicalAthleteId":"pga-ludvig-aberg","displayName":"Ludvig Åberg","sportId":"golf","discipline":"Golfer","likenessNotes":"tall athletic build, short light-brown hair, youthful expression","outfitColorContext":"restrained forest green, navy, and off-white","optionalAction":"driver impact with restrained motion blur"},
  {"tourId":"pga","canonicalAthleteId":"pga-rory-mcilroy","displayName":"Rory McIlroy","sportId":"golf","discipline":"Golfer","likenessNotes":"compact powerful build, short dark curls, light facial hair","outfitColorContext":"restrained navy, royal blue, and off-white","optionalAction":"full driver follow-through"},
  {"tourId":"lpga","canonicalAthleteId":"lpga-jeeno-thitikul","displayName":"Jeeno Thitikul","sportId":"golf","discipline":"Golfer","likenessNotes":"lean athletic build, long dark hair tied back, composed expression","outfitColorContext":"restrained pale blue, navy, and off-white","optionalAction":"balanced iron impact"},
  {"tourId":"lpga","canonicalAthleteId":"lpga-nelly-korda","displayName":"Nelly Korda","sportId":"golf","discipline":"Golfer","likenessNotes":"tall athletic build, long blond hair tied back, focused expression","outfitColorContext":"restrained deep blue, soft pink, and off-white","optionalAction":"driver follow-through with balanced finish"},
  {"tourId":"lpga","canonicalAthleteId":"lpga-hyo-joo-kim","displayName":"Hyo Joo Kim","sportId":"golf","discipline":"Golfer","likenessNotes":"compact athletic build, dark shoulder-length hair, calm expression","outfitColorContext":"restrained navy, muted red, and off-white","optionalAction":"address position with an iron"},
  {"tourId":"lpga","canonicalAthleteId":"lpga-charley-hull","displayName":"Charley Hull","sportId":"golf","discipline":"Golfer","likenessNotes":"athletic build, long blond hair tied back, determined expression","outfitColorContext":"restrained black, warm red, and off-white","optionalAction":"driver backswing near the top"},
  {"tourId":"lpga","canonicalAthleteId":"lpga-minjee-lee","displayName":"Minjee Lee","sportId":"golf","discipline":"Golfer","likenessNotes":"athletic build, long dark hair tied back, composed expression","outfitColorContext":"restrained teal, navy, and off-white","optionalAction":"iron impact with compact rotation"},
  {"tourId":"lpga","canonicalAthleteId":"lpga-lydia-ko","displayName":"Lydia Ko","sportId":"golf","discipline":"Golfer","likenessNotes":"compact athletic build, dark hair tied back, calm focused expression","outfitColorContext":"restrained burgundy, navy, and off-white","optionalAction":"balanced iron follow-through"}
] /* tennis-golf-showcase-json-end */;

const TOUR_NAMES = Object.freeze({ atp: "ATP", wta: "WTA", pga: "PGA Tour", lpga: "LPGA" });
const PORTRAIT_STYLE = EDGEBOARD_ILLUSTRATION_V1_PROMPT;
const BRAND_SAFETY = "Use outfit colors only as restrained context. Omit exact tour, event, apparel, equipment, sponsor, and club logos; do not recreate promotional photography.";
const ACTION_STYLE = "Use a transparent 4:5 portrait-led composition with one readable movement axis, simplified equipment, no court or course reconstruction, no crowd, no scoreboard, no sponsor wall, and no text.";

function buildSlot(slot) {
  const tourDisplayName = TOUR_NAMES[slot.tourId];
  const category = slot.sportId === "tennis" ? "tennis" : "golf";
  const portraitAssetPath = `assets/illustrations/athletes/${category}/${slot.tourId}/${slot.canonicalAthleteId}-portrait.webp`;
  const actionAssetPathPlaceholder = `assets/illustrations/athletes/${category}/${slot.tourId}/${slot.canonicalAthleteId}-action.webp`;
  const activeExact = ILLUSTRATION_REGISTRY.find((entry) => entry.status === "active" && entry.entityType === "athlete" && entry.canonicalEntityId === slot.canonicalAthleteId && entry.variant === "portrait");
  const registryDraft = activeExact ? Object.freeze({ ...activeExact, status: "active_existing_reference" }) : Object.freeze({ id: `art-${slot.canonicalAthleteId}-portrait`, entityType: "athlete", canonicalEntityId: slot.canonicalAthleteId, sport: slot.sportId, league: slot.tourId, tour: tourDisplayName, assetPath: portraitAssetPath, assetType: "original_generated", variant: "portrait", priority: 100, fallbackGroup: `tour:${slot.tourId}`, status: "planned", source: "edgeboard_original", styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION, altText: `${slot.displayName} editorial illustration` });
  return Object.freeze({
    ...slot, tourDisplayName, showcaseRole: "tour_representative", styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
    selectionEffectiveFrom: TENNIS_GOLF_SHOWCASE_BATCH_7_METADATA.selectionEffectiveFrom,
    tourAssignment: Object.freeze({ tourId: slot.tourId, displayName: tourDisplayName }),
    registryPath: portraitAssetPath, portraitAssetPath, actionAssetPathPlaceholder,
    generationStatus: activeExact ? "approved_existing" : "not_generated", reviewStatus: activeExact ? "approved_existing" : "not_reviewed", sourceType: activeExact ? "edgeboard_original_existing" : "planned_original_generation",
    actionGenerationStatus: "deferred_until_all_batch_7_portraits_complete",
    fallback: Object.freeze({ order: Object.freeze(["athlete", "tour", slot.sportId, "neutral"]), tourFallbackRegistryId: `art-tour-${slot.tourId}`, sportFallbackRegistryId: `art-generic-${slot.sportId}`, neutralFallbackRegistryId: "art-placeholder-neutral" }),
    portraitMode: "standard",
    portraitPrompt: `Create an original standard editorial portrait of ${slot.displayName}, a current ${tourDisplayName} ${slot.discipline.toLowerCase()} and replaceable tour showcase representative. Use a non-action chest/upper-torso composition with natural posture and no serve, groundstroke, return, swing, address, or follow-through pose. Recognizable physical characteristics: ${slot.likenessNotes}. Simplified outfit context: ${slot.outfitColorContext}. Do not reproduce an existing photograph. ${PORTRAIT_STYLE} ${BRAND_SAFETY}`,
    actionPrompt: `After all 24 Batch 7 portraits are approved, create an optional original action variant of ${slot.displayName}: ${slot.optionalAction}. ${ACTION_STYLE} ${BRAND_SAFETY}`,
    registryDraft,
  });
}

export const TENNIS_GOLF_SHOWCASE_BATCH_7 = Object.freeze(RAW_TENNIS_GOLF_SHOWCASE_SLOTS.map(buildSlot));

export function validateTennisGolfShowcaseBatch(entries = TENNIS_GOLF_SHOWCASE_BATCH_7, { canonicalEntities = [], illustrationEntries = ILLUSTRATION_REGISTRY } = {}) {
  const errors = [];
  const athletes = new Map(canonicalEntities.filter((entity) => entity.entityType !== "team").map((entity) => [entity.id, entity]));
  const registryIds = new Set(illustrationEntries.map((entry) => entry.id));
  const athleteIds = new Set(entries.map((entry) => entry.canonicalAthleteId));
  const counts = entries.reduce((result, entry) => ({ ...result, [entry.tourId]: (result[entry.tourId] || 0) + 1 }), {});
  const configuredTours = new Map(SPORTS_REGISTRY.filter((entry) => ["tennis", "golf"].includes(entry.sportId)).map((entry) => [entry.leagueId, entry]));
  if (entries.length !== TENNIS_GOLF_SHOWCASE_BATCH_7_METADATA.requiredSlotCount) errors.push(`Expected 24 showcase slots; received ${entries.length}.`);
  if (athleteIds.size !== entries.length) errors.push("Batch 7 canonical athlete IDs must be unique.");
  for (const [tourId, required] of Object.entries(TENNIS_GOLF_SHOWCASE_BATCH_7_METADATA.requiredTourCounts)) if (counts[tourId] !== required) errors.push(`Expected ${required} ${tourId} slots; received ${counts[tourId] || 0}.`);
  for (const tourId of TENNIS_GOLF_SHOWCASE_BATCH_7_METADATA.configuredTourIds) if (!configuredTours.has(tourId) || configuredTours.get(tourId).enabled === false) errors.push(`Configured tour is missing or disabled: ${tourId}.`);
  for (const entry of entries) {
    const athlete = athletes.get(entry.canonicalAthleteId);
    if (!athlete || athlete.sportId !== entry.sportId || athlete.leagueId !== entry.tourId) errors.push(`Canonical athlete mapping missing or inconsistent: ${entry.canonicalAthleteId}.`);
    for (const fallbackId of [entry.fallback.tourFallbackRegistryId, entry.fallback.sportFallbackRegistryId, entry.fallback.neutralFallbackRegistryId]) if (!registryIds.has(fallbackId)) errors.push(`Fallback missing for ${entry.canonicalAthleteId}: ${fallbackId}.`);
    if (!entry.portraitPrompt || !entry.actionPrompt || !entry.registryPath || !entry.tourAssignment) errors.push(`Production description incomplete: ${entry.canonicalAthleteId}.`);
    if (entry.showcaseRole !== "tour_representative") errors.push(`Invalid showcase role: ${entry.canonicalAthleteId}.`);
    if (entry.registryDraft.status === "planned" && registryIds.has(entry.registryDraft.id)) errors.push(`Planned registry row is already active: ${entry.registryDraft.id}.`);
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), required: 24, assigned: entries.length, uniqueAthletes: athleteIds.size, tourCounts: Object.freeze(counts), tennisAssigned: entries.filter((entry) => entry.sportId === "tennis").length, golfAssigned: entries.filter((entry) => entry.sportId === "golf").length, portraitPrompts: entries.filter((entry) => entry.portraitPrompt).length, deferredActionPrompts: entries.filter((entry) => entry.actionGenerationStatus.startsWith("deferred")).length, registryReady: entries.filter((entry) => ["planned", "active_existing_reference"].includes(entry.registryDraft.status)).length, exactActive: entries.filter((entry) => entry.generationStatus === "approved_existing").length });
}
