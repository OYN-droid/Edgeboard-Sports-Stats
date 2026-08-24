import { WNBA_SHOWCASE_BATCH_2 } from "../../tools/illustration-qa/basketball-illustration-showcase-batch-2.js";
import { NFL_SHOWCASE_BATCH_4 } from "../../tools/illustration-qa/football-hockey-illustration-showcase-batch-4.js";
import { BOXING_SHOWCASE_BATCH_3, UFC_SHOWCASE_BATCH_3 } from "../../tools/illustration-qa/combat-illustration-showcase-batch-3.js";
import { EDGEBOARD_ILLUSTRATION_STYLE_VERSION } from "./illustration-style-v1.js";
import { ILLUSTRATION_REGISTRY } from "./illustration-registry.js";
import { CANONICAL_ENTITIES } from "../data/canonical-entities.js";

const TARGET_BY_CATEGORY = Object.freeze({ wnba: 8, nfl: 5, ufc: 10, boxing: 13 });
const VERIFIED_AT = "2026-08-20";
const TECHNICAL_REVISION_IDS = new Set();

export const FEATURED_PORTRAIT_COVERAGE_METADATA = Object.freeze({
  id: "edgeboard-featured-portrait-production-readiness-v1",
  coverageType: "featured_partial",
  coverageLabel: "Featured exact portrait coverage",
  targetPerCategory: 5,
  targetByCategory: TARGET_BY_CATEGORY,
  categories: Object.freeze(["wnba", "nfl", "ufc", "boxing"]),
  selectionEffectiveFrom: VERIFIED_AT,
  styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  selectionDisclosure: "Replaceable editorial production priorities, not complete league coverage and not a claim that an athlete is the best in a league.",
  rankingPolicy: Object.freeze({
    qualityAndEvidenceFirst: true,
    artworkAffectsEligibility: false,
    exactArtworkMayBreakOtherwiseEqualTies: true,
  }),
  productionContract: Object.freeze({
    format: "png", width: 640, height: 800, colorModel: "rgba", bitDepth: 8,
    transparent: true, interlaced: false, orientation: "portrait",
    variant: "portrait", portraitMode: "standard", styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  }),
});

