import { CANONICAL_ENTITIES } from "./canonical-entities.js";

const UPDATED_AT = "2026-07-28T15:20:00.000Z";

function gameRows(entityId, leagueId, sportId, opponents, values, startDate = "2026-07-01") {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return values.map((stats, index) => ({
    row_id: `${entityId}-row-${index + 1}`,
    entity_id: entityId,
    league_id: leagueId,
    sport_id: sportId,
    event_id: `${leagueId}-sample-${index + 1}`,
    event_date: new Date(start.getTime() + index * 2 * 86400000).toISOString(),
    opponent_id: opponents[index % opponents.length],
    home_away: index % 2 ? "away" : "home",
    starter: index % 4 !== 3,
    result: index % 3 === 0 ? "loss" : "win",
    season: "2026",
    season_type: "regular-season",
    period: "full-event",
    status: "completed",
    competition: leagueId.toUpperCase(),
    venue: index % 2 ? "Sample Away Venue" : "Sample Home Venue",
    track_type: sportId === "motorsport" ? (index % 2 ? "road-course" : "oval") : "",
    opponent_stance: ["mma", "boxing"].includes(sportId) ? (index % 2 ? "southpaw" : "orthodox") : "",
    pitcher_handedness: sportId === "baseball" ? (index % 2 ? "left" : "right") : "",
    event_name: `${leagueId.toUpperCase()} sample event ${index + 1}`,
    method: ["mma", "boxing"].includes(sportId) ? (index % 3 === 0 ? "KO/TKO" : "Decision") : "",
    round: ["mma", "boxing"].includes(sportId) ? Math.min(5, index + 1) : null,
    event_time_elapsed: ["mma", "boxing"].includes(sportId) ? `${2 + (index % 3)}:${String(12 + index).padStart(2, "0")}` : "",
    stats,
    updated_at: UPDATED_AT,
  }));
}

const caitlinRows = gameRows("wnba-caitlin-clark", "wnba", "basketball", ["LVA", "NYL"], [
  { "basketball-minutes": 35, "basketball-points": 22, "basketball-assists": 7, "basketball-rebounds": 5, "basketball-three-pointers-made": 4, "basketball-turnovers": 5 },
  { "basketball-minutes": 37, "basketball-points": 19, "basketball-assists": 9, "basketball-rebounds": 4, "basketball-three-pointers-made": 3, "basketball-turnovers": 4 },
  { "basketball-minutes": 34, "basketball-points": 25, "basketball-assists": 6, "basketball-rebounds": 6, "basketball-three-pointers-made": 5, "basketball-turnovers": 3 },
  { "basketball-minutes": 32, "basketball-points": 16, "basketball-assists": 5, "basketball-rebounds": 3, "basketball-three-pointers-made": 2, "basketball-turnovers": 6 },
  { "basketball-minutes": 38, "basketball-points": 28, "basketball-assists": 10, "basketball-rebounds": 5, "basketball-three-pointers-made": 6, "basketball-turnovers": 4 },
  { "basketball-minutes": 36, "basketball-points": 21, "basketball-assists": 8, "basketball-rebounds": 7, "basketball-three-pointers-made": 3, "basketball-turnovers": 3 },
  { "basketball-minutes": 39, "basketball-points": 30, "basketball-assists": 11, "basketball-rebounds": 4, "basketball-three-pointers-made": 7, "basketball-turnovers": 5 },
  { "basketball-minutes": 33, "basketball-points": 18, "basketball-assists": 4, "basketball-rebounds": 5, "basketball-three-pointers-made": 2, "basketball-turnovers": 2 },
  { "basketball-minutes": 36, "basketball-points": 24, "basketball-assists": 7, "basketball-rebounds": 6, "basketball-three-pointers-made": 4, "basketball-turnovers": 4 },
  { "basketball-minutes": 37, "basketball-points": 26, "basketball-assists": 9, "basketball-rebounds": 5, "basketball-three-pointers-made": 5, "basketball-turnovers": 3 },
]);

const ajaRows = gameRows("wnba-aja-wilson", "wnba", "basketball", ["IND-W", "NYL"], [
  { "basketball-minutes": 34, "basketball-points": 29, "basketball-assists": 3, "basketball-rebounds": 11, "basketball-blocks": 2 },
  { "basketball-minutes": 36, "basketball-points": 31, "basketball-assists": 4, "basketball-rebounds": 13, "basketball-blocks": 3 },
  { "basketball-minutes": 32, "basketball-points": 24, "basketball-assists": 2, "basketball-rebounds": 9, "basketball-blocks": 1 },
  { "basketball-minutes": 37, "basketball-points": 33, "basketball-assists": 5, "basketball-rebounds": 12, "basketball-blocks": 2 },
  { "basketball-minutes": 35, "basketball-points": 27, "basketball-assists": 3, "basketball-rebounds": 10, "basketball-blocks": 4 },
]);

