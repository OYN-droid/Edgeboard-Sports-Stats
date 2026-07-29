import { CANONICAL_ENTITIES } from "../src/data/canonical-entities.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { createAthleteMediaViewModel } from "../src/services/athlete-media-service.js";
import { createAthleteProfileRepository } from "../src/services/athlete-profile-service.js";
import { resolveCanonicalEntities } from "../src/services/entity-resolver.js";
import { createInsightCandidates } from "../src/services/insight-candidate-service.js";
import { getPickBySelectionId } from "../src/services/research-service.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { createStatsRepository } from "../src/services/stats-provider.js";

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
const profileRepository = createAthleteProfileRepository(statsRepository, sportsRepository);
const providerCallCounts = {};
const instrumentedStatsRepository = new Proxy(statsRepository, {
  get(target, property) {
    const value = target[property];
    if (typeof value !== "function") return value;
    return (...args) => {
      providerCallCounts[property] = (providerCallCounts[property] || 0) + 1;
      return value.apply(target, args);
    };
  },
});
const instrumentedProfileRepository = createAthleteProfileRepository(instrumentedStatsRepository, sportsRepository);
await instrumentedProfileRepository.getProfile("wnba-caitlin-clark", { delay: 0 });
check(providerCallCounts.getAthleteUpcomingEvent === 1, "profile assembly requests upcoming-event context once");
check(providerCallCounts.getAthleteMatchupContext === 1, "profile assembly requests matchup context once");

const representativeIds = [
  "wnba-caitlin-clark",
  "nba-tyrese-maxey",
  "mlb-aaron-judge",
  "mlb-gerrit-cole",
  "nfl-patrick-mahomes",
  "nhl-auston-matthews",
  "nhl-sample-goalie",
  "mls-lionel-messi",
  "ufc-sample-fighter-a",
  "boxing-sample-boxer-a",
  "f1-max-verstappen",
  "nascar-sample-driver",
];

const profiles = await Promise.all(representativeIds.map((id) => profileRepository.getProfile(id, { delay: 0 })));
check(profiles.every((profile) => profile.status === "ready"), "all twelve representative sample profiles build");
check(profiles.every((profile) => profile.athlete.id && profile.header.sample), "profiles reuse canonical IDs and declare sample mode");
check(profiles.every((profile) => profile.dataSources[0].provider && profile.dataSources[0].updatedAt), "every profile exposes source and freshness");
check(profiles.every((profile) => profile.header.media.rightsStatus && Object.hasOwn(profile.header.media, "approvedForCommercialUse")), "profile media exposes rights metadata");
check(new Set(profiles.map((profile) => profile.athlete)).size === profiles.length, "profiles reference canonical athlete objects without a duplicate player model");

const wnba = profiles[0];
const nba = profiles[1];
const batter = profiles[2];
const pitcher = profiles[3];
const quarterback = profiles[4];
const skater = profiles[5];
const goalie = profiles[6];
const soccer = profiles[7];
const fighter = profiles[8];
const boxer = profiles[9];
const f1 = profiles[10];
const nascar = profiles[11];

check(wnba.header.teamName === "Indiana Fever" && wnba.header.role === "Guard" && wnba.header.jerseyNumber === "22", "basketball header is sport-aware");
check(pitcher.header.role === "Pitcher" && pitcher.gameLogs.columns.some((column) => column.id === "baseball-pitcher-strikeouts"), "baseball pitcher uses pitcher columns");
check(fighter.header.stance === "Orthodox" && fighter.header.record.includes("sample") && fighter.tabs.some((tab) => tab.label === "Fight History"), "combat profile uses fight presentation");
check(f1.header.role.includes("Formula 1") && f1.tabs.some((tab) => tab.label === "Race Results"), "Formula 1 profile uses motorsport presentation");
check(nascar.header.role.includes("NASCAR") && nascar.splits.availableDimensions.includes("track-type"), "NASCAR profile supports track-type splits");
check(goalie.gameLogs.columns.some((column) => column.id === "hockey-saves"), "goalie profile uses goalie columns");
check(skater.gameLogs.columns.some((column) => column.id === "hockey-shots-on-goal"), "skater profile uses skater columns");
check(soccer.gameLogs.columns.some((column) => column.id === "soccer-shots-on-target"), "soccer profile uses soccer columns");
check(boxer.tabs.some((tab) => tab.label === "Style Stats"), "boxing profile uses combat tabs");
check(quarterback.overview.primaryStats.some((stat) => stat.statId === "football-passing-yards"), "quarterback summary uses passing stats");
check(batter.overview.primaryStats.some((stat) => stat.statId === "baseball-home-runs" && stat.aggregation === "sum"), "baseball season counts use source-row totals");
check(wnba.overview.primaryStats.some((stat) => stat.statId === "basketball-points" && stat.aggregation === "average"), "basketball summary uses per-event averages");

