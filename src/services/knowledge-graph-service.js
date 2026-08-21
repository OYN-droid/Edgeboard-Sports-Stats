import {
  KNOWLEDGE_GRAPH_EDGE_TYPES, KNOWLEDGE_GRAPH_LIMITS, KNOWLEDGE_GRAPH_NODE_TYPES,
  KNOWLEDGE_GRAPH_SCHEMA_VERSION, KNOWLEDGE_GRAPH_SCORES, KNOWLEDGE_GRAPH_SECTION_ORDER,
} from "../config/knowledge-graph-config.js";
import { getEntityTypeDefinition, isAthleteProfileType } from "../config/entity-types.js";

const clean = (value) => String(value ?? "").trim();
const freeze = (values) => Object.freeze([...(values || [])]);
const unique = (values) => [...new Set((values || []).filter(Boolean))];
const CURRENT_ENTITY_TYPES = new Set(["league", "promotion", "competition"]);

function profileAction(entity) {
  return Object.freeze({
    type: "profile",
    entityId: entity.id,
    profileSystem: isAthleteProfileType(entity.type) ? "athlete" : "entity",
  });
}

function relationLabel(center, related, reverse = false) {
  const pair = new Set([center.type, related.type]);
  if (pair.has("team") && pair.has("venue")) return center.type === "team"
    ? "Canonical team home venue relationship"
    : "Canonical home team relationship for this shared venue";
  if (pair.has("team") && pair.has("league")) return center.type === "league"
    ? "League contains this canonical team"
    : "Canonical team league membership";
  if (reverse) return `${related.displayName} explicitly references ${center.displayName}`;
  if (pair.has("athlete") && pair.has("team")) return "Canonical player and team relationship";
  if ((pair.has("fighter") || pair.has("boxer")) && pair.has("promotion")) return "Canonical competitor and promotion relationship";
  if (pair.has("driver") && pair.has("constructor")) return "Canonical driver and constructor relationship";
  if (pair.has("coach") && pair.has("team")) return "Canonical coach and team relationship";
  if (pair.has("venue")) return "Canonical venue relationship";
  if (pair.has("league")) return "Canonical league relationship";
  if (pair.has("competition")) return "Canonical competition relationship";
  if (pair.has("manufacturer")) return "Canonical manufacturer relationship";
  return "Explicit canonical registry relationship";
}

function relationEdgeType(center, related, reverse = false) {
  const pair = new Set([center.type, related.type]);
  if (pair.has("team") && pair.has("venue")) return center.type === "team" ? "home_venue" : "home_team";
  if (pair.has("team") && pair.has("league")) return center.type === "league" ? "contains_team" : "member_of_league";
  return reverse ? "explicit_reverse_relationship" : "explicit_relationship";
}

function eventTitle(event) {
  return clean(event?.display?.title)
    || (event?.participants || []).map((participant) => clean(participant.name)).filter(Boolean).join(" vs ")
    || clean(event?.name) || clean(event?.eventName) || "Event title unavailable";
}

function marketMatches(market, center, eventIds, entityRegistry) {
  if (!market?.available || market.status !== "open" || !eventIds.has(market.eventId)) return false;
  if (CURRENT_ENTITY_TYPES.has(center.type)) return true;
  const accepted = new Set([center.id, center.teamId].filter(Boolean));
  return (market.selections || []).some((selection) => selection.available && !selection.stale
    && [selection.participantId, selection.teamId, selection.competitorId].some((id) => {
      if (accepted.has(id)) return true;
      const canonical = entityRegistry.resolveProviderEntity(id, { leagueId: market.leagueId });
      return canonical && accepted.has(canonical.id);
    }));
}

function node(input) {
  return Object.freeze({
    id: clean(input.id), type: input.type, label: clean(input.label), description: clean(input.description),
    reason: clean(input.reason), score: Number(input.score) || 0, sportId: clean(input.sportId),
    leagueId: clean(input.leagueId), entityIds: freeze(unique(input.entityIds)), eventIds: freeze(unique(input.eventIds)),
    source: Object.freeze({ id: clean(input.source?.id), label: clean(input.source?.label) || "Source unavailable", sample: input.source?.sample !== false }),
    validationStatus: clean(input.validationStatus) || "validated", edgeType: clean(input.edgeType),
    action: input.action ? Object.freeze({ ...input.action }) : null,
  });
}

function edge(input) {
  return Object.freeze({ id: `${input.from}::${input.type}::${input.to}`, from: input.from, to: input.to, type: input.type, label: input.label, explicit: input.explicit !== false });
}