const stewartRows = gameRows("wnba-breanna-stewart", "wnba", "basketball", ["IND-W", "LVA"], [
  { "basketball-minutes": 35, "basketball-points": 25, "basketball-assists": 4, "basketball-rebounds": 9, "basketball-blocks": 1 },
  { "basketball-minutes": 34, "basketball-points": 28, "basketball-assists": 5, "basketball-rebounds": 8, "basketball-blocks": 2 },
  { "basketball-minutes": 36, "basketball-points": 23, "basketball-assists": 6, "basketball-rebounds": 11, "basketball-blocks": 1 },
  { "basketball-minutes": 33, "basketball-points": 26, "basketball-assists": 3, "basketball-rebounds": 10, "basketball-blocks": 3 },
  { "basketball-minutes": 37, "basketball-points": 30, "basketball-assists": 5, "basketball-rebounds": 12, "basketball-blocks": 2 },
]);

const maxeyRows = gameRows("nba-tyrese-maxey", "nba", "basketball", ["CHI", "BOS"], [
  { "basketball-minutes": 36, "basketball-points": 27, "basketball-assists": 6, "basketball-rebounds": 3, "basketball-three-pointers-made": 4 },
  { "basketball-minutes": 35, "basketball-points": 22, "basketball-assists": 7, "basketball-rebounds": 4, "basketball-three-pointers-made": 3 },
  { "basketball-minutes": 38, "basketball-points": 31, "basketball-assists": 5, "basketball-rebounds": 2, "basketball-three-pointers-made": 5 },
  { "basketball-minutes": 34, "basketball-points": 24, "basketball-assists": 8, "basketball-rebounds": 5, "basketball-three-pointers-made": 2 },
  { "basketball-minutes": 37, "basketball-points": 29, "basketball-assists": 6, "basketball-rebounds": 4, "basketball-three-pointers-made": 4 },
  { "basketball-minutes": 33, "basketball-points": 20, "basketball-assists": 5, "basketball-rebounds": 3, "basketball-three-pointers-made": 2 },
  { "basketball-minutes": 39, "basketball-points": 34, "basketball-assists": 9, "basketball-rebounds": 4, "basketball-three-pointers-made": 6 },
  { "basketball-minutes": 36, "basketball-points": 26, "basketball-assists": 7, "basketball-rebounds": 2, "basketball-three-pointers-made": 3 },
  { "basketball-minutes": 35, "basketball-points": 23, "basketball-assists": 6, "basketball-rebounds": 5, "basketball-three-pointers-made": 3 },
  { "basketball-minutes": 38, "basketball-points": 30, "basketball-assists": 8, "basketball-rebounds": 3, "basketball-three-pointers-made": 5 },
]);

const curryRows = gameRows("nba-stephen-curry", "nba", "basketball", ["LAL", "BOS"], [
  { "basketball-points": 28, "basketball-assists": 7, "basketball-three-pointers-made": 5 },
  { "basketball-points": 24, "basketball-assists": 6, "basketball-three-pointers-made": 4 },
  { "basketball-points": 32, "basketball-assists": 8, "basketball-three-pointers-made": 7 },
  { "basketball-points": 19, "basketball-assists": 5, "basketball-three-pointers-made": 3 },
  { "basketball-points": 30, "basketball-assists": 6, "basketball-three-pointers-made": 6 },
  { "basketball-points": 26, "basketball-assists": 9, "basketball-three-pointers-made": 5 },
  { "basketball-points": 35, "basketball-assists": 7, "basketball-three-pointers-made": 8 },
  { "basketball-points": 22, "basketball-assists": 4, "basketball-three-pointers-made": 4 },
  { "basketball-points": 29, "basketball-assists": 8, "basketball-three-pointers-made": 6 },
  { "basketball-points": 27, "basketball-assists": 6, "basketball-three-pointers-made": 5 },
]);

