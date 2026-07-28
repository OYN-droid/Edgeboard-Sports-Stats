import { MARKET_FILTERS } from "../config/sports-registry.js";
import { getCatalogForLeague, getMarketDefinition, resolveCanonicalMarketId } from "../config/market-catalog.js";

const QUERY_STOP_WORDS = new Set(["the", "for", "are", "with", "tonight", "show", "find", "which"]);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const includesTerm = (text, term) => term.length <= 3
  ? new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text)
  : text.includes(term);

function getLegCount(query) {
  const lower = query.toLowerCase();
  const numeric = lower.match(/\b([2-8])\s*[- ]?\s*(leg|legs)\b/);
  if (numeric) return Number(numeric[1]);
  const words = { two: 2, three: 3, four: 4, five: 5, six: 6 };
  const word = Object.entries(words).find(([label]) => lower.includes(`${label} leg`));
  return word ? word[1] : lower.includes("parlay") ? 4 : 0;
}

function getRequestedPropType(query) {
  const lower = query.toLowerCase();
  if (includesTerm(lower, "td") || lower.includes("touchdown")) return "touchdowns";
  if (lower.includes("homerun") || lower.includes("home run") || includesTerm(lower, "hr")) return "homeruns";
  if (["goal scorer", "goalscorer", "goal scorers", "goal"].some((term) => lower.includes(term))) return "goals";
  if (lower.includes("point")) return "points";
  if (lower.includes("assist")) return "assists";
  if (lower.includes("yard")) return "yards";
  if (lower.includes("base") || lower.includes("hit")) return "bases";
  if (lower.includes("shot")) return "shots";
  return "";
}

function flattenMarkets(repository, leagueId) {
  return repository.getMarkets(leagueId).flatMap((market) =>
    market.selections.map((selection) => ({
      ...selection,
      marketId: market.id,
      marketType: market.marketType,
      canonicalMarketId: market.canonicalMarketId,
      marketDisplayName: market.displayName,
      marketCategory: market.category,
      period: market.period,
      settlementScope: market.settlementScope,
      source: market.source,
      isLive: market.isLive,
      isAlternate: market.isAlternate,
      isSgpEligible: market.isSgpEligible,
      market: market.filterGroup,
      leagueId: market.leagueId,
      sport: repository.getLeague(market.leagueId)?.leagueDisplayName || market.leagueId.toUpperCase(),
      game: market.eventId,
      event: market.event,
    })),
  );
}

export function getLeaguePicks(repository, leagueId) {
  return flattenMarkets(repository, leagueId);
}

export function getPickBySelectionId(repository, leagueId, selectionId) {
  return flattenMarkets(repository, leagueId).find((pick) => pick.id === selectionId) || null;
}

function findMentionedTeams(query, aliases) {
  const lower = query.toLowerCase();
  return Object.entries(aliases)
    .filter(([, terms]) => Array.isArray(terms) && terms.some((term) => lower.includes(term)))
    .map(([team]) => team);
}

function findMentionedGame(query, repository) {
  const teams = findMentionedTeams(query, repository.getAliases());
  if (teams.length < 2) return "";
  const game = repository.getLeagues().flatMap((league) => repository.getEvents(league.leagueId))
    .find((event) => teams.every((team) => event.participants.some((participant) => participant.shortName === team)));
  return game?.id || "";
}

export function resolveLeagueFromQuery(query, repository, currentLeagueId) {
  const lower = String(query || "").toLowerCase();
  const currentLeague = repository.getLeague(currentLeagueId);
  const scored = repository.getLeagues().map((league) => {
    let matchScore = 0;
    if (includesTerm(lower, league.leagueId.toLowerCase())) matchScore += 100;
    if (lower.includes(league.leagueDisplayName.toLowerCase())) matchScore += 90;
    if (lower.includes(league.sportDisplayName.toLowerCase())) matchScore += 30;
    league.queryTerms.forEach((term) => {
      if (includesTerm(lower, term.toLowerCase())) matchScore += Math.max(20, term.length * 2);
    });
    const availabilityTiebreaker = matchScore ? Math.min(league.liveEventCount * 0.5 + league.todayEventCount * 0.1, 1) : 0;
    return { league, matchScore, score: matchScore + availabilityTiebreaker };
  }).sort((a, b) => b.score - a.score || a.league.priorityTier - b.league.priorityTier);
  return scored[0]?.matchScore > 0 ? scored[0].league : currentLeague || scored[0]?.league || null;
}