export function validateKnowledgeGraph(graph, entityRegistry) {
  const errors = [];
  if (!graph?.center?.id || !entityRegistry.getEntity(graph.center.id)) errors.push("Graph center must be a canonical entity.");
  const nodeIds = new Set((graph?.nodes || []).map((item) => item.id));
  (graph?.nodes || []).forEach((item) => {
    if (!KNOWLEDGE_GRAPH_NODE_TYPES.includes(item.type)) errors.push(`Unsupported graph node type: ${item.type}.`);
    if (!item.id || !item.label || !item.reason || !item.source?.id) errors.push(`Graph node ${item.id || "unknown"} is missing identity, reason, or source.`);
    if (item.entityIds.some((id) => !entityRegistry.getEntity(id))) errors.push(`Graph node ${item.id} references an unknown canonical entity.`);
  });
  (graph?.edges || []).forEach((item) => {
    if (!KNOWLEDGE_GRAPH_EDGE_TYPES.includes(item.type)) errors.push(`Unsupported graph edge type: ${item.type}.`);
    if (item.from !== graph.center.id || !nodeIds.has(item.to)) errors.push(`Graph edge ${item.id} has an unresolved endpoint.`);
  });
  return Object.freeze({ valid: errors.length === 0, errors: freeze(unique(errors)) });
}

export class KnowledgeGraphService {
  constructor({ entityRegistry, sportsRepository, statsRepository, insightService, storyEngine } = {}) {
    if (!entityRegistry || !sportsRepository || !statsRepository || !insightService || !storyEngine) throw new TypeError("Knowledge Graph requires existing canonical entity, sports, statistics, insight, and story systems.");
    this.entityRegistry = entityRegistry; this.sportsRepository = sportsRepository; this.statsRepository = statsRepository;
    this.insightService = insightService; this.storyEngine = storyEngine; this.historicalService = null; this.anniversaryService = null;
    this.visualizationRepository = null; this.cache = new Map(); this.requestSequence = 0;
  }

  connectHistorical({ historicalService, anniversaryService } = {}) {
    this.historicalService = historicalService || this.historicalService;
    this.anniversaryService = anniversaryService || this.anniversaryService;
    this.clearCache();
  }

  connectVisualizations(visualizationRepository) { this.visualizationRepository = visualizationRepository; this.clearCache(); }
  clearCache(entityId = "") { if (!entityId) this.cache.clear(); else [...this.cache.keys()].filter((key) => key.startsWith(`${entityId}:`)).forEach((key) => this.cache.delete(key)); }

  buildEntityNodes(center) {
    const direct = (center.relatedEntityIds || []).map((id) => this.entityRegistry.getEntity(id)).filter(Boolean)
      .map((related) => ({ related, reverse: false }));
    const incoming = this.entityRegistry.entities.filter((candidate) => candidate.id !== center.id && candidate.relatedEntityIds?.includes(center.id))
      .map((related) => ({ related, reverse: true }));
    const seen = new Set();
    return [...direct, ...incoming].flatMap(({ related, reverse }) => {
      if (seen.has(related.id)) return [];
      seen.add(related.id);
      const reason = relationLabel(center, related, reverse);
      return [node({ id: `entity:${related.id}`, type: "entity", label: related.displayName, description: getEntityTypeDefinition(related.type).label, reason, score: KNOWLEDGE_GRAPH_SCORES.explicit_relationship, sportId: related.sportId, leagueId: related.leagueId, entityIds: [related.id], edgeType: relationEdgeType(center, related, reverse), source: { id: "edgeboard-canonical-entity-registry", label: "EdgeBoard canonical entity registry", sample: related.metadata?.sample !== false }, action: profileAction(related) })];
    });
  }

