import {
  MARKET_HUB_SECTIONS, MARKET_RESEARCH_LIMITS, MARKET_RESEARCH_SCHEMA_VERSION,
  MARKET_RESEARCH_SCORE_WEIGHTS, MARKET_RESEARCH_STATUSES, MARKET_EXPLAINER_INTENTS,
} from "../config/market-research-config.js";
import { getMarketDefinition } from "../config/market-catalog.js";
import { evaluateEdgeTrust } from "./edge-trust-service.js";

const clean = (value) => String(value ?? "").trim();
const freeze = (values) => Object.freeze([...(values || [])]);
const unique = (values) => [...new Set((values || []).filter(Boolean))];
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function marketResearchId(marketId, selectionId) {
  return `market-research:${encodeURIComponent(marketId)}:${encodeURIComponent(selectionId)}`;
}

function thresholdPerformance(rows, statId, line, side) {
  const threshold = finite(line);
  if (!statId || threshold === null || !["over", "under"].includes(side)) {
    return Object.freeze({ supported: false, hits: null, sampleSize: rows.length, rate: null, message: "Historical threshold performance is unavailable for this market shape." });
  }
  const observed = rows.map((row) => finite(row.stats?.[statId])).filter((value) => value !== null);
  if (!observed.length) return Object.freeze({ supported: false, hits: null, sampleSize: 0, rate: null, message: "No completed source rows match this canonical statistic." });
  const hits = observed.filter((value) => side === "over" ? value > threshold : value < threshold).length;
  return Object.freeze({ supported: true, hits, sampleSize: observed.length, rate: Math.round((hits / observed.length) * 100), message: `${hits} of ${observed.length} completed sample rows cleared the selected ${side} condition.` });
}

