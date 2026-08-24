import { getComparisonPreset, getQualificationDefaults } from "../src/config/comparison-presets.js";
import { getStatDefinition } from "../src/config/stat-registry.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { mockStatsProviderPayload } from "../src/data/mock-stats-provider.js";
import {
  advancedResultToCsv,
  advancedResultSummaryToText,
  advancedResultToText,
  buildComparisonViewModel,
  buildEventExplorerViewModel,
  buildFilteredListViewModel,
  buildHeadToHeadViewModel,
  buildLeaderboardViewModel,
  buildRecordViewModel,
} from "../src/services/advanced-stats-results-service.js";
import { classifyResearchQuery } from "../src/services/query-classifier.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { calculateAggregation, statValueForRow } from "../src/services/stat-calculations.js";
import { createStatsRepository } from "../src/services/stats-provider.js";
import { createStatisticalQuery, parseStatisticalQuery, validateStatisticalQuery } from "../src/services/stats-query-service.js";
import { buildStatsResult } from "../src/services/stats-results-service.js";

const results = document.querySelector("#results");
const frame = document.querySelector("#app");
const frameReady = frame.contentWindow.location.href !== "about:blank" && frame.contentDocument?.readyState === "complete"
  ? Promise.resolve() : new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
frame.contentWindow.addEventListener("error", (event) => window.testErrors.push(`app: ${event.message}`));
frame.contentWindow.addEventListener("unhandledrejection", (event) => window.testErrors.push(`app: ${String(event.reason)}`));
const failures = [];
const checks = [];
const check = (condition, label) => {
  checks.push(label);
  if (!condition) failures.push(label);
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitFor = async (predicate, timeout = 3000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(25);
  }
  return false;
};
const provider = createStatsRepository();
const sportsRepository = createSportsRepository(mockProviderPayload);
const parsed = (query) => Object.freeze({
  structuredQuery: query,
  classification: Object.freeze({ intent: query.intent, confidence: 1 }),
  warnings: Object.freeze([]),
  ambiguousCandidates: Object.freeze([]),
  unresolvedEntities: Object.freeze([]),
  unsupportedFilters: Object.freeze([]),
  suggestedCorrections: Object.freeze([]),
});
const query = (overrides = {}) => createStatisticalQuery({
  mode: "stats",
  intent: "league_leaderboard",
  sportId: "basketball",
  leagueId: "wnba",
  entityType: "player",
  statIds: ["basketball-points"],
  rankingMetric: "basketball-points",
  aggregation: "average",
  dateRange: { type: "career" },
  resultLimit: 10,
  ...overrides,
});
const parse = (text, leagueId = "wnba", mode = "stats") => parseStatisticalQuery(text, {
  mode,
  sportsRepository,
  currentLeagueId: leagueId,
});

// Deterministic Phase 3 query classification.
const classificationCases = [
  ["Compare Caitlin Clark and Sabrina Ionescu over their last 15 games.", "athlete_comparison"],
  ["Compare Caitlin Clark, Sabrina Ionescu, and A'ja Wilson.", "athlete_comparison"],
  ["Compare the Yankees and Dodgers offenses this month.", "team_comparison"],
  ["Who leads MLB in home runs this season?", "league_leaderboard"],
  ["Which UFC fighters on this card have the highest knockout rate?", "event_leaderboard"],
  ["Which NBA players average at least 20 points, 5 rebounds, and 5 assists?", "multi_stat_filter"],
  ["Most passing yards in a single NFL game this season.", "single_game_high"],
  ["Players who exceeded 5.5 assists in 8 of their last 10 games.", "threshold_leaderboard"],
  ["Show head-to-head history for the Yankees and Dodgers.", "head_to_head_history"],
  ["Who holds the all-time WNBA scoring record?", "historical_record"],
  ["Compare recent performance to today's prop line.", "mixed_stats_betting"],
  ["Compare this player and someone.", "ambiguous"],
];
classificationCases.forEach(([text, intent]) =>
  check(classifyResearchQuery(text, "stats").intent === intent, `classifier: ${intent}`));

// Structured schema and parsing.
const schema = query({
  intent: "athlete_comparison",
  playerIds: ["wnba-caitlin-clark", "wnba-sabrina-ionescu"],
  primaryEntityIds: ["wnba-caitlin-clark", "wnba-sabrina-ionescu"],
  comparisonEntityIds: ["wnba-sabrina-ionescu"],
  derivedStatIds: ["basketball-assist-to-turnover-ratio"],
  thresholdDefinitions: [{ statId: "basketball-points", operator: "gte", value: 20 }],
  includePercentiles: true,
});
[
  "primaryEntityIds", "comparisonEntityIds", "entitySet", "entitySetSource", "cohortDefinition",
  "comparisonBaseline", "statIds", "derivedStatIds", "aggregation", "secondaryAggregation",
  "rankingMetric", "tieBreakerMetrics", "thresholdDefinitions", "competition", "competitionStage",
  "venueType", "surfaceType", "trackType", "qualifyingRules", "sortDirection", "resultLimit",
  "includeRanks", "includePercentiles", "includeSupportingRows", "requestedDisplayType",
].forEach((field) => check(Object.hasOwn(schema, field), `schema exposes ${field}`));
check(validateStatisticalQuery(schema).valid, "expanded comparison schema validates");
check(parse("Compare Caitlin Clark and Sabrina Ionescu over their last 5 games.").structuredQuery.primaryEntityIds.length === 2,
  "parser resolves two canonical comparison entities");
