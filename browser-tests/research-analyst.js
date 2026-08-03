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
import { evaluateEdgeTrust } from "../src/services/edge-trust-service.js";
import { fixtureCoverageFallback } from "../src/services/coverage-client.js";
import { createHomeDiscoveryModel } from "../src/services/home-discovery-service.js";
import {
  addResearchSessionNote,
  createResearchSession,
  refreshResearchSession,
  researchSessionShareSnapshot,
  researchSessionToCsv,
  researchSessionToMarkdown,
} from "../src/services/research-session-service.js";
import {
  addEdgeLabAssumption,
  createEdgeLabScenario,
  edgeLabShareSnapshot,
  edgeLabToCsv,
  edgeLabToMarkdown,
} from "../src/services/edge-lab-service.js";
import {
  getOnboardingSteps,
  getRecoveryActions,
  isComplexResearchPlan,
} from "../src/services/ux-guidance-service.js";

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

const allLeagues = sportsRepository.getLeagues();
const discoveryDate = new Date(statsProvider.rows.find((row) => row.status === "completed").event_date);
const discoveryModel = createHomeDiscoveryModel({
  selection: { selection: { type: "system", id: "all" }, contextLabel: "All Sports" },
  visibleLeagues: allLeagues,
  sportsRepository,
  statsRepository: statsProvider,
  insightService: insights,
  researchMode: "stats",
  currentDate: discoveryDate,
});
check(discoveryModel.sections.map((section) => section.id).join(",")
  === "stories,trending,facts,on-this-day,milestones,streaks,leaders,games",
  "0a home discovery exposes all eight deterministic sections in the required order");
check(discoveryModel.sections.flatMap((section) => section.cards).every((card) =>
  card.source?.source && card.classification && card.actions.length > 0),
"0b every discovery card retains source classification and a supported destination");
check(discoveryModel.sections.find((section) => section.id === "on-this-day").cards.every((card) =>
  card.validationStatus === "completed_sample_row"),
"0c On This Day uses completed source rows rather than generated anniversary facts");
check(discoveryModel.sections.flatMap((section) => section.cards).every((card) =>
  !card.actions.some((action) => action.kind === "market")),
"0d Stats mode suppresses betting-market discovery actions");
const wnbaDiscovery = createHomeDiscoveryModel({
  selection: { selection: { type: "league", id: "wnba" }, contextLabel: "WNBA" },
  visibleLeagues: [sportsRepository.getLeague("wnba")], sportsRepository,
  statsRepository: statsProvider, insightService: insights, researchMode: "both", currentDate: discoveryDate,
});
check(wnbaDiscovery.sections.flatMap((section) => section.cards).every((card) => card.leagueId === "wnba")
  && wnbaDiscovery.sections.flatMap((section) => section.cards).some((card) => card.actions.some((action) => action.kind === "market")),
"0e selected-league scope and Both-mode market destinations remain synchronized");
const liveDiscovery = createHomeDiscoveryModel({
  selection: { selection: { type: "system", id: "live" }, contextLabel: "Live" },
  visibleLeagues: allLeagues.filter((league) => league.liveEventCount > 0), sportsRepository,
  statsRepository: statsProvider, insightService: insights, researchMode: "both", currentDate: new Date(),
});
const liveCards = liveDiscovery.sections.flatMap((section) => section.cards);
check(liveCards.every((card) => card.classification === "current_provider_data" && card.kind.includes("game"))
  && liveDiscovery.sections.filter((section) => !["stories", "games"].includes(section.id)).every((section) => section.cards.length === 0),
"0f Live discovery never mixes historical cards into the live-event scope");

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
check(new Set(leaderboard.answer.evidence.map((item) => item.id)).size === leaderboard.answer.evidence.length,
  "5a evidence identities are unique across entity, statistic, and market collectors");
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

const session = createResearchSession({
  question: "Who averages the most assists in the WNBA this season?",
  mode: "stats",
  plan: leaderboard.plan,
  answer: leaderboard.answer,
  statistics: leaderboard.statsResult,
}, { clock: () => Date.parse("2026-08-03T12:00:00Z"), random: () => .25 });
check(session.workflow.length === 12 && session.planSteps.length === 8,
  "13a research sessions expose every workflow and deterministic plan step");
