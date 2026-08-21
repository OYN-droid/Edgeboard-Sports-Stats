import { DISCOVERY_ITEM_TYPES, DISCOVERY_MIN_RESEARCH_QUALITY, DISCOVERY_SCORE_WEIGHTS, EXPLORATION_CATEGORIES, SPORT_DISCOVERY_TAXONOMY } from "../src/config/discovery-config.js";
import { MOCK_DISCOVERY_CHANGES } from "../src/data/mock-discovery-fixtures.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { mockStatsProviderPayload } from "../src/data/mock-stats-provider.js";
import { createDiscoveryService, createDiscoveryItem, diversifyDiscoveryItems, scoreDiscoveryItem, validateDiscoveryItem } from "../src/services/discovery-service.js";
import { createEntityRegistry } from "../src/services/entity-registry-service.js";
import { createInsightService } from "../src/services/insight-service.js";
import { createResearchPlan } from "../src/services/research-planner-service.js";
import { buildResearchAnswer } from "../src/services/research-answer-service.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { createStatsRepository } from "../src/services/stats-provider.js";
import { createStoryEngine } from "../src/services/story-engine.js";

const failures = [];
const checks = [];
const check = (condition, label) => { checks.push(label); if (!condition) failures.push(label); };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const results = document.querySelector("#results");
const frame = document.querySelector("#app");
frame.contentWindow.addEventListener("error", (event) => window.testErrors.push(`app: ${event.message}`));
frame.contentWindow.addEventListener("unhandledrejection", (event) => window.testErrors.push(`app: ${String(event.reason)}`));

const fixedNow = new Date("2026-07-30T12:30:00.000Z");
const sportsRepository = createSportsRepository(mockProviderPayload);
const statsRepository = createStatsRepository(mockStatsProviderPayload, { generatedAt: fixedNow.toISOString() });
const insightService = createInsightService(statsRepository, sportsRepository);
const entityRegistry = createEntityRegistry();
const storyEngine = createStoryEngine({ insightService, sportsRepository, statsRepository, entityRegistry, clock: () => fixedNow });
const service = createDiscoveryService({ sportsRepository, statsRepository, insightService, storyEngine, entityRegistry, clock: () => fixedNow });
const leagues = sportsRepository.getLeagues();
const all = service.getDiscoveryItems({}, { mode: "stats", now: fixedNow, visibleLeagues: leagues });

// 1–29: every requested canonical type is centrally registered.
DISCOVERY_ITEM_TYPES.forEach((type, index) => check(typeof type === "string" && type.length > 0, `${index + 1} canonical discovery type ${type} is registered`));
// 30–39: sport-aware taxonomies are explicit and do not share one generic list.
Object.entries(SPORT_DISCOVERY_TAXONOMY).forEach(([sportId, topics], index) => check(topics.length > 0 && topics.every((topic) => topic.id && topic.queryTemplate), `${30 + index} ${sportId} taxonomy has structured supported topics`));

check(Object.isFrozen(DISCOVERY_SCORE_WEIGHTS), "40 discovery scoring configuration is immutable");
check(EXPLORATION_CATEGORIES.includes("Markets") && EXPLORATION_CATEGORIES.includes("Upcoming Events"), "41 exploration categories include markets and events");
check(all.length > 20, "42 discovery composes existing stories topics leagues events and entities");
check(all.every((item) => item.id && item.type && item.sportId && item.leagueId), "43 every item has canonical identity and scope");
check(all.every((item) => item.sources.length && item.freshness && item.edgeTrust && item.researchQuality), "44 every item exposes source freshness Trust and Research Quality");
check(all.every((item) => item.route.href || item.queryTemplate.query), "45 every item has a stable route or structured query");
check(all.every((item) => item.sampleMode && item.sources.some((source) => source.sample)), "46 fixture discovery remains labeled sample data");
check(all.every((item) => !/popular with users|most searched|global trend/i.test(`${item.title} ${item.summary}`)), "47 sample discovery makes no unsupported public-popularity claim");
check(all.some((item) => item.type === "event" && item.eventIds.length === 1), "48 normalized event discovery items preserve event IDs");
check(all.some((item) => item.type === "league") && all.some((item) => item.entityIds.length), "49 league and canonical entity discovery coexist");

