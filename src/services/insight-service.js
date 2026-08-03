import {
  getEligibleInsightRules,
  getInsightRule,
  INSIGHT_DISPLAY_LIMITS,
  INSIGHT_RULES,
} from "../config/insight-rules.js";
import { getAthleteProfileConfig } from "../config/athlete-profile-config.js";
import { getStatDefinition } from "../config/stat-registry.js";
import {
  buildRarityContext,
  deduplicateInsights,
  evaluateInsightRule,
  phraseInsight,
  scoreInsightCandidate,
  validateRecordCandidate,
  validateInsightCandidate,
} from "./insight-engine.js";

const unique = (values) => [...new Set(values.filter(Boolean))];
const COMPATIBLE_INSIGHT_MARKETS = Object.freeze({
  "baseball-hits": Object.freeze(["baseball-hits", "baseball-total-bases"]),
  "combat-wins": Object.freeze(["mma-fight-winner", "boxing-fight-winner", "mma-method-of-victory", "boxing-method-of-victory"]),
  "combat-knockout-wins": Object.freeze(["mma-method-of-victory", "boxing-method-of-victory", "mma-win-by-ko-tko", "boxing-win-by-ko-tko"]),
  "combat-submission-wins": Object.freeze(["mma-method-of-victory", "mma-win-by-submission"]),
  "motorsport-average-finishing-position": Object.freeze(["motorsport-finishing-position", "motorsport-top-5", "motorsport-top-10"]),
  "motorsport-podiums": Object.freeze(["motorsport-podium", "motorsport-top-3"]),
  "motorsport-points": Object.freeze(["motorsport-points-finish"]),
});

function isCompatibleInsightMarket(statIds, canonicalMarketId) {
  return statIds.some((statId) =>
    statId === canonicalMarketId
    || COMPATIBLE_INSIGHT_MARKETS[statId]?.includes(canonicalMarketId));
}

function qualifiesEquivalentClaim(candidate, evaluated) {
  if (!evaluated || evaluated.type !== candidate.type) return false;
  if (candidate.type.includes("streak")) {
    return Number(evaluated.claimData.streakLength) >= Number(candidate.claimData.streakLength)
      && (!candidate.claimData.active || evaluated.claimData.active === true);
  }
  if (["recent_high", "season_high", "record_candidate"].includes(candidate.type)) {
    const candidateValue = Number(candidate.claimData.value);
    const evaluatedValue = Number(evaluated.claimData.value);
    if (!Number.isFinite(candidateValue) || !Number.isFinite(evaluatedValue)) return false;
    return candidate.claimData.extreme === "best-lower-value"
      ? evaluatedValue <= candidateValue
      : evaluatedValue >= candidateValue;
  }
  if (candidate.type.startsWith("milestone")) {
    return evaluated.claimData.target === candidate.claimData.target
      && Number(evaluated.claimData.currentValue) >= Number(candidate.claimData.currentValue);
  }
  if (["improvement_trend", "decline_trend"].includes(candidate.type)) {
    return Math.abs(Number(evaluated.claimData.percentDifference))
      >= Math.abs(Number(candidate.claimData.percentDifference));
  }
  if (candidate.type === "home_away_difference") {
    return Math.abs(Number(evaluated.claimData.difference))
      >= Math.abs(Number(candidate.claimData.difference));
  }
  if (candidate.type === "consistency_insight") {
    return Number(evaluated.claimData.coefficientOfVariation)
      <= Number(candidate.claimData.coefficientOfVariation);
  }
  return true;
}

function marketView(market, selection, entityId) {
  return Object.freeze({
    marketId: market.id,
    selectionId: selection.id,
    entityId,
    eventId: market.eventId,
    canonicalMarketId: market.canonicalMarketId,
    line: selection.line,
    odds: selection.odds,
    sportsbook: selection.sportsbook,
    updatedAt: selection.lastUpdatedAt,
    historicalHitRate: selection.hitRate,
    projection: selection.projection,
    projectedEdge: selection.trend,
    confidence: selection.confidence,
    period: market.period,
    settlementScope: market.settlementScope,
    available: market.available && selection.available && !selection.stale && market.status === "open",
    stale: selection.stale,
    label: "Related current market",
    warning: "Historical context is separate from projection, edge, confidence, and sportsbook odds. A streak does not prove a bet will win.",
  });
}

