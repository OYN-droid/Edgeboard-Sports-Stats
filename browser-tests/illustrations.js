import { ILLUSTRATION_ASSET_TYPES, ILLUSTRATION_DIMENSIONS, ILLUSTRATION_REGISTRY, ILLUSTRATION_VARIANTS } from "../src/config/illustration-registry.js";
import { getIllustrationPriorityQueue, getShowcaseAssignments, SHOWCASE_COVERAGE_TARGETS } from "../tools/illustration-qa/showcase-illustration-registry.js";
import { MLB_SHOWCASE_BATCH_1, MLB_SHOWCASE_BATCH_1_METADATA, MLB_SHOWCASE_PRODUCTION_BATCHES, validateMlbShowcaseBatch } from "../tools/illustration-qa/mlb-illustration-showcase-batch-1.js";
import { BASKETBALL_SHOWCASE_BATCH_2, BASKETBALL_SHOWCASE_BATCH_2_METADATA, validateBasketballShowcaseBatch } from "../tools/illustration-qa/basketball-illustration-showcase-batch-2.js";
import { COMBAT_SHOWCASE_BATCH_3, COMBAT_SHOWCASE_BATCH_3_METADATA, validateCombatShowcaseBatch } from "../tools/illustration-qa/combat-illustration-showcase-batch-3.js";
import { FOOTBALL_HOCKEY_SHOWCASE_BATCH_4, FOOTBALL_HOCKEY_SHOWCASE_BATCH_4_METADATA, validateFootballHockeyShowcaseBatch } from "../tools/illustration-qa/football-hockey-illustration-showcase-batch-4.js";
import { SOCCER_SHOWCASE_BATCH_5, SOCCER_SHOWCASE_BATCH_5_METADATA, validateSoccerShowcaseBatch } from "../tools/illustration-qa/soccer-illustration-showcase-batch-5.js";
import { MOTORSPORTS_SHOWCASE_BATCH_6, MOTORSPORTS_SHOWCASE_BATCH_6_METADATA, validateMotorsportsShowcaseBatch } from "../tools/illustration-qa/motorsports-illustration-showcase-batch-6.js";
import { TENNIS_GOLF_SHOWCASE_BATCH_7, TENNIS_GOLF_SHOWCASE_BATCH_7_METADATA, validateTennisGolfShowcaseBatch } from "../tools/illustration-qa/tennis-golf-illustration-showcase-batch-7.js";
import { EDGEBOARD_ILLUSTRATION_STYLE_V1, EDGEBOARD_ILLUSTRATION_STYLE_VERSION } from "../src/config/illustration-style-v1.js";
import { ILLUSTRATION_STYLE_PROOF_BATCH } from "../tools/illustration-qa/illustration-style-proof-batch.js";
import { FEATURED_PORTRAIT_COVERAGE_METADATA, FEATURED_PORTRAIT_SELECTIONS, validateFeaturedPortraitCoverage } from "../src/config/featured-portrait-coverage.js";
import { CANONICAL_ENTITIES } from "../src/data/canonical-entities.js";
import { UNIFIED_CANONICAL_ENTITIES } from "../src/data/canonical-sports-entities.js";
import { createIllustrationResolver, getIllustration, validateIllustrationRegistry } from "../src/services/illustration-service.js";

const results = document.querySelector("#results");
const frame = document.querySelector("#app");
const failures = []; const checks = [];
const check = (condition, label) => { checks.push(label); if (!condition) failures.push(label); };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitFor = async (predicate, timeout = 3000) => { const deadline = Date.now() + timeout; while (Date.now() < deadline) { if (predicate()) return true; await wait(30); } return false; };
const approvedProofIds = new Set(ILLUSTRATION_STYLE_PROOF_BATCH.map((slot) => slot.canonicalEntityId));
const approvedExactIds = new Set(ILLUSTRATION_REGISTRY.filter((entry) => entry.status === "active" && entry.variant === "portrait" && ["athlete", "fighter", "driver"].includes(entry.entityType)).map((entry) => entry.canonicalEntityId));
const resolvesAsApprovedProofOr = (entity, fallbackLevel, context = {}) => {
  const resolved = getIllustration(entity, context);
  return resolved?.fallbackLevel === (approvedExactIds.has(entity?.id) ? "exact" : fallbackLevel);
};

frame.contentWindow.addEventListener("error", (event) => window.testErrors.push(`app: ${event.message}`));
frame.contentWindow.addEventListener("unhandledrejection", (event) => window.testErrors.push(`app: ${String(event.reason)}`));

