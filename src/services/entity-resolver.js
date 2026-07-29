import { CANONICAL_ENTITIES } from "../data/canonical-entities.js";

const normalize = (value) => String(value || "").toLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();

function matchScore(entity, query, context = {}, entities = CANONICAL_ENTITIES) {
  const text = normalize(query);
  if (!text) return 0;
  const names = [entity.name, ...entity.aliases].map(normalize).filter(Boolean);
  let score = 0;
  names.forEach((name) => {
    if (text === name) score = Math.max(score, 200 + name.length);
    else if (name.startsWith(text)) score = Math.max(score, 160 + text.length);
    else if ((` ${text} `).includes(` ${name} `)) score = Math.max(score, 120 + name.length);
    else if (name.split(" ").every((term) => (` ${text} `).includes(` ${term} `))) score = Math.max(score, 70 + name.length);
  });
  if (score && context.leagueId === entity.leagueId) score += 25;
  if (score && context.sportId === entity.sportId) score += 12;
  if (!score && context.includeContextMatches) {
    const teamName = entities.find((candidate) => candidate.id === entity.teamId)?.name || entity.profile?.teamName || "";
    const contextTerms = [
      { value: teamName, points: 38 },
      { value: entity.leagueId, points: 28 },
      { value: entity.sportId, points: 22 },
    ];
    contextTerms.forEach(({ value, points }) => {
      const term = normalize(value);
      if (!term) return;
      if (text === term) score = Math.max(score, points + term.length);
      else if (term.startsWith(text) || text.startsWith(term)) score = Math.max(score, points);
    });
  }
  if (score && entity.active) score += 2;
  return score;
}

export function searchCanonicalEntities(query, context = {}, entities = CANONICAL_ENTITIES) {
  return entities
    .map((entity) => ({ entity, score: matchScore(entity, query, context, entities) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));
}

export function resolveCanonicalEntities(query, context = {}, entities = CANONICAL_ENTITIES) {
  const normalizedQuery = normalize(query);
  const exactNameCandidates = entities.filter((entity) => {
    const names = [entity.name, ...entity.aliases].map(normalize);
    return names.some((name) => name && (` ${normalizedQuery} `).includes(` ${name} `));
  });
  const duplicateNameCandidates = exactNameCandidates.filter((entity, index, list) =>
    list.some((other, otherIndex) => otherIndex !== index && normalize(other.name) === normalize(entity.name)));
  if (duplicateNameCandidates.length > 1) {
    return Object.freeze({
      status: "ambiguous",
      entities: Object.freeze([]),
      candidates: Object.freeze(duplicateNameCandidates),
      unresolved: Object.freeze([]),
    });
  }
  const matches = searchCanonicalEntities(query, context, entities);
  if (!matches.length) {
    return Object.freeze({
      status: "unresolved",
      entities: Object.freeze([]),
      candidates: Object.freeze([]),
      unresolved: Object.freeze([String(query || "").trim()].filter(Boolean)),
    });
  }
  const topScore = matches[0].score;
  const candidates = matches.filter((match) => match.score === topScore).map((match) => match.entity);
  const distinctIds = new Set(candidates.map((entity) => entity.id));
  const normalizedNames = new Set(candidates.map((entity) => normalize(entity.name)));
  const ambiguous = distinctIds.size > 1 && normalizedNames.size === 1;
  return Object.freeze({
    status: ambiguous ? "ambiguous" : "resolved",
    entities: Object.freeze(ambiguous ? [] : [candidates[0]]),
    candidates: Object.freeze(candidates),
    unresolved: Object.freeze([]),
  });
}

export function resolveEntityList(query, context = {}, entities = CANONICAL_ENTITIES) {
  const directMatches = searchCanonicalEntities(query, context, entities);
  const selected = [];
  directMatches.forEach(({ entity }) => {
    if (!selected.some((item) => item.id === entity.id)) selected.push(entity);
  });
  return selected;
}

export function getCanonicalEntity(id, entities = CANONICAL_ENTITIES) {
  return entities.find((entity) => entity.id === id) || null;
}
