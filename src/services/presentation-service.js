const unavailable = "Unavailable from sample provider";
const valueOrUnavailable = (value) => value === null || value === undefined || value === "" ? unavailable : String(value);

function marketCatalog(markets, definitions) {
  const availableTypes = new Set(markets.filter((market) => market.available).map((market) => market.marketType));
  return definitions.map(([label, types]) => ({
    label,
    available: types.some((type) => availableTypes.has(type)),
  }));
}

function marketSnapshot(markets) {
  return markets.flatMap((market) => market.selections
    .filter((selection) => selection.available)
    .map((selection) => ({
      id: selection.id,
      marketType: market.marketType,
      name: selection.name,
      line: selection.line,
      odds: selection.odds,
      sportsbook: selection.sportsbook,
      lastUpdatedAt: selection.lastUpdatedAt,
      stale: selection.stale,
    })))
    .slice(0, 6);
}

function latestMarketUpdate(markets) {
  const timestamps = markets.flatMap((market) => market.selections)
    .map((selection) => selection.lastUpdatedAt)
    .filter(Boolean)
    .sort();
  return timestamps.at(-1) || null;
}

function common(event, league, markets, kind) {
  return {
    kind,
    id: event.id,
    leagueId: league.leagueId,
    leagueName: league.leagueDisplayName,
    sportName: league.sportDisplayName,
    status: event.status,
    startsAt: event.startsAt,
    sourceMode: event.sourceMode,
    live: event.live,
    venue: event.venue,
    dataQualityWarning: league.dataQualityStatus === "good"
      ? "Sample provider data — verify event status and market rules"
      : `Data quality: ${league.dataQualityStatus || "unavailable"}`,
    marketCount: markets.filter((market) => market.available).length,
    marketSnapshot: marketSnapshot(markets),
    lastUpdatedAt: latestMarketUpdate(markets) || league.lastUpdatedAt,
  };
}

function teamGamePresentation(event, league, markets) {
  const details = event.teamGame || {};
  return {
    ...common(event, league, markets, "team-game"),
    title: `${event.away} at ${event.home}`,
    subtitle: event.tournament?.name || details.competition_stage || league.leagueDisplayName,
    participants: event.participants,
    lines: [
      ["Spread", event.display.spread],
      ["Total", event.display.total],
      ["Moneyline", markets.some((market) => market.marketType === "moneyline") ? "Available" : unavailable],
      ["Game environment", details.projected_environment || unavailable],
    ],
    details: [
      ["Stage", details.competition_stage],
      ["Period format", details.period_format],
      ["Overtime", details.overtime_format],
      ["Site", details.neutral_site ? "Neutral site" : "Home venue"],
      ["Market scope", details.market_scope],
      ["Injuries", details.injuries_status],
      ["Lineups", details.lineup_status],
      ["Correlation ID", details.correlation_id],
    ],
    markets: marketCatalog(markets, [
      ["Moneyline", ["moneyline"]], ["Spread", ["spread"]], ["Total", ["total"]],
      ["Player props", ["player-prop"]], ["Team props", ["team-prop"]],
      ["Regulation only", ["regulation-moneyline"]], ["Including overtime", ["moneyline"]],
    ]),
  };
}

function soccerPresentation(event, league, markets) {
  const soccer = event.soccer || {};
  const home = event.participants.find((participant) => participant.role === "home");
  const away = event.participants.find((participant) => participant.role === "away");
  return {
    ...common(event, league, markets, "soccer-match"),
    title: `${event.home} vs ${event.away}`,
    subtitle: `${soccer.competition || league.leagueDisplayName} · ${soccer.stage || "Stage unavailable"}`,
    participants: event.participants,
    lines: [
      ["Three-way moneyline", markets.some((market) => market.marketType === "moneyline") ? `${home?.shortName || "Home"} · Draw · ${away?.shortName || "Away"}` : unavailable],
      ["Total", event.display.total],
      ["Aggregate", soccer.aggregate_score || "Not applicable"],
      ["Penalty state", soccer.penalty_state || "Not applicable"],
    ],
    details: [
      ["Competition", soccer.competition],
      ["Stage", soccer.stage],
      ["Extra time", soccer.extra_time_possible ? "Supported" : "Not scheduled"],
      ["Aggregate score", soccer.aggregate_score || "Not applicable"],
      ["Home / away", `${home?.name || event.home} / ${away?.name || event.away}`],
    ],
    markets: marketCatalog(markets, [
      ["Home / Draw / Away", ["moneyline"]], ["Draw no bet", ["draw-no-bet"]],
      ["Asian handicap", ["asian-handicap"]], ["Totals", ["total"]],
      ["Both teams to score", ["both-teams-to-score"]], ["Team totals", ["team-prop"]],
      ["Player shots", ["player-prop"]], ["Shots on target", ["shots-on-target"]],
      ["Anytime scorer", ["anytime-scorer"]], ["Cards", ["cards"]], ["Corners", ["corners"]],
    ]),
  };
}

