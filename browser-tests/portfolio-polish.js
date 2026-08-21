const output = document.querySelector("#results");
const frame = document.querySelector("#app");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const failures = [];
const check = (condition, label) => {
  checks.push(label);
  if (!condition) failures.push(label);
};

await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
await wait(1400);
const view = frame.contentWindow;
const app = frame.contentDocument;
const rootStyle = view.getComputedStyle(app.documentElement);

for (const token of ["--surface-card", "--text-primary", "--border-subtle", "--pink", "--space-4", "--radius-lg", "--shadow-sm"]) {
  check(Boolean(rootStyle.getPropertyValue(token).trim()), `visual token ${token} resolves`);
}

const demo = app.querySelector("#dataStatus");
check(demo?.textContent.includes("Sample data") && demo?.textContent.includes("Deterministic demo"), "sample mode is presented as an intentional deterministic demo");
check(demo?.getAttribute("aria-description")?.includes("No live feeds"), "demo disclosure is available to assistive technology");

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
check(app.querySelector("#todayPulse")?.scrollHeight > 0 && app.querySelector("#queryForm")?.scrollHeight > 0, "large text preserves discovery and research content");
app.documentElement.style.fontSize = "";

app.querySelector('[data-theme-option="light"]')?.click();
const lightSurface = view.getComputedStyle(app.body).backgroundColor;
check(app.body.dataset.theme === "light", "light theme remains available");
app.querySelector('[data-theme-option="dark"]')?.click();
check(app.body.dataset.theme === "dark" && view.getComputedStyle(app.body).backgroundColor !== lightSurface, "dark theme remains visually distinct");

primary?.focus();
check(app.activeElement === primary && view.getComputedStyle(primary).outlineStyle !== "none", "keyboard focus remains visible on the primary action");
check(app.querySelectorAll("button:not([type])").length === 0, "all static markup buttons retain explicit semantics");
check(window.testErrors.length === 0, `no browser errors${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

output.dataset.status = failures.length ? "failed" : "passed";
output.textContent = failures.length
  ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`
  : `PASS (${checks.length} checks)\n${checks.join("\n")}`;
frame.remove();