check(parse("Compare the Yankees and Dodgers offenses this month.").structuredQuery.leagueId === "mlb",
  "canonical team identities override unrelated navigation scope");
check(parse("Compare the Yankees and Dodgers offenses this month.").structuredQuery.entityType === "team",
  "team comparison receives team entity type");
check(parse("Who leads the WNBA in assists this season?").structuredQuery.aggregation === "sum",
  "counting-stat leaderboard uses totals");
check(parse("F1 drivers with the best average finish on street circuits.", "f1").structuredQuery.sortDirection === "asc",
  "lower-is-better query parses ascending");
check(parse("F1 drivers with the best average finish on street circuits.", "f1").structuredQuery.trackType === "street",
  "track cohort parses");
const eventIdQuery = parse("Show events by date for event ID wnba-2026-01.", "wnba");
check(eventIdQuery.structuredQuery.intent === "event_search"
  && eventIdQuery.structuredQuery.eventIds[0] === "wnba-2026-01",
  "supporting-event URLs restore an exact canonical event filter");
const parsedCohortQuery = parse("F1 drivers with the best average finish on street circuits.", "f1");
const cohortResult = buildStatsResult(provider, parsedCohortQuery, sportsRepository);
check(cohortResult.type === "leaderboard",
  `cohort analysis dispatches to a ranked result (${cohortResult.type}: ${cohortResult.title || ""})`);
const parsedMultiStat = parse("Which NBA players average at least 20 points, 5 rebounds, and 5 assists?", "nba").structuredQuery;
check(parsedMultiStat.thresholdDefinitions.length === 3,
  `multi-stat thresholds remain explicit (${parsedMultiStat.thresholdDefinitions.map((item) => item.statId).join(",")} / ${parsedMultiStat.statIds.join(",")})`);
check(parse("Which NBA players average at least 20 points, 5 rebounds, and 5 assists?", "nba").structuredQuery.conditionLogic === "and",
  "multi-stat defaults to AND");
check(parse("Who leads MLB in ERA with minimum 4.5 innings?", "mlb").structuredQuery.minimumInnings === 4.5,
  "parser preserves an explicit minimum-innings qualification");
check(parse("Which UFC fighters rank highest with minimum 4 fights and minimum 8 rounds?", "ufc").structuredQuery.minimumFights === 4
  && parse("Which UFC fighters rank highest with minimum 4 fights and minimum 8 rounds?", "ufc").structuredQuery.minimumRounds === 8,
  "parser preserves explicit fight and round qualifications");
check(parse("F1 drivers ranked by points with minimum 4 starts.", "f1").structuredQuery.minimumStarts === 4,
  "parser preserves an explicit minimum-starts qualification");

// Centralized sport-aware presets and derived stats.
check(getComparisonPreset({ sportId: "basketball", position: "Guard" }).primary.includes("basketball-assist-to-turnover-ratio"),
  "basketball guard preset includes derivable assist-to-turnover ratio");
check(getComparisonPreset({ sportId: "american-football", position: "Quarterback" }).primary.includes("football-yards-per-attempt"),
  "quarterback preset includes yards per attempt");
check(getComparisonPreset({ sportId: "baseball", position: "Pitcher" }).primary.includes("baseball-strikeouts-per-nine"),
  "pitcher preset includes strikeouts per nine");
check(getComparisonPreset({ sportId: "ice-hockey", position: "Goalie" }).primary.includes("hockey-save-percentage"),
  "goalie preset is role-aware");
check(getComparisonPreset("soccer").primary.includes("soccer-shots-on-target"), "soccer preset is available");
check(getComparisonPreset("mma").primary.includes("combat-knockout-rate"), "combat preset is shared by MMA");
check(getComparisonPreset("motorsport").primary.includes("motorsport-average-finishing-position"), "motorsports preset is available");
check(getQualificationDefaults("baseball").minimumPlateAppearances > 0, "baseball qualification defaults are centralized");
check(getQualificationDefaults("motorsport").minimumStarts > 0, "motorsport qualification defaults are centralized");
check(statValueForRow({ stats: { "basketball-assists": 8, "basketball-turnovers": 2 } }, "basketball-assist-to-turnover-ratio") === 4,
  "assist-to-turnover ratio is derived from source values");
check(statValueForRow({ stats: { "basketball-assists": 8, "basketball-turnovers": 0 } }, "basketball-assist-to-turnover-ratio") === null,
  "derived ratio handles zero denominator");
check(statValueForRow({ stats: { "football-completions": 20, "football-passing-attempts": 25 } }, "football-completion-percentage") === 80,
  "completion percentage is derived");
check(statValueForRow({ stats: { "baseball-pitcher-strikeouts": 6, "baseball-innings-pitched": 6 } }, "baseball-strikeouts-per-nine") === 9,
  "strikeouts per nine is derived");
