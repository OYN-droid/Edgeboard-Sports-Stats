import { STAT_REGISTRY, getAvailableStats, getStatDefinition } from "../src/config/stat-registry.js";
import { CANONICAL_ENTITIES } from "../src/data/canonical-entities.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { mockStatsProviderPayload } from "../src/data/mock-stats-provider.js";
import { classifyResearchQuery } from "../src/services/query-classifier.js";
import { getResearchSuggestions, normalizeResearchMode, RESEARCH_MODES } from "../src/services/research-mode-service.js";
import {
  average,
  calculateAggregation,
  count,
  filterDateRange,
  filterLastN,
  filterRowsBySplit,
  maximum,
  median,
  minimum,
  percentage,
  prepareStatRows,
  sortLeaderboard,
  sum,
  thresholdHitCount,
} from "../src/services/stat-calculations.js";
import { resolveCanonicalEntities, searchCanonicalEntities } from "../src/services/entity-resolver.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { createStatsRepository } from "../src/services/stats-provider.js";
import { buildStatsResult } from "../src/services/stats-results-service.js";
import { createStatisticalQuery, parseStatisticalQuery, validateStatisticalQuery } from "../src/services/stats-query-service.js";

const results = document.querySelector("#results");
const frame = document.querySelector("#app");
frame.contentWindow.addEventListener("error", (event) => window.testErrors.push(`app: ${event.message}`));
frame.contentWindow.addEventListener("unhandledrejection", (event) => window.testErrors.push(`app: ${String(event.reason)}`));
const failures = [];
const checks = [];
const check = (condition, label) => {
  checks.push(label);
  if (!condition) failures.push(label);
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sportsRepository = createSportsRepository(mockProviderPayload);
const statsRepository = createStatsRepository();
const parse = (query, options = {}) => parseStatisticalQuery(query, {
  mode: options.mode || "stats",
  sportsRepository,
  currentLeagueId: options.leagueId || "wnba",
  selectedEntityId: options.selectedEntityId || "",
});
const build = (query, options = {}) => {
  const parsed = parse(query, options);
  return { parsed, result: buildStatsResult(statsRepository, parsed, sportsRepository) };
};

// Mode model and centralized suggestions.
check(RESEARCH_MODES.join(",") === "stats,betting,both", "research modes have one canonical order");
check(normalizeResearchMode("stats") === "stats", "Stats mode normalizes");
check(normalizeResearchMode("both") === "both", "Both mode normalizes");
check(normalizeResearchMode("invalid") === "betting", "invalid mode falls back safely");
check(getResearchSuggestions("stats", { sportId: "basketball" }).some((query) => query.includes("Caitlin Clark")), "Stats suggestions are sport-aware");
check(getResearchSuggestions("betting", { sportId: "basketball" }).some((query) => /prop|moneyline/i.test(query)), "Betting suggestions remain betting-oriented");
check(getResearchSuggestions("both", { sportId: "basketball" }).some((query) => /line|over/i.test(query)), "Both suggestions combine stats and markets");
check(getResearchSuggestions("stats", { sportId: "unknown" }).length > 0, "unknown sports receive safe suggestions");

// Canonical stat registry.
const requiredStatFields = [
  "id", "sportIds", "leagueIds", "displayName", "shortName", "description", "entityType",
  "valueType", "unit", "aggregationTypes", "higherIsBetter", "availableSplits",
  "compatiblePeriods", "providerAliases", "searchTerms", "displayOrder", "enabled",
];
check(STAT_REGISTRY.length >= 100, "canonical stat registry has multi-sport depth");
check(new Set(STAT_REGISTRY.map((stat) => stat.id)).size === STAT_REGISTRY.length, "canonical stat IDs are unique");
check(STAT_REGISTRY.every((stat) => requiredStatFields.every((field) => Object.hasOwn(stat, field))), "all canonical stat fields are present");
check(getStatDefinition("basketball-points")?.displayName === "Points", "basketball points resolves by canonical ID");
check(getStatDefinition("baseball-home-runs")?.sportIds.includes("baseball"), "baseball home runs resolve");
check(getAvailableStats("basketball", "wnba").length >= 15, "WNBA receives basketball stats");
check(getAvailableStats("american-football", "nfl").some((stat) => stat.id === "football-passing-yards"), "NFL passing yards are supported");
check(getAvailableStats("baseball", "mlb").some((stat) => stat.id === "baseball-pitcher-strikeouts"), "MLB pitcher strikeouts are supported");
check(getAvailableStats("ice-hockey", "nhl").some((stat) => stat.id === "hockey-shots-on-goal"), "NHL shots on goal are supported");
check(getAvailableStats("soccer", "mls").some((stat) => stat.id === "soccer-shots-on-target"), "soccer shots on target are supported");
check(getAvailableStats("mma", "ufc").some((stat) => stat.id === "combat-significant-strikes-landed"), "combat significant strikes are supported");
check(getAvailableStats("motorsport", "f1").some((stat) => stat.id === "motorsport-podiums"), "motorsport podiums are supported");

// Intent classification.
check(classifyResearchQuery("Show Caitlin Clark's last 10 games", "stats").intent === "game_log_search", "last-N game-log intent classifies");
check(classifyResearchQuery("Show Caitlin Clark by game", "stats").intent === "game_log_search", "game-log intent classifies");
check(classifyResearchQuery("Compare A'ja Wilson and Breanna Stewart", "stats").intent === "athlete_comparison", "player comparison classifies");
check(classifyResearchQuery("Who leads the WNBA in assists?", "stats").intent === "league_leaderboard", "leaderboard intent classifies");
check(classifyResearchQuery("Show Caitlin Clark home and away splits", "stats").intent === "statistical_filter", "split intent classifies");
check(classifyResearchQuery("Find NBA player props", "betting").intent === "betting_research", "betting research intent classifies");
check(classifyResearchQuery("Has Tyrese Maxey gone over 24.5 points in his last 10 games?", "both").intent === "mixed_stats_betting", "mixed intent classifies");
check(classifyResearchQuery("", "stats").intent === "ambiguous", "empty query is ambiguous");
check(classifyResearchQuery("calculate fantasy points", "stats").intent === "unsupported", "unsupported fantasy request classifies explicitly");

// Structured parsing and validation.
let parsed = parse("Show Caitlin Clark's last 5 games");
check(parsed.structuredQuery.playerIds[0] === "wnba-caitlin-clark", "canonical player ID resolves");
check(parsed.structuredQuery.lastNGames === 5, "last-five window parses");
check(parse("Show Caitlin Clark points over her last 10 games").structuredQuery.lastNGames === 10, "last-ten window parses");
check(parse("What is Caitlin Clark averaging in points this season?").structuredQuery.dateRange.type === "season", "this-season window parses");
check(parsed.structuredQuery.leagueId === "wnba", "selected navigation league supplies default context");
parsed = parse("What is Patrick Mahomes averaging in passing yards this season?", { leagueId: "wnba" });
check(parsed.structuredQuery.leagueId === "nfl" && parsed.structuredQuery.contextOverride, "explicit NFL query overrides navigation context");
check(parsed.structuredQuery.statIds.includes("football-passing-yards"), "passing-yards canonical stat parses");
parsed = parse("How many home runs has Aaron Judge hit in his last 5 games?", { leagueId: "mlb" });
check(parsed.structuredQuery.aggregation === "sum", "how-many query uses sum aggregation");
check(parsed.structuredQuery.statIds[0] === "baseball-home-runs", "home-run stat parses");
check(parse("Show Caitlin Clark points and assists", { leagueId: "wnba" }).structuredQuery.statIds.length >= 2, "multiple canonical stats parse");
check(parse("Count Caitlin Clark points rows", { leagueId: "wnba" }).structuredQuery.aggregation === "count", "count aggregation parses");
parsed = parse("Show Caitlin Clark at home", { leagueId: "wnba" });
check(parsed.structuredQuery.homeAway === "home" && parsed.structuredQuery.splitType === "home-away", "home split parses");
check(parse("Show Caitlin Clark away points", { leagueId: "wnba" }).structuredQuery.homeAway === "away", "away split parses");
check(parse("Show Caitlin Clark points by opponent", { leagueId: "wnba" }).structuredQuery.splitType === "opponent", "opponent split parses");
parsed = parse("Show Caitlin Clark over 20 points", { leagueId: "wnba" });
check(parsed.structuredQuery.comparisonOperator === "gt" && parsed.structuredQuery.comparisonValue === 20, "numeric threshold parses");
parsed = parse("Compare A'ja Wilson and Breanna Stewart over their last 5 games");
check(parsed.structuredQuery.playerIds.length === 2 && parsed.structuredQuery.includeComparison, "two-player comparison resolves both canonical IDs");
parsed = parse("Show Alex Smith's points", { leagueId: "wnba" });
check(parsed.structuredQuery.intent === "ambiguous" && parsed.ambiguousCandidates.length === 2, "duplicate athlete name requires disambiguation");
parsed = parse("Show Unknown Athlete points", { leagueId: "wnba" });
check(parsed.unresolvedEntities.length === 1 && parsed.structuredQuery.playerIds.length === 0, "unknown athlete never receives a fabricated ID");
parsed = parse("Show Caitlin Clark fantasy points", { leagueId: "wnba" });
check(parsed.unsupportedFilters.includes("unsupported-stat") && parsed.structuredQuery.statIds.length === 0, "unsupported fantasy stat is explicit");
check(validateStatisticalQuery(createStatisticalQuery({
  mode: "stats", intent: "statistical_lookup", sportId: "basketball", leagueId: "wnba",
  playerIds: ["wnba-caitlin-clark"], statIds: ["basketball-points"],
})).valid, "valid normalized statistical query passes validation");
check(!validateStatisticalQuery({ intent: "bad", aggregation: "average", statIds: [] }).valid, "invalid intent fails validation");
check(!validateStatisticalQuery({ intent: "statistical_lookup", aggregation: "average", statIds: ["made-up-stat"], sportId: "basketball" }).valid, "unknown stat fails validation");
check(!validateStatisticalQuery({
  ...createStatisticalQuery({
    mode: "stats", intent: "statistical_lookup", sportId: "basketball", leagueId: "wnba",
    statIds: ["football-passing-yards"],
  }),
}).valid, "sport-incompatible canonical stat fails validation");
check(!validateStatisticalQuery({
  ...createStatisticalQuery({
    mode: "stats", intent: "statistical_lookup", sportId: "basketball", leagueId: "wnba",
    statIds: ["basketball-points"],
  }),
  statIds: "basketball-points",
}).valid, "malformed stat ID collection fails validation without throwing");
check(!validateStatisticalQuery({
  ...createStatisticalQuery({
    mode: "stats", intent: "statistical_lookup", sportId: "basketball", leagueId: "wnba",
    statIds: ["basketball-points"],
  }),
  comparisonOperator: "gt",
  comparisonValue: null,
}).valid, "comparison operator without a numeric value fails validation");

// Entity resolution.
check(searchCanonicalEntities("Caitlin Clark", { leagueId: "wnba" })[0].entity.id === "wnba-caitlin-clark", "entity search ranks exact contextual match first");
check(resolveCanonicalEntities("Alex Smith", {}).status === "ambiguous", "duplicate canonical names return ambiguity");
check(resolveCanonicalEntities("Nobody Real", {}).status === "unresolved", "missing canonical entity is unresolved");
check(CANONICAL_ENTITIES.every((entity) => entity.providerIds && entity.media), "canonical entities preserve provider and media metadata");

// Deterministic calculations.
check(sum([1, 2, 3, null]) === 6, "sum ignores invalid values");
check(average([2, 4, 6]) === 4, "average calculates deterministically");
check(average([10, null, 20, ""]) === 15, "average excludes missing values from its denominator");
check(count([0, null, 2, undefined]) === 2, "count includes zero and excludes missing values");
check(percentage(3, 4) === 75, "percentage calculates");
check(percentage(1, 0) === null, "division by zero is unavailable");
check(minimum([4, 2, 8]) === 2, "minimum calculates");
check(maximum([4, 2, 8]) === 8, "maximum calculates");
check(median([4, 1, 3, 2]) === 2.5, "median calculates");
const calculationRows = [
  { row_id: "one", entity_id: "sample", event_id: "event-one", status: "completed", event_date: "2026-01-01", stats: { x: 10 }, home_away: "home" },
  { row_id: "two", entity_id: "sample", event_id: "event-two", status: "completed", event_date: "2026-01-02", stats: { x: 20 }, home_away: "away" },
  { row_id: "two", entity_id: "sample", event_id: "event-two", status: "completed", event_date: "2026-01-02", stats: { x: 999 }, home_away: "away" },
  { row_id: "two-provider-copy", entity_id: "sample", event_id: "event-two", status: "completed", event_date: "2026-01-02", stats: { x: 999 }, home_away: "away" },
  { row_id: "three", status: "postponed", event_date: "2026-01-03", stats: { x: 100 }, home_away: "home" },
];
const prepared = prepareStatRows(calculationRows);
check(prepared.rows.length === 2, "duplicate and postponed rows are excluded");
check(prepared.warnings.some((warning) => warning.includes("Duplicate")), "duplicate-row warning is retained");
check(prepared.warnings.some((warning) => warning.includes("Duplicate event")), "logical duplicate-event warning is retained");
check(prepared.warnings.some((warning) => warning.includes("postponed")), "postponed-row warning is retained");
check(filterLastN(prepared.rows, 1)[0].row_id === "two", "last-N uses most recent completed row");
check(filterRowsBySplit(prepared.rows, { homeAway: "home" }).length === 1, "split filter applies");
check(filterDateRange(prepared.rows, { type: "between", start: "2026-01-01", end: "2026-01-02" }).length === 1, "date range uses an exclusive end boundary");
const seasonRows = [
  { event_date: "2025-01-01", season: "2025" },
  { event_date: "2026-01-01", season: "2026" },
];
check(filterDateRange(seasonRows, { type: "season", value: "current" })[0].season === "2026", "current-season filtering uses the latest supplied season");
check(filterDateRange(seasonRows, { type: "season", value: "previous" })[0].season === "2025", "previous-season filtering uses the prior supplied season");
check(calculateAggregation(prepared.rows, "x", "average").value === 15, "row aggregation uses canonical stat key");
const missingAggregation = calculateAggregation([
  { stats: { x: 10 } },
  { stats: { x: null } },
  { stats: { x: 20 } },
], "x", "average");
check(missingAggregation.value === 15 && missingAggregation.sampleSize === 2 && missingAggregation.missingCount === 1, "missing row values do not inflate the average denominator");
const threshold = thresholdHitCount(prepared.rows, "x", "gte", 20);
check(threshold.hitCount === 1 && threshold.sampleSize === 2 && threshold.hitRate === 50, "threshold result separates hits, sample, and rate");
check(sortLeaderboard([{ value: 2 }, { value: 5 }], "desc")[0].value === 5, "leaderboard sort is deterministic");
check(statsRepository.getPlayerSummary("wnba-caitlin-clark", {
  statIds: ["basketball-points"],
  dateRange: { type: "last_n_games", value: 15 },
}).metadata.calculationWarnings.some((warning) => warning.includes("10 of 15")), "insufficient sample size produces a calculation warning");

// Provider and normalized result view models.
check(statsRepository.searchEntities("Messi", { leagueId: "mls" })[0].id === "mls-lionel-messi", "mock provider searches canonical entities");
check(statsRepository.getPlayerGameLogs("wnba-caitlin-clark", {
  dateRange: { type: "last_n_games", value: 5 },
}).rows.length === 5, "mock provider limits completed game logs");
const lastHomeRows = statsRepository.getPlayerGameLogs("wnba-caitlin-clark", {
  homeAway: "home",
  dateRange: { type: "last_n_games", value: 3 },
}).rows;
check(lastHomeRows.length === 3 && lastHomeRows.every((row) => row.home_away === "home"), "last-N is applied after split filters");
const comparisonFilters = createStatisticalQuery({
  mode: "stats",
  intent: "athlete_comparison",
  sportId: "basketball",
  leagueId: "wnba",
  playerIds: ["wnba-aja-wilson", "wnba-breanna-stewart"],
  statIds: ["basketball-points"],
  dateRange: { type: "last_n_games", value: 2 },
  lastNGames: 2,
  homeAway: "away",
});
const filteredComparison = statsRepository.compareEntities(
  comparisonFilters.playerIds,
  comparisonFilters.statIds,
  comparisonFilters,
);
check(filteredComparison.entities.every((entry) =>
  entry.rows.length === 2 && entry.rows.every((row) => row.home_away === "away")),
"player comparisons apply the same date window and split filters to both athletes");
check(statsRepository.getDataFreshness().mode === "sample", "mock provider declares sample mode");
check(statsRepository.getAvailableStats("motorsport", "f1").length > 0, "provider exposes available stats by sport");
let built = build("What is Caitlin Clark averaging in assists over her last 5 games?");
check(built.result.type === "instant_stat" && built.result.sampleSize === 5, "instant-stat view model includes sample size");
check(built.result.primaryLabel.includes("Assists"), "instant-stat view model labels canonical stat");
built = build("Show Caitlin Clark assists by game");
check(built.result.type === "game_log" && built.result.rows.length > 0, "game-log view model builds");
built = build("Who leads the WNBA in points this season?");
check(built.result.type === "leaderboard" && built.result.entries.length >= 3, "leaderboard view model builds");
built = build("Compare A'ja Wilson and Breanna Stewart over their last 5 games");
check(built.result.type === "athlete_comparison" && built.result.entities.length === 2, "comparison view model builds");
built = build("Show Caitlin Clark home and away points splits");
check(built.result.type === "split_summary" && built.result.splits.length === 2, "split view model builds");
built = build("Show Caitlin Clark points by opponent");
check(built.result.type === "split_summary" && built.result.splits.every((split) => ["LVA", "NYL"].includes(split.label)), "opponent split view model uses supplied opponents");
built = build("Show Unknown Athlete points");
check(built.result.type === "empty", "unknown entity yields an honest empty result");
built = build("Show Caitlin Clark fantasy points");
check(built.result.type === "unsupported", "unsupported stat yields an explicit unsupported result");
built = build("Has Tyrese Maxey gone over 24.5 points in his last 10 games?", { mode: "both", leagueId: "nba" });
check(built.result.type === "combined", "Both mode builds a combined result");
check(built.result.bettingContextStatus === "no-compatible-market", "Both mode rejects stale market context");
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
const freshParsed = parse("Has Tyrese Maxey gone over 24.5 points in his last 10 games?", { mode: "both", leagueId: "nba" });
const freshCombined = buildStatsResult(statsRepository, freshParsed, freshSportsRepository);
check(freshCombined.bettingContextStatus === "compatible-market-found", "Both mode attaches a fresh, entity-compatible sample market");
check(freshCombined.bettingContext.historicalHitRate !== freshCombined.bettingContext.confidence, "observed hit rate remains distinct from model confidence");
const periodStatsPayload = structuredClone(mockStatsProviderPayload);
periodStatsPayload.rows.forEach((row) => {
  if (row.entity_id === "nba-tyrese-maxey") row.period = "first-quarter";
});
const periodStatsProvider = createStatsRepository(periodStatsPayload);
const periodParsed = parse("Has Tyrese Maxey gone over 5.5 points in the first quarter over his last 10 games?", { mode: "both", leagueId: "nba" });
const periodCombined = buildStatsResult(periodStatsProvider, periodParsed, freshSportsRepository);
check(periodCombined.type === "combined" && periodCombined.bettingContext === null, "Both mode rejects a full-event market for a period-specific query");
built = build("Show Stephen Curry's last 5 games and points", { mode: "both", leagueId: "nba" });
check(!built.result.bettingContext, "Both mode does not fabricate absent market context");
const malformedPayload = structuredClone(mockStatsProviderPayload);
malformedPayload.rows.push({ status: "completed", event_date: "bad", stats: {} });
check(createStatsRepository(malformedPayload).getPlayerGameLogs("wnba-caitlin-clark", {}).rows.length === 10, "malformed rows do not contaminate provider results");
const stalePayload = structuredClone(mockStatsProviderPayload);
stalePayload.generated_at = "2020-01-01T00:00:00.000Z";
const staleProvider = createStatsRepository(stalePayload);
const staleParsed = parse("What is Caitlin Clark averaging in points?");
const staleResult = buildStatsResult(staleProvider, staleParsed, sportsRepository);
check(staleProvider.getDataFreshness().stale && staleResult.dataQualityWarning.includes("stale"), "stale sample snapshot produces an explicit warning");

// Live app interaction, persistence, accessibility, stale-response, and regression checks.
await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
await wait(700);
let app = frame.contentDocument;
let view = frame.contentWindow;
const modeButton = (mode) => app.querySelector(`[data-research-mode="${mode}"]`);
const submit = async (query, delay = 230) => {
  const input = app.querySelector("#queryInput");
  input.value = query;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  app.querySelector("#queryForm").requestSubmit();
  await wait(delay);
};
check(modeButton("stats").getAttribute("aria-checked") === "true", "URL restores Stats mode");
check(modeButton("stats").tabIndex === 0 && modeButton("betting").tabIndex === -1, "mode radiogroup uses roving tabindex");
check(!app.querySelector("#statsResults").hidden && app.querySelector("#bettingFilters").hidden, "Stats mode shows stats and hides betting filters");
check(app.querySelector("#betSlip").hidden, "Stats mode hides but does not remove the bet slip");
check(app.querySelector(".quick-prompts [data-query]"), "mode-aware prompt buttons render");
await submit("Show Caitlin Clark's last 5 games");
check(app.querySelector("#statsResultTitle")?.textContent.includes("Caitlin Clark"), "Stats query renders an athlete result");
check(app.querySelector("#statsResultContent").textContent.includes("Sample historical data"), "stats result is clearly labeled sample");
check(app.querySelector("#statsResultContent").textContent.includes("5 events"), "stats result displays sample size");
check(app.querySelector(".athlete-media-fallback")?.getAttribute("aria-label")?.includes("Caitlin Clark"), "athlete-media fallback exposes useful alternative text");
check(app.querySelector("#statsResultContent").textContent.includes("Confidence") === false, "Stats-only result does not introduce betting confidence");
app.querySelector('[data-theme-option="light"]').click();
check(app.body.dataset.theme === "light" && !app.querySelector("#statsResults").hidden, "light theme works with Stats results");
app.querySelector('[data-theme-option="dark"]').click();
check(app.body.dataset.theme === "dark", "dark theme remains available in Stats mode");
const preservedQuery = app.querySelector("#queryInput").value;
modeButton("betting").click();
check(app.querySelector("#queryInput").value === preservedQuery, "switching mode preserves user query text");
check(!app.querySelector("#bettingFilters").hidden && !app.querySelector("#betSlip").hidden, "Betting mode restores existing workspace and slip");
const preservedConfidence = app.querySelector("#confidenceRange").value;
const preservedMarketFilter = app.querySelector("#marketFilters .active")?.dataset.market || "";
modeButton("stats").click();
await submit("What is Caitlin Clark averaging in points over her last 5 games?");
modeButton("betting").click();
check(app.querySelector("#confidenceRange").value === preservedConfidence
  && (app.querySelector("#marketFilters .active")?.dataset.market || "") === preservedMarketFilter,
"Stats-specific parsing does not mutate Betting mode filters");
modeButton("stats").focus();
modeButton("stats").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
check(modeButton("betting").getAttribute("aria-checked") === "true" && app.activeElement === modeButton("betting"), "mode control supports arrow-key navigation");
modeButton("both").click();
await submit("Has Tyrese Maxey gone over 24.5 points in his last 10 games?");
check(app.querySelector(".combined-result"), "Both mode renders observed statistics before market context");
check(app.querySelector(".combined-result").textContent.includes("No compatible market attached"), "stale sample odds produce an explicit no-compatible-market state");
check(app.querySelector("#betSlip").hidden, "stale Both result does not expose unrelated betting controls");
const slipCountBeforeStats = app.querySelectorAll("#slipList .slip-item").length;
modeButton("stats").click();
await submit("What is Caitlin Clark averaging in assists over her last 5 games?");
modeButton("betting").click();
check(app.querySelectorAll("#slipList .slip-item").length === slipCountBeforeStats, "Stats research does not clear existing bet-slip state");
modeButton("stats").click();
await submit("Show Alex Smith points");
check(app.querySelectorAll("[data-entity-candidate]").length === 2, "ambiguous athletes render explicit candidate buttons");
check([...app.querySelectorAll("[data-entity-candidate]")].every((button) => button.tagName === "BUTTON"), "entity candidates use button semantics");
await submit("Show Caitlin Clark points by game");
check(app.querySelectorAll(".stats-table th[scope='col']").length >= 4, "game log table uses accessible column headers");
check(app.querySelectorAll(".stats-table th[scope='row']").length > 0, "game log table uses row headers");
check(app.querySelector(".stats-table caption"), "game log table has a caption");
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, "390px Stats view has no document overflow");
await submit("Show Caitlin Clark points");
const summaryTab = app.querySelector("[data-stats-tab='summary']");
const logTab = app.querySelector("[data-stats-tab='game-log']");
check(summaryTab?.getAttribute("aria-selected") === "true" && logTab?.getAttribute("role") === "tab", "stat result tabs expose accessible state");
const instantInsightSupport = app.querySelector("#statsResultContent [data-view-insight]");
instantInsightSupport?.click();
await wait(30);
check(app.querySelector("#insightDialog")?.open
  && app.querySelector("#insightDialogContent code")?.textContent.trim().startsWith("{"),
"sample insight opens canonical structured supporting data");
app.querySelector("#closeInsightDialog")?.click();
logTab.click();
check(app.querySelector("[data-stats-tab='game-log']").getAttribute("aria-selected") === "true" && app.querySelector(".stats-table"), "game-log result tab is interactive");
check(new URL(view.location.href).searchParams.get("resultTab") === "game-log", "result tab persists in URL state");
const refreshedLogTab = app.querySelector("[data-stats-tab='game-log']");
refreshedLogTab.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
check(app.querySelector("[data-stats-tab='summary']").getAttribute("aria-selected") === "true", "result tabs support keyboard navigation");
app.querySelector("[data-stats-tab='game-log']").click();
const stored = JSON.parse(view.localStorage.getItem("edgeboard-research-state"));
check(stored.mode === "stats" && stored.queryText.includes("Caitlin Clark"), "research mode and query persist to local storage");

