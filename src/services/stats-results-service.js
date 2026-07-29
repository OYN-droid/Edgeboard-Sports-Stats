import { getStatDefinition } from "../config/stat-registry.js";
import { createAthleteMediaViewModel } from "./athlete-media-service.js";
import { createInsightCandidates } from "./insight-candidate-service.js";
import { thresholdHitCount } from "./stat-calculations.js";
import { validateStatisticalQuery } from "./stats-query-service.js";
import {
  buildComparisonViewModel,
  buildEventExplorerViewModel,
  buildFilteredListViewModel,
  buildHeadToHeadViewModel,
  buildLeaderboardViewModel,
  buildRecordViewModel,
} from "./advanced-stats-results-service.js";

function formatValue(value, definition) {
  if (!Number.isFinite(Number(value))) return "Unavailable";
  const numeric = Number(value);
  if (definition?.valueType === "percentage") return `${numeric.toFixed(1)}%`;
  if (definition?.unit === "ratio") return numeric.toFixed(3);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function contextLabel(query, metadata) {
  if (query.dateRange.type === "last_n_games") return `Last ${query.dateRange.value} events`;
  if (query.dateRange.type === "last_n_days") return `Last ${query.dateRange.value} days`;
  if (query.dateRange.type === "this_month") return "This month";
  if (query.dateRange.type === "this_week") return "This week";
  if (query.dateRange.type === "season") return query.dateRange.value === "previous" ? "Last season" : "This season";
  if (query.dateRange.type === "career") return "Available career sample";
  return metadata?.dateRangeUsed ? "Selected date range" : "Available sample";
}

function baseResult(type, parsed, query) {
  return {
    type,
    mode: query.mode,
    intent: query.intent,
    interpretation: parsed,
    structuredQuery: query,
    sourceLabel: "Sample historical data",
    dataQualityWarning: "Sample historical statistics are incomplete and not production-verified.",
  };
}

function emptyResult(parsed, query, message) {
  return {
    ...baseResult("empty", parsed, query),
    title: "No sample statistics found",
    message,
    suggestions: parsed.suggestedCorrections,
  };
}

function instantResult(provider, parsed, query) {
  const entityId = query.playerIds[0] || query.teamIds[0];
  const statId = query.statIds[0];
  const definition = getStatDefinition(statId);
  const summary = query.entityType === "team"
    ? provider.getTeamSummary(entityId, query)
    : provider.getPlayerSummary(entityId, query);
  const calculation = summary.stats[statId];
  if (!summary.entity || !calculation || calculation.value === null || !calculation.sampleSize) {
    return emptyResult(parsed, query, "The mock provider has no completed rows for the interpreted entity, stat, and filters.");
  }
  const threshold = query.comparisonOperator && query.comparisonValue !== null
    ? thresholdHitCount(summary.rows, statId, query.comparisonOperator, query.comparisonValue)
    : null;
  return {
    ...baseResult("instant_stat", parsed, query),
    title: summary.entity.name,
    entity: summary.entity,
    media: createAthleteMediaViewModel(summary.entity),
    primaryValue: formatValue(calculation.value, definition),
    rawPrimaryValue: calculation.value,
    primaryLabel: `${definition?.displayName || statId} ${query.aggregation === "sum" ? "total" : query.aggregation === "average" ? "per event" : query.aggregation}`,
    context: contextLabel(query, summary.metadata),
    sampleSize: calculation.sampleSize,
    supportingStats: query.statIds.slice(1).map((supportingId) => {
      const supportingDefinition = getStatDefinition(supportingId);
      const supporting = summary.stats[supportingId];
      return {
        statId: supportingId,
        label: supportingDefinition?.displayName || supportingId,
        value: formatValue(supporting?.value, supportingDefinition),
      };
    }),
    threshold,
    rows: summary.rows,
    metadata: summary.metadata,
    lastUpdated: summary.metadata.lastUpdated,
    insights: createInsightCandidates(summary.entity, summary.rows, statId, summary.metadata),
  };
}

function gameLogResult(provider, parsed, query) {
  const entityId = query.playerIds[0];
  const log = provider.getPlayerGameLogs(entityId, query);
  if (!log.entity || !log.rows.length) return emptyResult(parsed, query, "No completed sample game-log rows match these filters.");
  return {
    ...baseResult("game_log", parsed, query),
    title: `${log.entity.name} game log`,
    entity: log.entity,
    media: createAthleteMediaViewModel(log.entity),
    statIds: query.statIds,
    columns: query.statIds.map((statId) => ({ statId, label: getStatDefinition(statId)?.shortName || statId })),
    rows: log.rows,
    context: contextLabel(query, log.metadata),
    sampleSize: log.rows.length,
    metadata: log.metadata,
    lastUpdated: log.metadata.lastUpdated,
  };
}

function leaderboardResult(provider, parsed, query) {
  const statId = query.statIds[0];
  const definition = getStatDefinition(statId);
  const board = provider.getLeaderboard(statId, query);
  if (!board.entries.length) return emptyResult(parsed, query, "No sample entities have completed rows for this leaderboard.");
  return {
    ...baseResult("leaderboard", parsed, query),
    title: `${query.leagueId.toUpperCase()} ${definition?.displayName || statId} leaders`,
    statId,
    statLabel: definition?.displayName || statId,
    entries: board.entries.map((entry, index) => ({
      rank: index + 1,
      entity: entry.entity,
      media: createAthleteMediaViewModel(entry.entity),
      value: formatValue(entry.value, definition),
      rawValue: entry.value,
      sampleSize: entry.sampleSize,
    })),
    context: contextLabel(query, board.metadata),
    metadata: board.metadata,
    lastUpdated: board.metadata.lastUpdated,
  };
}

function comparisonResult(provider, parsed, query) {
  const entityIds = query.playerIds.length ? query.playerIds : query.teamIds;
  if (entityIds.length < 2) {
    return {
      ...baseResult("ambiguous", parsed, query),
      title: "Choose two entities to compare",
      message: "The comparison needs two unambiguous canonical entities.",
      candidates: parsed.ambiguousCandidates,
    };
  }
  const comparison = provider.compareEntities(entityIds.slice(0, 2), query.statIds, query);
  return {
    ...baseResult("player_comparison", parsed, query),
    title: comparison.entities.map((entry) => entry.entity?.name).filter(Boolean).join(" vs "),
    statIds: query.statIds,
    entities: comparison.entities.map((entry) => ({
      entity: entry.entity,
      media: createAthleteMediaViewModel(entry.entity),
      stats: Object.fromEntries(query.statIds.map((statId) => {
        const definition = getStatDefinition(statId);
        return [statId, {
          label: definition?.displayName || statId,
          value: formatValue(entry.stats[statId]?.value, definition),
          sampleSize: entry.stats[statId]?.sampleSize || 0,
        }];
      })),
    })),
    context: contextLabel(query, comparison.metadata),
    metadata: comparison.metadata,
    lastUpdated: comparison.metadata.lastUpdated,
  };
}

function splitResult(provider, parsed, query) {
  const entityId = query.playerIds[0];
  const opponentRows = query.splitType === "opponent"
    ? provider.getPlayerGameLogs(entityId, query).rows
    : [];
  const values = query.splitType === "result" ? ["win", "loss"]
    : query.splitType === "opponent"
      ? [...new Set(opponentRows.map((row) => row.opponent_id).filter(Boolean))]
      : ["home", "away"];
  const type = query.splitType === "result" ? "gameResult"
    : query.splitType === "opponent" ? "opponentIds" : "homeAway";
  const split = provider.getSplits(entityId, {
    type,
    values,
    statIds: query.statIds,
    aggregation: query.aggregation,
    filters: query,
  });
  if (!split.entity) return emptyResult(parsed, query, "No canonical entity was resolved for this split.");
  return {
    ...baseResult("split_summary", parsed, query),
    title: `${split.entity.name} ${query.splitType || "home-away"} split`,
    entity: split.entity,
    media: createAthleteMediaViewModel(split.entity),
    statIds: query.statIds,
    splits: split.splits.map((entry) => ({
      label: entry.value,
      sampleSize: entry.summary.metadata.sampleSize,
      stats: Object.fromEntries(query.statIds.map((statId) => {
        const definition = getStatDefinition(statId);
        return [statId, {
          label: definition?.displayName || statId,
          value: formatValue(entry.summary.stats[statId]?.value, definition),
        }];
      })),
    })),
    metadata: split.metadata,
    lastUpdated: split.metadata.lastUpdated,
  };
}

function compatibleBettingContext(statsResult, sportsRepository) {
  if (!statsResult?.entity || !statsResult.structuredQuery.statIds.length) return null;
  const query = statsResult.structuredQuery;
  const entity = statsResult.entity;
  const requestedStatId = query.statIds[0];
  const markets = sportsRepository.getMarkets(query.leagueId);
  const matching = markets.flatMap((market) =>
    market.canonicalMarketId === requestedStatId
      && market.period === query.period
      && (!query.settlementScope || market.settlementScope === query.settlementScope)
      && (!query.eventIds.length || query.eventIds.includes(market.eventId))
      ? market.selections.map((selection) => ({ market, selection }))
      : [])
    .find(({ market, selection }) =>
      market.available
      && selection.available
      && !selection.stale
      && (selection.id === entity.providerIds?.bettingSelection
        || selection.participantId === entity.providerIds?.bettingParticipant
        || selection.name.toLowerCase() === entity.name.toLowerCase()));
  if (!matching) return null;
  const { market, selection } = matching;
  const threshold = Number.isFinite(selection.numericLine)
    ? thresholdHitCount(statsResult.rows || [], requestedStatId, selection.side === "under" ? "lt" : "gt", selection.numericLine)
    : null;
  return {
    marketId: market.id,
    canonicalMarketId: market.canonicalMarketId,
    selectionId: selection.id,
    participantId: entity.id,
    line: selection.line,
    numericLine: selection.numericLine,
    side: selection.side,
    odds: selection.odds,
    sportsbook: selection.sportsbook,
    hitCount: threshold?.hitCount ?? null,
    sampleSize: threshold?.sampleSize ?? statsResult.sampleSize,
    historicalHitRate: threshold?.hitRate ?? null,
    projection: selection.projection,
    projectedEdge: selection.trend,
    confidence: selection.confidence,
    updatedAt: selection.lastUpdatedAt,
    source: market.source,
    settlementScope: market.settlementScope,
    eventId: market.eventId,
    available: true,
    sample: true,
  };
}

export function buildStatsResult(provider, parsed, sportsRepository) {
  const query = parsed.structuredQuery;
  const validation = validateStatisticalQuery(query);
  if (!validation.valid) {
    return {
      ...baseResult("error", parsed, query),
      title: "The interpreted query is invalid",
      message: validation.errors.join(" "),
    };
  }
  if (query.intent === "unsupported") {
    return {
      ...baseResult("unsupported", parsed, query),
      title: "This question is not supported yet",
      message: "Try a player statistic, game log, split, comparison, or leaderboard using the sample entities.",
      suggestions: parsed.suggestedCorrections,
    };
  }
  if (query.intent === "ambiguous" || parsed.ambiguousCandidates.length) {
    return {
      ...baseResult("ambiguous", parsed, query),
      title: "Clarify the athlete or team",
      message: "Multiple or incomplete entity references were detected.",
      candidates: parsed.ambiguousCandidates,
      suggestions: parsed.suggestedCorrections,
    };
  }
  if (parsed.unresolvedEntities.length && ![
    "leaderboard", "league_leaderboard", "team_leaderboard", "event_leaderboard", "performance_ranking",
    "streak_leaderboard", "threshold_leaderboard", "single_game_high", "season_high", "career_high",
    "historical_record", "record_progression", "statistical_filter", "multi_stat_filter", "cohort_analysis",
  ].includes(query.intent)) {
    return {
      ...baseResult("empty", parsed, query),
      title: "No canonical entity matched",
      message: "The parser did not invent an athlete ID. Use one of the supported sample athlete names.",
      suggestions: parsed.suggestedCorrections,
    };
  }
  if (!query.statIds.length && !["betting_research", "event_search", "head_to_head_history"].includes(query.intent)) {
    return {
      ...baseResult("unsupported", parsed, query),
      title: "No supported statistic was recognized",
      message: "Choose a canonical statistic available for the interpreted sport.",
      suggestions: parsed.suggestedCorrections,
    };
  }

  let result;
  if (["athlete_comparison", "team_comparison", "multi_entity_comparison"].includes(query.intent)) {
    result = buildComparisonViewModel(provider, parsed, sportsRepository);
  } else if (["league_leaderboard", "team_leaderboard", "event_leaderboard", "performance_ranking",
    "streak_leaderboard", "threshold_leaderboard", "cohort_analysis"].includes(query.intent)) {
    result = buildLeaderboardViewModel(provider, parsed, sportsRepository);
  } else if (["single_game_high", "season_high", "career_high", "historical_record", "record_progression"].includes(query.intent)) {
    result = buildRecordViewModel(provider, parsed);
  } else if (["multi_stat_filter"].includes(query.intent)
    || (query.intent === "statistical_filter" && query.thresholdDefinitions.length)) {
    result = buildFilteredListViewModel(provider, parsed);
  } else if (query.intent === "head_to_head_history") {
    result = buildHeadToHeadViewModel(provider, parsed);
  } else if (query.intent === "event_search") {
    result = buildEventExplorerViewModel(provider, parsed);
  } else if (query.intent === "leaderboard") result = leaderboardResult(provider, parsed, query);
  else if (query.includeComparison) result = comparisonResult(provider, parsed, query);
  else if (query.intent === "player_split"
    || (query.splitType && ["statistical_filter", "statistical_lookup"].includes(query.intent))) result = splitResult(provider, parsed, query);
  else if (query.includeGameLog) result = gameLogResult(provider, parsed, query);
  else result = instantResult(provider, parsed, query);

  const freshness = provider.getDataFreshness?.() || {
    mode: "unknown",
    state: "unknown",
    stale: true,
    partial: false,
    lastUpdated: null,
  };
  if (freshness.stale || freshness.partial) {
    const qualityWarnings = [
      result.dataQualityWarning,
      freshness.stale ? "The sample snapshot is stale; verify it before relying on any result." : "",
      freshness.partial ? "The provider returned partial sample data; missing coverage may affect this result." : "",
    ].filter(Boolean);
    result = {
      ...result,
      dataQualityWarning: qualityWarnings.join(" "),
    };
  }
  if (query.includeBettingContext && !["empty", "unsupported", "ambiguous", "error"].includes(result.type)) {
    const bettingContext = result.bettingContext?.length
      ? result.bettingContext
      : compatibleBettingContext(result, sportsRepository);
    return {
      ...baseResult("combined", parsed, query),
      statsAnswer: result,
      bettingContext,
      bettingContextStatus: Array.isArray(bettingContext)
        ? bettingContext.some((market) => market.available) ? "compatible-market-found" : "no-compatible-market"
        : bettingContext ? "compatible-market-found" : "no-compatible-market",
      title: result.title,
      dataQualityWarning: result.dataQualityWarning,
      dataFreshness: freshness,
    };
  }
  return { ...result, dataFreshness: freshness };
}