const base = all.find((item) => item.type === "research_topic");
check(validateDiscoveryItem(base, service).valid, "50 supported topic validates");
check(!validateDiscoveryItem({ ...base, sportId: "" }, service).valid, "51 missing sport scope fails validation");
check(!validateDiscoveryItem({ ...base, leagueId: "missing" }, service).valid, "52 unknown league fails validation");
check(!validateDiscoveryItem({ ...base, route: {}, queryTemplate: {} }, service).valid, "53 item without a drill-down action fails validation");
check(!validateDiscoveryItem({ ...base, sources: [] }, service).valid, "54 item without source attribution fails validation");
check(!validateDiscoveryItem(createDiscoveryItem({ ...base, id: "missing-source", sources: [], source: {} }, service), service).valid, "54.a normalized source placeholder cannot satisfy attribution validation");
check(!validateDiscoveryItem({ ...base, identityResolved: false }, service).valid, "55 unresolved canonical identity fails validation");
check(!validateDiscoveryItem({ ...base, validationStatus: "conflicting_sources" }, service).valid, "56 conflicting evidence is suppressed");
check(!validateDiscoveryItem({ ...base, validationStatus: "retracted" }, service).valid, "57 retracted items are suppressed");
check(validateDiscoveryItem({ ...base, freshness: { state: "stale", lastUpdated: fixedNow.toISOString() } }, service).warnings.some((warning) => warning.includes("stale")), "58 stale items receive an explicit warning");
check(!validateDiscoveryItem({ ...base, edgeTrust: { ...base.edgeTrust, researchQuality: { ...base.edgeTrust.researchQuality, score: DISCOVERY_MIN_RESEARCH_QUALITY - 1 } } }, service).valid, "58.a low Research Quality is suppressed");

const context = { leagueIds: [base.leagueId], sportIds: [base.sportId], mode: "stats", now: fixedNow, preferences: {}, seenIds: [] };
const score = scoreDiscoveryItem(base, context);
check(Number.isFinite(score) && score >= 0 && score <= 100, "59 scoring is deterministic and bounded");
check(scoreDiscoveryItem(base, context) === score, "60 identical inputs produce identical scores");
check(scoreDiscoveryItem(base, context) > scoreDiscoveryItem(base, { ...context, leagueIds: ["other"], sportIds: ["other"] }), "61 selected scope raises relevance");
check(scoreDiscoveryItem(base, { ...context, preferences: { favoriteLeagueIds: [base.leagueId] } }) > score, "62 explicit favorite league raises local relevance");
check(scoreDiscoveryItem({ ...base, freshness: { state: "stale", lastUpdated: "2025-01-01T00:00:00Z" } }, context) < score, "63 stale evidence lowers rank");
check(scoreDiscoveryItem({ ...base, sourceSignals: [...base.sourceSignals, { type: "small_sample" }] }, context) < score, "64 small samples lower rank");
check(scoreDiscoveryItem(base, { ...context, seenIds: [base.id] }) < score, "65 repeated display lowers rank");
check(scoreDiscoveryItem({ ...base, confidence: 99 }, context) === score, "66 betting confidence cannot affect discovery score");
check(scoreDiscoveryItem({ ...base, localOnly: true, personalized: true }, context) > score, "67 opted-in local interest can raise rank");
const diverse = diversifyDiscoveryItems(all.map((item) => ({ ...item, discoveryScore: 50 })), 6, {});
check(diverse.length === 6, "68 diversity returns the configured number of eligible items");
check(new Set(diverse.map((item) => item.leagueId)).size > 1, "69 cross-sport discovery avoids a one-league takeover");