const RAW_SELECTIONS = Object.freeze([
  // WNBA: eight editorially useful representatives. This remains partial featured coverage.
  { categoryId: "wnba", id: "wnba-caitlin-clark", teamId: "IND-W", jerseyNumber: "22", rationale: "Existing exact artwork and high-value story, profile, comparison, and research coverage." },
  { categoryId: "wnba", id: "wnba-aja-wilson", teamId: "LVA", jerseyNumber: "22", rationale: "Frontcourt and Las Vegas coverage across stories, comparisons, leaders, and research." },
  { categoryId: "wnba", id: "wnba-sabrina-ionescu", teamId: "NYL", jerseyNumber: "20", rationale: "Guard and New York coverage across stories, markets, profiles, and visual research." },
  { categoryId: "wnba", id: "wnba-paige-bueckers", teamId: "WNBA-DAL", jerseyNumber: "5", rationale: "Dallas guard coverage with strong search and emerging-story utility." },
  { categoryId: "wnba", id: "wnba-angel-reese", teamId: "WNBA-ATL", jerseyNumber: "5", rationale: "Atlanta frontcourt coverage with distinct rebounding and comparison contexts." },
  { categoryId: "wnba", id: "wnba-olivia-miles", teamId: "WNBA-MIN", jerseyNumber: "5", rationale: "Minnesota guard coverage across profiles, emerging stories, comparisons, and research." },
  { categoryId: "wnba", id: "wnba-cameron-brink", teamId: "WNBA-LAS", jerseyNumber: "22", rationale: "Los Angeles frontcourt coverage across profiles, defensive research, and comparisons." },
  { categoryId: "wnba", id: "wnba-gabby-williams", teamId: "WNBA-GSV", jerseyNumber: "22", rationale: "Golden State wing coverage across stories, profiles, comparisons, and research." },

  // NFL: approved exact featured portraits retain team and sport fallback coverage.
  { categoryId: "nfl", id: "nfl-patrick-mahomes", teamId: "KC", jerseyNumber: "15", rationale: "Quarterback research coverage for Kansas City stories, comparisons, and leaderboards." },
  { categoryId: "nfl", id: "nfl-josh-allen", teamId: "BUF", jerseyNumber: "17", rationale: "Buffalo quarterback coverage with passing and rushing comparison utility." },
  { categoryId: "nfl", id: "nfl-justin-jefferson", teamId: "NFL-MIN", jerseyNumber: "18", rationale: "Wide-receiver and Minnesota coverage for receiving stories and comparisons." },
  { categoryId: "nfl", id: "nfl-bijan-robinson", teamId: "NFL-ATL", jerseyNumber: "7", rationale: "Running-back and Atlanta coverage for rushing and receiving research." },
  { categoryId: "nfl", id: "nfl-lamar-jackson", teamId: "NFL-BAL", jerseyNumber: "8", rationale: "Baltimore quarterback coverage with distinct dual-threat research contexts." },

  // UFC: ten approved exact portraits across seven divisions. This remains featured partial coverage.
  { categoryId: "ufc", id: "ufc-islam-makhachev", division: "Welterweight", rationale: "Existing exact artwork and high-utility profile, fight, comparison, and research contexts." },
  { categoryId: "ufc", id: "ufc-joshua-van", division: "Flyweight", rationale: "Flyweight coverage for fighter profiles, comparisons, event cards, and research." },
  { categoryId: "ufc", id: "ufc-carlos-prates", division: "Welterweight", rationale: "Welterweight coverage for matchup, striking, comparison, and research contexts." },
  { categoryId: "ufc", id: "ufc-michael-morales", division: "Welterweight", rationale: "Welterweight coverage for fighter profiles, comparisons, and event research." },
  { categoryId: "ufc", id: "ufc-israel-adesanya", division: "Middleweight", rationale: "Middleweight coverage for profiles, comparisons, stories, and historical research." },
  { categoryId: "ufc", id: "ufc-alexander-volkanovski", division: "Featherweight", rationale: "Featherweight coverage for profiles, comparisons, stories, and event research." },
  { categoryId: "ufc", id: "ufc-ilia-topuria", division: "Lightweight", rationale: "Lightweight coverage for profiles, comparisons, stories, and event research." },
  { categoryId: "ufc", id: "ufc-tom-aspinall", division: "Heavyweight", rationale: "Heavyweight coverage for profiles, comparisons, stories, and event research." },
  { categoryId: "ufc", id: "ufc-khamzat-chimaev", division: "Middleweight", rationale: "Additional middleweight coverage for matchup, comparison, and event research." },
  { categoryId: "ufc", id: "ufc-valentina-shevchenko", division: "Women's Flyweight", rationale: "Women's flyweight coverage for profiles, comparisons, stories, and event research." },

  // Boxing: human-approved featured portraits. This is not a finite-roster coverage claim.
  { categoryId: "boxing", id: "boxing-oleksandr-usyk", division: "Heavyweight", rationale: "Heavyweight profile, comparison, historical-context, and fight research coverage." },
  { categoryId: "boxing", id: "boxing-tyson-fury", division: "Heavyweight", rationale: "Heavyweight profile, rivalry, comparison, and historical research coverage." },
  { categoryId: "boxing", id: "boxing-anthony-joshua", division: "Heavyweight", rationale: "Heavyweight profile, comparison, event, and historical research coverage." },
  { categoryId: "boxing", id: "boxing-dmitry-bivol", division: "Light Heavyweight", rationale: "Light-heavyweight coverage for comparison and technical fight research." },
  { categoryId: "boxing", id: "boxing-canelo-alvarez", division: "Super Middleweight", rationale: "Super-middleweight profile, comparison, story, and historical research coverage." },
  { categoryId: "boxing", id: "boxing-naoya-inoue", division: "Super Bantamweight", rationale: "Super-bantamweight profile, comparison, event, and historical research coverage." },
  { categoryId: "boxing", id: "boxing-gervonta-davis", division: "Lightweight", rationale: "Lightweight profile, comparison, story, and event research coverage." },
  { categoryId: "boxing", id: "boxing-jaron-ennis", division: "Super Welterweight", rationale: "Super-welterweight profile, comparison, event, and market research coverage." },
  { categoryId: "boxing", id: "boxing-teofimo-lopez", division: "Welterweight", rationale: "Welterweight profile, comparison, story, and event research coverage." },
  { categoryId: "boxing", id: "boxing-jesse-rodriguez", division: "Bantamweight", rationale: "Bantamweight profile, comparison, event, and historical research coverage." },
  { categoryId: "boxing", id: "boxing-abdullah-mason", division: "Lightweight", rationale: "Lightweight coverage and an emerging-athlete research path." },
  { categoryId: "boxing", id: "boxing-bruce-carrington", division: "Featherweight", rationale: "Featherweight coverage with distinct profile, matchup, and emerging-story contexts." },
  { categoryId: "boxing", id: "boxing-shakur-stevenson", division: "Super Lightweight", rationale: "Super-lightweight profile, comparison, story, and event research coverage." },
]);

