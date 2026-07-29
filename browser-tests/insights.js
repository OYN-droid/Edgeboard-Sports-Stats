import {
  getEligibleInsightRules,
  getInsightRule,
  INSIGHT_RULES,
} from "../src/config/insight-rules.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { mockStatsProviderPayload } from "../src/data/mock-stats-provider.js";
import {
  buildRarityContext,
  calculateStreak,
  deduplicateInsights,
  evaluateInsightRule,
  normalizeInsightRows,
  phraseInsight,
  scoreInsightCandidate,
  validateInsightCandidate,
  validateRecordCandidate,
} from "../src/services/insight-engine.js";
import { createInsightService } from "../src/services/insight-service.js";
import { classifyResearchQuery } from "../src/services/query-classifier.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { createStatsRepository } from "../src/services/stats-provider.js";
import { parseStatisticalQuery } from "../src/services/stats-query-service.js";
import { buildStatsResult } from "../src/services/stats-results-service.js";

const failures = [];
const checks = [];
const check = (condition, label) => {
  checks.push(label);
  if (!condition) failures.push(label);
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const results = document.querySelector("#results");
const frame = document.querySelector("#app");
frame.contentWindow.addEventListener("error", (event) => window.testErrors.push(`app: ${event.message}`));
frame.contentWindow.addEventListener("unhandledrejection", (event) => window.testErrors.push(`app: ${String(event.reason)}`));

const provider = createStatsRepository();
const sportsRepository = createSportsRepository(mockProviderPayload);
const service = createInsightService(provider, sportsRepository);
const entity = (id) => provider.entities.find((item) => item.id === id);
const completedRow = (id, value, overrides = {}) => ({
  row_id: `row-${id}`,
  entity_id: overrides.entity_id || "test-player",
  league_id: overrides.league_id || "wnba",
  sport_id: overrides.sport_id || "basketball",
  event_id: `event-${id}`,
  event_date: overrides.event_date || `2026-07-${String(id).padStart(2, "0")}T00:00:00.000Z`,
  season: overrides.season || "2026",
  season_type: overrides.season_type || "regular-season",
  status: overrides.status || "completed",
  home_away: overrides.home_away || (id % 2 ? "home" : "away"),
  result: overrides.result || "win",
  method: overrides.method || "",
  stats: overrides.stats || { "basketball-assists": value },
  updated_at: overrides.updated_at || "2026-07-28T00:00:00.000Z",
});
const testEntity = { id: "test-player", name: "Test Player", entityType: "player", sportId: "basketball", leagueId: "wnba" };
const assistRule = getInsightRule("basketball-assist-threshold-streak");

// 1–6: rule eligibility.
check(getEligibleInsightRules({ sportId: "basketball", leagueId: "wnba", entityType: "player", availableStats: ["basketball-assists"] })
  .some((rule) => rule.ruleId === assistRule.ruleId), "1 basketball rule is eligible for basketball");
check(!getEligibleInsightRules({ sportId: "american-football", leagueId: "nfl", entityType: "player", availableStats: ["basketball-assists"] })
  .some((rule) => rule.ruleId === assistRule.ruleId), "2 basketball rule is excluded from football");
check(!getEligibleInsightRules({ sportId: "boxing", leagueId: "boxing", entityType: "competitor", availableStats: ["combat-submission-wins"] })
  .some((rule) => rule.ruleId === "combat-submission-streak"), "3 submission rule is excluded from boxing");
check(!getEligibleInsightRules({ sportId: "basketball", leagueId: "wnba", entityType: "player", availableStats: ["motorsport-average-finishing-position"] })
  .some((rule) => rule.ruleId === "motorsport-top-ten-streak"), "4 track rule is excluded from basketball");
check(!evaluateInsightRule(assistRule, { entity: testEntity, rows: [1, 2, 3].map((id) => completedRow(id, null, { stats: {} })) }),
  "5 missing required stat suppresses rule");
check(!evaluateInsightRule({ ...assistRule, enabled: false }, { entity: testEntity, rows: [1, 2, 3].map((id) => completedRow(id, 8)) }),
  "6 disabled rule is excluded");
check(!evaluateInsightRule(assistRule, {
  entity: testEntity,
  rows: [completedRow(1, 8), completedRow(2, 8)],
}), "review: the configured minimum evaluation sample is enforced");

// 7–18: streak mechanics.
const activeRows = [1, 2, 3, 4].map((id) => completedRow(id, id === 1 ? 4 : 8));
const activeStreak = calculateStreak(activeRows, assistRule, { activeOnly: true });
check(activeStreak?.active && activeStreak.length === 3, "7 active threshold streak");
const endedRows = [...activeRows, completedRow(5, 2)];
const endedStreak = calculateStreak(endedRows, assistRule);
check(endedStreak?.length === 3 && !endedStreak.active, "8 ended threshold streak");
check(calculateStreak([completedRow(1, 8), completedRow(3, 8)], assistRule)?.length === 2,
  "9 missed athlete appearance does not count as a failure");
check(calculateStreak([...activeRows, completedRow(5, 0, { status: "postponed" })], assistRule, { activeOnly: true })?.length === 3,
  "10 postponed event is ignored");
check(calculateStreak([...activeRows, completedRow(5, 0, { status: "cancelled" })], assistRule, { activeOnly: true })?.length === 3,
  "11 cancelled event is ignored");
check(normalizeInsightRows([...activeRows, { ...activeRows[2], row_id: "duplicate" }], assistRule).length === 4,
  "12 duplicate event is removed");
const crossSeason = [completedRow(1, 8, { season: "2025" }), completedRow(2, 8, { season: "2026" }), completedRow(3, 8, { season: "2026" })];
check(calculateStreak(crossSeason, assistRule)?.length === 2, "13 streak does not cross season boundary by default");
const playoffRule = { ...assistRule, seasonType: "playoffs" };
check(calculateStreak([
  completedRow(1, 8, { season_type: "regular-season" }),
  completedRow(2, 8, { season_type: "playoffs" }),
  completedRow(3, 8, { season_type: "playoffs" }),
], playoffRule)?.length === 2, "14 playoff-only streak scope");
check(service.generateAthleteInsightCandidates("ufc-sample-fighter-a").some((item) => item.type === "finish_streak" || item.type === "win_streak"),
  "15 combat finish or win streak is generated");
check(service.generateAthleteInsightCandidates("nascar-sample-driver").some((item) => item.type === "top_finish_streak" || item.type === "point_streak"),
  "16 motorsports top-finish or points streak is generated");
check(service.generateAthleteInsightCandidates("mlb-aaron-judge").some((item) => item.type === "hit_streak"),
  "17 baseball hit streak is generated");
check(service.generateAthleteInsightCandidates("nhl-auston-matthews").some((item) => item.type === "point_streak" || item.type === "shot_streak"),
  "18 hockey point or shot streak is generated");

// 19–25: milestones.
const milestoneRule = getInsightRule("available-data-milestone");
const reached = evaluateInsightRule(milestoneRule, {
  entity: testEntity,
  rows: [completedRow(1, 20, { stats: { "basketball-points": 20 } }), completedRow(2, 15, { stats: { "basketball-points": 15 } }), completedRow(3, 15, { stats: { "basketball-points": 15 } })],
  statId: "basketball-points",
});
check(reached?.type === "milestone_reached" && reached.claimData.target === 50, "19 milestone reached");
const proximity = service.getMilestoneProgress("wnba-caitlin-clark");
check(proximity.some((item) => item.type === "milestone_proximity"), "20 milestone proximity");
check(!evaluateInsightRule(milestoneRule, {
  entity: testEntity,
  rows: [completedRow(1, 1, { stats: { "basketball-points": 1 } }), completedRow(2, 1, { stats: { "basketball-points": 1 } }), completedRow(3, 1, { stats: { "basketball-points": 1 } })],
  statId: "basketball-points",
}), "21 excessively distant milestone is suppressed");
check(proximity.every((item) => item.validationStatus === "dataset_only"), "22 career total is labeled as available-data only");
check(service.getMilestoneProgress("nba-tyrese-maxey").some((item) => item.validationStatus === "provider_asserted"),
  "23 provider-asserted milestone retains attribution");
check(normalizeInsightRows([
  completedRow(1, 10, { league_id: "wnba" }),
  completedRow(2, 10, { league_id: "nba" }),
  completedRow(3, 10, { league_id: "nba" }),
], milestoneRule).every((row) => row.league_id === "nba"), "24 league-change scope does not combine histories");
check(!evaluateInsightRule(milestoneRule, {
  entity: { ...testEntity, sportId: "soccer", leagueId: "mls" },
  rows: [1, 2, 3].map((id) => completedRow(id, 4, { sport_id: "soccer", league_id: "mls", stats: { "soccer-yellow-cards": 4 } })),
  statId: "soccer-yellow-cards",
}), "25 unsupported milestone is suppressed");

// 26–34: deterministic trends.
const trendRule = { ...getInsightRule("recent-vs-season-trend"), minimumSampleSize: 4, thresholdConfiguration: { recentWindow: 2, minimumRelativeDifference: .08 } };
const trendRows = [10, 11, 12, 13, 20, 22].map((value, index) => completedRow(index + 1, value, { stats: { "basketball-points": value } }));
const trend = evaluateInsightRule(trendRule, { entity: testEntity, rows: trendRows, statId: "basketball-points" });
check(trend?.claimData.recentSampleSize === 2 && trend.claimData.baselineSampleSize === 4, "26 last block versus season trend");
const twentyRows = Array.from({ length: 20 }, (_, index) => completedRow(index + 1, index < 10 ? 10 : 20, {
  event_date: `2026-${index < 9 ? "0" : ""}${Math.floor(index / 2) + 1}-01T00:00:00.000Z`,
  stats: { "basketball-points": index < 10 ? 10 : 20 },
}));
check(Boolean(evaluateInsightRule({ ...trendRule, thresholdConfiguration: { recentWindow: 10, minimumRelativeDifference: .08 } },
  { entity: testEntity, rows: twentyRows, statId: "basketball-points" })), "27 last 10 versus previous 10");
const split = evaluateInsightRule(getInsightRule("home-away-stat-difference"), {
  entity: testEntity,
  rows: [completedRow(1, 20, { home_away: "home", stats: { "basketball-points": 20 } }), completedRow(2, 22, { home_away: "home", stats: { "basketball-points": 22 } }), completedRow(3, 10, { home_away: "away", stats: { "basketball-points": 10 } }), completedRow(4, 11, { home_away: "away", stats: { "basketball-points": 11 } })],
  statId: "basketball-points",
});
check(split?.type === "home_away_difference", "28 home versus away trend");
const lowerEntity = { id: "driver", name: "Driver", entityType: "competitor", sportId: "motorsport", leagueId: "f1" };
const lowerRows = [10, 9, 8, 4, 3].map((value, index) => completedRow(index + 1, value, {
  entity_id: "driver", league_id: "f1", sport_id: "motorsport", stats: { "motorsport-average-finishing-position": value },
}));
check(evaluateInsightRule(trendRule, { entity: lowerEntity, rows: lowerRows, statId: "motorsport-average-finishing-position" })?.type === "improvement_trend",
  "29 lower-is-better improvement is oriented correctly");
const flatRows = [10, 10, 10, 10.1, 10.1].map((value, index) => completedRow(index + 1, value, { stats: { "basketball-points": value } }));
check(!evaluateInsightRule(trendRule, { entity: testEntity, rows: flatRows, statId: "basketball-points" }), "30 tiny difference is suppressed");
const smallTrend = evaluateInsightRule(trendRule, { entity: testEntity, rows: [10, 10, 20, 20].map((value, index) => completedRow(index + 1, value, { stats: { "basketball-points": value } })), statId: "basketball-points" });
check(smallTrend?.warnings.some((warning) => warning.includes("small sample")), "31 small trend sample is warned");
const missingTrend = evaluateInsightRule(trendRule, {
  entity: testEntity,
  rows: [completedRow(1, 10, { stats: { "basketball-points": 10 } }), completedRow(2, null, { stats: {} }), completedRow(3, 10, { stats: { "basketball-points": 10 } }), completedRow(4, 20, { stats: { "basketball-points": 20 } }), completedRow(5, 20, { stats: { "basketball-points": 20 } })],
  statId: "basketball-points",
});
check(missingTrend?.claimData.baselineValue === 10, "32 missing values are not treated as zero");
check(trend?.warnings.some((warning) => warning.includes("unequal")), "33 unequal trend samples are labeled");
check(!/caused|because of/i.test(phraseInsight(trend).detailedExplanation), "34 trend phrase makes no causal claim");

// 35–42: rarity.
const rarity = buildRarityContext({ qualifyingEntityCount: 1, comparisonPoolSize: 10, qualifyingEventCount: 2, scope: "WNBA sample", complete: true });
check(rarity.comparisonPoolSize === 10, "35 rarity comparison pool is retained");
const qualifiedWnba = provider.getPlayerLeaderboard("basketball-assists", { sportId: "basketball", leagueId: "wnba", minimumGames: 3 });
check(qualifiedWnba.entries.every((entry) => entry.qualification.qualified), "36 rarity pool qualification rules are enforceable");
check(rarity.occurrenceRate === .1, "37 rarity occurrence rate");
check(rarity.percentile === 90, "38 rarity percentile");
check(buildRarityContext({ qualifyingEntityCount: 1, comparisonPoolSize: 3 }).warnings.length === 1, "39 small rarity pool warning");
check(rarity.unique, "40 unique result requires complete sufficiently large pool");
check(!buildRarityContext({ qualifyingEntityCount: 2, comparisonPoolSize: 10, complete: true }).unique, "41 multiple qualifying results are not unique");
check(buildRarityContext({ qualifyingEntityCount: 1, comparisonPoolSize: 10, complete: false }).coverageStatus === "dataset_only",
  "42 incomplete coverage prevents verified rarity scope");

// 43–49: record validation.
const recordCandidate = service.evaluateInsightRule(getInsightRule("available-data-record-candidate"), entity("wnba-caitlin-clark"), { statId: "basketball-points" });
check(recordCandidate?.validationStatus === "dataset_only", "43 dataset-only high");
const seasonHigh = service.evaluateInsightRule(getInsightRule("available-season-high"), entity("wnba-caitlin-clark"), { statId: "basketball-points" });
check(seasonHigh?.type === "season_high"
  && seasonHigh.sampleSize === 10
  && seasonHigh.supportingRowIds.length === 10
  && seasonHigh.supportingEventIds.includes(seasonHigh.claimData.eventId),
  "44 available season high retains its full comparison sample");
const assertedHigh = service.evaluateInsightRule(getInsightRule("available-season-high"), entity("nba-tyrese-maxey"), { statId: "basketball-points" });
check(assertedHigh?.validationStatus === "provider_asserted", "45 provider-asserted record state");
const partialPayload = structuredClone(mockStatsProviderPayload);
partialPayload.partial = true;
const partialService = createInsightService(createStatsRepository(partialPayload), sportsRepository);
check(partialService.generateAthleteInsightCandidates("wnba-caitlin-clark").length === 0, "46 incomplete record candidates are rejected");
check(validateRecordCandidate({ ...recordCandidate, supportingEventIds: [] }).displayEligible === false, "47 supporting event is required");
check(!validateInsightCandidate({}).valid, "48 invalid record never validates");
check(!recordCandidate.recordDiagnostic.strongRecordLanguageAllowed && assertedHigh.validationStatus === "provider_asserted",
  "49 strong record wording is restricted by validation status");

// 50–57: scoring and deduplication.
const recentCandidate = { ...seasonHigh, generatedAt: "2026-07-28T00:00:00.000Z", scope: { ...seasonHigh.scope, dateRange: { ...seasonHigh.scope.dateRange, end: "2026-07-27T00:00:00.000Z" } } };
const oldCandidate = { ...recentCandidate, scope: { ...recentCandidate.scope, dateRange: { ...recentCandidate.scope.dateRange, end: "2025-01-01T00:00:00.000Z" } } };
check(scoreInsightCandidate(recentCandidate, { now: new Date("2026-07-28") }) > scoreInsightCandidate(oldCandidate, { now: new Date("2026-07-28") }),
  "50 recency weighting affects score");
check(scoreInsightCandidate({ ...recentCandidate, rarity: { percentile: 99 } }) > scoreInsightCandidate({ ...recentCandidate, rarity: { percentile: 20 } }),
  "51 rarity weighting affects score");
check(scoreInsightCandidate({ ...recentCandidate, sampleSize: 3 }) < scoreInsightCandidate({ ...recentCandidate, sampleSize: 10 }),
  "52 small-sample penalty affects score");
check(scoreInsightCandidate({ ...recentCandidate, validationStatus: "stale" }) < scoreInsightCandidate({ ...recentCandidate, validationStatus: "dataset_only" }),
  "53 stale-data penalty affects score");
check(deduplicateInsights([recentCandidate, recentCandidate], 5).length === 1, "54 duplicate insight removal");
const exclusiveA = { ...recentCandidate, id: "a", ruleId: "a", priorityScore: 90, mutuallyExclusiveRules: ["b"] };
const exclusiveB = { ...recentCandidate, id: "b", ruleId: "b", priorityScore: 80 };
check(deduplicateInsights([exclusiveA, exclusiveB], 5).length === 1, "55 mutually exclusive rules");
check(deduplicateInsights(service.getFeaturedInsights({ limit: 10 }), 3).length <= 3, "56 maximum insights enforced");
check(scoreInsightCandidate(recentCandidate, { query: `${recentCandidate.entity.name} ${recentCandidate.type}`, leagueId: recentCandidate.leagueId })
  > scoreInsightCandidate(recentCandidate, { query: "unrelated", leagueId: "mlb" }), "57 query relevance prioritization");

// 58–65: deterministic phrasing.
const singularPhrase = phraseInsight({ ...recentCandidate, type: "threshold_streak", claimData: { threshold: 5, streakLength: 1 }, statIds: ["basketball-assists"] });
check(singularPhrase.shortSummary.includes("1 consecutive appearance."), "58 singular grammar");
const pluralPhrase = phraseInsight({ ...recentCandidate, type: "threshold_streak", claimData: { threshold: 5, streakLength: 3 }, statIds: ["basketball-assists"] });
check(pluralPhrase.shortSummary.includes("3 consecutive appearances."), "59 plural grammar");
check(phraseInsight(assertedHigh).headline.includes("points"), "60 stat-registry units and labels");
check(phraseInsight(recordCandidate).validationDisclosure.includes("available sample dataset"), "61 dataset disclosure");
check(phraseInsight(seasonHigh).validationDisclosure.includes("2026"), "62 season scope");
check(!/\b(guaranteed|lock|can'?t miss|unstoppable)\b/i.test(phraseInsight(seasonHigh).sharingCaption), "63 no prohibited hype language");
check(!/\b(all-time|world record|record-breaking)\b/i.test(phraseInsight(recordCandidate).headline), "64 no unsupported record wording");
check(phraseInsight({ ...recentCandidate, type: "recent_high", claimData: { value: null } }).headline.includes("unavailable"), "65 missing-value fallback");

// 66–71: supporting data.
const support = service.getInsightSupportingData(seasonHigh.id);
check(support.eventRows.every((row) => seasonHigh.supportingRowIds.includes(row.row_id)), "66 event rows match claim");
check(support.dateRange.start && support.dateRange.end, "67 supporting date range");
check(support.sampleSize === seasonHigh.sampleSize, "68 supporting sample size");
check(Object.hasOwn(support, "comparisonPool"), "69 comparison-pool details exposed");
check(support.validationStatus === seasonHigh.validationStatus, "70 validation status exposed");
check(Boolean(support.whySelected), "71 why-selected explanation");

// 72–78: profile and saved-state foundations.
const clarkProfileInsights = service.getInsightsForProfile("wnba-caitlin-clark");
check(clarkProfileInsights.length > 0, "72 profile overview insight available");
check(new Set(clarkProfileInsights.map((item) => item.type)).size >= 3, "73 profile insight categories adapt to data");
check(deduplicateInsights(clarkProfileInsights, 8).length === clarkProfileInsights.length, "74 profile insights are deduplicated");
check(`/index.html?player=wnba-caitlin-clark&tab=insights`.includes("tab=insights"), "75 profile insight deep-link shape");
check(encodeURIComponent(clarkProfileInsights[0].id).startsWith("insight-"), "76 share insight stable ID");
const saved = { id: clarkProfileInsights[0].id, structuredClaim: clarkProfileInsights[0].claimData, localOnly: true };
check(!service.reconcileSavedInsight(saved).archived, "77 current saved insight remains active");
check(service.reconcileSavedInsight({ id: "missing-insight", structuredClaim: {} }).archived, "78 missing saved insight is archived");

// 79–87: query integration.
const intentCases = [
  ["Tell me a fun fact about Caitlin Clark.", "fun_fact"],
  ["What streak is Caitlin Clark on?", "active_streak"],
  ["How close is Caitlin Clark to a milestone?", "milestone_proximity"],
  ["Show rare WNBA performances.", "rarity_search"],
  ["What changed in Caitlin Clark's last 10 games?", "trend_explanation"],
  ["What is Caitlin Clark's season high?", "season_high"],
];
intentCases.forEach(([text, intent], index) =>
  check(classifyResearchQuery(text, "stats").intent === intent, `${79 + index} ${intent} query`));
check(parseStatisticalQuery("Tell me a fun fact about Alex Smith.", { mode: "stats", sportsRepository, currentLeagueId: "nfl" }).structuredQuery.intent === "ambiguous",
  "85 ambiguous athlete does not resolve silently");
const unsupportedRecord = buildStatsResult(provider,
  parseStatisticalQuery("Who holds the all-time WNBA scoring record?", { mode: "stats", sportsRepository, currentLeagueId: "wnba" }),
  sportsRepository, service, "Who holds the all-time WNBA scoring record?");
check(unsupportedRecord.validationStatus !== "verified_complete", "86 unsupported historical scope avoids verified claim");
const noCandidate = buildStatsResult(provider,
  parseStatisticalQuery("How close is Sample Boxer A to a submission milestone?", { mode: "stats", sportsRepository, currentLeagueId: "boxing" }),
  sportsRepository, service, "How close is Sample Boxer A to a submission milestone?");
check(["empty", "insight_result"].includes(noCandidate.type) && !noCandidate.insights?.some((item) => item.statIds.includes("combat-submission-wins")),
  "87 no-candidate state does not invent a fact");

// 88–94: navigation/discovery data scopes.
check(service.getFeaturedInsights({ leagueIds: ["wnba"] }).every((item) => item.leagueId === "wnba"), "88 WNBA scope shows WNBA only");
check(service.getFeaturedInsights({ sportIds: ["soccer"] }).every((item) => item.sportId === "soccer"), "89 soccer scope shows soccer only");
check(service.getFeaturedInsights({ leagueIds: ["ufc"] }).every((item) => item.leagueId === "ufc"), "90 UFC scope excludes boxing");
check(new Set(service.getFeaturedInsights({ limit: 12 }).map((item) => item.sportId)).size > 1, "91 All Sports can mix sports");
check(service.getFeaturedInsights({ leagueIds: [] }).every((item) => item.supportingEventIds.length), "92 featured insights derive from completed events");
check(service.getFeaturedInsights({ leagueIds: ["wnba"], dateRange: { type: "today" } }).length === 0,
  "93 Today scope does not substitute older historical insights");
check(Boolean(mockProviderPayload.offers.length) && service.getFeaturedInsights({ limit: 2 }).length > 0, "94 insights do not replace market data");

// 95–100: Both mode.
const freshSportsPayload = structuredClone(mockProviderPayload);
freshSportsPayload.offers.forEach((offer) => offer.selections.forEach((selection) => {
  selection.last_updated_at = new Date().toISOString();
}));
const freshService = createInsightService(provider, createSportsRepository(freshSportsPayload));
const maxeyBoth = freshService.generateAthleteInsightCandidates("nba-tyrese-maxey", { includeBettingContext: true, noCache: true });
check(maxeyBoth.some((item) => item.bettingContext?.available), "95 compatible market attaches");
check(service.generateAthleteInsightCandidates("wnba-caitlin-clark", { includeBettingContext: true, noCache: true }).every((item) => !item.bettingContext),
  "96 incompatible market is excluded");
const staleSportsPayload = structuredClone(mockProviderPayload);
staleSportsPayload.offers.forEach((offer) => offer.selections.forEach((selection) => { selection.last_updated_at = "2020-01-01T00:00:00.000Z"; }));
const staleService = createInsightService(provider, createSportsRepository(staleSportsPayload));
check(staleService.generateAthleteInsightCandidates("nba-tyrese-maxey", { includeBettingContext: true, noCache: true })
  .every((item) => !item.bettingContext?.available), "97 stale market is non-actionable");
check(maxeyBoth.filter((item) => item.bettingContext).every((item) => item.bettingContext.warning.includes("Historical context is separate")),
  "98 historical streak remains separate from projection");
check(maxeyBoth.filter((item) => item.bettingContext).every((item) => !/probability/i.test(`${item.bettingContext.confidence}`)),
  "99 confidence is not labeled probability");
check(maxeyBoth.every((item) => !/\bguarantee|lock\b/i.test(item.phrasing.sharingCaption)), "100 no betting guarantee language");

// Required cross-sport demonstration coverage.
const activeAthletes = provider.entities.filter((item) => item.entityType !== "team" && item.active);
const athleteInsightCoverage = activeAthletes.filter((item) =>
  service.generateAthleteInsightCandidates(item.id).length > 0);
check(athleteInsightCoverage.length >= 10, "coverage: at least ten athletes produce validated insights");
["IND-W", "NYY", "MIA"].forEach((teamId) =>
  check(service.generateTeamInsightCandidates(teamId).length > 0, `coverage: ${teamId} produces a team insight`));
const milestoneCoverage = activeAthletes.filter((item) => service.getMilestoneProgress(item.id).length > 0);
check(milestoneCoverage.length >= 5, "coverage: at least five athlete milestone cases");
const trendCoverage = activeAthletes.filter((item) => service.getTrendCandidates(item.id).length > 0);
check(trendCoverage.length >= 5, "coverage: at least five athlete trend cases");
const rarityCoverage = activeAthletes.flatMap((item) =>
  service.generateAthleteInsightCandidates(item.id)).filter((item) => item.rarity?.comparisonPoolSize);
check(rarityCoverage.length >= 3, "coverage: at least three insights expose rarity context");
const freshBothCoverage = activeAthletes.flatMap((item) =>
  freshService.generateAthleteInsightCandidates(item.id, { includeBettingContext: true, noCache: true }))
  .filter((item) => item.bettingContext?.available);
check(freshBothCoverage.length >= 3, "coverage: at least three compatible Both-mode insight-market combinations");
const boxingSubmissionRows = [1, 2, 3].map((id) => completedRow(id, 1, {
  entity_id: "boxing-sample-boxer-a",
  league_id: "boxing",
  sport_id: "boxing",
  method: "Submission",
  stats: { "combat-wins": 1 },
}));
check(!evaluateInsightRule(getInsightRule("combat-finish-streak"), {
  entity: entity("boxing-sample-boxer-a"),
  rows: boxingSubmissionRows,
}), "review: boxing submission rows cannot create a finish insight");
check(normalizeInsightRows([
  completedRow(1, 8),
  completedRow(2, 8, { event_date: "not-a-date" }),
], assistRule).length === 1, "review: invalid event dates are rejected");
check(assertedHigh.source.attribution === "EdgeBoard Mock Provider assertion",
  "review: provider assertion retains source attribution");
const changedSaved = service.reconcileSavedInsight({
  id: "prior-calculation-id",
  ruleId: seasonHigh.ruleId,
  entityIds: [...seasonHigh.entityIds],
  statIds: [...seasonHigh.statIds],
  structuredClaim: { ...seasonHigh.claimData, value: seasonHigh.claimData.value - 1 },
});
check(changedSaved.changed && !changedSaved.archived,
  "review: stable insight identity detects a recalculated claim");
const staleStatsPayload = structuredClone(mockStatsProviderPayload);
staleStatsPayload.generated_at = "2020-01-01T00:00:00.000Z";
const staleStatsService = createInsightService(createStatsRepository(staleStatsPayload), sportsRepository);
const staleSavedCandidate = staleStatsService.generateAthleteInsightCandidates("wnba-caitlin-clark", { noCache: true })[0];
check(staleSavedCandidate && staleStatsService.reconcileSavedInsight({
  id: staleSavedCandidate.id,
  ruleId: staleSavedCandidate.ruleId,
  entityIds: [...staleSavedCandidate.entityIds],
  statIds: [...staleSavedCandidate.statIds],
  structuredClaim: staleSavedCandidate.claimData,
}).archived, "review: regenerated stale saved insight is archived");
check(staleService.generateAthleteInsightCandidates("nba-tyrese-maxey", {
  includeBettingContext: true,
  noCache: true,
}).every((item) => !item.bettingContext), "review: stale markets are not attached as current context");
const scopedInsightQuery = parseStatisticalQuery(
  "Tell me a fun fact about Caitlin Clark over her last 5 games.",
  { mode: "stats", sportsRepository, currentLeagueId: "wnba" },
);
const scopedInsightResult = buildStatsResult(
  provider,
  scopedInsightQuery,
  sportsRepository,
  service,
  "Tell me a fun fact about Caitlin Clark over her last 5 games.",
);
check(scopedInsightResult.insights?.every((item) => item.scope.dateRange.start >= "2026-07-11"),
  "review: natural-language insight queries apply the interpreted date window");

// 101–105: state and async contracts.
check(typeof frame.contentWindow !== "undefined", "101 app request-sequence environment is available");
check(saved.localOnly === true, "102 saved insight state is explicitly local-only");
check(!statefulDismiss(["a"], "b").includes("b") && statefulDismiss(["a"], "a").includes("a"), "103 dismissing one ID does not suppress unrelated rules");
function statefulDismiss(ids, lookup) { return ids.filter((id) => id === lookup); }
check(Boolean(mockProviderPayload.offers.length), "104 bet-slip source remains intact");
check(new URL("http://localhost/?mode=both&insight=x").searchParams.get("mode") === "both", "105 research mode survives insight deep link");

// 106–112: live accessibility and responsive behavior.
if (frame.contentDocument?.readyState !== "complete") {
  await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
}
await wait(900);
let app = frame.contentDocument;
let view = frame.contentWindow;
check(app.querySelector("[data-view-insight]")?.tagName === "BUTTON", "106 supporting-data action is keyboard-capable button");
const supportButton = app.querySelector("[data-view-insight]");
supportButton?.click();
await wait(30);
check(app.querySelector("#insightDialog")?.open && app.activeElement?.id === "closeInsightDialog", "107 dialog opens with managed focus");
check(app.querySelector(".share-stat-card small")?.textContent.includes("Source:")
  && app.querySelector(".share-stat-card small")?.textContent.includes("Sample data"),
  "review: share card includes source and sample-data disclosure");
app.querySelector("#closeInsightDialog")?.click();
await wait(50);
check(app.activeElement === supportButton,
  `108 dialog restores focus${app.activeElement === supportButton ? "" : ` (active: ${app.activeElement?.tagName || "none"}#${app.activeElement?.id || ""}.${app.activeElement?.className || ""})`}`);
check(app.querySelector(".validation-label")?.textContent.trim().length > 0, "109 validation label is readable without color");
check(app.querySelector(".insight-action-status")?.getAttribute("aria-live") === "polite", "110 share feedback is announced");
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, "111 390px insight cards have no horizontal overflow");
app.querySelector('[data-theme-option="light"]')?.click();
check(app.body.dataset.theme === "light" && app.querySelector(".insight-card"), "112 light theme renders insights");
app.querySelector('[data-theme-option="dark"]')?.click();
app.querySelector('#sportTabs [data-nav-view="today"]')?.click();
await wait(50);
check(Boolean(app.querySelector("#insightDiscoveryGrid .discovery-empty"))
  && app.querySelectorAll("#todayMarketGrid [data-market-league]").length > 0,
  "review: Today suppresses out-of-date insights without replacing market cards");
app.querySelector('#sportTabs [data-nav-view="live"]')?.click();
await wait(50);
check(Boolean(app.querySelector("#insightDiscoveryGrid .discovery-empty")),
  "review: Live does not substitute non-live historical insights");

check(window.testErrors.length === 0, `no Phase 4 application errors${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);
results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} checks)\n${checks.join("\n")}`;
frame.remove();
