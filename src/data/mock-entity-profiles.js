export const ENTITY_PROFILE_UPDATED_AT = "2026-07-30T12:30:00.000Z";
export const ENTITY_FIELD_UNAVAILABLE = "Unavailable from sample provider";

const profile = (facts = {}, collections = {}) => Object.freeze({
  facts: Object.freeze(facts),
  collections: Object.freeze(collections),
  source: "edgeboard-mock-entity-provider",
  updatedAt: ENTITY_PROFILE_UPDATED_AT,
  sample: true,
});

export const MOCK_ENTITY_PROFILES = Object.freeze({
  "IND-W": profile({
    league: "WNBA", conference: "Eastern Conference", division: "Not used by this competition",
    coach: ENTITY_FIELD_UNAVAILABLE, venue: ENTITY_FIELD_UNAVAILABLE, level: "Professional",
  }, {
    placeholders: ["Depth chart", "Injuries", "Starting lineup", "Team leaders", "Home/Away splits", "Offensive metrics", "Defensive metrics", "Pace", "Opponent trends", "Historical rankings", "Advanced team metrics"],
  }),
  LAL: profile({
    league: "NBA", conference: "Western Conference", division: "Pacific",
    coach: "Sample provider does not verify the current coach", venue: "Los Angeles Sample Arena", level: "Professional",
  }, {
    placeholders: ["Depth chart", "Injuries", "Starting lineup", "Team leaders", "Home/Away splits", "Offensive metrics", "Defensive metrics", "Pace", "Opponent trends", "Historical rankings", "Advanced team metrics"],
  }),
  "team-duke-basketball": profile({
    league: "NCAA Men’s Basketball", conference: ENTITY_FIELD_UNAVAILABLE, division: "Division I",
    coach: ENTITY_FIELD_UNAVAILABLE, venue: ENTITY_FIELD_UNAVAILABLE, level: "Collegiate",
  }, {
    placeholders: ["Depth chart", "Injuries", "Starting lineup", "Team leaders", "Home/Away splits", "Offensive metrics", "Defensive metrics", "Pace", "Opponent trends", "Historical rankings", "Advanced team metrics"],
  }),
  "golf-sample-golfer": profile({
    tour: "PGA Tour sample scope", worldRanking: ENTITY_FIELD_UNAVAILABLE, nationality: ENTITY_FIELD_UNAVAILABLE,
  }, {
    placeholders: ["Driving distance", "Accuracy", "Greens in regulation", "Putting", "Birdies", "Bogeys", "Cuts made", "Course history"],
  }),
  "tennis-sample-player": profile({
    tour: "ATP sample scope", ranking: ENTITY_FIELD_UNAVAILABLE, preferredHand: ENTITY_FIELD_UNAVAILABLE, nationality: ENTITY_FIELD_UNAVAILABLE,
  }, {
    placeholders: ["Serve percentage", "Ace percentage", "Double faults", "Break percentage", "Hold percentage", "Tiebreak record", "Surface splits"],
  }),
  "coach-sample-lakers": profile({
    currentTeam: "Los Angeles Lakers", role: "Head coach placeholder", careerHistory: ENTITY_FIELD_UNAVAILABLE,
  }, { placeholders: ["Win percentage", "Recent trends", "Championships", "Playoff history", "Style"] }),
  "coach-sample-fever": profile({
    currentTeam: "Indiana Fever", role: "Head coach placeholder", careerHistory: ENTITY_FIELD_UNAVAILABLE,
  }, { placeholders: ["Win percentage", "Recent trends", "Championships", "Playoff history", "Style"] }),
  "manager-dana-white": profile({
    organization: "UFC", role: "Promotion executive", careerHistory: ENTITY_FIELD_UNAVAILABLE,
  }, { placeholders: ["Career history", "Championship history", "Management style"] }),
  "promotion-ufc": profile({ sport: "MMA", region: "Global", leader: "Dana White" }, {
    placeholders: ["Rankings", "Weight classes", "Current champions"],
  }),
  "promotion-pfl": profile({ sport: "MMA", region: "Global", leader: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Rankings", "Weight classes", "Current champions"] }),
  "promotion-one": profile({ sport: "Combat sports", region: "Global", leader: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Rankings", "Weight classes", "Current champions"] }),
  "promotion-bkfc": profile({ sport: "Bare-knuckle boxing", region: "Global", leader: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Rankings", "Weight classes", "Current champions"] }),
  "promotion-glory": profile({ sport: "Kickboxing", region: "Global", leader: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Rankings", "Weight classes", "Current champions"] }),
  "promotion-sample-boxing": profile({ sport: "Professional boxing", region: "Sample scope", leader: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Rankings", "Weight classes", "Current champions"] }),
  "constructor-ferrari": profile({ series: "Formula 1", manufacturer: "Ferrari Manufacturer", base: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Pit-stop performance", "Reliability", "Track strengths"] }),
  "constructor-mercedes": profile({ series: "Formula 1", manufacturer: "Mercedes", base: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Pit-stop performance", "Reliability", "Track strengths"] }),
  RBR: profile({ series: "Formula 1", manufacturer: "Red Bull Powertrains", base: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Pit-stop performance", "Reliability", "Track strengths"] }),
  MCL: profile({ series: "Formula 1", manufacturer: "Mercedes", base: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Pit-stop performance", "Reliability", "Track strengths"] }),
  "manufacturer-ferrari": profile({ sport: "Motorsports", series: "Formula 1", base: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Competition wins", "Podiums", "Reliability"] }),
  "national-team-usa-basketball": profile({ league: "Olympic Basketball", coach: ENTITY_FIELD_UNAVAILABLE, venue: "Event-based", nationality: "United States" }),
  "competition-world-cup": profile({ sport: "Soccer", league: "FIFA World Cup", stage: ENTITY_FIELD_UNAVAILABLE, season: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Bracket", "Participants", "Results", "Leaders"] }),
  "competition-champions-league": profile({ sport: "Soccer", league: "UEFA Champions League", stage: ENTITY_FIELD_UNAVAILABLE, season: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Bracket", "Participants", "Results", "Leaders"] }),
  "competition-march-madness": profile({ sport: "Basketball", league: "NCAA Men’s Basketball", stage: ENTITY_FIELD_UNAVAILABLE, season: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Bracket", "Participants", "Results", "Leaders"] }),
  "competition-nba-playoffs": profile({ sport: "Basketball", league: "NBA", stage: "Playoffs", season: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Bracket", "Participants", "Results", "Leaders"] }),
  "competition-olympics": profile({ sport: "Olympic sports", league: "Olympic Games", stage: ENTITY_FIELD_UNAVAILABLE, season: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Bracket", "Participants", "Results", "Leaders"] }),
  "competition-wimbledon": profile({ sport: "Tennis", league: "ATP and WTA", stage: ENTITY_FIELD_UNAVAILABLE, season: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Draw", "Participants", "Results", "Leaders"] }),
  "venue-madison-square-garden": profile({ venueType: "Arena", location: "New York, New York", surface: ENTITY_FIELD_UNAVAILABLE, capacity: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Weather", "Historical trends", "Venue-specific insights"] }),
  "venue-crypto-arena": profile({ venueType: "Arena", location: "Los Angeles, California", surface: ENTITY_FIELD_UNAVAILABLE, capacity: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Weather", "Historical trends", "Venue-specific insights"] }),
  "venue-yankee-stadium": profile({ venueType: "Stadium", location: "Bronx, New York", surface: ENTITY_FIELD_UNAVAILABLE, capacity: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Weather", "Historical trends", "Venue-specific insights"] }),
  "venue-silverstone": profile({ venueType: "Circuit", location: "Silverstone, England", surface: "Asphalt", capacity: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Weather", "Historical trends", "Venue-specific insights"] }),
  "venue-augusta": profile({ venueType: "Course", location: ENTITY_FIELD_UNAVAILABLE, surface: ENTITY_FIELD_UNAVAILABLE, capacity: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Weather", "Historical trends", "Venue-specific insights"] }),
  "venue-wimbledon": profile({ venueType: "Tennis venue", location: "London, England", surface: "Grass", capacity: ENTITY_FIELD_UNAVAILABLE }, { placeholders: ["Weather", "Historical trends", "Venue-specific insights"] }),
});
