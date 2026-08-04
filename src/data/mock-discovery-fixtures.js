const UPDATED_AT = "2026-07-30T12:30:00.000Z";

const change = (id, changeType, sportId, leagueId, title, oldValue, newValue, options = {}) => Object.freeze({
  id, changeType, sportId, leagueId, title, oldValue, newValue,
  entityIds: Object.freeze(options.entityIds || []),
  eventIds: Object.freeze(options.eventIds || []),
  storyIds: Object.freeze(options.storyIds || []),
  statIds: Object.freeze(options.statIds || []),
  marketIds: Object.freeze(options.marketIds || []),
  occurredAt: options.occurredAt || UPDATED_AT,
  significance: options.significance || 1,
  source: Object.freeze({ id: "edgeboard-discovery-fixtures-v1", label: "EdgeBoard deterministic discovery fixtures", sample: true }),
  freshness: Object.freeze({ state: "sample", lastUpdated: options.occurredAt || UPDATED_AT }),
  warnings: Object.freeze(["Fixture-backed sample change; not a current real-world update."]),
});

export const MOCK_DISCOVERY_CHANGES = Object.freeze([
  change("change-wnba-leader", "leader_change", "basketball", "wnba", "WNBA sample assist leader changed", 2, 1, { entityIds: ["wnba-caitlin-clark"], statIds: ["basketball-assists"] }),
  change("change-nhl-streak", "streak_extended", "ice-hockey", "nhl", "NHL sample point streak extended", 2, 3, { entityIds: ["nhl-auston-matthews"], statIds: ["hockey-points"] }),
  change("change-mlb-streak-ended", "streak_ended", "baseball", "mlb", "MLB sample hit streak ended", 4, "ended", { entityIds: ["mlb-aaron-judge"], statIds: ["baseball-hits"] }),
  change("change-boxing-milestone", "milestone_reached", "boxing", "boxing", "Boxing sample knockout milestone reached", 4, 5, { entityIds: ["boxing-sample-boxer-a"], statIds: ["combat-knockout-wins"] }),
  change("change-f1-rescheduled", "event_rescheduled", "motorsport", "f1", "Sample race start time changed", "13:00", "14:00", { eventIds: ["F1-001"] }),
  change("change-wnba-market", "line_movement", "basketball", "wnba", "Sample assist line moved", 7.5, 8, { entityIds: ["wnba-caitlin-clark"], marketIds: ["player_assists"], significance: 0.5 }),
]);

export const MOCK_DISCOVERY_UPDATED_AT = UPDATED_AT;