function extractHitRatePercent(value) {
  const text = String(value || "");
  const percentage = text.match(/(\d{1,3})\s*%/);
  if (percentage) return Number(percentage[1]);
  const fraction = text.match(/(\d+)\s*(?:of|\/|-)\s*(\d+)/i);
  if (fraction && Number(fraction[2])) return Math.round((Number(fraction[1]) / Number(fraction[2])) * 100);
  return null;
}

export function parseResearchConstraints(query) {
  const lower = String(query || "").toLowerCase();
  const hitRate = lower.match(/hit rate (?:over|above|at least)\s*(\d{1,3})\s*%?/);
  const confidence = lower.match(/confidence (?:over|above|at least)\s*(\d{1,3})\s*%?/);
  return Object.freeze({
    plusMoneyOnly: lower.includes("plus money") || lower.includes("plus-money") || lower.includes("positive odds"),
    confirmedOnly: lower.includes("confirmed") || lower.includes("active players") || lower.includes("active fighters"),
    liveOnly: /\blive\b/.test(lower),
    minimumHitRate: hitRate ? Math.min(100, Number(hitRate[1])) : null,
    minimumConfidence: confidence ? Math.min(100, Number(confidence[1])) : null,
  });
}

export function parseResearchQuery(query, repository, currentLeagueId, currentMarket) {
  const lower = String(query || "").toLowerCase();
  const league = resolveLeagueFromQuery(lower, repository, currentLeagueId);
  const propTerms = [
    "prop", "player", "points", "assist", "yards", "bases", "shots", "rebounds", "td", "touchdown",
    "homerun", "home run", "hr", "goal scorer", "goal scorers", "method of victory", "knockdown",
    "takedown", "podium", "top 5", "top 10", "fastest lap", "driver matchup", "corners", "cards",
  ];
  let market = currentMarket;
  const canonicalMarketId = resolveCanonicalMarketId(lower, {
    sportId: league?.sportId,
    leagueId: league?.leagueId,
  });
  const definition = getMarketDefinition(canonicalMarketId);
  const normalizedQuery = lower.replaceAll(/[^a-z0-9]+/g, " ").trim();
  const mentionedCanonicalMarketIds = getCatalogForLeague({ sportId: league?.sportId, leagueId: league?.leagueId })
    .filter((item) => [item.displayName, item.id, ...item.providerAliases, ...item.searchTerms]
      .some((term) => {
        const normalizedTerm = String(term).toLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();
        return normalizedTerm.length > 3 && normalizedQuery.includes(normalizedTerm);
      }))
    .map((item) => item.id)
    .filter((id, index, list) => list.indexOf(id) === index);

  if (definition) market = definition.filterGroup;
  else if (lower.includes("spread") || lower.includes("cover") || lower.includes("ats")) market = "spreads";
  else if (propTerms.some((term) => includesTerm(lower, term))) market = "props";
  else if (lower.includes("total") || lower.includes("under") || lower.includes("over/under")) market = "totals";
  else if (["moneyline", "winner", "win outright", "three-way", "draw"].some((term) => lower.includes(term))) market = "moneylines";

  const availability = league ? repository.getMarketAvailability(league.leagueId) : [];
  const canonicalAvailability = availability.find((item) => item.canonicalMarketId === canonicalMarketId);
  return {
    leagueId: league?.leagueId || currentLeagueId,
    market,
    canonicalMarketId,
    recognizedMarket: definition?.displayName || "",
    unsupportedMarket: Boolean(definition && !canonicalAvailability?.available),
    unsupportedReason: definition && !canonicalAvailability?.available
      ? `${definition.displayName} is recognized but no current ${league?.leagueDisplayName || "league"} sample market is available.`
      : "",
    alternativeCanonicalMarketIds: mentionedCanonicalMarketIds.filter((id) => id !== canonicalMarketId),
    interpretationNote: mentionedCanonicalMarketIds.length > 1
      ? `Multiple markets were recognized. Showing ${definition?.displayName || "the primary interpretation"}; use the market browser to refine the scope.`
      : "",
    gameId: findMentionedGame(lower, repository),
    constraints: parseResearchConstraints(lower),
  };
}

