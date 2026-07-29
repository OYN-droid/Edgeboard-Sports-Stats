import { STAT_REGISTRY, getAvailableStats } from "../config/stat-registry.js";
import { classifyResearchQuery } from "./query-classifier.js";
import {
  resolveCanonicalEntities,
  resolveEntityList,
} from "./entity-resolver.js";
import { normalizeResearchMode } from "./research-mode-service.js";
import { resolveLeagueFromQuery } from "./research-service.js";

const VALID_INTENTS = new Set([
  "statistical_lookup", "athlete_comparison", "team_comparison", "multi_entity_comparison",
  "league_leaderboard", "team_leaderboard", "event_leaderboard", "performance_ranking",
  "single_game_high", "season_high", "career_high", "streak_leaderboard", "threshold_leaderboard",
  "historical_record", "record_progression", "statistical_filter", "multi_stat_filter",
  "cohort_analysis", "head_to_head_history", "event_search", "game_log_search",
  "mixed_stats_betting", "betting_research", "unsupported", "ambiguous",
  // Backward-compatible aliases for persisted Phase 1 query state.
  "player_game_log", "player_split", "player_comparison", "leaderboard", "trend", "streak", "milestone",
]);
const AGGREGATIONS = new Set(["sum", "total", "average", "per-game", "minimum", "maximum", "median", "count", "percentage", "rate"]);
const COMPARISON_OPERATORS = new Set(["gt", "gte", "lt", "lte", "eq", "between"]);
const DATE_RANGE_TYPES = new Set([
  "today", "yesterday", "this_week", "this_month", "season", "career",
  "last_n_games", "last_n_days", "since", "between",
]);
const DEFAULT_STATS_BY_SPORT = Object.freeze({
  basketball: ["basketball-points", "basketball-assists", "basketball-rebounds"],
  baseball: ["baseball-hits", "baseball-home-runs", "baseball-runs-batted-in"],
  "american-football": ["football-passing-yards", "football-passing-touchdowns", "football-interceptions"],
  "ice-hockey": ["hockey-points", "hockey-shots-on-goal", "hockey-goals"],
  soccer: ["soccer-goals", "soccer-assists", "soccer-shots-on-target"],
  mma: ["combat-wins", "combat-significant-strikes-landed", "combat-knockdowns"],
  boxing: ["combat-wins", "combat-knockout-wins", "combat-knockdowns"],
  motorsport: ["motorsport-points", "motorsport-podiums", "motorsport-average-finishing-position"],
});

const normalizeText = (value) => String(value || "").toLowerCase().replaceAll(/[^a-z0-9%]+/g, " ").trim();
const nullableNumber = (value) => value === null || value === undefined || value === ""
  ? null
  : Number.isFinite(Number(value)) ? Number(value) : null;

function mentionsLeague(query, league) {
  const text = normalizeText(query);
  return [league?.leagueId, league?.leagueDisplayName, ...(league?.queryTerms || [])]
    .filter(Boolean)
    .some((term) => (` ${text} `).includes(` ${normalizeText(term)} `));
}

function extractDateRange(text) {
  const lastGames = text.match(/\blast\s+(\d{1,2})\s+(?:games?|matches?|fights?|races?)\b/i);
  if (lastGames) return { type: "last_n_games", value: Math.min(100, Number(lastGames[1])) };
  const lastDays = text.match(/\blast\s+(\d{1,3})\s+days?\b/i);
  if (lastDays) return { type: "last_n_days", value: Math.min(365, Number(lastDays[1])) };
  const between = text.match(/\bbetween\s+(\d{4}-\d{2}-\d{2})\s+and\s+(\d{4}-\d{2}-\d{2})\b/i);
  if (between) return { type: "between", start: between[1], end: between[2] };
  const since = text.match(/\bsince\s+(\d{4}-\d{2}-\d{2})\b/i);
  if (since) return { type: "since", start: since[1] };
  if (/\byesterday\b/i.test(text)) return { type: "yesterday" };
  if (/\btoday\b/i.test(text)) return { type: "today" };
  if (/\bthis week\b/i.test(text)) return { type: "this_week" };
  if (/\bthis month\b/i.test(text)) return { type: "this_month" };
  if (/\blast season\b/i.test(text)) return { type: "season", value: "previous" };
  if (/\bthis season\b/i.test(text)) return { type: "season", value: "current" };
  if (/\bcareer\b/i.test(text)) return { type: "career" };
  return { type: "last_n_games", value: 10 };
}