const UFC_FEATURED_SUPPLEMENTAL_SOURCES = Object.freeze([
  Object.freeze({ canonicalFighterId: "ufc-carlos-prates", displayName: "Carlos Prates", sportId: "mma", leagueId: "ufc", weightClass: "Welterweight", showcaseRole: "featured_star", portraitPrompt: "Original EdgeBoard Illustration Style v1 portrait of Carlos Prates in a restrained MMA stance with simplified black fight gloves and no promotional background.", actionPrompt: "Original EdgeBoard Illustration Style v1 fighting-stance variant of Carlos Prates with guarded hands and transparent background." }),
  Object.freeze({ canonicalFighterId: "ufc-michael-morales", displayName: "Michael Morales", sportId: "mma", leagueId: "ufc", weightClass: "Welterweight", showcaseRole: "featured_star", portraitPrompt: "Original EdgeBoard Illustration Style v1 portrait of Michael Morales in a restrained MMA stance with simplified black fight gloves and no promotional background.", actionPrompt: "Original EdgeBoard Illustration Style v1 fighting-stance variant of Michael Morales with guarded hands and transparent background." }),
  Object.freeze({ canonicalFighterId: "ufc-israel-adesanya", displayName: "Israel Adesanya", sportId: "mma", leagueId: "ufc", weightClass: "Middleweight", showcaseRole: "featured_star", portraitPrompt: "Original EdgeBoard Illustration Style v1 portrait of Israel Adesanya in a neutral fighter pose with simplified fight attire and no promotional background.", actionPrompt: "Original EdgeBoard Illustration Style v1 fighting-stance variant of Israel Adesanya with balanced guard and transparent background." }),
]);

