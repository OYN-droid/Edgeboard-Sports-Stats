const UPDATED_AT = "2026-07-30T12:30:00.000Z";
const source = Object.freeze({ id: "edgeboard-history-fixtures-v1", label: "EdgeBoard historical sample fixtures", sample: true });

const coverage = (sportId, leagueId, earliestSeason, latestCompleteSeason, overrides = {}) => Object.freeze({
  sportId, leagueId, earliestSeason, latestCompleteSeason,
  eventCompleteness: overrides.eventCompleteness || "partial",
  athleteCoverage: overrides.athleteCoverage || "partial",
  teamCoverage: overrides.teamCoverage || "partial",
  standingsCoverage: overrides.standingsCoverage || "unavailable",
  playoffCoverage: overrides.playoffCoverage || "unavailable",
  championshipCoverage: overrides.championshipCoverage || "unavailable",
  playByPlayAvailability: overrides.playByPlayAvailability || "unavailable",
  spatialDataAvailability: overrides.spatialDataAvailability || "unavailable",
  missingSeasons: Object.freeze(overrides.missingSeasons || []),
  providerLimitations: Object.freeze(overrides.providerLimitations || ["Illustrative sample rows only; not complete league history."]),
  validationStatus: overrides.validationStatus || "dataset_only",
  allTimeClaimsSupported: overrides.allTimeClaimsSupported === true,
  dataMode: "sample", source, lastSuccessfulUpdate: UPDATED_AT,
});

export const MOCK_HISTORICAL_COVERAGE = Object.freeze([
  coverage("basketball", "wnba", "2026", "2026", { eventCompleteness: "current-season-only", standingsCoverage: "partial", playoffCoverage: "partial", championshipCoverage: "partial" }),
  coverage("basketball", "nba", "2026", "2026", { eventCompleteness: "current-season-only", playoffCoverage: "partial", championshipCoverage: "partial" }),
  coverage("american-football", "nfl", "2026", "2026", { eventCompleteness: "current-season-only", playoffCoverage: "partial", championshipCoverage: "partial" }),
  coverage("baseball", "mlb", "2026", "2026", { eventCompleteness: "current-season-only", playoffCoverage: "partial", championshipCoverage: "partial" }),
  coverage("ice-hockey", "nhl", "2026", "2026", { eventCompleteness: "current-season-only", playoffCoverage: "partial" }),
  coverage("soccer", "mls", "2026", "2026", { eventCompleteness: "partial", playoffCoverage: "partial", championshipCoverage: "partial" }),
  coverage("mma", "ufc", "2025", "2026", { eventCompleteness: "partial", athleteCoverage: "partial", championshipCoverage: "partial", missingSeasons: [] }),
  coverage("boxing", "boxing", "2024", "2026", { eventCompleteness: "partial", championshipCoverage: "partial" }),
  coverage("motorsport", "f1", "2025", "2026", { eventCompleteness: "partial", standingsCoverage: "partial", championshipCoverage: "partial" }),
  coverage("motorsport", "nascar-cup", "2026", "2026", { eventCompleteness: "current-season-only", standingsCoverage: "partial" }),
  coverage("golf", "pga", "2026", "2026", { eventCompleteness: "current-season-only", championshipCoverage: "partial" }),
  coverage("tennis", "atp", "2026", "2026", { eventCompleteness: "current-season-only", championshipCoverage: "partial" }),
]);

