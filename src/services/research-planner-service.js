import { getMarketDefinition } from "../config/market-catalog.js";
import { getStatDefinition } from "../config/stat-registry.js";
import { classifyResearchQuery } from "./query-classifier.js";
import { normalizeResearchMode } from "./research-mode-service.js";

const INTENT_FAMILIES = Object.freeze([
  ["same_game_correlation", /\b(same[- ]game|sgp|correlat(?:ion|ed))\b/i],
  ["parlay_research", /\b(parlay|multi[- ]leg|two[- ]leg|three[- ]leg|four[- ]leg|\d+\s*leg)\b/i],
  ["prop_research", /\b(prop|props|over candidate|under candidate)\b/i],
  ["matchup_research", /\b(matchup|against|versus|vs\.?|opponent)\b/i],
  ["sport_discovery", /\b(which|what|show|find).+\b(sports?|leagues?).+\b(available|active|live|today)\b/i],
  ["league_discovery", /\b(active|available|live|today).+\b(leagues?|competitions?)\b/i],
  ["comparison", /\b(compare|comparison|versus|vs\.?)\b/i],
  ["fun_facts", /\b(fun fact|interesting|unusual|rare|rarity)\b/i],
  ["game_logs", /\b(game log|game-by-game|by game|last \d+ (?:games?|matches?|fights?|races?))\b/i],
  ["splits", /\b(split|home|away|starter|bench|wins|losses|vs left|vs right)\b/i],
  ["records", /\b(record|career high|season high|all[- ]time|single[- ]game high)\b/i],
  ["trends", /\b(trend|trending|recent form|what changed)\b/i],
  ["streaks", /\b(streak|consecutive|in a row)\b/i],
  ["milestones", /\b(milestone|away from|needs? \d+)\b/i],
  ["historical_threshold", /\b(over|under|exceeded|cleared|threshold|hit rate)\s*[+-]?\d+(?:\.\d+)?/i],
  ["leaderboards", /\b(who leads|leaderboard|leaders?|top \d+|most|fewest|highest|lowest|best)\b/i],
  ["betting_research", /\b(odds|line|market|sportsbook|edge|confidence|rated highly|upside)\b/i],
  ["team_lookup", /\b(team|club|roster)\b/i],
]);

function determineQuestionType(query, classifiedIntent, structuredQuery) {
  const matched = INTENT_FAMILIES.find(([, expression]) => expression.test(query));
  if (matched) return matched[0];
  if (structuredQuery?.teamIds?.length) return "team_lookup";
  if (structuredQuery?.playerIds?.length) return "player_lookup";
  if (classifiedIntent.includes("leaderboard") || classifiedIntent === "performance_ranking") return "leaderboards";
  if (classifiedIntent.includes("comparison")) return "comparison";
  if (classifiedIntent.includes("insight") || classifiedIntent === "fun_fact") return "fun_facts";
  return classifiedIntent === "betting_research" ? "betting_research" : "statistical_lookup";
}

function labelStat(statId) {
  return getStatDefinition(statId)?.displayName || statId;
}

function stage(id, label, detail, status = "planned") {
  return Object.freeze({ id, label, detail, status });
}

function evidenceNeeds(questionType, mode) {
  const needs = ["source attribution", "sample size", "date range", "coverage", "validation", "provider freshness"];
  if (["comparison", "leaderboards", "historical_threshold", "records"].includes(questionType)) {
    needs.push("qualification and comparison scope");
  }
  if (["trends", "streaks", "milestones", "fun_facts"].includes(questionType)) {
    needs.push("supporting completed-event rows");
  }
  if (mode !== "stats") needs.push("current market availability and update time");
  return needs;
}

function normalizeStoryContext(context) {
  if (!context?.storyId || !context?.claimData || !context?.supportingEvidence?.length) return null;
  return Object.freeze({
    storyId: String(context.storyId),
    headline: String(context.headline || "Validated story context"),
    entityIds: Object.freeze([...new Set(context.entityIds || [])]),
    sportId: String(context.sportId || ""),
    leagueId: String(context.leagueId || ""),
    eventIds: Object.freeze([...new Set(context.eventIds || [])]),
    claimData: Object.freeze({ ...context.claimData }),
    supportingEvidence: Object.freeze(context.supportingEvidence.map((item) => Object.freeze({
      id: String(item.id || ""),
      type: String(item.type || "story_evidence"),
      label: String(item.label || "Supporting story evidence"),
      eventId: item.eventId || null,
      occurredAt: item.occurredAt || null,
      values: Object.freeze({ ...(item.values || {}) }),
      sourceId: item.sourceId || null,
      status: item.status || null,
    }))),
    dateRange: Object.freeze({ ...(context.dateRange || {}) }),
    sourceIds: Object.freeze([...new Set(context.sourceIds || [])]),
    sources: Object.freeze((context.sources || []).map((source) => Object.freeze({
      id: String(source.id || ""),
      label: String(source.label || source.id || "Source unavailable"),
      sample: source.sample !== false,
    }))),
    freshness: Object.freeze({ ...(context.freshness || {}) }),
    warnings: Object.freeze([...(context.warnings || [])].map(String)),
    validationStatus: String(context.validationStatus || "unvalidated"),
    researchQuality: context.researchQuality ? Object.freeze({ ...context.researchQuality }) : null,
  });
}

