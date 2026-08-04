export const KNOWLEDGE_GRAPH_SCHEMA_VERSION = 1;

export const KNOWLEDGE_GRAPH_NODE_TYPES = Object.freeze([
  "entity", "event", "story", "visualization", "comparison", "leaderboard", "insight",
  "historical_item", "anniversary", "market", "research_session", "workspace", "research_path",
]);

export const KNOWLEDGE_GRAPH_EDGE_TYPES = Object.freeze([
  "explicit_relationship", "explicit_reverse_relationship", "participates_in", "team_schedule",
  "league_schedule", "supported_by_story", "supported_by_insight", "supported_by_history",
  "anniversary_of", "has_current_market", "can_visualize", "can_compare", "can_rank",
  "can_research", "can_save",
]);

export const KNOWLEDGE_GRAPH_SCORES = Object.freeze({
  explicit_relationship: 100,
  participates_in: 92,
  team_schedule: 86,
  league_schedule: 80,
  story: 78,
  insight: 76,
  historical_item: 74,
  anniversary: 72,
  market: 68,
  visualization: 64,
  comparison: 61,
  leaderboard: 59,
  research_session: 56,
  workspace: 54,
  research_path: 50,
});

export const KNOWLEDGE_GRAPH_SECTION_ORDER = Object.freeze([
  "entities", "current", "evidence", "research-tools",
]);

export const KNOWLEDGE_GRAPH_LIMITS = Object.freeze({
  nodes: 36,
  perSection: 8,
  nextResearch: 10,
});