check(statValueForRow({ stats: { "motorsport-average-starting-position": 8, "motorsport-average-finishing-position": 3 } }, "motorsport-position-change") === 5,
  "motorsport position change is derived");

// Comparison engine: athletes, teams, cohorts, normalization, and calculations.
const comparisonCases = [
  ["WNBA guards", ["wnba-caitlin-clark", "wnba-sabrina-ionescu"], "basketball-points", "basketball", "wnba"],
  ["NBA scorers", ["nba-stephen-curry", "nba-luka-doncic"], "basketball-points", "basketball", "nba"],
  ["MLB batters", ["mlb-aaron-judge", "mlb-juan-soto"], "baseball-home-runs", "baseball", "mlb"],
  ["NFL quarterbacks", ["nfl-patrick-mahomes", "nfl-josh-allen"], "football-passing-yards", "american-football", "nfl"],
  ["F1 drivers", ["f1-max-verstappen", "f1-lando-norris"], "motorsport-average-finishing-position", "motorsport", "f1"],
];
comparisonCases.forEach(([label, ids, statId, sportId, leagueId]) => {
  const result = provider.compareAthletes(ids, [statId], query({
    intent: "athlete_comparison", sportId, leagueId, playerIds: ids, primaryEntityIds: ids,
    statIds: [statId], rankingMetric: statId, dateRange: { type: "last_n_games", value: 5 },
  }));
  check(result.entities.length === 2, `${label} comparison resolves both canonical entities`);
  check(result.stats[statId].every((entry) => entry.sampleSize > 0),
    `${label} comparison exposes samples (${result.stats[statId].map((entry) => entry.sampleSize).join(",")})`);
});
const sameFilters = provider.compareAthletes(
  ["wnba-caitlin-clark", "wnba-sabrina-ionescu"],
  ["basketball-points"],
  query({
    intent: "athlete_comparison", playerIds: ["wnba-caitlin-clark", "wnba-sabrina-ionescu"],
    primaryEntityIds: ["wnba-caitlin-clark", "wnba-sabrina-ionescu"], dateRange: { type: "last_n_games", value: 2 },
    homeAway: "away",
  }),
);
check(sameFilters.summaries.every((summary) => summary.rows.length === 2), "comparison applies identical last-N filters");
check(sameFilters.summaries.every((summary) => summary.rows.every((row) => row.home_away === "away")), "comparison applies identical split filters");
check(sameFilters.stats["basketball-points"].every((entry) => Number.isFinite(entry.variance)), "comparison calculates variance");
check(sameFilters.stats["basketball-points"].every((entry) => Number.isFinite(entry.consistency)), "comparison calculates consistency");
check(sameFilters.stats["basketball-points"].every((entry) => Number.isFinite(entry.difference)), "comparison calculates deterministic differences");
check(sameFilters.stats["basketball-points"].every((entry) => entry.percentDifference !== null), "comparison calculates valid percent differences");
const teamCases = [
  [["IND-W", "LVA"], "basketball-points", "basketball", "wnba"],
  [["NYY", "LAD"], "baseball-home-runs", "baseball", "mlb"],
  [["MIA", "ORL"], "soccer-goals", "soccer", "mls"],
];
teamCases.forEach(([ids, statId, sportId, leagueId]) => {
  const result = provider.compareTeams(ids, [statId], query({
    intent: "team_comparison", sportId, leagueId, entityType: "team", teamIds: ids,
    primaryEntityIds: ids, statIds: [statId], rankingMetric: statId,
  }));
  check(result.entities.length === 2 && result.entities.every((entity) => entity.entityType === "team"),
    `${leagueId} team comparison uses canonical teams`);
});
const cohort = provider.compareEntityToCohort("wnba-caitlin-clark", ["basketball-assists"], query({
  sportId: "basketball", leagueId: "wnba", comparisonBaseline: "league-average",
}));
check(cohort.primaryEntityId === "wnba-caitlin-clark" && cohort.entities.length >= 3, "athlete-to-league cohort comparison works");
check(cohort.stats["basketball-assists"].every((entry) => Number.isFinite(entry.baseline)), "cohort baseline is deterministic");

