const DEFAULT_SPLITS = Object.freeze(["home", "away", "wins", "losses", "opponent", "regular-season", "playoffs"]);
const DEFAULT_PERIODS = Object.freeze(["full-event"]);

function stat(id, displayName, shortName, sportIds, options = {}) {
  return Object.freeze({
    id,
    displayName,
    shortName,
    sportIds: Object.freeze(sportIds),
    leagueIds: Object.freeze(options.leagueIds || []),
    entityType: options.entityType || "player",
    valueType: options.valueType || "number",
    aggregationTypes: Object.freeze(options.aggregationTypes || ["sum", "average", "minimum", "maximum"]),
    unit: options.unit || "count",
    higherIsBetter: options.higherIsBetter !== false,
    providerAliases: Object.freeze(options.providerAliases || []),
    searchTerms: Object.freeze(options.searchTerms || []),
    displayOrder: options.displayOrder || 999,
    description: options.description || displayName,
    availableSplits: Object.freeze(options.availableSplits || DEFAULT_SPLITS),
    compatiblePeriods: Object.freeze(options.compatiblePeriods || DEFAULT_PERIODS),
    derivedFrom: Object.freeze(options.derivedFrom || []),
    formula: options.formula || "",
    enabled: options.enabled !== false,
  });
}

const percentage = {
  valueType: "percentage",
  aggregationTypes: ["average", "minimum", "maximum"],
  unit: "percent",
};

const basketball = [
  ["basketball-games-played", "Games played", "GP"],
  ["basketball-minutes", "Minutes", "MIN", { unit: "minutes" }],
  ["basketball-points", "Points", "PTS"],
  ["basketball-rebounds", "Rebounds", "REB"],
  ["basketball-offensive-rebounds", "Offensive rebounds", "OREB"],
  ["basketball-defensive-rebounds", "Defensive rebounds", "DREB"],
  ["basketball-assists", "Assists", "AST"],
  ["basketball-steals", "Steals", "STL"],
  ["basketball-blocks", "Blocks", "BLK"],
  ["basketball-turnovers", "Turnovers", "TOV", { higherIsBetter: false }],
  ["basketball-assist-to-turnover-ratio", "Assist-to-turnover ratio", "AST/TOV", {
    unit: "ratio", aggregationTypes: ["average"], derivedFrom: ["basketball-assists", "basketball-turnovers"],
    formula: "assists / turnovers",
  }],
  ["basketball-field-goals-made", "Field goals made", "FGM"],
  ["basketball-field-goals-attempted", "Field goals attempted", "FGA"],
  ["basketball-field-goal-percentage", "Field-goal percentage", "FG%", percentage],
  ["basketball-three-pointers-made", "Three-pointers made", "3PM", { searchTerms: ["threes", "three pointers"] }],
  ["basketball-three-pointers-attempted", "Three-pointers attempted", "3PA"],
  ["basketball-three-point-percentage", "Three-point percentage", "3P%", percentage],
  ["basketball-free-throws-made", "Free throws made", "FTM"],
  ["basketball-free-throws-attempted", "Free throws attempted", "FTA"],
  ["basketball-free-throw-percentage", "Free-throw percentage", "FT%", percentage],
  ["basketball-personal-fouls", "Personal fouls", "PF", { higherIsBetter: false }],
  ["basketball-plus-minus", "Plus-minus", "+/-", { providerAliases: ["plus_minus"] }],
];

const football = [
  ["football-passing-yards", "Passing yards", "PASS YDS", { unit: "yards" }],
  ["football-passing-attempts", "Passing attempts", "ATT"],
  ["football-completions", "Completions", "CMP"],
  ["football-completion-percentage", "Completion percentage", "CMP%", {
    ...percentage, derivedFrom: ["football-completions", "football-passing-attempts"],
    formula: "completions / attempts × 100",
  }],
  ["football-yards-per-attempt", "Passing yards per attempt", "Y/A", {
    unit: "ratio", derivedFrom: ["football-passing-yards", "football-passing-attempts"],
    formula: "passing yards / attempts",
  }],
  ["football-passing-touchdowns", "Passing touchdowns", "PASS TD"],
  ["football-interceptions", "Interceptions", "INT", { higherIsBetter: false, searchTerms: ["interceptions thrown"] }],
  ["football-rushing-yards", "Rushing yards", "RUSH YDS", { unit: "yards" }],
  ["football-rushing-attempts", "Rushing attempts", "RUSH ATT"],
  ["football-yards-per-carry", "Yards per carry", "YPC", {
    unit: "ratio", derivedFrom: ["football-rushing-yards", "football-rushing-attempts"],
    formula: "rushing yards / rushing attempts",
  }],
  ["football-rushing-touchdowns", "Rushing touchdowns", "RUSH TD"],
  ["football-receptions", "Receptions", "REC"],
  ["football-targets", "Targets", "TGT"],
  ["football-receiving-yards", "Receiving yards", "REC YDS", { unit: "yards" }],
  ["football-receiving-touchdowns", "Receiving touchdowns", "REC TD"],
  ["football-yards-per-reception", "Yards per reception", "Y/R", {
    unit: "ratio", derivedFrom: ["football-receiving-yards", "football-receptions"],
    formula: "receiving yards / receptions",
  }],
  ["football-total-touches", "Total touches", "TOUCH", {
    derivedFrom: ["football-rushing-attempts", "football-receptions"],
    formula: "rushing attempts + receptions",
  }],
  ["football-tackles", "Tackles", "TACK"],
  ["football-assisted-tackles", "Assisted tackles", "AST TACK"],
  ["football-sacks", "Sacks", "SACK"],
  ["football-field-goals-made", "Field goals made", "FGM"],
];

