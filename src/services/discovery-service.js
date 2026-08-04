import { getStatDefinition, STAT_REGISTRY } from "../config/stat-registry.js";
import {
  DISCOVERY_ITEM_TYPES,
  DISCOVERY_LIMITS,
  DISCOVERY_MIN_RESEARCH_QUALITY,
  DISCOVERY_SCHEMA_VERSION,
  DISCOVERY_SCORE_WEIGHTS,
  EXPLORATION_CATEGORIES,
  SPORT_DISCOVERY_TAXONOMY,
} from "../config/discovery-config.js";
import { MOCK_DISCOVERY_CHANGES } from "../data/mock-discovery-fixtures.js";
import { evaluateEdgeTrust } from "./edge-trust-service.js";

const clean = (value) => String(value ?? "").trim();
const unique = (values) => [...new Set((values || []).filter(Boolean))];
const freezeList = (values) => Object.freeze([...(values || [])]);
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function routeFor(input = {}) {
  const params = new URLSearchParams();
  if (input.itemId) params.set("discovery", input.itemId);
  if (input.pathId) params.set("path", input.pathId);
  if (input.topicId) params.set("topic", input.topicId);
  if (input.sportId || input.leagueId) params.set("explore", [input.sportId, input.leagueId].filter(Boolean).join(":"));
  if (input.changes) params.set("changes", "1");
  return `/?${params.toString()}`;
}

function sourceSignal(type, label, weight, metadata = {}) {
  return Object.freeze({ type, label, weight: Number(weight) || 0, ...metadata });
}

function trustForItem(item) {
  if (item.edgeTrust?.researchQuality) return item.edgeTrust;
  const sample = item.sampleMode !== false;
  const conflict = item.validationStatus === "conflicting_sources";
  const partial = item.validationStatus === "partial_coverage";
  const stale = item.freshness?.state === "stale";
  return evaluateEdgeTrust({
    components: {
      historical: conflict ? "conflict" : partial ? "partial" : sample ? "sample" : "verified",
      agreement: conflict ? "conflict" : item.sourceSignals?.length ? "verified" : "unavailable",
      freshness: stale ? "stale" : sample ? "sample" : item.freshness?.lastUpdated ? "fresh" : "unavailable",
      coverage: partial ? .5 : item.sourceSignals?.length ? 1 : 0,
      identity: item.entityIds?.length && item.identityResolved === false ? "pending" : "verified",
      completeness: item.sourceSignals?.length && (item.route?.href || item.queryTemplate?.query) ? 1 : .5,
    },
    applicable: ["historical", "agreement", "freshness", "coverage", "identity", "completeness"],
    conflicts: conflict ? ["Discovery sources conflict; the item is suppressed."] : [],
    sample,
    lastValidation: item.freshness?.lastUpdated,
  });
}

function normalizeSource(source = {}) {
  return Object.freeze({
    id: clean(source.id || source.provider || source.label) || "source-unavailable",
    label: clean(source.label || source.attribution || source.provider) || "Source unavailable",
    sample: source.sample !== false,
  });
}

export function createDiscoveryItem(input = {}, dependencies = {}) {
  const entityIds = unique(input.entityIds || []);
  const resolvedEntities = entityIds.map((id) => dependencies.entityRegistry?.getEntity?.(id)).filter(Boolean);
  const sources = freezeList((input.sources?.length ? input.sources : [input.source || {}]).map(normalizeSource));
  const sourceSignals = freezeList(input.sourceSignals || []);
  const identity = [input.type, input.sportId, input.leagueId, entityIds.join(","), (input.statIds || []).join(","), input.title].join("|");
  const item = {
    id: clean(input.id) || `discovery-${stableHash(identity)}`,
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    type: DISCOVERY_ITEM_TYPES.includes(input.type) ? input.type : "research_topic",
    title: clean(input.title) || "Untitled research topic",
    summary: clean(input.summary) || "Explore the available structured evidence.",
    label: clean(input.label) || "Suggested for your selected scope",
    sportId: clean(input.sportId),
    leagueId: clean(input.leagueId),
    entityIds: freezeList(entityIds),
    eventIds: freezeList(unique(input.eventIds || [])),
    storyIds: freezeList(unique(input.storyIds || [])),
    statIds: freezeList(unique(input.statIds || [])),
    marketIds: freezeList(unique(input.marketIds || [])),
    queryTemplate: Object.freeze({ ...(input.queryTemplate || {}) }),
    route: Object.freeze({ ...(input.route || {}) }),
    sourceSignals,
    sources,
    discoveryScore: Number(input.discoveryScore) || 0,
    edgeTrust: input.edgeTrust || null,
    researchQuality: input.researchQuality || input.edgeTrust?.researchQuality || null,
    freshness: Object.freeze({ state: input.freshness?.state || "unknown", lastUpdated: input.freshness?.lastUpdated || null }),
    sampleMode: input.sampleMode !== false,
    localOnly: input.localOnly === true,
    personalized: input.personalized === true,
    validationStatus: clean(input.validationStatus) || "dataset_only",
    warnings: freezeList(unique(input.warnings || [])),
    resolvedEntities: freezeList(resolvedEntities),
    identityResolved: entityIds.length === resolvedEntities.length,
    drillDownDepth: Number(input.drillDownDepth) || 1,
    createdAt: input.createdAt || input.freshness?.lastUpdated || null,
    change: input.change ? Object.freeze({ ...input.change }) : null,
    eventStatus: clean(input.eventStatus),
    startsAt: input.startsAt || null,
  };
  item.edgeTrust = trustForItem(item);
  item.researchQuality = item.researchQuality || item.edgeTrust.researchQuality;
  return Object.freeze(item);
}

