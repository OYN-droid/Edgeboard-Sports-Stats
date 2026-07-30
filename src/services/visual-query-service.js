const VISUAL_PATTERNS = Object.freeze([
  ["telemetry_request", "telemetry_chart", /\btelemetry|speed trace|throttle|brake trace\b/i],
  ["race_chart_request", "race_position_chart", /\bposition chart|race position|running order\b/i],
  ["race_chart_request", "lap_time_chart", /\blap times?|lap comparison\b/i],
  ["race_chart_request", "qualifying_chart", /\bqualifying|sector comparison\b/i],
  ["market_history_request", "odds_movement_chart", /\bodds mov(?:e|ed|ement)|how (?:the )?odds moved\b/i],
  ["market_history_request", "market_line_chart", /\bline history|line mov(?:e|ed|ement)|opening line\b/i],
  ["correlation_visualization_request", "correlation_matrix", /\bcorrelation matrix|correlation chart\b/i],
  ["shot_chart_request", "shot_chart", /\bshot chart\b/i],
  ["spatial_map_request", "spray_chart", /\bspray chart|pulling the ball|batted.ball map\b/i],
  ["spatial_map_request", "pitch_location_map", /\bpitch locations?|pitch map\b/i],
  ["spatial_map_request", "heat_map", /\bheat map|touch map\b/i],
  ["spatial_map_request", "passing_network", /\bpassing network|pass network\b/i],
  ["spatial_map_request", "serve_placement_map", /\bserve placement|map .* serves?\b/i],
  ["spatial_map_request", "golf_dispersion_map", /\bshot dispersion|dispersion map\b/i],
  ["trend_chart_request", "golf_scoring_chart", /\bscoring by hole|score by hole\b/i],
  ["event_timeline_request", "tennis_match_flow", /\btennis match flow|score flow\b/i],
  ["spatial_map_request", "shot_map", /\bshot map|map .*shots? on goal\b/i],
  ["fight_timeline_request", "fight_timeline", /\bfight timeline|round by round\b/i],
  ["visualization_request", "strike_map", /\bstrikes? by target|strike distribution\b/i],
  ["event_timeline_request", "timeline", /\bevent timeline|match flow|game flow\b/i],
  ["trend_chart_request", "threshold_chart", /\bchart .* against .*line|threshold chart\b/i],
  ["trend_chart_request", "line_chart", /\bchart|trend line|plot\b/i],
]);

function numberAfter(query, pattern, fallback) {
  const matched = query.match(pattern);
  const value = Number(matched?.[1]);
  return Number.isFinite(value) ? value : fallback;
}

export function parseVisualizationQuery(query, context = {}) {
  const text = String(query || "").trim();
  const matched = VISUAL_PATTERNS.find(([, , expression]) => expression.test(text));
  if (!matched) {
    return Object.freeze({
      intent: "unsupported_visualization",
      visualizationType: "",
      confidence: 0,
      request: null,
      warnings: Object.freeze(["No supported visualization phrase was recognized."]),
    });
  }
  const [, visualizationType] = matched;
  const result = matched[0];
  const lastN = numberAfter(text, /\blast\s+(\d+)\b/i, 10);
  const threshold = numberAfter(text, /\b(?:line|threshold|over|under)\s+([+-]?\d+(?:\.\d+)?)\b/i, null);
  const period = numberAfter(text, /\b(?:period|quarter)\s+(\d+)\b/i, null);
  const round = numberAfter(text, /\bround\s+(\d+)\b/i, null);
  return Object.freeze({
    intent: result,
    visualizationType,
    confidence: 0.92,
    request: Object.freeze({
      visualizationType,
      sportId: context.sportId || "",
      leagueId: context.leagueId || "",
      entityType: context.entityType || "athlete",
      entityIds: Object.freeze(context.entityIds || []),
      eventIds: Object.freeze(context.eventIds || []),
      statIds: Object.freeze(context.statIds || []),
      dateRange: Object.freeze({ type: "last_n_games", value: lastN }),
      filters: Object.freeze({
        madeMissed: /\bmakes? only\b/i.test(text) ? "made"
          : /\bmiss(?:es|ed)? only\b/i.test(text) ? "missed" : "all",
        onTargetOnly: /\bshots? on target\b/i.test(text),
        period,
        round,
        threshold,
      }),
      comparisonMode: /\bcompare\b/i.test(text) ? "overlay" : null,
      includeBettingContext: /\bprop|odds|line|market\b/i.test(text),
    }),
    warnings: Object.freeze([]),
  });
}
