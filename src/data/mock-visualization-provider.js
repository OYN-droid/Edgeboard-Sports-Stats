const UPDATED_AT = "2026-07-30T15:00:00.000Z";

const dataset = (id, visualizationType, sportId, entityIds, rows, options = {}) => Object.freeze({
  dataset_id: id,
  visualization_type: visualizationType,
  sport_id: sportId,
  league_id: options.leagueId || "",
  entity_type: options.entityType || "athlete",
  entity_ids: Object.freeze(entityIds),
  event_ids: Object.freeze(options.eventIds || []),
  stat_ids: Object.freeze(options.statIds || []),
  title: options.title || "",
  date_range: Object.freeze(options.dateRange || { type: "sample_snapshot", value: null }),
  coordinate_system: options.coordinateSystem || null,
  unit: options.unit || "count",
  validation_status: "dataset_only",
  source: "edgeboard-mock-visuals",
  last_updated_at: UPDATED_AT,
  sample: true,
  partial: options.partial === true,
  rows: Object.freeze(rows.map((row, index) => Object.freeze({
    row_id: row.row_id || `${id}-${index + 1}`,
    ...row,
  }))),
});

const datedValues = (prefix, values, start = 1) => values.map((value, index) => ({
  timestamp: `2026-07-${String(start + index).padStart(2, "0")}T20:00:00.000Z`,
  label: `Event ${index + 1}`,
  value,
}));

