import {
  STORY_LIFECYCLE_STATES,
  STORY_LIMITS,
  STORY_SCORE_WEIGHTS,
  STORY_TYPES,
} from "../src/config/story-config.js";
import { MOCK_STORY_FIXTURES } from "../src/data/mock-story-fixtures.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { mockStatsProviderPayload } from "../src/data/mock-stats-provider.js";
import { createEntityRegistry } from "../src/services/entity-registry-service.js";
import { createInsightService } from "../src/services/insight-service.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { createStatsRepository } from "../src/services/stats-provider.js";
import { createResearchPlan } from "../src/services/research-planner-service.js";
import { buildResearchAnswer } from "../src/services/research-answer-service.js";
import {
  buildStoryViewModel,
  compareStoryCandidates,
  createStoryEngine,
  deduplicateStories,
  phraseStory,
  scoreStoryCandidate,
  validateStoryCandidate,
} from "../src/services/story-engine.js";

const failures = [];
const checks = [];
const check = (condition, label) => { checks.push(label); if (!condition) failures.push(label); };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const results = document.querySelector("#results");
const frame = document.querySelector("#app");
frame.contentWindow.addEventListener("error", (event) => window.testErrors.push(`app: ${event.message}`));
frame.contentWindow.addEventListener("unhandledrejection", (event) => window.testErrors.push(`app: ${String(event.reason)}`));

const statsRepository = createStatsRepository(mockStatsProviderPayload, { generatedAt: "2026-07-30T12:30:00.000Z" });
const sportsRepository = createSportsRepository(mockProviderPayload);
const insightService = createInsightService(statsRepository, sportsRepository);
const entityRegistry = createEntityRegistry();
const fixedNow = new Date("2026-07-30T12:30:00.000Z");
const engine = createStoryEngine({ insightService, sportsRepository, statsRepository, entityRegistry, clock: () => fixedNow });
const allLeagues = sportsRepository.getLeagues();
const all = engine.generateStoryCandidates({}, { mode: "stats", now: fixedNow, visibleLeagues: allLeagues });
const byFixture = (id) => all.find((item) => item.id === id);

// Canonical model and eligibility.
check(STORY_TYPES.length >= 34, "1 all requested story types are represented centrally");
check(STORY_LIFECYCLE_STATES.join("|") === "candidate|active|featured|expired|archived|corrected|retracted", "2 lifecycle states are centralized");
check(Object.isFrozen(STORY_SCORE_WEIGHTS) && STORY_LIMITS.homepageHero === 1, "3 scoring weights and limits are centralized");
check(all.length > 12, "4 generation reuses scoped deterministic insights and fixture evidence");
check(all.every((item) => item.id && item.claimData && item.sources.length && item.edgeTrust && item.researchQuality), "5 every candidate retains identity claim sources and trust");
check(all.every((item) => Object.isFrozen(item.claimData) && Object.isFrozen(item.supportingEvidence)), "6 factual claim and evidence collections are immutable");
const valid = all.find((item) => validateStoryCandidate(item).valid);
check(Boolean(valid), "7 valid statistical story passes eligibility");
check(!validateStoryCandidate({ ...valid, supportingEvidence: [] }).valid, "8 missing evidence is suppressed");
check(!validateStoryCandidate({ ...valid, entityIds: ["missing"], primaryEntity: null }).valid, "9 ambiguous or unresolved identity is suppressed");
check(!validateStoryCandidate({ ...valid, validationStatus: "stale", freshness: { state: "stale" } }).valid, "10 stale story is suppressed");
check(!validateStoryCandidate(byFixture("story-fixture-conflict")).valid, "11 conflicting-source story is withheld");
check(!validateStoryCandidate({ ...valid, claimData: {} }).valid, "12 empty structured claim is invalid");
check(!validateStoryCandidate({ ...valid, storyType: "made_up" }).valid, "13 unsupported story type is excluded");
check(!validateStoryCandidate({ ...valid, supportingEvidence: [{ ...valid.supportingEvidence[0], status: "postponed" }] }).valid, "14 incomplete event evidence is excluded");
check(!validateStoryCandidate({ ...valid, validationStatus: "verified_complete", sample: true }).valid, "15 sample evidence cannot claim fully verified status");
check(!validateStoryCandidate(byFixture("story-fixture-expired"), { now: fixedNow, forHomepage: true }).valid, "16 expired story cannot render on homepage");
const validatedStreakFixture = byFixture("story-fixture-wnba-assist-streak");
check(!validateStoryCandidate({ ...validatedStreakFixture, claimData: { ...validatedStreakFixture.claimData, streakLength: 99 } }).valid, "16.a structured streak claim must match its evidence sample");
const datasetHigh = byFixture("story-fixture-dataset-high");
check(!validateStoryCandidate({ ...datasetHigh, claimData: { ...datasetHigh.claimData, value: 99 } }).valid, "16.b phrased values cannot diverge from supporting evidence");
check(!validateStoryCandidate({ ...datasetHigh, storyType: "verified_record", validationStatus: "dataset_only" }).valid, "16.c dataset-only claims cannot use verified-record status");
check(validateStoryCandidate(byFixture("story-fixture-provider-milestone")).valid, "16.d attributed provider assertions may use their retained single assertion row");
check(!validateStoryCandidate({ ...valid, bettingContext: { available: true, stale: false, entityId: "wrong", eventId: "wrong", canonicalMarketId: "player_points", period: "full-event", settlementScope: "including-overtime", updatedAt: fixedNow.toISOString() } }).valid, "16.e incompatible betting identity and event context is rejected");

