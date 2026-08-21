import { ILLUSTRATION_REGISTRY } from "../src/config/illustration-registry.js";
import { ILLUSTRATION_PROOF_QA_FIELDS, ILLUSTRATION_STYLE_PROOF_BATCH } from "../src/config/illustration-style-proof-batch.js";
import { EDGEBOARD_ILLUSTRATION_STYLE_V1, EDGEBOARD_ILLUSTRATION_STYLE_VERSION } from "../src/config/illustration-style-v1.js";
import { CANONICAL_ENTITIES } from "../src/data/canonical-entities.js";
import { approvedProofRegistryEntry, evaluateIllustrationProofActivation, prepareProofAssetSubmission, validateIllustrationProofBatch, validateProofAssetInspection } from "../src/services/illustration-proof-service.js";
import { createIllustrationResolver, getIllustration } from "../src/services/illustration-service.js";
import { MLB_SHOWCASE_BATCH_1 } from "../src/config/mlb-illustration-showcase-batch-1.js";
import { NBA_SHOWCASE_BATCH_2, WNBA_SHOWCASE_BATCH_2 } from "../src/config/basketball-illustration-showcase-batch-2.js";
import { NFL_SHOWCASE_BATCH_4 } from "../src/config/football-hockey-illustration-showcase-batch-4.js";
import { FEATURED_PORTRAIT_SELECTIONS } from "../src/config/featured-portrait-coverage.js";

const output = document.querySelector("#results");
const gallery = document.querySelector("#proofGallery");
const collectionPreview = document.querySelector("#collectionPreview");
const nbaCollectionPreview = document.querySelector("#nbaCollectionPreview");
const nbaGallery = document.querySelector("#nbaGallery");
const wnbaCollectionPreview = document.querySelector("#wnbaCollectionPreview");
const wnbaGallery = document.querySelector("#wnbaGallery");
const nflCollectionPreview = document.querySelector("#nflCollectionPreview");
const nflGallery = document.querySelector("#nflGallery");
const ufcCollectionPreview = document.querySelector("#ufcCollectionPreview");
const ufcGallery = document.querySelector("#ufcGallery");
const boxingCollectionPreview = document.querySelector("#boxingCollectionPreview");
const boxingGallery = document.querySelector("#boxingGallery");
const mlbCollectionPreview = document.querySelector("#mlbCollectionPreview");
const mlbGallery = document.querySelector("#mlbGallery");
const referenceHost = document.querySelector("#styleReference");
const failures = []; const checks = [];
const check = (condition, label) => { checks.push(label); if (!condition) failures.push(label); };
const entities = new Map(CANONICAL_ENTITIES.map((entity) => [entity.id, entity]));
const contexts = ["profile", "story", "comparison", "compact", "market", "parlay"];
const styleReference = EDGEBOARD_ILLUSTRATION_STYLE_V1.reference;
const inspected = { fileExists: true, fileType: "png", integrityValid: true, decoded: true, rgba: true, width: 640, height: 800, transparentBackground: true, meaningfulTransparency: true, sizeBytes: 1200000, orphan: false };

function contextFor(slot) {
  return { sport: slot.sport, league: slot.league, teamId: slot.teamId, weightClass: slot.weightClass, series: slot.series, tour: slot.tour };
}

function imageMarkup(illustration, slot, { decorative = false, compact = false } = {}) {
  const alt = decorative ? "" : `${slot.displayName} editorial illustration`;
  return `<img src="../${illustration.assetPath}" alt="${alt}" ${decorative ? 'aria-hidden="true"' : ""} loading="lazy" decoding="async" width="${compact ? 96 : 640}" height="${compact ? 96 : 800}">`;
}

referenceHost.dataset.assetType = styleReference.assetType;
referenceHost.dataset.ingestionStatus = styleReference.ingestionStatus;
referenceHost.innerHTML = `<div><p class="eyebrow">Approved style reference</p><h2 id="styleReferenceTitle">EDGEBOARD ILLUSTRATION STYLE v1</h2><p>The reference sheet and these six approved production exemplars define one style version.</p><span class="reference-panel__status">${styleReference.ingestionStatus.replaceAll("_", " ")}</span></div><img src="../${styleReference.assetPath}" alt="Approved six-athlete EdgeBoard Illustration Style v1 reference sheet" loading="lazy" decoding="async" width="${styleReference.width}" height="${styleReference.height}">`;

for (const slot of ILLUSTRATION_STYLE_PROOF_BATCH) {
  const illustration = getIllustration(entities.get(slot.canonicalEntityId), { ...contextFor(slot), context: "profile" });
  const card = document.createElement("article");
  card.className = "proof-card";
  card.dataset.entityId = slot.canonicalEntityId;
  card.dataset.reviewStatus = slot.reviewStatus;
  card.dataset.fallbackLevel = illustration.fallbackLevel;
  card.innerHTML = `<header class="proof-card__header"><span class="status">approved</span><h2>${slot.displayName}</h2><p>${slot.sport} · ${slot.league} · production proof exemplar</p></header>
    <div class="surface-grid" aria-label="Dark and light surface previews"><div class="surface surface--dark"><span>Dark surface</span>${imageMarkup(illustration, slot)}</div><div class="surface surface--light"><span>Light surface</span>${imageMarkup(illustration, slot)}</div></div>
    <div class="size-row" aria-label="Small and profile size previews"><div class="size-example size-example--compact">${imageMarkup(illustration, slot, { decorative: true, compact: true })}<span>96px</span></div><div class="size-example size-example--profile">${imageMarkup(illustration, slot, { decorative: true })}<span>Profile frame</span></div></div>
    <ul class="context-list" aria-label="Representative placements"><li>Profile</li><li>Story / fact</li><li>Comparison</li><li>Edge Intelligence</li><li>Restrained market research</li></ul>
    <p class="proof-meta">Active asset: ${illustration.assetPath}<br>Preserved fallback: ${slot.fallbackRegistryId}</p>`;
  gallery.append(card);
  collectionPreview.insertAdjacentHTML("beforeend", imageMarkup(illustration, slot, { decorative: true }));
}

