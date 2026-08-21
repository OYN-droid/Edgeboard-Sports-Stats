import { getIllustration } from "./illustration-service.js";

export function createAthleteMediaViewModel(entity, options = {}) {
  const media = entity?.media || {};
  const resolved = entity?.sportId || entity?.sport ? getIllustration(entity, {
    context: options.context || "compact", desiredVariant: options.desiredVariant,
    decorative: options.decorative === true, teamId: options.teamId, weightClass: options.weightClass, series: options.series,
    fallbackPolicy: options.fallbackPolicy,
  }) : null;
  const candidates = [
    { type: "illustration", url: resolved?.assetPath, source: resolved?.source, variant: resolved?.variant, fallbackLevel: resolved?.fallbackLevel, registryId: resolved?.registryId },
    { type: "illustration", url: media.illustrationUrl },
    { type: "headshot", url: media.headshotUrl },
    { type: "silhouette", url: media.silhouetteUrl },
  ].filter((candidate) => typeof candidate.url === "string" && candidate.url.trim())
    .filter((candidate, index, values) => values.findIndex((item) => item.url === candidate.url) === index)
    .map((candidate) => Object.freeze({ ...candidate, url: candidate.url.trim() }));
  return Object.freeze({
    entityId: entity?.id || "",
    name: entity?.name || "Unknown athlete",
    imageType: candidates[0]?.type || "initials",
    imageUrl: candidates[0]?.url || "",
    candidates: Object.freeze(candidates),
    fallbackInitials: media.fallbackInitials || String(entity?.name || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    altText: resolved?.altText || media.altText || `${entity?.name || "Athlete"} profile placeholder`,
    attribution: media.attribution || "",
    rightsStatus: media.rightsStatus || "unknown",
    approvedForCommercialUse: media.approvedForCommercialUse === true,
    illustrationVersion: media.illustrationVersion || null,
    artStyleId: media.artStyleId || null,
    artistName: media.artistName || "",
    source: resolved?.source || media.source || "Unknown source",
    illustration: resolved,
    updatedAt: media.updatedAt || null,
  });
}