check(["question", "researchPlan", "evidence", "statistics", "visualizations", "comparisons", "insights", "counterarguments", "markets", "researchQuality", "notes", "followUpQuestions"]
  .every((field) => Object.hasOwn(session, field)), "13b normalized sessions retain every required research collection");
check(session.recommendations.length > 0 && session.recommendations.length === session.followUpQuestions.length
  && session.recommendations.every((item) => Array.isArray(item.supportingEvidenceIds)
    && Array.isArray(item.counterarguments) && item.researchQuality),
  "13c every recommended follow-up carries evidence, counterarguments, and Research Quality");
const notedSession = addResearchSessionNote(session, "Watch the small sample.", { clock: () => Date.parse("2026-08-03T12:01:00Z"), random: () => .3 });
const refreshedSession = refreshResearchSession(notedSession, {
  question: notedSession.question, mode: notedSession.mode, plan: leaderboard.plan,
  answer: leaderboard.answer, statistics: leaderboard.statsResult,
}, { clock: () => Date.parse("2026-08-03T12:02:00Z"), random: () => .4 });
check(refreshedSession.id === session.id && refreshedSession.revision === 2
  && refreshedSession.history.length === 1 && refreshedSession.notes.length === 1,
  "13d refresh preserves identity, notes, and immutable revision history");
const sharedSession = researchSessionShareSnapshot(refreshedSession);
check(sharedSession.readOnly && sharedSession.privateNotesExcluded && !("notes" in sharedSession.session),
  "13e session sharing excludes private notes and remains read-only");
check(researchSessionToMarkdown(session).includes("Research Quality")
  && researchSessionToCsv(session).includes('"counterargument"'),
  "13f session exports retain quality and counterarguments");
const numericEvidence = session.evidence.find((item) => /^-?\d/.test(String(item.value || "")));
const originalSessionJson = JSON.stringify(session);
const scenario = createEdgeLabScenario({
  session,
  title: "Assists sensitivity test",
  assumptions: [{
    targetType: "evidence", targetId: numericEvidence.id, kind: "evidence_adjustment",
    operation: "add", value: 1, rationale: "Test a one-unit alternate assumption.", horizon: "current",
  }],
}, { clock: () => Date.parse("2026-08-03T12:03:00Z"), random: () => .5 });
check(JSON.stringify(session) === originalSessionJson && scenario.originalData.evidence.find((item) => item.id === numericEvidence.id).value === numericEvidence.value,
  "13g Edge Lab retains an immutable original research snapshot");
check(scenario.deterministic && !scenario.isPrediction && !scenario.modifiesRealData
  && scenario.scenarioDifferences.length === 1 && scenario.scenarioDifferences[0].before !== scenario.scenarioDifferences[0].after,
  "13h a supported assumption produces a deterministic, explicitly non-predictive difference");
check(Object.values(scenario.classifications).join(" ").includes("historical_fact")
  && Object.values(scenario.classifications).join(" ").includes("future_simulation")
  && scenario.researchQuality.researchQuality.isProbability === false
  && scenario.researchQuality.researchQuality.score <= session.researchQuality.researchQuality.score,
  "13i scenario classifications and Research Quality remain separate from probability");
const invalidScenario = addEdgeLabAssumption(scenario, {
  targetType: "evidence", targetId: "missing-evidence", value: 10, rationale: "Unsupported target test.",
}, { clock: () => Date.parse("2026-08-03T12:04:00Z"), random: () => .6 });
check(invalidScenario.rejectedAssumptions.length === 1 && invalidScenario.scenarioDifferences.length === 1,
  "13j invalid assumptions are rejected without fabricated fallback differences");
const privateScenario = createEdgeLabScenario({ session: notedSession, assumptions: [] }, { clock: () => Date.parse("2026-08-03T12:05:00Z"), random: () => .7 });
const sharedScenario = edgeLabShareSnapshot(privateScenario, { clock: () => Date.parse("2026-08-03T12:06:00Z") });
check(sharedScenario.readOnly && !("notes" in sharedScenario.scenario.originalData)
  && edgeLabToMarkdown(scenario).includes("Prediction: No")
  && edgeLabToCsv(scenario).includes("scenario_assumption"),
  "13k scenario sharing excludes private notes and exports preserve safety disclosure");

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
check(getRecoveryActions(unsupported.statsResult, { leagueName: "WNBA" }).length > 0,
  "24a unsupported results offer deterministic next actions");
