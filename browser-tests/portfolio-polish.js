const output = document.querySelector("#results");
const frame = document.querySelector("#app");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const failures = [];
const check = (condition, label) => {
  checks.push(label);
  if (!condition) failures.push(label);
};
const waitFor = async (predicate, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(40);
  }
  return false;
};

if (frame.contentWindow.location.href === "about:blank" || frame.contentDocument?.readyState !== "complete") {
  await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
}
await waitFor(() => frame.contentDocument?.querySelectorAll("#todayPulseGrid [data-home-card]").length >= 4);
const view = frame.contentWindow;
const app = frame.contentDocument;
await waitFor(() => app.querySelector(".primary-button"));
const rootStyle = view.getComputedStyle(app.documentElement);

for (const token of ["--surface-card", "--text-primary", "--border-subtle", "--pink", "--space-4", "--radius-lg", "--shadow-sm"]) {
  check(Boolean(rootStyle.getPropertyValue(token).trim()), `visual token ${token} resolves`);
}

const demo = app.querySelector("#dataStatus");
check(demo?.textContent.includes("Portfolio demo") && demo?.textContent.includes("Validated sample data"), "sample mode is presented as an intentional validated portfolio demo");
check(demo?.getAttribute("aria-description")?.includes("No live feeds"), "demo disclosure is available to assistive technology");

const launchCards = [...app.querySelectorAll("#todayPulseGrid [data-home-card]")];
const launchSports = new Set(launchCards.map((card) => card.dataset.sportId));
const launchHero = launchCards[0];
const launchHeroImage = launchHero?.querySelector("img");
if (launchHeroImage) launchHeroImage.loading = "eager";
launchHeroImage?.scrollIntoView({ block: "center" });
if (launchHeroImage && (!launchHeroImage.complete || !launchHeroImage.naturalWidth)) {
  await Promise.race([
    launchHeroImage.decode().catch(() => undefined),
    wait(3000),
  ]);
}
view.scrollTo(0, 0);
check(app.querySelector("#todayPulse")?.dataset.scope === "system:all" && launchSports.size >= 4, "fresh Home defaults to a deterministic multi-sport story mix");
check(app.querySelector("#todayPulseTitle")?.textContent === "Stories behind the numbers" && app.querySelector("#todayPulseSummary")?.textContent.includes("Evidence-backed sports intelligence"), "first view states the product value in plain language");
check(launchHero?.dataset.homeCard === "story-fixture-ended-streak" && launchHero?.dataset.leagueId === "mlb", "canonical recruiter story leads the launch presentation");
check(launchHero?.querySelector("[data-illustration-level]")?.dataset.illustrationLevel === "exact" && launchHero?.querySelector("[data-illustration-registry-id]")?.dataset.illustrationRegistryId === "art-mlb-aaron-judge-portrait", "hero portrait resolves through the centralized exact-art registry");
check(launchHeroImage?.complete && launchHeroImage?.naturalWidth > 0, "hero artwork is present and decoded");
check(launchHero?.querySelector("[data-view-story]") && launchHero?.querySelector("[data-open-athlete='mlb-aaron-judge']") && launchHero?.querySelector("[data-research-story]") && launchHero?.querySelector("[data-home-action='comparison']"), "hero exposes story, profile, structured research, and comparison paths");
check(!app.querySelector("#researchIntentNav")?.textContent.includes("AI Research") && app.querySelector("#researchIntentNav")?.textContent.includes("Edge Research"), "research navigation describes deterministic Edge Research without a generative AI claim");
check(app.querySelector("#researchIntentNav")?.textContent.includes("Parlay Research") && app.querySelector("#researchIntentNav")?.textContent.includes("Value Research"), "market navigation is framed as research rather than advice");

const primary = app.querySelector(".primary-button");
const secondary = app.querySelector(".text-button");
check(primary && view.getComputedStyle(primary).backgroundColor !== view.getComputedStyle(secondary).backgroundColor, "primary and secondary controls have distinct emphasis");
check(Number.parseFloat(view.getComputedStyle(primary).minHeight) >= 44, "primary action meets the minimum pointer target");

const query = app.querySelector("#queryInput");
query.value = "Keep this portfolio research query";
app.querySelector('[data-research-mode="stats"]')?.click();
app.querySelector('[data-research-mode="both"]')?.click();
check(query.value === "Keep this portfolio research query", "visual polish does not disturb research text or mode behavior");

for (const [width, label] of [[390, "mobile"], [768, "tablet"], [1440, "desktop"]]) {
  frame.style.width = `${width}px`;
  await wait(80);
  check(app.documentElement.scrollWidth <= app.documentElement.clientWidth + 1, `${label} layout has no document overflow`);
  check(app.querySelector(".topbar")?.getBoundingClientRect().width <= width + 1, `${label} header stays within its viewport`);
  if (width === 390) {
    const workspaceRect = app.querySelector("#openWorkspace")?.getBoundingClientRect();
    check(workspaceRect && workspaceRect.width > 0 && workspaceRect.right <= width && workspaceRect.top >= 0, `mobile Workspace control is visible within the header (${Math.round(workspaceRect?.left || 0)}–${Math.round(workspaceRect?.right || 0)}px)`);
  }
}

frame.style.width = "390px";
app.documentElement.style.fontSize = "150%";
await wait(100);
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth + 1, "large text does not create document overflow");
check(app.querySelector("#homeCommandCenter")?.scrollHeight > 0 && app.querySelector("#queryForm")?.scrollHeight > 0, "large text preserves discovery and research content");
app.documentElement.style.fontSize = "";

app.querySelector('[data-theme-option="light"]')?.click();
const lightSurface = view.getComputedStyle(app.body).backgroundColor;
check(app.body.dataset.theme === "light", "light theme remains available");
app.querySelector('[data-theme-option="dark"]')?.click();
check(app.body.dataset.theme === "dark" && view.getComputedStyle(app.body).backgroundColor !== lightSurface, "dark theme remains visually distinct");

const launchPrimary = launchHero?.querySelector("[data-view-story]");
launchPrimary?.focus({ focusVisible: true });
const visibleFocusRule = [...app.styleSheets].some((sheet) => [...sheet.cssRules].some((rule) => rule.selectorText?.includes("button:focus-visible") && rule.style.outline));
check(launchPrimary instanceof view.HTMLButtonElement && launchPrimary.tabIndex === 0 && visibleFocusRule, "primary story action is keyboard-focusable and retains the visible focus contract");
check(app.querySelectorAll("button:not([type])").length === 0, "all static markup buttons retain explicit semantics");
check(window.testErrors.length === 0, `no browser errors${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

output.dataset.status = failures.length ? "failed" : "passed";
output.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} checks)\n${checks.join("\n")}`;
frame.remove();