const wnbaScope = { leagueIds: ["wnba"], sportIds: ["basketball"] };
const wnba = service.getDiscoveryItems(wnbaScope, { mode: "stats", now: fixedNow, visibleLeagues: [sportsRepository.getLeague("wnba")] });
check(wnba.length > 0 && wnba.every((item) => item.leagueId === "wnba"), "70 WNBA discovery contains only WNBA");
check(service.getDiscoveryItems({ leagueIds: ["ufc"], sportIds: ["mma"] }, { mode: "stats", now: fixedNow }).every((item) => item.leagueId === "ufc"), "71 UFC excludes Boxing");
check(service.getDiscoveryItems({ leagueIds: ["f1"], sportIds: ["motorsport"] }, { mode: "stats", now: fixedNow }).every((item) => item.leagueId === "f1"), "72 Formula 1 excludes unrelated motorsports");
check(service.getDiscoveryItems({ sportIds: ["soccer"] }, { mode: "stats", now: fixedNow }).every((item) => item.sportId === "soccer"), "73 soccer scope includes only soccer");
check(new Set(service.getTrendingResearch({}, { mode: "stats", now: fixedNow }).map((item) => item.sportId)).size > 1, "74 All Sports trending discovery is diverse");
check(service.getDiscoveryItems({ leagueIds: ["not-a-league"] }, { mode: "stats", now: fixedNow }).length === 0, "75 an empty league scope does not fall back to unrelated items");
check(service.getDiscoveryItems({ liveOnly: true }, { mode: "stats", now: fixedNow }).every((item) => item.type === "event" && item.eventStatus === "live"), "75.a Live discovery never substitutes non-live historical research");
check(service.getDiscoveryItems({ todayOnly: true }, { mode: "stats", now: fixedNow }).every((item) => item.type === "event" && new Date(item.startsAt).toLocaleDateString("en-CA") === fixedNow.toLocaleDateString("en-CA")), "75.b Today discovery uses the local calendar date without unrelated fallback");
check(service.getExploreTopics({ sportId: "mma", leagueId: "ufc", mode: "stats" }).some((item) => item.title.toLowerCase().includes("submission")), "76 UFC exposes supported submission research");
check(!service.getExploreTopics({ sportId: "boxing", leagueId: "boxing", mode: "stats" }).some((item) => item.title.toLowerCase().includes("submission")), "77 Boxing never exposes submission research");
check(service.getExploreCategories({ sportId: "basketball", leagueId: "wnba", mode: "stats" }).every((item) => item.label !== "Markets"), "78 Stats mode excludes market categories");
check(service.getExploreCategories({ sportId: "basketball", leagueId: "wnba", mode: "betting" }).some((item) => item.label === "Markets"), "79 Betting mode exposes supported market categories");
check(service.getDiscoveryItems(wnbaScope, { mode: "stats", now: fixedNow }).every((item) => item.marketIds.length === 0), "80 Stats mode does not leak markets");
const nbaScope = { leagueIds: ["nba"], sportIds: ["basketball"] };
check(service.getDiscoveryItems(nbaScope, { mode: "betting", now: fixedNow }).some((item) => item.type === "market_topic"), "81 Betting mode creates explicitly labeled market topics when markets exist");

const paths = service.getExplorationPaths(wnbaScope, { mode: "both", now: fixedNow });
check(paths.length > 0, "82 guided exploration paths are generated lazily from supported topics");
check(paths.every((path) => path.steps.length >= 4 && path.steps.every((step) => step.queryTemplate.leagueId === "wnba")), "83 path steps preserve canonical scope");
check(paths.every((path) => new URL(path.route.href, location.origin).searchParams.get("explore") === "basketball:wnba"), "84 path deep links preserve sport and league");
check(service.getExplorationPaths(wnbaScope, { mode: "stats", now: fixedNow }).every((path) => !path.steps.some((step) => step.type === "market")), "85 Stats paths contain no market step");
check(service.getExplorationPaths(nbaScope, { mode: "both", now: fixedNow }).some((path) => path.steps.some((step) => step.type === "market")), "86 Both paths may attach provider-confirmed market context");
check(service.getExploreCategoryItems("upcoming-events", wnbaScope, { mode: "stats", now: fixedNow }).every((item) => item.type === "event"), "87 Upcoming Events category filters to events");
check(service.getExploreCategoryItems("markets", wnbaScope, { mode: "betting", now: fixedNow }).every((item) => item.type === "market_topic"), "88 Markets category filters to market topics");

