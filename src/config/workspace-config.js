export const WORKSPACE_SCHEMA_VERSION = 1;
export const WORKSPACE_STORAGE_KEY = "edgeboard-workspace-v1";
export const WORKSPACE_SYNC_STATUS = "local_only";

export const SAVED_OBJECT_TYPES = Object.freeze([
  "saved_research", "saved_query", "saved_answer", "saved_comparison",
  "saved_leaderboard", "saved_visualization", "saved_insight", "saved_entity",
  "saved_story", "saved_scenario", "tracked_market", "tracked_research_idea", "note",
]);

export const WATCH_TARGET_TYPES = Object.freeze([
  "entity", "athlete", "team", "fighter", "boxer", "driver", "golfer",
  "tennis-player", "coach", "manager", "promotion", "constructor", "manufacturer",
  "national-team", "organization",
  "league", "competition", "event", "venue", "market", "stat_query",
  "insight_rule", "milestone", "streak", "leaderboard_position",
]);

export const ALERT_CATEGORIES = Object.freeze(["stats", "events", "markets", "insights", "system"]);
export const ALERT_OPERATORS = Object.freeze([
  "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal",
  "equals", "changed_by_at_least", "became_available", "became_unavailable",
  "became_stale", "starts_within_minutes",
]);
export const TRACKED_IDEA_STATUSES = Object.freeze(["researching", "shortlisted", "monitoring", "closed", "archived"]);
export const TRACKED_RESULT_STATUSES = Object.freeze([
  "unresolved", "won", "lost", "push", "void", "partial", "unavailable", "not_tracked",
]);

export const DEFAULT_BOARD_TEMPLATES = Object.freeze([
  { id: "board-saved-research", title: "Saved Research", marker: "R", sortOrder: 0 },
  { id: "board-watchlist", title: "Watchlist", marker: "W", sortOrder: 1 },
  { id: "board-betting-research", title: "Betting Research", marker: "B", sortOrder: 2 },
  { id: "board-stats-trends", title: "Stats and Trends", marker: "S", sortOrder: 3 },
  { id: "board-visuals", title: "Visuals", marker: "V", sortOrder: 4 },
  { id: "board-edge-lab", title: "Edge Lab", marker: "L", sortOrder: 5 },
  { id: "board-archived", title: "Archived", marker: "A", sortOrder: 6, isArchived: true },
]);

const moduleDefinition = (id, label, supportedEmphases = ["balanced", "stats", "betting"]) =>
  Object.freeze({ id, label, supportedEmphases: Object.freeze(supportedEmphases) });

export const DASHBOARD_MODULES = Object.freeze([
  moduleDefinition("continue-research", "Continue Research"),
  moduleDefinition("today-insights", "Today’s Insights"),
  moduleDefinition("saved-boards", "Saved Boards"),
  moduleDefinition("watchlist-updates", "Watchlist"),
  moduleDefinition("alert-center", "Alert Center"),
  moduleDefinition("followed-entities", "Followed Entities"),
  moduleDefinition("upcoming-events", "Upcoming Events"),
  moduleDefinition("milestones", "Milestones to Watch", ["balanced", "stats"]),
  moduleDefinition("active-streaks", "Active Streaks", ["balanced", "stats"]),
  moduleDefinition("saved-visuals", "Saved Visuals", ["balanced", "stats"]),
  moduleDefinition("tracked-ideas", "Tracked Research Ideas", ["balanced", "betting"]),
  moduleDefinition("recently-viewed", "Recently Viewed"),
  moduleDefinition("journal-summary", "Research Journal Summary"),
  moduleDefinition("data-status", "Data Status"),
]);

const ids = (...values) => Object.freeze(values);
export const DASHBOARD_PRESETS = Object.freeze({
  balanced: ids("continue-research", "today-insights", "saved-boards", "tracked-ideas", "watchlist-updates", "upcoming-events", "data-status"),
  stats: ids("continue-research", "saved-boards", "watchlist-updates", "milestones", "active-streaks", "saved-visuals", "journal-summary", "data-status"),
  betting: ids("continue-research", "tracked-ideas", "alert-center", "watchlist-updates", "saved-boards", "journal-summary", "data-status"),
  combat: ids("watchlist-updates", "upcoming-events", "active-streaks", "saved-boards", "saved-visuals", "data-status"),
  motorsports: ids("watchlist-updates", "upcoming-events", "saved-visuals", "alert-center", "saved-boards", "data-status"),
});

export const DEFAULT_PREFERENCES = Object.freeze({
  favoriteSportIds: Object.freeze([]),
  favoriteLeagueIds: Object.freeze([]),
  favoriteEntityIds: Object.freeze([]),
  hiddenSportIds: Object.freeze([]),
  preferredResearchMode: "both",
  preferredOddsFormat: "american",
  preferredConfidenceThreshold: 58,
  preferredDateWindow: 10,
  preferredChartType: "line_chart",
  defaultWorkspaceId: "workspace-local-default",
  defaultBoardId: "board-saved-research",
  density: "comfortable",
  reduceMotion: false,
  emphasis: "balanced",
  dashboardPreset: "balanced",
  activityPaused: false,
  privacyMode: false,
  financialSimulationVisible: false,
});

export function normalizeTag(value) {
  return String(value || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function createLocalId(prefix = "local", now = Date.now(), random = Math.random()) {
  const entropy = Math.floor(random * 0xFFFFFF).toString(36).padStart(4, "0");
  return `${prefix}-${Number(now).toString(36)}-${entropy}`;
}