check(isComplexResearchPlan(leaderboard.plan), "24b complex research plans are identified for proactive display");
check(getOnboardingSteps().map((step) => step.id).join(",") === "stats,betting,both,analyst,workspace",
  "24c first-visit guide covers the five primary experiences");
const conflictTrust = evaluateEdgeTrust({
  components: { historical: "verified", agreement: "verified", freshness: "fresh", coverage: 1, identity: "verified" },
  conflicts: [{ category: "status_conflict", sources: [{ provider: "A", status: "Questionable" }, { provider: "B", status: "Out" }] }],
});
check(conflictTrust.researchQuality.score < 100 && conflictTrust.conflicts.length === 1,
  "24d Edge Trust reduces quality without silently resolving provider conflict");
check(fixtureCoverageFallback().leagues.length > 50
  && fixtureCoverageFallback().leagues.every((league) => league.certificationState && league.edgeTrust),
  "24e every supported league has certification and Research Quality fallback state");

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
check(!app.querySelector("#edgeboardOnboarding").hidden
  && app.querySelectorAll("#onboardingSteps article").length === 5,
  "35a first-visit guide presents all five experiences without blocking research");
app.querySelector("#dismissOnboarding")?.click();
check(app.querySelector("#edgeboardOnboarding").hidden
  && view.localStorage.getItem("edgeboard-onboarding-v1.1-complete") === "true",
  "35b first-visit guide dismissal persists locally");
input.value = "Who averages the most assists in the WNBA this season?";
input.dispatchEvent(new view.Event("input", { bubbles: true }));
app.querySelector("#queryForm").requestSubmit();
await wait(350);
check(!app.querySelector("#researchAnswer").hidden, "36 reusable analyst answer renders in the application");
check(app.querySelectorAll(".research-session-workflow li").length === 12
  && app.querySelector(".research-session-workflow")?.open,
  "36a live research session exposes every workflow step before the summary");
check(app.querySelectorAll(".research-session-actions button").length === 8
  && [...app.querySelectorAll(".research-session-actions button")].every((button) => button.type === "button"),
  "36b session lifecycle actions use accessible button semantics");
check([...app.querySelectorAll(".research-recommendations article")].every((item) => /supporting evidence[\s\S]*counterargument[\s\S]*Research Quality/i.test(item.textContent)),
  "36c visible recommendations disclose evidence, counterarguments, and Research Quality");
app.querySelector("[data-session-note]")?.click();
app.querySelector("#workspaceEditForm textarea[name=description]").value = "Private session note";
app.querySelector("#workspaceEditForm").requestSubmit();
check(app.querySelector(".research-session-notes")?.textContent.includes("Private session note"),
  "36d active session notes are retained and escaped in the workflow");
app.querySelector("[data-session-share]")?.click();
check(app.querySelector("#workspaceShareDialog")?.open
  && app.querySelector("#workspaceSharePreview")?.textContent.includes('"privateNotesExcluded": true')
  && !app.querySelector("#workspaceSharePreview")?.textContent.includes("Private session note"),
  "36e read-only session sharing excludes private notes");
app.querySelector("[data-close-share-dialog]")?.click();
app.querySelector("[data-session-refresh]")?.click();
await wait(350);
check(app.querySelector(".research-session-header .eyebrow")?.textContent.includes("revision 2")
  && input.value === "Who averages the most assists in the WNBA this season?",
  "36f refreshing preserves the question and advances the session revision");
app.querySelector("[data-edge-lab-open]")?.click();
check(app.querySelector("#edgeLabDialog")?.open
  && app.querySelector("#edgeLabTarget")?.options.length > 0
  && app.querySelector("#edgeLabForm button[type=submit]")?.type === "submit",
  "36g Edge Lab opens an accessible assumption form with supported canonical targets");
app.querySelector("#edgeLabForm input[name=value]").value = "1";
app.querySelector("#edgeLabForm textarea[name=rationale]").value = "Test an alternate source-row value.";
app.querySelector("#edgeLabForm select[name=operation]").value = "add";
app.querySelector("#edgeLabForm").requestSubmit();
const edgeLabPanelText = app.querySelector(".edge-lab-panel")?.textContent || "";
const edgeLabDifferenceCount = app.querySelectorAll(".edge-lab-differences li").length;
check(edgeLabPanelText.includes("Not a prediction")
  && edgeLabDifferenceCount === 1
  && edgeLabPanelText.includes("original data unchanged"),
  "36h scenario differences render without replacing the original research session");