const workspaceState = {
  workspaces: [{ id: "workspace-1", isArchived: false }],
  preferences: [{ workspaceId: "workspace-1", personalizedDiscoveryEnabled: true, privacyMode: false }],
  meta: { activityPaused: false, privacyMode: false },
  activity: [{ workspaceId: "workspace-1", targetType: "athlete", targetId: "wnba-caitlin-clark", label: "Caitlin Clark", queryText: "Clark assist trends", createdAt: fixedNow.toISOString(), route: "/?player=wnba-caitlin-clark" }],
  savedObjects: [],
};
const continued = service.getContinueExploring(workspaceState, wnbaScope, { mode: "stats", defaultSportId: "basketball", defaultLeagueId: "wnba" });
check(continued.length === 1 && continued[0].localOnly && continued[0].personalized, "89 Continue Exploring is explicitly local and personalized");
check(continued[0].summary.includes("Clark assist trends"), "90 opted-in activity can resume the original local query");
check(service.getContinueExploring({ ...workspaceState, preferences: [{ workspaceId: "workspace-1", personalizedDiscoveryEnabled: false }] }, wnbaScope).length === 0, "91 personalized discovery can be disabled independently");
check(service.getContinueExploring({ ...workspaceState, meta: { activityPaused: true } }, wnbaScope).length === 0, "92 paused activity disables Continue Exploring");
const privateContinue = service.getContinueExploring({ ...workspaceState, preferences: [{ workspaceId: "workspace-1", privacyMode: true }] }, wnbaScope);
check(privateContinue.length === 1 && !privateContinue[0].summary.includes("Clark assist trends"), "93 privacy mode does not surface retained query text");
const globallyPrivateContinue = service.getContinueExploring({ ...workspaceState, meta: { activityPaused: false, privacyMode: true } }, wnbaScope);
check(!globallyPrivateContinue[0].queryTemplate.query && globallyPrivateContinue[0].route.href === "/", "93.a global privacy mode removes resumable query text and query-bearing routes");

const changes = service.getRecentlyChanged({}, { mode: "both", now: fixedNow, limit: 20 });
check(changes.length === MOCK_DISCOVERY_CHANGES.filter((item) => item.significance >= 1).length, "94 meaningful changes use explicit fixture-backed signals");
check(changes.every((item) => item.change && item.change.oldValue !== undefined && item.change.newValue !== undefined), "95 changes preserve old and new values");
check(new URL(changes[0].route.href, location.origin).searchParams.get("changes") === "1", "95.a recently changed routes open the scoped changes view rather than a missing generic item");
check(changes.every((item) => item.sampleMode && item.warnings.some((warning) => warning.includes("sample"))), "96 changes are clearly labeled fixture sample data");
check(service.getRecentlyChanged({}, { mode: "stats", now: fixedNow, significanceThreshold: 0 }).every((item) => !item.marketIds.length), "97 Stats mode suppresses line movement");
check(service.getRecentlyChanged({ leagueIds: ["wnba"] }, { mode: "both", now: fixedNow }).every((item) => item.leagueId === "wnba"), "98 changed items respect selected league");

const related = service.getDiscoveryForEntity("wnba-caitlin-clark", { mode: "stats", now: fixedNow });
check(related.length > 0 && related.every((item) => item.leagueId === "wnba"), "99 related discovery uses canonical entity relationships in scope");
check(service.getDiscoveryForEvent("missing-event").length === 0, "100 missing event relation fails safely");
const search = service.searchDiscovery("assist", wnbaScope, { mode: "stats", now: fixedNow, workspaceState });
check(search.total > 0, "101 discovery search returns supported results");
check(search.groups.some((group) => group.id === "statistics"), "102 search groups canonical statistics");
check(search.groups.some((group) => group.id === "topics"), "103 search groups research topics");
check(service.searchDiscovery("x", wnbaScope).total === 0, "104 short queries do not trigger broad discovery search");
check(service.searchDiscovery("Clark", wnbaScope, { mode: "stats", now: fixedNow }).groups[0]?.id === "direct", "105 exact canonical entity matches rank before discovery suggestions");
check(!service.searchDiscovery("Clark", wnbaScope, { mode: "stats", now: fixedNow, includeDirectMatches: false }).groups.some((group) => group.id === "direct"), "105.a composed search can reuse an existing canonical entity result without a duplicate lookup group");
check(!service.searchDiscovery("Clark", wnbaScope, { mode: "stats", now: fixedNow, workspaceState: { ...workspaceState, meta: { activityPaused: false, privacyMode: true } } }).groups.some((group) => group.id === "recent"), "105.b privacy mode suppresses local activity search results");
check(service.getTrendingResearch(wnbaScope, { mode: "stats", now: fixedNow }).every((item) => item.whyNotable), "105.c every Trending Research item explains why it is notable");