const judgeRows = gameRows("mlb-aaron-judge", "mlb", "baseball", ["TOR", "BOS"], [
  { "baseball-at-bats": 4, "baseball-hits": 2, "baseball-home-runs": 1, "baseball-runs-batted-in": 2, "baseball-walks": 1 },
  { "baseball-at-bats": 3, "baseball-hits": 1, "baseball-home-runs": 0, "baseball-runs-batted-in": 0, "baseball-walks": 2 },
  { "baseball-at-bats": 5, "baseball-hits": 3, "baseball-home-runs": 2, "baseball-runs-batted-in": 4, "baseball-walks": 0 },
  { "baseball-at-bats": 4, "baseball-hits": 0, "baseball-home-runs": 0, "baseball-runs-batted-in": 0, "baseball-walks": 1 },
  { "baseball-at-bats": 4, "baseball-hits": 2, "baseball-home-runs": 1, "baseball-runs-batted-in": 3, "baseball-walks": 1 },
  { "baseball-at-bats": 3, "baseball-hits": 1, "baseball-home-runs": 1, "baseball-runs-batted-in": 1, "baseball-walks": 2 },
  { "baseball-at-bats": 5, "baseball-hits": 2, "baseball-home-runs": 0, "baseball-runs-batted-in": 1, "baseball-walks": 0 },
  { "baseball-at-bats": 4, "baseball-hits": 3, "baseball-home-runs": 2, "baseball-runs-batted-in": 5, "baseball-walks": 1 },
]);

const coleRows = gameRows("mlb-gerrit-cole", "mlb", "baseball", ["TOR", "BOS"], [
  { "baseball-innings-pitched": 6, "baseball-pitcher-strikeouts": 8, "baseball-hits-allowed": 5, "baseball-earned-runs": 2, "baseball-walks-allowed": 1 },
  { "baseball-innings-pitched": 7, "baseball-pitcher-strikeouts": 10, "baseball-hits-allowed": 4, "baseball-earned-runs": 1, "baseball-walks-allowed": 2 },
  { "baseball-innings-pitched": 5, "baseball-pitcher-strikeouts": 6, "baseball-hits-allowed": 7, "baseball-earned-runs": 4, "baseball-walks-allowed": 3 },
  { "baseball-innings-pitched": 6, "baseball-pitcher-strikeouts": 9, "baseball-hits-allowed": 5, "baseball-earned-runs": 2, "baseball-walks-allowed": 1 },
  { "baseball-innings-pitched": 7, "baseball-pitcher-strikeouts": 11, "baseball-hits-allowed": 3, "baseball-earned-runs": 1, "baseball-walks-allowed": 1 },
]);

const mahomesRows = gameRows("nfl-patrick-mahomes", "nfl", "american-football", ["BUF", "DEN"], [
  { "football-passing-yards": 286, "football-passing-attempts": 38, "football-completions": 27, "football-passing-touchdowns": 3, "football-interceptions": 1 },
  { "football-passing-yards": 242, "football-passing-attempts": 33, "football-completions": 22, "football-passing-touchdowns": 2, "football-interceptions": 0 },
  { "football-passing-yards": 315, "football-passing-attempts": 41, "football-completions": 29, "football-passing-touchdowns": 4, "football-interceptions": 1 },
  { "football-passing-yards": 268, "football-passing-attempts": 36, "football-completions": 25, "football-passing-touchdowns": 2, "football-interceptions": 2 },
  { "football-passing-yards": 301, "football-passing-attempts": 39, "football-completions": 28, "football-passing-touchdowns": 3, "football-interceptions": 0 },
]);

const matthewsRows = gameRows("nhl-auston-matthews", "nhl", "ice-hockey", ["BOS", "MTL"], [
  { "hockey-goals": 1, "hockey-assists": 0, "hockey-points": 1, "hockey-shots-on-goal": 5 },
  { "hockey-goals": 0, "hockey-assists": 1, "hockey-points": 1, "hockey-shots-on-goal": 4 },
  { "hockey-goals": 2, "hockey-assists": 0, "hockey-points": 2, "hockey-shots-on-goal": 7 },
  { "hockey-goals": 0, "hockey-assists": 0, "hockey-points": 0, "hockey-shots-on-goal": 3 },
  { "hockey-goals": 1, "hockey-assists": 1, "hockey-points": 2, "hockey-shots-on-goal": 6 },
]);

const goalieRows = gameRows("nhl-sample-goalie", "nhl", "ice-hockey", ["BOS", "MTL"], [
  { "hockey-games": 1, "hockey-saves": 29, "hockey-save-percentage": 93.5, "hockey-goals-against": 2, "hockey-goals-against-average": 2 },
  { "hockey-games": 1, "hockey-saves": 24, "hockey-save-percentage": 88.9, "hockey-goals-against": 3, "hockey-goals-against-average": 3 },
  { "hockey-games": 1, "hockey-saves": 33, "hockey-save-percentage": 94.3, "hockey-goals-against": 2, "hockey-goals-against-average": 2 },
  { "hockey-games": 1, "hockey-saves": 27, "hockey-save-percentage": 90, "hockey-goals-against": 3, "hockey-goals-against-average": 3 },
  { "hockey-games": 1, "hockey-saves": 31, "hockey-save-percentage": 96.9, "hockey-goals-against": 1, "hockey-goals-against-average": 1 },
]);

