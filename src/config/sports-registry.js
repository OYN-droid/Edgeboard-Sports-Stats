export const AVAILABILITY_STATES = Object.freeze([
  "live", "active", "upcoming", "offseason", "futures-only", "unavailable", "stale", "error",
]);

export const MARKET_TYPES = Object.freeze({
  MONEYLINE: "moneyline",
  SPREAD: "spread",
  TOTAL: "total",
  PLAYER_PROP: "player-prop",
  TEAM_PROP: "team-prop",
  FIGHT_PROP: "fight-prop",
  RACE_PROP: "race-prop",
  FUTURES: "futures",
  METHOD_OF_VICTORY: "method-of-victory",
  ROUND: "round",
  QUALIFYING: "qualifying",
  PODIUM: "podium",
  WINNER: "winner",
});

export const MARKET_FILTERS = Object.freeze([
  { id: "moneylines", displayName: "Moneyline", marketTypes: [MARKET_TYPES.MONEYLINE, MARKET_TYPES.WINNER] },
  { id: "props", displayName: "Props", marketTypes: [MARKET_TYPES.PLAYER_PROP, MARKET_TYPES.TEAM_PROP, MARKET_TYPES.FIGHT_PROP, MARKET_TYPES.RACE_PROP] },
  { id: "spreads", displayName: "Spreads", marketTypes: [MARKET_TYPES.SPREAD] },
  { id: "totals", displayName: "Totals", marketTypes: [MARKET_TYPES.TOTAL, MARKET_TYPES.ROUND] },
]);

const TEAM_MARKETS = [MARKET_TYPES.MONEYLINE, MARKET_TYPES.SPREAD, MARKET_TYPES.TOTAL, MARKET_TYPES.PLAYER_PROP, MARKET_TYPES.TEAM_PROP, MARKET_TYPES.FUTURES];
const COMBAT_MARKETS = [MARKET_TYPES.MONEYLINE, MARKET_TYPES.FIGHT_PROP, MARKET_TYPES.METHOD_OF_VICTORY, MARKET_TYPES.ROUND, MARKET_TYPES.FUTURES];
const RACE_MARKETS = [MARKET_TYPES.RACE_PROP, MARKET_TYPES.QUALIFYING, MARKET_TYPES.PODIUM, MARKET_TYPES.WINNER, MARKET_TYPES.FUTURES];
const INDIVIDUAL_MARKETS = [MARKET_TYPES.MONEYLINE, MARKET_TYPES.PLAYER_PROP, MARKET_TYPES.WINNER, MARKET_TYPES.FUTURES];

function league(sportId, sportDisplayName, leagueId, leagueDisplayName, category, priorityTier, options = {}) {
  return Object.freeze({
    sportId,
    sportDisplayName,
    leagueId,
    leagueDisplayName,
    category,
    priorityTier,
    scheduleType: options.scheduleType || "seasonal",
    availabilityStatus: "unavailable",
    liveEventCount: 0,
    todayEventCount: 0,
    upcomingEventCount: 0,
    availableMarketCount: 0,
    playerPropCount: 0,
    lastUpdatedAt: null,
    dataQualityStatus: "unknown",
    enabled: options.enabled !== false,
    supportedMarketTypes: options.supportedMarketTypes || TEAM_MARKETS,
    queryTerms: options.queryTerms || [leagueDisplayName.toLowerCase()],
    parlayPrompt: options.parlayPrompt || null,
    region: options.region || "Global",
    soccerGroup: options.soccerGroup || null,
  });
}

