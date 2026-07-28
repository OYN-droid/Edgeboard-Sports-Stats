import { MARKET_CATALOG, getConfidenceBand } from "../src/config/market-catalog.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { getFilteredPicks, parseResearchQuery } from "../src/services/research-service.js";
import {
  createNavigationModel,
  getVisibleMarketSummaries,
  normalizeNavigationSelection,
} from "../src/services/navigation-service.js";

const results = document.querySelector("#results");
const failures = [];
const checks = [];
const check = (condition, label) => {
  checks.push(label);
  if (!condition) failures.push(label);
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const requiredFields = [
  "id", "canonicalType", "displayName", "shortName", "category", "browseGroup", "sportIds",
  "leagueIds", "eventTypes", "participantType", "period", "sideOptions", "lineType",
  "settlementScope", "supportsLive", "supportsAlternateLines", "supportsSameGame",
  "supportsOverUnder", "supportsYesNo", "supportsThreeWay", "supportsSameGameParlay",
  "correlationGroup", "providerAliases", "searchTerms", "displayOrder", "enabled",
  "dataRequirements", "description",
];
check(MARKET_CATALOG.length >= 150, "catalog contains broad multi-sport depth");
check(new Set(MARKET_CATALOG.map((market) => market.id)).size === MARKET_CATALOG.length, "canonical market IDs are unique");
check(MARKET_CATALOG.every((market) => requiredFields.every((field) => Object.hasOwn(market, field))), "every catalog entry has the normalized definition shape");
check(getConfidenceBand(0).label === "Limited" && getConfidenceBand(49).label === "Developing", "confidence bands cover low values");
check(getConfidenceBand(85).label === "Very strong" && getConfidenceBand(100).label === "Very strong", "confidence bands cover high values");
const byId = new Map(MARKET_CATALOG.map((market) => [market.id, market]));
check(byId.get("basketball-points").supportsOverUnder, "over/under market capability is explicit");
check(byId.get("football-overtime-yes-no").supportsYesNo, "yes/no market capability is explicit");
check(byId.get("soccer-three-way-moneyline").supportsThreeWay, "three-way moneyline capability is explicit");
check(byId.has("mma-method-of-victory") && byId.has("boxing-exact-round"), "method-of-victory and exact-round markets are cataloged");
check(byId.get("basketball-alternate-spread").supportsAlternateLines, "alternate-line capability is explicit");
check(byId.get("basketball-first-quarter-total").period === "period-specific", "period scope is explicit");
check(byId.get("hockey-regulation-three-way-moneyline").settlementScope === "regulation-only", "regulation settlement differs from overtime-inclusive markets");
check(!MARKET_CATALOG.some((market) => market.id === "boxing-win-by-submission"), "impossible boxing submission markets are excluded");
check(byId.get("motorsport-stage-winner").leagueIds.every((id) => id.startsWith("nascar")), "NASCAR stage markets are series-restricted");

const repository = createSportsRepository(mockProviderPayload);
const navigation = createNavigationModel(repository.getLeagues());
const navigationEvents = navigation.allLeagues.flatMap((league) => repository.getEvents(league.leagueId));
const navigationMarkets = navigation.allLeagues.flatMap((league) => repository.getMarkets(league.leagueId));
const scopedSummary = (selection, scopedLeagues = navigation.allLeagues) => getVisibleMarketSummaries({
  selection,
  leagues: scopedLeagues,
  events: navigationEvents,
  markets: navigationMarkets,
  currentDate: new Date("2026-07-28T16:00:00"),
});
[
  ["wnba", "wnba"],
  ["mlb", "mlb"],
  ["ufc", "ufc"],
  ["boxing", "boxing"],
  ["f1", "f1"],
].forEach(([id, expected]) => {
  const summary = scopedSummary({ type: "league", id });
  check(summary.visibleLeagues.length === 1 && summary.visibleLeagues[0].leagueId === expected, `${id} league scope excludes unrelated leagues`);
});
const soccerSummary = scopedSummary({ type: "sport", id: "soccer" });
check(soccerSummary.visibleLeagues.length > 1 && soccerSummary.visibleLeagues.every((league) => league.sportId === "soccer"), "soccer scope contains only soccer leagues");
const motorsportSummary = scopedSummary({ type: "sport", id: "motorsport" });
check(motorsportSummary.visibleLeagues.length > 1 && motorsportSummary.visibleLeagues.every((league) => league.sportId === "motorsport"), "motorsports scope contains only motorsports series");
const combatSummary = scopedSummary({ type: "category", id: "combat-sports" });
check(combatSummary.visibleLeagues.every((league) => ["mma", "boxing", "combat", "kickboxing"].includes(league.sportId)), "combat category contains only combat promotions");
const liveSummary = scopedSummary({ type: "system", id: "live" });
check(liveSummary.visibleLeagues.length > 0 && liveSummary.visibleLeagues.every((league) => league.liveEventCount > 0), "live scope contains only live leagues");
const noLiveSummary = scopedSummary({ type: "system", id: "live" }, navigation.allLeagues.map((league) => ({ ...league, liveEventCount: 0 })));
check(noLiveSummary.visibleLeagues.length === 0 && noLiveSummary.emptyStateReason.includes("No supported events are live"), "empty live scope never substitutes upcoming leagues");
const todaySummary = scopedSummary({ type: "system", id: "today" });
check(todaySummary.visibleLeagues.length > 0 && todaySummary.visibleLeagues.every((league) => league.liveEventCount > 0 || league.todayEventCount > 0), "today scope excludes offseason-only leagues");
const localDateLeague = {
  ...repository.getLeague("nfl"),
  leagueId: "local-date-test",
  liveEventCount: 0,
  todayEventCount: 0,
  upcomingEventCount: 1,
};
const localCurrentDate = new Date(2026, 6, 28, 12);
const localTodaySummary = getVisibleMarketSummaries({
  selection: { type: "system", id: "today" },
  leagues: [localDateLeague],
  events: [{ leagueId: "local-date-test", startsAt: new Date(2026, 6, 28, 23, 30).toISOString() }],
  currentDate: localCurrentDate,
});
const localTomorrowSummary = getVisibleMarketSummaries({
  selection: { type: "system", id: "today" },
  leagues: [localDateLeague],
  events: [{ leagueId: "local-date-test", startsAt: new Date(2026, 6, 29, 0, 30).toISOString() }],
  currentDate: localCurrentDate,
});
check(localTodaySummary.visibleLeagues.length === 1, "today scope includes events by local calendar date");
check(localTomorrowSummary.visibleLeagues.length === 0, "today scope excludes events after local midnight");
const allSummary = scopedSummary({ type: "system", id: "all" });
check(new Set(allSummary.visibleLeagues.map((league) => league.sportId)).size > 2, "all-sports scope mixes eligible sports");
check(allSummary.availableMarketCount === allSummary.visibleLeagues.reduce((sum, league) => sum + league.availableMarketCount, 0), "summary counts match filtered leagues");
const emptyLeague = { ...repository.getLeague("wnba"), todayEventCount: 0, liveEventCount: 0, upcomingEventCount: 1 };
const emptySummary = scopedSummary({ type: "league", id: "wnba" }, [emptyLeague]);
check(emptySummary.visibleLeagues[0].leagueId === "wnba" && emptySummary.emptyStateReason.includes("No WNBA events"), "empty league scope never falls back to unrelated sports");
check(normalizeNavigationSelection({ type: "league", id: "invalid" }, navigation.allLeagues, "mlb").id === "mlb", "invalid saved selection falls back safely");
check(repository.getMarkets("mls").find((market) => market.canonicalMarketId === "soccer-three-way-moneyline").selections.length === 3, "markets can contain more than two outcomes");
check(repository.getMarkets("ufc").find((market) => market.canonicalMarketId === "mma-fight-winner").selections[0].numericLine === null, "markets without numeric lines normalize safely");
check(repository.getMarkets("nba").some((market) => market.status === "suspended" && !market.available), "suspended markets remain distinct from open markets");
const stalePayload = structuredClone(mockProviderPayload);
stalePayload.offers[0].selections[0].last_updated_at = "2020-01-01T00:00:00Z";
check(createSportsRepository(stalePayload).getMarkets("nba")[0].selections[0].stale, "stale market timestamps are flagged");
check(byId.get("mma-fight-goes-distance").correlationGroup === "fight-distance", "correlation metadata is cataloged");
const counts = [0, 25, 49, 50, 100].map((minConfidence) =>
  getFilteredPicks(repository, { leagueId: "nba", market: "props", minConfidence, availableOnly: true, query: "", queryGame: "" }).length);
check(counts[0] === counts[1] && counts[2] >= counts[3] && counts[4] === 0, "confidence thresholds 0, 25, 49, 50, and 100 filter deterministically");
const parsed = parseResearchQuery("NBA three pointers confidence at least 42", repository, "mlb", "props");
check(parsed.leagueId === "nba" && parsed.canonicalMarketId === "basketball-three-pointers-made", "query parser resolves league and canonical market");
check(parsed.constraints.minimumConfidence === 42, "query parser accepts confidence below 50");
const queryCases = [
  ["WNBA players over 5.5 assists with at least 42% confidence", "basketball-assists", "nba"],
  ["NFL quarterbacks over their passing touchdown line", "football-passing-touchdowns", "nba"],
  ["NHL players with strong shots-on-goal trends", "hockey-shots-on-goal", "nba"],
  ["soccer players over 1.5 shots on target", "soccer-shots-on-target", "nba"],
  ["matches with high projected corner totals", "soccer-corners-total", "mls"],
  ["UFC fighters with a knockout or submission angle", "mma-knockout-or-submission", "nba"],
  ["fights projected to end before 2.5 rounds", "mma-round-total", "ufc"],
  ["all available MLB pitcher strikeout props", "baseball-pitcher-strikeouts", "nba"],
];
queryCases.forEach(([query, expected, currentLeague]) => {
  const actual = parseResearchQuery(query, repository, currentLeague, "props").canonicalMarketId;
  check(actual === expected, `query parser recognizes ${expected}${actual === expected ? "" : ` (got ${actual})`}`);
});
const multiMarketQuery = parseResearchQuery("Formula 1 top-10 and podium markets", repository, "f1", "props");
check(multiMarketQuery.canonicalMarketId && multiMarketQuery.interpretationNote, "multi-market query exposes an editable interpretation");
const unsupported = parseResearchQuery("NFL interceptions thrown", repository, "nfl", "props");
check(unsupported.canonicalMarketId === "football-interceptions-thrown" && unsupported.unsupportedMarket, "recognized unavailable markets are explicit");

const frame = document.querySelector("#app");
await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
await wait(650);
let app = frame.contentDocument;
check(app.querySelector("#confidenceRange").value === "42", "URL confidence initializes the slider");
check(app.querySelector("#confidenceValue").textContent.includes("Developing"), "slider shows its confidence band");
check(app.querySelector("#marketCategoryNav button[role=tab]"), "sport-aware categories use tab semantics");
check(app.querySelectorAll("#marketCatalogList button:not([disabled])").length > 0, "available canonical markets are actionable");
const categoryButton = [...app.querySelectorAll("#marketCategoryNav button")].find((button) => button.textContent.includes("Player Props"));
categoryButton.click();
check(app.querySelector('[data-market-category="Player Props"]').getAttribute("aria-selected") === "true", "market categories switch accessibly");
const marketSearch = app.querySelector("#marketSearch");
marketSearch.value = "pitcher";
marketSearch.dispatchEvent(new Event("input", { bubbles: true }));
check(app.querySelector("#marketCatalogList").textContent.includes("Pitcher strikeouts"), "market search works across available categories");
marketSearch.value = "";
marketSearch.dispatchEvent(new Event("input", { bubbles: true }));

const input = app.querySelector("#queryInput");
input.value = "NBA three pointers confidence at least 42";
app.querySelector("#queryForm").requestSubmit();
await wait(50);
check(app.querySelector("#selectedLeagueContext").textContent.includes("NBA"), "query switches to the requested league");
check(app.querySelectorAll("#betGrid .bet-card").length === 1, "canonical query does not substitute other basketball props");
check(app.querySelector("#betGrid .bet-market").textContent.includes("Three-pointers made"), "canonical market name is visible");
input.value = "WNBA";
app.querySelector("#queryForm").requestSubmit();
input.value = "NBA";
app.querySelector("#queryForm").requestSubmit();
check(app.querySelectorAll("#betGrid .bet-card").length === 1 && app.querySelector("#betGrid").textContent.includes("Three-pointers made"), "canonical selection persists across leagues in the same sport");
app.querySelector("#betGrid [data-add]").click();
check(app.querySelector("#slipList").textContent.includes("Sample Sportsbook"), "bet slip retains source metadata");
check(app.querySelector("#slipList").textContent.includes("Three-pointers made"), "bet slip retains canonical market metadata");

const slider = app.querySelector("#confidenceRange");
slider.focus();
check(app.activeElement === slider && slider.min === "0" && slider.max === "100" && slider.step === "1", "range supports keyboard focus and one-point steps");
slider.value = "100";
slider.dispatchEvent(new Event("input", { bubbles: true }));
check(!app.querySelector("#betGrid .bet-card") && app.querySelector("#answerText").textContent.includes("could not find"), "100% confidence produces a clear empty state");
slider.value = "0";
slider.dispatchEvent(new Event("input", { bubbles: true }));
check(app.querySelector("#confidenceFilterStatus").textContent.includes("all confidence"), "zero disables confidence filtering");
check(new URL(frame.contentWindow.location.href).searchParams.get("confidence") === "0", "confidence persists in URL state");
app.querySelector('[data-theme-option="light"]').click();
check(app.body.dataset.theme === "light", "light theme remains interactive");
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth, "390px viewport has no document-level horizontal overflow");
check([...app.querySelectorAll("[data-add]")].every((button) => button.tagName === "BUTTON"), "add-to-slip actions use button semantics");