const baseball = [
  ["baseball-games", "Games", "G"],
  ["baseball-plate-appearances", "Plate appearances", "PA"],
  ["baseball-at-bats", "At-bats", "AB"],
  ["baseball-hits", "Hits", "H"],
  ["baseball-total-bases", "Total bases", "TB", {
    derivedFrom: ["baseball-singles", "baseball-doubles", "baseball-triples", "baseball-home-runs"],
    formula: "singles + 2×doubles + 3×triples + 4×home runs",
  }],
  ["baseball-singles", "Singles", "1B"],
  ["baseball-doubles", "Doubles", "2B"],
  ["baseball-triples", "Triples", "3B"],
  ["baseball-home-runs", "Home runs", "HR", { searchTerms: ["homers", "home-run"] }],
  ["baseball-runs", "Runs", "R"],
  ["baseball-runs-batted-in", "Runs batted in", "RBI"],
  ["baseball-walks", "Walks", "BB"],
  ["baseball-strikeouts", "Strikeouts", "SO", { higherIsBetter: false }],
  ["baseball-stolen-bases", "Stolen bases", "SB"],
  ["baseball-batting-average", "Batting average", "AVG", {
    ...percentage, unit: "ratio", derivedFrom: ["baseball-hits", "baseball-at-bats"], formula: "hits / at-bats",
  }],
  ["baseball-on-base-percentage", "On-base percentage", "OBP", {
    ...percentage, unit: "ratio", derivedFrom: ["baseball-hits", "baseball-walks", "baseball-plate-appearances"],
    formula: "(hits + walks) / plate appearances",
  }],
  ["baseball-slugging-percentage", "Slugging percentage", "SLG", {
    ...percentage, unit: "ratio", derivedFrom: ["baseball-total-bases", "baseball-at-bats"], formula: "total bases / at-bats",
  }],
  ["baseball-innings-pitched", "Innings pitched", "IP", { unit: "innings" }],
  ["baseball-pitcher-strikeouts", "Pitcher strikeouts", "K", { searchTerms: ["pitching strikeouts"] }],
  ["baseball-strikeouts-per-nine", "Strikeouts per nine innings", "K/9", {
    unit: "rate", derivedFrom: ["baseball-pitcher-strikeouts", "baseball-innings-pitched"],
    formula: "strikeouts / innings × 9",
  }],
  ["baseball-hits-allowed", "Hits allowed", "H"],
  ["baseball-earned-runs", "Earned runs", "ER", { higherIsBetter: false }],
  ["baseball-walks-allowed", "Walks allowed", "BB", { higherIsBetter: false }],
  ["baseball-era", "Earned-run average", "ERA", { higherIsBetter: false, unit: "rate" }],
  ["baseball-whip", "WHIP", "WHIP", { higherIsBetter: false, unit: "rate" }],
];

const hockey = [
  ["hockey-games", "Games", "G"],
  ["hockey-goals", "Goals", "G"],
  ["hockey-assists", "Assists", "A"],
  ["hockey-points", "Points", "PTS"],
  ["hockey-shots-on-goal", "Shots on goal", "SOG", { searchTerms: ["shots"] }],
  ["hockey-blocked-shots", "Blocked shots", "BLK"],
  ["hockey-hits", "Hits", "HIT"],
  ["hockey-penalty-minutes", "Penalty minutes", "PIM", { higherIsBetter: false, unit: "minutes" }],
  ["hockey-power-play-goals", "Power-play goals", "PPG"],
  ["hockey-power-play-points", "Power-play points", "PPP"],
  ["hockey-saves", "Saves", "SV"],
  ["hockey-save-percentage", "Save percentage", "SV%", percentage],
  ["hockey-goals-against", "Goals against", "GA", { higherIsBetter: false }],
  ["hockey-goals-against-average", "Goals-against average", "GAA", { higherIsBetter: false, unit: "rate" }],
  ["hockey-wins", "Goalie wins", "W"],
  ["hockey-shutouts", "Shutouts", "SO"],
  ["hockey-time-on-ice", "Time on ice", "TOI", { unit: "minutes" }],
];