function normalizeDiscoveryContext(context) {
  if (!context?.itemId || !context?.title || (!context?.queryTemplate?.query && !context?.sourceSignals?.length)) return null;
  return Object.freeze({
    itemId: String(context.itemId), type: String(context.type || "research_topic"), title: String(context.title),
    entityIds: Object.freeze([...new Set(context.entityIds || [])]), eventIds: Object.freeze([...new Set(context.eventIds || [])]),
    storyIds: Object.freeze([...new Set(context.storyIds || [])]), statIds: Object.freeze([...new Set(context.statIds || [])]),
    marketIds: Object.freeze([...new Set(context.marketIds || [])]), sportId: String(context.sportId || ""), leagueId: String(context.leagueId || ""),
    queryTemplate: Object.freeze({ ...(context.queryTemplate || {}) }),
    sourceSignals: Object.freeze((context.sourceSignals || []).map((signal) => Object.freeze({ ...signal }))),
    sources: Object.freeze((context.sources || []).map((source) => Object.freeze({ id: source.id, label: source.label, sample: source.sample !== false }))),
    freshness: Object.freeze({ ...(context.freshness || {}) }), validationStatus: String(context.validationStatus || "unvalidated"),
    edgeTrust: context.edgeTrust ? Object.freeze({ ...context.edgeTrust }) : null,
    researchQuality: context.researchQuality ? Object.freeze({ ...context.researchQuality }) : null,
    warnings: Object.freeze([...(context.warnings || [])].map(String)),
  });
}