const boardLeagueIds = () => [...app.querySelectorAll("#todayMarketGrid [data-market-league]")].map((card) => card.dataset.marketLeague);
const selectTopLeague = async (leagueId) => {
  app.querySelector(`#sportTabs [data-league="${leagueId}"]`).click();
  await wait(20);
};
input.value = "Keep this typed research question";
await selectTopLeague("wnba");
check(boardLeagueIds().length === 1 && boardLeagueIds()[0] === "wnba", "WNBA top navigation shows only WNBA");
check(Number(app.querySelector("#todayMarketGrid").dataset.marketCount) === repository.getLeague("wnba").availableMarketCount, "market-summary counts match the filtered WNBA card");
check(app.querySelector("#todayBoardTitle").textContent === "WNBA Markets", "league selection updates the market-board heading");
check(app.querySelector("#selectedLeagueContext").textContent.includes("WNBA"), "league selection synchronizes the research context");
check(input.value === "Keep this typed research question", "changing navigation scope preserves the typed query");
check(app.activeElement?.dataset.league === "wnba", "focus remains on the selected top-navigation item");
check(app.querySelector("#todayMarketGrid").getAttribute("aria-busy") === "false", "scope changes do not flash unrelated loading cards");
await selectTopLeague("mlb");
check(boardLeagueIds().length === 1 && boardLeagueIds()[0] === "mlb", "MLB top navigation shows only MLB");
app.querySelector('#marketCatalogList [data-canonical-market="baseball-pitcher-strikeouts"]')?.click();
await selectTopLeague("wnba");
check(!app.querySelector('#marketCatalogList [data-canonical-market="baseball-pitcher-strikeouts"].active'), "incompatible canonical market filter resets on a new sport");
await selectTopLeague("ufc");
check(boardLeagueIds().length === 1 && boardLeagueIds()[0] === "ufc" && !app.querySelector("#todayMarketGrid").textContent.includes("Boxing"), "UFC excludes other combat promotions");
await selectTopLeague("boxing");
check(boardLeagueIds().length === 1 && boardLeagueIds()[0] === "boxing" && !app.querySelector("#todayMarketGrid").textContent.includes("UFC"), "Boxing excludes other combat promotions");
await selectTopLeague("f1");
check(boardLeagueIds().length === 1 && boardLeagueIds()[0] === "f1", "Formula 1 excludes other motorsports series");

