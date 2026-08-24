import {
  createHomeCommandCenterModel,
  isHomeStoryEligible,
  isSyntheticFixturePersonId,
} from "../src/services/home-command-center-service.js";

const output = document.querySelector("#results");
const frame = document.querySelector("#app");
const checks = [];
const failures = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition, label) => { checks.push(label); if (!condition) failures.push(label); };
const waitFor = async (predicate, timeout = 7000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (predicate()) return true; await wait(40); }
  return false;
};

const fixturePersonStory = Object.freeze({ id: "fixture-person", primaryEntity: Object.freeze({ id: "boxing-sample-boxer-a", entityType: "competitor" }) });
const realAthleteStory = Object.freeze({ id: "real-athlete", primaryEntity: Object.freeze({ id: "boxing-canelo-alvarez", entityType: "competitor" }) });
const teamStory = Object.freeze({ id: "fixture-team", primaryEntity: Object.freeze({ id: "sample-team", entityType: "team" }) });
const boundaryModel = createHomeCommandCenterModel({
  storyViews: [fixturePersonStory, realAthleteStory, teamStory],
  eventEntries: [
    { league: { leagueId: "atp" }, event: { id: "synthetic-match", startsAt: "2026-08-01T12:00:00.000Z", status: "scheduled", participants: [{ id: "sample-player-a", role: "competitor" }] } },
    { league: { leagueId: "mls" }, event: { id: "team-match", startsAt: "2026-08-01T13:00:00.000Z", status: "scheduled", participants: [{ id: "MIA", role: "team" }] } },
  ],
  marketRecords: [
    { id: "synthetic-market", valid: true, leagueId: "boxing", fighterId: "boxing-sample-boxer-a" },
    { id: "team-market", valid: true, leagueId: "mls", teamId: "MIA" },
  ],
});
check(isSyntheticFixturePersonId("boxing-sample-boxer-a") && !isSyntheticFixturePersonId("boxing-canelo-alvarez"), "Home eligibility uses canonical fixture-person ID conventions rather than display names");
check(!isHomeStoryEligible(fixturePersonStory) && isHomeStoryEligible(realAthleteStory) && isHomeStoryEligible(teamStory), "Home eligibility excludes synthetic people while retaining real athletes and team stories");
check(boundaryModel.topStories.map((story) => story.id).join("|") === "real-athlete|fixture-team", "Home story filtering removes fixture people without remapping their evidence to a real athlete");
check(boundaryModel.schedule.length === 1 && boundaryModel.schedule[0].event.id === "team-match", "Home schedule retains eligible team events while excluding fixture-person matchups");
check(boundaryModel.markets.length === 1 && boundaryModel.markets[0].id === "team-market", "Home markets retain eligible team records while excluding fixture-person selections");
check(boundaryModel.disclosure.includes("fixture") && boundaryModel.disclosure.includes("sample"), "Home sample and fixture disclosure remains intact");

if (frame.contentWindow.location.href === "about:blank" || frame.contentDocument?.readyState !== "complete") {
  await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
}
await waitFor(() => frame.contentDocument?.querySelector("[data-command-center-version]"));
const view = frame.contentWindow;
const app = frame.contentDocument;

const schedule = app.querySelector(".command-scroll-region");
const scheduleItems = [...app.querySelectorAll(".command-schedule-item")];
check(scheduleItems.length >= 5 && new Set(scheduleItems.map((item) => item.dataset.scheduleSport)).size >= 4, "schedule shows several fixture events across at least four sports");
check(app.querySelector(".command-schedule")?.textContent.includes("Sample data") && scheduleItems.every((item) => item.textContent.includes("Fixture sample")), "schedule is explicitly disclosed as fixture sample data");
check(scheduleItems.every((item) => !/Sample (?:Fighter|Boxer|Driver|Golfer|Tennis Player|Player)/i.test(item.textContent)), "schedule excludes synthetic fixture-person matchups while retaining fixture disclosure");
check(schedule?.tabIndex === 0 && view.getComputedStyle(schedule).overflowX === "auto", "schedule is keyboard-focusable and horizontally scrollable");

const feature = app.querySelector("[data-command-feature='story-fixture-ended-streak']");
check(Boolean(feature) && feature.textContent.includes("Aaron Judge"), "Aaron Judge’s supported ended-streak story remains the featured story");
check(feature?.querySelector("[data-illustration-level]")?.dataset.illustrationLevel === "exact" && feature?.querySelector("[data-illustration-registry-id]")?.dataset.illustrationRegistryId === "art-mlb-aaron-judge-portrait", "featured story uses the exact centralized Aaron Judge portrait");
check(feature?.querySelector("[data-view-story]") && feature?.querySelector("[data-open-athlete='mlb-aaron-judge']") && feature?.querySelector("[data-research-story]"), "featured story exposes story, profile, and structured research actions");