const validation = validateIllustrationRegistry(ILLUSTRATION_REGISTRY);
check(validation.valid && validation.entryCount === ILLUSTRATION_REGISTRY.length, "canonical illustration registry validates");
check(ILLUSTRATION_ASSET_TYPES.includes("original_manual") && ILLUSTRATION_ASSET_TYPES.includes("tour_fallback") && ILLUSTRATION_ASSET_TYPES.includes("placeholder"), "registry declares explicit original and fallback asset types");
check(["portrait", "action", "celebration", "profile", "story", "compact"].every((variant) => ILLUSTRATION_VARIANTS.includes(variant)), "registry supports every requested illustration variant");
check(ILLUSTRATION_DIMENSIONS.action.aspectRatio === "4 / 5" && ILLUSTRATION_DIMENSIONS.action.width === 960 && ILLUSTRATION_DIMENSIONS.action.height === 1200, "action production dimensions are machine-readable");
check(ILLUSTRATION_DIMENSIONS.celebration.maxBytes === 260000 && ILLUSTRATION_DIMENSIONS.compact.aspectRatio === "1 / 1", "celebration and compact production budgets are machine-readable");
check(ILLUSTRATION_REGISTRY.every((item) => item.source === "edgeboard_original" && item.status === "active"), "every bundled illustration has explicit original provenance and active status");
check(EDGEBOARD_ILLUSTRATION_STYLE_VERSION === "edgeboard-illustration-v1" && EDGEBOARD_ILLUSTRATION_STYLE_V1.approvalStatus === "human_approved", "approved EdgeBoard Illustration Style v1 is versioned and human-approved");
check(EDGEBOARD_ILLUSTRATION_STYLE_V1.portraitMode === "standard" && EDGEBOARD_ILLUSTRATION_STYLE_V1.standardPortraitPresentation.includes("non-action chest/upper-torso") && EDGEBOARD_ILLUSTRATION_STYLE_V1.promptContract.includes("action artwork is a separate optional variant"), "Style v1 defines the Aaron Judge-like standard portrait as the future default and keeps action art optional");
check(EDGEBOARD_ILLUSTRATION_STYLE_V1.reference.assetType === "style_reference" && !EDGEBOARD_ILLUSTRATION_STYLE_V1.reference.productionAsset && !EDGEBOARD_ILLUSTRATION_STYLE_V1.reference.registryEligible && !EDGEBOARD_ILLUSTRATION_STYLE_V1.reference.fallbackEligible, "Style v1 composite is classified as reference-only");
check(!ILLUSTRATION_REGISTRY.some((entry) => entry.assetPath === EDGEBOARD_ILLUSTRATION_STYLE_V1.reference.assetPath), "Style v1 composite is not registered as athlete art or fallback art");
const featuredCoverage = validateFeaturedPortraitCoverage();
check(featuredCoverage.valid && featuredCoverage.selected === 36, "featured portrait readiness validates eight WNBA, five NFL, ten UFC, and thirteen Boxing selections");
check(featuredCoverage.coverage.every((item) => item.coverageType === "featured_partial" && item.selected === item.target) && featuredCoverage.coverage.find((item) => item.categoryId === "wnba")?.summary.startsWith("WNBA featured exact portrait coverage:"), "featured readiness is explicitly partial and never described as full league coverage");
check(featuredCoverage.productionRequired === 0 && featuredCoverage.coverage.find((item) => item.categoryId === "wnba")?.exactActive === 8 && featuredCoverage.coverage.find((item) => item.categoryId === "nfl")?.exactActive === 5 && featuredCoverage.coverage.find((item) => item.categoryId === "ufc")?.exactActive === 10 && featuredCoverage.coverage.find((item) => item.categoryId === "boxing")?.exactActive === 13, "featured coverage reports all thirteen selected Boxing portraits active");
check(FEATURED_PORTRAIT_SELECTIONS.every((item) => item.exactArtworkActive && item.registryStatus === "active_existing"), "every selected featured target resolves to approved exact artwork");
check(FEATURED_PORTRAIT_SELECTIONS.every((item) => item.fallback.sportRegistryId && item.fallback.neutralRegistryId), "every featured selection has intentional sport and neutral fallback coverage");
check(FEATURED_PORTRAIT_COVERAGE_METADATA.rankingPolicy.qualityAndEvidenceFirst && !FEATURED_PORTRAIT_COVERAGE_METADATA.rankingPolicy.artworkAffectsEligibility, "featured artwork cannot replace story quality or evidence eligibility");