export function getAvailableMarketFilters(repository, leagueId) {
  const league = repository.getLeague(leagueId);
  const markets = repository.getMarkets(leagueId);
  return MARKET_FILTERS.map((filter) => ({
    ...filter,
    supported: filter.marketTypes.some((type) => league?.supportedMarketTypes.includes(type)),
    available: markets.some((market) => market.filterGroup === filter.id && market.available),
  }));
}

export function getFilteredPicks(repository, { leagueId, market, canonicalMarketId = "", minConfidence, availableOnly, query, queryGame }) {
  const allPicks = flattenMarkets(repository, leagueId);
  const constraints = parseResearchConstraints(query);
  let list = allPicks.filter((pick) => pick.market === market);
  if (canonicalMarketId) list = list.filter((pick) => pick.canonicalMarketId === canonicalMarketId);
  if (availableOnly) list = list.filter((pick) => pick.available);
  list = list.filter((pick) => pick.confidence >= Math.max(minConfidence, constraints.minimumConfidence || 0));
  if (constraints.plusMoneyOnly) list = list.filter((pick) => Number.isFinite(pick.odds) && pick.odds > 0);
  if (constraints.confirmedOnly) list = list.filter((pick) => pick.confirmed);
  if (constraints.liveOnly) list = list.filter((pick) => pick.event?.status === "live");
  if (constraints.minimumHitRate !== null) {
    list = list.filter((pick) => {
      const rate = extractHitRatePercent(pick.hitRate);
      return rate !== null && rate >= constraints.minimumHitRate;
    });
  }
  if (queryGame) list = list.filter((pick) => pick.game === queryGame && pick.confirmed);
  if (!query) return list;

  const tokens = query.toLowerCase().split(/\W+/).filter((token) => token.length > 2 && !QUERY_STOP_WORDS.has(token));
  const scored = list.map((pick) => {
    const searchable = [pick.name, pick.line, pick.hitRate, pick.matchup, pick.trend, pick.note, pick.game, pick.team, pick.opponent, pick.propType, pick.canonicalMarketId, pick.marketDisplayName].join(" ").toLowerCase();
    return { pick, score: tokens.reduce((total, token) => total + (searchable.includes(token) ? 1 : 0), 0) };
  }).sort((a, b) => b.score - a.score || b.pick.confidence - a.pick.confidence);
  const directMatches = scored.filter((item) => item.score > 0).map((item) => item.pick);
  return directMatches.length ? directMatches : scored.map((item) => item.pick);
}

export function buildParlay(repository, query, { leagueId, minConfidence }) {
  const legCount = getLegCount(query);
  if (!legCount) return { legs: [], gameId: findMentionedGame(query, repository), note: "" };

  const requestedPropType = getRequestedPropType(query);
  const gameId = findMentionedGame(query, repository);
  let candidates = flattenMarkets(repository, leagueId)
    .filter((pick) => pick.market === "props" && pick.available && pick.confirmed && pick.confidence >= minConfidence)
    .filter((pick) => !requestedPropType || pick.propType === requestedPropType)
    .sort((a, b) => b.confidence - a.confidence);

  if (gameId) {
    candidates = candidates.filter((pick) => pick.game === gameId);
    return {
      legs: candidates.slice(0, legCount),
      gameId,
      note: candidates.length
        ? `Specific-game mode: only confirmed players from ${gameId} were considered.`
        : `Specific-game mode: I could not find enough confirmed players from ${gameId} in the sample board.`,
    };
  }

  const usedTeams = new Set();
  const legs = [];
  candidates.forEach((pick) => {
    if (legs.length >= legCount || usedTeams.has(pick.team)) return;
    usedTeams.add(pick.team);
    legs.push(pick);
  });
  return {
    legs,
    gameId: "",
    note: legs.length >= legCount
      ? `Broad parlay mode: selected ${legs.length} legs from ${legs.length} different teams to reduce same-team dependence.`
      : `Broad parlay mode: found ${legs.length} qualifying legs from different teams; add more sample props or lower confidence for a full ${legCount}-leg slip.`,
  };
}
