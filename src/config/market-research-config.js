export const MARKET_RESEARCH_SCHEMA_VERSION = 2;

export const MARKET_CHANGE_TYPES = Object.freeze([
  "opening", "movement", "current", "suspended", "reopened",
]);

export const VERIFIED_MARKET_EVENT_TYPES = Object.freeze([
  "lineup", "injury", "weather", "schedule", "opponent_change", "provider_correction",
]);

export const MARKET_EXPLAINER_INTENTS = Object.freeze([
  ["explain-market", /\bexplain (?:this|the) (?:market|line)\b/i],
  ["explain-movement", /\bwhy did (?:this|the)(?: (?:line|market))? move|explain (?:today'?s )?movement|market movement\b/i],
  ["compare-books", /\bcompare books|best (?:odds|price)\b/i],
  ["historical-movement", /\b(?:show )?historical (?:line |price )?movement|price history\b/i],
  ["related-research", /\bshow related research\b/i],
  ["counterarguments", /\b(?:show )?(?:opposing arguments|counterarguments)\b/i],
]);

export const MARKET_RESEARCH_STATUSES = Object.freeze([
  "available", "suspended", "stale", "unavailable", "partial", "error",
]);

export const MARKET_HUB_SECTIONS = Object.freeze([
  ["today", "Today’s Markets"],
  ["trending", "Trending Markets"],
  ["movement", "Biggest Line Moves"],
  ["best-price", "Best Available Prices"],
  ["lineups", "Recently Confirmed Lineups"],
  ["injuries", "Recently Confirmed Injuries"],
  ["quality", "Highest Research Quality Markets"],
  ["changed", "Recently Changed Markets"],
  ["saved", "Saved Market Research"],
  ["sessions", "Research Sessions"],
  ["milestones", "Upcoming Milestones"],
  ["history", "Historical Market Performance"],
]);

export const MARKET_RESEARCH_SCORE_WEIGHTS = Object.freeze({
  researchQuality: 42,
  availability: 24,
  historicalCoverage: 16,
  movementEvidence: 10,
  eventContext: 8,
});

export const MARKET_RESEARCH_LIMITS = Object.freeze({
  hubSection: 8,
  relatedMarkets: 6,
  relatedEvidence: 4,
  gameLog: 10,
});
