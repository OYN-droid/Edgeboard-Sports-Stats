import {
  getFilteredPicks,
  getLeaguePicks,
  parseResearchConstraints,
  parseResearchQuery,
} from "./research-service.js";
import { getMarketDefinition } from "../config/market-catalog.js";

const CATEGORY_LABELS = Object.freeze({
  "team-sport": "Team game",
  tournament: "Tournament",
  "combat-sport": "Fight card",
  motorsport: "Race weekend",
  "individual-sport": "Individual event",
});

function marketLabel(market) {
  return {
    props: "Props",
    moneylines: "Moneyline / winner",
    spreads: "Spread / handicap",
    totals: "Totals",
  }[market] || "Markets";
}

function describeConstraints(constraints, minimumConfidence) {
  const confidenceFloor = Math.max(minimumConfidence, constraints.minimumConfidence || 0);
  const values = [confidenceFloor ? `confidence signal ≥ ${confidenceFloor}%` : "confidence filter off"];
  if (constraints.plusMoneyOnly) values.push("plus-money prices only");
  if (constraints.minimumHitRate !== null) values.push(`historical hit rate ≥ ${constraints.minimumHitRate}%`);
  if (constraints.confirmedOnly) values.push("confirmed competitors only");
  if (constraints.liveOnly) values.push("live events only");
  return values;
}

function dataRisks(league, events, picks) {
  const warnings = ["Mock provider prices are for interface testing and must be verified before use."];
  if (!league?.lastUpdatedAt) warnings.push("League freshness timestamp is unavailable.");
  if (league?.availabilityStatus === "stale" || picks.some((pick) => pick.stale)) warnings.push("Some available evidence is stale.");
  if (league?.availabilityStatus === "offseason") warnings.push("The resolved league is marked offseason; event markets may be demonstration-only.");
  if (league?.availabilityStatus === "futures-only") warnings.push("The resolved league currently supports futures-only availability.");
  if (!events.length) warnings.push("No normalized event is available for the resolved league.");
  if (!picks.length) warnings.push("No market selections are available in the resolved scope.");
  if (picks.some((pick) => !pick.confirmed)) warnings.push("Unconfirmed competitor status appears in the candidate pool.");
  return warnings;
}

function eventModelLabel(league) {
  if (league?.sportId === "soccer") return "Soccer match";
  if (league?.category === "tournament" && ["basketball", "ice-hockey"].includes(league.sportId)) return "International team event";
  return CATEGORY_LABELS[league?.category] || league?.category || "Unknown event type";
}

export function runAnalystWorkflow(repository, query, options = {}) {
  const minimumConfidence = Number(options.minimumConfidence) || 0;
  const parsed = parseResearchQuery(query, repository, options.currentLeagueId, options.currentMarket);
  if (!parsed.canonicalMarketId && options.currentCanonicalMarketId) {
    parsed.canonicalMarketId = options.currentCanonicalMarketId;
  }
  const constraints = parseResearchConstraints(query);
  const league = repository.getLeague(parsed.leagueId);
  const events = repository.getEvents(parsed.leagueId);
  const allPicks = getLeaguePicks(repository, parsed.leagueId);
  const scopedPicks = allPicks.filter((pick) =>
    pick.market === parsed.market
    && (!parsed.canonicalMarketId || pick.canonicalMarketId === parsed.canonicalMarketId));
  const freshAvailable = getFilteredPicks(repository, {
    leagueId: parsed.leagueId,
    market: parsed.market,
    canonicalMarketId: parsed.canonicalMarketId,
    minConfidence: minimumConfidence,
    availableOnly: true,
    query,
    queryGame: parsed.gameId,
  }).filter((pick) => !pick.stale);
  const warnings = dataRisks(league, events, scopedPicks);
  if (parsed.unsupportedReason) warnings.push(parsed.unsupportedReason);
  const resolvedEvent = parsed.gameId ? events.find((event) => event.id === parsed.gameId) : null;

  const workflowStatus = !league || ["error", "unavailable"].includes(league.availabilityStatus)
    ? "blocked"
    : freshAvailable.length ? "ready" : "limited";
  const steps = [
    {
      id: "interpret",
      label: "Interpret question",
      status: "complete",
      detail: `${getMarketDefinition(parsed.canonicalMarketId)?.displayName || marketLabel(parsed.market)} research${constraints.plusMoneyOnly ? " with price constraint" : ""}.`,
    },
    {
      id: "scope",
      label: "Resolve sport and event",
      status: league ? "complete" : "blocked",
      detail: league
        ? `${league.sportDisplayName} · ${league.leagueDisplayName} · ${eventModelLabel(league)}${resolvedEvent ? ` · ${resolvedEvent.id}` : ""}`
        : "No supported league could be resolved.",
    },
    {
      id: "evidence",
      label: "Check provider evidence",
      status: freshAvailable.length ? "complete" : "limited",
      detail: `${events.length} normalized event${events.length === 1 ? "" : "s"} · ${freshAvailable.length} fresh available selection${freshAvailable.length === 1 ? "" : "s"} in scope.`,
    },
    {
      id: "risk",
      label: "Apply risk controls",
      status: warnings.length > 1 ? "limited" : "complete",
      detail: `${warnings.length} data-quality note${warnings.length === 1 ? "" : "s"} · confidence is treated as model signal, not win probability.`,
    },
    {
      id: "rank",
      label: "Rank research candidates",
      status: workflowStatus,
      detail: freshAvailable.length
        ? "Candidates are filtered by the stated constraints, then ranked by query relevance and model signal."
        : "No fresh candidate can be ranked without relaxing scope or adding provider data.",
    },
  ];

  return Object.freeze({
    query: String(query || "").trim(),
    status: workflowStatus,
    leagueId: parsed.leagueId,
    leagueName: league?.leagueDisplayName || "Unresolved league",
    sportName: league?.sportDisplayName || "Unresolved sport",
    category: eventModelLabel(league),
    market: parsed.market,
    marketId: parsed.canonicalMarketId,
    marketLabel: getMarketDefinition(parsed.canonicalMarketId)?.displayName || marketLabel(parsed.market),
    eventId: resolvedEvent?.id || "",
    constraints: describeConstraints(constraints, minimumConfidence),
    evidence: {
      eventCount: events.length,
      marketCount: scopedPicks.length,
      availableCount: freshAvailable.length,
      provider: repository.getMetadata().provider,
      generatedAt: repository.getMetadata().generatedAt,
    },
    steps,
    warnings,
  });
}