const headlines = [...app.querySelectorAll(".command-headlines li")];
const headlineOrder = headlines.map((item) => item.querySelector("strong")?.textContent || "");
const expectedHeadlineOrder = [
  "Stephen Curry produced the highest three-pointers made value in the available dataset",
  "Max Verstappen's top-10 finishes streak reached 4 events",
  "Auston Matthews's points streak reached 3 events",
  "Caitlin Clark's assists streak reached 3 events",
  "Inter Miami's clean sheets streak reached 3 events",
  "AME vs TIG is next on the sample schedule",
  "Toronto Open is next on the sample schedule",
  "CIN vs BAL is next on the sample schedule",
];
check(JSON.stringify(headlineOrder) === JSON.stringify(expectedHeadlineOrder), "Top Headlines fills synthetic-person vacancies in the expected deterministic order");
check(headlines.length >= 6 && headlines.every((item) => item.querySelector("[data-view-story]")), "Top Headlines contains six or more valid EdgeBoard story destinations");
check(new Set(headlines.map((item) => item.querySelector("[data-view-story]")?.dataset.viewStory)).size === headlines.length, "Top Headlines is deterministic and duplicate-free");
check(!/Sample (?:Fighter|Boxer|Driver|Golfer|Tennis Player|Player)/i.test(app.querySelector(".command-headlines")?.textContent || ""), "Top Headlines excludes synthetic fixture-person identities");
check(!/ESPN|The Athletic|NFL\.com|NBC Sports/i.test(app.querySelector(".command-headlines")?.textContent || ""), "Top Headlines does not fabricate external publishers");

const stories = [...app.querySelectorAll(".command-story-card")];
const storySports = new Set(stories.map((story) => story.dataset.sportId));
check(stories.length === 6 && storySports.size >= 4, "Top Stories & Insights shows six cards across at least four sports");
check(stories.filter((story) => story.querySelector("[data-illustration-level='exact']")).length >= 5, "Top Stories & Insights resolves exact athlete artwork across the dense card row");
check(stories.some((story) => story.querySelector("[data-illustration-level]:not([data-illustration-level='exact'])")?.querySelector("img, [role='img']")), "Top Stories & Insights retains a rendered centralized fallback for an entity without exact art");
check(stories.every((story) => story.querySelector(".command-card-metric") && story.querySelector("[data-view-story]")), "story cards retain deterministic metric context and actions");
check(!/Sample (?:Fighter|Boxer|Driver|Golfer|Tennis Player|Player)/i.test(app.querySelector(".command-stories")?.textContent || ""), "Top Stories & Insights excludes synthetic fixture-person identities");

const markets = [...app.querySelectorAll(".command-market-card")];
check(markets.length >= 4 && markets.every((market) => market.textContent.includes("Sample market")), "Edge Markets shows multiple clearly labeled fixture-market cards");
check(markets.every((market) => !/Sample (?:Fighter|Boxer|Driver|Golfer|Tennis Player|Player)/i.test(market.textContent)), "Edge Markets excludes synthetic fixture-person selections");
check(app.querySelector(".command-markets")?.textContent.includes("not betting advice") && app.querySelector(".command-markets a[href='/markets/screener']"), "market strip avoids live/advice claims and links to Market Screener");

for (const label of ["Player Profile", "Compare Players", "Edge Research", "Market Screener", "Knowledge Graph"]) {
  check(app.querySelector(".command-quick")?.textContent.includes(label), `Quick Research includes ${label}`);
}
check(app.querySelector(".command-quick [data-open-athlete]") && app.querySelector(".command-quick a[href='/markets/screener']") && app.querySelectorAll(".command-quick [data-home-query]").length === 3, "Quick Research launchers retain valid profile, route, and structured-query destinations");
check(app.querySelectorAll(".command-intelligence article").length === 3 && app.querySelector(".command-intelligence")?.textContent.includes("Evidence-backed") && app.querySelector(".command-intelligence")?.textContent.includes("Transparent"), "EdgeBoard Intelligence summarizes the three approved value pillars");

for (const [width, label] of [[1280, "desktop"], [768, "tablet"], [390, "mobile"]]) {
  frame.style.width = `${width}px`;
  await wait(100);
  check(app.documentElement.scrollWidth <= app.documentElement.clientWidth + 1, `${label} Home has no document overflow`);
  check(app.querySelector(".home-command-center")?.getBoundingClientRect().right <= width + 1, `${label} command center stays inside the viewport`);
}

app.querySelector('[data-theme-option="light"]')?.click();
const lightBackground = view.getComputedStyle(app.body).backgroundColor;
check(app.body.dataset.theme === "light", "light theme renders the Home command center");
app.querySelector('[data-theme-option="dark"]')?.click();
check(app.body.dataset.theme === "dark" && view.getComputedStyle(app.body).backgroundColor !== lightBackground, "dark theme remains distinct");

const featureImage = feature?.querySelector("img");
if (featureImage && (!featureImage.complete || !featureImage.naturalWidth)) await Promise.race([featureImage.decode().catch(() => undefined), wait(3000)]);
check(featureImage?.complete && featureImage?.naturalWidth > 0, "featured artwork loads without a broken image");
check(app.querySelectorAll(".home-command-center button:not([type])").length === 0, "command-center buttons retain explicit semantics");

app.querySelector('#sportTabs [data-nav-view="for-you"]').click();
await waitFor(() => app.querySelector("#todayPulse")?.dataset.scope === "system:for-you");
const forYouStories = [...app.querySelectorAll("#todayPulseGrid .home-discovery-card")];
check(forYouStories.length > 1, `For You renders multiple real-entity stories (found ${forYouStories.length})`);
check(forYouStories.every((card) => !card.textContent.includes("Sample Boxer A")), "For You excludes synthetic fixture-person stories");
check(forYouStories.filter((card) => card.querySelector("[data-open-athlete], [data-open-entity]")).length > 1, "For You includes multiple stories linked to canonical real-entity profiles");
check(window.testErrors.length === 0, `no application console errors${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

output.dataset.status = failures.length ? "failed" : "passed";
output.textContent = failures.length ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}` : `PASS (${checks.length} checks)\n${checks.join("\n")}`;
frame.remove();
