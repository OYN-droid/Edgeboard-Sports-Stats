import { ENTITY_TYPES } from "../src/config/entity-types.js";
import { UNIFIED_CANONICAL_ENTITIES } from "../src/data/canonical-sports-entities.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { createEntityProfileRepository } from "../src/services/entity-profile-service.js";
import { createEntityRegistry } from "../src/services/entity-registry-service.js";
import { createInsightService } from "../src/services/insight-service.js";
import { buildResearchAnswer } from "../src/services/research-answer-service.js";
import { createResearchPlan } from "../src/services/research-planner-service.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { createStatsRepository } from "../src/services/stats-provider.js";

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

const registry = createEntityRegistry();
const sports = createSportsRepository(mockProviderPayload);
const stats = createStatsRepository();
const insights = createInsightService(stats, sports);
const profiles = createEntityProfileRepository(registry, sports, stats, insights, { delayMs: 5 });

const requiredFields = [
  "id", "type", "sport", "league", "displayName", "aliases", "providerIds", "activeStatus",
  "media", "relatedEntityIds", "metadata", "statistics", "historicalData", "insights", "links",
];
check(new Set(UNIFIED_CANONICAL_ENTITIES.map((entity) => entity.id)).size === UNIFIED_CANONICAL_ENTITIES.length,
  "1 canonical IDs are unique");
check(UNIFIED_CANONICAL_ENTITIES.every((entity) => requiredFields.every((field) => field in entity)),
  "2 every entity exposes the unified identity contract");
check(Object.values(ENTITY_TYPES).every((type) => registry.getEntities({ type }).length > 0),
  "3 every configured entity type has a canonical sample");

[
  ["Lakers", "LAL", "team"],
  ["Ferrari", "constructor-ferrari", "constructor"],
  ["Dana White", "manager-dana-white", "manager"],
  ["Madison Square Garden", "venue-madison-square-garden", "venue"],
  ["UFC", "promotion-ufc", "promotion"],
].forEach(([query, id, type], index) => {
  const match = registry.search(query)[0];
  check(match?.id === id && match.type === type, `${index + 4} ${query} resolves to its canonical ${type}`);
});
check(registry.search("Ferrari").some((item) => item.type === "manufacturer"),
  "9 ambiguous same-brand identities remain separately typed");
check(registry.search("Sample Fighter")[0]?.profileSystem === "athlete",
  "10 fighters reuse the athlete profile system");
check(registry.search("Max Verstappen")[0]?.profileSystem === "athlete",
  "11 drivers reuse the athlete profile system");

const profileCases = [
  ["LAL", "team"],
  ["promotion-ufc", "promotion"],
  ["constructor-ferrari", "constructor"],
  ["league-nba", "league"],
  ["competition-world-cup", "competition"],
  ["venue-madison-square-garden", "venue"],
  ["golf-sample-golfer", "golfer"],
  ["tennis-sample-player", "tennis-player"],
  ["manager-dana-white", "manager"],
  ["national-team-usa-basketball", "national-team"],
];
for (const [id, type] of profileCases) {
  const result = await profiles.getProfile(id);
  check(result.status === "ready" && result.entity.type === type, `${id} loads a typed profile`);
  check(result.dataStatus.sample && result.dataStatus.partial, `${id} discloses partial sample coverage`);
}
check((await profiles.getProfile("missing-entity")).status === "not-found",
  "32 invalid entity IDs fail safely");

const firstCached = await profiles.getProfile("constructor-ferrari");
const callsBeforeCache = profiles.getDiagnostics().providerCalls;
const secondCached = await profiles.getProfile("constructor-ferrari");
check(firstCached === secondCached && profiles.getDiagnostics().providerCalls === callsBeforeCache,
  "33 cached profiles avoid duplicate provider calls");
const abortController = new AbortController();
const cancelled = profiles.getProfile("competition-olympics", { force: true, signal: abortController.signal })
  .then(() => false).catch((error) => error.name === "AbortError");
abortController.abort();
check(await cancelled, "34 stale profile requests are cancellable");

const driver = registry.getEntity("f1-max-verstappen");
check(driver.relatedEntityIds.includes("RBR")
  && registry.getEntity("RBR").relatedEntityIds.includes(driver.id),
  "35 driver and constructor links are reciprocal");
check(registry.getRelatedEntities("promotion-ufc").some((entity) => entity.type === "fighter"),
  "36 promotions expose linked fighters");