const soccer = [
  ["soccer-appearances", "Appearances", "APP"],
  ["soccer-starts", "Starts", "START"],
  ["soccer-minutes", "Minutes", "MIN", { unit: "minutes" }],
  ["soccer-goals", "Goals", "G"],
  ["soccer-assists", "Assists", "A"],
  ["soccer-shots", "Shots", "SH"],
  ["soccer-shots-on-target", "Shots on target", "SOT"],
  ["soccer-passes", "Passes", "PASS"],
  ["soccer-pass-completion-percentage", "Pass completion percentage", "PASS%", percentage],
  ["soccer-chances-created", "Chances created", "CC"],
  ["soccer-tackles", "Tackles", "TACK"],
  ["soccer-interceptions", "Interceptions", "INT"],
  ["soccer-fouls-committed", "Fouls committed", "FC", { higherIsBetter: false }],
  ["soccer-fouls-drawn", "Fouls drawn", "FD"],
  ["soccer-yellow-cards", "Yellow cards", "YC", { higherIsBetter: false }],
  ["soccer-red-cards", "Red cards", "RC", { higherIsBetter: false }],
  ["soccer-offsides", "Offsides", "OFF", { higherIsBetter: false }],
  ["soccer-goalkeeper-saves", "Goalkeeper saves", "SV"],
  ["soccer-clean-sheets", "Clean sheets", "CS"],
  ["soccer-goals-allowed", "Goals allowed", "GA", { higherIsBetter: false }],
  ["soccer-save-percentage", "Save percentage", "SV%", {
    ...percentage, derivedFrom: ["soccer-goalkeeper-saves", "soccer-goals-allowed"],
    formula: "saves / (saves + goals allowed) × 100",
  }],
  ["soccer-corners", "Corners", "CORN", { entityType: "team" }],
];

const combat = [
  ["combat-wins", "Wins", "W"],
  ["combat-losses", "Losses", "L", { higherIsBetter: false }],
  ["combat-draws", "Draws", "D"],
  ["combat-knockout-wins", "Knockout wins", "KO"],
  ["combat-submission-wins", "Submission wins", "SUB"],
  ["combat-decision-wins", "Decision wins", "DEC"],
  ["combat-knockout-rate", "Knockout rate", "KO%", {
    ...percentage, derivedFrom: ["combat-knockout-wins", "combat-wins", "combat-losses", "combat-draws"],
    formula: "knockout wins / completed fights × 100",
  }],
  ["combat-submission-rate", "Submission rate", "SUB%", {
    ...percentage, derivedFrom: ["combat-submission-wins", "combat-wins", "combat-losses", "combat-draws"],
    formula: "submission wins / completed fights × 100",
  }],
  ["combat-decision-rate", "Decision rate", "DEC%", {
    ...percentage, derivedFrom: ["combat-decision-wins", "combat-wins", "combat-losses", "combat-draws"],
    formula: "decision wins / completed fights × 100",
  }],
  ["combat-significant-strikes-landed", "Significant strikes landed", "SIG STR"],
  ["combat-significant-strikes-absorbed", "Significant strikes absorbed", "SIG ABS", { higherIsBetter: false }],
  ["combat-significant-strikes-landed-per-minute", "Significant strikes landed per minute", "SLpM", {
    unit: "rate", derivedFrom: ["combat-significant-strikes-landed", "combat-average-fight-time"],
    formula: "significant strikes landed / fight minutes",
  }],
  ["combat-significant-strikes-absorbed-per-minute", "Significant strikes absorbed per minute", "SApM", {
    unit: "rate", higherIsBetter: false,
    derivedFrom: ["combat-significant-strikes-absorbed", "combat-average-fight-time"],
    formula: "significant strikes absorbed / fight minutes",
  }],
  ["combat-striking-differential", "Striking differential", "DIFF", {
    derivedFrom: ["combat-significant-strikes-landed", "combat-significant-strikes-absorbed"],
    formula: "significant strikes landed - absorbed",
  }],
  ["combat-takedown-average", "Takedown average", "TD AVG", {
    unit: "rate", derivedFrom: ["combat-takedowns-landed"], formula: "takedowns per fight",
  }],
  ["combat-takedowns-landed", "Takedowns landed", "TD"],
  ["combat-takedown-accuracy", "Takedown accuracy", "TD%", percentage],
  ["combat-submission-attempts", "Submission attempts", "SUB ATT"],
  ["combat-knockdowns", "Knockdowns", "KD"],
  ["combat-average-fight-time", "Average fight time", "AFT", { unit: "minutes" }],
];

