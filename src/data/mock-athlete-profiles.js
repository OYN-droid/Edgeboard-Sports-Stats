export const MOCK_PROFILE_UPDATED_AT = "2026-07-28T15:20:00.000Z";

const profile = (fields) => Object.freeze({
  sample: true,
  seasonLabel: "Illustrative 2026 sample",
  status: "Active",
  availabilityStatus: "Available",
  ...fields,
});
export const MOCK_ATHLETE_PROFILE_METADATA = Object.freeze({
  "wnba-caitlin-clark": profile({
    shortName: "C. Clark", teamName: "Indiana Fever", organization: "Indiana Fever",
    jerseyNumber: "22", age: 24, height: "6 ft 0 in", weight: "152 lb", nationality: "United States",
    handednessLabel: "Shoots", handedness: "Right", role: "Guard",
    nextEvent: { id: "wnba-profile-next", opponent: "Las Vegas Aces", startsAt: "2026-08-02T19:00:00.000Z", venue: "Sample Arena", homeAway: "home" },
    matchup: { opponent: "Las Vegas Aces", eventTime: "2026-08-02T19:00:00.000Z", venue: "Sample Arena", homeAway: "home", factors: [{ label: "Recent sample", value: "10 completed games", sampleSize: 10 }], warnings: ["Opponent-rank data is unavailable from the sample provider."] },
  }),
  "nba-tyrese-maxey": profile({
    shortName: "T. Maxey", teamName: "Philadelphia 76ers", organization: "Philadelphia 76ers",
    jerseyNumber: "0", age: 25, height: "6 ft 2 in", weight: "200 lb", nationality: "United States",
    handednessLabel: "Shoots", handedness: "Right", role: "Guard",
    nextEvent: { id: "PHI-CHI", opponent: "Chicago", startsAt: "2026-07-29T23:00:00.000Z", venue: "Sample Center", homeAway: "home" },
    matchup: { opponent: "Chicago", eventTime: "2026-07-29T23:00:00.000Z", venue: "Sample Center", homeAway: "home", factors: [{ label: "Recent sample", value: "10 completed games", sampleSize: 10 }], warnings: ["Lineup status is unavailable from the sample provider."] },
  }),
  "mlb-aaron-judge": profile({
    shortName: "A. Judge", teamName: "New York Yankees", organization: "New York Yankees",
    jerseyNumber: "99", age: 34, height: "6 ft 7 in", weight: "282 lb", nationality: "United States",
    handednessLabel: "Bats / Throws", handedness: "Right / Right", role: "Outfielder",
    nextEvent: { id: "NYY-TOR", opponent: "Toronto", startsAt: "2026-07-30T23:05:00.000Z", venue: "Sample Ballpark", homeAway: "home" },
    matchup: { opponent: "Toronto", eventTime: "2026-07-30T23:05:00.000Z", venue: "Sample Ballpark", homeAway: "home", factors: [{ label: "Recent sample", value: "8 completed games", sampleSize: 8 }], warnings: ["Pitcher handedness is not supplied for every sample row."] },
  }),
  "mlb-gerrit-cole": profile({
    shortName: "G. Cole", teamName: "New York Yankees", organization: "New York Yankees",
    jerseyNumber: "45", age: 35, height: "6 ft 4 in", weight: "220 lb", nationality: "United States",
    handednessLabel: "Throws", handedness: "Right", role: "Pitcher",
    nextEvent: null,
    matchup: null,
  }),
  "nfl-patrick-mahomes": profile({
    shortName: "P. Mahomes", teamName: "Kansas City Chiefs", organization: "Kansas City Chiefs",
    jerseyNumber: "15", age: 30, height: "6 ft 2 in", weight: "225 lb", nationality: "United States",
    handednessLabel: "Throws", handedness: "Right", role: "Quarterback",
    nextEvent: { id: "nfl-profile-next", opponent: "Buffalo", startsAt: "2026-08-15T00:00:00.000Z", venue: "Sample Stadium", homeAway: "home" },
    matchup: { opponent: "Buffalo", eventTime: "2026-08-15T00:00:00.000Z", venue: "Sample Stadium", homeAway: "home", factors: [{ label: "Recent sample", value: "5 completed games", sampleSize: 5 }], warnings: ["Weather and projected role are unavailable."] },
  }),
  "nhl-auston-matthews": profile({
    shortName: "A. Matthews", teamName: "Toronto Maple Leafs", organization: "Toronto Maple Leafs",
    jerseyNumber: "34", age: 28, height: "6 ft 3 in", weight: "215 lb", nationality: "United States",
    handednessLabel: "Shoots", handedness: "Left", role: "Center", nextEvent: null, matchup: null,
  }),
  "nhl-sample-goalie": profile({
    shortName: "S. Goalie", teamName: "Toronto Maple Leafs", organization: "Toronto Maple Leafs",
    jerseyNumber: "30", age: 27, height: "6 ft 3 in", weight: "205 lb", nationality: "Canada",
    handednessLabel: "Catches", handedness: "Left", role: "Goalie", nextEvent: null, matchup: null,
  }),
  "mls-lionel-messi": profile({
    shortName: "L. Messi", teamName: "Inter Miami", organization: "Inter Miami",
    jerseyNumber: "10", age: 39, height: "5 ft 7 in", weight: "159 lb", nationality: "Argentina",
    handednessLabel: "Preferred foot", handedness: "Left", role: "Forward",
    nextEvent: { id: "mls-profile-next", opponent: "Orlando", startsAt: "2026-08-01T23:30:00.000Z", venue: "Sample Football Ground", homeAway: "home" },
    matchup: { opponent: "Orlando", eventTime: "2026-08-01T23:30:00.000Z", venue: "Sample Football Ground", homeAway: "home", factors: [{ label: "Recent sample", value: "5 completed matches", sampleSize: 5 }], warnings: ["Formation and role data are unavailable."] },
  }),
  "ufc-sample-fighter-a": profile({
    shortName: "Fighter A", teamName: "UFC", organization: "UFC", age: 31, nationality: "Sample Nation",
    role: "Welterweight", stance: "Orthodox", record: "4-1 sample", reach: "76 in",
    nextEvent: { id: "ufc-sample-card", opponent: "Sample Fighter B", startsAt: "2026-08-09T02:00:00.000Z", venue: "Sample Arena", homeAway: "neutral" },
    matchup: { opponent: "Sample Fighter B", eventTime: "2026-08-09T02:00:00.000Z", venue: "Sample Arena", homeAway: "neutral", factors: [{ label: "Recent sample", value: "5 completed fights", sampleSize: 5 }, { label: "Stance matchup", value: "Orthodox vs Southpaw", sampleSize: 1 }], warnings: ["Reach comparison uses illustrative profile metadata."] },
  }),
  "boxing-sample-boxer-a": profile({
    shortName: "Boxer A", teamName: "Sample Boxing", organization: "Sample Boxing", age: 30, nationality: "Sample Nation",
    role: "Middleweight", stance: "Orthodox", record: "4-1 sample", reach: "73 in",
    nextEvent: { id: "boxing-sample-card", opponent: "Sample Boxer B", startsAt: "2026-08-16T01:00:00.000Z", venue: "Sample Hall", homeAway: "neutral" },
    matchup: { opponent: "Sample Boxer B", eventTime: "2026-08-16T01:00:00.000Z", venue: "Sample Hall", homeAway: "neutral", factors: [{ label: "Recent sample", value: "5 completed bouts", sampleSize: 5 }], warnings: ["Punch-level statistics are unavailable."] },
  }),
  "f1-max-verstappen": profile({
    shortName: "M. Verstappen", teamName: "Red Bull Racing", organization: "Red Bull Racing",
    jerseyNumber: "1", age: 28, nationality: "Netherlands", role: "Formula 1 Driver",
    handednessLabel: "Manufacturer", handedness: "Sample Constructor",
    nextEvent: { id: "f1-sample-race", opponent: "Race field", startsAt: "2026-08-02T13:00:00.000Z", venue: "Sample Circuit", homeAway: "neutral" },
    matchup: { opponent: "Race field", eventTime: "2026-08-02T13:00:00.000Z", venue: "Sample Circuit", homeAway: "neutral", factors: [{ label: "Recent sample", value: "5 completed races", sampleSize: 5 }], warnings: ["Practice, qualifying, and weather data are unavailable."] },
  }),
  "nascar-sample-driver": profile({
    shortName: "S. Driver", teamName: "Sample Motorsports", organization: "Sample Motorsports",
    jerseyNumber: "24", age: 29, nationality: "United States", role: "NASCAR Cup Driver",
    handednessLabel: "Manufacturer", handedness: "Sample Motors",
    nextEvent: { id: "nascar-sample-race", opponent: "Race field", startsAt: "2026-08-09T19:00:00.000Z", venue: "Sample Speedway", homeAway: "neutral" },
    matchup: { opponent: "Race field", eventTime: "2026-08-09T19:00:00.000Z", venue: "Sample Speedway", homeAway: "neutral", factors: [{ label: "Oval sample", value: "3 of 5 rows", sampleSize: 3 }], warnings: ["Qualifying and weather data are unavailable."] },
  }),
});
