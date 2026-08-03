import { getAvailableStats, getStatDefinition } from "../config/stat-registry.js";
import { getQualificationDefaults } from "../config/comparison-presets.js";
import { mockStatsProviderPayload } from "../data/mock-stats-provider.js";
import { getAthleteProfileConfig } from "../config/athlete-profile-config.js";
import { createAthleteMediaViewModel } from "./athlete-media-service.js";
import { createInsightCandidates } from "./insight-candidate-service.js";
import {
  calculateAggregation,
  calculationMetadata,
  filterDateRange,
  filterRowsBySplit,
  prepareStatRows,
  statValueForRow,
  sortLeaderboard,
  thresholdHitCount,
} from "./stat-calculations.js";
import {
  getCanonicalEntity,
  searchCanonicalEntities,
} from "./entity-resolver.js";

export class HistoricalStatsProvider {
  searchEntities() { throw new Error("searchEntities must be implemented by a stats provider."); }
  getPlayerSummary() { throw new Error("getPlayerSummary must be implemented by a stats provider."); }
  getPlayerGameLogs() { throw new Error("getPlayerGameLogs must be implemented by a stats provider."); }
  getTeamSummary() { throw new Error("getTeamSummary must be implemented by a stats provider."); }
  getLeaderboard() { throw new Error("getLeaderboard must be implemented by a stats provider."); }
  compareEntities() { throw new Error("compareEntities must be implemented by a stats provider."); }
  getSplits() { throw new Error("getSplits must be implemented by a stats provider."); }
  getAvailableStats() { throw new Error("getAvailableStats must be implemented by a stats provider."); }
  getDataFreshness() { throw new Error("getDataFreshness must be implemented by a stats provider."); }
  getAthleteProfile() { throw new Error("getAthleteProfile must be implemented by a stats provider."); }
  getAthleteSeasonSummary() { throw new Error("getAthleteSeasonSummary must be implemented by a stats provider."); }
  getAthleteRecentForm() { throw new Error("getAthleteRecentForm must be implemented by a stats provider."); }
  getAthleteGameLogs() { throw new Error("getAthleteGameLogs must be implemented by a stats provider."); }
  getAthleteSplits() { throw new Error("getAthleteSplits must be implemented by a stats provider."); }
  getAthleteTrends() { throw new Error("getAthleteTrends must be implemented by a stats provider."); }
  getAthleteUpcomingEvent() { throw new Error("getAthleteUpcomingEvent must be implemented by a stats provider."); }
  getAthleteMatchupContext() { throw new Error("getAthleteMatchupContext must be implemented by a stats provider."); }
  getAthleteInsights() { throw new Error("getAthleteInsights must be implemented by a stats provider."); }
  getAthleteMarkets() { throw new Error("getAthleteMarkets must be implemented by a stats provider."); }
  searchAthletes() { throw new Error("searchAthletes must be implemented by a stats provider."); }
  compareAthletes() { throw new Error("compareAthletes must be implemented by a stats provider."); }
  compareTeams() { throw new Error("compareTeams must be implemented by a stats provider."); }
  compareEntityToCohort() { throw new Error("compareEntityToCohort must be implemented by a stats provider."); }
  getPlayerLeaderboard() { throw new Error("getPlayerLeaderboard must be implemented by a stats provider."); }
  getTeamLeaderboard() { throw new Error("getTeamLeaderboard must be implemented by a stats provider."); }
  getEventLeaderboard() { throw new Error("getEventLeaderboard must be implemented by a stats provider."); }
  getFilteredEntitySet() { throw new Error("getFilteredEntitySet must be implemented by a stats provider."); }
  getSingleEventHighs() { throw new Error("getSingleEventHighs must be implemented by a stats provider."); }
  getSeasonHighs() { throw new Error("getSeasonHighs must be implemented by a stats provider."); }
  getStreakLeaderboard() { throw new Error("getStreakLeaderboard must be implemented by a stats provider."); }
  getThresholdLeaderboard() { throw new Error("getThresholdLeaderboard must be implemented by a stats provider."); }
  getHeadToHeadHistory() { throw new Error("getHeadToHeadHistory must be implemented by a stats provider."); }
  searchHistoricalEvents() { throw new Error("searchHistoricalEvents must be implemented by a stats provider."); }
  getRecordCandidate() { throw new Error("getRecordCandidate must be implemented by a stats provider."); }
  validateRecordScope() { throw new Error("validateRecordScope must be implemented by a stats provider."); }
  getComparisonPool() { throw new Error("getComparisonPool must be implemented by a stats provider."); }
  getQualificationRules() { throw new Error("getQualificationRules must be implemented by a stats provider."); }
  getAvailableLeaderboardStats() { throw new Error("getAvailableLeaderboardStats must be implemented by a stats provider."); }
}

function normalizeFilters(filters = {}) {
  return {
    dateRange: filters.dateRange || { type: "career" },
    homeAway: filters.homeAway || "",
    starterStatus: filters.starterStatus || "",
    gameResult: filters.gameResult || "",
    opponentIds: Array.isArray(filters.opponentIds) ? filters.opponentIds : [],
    season: filters.season || "",
    seasonType: filters.seasonType || "",
    competition: filters.competition || "",
    competitionStage: filters.competitionStage || "",
    venueType: filters.venueType || "",
    surfaceType: filters.surfaceType || "",
    trackType: filters.trackType || "",
    period: filters.period || "full-event",
    minimumMinutes: filters.minimumMinutes !== null
      && filters.minimumMinutes !== undefined
      && filters.minimumMinutes !== ""
      && Number.isFinite(Number(filters.minimumMinutes))
      ? Number(filters.minimumMinutes)
      : null,
  };
}

