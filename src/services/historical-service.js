import {
  COMEBACK_THRESHOLDS, CONFIGURED_RIVALRIES, DYNASTY_CRITERIA, HISTORICAL_CLAIM_LANGUAGE,
  HISTORICAL_ITEM_TYPES, HISTORICAL_PAGE_SIZE, HISTORICAL_SCHEMA_VERSION, HISTORICAL_VALIDATION_STATES,
  SPORT_HISTORICAL_CATEGORIES, UPSET_BASELINES,
} from "../config/historical-config.js";
import { HISTORICAL_SOURCE, HISTORICAL_UPDATED_AT, MOCK_HISTORICAL_COVERAGE, MOCK_HISTORICAL_ITEMS } from "../data/mock-historical-fixtures.js";
import { isAthleteProfileType } from "../config/entity-types.js";
import { evaluateEdgeTrust } from "./edge-trust-service.js";

const clean = (value) => String(value ?? "").trim();
const unique = (values) => [...new Set((values || []).filter(Boolean))];
const freeze = (values) => Object.freeze([...(values || [])]);
const safeDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; };

export function historicalCoverageLabel(coverage) {
  if (!coverage) return "Historical coverage unavailable";
  if (coverage.validationStatus === "verified_complete") return `Complete for ${coverage.earliestSeason}–${coverage.latestCompleteSeason}`;
  if (coverage.eventCompleteness === "current-season-only") return "Current-season data only";
  if (coverage.earliestSeason) return `Available data begins in ${coverage.earliestSeason} · partial historical coverage`;
  return "Partial historical coverage";
}

export function validateHistoricalClaim(input = {}) {
  const status = HISTORICAL_VALIDATION_STATES.includes(input.validationStatus) ? input.validationStatus : "unknown";
  const language = HISTORICAL_CLAIM_LANGUAGE[status];
  const claim = clean(input.claim);
  const universal = input.allTimeRequested === true || /\b(all[- ]time|first ever|world record|league record|greatest)\b/i.test(claim);
  const recordClaim = /\brecord\b/i.test(claim);
  const providerAttribution = /\b(provider[- ]recognized|provider[- ]asserted|officially listed)\b/i.test(claim);
  const recordEligible = !recordClaim || status === "verified_complete" || (status === "provider_asserted" && providerAttribution);
  const eligible = !["incomplete", "unknown"].includes(status) && (!universal || status === "verified_complete") && recordEligible;
  return Object.freeze({
    eligible,
    validationStatus: status,
    label: language.label,
    allowedRecordWording: language.allowedRecord,
    preferredHighWording: language.high,
    warning: eligible ? "" : universal
      ? "EdgeBoard does not have enough verified historical coverage to answer this as an all-time question."
      : recordClaim ? "Record wording requires complete verification or explicit provider attribution."
      : "The historical claim does not have sufficient validation to render.",
  });
}

function normalizeCoverage(input, sportsRepository) {
  const league = sportsRepository.getLeague(input.leagueId);
  return Object.freeze({
    ...input,
    leagueName: league?.leagueDisplayName || input.leagueId.toUpperCase(),
    sportName: league?.sportDisplayName || input.sportId,
    label: historicalCoverageLabel(input),
    allTimeClaimsSupported: input.allTimeClaimsSupported === true && input.validationStatus === "verified_complete",
  });
}

function trustForHistorical(item, coverage) {
  const complete = item.validationStatus === "verified_complete";
  const asserted = item.validationStatus === "provider_asserted";
  const partial = ["partial_coverage", "incomplete", "unknown"].includes(item.validationStatus);
  return evaluateEdgeTrust({
    components: {
      historical: complete ? "verified" : asserted ? "conditional" : partial ? "partial" : "sample",
      agreement: asserted ? "conditional" : item.validationStatus === "corrected" ? "partial" : "verified",
      freshness: item.correction ? "fresh" : "sample",
      coverage: complete ? 1 : partial ? .35 : .62,
      identity: item.identityResolved ? "verified" : "pending",
      completeness: complete ? 1 : coverage?.eventCompleteness === "current-season-only" ? .45 : .62,
    },
    applicable: ["historical", "agreement", "freshness", "coverage", "identity", "completeness"],
    sample: item.sample !== false,
    lastValidation: item.correction?.correctedAt || item.freshness.lastUpdated,
  });
}