function extractAggregation(text, intent) {
  if (/\b(total|sum)\b/i.test(text)) return "sum";
  if (/\b(average|averaging|per game|per event)\b/i.test(text)) return "average";
  if (/\bpercentage|percent|rate\b/i.test(text)) return "percentage";
  if (intent.includes("leaderboard") && intent !== "event_leaderboard") return "sum";
  if (/\b(maximum|max|highest|most)\b/i.test(text)) return "maximum";
  if (/\b(minimum|min|lowest|fewest)\b/i.test(text)) return "minimum";
  if (/\bmedian\b/i.test(text)) return "median";
  if (/\bcount\b/i.test(text)) return "count";
  if (/\bhow many\b/i.test(text) && !/\baverage|per game\b/i.test(text)) return "sum";
  return "average";
}

function extractComparison(text) {
  const match = text.match(/\b(at least|more than|over|fewer than|less than|under|equal to|exactly)\s*([+-]?\d+(?:\.\d+)?)\b/i);
  if (!match) return { comparisonOperator: null, comparisonValue: null };
  const operators = {
    "at least": "gte",
    "more than": "gt",
    over: "gt",
    "fewer than": "lt",
    "less than": "lt",
    under: "lt",
    "equal to": "eq",
    exactly: "eq",
  };
  return { comparisonOperator: operators[match[1].toLowerCase()], comparisonValue: Number(match[2]) };
}

function extractSplits(text) {
  const asksForWinSplit = /\b(?:in|during)\s+(?:team\s+)?wins\b/i.test(text);
  const asksForLossSplit = /\b(?:in|during)\s+(?:team\s+)?losses\b/i.test(text);
  return {
    homeAway: /\bhome\b/i.test(text) ? "home" : /\baway\b/i.test(text) ? "away" : "",
    starterStatus: /\bbench\b/i.test(text) ? "bench" : /\bstarts?|starter\b/i.test(text) ? "starter" : "",
    gameResult: asksForWinSplit ? "win" : asksForLossSplit ? "loss" : "",
    period: /\bfirst quarter\b/i.test(text) ? "first-quarter"
      : /\bfirst half\b/i.test(text) ? "first-half"
        : /\bsecond half\b/i.test(text) ? "second-half" : "full-event",
    splitType: /\bvs left|left-handed\b/i.test(text) ? "vs-left-handed"
      : /\bvs right|right-handed\b/i.test(text) ? "vs-right-handed"
        : /\bstreet circuits?\b/i.test(text) ? "track-type"
          : /\broad courses?\b/i.test(text) ? "track-type"
        : /\bby opponent|opponent split\b/i.test(text) ? "opponent"
          : /\bhome|away\b/i.test(text) ? "home-away"
            : asksForWinSplit || asksForLossSplit ? "result" : "",
  };
}

function statMentionPosition(text, definition) {
  const normalized = normalizeText(text);
  const searchable = ` ${normalized} `;
  return [definition.displayName, definition.shortName, ...definition.searchTerms, ...definition.providerAliases]
    .map(normalizeText)
    .filter(Boolean)
    .map((term) => {
      const index = searchable.indexOf(` ${term} `);
      return index < 0 ? -1 : Math.max(0, index - 1);
    })
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? Number.MAX_SAFE_INTEGER;
}

function resolveStats(text, sportId, leagueId) {
  const normalized = normalizeText(text);
  const matches = getAvailableStats(sportId, leagueId).map((definition) => {
    const terms = [definition.displayName, definition.shortName, ...definition.searchTerms, ...definition.providerAliases]
      .map(normalizeText)
      .filter((term) => term.length > 1);
    const score = terms.reduce((best, term) => (` ${normalized} `).includes(` ${term} `) ? Math.max(best, term.length) : best, 0);
    return { definition, score };
  }).filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.definition.displayOrder - b.definition.displayOrder);
  const selected = [];
  matches.forEach(({ definition }) => {
    if (!selected.some((item) => item.id === definition.id)) selected.push(definition);
  });
  return selected.sort((left, right) => statMentionPosition(text, left) - statMentionPosition(text, right));
}