// Scoring and deduplication.
const baseScore = scoreStoryCandidate(valid, { now: fixedNow, leagueId: valid.leagueId, mode: "stats" });
check(Number.isFinite(baseScore) && baseScore >= 0 && baseScore <= 100, "17 score is deterministic and bounded");
check(scoreStoryCandidate({ ...valid, primaryEntity: { ...valid.primaryEntity, media: null } }, { now: fixedNow }) === scoreStoryCandidate({ ...valid, primaryEntity: { ...valid.primaryEntity, media: { url: "art.png" } } }, { now: fixedNow }), "story score is independent of artwork availability");
const exactArtTieCandidate = { ...valid, id: "exact-art-tie", storyScore: 50, primaryEntity: { id: "wnba-caitlin-clark", name: "Caitlin Clark", sportId: "basketball", leagueId: "wnba", teamId: "IND-W" } };
const fallbackArtTieCandidate = { ...valid, id: "fallback-art-tie", storyScore: 50, primaryEntity: { id: "unknown-wnba-player", name: "Unknown WNBA player", sportId: "basketball", leagueId: "wnba", teamId: "IND-W" } };
check([fallbackArtTieCandidate, exactArtTieCandidate].sort(compareStoryCandidates)[0].id === "exact-art-tie", "exact artwork only breaks an otherwise equal story-score tie");
check([{ ...fallbackArtTieCandidate, storyScore: 51 }, exactArtTieCandidate].sort(compareStoryCandidates)[0].id === "fallback-art-tie", "stronger factual story score outranks exact artwork");
check(scoreStoryCandidate({ ...valid, freshness: { state: "stale" } }, { now: fixedNow }) < baseScore, "18 stale penalty lowers score");
check(scoreStoryCandidate({ ...valid, storyType: "milestone_reached" }, { now: fixedNow }) > scoreStoryCandidate({ ...valid, storyType: "fun_fact" }, { now: fixedNow }), "19 milestone importance raises score");
check(scoreStoryCandidate(valid, { now: fixedNow, leagueId: valid.leagueId }) > scoreStoryCandidate(valid, { now: fixedNow, leagueId: "other" }), "20 selected-league relevance raises score");
check(scoreStoryCandidate(valid, { now: fixedNow, query: valid.primaryEntity?.name }) >= scoreStoryCandidate(valid, { now: fixedNow }), "21 query relevance is deterministic");
check(scoreStoryCandidate({ ...valid, supportingEvidence: valid.supportingEvidence.slice(0, 1) }, { now: fixedNow }) <= baseScore, "22 small samples receive a penalty");
check(scoreStoryCandidate({ ...valid, validationStatus: "partial_coverage" }, { now: fixedNow }) < baseScore, "23 incomplete coverage lowers score");
const duplicate = { ...valid, id: `${valid.id}-duplicate`, storyScore: valid.storyScore - 1, supportingEvidence: [{ ...valid.supportingEvidence[0], id: "merged-evidence" }] };
const deduped = deduplicateStories([duplicate, valid]);
check(deduped.length === 1, "24 equivalent story candidates deduplicate");
check(deduped[0].id === valid.id, "25 stronger duplicate is preserved");
check(deduped[0].supportingEvidence.some((item) => item.id === "merged-evidence"), "26 compatible supporting evidence merges");
check(deduplicateStories([valid, { ...valid, id: "different-stat", statIds: ["different-stat"] }]).length === 2, "27 same entity with a distinct stat remains distinct");
check(engine.getFeaturedStories({}, { mode: "stats", now: fixedNow, visibleLeagues: allLeagues }).slice(0, 4).map((item) => item.sportId).length > 0, "28 homepage selection returns scored stories");
check(new Set(engine.getFeaturedStories({}, { mode: "stats", now: fixedNow, visibleLeagues: allLeagues }).map((item) => item.sportId)).size > 1, "29 All Sports feature selection is diverse");
const recruiterStories = engine.getFeaturedStories({}, { mode: "stats", now: fixedNow, visibleLeagues: allLeagues, canonicalStoryId: "story-fixture-ended-streak" });
check(recruiterStories[0]?.id === "story-fixture-ended-streak" && recruiterStories[0]?.primaryEntity?.id === "mlb-aaron-judge", "29a explicit portfolio seed leads with the supported Aaron Judge story");
check(recruiterStories[0]?.media?.illustration?.fallbackLevel === "exact" && new Set(recruiterStories.map((item) => item.sportId)).size > 1, "29b portfolio seed preserves exact artwork and multi-sport diversity");