const approvedNbaSlots = NBA_SHOWCASE_BATCH_2.filter((slot) => slot.productionStatus === "approved" && slot.reviewStatus === "approved");
for (const slot of approvedNbaSlots) {
  const entity = entities.get(slot.canonicalAthleteId);
  const illustration = getIllustration(entity, { sport: "basketball", league: "nba", teamId: slot.canonicalTeamId, context: "profile" });
  nbaCollectionPreview.insertAdjacentHTML("beforeend", imageMarkup(illustration, slot, { decorative: true }));
  const card = document.createElement("article");
  card.className = "proof-card";
  card.dataset.entityId = slot.canonicalAthleteId;
  card.dataset.reviewStatus = slot.reviewStatus;
  card.dataset.fallbackLevel = illustration.fallbackLevel;
  card.innerHTML = `<header class="proof-card__header"><span class="status">approved</span><h2>${slot.displayName}</h2><p>NBA · Style v1 production portrait</p></header>
    <div class="surface-grid" aria-label="Dark and light surface previews"><div class="surface surface--dark"><span>Dark surface</span>${imageMarkup(illustration, slot)}</div><div class="surface surface--light"><span>Light surface</span>${imageMarkup(illustration, slot)}</div></div>
    <div class="size-row" aria-label="Compact and profile previews"><div class="size-example size-example--compact">${imageMarkup(illustration, slot, { decorative: true, compact: true })}<span>96px</span></div><div class="size-example size-example--profile">${imageMarkup(illustration, slot, { decorative: true })}<span>Profile frame</span></div></div>
    <ul class="context-list" aria-label="Representative placements"><li>Profile</li><li>Story / fact</li><li>Comparison</li><li>Edge Intelligence</li><li>Leaderboard feature</li><li>Market / parlay context</li></ul>
    <p class="proof-meta">Active asset: ${illustration.assetPath}<br>Preserved fallback: ${slot.fallback.teamFallbackRegistryId}</p>`;
  nbaGallery.append(card);
}

for (const slot of approvedNbaSlots) {
  const entity = entities.get(slot.canonicalAthleteId);
  for (const context of contexts) {
    const resolved = getIllustration(entity, { sport: "basketball", league: "nba", teamId: slot.canonicalTeamId, context });
    check(resolved?.fallbackLevel === "exact" && resolved.registryId === `art-${slot.canonicalAthleteId}-portrait`, `${slot.displayName} resolves its approved portrait in ${context} context`);
    check(resolved?.loading === "lazy" && resolved?.decoding === "async" && resolved?.altText === `${slot.displayName} editorial illustration`, `${slot.displayName} ${context} media metadata is accessible and non-eager`);
  }
}

const nbaFallbackResolver = createIllustrationResolver(ILLUSTRATION_REGISTRY.filter((entry) => !approvedNbaSlots.some((slot) => entry.canonicalEntityId === slot.canonicalAthleteId && entry.variant === "portrait")));
for (const slot of approvedNbaSlots) {
  const resolved = nbaFallbackResolver.resolve(entities.get(slot.canonicalAthleteId), { sport: "basketball", league: "nba", teamId: slot.canonicalTeamId, context: "profile" });
  check(resolved?.fallbackLevel === "team" && resolved.registryId === slot.fallback.teamFallbackRegistryId, `${slot.displayName} returns to the preserved team fallback when its exact export is unavailable`);
}

const approvedWnbaIds = new Set([
  "wnba-aja-wilson", "wnba-sabrina-ionescu", "wnba-paige-bueckers", "wnba-angel-reese",
  "wnba-caitlin-clark", "wnba-olivia-miles", "wnba-cameron-brink", "wnba-gabby-williams",
]);
const approvedWnbaSlots = WNBA_SHOWCASE_BATCH_2.filter((slot) => approvedWnbaIds.has(slot.canonicalAthleteId) && slot.productionStatus === "approved" && slot.reviewStatus === "approved");
for (const slot of approvedWnbaSlots) {
  const entity = entities.get(slot.canonicalAthleteId);
  const illustration = getIllustration(entity, { sport: "basketball", league: "wnba", teamId: slot.canonicalTeamId, context: "profile" });
  wnbaCollectionPreview.insertAdjacentHTML("beforeend", imageMarkup(illustration, slot, { decorative: true }));
  const card = document.createElement("article");
  card.className = "proof-card";
  card.dataset.entityId = slot.canonicalAthleteId;
  card.dataset.reviewStatus = slot.reviewStatus;
  card.dataset.fallbackLevel = illustration.fallbackLevel;
  card.innerHTML = `<header class="proof-card__header"><span class="status">approved</span><h2>${slot.displayName}</h2><p>WNBA · featured Style v1 production portrait</p></header>
    <div class="surface-grid" aria-label="Dark and light surface previews"><div class="surface surface--dark"><span>Dark surface</span>${imageMarkup(illustration, slot)}</div><div class="surface surface--light"><span>Light surface</span>${imageMarkup(illustration, slot)}</div></div>
    <div class="size-row" aria-label="Compact and profile previews"><div class="size-example size-example--compact">${imageMarkup(illustration, slot, { decorative: true, compact: true })}<span>96px</span></div><div class="size-example size-example--profile">${imageMarkup(illustration, slot, { decorative: true })}<span>Profile frame</span></div></div>
    <ul class="context-list" aria-label="Representative placements"><li>Profile</li><li>Story / fact</li><li>Comparison</li><li>Edge Intelligence</li><li>Leaderboard feature</li><li>Market / parlay context</li></ul>
    <p class="proof-meta">Active asset: ${illustration.assetPath}<br>Preserved fallback: ${slot.fallback.teamFallbackRegistryId}</p>`;
  wnbaGallery.append(card);
}

