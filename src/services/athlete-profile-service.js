import { getAthleteProfileConfig, getProfileTabs } from "../config/athlete-profile-config.js";
import { getStatDefinition } from "../config/stat-registry.js";

const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

function formatStatValue(value, definition) {
  if (!finite(value)) return "Unavailable";
  const numeric = Number(value);
  if (definition?.unit === "ratio") return numeric.toFixed(3);
  if (definition?.valueType === "percentage") return `${numeric.toFixed(1)}%`;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function statCards(summary, statIds) {
  return statIds.flatMap((statId) => {
    const calculation = summary?.stats?.[statId];
    if (!calculation || !finite(calculation.value) || !calculation.sampleSize) return [];
    const definition = getStatDefinition(statId);
    return [{
      statId,
      label: definition?.displayName || statId,
      shortLabel: definition?.shortName || statId,
      value: formatStatValue(calculation.value, definition),
      rawValue: calculation.value,
      sampleSize: calculation.sampleSize,
      aggregation: calculation.aggregation || summary.aggregation || "average",
      source: summary.metadata?.source || "Unknown source",
    }];
  });
}

function logViewModel(log, config) {
  const availableStats = config.logStats.filter((statId) =>
    (log?.rows || []).some((row) => finite(row.stats?.[statId])));
  return {
    columns: availableStats.map((statId) => {
      const definition = getStatDefinition(statId);
      return { id: statId, label: definition?.shortName || definition?.displayName || statId };
    }),
    rows: (log?.rows || []).map((row) => ({
      id: row.row_id,
      eventId: row.event_id,
      date: row.event_date,
      opponent: row.opponent_id || "Opponent unavailable",
      result: row.result || "Result unavailable",
      homeAway: row.home_away || "",
      competition: row.competition || "",
      eventName: row.event_name || "",
      method: row.method || "",
      round: row.round,
      elapsed: row.event_time_elapsed || "",
      trackType: row.track_type || "",
      status: row.status || "unknown",
      values: Object.fromEntries(availableStats.map((statId) => [
        statId,
        finite(row.stats?.[statId]) ? formatStatValue(row.stats[statId], getStatDefinition(statId)) : null,
      ])),
    })),
    filters: {
      windows: [5, 10, 20, "season"],
      sortDirections: ["newest", "oldest"],
      homeAway: ["all", "home", "away"],
      opponents: [...new Set((log?.rows || []).map((row) => row.opponent_id).filter(Boolean))],
    },
    pagination: { initialLimit: 20, totalRows: log?.rows?.length || 0 },
    source: log?.metadata?.source || "Unknown source",
    updatedAt: log?.metadata?.lastUpdated || null,
    warnings: log?.metadata?.calculationWarnings || [],
  };
}

function propsViewModel(items) {
  const markets = items.map(({ market, selection }) => ({
    id: selection.id,
    marketId: market.id,
    canonicalMarketId: market.canonicalMarketId,
    marketName: market.displayName,
    group: market.filterGroup,
    side: selection.side || "",
    line: selection.line,
    numericLine: selection.numericLine,
    odds: selection.odds,
    sportsbook: selection.sportsbook,
    updatedAt: selection.lastUpdatedAt,
    projection: selection.projection,
    projectedEdge: selection.trend,
    historicalHitRate: selection.hitRate,
    confidence: selection.confidence,
    sampleSize: null,
    available: market.available && selection.available,
    stale: selection.stale,
    suspended: market.status === "suspended",
    modelAvailable: selection.projection !== "Projection unavailable"
      && !String(selection.projection).toLowerCase().includes("model unavailable"),
    source: market.source,
    settlementScope: market.settlementScope,
    period: market.period,
    eventId: market.eventId,
    dataQualityWarning: selection.dataQualityWarning,
  }));
  return {
    groups: [...new Set(markets.map((market) => market.group).filter(Boolean))],
    sportsbooks: [...new Set(markets.map((market) => market.sportsbook).filter(Boolean))],
    markets,
  };
}

function relatedQueries(entity, config, hasMarkets) {
  const name = entity.name;
  const templates = entity.sportId === "baseball"
    ? [`${name} last 10 games`, `${name} home and away splits`, `${name} stats by game`]
    : ["mma", "boxing", "combat", "kickboxing"].includes(entity.sportId)
      ? [`${name} last five fights`, `${name} significant strikes`, `${name} knockout rate`]
      : entity.sportId === "motorsport"
        ? [`${name} last five finishes`, `${name} average finish this season`, `${name} track splits`]
        : [`${name} last 10 games`, `${name} home and away splits`, `${name} stats by game`];
  if (hasMarkets) templates.push(`${name} current props`);
  return templates.filter((query, index, list) => list.indexOf(query) === index)
    .filter((query) => config.primaryStats.length > 0 || !query.includes("stats"));
}

function trendViewModel(trend) {
  const values = (trend?.series || []).filter((point) => point.value !== null).map((point) => point.value);
  const definition = getStatDefinition(trend?.activeStatId);
  const low = values.length ? Math.min(...values) : null;
  const high = values.length ? Math.max(...values) : null;
  return {
    availableStats: (trend?.availableStats || []).map((statId) => ({
      id: statId,
      label: getStatDefinition(statId)?.displayName || statId,
    })),
    activeStatId: trend?.activeStatId || "",
    activeStatLabel: definition?.displayName || trend?.activeStatId || "Stat",
    series: trend?.series || [],
    sampleSize: trend?.sampleSize || 0,
    accessibleSummary: values.length
      ? `${definition?.displayName || "Selected statistic"} ranged from ${low} to ${high} across ${values.length} completed sample events. Missing values are omitted.`
      : "No completed trend values are available.",
    source: trend?.source || "Unknown source",
    updatedAt: trend?.updatedAt || null,
  };
}

export class AthleteProfileRepository {
  constructor(statsProvider, sportsRepository, insightService = null) {
    this.statsProvider = statsProvider;
    this.sportsRepository = sportsRepository;
    this.insightService = insightService;
    this.cache = new Map();
  }

  searchAthletes(query, context = {}) {
    return this.statsProvider.searchAthletes(query, context).slice(0, 8).map((athlete) => ({
      id: athlete.id,
      name: athlete.name,
      shortName: athlete.profile?.shortName || athlete.name,
      teamName: athlete.profile?.teamName || athlete.teamId || "Independent",
      leagueId: athlete.leagueId,
      sportId: athlete.sportId,
      role: athlete.profile?.role || athlete.position || "",
      active: athlete.active,
      matchScore: athlete.matchScore,
    }));
  }

  async getProfile(athleteId, options = {}) {
    const cacheKey = [
      athleteId,
      options.logWindow || 10,
      options.homeAway || "all",
      options.opponent || "all",
      options.result || "all",
      options.splitDimension || "default",
      options.splitStatId || "default",
      options.trendStatId || "default",
      options.trendWindow || 10,
      options.insightStatId || "default",
      options.includeBettingContext === true ? "both" : "stats",
    ].join(":");
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    await new Promise((resolve) => globalThis.setTimeout(resolve, options.delay ?? 45));
    const profile = this.statsProvider.getAthleteProfile(athleteId);
    if (!profile) return { status: "not-found", athleteId };
    const athlete = profile.athlete;
    const config = getAthleteProfileConfig(athlete);
    const seasonSummary = this.statsProvider.getAthleteSeasonSummary(athleteId);
    const recent = this.statsProvider.getAthleteRecentForm(athleteId, { limit: 5 });
    const logFilters = {
      dateRange: options.logWindow === "season"
        ? { type: "season", value: "current" }
        : { type: "last_n_games", value: Number(options.logWindow) || 10 },
      homeAway: options.homeAway === "home" || options.homeAway === "away" ? options.homeAway : "",
      opponentIds: options.opponent ? [options.opponent] : [],
      gameResult: options.result === "win" || options.result === "loss" ? options.result : "",
    };
    const log = this.statsProvider.getAthleteGameLogs(athleteId, logFilters);
    const splits = this.statsProvider.getAthleteSplits(athleteId, {
      dimension: options.splitDimension,
      statId: options.splitStatId,
    });
    const trends = this.statsProvider.getAthleteTrends(athleteId, {
      statId: options.trendStatId,
      limit: Number(options.trendWindow) || 10,
    });
    const marketItems = this.statsProvider.getAthleteMarkets(athleteId, this.sportsRepository);
    const props = propsViewModel(marketItems);
    const insights = this.insightService
      ? this.insightService.getInsightsForProfile(athleteId, {
        statId: options.insightStatId || trends?.activeStatId,
        includeBettingContext: options.includeBettingContext === true,
      })
      : this.statsProvider.getAthleteInsights(athleteId, {
        statId: options.insightStatId || trends?.activeStatId,
        ...logFilters,
      });
    const upcomingEvent = this.statsProvider.getAthleteUpcomingEvent(athleteId);
    const matchupContext = this.statsProvider.getAthleteMatchupContext(athleteId);
    const primaryStats = statCards(seasonSummary, config.primaryStats);
    const supportingStats = statCards(seasonSummary, config.supportingStats || []);
    const gameLogs = logViewModel(log, config);
    const viewModel = Object.freeze({
      status: "ready",
      athlete,
      header: profile.header,
      tabs: getProfileTabs(athlete, {
        gameLogs: gameLogs.rows.length > 0,
        splits: Boolean(splits?.availableDimensions?.length),
        trends: Boolean(trends?.series?.length),
        props: true,
        matchup: Boolean(matchupContext),
        insights: insights.length > 0,
      }),
      overview: {
        primaryStats,
        supportingStats,
        recentForm: (recent?.rows || []).map((row) => ({
          id: row.row_id,
          eventId: row.event_id,
          date: row.event_date,
          opponent: row.opponent_id,
          value: primaryStats[0] ? row.stats?.[primaryStats[0].statId] ?? null : null,
        })),
        nextEvent: upcomingEvent,
        insights: insights.slice(0, 1),
        dataStatus: {
          source: profile.source,
          updatedAt: profile.updatedAt,
          sample: true,
          sampleSize: recent?.metadata?.sampleSize || 0,
          warnings: recent?.metadata?.calculationWarnings || [],
        },
      },
      gameLogs,
      splits: splits || { availableDimensions: [], activeDimension: null, rows: [] },
      trends: trendViewModel(trends),
      props,
      matchup: {
        event: upcomingEvent,
        ...(matchupContext || { factors: [], warnings: ["No matchup context is available."] }),
        source: profile.source,
      },
      insights,
      relatedQueries: relatedQueries(athlete, config, props.markets.length > 0),
      dataSources: [{ provider: profile.source, updatedAt: profile.updatedAt, mode: "sample" }],
      config: {
        roleLabel: config.roleLabel,
        primaryStatIds: config.primaryStats,
        logStatIds: config.logStats,
      },
    });
    this.cache.set(cacheKey, viewModel);
    return viewModel;
  }

  clearCache(athleteId = "") {
    if (!athleteId) this.cache.clear();
    else [...this.cache.keys()].filter((key) => key.startsWith(`${athleteId}:`)).forEach((key) => this.cache.delete(key));
  }
}

export function createAthleteProfileRepository(statsProvider, sportsRepository, insightService = null) {
  return new AthleteProfileRepository(statsProvider, sportsRepository, insightService);
}