const messiRows = gameRows("mls-lionel-messi", "mls", "soccer", ["ORL", "ATL"], [
  { "soccer-minutes": 90, "soccer-goals": 1, "soccer-assists": 1, "soccer-shots": 5, "soccer-shots-on-target": 3 },
  { "soccer-minutes": 82, "soccer-goals": 0, "soccer-assists": 2, "soccer-shots": 4, "soccer-shots-on-target": 2 },
  { "soccer-minutes": 90, "soccer-goals": 2, "soccer-assists": 0, "soccer-shots": 6, "soccer-shots-on-target": 4 },
  { "soccer-minutes": 76, "soccer-goals": 0, "soccer-assists": 1, "soccer-shots": 3, "soccer-shots-on-target": 1 },
  { "soccer-minutes": 88, "soccer-goals": 1, "soccer-assists": 1, "soccer-shots": 5, "soccer-shots-on-target": 3 },
]);

const fighterRows = gameRows("ufc-sample-fighter-a", "ufc", "mma", ["ufc-sample-fighter-b", "fighter-c"], [
  { "combat-wins": 1, "combat-knockout-wins": 1, "combat-significant-strikes-landed": 76, "combat-significant-strikes-absorbed": 42, "combat-takedowns-landed": 2, "combat-knockdowns": 1 },
  { "combat-wins": 1, "combat-decision-wins": 1, "combat-significant-strikes-landed": 91, "combat-significant-strikes-absorbed": 67, "combat-takedowns-landed": 4, "combat-knockdowns": 0 },
  { "combat-losses": 1, "combat-significant-strikes-landed": 48, "combat-significant-strikes-absorbed": 72, "combat-takedowns-landed": 1, "combat-knockdowns": 0 },
  { "combat-wins": 1, "combat-submission-wins": 1, "combat-significant-strikes-landed": 35, "combat-significant-strikes-absorbed": 21, "combat-takedowns-landed": 3, "combat-knockdowns": 0 },
  { "combat-wins": 1, "combat-knockout-wins": 1, "combat-significant-strikes-landed": 64, "combat-significant-strikes-absorbed": 39, "combat-takedowns-landed": 0, "combat-knockdowns": 2 },
], "2025-01-01");

const boxerRows = gameRows("boxing-sample-boxer-a", "boxing", "boxing", ["boxer-b", "boxer-c"], [
  { "combat-wins": 1, "combat-knockout-wins": 1, "combat-significant-strikes-landed": 82, "combat-significant-strikes-absorbed": 41, "combat-knockdowns": 2 },
  { "combat-wins": 1, "combat-decision-wins": 1, "combat-significant-strikes-landed": 106, "combat-significant-strikes-absorbed": 73, "combat-knockdowns": 0 },
  { "combat-losses": 1, "combat-significant-strikes-landed": 69, "combat-significant-strikes-absorbed": 88, "combat-knockdowns": 0 },
  { "combat-wins": 1, "combat-knockout-wins": 1, "combat-significant-strikes-landed": 75, "combat-significant-strikes-absorbed": 36, "combat-knockdowns": 1 },
  { "combat-wins": 1, "combat-decision-wins": 1, "combat-significant-strikes-landed": 111, "combat-significant-strikes-absorbed": 79, "combat-knockdowns": 0 },
], "2025-02-01");

const verstappenRows = gameRows("f1-max-verstappen", "f1", "motorsport", ["race-field"], [
  { "motorsport-starts": 1, "motorsport-wins": 1, "motorsport-podiums": 1, "motorsport-points": 25, "motorsport-average-starting-position": 1, "motorsport-average-finishing-position": 1, "motorsport-laps-led": 42, "motorsport-dnfs": 0 },
  { "motorsport-starts": 1, "motorsport-wins": 0, "motorsport-podiums": 1, "motorsport-points": 18, "motorsport-average-starting-position": 3, "motorsport-average-finishing-position": 2, "motorsport-laps-led": 12, "motorsport-dnfs": 0 },
  { "motorsport-starts": 1, "motorsport-wins": 1, "motorsport-podiums": 1, "motorsport-points": 25, "motorsport-average-starting-position": 2, "motorsport-average-finishing-position": 1, "motorsport-laps-led": 36, "motorsport-dnfs": 0 },
  { "motorsport-starts": 1, "motorsport-wins": 0, "motorsport-podiums": 0, "motorsport-points": 10, "motorsport-average-starting-position": 5, "motorsport-average-finishing-position": 6, "motorsport-laps-led": 0, "motorsport-dnfs": 0 },
  { "motorsport-starts": 1, "motorsport-wins": 0, "motorsport-podiums": 0, "motorsport-points": 0, "motorsport-average-starting-position": 4, "motorsport-average-finishing-position": 20, "motorsport-laps-led": 4, "motorsport-dnfs": 1 },
], "2026-03-01");