check([...app.querySelectorAll(".edge-lab-classifications span")].map((item) => item.textContent).join(" ").includes("Historical fact")
  && app.querySelector(".edge-lab-summary")?.textContent.includes("not probability")
  && app.querySelectorAll(".edge-lab-actions button").length === 6,
  "36i scenario outputs expose classifications, Research Quality, and lifecycle actions");
check(app.querySelector("#researchAnswerTitle"), "37 rendered answer has a focusable heading target");
check(app.querySelector(".research-quality-trigger")?.textContent.includes("Research Quality")
  && !/win probability/i.test(app.querySelector(".research-quality-trigger")?.textContent || ""),
  "38 rendered answer presents Research Quality separately from probability");
check(app.querySelectorAll(".research-disclosure > div").length === 6, "39 all six transparency fields render");
check(app.querySelector(".research-explanation summary")?.tagName === "SUMMARY", "40 explanation is keyboard-expandable");
check(app.querySelector(".research-plan ol")?.children.length === 8, "41 interpreted plan is visible");
check(app.querySelector(".research-plan")?.open, "41a complex research plan is expanded proactively");
check(app.querySelectorAll("[data-ai-followup]").length > 0, "42 useful follow-up actions render as buttons");
app.querySelector("[data-open-edge-trust]")?.click();
check(app.querySelector("#edgeTrustDialog")?.open
  && app.querySelector("#edgeTrustDialogContent")?.textContent.includes("Research Completeness")
  && app.querySelector("#edgeTrustDialogContent")?.textContent.includes("Validated Sample"),
  "42a Edge Trust details expose applicable status, completeness, and sample trust");
app.querySelector("#closeEdgeTrustDialog")?.click();
check(/not betting confidence[\s\S]*win probability/i.test(app.querySelector(".research-quality")?.textContent || ""),
  "43 completeness disclaimer is visible");
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, "44 390px analyst answer has no horizontal overflow");
app.querySelector('[data-theme-option="light"]')?.click();
check(app.body.dataset.theme === "light" && app.querySelector(".research-answer-card"), "45 light theme renders analyst answer");
app.querySelector('[data-theme-option="dark"]')?.click();
check(app.body.dataset.theme === "dark", "46 dark theme renders analyst answer");
const homeSectionTitles = [
  app.querySelector("#todayPulseTitle")?.textContent,
  app.querySelector("#insightDiscoveryTitle")?.textContent,
  ...[...app.querySelectorAll("#homeDiscoverySections .home-discovery-section h2")].map((item) => item.textContent),
];
check(homeSectionTitles.join("|") === "Today’s Stories|Trending Research|Did You Know?|On This Day|Upcoming Milestones|Active Streaks|Current Leaders|Today’s Games",
  "46a home discovery renders all required sections in order");
check(app.querySelector("main > .discovery-story-hero")?.querySelector("h1")
  && app.querySelector(".discovery-story-hero").compareDocumentPosition(app.querySelector(".hero")) & view.Node.DOCUMENT_POSITION_FOLLOWING,
  "46c Today’s Stories is the primary home hero above Edge Intelligence");
check([...app.querySelectorAll("[data-home-card]")].every((card) =>
  card.querySelector(".sample-badge") && card.querySelector(".home-card-actions :is(a, button)"))
  && !app.querySelector('[data-home-action="market"]'),
  "46d every discovery card has a supported action and Stats mode does not leak market actions");
check(app.querySelector('[data-home-section="on-this-day"] .discovery-empty, [data-home-section="on-this-day"] [data-home-card]')
  && app.querySelector('[data-home-section="games"] .discovery-empty, [data-home-section="games"] [data-home-card]'),
  "46e date-sensitive sections render sourced cards or honest empty states");
app.querySelector("#dataStatus")?.click();
app.querySelector("#openCoverage")?.click();
await wait(250);
check(app.querySelectorAll("#coverageContent .coverage-card").length > 50
  && [...app.querySelectorAll("#coverageContent .coverage-card")].every((card) => card.textContent.includes("Research Quality")),
  "46b Data Coverage includes every supported league with an explicit Research Quality state");
app.querySelector("#closeCoverageDialog")?.click();
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
check(app.querySelector('[data-home-action="market"]')
  && app.querySelector("#homeDiscoverySections")?.dataset.mode === "betting",
  "49a Betting mode exposes appropriate market destinations without changing discovery scope");
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
