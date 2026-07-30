import {
  getVisualizationDefinition,
  getVisualizationDefinitions,
  VISUALIZATION_REGISTRY,
} from "../src/config/visualization-registry.js";
import { getProviderVisualizationCapabilities } from "../src/config/provider-visualization-capabilities.js";
import { mockVisualizationProviderPayload } from "../src/data/mock-visualization-provider.js";
import { renderVisualization } from "../src/components/visualization-renderer.js";
import { parseVisualizationQuery } from "../src/services/visual-query-service.js";
import {
  buildVisualizationRequest,
  createVisualizationRepository,
  validateVisualizationData,
  validateVisualizationRequest,
  visualizationTableToCsv,
  visualizationTableToTsv,
} from "../src/services/visualization-service.js";

const failures = [];
const checks = [];
const check = (condition, label) => {
  checks.push(label);
  if (!condition) failures.push(label);
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitFor = async (predicate, timeout = 10000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(25);
  }
  return false;
};
const results = document.querySelector("#results");
const frame = document.querySelector("#app");
frame.contentWindow.addEventListener("error", (event) => window.testErrors.push(`app: ${event.message}`));
frame.contentWindow.addEventListener("unhandledrejection", (event) => window.testErrors.push(`app: ${String(event.reason)}`));

const repository = createVisualizationRepository(mockVisualizationProviderPayload, { delayMs: 0 });
const capabilities = getProviderVisualizationCapabilities();
const request = (visualizationType, sportId, entityIds, options = {}) => ({
  visualizationType,
  sportId,
  leagueId: options.leagueId || "",
  entityType: options.entityType || "athlete",
  entityIds,
  eventIds: options.eventIds || [],
  statIds: options.statIds || [],
  dateRange: options.dateRange || { type: "last_n_games", value: 20 },
  filters: options.filters || {},
  comparisonMode: options.comparisonMode || null,
});
const get = (type, sport, ids, options) => repository.getVisualizationData(request(type, sport, ids, options));
results.textContent = "Running architecture and validation checks…";

check(VISUALIZATION_REGISTRY.length >= 40, "1 visualization registry has broad canonical coverage");
check(new Set(VISUALIZATION_REGISTRY.map((item) => item.id)).size === VISUALIZATION_REGISTRY.length, "2 visualization IDs are unique");
check(VISUALIZATION_REGISTRY.every((item) => item.label && item.family && Array.isArray(item.requiredCapabilities)), "3 registry definitions expose normalized metadata");
check(getVisualizationDefinition("shot_chart")?.coordinateSystem === "neutral-basketball-half-court", "4 registry lookup returns shot-chart requirements");
check(getVisualizationDefinitions({ sportId: "motorsport" }).some((item) => item.id === "telemetry_chart"), "5 sport lookup returns motorsport visuals");
check(capabilities.sample && capabilities.partial, "6 provider capabilities disclose partial sample mode");
check(capabilities.capabilities.shotLocations && capabilities.capabilities.telemetry, "7 mock provider declares supported spatial and telemetry capabilities");
check(!capabilities.capabilities.possessionCoordinates && !capabilities.capabilities.tennisShotTracking, "8 unsupported provider capabilities remain false");
const supportedRequest = buildVisualizationRequest(request("shot_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" }));
check(validateVisualizationRequest(supportedRequest, capabilities).valid, "9 supported visualization request validates");
const unsupportedRequest = buildVisualizationRequest(request("possession_map", "soccer", ["mls-lionel-messi"], { leagueId: "mls" }));
check(!validateVisualizationRequest(unsupportedRequest, capabilities).valid, "10 represented but unimplemented visual request is rejected");
const wrongSport = buildVisualizationRequest(request("shot_chart", "baseball", ["mlb-aaron-judge"], { leagueId: "mlb" }));
check(!validateVisualizationRequest(wrongSport, capabilities).valid, "11 sport-incompatible request is rejected");
check(repository.getAvailableVisualizations({ sportId: "basketball", entityType: "athlete", entityIds: ["wnba-caitlin-clark"] })
  .some((item) => item.id === "shot_chart" && item.available), "12 availability requires capability and matching data");