const discoveryContext = service.buildDiscoveryViewModel(base).actions.find((action) => action.type === "research").context;
const plan = createResearchPlan({ query: base.queryTemplate.query, mode: "stats", currentLeague: sportsRepository.getLeague(base.leagueId), discoveryContext });
const answer = buildResearchAnswer({ query: plan.query, mode: "stats", plan, statsProvider: statsRepository });
check(plan.discoveryContext?.itemId === base.id, "106 Edge Intelligence retains canonical discovery item context");
check(plan.resolvedScope.leagueId === base.leagueId && plan.statIds.every((id) => base.statIds.includes(id)), "107 discovery scope overrides generic navigation defaults");
check(answer.evidence.some((item) => item.type === "discovery-signal"), "108 research answers expose discovery context as evidence");
check(answer.summary.includes("not public popularity"), "109 Edge Intelligence cannot turn local relevance into a public trend claim");
check(!/guaranteed|lock|win probability/i.test(answer.summary), "110 discovery research introduces no guarantee language");

const cached = service.getDiscoveryItems(wnbaScope, { mode: "stats", now: fixedNow });
check(service.getDiscoveryItems(wnbaScope, { mode: "stats", now: fixedNow }) === cached, "111 identical discovery requests reuse cached immutable results");
service.clearCache({ leagueId: "mlb" });
check(service.getDiscoveryItems(wnbaScope, { mode: "stats", now: fixedNow }) === cached, "112 targeted invalidation preserves unrelated league cache");
service.clearCache({ leagueId: "wnba" });
check(service.getDiscoveryItems(wnbaScope, { mode: "stats", now: fixedNow }) !== cached, "113 affected league invalidation refreshes its discovery cache");
const firstRequest = service.getDiscoveryItemsAsync(wnbaScope, { mode: "stats", now: fixedNow });
const secondRequest = service.getDiscoveryItemsAsync({ leagueIds: ["mlb"], sportIds: ["baseball"] }, { mode: "stats", now: fixedNow });
let cancelled = false;
try { await firstRequest; } catch (error) { cancelled = error.name === "AbortError"; }
check(cancelled && (await secondRequest).every((item) => item.leagueId === "mlb"), "114 stale async discovery cannot overwrite a newer scope");
const started = performance.now();
service.getDiscoveryItems({}, { mode: "stats", now: fixedNow, visibleLeagues: leagues, noCache: true });
check(performance.now() - started < 750, "115 bounded fixture discovery generation stays within regression budget");