const evidence = (id, label, values, eventId = null, occurredAt = UPDATED_AT) => Object.freeze({ id, label, values: Object.freeze(values), eventId, occurredAt, sourceId: source.id, status: "completed" });
const item = (id, type, sportId, leagueId, title, options = {}) => Object.freeze({
  id, type, sportId, leagueId, competitionId: options.competitionId || null, season: options.season || "2026",
  entityIds: Object.freeze(options.entityIds || []), teamIds: Object.freeze(options.teamIds || []), eventIds: Object.freeze(options.eventIds || []), statIds: Object.freeze(options.statIds || []),
  title, titleData: Object.freeze(options.titleData || {}), scope: Object.freeze(options.scope || { scopeType: "available_dataset", dateStart: null, dateEnd: null }),
  validationStatus: options.validationStatus || "dataset_only", supportingEvidence: Object.freeze(options.supportingEvidence || []),
  sources: Object.freeze([source]), freshness: Object.freeze({ state: "sample", lastUpdated: options.updatedAt || UPDATED_AT }),
  warnings: Object.freeze(options.warnings || ["Fixture-backed sample history; not complete real-world league history."]),
  correction: options.correction ? Object.freeze(options.correction) : null, metadata: Object.freeze(options.metadata || {}), sample: true,
});