const motorsport = [
  ["motorsport-starts", "Starts", "START"],
  ["motorsport-wins", "Wins", "W"],
  ["motorsport-podiums", "Podiums", "POD"],
  ["motorsport-top-five-finishes", "Top-five finishes", "T5"],
  ["motorsport-top-ten-finishes", "Top-ten finishes", "T10"],
  ["motorsport-poles", "Poles", "POLE"],
  ["motorsport-fastest-laps", "Fastest laps", "FL"],
  ["motorsport-points", "Points", "PTS"],
  ["motorsport-average-starting-position", "Average starting position", "AVG START", { higherIsBetter: false, unit: "position" }],
  ["motorsport-average-finishing-position", "Average finishing position", "AVG FIN", {
    higherIsBetter: false,
    unit: "position",
    searchTerms: ["average finish", "average finishing", "finishing position"],
  }],
  ["motorsport-position-change", "Average position gain", "POS +/-", {
    derivedFrom: ["motorsport-average-starting-position", "motorsport-average-finishing-position"],
    formula: "starting position - finishing position",
  }],
  ["motorsport-laps-led", "Laps led", "LAPS"],
  ["motorsport-dnfs", "DNFs", "DNF", { higherIsBetter: false }],
];

const definitions = [
  ...basketball.map(([id, name, shortName, options]) => stat(id, name, shortName, ["basketball"], options)),
  ...football.map(([id, name, shortName, options]) => stat(id, name, shortName, ["american-football"], options)),
  ...baseball.map(([id, name, shortName, options]) => stat(id, name, shortName, ["baseball"], {
    availableSplits: [...DEFAULT_SPLITS, "vs-left-handed", "vs-right-handed"],
    ...options,
  })),
  ...hockey.map(([id, name, shortName, options]) => stat(id, name, shortName, ["ice-hockey"], options)),
  ...soccer.map(([id, name, shortName, options]) => stat(id, name, shortName, ["soccer"], {
    compatiblePeriods: ["full-event", "first-half", "second-half"],
    ...options,
  })),
  ...combat.map(([id, name, shortName, options]) => stat(id, name, shortName, ["mma", "boxing", "combat", "kickboxing"], {
    entityType: "competitor",
    availableSplits: ["wins", "losses", "opponent"],
    ...options,
  })),
  ...motorsport.map(([id, name, shortName, options]) => stat(id, name, shortName, ["motorsport"], {
    entityType: "competitor",
    availableSplits: ["season", "track", "manufacturer"],
    ...options,
  })),
].map((definition, index) => Object.freeze({ ...definition, displayOrder: index + 1 }));

export const STAT_REGISTRY = Object.freeze(definitions);
export const STAT_REGISTRY_BY_ID = new Map(STAT_REGISTRY.map((definition) => [definition.id, definition]));

export function getStatDefinition(id) {
  return STAT_REGISTRY_BY_ID.get(id) || null;
}

export function getAvailableStats(sportId, leagueId = "") {
  return STAT_REGISTRY.filter((definition) =>
    definition.enabled
    && definition.sportIds.includes(sportId)
    && (!definition.leagueIds.length || definition.leagueIds.includes(leagueId)));
}

export function resolveStatDefinition(value, { sportId = "", leagueId = "" } = {}) {
  const text = String(value || "").toLowerCase().replaceAll(/[^a-z0-9%]+/g, " ").trim();
  if (!text) return null;
  const candidates = getAvailableStats(sportId, leagueId);
  return candidates
    .map((definition) => {
      const terms = [
        definition.id,
        definition.displayName,
        definition.shortName,
        ...definition.providerAliases,
        ...definition.searchTerms,
      ].map((term) => String(term).toLowerCase().replaceAll(/[^a-z0-9%]+/g, " ").trim());
      const matched = terms.filter((term) => term && (` ${text} `).includes(` ${term} `));
      return { definition, score: matched.reduce((best, term) => Math.max(best, term.length), 0) };
    })
    .sort((a, b) => b.score - a.score || a.definition.displayOrder - b.definition.displayOrder)
    .find((candidate) => candidate.score > 0)?.definition || null;
}
