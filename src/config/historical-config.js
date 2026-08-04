export const HISTORICAL_SCHEMA_VERSION = 1;

export const HISTORICAL_VALIDATION_STATES = Object.freeze([
  "verified_complete", "provider_asserted", "dataset_only", "partial_coverage", "incomplete", "unknown", "corrected",
]);

export const HISTORICAL_ITEM_TYPES = Object.freeze([
  "athlete_performance", "team_performance", "fighter_performance", "driver_performance",
  "game", "match", "fight", "race", "tournament", "championship", "season", "streak",
  "milestone", "record", "dataset_high", "comeback", "upset", "rivalry_event", "career_event",
  "debut", "final_appearance", "title_change", "standings_change", "historical_story",
]);

export const HISTORICAL_QUERY_INTENTS = Object.freeze([
  "historical_exploration", "greatest_performances", "top_available_performances", "single_game_record",
  "single_event_record", "season_record", "career_record_available", "team_record", "competition_record",
  "championship_history", "dynasty_history", "rivalry_history", "playoff_history", "tournament_history",
  "upset_history", "comeback_history", "streak_history", "milestone_history", "athlete_career_timeline",
  "team_timeline", "organization_timeline", "event_anniversary", "historical_leaderboard",
  "historical_comparison", "era_comparison", "season_comparison", "head_to_head_history",
  "historical_fun_fact", "historical_story", "unsupported_historical_scope", "ambiguous_historical_scope",
]);

export const HISTORICAL_CLAIM_LANGUAGE = Object.freeze({
  verified_complete: Object.freeze({ label: "Verified league history", high: "record", longest: "longest", allowedRecord: true }),
  provider_asserted: Object.freeze({ label: "Provider-asserted history", high: "provider-recognized record", longest: "provider-recognized longest", allowedRecord: true }),
  dataset_only: Object.freeze({ label: "Sample historical data", high: "highest in the available dataset", longest: "longest streak found in available records", allowedRecord: false }),
  partial_coverage: Object.freeze({ label: "Partial historical coverage", high: "notable within available coverage", longest: "among the longest results available", allowedRecord: false }),
  corrected: Object.freeze({ label: "Corrected historical result", high: "corrected high in the available dataset", longest: "corrected streak in available records", allowedRecord: false }),
  incomplete: Object.freeze({ label: "Incomplete historical coverage", high: "unsupported historical claim", longest: "unsupported historical claim", allowedRecord: false }),
  unknown: Object.freeze({ label: "Historical coverage unknown", high: "unsupported historical claim", longest: "unsupported historical claim", allowedRecord: false }),
});

export const SPORT_HISTORICAL_CATEGORIES = Object.freeze({
  basketball: Object.freeze(["Scoring performances", "Triple-doubles", "Assists", "Rebounds", "Three-pointers", "Playoff performances", "Championship runs", "Comebacks", "Win streaks", "Milestones", "Rivalries"]),
  "american-football": Object.freeze(["Passing performances", "Rushing performances", "Receiving performances", "Touchdowns", "Playoff games", "Championship history", "Comebacks", "Undefeated runs", "Rivalries"]),
  baseball: Object.freeze(["Home-run performances", "Hit streaks", "Pitching strikeouts", "Extra-inning games", "Championship history", "Postseason performances", "Comebacks", "Milestones"]),
  "ice-hockey": Object.freeze(["Goal performances", "Point performances", "Goalie saves", "Shutouts", "Scoring streaks", "Playoff runs", "Championship history", "Comebacks", "Rivalries"]),
  soccer: Object.freeze(["Scoring performances", "Hat tricks", "Clean-sheet streaks", "Title races", "Tournament runs", "Comebacks", "Upsets", "Rivalries", "Aggregate and shootout events"]),
  mma: Object.freeze(["Fastest finishes", "Knockout streaks", "Submission streaks", "Title history", "Upsets", "Comeback finishes", "Rematches", "Trilogies", "Unbeaten runs", "Main events"]),
  boxing: Object.freeze(["Fastest finishes", "Knockout streaks", "Title history", "Championship reigns", "Upsets", "Comebacks", "Rematches", "Trilogies"]),
  motorsport: Object.freeze(["Wins", "Podium streaks", "Poles", "Comeback drives", "Championship seasons", "Constructor history", "Track history", "Teammate rivalries", "Qualifying results"]),
  golf: Object.freeze(["Tournament victories", "Major history", "Lowest rounds", "Comeback victories", "Cut streaks", "Career milestones"]),
  tennis: Object.freeze(["Tournament history", "Winning streaks", "Longest supported matches", "Upsets", "Comebacks", "Surface records", "Head-to-head rivalries", "Title history"]),
});

export const HISTORICAL_PAGE_SIZE = 8;
export const DYNASTY_CRITERIA = Object.freeze({ minimumTitles: 2, windowSeasons: 4, consecutiveTitles: 2, label: "candidate based on configured sample criteria" });
export const COMEBACK_THRESHOLDS = Object.freeze({ basketball: 10, "american-football": 10, baseball: 3, "ice-hockey": 2, soccer: 2, motorsport: 10 });
export const UPSET_BASELINES = Object.freeze(["pre_event_odds", "seed", "ranking", "standings"]);

export const CONFIGURED_RIVALRIES = Object.freeze([
  Object.freeze({ id: "rivalry-nba-lakers-sample", sportId: "basketball", leagueId: "nba", participantIds: Object.freeze(["LAL", "PHI"]), classification: "configured_rivalry", label: "Configured sample rivalry", sourceId: "edgeboard-history-fixtures-v1" }),
  Object.freeze({ id: "rivalry-mls-miami-orlando", sportId: "soccer", leagueId: "mls", participantIds: Object.freeze(["MIA", "ORL"]), classification: "configured_rivalry", label: "Configured sample regional rivalry", sourceId: "edgeboard-history-fixtures-v1" }),
  Object.freeze({ id: "rivalry-boxing-sample-trilogy", sportId: "boxing", leagueId: "boxing", participantIds: Object.freeze(["boxing-sample-boxer-a", "promotion-sample-boxing"]), classification: "combat_trilogy", label: "Fixture-backed sample trilogy", sourceId: "edgeboard-history-fixtures-v1" }),
  Object.freeze({ id: "rivalry-f1-teammate-sample", sportId: "motorsport", leagueId: "f1", participantIds: Object.freeze(["f1-max-verstappen", "f1-lando-norris"]), classification: "notable_repeated_matchup", label: "Sample driver comparison; not an official rivalry", sourceId: "edgeboard-history-fixtures-v1" }),
]);