check(wnba.gameLogs.rows.length === 10, "last-10 profile log returns ten completed rows");
check(new Date(wnba.gameLogs.rows[0].date) > new Date(wnba.gameLogs.rows.at(-1).date), "provider game logs are newest first");
const lastFive = await profileRepository.getProfile("wnba-caitlin-clark", { delay: 0, logWindow: 5 });
check(lastFive.gameLogs.rows.length === 5, "last-five profile log is filtered");
check(lastFive.insights.every((insight) =>
  insight.supportingEventIds.every((eventId) => lastFive.gameLogs.rows.some((row) => row.eventId === eventId))),
"insight supporting events remain inside the active game-log window");
const homeOnly = await profileRepository.getProfile("wnba-caitlin-clark", { delay: 0, homeAway: "home" });
check(homeOnly.gameLogs.rows.every((row) => row.homeAway === "home"), "home-only game-log filter applies before rendering");
check(!wnba.gameLogs.rows.some((row) => row.eventId === "wnba-postponed-demo"), "postponed rows are excluded");
check(new Set(wnba.gameLogs.rows.map((row) => row.id)).size === wnba.gameLogs.rows.length, "duplicate rows do not inflate profile logs");
check(pitcher.gameLogs.columns.every((column) => !column.id.startsWith("basketball-")), "sport-specific game logs do not inherit basketball columns");

check(wnba.splits.availableDimensions.includes("home-away"), "basketball home-away split is available");
check(wnba.splits.rows.every((row) => row.sampleSize > 0), "split rows include sample sizes");
check(wnba.splits.rows.every((row) => row.comparisonBaseline !== null && row.variance !== null), "split rows include baseline and variance");
const starterSplit = await profileRepository.getProfile("wnba-caitlin-clark", { delay: 0, splitDimension: "starter-bench" });
check(starterSplit.splits.rows.some((row) => row.label === "Starter"), "starter-bench split is supported");
const handednessSplit = await profileRepository.getProfile("mlb-aaron-judge", { delay: 0, splitDimension: "pitcher-handedness" });
check(handednessSplit.splits.rows.some((row) => row.label === "left"), "baseball handedness split is supported");
const stanceSplit = await profileRepository.getProfile("ufc-sample-fighter-a", { delay: 0, splitDimension: "opponent-stance" });
check(stanceSplit.splits.rows.some((row) => row.label === "southpaw"), "combat stance split is supported");
check(stanceSplit.splits.rows.some((row) => row.warning.includes("Small sample")), "small splits show a warning");

check(wnba.trends.series.every((point) => point.value === null || Number.isFinite(point.value)), "trend values come from normalized source rows");
check(wnba.trends.series.some((point) => Number.isFinite(point.rollingAverage)), "rolling averages are calculated");
check(wnba.trends.accessibleSummary.includes("completed sample events"), "trend includes an accessible text summary");
check(wnba.trends.sampleSize === wnba.trends.series.filter((point) => point.value !== null).length, "trend sample size excludes missing values");

check(nba.props.markets.some((market) => market.id === "maxey-points"), "compatible provider-confirmed athlete market is attached");
check(nba.props.markets.every((market) => market.source && market.settlementScope), "profile markets retain source and settlement metadata");
check(wnba.props.markets.length === 0, "athlete without provider market receives an honest no-market state");
check(nba.props.markets.some((market) => market.stale), "stale profile odds remain visibly marked");
check(!nba.props.markets.some((market) => market.canonicalMarketId === "football-passing-yards"), "unsupported cross-sport markets stay hidden");
const freshPayload = structuredClone(mockProviderPayload);
const now = new Date().toISOString();
freshPayload.generated_at = now;
freshPayload.offers.forEach((offer) => {
  offer.last_updated_at = now;
  offer.selections.forEach((selection) => { selection.last_updated_at = now; });
});
const freshSports = createSportsRepository(freshPayload);
const freshProfiles = createAthleteProfileRepository(statsRepository, freshSports);
const freshMaxey = await freshProfiles.getProfile("nba-tyrese-maxey", { delay: 0 });
const freshMarket = freshMaxey.props.markets.find((market) => market.id === "maxey-points");
const freshPick = getPickBySelectionId(freshSports, "nba", "maxey-points");
check(freshMarket?.available && !freshMarket.stale, "fresh compatible profile market is actionable");
check(freshPick?.settlementScope && freshPick?.period, "add-to-slip pick preserves settlement metadata");