export function createHistoricalItem(input, { entityRegistry, sportsRepository, coverage } = {}) {
  const entityIds = unique([...(input.entityIds || []), ...(input.teamIds || [])]);
  const resolvedEntities = entityIds.map((id) => entityRegistry.getEntity(id)).filter(Boolean);
  const itemCoverage = coverage || null;
  const item = {
    id: clean(input.id), schemaVersion: HISTORICAL_SCHEMA_VERSION,
    type: HISTORICAL_ITEM_TYPES.includes(input.type) ? input.type : "historical_story",
    sportId: clean(input.sportId), leagueId: clean(input.leagueId), competitionId: input.competitionId || null,
    season: clean(input.season), entityIds: freeze(entityIds), teamIds: freeze(unique(input.teamIds)),
    eventIds: freeze(unique(input.eventIds)), statIds: freeze(unique(input.statIds)), title: clean(input.title),
    titleData: Object.freeze({ ...(input.titleData || {}) }), scope: Object.freeze({ ...(input.scope || {}) }),
    validationStatus: HISTORICAL_VALIDATION_STATES.includes(input.validationStatus) ? input.validationStatus : "unknown",
    coverage: itemCoverage, supportingEvidence: freeze(input.supportingEvidence), sources: freeze(input.sources?.length ? input.sources : [HISTORICAL_SOURCE]),
    freshness: Object.freeze({ state: input.freshness?.state || "unknown", lastUpdated: input.freshness?.lastUpdated || null }),
    warnings: freeze(unique(input.warnings)), correction: input.correction ? Object.freeze({ ...input.correction }) : null,
    metadata: Object.freeze({ ...(input.metadata || {}) }), sample: input.sample !== false,
    identityResolved: entityIds.length === resolvedEntities.length, resolvedEntities: freeze(resolvedEntities),
  };
  item.edgeTrust = trustForHistorical(item, itemCoverage);
  item.researchQuality = item.edgeTrust.researchQuality;
  return Object.freeze(item);
}

export function validateHistoricalItem(item, sportsRepository) {
  const errors = [];
  if (!item.id || !item.title || !HISTORICAL_ITEM_TYPES.includes(item.type)) errors.push("Canonical historical identity is required.");
  if (!sportsRepository.getLeague(item.leagueId) || sportsRepository.getLeague(item.leagueId)?.sportId !== item.sportId) errors.push("Canonical sport and league scope are invalid.");
  if (!item.identityResolved) errors.push("A canonical entity reference did not resolve.");
  if (!item.sources.length || !item.supportingEvidence.length) errors.push("Source attribution and supporting evidence are required.");
  if (!item.coverage) errors.push("Historical coverage metadata is required.");
  if (item.eventIds.some((eventId) => !item.supportingEvidence.some((evidence) => evidence.eventId === eventId))) errors.push("Every historical event reference requires matching supporting evidence.");
  if (item.eventIds.some((eventId) => !item.supportingEvidence.some((evidence) => evidence.eventId === eventId && evidence.status === "completed"))) errors.push("Historical event claims require completed supporting evidence.");
  const claim = validateHistoricalClaim({ validationStatus: item.validationStatus, claim: item.title });
  if (!claim.eligible) errors.push(claim.warning);
  if (item.validationStatus === "verified_complete" && /\brecord\b/i.test(item.title)
    && !(item.scope.dateStart && item.scope.dateEnd)) errors.push("Verified record wording requires an explicitly bounded complete scope.");
  return Object.freeze({ valid: errors.length === 0, errors: freeze(errors), claim });
}

function routeFor(item) { return `/history/items/${encodeURIComponent(item.id)}`; }

export class HistoricalExplorerService {
  constructor({ sportsRepository, statsRepository, entityRegistry, items = MOCK_HISTORICAL_ITEMS, coverage = MOCK_HISTORICAL_COVERAGE } = {}) {
    if (!sportsRepository || !statsRepository || !entityRegistry) throw new TypeError("Historical Explorer requires canonical sports, statistics, and entity repositories.");
    this.sportsRepository = sportsRepository; this.statsRepository = statsRepository; this.entityRegistry = entityRegistry;
    this.coverage = new Map(coverage.map((entry) => [entry.leagueId, normalizeCoverage(entry, sportsRepository)]));
    this.items = items.map((entry) => createHistoricalItem(entry, { entityRegistry, sportsRepository, coverage: this.coverage.get(entry.leagueId) }))
      .filter((entry) => validateHistoricalItem(entry, sportsRepository).valid);
    this.index = new Map(this.items.map((entry) => [entry.id, entry]));
    this.cache = new Map(); this.requestSequence = 0; this.providerCalls = 0;
  }