export class DeterministicInsightService {
  constructor(statsProvider, sportsRepository = null) {
    this.statsProvider = statsProvider;
    this.sportsRepository = sportsRepository;
    this.cache = new Map();
    this.candidateIndex = new Map();
  }

  cacheKey(prefix, value) {
    return `${prefix}:${value}:${this.statsProvider.updatedAt || "unknown"}`;
  }

  availableStats(entityId) {
    return unique(this.statsProvider.rows
      .filter((row) => row.entity_id === entityId && row.status === "completed")
      .flatMap((row) => Object.keys(row.stats || {})));
  }

  metadata() {
    const freshness = this.statsProvider.getDataFreshness?.() || {};
    return {
      source: this.statsProvider.name,
      lastUpdated: this.statsProvider.updatedAt,
      generatedAt: this.statsProvider.updatedAt,
      stale: freshness.stale === true,
      partial: freshness.partial === true,
    };
  }

  rulesForEntity(entity) {
    return getEligibleInsightRules({
      sportId: entity.sportId,
      leagueId: entity.leagueId,
      entityType: entity.entityType,
      availableStats: this.availableStats(entity.id),
    });
  }

  evaluateInsightRule(rule, entity, options = {}) {
    const scoped = this.statsProvider.rowsForEntity(entity.id, {
      dateRange: options.dateRange || { type: "season", value: "current" },
      homeAway: options.homeAway || "",
      gameResult: options.gameResult || "",
      competition: options.competition || "",
      seasonType: options.seasonType || "",
      starterStatus: options.starterStatus || "",
      opponentIds: options.opponentIds || [],
      trackType: options.trackType || "",
      period: options.period || "full-event",
    });
    const candidate = evaluateInsightRule(rule, {
      entity,
      rows: scoped.rows,
      statId: options.statId,
      metadata: this.metadata(),
    });
    if (!candidate) return null;
    const providerAssertion = this.statsProvider.payload?.provider_asserted_insights?.find((item) =>
      item.rule_id === rule.ruleId && item.entity_id === entity.id && item.stat_id === candidate.statIds[0]);
    const assertedStatus = providerAssertion?.validation_status === "provider_asserted"
      ? "provider_asserted"
      : null;
    const validationStatus = ["partial_coverage", "incomplete", "stale", "unsupported", "invalid"]
      .includes(candidate.validationStatus)
      ? candidate.validationStatus
      : assertedStatus || candidate.validationStatus;
    const enriched = {
      ...candidate,
      validationStatus,
      source: Object.freeze({
        ...candidate.source,
        attribution: assertedStatus ? providerAssertion.source || candidate.source.provider : candidate.source.provider,
      }),
      rulePriority: rule.priorityWeight,
      mutuallyExclusiveRules: rule.mutuallyExclusiveRules,
      warnings: Object.freeze([
        ...candidate.warnings,
        ...(candidate.validationStatus === "stale" ? ["Source data is stale; refresh before treating this as current."] : []),
        ...(assertedStatus ? [providerAssertion.disclosure || "Provider-asserted sample claim."] : []),
      ]),
    };
    const rarity = this.getRarityContext(enriched, rule, options);
    const bettingContext = options.includeBettingContext ? this.compatibleMarket(enriched) : null;
    const scored = {
      ...enriched,
      rarity: rarity || enriched.rarity,
      bettingContext,
    };
    scored.priorityScore = scoreInsightCandidate(scored, {
      query: options.query,
      leagueId: options.leagueId || entity.leagueId,
      bettingCompatible: Boolean(bettingContext?.available),
    });
    scored.phrasing = phraseInsight(scored);
    if (scored.type === "record_candidate") {
      scored.recordDiagnostic = validateRecordCandidate(scored);
      if (!scored.recordDiagnostic.displayEligible) return null;
    }
    scored.title = scored.phrasing.headline;
    scored.label = scored.phrasing.shortSummary;
    scored.calculatedClaimData = scored.claimData;
    scored.calculationMethod = scored.calculationRule;
    scored.comparisonPopulation = scored.rarity?.scope || `${entity.leagueId.toUpperCase()} available sample`;
    scored.dataCompletenessConfidence = scored.validationStatus;
    const validation = validateInsightCandidate(scored);
    if (!validation.valid) return null;
    const frozen = Object.freeze(scored);
    this.candidateIndex.set(frozen.id, frozen);
    return frozen;
  }