function fightCardPresentation(event, league, markets) {
  const card = event.card || {};
  return {
    ...common(event, league, markets, "fight-card"),
    title: card.event_name || event.display.title || league.leagueDisplayName,
    subtitle: `${card.promotion || league.leagueDisplayName} · ${event.venue?.name || "Venue unavailable"}`,
    mainEvent: card.main_event || null,
    coMainEvent: card.co_main_event || null,
    undercard: Array.isArray(card.undercard) ? card.undercard : [],
    details: [
      ["Promotion", card.promotion],
      ["Venue", event.venue ? `${event.venue.name}, ${event.venue.city || ""}` : unavailable],
      ["Undercard", card.undercard?.length ? `${card.undercard.length} sample bout` : unavailable],
      ["Weigh-in status", card.weigh_in_status],
      ["Card status", card.card_status],
    ],
    markets: marketCatalog(markets, [
      ["Moneyline", ["moneyline"]], ["Method of victory", ["method-of-victory"]],
      ["Goes the distance", ["fight-prop"]], ["Round total", ["round"]],
      ["Winning round", ["winning-round"]], ["Knockdowns", ["knockdown"]],
      ["Significant strikes", ["significant-strikes"]], ["Takedowns", ["takedowns"]],
    ]),
    dataQualityWarning: card.data_quality_warning || "Sample fight card",
  };
}

function raceWeekendPresentation(event, league, markets) {
  const race = event.race || {};
  const sessions = race.sessions || {};
  return {
    ...common(event, league, markets, "race-weekend"),
    title: race.event_name || event.display.title || league.leagueDisplayName,
    subtitle: `${race.series || league.leagueDisplayName} · ${race.circuit || "Track unavailable"}`,
    sessions: [
      ["Practice", sessions.practice?.status, sessions.practice?.results, sessions.practice?.starts_at],
      ["Qualifying", sessions.qualifying?.status, sessions.qualifying?.results, sessions.qualifying?.starts_at],
      ["Race", sessions.race?.status, sessions.race?.results, sessions.race?.starts_at],
    ],
    entrants: Array.isArray(race.entrants) ? race.entrants : [],
    details: [
      ["Series", race.series],
      ["Circuit / track", race.circuit],
      ["Location", race.location],
      ["Weather", race.weather],
      ["Starting positions", sessions.qualifying?.results],
      ["Practice results", sessions.practice?.results],
    ],
    markets: marketCatalog(markets, [
      ["Outright winner", ["winner"]], ["Podium", ["race-prop"]],
      ["Top 5", ["top-5"]], ["Top 10", ["race-prop"]],
      ["Driver head-to-head", ["driver-h2h"]], ["Manufacturer", ["manufacturer"]],
      ["Fastest lap", ["fastest-lap"]], ["Finishing position", ["race-prop"]],
      ["Stage / segment winner", ["stage-winner"]],
    ]),
  };
}

function individualPresentation(event, league, markets) {
  return {
    ...common(event, league, markets, "individual-event"),
    title: event.tournament?.name || event.display.title || league.leagueDisplayName,
    subtitle: `${event.tournament?.stage || "Stage unavailable"} · ${event.tournament?.format || "Individual event"}`,
    participants: event.participants,
    details: [
      ["Tournament", event.tournament?.name],
      ["Stage", event.tournament?.stage],
      ["Format", event.tournament?.format],
      ["Site", event.tournament?.neutral_site ? "Neutral site" : unavailable],
    ],
    markets: marketCatalog(markets, [
      ["Match winner", ["moneyline"]], ["Outright winner", ["winner"]],
      ["Competitor props", ["player-prop"]], ["Futures", ["futures"]],
    ]),
  };
}

export function createEventPresentation(event, league, markets = []) {
  if (!event || !league) return null;
  if (event.eventType === "combat-card" || league.category === "combat-sport") return fightCardPresentation(event, league, markets);
  if (event.eventType === "motorsport" || league.category === "motorsport") return raceWeekendPresentation(event, league, markets);
  if (league.sportId === "soccer") return soccerPresentation(event, league, markets);
  if (event.eventType === "individual" || league.category === "individual-sport") return individualPresentation(event, league, markets);
  const presentation = teamGamePresentation(event, league, markets);
  if (event.tournament && ["basketball", "ice-hockey"].includes(league.sportId)) {
    return {
      ...presentation,
      kind: "international-team-game",
      subtitle: `${event.tournament.name || league.leagueDisplayName} · ${event.teamGame?.competition_stage || "Stage unavailable"}`,
    };
  }
  return presentation;
}

export { unavailable as PRESENTATION_UNAVAILABLE };