function profileAggregation(sportId, statId) {
  if (["basketball", "american-football"].includes(sportId)) return "average";
  if (
    statId.includes("percentage")
    || statId.includes("rate")
    || statId.includes("average")
    || statId.endsWith("-era")
    || statId.endsWith("-whip")
  ) return "average";
  return "sum";
}

export class MockHistoricalStatsProvider extends HistoricalStatsProvider {
  constructor(payload = mockStatsProviderPayload) {
    super();
    this.name = payload.provider || "edgeboard-mock-historical";
    this.mode = "sample";
    this.payload = payload;
    this.entities = Array.isArray(payload.entities) ? payload.entities : [];
    this.rows = Array.isArray(payload.rows) ? payload.rows : [];
    this.updatedAt = payload.generated_at || null;
    this.disclaimer = payload.disclaimer || "Sample historical statistics.";
    this.partial = payload.partial === true || payload.data_quality === "partial";
  }

  searchEntities(query, context = {}) {
    return searchCanonicalEntities(query, context, this.entities).map((match) => ({
      ...match.entity,
      matchScore: match.score,
      source: this.name,
    }));
  }

  rowsForEntity(entityId, filters = {}) {
    const normalized = normalizeFilters(filters);
    const prepared = prepareStatRows(this.rows.filter((row) => row.entity_id === entityId));
    const splitRows = filterRowsBySplit(prepared.rows, normalized);
    const scoped = filterDateRange(splitRows, normalized.dateRange, filters.now || new Date());
    return { rows: scoped, warnings: prepared.warnings, filters: normalized };
  }

  getPlayerSummary(playerId, filters = {}) {
    const entity = getCanonicalEntity(playerId, this.entities);
    const scoped = this.rowsForEntity(playerId, filters);
    const statIds = Array.isArray(filters.statIds) && filters.statIds.length
      ? filters.statIds
      : getAvailableStats(entity?.sportId || "", entity?.leagueId || "").slice(0, 5).map((stat) => stat.id);
    const aggregation = filters.aggregation || "average";
    return {
      entity,
      rows: scoped.rows,
      stats: Object.fromEntries(statIds.map((statId) => [statId, calculateAggregation(scoped.rows, statId, aggregation)])),
      aggregation,
      metadata: calculationMetadata({
        rows: scoped.rows,
        requestedGames: scoped.filters.dateRange.type === "last_n_games" ? scoped.filters.dateRange.value : null,
        warnings: scoped.warnings,
        source: this.name,
        updatedAt: this.updatedAt,
      }),
    };
  }

  getPlayerGameLogs(playerId, filters = {}) {
    const scoped = this.rowsForEntity(playerId, filters);
    return {
      entity: getCanonicalEntity(playerId, this.entities),
      rows: [...scoped.rows].sort((a, b) => new Date(b.event_date) - new Date(a.event_date)),
      metadata: calculationMetadata({
        rows: scoped.rows,
        requestedGames: scoped.filters.dateRange.type === "last_n_games" ? scoped.filters.dateRange.value : null,
        warnings: scoped.warnings,
        source: this.name,
        updatedAt: this.updatedAt,
      }),
    };
  }

  getTeamSummary(teamId, filters = {}) {
    const team = getCanonicalEntity(teamId, this.entities);
    const memberIds = this.entities.filter((entity) => entity.teamId === teamId && entity.entityType !== "team").map((entity) => entity.id);
    const directRows = this.rows.filter((row) => row.entity_id === teamId);
    const rows = directRows.length ? directRows : this.rows.filter((row) => memberIds.includes(row.entity_id));
    const prepared = prepareStatRows(rows);
    const normalized = normalizeFilters(filters);
    const splitRows = filterRowsBySplit(prepared.rows, normalized);
    const scoped = filterDateRange(splitRows, normalized.dateRange, filters.now || new Date());
    const statIds = filters.statIds || [];
    return {
      entity: team,
      rows: scoped,
      stats: Object.fromEntries(statIds.map((statId) => [statId, calculateAggregation(scoped, statId, filters.aggregation || "average")])),
      metadata: calculationMetadata({ rows: scoped, warnings: prepared.warnings, source: this.name, updatedAt: this.updatedAt }),
    };
  }

  getLeaderboard(statId, filters = {}) {
    return this.getPlayerLeaderboard(statId, filters);
  }

  compareEntities(entityIds, statIds, filters = {}) {
    return {
      entities: entityIds.map((id) => filters.entityType === "team"
        ? this.getTeamSummary(id, { ...filters, statIds })
        : this.getPlayerSummary(id, { ...filters, statIds })),
      statIds,
      metadata: {
        source: this.name,
        lastUpdated: this.updatedAt,
        dataFreshness: "sample-snapshot",
      },
    };
  }

  getComparisonPool(filters = {}) {
    const entityType = filters.entityType || "player";
    return this.entities.filter((entity) => {
      const isTeam = entity.entityType === "team";
      if (entityType === "team" ? !isTeam : isTeam) return false;
      if (filters.sportId && entity.sportId !== filters.sportId) return false;
      if (filters.leagueId && entity.leagueId !== filters.leagueId) return false;
      if (filters.role) {
        const role = String(entity.profile?.role || entity.position || "").toLowerCase();
        if (!role.includes(String(filters.role).toLowerCase())) return false;
      }
      return true;
    });
  }

