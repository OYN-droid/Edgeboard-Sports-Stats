export const ENTITY_TYPES = Object.freeze({
  ATHLETE: "athlete",
  TEAM: "team",
  FIGHTER: "fighter",
  BOXER: "boxer",
  DRIVER: "driver",
  GOLFER: "golfer",
  TENNIS_PLAYER: "tennis-player",
  COACH: "coach",
  MANAGER: "manager",
  PROMOTION: "promotion",
  CONSTRUCTOR: "constructor",
  MANUFACTURER: "manufacturer",
  NATIONAL_TEAM: "national-team",
  LEAGUE: "league",
  COMPETITION: "competition",
  VENUE: "venue",
  ORGANIZATION: "organization",
});

export const ENTITY_TYPE_DEFINITIONS = Object.freeze({
  athlete: Object.freeze({ label: "Athlete", parent: "competitor", profileSystem: "athlete" }),
  team: Object.freeze({ label: "Team", parent: "organization", profileSystem: "entity" }),
  fighter: Object.freeze({ label: "Fighter", parent: "athlete", profileSystem: "athlete" }),
  boxer: Object.freeze({ label: "Boxer", parent: "fighter", profileSystem: "athlete" }),
  driver: Object.freeze({ label: "Driver", parent: "athlete", profileSystem: "athlete" }),
  golfer: Object.freeze({ label: "Golfer", parent: "athlete", profileSystem: "entity" }),
  "tennis-player": Object.freeze({ label: "Tennis player", parent: "athlete", profileSystem: "entity" }),
  coach: Object.freeze({ label: "Coach", parent: "person", profileSystem: "entity" }),
  manager: Object.freeze({ label: "Manager", parent: "person", profileSystem: "entity" }),
  promotion: Object.freeze({ label: "Promotion", parent: "organization", profileSystem: "entity" }),
  constructor: Object.freeze({ label: "Constructor", parent: "organization", profileSystem: "entity" }),
  manufacturer: Object.freeze({ label: "Manufacturer", parent: "organization", profileSystem: "entity" }),
  "national-team": Object.freeze({ label: "National team", parent: "team", profileSystem: "entity" }),
  league: Object.freeze({ label: "League", parent: "competition-organization", profileSystem: "entity" }),
  competition: Object.freeze({ label: "Competition", parent: "event-series", profileSystem: "entity" }),
  venue: Object.freeze({ label: "Venue", parent: "place", profileSystem: "entity" }),
  organization: Object.freeze({ label: "Organization", parent: "organization", profileSystem: "entity" }),
});

export function getEntityTypeDefinition(type) {
  return ENTITY_TYPE_DEFINITIONS[type] || Object.freeze({
    label: String(type || "Entity").replaceAll("-", " "),
    parent: "entity",
    profileSystem: "entity",
  });
}
export function isAthleteProfileType(type) {
  return getEntityTypeDefinition(type).profileSystem === "athlete";
}