export function validateDiscoveryItem(item, dependencies = {}) {
  const errors = [];
  const warnings = [...(item?.warnings || [])];
  if (!item?.id || !DISCOVERY_ITEM_TYPES.includes(item.type)) errors.push("A canonical discovery ID and type are required.");
  if (!item?.title || !item?.summary) errors.push("Title and summary are required.");
  if (!item?.sportId || !item?.leagueId) errors.push("Sport and league scope are required.");
  if (!item?.route?.href && !item?.queryTemplate?.query) errors.push("A stable route or structured query is required.");
  if (item?.identityResolved === false) errors.push("A canonical entity reference did not resolve.");
  if (item?.statIds?.some((id) => !getStatDefinition(id))) errors.push("A canonical statistic reference did not resolve.");
  if (item?.leagueId && dependencies.sportsRepository && !dependencies.sportsRepository.getLeague(item.leagueId)) errors.push("A canonical league reference did not resolve.");
  if (!item?.sources?.length || item.sources.some((source) => !source.id || source.id === "source-unavailable")) errors.push("Source attribution is required.");
  if (!item?.freshness?.lastUpdated) warnings.push("A freshness timestamp is unavailable.");
  if (["conflicting_sources", "retracted", "invalid", "unsupported"].includes(item?.validationStatus)) errors.push(`Validation state ${item.validationStatus} is not discovery eligible.`);
  if (item?.freshness?.state === "stale") warnings.push("Source data is stale and ranking is reduced.");
  if (!item?.edgeTrust?.researchQuality) errors.push("Edge Trust metadata is required.");
  if ((item?.edgeTrust?.researchQuality?.score ?? 0) < DISCOVERY_MIN_RESEARCH_QUALITY) errors.push("Research Quality is too low for discovery.");
  return Object.freeze({ valid: errors.length === 0, errors: freezeList(errors), warnings: freezeList(unique(warnings)) });
}

export function scoreDiscoveryItem(item, context = {}) {
  const weights = { ...DISCOVERY_SCORE_WEIGHTS, ...(context.weights || {}) };
  const now = safeDate(context.now) || safeDate(item.freshness?.lastUpdated) || new Date(0);
  const updated = safeDate(item.freshness?.lastUpdated);
  const ageDays = updated ? Math.max(0, (now - updated) / 86400000) : 365;
  const recency = item.sampleMode ? .7 : Math.max(0, 1 - ageDays / 14);
  const score = (context.leagueIds || []).includes(item.leagueId) * weights.selectedLeague
    + (context.sportIds || []).includes(item.sportId) * weights.selectedSport
    + (context.preferences?.favoriteLeagueIds || []).includes(item.leagueId) * weights.preferredLeague
    + (context.preferences?.favoriteSportIds || []).includes(item.sportId) * weights.preferredSport
    + Math.min(1, Number(item.sourceSignals.find((signal) => signal.type === "story_score")?.value || 0) / 100) * weights.storyScore
    + recency * weights.recency
    + (item.edgeTrust.researchQuality.score / 100) * weights.edgeTrust
    + (item.researchQuality.score / 100) * weights.researchQuality
    + Math.min(1, item.drillDownDepth / 5) * weights.drillDownDepth
    + .7 * weights.novelty
    + Number(Boolean(item.localOnly || item.personalized)) * weights.localInterest
    + Number(Boolean(context.mode !== "stats" && item.marketIds.length)) * weights.availableMarket
    - Number(item.freshness.state === "stale") * weights.stalePenalty
    - Number(item.sourceSignals.some((signal) => signal.type === "small_sample")) * weights.smallSamplePenalty
    - Number((context.seenIds || []).includes(item.id)) * weights.repeatedDisplayPenalty
    - Number(item.validationStatus === "partial_coverage") * weights.partialCoveragePenalty;
  return clamp(Number(score.toFixed(1)));
}

export function diversifyDiscoveryItems(items, limit = DISCOVERY_LIMITS.homepage, context = {}) {
  const selected = [];
  const leagueCounts = new Map();
  const typeCounts = new Map();
  const sorted = [...items].sort((left, right) => right.discoveryScore - left.discoveryScore || left.id.localeCompare(right.id));
  for (const item of sorted) {
    if (selected.length >= limit) break;
    const leagueCount = leagueCounts.get(item.leagueId) || 0;
    const typeCount = typeCounts.get(item.type) || 0;
    const crossScope = (context.leagueIds || []).length !== 1 && (context.sportIds || []).length !== 1;
    if (crossScope && (leagueCount >= 2 || typeCount >= 3) && sorted.some((candidate) =>
      !selected.includes(candidate) && (leagueCounts.get(candidate.leagueId) || 0) === 0)) continue;
    selected.push(item);
    leagueCounts.set(item.leagueId, leagueCount + 1);
    typeCounts.set(item.type, typeCount + 1);
  }
  return Object.freeze(selected);
}

function typeForEntity(entity) {
  return ({ "tennis-player": "tennis_player" })[entity?.type] || (DISCOVERY_ITEM_TYPES.includes(entity?.type) ? entity.type : entity?.entityType === "team" ? "team" : "athlete");
}

export class DeterministicDiscoveryService {
  constructor({ sportsRepository, statsRepository, insightService, storyEngine, entityRegistry, historicalService = null, changes = MOCK_DISCOVERY_CHANGES, clock = () => new Date() } = {}) {
    if (!sportsRepository || !statsRepository || !insightService || !storyEngine || !entityRegistry) throw new TypeError("Discovery requires normalized sports, statistics, insight, story, and entity services.");
    this.sportsRepository = sportsRepository;
    this.statsRepository = statsRepository;
    this.insightService = insightService;
    this.storyEngine = storyEngine;
    this.entityRegistry = entityRegistry;
    this.historicalService = historicalService;
    this.changes = changes;
    this.clock = clock;
    this.cache = new Map();
    this.index = new Map();
    this.pathIndex = new Map();
    this.requestSequence = 0;
  }

  context(scope = {}, options = {}) {
    const leagueIds = unique(scope.leagueIds || []);
    const sportIds = unique(scope.sportIds || []);
    return {
      leagueIds, sportIds,
      liveOnly: scope.liveOnly === true,
      todayOnly: scope.todayOnly === true,
      mode: options.mode || "stats", preferences: options.preferences || {}, seenIds: options.seenIds || [], now: options.now || this.clock(),
    };
  }

