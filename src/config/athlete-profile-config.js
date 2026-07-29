const tab = (id, label, dataKey) => Object.freeze({ id, label, dataKey });

const COMMON_TABS = Object.freeze([
  tab("overview", "Overview", "overview"),
  tab("game-logs", "Game Logs", "gameLogs"),
  tab("splits", "Splits", "splits"),
  tab("trends", "Trends", "trends"),
  tab("props", "Props", "props"),
  tab("matchup", "Matchup", "matchup"),
  tab("insights", "Insights", "insights"),
]);

const CONFIGS = Object.freeze({
  basketball: Object.freeze({
    tabs: COMMON_TABS,
    primaryStats: Object.freeze([
      "basketball-points",
      "basketball-rebounds",
      "basketball-assists",
      "basketball-three-pointers-made",
      "basketball-steals",
      "basketball-blocks",
    ]),
    supportingStats: Object.freeze([
      "basketball-minutes",
      "basketball-field-goal-percentage",
      "basketball-three-point-percentage",
      "basketball-free-throw-percentage",
      "basketball-turnovers",
      "basketball-plus-minus",
    ]),
    logStats: Object.freeze([
      "basketball-minutes",
      "basketball-points",
      "basketball-rebounds",
      "basketball-assists",
      "basketball-three-pointers-made",
      "basketball-steals",
      "basketball-blocks",
      "basketball-turnovers",
    ]),
    splitDimensions: Object.freeze(["home-away", "wins-losses", "starter-bench", "opponent"]),
    roleLabel: "Position",
  }),
  "american-football": Object.freeze({
    tabs: COMMON_TABS,
    primaryStatsByRole: Object.freeze({
      quarterback: Object.freeze([
        "football-passing-yards", "football-passing-touchdowns", "football-interceptions",
        "football-completions", "football-passing-attempts", "football-rushing-yards",
      ]),
      default: Object.freeze([
        "football-rushing-yards", "football-rushing-attempts", "football-rushing-touchdowns",
        "football-receptions", "football-receiving-yards", "football-receiving-touchdowns",
      ]),
    }),
    logStats: Object.freeze([
      "football-passing-yards", "football-completions", "football-passing-attempts",
      "football-passing-touchdowns", "football-interceptions", "football-rushing-yards",
    ]),
    splitDimensions: Object.freeze(["home-away", "wins-losses", "opponent"]),
    roleLabel: "Position",
  }),
  baseball: Object.freeze({
    tabs: COMMON_TABS,
    primaryStatsByRole: Object.freeze({
      pitcher: Object.freeze([
        "baseball-era", "baseball-whip", "baseball-pitcher-strikeouts",
        "baseball-innings-pitched", "baseball-hits-allowed", "baseball-walks-allowed",
      ]),
      default: Object.freeze([
        "baseball-batting-average", "baseball-home-runs", "baseball-runs-batted-in",
        "baseball-hits", "baseball-runs", "baseball-stolen-bases",
        "baseball-on-base-percentage", "baseball-slugging-percentage",
      ]),
    }),
    logStatsByRole: Object.freeze({
      pitcher: Object.freeze([
        "baseball-innings-pitched", "baseball-pitcher-strikeouts", "baseball-earned-runs",
        "baseball-hits-allowed", "baseball-walks-allowed",
      ]),
      default: Object.freeze([
        "baseball-plate-appearances", "baseball-at-bats", "baseball-hits",
        "baseball-home-runs", "baseball-runs-batted-in", "baseball-runs",
        "baseball-walks", "baseball-strikeouts",
      ]),
    }),
    splitDimensions: Object.freeze(["home-away", "wins-losses", "opponent", "pitcher-handedness"]),
    roleLabel: "Position",
  }),
  "ice-hockey": Object.freeze({
    tabs: COMMON_TABS,
    primaryStatsByRole: Object.freeze({
      goalie: Object.freeze([
        "hockey-saves", "hockey-save-percentage", "hockey-goals-against",
        "hockey-goals-against-average", "hockey-games",
      ]),
      default: Object.freeze([
        "hockey-goals", "hockey-assists", "hockey-points", "hockey-shots-on-goal",
        "hockey-blocked-shots", "hockey-hits", "hockey-power-play-points",
      ]),
    }),
    logStatsByRole: Object.freeze({
      goalie: Object.freeze(["hockey-saves", "hockey-save-percentage", "hockey-goals-against"]),
      default: Object.freeze([
        "hockey-goals", "hockey-assists", "hockey-points",
        "hockey-shots-on-goal", "hockey-blocked-shots",
      ]),
    }),
    splitDimensions: Object.freeze(["home-away", "wins-losses", "opponent"]),
    roleLabel: "Position",
  }),
  soccer: Object.freeze({
    tabs: COMMON_TABS,
    primaryStats: Object.freeze([
      "soccer-goals", "soccer-assists", "soccer-shots", "soccer-shots-on-target",
      "soccer-chances-created", "soccer-passes", "soccer-tackles", "soccer-minutes",
    ]),
    logStats: Object.freeze([
      "soccer-minutes", "soccer-goals", "soccer-assists", "soccer-shots",
      "soccer-shots-on-target", "soccer-passes", "soccer-tackles", "soccer-yellow-cards",
    ]),
    splitDimensions: Object.freeze(["home-away", "wins-losses", "starter-bench", "opponent", "competition"]),
    roleLabel: "Position",
  }),
  combat: Object.freeze({
    tabs: Object.freeze([
      tab("overview", "Overview", "overview"),
      tab("game-logs", "Fight History", "gameLogs"),
      tab("splits", "Style Stats", "splits"),
      tab("trends", "Trends", "trends"),
      tab("props", "Markets", "props"),
      tab("matchup", "Matchup", "matchup"),
      tab("insights", "Insights", "insights"),
    ]),
    primaryStats: Object.freeze([
      "combat-wins", "combat-losses", "combat-knockout-wins", "combat-submission-wins",
      "combat-decision-wins", "combat-significant-strikes-landed",
      "combat-significant-strikes-absorbed", "combat-takedowns-landed",
      "combat-knockdowns", "combat-average-fight-time",
    ]),
    logStats: Object.freeze([
      "combat-wins", "combat-losses", "combat-significant-strikes-landed",
      "combat-significant-strikes-absorbed", "combat-takedowns-landed", "combat-knockdowns",
    ]),
    splitDimensions: Object.freeze(["wins-losses", "opponent", "opponent-stance"]),
    roleLabel: "Weight class",
  }),
  motorsport: Object.freeze({
    tabs: Object.freeze([
      tab("overview", "Overview", "overview"),
      tab("game-logs", "Race Results", "gameLogs"),
      tab("splits", "Track Splits", "splits"),
      tab("trends", "Trends", "trends"),
      tab("props", "Markets", "props"),
      tab("matchup", "Event Context", "matchup"),
      tab("insights", "Insights", "insights"),
    ]),
    primaryStats: Object.freeze([
      "motorsport-starts", "motorsport-wins", "motorsport-podiums",
      "motorsport-top-five-finishes", "motorsport-top-ten-finishes",
      "motorsport-poles", "motorsport-fastest-laps", "motorsport-points",
      "motorsport-average-starting-position", "motorsport-average-finishing-position",
      "motorsport-dnfs",
    ]),
    logStats: Object.freeze([
      "motorsport-average-starting-position", "motorsport-average-finishing-position",
      "motorsport-laps-led", "motorsport-points", "motorsport-dnfs",
    ]),
    splitDimensions: Object.freeze(["track-type", "season", "manufacturer"]),
    roleLabel: "Discipline",
  }),
});

function roleKey(entity) {
  const role = String(entity?.position || entity?.profile?.role || "").toLowerCase();
  if (role.includes("pitcher")) return "pitcher";
  if (role.includes("goalie") || role.includes("goaltender")) return "goalie";
  if (role.includes("quarterback")) return "quarterback";
  return "default";
}
export function getAthleteProfileConfig(entity) {
  const key = ["mma", "boxing", "combat", "kickboxing"].includes(entity?.sportId)
    ? "combat"
    : entity?.sportId;
  const config = CONFIGS[key] || CONFIGS.basketball;
  const role = roleKey(entity);
  return Object.freeze({
    ...config,
    primaryStats: config.primaryStatsByRole?.[role] || config.primaryStatsByRole?.default || config.primaryStats || [],
    logStats: config.logStatsByRole?.[role] || config.logStatsByRole?.default || config.logStats || [],
    roleKey: role,
  });
}

export function getProfileTabs(entity, available = {}) {
  const config = getAthleteProfileConfig(entity);
  return config.tabs.filter((item) => {
    if (item.id === "overview") return true;
    if (item.id === "props") return available.props !== false;
    return Boolean(available[item.dataKey]);
  });
}