  candidateStats(entity, rule, preferredStatId = "") {
    if (rule.requiredStats.length) return [rule.requiredStats[0]];
    const config = getAthleteProfileConfig(entity);
    const available = new Set(this.availableStats(entity.id));
    return unique([
      preferredStatId,
      ...(config.primaryStats || []),
      ...available,
    ]).filter((id) => available.has(id)).slice(0, rule.wordingTemplateId === "milestone" ? 5 : 2);
  }

  generateEntityInsightCandidates(entity, options = {}) {
    if (!entity) return [];
    const cacheKey = this.cacheKey("entity", [
      entity.id,
      options.statId || "",
      options.includeBettingContext === true,
      options.query || "",
      options.dateRange ? JSON.stringify(options.dateRange) : "",
      options.homeAway || "",
      options.gameResult || "",
      options.competition || "",
      options.seasonType || "",
      options.starterStatus || "",
      JSON.stringify(options.opponentIds || []),
      options.trackType || "",
      options.period || "",
      options.limit || "",
    ].join(":"));
    if (!options.noCache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const candidates = this.rulesForEntity(entity).flatMap((rule) =>
      this.candidateStats(entity, rule, options.statId).flatMap((statId) => {
        const candidate = this.evaluateInsightRule(rule, entity, { ...options, statId });
        return candidate ? [candidate] : [];
      }));
    const selected = deduplicateInsights(candidates, options.limit || INSIGHT_DISPLAY_LIMITS.profileInsights);
    this.cache.set(cacheKey, selected);
    return selected;
  }

  generateAthleteInsightCandidates(athleteId, options = {}) {
    const entity = this.statsProvider.entities.find((item) => item.id === athleteId && item.entityType !== "team");
    return this.generateEntityInsightCandidates(entity, options);
  }

  generateTeamInsightCandidates(teamId, options = {}) {
    const entity = this.statsProvider.entities.find((item) => item.id === teamId && item.entityType === "team");
    return this.generateEntityInsightCandidates(entity, options);
  }

  generateLeagueInsightCandidates(leagueId, options = {}) {
    const entities = this.statsProvider.entities.filter((entity) =>
      entity.leagueId === leagueId && entity.active && (options.entityType ? entity.entityType === options.entityType : true));
    return deduplicateInsights(entities.flatMap((entity) =>
      this.generateEntityInsightCandidates(entity, { ...options, leagueId, limit: 3 })), options.limit || 8);
  }

  generateEventInsightCandidates(eventId, options = {}) {
    const entityIds = unique(this.statsProvider.rows.filter((row) => row.event_id === eventId).map((row) => row.entity_id));
    return deduplicateInsights(entityIds.flatMap((id) => {
      const entity = this.statsProvider.entities.find((item) => item.id === id);
      return this.generateEntityInsightCandidates(entity, { ...options, limit: 2 });
    }), options.limit || INSIGHT_DISPLAY_LIMITS.event);
  }

  getRarityContext(candidate, rule = getInsightRule(candidate.ruleId), options = {}) {
    if (!candidate || !rule || !candidate.claimData) return null;
    const pool = this.statsProvider.getComparisonPool({
      sportId: candidate.sportId,
      leagueId: candidate.leagueId,
      entityType: candidate.entityType === "team" ? "team" : candidate.entity.entityType,
    });
    const qualifying = pool.flatMap((entity) => {
      const evaluated = evaluateInsightRule(rule, {
        entity,
        rows: this.statsProvider.rowsForEntity(entity.id, {
          dateRange: options.dateRange || { type: "season", value: "current" },
          homeAway: options.homeAway || "",
          gameResult: options.gameResult || "",
          competition: options.competition || "",
          seasonType: options.seasonType || "",
          starterStatus: options.starterStatus || "",
          opponentIds: options.opponentIds || [],
          trackType: options.trackType || "",
          period: options.period || "full-event",
        }).rows,
        statId: candidate.statIds[0],
        metadata: this.metadata(),
      });
      return qualifiesEquivalentClaim(candidate, evaluated) ? [evaluated] : [];
    });
    return buildRarityContext({
      comparisonPoolSize: pool.length,
      qualifyingEntityCount: qualifying.length,
      qualifyingEventCount: qualifying.reduce((count, evaluated) =>
        count + evaluated.supportingEventIds.length, 0),
      scope: `${candidate.scope.season || "Available"} ${candidate.leagueId.toUpperCase()} qualified sample`,
      complete: false,
    });
  }

  compatibleMarket(candidate) {
    if (!this.sportsRepository || candidate.entityType === "team") return null;
    const upcomingEventId = candidate.entity.profile?.nextEvent?.id || "";
    if (!upcomingEventId) return null;
    const matches = this.statsProvider.getAthleteMarkets(candidate.entity.id, this.sportsRepository)
      .filter(({ market }) =>
        isCompatibleInsightMarket(candidate.statIds, market.canonicalMarketId)
        && market.period === "full-event"
        && market.eventId === upcomingEventId);
    const fresh = matches.find(({ market, selection }) =>
      market.available && selection.available && !selection.stale && market.status === "open");
    return fresh ? marketView(fresh.market, fresh.selection, candidate.entity.id) : null;
  }

  validateInsightCandidate(candidate) {
    return validateInsightCandidate(candidate);
  }

  scoreInsightCandidate(candidate, context = {}) {
    return scoreInsightCandidate(candidate, context);
  }

  deduplicateInsights(candidates, limit) {
    return deduplicateInsights(candidates, limit);
  }

  phraseInsight(candidate) {
    return phraseInsight(candidate);
  }

  getInsightSupportingData(insightId) {
    const candidate = this.candidateIndex.get(insightId);
    if (!candidate) return null;
    const rowIds = new Set(candidate.supportingRowIds);
    return Object.freeze({
      insightId,
      structuredClaim: candidate.claimData,
      calculationRule: candidate.calculationRule,
      eventRows: Object.freeze(this.statsProvider.rows.filter((row) => rowIds.has(row.row_id))),
      dateRange: candidate.scope.dateRange,
      sampleSize: candidate.sampleSize,
      comparisonPool: candidate.rarity,
      qualificationRules: getInsightRule(candidate.ruleId)?.thresholdConfiguration || {},
      source: candidate.source,
      lastUpdated: candidate.freshness.lastUpdated,
      coverage: candidate.coverage,
      validationStatus: candidate.validationStatus,
      warnings: candidate.warnings,
      whySelected: candidate.selectionReason,
    });
  }

  getInsight(insightId) {
    return this.candidateIndex.get(insightId) || null;
  }

  getActiveStreaks(scope = {}) {
    return this.getFeaturedInsights({ ...scope, types: ["threshold_streak", "assist_streak", "shot_streak", "hit_streak", "point_streak", "finish_streak", "top_finish_streak", "win_streak"] });
  }

  getMilestoneProgress(entityId, options = {}) {
    const entity = this.statsProvider.entities.find((item) => item.id === entityId && item.entityType !== "team");
    const rule = getInsightRule("available-data-milestone");
    if (!entity || !rule || !this.rulesForEntity(entity).some((item) => item.ruleId === rule.ruleId)) return [];
    const candidates = this.candidateStats(entity, rule, options.statId).flatMap((statId) => {
      const candidate = this.evaluateInsightRule(rule, entity, { ...options, statId });
      return candidate ? [candidate] : [];
    });
    return deduplicateInsights(candidates, options.limit || INSIGHT_DISPLAY_LIMITS.profileInsights);
  }

  getTrendCandidates(entityId, options = {}) {
    return this.generateAthleteInsightCandidates(entityId, options)
      .filter((candidate) => candidate.type.endsWith("_trend") || candidate.type === "home_away_difference");
  }

  getRecordCandidates(entityId, options = {}) {
    return this.generateAthleteInsightCandidates(entityId, options)
      .filter((candidate) => ["record_candidate", "season_high", "career_high_available"].includes(candidate.type));
  }

  validateRecordCandidate(candidate) {
    return validateRecordCandidate(candidate);
  }

  getFeaturedInsights({
    leagueIds = [],
    sportIds = [],
    types = [],
    limit = INSIGHT_DISPLAY_LIMITS.home,
    includeBettingContext = false,
    dateRange = null,
  } = {}) {
    const leagues = new Set(leagueIds);
    const sports = new Set(sportIds);
    const entities = this.statsProvider.entities.filter((entity) =>
      entity.active
      && (leagues.size ? leagues.has(entity.leagueId) : true)
      && (sports.size ? sports.has(entity.sportId) : true));
    const candidates = entities.slice(0, 18).flatMap((entity) =>
      this.generateEntityInsightCandidates(entity, {
        limit: 2,
        includeBettingContext,
        ...(dateRange ? { dateRange } : {}),
      }));
    return deduplicateInsights(
      types.length ? candidates.filter((candidate) => types.includes(candidate.type)) : candidates,
      limit,
    );
  }

  getInsightsForQuery(parsed, options = {}) {
    const query = parsed?.structuredQuery || {};
    const ids = query.primaryEntityIds?.length
      ? query.primaryEntityIds
      : this.statsProvider.entities
        .filter((entity) => (!query.leagueId || entity.leagueId === query.leagueId) && entity.active)
        .map((entity) => entity.id);
    const candidates = ids.slice(0, 20).flatMap((id) => {
      const entity = this.statsProvider.entities.find((item) => item.id === id);
      return this.generateEntityInsightCandidates(entity, {
        ...options,
        statId: query.statIds?.[0],
        query: options.query,
        leagueId: query.leagueId,
        includeBettingContext: query.includeBettingContext,
        dateRange: query.dateRange,
        homeAway: query.homeAway,
        gameResult: query.gameResult,
        competition: query.competition,
        seasonType: query.seasonType,
        limit: 4,
      });
    });
    const intentFilters = {
      active_streak: (candidate) => candidate.type.includes("streak") && candidate.claimData.active,
      milestone_lookup: (candidate) => candidate.type.startsWith("milestone"),
      milestone_proximity: (candidate) => candidate.type === "milestone_proximity",
      rarity_search: (candidate) => candidate.rarity?.occurrenceRate !== undefined,
      trend_explanation: (candidate) => candidate.type.endsWith("_trend") || candidate.type === "home_away_difference",
      season_high: (candidate) => ["season_high", "recent_high"].includes(candidate.type),
      available_career_high: (candidate) => ["record_candidate", "season_high"].includes(candidate.type),
      record_candidate: (candidate) => candidate.type === "record_candidate",
      mixed_insight_betting: (candidate) => Boolean(candidate.bettingContext),
    };
    const filtered = intentFilters[query.intent] ? candidates.filter(intentFilters[query.intent]) : candidates;
    return deduplicateInsights(filtered, query.resultLimit || INSIGHT_DISPLAY_LIMITS.queryResult);
  }

  getInsightsForProfile(athleteId, options = {}) {
    return this.generateAthleteInsightCandidates(athleteId, {
      ...options,
      limit: options.limit || INSIGHT_DISPLAY_LIMITS.profileInsights,
    });
  }

  getInsightsForEvent(eventId, options = {}) {
    return this.generateEventInsightCandidates(eventId, options);
  }

  clearCache() {
    this.cache.clear();
    this.candidateIndex.clear();
  }

  reconcileSavedInsight(savedInsight) {
    const exact = this.candidateIndex.get(savedInsight?.id);
    const savedEntities = Array.isArray(savedInsight?.entityIds) ? savedInsight.entityIds : [];
    const savedStats = Array.isArray(savedInsight?.statIds) ? savedInsight.statIds : [];
    const current = exact || [...this.candidateIndex.values()].find((candidate) =>
      candidate.ruleId === savedInsight?.ruleId
      && candidate.entityIds.length === savedEntities.length
      && candidate.entityIds.every((id, index) => id === savedEntities[index])
      && (!savedStats.length
        || (candidate.statIds.length === savedStats.length
          && candidate.statIds.every((id, index) => id === savedStats[index]))));
    if (!current) return Object.freeze({ ...savedInsight, archived: true, changed: false, archiveReason: "The current provider did not regenerate this insight." });
    const changed = current.id !== savedInsight.id
      || JSON.stringify(savedInsight.structuredClaim) !== JSON.stringify(current.claimData);
    return Object.freeze({
      ...savedInsight,
      archived: ["stale", "invalid", "incomplete"].includes(current.validationStatus),
      changed,
      currentValidationStatus: current.validationStatus,
      currentClaim: current.claimData,
      archiveReason: current.validationStatus === "stale" ? "The regenerated insight is stale." : "",
    });
  }
}

export function createInsightService(statsProvider, sportsRepository) {
  return new DeterministicInsightService(statsProvider, sportsRepository);
}

export { INSIGHT_RULES };