export const mockVisualizationProviderPayload = Object.freeze({
  provider_id: "edgeboard-mock-visuals",
  provider_name: "EdgeBoard Sample Visualization Provider",
  generated_at: UPDATED_AT,
  sample: true,
  partial: true,
  disclaimer: "Illustrative fictional sample visualization data. Not live or current-world analysis.",
  datasets: Object.freeze([
    dataset("trend-clark-points", "line_chart", "basketball", ["wnba-caitlin-clark"], datedValues("cc", [18, 24, null, 29, 21, 26, 31, 19, 27, 33]), {
      leagueId: "wnba", statIds: ["basketball-points"], title: "Recent scoring trend", unit: "points",
    }),
    dataset("threshold-clark-points", "threshold_chart", "basketball", ["wnba-caitlin-clark"], datedValues("cc-t", [18, 24, 22, 29, 21, 26, 31, 19, 27, 33]).map((row) => ({ ...row, threshold: 24.5 })), {
      leagueId: "wnba", statIds: ["basketball-points"], title: "Points against sample threshold", unit: "points",
    }),
    dataset("splits-clark", "grouped_bar_chart", "basketball", ["wnba-caitlin-clark"], [
      { label: "Home", value: 27.2, seriesId: "Points" }, { label: "Away", value: 23.8, seriesId: "Points" },
      { label: "Wins", value: 28.1, seriesId: "Points" }, { label: "Losses", value: 22.4, seriesId: "Points" },
    ], { leagueId: "wnba", statIds: ["basketball-points"], title: "Sample split comparison", unit: "points" }),
    dataset("percentile-clark", "percentile_chart", "basketball", ["wnba-caitlin-clark"], [
      { label: "Points", value: 91, percentile: 91, observedValue: 25.5, poolSize: 24 },
      { label: "Assists", value: 96, percentile: 96, observedValue: 8.1, poolSize: 24 },
      { label: "Rebounds", value: 68, percentile: 68, observedValue: 5.4, poolSize: 24 },
    ], { leagueId: "wnba", statIds: ["basketball-points", "basketball-assists", "basketball-rebounds"], title: "Sample league percentiles", unit: "percentile" }),
    dataset("comparison-wnba", "comparison_matrix", "basketball", ["wnba-caitlin-clark", "wnba-sabrina-ionescu"], [
      { entityId: "wnba-caitlin-clark", statId: "basketball-points", label: "Clark · points", value: 25.5 },
      { entityId: "wnba-sabrina-ionescu", statId: "basketball-points", label: "Ionescu · points", value: 21.8 },
      { entityId: "wnba-caitlin-clark", statId: "basketball-assists", label: "Clark · assists", value: 8.1 },
      { entityId: "wnba-sabrina-ionescu", statId: "basketball-assists", label: "Ionescu · assists", value: 6.3 },
    ], { leagueId: "wnba", title: "Sample athlete comparison matrix", unit: "per game" }),
    dataset("shots-clark", "shot_chart", "basketball", ["wnba-caitlin-clark"], [
      { x: 12, y: 18, outcome: "made", pointValue: 2, zoneId: "restricted", period: 1, homeAway: "home", opponentId: "LVA" },
      { x: 30, y: 35, outcome: "missed", pointValue: 2, zoneId: "paint", period: 1, homeAway: "home", opponentId: "LVA" },
      { x: 8, y: 78, outcome: "made", pointValue: 3, zoneId: "left-corner-three", period: 2, homeAway: "home", opponentId: "LVA" },
      { x: 76, y: 72, outcome: "missed", pointValue: 3, zoneId: "right-wing-three", period: 3, homeAway: "away", opponentId: "NYL" },
      { x: 50, y: 82, outcome: "made", pointValue: 3, zoneId: "above-break-three", period: 4, homeAway: "away", opponentId: "NYL" },
      { x: 64, y: 42, outcome: "made", pointValue: 2, zoneId: "midrange", period: 4, homeAway: "home", opponentId: "LVA" },
    ], { leagueId: "wnba", title: "Sample shot locations", coordinateSystem: "neutral-basketball-half-court", eventIds: ["wnba-fever-aces"], unit: "shot" }),
    dataset("zones-fever", "zone_map", "basketball", ["IND-W"], [
      { label: "Restricted area", zoneId: "restricted", attempts: 22, makes: 15, value: 68.2 },
      { label: "Paint", zoneId: "paint", attempts: 18, makes: 8, value: 44.4 },
      { label: "Midrange", zoneId: "midrange", attempts: 12, makes: 5, value: 41.7 },
      { label: "Corner three", zoneId: "corner-three", attempts: 10, makes: 4, value: 40 },
      { label: "Above break three", zoneId: "above-break-three", attempts: 28, makes: 9, value: 32.1 },
    ], { leagueId: "wnba", entityType: "team", title: "Sample team shot-zone efficiency", unit: "percent" }),
    dataset("flow-fever-aces", "event_sequence", "basketball", ["IND-W", "LVA"], [
      { timestamp: "2026-07-30T20:02:00Z", label: "Fever 2–0", value: 2, eventKind: "score", period: 1 },
      { timestamp: "2026-07-30T20:08:00Z", label: "Aces 8–6", value: -2, eventKind: "lead-change", period: 1 },
      { timestamp: "2026-07-30T20:28:00Z", label: "Halftime 42–39", value: 3, eventKind: "period-end", period: 2 },
      { timestamp: "2026-07-30T21:10:00Z", label: "Fever 79–74", value: 5, eventKind: "final", period: 4 },
    ], { leagueId: "wnba", entityType: "team", eventIds: ["wnba-fever-aces"], title: "Sample game scoring flow", unit: "point differential" }),

    dataset("spray-judge", "spray_chart", "baseball", ["mlb-aaron-judge"], [
      { x: 30, y: 58, outcome: "home-run", hitType: "fly-ball", exitVelocity: 108.2, launchAngle: 29, handedness: "right" },
      { x: 45, y: 42, outcome: "single", hitType: "line-drive", exitVelocity: 101.4, launchAngle: 14, handedness: "right" },
      { x: 72, y: 66, outcome: "out", hitType: "fly-ball", exitVelocity: 96.1, launchAngle: 34, handedness: "left" },
      { x: 58, y: 28, outcome: "double", hitType: "line-drive", exitVelocity: 104.8, launchAngle: 18, handedness: "right" },
    ], { leagueId: "mlb", title: "Sample batted-ball locations", coordinateSystem: "neutral-baseball-field", unit: "batted ball" }),
    dataset("pitches-cole", "pitch_location_map", "baseball", ["mlb-gerrit-cole"], [
      { x: 42, y: 35, outcome: "called-strike", pitchType: "four-seam", velocity: 96.8, count: "0-1", handedness: "right" },
      { x: 58, y: 52, outcome: "swinging-strike", pitchType: "slider", velocity: 88.4, count: "1-2", handedness: "right" },
      { x: 78, y: 18, outcome: "ball", pitchType: "curveball", velocity: 82.1, count: "0-0", handedness: "left" },
      { x: 35, y: 62, outcome: "contact", pitchType: "changeup", velocity: 89.3, count: "2-1", handedness: "left" },
    ], { leagueId: "mlb", title: "Sample pitch locations", coordinateSystem: "neutral-strike-zone", unit: "pitch" }),
    dataset("pitch-mix-cole", "pitch_mix_chart", "baseball", ["mlb-gerrit-cole"], [
      { label: "Four-seam", value: 48, velocity: 96.4, whiffRate: 28.0 },
      { label: "Slider", value: 27, velocity: 88.2, whiffRate: 34.5 },
      { label: "Curveball", value: 15, velocity: 82.4, whiffRate: 31.0 },
      { label: "Changeup", value: 10, velocity: 89.0, whiffRate: 22.5 },
    ], { leagueId: "mlb", title: "Sample pitch usage", unit: "percent" }),
    dataset("innings-yankees", "stacked_bar_chart", "baseball", ["NYY"], [
      ...[0, 1, 0, 2, 0, 1, 0, 0, 1].map((value, index) => ({ label: `Inning ${index + 1}`, value, seriesId: "NYY" })),
      ...[0, 0, 1, 0, 0, 0, 2, 0, 0].map((value, index) => ({ label: `Inning ${index + 1}`, value, seriesId: "LAD" })),
    ], { leagueId: "mlb", entityType: "team", title: "Sample runs by inning", unit: "runs" }),

    dataset("hockey-shots-matthews", "shot_map", "ice-hockey", ["nhl-auston-matthews"], [
      { x: 21, y: 48, outcome: "goal", strengthState: "even", period: 1 },
      { x: 34, y: 52, outcome: "saved", strengthState: "power-play", period: 2 },
      { x: 67, y: 33, outcome: "missed", strengthState: "even", period: 2 },
      { x: 49, y: 62, outcome: "blocked", strengthState: "even", period: 3 },
    ], { leagueId: "nhl", title: "Sample hockey shot locations", coordinateSystem: "neutral-hockey-rink", unit: "shot" }),
    dataset("hockey-team-shots", "shot_map", "ice-hockey", ["TOR"], [
      { x: 20, y: 44, outcome: "goal", strengthState: "even", period: 1 },
      { x: 36, y: 58, outcome: "saved", strengthState: "even", period: 1 },
      { x: 62, y: 36, outcome: "saved", strengthState: "power-play", period: 3 },
      { x: 70, y: 68, outcome: "missed", strengthState: "even", period: 3 },
    ], { leagueId: "nhl", entityType: "team", title: "Sample team shot map", coordinateSystem: "neutral-hockey-rink", unit: "shot" }),
    dataset("goalie-save-trend", "line_chart", "ice-hockey", ["nhl-igor-shesterkin"], datedValues("goalie", [27, 31, 24, 36, 29, 33]), {
      leagueId: "nhl", statIds: ["hockey-goalie-saves"], title: "Sample goalie saves trend", unit: "saves",
    }),
    dataset("hockey-timeline", "event_sequence", "ice-hockey", ["TOR"], [
      { timestamp: "2026-07-20T23:05:00Z", label: "Goal · even strength", eventKind: "goal", period: 1, value: 1 },
      { timestamp: "2026-07-20T23:18:00Z", label: "Minor penalty", eventKind: "penalty", period: 1, value: 0 },
      { timestamp: "2026-07-21T00:02:00Z", label: "Power-play goal", eventKind: "goal", period: 2, value: 2 },
    ], { leagueId: "nhl", entityType: "team", title: "Sample hockey event timeline" }),

    dataset("soccer-shots-messi", "shot_map", "soccer", ["mls-lionel-messi"], [
      { x: 82, y: 49, outcome: "goal", onTarget: true, bodyPart: "left-foot", playType: "open-play" },
      { x: 73, y: 35, outcome: "saved", onTarget: true, bodyPart: "left-foot", playType: "free-kick" },
      { x: 68, y: 64, outcome: "blocked", onTarget: false, bodyPart: "left-foot", playType: "open-play" },
      { x: 78, y: 73, outcome: "missed", onTarget: false, bodyPart: "right-foot", playType: "open-play" },
    ], { leagueId: "mls", title: "Sample soccer shot map", coordinateSystem: "neutral-soccer-pitch", unit: "shot" }),
    dataset("soccer-heat-messi", "heat_map", "soccer", ["mls-lionel-messi"], [
      { x: 55, y: 42, eventKind: "touch", value: 1 }, { x: 61, y: 47, eventKind: "touch", value: 1 },
      { x: 70, y: 38, eventKind: "pass", value: 1 }, { x: 76, y: 52, eventKind: "touch", value: 1 },
      { x: 82, y: 48, eventKind: "shot", value: 1 }, { x: 67, y: 64, eventKind: "defensive-action", value: 1 },
    ], { leagueId: "mls", title: "Sample event-density map · touches and actions", coordinateSystem: "neutral-soccer-pitch" }),
    dataset("soccer-passing-miami", "passing_network", "soccer", ["MIA"], [
      { fromId: "MIA-10", toId: "MIA-9", fromX: 66, fromY: 48, toX: 79, toY: 51, value: 14, completed: 12 },
      { fromId: "MIA-8", toId: "MIA-10", fromX: 53, fromY: 39, toX: 66, toY: 48, value: 18, completed: 16 },
      { fromId: "MIA-2", toId: "MIA-8", fromX: 35, fromY: 68, toX: 53, toY: 39, value: 11, completed: 9 },
    ], { leagueId: "mls", entityType: "team", title: "Sample passing network", coordinateSystem: "neutral-soccer-pitch", unit: "passes" }),
    dataset("soccer-corners-miami", "corner_map", "soccer", ["MIA"], [
      { x: 87, y: 31, outcome: "first-contact", side: "left", shotGenerated: true },
      { x: 91, y: 55, outcome: "cleared", side: "right", shotGenerated: false },
      { x: 83, y: 48, outcome: "goal-generated", side: "left", shotGenerated: true },
    ], { leagueId: "mls", entityType: "team", title: "Sample corner deliveries", coordinateSystem: "neutral-soccer-pitch" }),
    dataset("soccer-match-flow", "event_sequence", "soccer", ["MIA"], [
      { timestamp: "2026-07-25T23:10:00Z", label: "Shot on target", eventKind: "shot-on-target", value: 1 },
      { timestamp: "2026-07-25T23:22:00Z", label: "Goal", eventKind: "goal", value: 1 },
      { timestamp: "2026-07-25T23:38:00Z", label: "Yellow card", eventKind: "card", value: 0 },
      { timestamp: "2026-07-26T00:12:00Z", label: "Substitution", eventKind: "substitution", value: 0 },
    ], { leagueId: "mls", entityType: "team", title: "Sample match timeline" }),

    dataset("combat-strikes-a", "strike_map", "mma", ["ufc-sample-fighter-a"], [
      { target: "Head", attempted: 62, landed: 31, absorbed: 22, position: "distance", round: 1, value: 31 },
      { target: "Body", attempted: 28, landed: 17, absorbed: 9, position: "clinch", round: 2, value: 17 },
      { target: "Leg", attempted: 24, landed: 19, absorbed: 11, position: "distance", round: 3, value: 19 },
    ], { leagueId: "ufc", entityType: "fighter", title: "Sample strike target distribution", unit: "strikes" }),
    dataset("combat-rounds", "grouped_bar_chart", "mma", ["ufc-sample-fighter-a", "ufc-sample-fighter-b"], [
      ...[31, 28, 24].map((value, index) => ({ label: `Round ${index + 1}`, value, seriesId: "Fighter A" })),
      ...[22, 25, 19].map((value, index) => ({ label: `Round ${index + 1}`, value, seriesId: "Fighter B" })),
    ], { leagueId: "ufc", entityType: "fighter", title: "Sample significant strikes by round", unit: "strikes" }),
    dataset("combat-takedowns", "takedown_map", "mma", ["ufc-sample-fighter-a"], [
      { timestamp: "2026-07-12T03:04:00Z", label: "Takedown landed", eventKind: "takedown", round: 1 },
      { timestamp: "2026-07-12T03:08:00Z", label: "Control interval began", eventKind: "control", round: 1 },
      { timestamp: "2026-07-12T03:16:00Z", label: "Submission attempt", eventKind: "submission-attempt", round: 2 },
    ], { leagueId: "ufc", entityType: "fighter", title: "Sample takedown and grappling timeline" }),
    dataset("combat-fight-timeline", "fight_timeline", "mma", ["ufc-sample-fighter-a", "ufc-sample-fighter-b"], [
      { timestamp: "2026-07-12T03:00:00Z", label: "Round 1 began", eventKind: "round-start", round: 1 },
      { timestamp: "2026-07-12T03:04:00Z", label: "Takedown", eventKind: "takedown", round: 1 },
      { timestamp: "2026-07-12T03:12:00Z", label: "Knockdown", eventKind: "knockdown", round: 2 },
      { timestamp: "2026-07-12T03:18:00Z", label: "Stoppage", eventKind: "stoppage", round: 2 },
    ], { leagueId: "ufc", entityType: "fighter", title: "Sample fight event timeline" }),
    dataset("combat-radar", "matchup_radar", "mma", ["ufc-sample-fighter-a", "ufc-sample-fighter-b"], [
      ...[["Striking output", 78], ["Striking accuracy", 64], ["Striking defense", 71], ["Takedown output", 58], ["Takedown defense", 75], ["Finish rate", 69]].map(([label, value]) => ({ label, value, seriesId: "Fighter A" })),
      ...[["Striking output", 66], ["Striking accuracy", 72], ["Striking defense", 63], ["Takedown output", 74], ["Takedown defense", 61], ["Finish rate", 77]].map(([label, value]) => ({ label, value, seriesId: "Fighter B" })),
    ], { leagueId: "ufc", entityType: "fighter", title: "Sample normalized style comparison", unit: "index" }),

    dataset("f1-positions", "race_position_chart", "motorsport", ["f1-max-verstappen", "f1-lando-norris"], [
      ...[1, 1, 2, 2, 1, 1].map((position, index) => ({ lap: index + 1, value: position, position, seriesId: "Verstappen", pitStop: index === 3, sessionStatus: "green" })),
      ...[3, 2, 1, 1, 2, 2].map((position, index) => ({ lap: index + 1, value: position, position, seriesId: "Norris", pitStop: index === 4, sessionStatus: "green" })),
    ], { leagueId: "f1", entityType: "driver", title: "Sample Formula 1 race position", unit: "position" }),
    dataset("f1-laps", "lap_time_chart", "motorsport", ["f1-max-verstappen", "f1-lando-norris"], [
      ...[91.2, 90.8, 90.6, 112.0, 90.4].map((value, index) => ({ lap: index + 1, value, seriesId: "Verstappen", valid: index !== 3, pitLap: index === 3 })),
      ...[91.5, 91.0, 90.7, 90.5, 111.4].map((value, index) => ({ lap: index + 1, value, seriesId: "Norris", valid: index !== 4, pitLap: index === 4 })),
    ], { leagueId: "f1", entityType: "driver", title: "Sample lap-time comparison", unit: "seconds" }),
    dataset("f1-qualifying", "qualifying_chart", "motorsport", ["f1-max-verstappen", "f1-lando-norris"], [
      ...[29.8, 31.1, 30.0].map((value, index) => ({ label: `Sector ${index + 1}`, value, seriesId: "Verstappen" })),
      ...[29.9, 30.9, 30.2].map((value, index) => ({ label: `Sector ${index + 1}`, value, seriesId: "Norris" })),
    ], { leagueId: "f1", entityType: "driver", title: "Sample qualifying sector comparison", unit: "seconds" }),
    dataset("f1-standings", "standings_progression", "motorsport", ["f1-max-verstappen", "f1-lando-norris"], [
      ...[25, 43, 61, 86, 104].map((value, index) => ({ timestamp: `2026-0${index + 3}-01T12:00:00Z`, label: `Round ${index + 1}`, value, seriesId: "Verstappen" })),
      ...[18, 36, 58, 73, 98].map((value, index) => ({ timestamp: `2026-0${index + 3}-01T12:00:00Z`, label: `Round ${index + 1}`, value, seriesId: "Norris" })),
    ], { leagueId: "f1", entityType: "driver", title: "Sample championship points progression", unit: "points" }),
    dataset("f1-telemetry", "telemetry_chart", "motorsport", ["f1-max-verstappen", "f1-lando-norris"], [
      ...[0, 250, 500, 750, 1000].map((distance, index) => ({ distance, value: [120, 220, 285, 170, 300][index], metric: "speed", seriesId: "Verstappen" })),
      ...[0, 250, 500, 750, 1000].map((distance, index) => ({ distance, value: [118, 216, 281, 175, 296][index], metric: "speed", seriesId: "Norris" })),
    ], { leagueId: "f1", entityType: "driver", title: "Sample speed telemetry overlay", unit: "km/h" }),
    dataset("nascar-positions", "race_position_chart", "motorsport", ["nascar-sample-driver"], [
      ...[12, 9, 7, 4, 8, 5].map((position, index) => ({ lap: (index + 1) * 20, value: position, position, seriesId: "Sample Driver", stage: index === 1 ? "Stage 1" : index === 3 ? "Stage 2" : "", caution: index === 4 })),
    ], { leagueId: "nascar-cup", entityType: "driver", title: "Sample NASCAR race position with stages", unit: "position" }),

    dataset("golf-scoring", "golf_scoring_chart", "golf", ["golf-sample-golfer"], [
      ...[0, -1, 0, 1, 0, -1, -1, 0, 1].map((value, index) => ({ hole: index + 1, label: `Hole ${index + 1}`, value, par: index % 3 === 0 ? 5 : 4 })),
    ], { leagueId: "pga", entityType: "golfer", title: "Sample scoring by hole", unit: "relative to par" }),
    dataset("golf-history", "line_chart", "golf", ["golf-sample-golfer"], datedValues("golf", [18, 12, 28, 7, 21]), {
      leagueId: "pga", entityType: "golfer", title: "Sample tournament finish history", unit: "finish position",
    }),
    dataset("golf-dispersion", "golf_dispersion_map", "golf", ["golf-sample-golfer"], [
      { x: 47, y: 65, shotType: "approach", distance: 155, outcome: "green" },
      { x: 54, y: 72, shotType: "approach", distance: 162, outcome: "green" },
      { x: 36, y: 58, shotType: "approach", distance: 149, outcome: "left-miss" },
      { x: 63, y: 50, shotType: "tee", distance: 286, outcome: "right-miss" },
    ], { leagueId: "pga", entityType: "golfer", title: "Sample shot dispersion", coordinateSystem: "provider-normalized-golf-target", unit: "shot" }),

    dataset("tennis-serves", "serve_placement_map", "tennis", ["tennis-sample-player"], [
      { zoneId: "wide", courtSide: "deuce", serveNumber: 1, outcome: "ace", x: 18, y: 35, value: 1 },
      { zoneId: "body", courtSide: "deuce", serveNumber: 1, outcome: "returned", x: 42, y: 42, value: 1 },
      { zoneId: "t", courtSide: "ad", serveNumber: 2, outcome: "fault", x: 58, y: 45, value: 1 },
      { zoneId: "wide", courtSide: "ad", serveNumber: 1, outcome: "returned", x: 82, y: 36, value: 1 },
    ], { leagueId: "atp", entityType: "tennis-player", title: "Sample serve placement", coordinateSystem: "neutral-tennis-service-box", unit: "serve" }),
    dataset("tennis-flow", "tennis_match_flow", "tennis", ["tennis-sample-player"], [
      { timestamp: "2026-07-27T16:00:00Z", label: "Set 1 · hold", eventKind: "hold", value: 1 },
      { timestamp: "2026-07-27T16:22:00Z", label: "Set 1 · break", eventKind: "break", value: 2 },
      { timestamp: "2026-07-27T16:48:00Z", label: "Set 1 won 6–4", eventKind: "set", value: 3 },
      { timestamp: "2026-07-27T17:32:00Z", label: "Set 2 lost 4–6", eventKind: "set", value: 2 },
      { timestamp: "2026-07-27T18:15:00Z", label: "Match won", eventKind: "match", value: 4 },
    ], { leagueId: "atp", entityType: "tennis-player", title: "Sample match score flow" }),
    dataset("tennis-surfaces", "grouped_bar_chart", "tennis", ["tennis-sample-player"], [
      { label: "Hard", value: 62, seriesId: "Win rate" }, { label: "Clay", value: 54, seriesId: "Win rate" },
      { label: "Grass", value: 67, seriesId: "Win rate" }, { label: "Indoor", value: 59, seriesId: "Win rate" },
    ], { leagueId: "atp", entityType: "tennis-player", title: "Sample surface splits", unit: "percent" }),

    dataset("market-line-history", "market_line_chart", "basketball", ["wnba-caitlin-clark"], [
      { timestamp: "2026-07-30T12:00:00Z", label: "Open", value: 23.5, marketId: "sample-clark-points", sportsbook: "Sample Sportsbook", status: "open" },
      { timestamp: "2026-07-30T14:00:00Z", label: "Update", value: 24.0, marketId: "sample-clark-points", sportsbook: "Sample Sportsbook", status: "open" },
      { timestamp: "2026-07-30T15:00:00Z", label: "Current", value: 24.5, marketId: "sample-clark-points", sportsbook: "Sample Sportsbook", status: "open" },
    ], { leagueId: "wnba", title: "Sample market line movement", unit: "points" }),
    dataset("odds-history", "odds_movement_chart", "basketball", ["wnba-caitlin-clark"], [
      { timestamp: "2026-07-30T12:00:00Z", value: -110, marketId: "sample-clark-points", sportsbook: "Sample Sportsbook A" },
      { timestamp: "2026-07-30T14:00:00Z", value: -115, marketId: "sample-clark-points", sportsbook: "Sample Sportsbook A" },
      { timestamp: "2026-07-30T12:00:00Z", value: -105, marketId: "sample-clark-points", sportsbook: "Sample Sportsbook B" },
      { timestamp: "2026-07-30T14:00:00Z", value: -110, marketId: "sample-clark-points", sportsbook: "Sample Sportsbook B" },
    ], { leagueId: "wnba", title: "Sample American-odds movement", unit: "american odds" }),
    dataset("market-correlation", "correlation_matrix", "basketball", ["wnba-caitlin-clark"], [
      { leftId: "points", rightId: "assists", label: "Points × assists", value: 0.31, sampleSize: 8, settlementScope: "full-event" },
      { leftId: "points", rightId: "threes", label: "Points × threes", value: 0.58, sampleSize: 8, settlementScope: "full-event" },
      { leftId: "assists", rightId: "threes", label: "Assists × threes", value: 0.12, sampleSize: 8, settlementScope: "full-event" },
    ], { leagueId: "wnba", title: "Sample historical market-stat correlation", unit: "correlation" }),
  ]),
});