  getQualificationRules(statId, filters = {}) {
    const sportId = filters.sportId || getStatDefinition(statId)?.sportIds?.[0] || "";
    const defaults = getQualificationDefaults(sportId);
    const isBaseballPitching = sportId === "baseball"
      && /\b(?:pitcher|innings|era|whip|earned-runs|walks-allowed|hits-allowed|strikeouts-per-nine)\b/.test(statId);
    const isFootballPassing = sportId === "american-football" && statId.includes("passing");
    return {
      minimumGames: Number(filters.minimumGames ?? defaults.minimumGames ?? 1),
      minimumAttempts: Number(filters.minimumAttempts ?? (isFootballPassing ? defaults.minimumAttempts : 0) ?? 0),
      minimumMinutes: Number(filters.minimumMinutes ?? defaults.minimumMinutes ?? 0),
      minimumPlateAppearances: Number(filters.minimumPlateAppearances
        ?? (sportId === "baseball" && !isBaseballPitching ? defaults.minimumPlateAppearances : 0) ?? 0),
      minimumInnings: Number(filters.minimumInnings
        ?? (isBaseballPitching ? defaults.minimumInnings : 0) ?? 0),
      minimumFights: Number(filters.minimumFights ?? defaults.minimumFights ?? 0),
      minimumRounds: Number(filters.minimumRounds ?? defaults.minimumRounds ?? 0),
      minimumStarts: Number(filters.minimumStarts ?? defaults.minimumStarts ?? 0),
    };
  }

  qualificationForSummary(summary, rules) {
    const total = (statId) => calculateAggregation(summary.rows, statId, "sum").value || 0;
    const checks = {
      minimumGames: summary.rows.length,
      minimumAttempts: total("football-passing-attempts"),
      minimumMinutes: total("basketball-minutes") || total("soccer-minutes"),
      minimumPlateAppearances: total("baseball-plate-appearances") || total("baseball-at-bats"),
      minimumInnings: total("baseball-innings-pitched"),
      minimumFights: summary.rows.length,
      minimumRounds: summary.rows.reduce((sum, row) => sum + (Number(row.round) || 0), 0),
      minimumStarts: total("motorsport-starts") || summary.rows.length,
    };
    const failures = Object.entries(rules)
      .filter(([, required]) => required > 0)
      .filter(([key, required]) => (checks[key] || 0) < required)
      .map(([key, required]) => `${key} ${checks[key] || 0}/${required}`);
    return { qualified: failures.length === 0, failures, observed: checks };
  }

  rankedEntries(entries, statId, filters = {}) {
    const definition = getStatDefinition(statId);
    const direction = filters.sortDirection
      || filters.sort?.direction
      || (definition?.higherIsBetter === false ? "asc" : "desc");
    const tieBreakers = Array.isArray(filters.tieBreakerMetrics) ? filters.tieBreakerMetrics : [];
    const sorted = [...entries].sort((left, right) => {
      const multiplier = direction === "asc" ? 1 : -1;
      const primary = (Number(left.value) - Number(right.value)) * multiplier;
      if (primary) return primary;
      for (const tieId of tieBreakers) {
        const tieDirection = getStatDefinition(tieId)?.higherIsBetter === false ? 1 : -1;
        const difference = (Number(left.secondaryValues?.[tieId]) - Number(right.secondaryValues?.[tieId])) * tieDirection;
        if (difference) return difference;
      }
      return left.entity.id.localeCompare(right.entity.id);
    });
    let priorValue = null;
    let priorRank = 0;
    return sorted.map((entry, index) => {
      const rank = index > 0 && Number(entry.value) === priorValue ? priorRank : index + 1;
      priorValue = Number(entry.value);
      priorRank = rank;
      const percentile = sorted.length < 2 ? null : Number((((sorted.length - rank) / (sorted.length - 1)) * 100).toFixed(1));
      return { ...entry, rank, percentile, comparisonPoolSize: sorted.length };
    });
  }

  getPlayerLeaderboard(statId, filters = {}) {
    const rules = this.getQualificationRules(statId, filters);
    const candidates = this.getComparisonPool({ ...filters, entityType: filters.entityType === "competitor" ? "competitor" : "player" });
    const aggregation = filters.aggregation || (getStatDefinition(statId)?.unit === "rate" ? "average" : "average");
    const entries = candidates.flatMap((entity) => {
      const summary = this.getPlayerSummary(entity.id, {
        ...filters,
        minimumMinutes: null,
        statIds: [statId, ...(filters.tieBreakerMetrics || [])],
        aggregation,
      });
      const value = summary.stats[statId]?.value;
      const qualification = this.qualificationForSummary(summary, rules);
      if (value === null || !qualification.qualified) return [];
      return [{
        entity,
        value,
        sampleSize: summary.stats[statId]?.sampleSize || 0,
        rows: summary.rows,
        qualification,
        secondaryValues: Object.fromEntries((filters.tieBreakerMetrics || []).map((id) => [id, summary.stats[id]?.value ?? null])),
      }];
    });
    const ranked = this.rankedEntries(entries, statId, filters);
    const offset = Math.max(0, Number(filters.offset) || 0);
    const limit = Math.min(100, Math.max(1, Number(filters.resultLimit || filters.limit) || 10));
    return {
      statId,
      entries: ranked.slice(offset, offset + limit),
      totalQualified: ranked.length,
      offset,
      limit,
      hasMore: offset + limit < ranked.length,
      qualificationRules: rules,
      tieStrategy: "shared competition rank; canonical entity ID is the stable display-order fallback",
      percentileMethod: "(qualified pool size - shared rank) / (qualified pool size - 1) × 100",
      metadata: {
        source: this.name,
        lastUpdated: this.updatedAt,
        dataFreshness: "sample-snapshot",
        calculationWarnings: ranked.length < 3 ? ["The qualified comparison pool is too small for a robust percentile."] : [],
      },
    };
  }