check(registry.getRelatedEntities("constructor-ferrari").some((entity) => entity.type === "manufacturer"),
  "37 constructors expose linked manufacturers");
check(registry.getRelatedEntities("competition-world-cup").some((entity) => entity.type === "organization"),
  "38 competitions expose linked organizations");

const resolvedEntities = registry.search("Tell me about Ferrari");
const entityPlan = createResearchPlan({
  query: "Tell me about Ferrari",
  mode: "stats",
  currentLeague: sports.getLeague("f1"),
  resolvedEntities,
});
const entityAnswer = buildResearchAnswer({
  query: "Tell me about Ferrari",
  mode: "stats",
  plan: entityPlan,
  statsProvider: stats,
});
check(entityPlan.entityIds.includes("constructor-ferrari"), "39 research planning retains canonical entity IDs");
check(entityAnswer.evidence.some((item) => item.type === "canonical-entity"),
  "40 the research assistant exposes canonical identity evidence");
check(entityAnswer.relatedQuestions.some((item) => item.type === "entity-profile"),
  "41 the research assistant links generic entity profiles");
check(!/\bguarantee|win probability\b/i.test(entityAnswer.summary),
  "42 entity answers do not introduce betting certainty");

await new Promise((resolve) => {
  if (frame.contentDocument?.readyState === "complete") resolve();
  else frame.addEventListener("load", resolve, { once: true });
});
await wait(250);
const app = frame.contentDocument;
const appWindow = frame.contentWindow;
const query = app.querySelector("#queryInput");
query.value = "Ferrari";
query.dispatchEvent(new Event("input", { bubbles: true }));
await wait(30);
const suggestions = [...app.querySelectorAll("#athleteSearchResults [role=option]")];
check(suggestions.some((item) => item.textContent.includes("Constructor")),
  "43 autocomplete displays entity type");
check(suggestions.every((item) => item.querySelector("small")?.textContent.trim()),
  "44 autocomplete displays entity context");
query.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
check(query.getAttribute("aria-activedescendant") === "athlete-search-option-0",
  "45 keyboard navigation exposes the active autocomplete option");
query.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await wait(180);
check(app.body.classList.contains("entity-profile-active")
  && app.querySelector("#entityProfileTitle")?.textContent === "Ferrari",
  "46 keyboard selection opens the canonical entity profile");
check(app.querySelector("#entityProfileContent")?.textContent.includes("Sample data"),
  "47 profile UI labels mock data");
check(app.querySelectorAll("#entityProfileContent [data-open-entity], #entityProfileContent [data-open-athlete]").length > 0,
  "48 rendered relationship links are actionable");
check(app.querySelector("#closeEntityProfile")?.tagName === "BUTTON"
  && app.querySelector("#followEntity")?.hasAttribute("aria-pressed"),
  "49 profile controls use accessible button state");
app.querySelector("#entityProfileSlipToggle")?.click();
check(!app.querySelector("#entityProfileSlipPanel")?.hidden
  && app.querySelector("#entityProfileSlipToggle")?.getAttribute("aria-expanded") === "true",
  "50 generic profiles keep the shared bet slip accessible");
app.querySelector("#closeEntityProfileSlip")?.click();
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth,
  "51 mobile entity profile has no horizontal overflow");
appWindow.history.back();
await wait(180);
check(!app.body.classList.contains("entity-profile-active"),
  "52 browser back restores the research surface");
appWindow.history.forward();
await wait(180);
check(app.body.classList.contains("entity-profile-active"),
  "53 browser forward restores the entity route");
const refreshComplete = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
appWindow.location.reload();
await refreshComplete;
await wait(180);
const refreshedApp = frame.contentDocument;
check(refreshedApp.body.classList.contains("entity-profile-active")
  && refreshedApp.querySelector("#entityProfileTitle")?.textContent === "Ferrari",
  "54 generic entity routes are refresh-safe");
refreshedApp.querySelector('[data-theme-option="light"]')?.click();
check(refreshedApp.body.dataset.theme === "light", "55 light mode works on entity profiles");
refreshedApp.querySelector('[data-theme-option="dark"]')?.click();
check(refreshedApp.body.dataset.theme === "dark", "56 dark mode works on entity profiles");
check(window.testErrors.length === 0, "57 no browser errors or unhandled rejections occurred");

results.textContent = failures.length
  ? `FAIL ${failures.length}/${checks.length}\n${failures.join("\n")}\n\n${window.testErrors.join("\n")}`
  : `PASS ${checks.length}/${checks.length}`;
