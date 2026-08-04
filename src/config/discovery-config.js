export const DISCOVERY_SCHEMA_VERSION = 1;
export const DISCOVERY_MIN_RESEARCH_QUALITY = 40;

export const DISCOVERY_ITEM_TYPES = Object.freeze([
  "athlete", "team", "fighter", "boxer", "driver", "golfer", "tennis_player",
  "league", "competition", "event", "story", "statistic", "leaderboard", "streak",
  "milestone", "record", "rivalry", "matchup", "visualization", "research_topic",
  "historical_topic", "market_topic", "saved_research", "recently_viewed",
  "suggested_query", "exploration_path",
]);

export const DISCOVERY_SCORE_WEIGHTS = Object.freeze({
  selectedLeague: 22,
  selectedSport: 12,
  preferredLeague: 7,
  preferredSport: 4,
  storyScore: 12,
  recency: 8,
  edgeTrust: 10,
  researchQuality: 10,
  drillDownDepth: 6,
  novelty: 5,
  localInterest: 7,
  availableMarket: 3,
  stalePenalty: 35,
  smallSamplePenalty: 8,
  repeatedDisplayPenalty: 10,
  partialCoveragePenalty: 12,
});

const topic = (id, label, statIds = [], options = {}) => Object.freeze({
  id, label, statIds: Object.freeze(statIds),
  category: options.category || "Research",
  entityTypes: Object.freeze(options.entityTypes || []),
  queryTemplate: options.queryTemplate || `Explore ${label.toLowerCase()}`,
  pathKind: options.pathKind || "leaderboard",
  marketRelevant: options.marketRelevant === true,
  evidenceKind: options.evidenceKind || (statIds.length ? "stat" : "relationship"),
});