  cacheKey(scope, options) {
    const context = this.context(scope, options);
    return JSON.stringify([
      [...context.leagueIds].sort(),
      [...context.sportIds].sort(),
      context.mode,
      context.liveOnly,
      context.todayOnly,
      context.todayOnly ? safeDate(context.now)?.toLocaleDateString("en-CA") : "",
      this.statsRepository.updatedAt,
      [...(context.preferences.favoriteLeagueIds || [])].sort(),
      [...(context.preferences.favoriteSportIds || [])].sort(),
      [...context.seenIds].sort(),
    ]);
  }

  inScope(value, context) {
    return (!context.leagueIds.length || context.leagueIds.includes(value.leagueId))
      && (!context.sportIds.length || context.sportIds.includes(value.sportId));
  }

  availableTopic(topic, sportId, leagueId) {
    const entities = this.entityRegistry.getEntities({ sportId, leagueId, activeOnly: true });
    if (topic.entityTypes.length && !entities.some((entity) => topic.entityTypes.includes(entity.type))) return false;
    if (topic.evidenceKind === "event") return this.sportsRepository.getEvents(leagueId).length > 0;
    if (!topic.statIds.length) return entities.length > 0;
    return topic.statIds.every((statId) => getStatDefinition(statId)
      && this.statsRepository.rows.some((row) => row.league_id === leagueId && row.status === "completed" && row.stats?.[statId] !== undefined));
  }

  topicItem(topic, league, context) {
    const statLabel = topic.statIds.map((id) => getStatDefinition(id)?.displayName).filter(Boolean).join(" and ") || topic.label;
    const marketIds = context.mode === "stats" || !topic.marketRelevant ? [] : this.sportsRepository.getMarkets(league.leagueId)
      .filter((market) => market.available && market.status === "open").slice(0, 2).map((market) => market.canonicalMarketId);
    return createDiscoveryItem({
      id: `topic-${league.leagueId}-${topic.id}`,
      type: context.mode === "betting" && marketIds.length ? "market_topic" : "research_topic",
      title: `${league.leagueDisplayName} ${topic.label.toLowerCase()} research`,
      summary: `Explore available ${statLabel.toLowerCase()} evidence, qualified leaders, related profiles, and supported follow-up views.`,
      label: "Suggested for your selected league",
      sportId: league.sportId,
      leagueId: league.leagueId,
      statIds: topic.statIds,
      marketIds,
      queryTemplate: { query: `${topic.queryTemplate} in ${league.leagueDisplayName}`, intent: topic.pathKind, sportId: league.sportId, leagueId: league.leagueId, statIds: topic.statIds },
      route: { href: routeFor({ topicId: `${league.leagueId}-${topic.id}`, sportId: league.sportId, leagueId: league.leagueId }), type: "topic", topicId: `${league.leagueId}-${topic.id}` },
      sourceSignals: [sourceSignal("configured_topic", "Sport-aware topic with available normalized evidence", 1)],
      sources: [{ id: this.statsRepository.name, label: this.statsRepository.name, sample: this.statsRepository.mode === "sample" }],
      freshness: { state: this.statsRepository.mode === "sample" ? "sample" : "fresh", lastUpdated: this.statsRepository.updatedAt },
      sampleMode: this.statsRepository.mode === "sample",
      validationStatus: "dataset_only",
      warnings: ["Popularity is not measured; this topic is selected from available evidence."],
      drillDownDepth: marketIds.length ? 5 : 4,
    }, this);
  }

  storyItem(story, context) {
    const view = this.storyEngine.buildStoryViewModel(story, { presentation: "compact", mode: context.mode });
    return createDiscoveryItem({
      id: `discovery-story-${story.id}`,
      type: story.storyType?.includes("streak") ? "streak" : story.storyType?.includes("milestone") ? "milestone" : "story",
      title: view.headline,
      summary: view.summary,
      label: "Trending in EdgeBoard sample data",
      sportId: story.sportId,
      leagueId: story.leagueId,
      entityIds: story.entityIds,
      eventIds: story.eventIds,
      storyIds: [story.id],
      statIds: story.statIds,
      marketIds: context.mode === "stats" ? [] : story.bettingContext?.marketId ? [story.bettingContext.marketId] : [],
      queryTemplate: { query: `Explain this story with supporting evidence: ${view.headline}`, intent: "story", storyId: story.id, entityIds: story.entityIds, statIds: story.statIds },
      route: { href: routeFor({ itemId: `discovery-story-${story.id}`, sportId: story.sportId, leagueId: story.leagueId }), type: "story", storyId: story.id },
      sourceSignals: [sourceSignal("story_score", "Deterministic Story Engine score", 1, { value: story.storyScore }), sourceSignal("story_validation", story.validationStatus, 1)],
      sources: story.sources,
      freshness: story.freshness,
      sampleMode: story.sample,
      validationStatus: story.validationStatus,
      warnings: story.warnings,
      edgeTrust: story.edgeTrust,
      researchQuality: story.researchQuality,
      drillDownDepth: 5,
    }, this);
  }

  entityItem(entity, context) {
    const related = this.entityRegistry.getRelatedEntities(entity);
    return createDiscoveryItem({
      id: `discovery-entity-${entity.id}`,
      type: typeForEntity(entity),
      title: entity.displayName || entity.name,
      summary: `Open the canonical profile and continue through ${related.length ? "verified relationships, " : ""}logs, comparisons, stories, and available visuals.`,
      label: "Explore canonical entity",
      sportId: entity.sportId,
      leagueId: entity.leagueId,
      entityIds: [entity.id],
      queryTemplate: { query: `Research ${entity.displayName || entity.name}`, intent: "entity", entityIds: [entity.id] },
      route: { href: entity.links?.canonicalProfile ? `/?${entity.type === "athlete" || ["fighter", "boxer", "driver"].includes(entity.type) ? "player" : "entityProfile"}=${encodeURIComponent(entity.id)}` : routeFor({ itemId: `discovery-entity-${entity.id}` }), type: "profile", entityId: entity.id, profileSystem: ["athlete", "fighter", "boxer", "driver"].includes(entity.type) ? "athlete" : "entity" },
      sourceSignals: [sourceSignal("canonical_entity", "Existing canonical entity registry", 1)],
      sources: [{ id: "edgeboard-canonical-registry", label: "EdgeBoard canonical sample registry", sample: true }],
      freshness: { state: "sample", lastUpdated: this.statsRepository.updatedAt },
      sampleMode: true,
      validationStatus: "dataset_only",
      drillDownDepth: 3 + Number(related.length > 0),
    }, this);
  }