function extractThresholdDefinitions(text, stats) {
  const normalized = normalizeText(text);
  const inheritedOperator = /\bat least\b/i.test(text) ? "gte"
    : /\bmore than|above\b/i.test(text) ? "gt"
      : /\bat most\b/i.test(text) ? "lte"
        : /\bfewer than|less than|below\b/i.test(text) ? "lt" : null;
  const operators = {
    "at least": "gte", "more than": "gt", above: "gt", over: "gt",
    "at most": "lte", "fewer than": "lt", "less than": "lt", below: "lt", under: "lt",
    exactly: "eq",
  };
  return stats.flatMap((definition) => {
    const position = statMentionPosition(normalized, definition);
    if (!Number.isFinite(position) || position === Number.MAX_SAFE_INTEGER) return [];
    const prefix = normalized.slice(Math.max(0, position - 48), position);
    const range = prefix.match(/\bbetween\s+([+-]?\d+(?:\.\d+)?)\s+and\s+([+-]?\d+(?:\.\d+)?)\s*$/);
    if (range) return [{
      statId: definition.id, operator: "between", value: Number(range[1]), maxValue: Number(range[2]),
      aggregation: "average",
    }];
    const match = prefix.match(/\b(at least|more than|above|over|at most|fewer than|less than|below|under|exactly)?\s*([+-]?\d+(?:\.\d+)?)\s*$/);
    const fallback = inheritedOperator
      ? [...prefix.matchAll(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)/g)].at(-1)
      : null;
    if (!match && !fallback) return [];
    return [{
      statId: definition.id,
      operator: match?.[1] ? operators[match[1]] : inheritedOperator || "gte",
      value: Number(match?.[2] ?? fallback?.[0]),
      maxValue: null,
      aggregation: "average",
    }];
  });
}

function extractResultLimit(text) {
  const match = text.match(/\btop\s+(\d{1,3})\b/i);
  return match ? Math.min(100, Math.max(1, Number(match[1]))) : 10;
}