// Leaderboards, qualification rules, ties, lower-is-better, and pagination.
const leaderboardCases = [
  ["basketball-assists", "basketball", "wnba", "average"],
  ["basketball-three-pointers-made", "basketball", "nba", "sum"],
  ["baseball-home-runs", "baseball", "mlb", "sum"],
  ["baseball-pitcher-strikeouts", "baseball", "mlb", "sum"],
  ["football-passing-yards", "american-football", "nfl", "sum"],
  ["hockey-shots-on-goal", "ice-hockey", "nhl", "sum"],
  ["soccer-shots-on-target", "soccer", "mls", "sum"],
  ["combat-knockout-rate", "mma", "ufc", "percentage"],
  ["motorsport-average-finishing-position", "motorsport", "f1", "average"],
  ["basketball-points", "basketball", "wnba", "maximum"],
];
leaderboardCases.forEach(([statId, sportId, leagueId, aggregation]) => {
  const board = provider.getPlayerLeaderboard(statId, query({
    sportId, leagueId, entityType: ["mma", "motorsport"].includes(sportId) ? "competitor" : "player",
    statIds: [statId], rankingMetric: statId, aggregation,
  }));
  check(board.entries.length > 0,
    `${leagueId} ${statId} leaderboard has qualified sample rows (${JSON.stringify(board.qualificationRules)})`);
  check(board.entries.every((entry) => entry.entity.id && Number.isFinite(entry.value)), `${leagueId} leaderboard uses canonical numeric entries`);
});
const finishBoard = provider.getPlayerLeaderboard("motorsport-average-finishing-position", query({
  sportId: "motorsport", leagueId: "f1", entityType: "competitor",
  statIds: ["motorsport-average-finishing-position"], rankingMetric: "motorsport-average-finishing-position",
  aggregation: "average", sortDirection: "",
}));
check(finishBoard.entries.length > 1
  && finishBoard.entries[0].value <= finishBoard.entries.at(-1).value,
"lower-is-better metric ranks ascending by registry direction");
const tied = provider.rankedEntries([
  { entity: { id: "b" }, value: 10, secondaryValues: { "basketball-assists": 2 } },
  { entity: { id: "a" }, value: 10, secondaryValues: { "basketball-assists": 4 } },
  { entity: { id: "c" }, value: 8, secondaryValues: { "basketball-assists": 9 } },
], "basketball-points", { sortDirection: "desc", tieBreakerMetrics: ["basketball-assists"] });
check(tied[0].entity.id === "a", "secondary tie breaker orders equal primary values");
check(tied[0].rank === 1 && tied[1].rank === 1 && tied[2].rank === 3, "shared competition ranks handle ties");
check(tied[0].percentile === 100 && tied[2].percentile === 0, "rank percentiles are deterministic");
const qualified = provider.getPlayerLeaderboard("basketball-points", query({ minimumGames: 6, resultLimit: 1 }));
check(qualified.totalQualified === 1 && qualified.entries[0].entity.id === "wnba-caitlin-clark", "minimum-games qualification excludes short samples");
check(qualified.hasMore === false && qualified.limit === 1, "leaderboard pagination metadata is explicit");
const noQualified = provider.getPlayerLeaderboard("basketball-points", query({ minimumGames: 99 }));
check(noQualified.entries.length === 0, "empty qualified pool remains empty");
const pitcherRules = provider.getQualificationRules("baseball-pitcher-strikeouts", { sportId: "baseball" });
check(pitcherRules.minimumInnings > 0 && pitcherRules.minimumPlateAppearances === 0, "pitcher qualification does not require plate appearances");
const batterRules = provider.getQualificationRules("baseball-home-runs", { sportId: "baseball" });
check(batterRules.minimumPlateAppearances > 0 && batterRules.minimumInnings === 0, "batter qualification does not require innings");
check(provider.getQualificationRules("soccer-shots", { sportId: "soccer" }).minimumMinutes > 0, "soccer qualification exposes minimum minutes");
check(provider.getQualificationRules("combat-knockout-rate", { sportId: "mma" }).minimumFights > 0, "combat qualification exposes minimum fights");
check(provider.getQualificationRules("motorsport-points", { sportId: "motorsport" }).minimumStarts > 0, "motorsport qualification exposes minimum starts");
check(finishBoard.tieStrategy.includes("shared competition rank"), "tie strategy is documented");
check(finishBoard.percentileMethod.includes("qualified pool size"), "percentile method is documented");

// Multi-stat filtering with AND, OR, ranges, derived stats, and boundaries.
const filterBase = query({
  intent: "multi_stat_filter", sportId: "basketball", leagueId: "wnba",
  statIds: ["basketball-points", "basketball-rebounds", "basketball-assists"],
  aggregation: "average",
});
const andFilter = provider.getFilteredEntitySet([
  { statId: "basketball-points", operator: "gte", value: 20 },
  { statId: "basketball-rebounds", operator: "gte", value: 4 },
  { statId: "basketball-assists", operator: "gte", value: 3 },
], filterBase);
check(andFilter.entries.length > 0, "multi-stat AND filter returns qualified entities");
check(andFilter.entries.every((entry) => entry.evaluations.every((evaluation) => evaluation.matches)), "every AND result explains all qualifications");
const orFilter = provider.getFilteredEntitySet([
  { statId: "basketball-points", operator: "gt", value: 40 },
  { statId: "basketball-assists", operator: "gte", value: 8 },
], { ...filterBase, conditionLogic: "or" });
check(orFilter.entries.length > 0, "explicit OR group is supported");
const rangeFilter = provider.getFilteredEntitySet([
  { statId: "basketball-points", operator: "between", value: 20, maxValue: 30 },
], filterBase);
check(rangeFilter.entries.length > 0, "range condition is supported");
const derivedFilter = provider.getFilteredEntitySet([
  { statId: "basketball-assist-to-turnover-ratio", operator: "gte", value: 1.5 },
], { ...filterBase, statIds: ["basketball-assist-to-turnover-ratio"] });
check(derivedFilter.entries.length > 0, "derived-stat condition uses source-row calculation");
const boundaryValue = provider.getPlayerSummary("wnba-caitlin-clark", {
  ...filterBase, statIds: ["basketball-points"],
}).stats["basketball-points"].value;
const boundary = provider.getFilteredEntitySet([
  { statId: "basketball-points", operator: "gte", value: boundaryValue },
], filterBase);
check(boundary.entries.some((entry) => entry.entity.id === "wnba-caitlin-clark"), "exact inclusive threshold boundary qualifies");
const none = provider.getFilteredEntitySet([
  { statId: "basketball-points", operator: "gt", value: 1000 },
], filterBase);
check(none.entries.length === 0, "no-match filter does not relax thresholds");