app.querySelector('#sportTabs [data-sport="soccer"]').click();
await wait(20);
check(boardLeagueIds().length > 0 && boardLeagueIds().every((id) => repository.getLeague(id)?.sportId === "soccer"), "Soccer top navigation shows only soccer leagues");
check(app.querySelector("#todayBoardTitle").textContent === "Soccer Markets" && app.querySelector("#selectedLeagueContext").textContent.includes("Soccer"), "Soccer scope synchronizes heading and research context");
app.querySelector('#sportTabs [data-nav-view="live"]').click();
await wait(20);
check(boardLeagueIds().length > 0 && boardLeagueIds().every((id) => repository.getLeague(id)?.liveEventCount > 0), "Live top navigation shows only live leagues");
check(app.querySelector("#todayBoardTitle").textContent === "Live Markets", "Live scope uses a context-aware heading");
app.querySelector('#sportTabs [data-nav-view="today"]').click();
await wait(20);
check(boardLeagueIds().length > 0 && boardLeagueIds().every((id) => {
  const league = repository.getLeague(id);
  return league?.liveEventCount > 0 || league?.todayEventCount > 0;
}), "Today top navigation excludes offseason-only leagues");
await selectTopLeague("nfl");
check(boardLeagueIds().length === 1 && boardLeagueIds()[0] === "nfl" && app.querySelector(".scope-empty-state")?.textContent.includes("No NFL events"), "a league without events today displays its own upcoming state");

