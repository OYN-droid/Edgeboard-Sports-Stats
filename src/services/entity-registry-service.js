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