  getTeamLeaderboard(statId, filters = {}) {
    const candidates = this.getComparisonPool({ ...filters, entityType: "team" });
    const rules = this.getQualificationRules(statId, { ...filters, minimumGames: filters.minimumGames ?? 1 });
    const entries = candidates.flatMap((entity) => {
      const summary = this.getTeamSummary(entity.id, {
        ...filters, minimumMinutes: null, statIds: [statId], aggregation: filters.aggregation || "average",
      });
      const value = summary.stats[statId]?.value;
      const qualification = this.qualificationForSummary(summary, rules);
      return value === null || !qualification.qualified ? [] : [{
        entity, value, sampleSize: summary.stats[statId]?.sampleSize || 0, rows: summary.rows, qualification, secondaryValues: {},
      }];
    });
    const ranked = this.rankedEntries(entries, statId, filters);
    const limit = Math.min(100, Math.max(1, Number(filters.resultLimit || filters.limit) || 10));
    return {
      statId, entries: ranked.slice(0, limit), totalQualified: ranked.length, offset: 0, limit,
      hasMore: ranked.length > limit, qualificationRules: rules,
      tieStrategy: "shared competition rank; canonical entity ID is the stable display-order fallback",
      percentileMethod: "(qualified pool size - shared rank) / (qualified pool size - 1) × 100",
      metadata: { source: this.name, lastUpdated: this.updatedAt, dataFreshness: "sample-snapshot", calculationWarnings: [] },
    };
  }

  compareAthletes(entityIds, statIds, filters = {}) {
    return this.compareAdvanced(entityIds, statIds, { ...filters, entityType: "player" });
  }

  compareTeams(entityIds, statIds, filters = {}) {
    return this.compareAdvanced(entityIds, statIds, { ...filters, entityType: "team" });
  }

  compareAdvanced(entityIds, statIds, filters = {}) {
    const summaries = entityIds.map((id) => filters.entityType === "team"
      ? this.getTeamSummary(id, { ...filters, statIds })
      : this.getPlayerSummary(id, { ...filters, statIds }));
    const stats = Object.fromEntries(statIds.map((statId) => {
      const values = summaries.map((summary) => summary.stats[statId]?.value).filter((value) => value !== null);
      const baseline = values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
      return [statId, summaries.map((summary) => {
        const calculation = summary.stats[statId];
        const value = calculation?.value ?? null;
        const rowValues = calculation?.values || [];
        const mean = rowValues.length ? rowValues.reduce((sum, item) => sum + item, 0) / rowValues.length : null;
        const variance = mean === null ? null : rowValues.reduce((sum, item) => sum + ((item - mean) ** 2), 0) / rowValues.length;
        const difference = value !== null && baseline !== null ? value - baseline : null;
        return {
          entityId: summary.entity?.id || "",
          value,
          sampleSize: calculation?.sampleSize || 0,
          missingCount: calculation?.missingCount || 0,
          baseline,
          difference,
          percentDifference: difference !== null && baseline !== 0 ? (difference / Math.abs(baseline)) * 100 : null,
          variance,
          consistency: variance === null ? null : 1 / (1 + Math.sqrt(variance)),
          supportingRows: summary.rows,
        };
      })];
    }));
    return {
      entities: summaries.map((summary) => summary.entity).filter(Boolean),
      summaries,
      statIds,
      stats,
      metadata: { source: this.name, lastUpdated: this.updatedAt, dataFreshness: "sample-snapshot" },
      warnings: summaries.some((summary) => !summary.rows.length) ? ["At least one entity has no matching completed rows."] : [],
    };
  }

  compareEntityToCohort(entityId, statIds, filters = {}) {
    const entity = getCanonicalEntity(entityId, this.entities);
    const pool = this.getComparisonPool({
      ...filters,
      entityType: entity?.entityType === "team" ? "team" : "player",
      sportId: entity?.sportId,
      leagueId: entity?.leagueId,
      role: filters.role || "",
    });
    const comparison = this.compareAdvanced(pool.map((item) => item.id), statIds, filters);
    return { ...comparison, primaryEntityId: entityId, cohortDefinition: filters.role ? `Role: ${filters.role}` : `${entity?.leagueId || ""} eligible entities` };
  }