// Records, highs, streaks, H2H, and event explorer.
const recordQuery = query({
  intent: "single_game_high", statIds: ["basketball-points"], rankingMetric: "basketball-points",
  aggregation: "maximum", includeRecordValidation: true,
});
const record = provider.getRecordCandidate("basketball-points", recordQuery);
check(record.candidate?.rows?.[0]?.event_id, "record candidate links a supporting event");
check(record.validationStatus === "dataset_only", "record validation is dataset-only");
check(record.completenessWarning.includes("cannot verify"), "incomplete coverage warning is explicit");
check(!/all-time record/i.test(buildRecordViewModel(provider, parsed(recordQuery)).title), "record view model avoids unsupported all-time claim");
check(provider.validateRecordScope().prohibitedLabels.includes("world record"), "record validator prohibits unsupported world-record labels");
const streak = provider.getStreakLeaderboard("hockey-points", query({
  intent: "streak_leaderboard", sportId: "ice-hockey", leagueId: "nhl",
  statIds: ["hockey-points"], rankingMetric: "hockey-points", comparisonOperator: "gte", comparisonValue: 1,
}));
check(streak.entries.length > 0 && streak.entries[0].value >= 1, "streak leaderboard uses ordered completed rows");
const thresholdBoard = provider.getThresholdLeaderboard("basketball-assists", query({
  intent: "threshold_leaderboard", statIds: ["basketball-assists"], rankingMetric: "basketball-assists",
  comparisonOperator: "gt", comparisonValue: 5.5,
}));
check(thresholdBoard.entries.every((entry) => entry.value >= 0 && entry.value <= 100), "threshold leaderboard returns historical hit rates");
check(provider.getThresholdLeaderboard("basketball-assists", query({
  intent: "threshold_leaderboard", statIds: ["basketball-assists"], rankingMetric: "basketball-assists",
  comparisonOperator: "gt", comparisonValue: 5.5, minimumGames: 99,
})).entries.length === 0, "threshold leaderboard enforces qualification rules");
check(provider.getStreakLeaderboard("hockey-points", query({
  intent: "streak_leaderboard", sportId: "ice-hockey", leagueId: "nhl",
  statIds: ["hockey-points"], rankingMetric: "hockey-points", comparisonOperator: "gte",
  comparisonValue: 1, minimumGames: 99,
})).entries.length === 0, "streak leaderboard enforces qualification rules");
const teamH2h = provider.getHeadToHeadHistory(["NYY", "LAD"], query({
  intent: "head_to_head_history", sportId: "baseball", leagueId: "mlb", entityType: "team",
  teamIds: ["NYY", "LAD"], primaryEntityIds: ["NYY", "LAD"], statIds: [],
}));
check(teamH2h.direct.length > 0, "team direct head-to-head history resolves");
const combatH2h = provider.getHeadToHeadHistory(["ufc-sample-fighter-a", "ufc-sample-fighter-b"], query({
  intent: "head_to_head_history", sportId: "mma", leagueId: "ufc", entityType: "competitor",
  playerIds: ["ufc-sample-fighter-a", "ufc-sample-fighter-b"], primaryEntityIds: ["ufc-sample-fighter-a", "ufc-sample-fighter-b"],
  statIds: [],
}));
check(combatH2h.direct.length > 0, "combat prior direct meeting resolves");
check(Array.isArray(combatH2h.commonOpponents), "common-opponent history remains a separate collection");
const noH2h = provider.getHeadToHeadHistory(["nba-stephen-curry", "nba-tyrese-maxey"], query({
  intent: "head_to_head_history", sportId: "basketball", leagueId: "nba",
  playerIds: ["nba-stephen-curry", "nba-tyrese-maxey"],
  primaryEntityIds: ["nba-stephen-curry", "nba-tyrese-maxey"], statIds: [],
}));
check(noH2h.warnings.some((warning) => warning.includes("No direct")), "no-prior-meeting state is explicit");
const events = provider.searchHistoricalEvents(query({ dateRange: { type: "last_n_games", value: 3 } }));
check(events.events.length <= 3 && events.events.every((event) => event.rows.length > 0), "event explorer groups and limits completed events");
check(events.events.every((event) => event.rows.every((row) => row.entity?.id)), "event explorer attaches canonical entities through the service");

