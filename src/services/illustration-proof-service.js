import { ILLUSTRATION_REGISTRY } from "../config/illustration-registry.js";
import { ILLUSTRATION_PROOF_PRODUCTION_STATES, ILLUSTRATION_PROOF_QA_FIELDS, ILLUSTRATION_PROOF_REVIEW_STATES } from "../config/illustration-style-proof-batch.js";
import { EDGEBOARD_ILLUSTRATION_STYLE_V1, EDGEBOARD_ILLUSTRATION_STYLE_VERSION } from "../config/illustration-style-v1.js";

const REVIEW_STATES = new Set(ILLUSTRATION_PROOF_REVIEW_STATES);
const PRODUCTION_STATES = new Set(ILLUSTRATION_PROOF_PRODUCTION_STATES);
const VALID_STATE_PAIRS = new Set([
  "awaiting_asset:awaiting_asset", "submitted:needs_review", "needs_revision:needs_revision",
  "rejected:rejected", "approved:approved",
]);
const clean = (value) => String(value || "").trim();

export function validateIllustrationProofBatch(slots, { canonicalEntities = [], registry = ILLUSTRATION_REGISTRY } = {}) {
  const errors = [];
  const entityIds = new Set();
  const paths = new Set();
  const variants = new Set();
  const canonical = new Map(canonicalEntities.map((entity) => [entity.id, entity]));
  const registryById = new Map(registry.map((entry) => [entry.id, entry]));
  if (slots.length !== 6) errors.push(`Proof batch requires 6 slots; received ${slots.length}.`);
  slots.forEach((slot, index) => {
    const label = slot?.canonicalEntityId || `slot ${index}`;
    if (!slot?.canonicalEntityId || entityIds.has(slot.canonicalEntityId)) errors.push(`${label}: duplicate or missing canonical entity ID.`);
    entityIds.add(slot?.canonicalEntityId);
    const entity = canonical.get(slot?.canonicalEntityId);
    if (!entity) errors.push(`${label}: canonical entity is not seeded.`);
    if (entity && (entity.sportId !== slot.sport || entity.leagueId !== slot.league)) errors.push(`${label}: canonical sport or league mismatch.`);
    if (!slot?.assetPath || paths.has(slot.assetPath)) errors.push(`${label}: duplicate or missing asset path.`);
    paths.add(slot?.assetPath);
    const variantKey = `${slot?.canonicalEntityId}:${slot?.variant}`;
    if (variants.has(variantKey)) errors.push(`${label}: duplicate canonical variant.`);
    variants.add(variantKey);
    if (!slot?.assetPath?.startsWith("assets/illustrations/proof/edgeboard--") || !slot.assetPath.endsWith(`--${slot.variant}--v01.${slot.expectedFileType}`)) errors.push(`${label}: asset path does not follow the locked versioned naming convention.`);
    if (slot?.registryDraft?.canonicalEntityId !== slot?.canonicalEntityId || slot?.registryDraft?.assetPath !== slot?.assetPath || slot?.registryDraft?.variant !== slot?.variant) errors.push(`${label}: registry draft does not preserve the manifest identity, path, and variant.`);
    if (slot?.registryDraft?.status !== "awaiting_asset" || slot?.registryDraft?.source !== "edgeboard_original") errors.push(`${label}: registry draft must remain awaiting_asset with original EdgeBoard provenance.`);
    if (!PRODUCTION_STATES.has(slot?.productionStatus) || !REVIEW_STATES.has(slot?.reviewStatus)) errors.push(`${label}: invalid production or review state.`);
    if (!VALID_STATE_PAIRS.has(`${slot?.productionStatus}:${slot?.reviewStatus}`)) errors.push(`${label}: invalid production and review state transition pair.`);
    if (!slot?.transparentBackgroundRequired) errors.push(`${label}: transparent background is required.`);
    if (slot?.styleReferenceApproved !== true || slot?.styleVersion !== EDGEBOARD_ILLUSTRATION_STYLE_VERSION || slot?.qaStyleVersion !== EDGEBOARD_ILLUSTRATION_STYLE_VERSION) errors.push(`${label}: proof and QA metadata must reference the approved Style v1 contract.`);
    if (slot?.registryDraft?.styleVersion !== EDGEBOARD_ILLUSTRATION_STYLE_VERSION) errors.push(`${label}: registry draft is missing the Style v1 version.`);
    if (slot?.realismDrift !== null && !EDGEBOARD_ILLUSTRATION_STYLE_V1.realismDriftValues.includes(slot.realismDrift)) errors.push(`${label}: invalid realism-drift review value.`);
    if (slot?.expectedDimensions?.width !== 640 || slot?.expectedDimensions?.height !== 800 || slot?.expectedDimensions?.maxBytes !== 5000000) errors.push(`${label}: proof PNG dimensions or byte budget are invalid.`);
    if (!ILLUSTRATION_PROOF_QA_FIELDS.every((field) => REVIEW_STATES.has(slot?.reviewMetadata?.[field]))) errors.push(`${label}: incomplete style-QA metadata.`);
    const fallback = registryById.get(slot?.fallbackRegistryId);
    if (!fallback || fallback.status !== "active") errors.push(`${label}: active fallback registry entry is missing.`);
    const exactEntries = registry.filter((entry) => entry.canonicalEntityId === slot.canonicalEntityId && entry.variant === slot.variant);
    const activatedEntryIsValid = slot.productionStatus === "approved" && slot.reviewStatus === "approved"
      && exactEntries.length === 1 && exactEntries[0].id === slot.registryDraft.id
      && exactEntries[0].assetPath === slot.assetPath && exactEntries[0].status === "active"
      && exactEntries[0].styleVersion === EDGEBOARD_ILLUSTRATION_STYLE_VERSION
      && exactEntries[0].styleRole === "production_proof_exemplar";
    if (exactEntries.length && !activatedEntryIsValid) errors.push(`${label}: active exact portrait does not match the approved proof activation.`);
    if (slot.productionStatus === "approved" && !activatedEntryIsValid) errors.push(`${label}: approved proof portrait is missing its matching active registry entry.`);
  });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), slotCount: slots.length, uniqueEntities: entityIds.size, uniquePaths: paths.size });
}