const firstInput = app.querySelector("#queryInput");
firstInput.value = "Show Caitlin Clark points";
firstInput.dispatchEvent(new Event("input", { bubbles: true }));
app.querySelector("#queryForm").requestSubmit();
firstInput.value = "Show A'ja Wilson rebounds";
firstInput.dispatchEvent(new Event("input", { bubbles: true }));
app.querySelector("#queryForm").requestSubmit();
await wait(240);
check(app.querySelector("#statsResultTitle")?.textContent.includes("A'ja Wilson"), "late async response cannot overwrite a newer query");

const reloadComplete = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
frame.contentWindow.location.reload();
await reloadComplete;
await wait(850);
app = frame.contentDocument;
view = frame.contentWindow;
check(app.querySelector('[data-research-mode="stats"]').getAttribute("aria-checked") === "true", "refresh restores research mode");
check(app.querySelector("#queryInput").value.includes("A'ja Wilson"), "refresh restores query text");
check(app.querySelector("#statsResultTitle")?.textContent.includes("A'ja Wilson"), "refresh safely recomputes the saved sample result");
check(app.querySelector("[data-stats-tab='game-log']")?.getAttribute("aria-selected") === "true", "refresh restores selected result tab");
check(!app.querySelector("#dataStatus").textContent.includes("Live"), "sample mode never claims live statistical data");

const desktopFrame = document.createElement("iframe");
desktopFrame.style.width = "1280px";
desktopFrame.style.height = "900px";
desktopFrame.src = "/?mode=stats&scope=league:wnba&q=Who%20leads%20the%20WNBA%20in%20assists";
document.body.append(desktopFrame);
await new Promise((resolve) => desktopFrame.addEventListener("load", resolve, { once: true }));
await wait(800);
const desktopApp = desktopFrame.contentDocument;
check(desktopApp.documentElement.scrollWidth <= desktopApp.documentElement.clientWidth, "1280px Stats view has no document overflow");
check(/leader/i.test(desktopApp.querySelector("#statsResultTitle")?.textContent || ""), "desktop leaderboard query renders");
desktopFrame.remove();
check(window.testErrors.length === 0, `no application errors were captured${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} checks · ${STAT_REGISTRY.length} canonical stats)\n${checks.join("\n")}`;
frame.remove();
window.scrollTo(0, 0);