  buildEventNodes(center) {
    if (!center.leagueId) return [];
    const accepted = new Set([center.id, center.teamId].filter(Boolean));
    return this.sportsRepository.getEvents(center.leagueId).filter((event) => {
      if (CURRENT_ENTITY_TYPES.has(center.type) || center.type === "league") return true;
      return (event.participants || []).some((participant) => {
        const canonical = this.entityRegistry.resolveProviderEntity(participant.id, { leagueId: event.leagueId });
        return canonical && accepted.has(canonical.id);
      });
    }).slice(0, 6).map((event) => {
      const canonicalParticipants = (event.participants || []).map((participant) => this.entityRegistry.resolveProviderEntity(participant.id, { leagueId: event.leagueId })).filter(Boolean);
      const direct = canonicalParticipants.some((participant) => participant.id === center.id);
      const type = direct ? "participates_in" : center.teamId ? "team_schedule" : "league_schedule";
      return node({ id: `event:${event.id}`, type: "event", label: eventTitle(event), description: `${event.status || "status unavailable"} · ${event.startsAt || "time unavailable"}`, reason: direct ? "Canonical participant in normalized event" : center.teamId ? "Normalized event for the entity’s canonical team" : "Normalized event in the entity’s canonical league", score: KNOWLEDGE_GRAPH_SCORES[type], sportId: event.sportId || center.sportId, leagueId: event.leagueId, entityIds: canonicalParticipants.map((item) => item.id), eventIds: [event.id], source: { id: clean(event.source) || "edgeboard-normalized-sports-provider", label: clean(event.source) || "EdgeBoard normalized sports provider", sample: event.sourceMode !== "live" }, validationStatus: event.dataQualityStatus || "normalized", action: { type: "query", query: `Research ${eventTitle(event)}` } });
    });
  }

  buildStoryNodes(center, eventIds, mode) {
    this.storyEngine.generateStoryCandidates({ leagueIds: center.leagueId ? [center.leagueId] : [], sportIds: center.sportId ? [center.sportId] : [] }, { mode, limit: 8 });
    return [...this.storyEngine.index.values()].filter((story) => story.entityIds.includes(center.id) || story.eventIds.some((id) => eventIds.has(id)))
      .filter((story) => !["retracted", "expired"].includes(story.lifecycleState)).slice(0, 4).map((story) => {
        const view = this.storyEngine.buildStoryViewModel(story, { presentation: "compact", mode });
        return node({ id: `story:${story.id}`, type: "story", label: view.headline, description: view.summary, reason: story.entityIds.includes(center.id) ? "Validated story explicitly references this canonical entity" : "Validated story references a connected canonical event", score: KNOWLEDGE_GRAPH_SCORES.story, sportId: story.sportId, leagueId: story.leagueId, entityIds: story.entityIds, eventIds: story.eventIds, source: story.sources[0], validationStatus: story.validationStatus, action: { type: "story", storyId: story.id } });
      });
  }

  buildInsightNodes(center, mode) {
    let insights = [];
    try {
      if (["athlete", "fighter", "boxer", "driver"].includes(center.type)) insights = this.insightService.getInsightsForProfile(center.id, { limit: 4, includeBettingContext: mode === "both" });
      else if (["team", "national-team", "constructor"].includes(center.type)) insights = this.insightService.generateTeamInsightCandidates(center.id, { limit: 4 });
      else if (center.type === "league") insights = this.insightService.generateLeagueInsightCandidates(center.leagueId, { limit: 4 });
    } catch { insights = []; }
    return insights.filter((insight) => !["stale", "invalid", "incomplete"].includes(insight.validationStatus)).slice(0, 4).map((insight) => node({
      id: `insight:${insight.id}`, type: "insight", label: insight.phrasing?.headline || insight.title || "Validated insight", description: insight.phrasing?.shortSummary || insight.label || "Calculated insight", reason: "Deterministic insight calculated for this canonical entity", score: KNOWLEDGE_GRAPH_SCORES.insight, sportId: insight.sportId, leagueId: insight.leagueId, entityIds: insight.entityIds, eventIds: insight.supportingEventIds || [], source: { id: insight.source?.provider || "edgeboard-insight-engine", label: insight.source?.attribution || insight.source?.provider || "EdgeBoard deterministic insight engine", sample: true }, validationStatus: insight.validationStatus, action: { type: "insight", insightId: insight.id },
    }));
  }

  buildHistoricalNodes(center, currentDate) {
    if (!this.historicalService) return [];
    const history = this.historicalService.searchHistoricalItems({ entityIds: [center.id], pageSize: 5 }).items.map((item) => node({ id: `historical:${item.id}`, type: "historical_item", label: item.title, description: item.coverageLabel, reason: "Validated historical item explicitly references this canonical entity", score: KNOWLEDGE_GRAPH_SCORES.historical_item, sportId: item.sportId, leagueId: item.leagueId, entityIds: item.entityIds, eventIds: item.eventIds, source: item.sources[0], validationStatus: item.validationStatus, action: { type: "route", href: item.route } }));
    const anniversaries = this.anniversaryService ? this.anniversaryService.getAnniversaries({ date: currentDate, sportId: center.sportId, leagueId: center.leagueId, limit: 20 }).items.filter((item) => item.entityIds.includes(center.id)).slice(0, 3).map((item) => node({ id: `anniversary:${item.id}`, type: "anniversary", label: item.title, description: `${item.originalYear} · ${item.yearsAgo} years ago`, reason: "Today’s validated anniversary explicitly references this canonical entity", score: KNOWLEDGE_GRAPH_SCORES.anniversary, sportId: item.sportId, leagueId: item.leagueId, entityIds: item.entityIds, eventIds: item.eventIds, source: item.sources[0], validationStatus: item.validationStatus, action: { type: "route", href: item.route } })) : [];
    return [...history, ...anniversaries];
  }