const scopeBeforeMore = app.querySelector("#todayMarketGrid").dataset.scope;
app.querySelector('#sportTabs [data-nav-view="more"]').click();
check(app.querySelector("#todayMarketGrid").dataset.scope === scopeBeforeMore, "opening More preserves the selected scope");
check(app.activeElement === app.querySelector("#closeDiscovery"), "opening More moves focus into the discovery drawer");
check(app.querySelector('#sportTabs [data-nav-view="more"]').getAttribute("aria-expanded") === "true"
  && app.querySelector('#sportTabs [data-nav-view="more"]').getAttribute("aria-controls") === "discoveryDrawer",
  "More exposes its expanded and controlled-region state");
app.querySelector("#closeDiscovery").click();
check(app.querySelector("#todayMarketGrid").dataset.scope === scopeBeforeMore, "closing More without a selection preserves scope");
check(app.activeElement?.dataset.navView === "more", "closing More returns focus to its navigation control");
app.querySelector('#sportTabs [data-nav-view="more"]').click();
app.querySelector('#discoveryContent [data-sport="motorsport"]').click();
await wait(20);
check(boardLeagueIds().length > 0 && boardLeagueIds().every((id) => repository.getLeague(id)?.sportId === "motorsport"), "More can select the broad Motorsports scope");
app.querySelector('#sportTabs [data-nav-view="more"]').click();
app.querySelector('#discoveryContent [data-league="atp"]').click();
await wait(20);
check(boardLeagueIds().length === 1 && boardLeagueIds()[0] === "atp", "selecting a league inside More updates the canonical scope");
app.querySelector("[data-open-discovery='all']").click();
await wait(20);
check(new Set(boardLeagueIds().map((id) => repository.getLeague(id)?.sportId)).size > 1, "Explore All Sports restores cross-sport discovery");
app.querySelector("#closeDiscovery").click();