const approvedNflIds = new Set([
  "nfl-patrick-mahomes", "nfl-josh-allen", "nfl-justin-jefferson", "nfl-bijan-robinson", "nfl-lamar-jackson",
]);
const approvedNflSlots = NFL_SHOWCASE_BATCH_4.filter((slot) => approvedNflIds.has(slot.canonicalAthleteId) && slot.generationStatus === "approved_existing" && slot.reviewStatus === "approved_existing");
for (const slot of approvedNflSlots) {
  const entity = entities.get(slot.canonicalAthleteId);
  const illustration = getIllustration(entity, { sport: "american-football", league: "nfl", teamId: slot.canonicalTeamId, context: "profile" });
  nflCollectionPreview.insertAdjacentHTML("beforeend", imageMarkup(illustration, slot, { decorative: true }));
  const card = document.createElement("article");
  card.className = "proof-card";
  card.dataset.entityId = slot.canonicalAthleteId;
  card.dataset.reviewStatus = "approved";
  card.dataset.fallbackLevel = illustration.fallbackLevel;
  card.innerHTML = `<header class="proof-card__header"><span class="status">approved</span><h2>${slot.displayName}</h2><p>NFL · featured Style v1 production portrait</p></header>
    <div class="surface-grid" aria-label="Dark and light surface previews"><div class="surface surface--dark"><span>Dark surface</span>${imageMarkup(illustration, slot)}</div><div class="surface surface--light"><span>Light surface</span>${imageMarkup(illustration, slot)}</div></div>
    <div class="size-row" aria-label="Compact and profile previews"><div class="size-example size-example--compact">${imageMarkup(illustration, slot, { decorative: true, compact: true })}<span>96px</span></div><div class="size-example size-example--profile">${imageMarkup(illustration, slot, { decorative: true })}<span>Profile frame</span></div></div>
    <ul class="context-list" aria-label="Representative placements"><li>Profile</li><li>Story / fact</li><li>Comparison</li><li>Edge Intelligence</li><li>Leaderboard feature</li><li>Market / parlay context</li></ul>
    <p class="proof-meta">Active asset: ${illustration.assetPath}<br>Preserved fallback: ${slot.fallback.teamFallbackRegistryId}</p>`;
  nflGallery.append(card);
}

for (const slot of approvedNflSlots) {
  const entity = entities.get(slot.canonicalAthleteId);
  for (const context of contexts) {
    const resolved = getIllustration(entity, { sport: "american-football", league: "nfl", teamId: slot.canonicalTeamId, context });
    check(resolved?.fallbackLevel === "exact" && resolved.registryId === `art-${slot.canonicalAthleteId}-portrait`, `${slot.displayName} resolves its approved portrait in ${context} context`);
    check(resolved?.loading === "lazy" && resolved?.decoding === "async" && resolved?.altText === `${slot.displayName} editorial illustration`, `${slot.displayName} ${context} media metadata is accessible and non-eager`);
  }
}

const nflFallbackResolver = createIllustrationResolver(ILLUSTRATION_REGISTRY.filter((entry) => !approvedNflSlots.some((slot) => entry.canonicalEntityId === slot.canonicalAthleteId && entry.variant === "portrait")));
for (const slot of approvedNflSlots) {
  const resolved = nflFallbackResolver.resolve(entities.get(slot.canonicalAthleteId), { sport: "american-football", league: "nfl", teamId: slot.canonicalTeamId, context: "profile" });
  check(resolved?.fallbackLevel === "team" && resolved.registryId === slot.fallback.teamFallbackRegistryId, `${slot.displayName} returns to the preserved team fallback when exact art is unavailable`);
}

const nflGenericResolver = createIllustrationResolver(ILLUSTRATION_REGISTRY.filter((entry) => !approvedNflSlots.some((slot) => (
  (entry.canonicalEntityId === slot.canonicalAthleteId && entry.variant === "portrait")
  || (entry.assetType === "team_fallback" && entry.teamId === slot.canonicalTeamId)
))));
for (const slot of approvedNflSlots) {
  const resolved = nflGenericResolver.resolve(entities.get(slot.canonicalAthleteId), { sport: "american-football", league: "nfl", teamId: slot.canonicalTeamId, context: "profile" });
  check(resolved?.fallbackLevel === "generic_sport" && resolved.registryId === "art-generic-football", `${slot.displayName} reaches the generic football fallback when exact and team art are unavailable`);
}

const nflNeutralResolver = createIllustrationResolver(ILLUSTRATION_REGISTRY.filter((entry) => (
  !(entry.assetType === "generic_sport" && entry.sport === "american-football")
  && !approvedNflSlots.some((slot) => (
    (entry.canonicalEntityId === slot.canonicalAthleteId && entry.variant === "portrait")
    || (entry.assetType === "team_fallback" && entry.teamId === slot.canonicalTeamId)
  ))
)));
for (const slot of approvedNflSlots) {
  const resolved = nflNeutralResolver.resolve(entities.get(slot.canonicalAthleteId), { sport: "american-football", league: "nfl", teamId: slot.canonicalTeamId, context: "profile" });
  check(resolved?.fallbackLevel === "neutral" && resolved.registryId === "art-placeholder-neutral", `${slot.displayName} reaches the neutral fallback when all more-specific art is unavailable`);
}

