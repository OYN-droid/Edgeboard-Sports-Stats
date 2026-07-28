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
const SYSTEM_SCOPES = new Set(["all", "for-you", "live", "today"]);
const DESTINATION_LABELS = Object.freeze({
  upcoming: "Upcoming",
  offseason: "Offseason",
  futures: "Futures",
  tier2: "Tier 2 Sports",
  tier3: "Tier 3 Sports",
  unavailable: "Unavailable Leagues",
});

export const NAVIGATION_CATEGORIES = Object.freeze({
  "combat-sports": Object.freeze({
    id: "combat-sports",
    label: "Combat Sports",
    sportIds: Object.freeze(["mma", "boxing", "combat", "kickboxing"]),
  }),
});

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

function leagueSelection(league) {
  return Object.freeze({
    type: "league",
    id: league.leagueId,
    sportId: league.sportId,
    label: league.leagueDisplayName,
  });
}

export function normalizeNavigationSelection(selection, leagues, fallbackLeagueId = "") {
  const enabled = leagues.filter((league) => league.enabled);
  const fallback = enabled.find((league) => league.leagueId === fallbackLeagueId) || enabled[0] || null;
  if (!selection || typeof selection !== "object") return fallback ? leagueSelection(fallback) : Object.freeze({ type: "system", id: "all", label: "All Sports" });

  if (selection.type === "league") {
    const league = enabled.find((item) => item.leagueId === selection.id);
    return league ? leagueSelection(league) : fallback ? leagueSelection(fallback) : Object.freeze({ type: "system", id: "all", label: "All Sports" });
  }
  if (selection.type === "sport") {
    const sportLeagues = enabled.filter((league) => league.sportId === selection.id);
    if (sportLeagues.length) {
      return Object.freeze({
        type: "sport",
        id: selection.id,
        sportId: selection.id,
        label: sportLeagues[0].sportDisplayName,
      });
    }
  }
  if (selection.type === "category" && NAVIGATION_CATEGORIES[selection.id]) {
    return Object.freeze({
      type: "category",
      id: selection.id,
      label: NAVIGATION_CATEGORIES[selection.id].label,
    });
  }
  if (selection.type === "system" && SYSTEM_SCOPES.has(selection.id)) {
    const labels = { all: "All Sports", "for-you": "For You", live: "Live", today: "Today" };
    return Object.freeze({ type: "system", id: selection.id, label: labels[selection.id] });
  }
  if (selection.type === "destination" && DESTINATION_LABELS[selection.id]) {
    return Object.freeze({ type: "destination", id: selection.id, label: DESTINATION_LABELS[selection.id] });
  }
  return fallback ? leagueSelection(fallback) : Object.freeze({ type: "system", id: "all", label: "All Sports" });
}

export function serializeNavigationSelection(selection) {
  return selection?.type && selection?.id ? `${selection.type}:${selection.id}` : "";
}

export function parseNavigationSelection(value) {
  const [type, ...idParts] = String(value || "").split(":");
  const id = idParts.join(":");
  return type && id ? { type, id } : null;
}

function contextForSelection(selection, visibleLeagues) {
  const firstLeague = visibleLeagues[0];
  if (selection.type === "league") {
    return {
      heading: `${selection.label} Markets`,
      supportingText: `Today’s ${selection.label} events and available research markets.`,
    };
  }
  if (selection.type === "sport" || selection.type === "category") {
    return {
      heading: `${selection.label} Markets`,
      supportingText: `Active ${selection.label.toLowerCase()} leagues and today’s available markets.`,
    };
  }
  if (selection.type === "destination") {
    return {
      heading: `${selection.label} Markets`,
      supportingText: `Market discovery filtered to ${selection.label.toLowerCase()}.`,
    };
  }
  if (selection.id === "live") {
    return {
      heading: "Live Markets",
      supportingText: "Sports and leagues with events currently in progress.",
    };
  }
  if (selection.id === "today") {
    return {
      heading: "Today’s Markets",
      supportingText: "Sports and leagues with events or available markets today.",
    };
  }
  return {
    heading: "Today’s Markets",
    supportingText: selection.id === "for-you"
      ? "Cross-sport market discovery ranked for your current research context."
      : "Cross-sport market discovery ranked by current availability.",
    fallbackLabel: firstLeague?.leagueDisplayName || "",
  };
}