  getFilteredEntitySet(conditions = [], filters = {}) {
    const pool = this.getComparisonPool(filters);
    const logic = filters.conditionLogic === "or" ? "or" : "and";
    const rows = pool.map((entity) => {
      const statIds = [...new Set(conditions.map((condition) => condition.statId))];
      const summary = entity.entityType === "team"
        ? this.getTeamSummary(entity.id, { ...filters, statIds })
        : this.getPlayerSummary(entity.id, { ...filters, statIds });
      const evaluations = conditions.map((condition) => {
        const value = summary.stats[condition.statId]?.value ?? null;
        const target = Number(condition.value);
        const upper = Number(condition.maxValue);
        const matches = value !== null && ({
          gt: value > target, gte: value >= target, lt: value < target, lte: value <= target,
          eq: value === target, between: value >= target && value <= upper,
        }[condition.operator] ?? false);
        return { ...condition, value, matches };
      });
      const qualified = evaluations.length > 0 && (logic === "or"
        ? evaluations.some((item) => item.matches)
        : evaluations.every((item) => item.matches));
      return { entity, qualified, evaluations, sampleSize: summary.metadata.sampleSize, rows: summary.rows };
    });
    return {
      conditions, conditionLogic: logic, entries: rows.filter((entry) => entry.qualified),
      nearMatches: filters.includeNearMatches ? rows.filter((entry) => !entry.qualified).slice(0, 3) : [],
      metadata: { source: this.name, lastUpdated: this.updatedAt, dataFreshness: "sample-snapshot" },
    };
  }

  getEventLeaderboard(statId, filters = {}) {
    const prepared = prepareStatRows(this.rows.filter((row) =>
      (!filters.leagueId || row.league_id === filters.leagueId)
      && (!filters.eventIds?.length || filters.eventIds.includes(row.event_id))));
    const splitRows = filterRowsBySplit(prepared.rows, normalizeFilters(filters));
    const scopedRows = filterDateRange(splitRows, filters.dateRange || { type: "career" }, filters.now || new Date());
    const entries = scopedRows.flatMap((row) => {
      const entity = getCanonicalEntity(row.entity_id, this.entities);
      const value = statValueForRow(row, statId);
      return entity && value !== null ? [{ entity, value, sampleSize: 1, rows: [row], secondaryValues: {}, eventId: row.event_id }] : [];
    });
    return {
      statId,
      entries: this.rankedEntries(entries, statId, filters).slice(0, filters.resultLimit || 10),
      totalQualified: entries.length,
      qualificationRules: { minimumGames: 1 },
      tieStrategy: "shared competition rank",
      percentileMethod: "(event field size - shared rank) / (event field size - 1) × 100",
      metadata: { source: this.name, lastUpdated: this.updatedAt, dataFreshness: "sample-snapshot", calculationWarnings: [] },
    };
  }

  getSingleEventHighs(statId, filters = {}) {
    return this.getEventLeaderboard(statId, { ...filters, resultLimit: filters.resultLimit || 10 });
  }

  getSeasonHighs(statId, filters = {}) {
    return this.getSingleEventHighs(statId, { ...filters, dateRange: { type: "season", value: filters.season || "current" } });
  }

  getStreakLeaderboard(statId, filters = {}) {
    const threshold = Number(filters.comparisonValue ?? 0);
    const rules = this.getQualificationRules(statId, filters);
    const entries = this.getComparisonPool(filters).flatMap((entity) => {
      const rows = this.rowsForEntity(entity.id, filters).rows.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
      const qualification = this.qualificationForSummary({ rows }, rules);
      if (!qualification.qualified) return [];
      let best = 0;
      let active = 0;
      let supportingRows = [];
      let bestRows = [];
      rows.forEach((row) => {
        const value = statValueForRow(row, statId);
        const hit = value !== null && (filters.comparisonOperator === "gt" ? value > threshold
          : filters.comparisonOperator === "lt" ? value < threshold
            : filters.comparisonOperator === "lte" ? value <= threshold : value >= threshold);
        if (hit) {
          active += 1;
          supportingRows.push(row);
          if (active > best) {
            best = active;
            bestRows = [...supportingRows];
          }
        } else {
          active = 0;
          supportingRows = [];
        }
      });
      return best ? [{ entity, value: best, sampleSize: rows.length, rows: bestRows, secondaryValues: {}, qualification }] : [];
    });
    const ranked = this.rankedEntries(entries, statId, { ...filters, sortDirection: "desc" });
    const limit = Math.min(100, Math.max(1, Number(filters.resultLimit || filters.limit) || 10));
    return {
      statId, entries: ranked.slice(0, limit),
      totalQualified: ranked.length, threshold, qualificationRules: rules,
      tieStrategy: "shared competition rank", percentileMethod: "rank percentile",
      metadata: { source: this.name, lastUpdated: this.updatedAt, dataFreshness: "sample-snapshot", calculationWarnings: [] },
    };
  }

  getThresholdLeaderboard(statId, filters = {}) {
    const rules = this.getQualificationRules(statId, filters);
    const entries = this.getComparisonPool(filters).flatMap((entity) => {
      const summary = this.getPlayerSummary(entity.id, { ...filters, statIds: [statId] });
      const qualification = this.qualificationForSummary(summary, rules);
      if (!qualification.qualified) return [];
      const threshold = thresholdHitCount(summary.rows, statId, filters.comparisonOperator || "gte", filters.comparisonValue);
      return threshold.sampleSize ? [{
        entity, value: threshold.hitRate, hitCount: threshold.hitCount, sampleSize: threshold.sampleSize,
        rows: summary.rows, secondaryValues: {}, qualification,
      }] : [];
    });
    const ranked = this.rankedEntries(entries, statId, { ...filters, sortDirection: "desc" });
    const limit = Math.min(100, Math.max(1, Number(filters.resultLimit || filters.limit) || 10));
    return {
      statId, entries: ranked.slice(0, limit),
      totalQualified: ranked.length, qualificationRules: rules,
      tieStrategy: "shared competition rank", percentileMethod: "rank percentile",
      metadata: { source: this.name, lastUpdated: this.updatedAt, dataFreshness: "sample-snapshot", calculationWarnings: [] },
    };
  }