const approvedUfcIds = new Set([
  "ufc-islam-makhachev", "ufc-joshua-van", "ufc-carlos-prates", "ufc-michael-morales",
  "ufc-israel-adesanya", "ufc-alexander-volkanovski",
  "ufc-ilia-topuria", "ufc-tom-aspinall", "ufc-khamzat-chimaev", "ufc-valentina-shevchenko",
]);
const approvedUfcSlots = FEATURED_PORTRAIT_SELECTIONS.filter((slot) => (
  slot.categoryId === "ufc" && approvedUfcIds.has(slot.canonicalEntityId) && slot.exactArtworkActive
));
for (const slot of approvedUfcSlots) {
  const entity = entities.get(slot.canonicalEntityId);
  const illustration = getIllustration(entity, { sport: "mma", league: "ufc", weightClass: slot.division, context: "profile" });
  ufcCollectionPreview.insertAdjacentHTML("beforeend", imageMarkup(illustration, slot, { decorative: true }));
  const card = document.createElement("article");
  card.className = "proof-card";
  card.dataset.entityId = slot.canonicalEntityId;
  card.dataset.reviewStatus = "approved";
  card.dataset.fallbackLevel = illustration.fallbackLevel;
  card.innerHTML = `<header class="proof-card__header"><span class="status">approved</span><h2>${slot.displayName}</h2><p>UFC · ${slot.division} · featured Style v1 production portrait</p></header>
    <div class="surface-grid" aria-label="Dark and light surface previews"><div class="surface surface--dark"><span>Dark surface</span>${imageMarkup(illustration, slot)}</div><div class="surface surface--light"><span>Light surface</span>${imageMarkup(illustration, slot)}</div></div>
    <div class="size-row" aria-label="Compact and profile previews"><div class="size-example size-example--compact">${imageMarkup(illustration, slot, { decorative: true, compact: true })}<span>96px</span></div><div class="size-example size-example--profile">${imageMarkup(illustration, slot, { decorative: true })}<span>Profile frame</span></div></div>
    <ul class="context-list" aria-label="Representative placements"><li>Profile</li><li>Story / fact</li><li>Comparison</li><li>Edge Intelligence</li><li>Fight card</li><li>Market / parlay context</li></ul>
    <p class="proof-meta">Active asset: ${illustration.assetPath}<br>Preserved fallback: ${slot.fallback.sportRegistryId}</p>`;
  ufcGallery.append(card);
}

for (const slot of approvedUfcSlots) {
  const entity = entities.get(slot.canonicalEntityId);
  for (const context of contexts) {
    const resolved = getIllustration(entity, { sport: "mma", league: "ufc", weightClass: slot.division, context });
    check(resolved?.fallbackLevel === "exact" && resolved.registryId === `art-${slot.canonicalEntityId}-portrait`, `${slot.displayName} resolves its approved portrait in ${context} context`);
    check(resolved?.loading === "lazy" && resolved?.decoding === "async" && resolved?.altText === `${slot.displayName} editorial illustration`, `${slot.displayName} ${context} media metadata is accessible and non-eager`);
  }
}

const ufcFallbackResolver = createIllustrationResolver(ILLUSTRATION_REGISTRY.filter((entry) => !approvedUfcSlots.some((slot) => (
  entry.canonicalEntityId === slot.canonicalEntityId && entry.variant === "portrait"
))));
for (const slot of approvedUfcSlots) {
  const resolved = ufcFallbackResolver.resolve(entities.get(slot.canonicalEntityId), { sport: "mma", league: "ufc", weightClass: slot.division, context: "profile", fallbackPolicy: "featured_story" });
  check(resolved?.fallbackLevel === "generic_sport" && resolved.registryId === "art-generic-mma", `${slot.displayName} returns to the preserved combat-sport fallback when exact art is unavailable`);
}

const ufcNeutralResolver = createIllustrationResolver(ILLUSTRATION_REGISTRY.filter((entry) => (
  !(entry.assetType === "generic_sport" && entry.sport === "mma")
  && !approvedUfcSlots.some((slot) => entry.canonicalEntityId === slot.canonicalEntityId && entry.variant === "portrait")
)));
for (const slot of approvedUfcSlots) {
  const resolved = ufcNeutralResolver.resolve(entities.get(slot.canonicalEntityId), { sport: "mma", league: "ufc", weightClass: slot.division, context: "profile", fallbackPolicy: "featured_story" });
  check(resolved?.fallbackLevel === "neutral" && resolved.registryId === "art-placeholder-neutral", `${slot.displayName} reaches the neutral fallback when exact and combat-sport art are unavailable`);
}

const sampleFighter = entities.get("ufc-sample-fighter-a");
const sampleFighterIllustration = getIllustration(sampleFighter, { sport: "mma", league: "ufc", context: "profile" });
check(sampleFighterIllustration?.fallbackLevel === "generic_sport" && sampleFighterIllustration.registryId === "art-generic-mma", "Sample Fighter A remains fallback-driven and does not receive a featured portrait");

const approvedBoxingSlots = FEATURED_PORTRAIT_SELECTIONS.filter((slot) => slot.categoryId === "boxing" && slot.exactArtworkActive);
for (const slot of approvedBoxingSlots) {
  const entity = entities.get(slot.canonicalEntityId);
  const illustration = getIllustration(entity, { sport: "boxing", league: "boxing", weightClass: slot.division, context: "profile" });
  boxingCollectionPreview.insertAdjacentHTML("beforeend", imageMarkup(illustration, slot, { decorative: true }));
  const card = document.createElement("article");
  card.className = "proof-card";
  card.dataset.entityId = slot.canonicalEntityId;
  card.dataset.reviewStatus = "approved";
  card.dataset.fallbackLevel = illustration.fallbackLevel;
  card.innerHTML = `<header class="proof-card__header"><span class="status">approved</span><h2>${slot.displayName}</h2><p>Boxing · ${slot.division} · featured Style v1 production portrait</p></header>
    <div class="surface-grid" aria-label="Dark and light surface previews"><div class="surface surface--dark"><span>Dark surface</span>${imageMarkup(illustration, slot)}</div><div class="surface surface--light"><span>Light surface</span>${imageMarkup(illustration, slot)}</div></div>
    <div class="size-row" aria-label="Compact and profile previews"><div class="size-example size-example--compact">${imageMarkup(illustration, slot, { decorative: true, compact: true })}<span>96px</span></div><div class="size-example size-example--profile">${imageMarkup(illustration, slot, { decorative: true })}<span>Profile frame</span></div></div>
    <ul class="context-list" aria-label="Representative placements"><li>Home / Stories</li><li>Profile</li><li>Comparison</li><li>Discovery</li><li>Edge Intelligence</li><li>Historical / market research</li></ul>
    <p class="proof-meta">Active asset: ${illustration.assetPath}<br>Preserved fallback: ${slot.fallback.sportRegistryId}</p>`;
  boxingGallery.append(card);
}