  buildMarketNodes(center, eventNodes, mode) {
    if (mode === "stats" || !center.leagueId) return [];
    const eventIds = new Set(eventNodes.flatMap((item) => item.eventIds));
    return this.sportsRepository.getMarkets(center.leagueId).filter((market) => marketMatches(market, center, eventIds, this.entityRegistry)).slice(0, 4).map((market) => node({ id: `market:${market.id}`, type: "market", label: market.displayName, description: `${market.period} · ${market.settlementScope}`, reason: "Open normalized market matches a connected event and canonical participant scope", score: KNOWLEDGE_GRAPH_SCORES.market, sportId: center.sportId, leagueId: center.leagueId, entityIds: [center.id], eventIds: [market.eventId], source: { id: clean(market.source) || "edgeboard-normalized-market-provider", label: clean(market.source) || "EdgeBoard normalized market provider", sample: market.sourceMode !== "live" }, validationStatus: market.dataQualityStatus || "available", action: { type: "query", query: `Show available ${market.displayName} markets for ${center.displayName}` } }));
  }

  buildToolNodes(center) {
    const typeLabel = getEntityTypeDefinition(center.type).label.toLowerCase();
    const tools = [
      ["visual", "visualization", "Open visual analytics", `Visualize supported data for ${center.displayName}`, "Provider capabilities and normalized data determine which visuals are available.", { type: "visual", entityId: center.id }],
      ["compare", "comparison", "Compare", `Compare ${center.displayName}`, `Apply identical filters when comparing this ${typeLabel} with an explicitly selected entity.`, { type: "query", query: `Compare ${center.displayName} with a supported peer` }],
      ["leaders", "leaderboard", "Open leaderboards", `${center.displayName} leaderboard context`, "Use canonical statistics and published qualification rules for this scope.", { type: "query", query: `Show ${center.leagueId?.toUpperCase() || center.sportId} leaders related to ${center.displayName}` }],
      ["history", "research_path", "Historical Explorer", `${center.displayName} history`, "Search validated historical items that explicitly reference this entity.", { type: "route", href: center.leagueId ? `/history/${encodeURIComponent(center.sportId)}/${encodeURIComponent(center.leagueId)}` : "/history" }],
      ["anniversaries", "research_path", "On This Day", `${center.displayName} anniversaries`, "Explore the exact selected sport and league calendar scope without unrelated fallback cards.", { type: "route", href: `/history/on-this-day?sport=${encodeURIComponent(center.sportId)}&league=${encodeURIComponent(center.leagueId)}` }],
      ["research", "research_session", "Start research session", `Research ${center.displayName}`, "Open a structured Edge Intelligence workflow with this canonical entity as context.", { type: "query", query: `Research ${center.displayName}` }],
      ["workspace", "workspace", "Save to workspace", `Save ${center.displayName}`, "Preserve a local immutable snapshot and canonical entity reference.", { type: "workspace", entityId: center.id }],
    ];
    return tools.map(([id, type, label, description, reason, action]) => node({ id: `${type}:${id}:${center.id}`, type, label, description, reason, score: KNOWLEDGE_GRAPH_SCORES[type] || KNOWLEDGE_GRAPH_SCORES.research_path, sportId: center.sportId, leagueId: center.leagueId, entityIds: [center.id], source: { id: "edgeboard-supported-research-systems", label: "Existing EdgeBoard research systems", sample: true }, validationStatus: "supported_path", action }));
  }