const BOXING_FEATURED_SUPPLEMENTAL_SOURCES = Object.freeze([
  Object.freeze({ canonicalFighterId: "boxing-anthony-joshua", displayName: "Anthony Joshua", sportId: "boxing", leagueId: "boxing", weightClass: "Heavyweight", showcaseRole: "featured_star", portraitPrompt: "Human-approved supplied final Anthony Joshua production portrait.", actionPrompt: "No action variant supplied in this production ingestion." }),
  Object.freeze({ canonicalFighterId: "boxing-canelo-alvarez", displayName: "Canelo Álvarez", sportId: "boxing", leagueId: "boxing", weightClass: "Super Middleweight", showcaseRole: "featured_star", portraitPrompt: "Human-approved supplied final Canelo Álvarez production portrait.", actionPrompt: "No action variant supplied in this production ingestion." }),
  Object.freeze({ canonicalFighterId: "boxing-naoya-inoue", displayName: "Naoya Inoue", sportId: "boxing", leagueId: "boxing", weightClass: "Super Bantamweight", showcaseRole: "featured_star", portraitPrompt: "Human-approved supplied final Naoya Inoue production portrait.", actionPrompt: "No action variant supplied in this production ingestion." }),
  Object.freeze({ canonicalFighterId: "boxing-gervonta-davis", displayName: "Gervonta Davis", sportId: "boxing", leagueId: "boxing", weightClass: "Lightweight", showcaseRole: "featured_star", portraitPrompt: "Human-approved supplied final Gervonta Davis production portrait.", actionPrompt: "No action variant supplied in this production ingestion." }),
  Object.freeze({ canonicalFighterId: "boxing-jaron-ennis", displayName: "Jaron Ennis", sportId: "boxing", leagueId: "boxing", weightClass: "Super Welterweight", showcaseRole: "featured_star", portraitPrompt: "Human-approved supplied final Jaron Ennis production portrait.", actionPrompt: "No action variant supplied in this production ingestion." }),
  Object.freeze({ canonicalFighterId: "boxing-teofimo-lopez", displayName: "Teofimo Lopez", sportId: "boxing", leagueId: "boxing", weightClass: "Welterweight", showcaseRole: "featured_star", portraitPrompt: "Human-approved supplied replacement Teofimo Lopez production portrait.", actionPrompt: "No action variant supplied in this production ingestion." }),
  Object.freeze({ canonicalFighterId: "boxing-jesse-rodriguez", displayName: "Jesse Rodriguez", sportId: "boxing", leagueId: "boxing", weightClass: "Bantamweight", showcaseRole: "featured_star", portraitPrompt: "Human-approved supplied final Jesse Rodriguez production portrait.", actionPrompt: "No action variant supplied in this production ingestion." }),
  Object.freeze({ canonicalFighterId: "boxing-bruce-carrington", displayName: "Bruce Carrington", sportId: "boxing", leagueId: "boxing", weightClass: "Featherweight", showcaseRole: "featured_star", portraitPrompt: "Human-approved supplied final Bruce Carrington production portrait.", actionPrompt: "No action variant supplied in this production ingestion." }),
  Object.freeze({ canonicalFighterId: "boxing-shakur-stevenson", displayName: "Shakur Stevenson", sportId: "boxing", leagueId: "boxing", weightClass: "Super Lightweight", showcaseRole: "featured_star", portraitPrompt: "Human-approved supplied final Shakur Stevenson production portrait.", actionPrompt: "No action variant supplied in this production ingestion." }),
]);

const SOURCES_BY_CATEGORY = Object.freeze({
  wnba: WNBA_SHOWCASE_BATCH_2,
  nfl: NFL_SHOWCASE_BATCH_4,
  ufc: Object.freeze([...UFC_SHOWCASE_BATCH_3, ...UFC_FEATURED_SUPPLEMENTAL_SOURCES]),
  boxing: Object.freeze([...BOXING_SHOWCASE_BATCH_3, ...BOXING_FEATURED_SUPPLEMENTAL_SOURCES]),
});

const OFFICIAL_VERIFICATION = Object.freeze({
  wnba: Object.freeze(["https://www.wnba.com/allstar/2026/roster", "https://www.wnba.com/news/broadcast-schedule-release-2026"]),
  nfl: Object.freeze(["https://www.nfl.com/players/", "https://www.nfl.com/teams/"]),
  ufc: Object.freeze(["https://www.ufc.com/athletes", "https://www.ufc.com/rankings"]),
  boxing: Object.freeze(["https://wboboxing.com/male-champions/", "https://www.wbaboxing.com/wba-boxer-profile"]),
});

function sourceId(entry) { return entry.canonicalAthleteId || entry.canonicalFighterId; }
function futureAssetPath(categoryId, id) {
  const folder = ["ufc", "boxing"].includes(categoryId) ? "fighters" : "athletes";
  return `assets/illustrations/${folder}/edgeboard--${id}--portrait--v01.png`;
}

function fallbackFor(selection, source) {
  if (["wnba", "nfl"].includes(selection.categoryId)) return Object.freeze({
    hierarchy: Object.freeze(["exact", "team", "sport", "neutral"]),
    teamRegistryId: source.fallback.teamFallbackRegistryId,
    organizationRegistryId: null,
    sportRegistryId: selection.categoryId === "wnba" ? "art-generic-basketball" : "art-generic-football",
    neutralRegistryId: "art-placeholder-neutral",
  });
  return Object.freeze({
    hierarchy: Object.freeze(selection.categoryId === "ufc" ? ["exact", "organization_if_available", "sport", "neutral"] : ["exact", "sport", "neutral"]),
    teamRegistryId: null,
    // EdgeBoard has no organization-owned UFC asset; falling through to sport art is intentional.
    organizationRegistryId: null,
    sportRegistryId: selection.categoryId === "ufc" ? "art-generic-mma" : "art-generic-boxing",
    neutralRegistryId: "art-placeholder-neutral",
  });
}