check(wnba.matchup.factors.every((factor) => factor.sampleSize !== undefined), "matchup claims expose sample size");
check(wnba.matchup.source.includes("mock"), "matchup claims identify their source");
check(pitcher.tabs.every((tab) => tab.id !== "matchup"), "empty matchup tab is omitted");
check(fighter.matchup.warnings.length > 0 && f1.matchup.warnings.length > 0, "combat and motorsport matchup limitations are explicit");

check(wnba.insights.length > 0, "deterministic insights are generated");
check(wnba.insights.every((insight) => insight.ruleId && insight.supportingEventIds.length && insight.calculationMethod), "insights carry rule, evidence, and method");
check(new Set(wnba.insights.map((insight) => `${insight.ruleId}:${JSON.stringify(insight.calculatedClaimData)}`)).size === wnba.insights.length, "near-identical insights are deduplicated");
check(!wnba.insights.some((insight) => /\brecord\b/i.test(insight.title)), "sample insight never claims an unsupported record");
check(wnba.relatedQueries.every((query) => query.includes("Caitlin Clark")), "related searches are athlete-specific");
check(!wnba.relatedQueries.some((query) => query.includes("current props")), "unsupported market suggestion is omitted");
check(nba.relatedQueries.some((query) => query.includes("current props")), "market-related suggestion appears only when supported");

const exact = profileRepository.searchAthletes("Caitlin Clark", { leagueId: "wnba" });
check(exact[0].id === "wnba-caitlin-clark", "exact athlete search ranks first");
check(profileRepository.searchAthletes("Cait", { leagueId: "wnba" })[0].id === "wnba-caitlin-clark", "prefix athlete search works");
check(profileRepository.searchAthletes("Stewie", { leagueId: "wnba" })[0].id === "wnba-breanna-stewart", "alias athlete search works");
check(profileRepository.searchAthletes("Indiana Fever", { leagueId: "wnba" }).some((athlete) => athlete.id === "wnba-caitlin-clark"), "team-based athlete search works");
check(resolveCanonicalEntities("Alex Smith").status === "ambiguous", "ambiguous athlete identity never resolves silently");
check((await profileRepository.getProfile("unknown-player", { delay: 0 })).status === "not-found", "unknown athlete ID returns safe not-found state");

const media = createAthleteMediaViewModel({
  id: "media-test", name: "Media Test",
  media: { illustrationUrl: "one.svg", headshotUrl: "two.jpg", silhouetteUrl: "three.svg", rightsStatus: "test", approvedForCommercialUse: false },
});
check(media.candidates.map((candidate) => candidate.type).join(",") === "illustration,headshot,silhouette", "media fallback order is illustration, headshot, silhouette");
check(media.fallbackInitials === "MT", "initials are the final media fallback");
check(media.approvedForCommercialUse === false, "media rights are never implied");

const syntheticRows = [
  { row_id: "a", event_id: "a", event_date: "2026-01-03", home_away: "home", stats: { "basketball-points": 20 } },
  { row_id: "b", event_id: "b", event_date: "2026-01-02", home_away: "away", stats: { "basketball-points": 20 } },
  { row_id: "c", event_id: "c", event_date: "2026-01-01", home_away: "home", stats: { "basketball-points": 10 } },
];
const syntheticInsights = createInsightCandidates(CANONICAL_ENTITIES[0], syntheticRows, "basketball-points", { source: "test" });
check(syntheticInsights.some((insight) => insight.ruleId === "threshold-streak"), "threshold streak insight is deterministic");