const exact = getIllustration({ id: "wnba-caitlin-clark", name: "Caitlin Clark", sportId: "basketball", leagueId: "wnba", teamId: "IND-W" }, { context: "profile" });
check(exact.fallbackLevel === "exact" && exact.canonicalEntityId === "wnba-caitlin-clark", "athlete resolves through canonical identity before metadata");
const sampleFighter = getIllustration({ id: "ufc-sample-fighter-a", name: "Sample Fighter A", sportId: "mma", leagueId: "ufc", weightClass: "Lightweight" }, { context: "profile" });
check(sampleFighter.fallbackLevel === "weight_class" && sampleFighter.registryId === "art-weight-mma-lightweight", "deterministic sample fighter resolves to explicit combat context instead of fabricated person art");
check(getIllustration({ id: "f1-max-verstappen", name: "Max Verstappen", sportId: "motorsport", leagueId: "f1", series: "Formula 1" }, { desiredVariant: "portrait" }).variantFallback === false, "preferred available variant resolves without fallback");
check(getIllustration({ id: "f1-max-verstappen", name: "Max Verstappen", sportId: "motorsport", leagueId: "f1", series: "Formula 1" }).fallbackLevel === "exact", "driver resolves to exact canonical illustration");
check(exact.variantFallback && exact.requestedVariant === "profile", "missing requested rendition reports deterministic variant fallback");
const traded = getIllustration({ id: "wnba-caitlin-clark", name: "Caitlin Clark", sportId: "basketball", leagueId: "wnba", teamId: "OTHER" }, { context: "profile" });
check(traded.registryId === exact.registryId, "team changes do not silently change exact canonical art");
check(getIllustration({ id: "unknown-wnba-player", sportId: "basketball", leagueId: "wnba", teamId: "IND-W" }).fallbackLevel === "team", "unknown athlete resolves to configured team fallback");
check(getIllustration({ id: "unknown-fighter", sportId: "mma", leagueId: "ufc", weightClass: "Lightweight" }).fallbackLevel === "weight_class", "combat entity resolves to weight-class fallback");
check(getIllustration({ id: "unknown-driver", sportId: "motorsport", leagueId: "f1", series: "Formula 1" }).fallbackLevel === "series", "driver resolves to series fallback");
check(getIllustration({ id: "unknown-atp-player", sportId: "tennis", leagueId: "atp" }).fallbackLevel === "tour", "tennis player resolves to tour fallback from canonical league context");
check(getIllustration({ id: "unknown-mls-player", sportId: "soccer", leagueId: "mls" }).fallbackLevel === "competition", "soccer entity resolves to configured competition fallback before generic sport art");
check(getIllustration({ id: "unknown-player", sportId: "soccer" }).fallbackLevel === "generic_sport", "supported sport without competition context resolves to generic sport fallback");
check(getIllustration({ id: "unknown-entity", sportId: "unsupported" }).fallbackLevel === "neutral", "unsupported sport resolves to neutral placeholder");
check(getIllustration({ id: "sportsdataio:123", sportId: "baseball" }).fallbackLevel !== "exact", "provider-shaped IDs cannot resolve exact public artwork");
const welterweightFallback = getIllustration({ id: "unknown-fighter", sportId: "mma", weightClass: "Welterweight" });
check(welterweightFallback.fallbackLevel === "weight_class" && welterweightFallback.registryId === "art-weight-mma-welterweight", "weight-class changes intentionally update contextual fallback resolution");

const duplicate = [...ILLUSTRATION_REGISTRY, { ...ILLUSTRATION_REGISTRY[0] }];
check(!validateIllustrationRegistry(duplicate).valid, "duplicate registry IDs and canonical variants fail validation");
check(!validateIllustrationRegistry([{ ...ILLUSTRATION_REGISTRY[0], id: "provider-id-test", canonicalEntityId: "12345" }]).valid, "provider-shaped canonical IDs fail validation");
check(!validateIllustrationRegistry([{ ...ILLUSTRATION_REGISTRY[0], id: "missing-test", assetPath: "missing.svg" }], { assetExists: () => false }).valid, "missing assets fail validation when filesystem validation is supplied");
check(!validateIllustrationRegistry([{ ...ILLUSTRATION_REGISTRY[0], id: "type-test", assetType: "third_party_unknown" }]).valid, "invalid asset types fail validation");
check(!validateIllustrationRegistry([{ ...ILLUSTRATION_REGISTRY[0], id: "source-test", source: "" }]).valid, "missing source metadata fails validation");
const injectedResolver = createIllustrationResolver(ILLUSTRATION_REGISTRY);
check(injectedResolver.resolve({ id: "f1-max-verstappen", name: "Max Verstappen", sportId: "motorsport", series: "Formula 1" })?.fallbackLevel === "exact", "resolver can be dependency-injected with the canonical registry");
const curryEntity = { id: "nba-stephen-curry", name: "Stephen Curry", entityType: "player", sportId: "basketball", leagueId: "nba", teamId: "GSW" };
const featuredContext = { context: "story", fallbackPolicy: "featured_story" };
check(getIllustration(curryEntity, featuredContext)?.fallbackLevel === "exact", "featured real athlete resolves exact art first");
const withoutCurry = ILLUSTRATION_REGISTRY.filter((entry) => entry.canonicalEntityId !== curryEntity.id);
check(createIllustrationResolver(withoutCurry).resolve(curryEntity, featuredContext)?.fallbackLevel === "team", "featured athlete falls back from exact art to team art");
const withoutCurryOrTeam = withoutCurry.filter((entry) => entry.teamId !== "GSW");
check(createIllustrationResolver(withoutCurryOrTeam).resolve(curryEntity, featuredContext)?.fallbackLevel === "generic_sport", "featured athlete falls back from team art to sport art");
const withoutBasketball = withoutCurryOrTeam.filter((entry) => !(entry.assetType === "generic_sport" && entry.sport === "basketball"));
check(createIllustrationResolver(withoutBasketball).resolve(curryEntity, featuredContext)?.fallbackLevel === "neutral", "featured athlete falls back from sport art to neutral art");
check(getIllustration({ id: "GSW", name: "Golden State", entityType: "team", sportId: "basketball", leagueId: "nba" }, featuredContext)?.fallbackLevel === "team", "featured team entity resolves team art without a duplicated teamId field");