export const MOCK_HISTORICAL_ITEMS = Object.freeze([
  item("history-wnba-scoring-high", "athlete_performance", "basketball", "wnba", "Highest-scoring WNBA performance in the available sample", { entityIds: ["wnba-caitlin-clark"], eventIds: ["wnba-sample-7"], statIds: ["basketball-points"], titleData: { value: 30, rank: 1 }, supportingEvidence: [evidence("hist-ev-1", "Completed sample game row", { points: 30 }, "wnba-sample-7")] }),
  item("history-wnba-championship", "championship", "basketball", "wnba", "Sample WNBA championship-season entry", { teamIds: ["LVA"], entityIds: ["LVA"], titleData: { champion: "Las Vegas Aces", runnerUp: "New York Liberty" }, metadata: { competitionFormat: "playoffs", bracketAvailable: false }, supportingEvidence: [evidence("hist-ev-2", "Explicit sample championship fixture", { championId: "LVA", runnerUpId: "NYL" })] }),
  item("history-nba-lakers-rivalry", "rivalry_event", "basketball", "nba", "Los Angeles Lakers and Philadelphia 76ers configured sample rivalry", { teamIds: ["LAL", "PHI"], entityIds: ["LAL", "PHI"], eventIds: ["nba-rivalry-sample-1"], titleData: { meetings: 1 }, metadata: { rivalryId: "rivalry-nba-lakers-sample", classification: "configured_rivalry" }, supportingEvidence: [evidence("hist-ev-2b", "Configured rivalry registry and completed sample meeting", { classification: "configured_rivalry" }, "nba-rivalry-sample-1")] }),
  item("history-nba-team-performance", "team_performance", "basketball", "nba", "Highest team scoring total in the available NBA sample", { teamIds: ["LAL"], entityIds: ["LAL"], eventIds: ["nba-team-performance-sample-1"], statIds: ["basketball-points"], titleData: { value: 121, unit: "points" }, supportingEvidence: [evidence("hist-ev-2c", "Completed sample team total row", { points: 121 }, "nba-team-performance-sample-1")] }),
  item("history-nfl-passing", "athlete_performance", "american-football", "nfl", "Top NFL passing performance in the available sample", { entityIds: ["nfl-patrick-mahomes"], statIds: ["football-passing-yards"], titleData: { value: 331, rank: 1 }, supportingEvidence: [evidence("hist-ev-3", "Completed sample game row", { passingYards: 331 }, "nfl-sample-4")] }),
  item("history-mlb-hit-streak", "streak", "baseball", "mlb", "Longest hit streak found in available MLB sample records", { entityIds: ["mlb-aaron-judge"], statIds: ["baseball-hits"], titleData: { value: 4, unit: "games" }, supportingEvidence: [evidence("hist-ev-4", "Four chronologically ordered completed rows", { streak: 4 })] }),
  item("history-mlb-pitching-high", "dataset_high", "baseball", "mlb", "Highest pitching strikeout total in the available sample", { entityIds: ["mlb-gerrit-cole"], statIds: ["baseball-pitcher-strikeouts"], titleData: { value: 8 }, validationStatus: "corrected", correction: { oldValue: 9, newValue: 8, correctedAt: UPDATED_AT, reason: "Fixture provider correction" }, supportingEvidence: [evidence("hist-ev-5", "Corrected completed-game statistic", { oldValue: 9, newValue: 8 }, "mlb-sample-1")] }),
  item("history-nhl-point-streak", "streak", "ice-hockey", "nhl", "Longest point streak found in available NHL sample records", { entityIds: ["nhl-auston-matthews"], statIds: ["hockey-points"], titleData: { value: 3, unit: "games" }, supportingEvidence: [evidence("hist-ev-6", "Three completed sample games", { streak: 3 })] }),
  item("history-mls-comeback", "comeback", "soccer", "mls", "Largest verified comeback in the available MLS sample", { entityIds: ["MIA", "ORL"], teamIds: ["MIA", "ORL"], eventIds: ["MLS-001"], titleData: { deficit: 2, finalMargin: 1 }, supportingEvidence: [evidence("hist-ev-7", "Completed match score progression", { deficit: 2, finalMargin: 1 }, "MLS-001")] }),
  item("history-mls-rivalry", "rivalry_event", "soccer", "mls", "Inter Miami and Orlando City configured sample rivalry timeline", { entityIds: ["MIA", "ORL"], teamIds: ["MIA", "ORL"], eventIds: ["MLS-001"], titleData: { meetings: 1 }, metadata: { rivalryId: "rivalry-mls-miami-orlando", classification: "configured_rivalry" }, supportingEvidence: [evidence("hist-ev-8", "Configured rivalry registry and completed meeting", { classification: "configured_rivalry" }, "MLS-001")] }),
  item("history-ufc-fastest-finish", "fighter_performance", "mma", "ufc", "Fastest finish in available UFC sample bouts", { entityIds: ["ufc-sample-fighter-a"], eventIds: ["ufc-story-finish-1"], statIds: ["combat-wins"], titleData: { value: 132, unit: "seconds" }, supportingEvidence: [evidence("hist-ev-9", "Completed sample bout with elapsed time", { elapsedSeconds: 132 }, "ufc-story-finish-1")] }),
  item("history-ufc-title", "title_change", "mma", "ufc", "Sample UFC title-history entry", { entityIds: ["ufc-sample-fighter-a", "promotion-ufc"], titleData: { title: "Sample division title" }, metadata: { competitionFormat: "fight_title_lineage" }, supportingEvidence: [evidence("hist-ev-10", "Explicit sample title fixture", { holderId: "ufc-sample-fighter-a" }, "ufc-title-sample-1")] }),
  item("history-boxing-trilogy", "rivalry_event", "boxing", "boxing", "Sample boxing trilogy timeline", { entityIds: ["boxing-sample-boxer-a", "promotion-sample-boxing"], eventIds: ["boxing-sample-1", "boxing-sample-2", "boxing-sample-3"], titleData: { meetings: 3 }, metadata: { rivalryId: "rivalry-boxing-sample-trilogy", classification: "combat_trilogy" }, supportingEvidence: [
    evidence("hist-ev-11a", "First explicit completed sample meeting", { meeting: 1 }, "boxing-sample-1"),
    evidence("hist-ev-11b", "Second explicit completed sample meeting", { meeting: 2 }, "boxing-sample-2"),
    evidence("hist-ev-11c", "Third explicit completed sample meeting", { meeting: 3 }, "boxing-sample-3"),
  ] }),
  item("history-f1-championship", "championship", "motorsport", "f1", "Sample Formula 1 points-championship season", { entityIds: ["f1-max-verstappen", "RBR"], teamIds: ["RBR"], titleData: { champion: "Max Verstappen", runnerUp: "Lando Norris" }, metadata: { competitionFormat: "points_championship" }, supportingEvidence: [evidence("hist-ev-12", "Explicit sample final standings fixture", { championId: "f1-max-verstappen", runnerUpId: "f1-lando-norris" })] }),
  item("history-nascar-comeback", "driver_performance", "motorsport", "nascar-cup", "Largest position gain in available NASCAR sample races", { entityIds: ["nascar-sample-driver"], eventIds: ["nascar-cup-sample-5"], statIds: ["motorsport-position-change"], titleData: { startingPosition: 25, finishingPosition: 3, value: 22 }, supportingEvidence: [evidence("hist-ev-13", "Completed race classification", { startingPosition: 25, finishingPosition: 3 }, "nascar-cup-sample-5")] }),
  item("history-pga-tournament", "tournament", "golf", "pga", "Sample golf tournament-history entry", { entityIds: ["golf-sample-golfer", "venue-augusta"], eventIds: ["pga-sample-1"], titleData: { finish: 4 }, metadata: { competitionFormat: "golf_tournament" }, supportingEvidence: [evidence("hist-ev-14", "Completed sample tournament row", { finish: 4 }, "pga-sample-1")] }),
  item("history-atp-head-to-head", "rivalry_event", "tennis", "atp", "Sample tennis head-to-head history", { entityIds: ["tennis-sample-player"], eventIds: ["ATP-TORONTO-01"], titleData: { meetings: 1 }, metadata: { classification: "direct_head_to_head", documentedRivalry: false }, supportingEvidence: [evidence("hist-ev-15", "Completed sample match", { winnerSeed: 28, opponentSeed: 2 }, "ATP-TORONTO-01")] }),
  item("history-atp-seed-upset", "upset", "tennis", "atp", "Largest seed-based upset in the available tennis sample", { entityIds: ["tennis-sample-player"], eventIds: ["ATP-TORONTO-01"], titleData: { winnerSeed: 28, opponentSeed: 2, seedDifference: 26 }, metadata: { baselineType: "seed" }, supportingEvidence: [evidence("hist-ev-15b", "Completed match with supplied tournament seeds", { winnerSeed: 28, opponentSeed: 2, result: "won" }, "ATP-TORONTO-01")] }),
  item("history-wnba-dynasty-candidate", "historical_story", "basketball", "wnba", "Sample championship-run candidate", { entityIds: ["LVA"], teamIds: ["LVA"], titleData: { championships: 2, windowSeasons: 4 }, metadata: { dynastyState: "candidate", criteriaMet: true }, supportingEvidence: [evidence("hist-ev-16", "Explicit sample championship counts", { championships: 2, windowSeasons: 4 })], warnings: ["Candidate based on configured sample criteria; not presented as a verified dynasty."] }),
  item("history-provider-record", "record", "american-football", "nfl", "Provider-recognized sample passing record", { entityIds: ["nfl-patrick-mahomes"], statIds: ["football-passing-yards"], titleData: { value: 331 }, validationStatus: "provider_asserted", supportingEvidence: [evidence("hist-ev-17", "Provider assertion fixture", { value: 331 })], warnings: ["Provider-asserted sample record with attribution; not independently verified by complete coverage."] }),
  item("history-verified-fixture-record", "record", "basketball", "wnba", "Verified fixture competition record", { entityIds: ["wnba-aja-wilson"], statIds: ["basketball-rebounds"], titleData: { value: 13 }, validationStatus: "verified_complete", scope: { scopeType: "fixture_competition", dateStart: "2026-07-01", dateEnd: "2026-07-30" }, supportingEvidence: [evidence("hist-ev-18", "Complete bounded fixture competition rows", { value: 13 })], warnings: ["Verified only for the explicitly bounded fixture competition, not real-world league history."] }),
  item("history-incomplete-all-time", "record", "basketball", "nba", "Unsupported all-time scoring query", { entityIds: ["nba-stephen-curry"], statIds: ["basketball-points"], validationStatus: "incomplete", supportingEvidence: [], warnings: ["EdgeBoard does not have enough verified historical coverage to answer this as an all-time question."] }),
]);

export const HISTORICAL_SOURCE = source;
export const HISTORICAL_UPDATED_AT = UPDATED_AT;
