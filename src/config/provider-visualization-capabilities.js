const SUPPORTED = Object.freeze({
  aggregateBoxScores: true,
  gameLogs: true,
  playByPlay: true,
  eventTimestamps: true,
  spatialCoordinates: true,
  shotLocations: true,
  providerZones: true,
  battedBallCoordinates: true,
  pitchCoordinates: true,
  pitchEvents: true,
  touchCoordinates: true,
  passOriginsDestinations: true,
  cornerCoordinates: true,
  strikeTargets: true,
  combatEventTimeline: true,
  lapByLapPositions: true,
  lapTimes: true,
  sectorTimes: true,
  telemetry: true,
  pitStops: true,
  qualifyingSessions: true,
  trackCoordinates: false,
  golfHoleScores: true,
  golfShotLocations: true,
  servePlacements: true,
  tennisPointScores: true,
  oddsHistory: true,
  lineMovement: true,
  correlationSamples: true,
  standingsHistory: true,
  injuryTimelines: false,
  possessionCoordinates: false,
  substitutionStints: false,
  tennisShotTracking: false,
  bracketData: false,
});

export const PROVIDER_VISUALIZATION_CAPABILITIES = Object.freeze({
  "edgeboard-mock-visuals": Object.freeze({
    providerId: "edgeboard-mock-visuals",
    providerName: "EdgeBoard Sample Visualization Provider",
    sample: true,
    partial: true,
    lastUpdatedAt: "2026-07-30T15:00:00.000Z",
    capabilities: SUPPORTED,
  }),
});

export function getProviderVisualizationCapabilities(providerId = "edgeboard-mock-visuals") {
  return PROVIDER_VISUALIZATION_CAPABILITIES[providerId] || Object.freeze({
    providerId,
    providerName: "Unknown visualization provider",
    sample: false,
    partial: true,
    lastUpdatedAt: null,
    capabilities: Object.freeze({}),
  });
}
