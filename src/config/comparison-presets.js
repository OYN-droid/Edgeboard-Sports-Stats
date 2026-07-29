const preset = (primary, supporting = primary) => Object.freeze({
  primary: Object.freeze(primary),
  supporting: Object.freeze(supporting),
});

export const COMPARISON_PRESETS = Object.freeze({
  basketball: Object.freeze({
    default: preset([
      "basketball-points", "basketball-rebounds", "basketball-assists",
      "basketball-three-pointers-made", "basketball-steals", "basketball-blocks",
      "basketball-turnovers", "basketball-minutes", "basketball-field-goal-percentage",
      "basketball-three-point-percentage",
    ]),
    guard: preset([
      "basketball-points", "basketball-assists", "basketball-three-pointers-made",
      "basketball-turnovers", "basketball-assist-to-turnover-ratio", "basketball-minutes",
    ]),
    forward: preset([
      "basketball-points", "basketball-rebounds", "basketball-blocks",
      "basketball-field-goal-percentage", "basketball-offensive-rebounds", "basketball-minutes",
    ]),
    center: preset([
      "basketball-points", "basketball-rebounds", "basketball-blocks",
      "basketball-field-goal-percentage", "basketball-offensive-rebounds", "basketball-minutes",
    ]),
  }),
  "american-football": Object.freeze({
    default: preset(["football-passing-yards", "football-passing-touchdowns", "football-interceptions"]),
    quarterback: preset([
      "football-passing-yards", "football-completion-percentage",
      "football-passing-touchdowns", "football-interceptions",
      "football-yards-per-attempt", "football-rushing-yards", "football-rushing-touchdowns",
    ]),
    "running back": preset([
      "football-rushing-yards", "football-yards-per-carry", "football-rushing-touchdowns",
      "football-receptions", "football-receiving-yards", "football-total-touches",
    ]),
    receiver: preset([
      "football-receptions", "football-receiving-yards", "football-receiving-touchdowns",
      "football-yards-per-reception", "football-targets",
    ]),
  }),
  baseball: Object.freeze({
    default: preset(["baseball-hits", "baseball-home-runs", "baseball-runs-batted-in"]),
    batter: preset([
      "baseball-batting-average", "baseball-on-base-percentage", "baseball-slugging-percentage",
      "baseball-home-runs", "baseball-runs-batted-in", "baseball-runs", "baseball-hits",
      "baseball-total-bases", "baseball-walks", "baseball-strikeouts",
    ]),
    pitcher: preset([
      "baseball-era", "baseball-whip", "baseball-pitcher-strikeouts",
      "baseball-innings-pitched", "baseball-walks-allowed", "baseball-hits-allowed",
      "baseball-earned-runs", "baseball-strikeouts-per-nine",
    ]),
  }),
  "ice-hockey": Object.freeze({
    default: preset(["hockey-goals", "hockey-assists", "hockey-points", "hockey-shots-on-goal"]),
    skater: preset([
      "hockey-goals", "hockey-assists", "hockey-points", "hockey-shots-on-goal",
      "hockey-blocked-shots", "hockey-hits", "hockey-power-play-points", "hockey-time-on-ice",
    ]),
    goalie: preset([
      "hockey-wins", "hockey-save-percentage", "hockey-goals-against-average",
      "hockey-saves", "hockey-shutouts", "hockey-goals-against",
    ]),
  }),
  soccer: Object.freeze({
    default: preset([
      "soccer-goals", "soccer-assists", "soccer-shots", "soccer-shots-on-target",
      "soccer-chances-created", "soccer-passes", "soccer-pass-completion-percentage",
      "soccer-tackles", "soccer-minutes",
    ]),
    goalkeeper: preset([
      "soccer-goalkeeper-saves", "soccer-clean-sheets", "soccer-goals-allowed",
      "soccer-save-percentage", "soccer-appearances",
    ]),
  }),
  combat: Object.freeze({
    default: preset([
      "combat-wins", "combat-losses", "combat-knockout-rate", "combat-submission-rate",
      "combat-decision-rate", "combat-significant-strikes-landed-per-minute",
      "combat-significant-strikes-absorbed-per-minute", "combat-striking-differential",
      "combat-takedown-average", "combat-takedown-accuracy", "combat-submission-attempts",
      "combat-knockdowns", "combat-average-fight-time",
    ]),
  }),
  motorsport: Object.freeze({
    default: preset([
      "motorsport-wins", "motorsport-podiums", "motorsport-top-five-finishes",
      "motorsport-top-ten-finishes", "motorsport-poles", "motorsport-points",
      "motorsport-average-starting-position", "motorsport-average-finishing-position",
      "motorsport-position-change", "motorsport-dnfs", "motorsport-laps-led",
    ]),
  }),
});

const roleKey = (entity) => {
  const role = String(entity?.profile?.role || entity?.position || "").toLowerCase();
  if (role.includes("quarterback")) return "quarterback";
  if (role.includes("running back")) return "running back";
  if (role.includes("receiver")) return "receiver";
  if (role.includes("pitcher")) return "pitcher";
  if (role.includes("goalie")) return "goalie";
  if (role.includes("goalkeeper")) return "goalkeeper";
  if (role.includes("guard")) return "guard";
  if (role.includes("center")) return "center";
  if (role.includes("forward")) return "forward";
  if (entity?.sportId === "baseball") return "batter";
  if (entity?.sportId === "ice-hockey") return "skater";
  return "default";
};

export function getComparisonPreset(entityOrSport) {
  const sportId = typeof entityOrSport === "string" ? entityOrSport : entityOrSport?.sportId;
  const key = ["mma", "boxing", "kickboxing"].includes(sportId) ? "combat" : sportId;
  const sport = COMPARISON_PRESETS[key] || Object.freeze({ default: preset([]) });
  return sport[typeof entityOrSport === "string" ? "default" : roleKey(entityOrSport)] || sport.default;
}

export const QUALIFICATION_DEFAULTS = Object.freeze({
  basketball: Object.freeze({ minimumGames: 3 }),
  "american-football": Object.freeze({ minimumGames: 2, minimumAttempts: 1 }),
  baseball: Object.freeze({ minimumGames: 3, minimumPlateAppearances: 8, minimumInnings: 3 }),
  "ice-hockey": Object.freeze({ minimumGames: 3 }),
  soccer: Object.freeze({ minimumGames: 3, minimumMinutes: 90 }),
  combat: Object.freeze({ minimumGames: 3, minimumFights: 3, minimumRounds: 3 }),
  motorsport: Object.freeze({ minimumGames: 3, minimumStarts: 3 }),
});

export function getQualificationDefaults(sportId) {
  const key = ["mma", "boxing", "kickboxing"].includes(sportId) ? "combat" : sportId;
  return QUALIFICATION_DEFAULTS[key] || Object.freeze({ minimumGames: 1 });
}