const nascarRows = gameRows("nascar-sample-driver", "nascar-cup", "motorsport", ["race-field"], [
  { "motorsport-starts": 1, "motorsport-wins": 0, "motorsport-podiums": 0, "motorsport-top-five-finishes": 1, "motorsport-top-ten-finishes": 1, "motorsport-poles": 0, "motorsport-points": 38, "motorsport-average-starting-position": 8, "motorsport-average-finishing-position": 4, "motorsport-laps-led": 12, "motorsport-dnfs": 0 },
  { "motorsport-starts": 1, "motorsport-wins": 1, "motorsport-podiums": 1, "motorsport-top-five-finishes": 1, "motorsport-top-ten-finishes": 1, "motorsport-poles": 0, "motorsport-points": 45, "motorsport-average-starting-position": 5, "motorsport-average-finishing-position": 1, "motorsport-laps-led": 44, "motorsport-dnfs": 0 },
  { "motorsport-starts": 1, "motorsport-wins": 0, "motorsport-podiums": 0, "motorsport-top-five-finishes": 0, "motorsport-top-ten-finishes": 1, "motorsport-poles": 1, "motorsport-points": 27, "motorsport-average-starting-position": 1, "motorsport-average-finishing-position": 9, "motorsport-laps-led": 20, "motorsport-dnfs": 0 },
  { "motorsport-starts": 1, "motorsport-wins": 0, "motorsport-podiums": 0, "motorsport-top-five-finishes": 0, "motorsport-top-ten-finishes": 0, "motorsport-poles": 0, "motorsport-points": 8, "motorsport-average-starting-position": 14, "motorsport-average-finishing-position": 25, "motorsport-laps-led": 0, "motorsport-dnfs": 1 },
  { "motorsport-starts": 1, "motorsport-wins": 0, "motorsport-podiums": 1, "motorsport-top-five-finishes": 1, "motorsport-top-ten-finishes": 1, "motorsport-poles": 0, "motorsport-points": 40, "motorsport-average-starting-position": 7, "motorsport-average-finishing-position": 3, "motorsport-laps-led": 18, "motorsport-dnfs": 0 },
], "2026-03-08");

const sabrinaRows = gameRows("wnba-sabrina-ionescu", "wnba", "basketball", ["IND-W", "LVA"], [
  { "basketball-minutes": 34, "basketball-points": 21, "basketball-assists": 8, "basketball-rebounds": 5, "basketball-three-pointers-made": 4, "basketball-turnovers": 3 },
  { "basketball-minutes": 36, "basketball-points": 25, "basketball-assists": 7, "basketball-rebounds": 4, "basketball-three-pointers-made": 5, "basketball-turnovers": 2 },
  { "basketball-minutes": 33, "basketball-points": 18, "basketball-assists": 10, "basketball-rebounds": 6, "basketball-three-pointers-made": 3, "basketball-turnovers": 4 },
  { "basketball-minutes": 37, "basketball-points": 27, "basketball-assists": 9, "basketball-rebounds": 5, "basketball-three-pointers-made": 6, "basketball-turnovers": 3 },
  { "basketball-minutes": 35, "basketball-points": 23, "basketball-assists": 6, "basketball-rebounds": 7, "basketball-three-pointers-made": 4, "basketball-turnovers": 2 },
]);

const lukaRows = gameRows("nba-luka-doncic", "nba", "basketball", ["PHI", "GSW"], [
  { "basketball-minutes": 38, "basketball-points": 32, "basketball-assists": 9, "basketball-rebounds": 8, "basketball-three-pointers-made": 4, "basketball-turnovers": 5 },
  { "basketball-minutes": 36, "basketball-points": 28, "basketball-assists": 11, "basketball-rebounds": 7, "basketball-three-pointers-made": 3, "basketball-turnovers": 4 },
  { "basketball-minutes": 39, "basketball-points": 35, "basketball-assists": 8, "basketball-rebounds": 10, "basketball-three-pointers-made": 5, "basketball-turnovers": 6 },
  { "basketball-minutes": 35, "basketball-points": 26, "basketball-assists": 10, "basketball-rebounds": 6, "basketball-three-pointers-made": 2, "basketball-turnovers": 3 },
  { "basketball-minutes": 37, "basketball-points": 31, "basketball-assists": 12, "basketball-rebounds": 9, "basketball-three-pointers-made": 4, "basketball-turnovers": 5 },
]);