export const SPORT_DISCOVERY_TAXONOMY = Object.freeze({
  basketball: Object.freeze([
    topic("basketball-scoring", "Scoring", ["basketball-points"], { marketRelevant: true }),
    topic("basketball-rebounds", "Rebounds", ["basketball-rebounds"], { marketRelevant: true }),
    topic("basketball-assists", "Assists", ["basketball-assists"], { marketRelevant: true }),
    topic("basketball-threes", "Three-pointers", ["basketball-three-pointers-made"], { marketRelevant: true }),
    topic("basketball-defense", "Defense", ["basketball-steals", "basketball-blocks"]),
    topic("basketball-efficiency", "Efficiency", ["basketball-field-goal-percentage"]),
    topic("basketball-streaks", "Streaks", ["basketball-points"], { pathKind: "streak" }),
    topic("basketball-milestones", "Milestones", ["basketball-points"], { pathKind: "milestone" }),
  ]),
  "american-football": Object.freeze([
    topic("football-passing", "Passing", ["football-passing-yards"], { marketRelevant: true }),
    topic("football-rushing", "Rushing", ["football-rushing-yards"], { marketRelevant: true }),
    topic("football-receiving", "Receiving", ["football-receiving-yards"], { marketRelevant: true }),
    topic("football-touchdowns", "Touchdowns", ["football-passing-touchdowns"], { marketRelevant: true }),
    topic("football-quarterbacks", "Quarterback comparisons", ["football-passing-yards"], { pathKind: "comparison" }),
  ]),
  baseball: Object.freeze([
    topic("baseball-hitting", "Hitting", ["baseball-hits"]),
    topic("baseball-pitching", "Pitching", ["baseball-pitcher-strikeouts"], { marketRelevant: true }),
    topic("baseball-home-runs", "Home runs", ["baseball-home-runs"], { marketRelevant: true }),
    topic("baseball-total-bases", "Total bases", ["baseball-total-bases"], { marketRelevant: true }),
    topic("baseball-strikeouts", "Strikeouts", ["baseball-pitcher-strikeouts"], { marketRelevant: true }),
    topic("baseball-stolen-bases", "Stolen bases", ["baseball-stolen-bases"]),
    topic("baseball-streaks", "Streaks", ["baseball-hits"], { pathKind: "streak" }),
  ]),
  "ice-hockey": Object.freeze([
    topic("hockey-goals", "Goals", ["hockey-goals"], { marketRelevant: true }),
    topic("hockey-assists", "Assists", ["hockey-assists"], { marketRelevant: true }),
    topic("hockey-points", "Points", ["hockey-points"], { marketRelevant: true }),
    topic("hockey-shots", "Shots on goal", ["hockey-shots-on-goal"], { marketRelevant: true }),
    topic("hockey-streaks", "Streaks", ["hockey-points"], { pathKind: "streak" }),
  ]),
  soccer: Object.freeze([
    topic("soccer-goals", "Goals", ["soccer-goals"], { marketRelevant: true }),
    topic("soccer-assists", "Assists", ["soccer-assists"]),
    topic("soccer-shots", "Shots", ["soccer-shots"], { marketRelevant: true }),
    topic("soccer-shots-target", "Shots on target", ["soccer-shots-on-target"], { marketRelevant: true }),
    topic("soccer-clean-sheets", "Clean sheets", ["soccer-clean-sheets"]),
    topic("soccer-rivalries", "Rivalries", [], { pathKind: "rivalry", evidenceKind: "relationship" }),
  ]),
  mma: Object.freeze([
    topic("mma-finishes", "Finishes", ["combat-wins"], { marketRelevant: true, entityTypes: ["fighter"] }),
    topic("mma-knockouts", "Knockouts", ["combat-knockout-wins"], { marketRelevant: true, entityTypes: ["fighter"] }),
    topic("mma-submissions", "Submissions", ["combat-submission-wins"], { marketRelevant: true, entityTypes: ["fighter"] }),
    topic("mma-striking", "Striking", ["combat-significant-strikes-landed"], { entityTypes: ["fighter"] }),
    topic("mma-upcoming", "Upcoming cards", [], { pathKind: "event", evidenceKind: "event" }),
  ]),
  boxing: Object.freeze([
    topic("boxing-knockouts", "Knockouts", ["combat-knockout-wins"], { marketRelevant: true, entityTypes: ["boxer"] }),
    topic("boxing-decisions", "Decisions", ["combat-decision-wins"], { entityTypes: ["boxer"] }),
    topic("boxing-striking", "Striking", ["combat-knockdowns"], { entityTypes: ["boxer"] }),
    topic("boxing-upcoming", "Upcoming cards", [], { pathKind: "event", evidenceKind: "event" }),
  ]),
  motorsport: Object.freeze([
    topic("motorsport-wins", "Wins", ["motorsport-wins"]),
    topic("motorsport-podiums", "Podiums", ["motorsport-podiums"], { marketRelevant: true }),
    topic("motorsport-top-finishes", "Top finishes", ["motorsport-top-ten-finishes"], { marketRelevant: true }),
    topic("motorsport-qualifying", "Qualifying", ["motorsport-poles"]),
    topic("motorsport-position-gain", "Position gain", ["motorsport-position-change"]),
    topic("motorsport-track-history", "Track history", ["motorsport-average-finishing-position"], { pathKind: "comparison" }),
  ]),
  golf: Object.freeze([
    topic("golf-course-history", "Course history", [], { entityTypes: ["golfer"], pathKind: "historical", evidenceKind: "relationship", marketRelevant: true }),
    topic("golf-tournament-history", "Tournament history", [], { entityTypes: ["golfer"], pathKind: "historical", evidenceKind: "relationship" }),
  ]),
  tennis: Object.freeze([
    topic("tennis-surface-splits", "Surface splits", [], { entityTypes: ["tennis-player"], pathKind: "split", evidenceKind: "relationship", marketRelevant: true }),
    topic("tennis-head-to-head", "Head-to-head", [], { entityTypes: ["tennis-player"], pathKind: "comparison", evidenceKind: "relationship" }),
  ]),
});

export const EXPLORATION_CATEGORIES = Object.freeze([
  "Players and Competitors", "Teams and Organizations", "Current Leaders",
  "Recent Performances", "Active Streaks", "Milestones", "Records", "Matchups",
  "Rivalries", "History", "Visuals", "Stories", "Markets", "Upcoming Events",
]);

export const DISCOVERY_LIMITS = Object.freeze({ homepage: 6, trending: 6, continue: 4, changes: 5, related: 8, search: 18, explorePage: 18 });
