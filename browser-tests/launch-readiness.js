const results = document.querySelector("#results");
const frame = document.querySelector("#app");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const failures = [];
const check = (condition, label) => {
  checks.push(label);
  if (!condition) failures.push(label);
};

if (frame.contentWindow.location.href === "about:blank" || frame.contentDocument?.readyState !== "complete") {
  await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
}
await wait(1400);
const view = frame.contentWindow;
const app = frame.contentDocument;
check(app.querySelectorAll("#onboardingSteps article").length === 7, "1 onboarding introduces all seven launch concepts");
check([...app.querySelectorAll("#onboardingSteps strong")].map((node) => node.textContent).join("|").includes("Edge Intelligence|Edge Trust|Stories|Discovery|Edge Markets|Historical Explorer|Workspace"), "2 onboarding uses canonical terminology");
app.querySelector("#dismissOnboarding")?.click();
check(app.querySelector("#edgeboardOnboarding")?.hidden && view.localStorage.getItem("edgeboard-onboarding-v1.6-complete") === "true", "3 onboarding dismisses and persists once");

view.document.dispatchEvent(new view.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
await wait(80);
const palette = app.querySelector("#commandPalette");
const input = app.querySelector("#commandPaletteInput");
check(palette?.open && app.activeElement === input, "4 Ctrl+K opens the palette and moves focus to search");
check(app.querySelector("#commandPaletteResults")?.textContent.includes("Explore now") && app.querySelector("#commandPaletteResults")?.textContent.includes("Commands"), "5 empty palette guides exploration and commands");
input.value = "Tyrese Maxey";
input.dispatchEvent(new view.Event("input", { bubbles: true }));
await wait(600);
const options = [...app.querySelectorAll("#commandPaletteResults [role=option]")];
check(options[0]?.textContent.includes("Tyrese Maxey") && options[0]?.previousElementSibling?.textContent === "Profiles", "6 exact canonical profile match is first");
check(app.querySelector("#commandPaletteStatus")?.textContent && !app.querySelector("#commandPaletteStatus")?.textContent.includes("Searching canonical"), "7 async search reports a contextual completion status");
input.dispatchEvent(new view.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
check(input.getAttribute("aria-activedescendant") === "command-palette-option-0" && app.querySelector("#command-palette-option-0")?.getAttribute("aria-selected") === "true", "8 arrow navigation exposes active option semantics");
input.dispatchEvent(new view.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await wait(300);
check(!palette.open && !app.querySelector("#athleteProfileView")?.hidden, "9 Enter opens the canonical profile and closes the palette");

app.querySelector("#openCommandPalette")?.focus();
app.querySelector("#openCommandPalette")?.click();
input.value = "zzqvxx";
input.dispatchEvent(new view.Event("input", { bubbles: true }));
await wait(600);
check(app.querySelector(".command-palette-empty")?.textContent.includes("Ask Edge Intelligence"), "10 empty results provide a supported next action");
palette.dispatchEvent(new view.Event("cancel", { cancelable: true }));
check(!palette.open && app.activeElement === app.querySelector("#openCommandPalette"), "11 Escape/cancel closes and restores focus");

const oldWidth = frame.style.width;
for (const width of [390, 768, 1280]) {
  frame.style.width = `${width}px`;
  await wait(50);
  check(app.documentElement.scrollWidth <= app.documentElement.clientWidth + 1, `responsive layout has no document overflow at ${width}px`);
}
frame.style.width = oldWidth;
app.querySelector('[data-theme-option="light"]')?.click();
check(app.body.dataset.theme === "light", "15 light theme remains functional");
app.querySelector('[data-theme-option="dark"]')?.click();
check(app.body.dataset.theme === "dark", "16 dark theme remains functional");
check(app.querySelector("#betSlip h2")?.textContent === "Research Slip" && app.querySelector("#openWorkspace")?.textContent.includes("Workspace"), "17 primary terminology is consistent");
const resources = view.performance.getEntriesByType("resource");
const appScript = resources.find((entry) => new URL(entry.name).pathname.endsWith("/app.js"));
const stylesheet = resources.find((entry) => new URL(entry.name).pathname.endsWith("/styles.css"));
check((appScript?.decodedBodySize || 0) < 800000, `18 application entry remains below 800 KB (${Math.round((appScript?.decodedBodySize || 0) / 1024)} KB)`);
check((stylesheet?.decodedBodySize || 0) < 250000, `19 shared stylesheet remains below 250 KB (${Math.round((stylesheet?.decodedBodySize || 0) / 1024)} KB)`);
check(window.testErrors.length === 0, `20 no browser errors${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} checks)\n${checks.join("\n")}`;
frame.remove();
