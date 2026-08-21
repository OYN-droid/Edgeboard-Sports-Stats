export const PARLAY_BUILDER_SCHEMA_VERSION = 1;
export const PARLAY_MAX_LEGS = 12;

export const PARLAY_CONSTRAINT_DEFAULTS = Object.freeze({
  sportIds: Object.freeze([]), leagueIds: Object.freeze([]), marketTypes: Object.freeze([]),
  sportsbooks: Object.freeze([]), minimumResearchQuality: 0, minimumEdgeTrust: 0,
  minimumResearchCompleteness: 0, maximumLegs: 4, minimumOdds: null, maximumOdds: null,
  confirmedLineupsOnly: false, freshDataOnly: false, noProviderConflicts: true,
  noInjuryUncertainty: false, noWeatherConcerns: false, allowSameGame: false,
  maximumResearchCorrelation: "medium", currentStoriesRequired: false,
  historicalSupportRequired: false, visualizationAvailable: false,
  currentMilestone: false, currentStreak: false, onlyLiveCertifiedData: false,
  movementObservedOnly: false, minimumLineMovement: 0, minimumPriceMovement: 0,
  confirmedStarterOnly: false, activeRosterOnly: false, freshContextOnly: false, noContextConflicts: true,
});

export const PARLAY_BOOLEAN_CONSTRAINTS = Object.freeze([
  "confirmedLineupsOnly", "freshDataOnly", "noProviderConflicts", "noInjuryUncertainty",
  "noWeatherConcerns", "allowSameGame", "currentStoriesRequired", "historicalSupportRequired",
  "visualizationAvailable", "currentMilestone", "currentStreak", "onlyLiveCertifiedData", "movementObservedOnly",
  "confirmedStarterOnly", "activeRosterOnly", "freshContextOnly", "noContextConflicts",
]);

export const PARLAY_RESEARCH_PLAN = Object.freeze([
  "Finding eligible upcoming events", "Finding verified normalized markets", "Checking lineups",
  "Checking injuries and weather", "Checking completed historical rows", "Comparing sportsbooks",
  "Evaluating Research Quality", "Evaluating Edge Trust", "Checking research correlation",
  "Building an evidence-backed research set",
]);

export const PARLAY_REFINEMENTS = Object.freeze([
  ["replace_weakest", "Replace weakest leg"], ["increase_quality", "Increase Research Quality"],
  ["increase_trust", "Increase Edge Trust"], ["improve_history", "Improve historical support"],
  ["diversify_books", "Diversify sportsbooks"],
  ["lower_correlation", "Lower correlation"], ["increase_payout", "Increase potential payout"],
  ["lower_risk", "Reduce injury risk"], ["confirmed_lineups", "Use confirmed lineups only"],
  ["different_games", "Only different games"], ["mlb_only", "Only MLB"],
  ["wnba_only", "Only WNBA"], ["ufc_only", "Only UFC"],
  ["remove_weather", "Remove weather concerns"], ["remove_injury", "Remove injury uncertainty"],
]);

export const PARLAY_PRESETS = Object.freeze([
  Object.freeze({ id: "fresh-cross-sport", title: "Fresh cross-sport research", constraints: Object.freeze({ freshDataOnly: true, noProviderConflicts: true, allowSameGame: false, maximumLegs: 4 }) }),
  Object.freeze({ id: "confirmed-lineups", title: "Confirmed lineups", constraints: Object.freeze({ freshDataOnly: true, confirmedLineupsOnly: true, noInjuryUncertainty: true, maximumLegs: 4 }) }),
  Object.freeze({ id: "historical-support", title: "Historical support", constraints: Object.freeze({ historicalSupportRequired: true, minimumResearchQuality: 70, maximumLegs: 4 }) }),
  Object.freeze({ id: "recently-moved-props", title: "Recently moved props", constraints: Object.freeze({ movementObservedOnly: true, minimumLineMovement: 0.5, maximumLegs: 4 }) }),
]);