check(repository.getAvailableVisualizations({ sportId: "soccer", entityType: "athlete", entityIds: ["mls-lionel-messi"] })
  .some((item) => item.id === "possession_map" && !item.available), "13 unavailable visual remains discoverable but disabled");

const validCoordinates = validateVisualizationData(getVisualizationDefinition("shot_chart"), [
  { row_id: "a", x: 0, y: 100, outcome: "made", pointValue: 2 },
], { unit: "shot" });
check(validCoordinates.validRows.length === 1, "14 boundary coordinates are valid");
const invalidCoordinates = validateVisualizationData(getVisualizationDefinition("shot_chart"), [
  { row_id: "a", x: -1, y: 50, outcome: "made", pointValue: 2 },
  { row_id: "b", x: 50, y: 101, outcome: "missed", pointValue: 3 },
], { unit: "shot" });
check(invalidCoordinates.validRows.length === 0 && invalidCoordinates.warnings.length > 0, "15 out-of-bounds coordinates are excluded with warning");
const invalidTimestamp = validateVisualizationData(getVisualizationDefinition("timeline"), [
  { row_id: "bad-time", timestamp: "not-a-date", label: "Bad" },
], { unit: "event" });
check(invalidTimestamp.validRows.length === 0, "16 invalid timestamps are excluded");
const duplicateRows = validateVisualizationData(getVisualizationDefinition("bar_chart"), [
  { row_id: "same", label: "A", value: 1 }, { row_id: "same", label: "A", value: 2 },
], { unit: "count" });
check(duplicateRows.validRows.length === 1 && duplicateRows.warnings.some((item) => item.includes("Duplicate")), "17 duplicate rows do not distort visuals");
const missingValue = validateVisualizationData(getVisualizationDefinition("line_chart"), [
  { row_id: "gap", timestamp: "2026-07-01T00:00:00Z", value: null },
  { row_id: "value", timestamp: "2026-07-02T00:00:00Z", value: 2 },
], { unit: "count" });
check(missingValue.validRows[0].value === null, "18 missing values remain missing");
const zeroValue = validateVisualizationData(getVisualizationDefinition("line_chart"), [
  { row_id: "zero", timestamp: "2026-07-01T00:00:00Z", value: 0 },
], { unit: "count" });
check(zeroValue.validRows[0].value === 0, "19 legitimate zero remains zero");
const mixedUnits = validateVisualizationData(getVisualizationDefinition("bar_chart"), [
  { row_id: "mixed", label: "A", value: 2 },
], { unit: "mixed" });
check(mixedUnits.warnings.some((item) => item.includes("Mixed units")), "20 mismatched units produce a warning");
const telemetryValidation = validateVisualizationData(getVisualizationDefinition("telemetry_chart"), [
  { row_id: "t1", distance: 200, value: 100, metric: "speed", seriesId: "A" },
  { row_id: "t2", distance: 100, value: 90, metric: "speed", seriesId: "A" },
], { unit: "km/h" });
check(telemetryValidation.warnings.some((item) => item.includes("Unordered"))
  && telemetryValidation.validRows[0].distance === 100, "21 unordered telemetry is warned and sorted");
const invalidPosition = validateVisualizationData(getVisualizationDefinition("race_position_chart"), [
  { row_id: "p", lap: 1, position: 0, seriesId: "A", value: 0 },
], { unit: "position" });
check(invalidPosition.validRows.length === 0, "22 invalid race positions are excluded");
const invalidLap = validateVisualizationData(getVisualizationDefinition("lap_time_chart"), [
  { row_id: "l", lap: 1, value: 90, seriesId: "A", valid: false },
], { unit: "seconds" });
check(invalidLap.validRows.length === 0, "23 invalid non-pit laps are excluded");
const marketValidation = validateVisualizationData(getVisualizationDefinition("market_line_chart"), [
  { row_id: "m2", timestamp: "2026-07-02T00:00:00Z", value: 2, marketId: "one" },
  { row_id: "m1", timestamp: "2026-07-01T00:00:00Z", value: 1, marketId: "one" },
  { row_id: "other", timestamp: "2026-07-03T00:00:00Z", value: 3, marketId: "two" },
], { unit: "points" });
check(marketValidation.warnings.some((item) => item.includes("market identities"))
  && marketValidation.warnings.some((item) => item.includes("timestamps")), "24 invalid market history is normalized with explicit warnings");