function buildEntry(selection) {
  const source = SOURCES_BY_CATEGORY[selection.categoryId].find((item) => sourceId(item) === selection.id);
  const canonical = CANONICAL_ENTITIES.find((item) => item.id === selection.id);
  const activeExact = ILLUSTRATION_REGISTRY.find((item) => item.status === "active" && item.canonicalEntityId === selection.id && item.variant === "portrait");
  const needsRevision = TECHNICAL_REVISION_IDS.has(selection.id);
  const assetPath = activeExact?.assetPath || futureAssetPath(selection.categoryId, selection.id);
  const teamName = source?.teamDisplayName || null;
  return Object.freeze({
    batchId: `featured-${selection.categoryId}-portrait-readiness`,
    categoryId: selection.categoryId,
    coverageType: "featured_partial",
    canonicalEntityId: selection.id,
    displayName: canonical?.name || source?.displayName || selection.id,
    sportId: canonical?.sportId || source?.sportId || "",
    leagueId: canonical?.leagueId || source?.leagueId || selection.categoryId,
    canonicalTeamId: selection.teamId || null,
    teamDisplayName: teamName,
    position: canonical?.position || source?.position || null,
    division: selection.division || canonical?.weightClass || source?.weightClass || null,
    jerseyNumber: selection.jerseyNumber || null,
    showcaseRole: source?.showcaseRole || (selection.categoryId === "wnba" || selection.categoryId === "nfl" ? "team_representative" : "featured_star"),
    whySelected: selection.rationale,
    expectedEditorialContexts: Object.freeze(["home_story", "profile", "comparison", "research", "workspace"]),
    providerResolution: "canonical_registry_and_showcase_manifest",
    providerDisclosure: "Identity is canonical; this readiness manifest does not claim a live roster or statistics feed.",
    currentAssignmentVerifiedAt: VERIFIED_AT,
    authoritativeSources: OFFICIAL_VERIFICATION[selection.categoryId],
    sourceShowcaseId: sourceId(source || {}),
    styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
    portraitMode: "standard",
    assetPath,
    productionStatus: activeExact ? "approved_existing_exact" : needsRevision ? "needs_revision" : "awaiting_asset",
    reviewStatus: activeExact ? "approved_existing" : needsRevision ? "needs_revision" : "not_submitted",
    registryStatus: activeExact ? "active_existing" : needsRevision ? "blocked_needs_revision" : "planned_not_active",
    exactArtworkActive: Boolean(activeExact),
    fallback: fallbackFor(selection, source),
    productionPrompt: `${source?.portraitPrompt || ""} Output only one 640 × 800, 8-bit RGBA, non-interlaced PNG with meaningful transparent background; do not activate it before technical validation and human approval.`,
    optionalActionPrompt: source?.actionPrompt || "",
    registryDraft: activeExact ? Object.freeze({ ...activeExact, status: "active_existing_reference" }) : Object.freeze({
      id: `art-${selection.id}-portrait`,
      entityType: ["ufc", "boxing"].includes(selection.categoryId) ? "fighter" : "athlete",
      canonicalEntityId: selection.id,
      sport: canonical?.sportId || source?.sportId,
      league: canonical?.leagueId || source?.leagueId,
      teamId: selection.teamId || "",
      weightClass: selection.division || "",
      assetPath,
      assetType: "original_manual",
      variant: "portrait",
      priority: 90,
      status: needsRevision ? "needs_revision" : "planned",
      source: "edgeboard_original",
      styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
      altText: `${canonical?.name || source?.displayName} editorial illustration`,
    }),
  });
}

export const FEATURED_PORTRAIT_SELECTIONS = Object.freeze(RAW_SELECTIONS.map(buildEntry));

