const ALL_ENTITIES = Object.freeze([
  "athlete", "team", "fighter", "boxer", "driver", "golfer", "tennis-player",
  "promotion", "constructor", "league", "competition", "venue", "national-team",
]);

function visual(id, label, family, options = {}) {
  return Object.freeze({
    id,
    label,
    family,
    sports: Object.freeze(options.sports || []),
    leagueIds: Object.freeze(options.leagueIds || []),
    entityTypes: Object.freeze(options.entityTypes || ALL_ENTITIES),
    eventTypes: Object.freeze(options.eventTypes || []),
    requiredCapabilities: Object.freeze(options.requiredCapabilities || ["gameLogs"]),
    requiredFields: Object.freeze(options.requiredFields || ["value"]),
    minimumSampleSize: options.minimumSampleSize || 1,
    interactions: Object.freeze(options.interactions || ["accessible-table", "copy-summary", "copy-data", "share"]),
    coordinateSystem: options.coordinateSystem || null,
    implemented: options.implemented !== false,
    fallbackType: options.fallbackType || "line_chart",
    description: options.description || label,
  });
}
export const VISUALIZATION_REGISTRY = Object.freeze([
  visual("line_chart", "Recent performance", "cartesian", { requiredFields: ["timestamp", "value"], interactions: ["series-toggle", "date-range", "threshold", "point-focus", "accessible-table", "copy-summary", "copy-data", "share"] }),
  visual("area_chart", "Area trend", "cartesian", { requiredFields: ["timestamp", "value"] }),
  visual("bar_chart", "Bar chart", "bar", { requiredFields: ["label", "value"] }),
  visual("grouped_bar_chart", "Grouped comparison", "bar", { requiredFields: ["label", "value", "seriesId"] }),
  visual("stacked_bar_chart", "Stacked distribution", "bar", { requiredFields: ["label", "value", "seriesId"] }),
  visual("scatter_plot", "Scatter plot", "spatial", { requiredCapabilities: ["spatialCoordinates"], requiredFields: ["x", "y"] }),
  visual("distribution_plot", "Performance distribution", "distribution", { requiredFields: ["value"], minimumSampleSize: 3 }),
  visual("percentile_chart", "Percentile and rank", "bar", { requiredFields: ["label", "value", "percentile"], minimumSampleSize: 3 }),
  visual("rolling_average_chart", "Rolling average", "cartesian", { requiredFields: ["timestamp", "value"], minimumSampleSize: 2 }),
  visual("threshold_chart", "Historical threshold", "cartesian", { requiredFields: ["timestamp", "value"], minimumSampleSize: 2 }),
  visual("timeline", "Event timeline", "timeline", { requiredCapabilities: ["eventTimestamps"], requiredFields: ["timestamp", "label"] }),
  visual("event_sequence", "Event sequence", "timeline", { requiredCapabilities: ["playByPlay", "eventTimestamps"], requiredFields: ["timestamp", "label"] }),
  visual("comparison_matrix", "Comparison matrix", "matrix", { requiredFields: ["entityId", "statId", "value"], minimumSampleSize: 2 }),
  visual("correlation_matrix", "Correlation matrix", "matrix", { requiredCapabilities: ["correlationSamples"], requiredFields: ["leftId", "rightId", "value", "sampleSize"], minimumSampleSize: 3 }),
  visual("standings_progression", "Standings progression", "cartesian", { requiredCapabilities: ["standingsHistory"], requiredFields: ["timestamp", "value"] }),
  visual("matchup_radar", "Matchup radar", "radar", { requiredFields: ["label", "value", "seriesId"], minimumSampleSize: 3 }),

  visual("shot_chart", "Basketball shot chart", "spatial", { sports: ["basketball"], entityTypes: ["athlete", "team", "national-team"], requiredCapabilities: ["shotLocations"], requiredFields: ["x", "y", "outcome", "pointValue"], coordinateSystem: "neutral-basketball-half-court", fallbackType: "line_chart" }),
  visual("shot_map", "Shot map", "spatial", { sports: ["ice-hockey", "soccer"], entityTypes: ["athlete", "team", "national-team"], requiredCapabilities: ["shotLocations"], requiredFields: ["x", "y", "outcome"], coordinateSystem: "provider-normalized-field", fallbackType: "line_chart" }),
  visual("zone_map", "Zone efficiency", "bar", { sports: ["basketball", "ice-hockey"], requiredCapabilities: ["providerZones"], requiredFields: ["zoneId", "attempts", "makes"], fallbackType: "bar_chart" }),
  visual("spray_chart", "Batted-ball spray chart", "spatial", { sports: ["baseball"], requiredCapabilities: ["battedBallCoordinates"], requiredFields: ["x", "y", "outcome"], coordinateSystem: "neutral-baseball-field", fallbackType: "line_chart" }),
  visual("pitch_location_map", "Pitch location map", "spatial", { sports: ["baseball"], requiredCapabilities: ["pitchCoordinates"], requiredFields: ["x", "y", "outcome", "pitchType"], coordinateSystem: "neutral-strike-zone", fallbackType: "bar_chart" }),
  visual("pitch_mix_chart", "Pitch mix", "bar", { sports: ["baseball"], requiredCapabilities: ["pitchEvents"], requiredFields: ["label", "value"] }),
  visual("heat_map", "Event density heat map", "spatial", { sports: ["soccer"], requiredCapabilities: ["touchCoordinates"], requiredFields: ["x", "y", "eventKind"], coordinateSystem: "neutral-soccer-pitch", fallbackType: "line_chart" }),
  visual("passing_network", "Passing network", "network", { sports: ["soccer"], requiredCapabilities: ["passOriginsDestinations"], requiredFields: ["fromId", "toId", "fromX", "fromY", "toX", "toY", "value"], coordinateSystem: "neutral-soccer-pitch", fallbackType: "bar_chart" }),
  visual("corner_map", "Corner delivery map", "spatial", { sports: ["soccer"], requiredCapabilities: ["cornerCoordinates"], requiredFields: ["x", "y", "outcome"], coordinateSystem: "neutral-soccer-pitch", fallbackType: "timeline" }),
  visual("strike_map", "Strike target distribution", "bar", { sports: ["mma", "boxing", "combat", "kickboxing"], entityTypes: ["fighter", "boxer"], requiredCapabilities: ["strikeTargets"], requiredFields: ["target", "attempted", "landed"] }),
  visual("takedown_map", "Takedown timeline", "timeline", { sports: ["mma"], entityTypes: ["fighter"], requiredCapabilities: ["combatEventTimeline"], requiredFields: ["timestamp", "label", "eventKind"] }),
  visual("fight_timeline", "Fight timeline", "timeline", { sports: ["mma", "boxing", "combat", "kickboxing"], requiredCapabilities: ["combatEventTimeline"], requiredFields: ["timestamp", "label", "round"] }),
  visual("race_position_chart", "Race position", "cartesian", { sports: ["motorsport"], entityTypes: ["driver", "constructor", "team"], requiredCapabilities: ["lapByLapPositions"], requiredFields: ["lap", "position", "seriesId"], interactions: ["series-toggle", "point-focus", "event-select", "accessible-table", "copy-summary", "copy-data", "share"] }),
  visual("lap_time_chart", "Lap-time comparison", "cartesian", { sports: ["motorsport"], requiredCapabilities: ["lapTimes"], requiredFields: ["lap", "value", "seriesId"] }),
  visual("telemetry_chart", "Telemetry overlay", "cartesian", { sports: ["motorsport"], requiredCapabilities: ["telemetry"], requiredFields: ["distance", "value", "metric", "seriesId"], minimumSampleSize: 3, fallbackType: "lap_time_chart" }),
  visual("pit_stop_timeline", "Pit-stop timeline", "timeline", { sports: ["motorsport"], requiredCapabilities: ["pitStops"], requiredFields: ["timestamp", "label"] }),
  visual("track_map", "Track map", "spatial", { sports: ["motorsport"], requiredCapabilities: ["trackCoordinates"], requiredFields: ["x", "y"], coordinateSystem: "provider-track-path", fallbackType: "race_position_chart" }),
  visual("qualifying_chart", "Qualifying comparison", "bar", { sports: ["motorsport"], requiredCapabilities: ["qualifyingSessions"], requiredFields: ["label", "value", "seriesId"] }),
  visual("golf_scoring_chart", "Scoring by hole", "cartesian", { sports: ["golf"], entityTypes: ["golfer"], requiredCapabilities: ["golfHoleScores"], requiredFields: ["hole", "value"] }),
  visual("golf_dispersion_map", "Golf shot dispersion", "spatial", { sports: ["golf"], entityTypes: ["golfer"], requiredCapabilities: ["golfShotLocations"], requiredFields: ["x", "y", "shotType"], coordinateSystem: "provider-normalized-golf-target", fallbackType: "golf_scoring_chart" }),
  visual("serve_placement_map", "Serve placement", "spatial", { sports: ["tennis"], entityTypes: ["tennis-player"], requiredCapabilities: ["servePlacements"], requiredFields: ["zoneId", "courtSide", "serveNumber", "outcome"], coordinateSystem: "neutral-tennis-service-box", fallbackType: "bar_chart" }),
  visual("tennis_match_flow", "Tennis match flow", "timeline", { sports: ["tennis"], requiredCapabilities: ["tennisPointScores"], requiredFields: ["timestamp", "label", "value"] }),
  visual("market_line_chart", "Market line history", "cartesian", { requiredCapabilities: ["oddsHistory"], requiredFields: ["timestamp", "value", "marketId"], fallbackType: "unavailable" }),
  visual("odds_movement_chart", "Odds movement", "cartesian", { requiredCapabilities: ["oddsHistory"], requiredFields: ["timestamp", "value", "marketId", "sportsbook"], fallbackType: "unavailable" }),

  visual("possession_map", "Possession map", "spatial", { requiredCapabilities: ["possessionCoordinates"], implemented: false, fallbackType: "timeline" }),
  visual("rotation_timeline", "Rotation timeline", "timeline", { requiredCapabilities: ["substitutionStints"], implemented: false, fallbackType: "line_chart" }),
  visual("rally_map", "Rally map", "spatial", { requiredCapabilities: ["tennisShotTracking"], implemented: false, fallbackType: "tennis_match_flow" }),
  visual("bracket", "Tournament bracket", "bracket", { requiredCapabilities: ["bracketData"], implemented: false, fallbackType: "timeline" }),
  visual("unavailable", "Visualization unavailable", "unavailable", { requiredCapabilities: [], requiredFields: [], implemented: true, fallbackType: "unavailable" }),
]);

const BY_ID = new Map(VISUALIZATION_REGISTRY.map((definition) => [definition.id, definition]));

export function getVisualizationDefinition(id) {
  return BY_ID.get(String(id || "")) || null;
}

export function getVisualizationDefinitions({ sportId = "", entityType = "", implementedOnly = false } = {}) {
  return VISUALIZATION_REGISTRY.filter((definition) =>
    (!sportId || !definition.sports.length || definition.sports.includes(sportId))
    && (!entityType || definition.entityTypes.includes(entityType))
    && (!implementedOnly || definition.implemented));
}