const assignments = getShowcaseAssignments({ season: 2026 });
check(assignments.length >= 12 && assignments.every((item) => item.canonicalEntityId && item.seasonFrom), "showcase assignments are canonical and effective-dated");
check(SHOWCASE_COVERAGE_TARGETS.some((item) => item.league === "mlb" && item.requiredCount === 30), "league coverage targets retain planned counts without claiming completed art");
const queue = getIllustrationPriorityQueue();
check(queue.length === assignments.length && queue.some((item) => !item.illustrated), "priority queue exposes missing exact showcase art");
check(queue.findIndex((item) => item.illustrated) >= queue.filter((item) => !item.illustrated).length, "unillustrated showcase work sorts before completed exact art");

const mlbBatch = validateMlbShowcaseBatch(MLB_SHOWCASE_BATCH_1, { canonicalEntities: CANONICAL_ENTITIES });
const futureShowcasePortraits = [BASKETBALL_SHOWCASE_BATCH_2, COMBAT_SHOWCASE_BATCH_3, FOOTBALL_HOCKEY_SHOWCASE_BATCH_4, SOCCER_SHOWCASE_BATCH_5, MOTORSPORTS_SHOWCASE_BATCH_6, TENNIS_GOLF_SHOWCASE_BATCH_7];
check(futureShowcasePortraits.every((batch) => batch.every((item) => item.portraitMode === "standard" && item.portraitPrompt.includes("non-action chest/upper-torso"))), "all future sport showcase manifests inherit standard non-action portrait mode");
check(mlbBatch.valid && mlbBatch.required === 30 && mlbBatch.assigned === 30, "MLB Batch 1 has exactly 30 validated team assignments");
check(mlbBatch.uniqueAthletes === 30 && mlbBatch.uniqueTeams === 30, "MLB Batch 1 uses 30 unique canonical athletes and teams");
check(mlbBatch.portraitPrompts === 30 && mlbBatch.actionPrompts === 30 && mlbBatch.registryReady === 30, "MLB Batch 1 prepares every portrait prompt, action prompt, and registry draft");
check(mlbBatch.exactApproved === 30 && mlbBatch.awaitingAsset === 0 && mlbBatch.needsRevision === 0 && mlbBatch.fallbackCovered === 30, "MLB coverage reports 30/30 exact approved and 30/30 fallback covered");
check(MLB_SHOWCASE_BATCH_1.every((item) => item.portraitMode === "standard" && item.portraitPrompt.includes("non-action chest/upper-torso") && !item.portraitPrompt.includes(`Composition: ${item.portraitPose}`)), "all MLB primary prompts use the standard non-action portrait contract");
check(MLB_SHOWCASE_BATCH_1.every((item) => item.showcaseRole === "team_representative" && ["awaiting_asset", "needs_revision", "approved_existing"].includes(item.generationStatus) && ["awaiting_asset", "needs_revision", "approved"].includes(item.reviewStatus)), "MLB selections remain replaceable editorial assignments with explicit production states");
check(MLB_SHOWCASE_BATCH_1.every((item) => item.registryDraft.status === "active_existing_reference"), "all 30 technically valid MLB portrait rows are active");
check(MLB_SHOWCASE_BATCH_1.find((item) => item.canonicalAthleteId === "mlb-aaron-judge")?.registryDraft.id === "art-mlb-aaron-judge-portrait", "Aaron Judge reuses the approved Yankees registry entry without duplication");
check(new Set(MLB_SHOWCASE_BATCH_1.map((item) => item.productionTargetPath)).size === 30 && MLB_SHOWCASE_BATCH_1.every((item) => item.productionTargetPath.endsWith(".webp")), "all 30 MLB portraits have unique optimized WebP delivery targets");
check(MLB_SHOWCASE_PRODUCTION_BATCHES.length === 5 && MLB_SHOWCASE_PRODUCTION_BATCHES.flatMap((batch) => batch.canonicalAthleteIds).length === 29 && new Set(MLB_SHOWCASE_PRODUCTION_BATCHES.flatMap((batch) => batch.canonicalAthleteIds)).size === 29, "MLB production order groups all 29 remaining athletes once across five drift-control batches");
check(Object.values(mlbBatch.batch1).every((count) => count === 6), "MLB production Batch 1 reports 6/6 physical, technical, human-approved, and registry-active portraits");
check(Object.values(mlbBatch.batch2).every((count) => count === 6), "MLB production Batch 2 reports 6/6 physical, technical, human-approved, and registry-active portraits");
check(Object.values(mlbBatch.batch3).every((count) => count === 6), "MLB production Batch 3 reports 6/6 physical, technical, human-approved, and registry-active portraits");
check(Object.values(mlbBatch.batch4).every((count) => count === 6), "MLB production Batch 4 reports 6/6 physical, technical, human-approved, and registry-active portraits");
check(mlbBatch.batch5.supplied === 5 && mlbBatch.batch5.physical === 5 && mlbBatch.batch5.technicallyValid === 5 && mlbBatch.batch5.humanApproved === 5 && mlbBatch.batch5.registryActive === 5 && mlbBatch.batch5.needsRevision === 0, "MLB production Batch 5 reports 5/5 physical, technical, human-approved, and registry-active portraits");
check(MLB_SHOWCASE_BATCH_1.every((item) => resolvesAsApprovedProofOr(CANONICAL_ENTITIES.find((entity) => entity.id === item.canonicalAthleteId), "team")), "all 30 MLB representatives resolve to approved proof or team artwork without broken paths");

