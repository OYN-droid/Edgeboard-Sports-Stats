export const NAVIGATION_RANK_WEIGHTS = Object.freeze({
  liveEvent: 140,
  todayEvent: 28,
  upcomingEvent: 7,
  availableMarket: 1.1,
  playerProp: 0.55,
  tierOne: 65,
  tierTwo: 20,
  eventBased: 24,
  featuredEvent: 1,
  freshData: 25,
  staleData: -90,
  unavailable: -500,
  error: -700,
});

const ACCEPTABLE_DATA_QUALITY = new Set(["good", "sample", "limited"]);
const USEFUL_STATES = new Set(["live", "active", "upcoming", "futures-only"]);

export function scoreLeagueForNavigation(league, weights = NAVIGATION_RANK_WEIGHTS) {
  if (!league?.enabled) return Number.NEGATIVE_INFINITY;
  let score = 0;
  score += league.liveEventCount * weights.liveEvent;
  score += league.todayEventCount * weights.todayEvent;
  score += Math.min(league.upcomingEventCount, 20) * weights.upcomingEvent;
  score += Math.min(league.availableMarketCount, 150) * weights.availableMarket;
  score += Math.min(league.playerPropCount, 80) * weights.playerProp;
  score += league.priorityTier === 1 ? weights.tierOne : league.priorityTier === 2 ? weights.tierTwo : 0;
  score += league.scheduleType === "event-based" ? weights.eventBased : 0;
  score += Math.min(league.featuredEventWeight, 100) * weights.featuredEvent;
  score += league.lastUpdatedAt && league.availabilityStatus !== "stale" ? weights.freshData : 0;
  if (league.availabilityStatus === "stale") score += weights.staleData;
  if (league.availabilityStatus === "unavailable") score += weights.unavailable;
  if (league.availabilityStatus === "error") score += weights.error;
  return Math.round(score * 10) / 10;
}

export function hasUsefulBettingAvailability(league) {
  return Boolean(
    league?.enabled
    && ACCEPTABLE_DATA_QUALITY.has(league.dataQualityStatus)
    && USEFUL_STATES.has(league.availabilityStatus)
    && (league.liveEventCount || league.todayEventCount || league.upcomingEventCount || league.availableMarketCount),
  );
}

export function getLeagueStatusMetadata(league) {
  if (!league) return { label: "Data unavailable", detail: "Unavailable", tone: "unavailable" };
  if (league.availabilityStatus === "error") return { label: "Data error", detail: "Unavailable", tone: "error" };
  if (league.availabilityStatus === "unavailable") return { label: "Data unavailable", detail: "No current markets", tone: "unavailable" };
  if (league.availabilityStatus === "stale") return { label: "Stale data", detail: `${league.availableMarketCount} markets`, tone: "stale" };
  if (league.liveEventCount > 0) return { label: "Live", detail: `${league.availableMarketCount} markets`, tone: "live" };
  if (league.todayEventCount > 0) return { label: `${league.todayEventCount} event${league.todayEventCount === 1 ? "" : "s"} today`, detail: `${league.availableMarketCount} markets`, tone: "today" };
  if (league.statusLabel) return { label: league.statusLabel, detail: `${league.availableMarketCount} markets`, tone: league.availabilityStatus };
  if (league.availabilityStatus === "futures-only") return { label: "Futures available", detail: `${league.availableMarketCount} markets`, tone: "futures" };
  if (league.availabilityStatus === "offseason") return { label: "Offseason", detail: league.availableMarketCount ? "Futures available" : "No current markets", tone: "offseason" };
  return { label: "Upcoming", detail: `${league.availableMarketCount} markets`, tone: "upcoming" };
}

function ranked(leagues) {
  return [...leagues].sort((a, b) =>
    scoreLeagueForNavigation(b) - scoreLeagueForNavigation(a)
    || a.priorityTier - b.priorityTier
    || a.leagueDisplayName.localeCompare(b.leagueDisplayName),
  );
}

export function createNavigationModel(leagues) {
  const enabled = leagues.filter((league) => league.enabled);
  const usefulTierOne = ranked(enabled.filter((league) => league.priorityTier === 1 && hasUsefulBettingAvailability(league)));
  const nonSoccerTierOne = usefulTierOne.filter((league) => league.sportId !== "soccer");
  const soccerLeagues = ranked(enabled.filter((league) => league.sportId === "soccer"));
  const promotedTierTwo = ranked(enabled.filter((league) =>
    league.priorityTier === 2
    && hasUsefulBettingAvailability(league)
    && (league.liveEventCount > 0 || league.featuredEventWeight >= 80 || league.availableMarketCount >= 70 || usefulTierOne.length === 0),
  ));

  return Object.freeze({
    primaryLeagues: [...nonSoccerTierOne.slice(0, 5), ...promotedTierTwo.slice(0, 1)],
    liveLeagues: ranked(enabled.filter((league) => league.liveEventCount > 0 && hasUsefulBettingAvailability(league))),
    todayLeagues: ranked(enabled.filter((league) => league.todayEventCount > 0 && hasUsefulBettingAvailability(league))),
    soccerLeagues,
    allLeagues: ranked(enabled),
    upcomingLeagues: ranked(enabled.filter((league) => league.availabilityStatus === "upcoming")),
    offseasonLeagues: ranked(enabled.filter((league) => league.availabilityStatus === "offseason")),
    futuresLeagues: ranked(enabled.filter((league) => league.availabilityStatus === "futures-only" || (league.availabilityStatus === "offseason" && league.availableMarketCount > 0))),
    unavailableLeagues: enabled.filter((league) => ["unavailable", "error", "stale"].includes(league.availabilityStatus)),
    tierTwoLeagues: ranked(enabled.filter((league) => league.priorityTier === 2)),
    tierThreeLeagues: ranked(enabled.filter((league) => league.priorityTier === 3)),
  });
}
