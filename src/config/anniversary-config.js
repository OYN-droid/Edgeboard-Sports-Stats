export const ANNIVERSARY_SCHEMA_VERSION = 1;

export const ANNIVERSARY_CATEGORIES = Object.freeze([
  "Championship", "Record", "Milestone", "Debut", "Retirement", "Historic Performance",
  "Comeback", "Upset", "Perfect Game", "No Hitter", "Hat Trick", "Triple Double",
  "Fight", "Race", "Tournament", "Olympic Event", "World Championship",
  "Franchise History", "Venue History", "League History", "Competition History",
]);

export const ANNIVERSARY_SCORE_WEIGHTS = Object.freeze({
  historicalSignificance: 24,
  edgeTrust: 18,
  researchQuality: 18,
  selectedLeague: 12,
  selectedSport: 8,
  currentEntityActivity: 5,
  currentRivalry: 4,
  currentMilestone: 3,
  currentMatchup: 3,
  recency: 2,
  coverage: 2,
  novelty: 1,
});

export const ANNIVERSARY_DEFAULT_LIMIT = 8;