  leagueItem(league) {
    return createDiscoveryItem({
      id: `discovery-league-${league.leagueId}`,
      type: "league",
      title: `Explore ${league.leagueDisplayName}`,
      summary: `${league.sportDisplayName} discovery with ${league.todayEventCount} event${league.todayEventCount === 1 ? "" : "s"} today and ${league.availableMarketCount} available sample market${league.availableMarketCount === 1 ? "" : "s"}.`,
      label: "Explore sport and league",
      sportId: league.sportId,
      leagueId: league.leagueId,
      queryTemplate: { query: `Explore ${league.leagueDisplayName}`, intent: "league" },
      route: { href: routeFor({ sportId: league.sportId, leagueId: league.leagueId }), type: "explore", sportId: league.sportId, leagueId: league.leagueId },
      sourceSignals: [sourceSignal("league_activity", "Normalized league availability", 1)],
      sources: [{ id: league.dataProvider, label: league.dataProvider, sample: true }],
      freshness: { state: league.availabilityStatus === "stale" ? "stale" : "sample", lastUpdated: league.lastUpdatedAt },
      sampleMode: true,
      validationStatus: league.dataQualityStatus === "error" ? "invalid" : "dataset_only",
      drillDownDepth: 5,
    }, this);
  }

  eventItem(event, league, context) {
    const title = clean(event.display?.title)
      || clean(event.card?.event_name || event.card?.name || event.race?.event_name || event.race?.name || event.tournament?.name)
      || [event.away, event.home].filter((name) => name && name !== "TBD").join(" at ")
      || `${league.leagueDisplayName} event`;
    const marketIds = context.mode === "stats" ? [] : this.sportsRepository.getMarkets(league.leagueId)
      .filter((market) => market.eventId === event.id && market.available)
      .map((market) => market.canonicalMarketId);
    return createDiscoveryItem({
      id: `discovery-event-${event.id}`,
      type: "event",
      title,
      summary: event.startsAt ? `Explore this ${event.eventType.replaceAll("-", " ")} scheduled for ${event.startsAt}.` : "Event time is unavailable from the sample provider.",
      label: event.status === "live" ? "Live event" : "Upcoming event",
      sportId: league.sportId,
      leagueId: league.leagueId,
      eventIds: [event.id],
      eventStatus: event.status,
      startsAt: event.startsAt,
      marketIds,
      queryTemplate: { query: `Research ${title}`, intent: "event", eventIds: [event.id], sportId: league.sportId, leagueId: league.leagueId },
      route: { href: routeFor({ itemId: `discovery-event-${event.id}`, sportId: league.sportId, leagueId: league.leagueId }), type: "event", eventId: event.id },
      sourceSignals: [sourceSignal("normalized_event", "Normalized schedule event", 1)],
      sources: [{ id: event.source, label: event.source, sample: event.sourceMode === "sample" }],
      freshness: { state: event.sourceMode === "sample" ? "sample" : "fresh", lastUpdated: event.sourceUpdatedAt || league.lastUpdatedAt },
      sampleMode: event.sourceMode === "sample",
      validationStatus: "dataset_only",
      warnings: event.startsAt ? [] : ["Event time is unavailable."],
      drillDownDepth: marketIds.length ? 4 : 3,
    }, this);
  }

  historicalItem(item) {
    const documentedRivalry = item.type === "rivalry_event" && item.metadata?.rivalryId && item.metadata.classification !== "direct_head_to_head";
    const type = documentedRivalry ? "rivalry" : item.type === "record" ? "record" : "historical_topic";
    return createDiscoveryItem({
      id: `discovery-${item.id}`, type, title: item.title,
      summary: `${item.coverageLabel}. ${item.validationLabel}.`, label: documentedRivalry ? "Rivalry history" : item.type === "rivalry_event" ? "Direct head-to-head history" : "Historical Explorer",
      sportId: item.sportId, leagueId: item.leagueId, entityIds: item.entityIds, eventIds: item.eventIds, statIds: item.statIds,
      queryTemplate: { query: `Explore ${item.title}`, intent: "historical_exploration", historicalItemId: item.id },
      route: { href: item.route, type: "history", historicalItemId: item.id },
      sourceSignals: item.supportingEvidence.slice(0, 2).map((entry) => sourceSignal("historical_evidence", entry.label, 1)),
      sources: item.sources, freshness: item.freshness, sampleMode: item.sample,
      validationStatus: item.validationStatus === "partial_coverage" ? "partial_coverage" : "dataset_only",
      warnings: [...item.warnings, `Historical validation: ${item.validationStatus}.`], drillDownDepth: 4,
    }, this);
  }

