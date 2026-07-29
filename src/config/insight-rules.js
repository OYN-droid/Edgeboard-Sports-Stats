const freezeRule = (rule) => Object.freeze({
  applicableLeagues: Object.freeze([]),
  requiredDataFields: Object.freeze(["event_id", "event_date", "status", "stats"]),
  minimumSampleSize: 3,
  minimumCoverage: 0.6,
  thresholdConfiguration: Object.freeze({}),
  comparisonPool: "same-league-qualified-entities",
  timeWindow: Object.freeze({ type: "season" }),
  priorityWeight: 50,
  noveltyWeight: 10,
  rarityWeight: 10,
  recencyWeight: 10,
  bettingRelevanceWeight: 0,
  maximumInstances: 1,
  mutuallyExclusiveRules: Object.freeze([]),
  suppressionRules: Object.freeze([]),
  enabled: true,
  ...rule,
  applicableSports: Object.freeze(rule.applicableSports || []),
  applicableLeagues: Object.freeze(rule.applicableLeagues || []),
  applicableEntityTypes: Object.freeze(rule.applicableEntityTypes || ["player", "competitor", "team"]),
  requiredStats: Object.freeze(rule.requiredStats || []),
  requiredDataFields: Object.freeze(rule.requiredDataFields || ["event_id", "event_date", "status", "stats"]),
  thresholdConfiguration: Object.freeze(rule.thresholdConfiguration || {}),
  timeWindow: Object.freeze(rule.timeWindow || { type: "season" }),
  mutuallyExclusiveRules: Object.freeze(rule.mutuallyExclusiveRules || []),
  suppressionRules: Object.freeze(rule.suppressionRules || []),
});

export const INSIGHT_VALIDATION_STATES = Object.freeze([
  "verified_complete", "provider_asserted", "dataset_only", "partial_coverage",
  "incomplete", "stale", "unsupported", "invalid",
]);

export const RARITY_LABELS = Object.freeze([
  Object.freeze({ id: "exceptionally-rare", maximumRate: 0.02, label: "Exceptionally rare" }),
  Object.freeze({ id: "rare", maximumRate: 0.08, label: "Rare" }),
  Object.freeze({ id: "uncommon", maximumRate: 0.2, label: "Uncommon" }),
  Object.freeze({ id: "notable", maximumRate: 0.4, label: "Notable" }),
  Object.freeze({ id: "common", maximumRate: 1, label: "Common" }),
]);

export const INSIGHT_SCORE_WEIGHTS = Object.freeze({
  recency: 0.14,
  rarity: 0.15,
  magnitude: 0.12,
  streakLength: 0.12,
  milestone: 0.12,
  queryRelevance: 0.13,
  scopeRelevance: 0.08,
  bettingRelevance: 0.04,
  completeness: 0.14,
  novelty: 0.08,
  smallSamplePenalty: 0.12,
  stalePenalty: 0.4,
  duplicationPenalty: 0.3,
});

export const INSIGHT_DISPLAY_LIMITS = Object.freeze({
  profileOverview: 1,
  profileInsights: 8,
  home: 4,
  queryResult: 8,
  leaderboard: 2,
  comparison: 2,
  event: 4,
  shareCard: 1,
});

export const MILESTONE_SEQUENCES = Object.freeze({
  basketball: Object.freeze({
    "basketball-points": Object.freeze([50, 100, 250, 300, 500, 1000]),
    "basketball-assists": Object.freeze([25, 50, 100, 250, 500]),
    "basketball-rebounds": Object.freeze([25, 50, 100, 250, 500]),
    "basketball-three-pointers-made": Object.freeze([25, 50, 100, 250]),
  }),
  "american-football": Object.freeze({
    "football-passing-yards": Object.freeze([500, 1000, 2500, 5000]),
    "football-passing-touchdowns": Object.freeze([10, 25, 50, 100]),
    "football-rushing-yards": Object.freeze([250, 500, 1000]),
    "football-receptions": Object.freeze([25, 50, 100]),
  }),
  baseball: Object.freeze({
    "baseball-hits": Object.freeze([10, 25, 50, 100, 250]),
    "baseball-home-runs": Object.freeze([5, 10, 25, 50]),
    "baseball-pitcher-strikeouts": Object.freeze([25, 50, 100, 250]),
    "baseball-innings-pitched": Object.freeze([25, 50, 100]),
  }),
  "ice-hockey": Object.freeze({
    "hockey-goals": Object.freeze([5, 10, 25, 50]),
    "hockey-assists": Object.freeze([5, 10, 25, 50]),
    "hockey-points": Object.freeze([10, 25, 50, 100]),
    "hockey-saves": Object.freeze([100, 250, 500, 1000]),
  }),
  soccer: Object.freeze({
    "soccer-goals": Object.freeze([5, 10, 25, 50]),
    "soccer-assists": Object.freeze([5, 10, 25, 50]),
    "soccer-appearances": Object.freeze([10, 25, 50, 100]),
    "soccer-clean-sheets": Object.freeze([5, 10, 25]),
  }),
  combat: Object.freeze({
    "combat-wins": Object.freeze([5, 10, 20, 25]),
    "combat-knockout-wins": Object.freeze([5, 10, 20]),
    "combat-submission-wins": Object.freeze([5, 10, 20]),
  }),
  motorsport: Object.freeze({
    "motorsport-starts": Object.freeze([5, 10, 25, 50, 100]),
    "motorsport-wins": Object.freeze([5, 10, 25]),
    "motorsport-podiums": Object.freeze([5, 10, 25, 50]),
    "motorsport-poles": Object.freeze([5, 10, 25]),
    "motorsport-points": Object.freeze([50, 100, 250, 500]),
  }),
});