if (frame.contentDocument?.readyState !== "complete") await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
await wait(1100);
const app = frame.contentDocument;
const appWindow = frame.contentWindow;
check(app.querySelector("#insightDiscovery"), "116 homepage retains Trending Research");
check([...app.querySelectorAll("#trendingResearch [data-home-card]")].every((card) => card.textContent.includes("Why notable:")), "116.a Trending Research visibly explains why each item is notable");
check(app.querySelector("#homeDiscoverySections"), "117 homepage retains deterministic discovery sections");
check(app.querySelector("#todayMarketGrid"), "118 Today’s Markets is not replaced by discovery");
check(app.querySelector("#researchAnswer"), "119 Edge Intelligence remains available");
check(app.querySelector("#personalWorkspaceView"), "120 Workspace remains available");
check([...app.querySelectorAll("#trendingResearch [data-home-card]")].every((card) => card.dataset.leagueId === "wnba"), "121 homepage discovery respects initial WNBA scope");
const exploreLink = app.querySelector('[data-home-section="explore"] [data-discovery-route]');
check(exploreLink?.tagName === "A" && exploreLink.hasAttribute("href"), "122 discovery cards use semantic deep links");
exploreLink?.click();
await wait(80);
check(!app.querySelector("#discoveryExplorer").hidden, "123 discovery deep link opens the progressive explorer");
check(new URL(appWindow.location.href).searchParams.has("topic"), "124 topic detail route is refresh-safe");
appWindow.history.pushState({}, "", "/?mode=stats&scope=league:wnba&explore=basketball:wnba");
appWindow.dispatchEvent(new appWindow.PopStateEvent("popstate"));
await wait(80);
check(app.querySelectorAll("[data-explore-category]").length > 0, "125 sport-aware exploration categories render");
const category = app.querySelector("[data-explore-category='upcoming-events']");
category?.click();
await wait(30);
check(category && app.querySelector("[data-explore-category='upcoming-events']")?.getAttribute("aria-pressed") === "true", "126 category selection exposes accessible pressed state");
const eventCards = [...app.querySelectorAll("#discoveryExplorerContent [data-discovery-item]")];
check(eventCards.length > 0 && eventCards.every((card) => card.textContent.includes("event")), "127 category selection filters its results");
const pathLink = app.querySelector(".exploration-path-links [data-discovery-route]");
pathLink?.click();
await wait(50);
check(app.querySelectorAll(".exploration-path [data-discovery-path-step]").length >= 4, "128 guided path exposes progressive research steps");
const pathStep = app.querySelector("[data-discovery-path-step]");
pathStep?.click();
await wait(300);
check(pathStep && app.querySelector("#queryInput").value.length > 0, "129 path step starts structured Edge Intelligence research");
app.querySelector("#queryInput").value = "assist";
app.querySelector("#queryInput").dispatchEvent(new Event("input", { bubbles: true }));
await wait(260);
check(app.querySelector("#athleteSearchResults [role='group']"), "130 global search adds grouped discovery results");
check(app.querySelector("#athleteSearchResults [data-discovery-search-query], #athleteSearchResults [data-discovery-route]"), "131 search suggestions remain keyboard-native links or buttons");
app.querySelector('[data-research-mode="betting"]')?.click();
await wait(40);
check(app.querySelector("#todayMarketGrid") && app.querySelector("#discoveryExplorer"), "132 Betting mode preserves markets and explorer");
app.querySelector('[data-research-mode="both"]')?.click();
await wait(40);
check(app.querySelector("#researchModeControl [aria-checked='true']")?.dataset.researchMode === "both", "133 Both mode remains canonical and accessible");
app.querySelector('[data-theme-option="light"]')?.click();
check(app.body.dataset.theme === "light", "134 light theme renders discovery");
app.querySelector('[data-theme-option="dark"]')?.click();
check(app.body.dataset.theme === "dark", "135 dark theme renders discovery");
for (const width of [1280, 768, 390]) {
  frame.style.width = `${width}px`;
  await wait(30);
  check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, `136.${width} discovery has no horizontal viewport overflow`);
}
app.documentElement.style.fontSize = "200%";
await wait(30);
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, "137 discovery does not overflow at 200% root text size");
app.documentElement.style.fontSize = "";
check(app.querySelector("#closeDiscoveryExplorer")?.tagName === "BUTTON" && app.querySelector("#discoveryExplorer")?.getAttribute("tabindex") === "-1", "138 explorer close and focus target use accessible semantics");
const discoverySourceBadges = [...app.querySelectorAll("#homeDiscoverySections .sample-badge, #trendingResearch .sample-badge")];
const invalidDiscoverySourceBadges = discoverySourceBadges.filter((badge) => !/sample|local/i.test(badge.textContent));
check(invalidDiscoverySourceBadges.length === 0, `139 discovery source mode is never color-only${invalidDiscoverySourceBadges.length ? `: ${invalidDiscoverySourceBadges.map((badge) => `${badge.textContent.trim()}@${badge.closest("[data-home-section]")?.dataset.homeSection || badge.closest("[data-home-card]")?.dataset.homeCard || "unknown"}`).join(", ")}` : ""}`);
check(window.testErrors.length === 0, `140 no browser console or unhandled promise errors${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} checks)\n${checks.join("\n")}`;
frame.remove();
