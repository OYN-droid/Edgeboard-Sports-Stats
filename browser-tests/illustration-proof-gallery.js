import { ILLUSTRATION_REGISTRY } from "../src/config/illustration-registry.js";
import { ILLUSTRATION_PROOF_QA_FIELDS, ILLUSTRATION_STYLE_PROOF_BATCH } from "../src/config/illustration-style-proof-batch.js";
import { EDGEBOARD_ILLUSTRATION_STYLE_V1, EDGEBOARD_ILLUSTRATION_STYLE_VERSION } from "../src/config/illustration-style-v1.js";
import { CANONICAL_ENTITIES } from "../src/data/canonical-entities.js";
import { approvedProofRegistryEntry, evaluateIllustrationProofActivation, prepareProofAssetSubmission, validateIllustrationProofBatch, validateProofAssetInspection } from "../src/services/illustration-proof-service.js";
import { createIllustrationResolver, getIllustration } from "../src/services/illustration-service.js";
import { MLB_SHOWCASE_BATCH_1 } from "../src/config/mlb-illustration-showcase-batch-1.js";
import { NBA_SHOWCASE_BATCH_2 } from "../src/config/basketball-illustration-showcase-batch-2.js";

const output = document.querySelector("#results");
const gallery = document.querySelector("#proofGallery");
const collectionPreview = document.querySelector("#collectionPreview");
const nbaCollectionPreview = document.querySelector("#nbaCollectionPreview");
const nbaGallery = document.querySelector("#nbaGallery");
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