const basketballBatch = validateBasketballShowcaseBatch(BASKETBALL_SHOWCASE_BATCH_2, { canonicalEntities: CANONICAL_ENTITIES });
check(basketballBatch.valid && basketballBatch.required === 45 && basketballBatch.assigned === 45, `Basketball Batch 2 has exactly 45 validated team assignments${basketballBatch.errors.length ? `: ${basketballBatch.errors.join(" | ")}` : ""}`);
check(basketballBatch.nbaAssigned === 30 && basketballBatch.wnbaAssigned === 15, "Basketball Batch 2 covers every NBA and WNBA team");
check(basketballBatch.uniqueAthletes === 45 && basketballBatch.uniqueTeams === 45, "Basketball Batch 2 uses unique canonical athletes and teams");
check(basketballBatch.portraitPrompts === 45 && basketballBatch.deferredActionPrompts === 45 && basketballBatch.registryReady === 45, "Basketball Batch 2 prepares portrait-first production and defers all action variants");
check(BASKETBALL_SHOWCASE_BATCH_2.every((item) => item.showcaseRole === "team_representative" && ["not_started", "awaiting_asset", "approved_existing"].includes(item.generationStatus)), "basketball selections remain replaceable editorial assignments without best-player claims");
check(basketballBatch.exactActive === 38 && BASKETBALL_SHOWCASE_BATCH_2.filter((item) => item.leagueId === "nba" && item.generationStatus === "approved_existing").length === 30 && BASKETBALL_SHOWCASE_BATCH_2.filter((item) => item.leagueId === "wnba" && item.generationStatus === "approved_existing").length === 8, "NBA remains complete at thirty exact portraits while WNBA adds eight explicitly featured exact portraits");
check(BASKETBALL_SHOWCASE_BATCH_2.filter((item) => item.registryDraft.status === "planned").every((item) => approvedProofIds.has(item.canonicalAthleteId) || !ILLUSTRATION_REGISTRY.some((entry) => entry.id === item.registryDraft.id)), "planned basketball portraits remain inactive except separately approved proof exemplars");
check(BASKETBALL_SHOWCASE_BATCH_2.every((item) => ["exact", "team"].includes(getIllustration(CANONICAL_ENTITIES.find((entity) => entity.id === item.canonicalAthleteId))?.fallbackLevel)), "all 45 basketball representatives resolve to approved exact or team artwork without broken paths");

const combatBatch = validateCombatShowcaseBatch(COMBAT_SHOWCASE_BATCH_3, { canonicalEntities: CANONICAL_ENTITIES });
check(combatBatch.valid && combatBatch.assigned === 38 && combatBatch.uniqueFighters === 38, `Combat Batch 3 has 38 unique validated fighter assignments${combatBatch.errors.length ? `: ${combatBatch.errors.join(" | ")}` : ""}`);
check(combatBatch.ufcAssigned === 22 && combatBatch.ufcWeightClasses === 11, "Combat Batch 3 covers all 11 modeled UFC/MMA classes with two representatives each");
check(combatBatch.boxingAssigned === 16 && combatBatch.boxingWeightClasses === 8, "Combat Batch 3 covers all 8 modeled boxing classes with two representatives each");
check(combatBatch.portraitPrompts === 38 && combatBatch.actionPrompts === 38 && combatBatch.registryReady === 38, "Combat Batch 3 prepares every portrait, fighting-stance action prompt, and registry draft");
check(COMBAT_SHOWCASE_BATCH_3.every((item) => ["weight_class_representative", "featured_star"].includes(item.showcaseRole) && ["not_started", "approved_existing"].includes(item.generationStatus) && ["planned", "active_existing_reference"].includes(item.registryDraft.status)), "combat roles remain replaceable and only approved existing fighter art is active");
check(COMBAT_SHOWCASE_BATCH_3.every((item) => resolvesAsApprovedProofOr(CANONICAL_ENTITIES.find((entity) => entity.id === item.canonicalFighterId), "weight_class")), "all 38 combat representatives resolve through approved proof or weight-class artwork without broken images");
check(getIllustration({ id: "unknown-boxer", sportId: "boxing", leagueId: "boxing", weightClass: "Heavyweight" })?.fallbackLevel === "weight_class", "boxing fallback resolves fighter to weight class before generic sport art");
check(COMBAT_SHOWCASE_BATCH_3.every((item) => !("championshipStatus" in item) && !("ranking" in item) && !("belt" in item) && !/best fighter/i.test(item.showcaseRole)), "combat identity and roles do not hardcode championship, ranking, belt, or best-fighter claims");