for (const slot of approvedBoxingSlots) {
  const entity = entities.get(slot.canonicalEntityId);
  for (const context of contexts) {
    const resolved = getIllustration(entity, { sport: "boxing", league: "boxing", weightClass: slot.division, context });
    check(resolved?.fallbackLevel === "exact" && resolved.registryId === `art-${slot.canonicalEntityId}-portrait`, `${slot.displayName} resolves its approved Boxing portrait in ${context} context`);
    check(resolved?.loading === "lazy" && resolved?.decoding === "async" && resolved?.altText === `${slot.displayName} editorial illustration`, `${slot.displayName} ${context} media metadata is accessible and non-eager`);
  }
}

const boxingFallbackResolver = createIllustrationResolver(ILLUSTRATION_REGISTRY.filter((entry) => !approvedBoxingSlots.some((slot) => (
  entry.canonicalEntityId === slot.canonicalEntityId && entry.variant === "portrait"
))));
for (const slot of approvedBoxingSlots) {
  const resolved = boxingFallbackResolver.resolve(entities.get(slot.canonicalEntityId), { sport: "boxing", league: "boxing", weightClass: slot.division, context: "profile", fallbackPolicy: "featured_story" });
  check(resolved?.fallbackLevel === "generic_sport" && resolved.registryId === "art-generic-boxing", `${slot.displayName} returns to the preserved Boxing fallback when exact art is unavailable`);
}

const boxingNeutralResolver = createIllustrationResolver(ILLUSTRATION_REGISTRY.filter((entry) => (
  !(entry.assetType === "generic_sport" && entry.sport === "boxing")
  && !approvedBoxingSlots.some((slot) => entry.canonicalEntityId === slot.canonicalEntityId && entry.variant === "portrait")
)));
for (const slot of approvedBoxingSlots) {
  const resolved = boxingNeutralResolver.resolve(entities.get(slot.canonicalEntityId), { sport: "boxing", league: "boxing", weightClass: slot.division, context: "profile", fallbackPolicy: "featured_story" });
  check(resolved?.fallbackLevel === "neutral" && resolved.registryId === "art-placeholder-neutral", `${slot.displayName} reaches the neutral fallback when exact and Boxing art are unavailable`);
}

const sampleBoxer = entities.get("boxing-sample-boxer-a");
const sampleBoxerIllustration = getIllustration(sampleBoxer, { sport: "boxing", league: "boxing", context: "profile" });
check(sampleBoxerIllustration?.fallbackLevel === "generic_sport" && sampleBoxerIllustration.registryId === "art-generic-boxing", "Sample Boxer A remains fallback-driven and does not receive a featured portrait");
const teofimoSlot = FEATURED_PORTRAIT_SELECTIONS.find((slot) => slot.canonicalEntityId === "boxing-teofimo-lopez");
check(teofimoSlot?.productionStatus === "approved_existing_exact" && teofimoSlot.exactArtworkActive && teofimoSlot.registryStatus === "active_existing", "Teofimo Lopez replacement is approved and active in the exact gallery");

for (const slot of approvedWnbaSlots) {
  const entity = entities.get(slot.canonicalAthleteId);
  for (const context of contexts) {
    const resolved = getIllustration(entity, { sport: "basketball", league: "wnba", teamId: slot.canonicalTeamId, context });
    check(resolved?.fallbackLevel === "exact" && resolved.registryId === `art-${slot.canonicalAthleteId}-portrait`, `${slot.displayName} resolves its approved portrait in ${context} context`);
    check(resolved?.loading === "lazy" && resolved?.decoding === "async" && resolved?.altText === `${slot.displayName} editorial illustration`, `${slot.displayName} ${context} media metadata is accessible and non-eager`);
  }
}

const wnbaFallbackResolver = createIllustrationResolver(ILLUSTRATION_REGISTRY.filter((entry) => !approvedWnbaSlots.some((slot) => entry.canonicalEntityId === slot.canonicalAthleteId && entry.variant === "portrait")));
for (const slot of approvedWnbaSlots) {
  const entity = entities.get(slot.canonicalAthleteId);
  const teamResolved = wnbaFallbackResolver.resolve(entity, { sport: "basketball", league: "wnba", teamId: slot.canonicalTeamId, context: "profile" });
  check(teamResolved?.fallbackLevel === "team" && teamResolved.registryId === slot.fallback.teamFallbackRegistryId, `${slot.displayName} returns to the preserved team fallback when exact art is unavailable`);
}

