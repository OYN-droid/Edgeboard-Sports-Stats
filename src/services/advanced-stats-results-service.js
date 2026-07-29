import { getStatDefinition } from "../config/stat-registry.js";
import { createAthleteMediaViewModel } from "./athlete-media-service.js";

const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const round = (value, places = 2) => finite(value) ? Number(Number(value).toFixed(places)) : null;
const unique = (values) => [...new Set(values.filter(Boolean))];

export function formatAdvancedValue(value, statId) {
  if (!finite(value)) return "Unavailable";
  const definition = getStatDefinition(statId);
  const numeric = Number(value);
  if (definition?.unit === "ratio") return numeric.toFixed(3);
  if (definition?.valueType === "percentage") return `${numeric.toFixed(1)}%`;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function scopeView(query) {
  return Object.freeze({
    sportId: query.sportId,
    leagueId: query.leagueId,
    competition: query.competition || "",
    dateRange: Object.freeze({ ...query.dateRange }),
    aggregation: query.aggregation,
    filters: Object.freeze([
      query.homeAway && `Location: ${query.homeAway}`,
      query.gameResult && `Result: ${query.gameResult}`,
      query.trackType && `Track: ${query.trackType}`,
      query.seasonType && `Season type: ${query.seasonType}`,
    ].filter(Boolean)),
  });
}

function sourceView(metadata) {
  return Object.freeze([{
    provider: metadata?.source || "Unknown source",
    freshness: metadata?.dataFreshness || "unknown",
    lastUpdated: metadata?.lastUpdated || null,
    sample: true,
  }]);
}

function compatibleMarkets(entities, statIds, query, sportsRepository) {
  if (!query.includeBettingContext || !sportsRepository) return [];
  const ids = new Set(entities.flatMap((entity) => [
    entity.providerIds?.bettingSelection,
    entity.providerIds?.bettingParticipant,
  ].filter(Boolean)));
  const names = new Set(entities.map((entity) => entity.name.toLowerCase()));
  return sportsRepository.getMarkets(query.leagueId).flatMap((market) => {
    if (!statIds.includes(market.canonicalMarketId)
      || market.period !== query.period
      || (query.settlementScope && market.settlementScope !== query.settlementScope)
      || (query.eventIds?.length && !query.eventIds.includes(market.eventId))) return [];
    return market.selections.flatMap((selection) => {
      const matched = ids.has(selection.id) || ids.has(selection.participantId) || names.has(selection.name.toLowerCase());
      if (!matched || !market.available || !selection.available) return [];
      const entity = entities.find((candidate) => candidate.name.toLowerCase() === selection.name.toLowerCase()
        || candidate.providerIds?.bettingSelection === selection.id
        || candidate.providerIds?.bettingParticipant === selection.participantId);
      return [{
        entityId: entity?.id || "",
        marketId: market.id,
        selectionId: selection.id,
        canonicalMarketId: market.canonicalMarketId,
        line: selection.line,
        numericLine: selection.numericLine,
        odds: selection.odds,
        sportsbook: selection.sportsbook,
        projection: selection.projection,
        projectedEdge: selection.trend,
        confidence: selection.confidence,
        historicalHitRate: selection.hitRate,
        updatedAt: selection.lastUpdatedAt,
        source: market.source,
        settlementScope: market.settlementScope,
        period: market.period,
        eventId: market.eventId,
        stale: selection.stale,
        suspended: market.status === "suspended",
        available: !selection.stale && market.status === "open",
      }];
    });
  });
}

function comparisonRows(comparison, query) {
  return comparison.entities.map((entity) => ({
    entityId: entity.id,
    displayName: entity.name,
    entityType: entity.entityType,
    teamName: entity.profile?.teamName || entity.teamId || "",
    role: entity.profile?.role || entity.position || "",
    leagueId: entity.leagueId,
    media: createAthleteMediaViewModel(entity),
    values: Object.fromEntries(query.statIds.map((statId) => {
      const item = comparison.stats[statId]?.find((entry) => entry.entityId === entity.id);
      return [statId, {
        rawValue: item?.value ?? null,
        value: formatAdvancedValue(item?.value, statId),
        sampleSize: item?.sampleSize || 0,
        missingCount: item?.missingCount || 0,
        comparisonBaseline: round(item?.baseline),
        difference: round(item?.difference),
        percentDifference: round(item?.percentDifference, 1),
        variance: round(item?.variance),
        consistency: round(item?.consistency, 3),
        supportingEventIds: Object.freeze((item?.supportingRows || []).map((row) => row.event_id).filter(Boolean)),
      }];
    })),
  }));
}

export function buildComparisonViewModel(provider, parsed, sportsRepository) {
  const query = parsed.structuredQuery;
  const entityIds = query.primaryEntityIds.length
    ? query.primaryEntityIds
    : query.playerIds.length ? query.playerIds : query.teamIds;
  if (entityIds.length < 2) {
    return {
      type: "ambiguous", title: "Choose at least two entities", message: "A comparison requires two or more unambiguous canonical entity IDs.",
      candidates: parsed.ambiguousCandidates || [], structuredQuery: query,
    };
  }
  const comparison = query.entityType === "team"
    ? provider.compareTeams(entityIds, query.statIds, query)
    : provider.compareAthletes(entityIds, query.statIds, query);
  const rows = comparisonRows(comparison, query);
  const statColumns = query.statIds.map((statId) => {
    const definition = getStatDefinition(statId);
    const ranked = [...rows].filter((row) => finite(row.values[statId]?.rawValue))
      .sort((left, right) => {
        const difference = Number(left.values[statId].rawValue) - Number(right.values[statId].rawValue);
        return (definition?.higherIsBetter === false ? difference : -difference) || left.entityId.localeCompare(right.entityId);
      });
    return {
      statId,
      label: definition?.displayName || statId,
      shortLabel: definition?.shortName || statId,
      higherIsBetter: definition?.higherIsBetter !== false,
      unit: definition?.unit || "count",
      ranks: Object.fromEntries(ranked.map((row, index) => [row.entityId, index + 1])),
    };
  });
  const headlineDifferences = statColumns.slice(0, 3).flatMap((column) => {
    const rankedRows = [...rows].filter((row) => finite(row.values[column.statId]?.rawValue))
      .sort((a, b) => column.higherIsBetter
        ? b.values[column.statId].rawValue - a.values[column.statId].rawValue
        : a.values[column.statId].rawValue - b.values[column.statId].rawValue);
    if (rankedRows.length < 2) return [];
    return [{
      statId: column.statId,
      label: column.label,
      leaderEntityId: rankedRows[0].entityId,
      leaderName: rankedRows[0].displayName,
      difference: round(Math.abs(rankedRows[0].values[column.statId].rawValue - rankedRows[1].values[column.statId].rawValue)),
      criteria: `${query.aggregation}; ${column.higherIsBetter ? "higher" : "lower"} value ranks first`,
    }];
  });
  const bettingContext = compatibleMarkets(comparison.entities, query.statIds, query, sportsRepository);
  const sampleSizes = Object.fromEntries(rows.map((row) => [
    row.entityId, Math.max(0, ...Object.values(row.values).map((item) => item.sampleSize)),
  ]));
  const distinctSampleSizes = [...new Set(Object.values(sampleSizes))];
  const leagueIds = [...new Set(comparison.entities.map((entity) => entity.leagueId).filter(Boolean))];
  const calculationWarnings = comparison.summaries.flatMap((summary) =>
    summary.metadata?.calculationWarnings || summary.warnings || []);
  const availableEntities = provider.getComparisonPool(query)
    .filter((entity) => !entityIds.includes(entity.id))
    .map((entity) => ({
      id: entity.id,
      name: entity.name,
      leagueId: entity.leagueId,
      teamId: entity.teamId,
      role: entity.profile?.role || entity.position || "",
      entityType: entity.entityType,
    }));
  return {
    type: query.entityType === "team" ? "team_comparison"
      : entityIds.length > 2 ? "multi_athlete_comparison" : "athlete_comparison",
    title: comparison.entities.map((entity) => entity.name).join(" vs "),
    scope: scopeView(query),
    entities: comparison.entities,
    availableEntities,
    statColumns,
    rows,
    headlineDifferences,
    trendSeries: comparison.summaries.map((summary) => ({
      entityId: summary.entity.id,
      points: summary.rows.map((row) => ({
        eventId: row.event_id,
        date: row.event_date,
        values: Object.fromEntries(query.statIds.map((statId) => [statId, row.stats?.[statId] ?? null])),
      })),
    })),
    sampleSizes,
    bettingContext,
    warnings: unique([
      ...comparison.warnings,
      ...calculationWarnings,
      ...(distinctSampleSizes.length > 1
        ? [`Compared entities have unequal completed-event samples (${rows.map((row) =>
          `${row.displayName}: ${sampleSizes[row.entityId]}`).join(", ")}). The same filters are applied, but available coverage differs.`]
        : []),
      ...(leagueIds.length > 1
        ? [`This comparison spans ${leagueIds.map((id) => id.toUpperCase()).join(" and ")}. Values are not normalized across different league rules or competition formats.`]
        : []),
      ...(bettingContext.some((market) => market.stale) ? ["At least one related market is stale and unavailable for slip actions."] : []),
    ]),
    sources: sourceView(comparison.metadata),
    structuredQuery: query,
    context: query.dateRange.type === "last_n_games" ? `Last ${query.dateRange.value} completed events` : query.dateRange.type.replaceAll("_", " "),
    lastUpdated: comparison.metadata.lastUpdated,
    sample: true,
    exportType: "comparison",
  };
}

export function buildLeaderboardViewModel(provider, parsed, sportsRepository) {
  const query = parsed.structuredQuery;
  const statId = query.rankingMetric || query.statIds[0];
  const board = query.intent === "event_leaderboard"
    ? provider.getEventLeaderboard(statId, query)
    : query.intent === "team_leaderboard" || query.entityType === "team"
      ? provider.getTeamLeaderboard(statId, query)
      : query.intent === "streak_leaderboard"
        ? provider.getStreakLeaderboard(statId, query)
        : query.intent === "threshold_leaderboard"
          ? provider.getThresholdLeaderboard(statId, query)
          : provider.getPlayerLeaderboard(statId, query);
  const definition = getStatDefinition(statId);
  const entities = board.entries.map((entry) => entry.entity);
  const markets = compatibleMarkets(entities, [statId], query, sportsRepository);
  const poolWarnings = board.totalQualified > 0 && board.totalQualified < 3
    ? ["The qualified comparison pool is too small for a robust percentile."]
    : [];
  return {
    type: "leaderboard",
    title: `${query.leagueId.toUpperCase()} ${definition?.displayName || statId} ${query.intent === "single_game_high" ? "single-event highs" : "leaderboard"}`,
    statId,
    statLabel: definition?.displayName || statId,
    aggregation: query.aggregation,
    scope: scopeView(query),
    rows: board.entries.map((entry) => ({
      rank: entry.rank,
      percentile: entry.percentile,
      comparisonPoolSize: entry.comparisonPoolSize ?? board.totalQualified,
      entityId: entry.entity.id,
      entity: entry.entity,
      displayName: entry.entity.name,
      value: formatAdvancedValue(entry.value, statId),
      rawValue: entry.value,
      sampleSize: entry.sampleSize,
      hitCount: entry.hitCount ?? null,
      eventId: entry.eventId || "",
      secondaryValues: entry.secondaryValues || {},
      qualification: entry.qualification || null,
      trend: null,
      bettingMarket: markets.find((market) => market.entityId === entry.entity.id) || null,
    })),
    entries: board.entries.map((entry) => ({
      ...entry,
      rank: entry.rank,
      value: formatAdvancedValue(entry.value, statId),
      rawValue: entry.value,
      media: createAthleteMediaViewModel(entry.entity),
    })),
    qualification: board.qualificationRules,
    totalQualified: board.totalQualified,
    pagination: { offset: board.offset || 0, limit: board.limit || query.resultLimit, hasMore: board.hasMore === true },
    tieStrategy: board.tieStrategy,
    percentileMethod: board.percentileMethod,
    warnings: unique([...(board.metadata.calculationWarnings || []), ...poolWarnings]),
    sources: sourceView(board.metadata),
    structuredQuery: query,
    context: query.dateRange.type === "last_n_games" ? `Last ${query.dateRange.value} completed events` : query.dateRange.type.replaceAll("_", " "),
    lastUpdated: board.metadata.lastUpdated,
    sample: true,
    exportType: "leaderboard",
  };
}

export function buildFilteredListViewModel(provider, parsed) {
  const query = parsed.structuredQuery;
  const filtered = provider.getFilteredEntitySet(query.thresholdDefinitions, query);
  return {
    type: "multi_stat_filtered_list",
    title: `${query.leagueId.toUpperCase()} entities matching ${query.thresholdDefinitions.length} condition${query.thresholdDefinitions.length === 1 ? "" : "s"}`,
    scope: scopeView(query),
    conditions: query.thresholdDefinitions.map((condition) => ({
      ...condition,
      label: getStatDefinition(condition.statId)?.displayName || condition.statId,
    })),
    conditionLogic: filtered.conditionLogic,
    rows: filtered.entries.map((entry) => ({
      entityId: entry.entity.id,
      entity: entry.entity,
      displayName: entry.entity.name,
      sampleSize: entry.sampleSize,
      reason: entry.evaluations.map((evaluation) =>
        `${getStatDefinition(evaluation.statId)?.shortName || evaluation.statId} ${evaluation.operator} ${evaluation.value}`).join(` ${filtered.conditionLogic.toUpperCase()} `),
      values: entry.evaluations,
    })),
    nearMatches: filtered.nearMatches,
    warnings: filtered.entries.length ? [] : ["No sample entities meet every interpreted condition. Thresholds were not relaxed."],
    sources: sourceView(filtered.metadata),
    structuredQuery: query,
    context: query.dateRange.type.replaceAll("_", " "),
    lastUpdated: filtered.metadata.lastUpdated,
    sample: true,
    exportType: "filtered-list",
  };
}

export function buildRecordViewModel(provider, parsed) {
  const query = parsed.structuredQuery;
  const statId = query.statIds[0];
  const record = provider.getRecordCandidate(statId, query);
  const candidate = record.candidate;
  return {
    type: candidate ? "record_result" : "empty",
    title: candidate
      ? query.intent === "season_high" ? "Season high in available records"
        : query.intent === "career_high" ? "Career high in available records"
          : "Highest in the available dataset"
      : "No record candidate found",
    statId,
    statLabel: getStatDefinition(statId)?.displayName || statId,
    entity: candidate?.entity || null,
    value: candidate ? formatAdvancedValue(candidate.value, statId) : "Unavailable",
    rawValue: candidate?.value ?? null,
    supportingEvent: candidate?.rows?.[0] ? {
      eventId: candidate.rows[0].event_id,
      date: candidate.rows[0].event_date,
      eventName: candidate.rows[0].event_name,
      opponent: candidate.rows[0].opponent_id,
    } : null,
    scope: record.scope,
    dataCoverage: record.coverage,
    validationStatus: record.validationStatus,
    completenessWarning: record.completenessWarning,
    sources: sourceView(record.metadata),
    structuredQuery: query,
    lastUpdated: record.metadata.lastUpdated,
    sample: true,
    exportType: "record",
    message: candidate ? "" : "No completed provider row contains this statistic.",
  };
}

export function buildHeadToHeadViewModel(provider, parsed) {
  const query = parsed.structuredQuery;
  const ids = query.primaryEntityIds.length ? query.primaryEntityIds : [...query.playerIds, ...query.teamIds];
  if (ids.length < 2) return {
    type: "ambiguous", title: "Choose two entities", message: "Head-to-head history requires two canonical entities.", candidates: parsed.ambiguousCandidates,
  };
  const history = provider.getHeadToHeadHistory(ids.slice(0, 2), query);
  return {
    type: "head_to_head_history",
    title: `${history.entities?.[0]?.name || "Entity"} vs ${history.entities?.[1]?.name || "Entity"}`,
    entities: history.entities || [],
    directMeetings: history.direct.map((row) => ({
      eventId: row.event_id, date: row.event_date, result: row.result,
      opponent: row.opponent_id, competition: row.competition, supportingRowId: row.row_id,
    })),
    commonOpponents: history.commonOpponents.map((item) => ({
      opponentId: item.opponentId,
      leftSample: item.leftRows.length,
      rightSample: item.rightRows.length,
      causalClaimAllowed: false,
    })),
    warnings: [...history.warnings, ...(history.commonOpponents.length ? ["Common-opponent context is indirect and does not imply causality."] : [])],
    sources: sourceView(history.metadata),
    structuredQuery: query,
    lastUpdated: history.metadata.lastUpdated,
    sample: true,
    exportType: "head-to-head",
  };
}

export function buildEventExplorerViewModel(provider, parsed) {
  const query = parsed.structuredQuery;
  const result = provider.searchHistoricalEvents(query);
  return {
    type: "event_explorer",
    title: `${query.leagueId.toUpperCase()} historical event explorer`,
    scope: scopeView(query),
    events: result.events.map((event) => ({
      eventId: event.eventId,
      date: event.date,
      eventName: event.eventName,
      competition: event.competition,
      venue: event.venue,
      notablePerformances: event.rows.slice(0, 3).map((row) => ({
        entityId: row.entity_id,
        entity: row.entity,
        rowId: row.row_id,
        result: row.result,
        opponent: row.opponent_id,
      })),
    })),
    warnings: result.metadata.warnings || [],
    sources: sourceView(result.metadata),
    structuredQuery: query,
    lastUpdated: result.metadata.lastUpdated,
    sample: true,
    exportType: "events",
  };
}

const spreadsheetSafe = (value) => {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};

export function advancedResultToText(result, delimiter = "\t") {
  const sampleContext = result.type === "leaderboard" ? `${result.totalQualified} qualified entities`
    : result.type?.includes("comparison") ? Object.entries(result.sampleSizes || {})
      .map(([entityId, size]) => `${entityId}: ${size} events`).join("; ")
      : result.type === "multi_stat_filtered_list" ? `${result.rows?.length || 0} qualified entities`
        : result.type === "record_result" ? `${result.supportingEvent ? 1 : 0} supporting events`
          : result.type === "head_to_head_history" ? `${result.directMeetings?.length || 0} direct meetings`
            : result.type === "event_explorer" ? `${result.events?.length || 0} completed events`
              : "Unavailable";
  const metadata = [
    `EdgeBoard sample statistical result`,
    `Title${delimiter}${result.title}`,
    `Scope${delimiter}${result.scope?.leagueId || result.structuredQuery?.leagueId || ""}`,
    `Date range${delimiter}${JSON.stringify(result.scope?.dateRange || result.structuredQuery?.dateRange || {})}`,
    `Aggregation${delimiter}${result.aggregation || result.structuredQuery?.aggregation || ""}`,
    `Source${delimiter}${result.sources?.[0]?.provider || "Sample historical data"}`,
    `Freshness${delimiter}${result.sources?.[0]?.lastUpdated || result.lastUpdated || "unknown"}`,
    `Sample size${delimiter}${sampleContext}`,
    "Warning\tIllustrative sample data; not an official or complete record.",
  ];
  if (result.type === "leaderboard") {
    return [...metadata, "", ["Rank", "Entity", result.statLabel, "Sample size"].join(delimiter),
      ...result.rows.map((row) => [row.rank, row.displayName, row.rawValue, row.sampleSize].map(spreadsheetSafe).join(delimiter))].join("\n");
  }
  if (result.type?.includes("comparison")) {
    return [...metadata, "", ["Entity", ...result.statColumns.map((column) => column.label), "Sample size"].join(delimiter),
      ...result.rows.map((row) => [
        row.displayName,
        ...result.statColumns.map((column) => row.values[column.statId]?.rawValue ?? ""),
        result.sampleSizes[row.entityId],
      ].map(spreadsheetSafe).join(delimiter))].join("\n");
  }
  if (result.type === "multi_stat_filtered_list") {
    return [...metadata, "", ["Entity", "Qualification", "Sample size"].join(delimiter),
      ...result.rows.map((row) => [row.displayName, row.reason, row.sampleSize].map(spreadsheetSafe).join(delimiter))].join("\n");
  }
  return [...metadata, "", `Summary${delimiter}${spreadsheetSafe(result.value || result.message || result.title)}`].join("\n");
}

export function advancedResultSummaryToText(result) {
  const scope = result.scope?.leagueId || result.structuredQuery?.leagueId || "";
  const window = result.scope?.dateRange || result.structuredQuery?.dateRange || {};
  const lines = [
    "EdgeBoard sample statistical result",
    result.title,
    `Scope: ${scope || "unspecified"} · Date range: ${JSON.stringify(window)}`,
    `Aggregation: ${result.aggregation || result.structuredQuery?.aggregation || "unspecified"}`,
  ];
  if (result.type === "leaderboard") {
    result.rows.slice(0, 3).forEach((row) => {
      lines.push(`${row.rank}. ${row.displayName}: ${row.value} (${row.sampleSize} events)`);
    });
  } else if (result.type?.includes("comparison")) {
    result.headlineDifferences.slice(0, 3).forEach((item) => {
      lines.push(`${item.label}: ${item.leaderName} leads the selected sample by ${item.difference}.`);
    });
  } else {
    lines.push(String(result.value || result.message || "See supporting rows."));
  }
  lines.push(`Source: ${result.sources?.[0]?.provider || "Sample historical data"} · Updated: ${result.sources?.[0]?.lastUpdated || result.lastUpdated || "unknown"}`);
  lines.push("Illustrative sample data; not an official or complete record.");
  return lines.map(spreadsheetSafe).join("\n");
}

export function advancedResultToCsv(result) {
  return advancedResultToText(result, "\t").split("\n").map((line) =>
    line.split("\t").map((cell) => `"${spreadsheetSafe(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
}
