import { getEntityTypeDefinition, isAthleteProfileType } from "../config/entity-types.js";
import { UNIFIED_CANONICAL_ENTITIES } from "../data/canonical-sports-entities.js";

const normalize = (value) => String(value || "").toLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();

function scoreEntity(entity, query, context = {}) {
  const text = normalize(query);
  if (!text) return 0;
  const terms = [entity.displayName, entity.name, ...(entity.aliases || [])].map(normalize).filter(Boolean);
  let score = 0;
  terms.forEach((term) => {
    if (text === term) score = Math.max(score, 300 + term.length);
    else if (term.startsWith(text)) score = Math.max(score, 220 + text.length);
    else if ((` ${text} `).includes(` ${term} `)) score = Math.max(score, 170 + term.length);
    else if (term.includes(text)) score = Math.max(score, 100 + text.length);
  });
  if (score && context.leagueId === entity.leagueId) score += 20;
  if (score && context.sportId === entity.sportId) score += 10;
  if (score && entity.active) score += 2;
  return score;
}
export class EntityRegistry {
  constructor(entities = UNIFIED_CANONICAL_ENTITIES) {
    this.entities = Object.freeze([...entities]);
    this.byId = new Map(this.entities.map((entity) => [entity.id, entity]));
    this.searchCache = new Map();
  }

  getEntity(id) {
    return this.byId.get(String(id || "")) || null;
  }

  resolveProviderEntity(providerId, { sportId = "", leagueId = "" } = {}) {
    const normalizedId = String(providerId || "").trim().toLowerCase();
    if (!normalizedId) return null;
    const direct = this.getEntity(providerId);
    if (direct && (!sportId || direct.sportId === sportId) && (!leagueId || direct.leagueId === leagueId)) return direct;
    const matches = this.entities.filter((entity) => (!sportId || entity.sportId === sportId)
      && (!leagueId || entity.leagueId === leagueId)
      && [entity.id, ...Object.values(entity.providerIds || {})]
        .some((value) => String(value || "").trim().toLowerCase() === normalizedId));
    return matches.length === 1 ? matches[0] : null;
  }

  getEntities({ type = "", sportId = "", leagueId = "", activeOnly = false } = {}) {
    return this.entities.filter((entity) =>
      (!type || entity.type === type)
      && (!sportId || entity.sportId === sportId)
      && (!leagueId || entity.leagueId === leagueId)
      && (!activeOnly || entity.active));
  }

  getRelatedEntities(entityOrId) {
    const entity = typeof entityOrId === "string" ? this.getEntity(entityOrId) : entityOrId;
    if (!entity) return [];
    return (entity.relatedEntityIds || []).map((id) => this.getEntity(id)).filter(Boolean);
  }

  search(query, context = {}, limit = 10) {
    const cacheKey = `${normalize(query)}:${context.sportId || ""}:${context.leagueId || ""}:${limit}`;
    if (this.searchCache.has(cacheKey)) return this.searchCache.get(cacheKey);
    const results = this.entities
      .map((entity) => ({ entity, score: scoreEntity(entity, query, context) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score
        || Number(right.entity.active) - Number(left.entity.active)
        || left.entity.displayName.localeCompare(right.entity.displayName))
      .slice(0, limit)
      .map(({ entity, score }) => Object.freeze({
        id: entity.id,
        name: entity.displayName,
        type: entity.type,
        typeLabel: getEntityTypeDefinition(entity.type).label,
        sportId: entity.sportId,
        leagueId: entity.leagueId,
        active: entity.active,
        media: entity.media,
        matchScore: score,
        profileSystem: isAthleteProfileType(entity.type) ? "athlete" : "entity",
        context: [entity.sportId, entity.leagueId].filter(Boolean).join(" · "),
      }));
    this.searchCache.set(cacheKey, Object.freeze(results));
    return results;
  }
}

export function createEntityRegistry(entities = UNIFIED_CANONICAL_ENTITIES) {
  return new EntityRegistry(entities);
}

function providerMedia(entity) {
  const name = String(entity?.displayName || entity?.name || "Entity");
  return Object.freeze({
    illustrationUrl: "", headshotUrl: "", silhouetteUrl: "assets/athlete-silhouette.svg",
    fallbackInitials: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase(),
    altText: `${name} profile placeholder`, attribution: "EdgeBoard fallback asset",
    rightsStatus: "original-placeholder", approvedForCommercialUse: true,
    source: "EdgeBoard assets", updatedAt: entity?.providerUpdatedAt || null,
  });
}

export function mergeProviderEntities(providerEntities, baseEntities = UNIFIED_CANONICAL_ENTITIES) {
  if (!Array.isArray(providerEntities) || !providerEntities.length) return baseEntities;
  const merged = new Map(baseEntities.map((entity) => [entity.id, entity]));
  providerEntities.forEach((raw) => {
    const id = String(raw?.canonicalEntityId || raw?.id || "").trim();
    const name = String(raw?.displayName || raw?.name || "").trim();
    if (!id || !name) return;
    const existing = merged.get(id) || {};
    const type = String(raw.entityType || raw.type || existing.type || "athlete");
    merged.set(id, Object.freeze({
      ...existing,
      id, type,
      entityType: ["athlete", "player"].includes(type) ? "player" : type,
      name, displayName: name,
      aliases: Object.freeze(Array.isArray(raw.aliases) ? raw.aliases.filter(Boolean) : existing.aliases || []),
      sportId: String(raw.sportId || existing.sportId || "baseball"),
      sport: String(raw.sportId || existing.sportId || "baseball"),
      leagueId: String(raw.leagueId || existing.leagueId || "mlb"),
      league: String(raw.leagueId || existing.leagueId || "mlb"),
      teamId: String(raw.teamId || existing.teamId || ""),
      active: raw.active !== false,
      activeStatus: raw.active === false ? "inactive" : "active",
      position: String(raw.position || existing.position || ""),
      providerIds: Object.freeze({}),
      media: existing.media || providerMedia(raw),
      relatedEntityIds: Object.freeze(existing.relatedEntityIds || []),
      metadata: Object.freeze({ ...(existing.metadata || {}), ...(raw.metadata || {}), sample: false, sourceMode: raw.sourceMode || "fixture", edgeTrust: raw.edgeTrust || null }),
      statistics: existing.statistics || Object.freeze({}), historicalData: existing.historicalData || Object.freeze({}),
      insights: existing.insights || Object.freeze([]), links: existing.links || Object.freeze({ canonicalProfile: true }),
    }));
  });
  return Object.freeze([...merged.values()]);
}
