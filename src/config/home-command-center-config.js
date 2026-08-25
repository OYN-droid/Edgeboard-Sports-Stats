export const HOME_COMMAND_CENTER_STORY_IDS = Object.freeze([
  "story-fixture-ended-streak",
  "story-fixture-dataset-high",
  "story-fixture-wnba-assist-streak",
  "story-fixture-nhl-point-streak",
  "story-fixture-provider-milestone",
  "story-fixture-ufc-finish-streak",
  "story-fixture-boxing-knockout-milestone",
  "story-fixture-f1-top-ten",
]);

export const HOME_COMMAND_CENTER_SCHEDULE_LEAGUES = Object.freeze([
  "mls",
  "atp",
  "f1",
  "ufc",
  "boxing",
  "fiba",
  "ucl",
]);

export const HOME_COMMAND_CENTER_QUICK_RESEARCH = Object.freeze([
  Object.freeze({ id: "player-profile", label: "Player Profile", description: "Open Aaron Judge’s canonical athlete profile.", type: "profile", entityId: "mlb-aaron-judge" }),
  Object.freeze({ id: "compare", label: "Compare Players", description: "Run a qualified, identical-filter player comparison.", type: "query", kind: "comparison", query: "Compare Aaron Judge with qualified MLB peers" }),
  Object.freeze({ id: "edge-research", label: "Edge Research", description: "Explain a supported story from retained evidence.", type: "query", kind: "research", query: "Explain Aaron Judge's ended sample hit streak with supporting evidence" }),
  Object.freeze({ id: "market-screener", label: "Market Screener", description: "Filter normalized fixture markets and their evidence.", type: "route", href: "/markets/screener" }),
  Object.freeze({ id: "knowledge-graph", label: "Knowledge Graph", description: "Explore canonical links between profiles, stories, and research.", type: "query", kind: "research", query: "Show connected research for Aaron Judge" }),
]);

export const HOME_COMMAND_CENTER_INTELLIGENCE = Object.freeze([
  Object.freeze({ id: "evidence", label: "Evidence-backed", description: "Every insight links to retained, verifiable sample evidence." }),
  Object.freeze({ id: "transparent", label: "Transparent", description: "Sources, scope, freshness, and Research Quality stay visible." }),
  Object.freeze({ id: "decisions", label: "Built for decision makers", description: "Research is organized for comparison and confident review—not guaranteed outcomes." }),
]);