const sotoRows = gameRows("mlb-juan-soto", "mlb", "baseball", ["LAD", "NYY"], [
  { "baseball-at-bats": 4, "baseball-hits": 2, "baseball-home-runs": 1, "baseball-runs-batted-in": 2, "baseball-walks": 1 },
  { "baseball-at-bats": 3, "baseball-hits": 1, "baseball-home-runs": 0, "baseball-runs-batted-in": 1, "baseball-walks": 2 },
  { "baseball-at-bats": 4, "baseball-hits": 2, "baseball-home-runs": 1, "baseball-runs-batted-in": 3, "baseball-walks": 1 },
  { "baseball-at-bats": 5, "baseball-hits": 2, "baseball-home-runs": 0, "baseball-runs-batted-in": 1, "baseball-walks": 0 },
  { "baseball-at-bats": 3, "baseball-hits": 2, "baseball-home-runs": 1, "baseball-runs-batted-in": 2, "baseball-walks": 2 },
]);

const skubalRows = gameRows("mlb-tarik-skubal", "mlb", "baseball", ["NYY", "LAD"], [
  { "baseball-innings-pitched": 7, "baseball-pitcher-strikeouts": 11, "baseball-hits-allowed": 4, "baseball-earned-runs": 1, "baseball-walks-allowed": 1 },
  { "baseball-innings-pitched": 6, "baseball-pitcher-strikeouts": 9, "baseball-hits-allowed": 5, "baseball-earned-runs": 2, "baseball-walks-allowed": 2 },
  { "baseball-innings-pitched": 8, "baseball-pitcher-strikeouts": 12, "baseball-hits-allowed": 3, "baseball-earned-runs": 1, "baseball-walks-allowed": 1 },
  { "baseball-innings-pitched": 6, "baseball-pitcher-strikeouts": 8, "baseball-hits-allowed": 6, "baseball-earned-runs": 3, "baseball-walks-allowed": 2 },
  { "baseball-innings-pitched": 7, "baseball-pitcher-strikeouts": 10, "baseball-hits-allowed": 4, "baseball-earned-runs": 2, "baseball-walks-allowed": 1 },
]);

const allenRows = gameRows("nfl-josh-allen", "nfl", "american-football", ["KC", "DEN"], [
  { "football-passing-yards": 302, "football-passing-attempts": 37, "football-completions": 26, "football-passing-touchdowns": 3, "football-interceptions": 1, "football-rushing-yards": 42, "football-rushing-touchdowns": 1 },
  { "football-passing-yards": 275, "football-passing-attempts": 34, "football-completions": 23, "football-passing-touchdowns": 2, "football-interceptions": 0, "football-rushing-yards": 55, "football-rushing-touchdowns": 1 },
  { "football-passing-yards": 318, "football-passing-attempts": 41, "football-completions": 29, "football-passing-touchdowns": 4, "football-interceptions": 2, "football-rushing-yards": 38, "football-rushing-touchdowns": 0 },
  { "football-passing-yards": 249, "football-passing-attempts": 32, "football-completions": 21, "football-passing-touchdowns": 2, "football-interceptions": 1, "football-rushing-yards": 61, "football-rushing-touchdowns": 2 },
  { "football-passing-yards": 291, "football-passing-attempts": 36, "football-completions": 25, "football-passing-touchdowns": 3, "football-interceptions": 0, "football-rushing-yards": 47, "football-rushing-touchdowns": 1 },
]);

const mackinnonRows = gameRows("nhl-nathan-mackinnon", "nhl", "ice-hockey", ["TOR", "BOS"], [
  { "hockey-goals": 1, "hockey-assists": 2, "hockey-points": 3, "hockey-shots-on-goal": 6 },
  { "hockey-goals": 0, "hockey-assists": 1, "hockey-points": 1, "hockey-shots-on-goal": 5 },
  { "hockey-goals": 2, "hockey-assists": 1, "hockey-points": 3, "hockey-shots-on-goal": 8 },
  { "hockey-goals": 1, "hockey-assists": 1, "hockey-points": 2, "hockey-shots-on-goal": 7 },
  { "hockey-goals": 0, "hockey-assists": 2, "hockey-points": 2, "hockey-shots-on-goal": 4 },
]);

