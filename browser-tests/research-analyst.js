import { mockProviderPayload } from "../src/data/mock-provider.js";
import { runAnalystWorkflow } from "../src/services/analyst-service.js";
import { createInsightService } from "../src/services/insight-service.js";
import { getFilteredPicks } from "../src/services/research-service.js";
import { buildResearchAnswer } from "../src/services/research-answer-service.js";
import { createResearchPlan } from "../src/services/research-planner-service.js";
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

const sportsRepository = createSportsRepository(mockProviderPayload);
const statsProvider = createStatsRepository();
const insights = createInsightService(statsProvider, sportsRepository);
const freshMarketPayload = structuredClone(mockProviderPayload);
const freshTimestamp = new Date().toISOString();
freshMarketPayload.generated_at = freshTimestamp;
freshMarketPayload.provider_status.last_updated_at = freshTimestamp;
freshMarketPayload.provider_status.last_successful_update_at = freshTimestamp;
freshMarketPayload.provider_status.state = "fresh";
freshMarketPayload.offers.forEach((offer) => {
  offer.last_updated_at = freshTimestamp;
  offer.selections.forEach((selection) => {
    selection.last_updated_at = freshTimestamp;
  });
});
const freshSportsRepository = createSportsRepository(freshMarketPayload);

function statsResearch(query, mode = "stats", leagueId = "wnba") {
  const parsed = parseStatisticalQuery(query, {
    mode,
    sportsRepository,
    currentLeagueId: leagueId,
  });
  const plan = createResearchPlan({
    query,
    mode,
    parsedStats: parsed,
    currentLeague: sportsRepository.getLeague(parsed.structuredQuery.leagueId),
    availableLeagues: sportsRepository.getLeagues(),
    providerName: sportsRepository.getMetadata().provider,
  });
  const statsResult = buildStatsResult(statsProvider, parsed, sportsRepository, insights, query);
  return {
    parsed,
    plan,
    statsResult,
    answer: buildResearchAnswer({
      query,
      mode,
      plan,
      statsResult,
      statsProvider,
    }),
  };
}

const leaderboard = statsResearch("Who averages the most assists in the WNBA this season?");
check(leaderboard.plan.questionType === "leaderboards", "1 leaderboard intent receives a deterministic plan");
check(leaderboard.plan.stages.length === 8, "2 planner exposes all eight research stages");
check(leaderboard.plan.statIds.includes("basketball-assists"), "3 planner uses canonical statistic IDs");
check(leaderboard.answer.evidence.length > 1, "4 answer contains more than one structured evidence item");
check(leaderboard.answer.evidence.every((item) => item.id && item.source), "5 every factual evidence item has identity and source");
check(leaderboard.answer.factualEvidenceIds.length === leaderboard.answer.evidence.length, "6 language layer exposes its complete evidence allowlist");
check(leaderboard.answer.sections.some((section) => section.id === "counterpoints"), "7 counterpoints are always included");
check(leaderboard.answer.sections.some((section) => section.id === "betting-relevance"), "8 betting relevance is explicit");
check(leaderboard.answer.sections.find((section) => section.id === "betting-relevance").items[0].text.includes("not requested"),
  "9 Stats mode does not leak betting context");
check(["Excellent", "Good", "Limited", "Incomplete"].includes(leaderboard.answer.researchCompleteness.level),
  "10 Research Completeness uses the dedicated four-level scale");
check(!/AI confidence|win probability/i.test(`${leaderboard.answer.researchCompleteness.level} ${leaderboard.answer.researchCompleteness.score}`),
  "11 Research Completeness is not represented as betting probability");
check(leaderboard.answer.disclosure.source && leaderboard.answer.disclosure.dateRange
  && leaderboard.answer.disclosure.coverage && leaderboard.answer.disclosure.validation,
  "12 source, date range, coverage, and validation are exposed");
check(leaderboard.answer.disclosure.sample === true, "13 mock results are explicitly sample data");

const playerLookup = statsResearch("Caitlin Clark");
check(playerLookup.parsed.structuredQuery.intent === "player_lookup"
  && playerLookup.plan.questionType === "player_lookup", "player lookup resolves through a canonical athlete ID");