if (frame.contentDocument.readyState !== "complete") {
  await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
}
await wait(700);
let app = frame.contentDocument;
let view = frame.contentWindow;
check(app.body.classList.contains("profile-active"), "valid profile URL restores routed profile");
check(app.querySelector("#athleteProfileTitle")?.textContent === "Caitlin Clark", "profile header renders canonical athlete");
check(app.querySelectorAll(".profile-tabs [role='tab']").length === 7, "available basketball profile tabs render");
check(app.querySelector(".profile-tabs [aria-selected='true']")?.dataset.profileTab === "overview", "overview tab exposes selected state");
check(app.querySelector(".profile-tab-panel")?.getAttribute("role") === "tabpanel", "profile tab panel has accessible semantics");
check(app.querySelector(".profile-tabs [aria-selected='true']")?.getAttribute("aria-controls") === "athleteProfileTabPanel"
  && app.querySelector("#athleteProfileTabPanel")?.getAttribute("aria-labelledby") === "profile-tab-overview",
"profile tabs and tab panel have reciprocal accessible relationships");
check(app.querySelector(".profile-media img")?.complete && app.querySelector(".profile-media img")?.naturalWidth > 0, "profile media does not render a broken image");
const mediaAttribution = app.querySelector(".profile-media-wrap small");
const profileHeader = app.querySelector(".athlete-profile-header");
check(mediaAttribution && profileHeader
  && mediaAttribution.getBoundingClientRect().left >= profileHeader.getBoundingClientRect().left
  && mediaAttribution.getBoundingClientRect().right <= profileHeader.getBoundingClientRect().right,
"mobile media attribution remains inside the profile header");
check(app.querySelector(".profile-freshness")?.textContent.includes("not live data"), "profile visibly labels sample freshness");
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, "390px profile has no document overflow");
app.querySelector('[data-theme-option="light"]').click();
check(app.body.dataset.theme === "light" && app.querySelector("#athleteProfileTitle"), "light theme supports profiles");
app.querySelector('[data-theme-option="dark"]').click();

app.querySelector('[data-profile-tab="game-logs"]').click();
check(new URL(view.location.href).searchParams.get("tab") === "game-logs", "tab click updates deep-link URL");
check(app.querySelector(".profile-log-table caption") && app.querySelectorAll(".profile-log-table th[scope='col']").length > 3, "profile log table is accessible");
app.querySelector('[data-profile-filter="log-window"]').value = "5";
app.querySelector('[data-profile-filter="log-window"]').dispatchEvent(new Event("change", { bubbles: true }));
await wait(150);
check(app.querySelectorAll(".profile-log-table tbody tr").length === 5, "live Last-5 profile filter works");
const initialStatColumnCount = app.querySelectorAll(".profile-log-table thead th").length;
const firstColumnToggle = app.querySelector("[data-profile-column]");
firstColumnToggle.checked = false;
firstColumnToggle.dispatchEvent(new Event("change", { bubbles: true }));
check(app.querySelectorAll(".profile-log-table thead th").length === initialStatColumnCount - 1, "game-log stat columns are selectable");
app.querySelector('[data-profile-filter="home-away"]').value = "home";
app.querySelector('[data-profile-filter="home-away"]').dispatchEvent(new Event("change", { bubbles: true }));
await wait(150);
check([...app.querySelectorAll(".profile-log-table tbody tr")].every((row) => row.textContent.includes("WNBA sample event")), "live home filter retains valid sport rows");
app.querySelector('[data-profile-filter="result"]').value = "win";
app.querySelector('[data-profile-filter="result"]').dispatchEvent(new Event("change", { bubbles: true }));
await wait(150);
const winRows = [...app.querySelectorAll(".profile-log-table tbody tr")];
check(winRows.length > 0 && winRows.every((row) => row.textContent.includes("win")), "live result filter works");

app.querySelector('[data-profile-tab="trends"]').click();
check(app.querySelector(".profile-trend-chart [role='img'], .profile-trend-chart[role='img']"), "trend chart exposes an accessible image role");
check(app.querySelector(".profile-trend-chart .chart-rolling"), "trend chart renders the rolling-average series");
check(app.querySelector(".profile-trend-figure figcaption")?.textContent.includes("Source"), "chart displays source and sample summary");
const thresholdInput = app.querySelector('[data-profile-filter="trend-threshold"]');
thresholdInput.value = "20";
thresholdInput.dispatchEvent(new Event("change", { bubbles: true }));
check(app.querySelector(".profile-trend-chart .chart-threshold"), "custom threshold renders without changing source values");
const activeTrendTab = app.querySelector('[data-profile-tab="trends"]');
activeTrendTab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
check(app.querySelector('[data-profile-tab="props"]').getAttribute("aria-selected") === "true", "profile tabs support arrow-key navigation");
check(app.querySelector(".profile-empty")?.textContent.includes("No current market available"), "no-market profile state is explicit");

view.history.back();
await wait(120);
check(new URL(view.location.href).searchParams.get("tab") === "trends"
  && app.querySelector('[data-profile-tab="trends"]')?.getAttribute("aria-selected") === "true",
"browser back restores the prior profile tab");
view.history.forward();
await wait(120);
check(new URL(view.location.href).searchParams.get("tab") === "props"
  && app.querySelector('[data-profile-tab="props"]')?.getAttribute("aria-selected") === "true",
"browser forward restores the next profile tab");