export const SPORTS_REGISTRY = Object.freeze([
  league("american-football", "Football", "nfl", "NFL", "team-sport", 1, { region: "United States", queryTerms: ["nfl", "football", "touchdown", "td", "rush", "passing", "receiving"], parlayPrompt: { label: "4-leg TD parlay", query: "Best 4 leg TD parlay" } }),
  league("basketball", "Basketball", "nba", "NBA", "team-sport", 1, { region: "United States", queryTerms: ["nba", "basketball", "guard", "guards", "points", "rebounds", "assists"], parlayPrompt: { label: "4-leg points parlay", query: "Best 4 leg parlay for points" } }),
  league("ice-hockey", "Hockey", "nhl", "NHL", "team-sport", 1, { region: "United States", queryTerms: ["nhl", "hockey", "goals", "goal scorer", "shots", "goalie"], parlayPrompt: { label: "4 goal scorers parlay", query: "Best 4 goal scorers parlay" } }),
  league("baseball", "Baseball", "mlb", "MLB", "team-sport", 1, { region: "United States", queryTerms: ["mlb", "baseball", "bases", "hits", "pitcher", "homer", "home run"], parlayPrompt: { label: "4-leg homerun parlay", query: "Best 4 leg homerun parlay" } }),
  league("basketball", "Basketball", "wnba", "WNBA", "team-sport", 1, { region: "United States", queryTerms: ["wnba", "women's basketball"] }),
  league("american-football", "Football", "ncaaf", "NCAA Football", "team-sport", 1, { region: "United States", queryTerms: ["college football", "ncaa football", "ncaaf"] }),
  league("basketball", "Basketball", "ncaamb", "NCAA Men’s Basketball", "team-sport", 1, { region: "United States", queryTerms: ["college basketball", "ncaa men's basketball", "ncaamb"] }),
  league("basketball", "Basketball", "ncaawb", "NCAA Women’s Basketball", "team-sport", 1, { region: "United States", queryTerms: ["ncaa women's basketball", "ncaawb"] }),

  league("mma", "MMA", "ufc", "UFC", "combat-sport", 1, { scheduleType: "event-based", supportedMarketTypes: COMBAT_MARKETS, queryTerms: ["ufc", "mma", "fight", "fighter"] }),
  league("boxing", "Boxing", "boxing", "Boxing", "combat-sport", 1, { scheduleType: "event-based", supportedMarketTypes: COMBAT_MARKETS, queryTerms: ["boxing", "boxer", "fight"] }),

  league("soccer", "Soccer", "epl", "Premier League", "team-sport", 1, { region: "Europe", soccerGroup: "Europe", queryTerms: ["premier league", "epl"] }),
  league("soccer", "Soccer", "ucl", "UEFA Champions League", "tournament", 1, { region: "Europe", soccerGroup: "Europe", scheduleType: "event-based", queryTerms: ["champions league", "ucl"] }),
  league("soccer", "Soccer", "la-liga", "La Liga", "team-sport", 1, { region: "Europe", soccerGroup: "Europe" }),
  league("soccer", "Soccer", "bundesliga", "Bundesliga", "team-sport", 1, { region: "Europe", soccerGroup: "Europe" }),
  league("soccer", "Soccer", "serie-a", "Serie A", "team-sport", 1, { region: "Europe", soccerGroup: "Europe" }),
  league("soccer", "Soccer", "ligue-1", "Ligue 1", "team-sport", 1, { region: "Europe", soccerGroup: "Europe" }),
  league("soccer", "Soccer", "mls", "MLS", "team-sport", 1, { region: "United States", soccerGroup: "United States" }),
  league("soccer", "Soccer", "nwsl", "NWSL", "team-sport", 1, { region: "United States", soccerGroup: "United States" }),
  league("soccer", "Soccer", "liga-mx", "Liga MX", "team-sport", 1, { region: "Mexico", soccerGroup: "Mexico" }),
  league("soccer", "Soccer", "world-cup", "FIFA World Cup", "tournament", 1, { region: "International", soccerGroup: "International", scheduleType: "event-based" }),
  league("soccer", "Soccer", "euros", "UEFA European Championship", "tournament", 1, { region: "International", soccerGroup: "International", scheduleType: "event-based" }),
  league("soccer", "Soccer", "copa-america", "Copa América", "tournament", 1, { region: "International", soccerGroup: "International", scheduleType: "event-based" }),
  league("soccer", "Soccer", "gold-cup", "CONCACAF Gold Cup", "tournament", 1, { region: "International", soccerGroup: "International", scheduleType: "event-based" }),
  league("soccer", "Soccer", "nations-league", "UEFA Nations League", "tournament", 1, { region: "International", soccerGroup: "International", scheduleType: "event-based" }),
  league("soccer", "Soccer", "womens-international", "Women’s International Soccer", "tournament", 1, { region: "International", soccerGroup: "International", scheduleType: "event-based" }),

  league("mma", "MMA", "pfl", "PFL", "combat-sport", 2, { scheduleType: "event-based", supportedMarketTypes: COMBAT_MARKETS }),
  league("mma", "MMA", "one", "ONE Championship", "combat-sport", 2, { scheduleType: "event-based", supportedMarketTypes: COMBAT_MARKETS }),
  league("combat", "Combat Sports", "bkfc", "BKFC", "combat-sport", 2, { scheduleType: "event-based", supportedMarketTypes: COMBAT_MARKETS }),
  league("kickboxing", "Kickboxing", "glory", "Glory Kickboxing", "combat-sport", 2, { scheduleType: "event-based", supportedMarketTypes: COMBAT_MARKETS }),

  league("motorsport", "Motorsports", "f1", "Formula 1", "motorsport", 2, { scheduleType: "event-based", supportedMarketTypes: RACE_MARKETS }),
  league("motorsport", "Motorsports", "nascar-cup", "NASCAR Cup Series", "motorsport", 2, { scheduleType: "event-based", supportedMarketTypes: RACE_MARKETS }),
  league("motorsport", "Motorsports", "nascar-xfinity", "NASCAR Xfinity Series", "motorsport", 2, { scheduleType: "event-based", supportedMarketTypes: RACE_MARKETS }),
  league("motorsport", "Motorsports", "nascar-trucks", "NASCAR Craftsman Truck Series", "motorsport", 2, { scheduleType: "event-based", supportedMarketTypes: RACE_MARKETS }),
  league("motorsport", "Motorsports", "indycar", "IndyCar", "motorsport", 2, { scheduleType: "event-based", supportedMarketTypes: RACE_MARKETS }),
  league("motorsport", "Motorsports", "motogp", "MotoGP", "motorsport", 2, { scheduleType: "event-based", supportedMarketTypes: RACE_MARKETS }),
  league("motorsport", "Motorsports", "supercross", "Supercross", "motorsport", 2, { scheduleType: "event-based", supportedMarketTypes: RACE_MARKETS }),
  league("motorsport", "Motorsports", "motocross", "Motocross", "motorsport", 2, { scheduleType: "event-based", supportedMarketTypes: RACE_MARKETS }),
  league("motorsport", "Motorsports", "wrc", "World Rally Championship", "motorsport", 2, { scheduleType: "event-based", supportedMarketTypes: RACE_MARKETS }),

  league("basketball", "Basketball", "euroleague", "EuroLeague", "team-sport", 2),
  league("basketball", "Basketball", "fiba", "FIBA Competitions", "tournament", 2, { scheduleType: "event-based" }),
  league("basketball", "Basketball", "olympic-basketball", "Olympic Basketball", "tournament", 2, { scheduleType: "event-based" }),
  league("basketball", "Basketball", "bcl", "Basketball Champions League", "team-sport", 2),
  league("ice-hockey", "Hockey", "iihf", "IIHF Competitions", "tournament", 2, { scheduleType: "event-based" }),
  league("ice-hockey", "Hockey", "shl", "SHL", "team-sport", 2),
  league("ice-hockey", "Hockey", "liiga", "Liiga", "team-sport", 2),
  league("ice-hockey", "Hockey", "swiss-nl", "Swiss National League", "team-sport", 2),
  league("tennis", "Tennis", "atp", "ATP", "individual-sport", 2, { scheduleType: "event-based", supportedMarketTypes: INDIVIDUAL_MARKETS }),
  league("tennis", "Tennis", "wta", "WTA", "individual-sport", 2, { scheduleType: "event-based", supportedMarketTypes: INDIVIDUAL_MARKETS }),
  league("golf", "Golf", "pga", "PGA Tour", "individual-sport", 2, { scheduleType: "event-based", supportedMarketTypes: INDIVIDUAL_MARKETS }),
  league("golf", "Golf", "lpga", "LPGA", "individual-sport", 2, { scheduleType: "event-based", supportedMarketTypes: INDIVIDUAL_MARKETS }),
  league("american-football", "Football", "cfl", "CFL", "team-sport", 2),
  league("baseball", "Baseball", "kbo", "KBO", "team-sport", 2),
  league("baseball", "Baseball", "npb", "NPB", "team-sport", 2),

  ...[
    ["rugby", "Rugby"], ["cricket", "Cricket"], ["lacrosse", "Lacrosse"], ["volleyball", "Volleyball"],
    ["handball", "Handball"], ["table-tennis", "Table Tennis"], ["darts", "Darts"], ["snooker", "Snooker"],
    ["sailing", "Sailing"], ["horse-racing", "Horse Racing"], ["esports", "Esports"],
    ["olympic-sports", "Olympic Sports"], ["emerging", "Emerging Markets"],
  ].map(([id, name]) => league(id, name, id, name, "specialty", 3, { scheduleType: "event-based", supportedMarketTypes: INDIVIDUAL_MARKETS })),
]);

export function isAvailabilityState(value) {
  return AVAILABILITY_STATES.includes(value);
}