export function createResearchPlan({
  query = "",
  mode = "stats",
  parsedStats = null,
  bettingWorkflow = null,
  currentLeague = null,
  availableLeagues = [],
  providerName = "",
  resolvedEntities = [],
  storyContext = null,
  discoveryContext = null,
} = {}) {
  const safeQuery = String(query || "").trim();
  const safeMode = normalizeResearchMode(mode, "stats");
  const classification = classifyResearchQuery(safeQuery, safeMode);
  const normalizedStoryContext = normalizeStoryContext(storyContext);
  const normalizedDiscoveryContext = normalizeDiscoveryContext(discoveryContext);
  const structuredQuery = parsedStats?.structuredQuery || null;
  const questionType = determineQuestionType(safeQuery, classification.intent, structuredQuery);
  const entityIds = [...new Set([
    ...(structuredQuery
      ? [
      ...(structuredQuery.playerIds || []),
      ...(structuredQuery.teamIds || []),
      ...(structuredQuery.primaryEntityIds || []),
      ] : []),
    ...resolvedEntities.map((entity) => entity.id),
    ...(normalizedStoryContext?.entityIds || []),
    ...(normalizedDiscoveryContext?.entityIds || []),
  ])];
  const statIds = structuredQuery?.statIds?.length ? structuredQuery.statIds : normalizedDiscoveryContext?.statIds || [];
  const marketIds = [
    structuredQuery?.rankingMetric && safeMode !== "stats" ? structuredQuery.rankingMetric : "",
    bettingWorkflow?.marketId || "",
    ...(normalizedDiscoveryContext?.marketIds || []),
  ].filter(Boolean);
  const resolvedLeagueId = normalizedStoryContext?.leagueId || normalizedDiscoveryContext?.leagueId || structuredQuery?.leagueId || bettingWorkflow?.leagueId || currentLeague?.leagueId || "";
  const resolvedSportId = normalizedStoryContext?.sportId || normalizedDiscoveryContext?.sportId || structuredQuery?.sportId || currentLeague?.sportId || "";
  const scopeLabel = [
    currentLeague?.sportDisplayName || resolvedSportId,
    currentLeague?.leagueDisplayName || resolvedLeagueId,
  ].filter(Boolean).join(" · ") || "Unresolved scope";
  const statLabels = statIds.map(labelStat);
  const marketLabels = marketIds.map((id) => getMarketDefinition(id)?.displayName || id);
  const needsBetting = safeMode !== "stats";
  const needsStats = safeMode !== "betting" || [
    "comparison", "leaderboards", "game_logs", "splits", "records", "trends",
    "streaks", "milestones", "fun_facts", "historical_threshold",
  ].includes(questionType);
  const discoveryLeagues = ["sport_discovery", "league_discovery"].includes(questionType)
    ? availableLeagues.filter((league) => league?.enabled).map((league) => Object.freeze({
      sportId: league.sportId,
      sportName: league.sportDisplayName,
      leagueId: league.leagueId,
      leagueName: league.leagueDisplayName,
      status: league.availabilityStatus,
      liveEventCount: Number(league.liveEventCount) || 0,
      todayEventCount: Number(league.todayEventCount) || 0,
      availableMarketCount: Number(league.availableMarketCount) || 0,
      playerPropCount: Number(league.playerPropCount) || 0,
      lastUpdated: league.lastUpdatedAt || null,
    }))
    : [];

  return Object.freeze({
    version: 1,
    query: safeQuery,
    mode: safeMode,
    classifiedIntent: classification.intent,
    questionType,
    resolvedScope: Object.freeze({
      sportId: resolvedSportId,
      leagueId: resolvedLeagueId,
      label: scopeLabel,
      explicitOverride: structuredQuery?.scopeOverride === true,
    }),
    entityIds: Object.freeze(entityIds),
    resolvedEntities: Object.freeze(resolvedEntities.map((entity) => Object.freeze({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      typeLabel: entity.typeLabel,
      sportId: entity.sportId,
      leagueId: entity.leagueId,
      profileSystem: entity.profileSystem,
    }))),
    statIds: Object.freeze([...statIds]),
    marketIds: Object.freeze(marketIds),
    storyContext: normalizedStoryContext,
    discoveryContext: normalizedDiscoveryContext,
    discovery: Object.freeze({
      provider: providerName || bettingWorkflow?.evidence?.provider || "Normalized sports registry",
      leagues: Object.freeze(discoveryLeagues),
    }),
    requirements: Object.freeze({
      stats: needsStats,
      betting: needsBetting,
      comparisons: ["comparison", "leaderboards", "historical_threshold", "records"].includes(questionType),
      insights: ["trends", "streaks", "milestones", "fun_facts", "records"].includes(questionType),
      supportingEvidence: Object.freeze([
        ...evidenceNeeds(questionType, safeMode),
        ...(normalizedStoryContext ? ["retained structured story claim and supporting rows"] : []),
        ...(normalizedDiscoveryContext ? ["retained discovery signals, canonical references, and trust metadata"] : []),
      ]),
    }),
    stages: Object.freeze([
      stage("resolve", "Resolve entities", entityIds.length
        ? `${entityIds.length} canonical entity ID${entityIds.length === 1 ? "" : "s"} resolved.`
        : "No explicit canonical entity is required or one could not be resolved.",
      entityIds.length || ["leaderboards", "sport_discovery", "league_discovery", "betting_research", "parlay_research"].includes(questionType)
        ? "ready" : "limited"),
      stage("intent", "Determine intent", `${questionType.replaceAll("_", " ")} · ${classification.intent}`, "ready"),
      stage("statistics", "Determine statistics", statLabels.length
        ? statLabels.join(", ")
        : needsStats ? "No canonical statistic resolved; the answer must disclose this limitation." : "Statistics not required by this mode.",
      !needsStats || statLabels.length ? "ready" : "limited"),
      stage("markets", "Determine markets", marketLabels.length
        ? marketLabels.join(", ")
        : needsBetting ? "Use only provider-confirmed markets in the resolved scope." : "Betting retrieval disabled in Stats mode.",
      needsBetting ? "ready" : "skipped"),
      stage("evidence", "Determine supporting evidence", normalizedStoryContext
        ? `${evidenceNeeds(questionType, safeMode).join(", ")}; retain ${normalizedStoryContext.supportingEvidence.length} structured story evidence item${normalizedStoryContext.supportingEvidence.length === 1 ? "" : "s"} without broadening the claim.`
        : normalizedDiscoveryContext
          ? `${evidenceNeeds(questionType, safeMode).join(", ")}; retain ${normalizedDiscoveryContext.sourceSignals.length} deterministic discovery signal${normalizedDiscoveryContext.sourceSignals.length === 1 ? "" : "s"} without treating relevance as popularity.`
          : evidenceNeeds(questionType, safeMode).join(", "), "ready"),
      stage("comparisons", "Determine related comparisons", questionType === "comparison"
        ? "Apply identical filters to every resolved entity."
        : "Related comparisons are optional and cannot change the primary finding.",
      questionType === "comparison" ? "ready" : "optional"),
      stage("findings", "Generate structured findings", "Only validated engine output may become a finding.", "pending"),
      stage("explain", "Generate explanation", "Templates may phrase findings but may not introduce facts or numbers.", "pending"),
    ]),
  });
}