  generate(scope = {}, options = {}) {
    const key = this.cacheKey(scope, options);
    if (!options.noCache && this.cache.has(key)) return this.cache.get(key);
    const context = this.context(scope, options);
    const leagues = (options.visibleLeagues || this.sportsRepository.getLeagues()).filter((league) => this.inScope(league, context));
    const stories = this.storyEngine.getStoriesForScope({ leagueIds: context.leagueIds, sportIds: context.sportIds }, { now: context.now, mode: context.mode, visibleLeagues: leagues });
    const candidates = [
      ...stories.slice(0, 18).map((story) => this.storyItem(story, context)),
      ...leagues.flatMap((league) => (SPORT_DISCOVERY_TAXONOMY[league.sportId] || [])
        .filter((topic) => this.availableTopic(topic, league.sportId, league.leagueId))
        .map((topic) => this.topicItem(topic, league, context))),
      ...leagues.map((league) => this.leagueItem(league)),
      ...leagues.flatMap((league) => this.sportsRepository.getEvents(league.leagueId).slice(0, 4)
        .map((event) => this.eventItem(event, league, context))),
      ...leagues.flatMap((league) => this.entityRegistry.getEntities({ sportId: league.sportId, leagueId: league.leagueId, activeOnly: true }).slice(0, 3)
        .map((entity) => this.entityItem(entity, context))),
      ...(this.historicalService ? this.historicalService.searchHistoricalItems({
        sportId: context.sportIds.length === 1 ? context.sportIds[0] : "",
        leagueId: context.leagueIds.length === 1 ? context.leagueIds[0] : "", pageSize: 12,
      }).items.map((item) => this.historicalItem(item)) : []),
    ];
    const localDate = safeDate(context.now)?.toLocaleDateString("en-CA");
    const uniqueItems = [...new Map(candidates.map((item) => [item.id, item])).values()]
      .filter((item) => !context.liveOnly || (item.type === "event" && item.eventStatus === "live"))
      .filter((item) => !context.todayOnly || (item.type === "event" && safeDate(item.startsAt)?.toLocaleDateString("en-CA") === localDate))
      .filter((item) => validateDiscoveryItem(item, this).valid)
      .map((item) => Object.freeze({ ...item, discoveryScore: scoreDiscoveryItem(item, context) }))
      .sort((left, right) => right.discoveryScore - left.discoveryScore || left.id.localeCompare(right.id));
    uniqueItems.forEach((item) => this.index.set(item.id, item));
    const frozen = Object.freeze(uniqueItems);
    if (!options.noCache) this.cache.set(key, frozen);
    return frozen;
  }

  getDiscoveryItems(scope = {}, options = {}) { return this.generate(scope, options); }
  getDiscoveryForScope(scope = {}, options = {}) { return this.generate(scope, options); }

  getTrendingResearch(scope = {}, options = {}) {
    const context = this.context(scope, options);
    const eligible = this.generate(scope, options).filter((item) => ["story", "streak", "milestone", "research_topic", "market_topic", "leaderboard"].includes(item.type));
    return diversifyDiscoveryItems(eligible, options.limit || DISCOVERY_LIMITS.trending, context).map((item) => this.buildDiscoveryViewModel(item, options));
  }