const approvedMlbSlots = MLB_SHOWCASE_BATCH_1.filter((slot) => slot.productionStatus === "approved" && slot.reviewStatus === "approved");
for (const slot of approvedMlbSlots) {
  const entity = entities.get(slot.canonicalAthleteId);
  const illustration = getIllustration(entity, { sport: "baseball", league: "mlb", teamId: slot.canonicalTeamId, context: "profile" });
  mlbCollectionPreview.insertAdjacentHTML("beforeend", imageMarkup(illustration, slot, { decorative: true }));
  const card = document.createElement("article");
  card.className = "proof-card";
  card.dataset.entityId = slot.canonicalAthleteId;
  card.dataset.reviewStatus = slot.reviewStatus;
  card.dataset.fallbackLevel = illustration.fallbackLevel;
  card.innerHTML = `<header class="proof-card__header"><span class="status">approved</span><h2>${slot.displayName}</h2><p>MLB · showcase production portrait</p></header>
    <div class="surface-grid" aria-label="Dark and light surface previews"><div class="surface surface--dark"><span>Dark surface</span>${imageMarkup(illustration, slot)}</div><div class="surface surface--light"><span>Light surface</span>${imageMarkup(illustration, slot)}</div></div>
    <div class="size-row" aria-label="Compact and profile previews"><div class="size-example size-example--compact">${imageMarkup(illustration, slot, { decorative: true, compact: true })}<span>96px</span></div><div class="size-example size-example--profile">${imageMarkup(illustration, slot, { decorative: true })}<span>Profile frame</span></div></div>
    <ul class="context-list" aria-label="Representative placements"><li>Profile</li><li>Story / fact</li><li>Comparison</li><li>Edge Intelligence</li><li>Leaderboard feature</li><li>Market / parlay context</li></ul>
    <p class="proof-meta">Active asset: ${illustration.assetPath}<br>Preserved fallback: ${slot.fallback.teamFallbackRegistryId}</p>`;
  mlbGallery.append(card);
}

for (const slot of approvedMlbSlots) {
  const entity = entities.get(slot.canonicalAthleteId);
  for (const context of contexts) {
    const resolved = getIllustration(entity, { sport: "baseball", league: "mlb", teamId: slot.canonicalTeamId, context });
    check(resolved?.fallbackLevel === "exact" && resolved.registryId === `art-${slot.canonicalAthleteId}-portrait`, `${slot.displayName} resolves its approved portrait in ${context} context`);
    check(resolved?.loading === "lazy" && resolved?.decoding === "async" && resolved?.altText === `${slot.displayName} editorial illustration`, `${slot.displayName} ${context} media metadata is accessible and non-eager`);
  }
}

const mlbFallbackResolver = createIllustrationResolver(ILLUSTRATION_REGISTRY.filter((entry) => !approvedMlbSlots.some((slot) => slot.canonicalAthleteId !== "mlb-aaron-judge" && entry.canonicalEntityId === slot.canonicalAthleteId && entry.variant === "portrait")));
for (const slot of approvedMlbSlots.filter((item) => item.canonicalAthleteId !== "mlb-aaron-judge")) {
  const resolved = mlbFallbackResolver.resolve(entities.get(slot.canonicalAthleteId), { sport: "baseball", league: "mlb", teamId: slot.canonicalTeamId, context: "profile" });
  check(resolved?.fallbackLevel === "team" && resolved.registryId === slot.fallback.teamFallbackRegistryId, `${slot.displayName} returns to the preserved team fallback when its exact export is unavailable`);
}

const batchValidation = validateIllustrationProofBatch(ILLUSTRATION_STYLE_PROOF_BATCH, { canonicalEntities: CANONICAL_ENTITIES });
check(batchValidation.valid && batchValidation.slotCount === 6 && batchValidation.uniqueEntities === 6 && batchValidation.uniquePaths === 6, `six-slot approved proof manifest validates${batchValidation.errors.length ? `: ${batchValidation.errors.join(" | ")}` : ""}`);
check(ILLUSTRATION_STYLE_PROOF_BATCH.every((slot) => slot.productionStatus === "approved" && slot.reviewStatus === "approved" && slot.registryEligible), "all six portraits record final human approval and registry eligibility");
check(ILLUSTRATION_STYLE_PROOF_BATCH.every((slot) => slot.styleVersion === EDGEBOARD_ILLUSTRATION_STYLE_VERSION && slot.qaStyleVersion === EDGEBOARD_ILLUSTRATION_STYLE_VERSION && slot.styleRole === "production_proof_exemplar"), "all six remain Style v1 production proof exemplars");
check(ILLUSTRATION_STYLE_PROOF_BATCH.every((slot) => slot.realismDrift === "none" && ILLUSTRATION_PROOF_QA_FIELDS.every((field) => slot.reviewMetadata[field] === "approved")), "all existing Style v1 QA fields use approved vocabulary and acceptable realism drift");
check(ILLUSTRATION_STYLE_PROOF_BATCH.every((slot) => slot.expectedFileType === "png" && slot.expectedDimensions.width === 640 && slot.expectedDimensions.height === 800 && slot.transparentBackgroundRequired), "all proof portraits retain exact transparent 640 by 800 PNG requirements");

for (const slot of ILLUSTRATION_STYLE_PROOF_BATCH) {
  const exactEntry = ILLUSTRATION_REGISTRY.find((entry) => entry.id === slot.registryDraft.id);
  check(exactEntry?.status === "active" && exactEntry.assetPath === slot.assetPath && exactEntry.styleVersion === EDGEBOARD_ILLUSTRATION_STYLE_VERSION && exactEntry.styleRole === "production_proof_exemplar", `${slot.displayName} has one active Style v1 exemplar registry entry`);
  check(ILLUSTRATION_REGISTRY.some((entry) => entry.id === slot.fallbackRegistryId && entry.status === "active"), `${slot.displayName} fallback remains active`);
  for (const context of contexts) {
    const resolved = getIllustration(entities.get(slot.canonicalEntityId), { ...contextFor(slot), context });
    check(resolved.fallbackLevel === "exact" && resolved.registryId === slot.registryDraft.id && resolved.assetPath === slot.assetPath, `${slot.displayName} resolves exact artwork in ${context} context`);
  }
}

const fallbackOnlyRegistry = ILLUSTRATION_REGISTRY.filter((entry) => !ILLUSTRATION_STYLE_PROOF_BATCH.some((slot) => slot.registryDraft.id === entry.id));
const fallbackResolver = createIllustrationResolver(fallbackOnlyRegistry);
for (const slot of ILLUSTRATION_STYLE_PROOF_BATCH) {
  const resolved = fallbackResolver.resolve(entities.get(slot.canonicalEntityId), { ...contextFor(slot), context: "profile" });
  check(resolved.registryId === slot.fallbackRegistryId, `${slot.displayName} safely returns to its preserved fallback when exact art is unavailable`);
}