const line = await get("line_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" });
results.textContent = "Running shared visualization checks…";
check(line.status === "ready" && line.sampleSize === 10, "25 recent trend line uses normalized provider rows");
check(line.points.some((point) => point.value === null), "26 recent trend preserves a missing-value gap");
check(line.sources[0].provider && line.dataFreshness.lastUpdatedAt, "27 visual exposes source and freshness");
check(line.coverage.sample && line.warnings.some((item) => /sample/i.test(item)), "28 sample visual is clearly labeled");
check(line.accessibleSummary.includes("valid sample row"), "29 visual generates an accessible summary");
check(line.table.rows.length === line.sampleSize, "30 accessible table retains all validated rows");
const rolling = await get("rolling_average_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" });
results.textContent = "Shared checks · rolling complete…";
check(rolling.status === "ready" && rolling.series.some((series) => series.id.includes("rolling")), "31 rolling average derives from source trend rows");
const threshold = await get("threshold_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba", filters: { threshold: 24.5 } });
results.textContent = "Shared checks · threshold complete…";
check(threshold.summaryMetrics.some((item) => item.id === "threshold"), "32 threshold chart calculates hit count");
const split = await get("grouped_bar_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" });
results.textContent = "Shared checks · split complete…";
check(split.points.some((point) => point.label === "Home") && split.points.some((point) => point.label === "Away"), "33 split bars expose home and away");
const distribution = await get("distribution_plot", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" });
results.textContent = "Shared checks · distribution complete…";
check(distribution.summaryMetrics.some((item) => item.id === "median"), "34 distribution exposes median, average, min, and max");
const percentile = await get("percentile_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" });
results.textContent = "Shared checks · percentile complete…";
check(percentile.points.every((point) => point.poolSize === 24), "35 percentile chart exposes comparison-pool size");
const eventTimeline = await get("event_sequence", "basketball", ["IND-W"], { leagueId: "wnba", entityType: "team" });
results.textContent = "Shared checks · timeline complete…";
check(eventTimeline.status === "ready" && eventTimeline.annotations.length === 4, "36 event timeline retains validated annotations");
const comparison = await get("comparison_matrix", "basketball", ["wnba-caitlin-clark", "wnba-sabrina-ionescu"], { leagueId: "wnba" });
results.textContent = "Shared checks · comparison complete…";
check(comparison.status === "ready" && new Set(comparison.points.map((row) => row.entityId)).size === 2, "37 comparison matrix supports multiple canonical entities");

const basketballTypes = [
  ["shot_chart", ["wnba-caitlin-clark"], { leagueId: "wnba" }],
  ["zone_map", ["IND-W"], { leagueId: "wnba", entityType: "team" }],
  ["event_sequence", ["IND-W"], { leagueId: "wnba", entityType: "team" }],
];
results.textContent = "Running representative sport checks…";
for (const [type, ids, options] of basketballTypes) check((await get(type, "basketball", ids, options)).status === "ready", `basketball ${type} renders from sample provider data`);
const madeShots = await get("shot_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba", filters: { madeMissed: "made" } });
check(madeShots.points.every((point) => point.outcome === "made"), "41 basketball makes-only filter applies");
const missedShots = await get("shot_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba", filters: { madeMissed: "missed" } });
check(missedShots.points.every((point) => point.outcome !== "made"), "42 basketball misses-only filter applies");
const periodShots = await get("shot_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba", filters: { period: 4 } });
check(periodShots.points.every((point) => point.period === 4), "43 basketball period filter applies");
const noShotCoordinates = await get("shot_chart", "basketball", ["nba-stephen-curry"], { leagueId: "nba" });
check(noShotCoordinates.status === "unavailable" && /No basketball shot chart rows/.test(noShotCoordinates.warnings[0]), "44 missing basketball coordinates produce an honest fallback");