// Normalized view models and safe exports.
const comparisonQuery = query({
  intent: "athlete_comparison", playerIds: ["wnba-caitlin-clark", "wnba-sabrina-ionescu"],
  primaryEntityIds: ["wnba-caitlin-clark", "wnba-sabrina-ionescu"],
  statIds: ["basketball-points", "basketball-assists"], rankingMetric: "basketball-points",
  dateRange: { type: "last_n_games", value: 5 }, requestedDisplayType: "table",
});
const comparisonView = buildComparisonViewModel(provider, parsed(comparisonQuery), sportsRepository);
check(comparisonView.type === "athlete_comparison" && comparisonView.rows.length === 2, "comparison view model is normalized");
check(comparisonView.statColumns.every((column) => column.ranks), "comparison view model includes per-stat ranks");
check(comparisonView.availableEntities.every((entity) => !comparisonQuery.primaryEntityIds.includes(entity.id)), "comparison add-list prevents duplicates");
check(comparisonView.sources[0].sample, "comparison source is visibly sample");
const unequalComparison = buildComparisonViewModel(provider, parsed(createStatisticalQuery({
  ...comparisonQuery, dateRange: { type: "career" },
})), sportsRepository);
check(unequalComparison.warnings.some((warning) => warning.includes("unequal completed-event samples")),
  "unequal comparison coverage is disclosed");
const crossLeagueComparison = buildComparisonViewModel(provider, parsed(createStatisticalQuery({
  ...comparisonQuery,
  playerIds: ["wnba-caitlin-clark", "nba-luka-doncic"],
  primaryEntityIds: ["wnba-caitlin-clark", "nba-luka-doncic"],
  comparisonEntityIds: ["nba-luka-doncic"],
})), sportsRepository);
check(crossLeagueComparison.warnings.some((warning) => warning.includes("not normalized")),
  "cross-league comparison rules are disclosed");
const leaderboardQuery = query({ statIds: ["basketball-assists"], rankingMetric: "basketball-assists", aggregation: "sum" });
const leaderboardView = buildLeaderboardViewModel(provider, parsed(leaderboardQuery), sportsRepository);
check(leaderboardView.type === "leaderboard" && leaderboardView.rows.length > 0, "leaderboard view model is normalized");
check(leaderboardView.rows.every((row) => row.rank && row.sampleSize), "leaderboard rows expose rank and sample");
check(leaderboardView.rows.every((row) => row.comparisonPoolSize === leaderboardView.totalQualified),
  "leaderboard percentiles expose their qualified comparison-pool size");
const partialPayload = structuredClone(mockStatsProviderPayload);
partialPayload.generated_at = new Date().toISOString();
partialPayload.partial = true;
const partialProvider = createStatsRepository(partialPayload);
const partialResult = buildStatsResult(partialProvider, parsed(comparisonQuery), sportsRepository);
check(partialResult.dataQualityWarning?.includes("partial sample data")
  && !partialResult.dataQualityWarning.includes("undefined"),
  "advanced results preserve an explicit partial-provider warning");
const filterView = buildFilteredListViewModel(provider, parsed(createStatisticalQuery({
  ...filterBase,
  thresholdDefinitions: [{ statId: "basketball-points", operator: "gte", value: 20 }],
})));
check(filterView.type === "multi_stat_filtered_list" && filterView.conditions.length === 1, "filtered-list view model exposes editable interpretation");
const h2hView = buildHeadToHeadViewModel(provider, parsed(query({
  intent: "head_to_head_history", sportId: "baseball", leagueId: "mlb", entityType: "team",
  teamIds: ["NYY", "LAD"], primaryEntityIds: ["NYY", "LAD"], statIds: [],
})));
check(h2hView.directMeetings.length > 0 && h2hView.commonOpponents.every((item) => item.causalClaimAllowed === false),
  "H2H view model distinguishes direct and indirect evidence");
const eventView = buildEventExplorerViewModel(provider, parsed(query({ intent: "event_search", statIds: [] })));
check(eventView.type === "event_explorer" && eventView.events.length > 0, "event explorer view model is normalized");
const recordView = buildRecordViewModel(provider, parsed(recordQuery));
const plainText = advancedResultToText(comparisonView);
check(plainText.includes("Sample size") && plainText.includes("Source"), "plain-text comparison export includes source and sample sizes");
const summaryText = advancedResultSummaryToText(comparisonView);
check(summaryText.includes("Illustrative sample data") && summaryText !== plainText, "summary copy is concise and retains the sample warning");
const tabText = advancedResultToText(leaderboardView);
check(tabText.includes("\t") && tabText.includes("Rank\tEntity"), "leaderboard copy is tab-separated");
const csv = advancedResultToCsv(leaderboardView);
check(csv.startsWith('"EdgeBoard sample statistical result"') && csv.includes('"Rank","Entity"'), "CSV contains safe metadata and headers");
const injectionView = { ...leaderboardView, rows: [{ ...leaderboardView.rows[0], displayName: "=2+3" }] };
check(advancedResultToCsv(injectionView).includes("'=2+3"), "CSV prevents spreadsheet formula injection");
check(csv.includes("Illustrative sample data"), "export includes sample-data warning");
check(advancedResultToText(recordView).includes("Sample size\t1 supporting events"),
  "record export includes supporting-event sample size");