const actualInspections = Object.fromEntries(ILLUSTRATION_STYLE_PROOF_BATCH.map((slot) => [slot.canonicalEntityId, inspected]));
const activation = evaluateIllustrationProofActivation(ILLUSTRATION_STYLE_PROOF_BATCH, actualInspections, { canonicalEntities: CANONICAL_ENTITIES });
check(activation.ready && activation.physicalAssets === 6 && activation.technicallyValid === 6 && activation.humanApproved === 6 && activation.registryEligible === 6, "activation evaluator truthfully reports ready with 6 physical, technical, human-approved, and registry-eligible portraits");
check(activation.approvedEntries.every((entry) => entry.status === "active" && entry.styleRole === "production_proof_exemplar"), "approvedProofRegistryEntry produces the same active exemplar records");

const approvedJudge = ILLUSTRATION_STYLE_PROOF_BATCH[0];
const awaitingJudge = { ...approvedJudge, productionStatus: "awaiting_asset", reviewStatus: "awaiting_asset", registryEligible: false, realismDrift: null, reviewMetadata: Object.fromEntries(ILLUSTRATION_PROOF_QA_FIELDS.map((field) => [field, "awaiting_asset"])) };
const submittedJudge = prepareProofAssetSubmission(awaitingJudge, inspected);
check(submittedJudge?.productionStatus === "submitted" && submittedJudge?.reviewStatus === "needs_review", "existing submission gate still performs the legal awaiting-to-submitted transition");
check(approvedProofRegistryEntry(submittedJudge, inspected) === null, "submitted assets still cannot bypass human approval");
check(approvedProofRegistryEntry({ ...approvedJudge, reviewStatus: "needs_review" }, inspected) === null, "needs-review assets cannot enter the active registry");
check(approvedProofRegistryEntry({ ...approvedJudge, realismDrift: "excessive" }, inspected) === null, "excessive realism drift blocks registry promotion");
check(!validateProofAssetInspection(approvedJudge, { ...inspected, fileExists: false }).valid, "missing proof files fail inspection");
check(!validateProofAssetInspection(approvedJudge, { ...inspected, width: 800 }).valid, "wrong proof dimensions fail inspection");
check(!validateProofAssetInspection(approvedJudge, { ...inspected, meaningfulTransparency: false }).valid, "opaque proof PNGs fail inspection");
check(!validateProofAssetInspection(approvedJudge, { ...inspected, integrityValid: false }).valid, "corrupt proof PNGs fail inspection");
check(!validateIllustrationProofBatch([...ILLUSTRATION_STYLE_PROOF_BATCH.slice(0, -1), { ...ILLUSTRATION_STYLE_PROOF_BATCH.at(-1), assetPath: approvedJudge.assetPath }], { canonicalEntities: CANONICAL_ENTITIES }).valid, "duplicate proof paths fail manifest validation");
check(styleReference.assetType === "style_reference" && !styleReference.productionAsset && !styleReference.fallbackEligible && !styleReference.registryEligible, "reference sheet remains reference-only");
check(!ILLUSTRATION_REGISTRY.some((entry) => entry.assetPath === styleReference.assetPath), "reference sheet is not a production registry asset");

