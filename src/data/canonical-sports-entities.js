import { ENTITY_TYPES } from "../config/entity-types.js";
import { SPORTS_REGISTRY } from "../config/sports-registry.js";
import { CANONICAL_ENTITIES } from "./canonical-entities.js";

const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);

function placeholderMedia(name, type) {
  return Object.freeze({
    illustrationUrl: "",
    headshotUrl: "",
    silhouetteUrl: "assets/athlete-silhouette.svg",
    fallbackInitials: String(name || "Entity").split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase(),
    altText: `${name} sample ${type} placeholder`,
    attribution: "Original EdgeBoard abstract placeholder",
    rightsStatus: "original-placeholder",
    approvedForCommercialUse: true,
    source: "EdgeBoard sample assets",
    updatedAt: "2026-07-30T12:30:00.000Z",
  });
}

function inferType(entity) {
  if (entity.entityType === "team") return entity.sportId === "motorsport"
    ? ENTITY_TYPES.CONSTRUCTOR : ENTITY_TYPES.TEAM;
  if (entity.sportId === "mma" || entity.sportId === "combat" || entity.sportId === "kickboxing") return ENTITY_TYPES.FIGHTER;
  if (entity.sportId === "boxing") return ENTITY_TYPES.BOXER;
  if (entity.sportId === "motorsport") return ENTITY_TYPES.DRIVER;
  if (entity.sportId === "golf") return ENTITY_TYPES.GOLFER;
  if (entity.sportId === "tennis") return ENTITY_TYPES.TENNIS_PLAYER;
  return ENTITY_TYPES.ATHLETE;
}

const RELATED = Object.freeze({
  "ufc-sample-fighter-a": ["promotion-ufc", "ufc-sample-fighter-b", "league-ufc"],
  "ufc-sample-fighter-b": ["promotion-ufc", "ufc-sample-fighter-a", "league-ufc"],
  "boxing-sample-boxer-a": ["promotion-sample-boxing", "league-boxing"],
  "f1-max-verstappen": ["RBR", "manufacturer-red-bull-powertrains", "league-f1", "venue-silverstone"],
  "f1-lando-norris": ["MCL", "manufacturer-mercedes", "league-f1", "venue-silverstone"],
  "nascar-sample-driver": ["manufacturer-chevrolet", "league-nascar-cup"],
  RBR: ["f1-max-verstappen", "manufacturer-red-bull-powertrains", "league-f1"],
  MCL: ["f1-lando-norris", "manufacturer-mercedes", "league-f1"],
  LAL: ["coach-sample-lakers", "venue-crypto-arena", "league-nba"],
  "NBA-NYK": ["venue-madison-square-garden", "league-nba"],
  "NHL-NYR": ["venue-madison-square-garden", "league-nhl"],
  "IND-W": ["wnba-caitlin-clark", "coach-sample-fever", "league-wnba"],
  NYY: ["mlb-aaron-judge", "mlb-gerrit-cole", "venue-yankee-stadium", "league-mlb"],
  MIA: ["mls-lionel-messi", "league-mls"],
});

function normalizeExistingEntity(entity) {
  const type = inferType(entity);
  const related = [
    ...(RELATED[entity.id] || []),
    entity.leagueId ? `league-${entity.leagueId}` : "",
    entity.teamId && entity.teamId !== entity.id ? entity.teamId : "",
  ].filter(Boolean);
  return Object.freeze({
    ...entity,
    type,
    sport: entity.sportId,
    league: entity.leagueId,
    displayName: entity.name,
    activeStatus: entity.active ? "active" : "inactive",
    relatedEntityIds: Object.freeze([...new Set(related)]),
    metadata: Object.freeze({
      role: entity.profile?.role || entity.position || "",
      organization: entity.profile?.organization || entity.profile?.teamName || "",
      sample: true,
    }),
    statistics: EMPTY_OBJECT,
    historicalData: EMPTY_OBJECT,
    insights: EMPTY_ARRAY,
    links: Object.freeze({ canonicalProfile: true }),
  });
}