const suarezRows = gameRows("mls-luis-suarez", "mls", "soccer", ["ORL", "ATL"], [
  { "soccer-minutes": 78, "soccer-goals": 1, "soccer-assists": 0, "soccer-shots": 4, "soccer-shots-on-target": 2 },
  { "soccer-minutes": 85, "soccer-goals": 2, "soccer-assists": 1, "soccer-shots": 6, "soccer-shots-on-target": 4 },
  { "soccer-minutes": 72, "soccer-goals": 0, "soccer-assists": 1, "soccer-shots": 3, "soccer-shots-on-target": 1 },
  { "soccer-minutes": 88, "soccer-goals": 1, "soccer-assists": 0, "soccer-shots": 5, "soccer-shots-on-target": 3 },
  { "soccer-minutes": 80, "soccer-goals": 1, "soccer-assists": 1, "soccer-shots": 4, "soccer-shots-on-target": 2 },
]);

const fighterBRows = gameRows("ufc-sample-fighter-b", "ufc", "mma", ["ufc-sample-fighter-a", "fighter-c"], [
  { "combat-wins": 1, "combat-decision-wins": 1, "combat-significant-strikes-landed": 68, "combat-significant-strikes-absorbed": 55, "combat-takedowns-landed": 1, "combat-knockdowns": 0, "combat-average-fight-time": 15 },
  { "combat-wins": 1, "combat-knockout-wins": 1, "combat-significant-strikes-landed": 52, "combat-significant-strikes-absorbed": 31, "combat-takedowns-landed": 0, "combat-knockdowns": 2, "combat-average-fight-time": 8.5 },
  { "combat-losses": 1, "combat-significant-strikes-landed": 44, "combat-significant-strikes-absorbed": 70, "combat-takedowns-landed": 2, "combat-knockdowns": 0, "combat-average-fight-time": 15 },
  { "combat-wins": 1, "combat-submission-wins": 1, "combat-significant-strikes-landed": 29, "combat-significant-strikes-absorbed": 24, "combat-takedowns-landed": 4, "combat-knockdowns": 0, "combat-average-fight-time": 9 },
  { "combat-wins": 1, "combat-decision-wins": 1, "combat-significant-strikes-landed": 81, "combat-significant-strikes-absorbed": 63, "combat-takedowns-landed": 2, "combat-knockdowns": 0, "combat-average-fight-time": 15 },
], "2025-01-01");

const norrisRows = gameRows("f1-lando-norris", "f1", "motorsport", ["race-field"], [
  { "motorsport-starts": 1, "motorsport-wins": 0, "motorsport-podiums": 1, "motorsport-points": 18, "motorsport-average-starting-position": 4, "motorsport-average-finishing-position": 2, "motorsport-laps-led": 8, "motorsport-dnfs": 0 },
  { "motorsport-starts": 1, "motorsport-wins": 1, "motorsport-podiums": 1, "motorsport-points": 25, "motorsport-average-starting-position": 2, "motorsport-average-finishing-position": 1, "motorsport-laps-led": 31, "motorsport-dnfs": 0 },
  { "motorsport-starts": 1, "motorsport-wins": 0, "motorsport-podiums": 1, "motorsport-points": 15, "motorsport-average-starting-position": 5, "motorsport-average-finishing-position": 3, "motorsport-laps-led": 4, "motorsport-dnfs": 0 },
  { "motorsport-starts": 1, "motorsport-wins": 0, "motorsport-podiums": 0, "motorsport-points": 8, "motorsport-average-starting-position": 7, "motorsport-average-finishing-position": 8, "motorsport-laps-led": 0, "motorsport-dnfs": 0 },
  { "motorsport-starts": 1, "motorsport-wins": 0, "motorsport-podiums": 0, "motorsport-points": 0, "motorsport-average-starting-position": 3, "motorsport-average-finishing-position": 18, "motorsport-laps-led": 2, "motorsport-dnfs": 1 },
], "2026-03-01");

verstappenRows.forEach((row, index) => { row.track_type = index % 2 ? "permanent" : "street"; });
norrisRows.forEach((row, index) => { row.track_type = index % 2 ? "permanent" : "street"; });