const rules = [
  ["basketball-assist-threshold-streak", "Assist streak", "assist_streak", ["basketball"], ["basketball-assists"], { operator: "gte", value: 6 }],
  ["basketball-three-pointer-streak", "Three-pointer streak", "shot_streak", ["basketball"], ["basketball-three-pointers-made"], { operator: "gte", value: 2 }],
  ["basketball-multi-stat-20-5-5", "20/5/5 performance", "multi_stat_threshold", ["basketball"], ["basketball-points", "basketball-rebounds", "basketball-assists"], { thresholds: [20, 5, 5] }],
  ["football-passing-touchdown-streak", "Passing-touchdown streak", "scoring_streak", ["american-football"], ["football-passing-touchdowns"], { operator: "gte", value: 1 }],
  ["football-interception-free-streak", "Interception-free streak", "threshold_streak", ["american-football"], ["football-interceptions"], { operator: "lte", value: 0 }],
  ["baseball-hit-streak", "Hit streak", "hit_streak", ["baseball"], ["baseball-hits"], { operator: "gte", value: 1 }],
  ["baseball-pitcher-strikeout-streak", "Pitcher strikeout streak", "threshold_streak", ["baseball"], ["baseball-pitcher-strikeouts"], { operator: "gte", value: 6 }],
  ["hockey-point-streak", "Point streak", "point_streak", ["ice-hockey"], ["hockey-points"], { operator: "gte", value: 1 }],
  ["hockey-shot-streak", "Shots-on-goal streak", "shot_streak", ["ice-hockey"], ["hockey-shots-on-goal"], { operator: "gte", value: 3 }],
  ["hockey-save-streak", "Save streak", "save_streak", ["ice-hockey"], ["hockey-saves"], { operator: "gte", value: 25 }],
  ["soccer-shot-on-target-streak", "Shots-on-target streak", "shot_streak", ["soccer"], ["soccer-shots-on-target"], { operator: "gte", value: 1 }],
  ["soccer-goal-contribution-streak", "Goal-contribution streak", "point_streak", ["soccer"], ["soccer-goals", "soccer-assists"], { sumOperator: "gte", value: 1 }],
  ["soccer-clean-sheet-streak", "Clean-sheet streak", "appearance_streak", ["soccer"], ["soccer-clean-sheets"], { operator: "gte", value: 1 }],
  ["combat-finish-streak", "Finish streak", "finish_streak", ["mma", "boxing", "kickboxing"], ["combat-wins"], {
    methodMatchesBySport: {
      mma: ["KO/TKO", "Submission"],
      boxing: ["KO/TKO"],
      kickboxing: ["KO/TKO"],
    },
  }],
  ["combat-submission-streak", "Submission streak", "finish_streak", ["mma"], ["combat-submission-wins"], { operator: "gte", value: 1 }],
  ["combat-win-streak", "Win streak", "win_streak", ["mma", "boxing", "kickboxing"], ["combat-wins"], { operator: "gte", value: 1 }],
  ["motorsport-points-finish-streak", "Points-finish streak", "point_streak", ["motorsport"], ["motorsport-points"], { operator: "gt", value: 0 }],
  ["motorsport-top-ten-streak", "Top-10 streak", "top_finish_streak", ["motorsport"], ["motorsport-average-finishing-position"], { operator: "lte", value: 10 }],
  ["motorsport-podium-streak", "Podium streak", "podium_streak", ["motorsport"], ["motorsport-podiums"], { operator: "gte", value: 1 }],
].map(([ruleId, displayName, insightType, applicableSports, requiredStats, thresholdConfiguration]) =>
  freezeRule({
    ruleId,
    displayName,
    insightType,
    applicableSports,
    requiredStats,
    thresholdConfiguration,
    wordingTemplateId: "streak",
    description: `Deterministically evaluates ${displayName.toLowerCase()} from ordered completed appearances.`,
    priorityWeight: 72,
    bettingRelevanceWeight: 12,
  }));