await selectTopLeague("wnba");
check(JSON.parse(frame.contentWindow.localStorage.getItem("edgeboard-navigation-selection")).id === "wnba", "valid navigation selection is saved");
const reloadComplete = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
frame.contentWindow.location.reload();
await reloadComplete;
await wait(650);
app = frame.contentDocument;
check(app.querySelector("#todayMarketGrid").dataset.scope === "league:wnba" && boardLeagueIds()[0] === "wnba", "page refresh restores a valid saved selection");
frame.contentWindow.localStorage.setItem("edgeboard-navigation-selection", JSON.stringify({ type: "league", id: "not-a-league" }));
const invalidReloadComplete = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
frame.src = "/?confidence=42";
await invalidReloadComplete;
await wait(650);
app = frame.contentDocument;
check(app.querySelector("#todayMarketGrid").dataset.scope !== "league:not-a-league" && boardLeagueIds().length === 1, "invalid saved selection restores a safe, usable league scope");
app.querySelector('#sportTabs [data-nav-view="for-you"]').click();
await wait(20);
check(new Set(boardLeagueIds().map((id) => repository.getLeague(id)?.sportId)).size > 1, "For You restores ranked cross-sport discovery");

const desktopFrame = document.createElement("iframe");
desktopFrame.style.width = "1280px";
desktopFrame.style.height = "900px";
desktopFrame.src = "/?scope=league:wnba&confidence=58";
document.body.append(desktopFrame);
await new Promise((resolve) => desktopFrame.addEventListener("load", resolve, { once: true }));
await wait(650);
const desktopApp = desktopFrame.contentDocument;
check(desktopApp.documentElement.scrollWidth <= desktopApp.documentElement.clientWidth, "1280px desktop viewport has no document-level overflow");
check([...desktopApp.querySelectorAll("#todayMarketGrid [data-market-league]")].every((card) => card.dataset.marketLeague === "wnba"), "desktop navigation scope matches the mobile board");
desktopFrame.remove();

results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} checks · ${MARKET_CATALOG.length} canonical markets)\n${checks.join("\n")}`;