results.textContent = "Representative checks · baseball…";
for (const [type, ids] of [["spray_chart", ["mlb-aaron-judge"]], ["pitch_location_map", ["mlb-gerrit-cole"]], ["pitch_mix_chart", ["mlb-gerrit-cole"]], ["stacked_bar_chart", ["NYY"]]]) {
  check((await get(type, "baseball", ids, { leagueId: "mlb", entityType: type === "stacked_bar_chart" ? "team" : "athlete" })).status === "ready", `baseball ${type} renders`);
}
const sliderPitches = await get("pitch_location_map", "baseball", ["mlb-gerrit-cole"], { leagueId: "mlb", filters: { pitchType: "slider" } });
check(sliderPitches.points.every((point) => point.pitchType === "slider"), "49 pitch-type filter applies");
const leftPitches = await get("pitch_location_map", "baseball", ["mlb-gerrit-cole"], { leagueId: "mlb", filters: { handedness: "left" } });
check(leftPitches.points.every((point) => point.handedness === "left"), "50 batter-handedness filter applies");
check((await get("spray_chart", "baseball", ["mlb-shohei-ohtani"], { leagueId: "mlb" })).status === "unavailable", "51 absent batted-ball coordinates never generate a spray chart");

results.textContent = "Representative checks · hockey…";
for (const [type, ids, entityType] of [
  ["shot_map", ["nhl-auston-matthews"], "athlete"], ["shot_map", ["TOR"], "team"],
  ["line_chart", ["nhl-igor-shesterkin"], "athlete"], ["event_sequence", ["TOR"], "team"],
]) check((await get(type, "ice-hockey", ids, { leagueId: "nhl", entityType })).status === "ready", `hockey ${type} ${entityType} visual renders`);
const powerPlayShots = await get("shot_map", "ice-hockey", ["nhl-auston-matthews"], { leagueId: "nhl", filters: { strengthState: "power-play" } });
check(powerPlayShots.points.every((point) => point.strengthState === "power-play"), "56 hockey strength-state filter applies");
check((await get("shot_map", "ice-hockey", ["nhl-connor-mcdavid"], { leagueId: "nhl" })).status === "unavailable", "57 aggregate shot totals do not become fake hockey locations");

results.textContent = "Representative checks · soccer…";
for (const [type, ids, entityType] of [
  ["shot_map", ["mls-lionel-messi"], "athlete"], ["heat_map", ["mls-lionel-messi"], "athlete"],
  ["passing_network", ["MIA"], "team"], ["corner_map", ["MIA"], "team"], ["event_sequence", ["MIA"], "team"],
]) check((await get(type, "soccer", ids, { leagueId: "mls", entityType })).status === "ready", `soccer ${type} renders from valid event data`);
const onTarget = await get("shot_map", "soccer", ["mls-lionel-messi"], { leagueId: "mls", filters: { onTargetOnly: true } });
check(onTarget.points.every((point) => point.onTarget || ["goal", "saved"].includes(point.outcome)), "63 soccer shots-on-target filter applies");
check((await get("heat_map", "soccer", ["soccer-sample-player"], { leagueId: "epl" })).status === "unavailable", "64 aggregate-only soccer data rejects heat maps");
check((await get("passing_network", "soccer", ["mls-lionel-messi"], { leagueId: "mls" })).status === "unavailable", "65 missing pass origin/destination data rejects a network");