export function validateFeaturedPortraitCoverage(entries = FEATURED_PORTRAIT_SELECTIONS, {
  canonicalEntities = CANONICAL_ENTITIES,
  illustrationEntries = ILLUSTRATION_REGISTRY,
} = {}) {
  const errors = [];
  const ids = new Set(); const paths = new Set();
  const canonical = new Map(canonicalEntities.map((item) => [item.id, item]));
  const activeRegistryIds = new Set(illustrationEntries.filter((item) => item.status === "active").map((item) => item.id));
  const activeFallbackIds = new Set(illustrationEntries.filter((item) => item.status === "active").map((item) => item.id));
  for (const entry of entries) {
    if (ids.has(entry.canonicalEntityId)) errors.push(`Duplicate featured entity: ${entry.canonicalEntityId}.`);
    if (paths.has(entry.assetPath)) errors.push(`Duplicate featured portrait path: ${entry.assetPath}.`);
    ids.add(entry.canonicalEntityId); paths.add(entry.assetPath);
    const entity = canonical.get(entry.canonicalEntityId);
    if (!entity || entity.sportId !== entry.sportId || entity.leagueId !== entry.leagueId) errors.push(`Canonical mapping mismatch: ${entry.canonicalEntityId}.`);
    if (entry.canonicalTeamId && entity?.teamId !== entry.canonicalTeamId) errors.push(`Current team mapping mismatch: ${entry.canonicalEntityId}.`);
    if (entry.division && entity?.weightClass !== entry.division) errors.push(`Current division mapping mismatch: ${entry.canonicalEntityId}.`);
    if (!entry.sourceShowcaseId || !entry.productionPrompt || !entry.optionalActionPrompt) errors.push(`Showcase production source missing: ${entry.canonicalEntityId}.`);
    if (entry.styleVersion !== EDGEBOARD_ILLUSTRATION_STYLE_VERSION) errors.push(`Style mismatch: ${entry.canonicalEntityId}.`);
    if (!entry.exactArtworkActive && !entry.assetPath.endsWith(".png")) errors.push(`Planned portrait target is not PNG: ${entry.canonicalEntityId}.`);
    if (!entry.exactArtworkActive && activeRegistryIds.has(entry.registryDraft.id)) errors.push(`Unreviewed planned portrait is active: ${entry.registryDraft.id}.`);
    for (const fallbackId of [entry.fallback.teamRegistryId, entry.fallback.organizationRegistryId, entry.fallback.sportRegistryId, entry.fallback.neutralRegistryId].filter(Boolean)) {
      if (!activeFallbackIds.has(fallbackId)) errors.push(`Inactive or missing fallback ${fallbackId} for ${entry.canonicalEntityId}.`);
    }
  }
  const coverage = FEATURED_PORTRAIT_COVERAGE_METADATA.categories.map((categoryId) => {
    const categoryEntries = entries.filter((item) => item.categoryId === categoryId);
    const exactActive = categoryEntries.filter((item) => item.exactArtworkActive).length;
    const target = TARGET_BY_CATEGORY[categoryId];
    if (categoryEntries.length !== target) errors.push(`Expected ${target} featured ${categoryId} selections; received ${categoryEntries.length}.`);
    return Object.freeze({
      categoryId, coverageType: "featured_partial", selected: categoryEntries.length,
      target, exactActive, productionRequired: categoryEntries.length - exactActive,
      fallbackCovered: categoryEntries.filter((item) => item.fallback.sportRegistryId && item.fallback.neutralRegistryId).length,
      summary: categoryId === "wnba"
        ? `WNBA featured exact portrait coverage: ${exactActive} active athletes`
        : categoryId === "nfl"
          ? `NFL featured exact portrait coverage: ${exactActive} active athletes across ${new Set(categoryEntries.map((item) => item.canonicalTeamId)).size} of 32 teams; partial featured coverage, not complete league coverage.`
          : categoryId === "ufc"
            ? `UFC featured exact portrait coverage: ${exactActive} active fighters across ${new Set(categoryEntries.map((item) => item.division)).size} divisions; partial featured coverage, not complete roster coverage.`
            : `Boxing featured exact portraits: ${exactActive} active; featured partial coverage, not complete boxing coverage.`,
    });
  });
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    selected: entries.length,
    productionRequired: entries.filter((item) => !item.exactArtworkActive).length,
    coverage: Object.freeze(coverage),
  });
}