// Advanced Both-mode context remains subordinate to observed statistics.
const freshMarketPayload = structuredClone(mockProviderPayload);
const freshTimestamp = new Date().toISOString();
freshMarketPayload.generated_at = freshTimestamp;
freshMarketPayload.provider_status.last_updated_at = freshTimestamp;
freshMarketPayload.provider_status.last_successful_update_at = freshTimestamp;
freshMarketPayload.league_statuses.forEach((entry) => { entry.last_updated_at = freshTimestamp; });
freshMarketPayload.offers.forEach((offer) => {
  offer.last_updated_at = freshTimestamp;
  offer.selections.forEach((selection) => { selection.last_updated_at = freshTimestamp; });
});
const freshSportsRepository = createSportsRepository(freshMarketPayload);
const bothComparisonQuery = query({
  mode: "both", intent: "athlete_comparison", sportId: "basketball", leagueId: "nba",
  playerIds: ["nba-tyrese-maxey", "nba-stephen-curry"],
  primaryEntityIds: ["nba-tyrese-maxey", "nba-stephen-curry"],
  statIds: ["basketball-points"], rankingMetric: "basketball-points",
  includeBettingContext: true,
});
const bothComparison = buildComparisonViewModel(provider, parsed(bothComparisonQuery), freshSportsRepository);
check(bothComparison.bettingContext.length === 1 && bothComparison.bettingContext[0].entityId === "nba-tyrese-maxey",
  "Both comparison attaches only a participant-compatible current market");
check(bothComparison.bettingContext[0].available, "fresh compatible advanced market is actionable");
check(bothComparison.bettingContext[0].historicalHitRate !== bothComparison.bettingContext[0].confidence,
  "historical hit rate remains distinct from confidence");
const wrongEvent = buildComparisonViewModel(provider, parsed(createStatisticalQuery({
  ...bothComparisonQuery, eventIds: ["different-event"],
})), freshSportsRepository);
check(wrongEvent.bettingContext.length === 0, "event-mismatched market is excluded");
const wrongSettlement = buildComparisonViewModel(provider, parsed(createStatisticalQuery({
  ...bothComparisonQuery, settlementScope: "regulation-only",
})), freshSportsRepository);
check(wrongSettlement.bettingContext.length === 0, "settlement-scope mismatch is excluded");
const staleComparison = buildComparisonViewModel(provider, parsed(bothComparisonQuery), sportsRepository);
check(staleComparison.bettingContext.every((market) => !market.available), "stale advanced markets remain non-actionable");
const statsRank = buildLeaderboardViewModel(provider, parsed(leaderboardQuery), sportsRepository).rows.map((row) => row.entityId);
const bothRank = buildLeaderboardViewModel(provider, parsed(createStatisticalQuery({
  ...leaderboardQuery, mode: "both", includeBettingContext: true,
})), freshSportsRepository).rows.map((row) => row.entityId);
check(statsRank.join(",") === bothRank.join(","), "betting confidence never changes observed leaderboard rank");

// Live application: responsive rendering, controls, URL restoration, history, copy feedback, and regressions.
await frameReady;
await wait(650);
let app = frame.contentDocument;
let view = frame.contentWindow;
const submit = async (text, delay = 260) => {
  const input = app.querySelector("#queryInput");
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  app.querySelector("#queryForm").requestSubmit();
  await wait(delay);
};
await submit("Compare Caitlin Clark and Sabrina Ionescu over their last 5 games.");
check(app.querySelector("[data-advanced-result]"), "live app renders advanced comparison");
check(app.querySelectorAll(".advanced-comparison-table th[scope='col']").length >= 3, "comparison table has accessible headers");
check(app.querySelector("[data-comparison-search]")?.getAttribute("list") === "comparisonEntityOptions", "comparison entity picker exposes native autocomplete");
check(app.querySelector("[data-comparison-add]")?.tagName === "BUTTON", "comparison add action uses button semantics");
check(app.querySelectorAll("[data-compare-remove]").length === 2, "comparison supports entity removal");
check(app.querySelector("[data-advanced-view='table']")?.getAttribute("aria-pressed") === "true", "comparison view state is announced");
let copiedLink = "";
try {
  Object.defineProperty(view.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (value) => { copiedLink = value; } },
  });
} catch {
  // The direct export checks still cover browsers that lock the clipboard property.
}
app.querySelector("[data-copy-advanced='link']")?.click();
await wait(10);
check(app.querySelector(".advanced-copy-status")?.textContent === "Link copied" && copiedLink.includes("?"),
  "copy-link action announces accessible success feedback");