const teamRows = [
  ...gameRows("IND-W", "wnba", "basketball", ["LVA", "NYL"], [
    { "basketball-points": 91, "basketball-rebounds": 37, "basketball-assists": 24, "basketball-three-pointers-made": 11, "basketball-turnovers": 13 },
    { "basketball-points": 84, "basketball-rebounds": 34, "basketball-assists": 21, "basketball-three-pointers-made": 9, "basketball-turnovers": 15 },
    { "basketball-points": 96, "basketball-rebounds": 41, "basketball-assists": 27, "basketball-three-pointers-made": 13, "basketball-turnovers": 12 },
  ]),
  ...gameRows("LVA", "wnba", "basketball", ["IND-W", "NYL"], [
    { "basketball-points": 88, "basketball-rebounds": 39, "basketball-assists": 22, "basketball-three-pointers-made": 10, "basketball-turnovers": 11 },
    { "basketball-points": 93, "basketball-rebounds": 42, "basketball-assists": 25, "basketball-three-pointers-made": 12, "basketball-turnovers": 10 },
    { "basketball-points": 86, "basketball-rebounds": 36, "basketball-assists": 20, "basketball-three-pointers-made": 8, "basketball-turnovers": 14 },
  ]),
  ...gameRows("NYY", "mlb", "baseball", ["LAD", "BOS"], [
    { "baseball-at-bats": 34, "baseball-hits": 10, "baseball-home-runs": 3, "baseball-runs-batted-in": 7, "baseball-walks": 5 },
    { "baseball-at-bats": 32, "baseball-hits": 8, "baseball-home-runs": 2, "baseball-runs-batted-in": 5, "baseball-walks": 4 },
    { "baseball-at-bats": 36, "baseball-hits": 12, "baseball-home-runs": 4, "baseball-runs-batted-in": 9, "baseball-walks": 6 },
  ]),
  ...gameRows("LAD", "mlb", "baseball", ["NYY", "NYM"], [
    { "baseball-at-bats": 35, "baseball-hits": 11, "baseball-home-runs": 2, "baseball-runs-batted-in": 6, "baseball-walks": 6 },
    { "baseball-at-bats": 33, "baseball-hits": 9, "baseball-home-runs": 3, "baseball-runs-batted-in": 7, "baseball-walks": 5 },
    { "baseball-at-bats": 37, "baseball-hits": 13, "baseball-home-runs": 3, "baseball-runs-batted-in": 8, "baseball-walks": 4 },
  ]),
  ...gameRows("MIA", "mls", "soccer", ["ORL", "ATL"], [
    { "soccer-goals": 3, "soccer-assists": 3, "soccer-shots": 15, "soccer-shots-on-target": 8, "soccer-corners": 6 },
    { "soccer-goals": 2, "soccer-assists": 2, "soccer-shots": 13, "soccer-shots-on-target": 6, "soccer-corners": 5 },
    { "soccer-goals": 4, "soccer-assists": 4, "soccer-shots": 18, "soccer-shots-on-target": 10, "soccer-corners": 7 },
  ]),
  ...gameRows("ORL", "mls", "soccer", ["MIA", "ATL"], [
    { "soccer-goals": 2, "soccer-assists": 2, "soccer-shots": 12, "soccer-shots-on-target": 5, "soccer-corners": 4 },
    { "soccer-goals": 1, "soccer-assists": 1, "soccer-shots": 10, "soccer-shots-on-target": 4, "soccer-corners": 6 },
    { "soccer-goals": 3, "soccer-assists": 3, "soccer-shots": 14, "soccer-shots-on-target": 7, "soccer-corners": 5 },
  ]),
];

export const mockStatsProviderPayload = Object.freeze({
  provider: "edgeboard-mock-historical",
  mode: "sample",
  generated_at: UPDATED_AT,
  data_quality: "sample",
  disclaimer: "Demonstration-only historical statistics. Not live, complete, or production-verified.",
  entities: CANONICAL_ENTITIES,
  rows: Object.freeze([
    ...caitlinRows,
    ...ajaRows,
    ...stewartRows,
    ...maxeyRows,
    ...curryRows,
    ...judgeRows,
    ...coleRows,
    ...mahomesRows,
    ...matthewsRows,
    ...goalieRows,
    ...messiRows,
    ...fighterRows,
    ...boxerRows,
    ...verstappenRows,
    ...nascarRows,
    ...sabrinaRows,
    ...lukaRows,
    ...sotoRows,
    ...skubalRows,
    ...allenRows,
    ...mackinnonRows,
    ...suarezRows,
    ...fighterBRows,
    ...norrisRows,
    ...teamRows,
    {
      ...caitlinRows[0],
      row_id: "postponed-demo-row",
      event_id: "wnba-postponed-demo",
      status: "postponed",
      stats: {},
    },
  ]),
});
