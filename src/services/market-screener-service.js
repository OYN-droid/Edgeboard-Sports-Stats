import {
  MARKET_SCREENER_ARRAY_FILTERS,
  MARKET_SCREENER_BOOLEAN_FILTERS,
  MARKET_SCREENER_FILTER_KEYS,
  MARKET_SCREENER_GROUPS,
  MARKET_SCREENER_MAX_WINDOW_SIZE,
  MARKET_SCREENER_NUMERIC_FILTERS,
  MARKET_SCREENER_PRESETS,
  MARKET_SCREENER_SCHEMA_VERSION,
  MARKET_SCREENER_SCORE_WEIGHTS,
  MARKET_SCREENER_SORTS,
  MARKET_SCREENER_WINDOW_SIZE,
} from "../config/market-screener-config.js";

const freeze = (values) => Object.freeze([...(values || [])]);
const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLocaleLowerCase();
const unique = (values) => [...new Set((values || []).filter((value) => value !== null && value !== undefined && value !== ""))];
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const evaluationBucket = (value) => {
  const timestamp = new Date(value).getTime();
  return new Date(Math.floor((Number.isFinite(timestamp) ? timestamp : 0) / 60000) * 60000).toISOString();
};

function firstNumber(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const match = clean(value).replaceAll(",", "").match(/[+-]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function percentFromPerformance(performance, providerLabel = "") {
  if (Number.isFinite(performance?.rate)) return Number(performance.rate);
  const fraction = clean(providerLabel).match(/(\d+)\s+(?:of|\/)\s+(\d+)/i);
  if (fraction && Number(fraction[2]) > 0) return Math.round(Number(fraction[1]) / Number(fraction[2]) * 100);
  const percentage = clean(providerLabel).match(/(\d+(?:\.\d+)?)\s*%/);
  return percentage ? Number(percentage[1]) : null;
}

function detailPercentage(edgeTrust, id) {
  const detail = edgeTrust?.details?.find((item) => item.id === id);
  return Number.isFinite(detail?.percentage) ? detail.percentage : null;
}

function eventLabel(event) {
  return clean(event?.display?.title)
    || [event?.away, event?.home].filter((value) => value && value !== "TBD").join(" at ")
    || clean(event?.card?.event_name || event?.card?.name || event?.race?.event_name || event?.race?.name || event?.tournament?.name)
    || clean(event?.id)
    || "Event unavailable";
}

function competitionFor(model) {
  return clean(model.event?.soccer?.competition
    || model.event?.tournament?.competition
    || model.event?.tournament?.name
    || model.event?.race?.series
    || model.event?.card?.promotion
    || model.leagueName);
}

function participantRole(model) {
  const type = lower(model.participantType || model.entity?.type);
  if (model.event?.eventType === "combat-card" || ["fighter", "boxer"].includes(type)) return "fighter";
  if (model.event?.eventType === "motorsport" || type === "driver") return "driver";
  if (type === "team") return "team";
  return "player";
}

function homeAwayFor(model) {
  const target = lower(model.teamId || model.entity?.teamId);
  if (!target) return "unknown";
  const participant = (model.event?.participants || []).find((item) => [lower(item.id), lower(item.shortName), lower(item.name)].includes(target));
  return ["home", "away"].includes(participant?.role) ? participant.role : "unknown";
}

function weightClassFor(model) {
  const card = model.event?.card;
  const fights = [card?.main_event, card?.co_main_event, ...(card?.undercard || [])].filter(Boolean);
  const participant = lower(model.participantName);
  const fight = fights.find((item) => lower(item.fighter_a?.name) === participant || lower(item.fighter_b?.name) === participant) || fights[0];
  return clean(fight?.weight_class);
}

function currentInsight(model, expression) {
  return (model.insights || []).find((item) => expression.test(`${item.type || ""} ${item.category || ""} ${item.ruleId || ""} ${item.title || ""}`)) || null;
}

function normalizeArray(values) {
  const input = Array.isArray(values) ? values : clean(values) ? clean(values).split(",") : [];
  return freeze(unique(input.map((value) => clean(value).slice(0, 180)).filter(Boolean)));
}

export function normalizeScreenerFilters(input = {}) {
  const filters = {};
  MARKET_SCREENER_FILTER_KEYS.forEach((key) => {
    if (MARKET_SCREENER_ARRAY_FILTERS.includes(key)) {
      const values = normalizeArray(input[key]);
      if (values.length) filters[key] = values;
    } else if (MARKET_SCREENER_NUMERIC_FILTERS.includes(key)) {
      const value = finite(input[key]);
      if (value !== null) filters[key] = value;
    } else if (MARKET_SCREENER_BOOLEAN_FILTERS.includes(key) && input[key] === true) {
      filters[key] = true;
    }
  });
  return Object.freeze(filters);
}

export function serializeScreenerFilters(filters = {}) {
  return JSON.stringify(normalizeScreenerFilters(filters), Object.keys(normalizeScreenerFilters(filters)).sort());
}

export function parseScreenerFilters(value = "") {
  try {
    if (!value || String(value).length > 5000) return Object.freeze({});
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? normalizeScreenerFilters(parsed) : Object.freeze({});
  } catch {
    return Object.freeze({});
  }
}

export function buildScreenerRecord(model, currentDate = new Date()) {
  const currentLine = finite(model.numericLine);
  const openingLine = finite(model.movement?.opening?.line);
  const projection = finite(model.researchChange?.current?.projection) ?? firstNumber(model.projection);
  const projectedEdge = firstNumber(model.projectedEdge);
  const historicalHitRate = percentFromPerformance(model.historicalPerformance, model.providerHistoricalLabel);
  const researchCompleteness = detailPercentage(model.edgeTrust, "completeness");
  const providerAgreement = model.priceComparison?.providerAgreement?.status || "insufficient";
  const startsAt = model.event?.startsAt || null;
  const startsTime = startsAt ? new Date(startsAt).getTime() : NaN;
  const role = participantRole(model);
  const milestone = currentInsight(model, /milestone/i);
  const streak = currentInsight(model, /streak|consecutive|in.a.row/i);
  const recentTrend = currentInsight(model, /recent|trend|form/i);
  const track = model.event?.eventType === "motorsport" ? clean(model.event?.race?.circuit) : "";
  const surface = clean(model.event?.venue?.surface || model.event?.tournament?.surface);
  const researchQuality = finite(model.researchQuality?.score) ?? 0;
  const marketTrustScore = finite(model.marketTrust?.researchQuality?.score) ?? researchQuality;
  const evidenceCount = (model.supportingEvidence || []).length;
  const coverage = finite(model.historicalPerformance?.sampleSize) ?? 0;
  const freshness = model.stale ? "stale" : model.lastUpdatedAt ? "fresh" : "unavailable";
  const agreementScore = providerAgreement === "aligned" ? 1 : providerAgreement === "disagreement" ? 0 : .35;
  const weights = MARKET_SCREENER_SCORE_WEIGHTS;
  const opportunityScore = Number((
    researchQuality / 100 * weights.researchQuality
    + marketTrustScore / 100 * weights.marketTrust
    + Math.min(evidenceCount / 8, 1) * weights.evidence
    + Math.min(coverage / 10, 1) * weights.historicalCoverage
    + (freshness === "fresh" ? 1 : freshness === "stale" ? .2 : 0) * weights.freshness
    + agreementScore * weights.providerAgreement
    + (model.currentStory || milestone || streak ? 1 : 0) * weights.currentContext
  ).toFixed(4));
  const record = {
    schemaVersion: MARKET_SCREENER_SCHEMA_VERSION,
    id: `market-screener:${model.selectionId}`,
    type: "market_screener_result",
    model,
    marketResearchId: model.id,
    marketId: model.marketId,
    selectionId: model.selectionId,
    canonicalMarketId: model.canonicalMarketId,
    marketType: model.canonicalMarketId || model.marketType,
    marketName: model.marketName,
    sportId: model.sportId,
    leagueId: model.leagueId,
    leagueName: model.leagueName,
    competition: competitionFor(model),
    gameId: model.event?.id || "",
    gameLabel: eventLabel(model.event),
    entityId: model.entity?.id || "",
    participantName: model.participantName,
    participantRole: role,
    playerId: role === "player" ? model.entity?.id || model.participantName : "",
    teamId: model.teamId || (role === "team" ? model.entity?.id : ""),
    fighterId: role === "fighter" ? model.entity?.id || model.participantName : "",
    driverId: role === "driver" ? model.entity?.id || model.participantName : "",
    opponentId: model.opponentId || "",
    homeAway: homeAwayFor(model),
    position: clean(model.entity?.position || model.position),
    weightClass: weightClassFor(model),
    track,
    surface,
    sportsbook: model.sportsbook,
    provider: model.source?.provider || "Provider unavailable",
    currentLine,
    currentLineDisplay: model.currentLine,
    openingLine,
    openingLineDisplay: model.movement?.opening?.lineDisplay || "Unavailable",
    movement: finite(model.movement?.lineDelta),
    movementMagnitude: Math.abs(finite(model.movement?.lineDelta) ?? 0),
    priceMovement: finite(model.movement?.oddsDelta),
    priceMovementMagnitude: Math.abs(finite(model.movement?.oddsDelta) ?? 0),
    movementObserved: Boolean(model.movement?.observed),
    movementVerified: Boolean(model.movement?.observed && model.movement?.timeline?.length && model.movement.timeline.every((item) => item.verification === "verified")),
    odds: finite(model.currentOdds),
    researchQuality,
    researchQualityLabel: model.researchQuality?.label || "Unavailable",
    marketTrustScore,
    marketTrustLabel: model.marketTrust?.researchQuality?.label || "Unavailable",
    historicalCoverage: coverage,
    historicalHitRate,
    historicalTrend: model.historicalPerformance?.message || model.providerHistoricalLabel || "Unavailable",
    projection,
    projectionDisplay: model.projection || "Unavailable",
    projectedEdge,
    edgeDisplay: model.projectedEdge || "Unavailable",
    confidence: finite(model.modelConfidence),
    researchCompleteness,
    providerAgreement,
    providerCount: model.priceComparison?.providerAgreement?.providerCount || 0,
    freshness,
    lastUpdatedAt: model.lastUpdatedAt,
    startsAt,
    upcoming: Number.isFinite(startsTime) && startsTime >= new Date(currentDate).getTime(),
    lineupConfirmed: /^confirmed/i.test(model.lineupState || model.lineupStatus),
    starterConfirmed: /^confirmed/i.test(model.starterStatus) && /pitcher/i.test(`${model.marketName} ${model.canonicalMarketId}`),
    rosterActive: model.rosterStatus === "active",
    contextFresh: model.contextFreshness === "fresh",
    contextConflict: model.contextConflict === true,
    contextReviewRequired: model.contextReviewRequired === true,
    eventStatus: model.eventStatus || model.event?.status || "unknown",
    trackingState: model.trackingState || "pregame",
    pregameContextCurrent: model.pregameContextCurrent !== false,
    injuryUncertain: /unavailable|pending|unknown|probable|questionable|doubtful/i.test(model.availabilityState || model.injuryStatus || "unavailable"),
    currentStory: model.currentStory || null,
    currentStreak: streak,
    currentMilestone: milestone,
    recentTrend,
    relatedVisualization: model.entity ? Object.freeze({ type: "market_line_chart", entityId: model.entity.id, label: "Market and historical trend" }) : null,
    counterarguments: freeze(model.counterarguments || []),
    evidenceCount,
    conflictCount: model.edgeTrust?.conflicts?.length || 0,
    opportunityScore,
    sourceMode: model.source?.mode || model.sourceMode || "sample",
    certificationState: model.certification?.state || "unknown",
    certificationLabel: model.certification?.publicLabel || "Unavailable",
    liveMarketEligible: model.certification?.liveEligible === true && model.source?.liveEligible === true,
    certifiedLive: model.certification?.certified === true && model.source?.certified === true,
    sample: model.source?.sample !== false,
    valid: model.status !== "error" && Boolean(model.selectionId && model.marketId && model.source?.provider),
  };
  return Object.freeze(record);
}

function includesAny(value, accepted) {
  if (!accepted?.length) return true;
  const text = lower(value);
  return accepted.some((item) => text === lower(item) || text.includes(lower(item)));
}

function within(value, minimum, maximum) {
  if (minimum === undefined && maximum === undefined) return true;
  if (!Number.isFinite(value)) return false;
  return (minimum === undefined || value >= minimum) && (maximum === undefined || value <= maximum);
}

export function recordMatchesScreenerFilters(record, input = {}) {
  const filters = normalizeScreenerFilters(input);
  if (!record?.valid) return false;
  const arrays = [
    ["sportIds", record.sportId], ["leagueIds", record.leagueId], ["competitions", record.competition],
    ["gameIds", `${record.gameId} ${record.gameLabel}`], ["playerIds", record.playerId || (record.participantRole === "player" ? record.participantName : "")],
    ["teamIds", record.teamId], ["fighterIds", record.fighterId || (record.participantRole === "fighter" ? record.participantName : "")],
    ["driverIds", record.driverId || (record.participantRole === "driver" ? record.participantName : "")],
    ["marketTypes", `${record.marketType} ${record.marketName}`], ["sportsbooks", record.sportsbook],
    ["providers", record.provider], ["freshness", record.freshness], ["homeAway", record.homeAway],
    ["opponentIds", record.opponentId], ["positions", record.position], ["weightClasses", record.weightClass],
    ["tracks", record.track], ["surfaces", record.surface],
  ];
  if (arrays.some(([key, value]) => filters[key] && !includesAny(value, filters[key]))) return false;
  if (!within(record.currentLine, filters.currentLineMin, filters.currentLineMax)) return false;
  if (!within(record.openingLine, filters.openingLineMin, filters.openingLineMax)) return false;
  if (filters.movementMin !== undefined && (!Number.isFinite(record.movementMagnitude) || record.movementMagnitude < filters.movementMin)) return false;
  if (filters.priceMovementMin !== undefined && (!Number.isFinite(record.priceMovementMagnitude) || record.priceMovementMagnitude < filters.priceMovementMin)) return false;
  if (!within(record.odds, filters.oddsMin, filters.oddsMax)) return false;
  if (filters.researchQualityMin !== undefined && record.researchQuality < filters.researchQualityMin) return false;
  if (filters.edgeTrustMin !== undefined && record.marketTrustScore < filters.edgeTrustMin) return false;
  if (filters.historicalCoverageMin !== undefined && record.historicalCoverage < filters.historicalCoverageMin) return false;
  if (filters.historicalHitRateMin !== undefined && (!Number.isFinite(record.historicalHitRate) || record.historicalHitRate < filters.historicalHitRateMin)) return false;
  if (filters.projectionMin !== undefined && (!Number.isFinite(record.projection) || record.projection < filters.projectionMin)) return false;
  if (filters.edgeMin !== undefined && (!Number.isFinite(record.projectedEdge) || record.projectedEdge < filters.edgeMin)) return false;
  if (filters.confidenceMin !== undefined && (!Number.isFinite(record.confidence) || record.confidence < filters.confidenceMin)) return false;
  if (filters.researchCompletenessMin !== undefined && (!Number.isFinite(record.researchCompleteness) || record.researchCompleteness < filters.researchCompletenessMin)) return false;
  if (filters.projectionAboveLine) {
    if (!Number.isFinite(record.projection) || !Number.isFinite(record.currentLine)) return false;
    const side = lower(record.model?.side);
    if (side === "under" ? record.projection >= record.currentLine : record.projection <= record.currentLine) return false;
  }
  if (filters.upcomingOnly && !record.upcoming) return false;
  if (filters.freshOnly && record.freshness !== "fresh") return false;
  if (filters.confirmedLineupOnly && !record.lineupConfirmed) return false;
  if (filters.noInjuryUncertainty && record.injuryUncertain) return false;
  if (filters.currentStoriesOnly && !record.currentStory) return false;
  if (filters.milestoneOnly && !record.currentMilestone) return false;
  if (filters.streakOnly && !record.currentStreak) return false;
  if (filters.recentTrendOnly && !record.recentTrend) return false;
  if (filters.movementObservedOnly && !record.movementObserved) return false;
  if (filters.noProviderConflicts && (record.conflictCount > 0 || record.providerAgreement === "disagreement")) return false;
  if (filters.confirmedStarterOnly && !record.starterConfirmed) return false;
  if (filters.activeRosterOnly && !record.rosterActive) return false;
  if (filters.freshContextOnly && !record.contextFresh) return false;
  if (filters.noContextConflicts && record.contextConflict) return false;
  return true;
}

function sortRecords(records, sortBy) {
  const numeric = (selector, direction = -1) => (left, right) => direction * ((selector(left) ?? -Infinity) - (selector(right) ?? -Infinity)) || left.id.localeCompare(right.id);
  const comparators = {
    highest_research_quality: numeric((item) => item.researchQuality),
    strongest_evidence: numeric((item) => item.opportunityScore),
    largest_observed_movement: numeric((item) => item.movementObserved ? item.movementMagnitude : -1),
    highest_historical_support: numeric((item) => item.historicalHitRate ?? -1),
    event_time: (left, right) => (new Date(left.startsAt || "9999-12-31") - new Date(right.startsAt || "9999-12-31")) || left.id.localeCompare(right.id),
    participant: (left, right) => left.participantName.localeCompare(right.participantName) || left.id.localeCompare(right.id),
    current_line: numeric((item) => item.currentLine),
    odds: numeric((item) => item.odds),
  };
  return [...records].sort(comparators[sortBy] || comparators.highest_research_quality);
}

function groupValue(record, groupBy) {
  return ({ sport: record.sportId, league: record.leagueName, competition: record.competition, game: record.gameLabel, market_type: record.marketName, sportsbook: record.sportsbook, provider: record.provider })[groupBy] || "All results";
}

function facetsFor(records) {
  const facet = (key) => freeze(unique(records.map((item) => item[key]).filter(Boolean)).sort((a, b) => String(a).localeCompare(String(b))));
  return Object.freeze({
    sportIds: facet("sportId"), leagueIds: facet("leagueId"), competitions: facet("competition"),
    gameIds: facet("gameId"), marketTypes: facet("marketType"), sportsbooks: facet("sportsbook"),
    providers: facet("provider"), freshness: facet("freshness"), positions: facet("position"),
    weightClasses: facet("weightClass"), tracks: facet("track"), surfaces: facet("surface"),
  });
}

export function validateMarketScreenerResult(result) {
  const errors = [];
  if (!result || result.schemaVersion !== MARKET_SCREENER_SCHEMA_VERSION) errors.push("Screener schema is invalid.");
  if (!Array.isArray(result?.items) || !Number.isInteger(result?.total)) errors.push("Screener result window is invalid.");
  if (result?.items?.some((item) => !item.id || !item.marketResearchId || !item.model?.edgeTrust)) errors.push("A result lost canonical market or Edge Trust identity.");
  if (result?.items?.some((item) => item.researchQuality !== item.model.researchQuality.score)) errors.push("Research Quality must come from the canonical market model.");
  return Object.freeze({ valid: errors.length === 0, errors: freeze(errors) });
}

export class MarketScreenerService {
  constructor({ marketResearchService, clock = () => new Date() } = {}) {
    if (!marketResearchService) throw new TypeError("Market Screener requires the existing Market Research service.");
    this.marketResearchService = marketResearchService;
    this.clock = clock;
    this.cache = new Map();
    this.recordCache = new Map();
    this.requestSequence = 0;
  }

  clearCache() { this.cache.clear(); this.recordCache.clear(); }

  getRecords(scope = {}, currentDate = this.clock()) {
    const evaluationTime = evaluationBucket(currentDate);
    return freeze(this.marketResearchService.getAll(scope).map((model) => {
      const key = `${model.id}:${model.lastUpdatedAt || "none"}:${model.supportingEvidence?.length || 0}:${evaluationTime}`;
      if (!this.recordCache.has(key)) this.recordCache.set(key, buildScreenerRecord(model, currentDate));
      return this.recordCache.get(key);
    }).filter((item) => item.valid));
  }

  screen(input = {}, options = {}) {
    const filters = normalizeScreenerFilters(input);
    const sortBy = MARKET_SCREENER_SORTS.some((item) => item.id === options.sortBy) ? options.sortBy : "highest_research_quality";
    const groupBy = MARKET_SCREENER_GROUPS.some((item) => item.id === options.groupBy) ? options.groupBy : "none";
    const offset = clamp(Math.floor(finite(options.offset) ?? 0), 0, 100000);
    const limit = clamp(Math.floor(finite(options.limit) ?? MARKET_SCREENER_WINDOW_SIZE), 1, MARKET_SCREENER_MAX_WINDOW_SIZE);
    const currentDate = options.currentDate || this.clock();
    const scope = options.scope || {};
    const cacheKey = `${serializeScreenerFilters(filters)}|${sortBy}|${groupBy}|${offset}|${limit}|${JSON.stringify(scope)}|${evaluationBucket(currentDate)}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const candidates = this.getRecords(scope, currentDate);
    const matched = sortRecords(candidates.filter((record) => recordMatchesScreenerFilters(record, filters)), sortBy);
    const groups = groupBy === "none" ? [] : unique(matched.map((item) => groupValue(item, groupBy))).map((label) => Object.freeze({ label, count: matched.filter((item) => groupValue(item, groupBy) === label).length, itemIds: freeze(matched.filter((item) => groupValue(item, groupBy) === label).map((item) => item.id)) }));
    const result = {
      schemaVersion: MARKET_SCREENER_SCHEMA_VERSION,
      type: "market_screener",
      filters,
      sortBy,
      groupBy,
      total: matched.length,
      candidateCount: candidates.length,
      items: freeze(matched.slice(offset, offset + limit)),
      groups: freeze(groups),
      facets: facetsFor(candidates),
      window: Object.freeze({ offset, limit, rendered: Math.min(limit, Math.max(0, matched.length - offset)), hasMore: offset + limit < matched.length, virtualized: true }),
      generatedAt: new Date(currentDate).toISOString(),
      cached: false,
      disclosure: "Results identify research opportunities from normalized evidence. They are not betting recommendations, guarantees, locks, or instructions to wager.",
      explanation: Object.freeze({ appliedFilterCount: Object.keys(filters).length, ranking: MARKET_SCREENER_SORTS.find((item) => item.id === sortBy)?.label, candidateCount: candidates.length, matchedCount: matched.length, uncertainty: "Missing fields fail the relevant filter instead of being treated as favorable evidence." }),
    };
    const validation = validateMarketScreenerResult(result);
    const frozen = Object.freeze(validation.valid ? result : { ...result, type: "market_screener_error", errors: validation.errors });
    this.cache.set(cacheKey, frozen);
    return frozen;
  }

  async screenAsync(input = {}, options = {}) {
    const sequence = ++this.requestSequence;
    await Promise.resolve();
    if (options.signal?.aborted || sequence !== this.requestSequence) throw new DOMException("Market screener request superseded.", "AbortError");
    const result = this.screen(input, options);
    if (options.signal?.aborted || sequence !== this.requestSequence) throw new DOMException("Market screener request superseded.", "AbortError");
    return result;
  }

  compare(resultIds = [], scope = {}, currentDate = this.clock()) {
    const accepted = new Set(unique(resultIds).slice(0, 4));
    const items = this.getRecords(scope, currentDate).filter((item) => accepted.has(item.id));
    return Object.freeze({
      type: "market_screener_comparison",
      items,
      metrics: freeze(["researchQuality", "marketTrustScore", "historicalCoverage", "historicalHitRate", "projection", "projectedEdge", "confidence", "movementMagnitude"]),
      disclosure: "Values retain their original units and unavailable states. No overall winner or recommended wager is generated.",
    });
  }

  getPreset(id) { return MARKET_SCREENER_PRESETS.find((item) => item.id === id) || null; }
  getPresets() { return MARKET_SCREENER_PRESETS; }
}

export function createMarketScreenerService(dependencies) { return new MarketScreenerService(dependencies); }