const preservedMode = app.querySelector('[data-research-mode="stats"]').getAttribute("aria-checked");
const preservedQuery = app.querySelector("#queryInput").value;
app.querySelector("#closeAthleteProfile").click();
await wait(150);
check(!app.body.classList.contains("profile-active"), "back control restores research view");
check(app.querySelector('[data-research-mode="stats"]').getAttribute("aria-checked") === preservedMode, "profile preserves canonical research mode");
check(app.querySelector("#queryInput").value === preservedQuery, "profile preserves typed query text");

const directRouteFrame = document.createElement("iframe");
directRouteFrame.src = "/?mode=both&q=keep%20this&scope=league%3Anba&player=nba-tyrese-maxey&tab=game-logs";
directRouteFrame.style.display = "none";
document.body.append(directRouteFrame);
await new Promise((resolve) => directRouteFrame.addEventListener("load", resolve, { once: true }));
await wait(150);
check(directRouteFrame.contentDocument.querySelector('[data-profile-tab="game-logs"]')?.getAttribute("aria-selected") === "true",
"refresh-safe deep link restores its requested available tab");
check(directRouteFrame.contentDocument.querySelector("#queryInput")?.value === "keep this"
  && directRouteFrame.contentDocument.querySelector('[data-research-mode="both"]')?.getAttribute("aria-checked") === "true",
"deep-linked profile preserves query text and canonical research mode");
directRouteFrame.remove();

const invalidRouteFrame = document.createElement("iframe");
invalidRouteFrame.src = "/?player=not-a-canonical-athlete&tab=overview";
invalidRouteFrame.style.display = "none";
document.body.append(invalidRouteFrame);
await new Promise((resolve) => invalidRouteFrame.addEventListener("load", resolve, { once: true }));
await wait(150);
check(!invalidRouteFrame.contentDocument.querySelector("#athleteProfileNotFound")?.hidden
  && !invalidRouteFrame.contentDocument.querySelector("#athleteProfileTitle"),
"invalid canonical athlete ID renders a safe not-found profile");
invalidRouteFrame.remove();

const submitStats = async (query) => {
  const researchInput = app.querySelector("#queryInput");
  researchInput.value = query;
  researchInput.dispatchEvent(new Event("input", { bubbles: true }));
  app.querySelector("#queryForm").requestSubmit();
  await wait(220);
};
await submitStats("Show Caitlin Clark points");
app.querySelector("#statsResultContent [data-open-athlete='wnba-caitlin-clark']").click();
await wait(100);
check(app.body.classList.contains("profile-active"), "profile opens from an instant stat answer");
app.querySelector("#closeAthleteProfile").click();
await submitStats("Who leads the WNBA in assists?");
app.querySelector("#statsResultContent [data-open-athlete]").click();
await wait(100);
check(app.body.classList.contains("profile-active"), "profile opens from a leaderboard");
app.querySelector("#closeAthleteProfile").click();
await submitStats("Compare A'ja Wilson and Breanna Stewart over their last 5 games");
app.querySelector("#statsResultContent [data-open-athlete]").click();
await wait(100);
check(app.body.classList.contains("profile-active"), "profile opens from a comparison");
app.querySelector("#closeAthleteProfile").click();

app.querySelector('[data-research-mode="betting"]').click();
app.querySelector('[data-nav-view="more"]').click();
await wait(50);
app.querySelector('#discoveryContent [data-league="nba"]').click();
await wait(100);
const bettingProfileLink = app.querySelector('#betGrid [data-open-athlete="nba-tyrese-maxey"]');
check(Boolean(bettingProfileLink), "canonical athlete profile link renders on a betting card");
bettingProfileLink?.click();
await wait(100);
check(app.querySelector("#athleteProfileTitle")?.textContent === "Tyrese Maxey", "profile opens from a betting card");
app.querySelector("#closeAthleteProfile").click();
check(new URL(view.location.href).searchParams.get("scope") === "league:nba", "profile navigation preserves selected league context");

const input = app.querySelector("#queryInput");
input.value = "Caitlin";
input.dispatchEvent(new Event("input", { bubbles: true }));
await wait(40);
check(app.querySelectorAll("#athleteSearchResults [role='option']").length > 0, "autocomplete displays athlete suggestions");
input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
check(app.querySelector("#athleteSearchResults [aria-selected='true']"), "autocomplete supports keyboard highlighting");
input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await wait(120);
check(app.body.classList.contains("profile-active") && app.querySelector("#athleteProfileTitle")?.textContent === "Caitlin Clark", "keyboard autocomplete opens canonical profile");

check(window.testErrors.length === 0, `no application errors were captured${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} athlete profile checks)\n${checks.join("\n")}`;
document.querySelectorAll("iframe").forEach((testFrame) => testFrame.remove());
window.scrollTo(0, 0);