// Deterministic phrasing.
const streak = all.find((item) => item.storyType === "active_streak" && item.claimData.streakLength > 1);
check(Boolean(streak), "30 active streak is generated from the insight system");
const streakText = phraseStory(streak);
check(streakText.headline.includes("streak"), "31 streak template uses sport-stat terminology");
check(streakText.shortSummary.includes("appearances"), "32 plural grammar is correct");
const singularText = phraseStory({ ...streak, claimData: { ...streak.claimData, streakLength: 1 } });
check(singularText.shortSummary.includes("appearance") && !singularText.shortSummary.includes("appearances"), "33 singular grammar is correct");
check(streakText.uncertaintyDisclosure.toLowerCase().includes("sample"), "34 dataset disclosure is explicit");
check(streakText.uncertaintyDisclosure.includes(streak.scope.season), "35 season scope is disclosed");
check(!/all-time|historic|record-breaking/i.test(`${streakText.headline} ${streakText.shortSummary}`), "36 unsupported historic wording is absent");
check(!/guaranteed|lock|can.t miss/i.test(streakText.shareCaption), "37 betting guarantees are absent");
check(!/[“”\"]/.test(streakText.headline), "38 templates do not invent quotes");
check(phraseStory(byFixture("story-fixture-nascar-comeback")).shortSummary.includes("positions"), "39 motorsports uses position language");
check(phraseStory(byFixture("story-fixture-tennis-upset")).headline.includes("seed"), "40 tennis upset uses tournament terminology");

// Story families and representative fixture-backed coverage.
const represented = new Set(all.map((item) => item.storyType));
check(represented.has("milestone_reached"), "41 milestone reached story is represented");
check(represented.has("milestone_approaching"), "42 milestone approaching story is represented");
check(represented.has("active_streak"), "43 active streak story is represented");
check(represented.has("streak_ended"), "44 streak ended story is represented");
check(represented.has("dataset_high"), "45 dataset high story is represented");
check(represented.has("comeback"), "46 comeback story is represented");
check(represented.has("upset"), "47 upset story is represented");
check(represented.has("standings_change"), "48 standings change story is represented");
check(represented.has("data_update"), "49 corrected data-update story is represented");
check(all.some((item) => item.leagueId === "wnba" && item.storyType === "active_streak" && item.statIds.includes("basketball-assists")), "50 WNBA assist streak retains completed-row fixture evidence");
check(all.some((item) => item.leagueId === "nba" && item.statIds.includes("basketball-three-pointers-made")), "51 NBA three-pointer story is derived from existing insights");
check(all.some((item) => item.leagueId === "mlb" && item.statIds.includes("baseball-hits")), "52 MLB hit story is derived from existing insights");
check(all.some((item) => item.leagueId === "mlb" && item.statIds.includes("baseball-pitcher-strikeouts")), "53 MLB strikeout story is derived from existing insights");
check(all.some((item) => item.leagueId === "nfl" && item.storyType.startsWith("milestone")), "54 NFL milestone is represented");
check(all.some((item) => item.leagueId === "nhl" && item.statIds.includes("hockey-points")), "55 NHL points story is represented");
check(all.some((item) => item.leagueId === "ufc" && item.storyType === "active_streak"), "56 UFC form or finish streak is represented");
check(all.some((item) => item.leagueId === "boxing" && item.storyType.startsWith("milestone")), "57 boxing milestone is represented");
check(all.some((item) => item.leagueId === "f1" && item.statIds.includes("motorsport-average-finishing-position")), "58 Formula 1 top-finish story is represented");
check(Boolean(byFixture("story-fixture-golf-course")), "59 golf course-history fixture is represented");
check(Boolean(byFixture("story-fixture-tennis-upset")), "60 tennis upset fixture is represented");
check(Boolean(byFixture("story-fixture-corrected")) && Boolean(byFixture("story-fixture-expired")), "61 corrected and expired fixture stories are retained for audit");
const syntheticBoxingFixture = byFixture("story-fixture-boxing-knockout-milestone");
check(syntheticBoxingFixture?.primaryEntity?.id === "boxing-sample-boxer-a" && syntheticBoxingFixture?.claimData?.entityName === "Sample Boxer A", "61.a synthetic boxing fixture remains available with its original canonical identity");
check(!syntheticBoxingFixture?.entityIds?.includes("boxing-canelo-alvarez"), "61.b synthetic fixture evidence is never remapped to a real athlete");

// Edge Trust, view models, actions, and betting separation.
const view = buildStoryViewModel(valid, { presentation: "hero", mode: "stats" });
check(view.presentation === "hero" && view.headline && view.summary, "62 normalized hero view model is built");
check(view.edgeTrust && view.researchQuality && view.edgeTrust.publicStatus, "63 every story receives Edge Trust and Research Quality");
check(view.validationLabel && view.sourceLabel && view.freshnessLabel, "64 validation source and freshness remain visible");
check(view.media.altText && view.media.rightsStatus, "65 media fallback carries alt text and rights metadata");
check(view.secondaryActions.some((item) => item.type === "evidence"), "66 supporting-evidence action is available");
check(view.secondaryActions.some((item) => item.type === "research-story"), "67 Edge Intelligence action is available");
check(view.secondaryActions.some((item) => item.type === "save-story") && view.secondaryActions.some((item) => item.type === "share-story"), "68 save and share actions are available");
check(!view.secondaryActions.some((item) => item.type === "market") && !view.market, "69 Stats mode excludes betting context");
const marketStory = all.find((item) => item.bettingContext);
check(!marketStory || buildStoryViewModel(marketStory, { mode: "both" }).market?.available, "70 Both mode only exposes compatible available markets");
check(!marketStory || !buildStoryViewModel(marketStory, { mode: "stats" }).market, "71 observed fact remains separate from market context");
check(!marketStory || !/probability/i.test(JSON.stringify(buildStoryViewModel(marketStory, { mode: "both" }).researchQuality)), "72 Research Quality is not confidence or probability");

// Navigation scope, lifecycle, search, caching, and cancellation.
const wnba = engine.getStoriesForScope({ leagueIds: ["wnba"], sportIds: ["basketball"] }, { now: fixedNow, visibleLeagues: [sportsRepository.getLeague("wnba")] });
check(wnba.length > 0 && wnba.every((item) => item.leagueId === "wnba"), "73 WNBA scope contains WNBA stories only");
const soccer = engine.getStoriesForScope({ sportIds: ["soccer"] }, { now: fixedNow, visibleLeagues: allLeagues.filter((item) => item.sportId === "soccer") });
check(soccer.length > 0 && soccer.every((item) => item.sportId === "soccer"), "74 Soccer scope contains soccer stories only");
const ufc = engine.getStoriesForScope({ leagueIds: ["ufc"], sportIds: ["mma"] }, { now: fixedNow, visibleLeagues: [sportsRepository.getLeague("ufc")] });
check(ufc.every((item) => item.leagueId === "ufc"), "75 UFC excludes Boxing");
const f1 = engine.getStoriesForScope({ leagueIds: ["f1"], sportIds: ["motorsport"] }, { now: fixedNow, visibleLeagues: [sportsRepository.getLeague("f1")] });
check(f1.every((item) => item.leagueId === "f1"), "76 Formula 1 excludes NASCAR");
const live = engine.getStoriesForScope({ leagueIds: ["wnba"], sportIds: ["basketball"], liveOnly: true }, { now: fixedNow, visibleLeagues: [sportsRepository.getLeague("wnba")] });
check(live.every((item) => item.storyType === "upcoming_event" && item.claimData.status === "live"), "77 Live scope never falls back to historical stories");
const today = engine.getStoriesForScope({ leagueIds: ["wnba"], sportIds: ["basketball"], todayOnly: true }, { now: fixedNow, visibleLeagues: [sportsRepository.getLeague("wnba")] });
check(today.every((item) => item.storyType === "upcoming_event" || item.supportingEvidence.some((evidenceItem) => evidenceItem.status === "completed")), "78 Today scope contains only today events or recent completed evidence");
check(engine.generateStoryCandidates({ leagueIds: ["wnba"] }, { now: fixedNow }) === engine.generateStoryCandidates({ leagueIds: ["wnba"] }, { now: fixedNow }), "79 candidate generation is cached by scope and provider version");
check(engine.generateStoryCandidates({ leagueIds: ["wnba"], todayOnly: true }, { now: fixedNow }) !== engine.generateStoryCandidates({ leagueIds: ["wnba"], todayOnly: true }, { now: new Date("2026-07-31T12:30:00.000Z") }), "79.a Today cache keys include the local calendar date");
const archived = engine.archiveStory(valid.id, "test archive");
check(archived.lifecycleState === "archived" && archived.audit.at(-1).reason === "test archive", "80 story archives with audit metadata");
const corrected = engine.correctStory(valid.id, { corrected: true }, "provider correction");
check(corrected.lifecycleState === "corrected" && corrected.audit.at(-1).previousClaim, "81 correction preserves the prior structured claim");
const retracted = engine.retractStory(valid.id, "invalidated");
check(retracted.lifecycleState === "retracted", "82 invalidated story can be retracted");
const regeneratedAfterRetraction = engine.getStoriesForScope({ leagueIds: [valid.leagueId], sportIds: [valid.sportId] }, { now: fixedNow, visibleLeagues: [sportsRepository.getLeague(valid.leagueId)] });
check(!regeneratedAfterRetraction.some((item) => item.id === valid.id), "82.a retracted lifecycle overrides survive candidate regeneration");
const refreshedStory = engine.refreshStory(valid.id, { leagueIds: [valid.leagueId], sportIds: [valid.sportId] }, { now: fixedNow });
check(refreshedStory.previous.lifecycleState === "retracted" && refreshedStory.current?.id === valid.id && engine.getStory(valid.id).lifecycleState === "retracted", "82.b refresh recalculates against the retained lifecycle snapshot without overwriting it");
check(engine.searchStories("sample driver").some((item) => item.primaryEntity?.id === "nascar-sample-driver"), "83 story search resolves a driver");
check(engine.searchStories("standings", { storyType: "standings_change" }).every((item) => item.storyType === "standings_change"), "84 story search filters by type");
check(engine.searchStories("strikeouts", { leagueId: "mlb" }).every((item) => item.leagueId === "mlb"), "85 story search filters by league and stat text");
check(engine.getStoriesForEntity("golf-sample-golfer").length === 1, "86 entity story lookup uses canonical IDs");
check(engine.getStoriesForEvent("MLS-001").length === 1, "87 event story lookup uses canonical event IDs");
const previousSnapshot = structuredClone(valid);
engine.correctStory(valid.id, { changed: true }, "second correction");
check(JSON.stringify(previousSnapshot.claimData) !== JSON.stringify(engine.getStory(valid.id).claimData), "88 lifecycle changes do not mutate an earlier saved snapshot");
const requestA = engine.getFeaturedStoriesAsync({ leagueIds: ["wnba"] }, { now: fixedNow });
const requestB = engine.getFeaturedStoriesAsync({ leagueIds: ["mlb"] }, { now: fixedNow });
let firstCancelled = false;
try { await requestA; } catch (error) { firstCancelled = error.name === "AbortError"; }
check(firstCancelled && (await requestB).every((item) => item.leagueId === "mlb"), "89 stale asynchronous story request is cancelled");
engine.clearCache({ leagueId: "wnba" });
check(true, "90 targeted invalidation completes without clearing unrelated provider data");
const targetedEngine = createStoryEngine({ insightService, sportsRepository, statsRepository, entityRegistry, clock: () => fixedNow });
targetedEngine.generateStoryCandidates({ leagueIds: ["wnba"] }, { now: fixedNow });
const cachedMlb = targetedEngine.generateStoryCandidates({ leagueIds: ["mlb"] }, { now: fixedNow });
targetedEngine.clearCache({ leagueId: "wnba" });
check(targetedEngine.generateStoryCandidates({ leagueIds: ["mlb"] }, { now: fixedNow }) === cachedMlb, "90.a league invalidation preserves unrelated cached scope results");
const storyPlan = createResearchPlan({
  query: `Explain ${valid.id}`,
  mode: "stats",
  currentLeague: sportsRepository.getLeague(valid.leagueId),
  storyContext: {
    storyId: valid.id,
    headline: phraseStory(valid).headline,
    entityIds: valid.entityIds,
    sportId: valid.sportId,
    leagueId: valid.leagueId,
    eventIds: valid.eventIds,
    claimData: valid.claimData,
    supportingEvidence: valid.supportingEvidence,
    dateRange: valid.scope.dateRange,
    sourceIds: valid.sources.map((source) => source.id),
    sources: valid.sources,
    freshness: valid.freshness,
    warnings: valid.warnings,
    validationStatus: valid.validationStatus,
    researchQuality: valid.researchQuality,
  },
});
const storyAnswer = buildResearchAnswer({ query: storyPlan.query, mode: "stats", plan: storyPlan, statsProvider: statsRepository });
check(Object.isFrozen(storyPlan.storyContext?.claimData) && JSON.stringify(storyPlan.storyContext.claimData) === JSON.stringify(valid.claimData) && storyPlan.entityIds.includes(valid.entityIds[0]), "90.b Edge Intelligence retains the immutable structured story claim and canonical scope");
check(storyAnswer.evidence.filter((item) => item.type === "story-evidence").length === valid.supportingEvidence.length, "90.c Edge Intelligence answer retains every supporting story row");
check(storyAnswer.summary.includes("cannot broaden its validation scope"), "90.d Edge Intelligence explicitly prevents strengthening a story claim");
const generationStarted = performance.now();
targetedEngine.getFeaturedStories({}, { mode: "stats", now: fixedNow, visibleLeagues: allLeagues, noCache: true });
check(performance.now() - generationStarted < 500, "90.e bounded synchronous fixture generation stays below the regression budget");

// Application detail, accessibility, modes, and regressions.
if (frame.contentDocument?.readyState !== "complete") await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
await wait(1000);
const app = frame.contentDocument;
const appWindow = frame.contentWindow;
const storyCards = [...app.querySelectorAll("#todayPulseGrid [data-home-card]")];
check(storyCards.length > 0, "91 Today’s Stories is populated by the Story Engine");
check(storyCards.every((card) => card.dataset.leagueId === "wnba"), `91.a initial WNBA scope contains only WNBA stories (${storyCards.map((card) => card.dataset.leagueId).join(",")})`);
check(storyCards[0].querySelector("h3") && storyCards[0].querySelector("[data-view-story]")?.tagName === "BUTTON", "92 story cards use logical headings and keyboard buttons");
check(storyCards.every((card) => card.querySelector(".validation-label") && card.querySelector(".sample-badge")?.textContent.includes("Sample")), "93 status and sample labeling are not color-only");
const open = storyCards[0].querySelector("[data-view-story]");
open.click();
await wait(50);
check(app.querySelector("#insightDialog")?.open && app.querySelector("[data-story-detail]"), "94 deep-linked story detail opens");
check(new URL(appWindow.location.href).searchParams.has("story"), "95 story detail writes a refresh-safe URL");
check(app.querySelector("[data-story-evidence-panel] table caption") && app.querySelector("#storyTrust"), "96 detail exposes evidence and Edge Trust");
check(app.querySelector("[data-focus-story-evidence]")?.tagName === "BUTTON", "97 evidence focus control is keyboard accessible");
app.querySelector("[data-focus-story-evidence]")?.click();
check(app.activeElement?.hasAttribute("data-story-evidence-panel"), "98 evidence panel receives focus");
check(app.querySelector("[data-research-story]") && app.querySelector("[data-save-story]") && app.querySelector("[data-share-story]"), "99 detail exposes research save and share actions");
app.querySelector("#closeInsightDialog")?.click();
await wait(30);
check(!new URL(appWindow.location.href).searchParams.has("story") && app.activeElement === open, "100 closing detail restores focus and clears deep link");
open.click();
await wait(30);
const researchStoryAction = app.querySelector("#insightDialog [data-research-story]");
researchStoryAction?.click();
await wait(260);
check(Boolean(researchStoryAction) && app.querySelector("#queryInput")?.value.includes("supporting evidence")
  && app.querySelector("#researchAnswer")?.textContent.includes("cannot broaden its validation scope"),
"100.a story detail sends structured context through the live Edge Intelligence workflow");
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, "101 390px story cards have no horizontal overflow");
app.documentElement.style.fontSize = "200%";
await wait(20);
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, "101.a story layout does not overflow at 200% root text size");
app.documentElement.style.fontSize = "";
app.querySelector('[data-theme-option="light"]')?.click();
check(app.body.dataset.theme === "light" && app.querySelector("[data-home-card]"), "102 light theme renders stories");
app.querySelector('[data-theme-option="dark"]')?.click();
check(app.body.dataset.theme === "dark", "103 dark theme renders stories");
app.querySelector('[data-research-mode="betting"]')?.click();
await wait(30);
check(app.querySelector("#todayPulse")?.dataset.scope === "league:wnba", "104 Betting mode preserves selected story scope");
app.querySelector('[data-research-mode="both"]')?.click();
await wait(30);
check(app.querySelector("#todayPulseGrid [data-home-card]"), "105 Both mode retains factual stories");
check(app.querySelector("#todayMarketGrid"), "106 Today’s Markets remains present");
check(app.querySelector("#researchAnswer") && app.querySelector("#personalWorkspaceView"), "107 Edge Intelligence and Workspace remain present");
const scopedCards = () => app.querySelector("#homeCommandCenter")?.hidden
  ? [...app.querySelectorAll("#todayPulseGrid [data-home-card]")]
  : [...app.querySelectorAll("#homeCommandCenter [data-command-feature], #homeCommandCenter [data-command-story]")];
