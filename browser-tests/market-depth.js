import { MARKET_CATALOG, getConfidenceBand } from "../src/config/market-catalog.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { getFilteredPicks, parseResearchQuery } from "../src/services/research-service.js";

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
const app = frame.contentDocument;
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

results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} checks · ${MARKET_CATALOG.length} canonical markets)\n${checks.join("\n")}`;