  getExploreCategories({ sportId, leagueId, mode = "stats" } = {}) {
    const league = this.sportsRepository.getLeague(leagueId);
    const resolvedSport = sportId || league?.sportId || "";
    const topics = (SPORT_DISCOVERY_TAXONOMY[resolvedSport] || []).filter((topic) => !leagueId || this.availableTopic(topic, resolvedSport, leagueId));
    const categories = [
      "Players and Competitors", "Teams and Organizations", "Current Leaders", "Recent Performances",
      ...(topics.some((topic) => topic.pathKind === "streak") ? ["Active Streaks"] : []),
      ...(topics.some((topic) => topic.pathKind === "milestone") ? ["Milestones"] : []),
      ...(topics.some((topic) => topic.pathKind === "rivalry") ? ["Rivalries"] : []),
      "Visuals", "Stories", "Upcoming Events",
      ...(mode !== "stats" && topics.some((topic) => topic.marketRelevant) ? ["Markets"] : []),
    ];
    return Object.freeze(unique(categories).filter((label) => EXPLORATION_CATEGORIES.includes(label)).map((label) => Object.freeze({ id: label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"), label })));
  }

  getExploreTopics({ sportId, leagueId, mode = "stats" } = {}) {
    const league = this.sportsRepository.getLeague(leagueId);
    if (!league || league.sportId !== sportId) return Object.freeze([]);
    const context = this.context({ sportIds: [sportId], leagueIds: [leagueId] }, { mode });
    return Object.freeze((SPORT_DISCOVERY_TAXONOMY[sportId] || [])
      .filter((topic) => this.availableTopic(topic, sportId, leagueId))
      .map((topic) => this.buildDiscoveryViewModel(this.topicItem(topic, league, context), { mode })));
  }

  getExploreCategoryItems(categoryId, scope = {}, options = {}) {
    const typeMap = {
      "players-and-competitors": ["athlete", "fighter", "boxer", "driver", "golfer", "tennis_player"],
      "teams-and-organizations": ["team", "competition", "league"],
      "current-leaders": ["leaderboard", "research_topic"],
      "recent-performances": ["story", "research_topic"],
      "active-streaks": ["streak"],
      milestones: ["milestone"],
      records: ["record"],
      matchups: ["matchup"],
      rivalries: ["rivalry", "research_topic"],
      history: ["historical_topic"],
      visuals: ["visualization", "research_topic"],
      stories: ["story", "streak", "milestone"],
      markets: ["market_topic"],
      "upcoming-events": ["event"],
    };
    const types = typeMap[categoryId] || [];
    return Object.freeze(this.generate(scope, options)
      .filter((item) => types.includes(item.type))
      .slice(0, options.limit || DISCOVERY_LIMITS.explorePage)
      .map((item) => this.buildDiscoveryViewModel(item, options)));
  }

  buildPath(topicItem, mode = "stats") {
    if (!topicItem) return null;
    const name = topicItem.title.replace(/ research$/i, "");
    const completedRows = this.statsRepository.rows.filter((row) => row.league_id === topicItem.leagueId
      && row.status === "completed" && topicItem.statIds.some((statId) => row.stats?.[statId] !== undefined));
    const entityCount = new Set(completedRows.map((row) => row.entity_id).filter(Boolean)).size;
    const primaryStatId = topicItem.statIds[0];
    const availableLeaderboardIds = new Set(this.statsRepository.getAvailableLeaderboardStats(topicItem.sportId, topicItem.leagueId).map((definition) => definition.id));
    const hasLeaderboard = primaryStatId && availableLeaderboardIds.has(primaryStatId)
      && this.statsRepository.getPlayerLeaderboard(primaryStatId, {
        sportId: topicItem.sportId, leagueId: topicItem.leagueId, dateRange: { type: "season", value: "current" }, resultLimit: 2,
      }).entries.length > 0;
    const base = topicItem.queryTemplate.intent === "event"
      ? [{ type: "event", label: `Research ${name}`, query: topicItem.queryTemplate.query }]
      : [
        hasLeaderboard ? { type: "leaderboard", label: `View ${name} leaders`, query: `Who leads ${topicItem.leagueId.toUpperCase()} in ${primaryStatId}?` } : null,
        completedRows.length ? { type: "trend", label: "Review recent form", query: `Show recent completed-event trends for ${name}` } : null,
        entityCount >= 2 ? { type: "comparison", label: "Compare qualified entities", query: `Compare the top qualified ${name} entities` } : null,
        completedRows.length ? { type: "visualization", label: "Visualize the evidence", query: `Visualize ${name} using available source rows` } : null,
      ].filter(Boolean);
    if (mode !== "stats" && topicItem.marketIds.length) base.push({ type: "market", label: "Check current markets", query: `Show current verified markets for ${name}` });
    const steps = mode === "betting" ? [...base.filter((step) => step.type !== "visualization"), ...base.filter((step) => step.type === "visualization")] : base;
    const id = `path-${topicItem.leagueId}-${topicItem.id.replace(/^topic-[^-]+-/, "")}-${mode}`;
    const path = Object.freeze({
      id, title: `Explore ${name}`, sportId: topicItem.sportId, leagueId: topicItem.leagueId, mode,
      steps: Object.freeze(steps.map((step, index) => Object.freeze({ ...step, id: `${id}-step-${index + 1}`, queryTemplate: Object.freeze({ query: step.query, sportId: topicItem.sportId, leagueId: topicItem.leagueId, statIds: topicItem.statIds }) }))),
      route: Object.freeze({ href: routeFor({ pathId: id, sportId: topicItem.sportId, leagueId: topicItem.leagueId }), type: "path", pathId: id }),
      sampleMode: topicItem.sampleMode,
      disclosure: mode === "stats" ? "Stats mode path contains factual and historical steps only."
        : mode === "both" ? "Both mode keeps statistics first and optional verified markets last."
          : "Betting mode emphasizes market and matchup research without guarantees.",
    });
    this.pathIndex.set(id, path);
    return path;
  }

  getExplorationPaths(scope = {}, options = {}) {
    const topics = this.generate(scope, options).filter((item) => ["research_topic", "market_topic"].includes(item.type)).slice(0, options.limit || 8);
    return Object.freeze(topics.map((item) => this.buildPath(item, options.mode || "stats")).filter((path) => path?.steps.length));
  }

  getContinueExploring(workspaceState = null, scope = {}, options = {}) {
    if (!workspaceState) return Object.freeze([]);
    const workspace = workspaceState.workspaces?.find((item) => !item.isArchived);
    const preferences = workspaceState.preferences?.find((item) => item.workspaceId === workspace?.id) || {};
    const privacyMode = workspaceState.meta?.privacyMode === true || preferences.privacyMode === true;
    if (!workspace || workspaceState.meta?.activityPaused || preferences.activityPaused || preferences.personalizedDiscoveryEnabled === false) return Object.freeze([]);
    const context = this.context(scope, { ...options, preferences });
    const activity = [...(workspaceState.activity || [])].filter((item) => item.workspaceId === workspace.id).reverse();
    const saved = [...(workspaceState.savedObjects || [])].filter((item) => item.workspaceId === workspace.id && !item.isArchived).reverse();
    const items = [
      ...activity.map((entry) => createDiscoveryItem({
        id: `continue-activity-${entry.targetType}-${entry.targetId}`,
        type: entry.targetType === "story" ? "story" : "recently_viewed",
        title: entry.label || "Continue local research",
        summary: entry.queryText && !preferences.privacyMode && !workspaceState.meta?.privacyMode ? `Resume: ${entry.queryText}` : "Resume this locally recorded research path.",
        label: "Recently researched on this device",
        sportId: this.entityRegistry.getEntity(entry.targetId)?.sportId || options.defaultSportId || "multi-sport",
        leagueId: this.entityRegistry.getEntity(entry.targetId)?.leagueId || options.defaultLeagueId || "all",
        entityIds: this.entityRegistry.getEntity(entry.targetId) ? [entry.targetId] : [],
        queryTemplate: entry.queryText && !privacyMode ? { query: entry.queryText, intent: "resume" } : {},
        route: { href: privacyMode ? "/" : entry.route || "/", type: "resume", targetId: entry.targetId },
        sourceSignals: [sourceSignal("local_activity", "Local-device activity only", 1)],
        sources: [{ id: "edgeboard-local-workspace", label: "This device", sample: false }],
        freshness: { state: "local", lastUpdated: entry.createdAt }, sampleMode: false, localOnly: true, personalized: true,
        validationStatus: "dataset_only", warnings: ["Local-only activity; not public popularity."], drillDownDepth: 2,
      }, this)),
      ...saved.map((savedItem) => createDiscoveryItem({
        id: `continue-saved-${savedItem.id}`, type: "saved_research", title: savedItem.title,
        summary: savedItem.description || "Resume the saved structured research snapshot.", label: "Saved on this device",
        sportId: savedItem.sourceState?.sportId || options.defaultSportId || "multi-sport",
        leagueId: savedItem.sourceState?.leagueId || options.defaultLeagueId || "all",
        entityIds: savedItem.canonicalReferences?.entityIds || [], eventIds: savedItem.canonicalReferences?.eventIds || [], storyIds: savedItem.canonicalReferences?.storyIds || [],
        queryTemplate: privacyMode ? {} : { query: savedItem.sourceState?.queryText || "", intent: "resume" },
        route: { href: `/?workspace=${encodeURIComponent(workspace.id)}&workspaceView=item&saved=${encodeURIComponent(savedItem.id)}`, type: "saved", savedId: savedItem.id },
        sourceSignals: [sourceSignal("saved_research", "Local saved research", 1)], sources: [{ id: "edgeboard-local-workspace", label: "This device", sample: false }],
        freshness: { state: "local", lastUpdated: savedItem.updatedAt }, sampleMode: savedItem.sample === true, localOnly: true, personalized: true,
        validationStatus: "dataset_only", warnings: ["Local-only saved research; not public popularity."], drillDownDepth: 2,
      }, this)),
    ].filter((item) => this.inScope(item, context) || item.sportId === "multi-sport" || item.leagueId === "all");
    const deduped = [...new Map(items.map((item) => [[item.type, ...item.entityIds, item.title].join("|"), item])).values()]
      .map((item) => Object.freeze({ ...item, discoveryScore: scoreDiscoveryItem(item, context) }));
    return Object.freeze(deduped.sort((left, right) => right.discoveryScore - left.discoveryScore).slice(0, options.limit || DISCOVERY_LIMITS.continue).map((item) => this.buildDiscoveryViewModel(item, options)));
  }

  getRecentlyChanged(scope = {}, options = {}) {
    if (scope.liveOnly || scope.todayOnly) return Object.freeze([]);
    const context = this.context(scope, options);
    const items = this.changes.filter((change) => this.inScope(change, context))
      .filter((change) => change.significance >= (options.significanceThreshold ?? 1))
      .filter((change) => context.mode !== "stats" || change.changeType !== "line_movement")
      .map((change) => createDiscoveryItem({
        id: `discovery-${change.id}`, type: change.changeType.includes("streak") ? "streak" : change.changeType.includes("milestone") ? "milestone" : "research_topic",
        title: change.title, summary: `Changed from ${change.oldValue} to ${change.newValue}.`, label: "Recently changed in sample data",
        sportId: change.sportId, leagueId: change.leagueId, entityIds: change.entityIds, eventIds: change.eventIds, storyIds: change.storyIds, statIds: change.statIds, marketIds: context.mode === "stats" ? [] : change.marketIds,
        queryTemplate: { query: `What changed in ${change.title}?`, intent: "change", oldValue: change.oldValue, newValue: change.newValue },
        route: { href: routeFor({ changes: true, itemId: `discovery-${change.id}`, sportId: change.sportId, leagueId: change.leagueId }), type: "change", changeId: change.id },
        sourceSignals: [sourceSignal("meaningful_change", change.changeType, change.significance)], sources: [change.source], freshness: change.freshness, sampleMode: true,
        validationStatus: "dataset_only", warnings: change.warnings, change: { type: change.changeType, oldValue: change.oldValue, newValue: change.newValue, occurredAt: change.occurredAt }, drillDownDepth: 3,
      }, this))
      .filter((item) => validateDiscoveryItem(item, this).valid)
      .map((item) => Object.freeze({ ...item, discoveryScore: scoreDiscoveryItem(item, context) }));
    return Object.freeze(items.sort((left, right) => right.discoveryScore - left.discoveryScore).slice(0, options.limit || DISCOVERY_LIMITS.changes).map((item) => this.buildDiscoveryViewModel(item, options)));
  }

  getRelatedDiscovery(reference, options = {}) {
    const entityId = typeof reference === "string" ? reference : reference?.entityIds?.[0] || reference?.id;
    const entity = this.entityRegistry.getEntity(entityId);
    const story = reference?.storyIds?.[0] ? this.storyEngine.getStory(reference.storyIds[0]) : this.storyEngine.getStory(reference?.id);
    const sportId = entity?.sportId || story?.sportId || reference?.sportId;
    const leagueId = entity?.leagueId || story?.leagueId || reference?.leagueId;
    if (!sportId || !leagueId) return Object.freeze([]);
    const context = this.context({ sportIds: [sportId], leagueIds: [leagueId] }, options);
    const relatedIds = entity ? this.entityRegistry.getRelatedEntities(entity).map((item) => item.id) : story?.entityIds || [];
    const candidates = [
      ...relatedIds.map((id) => this.entityRegistry.getEntity(id)).filter((item) => item?.leagueId === leagueId).map((item) => this.entityItem(item, context)),
      ...this.generate({ sportIds: [sportId], leagueIds: [leagueId] }, options).filter((item) =>
        item.id !== reference?.id && (item.entityIds.some((id) => id === entityId || relatedIds.includes(id))
          || (story && item.statIds.some((id) => story.statIds.includes(id))))),
    ];
    return Object.freeze([...new Map(candidates.map((item) => [item.id, item])).values()].slice(0, options.limit || DISCOVERY_LIMITS.related).map((item) => this.buildDiscoveryViewModel(item, options)));
  }

  getDiscoveryForEntity(entityId, options = {}) { return this.getRelatedDiscovery(entityId, options); }
  getDiscoveryForStory(storyId, options = {}) { return this.getRelatedDiscovery(this.storyEngine.getStory(storyId), options); }
  getDiscoveryForEvent(eventId, options = {}) {
    const story = this.storyEngine.getStoriesForEvent(eventId, { limit: 1 })[0];
    return story ? this.getRelatedDiscovery(story, options) : Object.freeze([]);
  }

  searchDiscovery(query, scope = {}, options = {}) {
    const text = clean(query).toLowerCase();
    if (text.length < 2) return Object.freeze({ query: text, groups: Object.freeze([]), total: 0 });
    const context = this.context(scope, options);
    const direct = options.includeDirectMatches === false ? []
      : this.entityRegistry.search(text, { sportId: context.sportIds[0] || "", leagueId: context.leagueIds[0] || "" }, 6);
    const items = this.generate(scope, options).filter((item) => [item.title, item.summary, item.leagueId, ...item.statIds.map((id) => getStatDefinition(id)?.displayName || id)]
      .some((value) => clean(value).toLowerCase().includes(text)));
    const paths = this.getExplorationPaths(scope, { ...options, limit: 12 }).filter((path) => path.title.toLowerCase().includes(text) || path.steps.some((step) => step.label.toLowerCase().includes(text)));
    const workspaceState = options.workspaceState;
    const saved = (workspaceState?.savedObjects || []).filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(text)).slice(0, 4);
    const activeWorkspace = workspaceState?.workspaces?.find((item) => !item.isArchived);
    const workspacePreferences = workspaceState?.preferences?.find((item) => item.workspaceId === activeWorkspace?.id) || {};
    const privacyMode = workspaceState?.meta?.privacyMode === true || workspacePreferences.privacyMode === true;
    const recent = privacyMode ? [] : (workspaceState?.activity || []).filter((item) => `${item.label} ${item.queryText}`.toLowerCase().includes(text)).slice(-4).reverse();
    const group = (id, label, values) => Object.freeze({ id, label, items: Object.freeze(values) });
    const groups = [
      group("direct", "Direct Matches", direct),
      group("stories", "Stories", items.filter((item) => ["story", "streak", "milestone"].includes(item.type)).map((item) => this.buildDiscoveryViewModel(item, options))),
      group("statistics", "Statistics", STAT_REGISTRY.filter((stat) => [stat.displayName, stat.shortName, ...(stat.searchTerms || [])].some((value) => clean(value).toLowerCase().includes(text))).slice(0, 5).map((stat) => Object.freeze({ id: stat.id, title: stat.displayName, statIds: Object.freeze([stat.id]), query: `Explore ${stat.displayName}` }))),
      group("topics", "Research Topics", items.filter((item) => ["research_topic", "market_topic"].includes(item.type)).map((item) => this.buildDiscoveryViewModel(item, options))),
      group("paths", "Exploration Paths", paths),
      group("saved", "Saved Research", saved),
      group("recent", "Recently Viewed", recent),
    ].filter((entry) => entry.items.length);
    return Object.freeze({ query: text, groups: Object.freeze(groups), total: groups.reduce((sum, entry) => sum + entry.items.length, 0) });
  }

  getDiscoverySuggestionsForQuery(query, scope = {}, options = {}) { return this.searchDiscovery(query, scope, options); }

  buildDiscoveryViewModel(item, options = {}) {
    const validation = validateDiscoveryItem(item, this);
    const primary = item.resolvedEntities[0] || null;
    const status = item.validationStatus === "partial_coverage" ? "Partial coverage"
      : item.freshness.state === "stale" ? "Delayed"
        : item.sampleMode ? "Sample data" : item.localOnly ? "Local only" : "Strong supporting data";
    const whyNotable = unique(item.sourceSignals.map((signal) => clean(signal.label))).slice(0, 2).join("; ")
      || "Available structured evidence supports this research path.";
    return Object.freeze({
      id: item.id, type: item.type, title: item.title, summary: item.summary, label: item.label,
      sportId: item.sportId, leagueId: item.leagueId, entityIds: item.entityIds, eventIds: item.eventIds, storyIds: item.storyIds, statIds: item.statIds, marketIds: item.marketIds,
      route: item.route, queryTemplate: item.queryTemplate, discoveryScore: item.discoveryScore,
      edgeTrust: item.edgeTrust, researchQuality: item.researchQuality, freshness: item.freshness,
      sourceLabel: item.sources.map((source) => source.label).join(" + "), sampleMode: item.sampleMode,
      localOnly: item.localOnly, personalized: item.personalized, status, warnings: validation.warnings,
      valid: validation.valid, primaryEntity: primary, change: item.change, whyNotable,
      actions: Object.freeze([
        item.route?.href ? Object.freeze({ type: "route", label: item.type === "exploration_path" ? "Open path" : "Explore", href: item.route.href }) : null,
        item.queryTemplate?.query ? Object.freeze({ type: "research", label: "Research with Edge Intelligence", query: item.queryTemplate.query, context: Object.freeze({
          itemId: item.id, type: item.type, title: item.title,
          entityIds: item.entityIds, eventIds: item.eventIds, storyIds: item.storyIds,
          statIds: item.statIds, marketIds: item.marketIds, sportId: item.sportId, leagueId: item.leagueId,
          queryTemplate: item.queryTemplate, sourceSignals: item.sourceSignals, sources: item.sources,
          freshness: item.freshness, validationStatus: item.validationStatus,
          edgeTrust: item.edgeTrust, researchQuality: item.researchQuality, warnings: item.warnings,
        }) }) : null,
      ].filter(Boolean)),
    });
  }

  getItem(id) { return this.index.get(id) || null; }
  getPath(id) { return this.pathIndex.get(id) || null; }
  scoreDiscoveryItems(items, context = {}) { return Object.freeze(items.map((item) => Object.freeze({ ...item, discoveryScore: scoreDiscoveryItem(item, context) }))); }
  diversifyDiscoveryItems(items, limit, context) { return diversifyDiscoveryItems(items, limit, context); }
  clearCache(affected = {}) {
    if (!affected.leagueId && !affected.entityId && !affected.storyId) { this.cache.clear(); return; }
    [...this.cache.entries()].filter(([, items]) => items.some((item) =>
      (!affected.leagueId || item.leagueId === affected.leagueId)
      && (!affected.entityId || item.entityIds.includes(affected.entityId))
      && (!affected.storyId || item.storyIds.includes(affected.storyId))))
      .forEach(([key]) => this.cache.delete(key));
  }

  async getDiscoveryItemsAsync(scope = {}, options = {}) {
    const sequence = ++this.requestSequence;
    await Promise.resolve();
    if (options.signal?.aborted || sequence !== this.requestSequence) throw new DOMException("Discovery request superseded.", "AbortError");
    return this.generate(scope, options);
  }
}

export function createDiscoveryService(dependencies) { return new DeterministicDiscoveryService(dependencies); }