function entity({
  id,
  type,
  name,
  aliases = [],
  sportId = "",
  leagueId = "",
  active = true,
  relatedEntityIds = [],
  metadata = {},
}) {
  return Object.freeze({
    id,
    type,
    entityType: ["team", "national-team", "constructor"].includes(type) ? "team"
      : ["athlete", "fighter", "boxer", "driver", "golfer", "tennis-player"].includes(type) ? "competitor" : type,
    sportId,
    sport: sportId,
    leagueId,
    league: leagueId,
    name,
    displayName: name,
    aliases: Object.freeze(aliases),
    providerIds: Object.freeze({ edgeboardMock: id }),
    active,
    activeStatus: active ? "active" : "inactive",
    media: placeholderMedia(name, type),
    relatedEntityIds: Object.freeze(relatedEntityIds),
    metadata: Object.freeze({ ...metadata, sample: true }),
    statistics: EMPTY_OBJECT,
    historicalData: EMPTY_OBJECT,
    insights: EMPTY_ARRAY,
    links: Object.freeze({ canonicalProfile: true }),
  });
}

export const ADDITIONAL_CANONICAL_ENTITIES = Object.freeze([
  entity({ id: "golf-sample-golfer", type: ENTITY_TYPES.GOLFER, name: "Sample Tour Golfer", aliases: ["sample golfer"], sportId: "golf", leagueId: "pga", relatedEntityIds: ["league-pga", "venue-augusta"] }),
  entity({ id: "tennis-sample-player", type: ENTITY_TYPES.TENNIS_PLAYER, name: "Sample Tennis Player", aliases: ["sample tennis"], sportId: "tennis", leagueId: "atp", relatedEntityIds: ["league-atp", "competition-wimbledon", "venue-wimbledon"] }),
  entity({ id: "coach-sample-lakers", type: ENTITY_TYPES.COACH, name: "Sample Lakers Coach", aliases: ["lakers coach"], sportId: "basketball", leagueId: "nba", relatedEntityIds: ["LAL", "league-nba"] }),
  entity({ id: "coach-sample-fever", type: ENTITY_TYPES.COACH, name: "Sample Fever Coach", aliases: ["fever coach"], sportId: "basketball", leagueId: "wnba", relatedEntityIds: ["IND-W", "league-wnba"] }),
  entity({ id: "manager-dana-white", type: ENTITY_TYPES.MANAGER, name: "Dana White", aliases: ["dana"], sportId: "mma", leagueId: "ufc", relatedEntityIds: ["promotion-ufc", "league-ufc"], metadata: { role: "Promotion executive" } }),
  entity({ id: "promotion-ufc", type: ENTITY_TYPES.PROMOTION, name: "UFC", aliases: ["ultimate fighting championship"], sportId: "mma", leagueId: "ufc", relatedEntityIds: ["league-ufc", "manager-dana-white", "ufc-sample-fighter-a", "ufc-sample-fighter-b"] }),
  entity({ id: "promotion-pfl", type: ENTITY_TYPES.PROMOTION, name: "PFL", aliases: ["professional fighters league"], sportId: "mma", leagueId: "pfl", relatedEntityIds: ["league-pfl"] }),
  entity({ id: "promotion-one", type: ENTITY_TYPES.PROMOTION, name: "ONE Championship", aliases: ["one"], sportId: "mma", leagueId: "one", relatedEntityIds: ["league-one"] }),
  entity({ id: "promotion-bkfc", type: ENTITY_TYPES.PROMOTION, name: "BKFC", aliases: ["bare knuckle fighting championship"], sportId: "combat", leagueId: "bkfc", relatedEntityIds: ["league-bkfc"] }),
  entity({ id: "promotion-glory", type: ENTITY_TYPES.PROMOTION, name: "Glory Kickboxing", aliases: ["glory"], sportId: "kickboxing", leagueId: "glory", relatedEntityIds: ["league-glory"] }),
  entity({ id: "promotion-sample-boxing", type: ENTITY_TYPES.PROMOTION, name: "Sample Boxing Promotion", aliases: ["sample boxing"], sportId: "boxing", leagueId: "boxing", relatedEntityIds: ["league-boxing", "boxing-sample-boxer-a"] }),
  entity({ id: "constructor-ferrari", type: ENTITY_TYPES.CONSTRUCTOR, name: "Ferrari", aliases: ["scuderia ferrari"], sportId: "motorsport", leagueId: "f1", relatedEntityIds: ["manufacturer-ferrari", "league-f1"] }),
  entity({ id: "constructor-mercedes", type: ENTITY_TYPES.CONSTRUCTOR, name: "Mercedes Formula 1 Team", aliases: ["mercedes f1"], sportId: "motorsport", leagueId: "f1", relatedEntityIds: ["manufacturer-mercedes", "league-f1"] }),
  entity({ id: "manufacturer-ferrari", type: ENTITY_TYPES.MANUFACTURER, name: "Ferrari Manufacturer", aliases: ["ferrari cars"], sportId: "motorsport", leagueId: "f1", relatedEntityIds: ["constructor-ferrari"] }),
  entity({ id: "manufacturer-mercedes", type: ENTITY_TYPES.MANUFACTURER, name: "Mercedes", aliases: ["mercedes-benz"], sportId: "motorsport", relatedEntityIds: ["constructor-mercedes", "MCL"] }),
  entity({ id: "manufacturer-red-bull-powertrains", type: ENTITY_TYPES.MANUFACTURER, name: "Red Bull Powertrains", aliases: ["rbpt"], sportId: "motorsport", leagueId: "f1", relatedEntityIds: ["RBR"] }),
  entity({ id: "manufacturer-chevrolet", type: ENTITY_TYPES.MANUFACTURER, name: "Chevrolet", aliases: ["chevy"], sportId: "motorsport", leagueId: "nascar-cup", relatedEntityIds: ["nascar-sample-driver"] }),
  entity({ id: "national-team-usa-basketball", type: ENTITY_TYPES.NATIONAL_TEAM, name: "United States Basketball", aliases: ["team usa basketball", "usa basketball"], sportId: "basketball", leagueId: "olympic-basketball", relatedEntityIds: ["league-olympic-basketball", "competition-olympics"] }),
  entity({ id: "organization-fifa", type: ENTITY_TYPES.ORGANIZATION, name: "FIFA", aliases: ["fédération internationale de football association"], sportId: "soccer", relatedEntityIds: ["competition-world-cup", "league-world-cup"] }),
  entity({ id: "competition-world-cup", type: ENTITY_TYPES.COMPETITION, name: "FIFA World Cup", aliases: ["world cup"], sportId: "soccer", leagueId: "world-cup", relatedEntityIds: ["organization-fifa", "league-world-cup"] }),
  entity({ id: "competition-champions-league", type: ENTITY_TYPES.COMPETITION, name: "UEFA Champions League", aliases: ["champions league", "ucl competition"], sportId: "soccer", leagueId: "ucl", relatedEntityIds: ["league-ucl"] }),
  entity({ id: "competition-march-madness", type: ENTITY_TYPES.COMPETITION, name: "March Madness", aliases: ["ncaa tournament"], sportId: "basketball", leagueId: "ncaamb", relatedEntityIds: ["league-ncaamb"] }),
  entity({ id: "competition-nba-playoffs", type: ENTITY_TYPES.COMPETITION, name: "NBA Playoffs", aliases: ["nba postseason"], sportId: "basketball", leagueId: "nba", relatedEntityIds: ["league-nba"] }),
  entity({ id: "competition-olympics", type: ENTITY_TYPES.COMPETITION, name: "Olympic Games", aliases: ["olympics"], sportId: "olympic-sports", leagueId: "olympic-sports", relatedEntityIds: ["league-olympic-sports", "national-team-usa-basketball"] }),
  entity({ id: "competition-wimbledon", type: ENTITY_TYPES.COMPETITION, name: "Wimbledon", aliases: ["the championships"], sportId: "tennis", leagueId: "atp", relatedEntityIds: ["league-atp", "league-wta", "venue-wimbledon"] }),
  entity({ id: "venue-madison-square-garden", type: ENTITY_TYPES.VENUE, name: "Madison Square Garden", aliases: ["msg", "the garden"], sportId: "multi-sport", relatedEntityIds: ["NBA-NYK", "NHL-NYR"], metadata: { location: "New York, New York", venueType: "Arena", sharedVenue: true } }),
  entity({ id: "venue-crypto-arena", type: ENTITY_TYPES.VENUE, name: "Los Angeles Sample Arena", aliases: ["lakers arena"], sportId: "basketball", leagueId: "nba", relatedEntityIds: ["LAL"], metadata: { location: "Los Angeles, California", venueType: "Arena" } }),
  entity({ id: "venue-yankee-stadium", type: ENTITY_TYPES.VENUE, name: "Yankee Stadium", aliases: ["yankee stadium"], sportId: "baseball", leagueId: "mlb", relatedEntityIds: ["NYY"], metadata: { location: "Bronx, New York", venueType: "Stadium" } }),
  entity({ id: "venue-silverstone", type: ENTITY_TYPES.VENUE, name: "Silverstone Circuit", aliases: ["silverstone"], sportId: "motorsport", leagueId: "f1", relatedEntityIds: ["league-f1"], metadata: { location: "Silverstone, England", venueType: "Circuit", surface: "Asphalt" } }),
  entity({ id: "venue-augusta", type: ENTITY_TYPES.VENUE, name: "Augusta National Sample Course", aliases: ["augusta"], sportId: "golf", leagueId: "pga", relatedEntityIds: ["league-pga", "golf-sample-golfer"], metadata: { venueType: "Course" } }),
  entity({ id: "venue-wimbledon", type: ENTITY_TYPES.VENUE, name: "All England Club", aliases: ["wimbledon venue"], sportId: "tennis", relatedEntityIds: ["competition-wimbledon"], metadata: { location: "London, England", venueType: "Tennis venue", surface: "Grass" } }),
  entity({ id: "team-duke-basketball", type: ENTITY_TYPES.TEAM, name: "Duke Blue Devils", aliases: ["duke basketball", "blue devils"], sportId: "basketball", leagueId: "ncaamb", relatedEntityIds: ["league-ncaamb", "competition-march-madness"], metadata: { level: "Collegiate" } }),
]);
const LEAGUE_ENTITIES = SPORTS_REGISTRY.map((league) => entity({
  id: `league-${league.leagueId}`,
  type: ENTITY_TYPES.LEAGUE,
  name: league.leagueDisplayName,
  aliases: [league.leagueId, ...(league.queryTerms || [])],
  sportId: league.sportId,
  leagueId: league.leagueId,
  active: league.enabled,
  relatedEntityIds: [
    ...CANONICAL_ENTITIES.filter((item) => item.leagueId === league.leagueId && item.entityType === "team").map((item) => item.id),
    ...ADDITIONAL_CANONICAL_ENTITIES.filter((item) => item.leagueId === league.leagueId).slice(0, 12).map((item) => item.id),
  ],
  metadata: {
    category: league.category,
    priorityTier: league.priorityTier,
    scheduleType: league.scheduleType,
    region: league.region,
  },
}));

export const UNIFIED_CANONICAL_ENTITIES = Object.freeze([
  ...CANONICAL_ENTITIES.map(normalizeExistingEntity),
  ...ADDITIONAL_CANONICAL_ENTITIES,
  ...LEAGUE_ENTITIES,
]);
