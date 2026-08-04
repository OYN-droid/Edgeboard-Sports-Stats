import { APP_CONFIG } from "../src/config/app-config.js";

const results = document.querySelector("#results");
const frame = document.querySelector("#app");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const failures = [];
const check = (condition, label) => { checks.push(label); if (!condition) failures.push(label); };
await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
await wait(1200);
const view = frame.contentWindow;
const app = frame.contentDocument;
const about = app.querySelector("#aboutView");

check(view.location.pathname === "/about" && !about.hidden, "1 refresh-safe About route loads");
check(app.title === APP_CONFIG.aboutTitle && app.querySelector('meta[name="description"]')?.content === APP_CONFIG.aboutDescription, "2 route metadata is accessible and shared");
check(app.querySelectorAll("#aboutView h1").length === 1 && app.querySelector("#aboutTitle")?.textContent === "EdgeBoard", "3 one logical About H1 renders");
check(about.textContent.includes("The sports intelligence platform for discovering the stories behind sports."), "4 concise hero copy renders");
check(app.querySelector("#aboutIntelligenceTitle") && about.textContent.includes("does not invent statistics"), "5 Edge Intelligence is explained accurately");
check(app.querySelector("#aboutTrustTitle") && about.textContent.includes("not betting confidence or the probability"), "6 Edge Trust distinguishes Research Quality from probability and betting confidence");
check(app.querySelector("#aboutDiscoveryTitle") && about.textContent.includes("Today’s Stories"), "7 sports discovery systems render");
check(app.querySelector("#aboutMarketsTitle") && about.textContent.includes("EdgeBoard is not a sportsbook"), "8 responsible betting research section renders");
check(app.querySelector("#aboutVersion")?.textContent === `Version ${APP_CONFIG.version}`, "9 version is sourced from shared application configuration");
check(about.textContent.includes("requires explicit certification") && !about.textContent.includes("all leagues have complete live data"), "10 current status makes no false live-data claim");
check(!/winning picks|unbeatable|revolutionary|can.?t miss|\block\b|risk-free/i.test(about.textContent), "11 prohibited promotional or betting language is absent");
check(app.querySelectorAll("#aboutView [data-open-coverage]").length >= 2, "12 meaningful Data Coverage actions render");
check(app.querySelector('#aboutView a[href="/docs/getting-started.md"]') && app.querySelector('#aboutView a[href="/docs/changelog.md"]'), "13 Documentation and Changelog links render");

app.querySelector("#aboutView [data-open-coverage]")?.click();
await wait(250);
check(app.querySelector("#coverageDialog")?.open && app.querySelector("#coverageContent")?.textContent.trim().length > 0, "14 Data Coverage action opens the existing coverage view");
app.querySelector("#closeCoverageDialog")?.click();
const linkResponses = await Promise.all(["/docs/getting-started.md", "/docs/changelog.md"].map((href) => fetch(href)));
check(linkResponses.every((response) => response.ok), "15 Documentation and Changelog targets resolve");

const initialSlip = app.querySelector("#mobileLegCount")?.textContent;
app.querySelector("[data-close-about]")?.click();
await wait(100);
check(view.location.pathname === "/" && about.hidden, "16 Explore EdgeBoard returns to discovery without reload");
app.querySelector(".site-footer [data-about-route]")?.click();
await wait(100);
check(view.location.pathname === "/about" && !about.hidden, "17 footer utility navigation opens About");
view.history.back(); await wait(150);
check(view.location.pathname === "/" && about.hidden, "18 browser Back restores the prior route");
view.history.forward(); await wait(150);
check(view.location.pathname === "/about" && !about.hidden && app.querySelector("#mobileLegCount")?.textContent === initialSlip, "19 browser Forward restores About without losing Research Slip state");

view.document.dispatchEvent(new view.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
await wait(60);
const paletteInput = app.querySelector("#commandPaletteInput");
paletteInput.value = "About EdgeBoard";
paletteInput.dispatchEvent(new view.Event("input", { bubbles: true }));
await wait(400);
const aboutCommand = [...app.querySelectorAll("#commandPaletteResults [role=option]")].find((option) => option.textContent.includes("About EdgeBoard"));
check(Boolean(aboutCommand), "20 command palette finds About EdgeBoard");
aboutCommand?.click(); await wait(80);
check(!app.querySelector("#commandPalette")?.open && view.location.pathname === "/about", "21 command palette opens the About route");

for (const [width, label] of [[390, "mobile"], [768, "tablet"], [1280, "desktop"]]) {
  frame.style.width = `${width}px`; await wait(50);
  check(app.documentElement.scrollWidth <= app.documentElement.clientWidth + 1, `${label} layout has no horizontal overflow`);
}
frame.style.width = "390px";
app.documentElement.style.fontSize = "200%"; await wait(80);
check(app.documentElement.scrollWidth <= app.documentElement.clientWidth + 1 && about.scrollHeight > 0, "25 large text remains readable without horizontal overflow");
app.documentElement.style.fontSize = "";
app.querySelector('[data-theme-option="light"]')?.click();
check(app.body.dataset.theme === "light", "26 light theme works");
app.querySelector('[data-theme-option="dark"]')?.click();
check(app.body.dataset.theme === "dark", "27 dark theme works");
const headings = [...app.querySelectorAll("#aboutView h1, #aboutView h2, #aboutView h3")].filter((node) => node.offsetParent !== null).map((node) => Number(node.tagName.slice(1)));
check(headings[0] === 1 && headings.every((level, index) => index === 0 || level <= headings[index - 1] + 1), "28 visible heading hierarchy does not skip levels");
app.querySelector("#aboutView [data-about-research]")?.focus();
check(app.activeElement === app.querySelector("#aboutView [data-about-research]"), "29 keyboard focus reaches About actions");
check(window.testErrors.length === 0, `30 no browser console errors${window.testErrors.length ? `: ${window.testErrors.join(" | ")}` : ""}`);

results.dataset.status = failures.length ? "failed" : "passed";
results.textContent = failures.length ? `FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}` : `PASS (${checks.length} checks)\n${checks.join("\n")}`;
frame.remove();