  getHeadToHeadHistory(entityIds, filters = {}) {
    const [leftId, rightId] = entityIds;
    const left = getCanonicalEntity(leftId, this.entities);
    const right = getCanonicalEntity(rightId, this.entities);
    if (!left || !right) return { direct: [], commonOpponents: [], metadata: { source: this.name, lastUpdated: this.updatedAt } };
    const rightKeys = new Set([right.id, right.teamId, right.name].filter(Boolean));
    const leftKeys = new Set([left.id, left.teamId, left.name].filter(Boolean));
    const leftRows = this.rowsForEntity(left.id, filters).rows;
    const rightRows = this.rowsForEntity(right.id, filters).rows;
    const direct = [
      ...leftRows.filter((row) => rightKeys.has(row.opponent_id)),
      ...rightRows.filter((row) => leftKeys.has(row.opponent_id)),
    ];
    const leftOpponents = new Set(leftRows.map((row) => row.opponent_id).filter(Boolean));
    const common = [...new Set(rightRows.map((row) => row.opponent_id).filter((id) => leftOpponents.has(id)))];
    return {
      entities: [left, right],
      direct,
      commonOpponents: common.map((opponentId) => ({
        opponentId,
        leftRows: leftRows.filter((row) => row.opponent_id === opponentId),
        rightRows: rightRows.filter((row) => row.opponent_id === opponentId),
      })),
      warnings: direct.length ? [] : ["No direct prior meeting is present in the available sample rows."],
      metadata: { source: this.name, lastUpdated: this.updatedAt, dataFreshness: "sample-snapshot" },
    };
  }