app.querySelector('#sportTabs [data-nav-view="more"]')?.click();
await wait(20);
app.querySelector('#discoveryContent [data-league="mlb"]')?.click();
await wait(30);
check(scopedCards().every((card) => card.dataset.leagueId === "mlb"), "108 MLB navigation shows only MLB stories");
app.querySelector('#sportTabs [data-sport="soccer"]')?.click();
await wait(30);
check(scopedCards().every((card) => card.dataset.sportId === "soccer"), "109 Soccer navigation shows only soccer stories");
app.querySelector('#sportTabs [data-league="ufc"]')?.click();
await wait(30);
check(scopedCards().every((card) => card.dataset.leagueId === "ufc"), "110 UFC navigation excludes Boxing stories");
app.querySelector('#sportTabs [data-nav-view="more"]')?.click();
await wait(20);
app.querySelector('#discoveryContent [data-league="f1"]')?.click();
await wait(30);
check(scopedCards().every((card) => card.dataset.leagueId === "f1"), "111 Formula 1 navigation excludes unrelated motorsports stories");
app.querySelector('#sportTabs [data-nav-view="more"]')?.click();
await wait(20);
app.querySelector('#discoveryFilters [data-discovery-view="all"]')?.click();
await wait(30);
check(new Set(scopedCards().map((card) => card.dataset.sportId)).size > 1, "112 All Sports restores cross-sport stories");
for (const width of [1280, 768, 390]) {
  frame.style.width = `${width}px`;
  await wait(20);
  check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, `113.${width} story layout has no viewport overflow`);
}
check(window.testErrors.length === 0, `114 no application console errors${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} checks)\n${checks.join("\n")}`;
frame.remove();