const footballHockeyBatch = validateFootballHockeyShowcaseBatch(FOOTBALL_HOCKEY_SHOWCASE_BATCH_4, { canonicalEntities: CANONICAL_ENTITIES });
check(footballHockeyBatch.valid && footballHockeyBatch.required === 64 && footballHockeyBatch.assigned === 64, `Batch 4 has exactly 64 validated team assignments${footballHockeyBatch.errors.length ? `: ${footballHockeyBatch.errors.join(" | ")}` : ""}`);
check(footballHockeyBatch.nflAssigned === 32 && footballHockeyBatch.nhlAssigned === 32, "Batch 4 covers every NFL and NHL team exactly once");
check(footballHockeyBatch.uniqueAthletes === 64 && footballHockeyBatch.uniqueTeams === 64, "Batch 4 uses 64 unique canonical athletes and teams");
check(footballHockeyBatch.portraitPrompts === 64 && footballHockeyBatch.deferredActionPrompts === 64 && footballHockeyBatch.registryReady === 64, "Batch 4 prepares portrait-first production and defers all action variants");
check(FOOTBALL_HOCKEY_SHOWCASE_BATCH_4.every((item) => item.showcaseRole === "team_representative" && ["not_started", "approved_existing"].includes(item.generationStatus) && ["planned", "active_existing_reference"].includes(item.registryDraft.status)), "NFL and NHL roles remain replaceable and only approved existing athlete art is active");
check(FOOTBALL_HOCKEY_SHOWCASE_BATCH_4.every((item) => resolvesAsApprovedProofOr(CANONICAL_ENTITIES.find((entity) => entity.id === item.canonicalAthleteId), "team")), "all 64 Batch 4 representatives resolve through approved proof or team artwork without broken images");
check(FOOTBALL_HOCKEY_SHOWCASE_BATCH_4.every((item) => !/best player|best athlete|team's best/i.test(`${item.showcaseRole} ${item.portraitPrompt}`)), "Batch 4 does not encode subjective best-player claims");
check(FOOTBALL_HOCKEY_SHOWCASE_BATCH_4.every((item) => /no exact team or league logos|omit exact copyrighted logos/i.test(item.portraitPrompt)), "every Batch 4 portrait prompt explicitly avoids exact copyrighted logos");

const soccerBatch = validateSoccerShowcaseBatch(SOCCER_SHOWCASE_BATCH_5, { canonicalEntities: CANONICAL_ENTITIES });
check(soccerBatch.valid && soccerBatch.required === 40 && soccerBatch.assigned === 40, `Batch 5 has exactly 40 validated production-wave assignments${soccerBatch.errors.length ? `: ${soccerBatch.errors.join(" | ")}` : ""}`);
check(Object.values(soccerBatch.competitionCounts).length === 8 && Object.values(soccerBatch.competitionCounts).every((count) => count === 5), "Batch 5 covers all eight configured Tier 1 soccer competitions with five club slots each");
check(soccerBatch.uniqueAthletes === 40 && soccerBatch.uniqueClubs === 40 && soccerBatch.remainingClubBacklog === 120, "Batch 5 reports unique canonical mappings and the unassigned club backlog honestly");
check(soccerBatch.portraitPrompts === 40 && soccerBatch.deferredActionPrompts === 40 && soccerBatch.registryReady === 40, "Batch 5 prepares portrait-first production and defers every optional action variant");
check(SOCCER_SHOWCASE_BATCH_5.every((item) => getIllustration(CANONICAL_ENTITIES.find((entity) => entity.id === item.canonicalAthleteId))?.fallbackLevel === "team"), "all 40 Batch 5 representatives resolve through club fallbacks without broken images");
check(SOCCER_SHOWCASE_BATCH_5.every((item) => item.fallback.order.join(">") === "athlete>club>competition>soccer>neutral"), "every Batch 5 slot declares the complete soccer fallback chain");
check(SOCCER_SHOWCASE_BATCH_5.every((item) => !/best player|best athlete|club's best/i.test(`${item.showcaseRole} ${item.portraitPrompt}`)), "Batch 5 does not encode subjective best-player claims");

const motorsportsBatch = validateMotorsportsShowcaseBatch(MOTORSPORTS_SHOWCASE_BATCH_6, { canonicalEntities: UNIFIED_CANONICAL_ENTITIES });
check(motorsportsBatch.valid && motorsportsBatch.required === 62 && motorsportsBatch.assigned === 62, `Batch 6 has exactly 62 validated series assignments${motorsportsBatch.errors.length ? `: ${motorsportsBatch.errors.join(" | ")}` : ""}`);
check(motorsportsBatch.seriesCounts.f1 === 22 && motorsportsBatch.seriesCounts["nascar-cup"] === 12 && motorsportsBatch.seriesCounts.indycar === 8 && motorsportsBatch.seriesCounts.motogp === 8, "Batch 6 covers the full current Formula 1 grid and the planned major circuit and road-racing series counts");
check(motorsportsBatch.seriesCounts.supercross === 6 && motorsportsBatch.seriesCounts.motocross === 6 && motorsportsBatch.uniqueCompetitors === 61, "Batch 6 covers both off-road series while reusing Hunter Lawrence's single canonical identity");
check(motorsportsBatch.portraitPrompts === 62 && motorsportsBatch.deferredActionPrompts === 62 && motorsportsBatch.registryReady === 62 && motorsportsBatch.exactActive === 2, "Batch 6 prepares portrait-first production, defers variants, and recognizes both approved exact portraits");
check(MOTORSPORTS_SHOWCASE_BATCH_6.every((item) => item.seriesAssignment.seriesId === item.seriesId && item.teamAssignment.canonicalTeamId === item.canonicalTeamId), "series and team assignments remain explicit contextual records separate from competitor IDs");
check(MOTORSPORTS_SHOWCASE_BATCH_6.every((item) => item.fallback.order.join(">") === "driver_or_rider>constructor_or_team>series>motorsport>neutral"), "every Batch 6 slot declares the complete motorsport fallback chain");
check(MOTORSPORTS_SHOWCASE_BATCH_6.every((item) => ["exact", "team"].includes(getIllustration({ ...CANONICAL_ENTITIES.find((entity) => entity.id === item.canonicalCompetitorId), leagueId: item.seriesId, teamId: item.canonicalTeamId, series: item.seriesDisplayName })?.fallbackLevel)), "all 62 Batch 6 slots resolve through approved exact or team artwork without broken images");
check(MOTORSPORTS_SHOWCASE_BATCH_6.every((item) => /no sponsor marks|omit exact constructor/i.test(item.portraitPrompt) && !/best driver|best rider|champion/i.test(`${item.showcaseRole} ${item.portraitPrompt}`)), "Batch 6 prompts avoid sponsor-heavy reproduction and subjective or championship claims");
check(MOTORSPORTS_SHOWCASE_BATCH_6_METADATA.additionalConfiguredSeriesEvaluation.map((item) => item.seriesId).join(",") === "wrc,nascar-xfinity,nascar-trucks", "Batch 6 explicitly evaluates every additional configured major motorsport series");

const tennisGolfBatch = validateTennisGolfShowcaseBatch(TENNIS_GOLF_SHOWCASE_BATCH_7, { canonicalEntities: CANONICAL_ENTITIES });
check(tennisGolfBatch.valid && tennisGolfBatch.required === 24 && tennisGolfBatch.assigned === 24, `Batch 7 has exactly 24 validated tour assignments${tennisGolfBatch.errors.length ? `: ${tennisGolfBatch.errors.join(" | ")}` : ""}`);
check(tennisGolfBatch.tourCounts.atp === 6 && tennisGolfBatch.tourCounts.wta === 6 && tennisGolfBatch.tourCounts.pga === 6 && tennisGolfBatch.tourCounts.lpga === 6, "Batch 7 covers all four configured tours with six athletes each");
check(tennisGolfBatch.uniqueAthletes === 24 && tennisGolfBatch.tennisAssigned === 12 && tennisGolfBatch.golfAssigned === 12, "Batch 7 uses 24 unique canonical identities with balanced sport coverage");
check(tennisGolfBatch.portraitPrompts === 24 && tennisGolfBatch.deferredActionPrompts === 24 && tennisGolfBatch.registryReady === 24, "Batch 7 prepares every portrait and registry draft while deferring all optional actions");
check(TENNIS_GOLF_SHOWCASE_BATCH_7.every((item) => item.tourAssignment.tourId === item.tourId && item.fallback.order.join(">") === `athlete>tour>${item.sportId}>neutral`), "Batch 7 keeps tour assignments contextual and declares the required fallback chain");
check(TENNIS_GOLF_SHOWCASE_BATCH_7.every((item) => resolvesAsApprovedProofOr(CANONICAL_ENTITIES.find((entity) => entity.id === item.canonicalAthleteId), "tour")), "all 24 Batch 7 athletes resolve through approved proof or tour artwork without broken images");
check(TENNIS_GOLF_SHOWCASE_BATCH_7.every((item) => ["planned", "active_existing_reference"].includes(item.registryDraft.status) && (item.registryDraft.status === "active_existing_reference" || !ILLUSTRATION_REGISTRY.some((entry) => entry.id === item.registryDraft.id))), "no unreviewed Batch 7 athlete portrait is active; the proof exemplar is explicitly approved");
check(TENNIS_GOLF_SHOWCASE_BATCH_7.every((item) => /omit exact tour/i.test(item.portraitPrompt) && !/best player|best golfer|champion/i.test(`${item.showcaseRole} ${item.portraitPrompt}`)), "Batch 7 prompts avoid branded reproduction and subjective or championship claims");

const showcaseBatches = [MLB_SHOWCASE_BATCH_1, BASKETBALL_SHOWCASE_BATCH_2, COMBAT_SHOWCASE_BATCH_3, FOOTBALL_HOCKEY_SHOWCASE_BATCH_4, SOCCER_SHOWCASE_BATCH_5, MOTORSPORTS_SHOWCASE_BATCH_6, TENNIS_GOLF_SHOWCASE_BATCH_7];
const showcaseMetadata = [MLB_SHOWCASE_BATCH_1_METADATA, BASKETBALL_SHOWCASE_BATCH_2_METADATA, COMBAT_SHOWCASE_BATCH_3_METADATA, FOOTBALL_HOCKEY_SHOWCASE_BATCH_4_METADATA, SOCCER_SHOWCASE_BATCH_5_METADATA, MOTORSPORTS_SHOWCASE_BATCH_6_METADATA, TENNIS_GOLF_SHOWCASE_BATCH_7_METADATA];
check(showcaseMetadata.every((metadata) => metadata.styleVersion === EDGEBOARD_ILLUSTRATION_STYLE_VERSION), "all seven showcase manifests inherit the versioned Style v1 contract");
check(showcaseBatches.flat().every((item) => item.styleVersion === EDGEBOARD_ILLUSTRATION_STYLE_VERSION && item.portraitPrompt.includes("EdgeBoard Illustration Style v1")), "every prepared future portrait prompt explicitly targets Style v1");
check(showcaseBatches.flat().filter((item) => item.registryDraft.status === "planned").every((item) => item.registryDraft.styleVersion === EDGEBOARD_ILLUSTRATION_STYLE_VERSION), "every planned registry row records Style v1 for future auditing");
check(showcaseBatches.flat().every((item) => /non-photorealistic/i.test(item.portraitPrompt) && /no scenery/i.test(item.portraitPrompt) && /photoreal skin/i.test(item.portraitPrompt)), "future prompts reject photorealistic, scenic, and photographic-skin drift");

for (const path of new Set(ILLUSTRATION_REGISTRY.map((item) => `../${item.assetPath}`))) {
  const response = await fetch(path);
  check(response.ok, `registered asset loads: ${path.split("/").at(-1)}`);
}

await waitFor(() => frame.contentDocument?.querySelector("#athleteProfileTitle")?.textContent === "Caitlin Clark");
const app = frame.contentDocument;
const profileImage = app.querySelector(".profile-media[data-media-type='illustration'] img");
check(Boolean(profileImage), "canonical profile renders registry illustration through shared media service");
check(profileImage?.getAttribute("alt")?.includes("Caitlin Clark"), "profile illustration provides meaningful alternative text");
check(profileImage?.getAttribute("loading") === "lazy" && profileImage?.getAttribute("decoding") === "async", "profile illustration uses lazy loading and async decoding");

const homeFrame = document.createElement("iframe");
homeFrame.src = "/?mode=stats&scope=system%3Afor-you&testFixtureTimestamp=2026-07-30T12%3A30%3A00.000Z";
homeFrame.style.cssText = "width:390px;height:900px;border:0";
document.body.append(homeFrame);
homeFrame.contentWindow.addEventListener("error", (event) => window.testErrors.push(`home: ${event.message}`));
await new Promise((resolve) => homeFrame.addEventListener("load", resolve, { once: true }));
await waitFor(() => homeFrame.contentDocument?.querySelector(".home-discovery-card"));
const storyArt = homeFrame.contentDocument.querySelector(".home-card-illustration img");
check(Boolean(storyArt), "prominent deterministic discovery story can render contextual illustration");
check(storyArt?.getAttribute("alt") === "" && storyArt?.getAttribute("aria-hidden") === "true", "story illustration is decorative when adjacent claim text identifies the entity");
const featureCard = homeFrame.contentDocument.querySelector("#todayPulseGrid .home-discovery-card.feature");
const featureArt = featureCard?.querySelector(".home-card-illustration");
check(featureArt?.dataset.illustrationLevel === "exact"
  && !featureCard?.textContent.includes("Sample Boxer A"), "For You hero resolves exact artwork for a non-synthetic entity");
check(Boolean(homeFrame.contentDocument.querySelector("#insightDiscoveryGrid .home-discovery-card:first-child .home-card-illustration img")), "first Trending Research card uses the centralized illustration renderer");
for (const [width, label, minimumArtWidth] of [[390, "mobile", 180], [768, "tablet", 190], [1280, "desktop", 230]]) {
  homeFrame.style.width = `${width}px`;
  await wait(80);
  const doc = homeFrame.contentDocument;
  const artBox = featureArt?.getBoundingClientRect();
  const imageBox = featureArt?.querySelector("img")?.getBoundingClientRect();
  check(doc.documentElement.scrollWidth <= doc.documentElement.clientWidth + 1, `illustrated discovery card has no ${label} viewport overflow`);
  check(artBox?.width >= minimumArtWidth && imageBox?.width <= artBox.width + 1 && imageBox?.height <= artBox.height + 1, `featured ${label} visual is prominent and contained without stretching or clipping`);
}
homeFrame.contentDocument.querySelector('[data-theme-option="light"]')?.click();
check(homeFrame.contentDocument.body.dataset.theme === "light" && Boolean(featureArt?.querySelector("img")), "featured illustration remains available in light mode");
homeFrame.contentDocument.querySelector('[data-theme-option="dark"]')?.click();
check(homeFrame.contentDocument.body.dataset.theme === "dark" && storyArt?.getAttribute("loading") === "eager", "above-the-fold featured illustration remains eagerly loaded in dark mode");
check(!homeFrame.contentDocument.querySelector(".today-market-card .home-card-illustration"), "dense market cards preserve restrained data-first presentation");
homeFrame.remove();

check(window.testErrors.length === 0, `no illustration-system browser errors were captured${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);
results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}` : `PASS (${checks.length} illustration checks)\n${checks.join("\n")}`;
frame.remove();