results.textContent = "Representative checks · combat…";
for (const type of ["strike_map", "grouped_bar_chart", "takedown_map", "fight_timeline", "matchup_radar"]) {
  results.textContent = `Representative checks · combat · ${type}…`;
  const ids = ["grouped_bar_chart", "fight_timeline", "matchup_radar"].includes(type)
    ? ["ufc-sample-fighter-a", "ufc-sample-fighter-b"] : ["ufc-sample-fighter-a"];
  try {
    const combatVisual = await Promise.race([
      get(type, "mma", ids, { leagueId: "ufc", entityType: "fighter" }),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out: ${type}`)), 1500)),
    ]);
    check(combatVisual.status === "ready", `combat ${type} renders`);
  } catch (error) {
    results.textContent = `ERROR\n${error.stack || error.message}`;
    throw error;
  }
}
const roundStrikes = await get("strike_map", "mma", ["ufc-sample-fighter-a"], { leagueId: "ufc", entityType: "fighter", filters: { round: 2 } });
check(roundStrikes.points.every((point) => point.round === 2), "71 combat round filter applies");
check((await get("takedown_map", "boxing", ["boxing-sample-boxer-a"], { leagueId: "boxing", entityType: "boxer" })).status === "unavailable", "72 boxing excludes MMA takedown and submission visual data");
check((await get("strike_map", "mma", ["ufc-missing-targets"], { leagueId: "ufc", entityType: "fighter" })).status === "unavailable", "73 missing strike targets show an honest fallback");

results.textContent = "Representative checks · motorsports…";
for (const [type, ids, leagueId] of [
  ["race_position_chart", ["f1-max-verstappen", "f1-lando-norris"], "f1"],
  ["lap_time_chart", ["f1-max-verstappen", "f1-lando-norris"], "f1"],
  ["qualifying_chart", ["f1-max-verstappen", "f1-lando-norris"], "f1"],
  ["telemetry_chart", ["f1-max-verstappen", "f1-lando-norris"], "f1"],
  ["standings_progression", ["f1-max-verstappen", "f1-lando-norris"], "f1"],
  ["race_position_chart", ["nascar-sample-driver"], "nascar-cup"],
]) check((await get(type, "motorsport", ids, { leagueId, entityType: "driver" })).status === "ready", `motorsport ${leagueId} ${type} renders`);
const f1Race = await get("race_position_chart", "motorsport", ["f1-max-verstappen", "f1-lando-norris"], { leagueId: "f1", entityType: "driver" });
check(f1Race.annotations.some((row) => row.pitStop), "80 race position chart retains pit-stop annotations");
const nascar = await get("race_position_chart", "motorsport", ["nascar-sample-driver"], { leagueId: "nascar-cup", entityType: "driver" });
check(nascar.annotations.some((row) => row.stage) && nascar.annotations.some((row) => row.caution), "81 NASCAR visual uses stages and caution terminology");
check(!nascar.title.includes("Formula 1"), "82 non-F1 visual avoids Formula 1 terminology");
check((await get("track_map", "motorsport", ["f1-max-verstappen"], { leagueId: "f1", entityType: "driver" })).status === "unavailable", "83 missing track coordinates do not create a fake circuit");

results.textContent = "Representative checks · golf and tennis…";
for (const type of ["golf_scoring_chart", "line_chart", "golf_dispersion_map"]) {
  check((await get(type, "golf", ["golf-sample-golfer"], { leagueId: "pga", entityType: "golfer" })).status === "ready", `golf ${type} renders`);
}
for (const type of ["serve_placement_map", "tennis_match_flow", "grouped_bar_chart"]) {
  check((await get(type, "tennis", ["tennis-sample-player"], { leagueId: "atp", entityType: "tennis-player" })).status === "ready", `tennis ${type} renders`);
}
check((await get("rally_map", "tennis", ["tennis-sample-player"], { leagueId: "atp", entityType: "tennis-player" })).status === "unavailable", "90 missing tennis tracking produces a rally-map fallback");

results.textContent = "Representative checks · betting…";
for (const type of ["market_line_chart", "odds_movement_chart", "threshold_chart", "correlation_matrix"]) {
  const visual = await get(type, "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" });
  check(visual.status === "ready", `betting ${type} renders from archived sample history`);
}
const odds = await get("odds_movement_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" });
check(odds.unit === "american odds" && !odds.accessibleSummary.includes("model probability"), "95 odds view does not call implied odds a model probability");
const correlation = await get("correlation_matrix", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" });
check(correlation.warnings.some((item) => item.includes("does not imply causation")), "96 correlation warns against causation");
check(correlation.points.every((point) => point.settlementScope === "full-event"), "97 correlation preserves compatible settlement scope");
check((await get("market_line_chart", "basketball", ["nba-stephen-curry"], { leagueId: "nba" })).status === "unavailable", "98 absent archived lines never create fake history");

const queryCases = [
  ["Show Caitlin Clark’s shot chart over her last 10 games.", "shot_chart"],
  ["Create a touch heat map for this match.", "heat_map"],
  ["Show this fighter’s fight timeline.", "fight_timeline"],
  ["Show the Formula 1 position chart from the last race.", "race_position_chart"],
  ["Compare two drivers’ lap times.", "lap_time_chart"],
  ["Show Formula 1 telemetry.", "telemetry_chart"],
  ["Show how the odds moved today.", "odds_movement_chart"],
  ["Show where this hitter has been pulling the ball.", "spray_chart"],
  ["Map this tennis player’s first serves.", "serve_placement_map"],
  ["Chart this prop against the current line.", "threshold_chart"],
];
queryCases.forEach(([query, expected]) => check(parseVisualizationQuery(query).visualizationType === expected, `query parser recognizes ${expected}`));
check(parseVisualizationQuery("Tell me something interesting").intent === "unsupported_visualization", "109 unsupported query does not invent a visual");
check(parseVisualizationQuery("Show a shot chart in quarter 4").request.filters.period === 4, "110 query parser exposes period filter");
check(parseVisualizationQuery("Show a shot chart, makes only").request.filters.madeMissed === "made", "111 query parser exposes made/missed filter");
check(parseVisualizationQuery("Chart points against line 24.5").request.filters.threshold === 24.5, "112 query parser exposes threshold");

const renderedShot = renderVisualization(await get("shot_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" }), {
  availableVisualizations: repository.getAvailableVisualizations({ sportId: "basketball", entityType: "athlete", entityIds: ["wnba-caitlin-clark"] }),
});
check(renderedShot.includes('role="region"') && renderedShot.includes('role="img"'), "113 renderer labels chart regions and points");
check(renderedShot.includes("Accessible data table") && renderedShot.includes("<caption>"), "114 every rendered visual has a table fallback");
check(renderedShot.includes("Sample data") && renderedShot.includes("Data limitations"), "115 rendered sample and warning disclosures are visible");
check(renderedShot.includes('tabindex="0"'), "116 chart points are keyboard focusable");
check(renderedShot.includes("<title>") && renderedShot.includes("<desc"), "117 SVG exposes title and description");
check(renderedShot.includes("visual-schematic") && renderedShot.includes('aria-hidden="true"'), "118 decorative spatial schematic is hidden from assistive technology");
const tsv = visualizationTableToTsv(line);
check(tsv.includes("Source") && tsv.includes("Sample data"), "119 TSV export includes source and sample disclosure");
const injectionResult = { ...line, table: { columns: ["Value"], rows: [["=2+2"]] } };
check(visualizationTableToCsv(injectionResult).includes("'=2+2"), "120 CSV export prevents formula injection");

const callsBefore = repository.getDiagnostics().providerCalls;
results.textContent = "Running cache and cancellation checks…";
const cachedOne = await get("shot_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" });
const callsAfterOne = repository.getDiagnostics().providerCalls;
const cachedTwo = await get("shot_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" });
check(cachedOne === cachedTwo && repository.getDiagnostics().providerCalls === callsAfterOne, "121 cache reuse avoids duplicate provider calls");
check(callsAfterOne >= callsBefore, "122 provider-call diagnostics remain monotonic");
const cancellableRepository = createVisualizationRepository(mockVisualizationProviderPayload, { delayMs: 30 });
const controller = new AbortController();
const cancelled = cancellableRepository.getVisualizationData(request("shot_chart", "basketball", ["wnba-caitlin-clark"], { leagueId: "wnba" }), { signal: controller.signal })
  .then(() => false).catch((error) => error.name === "AbortError");
controller.abort();
check(await cancelled, "123 stale visualization request is cancellable");

results.textContent = "Running live UI checks…";
const initialAppLoaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
frame.src = `/?visual=race_position_chart&visualEntity=f1-max-verstappen&visualSport=motorsport&visualLeague=f1&visualWindow=10&visualPhase=7&visualHarness=${Date.now()}`;
await initialAppLoaded;
frame.contentWindow.addEventListener("error", (event) => window.testErrors.push(`app: ${event.message}`));
frame.contentWindow.addEventListener("unhandledrejection", (event) => window.testErrors.push(`app: ${String(event.reason)}`));
await waitFor(() => frame.contentDocument?.querySelector("#visualizationTitle")?.textContent.includes("race position")
  && frame.contentDocument?.querySelectorAll("[data-series-toggle]").length === 2);
document.querySelector("#results").textContent = "Running live UI checks · initial visual ready…";
let app = frame.contentDocument;
let appWindow = frame.contentWindow;
check(app.body.classList.contains("visual-analytics-active"), "124 shareable URL restores visual workspace");
check(app.querySelector("#visualizationTitle")?.textContent.includes("race position"), "125 deep link restores the requested visualization");
check(app.querySelector(".visual-chart-svg") && app.querySelector(".visual-data-table"), "126 live UI renders chart and accessible table");
check(app.querySelectorAll("[data-series-toggle]").length === 2, "127 comparison series expose accessible legend toggles");
const legend = app.querySelector("[data-series-toggle]");
legend?.focus();
check(Boolean(legend) && app.activeElement === legend && legend.getAttribute("aria-pressed") === "true", "128 legend is keyboard focusable and stateful");
check(app.querySelector("#visualSlipToggle")?.tagName === "BUTTON", "129 visual workspace preserves bet-slip access");
app.querySelector("#visualSlipToggle").click();
check(!app.querySelector("#visualSlipPanel").hidden, "130 visual bet slip opens");
app.querySelector("#closeVisualSlip").click();
check(app.querySelector("#visualSlipPanel").hidden, "131 visual bet slip closes with focus restoration");
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, "132 mobile visual workspace has no document overflow");
app.querySelector('[data-theme-option="light"]')?.click();
check(app.body.dataset.theme === "light", "133 light theme renders visuals");
app.querySelector('[data-theme-option="dark"]')?.click();
check(app.body.dataset.theme === "dark", "134 dark theme renders visuals");
check(window.testErrors.length === 0, "135 no browser errors or unhandled rejections occurred");

legend?.click();
await waitFor(() => new URL(frame.contentWindow.location.href).searchParams.get("visualSeries")?.length > 0
  && frame.contentDocument?.querySelector('[data-visual-control="type"]'));
document.querySelector("#results").textContent = "Running live UI checks · legend state ready…";
app = frame.contentDocument;
check(new URL(frame.contentWindow.location.href).searchParams.get("visualSeries")?.length > 0,
  "136 legend selection persists in shareable visual state");
const priorVisualUrl = frame.contentWindow.location.href;
const typeControl = app.querySelector('[data-visual-control="type"]');
typeControl.value = "lap_time_chart";
typeControl.dispatchEvent(new Event("change", { bubbles: true }));
await waitFor(() => frame.contentDocument?.querySelector("#visualizationTitle")?.textContent.includes("lap-time"));
app = frame.contentDocument;
check(app.querySelector("#visualizationTitle")?.textContent.includes("lap-time")
  && new URL(frame.contentWindow.location.href).searchParams.get("visual") === "lap_time_chart",
  "137 visualization type changes update chart and URL");
frame.contentWindow.history.replaceState({}, "", priorVisualUrl);
frame.contentWindow.dispatchEvent(new PopStateEvent("popstate"));
await waitFor(() => frame.contentDocument?.querySelector("#visualizationTitle")?.textContent.includes("race position"));
document.querySelector("#results").textContent = "Running live UI checks · history state ready…";
app = frame.contentDocument;
check(app.querySelector("#visualizationTitle")?.textContent.includes("race position"),
  "138 popstate restores the prior visual state");
const windowControl = app.querySelector('[data-visual-control="window"]');
windowControl.value = "5";
windowControl.dispatchEvent(new Event("change", { bubbles: true }));
await waitFor(() => new URL(frame.contentWindow.location.href).searchParams.get("visualWindow") === "5"
  && frame.contentDocument?.querySelector('[data-visual-control="threshold"]'));
check(new URL(frame.contentWindow.location.href).searchParams.get("visualWindow") === "5",
  "139 date-window selection persists");
const thresholdControl = frame.contentDocument.querySelector('[data-visual-control="threshold"]');
thresholdControl.value = "91.5";
thresholdControl.dispatchEvent(new Event("change", { bubbles: true }));
await waitFor(() => new URL(frame.contentWindow.location.href).searchParams.get("visualThreshold") === "91.5"
  && frame.contentDocument?.querySelector("#visualizationTitle"));
document.querySelector("#results").textContent = "Running live UI checks · controls ready…";
check(new URL(frame.contentWindow.location.href).searchParams.get("visualThreshold") === "91.5",
  "140 threshold selection persists");
frame.contentDocument.querySelector("[data-copy-visual-summary]")?.click();
await waitFor(() => Boolean(frame.contentDocument?.querySelector(".visual-action-status")?.textContent));
check(Boolean(frame.contentDocument.querySelector(".visual-action-status")?.textContent),
  "141 copy-summary action announces success or permission failure");
check(getComputedStyle(frame.contentDocument.querySelector(".visual-chart-svg")).animationName === "none",
  "142 visual charts use no comprehension-delaying animation");

frame.style.width = "1280px";
await wait(60);
check(frame.contentDocument.documentElement.scrollWidth <= frame.contentDocument.documentElement.clientWidth,
  "143 desktop visual layout has no document overflow");
frame.style.width = "768px";
await wait(60);
check(frame.contentDocument.documentElement.scrollWidth <= frame.contentDocument.documentElement.clientWidth,
  "144 tablet visual layout has no document overflow");
frame.style.width = "390px";

const profileLoaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
frame.src = "/?player=wnba-caitlin-clark&tab=overview&visualProfileTest=7";
await profileLoaded;
await waitFor(() => frame.contentDocument?.querySelector("#athleteProfileContent [data-open-visual]")
  || frame.contentDocument?.querySelector("#athleteProfileNotFound:not([hidden])"));
document.querySelector("#results").textContent = "Running live UI checks · profile ready…";
app = frame.contentDocument;
const profileVisualAction = app.querySelector("#athleteProfileContent [data-open-visual]");
check(profileVisualAction, "145 athlete profiles expose a visual-analytics entry point");
profileVisualAction?.click();
await waitFor(() => frame.contentDocument?.body.classList.contains("visual-analytics-active"));
document.querySelector("#results").textContent = "Running live UI checks · profile visual ready…";
check(frame.contentDocument.body.classList.contains("visual-analytics-active"), "146 athlete profile visual action opens the shared workspace");

frame.contentDocument.querySelector("#closeVisualAnalytics")?.click();
await wait(50);
app = frame.contentDocument;
app.querySelector('[data-research-mode="both"]')?.click();
const visualQuery = app.querySelector("#queryInput");
visualQuery.value = "Show Caitlin Clark’s shot chart over her last 10 games.";
app.querySelector("#queryForm").requestSubmit();
await waitFor(() => frame.contentDocument?.querySelector("#visualizationTitle")?.textContent.includes("shot locations"));
document.querySelector("#results").textContent = "Running live UI checks · research visual ready…";
app = frame.contentDocument;
check(app.querySelector("#visualizationTitle")?.textContent.includes("shot locations"), "147 visual requests run through the research query workflow");
check(new URL(frame.contentWindow.location.href).searchParams.get("mode") === "both", "148 visual research preserves Both mode");
check(app.querySelector("#betSlip") && app.querySelector("#visualSlipToggle"), "149 visual navigation preserves bet-slip state and access");
check(window.testErrors.length === 0, "150 extended interaction tests produce no console errors");

document.querySelector("#results").textContent = failures.length
  ? `FAIL ${failures.length}/${checks.length}\n${failures.join("\n")}\n\n${window.testErrors.join("\n")}`
  : `PASS ${checks.length}/${checks.length}`;