check(playerLookup.answer.relatedEntities[0]?.id === "wnba-caitlin-clark"
  && playerLookup.answer.evidence.length > 1, "player lookup returns sourced overview evidence and a profile entity");
const teamLookup = statsResearch("Indiana Fever");
check(teamLookup.parsed.structuredQuery.intent === "team_lookup"
  && teamLookup.plan.questionType === "team_lookup", "team lookup resolves through the canonical team identity");
check(teamLookup.answer.relatedEntities[0]?.id === "IND-W", "team lookup preserves the canonical team ID");
const discovery = statsResearch("Which sports and leagues are active today?");
check(discovery.plan.questionType === "sport_discovery"
  && discovery.plan.discovery.leagues.length > 10, "sport discovery reads normalized league availability");
check(discovery.answer.evidence.some((item) => item.type === "league-availability")
  && discovery.answer.supportingTables.some((table) => table.id === "league-discovery"),
  "sport discovery answers with sourced availability evidence and a table");

const comparison = statsResearch("Compare Caitlin Clark and Sabrina Ionescu in assists over their last 5 games.");
check(comparison.plan.questionType === "comparison", "14 comparison intent is planned");
check(comparison.plan.entityIds.length === 2, "15 comparison uses two canonical entity IDs");
check(comparison.answer.supportingTables.some((table) => table.id === "stats-comparison"),
  "16 comparison answer includes a supporting table");
check(comparison.answer.summary.includes("same interpreted date and split filters"),
  "17 comparison explanation states common filter use");
check(comparison.answer.relatedEntities.every((entity) => entity.id), "18 related entities retain canonical IDs");

const funFact = statsResearch("Tell me a fun fact about Caitlin Clark over her last 5 games.");
check(funFact.plan.requirements.insights, "19 fun-fact plan requests the deterministic insight engine");
check(funFact.answer.evidence.every((item) => item.validation !== "invented"), "20 no insight evidence is fabricated");
check(funFact.answer.relatedInsights.every((item) => item.validation), "21 related insights expose validation");

const unsupported = statsResearch("What is Caitlin Clark's fantasy WAR?");
check(unsupported.answer.evidence.length === 0, "22 unsupported statistics produce no factual evidence");
check(unsupported.answer.researchCompleteness.level === "Incomplete", "23 unsupported answers are marked incomplete");
check(unsupported.answer.summary.includes("No fallback statistic"), "24 unsupported answers do not generate a fallback fact");

const bettingQuery = "Show today's strongest NBA props.";
const workflow = runAnalystWorkflow(freshSportsRepository, bettingQuery, {
  currentLeagueId: "nba",
  currentMarket: "props",
  minimumConfidence: 0,
});
const bettingPicks = getFilteredPicks(freshSportsRepository, {
  leagueId: "nba",
  market: "props",
  minConfidence: 0,
  availableOnly: true,
  query: bettingQuery,
  queryGame: "",
});
const bettingPlan = createResearchPlan({
  query: bettingQuery,
  mode: "betting",
  bettingWorkflow: workflow,
  currentLeague: freshSportsRepository.getLeague("nba"),
});
const bettingAnswer = buildResearchAnswer({
  query: bettingQuery,
  mode: "betting",
  plan: bettingPlan,
  bettingWorkflow: workflow,
  bettingPicks,
  statsProvider,
});
check(bettingPlan.questionType === "prop_research", "25 prop research intent is planned");
check(bettingPlan.requirements.betting, "26 Betting mode requests market retrieval");
check(bettingAnswer.relatedProps.every((prop) => prop.selectionId && prop.available), "27 related props are provider-confirmed selections");
check(bettingAnswer.evidence.filter((item) => item.type === "model-confidence")
  .every((item) => item.validation.includes("not win probability")), "28 model confidence is not presented as probability");
check(!bettingAnswer.evidence.some((item) => item.type === "market" && item.validation.includes("stale")),
  "29 stale markets are excluded from factual market evidence");
check(bettingAnswer.supportingTables.some((table) => table.id === "betting-markets"), "30 betting answer has a supporting market table");