export function createStatisticalQuery(input = {}) {
  const mode = normalizeResearchMode(input.mode, "stats");
  const intent = VALID_INTENTS.has(input.intent) ? input.intent : "ambiguous";
  const aggregation = AGGREGATIONS.has(input.aggregation) ? input.aggregation : "average";
  const comparisonOperator = COMPARISON_OPERATORS.has(input.comparisonOperator) ? input.comparisonOperator : null;
  return Object.freeze({
    mode,
    intent,
    sportId: String(input.sportId || ""),
    leagueId: String(input.leagueId || ""),
    competitionId: String(input.competitionId || ""),
    season: String(input.season || ""),
    seasonType: String(input.seasonType || "regular-season"),
    entityType: ["player", "team", "competitor", "event"].includes(input.entityType) ? input.entityType : "player",
    playerIds: Object.freeze(Array.isArray(input.playerIds) ? [...new Set(input.playerIds.filter(Boolean))] : []),
    teamIds: Object.freeze(Array.isArray(input.teamIds) ? [...new Set(input.teamIds.filter(Boolean))] : []),
    opponentIds: Object.freeze(Array.isArray(input.opponentIds) ? [...new Set(input.opponentIds.filter(Boolean))] : []),
    eventIds: Object.freeze(Array.isArray(input.eventIds) ? [...new Set(input.eventIds.filter(Boolean))] : []),
    primaryEntityIds: Object.freeze(Array.isArray(input.primaryEntityIds)
      ? [...new Set(input.primaryEntityIds.filter(Boolean))]
      : [...new Set([...(input.playerIds || []), ...(input.teamIds || [])].filter(Boolean))]),
    comparisonEntityIds: Object.freeze(Array.isArray(input.comparisonEntityIds) ? [...new Set(input.comparisonEntityIds.filter(Boolean))] : []),
    entitySet: Object.freeze(Array.isArray(input.entitySet) ? [...new Set(input.entitySet.filter(Boolean))] : []),
    entitySetSource: String(input.entitySetSource || (input.leagueId ? "league" : "explicit")),
    cohortDefinition: Object.freeze(input.cohortDefinition && typeof input.cohortDefinition === "object" ? { ...input.cohortDefinition } : {}),
    comparisonBaseline: String(input.comparisonBaseline || ""),
    statIds: Object.freeze(Array.isArray(input.statIds) ? [...new Set(input.statIds.filter(Boolean))] : []),
    derivedStatIds: Object.freeze(Array.isArray(input.derivedStatIds) ? [...new Set(input.derivedStatIds.filter(Boolean))] : []),
    aggregation,
    secondaryAggregation: AGGREGATIONS.has(input.secondaryAggregation) ? input.secondaryAggregation : "",
    rankingMetric: String(input.rankingMetric || input.statIds?.[0] || ""),
    tieBreakerMetrics: Object.freeze(Array.isArray(input.tieBreakerMetrics) ? [...new Set(input.tieBreakerMetrics.filter(Boolean))] : []),
    comparisonOperator,
    comparisonValue: nullableNumber(input.comparisonValue),
    thresholdDefinitions: Object.freeze(Array.isArray(input.thresholdDefinitions)
      ? input.thresholdDefinitions.map((condition) => Object.freeze({ ...condition }))
      : []),
    dateRange: input.dateRange && typeof input.dateRange === "object" ? Object.freeze({ ...input.dateRange }) : Object.freeze({ type: "last_n_games", value: 10 }),
    lastNGames: nullableNumber(input.lastNGames) === null ? null : Math.max(1, nullableNumber(input.lastNGames)),
    competition: String(input.competition || input.competitionId || ""),
    competitionStage: String(input.competitionStage || ""),
    homeAway: ["home", "away"].includes(input.homeAway) ? input.homeAway : "",
    starterStatus: ["starter", "bench"].includes(input.starterStatus) ? input.starterStatus : "",
    gameResult: ["win", "loss"].includes(input.gameResult) ? input.gameResult : "",
    opponentRank: input.opponentRank || null,
    opponentGroup: String(input.opponentGroup || ""),
    minimumMinutes: nullableNumber(input.minimumMinutes),
    minimumGames: nullableNumber(input.minimumGames),
    minimumAttempts: nullableNumber(input.minimumAttempts),
    minimumPlateAppearances: nullableNumber(input.minimumPlateAppearances),
    minimumInnings: nullableNumber(input.minimumInnings),
    minimumRounds: nullableNumber(input.minimumRounds),
    minimumFights: nullableNumber(input.minimumFights),
    minimumStarts: nullableNumber(input.minimumStarts),
    venueType: String(input.venueType || ""),
    surfaceType: String(input.surfaceType || ""),
    trackType: String(input.trackType || ""),
    qualifyingRules: Object.freeze(input.qualifyingRules && typeof input.qualifyingRules === "object" ? { ...input.qualifyingRules } : {}),
    period: String(input.period || "full-event"),
    settlementScope: String(input.settlementScope || ""),
    splitType: String(input.splitType || ""),
    groupBy: String(input.groupBy || (intent === "player_game_log" ? "game" : "summary")),
    sortDirection: ["asc", "desc", "ascending", "descending"].includes(input.sortDirection)
      ? (input.sortDirection.startsWith("asc") ? "asc" : "desc") : "",
    sort: Object.freeze(input.sort && typeof input.sort === "object" ? { ...input.sort } : { direction: "" }),
    resultLimit: Math.min(100, Math.max(1, Number(input.resultLimit || input.limit) || 10)),
    limit: Math.min(100, Math.max(1, Number(input.resultLimit || input.limit) || 10)),
    includeRanks: input.includeRanks !== false,
    includePercentiles: input.includePercentiles === true,
    includeGameLogs: input.includeGameLogs === true || input.includeGameLog === true || ["game_log_search", "player_game_log"].includes(intent),
    includeGameLog: input.includeGameLogs === true || input.includeGameLog === true || ["game_log_search", "player_game_log"].includes(intent),
    includeSupportingRows: input.includeSupportingRows !== false,
    includeHistoricalContext: input.includeHistoricalContext === true,
    includeRecordValidation: input.includeRecordValidation === true || ["historical_record", "single_game_high", "season_high", "career_high"].includes(intent),
    includeSummary: input.includeSummary !== false,
    includeComparison: input.includeComparison === true || ["athlete_comparison", "player_comparison", "team_comparison", "multi_entity_comparison"].includes(intent),
    includeBettingContext: input.includeBettingContext === true || mode === "both",
    confidenceThreshold: nullableNumber(input.confidenceThreshold) === null
      ? null
      : Math.min(100, Math.max(0, nullableNumber(input.confidenceThreshold))),
    contextOverride: input.contextOverride === true,
    scopeOverride: input.scopeOverride === true || input.contextOverride === true,
    requestedDisplayType: ["cards", "table", "trend", "overlay"].includes(input.requestedDisplayType)
      ? input.requestedDisplayType : "table",
    conditionLogic: input.conditionLogic === "or" ? "or" : "and",
  });
}