  getEntityGraph(entityId, { mode = "stats", currentDate = new Date(), limit = KNOWLEDGE_GRAPH_LIMITS.nodes } = {}) {
    const center = this.entityRegistry.getEntity(entityId);
    if (!center) return Object.freeze({ status: "not-found", center: null, nodes: freeze([]), edges: freeze([]), sections: freeze([]), nextResearch: freeze([]), warnings: freeze(["The graph center is not a canonical EdgeBoard entity."]) });
    const dateKey = currentDate instanceof Date && !Number.isNaN(currentDate.getTime()) ? `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}` : "invalid";
    const key = `${center.id}:${mode}:${dateKey}:${Boolean(this.historicalService)}:${Boolean(this.visualizationRepository)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const entityNodes = this.buildEntityNodes(center);
    const eventNodes = this.buildEventNodes(center);
    const eventIds = new Set(eventNodes.flatMap((item) => item.eventIds));
    const storyNodes = this.buildStoryNodes(center, eventIds, mode);
    const insightNodes = this.buildInsightNodes(center, mode);
    const historicalNodes = this.buildHistoricalNodes(center, currentDate);
    const marketNodes = this.buildMarketNodes(center, eventNodes, mode);
    const toolNodes = this.buildToolNodes(center);
    const values = [...entityNodes, ...eventNodes, ...storyNodes, ...insightNodes, ...historicalNodes, ...marketNodes, ...toolNodes]
      .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, Math.max(8, Math.min(60, Number(limit) || KNOWLEDGE_GRAPH_LIMITS.nodes)));
    const edgeType = (item) => item.edgeType || (item.type === "entity" ? "explicit_relationship" : item.type === "event" ? (item.reason.includes("team") ? "team_schedule" : item.reason.includes("league") ? "league_schedule" : "participates_in") : item.type === "story" ? "supported_by_story" : item.type === "insight" ? "supported_by_insight" : item.type === "historical_item" ? "supported_by_history" : item.type === "anniversary" ? "anniversary_of" : item.type === "market" ? "has_current_market" : item.type === "visualization" ? "can_visualize" : item.type === "comparison" ? "can_compare" : item.type === "leaderboard" ? "can_rank" : item.type === "workspace" ? "can_save" : "can_research");
    const edges = values.map((item) => edge({ from: center.id, to: item.id, type: edgeType(item), label: item.reason }));
    const groups = { entities: values.filter((item) => item.type === "entity"), current: values.filter((item) => ["event", "market"].includes(item.type)), evidence: values.filter((item) => ["story", "insight", "historical_item", "anniversary"].includes(item.type)), "research-tools": values.filter((item) => ["visualization", "comparison", "leaderboard", "research_session", "workspace", "research_path"].includes(item.type)) };
    const labels = { entities: "People and organizations", current: "Current events and markets", evidence: "Stories, insights, and history", "research-tools": "Research tools" };
    const sections = KNOWLEDGE_GRAPH_SECTION_ORDER.map((id) => Object.freeze({ id, label: labels[id], items: freeze(groups[id].slice(0, KNOWLEDGE_GRAPH_LIMITS.perSection)) })).filter((section) => section.items.length);
    const nextResearch = freeze(sections.flatMap((section) => section.items.slice(0, 3)).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, KNOWLEDGE_GRAPH_LIMITS.nextResearch));
    const result = Object.freeze({ status: "ready", schemaVersion: KNOWLEDGE_GRAPH_SCHEMA_VERSION, center, nodes: freeze(values), edges: freeze(edges), sections: freeze(sections), nextResearch, generatedFrom: freeze(["canonical entity registry", "normalized sports repository", "deterministic story and insight systems", ...(this.historicalService ? ["Historical Explorer", "On This Day"] : [])]), source: Object.freeze({ id: "edgeboard-connected-knowledge-graph", label: "EdgeBoard deterministic connected research graph", sample: true }), warnings: freeze(["Connections are generated from canonical IDs and existing supported systems. Missing relationships are not inferred from names."]) });
    const validation = validateKnowledgeGraph(result, this.entityRegistry);
    const finalResult = validation.valid ? result : Object.freeze({ ...result, status: "invalid", nodes: freeze([]), edges: freeze([]), sections: freeze([]), nextResearch: freeze([]), warnings: freeze([...result.warnings, ...validation.errors]) });
    this.cache.set(key, finalResult); return finalResult;
  }

  async getEntityGraphAsync(entityId, options = {}, request = {}) {
    const sequence = ++this.requestSequence; await Promise.resolve();
    if (request.signal?.aborted || sequence !== this.requestSequence) throw new DOMException("Knowledge graph request superseded.", "AbortError");
    return this.getEntityGraph(entityId, options);
  }
}

export function createKnowledgeGraphService(dependencies) { return new KnowledgeGraphService(dependencies); }