const stalePick = { ...bettingPicks[0], stale: true, available: true };
const staleAnswer = buildResearchAnswer({
  query: bettingQuery,
  mode: "betting",
  plan: bettingPlan,
  bettingWorkflow: workflow,
  bettingPicks: [stalePick],
  statsProvider,
});
check(staleAnswer.relatedProps.length === 0, "31 stale props are not linked as current markets");
check(staleAnswer.sections.find((section) => section.id === "betting-relevance").items[0].text.includes("No fresh"),
  "32 stale-only market results disclose unavailable betting relevance");

const historical = statsResearch("Who has gone over 5.5 assists the most?", "both", "wnba");
check(historical.plan.questionType === "historical_threshold", "33 historical threshold research is recognized");
check(historical.plan.requirements.stats && historical.plan.requirements.betting, "34 Both mode plans statistics and markets");
check(historical.answer.sections[0].id === "evidence"
  && historical.answer.sections.at(-1).id === "betting-relevance", "35 statistics remain ordered before betting relevance");

if (frame.contentDocument?.readyState !== "complete") {
  await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
}
await wait(900);
const app = frame.contentDocument;
const view = frame.contentWindow;
const input = app.querySelector("#queryInput");
input.value = "Who averages the most assists in the WNBA this season?";
input.dispatchEvent(new view.Event("input", { bubbles: true }));
app.querySelector("#queryForm").requestSubmit();
await wait(350);
check(!app.querySelector("#researchAnswer").hidden, "36 reusable analyst answer renders in the application");
check(app.querySelector("#researchAnswerTitle"), "37 rendered answer has a focusable heading target");
check(app.querySelector(".research-completeness")?.textContent.includes("Research completeness"),
  "38 rendered answer distinguishes Research Completeness");
check(app.querySelectorAll(".research-disclosure > div").length === 6, "39 all six transparency fields render");
check(app.querySelector(".research-explanation summary")?.tagName === "SUMMARY", "40 explanation is keyboard-expandable");
check(app.querySelector(".research-plan ol")?.children.length === 8, "41 interpreted plan is visible");
check(app.querySelectorAll("[data-ai-followup]").length > 0, "42 useful follow-up actions render as buttons");
check(app.querySelector(".research-quality")?.textContent.includes("not betting confidence or win probability"),
  "43 completeness disclaimer is visible");
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, "44 390px analyst answer has no horizontal overflow");
app.querySelector('[data-theme-option="light"]')?.click();
check(app.body.dataset.theme === "light" && app.querySelector(".research-answer-card"), "45 light theme renders analyst answer");
app.querySelector('[data-theme-option="dark"]')?.click();
check(app.body.dataset.theme === "dark", "46 dark theme renders analyst answer");
const followUp = app.querySelector("[data-ai-followup]");
followUp?.click();
await wait(350);
check(input.value === followUp?.dataset.aiFollowup, "47 follow-up action submits its deterministic query");
app.querySelector('[data-research-mode="betting"]')?.click();
input.value = "Find NBA player props.";
input.dispatchEvent(new view.Event("input", { bubbles: true }));
app.querySelector("#queryForm").requestSubmit();
await wait(250);
check(!app.querySelector("#researchAnswer").hidden && app.querySelector("#statsResults").hidden,
  "48 Betting mode renders the shared analyst answer without a stats result");
check(app.querySelector("#researchAnswerContent").textContent.includes("No fresh, compatible provider-confirmed market"),
  "49 Betting mode explains the stale sample-market limitation");
app.querySelector('[data-research-mode="both"]')?.click();
input.value = "Has Tyrese Maxey gone over 24.5 points in his last 10 games?";
input.dispatchEvent(new view.Event("input", { bubbles: true }));
app.querySelector("#queryForm").requestSubmit();
await wait(350);
check(app.querySelector(".combined-result") && !app.querySelector("#researchAnswer").hidden,
  "50 Both mode keeps the detailed result and shared analyst answer");
check(app.querySelector("#researchAnswerContent").textContent.indexOf("Evidence")
  < app.querySelector("#researchAnswerContent").textContent.indexOf("Betting relevance"),
  "51 Both mode renders statistical evidence before betting relevance");
check(window.testErrors.length === 0, `52 no Phase 5 application errors${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} checks)\n${checks.join("\n")}`;
frame.remove();