function average(values) {
  const valid = values.map(finite).filter((value) => value !== null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function median(values) {
  const valid = values.map(finite).filter((value) => value !== null).sort((left, right) => left - right);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

function freshnessFor(timestamp, stale = false) {
  if (!timestamp) return "unavailable";
  return stale ? "stale" : "fresh";
}

function normalizePrices(selection, market) {
  const current = {
    sportsbook: selection.sportsbook,
    odds: selection.odds,
    line: selection.numericLine,
    lineDisplay: selection.line,
    observedAt: selection.lastUpdatedAt,
    provider: selection.source || market.source,
    sourceMode: selection.sourceMode || market.sourceMode,
    stale: selection.stale,
    verification: "provider-reported",
  };
  const explicit = (selection.bookPrices || []).filter((price) => price.verification === "verified");
  const sourcePrices = explicit.length ? explicit : [current];
  const matchingLine = finite(selection.numericLine);
  const prices = sourcePrices.filter((price) => clean(price.sportsbook) && finite(price.odds) !== null
    && (matchingLine === null || finite(price.line) === matchingLine));
  const sorted = [...prices].sort((left, right) => Number(right.odds) - Number(left.odds) || left.sportsbook.localeCompare(right.sportsbook));
  const verifiedCount = sorted.filter((price) => price.verification === "verified").length;
  const timestamps = sorted.map((price) => price.observedAt).filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);
  const oldestAt = timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
  const newestAt = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
  const sameLine = new Set(sorted.map((price) => price.line)).size <= 1;
  return Object.freeze({
    prices: freeze(sorted.map((price) => Object.freeze({ ...price, freshness: freshnessFor(price.observedAt, price.stale), marketTrust: price.verification === "verified" ? "verified" : "provider-reported" }))),
    best: verifiedCount ? sorted.find((price) => price.verification === "verified") || null : null,
    worst: verifiedCount ? [...sorted].reverse().find((price) => price.verification === "verified") || null : null,
    medianOdds: median(sorted.map((price) => price.odds)),
    medianLine: median(sorted.map((price) => price.line)),
    averageOdds: average(sorted.map((price) => price.odds)),
    averageLine: average(sorted.map((price) => price.line)),
    freshness: Object.freeze({ oldestAt, newestAt, status: sorted.some((price) => price.stale) ? "partial" : sorted.length ? "fresh" : "unavailable" }),
    providerAgreement: Object.freeze({ status: verifiedCount > 1 && sameLine ? "aligned" : verifiedCount > 1 ? "disagreement" : "insufficient", providerCount: verifiedCount, sameLine }),
    comparisonState: verifiedCount > 1 ? "multi-book" : verifiedCount === 1 ? "single-book" : "unverified",
    disclosure: verifiedCount > 1 ? `${verifiedCount} verified sample-provider sportsbook prices compared for the same selection, period, scope, and line.` : verifiedCount === 1 ? "Only one explicitly verified sportsbook price is available; no cross-book advantage is claimed." : "No explicitly verified sportsbook comparison is available.",
  });
}

function movementFor(selection) {
  const timeline = freeze((selection.priceHistory || []).map((item) => Object.freeze({ ...item })));
  const priced = timeline.filter((item) => finite(item.odds) !== null);
  const opening = timeline.find((item) => item.changeType === "opening") || priced[0] || null;
  const current = [...timeline].reverse().find((item) => item.changeType === "current" && finite(item.odds) !== null)
    || priced.at(-1) || (finite(selection.odds) !== null ? Object.freeze({
    sportsbook: selection.sportsbook, line: selection.numericLine, lineDisplay: selection.line,
    odds: selection.odds, observedAt: selection.lastUpdatedAt, provider: selection.source,
    sourceMode: selection.sourceMode, changeType: "current", verification: "provider-reported",
  }) : null);
  const currentIndex = current ? timeline.indexOf(current) : -1;
  const previous = currentIndex > 0 ? [...timeline.slice(0, currentIndex)].reverse().find((item) => finite(item.odds) !== null) || null : priced.length > 1 ? priced.at(-2) : null;
  const lineDelta = opening && current && finite(opening.line) !== null && finite(current.line) !== null
    ? Number((Number(current.line) - Number(opening.line)).toFixed(2)) : null;
  const oddsDelta = opening && current && finite(opening.odds) !== null && finite(current.odds) !== null
    ? Number(current.odds) - Number(opening.odds) : null;
  const verifiedEvents = freeze((selection.marketEvents || []).filter((item) => item.verified));
  const unverifiedEvents = freeze((selection.marketEvents || []).filter((item) => !item.verified));
  const verifiedCauses = freeze(verifiedEvents.filter((item) => item.causalRelationship === "verified-cause"));
  return Object.freeze({
    opening, previous, current, timeline, lineDelta, oddsDelta,
    observed: priced.length > 1 || timeline.some((item) => ["suspended", "reopened"].includes(item.changeType)),
    contributingEvents: verifiedEvents,
    verifiedCauses,
    unverifiedEvents,
    causeStatus: verifiedCauses.length ? "verified-cause" : verifiedEvents.length ? "related-context" : "unknown",
    causeDisclosure: verifiedCauses.length
      ? `The provider explicitly identified ${verifiedCauses.length} verified event${verifiedCauses.length === 1 ? "" : "s"} as a cause of the recorded change.`
      : verifiedEvents.length
        ? `${verifiedEvents.length} verified provider event${verifiedEvents.length === 1 ? " is" : "s are"} related in time, but no verified cause has been identified.`
      : timeline.length > 1
        ? "No verified cause has been identified. Movement is observed, but EdgeBoard does not infer why it occurred."
      : "The provider did not supply enough snapshots to calculate movement.",
  });
}

function researchChangeFor(selection, movement, currentQuality) {
  const history = (selection.researchHistory || []).filter((snapshot) => snapshot.verification === "verified");
  const opening = history[0] || null;
  const current = history.at(-1) || null;
  const projectionDelta = opening && current && finite(opening.projection) !== null && finite(current.projection) !== null
    ? Number((current.projection - opening.projection).toFixed(2)) : null;
  const suppliedQualityDelta = opening && current && finite(opening.researchQuality) !== null && finite(current.researchQuality) !== null
    ? Number((current.researchQuality - opening.researchQuality).toFixed(2)) : null;
  const changes = [
    Object.freeze({ id: "line", label: "Line", status: movement.lineDelta === null ? "unknown" : movement.lineDelta === 0 ? "unchanged" : "changed", detail: movement.lineDelta === null ? "No comparable opening and current line were supplied." : movement.lineDelta === 0 ? "Opening and current lines match." : `Line moved ${movement.lineDelta > 0 ? "+" : ""}${movement.lineDelta}.` }),
    Object.freeze({ id: "projection", label: "Projection", status: projectionDelta === null ? "unknown" : projectionDelta === 0 ? "unchanged" : "changed", detail: projectionDelta === null ? "No verified projection history was supplied." : projectionDelta === 0 ? "Verified projection snapshots are unchanged." : `Verified projection changed ${projectionDelta > 0 ? "+" : ""}${projectionDelta}.` }),
    Object.freeze({ id: "research-quality", label: "Research Quality", status: suppliedQualityDelta === null ? "current-only" : suppliedQualityDelta === 0 ? "unchanged" : "changed", detail: suppliedQualityDelta === null ? `Current Research Quality is ${currentQuality.score}%; no comparable earlier evaluation was supplied.` : `Provider-shaped quality evidence changed ${suppliedQualityDelta > 0 ? "+" : ""}${suppliedQualityDelta} points; current Edge Trust independently evaluates ${currentQuality.score}%.` }),
    Object.freeze({ id: "historical-context", label: "Historical context", status: "no-revision-supplied", detail: "No historical source-row correction was supplied; current context was recalculated from the same completed-row dataset." }),
  ];
  return Object.freeze({ opening, current, projectionDelta, suppliedQualityDelta, changes: freeze(changes) });
}

function impactFor({ movement, relatedMarkets, stories, insights, researchChange, entity, event }) {
  const lineupEvents = movement.contributingEvents.filter((item) => item.type === "lineup");
  const injuryEvents = movement.contributingEvents.filter((item) => item.type === "injury");
  const affected = Object.freeze({
    marketIds: freeze(relatedMarkets.map((item) => item.market.id)),
    storyIds: freeze(stories.map((item) => item.id)), insightIds: freeze(insights.map((item) => item.id)),
    visualizationTypes: freeze(entity ? ["market_line_chart", "odds_movement_chart", "threshold_chart"] : ["market_line_chart", "odds_movement_chart"]),
    comparisonQueries: freeze(entity ? [`Compare ${entity.displayName} with a supported peer using identical filters`] : []),
    projectionIds: freeze(researchChange.projectionDelta === null ? [] : ["provider-model-projection"]),
    eventIds: freeze(event?.id ? [event.id] : []),
  });
  const describe = (events, type) => Object.freeze({
    status: events.length ? "verified-context" : "unavailable",
    events: freeze(events), affected,
    researchQualityImpact: events.length ? "Verified context is included in completeness and evidence review; no causal score change is invented." : `No verified ${type} change is available, so no impact is asserted.`,
  });
  return Object.freeze({ affected, lineup: describe(lineupEvents, "lineup"), injury: describe(injuryEvents, "injury") });
}

function statusFor(market, selection) {
  if (!market || !selection) return "unavailable";
  if (market.status === "suspended" || selection.suspended) return "suspended";
  if (selection.stale) return "stale";
  if (market.available && selection.available) return "available";
  return "unavailable";
}

function marketTrust(market, selection, performance, priceComparison, movement) {
  const sample = !["live_verified", "live_partial"].includes(selection.sourceMode || market.sourceMode);
  const teamMarket = Boolean(market.event?.teamGame);
  const lineupVerified = movement.contributingEvents.some((item) => item.type === "lineup");
  const injuryVerified = movement.contributingEvents.some((item) => item.type === "injury");
  return evaluateEdgeTrust({
    components: {
      markets: market.available && selection.available ? sample ? "sample" : "verified" : "unavailable",
      freshness: selection.stale ? "stale" : selection.lastUpdatedAt ? sample ? "sample" : "fresh" : "unavailable",
      identity: selection.id && market.id && market.eventId ? "verified" : "pending",
      coverage: performance.sampleSize ? Math.min(1, performance.sampleSize / 10) : 0,
      completeness: [selection.odds, selection.line, selection.lastUpdatedAt, market.period, market.settlementScope].filter((value) => value !== null && value !== undefined && value !== "").length / 5,
      agreement: priceComparison.providerAgreement.status === "aligned" ? "verified"
        : priceComparison.providerAgreement.status === "disagreement" ? "partial" : "unavailable",
      lineups: lineupVerified ? "verified" : teamMarket ? "pending" : "unavailable",
      injuries: injuryVerified ? "verified" : teamMarket ? "pending" : "unavailable",
    },
    applicable: ["markets", "freshness", "identity", "coverage", "completeness", "agreement", ...(teamMarket ? ["lineups", "injuries"] : [])],
    sample,
    lastValidation: selection.lastUpdatedAt,
  });
}

function deterministicScore(model) {
  const weights = MARKET_RESEARCH_SCORE_WEIGHTS;
  return Number((model.edgeTrust.researchQuality.score / 100 * weights.researchQuality
    + (model.status === "available" ? weights.availability : 0)
    + Math.min(model.historicalPerformance.sampleSize / 10, 1) * weights.historicalCoverage
    + (model.movement.observed ? weights.movementEvidence : 0)
    + (model.event ? weights.eventContext : 0)).toFixed(3));
}

function validateModel(model) {
  const errors = [];
  if (!model.id || !model.marketId || !model.selectionId || !model.canonicalMarketId) errors.push("Canonical market research identity is incomplete.");
  if (!MARKET_RESEARCH_STATUSES.includes(model.status)) errors.push("Market research status is invalid.");
  if (!model.source?.provider || !model.edgeTrust?.researchQuality) errors.push("Source and Edge Trust metadata are required.");
  if (model.priceComparison.prices.some((price) => finite(price.odds) === null)) errors.push("Invalid odds cannot enter a price comparison.");
  if (!model.marketExplainer || !model.researchChange || !model.impact) errors.push("Market explanation and research impact are required.");
  if (model.movement.contributingEvents.some((item) => item.verification !== "verified")) errors.push("Unverified events cannot be represented as contributing context.");
  return Object.freeze({ valid: errors.length === 0, errors: freeze(errors) });
}

export function classifyMarketExplainerQuery(query) {
  const text = clean(query);
  const match = MARKET_EXPLAINER_INTENTS.find(([, expression]) => expression.test(text));
  return Object.freeze({ matched: Boolean(match), intent: match?.[0] || "market-search", query: text });
}

export class MarketResearchService {
  constructor({ sportsRepository, statsRepository, entityRegistry, insightService, storyEngine } = {}) {
    if (!sportsRepository || !statsRepository || !entityRegistry || !insightService || !storyEngine) throw new TypeError("Market Research requires existing normalized sports, statistics, entity, insight, and story systems.");
    this.sportsRepository = sportsRepository; this.statsRepository = statsRepository; this.entityRegistry = entityRegistry;
    this.insightService = insightService; this.storyEngine = storyEngine; this.historicalService = null; this.cache = new Map(); this.requestSequence = 0;
  }

  connectHistorical(historicalService) { this.historicalService = historicalService || this.historicalService; this.clearCache(); }
  clearCache(id = "") { if (!id) this.cache.clear(); else [...this.cache.keys()].filter((key) => key.includes(id)).forEach((key) => this.cache.delete(key)); }

  resolveEntity(selection, leagueId) {
    const providerMatch = this.entityRegistry.entities.filter((entity) => entity.leagueId === leagueId
      && Object.values(entity.providerIds || {}).some((value) => value === selection.id));
    if (providerMatch.length === 1) return providerMatch[0];
    const exact = this.entityRegistry.entities.filter((entity) => entity.leagueId === leagueId
      && entity.displayName.toLowerCase() === clean(selection.name).toLowerCase());
    return exact.length === 1 ? exact[0] : null;
  }

  buildModel(market, selection) {
    const key = `${market.id}:${selection.id}:${selection.lastUpdatedAt || "none"}:${this.statsRepository.updatedAt || "none"}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const league = this.sportsRepository.getLeague(market.leagueId);
    const entity = this.resolveEntity(selection, market.leagueId);
    const statId = getMarketDefinition(market.canonicalMarketId) ? market.canonicalMarketId : "";
    const summary = entity ? this.statsRepository.getPlayerSummary(entity.id, { statIds: statId ? [statId] : [], aggregation: "average" }) : null;
    const rows = [...(summary?.rows || [])].sort((left, right) => new Date(right.event_date) - new Date(left.event_date));
    const historicalPerformance = Object.freeze({
      ...thresholdPerformance(rows, statId, selection.numericLine, selection.side),
      average: summary?.stats?.[statId]?.value ?? null,
      statId,
      rows: freeze(rows.slice(0, MARKET_RESEARCH_LIMITS.gameLog)),
      last5: thresholdPerformance(rows.slice(0, 5), statId, selection.numericLine, selection.side),
      last10: thresholdPerformance(rows.slice(0, 10), statId, selection.numericLine, selection.side),
      home: thresholdPerformance(rows.filter((row) => row.home_away === "home"), statId, selection.numericLine, selection.side),
      away: thresholdPerformance(rows.filter((row) => row.home_away === "away"), statId, selection.numericLine, selection.side),
      opponent: thresholdPerformance(rows.filter((row) => row.opponent_id === selection.opponent), statId, selection.numericLine, selection.side),
      source: summary?.metadata?.source || this.statsRepository.name || "Source unavailable",
      updatedAt: summary?.metadata?.updatedAt || this.statsRepository.updatedAt || null,
      warnings: freeze(summary?.metadata?.warnings || []),
    });
    const priceComparison = normalizePrices(selection, market);
    const movement = movementFor(selection);
    const edgeTrust = marketTrust(market, selection, historicalPerformance, priceComparison, movement);
    let insights = [];
    try { if (entity) insights = this.insightService.getInsightsForProfile(entity.id, { limit: 4, includeBettingContext: true }); } catch { insights = []; }
    this.storyEngine.generateStoryCandidates({ leagueIds: [market.leagueId], sportIds: league?.sportId ? [league.sportId] : [] }, { mode: "both", limit: 12 });
    const stories = [...this.storyEngine.index.values()].filter((story) => entity && story.entityIds.includes(entity.id)).slice(0, MARKET_RESEARCH_LIMITS.relatedEvidence);
    const event = market.event || this.sportsRepository.getEvents(market.leagueId).find((item) => item.id === market.eventId) || null;
    const relatedMarkets = this.sportsRepository.getMarkets(market.leagueId).filter((candidate) => candidate.id !== market.id && candidate.eventId === market.eventId && candidate.available)
      .flatMap((candidate) => candidate.selections.filter((item) => item.available).slice(0, 1).map((item) => ({ market: candidate, selection: item })))
      .slice(0, MARKET_RESEARCH_LIMITS.relatedMarkets);
    const reasonsFor = [];
    const reasonsAgainst = [];
    if (historicalPerformance.supported) reasonsFor.push(`${historicalPerformance.message} This is historical context, not a forecast.`);
    if (movement.observed) reasonsFor.push(`The provider supplied ${movement.timeline.length} observed price snapshots worth reviewing.`);
    if (selection.projection && !/unavailable/i.test(selection.projection)) reasonsFor.push("A provider-shaped model projection is present and can be compared with the current line.");
    if (selection.stale) reasonsAgainst.push("The current price is stale and may no longer match the source market.");
    if (priceComparison.comparisonState !== "multi-book") reasonsAgainst.push("Only one verified sportsbook is available, so best-price comparison is limited.");
    if (historicalPerformance.sampleSize < 10) reasonsAgainst.push(`Historical coverage is limited to ${historicalPerformance.sampleSize} completed row${historicalPerformance.sampleSize === 1 ? "" : "s"}.`);
    if (!event?.startsAt) reasonsAgainst.push("The normalized provider did not supply a confirmed event time.");
    const verifiedLineup = movement.contributingEvents.find((item) => item.type === "lineup");
    const verifiedInjury = movement.contributingEvents.find((item) => item.type === "injury");
    const lineupStatus = verifiedLineup?.summary || clean(event?.teamGame?.lineup_status || event?.teamGame?.lineupStatus) || "Unavailable from provider";
    const injuryStatus = verifiedInjury?.summary || clean(event?.teamGame?.injuries_status || event?.teamGame?.injuriesStatus) || "Unavailable from provider";
    if (/unavailable|pending|unknown/i.test(`${lineupStatus} ${injuryStatus}`)) reasonsAgainst.push("Lineup or injury confirmation is incomplete and no effect is assumed.");
    const researchChange = researchChangeFor(selection, movement, edgeTrust.researchQuality);
    const impact = impactFor({ movement, relatedMarkets, stories, insights, researchChange, entity, event });
    const currentStory = stories.find((story) => (story.eventIds || []).includes(market.eventId)) || null;
    const supportingEvidence = freeze([
      ...movement.timeline.map((item, index) => Object.freeze({ id: `price-${index + 1}`, type: "market_snapshot", label: `${item.changeType} market snapshot`, timestamp: item.observedAt, provider: item.provider, verification: item.verification, values: Object.freeze({ line: item.lineDisplay, odds: item.odds, status: item.status }) })),
      ...movement.contributingEvents.map((item) => Object.freeze({ id: item.id, type: item.type, label: item.summary, timestamp: item.occurredAt, provider: item.provider, verification: item.verification, values: Object.freeze({ entityId: item.entityId }) })),
      ...(selection.researchHistory || []).filter((item) => item.verification === "verified").map((item, index) => Object.freeze({ id: `research-${index + 1}`, type: "research_snapshot", label: "Verified projection and Research Quality snapshot", timestamp: item.observedAt, provider: item.provider, verification: item.verification, values: Object.freeze({ projection: item.projection, researchQuality: item.researchQuality }) })),
      ...(historicalPerformance.supported ? [Object.freeze({ id: "historical-threshold", type: "historical_context", label: historicalPerformance.message, timestamp: historicalPerformance.updatedAt, provider: historicalPerformance.source, verification: "calculated", values: Object.freeze({ hits: historicalPerformance.hits, sampleSize: historicalPerformance.sampleSize }) })] : []),
    ]);
    const marketExplainer = Object.freeze({
      currentLine: selection.line,
      openingLine: movement.opening?.lineDisplay || "Unavailable",
      bestPrice: priceComparison.best,
      movement,
      researchQuality: edgeTrust.researchQuality,
      marketTrust: edgeTrust,
      historicalContext: historicalPerformance,
      currentStory,
      counterarguments: freeze(reasonsAgainst),
      supportingEvidence,
      explanation: movement.causeDisclosure,
    });
    const model = {
      schemaVersion: MARKET_RESEARCH_SCHEMA_VERSION, type: "market_research",
      id: marketResearchId(market.id, selection.id), marketId: market.id, selectionId: selection.id,
      canonicalMarketId: market.canonicalMarketId, providerMarketId: market.providerMarketId,
      sportId: league?.sportId || "", leagueId: market.leagueId, leagueName: league?.leagueDisplayName || market.leagueId.toUpperCase(),
      entity, event, status: statusFor(market, selection), marketName: market.displayName, participantName: selection.name,
      marketType: market.marketType, marketCategory: market.category, filterGroup: market.filterGroup,
      participantType: selection.participant?.participantType || "", teamId: selection.teamId || "", opponentId: selection.opponent || "",
      currentLine: selection.line, numericLine: selection.numericLine, side: selection.side, currentOdds: selection.odds,
      period: market.period, settlementScope: market.settlementScope, sportsbook: selection.sportsbook,
      lastUpdatedAt: selection.lastUpdatedAt, stale: selection.stale, sourceMode: selection.sourceMode || market.sourceMode,
      projection: selection.projection, projectedEdge: selection.trend, modelConfidence: selection.confidence,
      providerHistoricalLabel: selection.hitRate, dataQualityWarning: selection.dataQualityWarning,
      historicalPerformance, priceComparison, movement, researchChange, impact, marketExplainer, supportingEvidence,
      edgeTrust, marketTrust: edgeTrust, researchQuality: edgeTrust.researchQuality, currentStory,
      lineupStatus, injuryStatus, weatherStatus: clean(event?.race?.weather || event?.weather) || "Unavailable from provider",
      reasonsFor: freeze(reasonsFor), reasonsAgainst: freeze(reasonsAgainst),
      counterarguments: freeze([...reasonsAgainst]), stories: freeze(stories), insights: freeze(insights), relatedMarkets: freeze(relatedMarkets),
      source: Object.freeze({ provider: selection.source || market.source || selection.sportsbook, sportsbook: selection.sportsbook, mode: selection.sourceMode || market.sourceMode || "sample", sample: !["live_verified", "live_partial"].includes(selection.sourceMode || market.sourceMode), updatedAt: selection.lastUpdatedAt }),
      disclosures: freeze(["EdgeBoard is a research platform, not a sportsbook.", "Research Quality is source trust, not win probability.", movement.causeDisclosure, priceComparison.disclosure]),
    };
    model.score = deterministicScore(model);
    const validation = validateModel(model);
    const result = Object.freeze(validation.valid ? model : { ...model, status: "error", validationErrors: validation.errors });
    this.cache.set(key, result); return result;
  }

  getAll({ leagueIds = [], sportIds = [], availableOnly = false } = {}) {
    const acceptedLeagues = leagueIds.length ? leagueIds : this.sportsRepository.getLeagues().filter((league) => !sportIds.length || sportIds.includes(league.sportId)).map((league) => league.leagueId);
    return acceptedLeagues.flatMap((leagueId) => this.sportsRepository.getMarkets(leagueId).flatMap((market) => market.selections.map((selection) => this.buildModel(market, selection))))
      .filter((model) => !availableOnly || model.status === "available");
  }

  getBySelection(selectionId, leagueId = "") {
    const leagues = leagueId ? [leagueId] : this.sportsRepository.getLeagues().map((league) => league.leagueId);
    for (const id of leagues) {
      const market = this.sportsRepository.getMarketBySelectionId(selectionId);
      if (market?.leagueId === id) {
        const selection = market.selections.find((item) => item.id === selectionId);
        if (selection) return this.buildModel(market, selection);
      }
    }
    return null;
  }

  search(query, scope = {}, limit = 12) {
    const classification = classifyMarketExplainerQuery(query);
    const terms = clean(query).toLowerCase().split(/\W+/).filter((term) => term.length > 1);
    if (!terms.length) return freeze([]);
    return freeze(this.getAll(scope).map((model) => {
      const definition = getMarketDefinition(model.canonicalMarketId);
      const text = [model.marketName, model.marketType, model.marketCategory, model.filterGroup, model.participantName, model.currentLine, model.leagueName, definition?.browseGroup, ...(definition?.searchTerms || []), ...(definition?.providerAliases || [])].join(" ").toLowerCase();
      const textScore = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
      const intentScore = !classification.matched ? 0
        : classification.intent === "explain-movement" || classification.intent === "historical-movement" ? model.movement.observed ? 4 : 0
          : classification.intent === "compare-books" ? model.priceComparison.comparisonState === "multi-book" ? 4 : 0 : 2;
      return { model, matchScore: textScore + intentScore };
    }).filter((item) => item.matchScore > 0).sort((left, right) => right.matchScore - left.matchScore || right.model.score - left.model.score || left.model.id.localeCompare(right.model.id)).slice(0, limit).map((item) => item.model));
  }

  buildHub({ leagueIds = [], sportIds = [], currentDate = new Date(), savedItems = [], researchSessions = [] } = {}) {
    const all = this.getAll({ leagueIds, sportIds });
    const available = all.filter((item) => item.status === "available");
    const todayKey = localDateKey(currentDate);
    const today = available.filter((item) => item.event?.startsAt && localDateKey(item.event.startsAt) === todayKey);
    const ranked = [...available].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    const movement = available.filter((item) => item.movement.observed).sort((left, right) => Math.abs(right.movement.lineDelta || 0) - Math.abs(left.movement.lineDelta || 0) || left.id.localeCompare(right.id));
    const changed = movement.filter((item) => item.movement.timeline.length > 1);
    const bestPrice = available.filter((item) => item.priceComparison.best).sort((left, right) => Number(right.priceComparison.best.odds) - Number(left.priceComparison.best.odds) || left.id.localeCompare(right.id));
    const lineups = available.filter((item) => /^confirmed/i.test(item.lineupStatus));
    const injuries = available.filter((item) => /^confirmed/i.test(item.injuryStatus));
    const milestones = available.filter((item) => item.insights.some((insight) => /milestone/i.test(`${insight.category} ${insight.ruleId}`)));
    const history = ranked.filter((item) => item.historicalPerformance.sampleSize > 0);
    const saved = savedItems.filter((item) => (item.canonicalReferences?.marketIds || []).length);
    const sections = new Map([
      ["today", today], ["trending", ranked], ["movement", movement], ["best-price", bestPrice], ["lineups", lineups],
      ["injuries", injuries], ["quality", [...available].sort((a, b) => b.researchQuality.score - a.researchQuality.score || a.id.localeCompare(b.id))],
      ["changed", changed], ["saved", saved], ["sessions", researchSessions], ["milestones", milestones], ["history", history],
    ]);
    return Object.freeze({
      status: "ready", scope: Object.freeze({ leagueIds: freeze(leagueIds), sportIds: freeze(sportIds) }), total: all.length,
      sections: freeze(MARKET_HUB_SECTIONS.map(([id, title]) => Object.freeze({ id, title, items: freeze((sections.get(id) || []).slice(0, MARKET_RESEARCH_LIMITS.hubSection)), emptyMessage: id === "lineups" ? "No provider-confirmed lineup changes are available." : id === "injuries" ? "No provider-confirmed injury changes are available." : id === "saved" ? "No market research is saved in this local workspace." : id === "sessions" ? "No current research session contains market evidence." : id === "milestones" ? "No supported market-related milestone is available." : "No verified market research matches this scope." }))),
      disclosure: "Trending means deterministic research relevance, not public popularity. Sample markets are not wagers or recommendations.",
    });
  }

  async getBySelectionAsync(selectionId, leagueId = "", { signal } = {}) {
    const sequence = ++this.requestSequence; await Promise.resolve();
    if (signal?.aborted || sequence !== this.requestSequence) throw new DOMException("Market research request superseded.", "AbortError");
    return this.getBySelection(selectionId, leagueId);
  }
}

export function createMarketResearchService(dependencies) { return new MarketResearchService(dependencies); }
export { marketResearchId, validateModel as validateMarketResearchModel };