  getHistoricalCoverage({ sportId = "", leagueId = "" } = {}) {
    if (leagueId) return this.coverage.get(leagueId) || Object.freeze({ sportId: sportId || this.sportsRepository.getLeague(leagueId)?.sportId || "", leagueId, leagueName: this.sportsRepository.getLeague(leagueId)?.leagueDisplayName || leagueId, earliestSeason: null, latestCompleteSeason: null, eventCompleteness: "unavailable", athleteCoverage: "unavailable", teamCoverage: "unavailable", standingsCoverage: "unavailable", playoffCoverage: "unavailable", championshipCoverage: "unavailable", playByPlayAvailability: "unavailable", spatialDataAvailability: "unavailable", missingSeasons: freeze([]), providerLimitations: freeze(["No normalized historical provider coverage is configured for this league."]), validationStatus: "unknown", allTimeClaimsSupported: false, dataMode: "sample", source: HISTORICAL_SOURCE, lastSuccessfulUpdate: null, label: "Historical coverage unavailable" });
    return freeze([...this.coverage.values()].filter((entry) => !sportId || entry.sportId === sportId));
  }

  searchHistoricalItems(filters = {}) {
    const key = JSON.stringify({ ...filters, entityIds: [...(filters.entityIds || [])].sort() });
    if (this.cache.has(key)) return this.cache.get(key);
    this.providerCalls += 1;
    const query = clean(filters.query).toLowerCase();
    let values = this.items.filter((item) => (!filters.sportId || item.sportId === filters.sportId)
      && (!filters.leagueId || item.leagueId === filters.leagueId)
      && (!filters.type || item.type === filters.type)
      && (!filters.season || item.season === String(filters.season))
      && (!filters.validationStatus || item.validationStatus === filters.validationStatus)
      && (!(filters.entityIds || []).length || filters.entityIds.some((id) => item.entityIds.includes(id)))
      && (!query || [item.title, item.type, item.leagueId, ...item.resolvedEntities.map((entity) => entity.name)].some((value) => clean(value).toLowerCase().includes(query))));
    values = values.sort((left, right) => (right.titleData.value ?? -Infinity) - (left.titleData.value ?? -Infinity) || left.id.localeCompare(right.id));
    const page = Math.max(1, Number(filters.page) || 1); const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || HISTORICAL_PAGE_SIZE));
    const result = Object.freeze({ items: freeze(values.slice((page - 1) * pageSize, page * pageSize).map((item) => this.buildHistoricalViewModel(item))), total: values.length, page, pageSize, hasMore: page * pageSize < values.length });
    this.cache.set(key, result); return result;
  }

  getHistoricalExplorerSections(scope = {}) {
    const items = this.searchHistoricalItems({ ...scope, pageSize: 50 }).items;
    const select = (types) => items.filter((item) => types.includes(item.type));
    const sections = [
      ["performances", "Greatest Available Performances", select(["athlete_performance", "team_performance", "fighter_performance", "driver_performance"])],
      ["records", "Records and Dataset Highs", select(["record", "dataset_high"])],
      ["championships", "Championship History", select(["championship", "title_change"])],
      ["rivalries", "Configured Rivalries", items.filter((item) => item.type === "rivalry_event" && item.metadata.rivalryId && item.metadata.classification !== "direct_head_to_head")],
      ["head-to-head", "Direct Head-to-Head History", items.filter((item) => item.type === "rivalry_event" && (!item.metadata.rivalryId || item.metadata.classification === "direct_head_to_head"))],
      ["runs", "Dynasty and Dominant-Run Candidates", items.filter((item) => item.metadata.dynastyState)],
      ["comebacks", "Biggest Comebacks", select(["comeback"]).concat(items.filter((item) => item.type === "driver_performance" && item.titleData.startingPosition))],
      ["upsets", "Verified Upsets", select(["upset"])],
      ["streaks", "Longest Streaks", select(["streak"])],
      ["timelines", "Career Timelines", select(["career_event", "debut", "final_appearance"])],
      ["seasons", "Season Explorer", select(["season", "championship"])],
    ].filter(([, , values]) => values.length);
    return freeze(sections.map(([id, title, values]) => Object.freeze({ id, title, items: freeze(values) })));
  }

  getRecordResults(filters = {}) {
    const all = this.searchHistoricalItems({ ...filters, pageSize: 50 }).items.filter((item) => ["record", "dataset_high"].includes(item.type));
    const group = (status) => freeze(all.filter((item) => status.includes(item.validationStatus)));
    return Object.freeze({ verified: group(["verified_complete"]), providerAsserted: group(["provider_asserted"]), datasetHighs: group(["dataset_only", "corrected"]), candidates: group(["partial_coverage"]), unsupported: freeze(MOCK_HISTORICAL_ITEMS.filter((item) => item.validationStatus === "incomplete").map((item) => ({ id: item.id, title: item.title, warnings: item.warnings }))) });
  }

  getPerformanceRankings(filters = {}) {
    const direction = filters.sortDirection === "asc" ? 1 : -1;
    const values = this.searchHistoricalItems({ ...filters, pageSize: 50 }).items.filter((item) => ["athlete_performance", "team_performance", "fighter_performance", "driver_performance"].includes(item.type)
      && Number.isFinite(Number(item.titleData.value)) && item.metadata.qualificationStatus !== "unqualified");
    const cohorts = new Map();
    values.forEach((item) => {
      const cohortKey = [item.sportId, item.leagueId, item.statIds[0] || item.type, item.titleData.unit || "unitless"].join(":");
      if (!cohorts.has(cohortKey)) cohorts.set(cohortKey, []);
      cohorts.get(cohortKey).push(item);
    });
    return freeze([...cohorts.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([cohortKey, items]) => {
      const sorted = items.sort((left, right) => (Number(left.titleData.value) - Number(right.titleData.value)) * direction || left.id.localeCompare(right.id));
      let previousValue = null; let previousRank = 0;
      return sorted.map((item, index) => {
        const value = Number(item.titleData.value);
        const rank = previousValue !== null && value === previousValue ? previousRank : index + 1;
        previousValue = value; previousRank = rank;
        return Object.freeze({ ...item, rank, cohortKey,
          qualification: Object.freeze({ status: "qualified", rule: item.metadata.qualificationRule || "Provider-validated completed-event result" }),
          rankingMethod: `Raw validated statistic within ${cohortKey} (${filters.sortDirection === "asc" ? "lower" : "higher"} is better); equal values share a rank and canonical ID is the display tie-break`,
          components: freeze([{ id: "raw_value", label: "Raw source value", value }]),
        });
      });
    }));
  }

  getChampionshipHistory(filters = {}) { return this.searchHistoricalItems({ ...filters, pageSize: 50 }).items.filter((item) => ["championship", "title_change"].includes(item.type)); }
  getCompetitionHistory(filters = {}) { return this.getChampionshipHistory(filters); }

  getRivalryHistory(rivalryId) {
    const rivalry = CONFIGURED_RIVALRIES.find((entry) => entry.id === rivalryId);
    if (!rivalry) return Object.freeze({ status: "not-classified", message: "This matchup has historical meetings, but it is not currently classified as a documented rivalry.", events: freeze([]) });
    const participants = rivalry.participantIds.map((id) => this.entityRegistry.getEntity(id)).filter(Boolean);
    const events = this.items.filter((item) => item.metadata.rivalryId === rivalryId).sort((a, b) => (safeDate(a.supportingEvidence[0]?.occurredAt) || 0) - (safeDate(b.supportingEvidence[0]?.occurredAt) || 0));
    return Object.freeze({ status: "ready", ...rivalry, participants: freeze(participants), events: freeze(events.map((item) => this.buildHistoricalViewModel(item))), disclosure: rivalry.classification === "configured_rivalry" ? "Officially configured sample rivalry" : rivalry.label });
  }

  getDynastyCandidates(filters = {}) { return freeze(this.searchHistoricalItems({ ...filters, pageSize: 50 }).items.filter((item) => item.metadata.dynastyState
    && Number(item.titleData.championships) >= DYNASTY_CRITERIA.minimumTitles
    && Number(item.titleData.windowSeasons) <= DYNASTY_CRITERIA.windowSeasons
    && item.metadata.criteriaMet === true).map((item) => Object.freeze({ ...item, state: "candidate based on configurable criteria", criteria: DYNASTY_CRITERIA }))); }
  getComebackResults(filters = {}) { return freeze(this.searchHistoricalItems({ ...filters, pageSize: 50 }).items.filter((item) => {
    const completedEvidence = item.supportingEvidence.some((evidence) => evidence.status === "completed");
    if (!completedEvidence) return false;
    if (item.type === "driver_performance") return Number(item.titleData.startingPosition) - Number(item.titleData.finishingPosition) >= (COMEBACK_THRESHOLDS.motorsport || 10);
    if (item.type !== "comeback") return false;
    const threshold = COMEBACK_THRESHOLDS[item.sportId];
    return Number.isFinite(Number(threshold)) && Number(item.titleData.deficit) >= threshold;
  })); }
  getUpsetResults(filters = {}) { return freeze(this.searchHistoricalItems({ ...filters, pageSize: 50 }).items.filter((item) => {
    if (item.type !== "upset" || !UPSET_BASELINES.includes(item.metadata.baselineType)) return false;
    const evidence = item.supportingEvidence.find((entry) => entry.status === "completed");
    if (!evidence) return false;
    const values = evidence.values || {};
    if (item.metadata.baselineType === "seed") return Number.isFinite(Number(values.winnerSeed)) && Number.isFinite(Number(values.opponentSeed));
    if (item.metadata.baselineType === "pre_event_odds") return Number.isFinite(Number(values.preEventOdds));
    return Number.isFinite(Number(values.winnerRanking ?? values.winnerStanding)) && Number.isFinite(Number(values.opponentRanking ?? values.opponentStanding));
  })); }

  getEntityTimeline(entityId) {
    const events = this.items.filter((item) => item.entityIds.includes(entityId)).flatMap((item) => item.supportingEvidence.map((evidence) => ({ id: `${item.id}-${evidence.id}`, date: evidence.occurredAt, type: item.type, title: item.title, itemId: item.id, eventId: evidence.eventId, sourceId: evidence.sourceId, validationStatus: item.validationStatus, correction: item.correction })))
      .sort((left, right) => (safeDate(left.date) || 0) - (safeDate(right.date) || 0) || left.id.localeCompare(right.id));
    return Object.freeze({ entity: this.entityRegistry.getEntity(entityId), events: freeze(events), source: HISTORICAL_SOURCE, sample: true });
  }
  getCareerTimeline(entityId) { return this.getEntityTimeline(entityId); }

  getSeasonSummary(sportId, leagueId, season) {
    const rows = this.statsRepository.rows.filter((row) => row.sport_id === sportId && row.league_id === leagueId && String(row.season) === String(season) && row.status === "completed");
    const items = this.searchHistoricalItems({ sportId, leagueId, season, pageSize: 50 }).items;
    return Object.freeze({ sportId, leagueId, season: String(season), completedEvents: new Set(rows.map((row) => row.event_id)).size, participantCount: new Set(rows.map((row) => row.entity_id)).size, items: freeze(items), coverage: this.getHistoricalCoverage({ sportId, leagueId }), standings: freeze([]), standingsMessage: "Historical standings are unavailable from the configured sample provider.", source: HISTORICAL_SOURCE });
  }

  compareSeasons(sportId, leagueId, seasons) {
    const summaries = seasons.map((season) => this.getSeasonSummary(sportId, leagueId, season));
    const warnings = ["Rule differences are unavailable from the configured sample provider.", "Stat-definition changes are unavailable; only matching canonical stat definitions may be compared.", "Raw counts are shown. No era adjustment is applied."];
    if (summaries.some((summary) => summary.completedEvents === 0)) warnings.unshift("At least one season lacks completed rows; direct comparison is limited.");
    return Object.freeze({ summaries: freeze(summaries), compatible: summaries.every((summary) => summary.completedEvents > 0), ruleComparisonStatus: "unavailable", statDefinitionComparisonStatus: "canonical-matches-only", eraAdjustment: null, warnings: freeze(warnings), method: "Completed event and participant counts using matching canonical stat definitions only; no undocumented normalization." });
  }

  getHistoricalLeaderboard(statId, filters = {}) { return this.statsRepository.getPlayerLeaderboard(statId, { ...filters, resultLimit: filters.limit || 10 }); }

  buildHistoricalViewModel(item) {
    const claim = validateHistoricalClaim({ validationStatus: item.validationStatus, claim: item.title });
    const primary = item.resolvedEntities[0] || null;
    return Object.freeze({
      id: item.id, type: item.type, title: item.title, sportId: item.sportId, leagueId: item.leagueId, season: item.season,
      sportName: item.coverage?.sportName || item.sportId, leagueName: item.coverage?.leagueName || item.leagueId.toUpperCase(),
      entityIds: item.entityIds, eventIds: item.eventIds, statIds: item.statIds, titleData: item.titleData,
      validationStatus: item.validationStatus, validationLabel: claim.label, coverage: item.coverage, coverageLabel: historicalCoverageLabel(item.coverage),
      supportingEvidence: item.supportingEvidence, sources: item.sources, freshness: item.freshness, warnings: item.warnings,
      correction: item.correction, metadata: item.metadata, edgeTrust: item.edgeTrust, researchQuality: item.researchQuality,
      dynastyCriteria: item.metadata.dynastyState ? DYNASTY_CRITERIA : null,
      primaryEntity: primary, route: routeFor(item), sample: item.sample,
      actions: freeze([
        primary ? { type: "entity", label: "Open entity", entityId: primary.id, profileSystem: isAthleteProfileType(primary.type) ? "athlete" : "entity" } : null,
        item.eventIds[0] ? { type: "event", label: "Open supporting event", eventId: item.eventIds[0] } : null,
        { type: "visualize", label: "Visualize evidence", visualizationType: "timeline", itemId: item.id },
        { type: "research", label: "Ask Edge Intelligence", query: `Explain why ${item.title.toLowerCase()} was notable within ${historicalCoverageLabel(item.coverage).toLowerCase()}.`, context: { historicalItemId: item.id, entityIds: item.entityIds, eventIds: item.eventIds, statIds: item.statIds, sportId: item.sportId, leagueId: item.leagueId, validationStatus: item.validationStatus, coverage: item.coverage, sources: item.sources, supportingEvidence: item.supportingEvidence } },
      ].filter(Boolean)),
    });
  }

  getRelatedHistoricalItems(reference, limit = 6) {
    const item = typeof reference === "string" ? this.index.get(reference) : reference;
    if (!item) return freeze([]);
    return freeze(this.items.filter((candidate) => candidate.id !== item.id && candidate.leagueId === item.leagueId && candidate.entityIds.some((id) => item.entityIds.includes(id))).slice(0, limit).map((candidate) => this.buildHistoricalViewModel(candidate)));
  }

  getHistoricalVisualizations(reference) {
    const item = typeof reference === "string" ? this.index.get(reference) : reference;
    if (!item) return freeze([]);
    return freeze([{ id: `historical-timeline-${item.id}`, type: "timeline", title: `${item.title} timeline`, lazy: true, accessibleSummary: `${item.supportingEvidence.length} supporting historical evidence item${item.supportingEvidence.length === 1 ? "" : "s"}, ordered by date.`, tableAlternative: item.supportingEvidence }]);
  }

  getItem(id) { return this.index.get(id) || null; }
  getCategories(sportId) { return SPORT_HISTORICAL_CATEGORIES[sportId] || freeze([]); }
  invalidateCorrection({ itemId, leagueId } = {}) {
    if (itemId) [...this.cache.entries()].filter(([, result]) => result.items.some((item) => item.id === itemId)).forEach(([key]) => this.cache.delete(key));
    else if (leagueId) [...this.cache.entries()].filter(([, result]) => result.items.some((item) => item.leagueId === leagueId)).forEach(([key]) => this.cache.delete(key));
  }
  async searchHistoricalItemsAsync(filters = {}, options = {}) { const sequence = ++this.requestSequence; await Promise.resolve(); if (options.signal?.aborted || sequence !== this.requestSequence) throw new DOMException("Historical request superseded.", "AbortError"); return this.searchHistoricalItems(filters); }
}

export function createHistoricalExplorerService(dependencies) { return new HistoricalExplorerService(dependencies); }
export { HISTORICAL_UPDATED_AT };