export function parseStatisticalQuery(query, {
  mode = "stats",
  sportsRepository,
  currentLeagueId = "",
  selectedEntityId = "",
  ignoreExplicitLeague = false,
} = {}) {
  const text = String(query || "").trim();
  const classification = classifyResearchQuery(text, mode);
  const currentLeague = sportsRepository?.getLeague(currentLeagueId) || null;
  const resolvedLeague = sportsRepository ? resolveLeagueFromQuery(text, sportsRepository, currentLeagueId) : currentLeague;
  const explicitLeague = !ignoreExplicitLeague && Boolean(resolvedLeague && mentionsLeague(text, resolvedLeague));
  const initialLeague = explicitLeague ? resolvedLeague : currentLeague || resolvedLeague;
  const context = { leagueId: initialLeague?.leagueId || "", sportId: initialLeague?.sportId || "" };
  const exactResolution = resolveCanonicalEntities(text, context);
  const entityMatches = resolveEntityList(text, context);
  const entityLeagueIds = [...new Set(entityMatches.map((entity) => entity.leagueId).filter(Boolean))];
  const entityLeague = entityLeagueIds.length === 1 ? sportsRepository?.getLeague(entityLeagueIds[0]) : null;
  const league = explicitLeague ? resolvedLeague : entityLeague || initialLeague;
  const inferredEntityScope = Boolean(entityLeague && currentLeague && entityLeague.leagueId !== currentLeague.leagueId);
  const selectedFallback = selectedEntityId ? [selectedEntityId] : [];
  const selectedAmbiguousCandidate = exactResolution.status === "ambiguous"
    ? exactResolution.candidates.find((candidate) => candidate.id === selectedEntityId)
    : null;
  const playerIds = exactResolution.status === "ambiguous" && !selectedAmbiguousCandidate
    ? []
    : selectedAmbiguousCandidate
      ? [selectedAmbiguousCandidate.id]
      : (entityMatches.length ? entityMatches.filter((entity) => entity.entityType !== "team").map((entity) => entity.id) : selectedFallback);
  const teamIds = entityMatches.filter((entity) => entity.entityType === "team").map((entity) => entity.id);
  let stats = resolveStats(text, league?.sportId || "", league?.leagueId || "");
  const comparison = extractComparison(text);
  const dateRange = extractDateRange(text);
  const splits = extractSplits(text);
  const unsupportedFilters = [];
  if (/\bconference|division\b/i.test(text)) unsupportedFilters.push("conference-or-division");
  if (/\bopponent rank|top \d+ defense\b/i.test(text)) unsupportedFilters.push("opponent-rank");
  if (/\bfantasy points?|qbr|war\b/i.test(text)) {
    unsupportedFilters.push("unsupported-stat");
    stats = [];
  }
  if (!stats.length && ["game_log_search", "player_game_log", "athlete_comparison", "player_comparison", "team_comparison", "multi_entity_comparison"].includes(classification.intent)) {
    stats = (DEFAULT_STATS_BY_SPORT[league?.sportId] || [])
      .map((id) => STAT_REGISTRY.find((definition) => definition.id === id))
      .filter(Boolean);
  }
  const warnings = [];
  if (classification.conflict) warnings.push(`Detected ${classification.recommendedMode} intent while ${classification.selectedMode} mode remains selected.`);
  if ((explicitLeague || inferredEntityScope) && currentLeague && currentLeague.leagueId !== league.leagueId) {
    warnings.push(`Query overrides the selected ${currentLeague.leagueDisplayName} context with ${league.leagueDisplayName}.`);
  }
  if (!stats.length && !["betting_research", "ambiguous", "unsupported"].includes(classification.intent)) warnings.push("No supported canonical stat was recognized.");
  let resolvedIntent = classification.intent;
  if (teamIds.length >= 2 && ["athlete_comparison", "multi_entity_comparison"].includes(resolvedIntent)) resolvedIntent = "team_comparison";
  if (playerIds.length > 2 && resolvedIntent === "athlete_comparison") resolvedIntent = "multi_entity_comparison";
  const thresholdDefinitions = extractThresholdDefinitions(text, stats);
  const eventIds = [...text.matchAll(/\bevent\s+id\s*[:#]?\s+([a-z0-9][a-z0-9_-]{2,})\b/gi)]
    .map((match) => match[1]);
  if (thresholdDefinitions.length > 1 && ["statistical_filter", "statistical_lookup"].includes(resolvedIntent)) resolvedIntent = "multi_stat_filter";
  const unresolvedEntities = exactResolution.status === "unresolved"
    && !["league_leaderboard", "team_leaderboard", "event_leaderboard", "performance_ranking", "cohort_analysis",
      "streak_leaderboard", "threshold_leaderboard", "single_game_high", "season_high", "career_high",
      "historical_record", "record_progression", "statistical_filter", "multi_stat_filter",
      "team_comparison", "betting_research", "unsupported", "event_search"].includes(resolvedIntent)
    ? [text]
    : [];
  if (exactResolution.status === "ambiguous" && !selectedAmbiguousCandidate) warnings.push("Multiple canonical athletes match this name; select a candidate.");
  const aggregation = extractAggregation(text, resolvedIntent);
  const trackType = /\bstreet circuits?\b/i.test(text) ? "street"
    : /\broad courses?\b/i.test(text) ? "road-course"
      : /\boval\b/i.test(text) ? "oval" : "";
  const schema = createStatisticalQuery({
    mode,
    intent: exactResolution.status === "ambiguous" && !selectedAmbiguousCandidate ? "ambiguous" : resolvedIntent,
    sportId: league?.sportId || "",
    leagueId: league?.leagueId || "",
    seasonType: /\bplayoffs?|postseason\b/i.test(text) ? "playoffs" : "regular-season",
    entityType: teamIds.length ? "team" : ["mma", "boxing", "combat", "kickboxing", "motorsport"].includes(league?.sportId) ? "competitor" : "player",
    playerIds,
    teamIds,
    primaryEntityIds: playerIds.length ? playerIds : teamIds,
    comparisonEntityIds: (playerIds.length ? playerIds : teamIds).slice(1),
    entitySet: [...playerIds, ...teamIds],
    entitySetSource: playerIds.length || teamIds.length ? "explicit-query" : "league",
    statIds: stats.map((stat) => stat.id),
    derivedStatIds: stats.filter((stat) => stat.derivedFrom?.length).map((stat) => stat.id),
    rankingMetric: stats[0]?.id || "",
    aggregation,
    ...comparison,
    thresholdDefinitions,
    dateRange,
    lastNGames: dateRange.type === "last_n_games" ? dateRange.value : null,
    ...splits,
    trackType,
    minimumGames: text.match(/\bminimum\s+(\d+)\s+(?:games?|matches?)\b/i)?.[1],
    minimumMinutes: text.match(/\bminimum\s+(\d+)\s+minutes?\b/i)?.[1],
    minimumAttempts: text.match(/\bminimum\s+(\d+)\s+attempts?\b/i)?.[1],
    minimumPlateAppearances: text.match(/\bminimum\s+(\d+)\s+plate appearances?\b/i)?.[1],
    minimumInnings: text.match(/\bminimum\s+(\d+(?:\.\d+)?)\s+innings?\b/i)?.[1],
    minimumFights: text.match(/\bminimum\s+(\d+)\s+fights?\b/i)?.[1],
    minimumRounds: text.match(/\bminimum\s+(\d+)\s+rounds?\b/i)?.[1],
    minimumStarts: text.match(/\bminimum\s+(\d+)\s+(?:starts?|races?)\b/i)?.[1],
    groupBy: ["game_log_search", "event_search"].includes(resolvedIntent) ? "event"
      : resolvedIntent.includes("leaderboard") || resolvedIntent === "performance_ranking" ? "entity" : "summary",
    resultLimit: extractResultLimit(text),
    sortDirection: /\b(lowest|fewest|best average finish|era|goals-against)\b/i.test(text) ? "asc" : "desc",
    includePercentiles: /\bpercentile|rank\b/i.test(text),
    includeGameLogs: ["game_log_search", "event_search"].includes(resolvedIntent) || /\bby game|game log\b/i.test(text),
    includeComparison: ["athlete_comparison", "team_comparison", "multi_entity_comparison"].includes(resolvedIntent),
    includeHistoricalContext: /\bhistorical|career|record\b/i.test(text),
    includeRecordValidation: ["historical_record", "single_game_high", "season_high", "career_high"].includes(resolvedIntent),
    includeBettingContext: mode === "both" || resolvedIntent === "mixed_stats_betting",
    confidenceThreshold: text.match(/confidence\s*(?:over|at least)?\s*(\d{1,3})/i)?.[1],
    contextOverride: (explicitLeague || inferredEntityScope) && currentLeague?.leagueId !== league?.leagueId,
    scopeOverride: (explicitLeague || inferredEntityScope) && currentLeague?.leagueId !== league?.leagueId,
    conditionLogic: /\bor\b/i.test(text) && thresholdDefinitions.length > 1 ? "or" : "and",
    eventIds,
  });
  const suggestedCorrections = [];
  if (exactResolution.status === "ambiguous" && !selectedAmbiguousCandidate) suggestedCorrections.push("Choose one of the matching athletes.");
  if (unresolvedEntities.length) suggestedCorrections.push("Use a supported sample athlete name.");
  if (!stats.length) suggestedCorrections.push(`Choose one of the available ${league?.sportDisplayName || "sport"} stats.`);
  unsupportedFilters.forEach((filter) => suggestedCorrections.push(`Remove unsupported filter: ${filter}.`));
  return Object.freeze({
    structuredQuery: schema,
    classification,
    interpretationConfidence: Math.max(0, Math.min(1, classification.confidence - (warnings.length * 0.05))),
    unresolvedEntities: Object.freeze(unresolvedEntities),
    ambiguousCandidates: Object.freeze(exactResolution.status === "ambiguous" && !selectedAmbiguousCandidate ? exactResolution.candidates : []),
    unsupportedFilters: Object.freeze(unsupportedFilters),
    warnings: Object.freeze(warnings),
    suggestedCorrections: Object.freeze(suggestedCorrections),
    recognizedStats: Object.freeze(stats),
    resolvedEntities: Object.freeze(entityMatches),
  });
}

export function validateStatisticalQuery(query) {
  const errors = [];
  if (!query || typeof query !== "object") return { valid: false, errors: ["Query must be an object."] };
  if (!VALID_INTENTS.has(query.intent)) errors.push("Invalid intent.");
  if (!AGGREGATIONS.has(query.aggregation)) errors.push("Invalid aggregation.");
  if (!Array.isArray(query.statIds)) {
    errors.push("Stat IDs must be an array.");
  } else {
    const definitions = query.statIds.map((id) => STAT_REGISTRY.find((definition) => definition.id === id));
    if (definitions.some((definition) => !definition)) errors.push("Unknown canonical stat ID.");
    if (definitions.some((definition) => definition
      && (!definition.sportIds.includes(query.sportId)
        || (definition.leagueIds.length && !definition.leagueIds.includes(query.leagueId))))) {
      errors.push("A canonical stat is incompatible with the selected sport or league.");
    }
  }
  if (query.comparisonOperator && !COMPARISON_OPERATORS.has(query.comparisonOperator)) errors.push("Invalid comparison operator.");
  if (query.comparisonOperator
    && (query.comparisonValue === null
      || query.comparisonValue === undefined
      || query.comparisonValue === ""
      || !Number.isFinite(Number(query.comparisonValue)))) {
    errors.push("A comparison value is required.");
  }
  if (query.thresholdDefinitions && !Array.isArray(query.thresholdDefinitions)) {
    errors.push("Threshold definitions must be an array.");
  } else if (Array.isArray(query.thresholdDefinitions)) {
    query.thresholdDefinitions.forEach((condition) => {
      if (!condition || !query.statIds.includes(condition.statId)) errors.push("Threshold statistic is not selected.");
      if (!COMPARISON_OPERATORS.has(condition?.operator)) errors.push("Invalid threshold operator.");
      if (!Number.isFinite(Number(condition?.value))) errors.push("Threshold value is required.");
      if (condition?.operator === "between" && !Number.isFinite(Number(condition?.maxValue))) errors.push("Threshold range maximum is required.");
    });
  }
  if (!query.dateRange || typeof query.dateRange !== "object" || !DATE_RANGE_TYPES.has(query.dateRange.type)) {
    errors.push("Invalid date range.");
  }
  if (!query.sportId && !["ambiguous", "unsupported"].includes(query.intent)) errors.push("A sport context is required.");
  return { valid: errors.length === 0, errors };
}
