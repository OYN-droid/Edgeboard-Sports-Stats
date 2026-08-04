export const MARKET_SCREENER_SCHEMA_VERSION = 1;

export const MARKET_SCREENER_FILTER_KEYS = Object.freeze([
  "sportIds", "leagueIds", "competitions", "gameIds", "playerIds", "teamIds",
  "fighterIds", "driverIds", "marketTypes", "sportsbooks", "currentLineMin",
  "currentLineMax", "openingLineMin", "openingLineMax", "movementMin", "oddsMin",
  "oddsMax", "researchQualityMin", "edgeTrustMin", "historicalCoverageMin",
  "historicalHitRateMin", "projectionMin", "projectionAboveLine", "edgeMin",
  "confidenceMin", "researchCompletenessMin", "providers", "freshness",
  "upcomingOnly", "homeAway", "opponentIds", "positions", "weightClasses",
  "tracks", "surfaces", "freshOnly", "confirmedLineupOnly", "noInjuryUncertainty",
  "currentStoriesOnly", "milestoneOnly", "streakOnly", "recentTrendOnly",
  "noProviderConflicts",
]);

export const MARKET_SCREENER_ARRAY_FILTERS = Object.freeze([
  "sportIds", "leagueIds", "competitions", "gameIds", "playerIds", "teamIds",
  "fighterIds", "driverIds", "marketTypes", "sportsbooks", "providers", "freshness",
  "homeAway", "opponentIds", "positions", "weightClasses", "tracks", "surfaces",
]);

export const MARKET_SCREENER_NUMERIC_FILTERS = Object.freeze([
  "currentLineMin", "currentLineMax", "openingLineMin", "openingLineMax", "movementMin",
  "oddsMin", "oddsMax", "researchQualityMin", "edgeTrustMin", "historicalCoverageMin",
  "historicalHitRateMin", "projectionMin", "edgeMin", "confidenceMin",
  "researchCompletenessMin",
]);

export const MARKET_SCREENER_BOOLEAN_FILTERS = Object.freeze([
  "projectionAboveLine", "upcomingOnly", "freshOnly", "confirmedLineupOnly",
  "noInjuryUncertainty", "currentStoriesOnly", "milestoneOnly", "streakOnly",
  "recentTrendOnly", "noProviderConflicts",
]);

export const MARKET_SCREENER_SORTS = Object.freeze([
  Object.freeze({ id: "highest_research_quality", label: "Highest Research Quality" }),
  Object.freeze({ id: "strongest_evidence", label: "Strongest Supporting Evidence" }),
  Object.freeze({ id: "largest_observed_movement", label: "Largest Observed Line Movement" }),
  Object.freeze({ id: "highest_historical_support", label: "Highest Historical Support" }),
  Object.freeze({ id: "event_time", label: "Upcoming Event" }),
  Object.freeze({ id: "participant", label: "Player or participant" }),
  Object.freeze({ id: "current_line", label: "Current line" }),
  Object.freeze({ id: "odds", label: "Odds" }),
]);

export const MARKET_SCREENER_GROUPS = Object.freeze([
  Object.freeze({ id: "none", label: "No grouping" }),
  Object.freeze({ id: "sport", label: "Sport" }),
  Object.freeze({ id: "league", label: "League" }),
  Object.freeze({ id: "competition", label: "Competition" }),
  Object.freeze({ id: "game", label: "Game or event" }),
  Object.freeze({ id: "market_type", label: "Market type" }),
  Object.freeze({ id: "sportsbook", label: "Sportsbook" }),
  Object.freeze({ id: "provider", label: "Provider" }),
]);

export const MARKET_SCREENER_PRESETS = Object.freeze([
  Object.freeze({ id: "today-strikeouts", title: "Today’s Strikeout Research", filters: Object.freeze({ marketTypes: Object.freeze(["baseball-pitcher-strikeouts"]), upcomingOnly: true }) }),
  Object.freeze({ id: "wnba-assists", title: "WNBA Assists", filters: Object.freeze({ leagueIds: Object.freeze(["wnba"]), marketTypes: Object.freeze(["basketball-assists"]) }) }),
  Object.freeze({ id: "fight-finishes", title: "Fight Finish Markets", filters: Object.freeze({ sportIds: Object.freeze(["combat-sports"]), marketTypes: Object.freeze(["mma-method-of-victory", "boxing-method-of-victory", "mma-fight-goes-distance", "boxing-fight-goes-distance"]) }) }),
  Object.freeze({ id: "shots-on-goal", title: "Shots On Goal", filters: Object.freeze({ marketTypes: Object.freeze(["hockey-shots-on-goal"]) }) }),
  Object.freeze({ id: "current-line-movers", title: "Current Line Movers", filters: Object.freeze({ movementMin: 1 }) }),
]);

export const MARKET_SCREENER_WINDOW_SIZE = 18;
export const MARKET_SCREENER_MAX_WINDOW_SIZE = 72;

export const MARKET_SCREENER_SCORE_WEIGHTS = Object.freeze({
  researchQuality: .32,
  marketTrust: .18,
  evidence: .18,
  historicalCoverage: .12,
  freshness: .1,
  providerAgreement: .06,
  currentContext: .04,
});
