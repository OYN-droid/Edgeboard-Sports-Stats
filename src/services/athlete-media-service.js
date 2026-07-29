export function createAthleteMediaViewModel(entity) {
  const media = entity?.media || {};
  const candidates = [
    { type: "illustration", url: media.illustrationUrl },
    { type: "headshot", url: media.headshotUrl },
    { type: "silhouette", url: media.silhouetteUrl },
  ].filter((candidate) => typeof candidate.url === "string" && candidate.url.trim())
    .map((candidate) => Object.freeze({ ...candidate, url: candidate.url.trim() }));
  return Object.freeze({
    entityId: entity?.id || "",
    name: entity?.name || "Unknown athlete",
    imageType: candidates[0]?.type || "initials",
    imageUrl: candidates[0]?.url || "",
    candidates: Object.freeze(candidates),
    fallbackInitials: media.fallbackInitials || String(entity?.name || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    altText: media.altText || `${entity?.name || "Athlete"} profile placeholder`,
    attribution: media.attribution || "",
    rightsStatus: media.rightsStatus || "unknown",
    approvedForCommercialUse: media.approvedForCommercialUse === true,
    illustrationVersion: media.illustrationVersion || null,
    artStyleId: media.artStyleId || null,
    artistName: media.artistName || "",
    source: media.source || "Unknown source",
    updatedAt: media.updatedAt || null,
  });
}