export function validateProofAssetInspection(slot, inspection = {}) {
  const errors = [];
  if (!inspection.fileExists) errors.push("Asset file is missing.");
  if (clean(inspection.fileType).toLowerCase() !== slot.expectedFileType) errors.push(`Expected ${slot.expectedFileType} file type.`);
  if (inspection.integrityValid !== true) errors.push("PNG signature, chunks, and CRC integrity are not verified.");
  if (inspection.decoded !== true) errors.push("PNG pixel data did not decode successfully.");
  if (inspection.rgba !== true) errors.push("Proof PNG must use 8-bit RGBA color data.");
  if (Number(inspection.width) !== slot.expectedDimensions.width || Number(inspection.height) !== slot.expectedDimensions.height) errors.push("Asset dimensions do not match the portrait specification.");
  if (slot.transparentBackgroundRequired && (inspection.transparentBackground !== true || inspection.meaningfulTransparency !== true)) errors.push("Meaningful alpha transparency is not verified.");
  if (!Number.isFinite(Number(inspection.sizeBytes)) || Number(inspection.sizeBytes) <= 0 || Number(inspection.sizeBytes) > slot.expectedDimensions.maxBytes) errors.push("Asset file size is outside the accepted budget.");
  if (inspection.orphan === true) errors.push("Asset is orphaned from the proof manifest.");
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function prepareProofAssetSubmission(slot, inspection = {}) {
  const validation = validateProofAssetInspection(slot, inspection);
  if (!validation.valid || slot?.productionStatus !== "awaiting_asset" || slot?.reviewStatus !== "awaiting_asset") return null;
  return Object.freeze({
    ...slot,
    productionStatus: "submitted",
    reviewStatus: "needs_review",
    realismDrift: null,
    reviewMetadata: Object.freeze(Object.fromEntries(ILLUSTRATION_PROOF_QA_FIELDS.map((field) => [field, "needs_review"]))),
  });
}

export function approvedProofRegistryEntry(slot, inspection = {}) {
  const validation = validateProofAssetInspection(slot, inspection);
  const qaApproved = ILLUSTRATION_PROOF_QA_FIELDS.every((field) => slot?.reviewMetadata?.[field] === "approved");
  const mappingIntact = slot?.registryDraft?.canonicalEntityId === slot?.canonicalEntityId
    && slot?.registryDraft?.assetPath === slot?.assetPath && slot?.registryDraft?.variant === slot?.variant;
  const styleApproved = slot?.styleReferenceApproved === true && slot?.styleVersion === EDGEBOARD_ILLUSTRATION_STYLE_VERSION
    && slot?.qaStyleVersion === EDGEBOARD_ILLUSTRATION_STYLE_VERSION
    && EDGEBOARD_ILLUSTRATION_STYLE_V1.realismDriftValues.includes(slot?.realismDrift) && slot?.realismDrift !== "excessive";
  if (!validation.valid || !mappingIntact || !styleApproved || slot?.productionStatus !== "approved" || slot?.reviewStatus !== "approved" || !qaApproved) return null;
  return Object.freeze({ ...slot.registryDraft, status: "active", styleRole: "production_proof_exemplar" });
}

export function evaluateIllustrationProofActivation(slots, inspectionsByCanonicalId = {}, { canonicalEntities = [], registry = ILLUSTRATION_REGISTRY } = {}) {
  const batchValidation = validateIllustrationProofBatch(slots, { canonicalEntities, registry });
  const errors = [...batchValidation.errors];
  const approvedEntries = [];
  let physicalAssets = 0;
  let technicallyValid = 0;
  let humanApproved = 0;

  for (const slot of slots) {
    const label = slot?.canonicalEntityId || "unknown proof slot";
    const inspection = inspectionsByCanonicalId[label] || {};
    const assetValidation = validateProofAssetInspection(slot, inspection);
    if (inspection.fileExists === true) physicalAssets += 1;
    if (assetValidation.valid) technicallyValid += 1;
    else errors.push(...assetValidation.errors.map((error) => `${label}: ${error}`));

    const qaApproved = ILLUSTRATION_PROOF_QA_FIELDS.every((field) => slot?.reviewMetadata?.[field] === "approved");
    const reviewApproved = slot?.productionStatus === "approved" && slot?.reviewStatus === "approved" && qaApproved;
    if (reviewApproved) humanApproved += 1;
    else errors.push(`${label}: explicit human approval and all Style v1 QA fields are required.`);
    if (slot?.styleVersion !== EDGEBOARD_ILLUSTRATION_STYLE_VERSION || slot?.qaStyleVersion !== EDGEBOARD_ILLUSTRATION_STYLE_VERSION) errors.push(`${label}: Style v1 assignment is required.`);
    if (slot?.realismDrift === "excessive") errors.push(`${label}: excessive realism drift blocks activation.`);

    const entry = approvedProofRegistryEntry(slot, inspection);
    if (entry) approvedEntries.push(entry);
  }

  const uniqueErrors = Object.freeze([...new Set(errors)]);
  const ready = slots.length === 6 && physicalAssets === 6 && technicallyValid === 6
    && humanApproved === 6 && approvedEntries.length === 6 && uniqueErrors.length === 0;
  return Object.freeze({
    ready,
    errors: uniqueErrors,
    slotCount: slots.length,
    physicalAssets,
    technicallyValid,
    humanApproved,
    registryEligible: approvedEntries.length,
    approvedEntries: Object.freeze(approvedEntries),
  });
}
