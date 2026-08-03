export const STORY_SCHEMA_VERSION = 1;

export const STORY_TYPES = Object.freeze([
  "breaking_statistical_change", "notable_performance", "dominant_performance",
  "unusual_performance", "milestone_reached", "milestone_approaching", "active_streak",
  "streak_ended", "leaderboard_change", "new_league_leader", "record_candidate",
  "verified_record", "dataset_high", "season_high", "comeback", "upset",
  "rivalry_context", "matchup_preview", "athlete_form", "team_form", "fighter_form",
  "driver_form", "upcoming_event", "championship_context", "standings_change",
  "qualification_change", "injury_or_lineup_context", "market_movement_context",
  "historical_context", "fun_fact", "comparison_story", "visual_story", "data_update",
  "insufficient_data", "unsupported",
]);

export const STORY_LIFECYCLE_STATES = Object.freeze([
  "candidate", "active", "featured", "expired", "archived", "corrected", "retracted",
]);

export const STORY_PRESENTATIONS = Object.freeze([
  "hero", "feature", "standard", "compact", "timeline", "profile", "event", "related", "share",
]);

export const STORY_VALIDATION_STATES = Object.freeze([
  "verified_complete", "provider_asserted", "dataset_only", "partial_coverage",
  "awaiting_confirmation", "conflicting_sources", "stale", "corrected", "retracted",
  "insufficient_data", "unsupported", "invalid",
]);

export const STORY_SCORE_WEIGHTS = Object.freeze({
  recency: 12,
  magnitude: 8,
  rarity: 9,
  streakLength: 7,
  milestoneImportance: 10,
  recordImportance: 10,
  scopeRelevance: 13,
  queryRelevance: 8,
  sourceCompleteness: 8,
  edgeTrust: 7,
  researchQuality: 7,
  novelty: 5,
  visualSupport: 3,
  evidenceSupport: 5,
  marketRelevance: 4,
  duplicatePenalty: 22,
  stalePenalty: 60,
  smallSamplePenalty: 12,
  incompleteCoveragePenalty: 18,
});

export const STORY_LIMITS = Object.freeze({
  homepageHero: 1,
  todayStories: 6,
  leaguePage: 12,
  sportPage: 12,
  athleteProfile: 6,
  teamPage: 6,
  eventPage: 6,
  researchResult: 8,
  workspace: 20,
  shareCard: 1,
  archivePage: 20,
});

export const STORY_FRESHNESS_POLICIES = Object.freeze({
  upcoming_event: 12 * 60 * 60 * 1000,
  injury_or_lineup_context: 30 * 60 * 1000,
  market_movement_context: 5 * 60 * 1000,
  data_update: 60 * 60 * 1000,
  default: 7 * 24 * 60 * 60 * 1000,
  sample: Infinity,
});

const families = {
  recent_high: "statistical_high",
  season_high: "statistical_high",
  record_candidate: "record_scope",
  milestone_reached: "milestone",
  milestone_proximity: "milestone",
  assist_streak: "threshold_streak",
  shot_streak: "threshold_streak",
  hit_streak: "threshold_streak",
  point_streak: "threshold_streak",
  finish_streak: "threshold_streak",
  top_finish_streak: "threshold_streak",
  win_streak: "threshold_streak",
};

export function storyFamily(type) {
  return families[type] || String(type || "unsupported").replace(/_(?:reached|approaching|ended)$/, "");
}

export function storyLimit(context = "todayStories") {
  return STORY_LIMITS[context] || STORY_LIMITS.todayStories;
}