const generalRules = [
  freezeRule({
    ruleId: "recent-stat-high", displayName: "Recent high", insightType: "recent_high",
    applicableSports: ["basketball", "american-football", "baseball", "ice-hockey", "soccer", "mma", "boxing", "motorsport"],
    requiredStats: [], wordingTemplateId: "high", minimumSampleSize: 3, priorityWeight: 54,
    description: "Finds the maximum supplied value in the selected completed-event scope.",
  }),
  freezeRule({
    ruleId: "available-season-high", displayName: "Season high", insightType: "season_high",
    applicableSports: ["basketball", "american-football", "baseball", "ice-hockey", "soccer", "mma", "boxing", "motorsport"],
    requiredStats: [], wordingTemplateId: "high", minimumSampleSize: 3, priorityWeight: 62,
    mutuallyExclusiveRules: ["recent-stat-high"],
    description: "Finds a current-season high within available provider rows.",
  }),
  freezeRule({
    ruleId: "recent-vs-season-trend", displayName: "Recent trend", insightType: "improvement_trend",
    applicableSports: ["basketball", "american-football", "baseball", "ice-hockey", "soccer", "mma", "boxing", "motorsport"],
    requiredStats: [], wordingTemplateId: "trend", minimumSampleSize: 5,
    thresholdConfiguration: { recentWindow: 3, minimumRelativeDifference: 0.08 }, priorityWeight: 58,
    description: "Compares the latest block with the preceding season sample.",
  }),
  freezeRule({
    ruleId: "home-away-stat-difference", displayName: "Home-away difference", insightType: "home_away_difference",
    applicableSports: ["basketball", "american-football", "baseball", "ice-hockey", "soccer"],
    requiredStats: [], wordingTemplateId: "split", minimumSampleSize: 4,
    thresholdConfiguration: { minimumGroupSize: 2, minimumRelativeDifference: 0.08 }, priorityWeight: 48,
    description: "Compares home and away completed-event averages without causal wording.",
  }),
  freezeRule({
    ruleId: "stat-consistency", displayName: "Stat consistency", insightType: "consistency_insight",
    applicableSports: ["basketball", "american-football", "baseball", "ice-hockey", "soccer", "mma", "boxing", "motorsport"],
    requiredStats: [], wordingTemplateId: "consistency", minimumSampleSize: 5, priorityWeight: 42,
    thresholdConfiguration: { maximumCoefficientOfVariation: 0.22 },
    description: "Uses standard deviation and coefficient of variation where mathematically valid.",
  }),
  freezeRule({
    ruleId: "available-data-milestone", displayName: "Milestone proximity", insightType: "milestone_proximity",
    applicableSports: ["basketball", "american-football", "baseball", "ice-hockey", "soccer", "mma", "boxing", "motorsport"],
    requiredStats: [], wordingTemplateId: "milestone", minimumSampleSize: 3, priorityWeight: 64,
    thresholdConfiguration: { maximumRemainingRatio: 0.35 }, description: "Finds configured round-number milestones in available records.",
  }),
  freezeRule({
    ruleId: "available-data-record-candidate", displayName: "Dataset high candidate", insightType: "record_candidate",
    applicableSports: ["basketball", "american-football", "baseball", "ice-hockey", "soccer", "mma", "boxing", "motorsport"],
    requiredStats: [], wordingTemplateId: "record", minimumSampleSize: 3, priorityWeight: 40,
    description: "Creates a cautious dataset-only record candidate with supporting-event validation.",
  }),
];

export const INSIGHT_RULES = Object.freeze([...rules, ...generalRules]);

export function getInsightRule(ruleId) {
  return INSIGHT_RULES.find((rule) => rule.ruleId === ruleId) || null;
}

export function getEligibleInsightRules({ sportId, leagueId = "", entityType = "player", availableStats = [] } = {}) {
  const stats = new Set(availableStats);
  return INSIGHT_RULES.filter((rule) =>
    rule.enabled
    && rule.applicableSports.includes(sportId)
    && (!rule.applicableLeagues.length || rule.applicableLeagues.includes(leagueId))
    && rule.applicableEntityTypes.includes(entityType)
    && rule.requiredStats.every((statId) => stats.has(statId)));
}

export function getMilestonesForSport(sportId) {
  const key = ["mma", "boxing", "kickboxing"].includes(sportId) ? "combat" : sportId;
  return MILESTONE_SEQUENCES[key] || Object.freeze({});
}