app.querySelector("[data-advanced-view='cards']")?.click();
check(app.querySelector("[data-advanced-view='cards']")?.getAttribute("aria-pressed") === "true", "comparison view switch works");
check(new URL(view.location.href).searchParams.get("display") === "cards", "comparison display persists in URL");
const addInput = app.querySelector("[data-comparison-search]");
if (addInput) addInput.value = "A'ja Wilson";
app.querySelector("[data-comparison-add]")?.click();
await wait(260);
check(app.querySelectorAll(".advanced-comparison-table tbody tr, .advanced-comparison-cards article").length >= 3, "third athlete can be added without duplicate identity data");
check(new URL(view.location.href).searchParams.get("q")?.includes("A%27ja") === false, "share URL stores readable decoded query state");
await submit("Who leads the WNBA in assists this season?");
check(app.querySelector(".qualification-summary"), "leaderboard visibly exposes qualifications");
check(app.querySelector("#statsResultContent .stats-table tbody tr td:nth-child(4)")?.textContent.includes("qualified"),
  "live leaderboard displays percentile pool size");
check(app.querySelector("th[aria-sort] [data-advanced-sort]"), "leaderboard sort controls expose aria-sort");
app.querySelector("[data-advanced-sort='sample']")?.click();
check(new URL(view.location.href).searchParams.get("sort") === "sample", "leaderboard sort persists in URL");
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, "390px advanced view has no page overflow");
check(app.querySelector("#statsResultContent").textContent.includes("Sample"), "advanced results remain visibly sample data");
const queryBeforeMode = app.querySelector("#queryInput").value;
app.querySelector("[data-research-mode='both']").click();
check(app.querySelector("#queryInput").value === queryBeforeMode, "mode switch preserves advanced query text");
check(app.querySelector("#slipList"), "bet slip DOM remains intact after advanced result navigation");
app.querySelector("[data-research-mode='stats']").click();
await submit("Most points in a single WNBA game this season.");
check(app.querySelector(".record-validation"),
  `record result exposes validation state (${app.querySelector("#statsResultTitle")?.textContent || app.querySelector("#statsResultContent")?.textContent.slice(0, 80)})`);
check(!/all-time record/i.test(app.querySelector("#statsResultContent").textContent), "live record result avoids unsupported all-time claim");
const supportingEventAnchor = app.querySelector(".record-result-value + p a[href*='event+ID'], .record-result-value + p a[href*='event%20ID']");
check(Boolean(supportingEventAnchor), "record supporting event has a shareable event-explorer link");
if (supportingEventAnchor) {
  supportingEventAnchor.click();
  await wait(300);
  check(app.querySelector(".event-explorer-list article"), "supporting event link opens the filtered event explorer");
}
await submit("Who leads the WNBA in assists this season?");
const firstTitle = app.querySelector("#statsResultTitle")?.textContent || "";
await submit("Compare Caitlin Clark and Sabrina Ionescu over their last 5 games.");
const secondTitle = app.querySelector("#statsResultTitle")?.textContent || "";
view.history.back();
await waitFor(() => app.querySelector("#statsResultTitle")?.textContent === firstTitle);
check(app.querySelector("#statsResultTitle")?.textContent === firstTitle, "browser back restores prior leaderboard result");
view.history.forward();
await waitFor(() => app.querySelector("#statsResultTitle")?.textContent === secondTitle);
check(app.querySelector("#statsResultTitle")?.textContent === secondTitle, "browser forward restores comparison result");
check(app.activeElement?.id === "statsResultTitle"
  && app.querySelector("#statsResultTitle")?.getAttribute("tabindex") === "-1",
"restored result moves focus to the result heading");

const desktopFrame = document.createElement("iframe");
desktopFrame.style.width = "1280px";
desktopFrame.style.height = "900px";
desktopFrame.src = `/?mode=stats&scope=league:wnba&q=${encodeURIComponent("Compare Caitlin Clark, Sabrina Ionescu, A'ja Wilson, and Breanna Stewart over their last 5 games.")}`;
document.body.append(desktopFrame);
await new Promise((resolve) => desktopFrame.addEventListener("load", resolve, { once: true }));
await wait(500);
const desktopApp = desktopFrame.contentDocument;
check(desktopApp.querySelectorAll(".advanced-comparison-table tbody tr").length === 4, "desktop comparison supports four athletes");
check(desktopApp.documentElement.scrollWidth <= desktopApp.documentElement.clientWidth, "1280px advanced comparison has no page overflow");
desktopFrame.remove();

const tabletFrame = document.createElement("iframe");
tabletFrame.style.width = "768px";
tabletFrame.style.height = "900px";
tabletFrame.src = `/?mode=stats&scope=league:nhl&q=${encodeURIComponent("Top 10 NHL players in shots on goal over the last 30 days.")}`;
document.body.append(tabletFrame);
await new Promise((resolve) => tabletFrame.addEventListener("load", resolve, { once: true }));
await wait(500);
const tabletApp = tabletFrame.contentDocument;
check(tabletApp.querySelector(".advanced-table-wrap"),
  `tablet renders the advanced leaderboard table (${tabletApp.querySelector("#statsResultTitle")?.textContent || tabletApp.querySelector("#statsResultContent")?.textContent.slice(0, 80)})`);
check(tabletApp.documentElement.scrollWidth <= tabletApp.documentElement.clientWidth, "768px leaderboard has no page overflow");
tabletFrame.remove();

check(window.testErrors.length === 0, `no advanced application errors were captured${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} checks)\n${checks.join("\n")}`;
frame.remove();
window.scrollTo(0, 0);