function emptyReasonForSelection(selection, visibleLeagues, allScopedLeagues) {
  if (visibleLeagues.length) {
    if (selection.type === "league" && visibleLeagues[0].liveEventCount === 0 && visibleLeagues[0].todayEventCount === 0) {
      return `No ${selection.label} events are scheduled today.`;
    }
    return "";
  }
  if (selection.type === "league") return `No ${selection.label} market data is currently available.`;
  if (selection.id === "live") return "No supported events are live right now.";
  if (selection.id === "today") return "No supported events or markets are available today.";
  if (selection.type === "sport" || selection.type === "category") {
    const hasStale = allScopedLeagues.some((league) => league.availabilityStatus === "stale");
    return hasStale
      ? `${selection.label} provider data is stale.`
      : `No ${selection.label.toLowerCase()} markets are currently available.`;
  }
  return "No eligible market summaries are currently available.";
}

export function getVisibleMarketSummaries({
  selection,
  leagues,
  events = [],
  markets = [],
  currentDate = new Date(),
}) {
  const normalized = normalizeNavigationSelection(selection, leagues);
  const enabled = leagues.filter((league) => league.enabled);
  const eventLeagueIdsToday = new Set(events.filter((event) => {
    if (!event?.startsAt) return false;
    const startsAt = new Date(event.startsAt);
    return !Number.isNaN(startsAt.getTime())
      && startsAt.getFullYear() === currentDate.getFullYear()
      && startsAt.getMonth() === currentDate.getMonth()
      && startsAt.getDate() === currentDate.getDate();
  }).map((event) => event.leagueId));

  let scoped = enabled;
  if (normalized.type === "league") scoped = enabled.filter((league) => league.leagueId === normalized.id);
  else if (normalized.type === "sport") scoped = enabled.filter((league) => league.sportId === normalized.id);
  else if (normalized.type === "category") {
    const sportIds = NAVIGATION_CATEGORIES[normalized.id]?.sportIds || [];
    scoped = enabled.filter((league) => sportIds.includes(league.sportId));
  } else if (normalized.id === "live") scoped = enabled.filter((league) => league.liveEventCount > 0);
  else if (normalized.id === "today") {
    scoped = enabled.filter((league) =>
      league.liveEventCount > 0
      || league.todayEventCount > 0
      || eventLeagueIdsToday.has(league.leagueId));
  } else if (normalized.type === "destination") {
    const destinationFilters = {
      upcoming: (league) => league.availabilityStatus === "upcoming",
      offseason: (league) => league.availabilityStatus === "offseason",
      futures: (league) => league.availabilityStatus === "futures-only"
        || (league.availabilityStatus === "offseason" && league.availableMarketCount > 0),
      tier2: (league) => league.priorityTier === 2,
      tier3: (league) => league.priorityTier === 3,
      unavailable: (league) => ["unavailable", "error", "stale"].includes(league.availabilityStatus),
    };
    scoped = enabled.filter(destinationFilters[normalized.id] || (() => false));
  }

  const preserveExactLeague = normalized.type === "league";
  const preserveDestination = normalized.type === "destination";
  const visibleLeagues = scoped.filter((league) =>
    preserveExactLeague
    || preserveDestination
    || (!["unavailable", "error", "offseason"].includes(league.availabilityStatus)
      && (league.liveEventCount > 0
        || league.todayEventCount > 0
        || league.upcomingEventCount > 0
        || league.availableMarketCount > 0
        || league.availabilityStatus === "stale")));
  const context = contextForSelection(normalized, visibleLeagues);
  return Object.freeze({
    selection: normalized,
    visibleLeagues: Object.freeze(visibleLeagues),
    totalEventCount: visibleLeagues.reduce((sum, league) => sum + league.todayEventCount, 0),
    liveEventCount: visibleLeagues.reduce((sum, league) => sum + league.liveEventCount, 0),
    availableMarketCount: visibleLeagues.reduce((sum, league) => sum + league.availableMarketCount, 0),
    playerPropCount: visibleLeagues.reduce((sum, league) => sum + league.playerPropCount, 0),
    contextLabel: normalized.label,
    heading: context.heading,
    supportingText: context.supportingText,
    emptyStateReason: emptyReasonForSelection(normalized, visibleLeagues, scoped),
  });
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