  searchHistoricalEvents(filters = {}) {
    const prepared = prepareStatRows(this.rows.filter((row) =>
      (!filters.leagueId || row.league_id === filters.leagueId)
      && (!filters.competition || row.competition === filters.competition)
      && (!filters.homeAway || row.home_away === filters.homeAway)
      && (!filters.opponentIds?.length || filters.opponentIds.includes(row.opponent_id))
      && (!filters.eventIds?.length || filters.eventIds.includes(row.event_id))));
    const scoped = filterDateRange(prepared.rows, filters.dateRange || { type: "career" }, filters.now || new Date());
    const events = new Map();
    scoped.forEach((row) => {
      const event = events.get(row.event_id) || {
        eventId: row.event_id, date: row.event_date, competition: row.competition,
        venue: row.venue || "", eventName: row.event_name || row.event_id, rows: [],
      };
      event.rows.push({ ...row, entity: getCanonicalEntity(row.entity_id, this.entities) });
      events.set(row.event_id, event);
    });
    return {
      events: [...events.values()].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, filters.resultLimit || 25),
      metadata: { source: this.name, lastUpdated: this.updatedAt, dataFreshness: "sample-snapshot", warnings: prepared.warnings },
    };
  }

  getRecordCandidate(statId, filters = {}) {
    const board = this.getSingleEventHighs(statId, { ...filters, resultLimit: 1 });
    const candidate = board.entries[0] || null;
    return {
      statId,
      candidate,
      scope: filters.dateRange?.type === "season" ? "current-season available dataset" : "available provider dataset",
      validationStatus: "dataset_only",
      coverage: "Partial illustrative sample rows only",
      completenessWarning: "This result cannot verify an all-time, league, franchise, or world record.",
      metadata: board.metadata,
    };
  }

  validateRecordScope() {
    return {
      status: "dataset_only",
      verified: false,
      prohibitedLabels: ["all-time", "league record", "world record", "franchise record"],
      warning: "Provider coverage is incomplete; only dataset-scoped high claims are allowed.",
    };
  }

  getAvailableLeaderboardStats(sportId, leagueId = "") {
    return getAvailableStats(sportId, leagueId).filter((definition) => definition.enabled);
  }

  getSplits(entityId, splitDefinition = {}) {
    const values = splitDefinition.values || ["home", "away"];
    const splitType = splitDefinition.type || "homeAway";
    return {
      entity: getCanonicalEntity(entityId, this.entities),
      splits: values.map((value) => ({
        value,
        summary: this.getPlayerSummary(entityId, {
          ...splitDefinition.filters,
          statIds: splitDefinition.statIds,
          aggregation: splitDefinition.aggregation,
          [splitType]: splitType === "opponentIds" ? [value] : value,
        }),
      })),
      metadata: {
        source: this.name,
        lastUpdated: this.updatedAt,
        dataFreshness: "sample-snapshot",
      },
    };
  }

  getAvailableStats(sportId, leagueId) {
    return getAvailableStats(sportId, leagueId);
  }

  getDataFreshness(scope = {}) {
    const updated = new Date(this.updatedAt);
    const reference = scope.now instanceof Date ? scope.now : new Date();
    const ageMilliseconds = reference.getTime() - updated.getTime();
    const stale = Number.isNaN(updated.getTime()) || ageMilliseconds > 36 * 60 * 60 * 1000;
    return {
      provider: this.name,
      mode: this.mode,
      state: stale ? "stale-sample" : "sample",
      lastUpdated: this.updatedAt,
      scope,
      disclaimer: this.disclaimer,
      stale,
      partial: this.partial,
    };
  }

  getAthleteProfile(athleteId) {
    const athlete = getCanonicalEntity(athleteId, this.entities);
    if (!athlete || athlete.entityType === "team") return null;
    return {
      athlete,
      header: {
        fullName: athlete.name,
        shortName: athlete.profile?.shortName || athlete.name,
        teamName: athlete.profile?.teamName || athlete.teamId || "Independent",
        organization: athlete.profile?.organization || athlete.profile?.teamName || athlete.leagueId.toUpperCase(),
        leagueId: athlete.leagueId,
        sportId: athlete.sportId,
        role: athlete.profile?.role || athlete.position || "",
        jerseyNumber: athlete.profile?.jerseyNumber || "",
        active: athlete.active,
        status: athlete.profile?.status || (athlete.active ? "Active" : "Inactive"),
        availabilityStatus: athlete.profile?.availabilityStatus || "Status unavailable",
        nationality: athlete.profile?.nationality || "",
        age: athlete.profile?.age ?? null,
        height: athlete.profile?.height || "",
        weight: athlete.profile?.weight || "",
        handednessLabel: athlete.profile?.handednessLabel || "",
        handedness: athlete.profile?.handedness || "",
        stance: athlete.profile?.stance || "",
        record: athlete.profile?.record || "",
        reach: athlete.profile?.reach || "",
        seasonLabel: athlete.profile?.seasonLabel || "Illustrative sample",
        sample: true,
        media: createAthleteMediaViewModel(athlete),
      },
      source: this.name,
      updatedAt: this.updatedAt,
      sample: true,
    };
  }

  getAthleteSeasonSummary(athleteId) {
    const athlete = getCanonicalEntity(athleteId, this.entities);
    if (!athlete || athlete.entityType === "team") return null;
    const config = getAthleteProfileConfig(athlete);
    const scoped = this.rowsForEntity(athleteId, { dateRange: { type: "season", value: "current" } });
    return {
      entity: athlete,
      rows: scoped.rows,
      stats: Object.fromEntries(config.primaryStats.map((statId) => {
        const aggregation = profileAggregation(athlete.sportId, statId);
        return [statId, { ...calculateAggregation(scoped.rows, statId, aggregation), aggregation }];
      })),
      aggregation: "sport-aware",
      metadata: calculationMetadata({
        rows: scoped.rows,
        warnings: scoped.warnings,
        source: this.name,
        updatedAt: this.updatedAt,
      }),
    };
  }

  getAthleteRecentForm(athleteId, options = {}) {
    const athlete = getCanonicalEntity(athleteId, this.entities);
    if (!athlete || athlete.entityType === "team") return null;
    const config = getAthleteProfileConfig(athlete);
    return this.getPlayerGameLogs(athleteId, {
      ...options,
      dateRange: options.dateRange || { type: "last_n_games", value: options.limit || 5 },
      statIds: options.statIds || config.logStats,
    });
  }

  getAthleteGameLogs(athleteId, filters = {}) {
    const athlete = getCanonicalEntity(athleteId, this.entities);
    if (!athlete || athlete.entityType === "team") return null;
    const config = getAthleteProfileConfig(athlete);
    return this.getPlayerGameLogs(athleteId, {
      ...filters,
      statIds: filters.statIds || config.logStats,
    });
  }

  getAthleteSplits(athleteId, options = {}) {
    const athlete = getCanonicalEntity(athleteId, this.entities);
    if (!athlete || athlete.entityType === "team") return null;
    const config = getAthleteProfileConfig(athlete);
    const statId = options.statId || config.primaryStats.find((id) =>
      this.rows.some((row) => row.entity_id === athleteId && Number.isFinite(Number(row.stats?.[id]))));
    const scoped = this.rowsForEntity(athleteId, { dateRange: options.dateRange || { type: "career" } });
    const dimensions = {
      "home-away": { field: "home_away", values: ["home", "away"] },
      "wins-losses": { field: "result", values: ["win", "loss"] },
      "starter-bench": { field: "starter", values: [true, false], labels: ["Starter", "Bench"] },
      opponent: { field: "opponent_id", values: [...new Set(scoped.rows.map((row) => row.opponent_id).filter(Boolean))] },
      "pitcher-handedness": { field: "pitcher_handedness", values: ["left", "right"] },
      "opponent-stance": { field: "opponent_stance", values: ["orthodox", "southpaw"] },
      "track-type": { field: "track_type", values: [...new Set(scoped.rows.map((row) => row.track_type).filter(Boolean))] },
      competition: { field: "competition", values: [...new Set(scoped.rows.map((row) => row.competition).filter(Boolean))] },
      season: { field: "season", values: [...new Set(scoped.rows.map((row) => row.season).filter(Boolean))] },
      manufacturer: { field: "manufacturer", values: [...new Set(scoped.rows.map((row) => row.manufacturer).filter(Boolean))] },
    };
    const activeDimension = config.splitDimensions.includes(options.dimension)
      ? options.dimension
      : config.splitDimensions[0];
    const definition = dimensions[activeDimension];
    const baseline = calculateAggregation(scoped.rows, statId, "average");
    const rows = (definition?.values || []).map((value, index) => {
      const supportingRows = scoped.rows.filter((row) => row[definition.field] === value);
      const calculation = calculateAggregation(supportingRows, statId, "average");
      const values = supportingRows
        .map((row) => row.stats?.[statId])
        .filter((entry) => entry !== null && entry !== undefined && entry !== "" && Number.isFinite(Number(entry)))
        .map(Number);
      const mean = values.length ? values.reduce((sum, entry) => sum + entry, 0) / values.length : null;
      const variance = values.length && mean !== null
        ? values.reduce((sum, entry) => sum + ((entry - mean) ** 2), 0) / values.length
        : null;
      return {
        key: String(value),
        label: definition.labels?.[index] || String(value).replaceAll("-", " "),
        statId,
        value: calculation.value,
        comparisonBaseline: baseline.value,
        differenceFromBaseline: calculation.value !== null && baseline.value !== null
          ? Number((calculation.value - baseline.value).toFixed(2))
          : null,
        variance: variance === null ? null : Number(variance.toFixed(2)),
        sampleSize: calculation.sampleSize,
        warning: calculation.sampleSize > 0 && calculation.sampleSize < 3 ? "Small sample — interpret cautiously." : "",
        supportingEventIds: supportingRows.map((row) => row.event_id),
      };
    }).filter((row) => row.sampleSize > 0);
    return {
      availableDimensions: config.splitDimensions.filter((dimension) =>
        (dimensions[dimension]?.values || []).some((value) => scoped.rows.some((row) => row[dimensions[dimension].field] === value))),
      activeDimension,
      statId,
      rows,
      source: this.name,
      updatedAt: this.updatedAt,
    };
  }

  getAthleteTrends(athleteId, options = {}) {
    const athlete = getCanonicalEntity(athleteId, this.entities);
    if (!athlete || athlete.entityType === "team") return null;
    const config = getAthleteProfileConfig(athlete);
    const availableStats = config.primaryStats.filter((id) =>
      this.rows.some((row) => row.entity_id === athleteId && Number.isFinite(Number(row.stats?.[id]))));
    const preferredStatId = athlete.sportId === "motorsport"
      ? "motorsport-average-finishing-position"
      : ["mma", "boxing", "combat", "kickboxing"].includes(athlete.sportId)
        ? "combat-significant-strikes-landed"
        : availableStats[0];
    const statId = availableStats.includes(options.statId)
      ? options.statId
      : availableStats.includes(preferredStatId) ? preferredStatId : availableStats[0];
    const log = this.getAthleteGameLogs(athleteId, {
      dateRange: { type: "last_n_games", value: options.limit || 10 },
      statIds: [statId],
    });
    const ordered = [...(log?.rows || [])].sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
    const series = ordered.map((row, index) => {
      const value = row.stats?.[statId];
      const prior = ordered.slice(Math.max(0, index - 2), index + 1)
        .map((entry) => entry.stats?.[statId])
        .filter((entry) => entry !== null && entry !== undefined && entry !== "" && Number.isFinite(Number(entry)));
      return {
        eventId: row.event_id,
        date: row.event_date,
        value: value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null,
        rollingAverage: prior.length ? Number((prior.reduce((sum, entry) => sum + Number(entry), 0) / prior.length).toFixed(2)) : null,
      };
    });
    return {
      availableStats,
      activeStatId: statId,
      series,
      sampleSize: series.filter((point) => point.value !== null).length,
      source: this.name,
      updatedAt: this.updatedAt,
    };
  }

  getAthleteUpcomingEvent(athleteId) {
    return getCanonicalEntity(athleteId, this.entities)?.profile?.nextEvent || null;
  }

  getAthleteMatchupContext(athleteId) {
    return getCanonicalEntity(athleteId, this.entities)?.profile?.matchup || null;
  }

  getAthleteInsights(athleteId, options = {}) {
    const athlete = getCanonicalEntity(athleteId, this.entities);
    if (!athlete || athlete.entityType === "team") return [];
    const config = getAthleteProfileConfig(athlete);
    const statId = options.statId || config.primaryStats.find((id) =>
      this.rows.some((row) => row.entity_id === athleteId && Number.isFinite(Number(row.stats?.[id]))));
    const log = this.getAthleteGameLogs(athleteId, {
      ...options,
      dateRange: options.dateRange || { type: "last_n_games", value: 10 },
      statIds: [statId],
    });
    return createInsightCandidates(athlete, log?.rows || [], statId, log?.metadata || {});
  }

  getAthleteMarkets(athleteId, sportsRepository) {
    const athlete = getCanonicalEntity(athleteId, this.entities);
    if (!athlete || !sportsRepository) return [];
    return sportsRepository.getMarkets(athlete.leagueId).flatMap((market) =>
      market.selections
        .filter((selection) =>
          selection.id === athlete.providerIds?.bettingSelection
          || selection.participantId === athlete.providerIds?.bettingParticipant
          || selection.name.toLowerCase() === athlete.name.toLowerCase())
        .map((selection) => ({ market, selection })));
  }

  searchAthletes(query, context = {}) {
    return this.searchEntities(query, { ...context, includeContextMatches: true })
      .filter((entity) => entity.entityType !== "team")
      .sort((left, right) =>
        right.matchScore - left.matchScore
        || Number(right.active) - Number(left.active)
        || left.name.localeCompare(right.name));
  }
}

export function createStatsRepository(payload = mockStatsProviderPayload, { generatedAt = "" } = {}) {
  const source = generatedAt ? { ...payload, generated_at: generatedAt } : payload;
  return new MockHistoricalStatsProvider(source);
}
