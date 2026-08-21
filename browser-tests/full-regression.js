const suites = [
  "about", "advanced-stats", "anniversaries", "athlete-profiles", "discovery-engine", "entities",
  "historical-explorer", "illustrations", "illustration-proof-gallery", "insights", "knowledge-graph", "launch-readiness", "market-depth",
  "live-state", "mlb-certification", "market-explanations", "market-research", "market-screener", "parlay-builder", "portfolio-polish", "research-analyst",
  "stats-research", "story-engine", "visualizations", "workspace",
];
const output = document.querySelector("#results");
const host = document.querySelector("#harness");
const completed = [];

for (const suite of suites) {
  localStorage.clear();
  const frame = document.createElement("iframe");
  frame.title = `${suite} regression suite`;
  frame.src = `./${suite}.html`;
  frame.style.cssText = "width:1280px;height:900px;border:0;position:absolute;left:-10000px";
  host.replaceChildren(frame);
  await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  const startedAt = Date.now();
  let status = "Running…";
  while (!status.startsWith("PASS") && !status.startsWith("FAIL") && Date.now() - startedAt < 45000) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    status = frame.contentDocument?.querySelector("#results")?.textContent || "Running…";
  }
  const passed = status.startsWith("PASS");
  completed.push({ suite, passed, summary: status.split("\n")[0], details: passed ? "" : status });
  output.textContent = `Running ${completed.length}/${suites.length}\n${completed.map((item) => `${item.passed ? "PASS" : "FAIL"} ${item.suite}: ${item.summary}`).join("\n")}`;
}

const passed = completed.length === suites.length && completed.every((item) => item.passed);
output.dataset.status = passed ? "passed" : "failed";
output.textContent = `${passed ? "PASS" : "FAIL"} (${completed.filter((item) => item.passed).length}/${suites.length} suites)\n${completed.map((item) => `${item.passed ? "PASS" : "FAIL"} ${item.suite}: ${item.summary}${item.details ? `\n${item.details}` : ""}`).join("\n")}`;
host.replaceChildren();