for (const path of new Set([...ILLUSTRATION_STYLE_PROOF_BATCH.map((slot) => `../${slot.assetPath}`), ...ILLUSTRATION_STYLE_PROOF_BATCH.map((slot) => `../${ILLUSTRATION_REGISTRY.find((entry) => entry.id === slot.fallbackRegistryId).assetPath}`)])) {
  const response = await fetch(path);
  check(response.ok, `portrait or preserved fallback loads: ${path.split("/").at(-1)}`);
}
const galleryImages = [...document.querySelectorAll("img")];
// Cards below the viewport correctly retain lazy-loading semantics. Validate
// every unique source with one eager, off-DOM decode instead of forcing more
// than one hundred duplicate preview nodes to load during the test.
const imageInspections = await Promise.all([...new Set(galleryImages.map((img) => img.src))].map((src) => new Promise((resolve) => {
  const probe = new Image();
  const timeout = setTimeout(() => resolve({ src, loaded: false, width: 0, height: 0 }), 10000);
  probe.onload = () => {
    clearTimeout(timeout);
    resolve({ src, loaded: true, width: probe.naturalWidth, height: probe.naturalHeight });
  };
  probe.onerror = () => {
    clearTimeout(timeout);
    resolve({ src, loaded: false, width: 0, height: 0 });
  };
  // Use a distinct request URL so an eager probe cannot inherit a pending
  // offscreen lazy-image request for the same resource in Chromium.
  probe.src = `${src}${src.includes("?") ? "&" : "?"}edgeboard-gallery-probe=1`;
})));
const imageInspectionBySource = new Map(imageInspections.map((inspection) => [inspection.src, inspection]));
const imagesDecode = (host) => [...host.querySelectorAll("img")].every((img) => imageInspectionBySource.get(img.src)?.loaded);
const imagesMatchDimensions = (host, width, height) => [...host.querySelectorAll("img")].every((img) => {
  const inspection = imageInspectionBySource.get(img.src);
  return inspection?.loaded && inspection.width === width && inspection.height === height;
});
check(imagesDecode(gallery), "gallery contains no broken images");
check([...gallery.querySelectorAll("img")].every((img) => img.alt || img.getAttribute("aria-hidden") === "true"), "gallery imagery has alt text or is explicitly decorative");
check([...collectionPreview.querySelectorAll("img")].length === 6 && imagesMatchDimensions(collectionPreview, 640, 800), "collection preview renders all six exact 640 by 800 approved exports");
check(gallery.querySelectorAll('.proof-card[data-review-status="approved"][data-fallback-level="exact"]').length === 6, "proof gallery reports six approved exact portraits");
check(approvedNbaSlots.length === 30 && [...nbaCollectionPreview.querySelectorAll("img")].length === 30, "NBA collection preview renders Curry plus all twenty-nine approved Batch 1 through Batch 5 portraits");
check(imagesMatchDimensions(nbaCollectionPreview, 640, 800), "NBA collection preview preserves exact 640 by 800 production dimensions");
check(approvedWnbaSlots.length === 8 && [...wnbaCollectionPreview.querySelectorAll("img")].length === 8, "WNBA featured collection preview renders all eight approved portraits without claiming full league coverage");
check(imagesMatchDimensions(wnbaCollectionPreview, 640, 800), "WNBA featured collection preview preserves exact 640 by 800 production dimensions");
check([...wnbaGallery.querySelectorAll("img")].every((img) => img.alt || img.getAttribute("aria-hidden") === "true") && imagesDecode(wnbaGallery), "WNBA featured gallery imagery is accessible and contains no broken images");
check(wnbaGallery.querySelectorAll('.proof-card[data-review-status="approved"][data-fallback-level="exact"]').length === 8, "WNBA featured gallery renders eight approved exact portraits");
check(approvedNflSlots.length === 5 && [...nflCollectionPreview.querySelectorAll("img")].length === 5, "NFL featured collection preview renders five approved portraits without claiming full league coverage");
check(imagesMatchDimensions(nflCollectionPreview, 640, 800), "NFL featured collection preview preserves exact 640 by 800 production dimensions");
check([...nflGallery.querySelectorAll("img")].every((img) => img.alt || img.getAttribute("aria-hidden") === "true") && imagesDecode(nflGallery), "NFL featured gallery imagery is accessible and contains no broken images");
check(nflGallery.querySelectorAll('.proof-card[data-review-status="approved"][data-fallback-level="exact"]').length === 5, "NFL featured gallery renders five approved exact portraits");
check(document.querySelector("#nflFeaturedCollection")?.textContent.includes("5 of 32 NFL teams") && document.querySelector("#nflFeaturedCollection")?.textContent.includes("not complete league coverage"), "NFL gallery explicitly discloses partial 5-of-32 featured coverage");
check(approvedUfcSlots.length === 10 && [...ufcCollectionPreview.querySelectorAll("img")].length === 10, "UFC featured collection preview renders ten approved portraits without claiming full roster coverage");
check(imagesMatchDimensions(ufcCollectionPreview, 640, 800), "UFC featured collection preview preserves exact 640 by 800 production dimensions");
check([...ufcGallery.querySelectorAll("img")].every((img) => img.alt || img.getAttribute("aria-hidden") === "true") && imagesDecode(ufcGallery), "UFC featured gallery imagery is accessible and contains no broken images");
check(ufcGallery.querySelectorAll('.proof-card[data-review-status="approved"][data-fallback-level="exact"]').length === 10, "UFC featured gallery renders ten approved exact portraits");
check(document.querySelector("#ufcFeaturedCollection")?.textContent.includes("10 active fighters across 7 modeled divisions") && document.querySelector("#ufcFeaturedCollection")?.textContent.includes("not complete UFC roster coverage"), "UFC gallery explicitly discloses partial ten-fighter, seven-division coverage");
check(approvedBoxingSlots.length === 13 && [...boxingCollectionPreview.querySelectorAll("img")].length === 13, "Boxing featured collection preview renders thirteen approved portraits without claiming complete coverage");
check(imagesMatchDimensions(boxingCollectionPreview, 640, 800), "Boxing featured collection preview preserves exact 640 by 800 production dimensions");
check([...boxingGallery.querySelectorAll("img")].every((img) => img.alt || img.getAttribute("aria-hidden") === "true") && imagesDecode(boxingGallery), "Boxing featured gallery imagery is accessible and contains no broken images");
check(boxingGallery.querySelectorAll('.proof-card[data-review-status="approved"][data-fallback-level="exact"]').length === 13, "Boxing featured gallery renders thirteen approved exact portraits");
check(document.querySelector("#boxingFeaturedCollection")?.textContent.includes("Boxing featured exact portraits: 13 active") && document.querySelector("#boxingFeaturedCollection")?.textContent.includes("not complete boxing coverage"), "Boxing gallery explicitly discloses featured partial thirteen-active coverage");
check(nbaGallery.querySelectorAll('.proof-card[data-review-status="approved"][data-fallback-level="exact"]').length === 30, "all thirty approved NBA portraits resolve exactly on dark and light review surfaces");
check(imagesDecode(nbaGallery) && [...nbaGallery.querySelectorAll("img")].every((img) => img.alt || img.getAttribute("aria-hidden") === "true"), "NBA production gallery has no broken images and accessible image semantics");
check(approvedMlbSlots.length === 30 && [...mlbCollectionPreview.querySelectorAll("img")].length === 30, "MLB collection preview renders the complete 30-team collection");
check(imagesMatchDimensions(mlbCollectionPreview, 640, 800), "MLB collection preview preserves exact 640 by 800 production dimensions");
check(mlbGallery.querySelectorAll('.proof-card[data-review-status="approved"][data-fallback-level="exact"]').length === 30, "all thirty approved MLB portraits resolve exactly on dark and light review surfaces");
check(imagesDecode(mlbGallery) && [...mlbGallery.querySelectorAll("img")].every((img) => img.alt || img.getAttribute("aria-hidden") === "true"), "MLB production gallery has no broken images and accessible image semantics");
check(document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, "proof gallery has no viewport overflow");
check(window.testErrors.length === 0, `no proof-gallery browser errors were captured${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

output.dataset.status = failures.length ? "failed" : "passed";
output.textContent = failures.length ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}` : `PASS (${checks.length} proof-activation checks)\n${checks.join("\n")}`;
if (window.location.hash === "#results") output.scrollIntoView({ block: "start" });
