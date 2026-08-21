import {
  PARLAY_BOOLEAN_CONSTRAINTS, PARLAY_BUILDER_SCHEMA_VERSION, PARLAY_CONSTRAINT_DEFAULTS,
  PARLAY_MAX_LEGS, PARLAY_PRESETS, PARLAY_RESEARCH_PLAN,
} from "../config/parlay-builder-config.js";

const clean = (value) => String(value ?? "").trim();
const finite = (value) => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const unique = (values) => [...new Set((values || []).filter(Boolean))];
const freeze = (values) => Object.freeze([...(values || [])]);
const levelRank = Object.freeze({ low: 1, medium: 2, high: 3 });
const arrayValue = (value) => freeze(unique((Array.isArray(value) ? value : clean(value) ? clean(value).split(",") : []).map(clean).filter(Boolean)));

export function normalizeParlayConstraints(input = {}) {
  const normalized = {
    ...PARLAY_CONSTRAINT_DEFAULTS,
    sportIds: arrayValue(input.sportIds), leagueIds: arrayValue(input.leagueIds),
    marketTypes: arrayValue(input.marketTypes), sportsbooks: arrayValue(input.sportsbooks),
    minimumResearchQuality: Math.max(0, Math.min(100, finite(input.minimumResearchQuality) ?? 0)),
    minimumEdgeTrust: Math.max(0, Math.min(100, finite(input.minimumEdgeTrust) ?? 0)),
    minimumResearchCompleteness: Math.max(0, Math.min(100, finite(input.minimumResearchCompleteness) ?? 0)),
    maximumLegs: Math.max(1, Math.min(PARLAY_MAX_LEGS, Math.floor(finite(input.maximumLegs) ?? 4))),
    minimumOdds: finite(input.minimumOdds), maximumOdds: finite(input.maximumOdds),
    minimumLineMovement: Math.max(0, finite(input.minimumLineMovement) ?? 0),
    minimumPriceMovement: Math.max(0, finite(input.minimumPriceMovement) ?? 0),
    maximumResearchCorrelation: ["low", "medium", "high"].includes(input.maximumResearchCorrelation) ? input.maximumResearchCorrelation : "medium",
  };
  PARLAY_BOOLEAN_CONSTRAINTS.forEach((key) => { normalized[key] = Object.prototype.hasOwnProperty.call(input, key) ? input[key] === true : PARLAY_CONSTRAINT_DEFAULTS[key]; });
  return Object.freeze(normalized);
}

export function serializeParlayConstraints(input = {}) { return JSON.stringify(normalizeParlayConstraints(input)); }
export function parseParlayConstraints(value = "") {
  try { return value && String(value).length <= 5000 ? normalizeParlayConstraints(JSON.parse(value)) : normalizeParlayConstraints(); }
  catch { return normalizeParlayConstraints(); }
}

function contains(values, value) { return !values.length || values.some((item) => clean(value).toLowerCase().includes(item.toLowerCase())); }
function weatherConcern(record) { return /uncertain|warning|wind|rain|snow|storm|delay/i.test(clean(record?.model?.event?.weather?.status || record?.model?.event?.weather)); }
function liveCertified(record) { return record.sample === false && /live/i.test(clean(record.sourceMode)) && record.model?.source?.certified === true; }

export function recordMeetsParlayConstraints(record, input = {}) {
  const c = normalizeParlayConstraints(input);
  if (!record?.valid || (record.model?.status !== "available" && !(record.model?.status === "stale" && !c.freshDataOnly))) return false;
  if (/live/i.test(clean(record.sourceMode)) && !record.liveMarketEligible) return false;
  if (!contains(c.sportIds, record.sportId) || !contains(c.leagueIds, record.leagueId)) return false;
  if (!contains(c.marketTypes, `${record.marketType} ${record.marketName}`) || !contains(c.sportsbooks, record.sportsbook)) return false;
  if (record.researchQuality < c.minimumResearchQuality || record.marketTrustScore < c.minimumEdgeTrust) return false;
  if (c.minimumResearchCompleteness && (!Number.isFinite(record.researchCompleteness) || record.researchCompleteness < c.minimumResearchCompleteness)) return false;
  if (c.minimumOdds !== null && (!Number.isFinite(record.odds) || record.odds < c.minimumOdds)) return false;
  if (c.maximumOdds !== null && (!Number.isFinite(record.odds) || record.odds > c.maximumOdds)) return false;
  if (c.movementObservedOnly && !record.movementObserved) return false;
  if (c.minimumLineMovement && (!Number.isFinite(record.movementMagnitude) || record.movementMagnitude < c.minimumLineMovement)) return false;
  if (c.minimumPriceMovement && (!Number.isFinite(record.priceMovementMagnitude) || record.priceMovementMagnitude < c.minimumPriceMovement)) return false;
  if (c.freshDataOnly && record.freshness !== "fresh") return false;
  if (c.confirmedLineupsOnly && !record.lineupConfirmed) return false;
  if (c.noProviderConflicts && (record.conflictCount || record.providerAgreement === "disagreement")) return false;
  if (c.noInjuryUncertainty && record.injuryUncertain) return false;
  if (c.noWeatherConcerns && weatherConcern(record)) return false;
  if (c.confirmedStarterOnly && !record.starterConfirmed) return false;
  if (c.activeRosterOnly && !record.rosterActive) return false;
  if (c.freshContextOnly && !record.contextFresh) return false;
  if (c.noContextConflicts && record.contextConflict) return false;
  if (c.currentStoriesRequired && !record.currentStory) return false;
  if (c.historicalSupportRequired && record.historicalCoverage < 1) return false;
  if (c.visualizationAvailable && !record.relatedVisualization) return false;
  if (c.currentMilestone && !record.currentMilestone) return false;
  if (c.currentStreak && !record.currentStreak) return false;
  if (c.onlyLiveCertifiedData && !liveCertified(record)) return false;
  return true;
}

export function explainParlayExclusion(record, input = {}) {
  const c = normalizeParlayConstraints(input); const reasons = [];
  if (!record?.valid) reasons.push("Normalized market validation failed.");
  if (/live/i.test(clean(record?.sourceMode)) && !record?.liveMarketEligible) reasons.push("This market domain is not eligible for user-facing live use.");
  if (record?.model?.status !== "available" && !(record?.model?.status === "stale" && !c.freshDataOnly)) reasons.push(`Market is ${clean(record?.model?.status || "unavailable")}.`);
  if (!contains(c.sportIds, record?.sportId)) reasons.push("Sport is outside the selected scope.");
  if (!contains(c.leagueIds, record?.leagueId)) reasons.push("League is outside the selected scope.");
  if (!contains(c.marketTypes, `${record?.marketType} ${record?.marketName}`)) reasons.push("Market type is not selected.");
  if (!contains(c.sportsbooks, record?.sportsbook)) reasons.push("Sportsbook is not preferred.");
  if ((record?.researchQuality ?? 0) < c.minimumResearchQuality) reasons.push(`Research Quality ${record?.researchQuality ?? "unavailable"} is below ${c.minimumResearchQuality}.`);
  if ((record?.marketTrustScore ?? 0) < c.minimumEdgeTrust) reasons.push(`Edge Trust ${record?.marketTrustScore ?? "unavailable"} is below ${c.minimumEdgeTrust}.`);
  if (c.minimumResearchCompleteness && (!Number.isFinite(record?.researchCompleteness) || record.researchCompleteness < c.minimumResearchCompleteness)) reasons.push("Research completeness is unavailable or below the threshold.");
  if (c.freshDataOnly && record?.freshness !== "fresh") reasons.push("Fresh provider data is required.");
  if (c.confirmedLineupsOnly && !record?.lineupConfirmed) reasons.push("Lineup is not confirmed.");
  if (c.noProviderConflicts && (record?.conflictCount || record?.providerAgreement === "disagreement")) reasons.push("Provider disagreement is present.");
  if (c.noInjuryUncertainty && record?.injuryUncertain) reasons.push("Injury or participant-status uncertainty is present.");
  if (c.noWeatherConcerns && weatherConcern(record)) reasons.push("Weather uncertainty is present.");
  if (c.confirmedStarterOnly && !record?.starterConfirmed) reasons.push("A provider-confirmed starting pitcher is required.");
  if (c.activeRosterOnly && !record?.rosterActive) reasons.push("The participant is not on a provider-confirmed active roster.");
  if (c.freshContextOnly && !record?.contextFresh) reasons.push("Fresh lineup, availability, or weather context is required.");
  if (c.noContextConflicts && record?.contextConflict) reasons.push("Provider context conflict is present.");
  if (c.historicalSupportRequired && !record?.historicalCoverage) reasons.push("Completed historical support is unavailable.");
  if (c.currentStoriesRequired && !record?.currentStory) reasons.push("A current validated story is required.");
  if (c.visualizationAvailable && !record?.relatedVisualization) reasons.push("A supporting visualization is unavailable.");
  if (c.currentMilestone && !record?.currentMilestone) reasons.push("No current milestone is supported.");
  if (c.currentStreak && !record?.currentStreak) reasons.push("No current streak is supported.");
  if (c.onlyLiveCertifiedData && !liveCertified(record)) reasons.push("Live-certified provider data is required.");
  if (c.minimumOdds !== null && (!Number.isFinite(record?.odds) || record.odds < c.minimumOdds)) reasons.push("Current odds are below the selected range.");
  if (c.maximumOdds !== null && (!Number.isFinite(record?.odds) || record.odds > c.maximumOdds)) reasons.push("Current odds are above the selected range.");
  if (c.movementObservedOnly && !record?.movementObserved) reasons.push("A normalized observed market change is required.");
  if (c.minimumLineMovement && (record?.movementMagnitude ?? 0) < c.minimumLineMovement) reasons.push("Observed line movement is below the selected threshold.");
  if (c.minimumPriceMovement && (record?.priceMovementMagnitude ?? 0) < c.minimumPriceMovement) reasons.push("Observed price movement is below the selected threshold.");
  return freeze(unique(reasons));
}

function sharedReason(left, right) {
  const reasons = [];
  if (left.entityId && left.entityId === right.entityId) reasons.push(`Shared ${left.participantRole}`);
  if (left.teamId && left.teamId === right.teamId) reasons.push("Shared team");
  if (left.gameId && left.gameId === right.gameId) reasons.push(left.participantRole === "fighter" ? "Shared fight card" : left.participantRole === "driver" ? "Shared race" : "Shared game");
  if (left.opponentId && left.opponentId === right.opponentId) reasons.push("Shared opponent");
  const leftGroup = clean(left.model?.correlationGroup || left.model?.canonicalMarket?.correlationGroup);
  const rightGroup = clean(right.model?.correlationGroup || right.model?.canonicalMarket?.correlationGroup);
  if (leftGroup && leftGroup === rightGroup && left.gameId === right.gameId) reasons.push(`Shared ${leftGroup.replaceAll("-", " ")} driver`);
  const leftConstructor = clean(left.model?.entity?.constructorId || left.model?.entity?.manufacturerId);
  const rightConstructor = clean(right.model?.entity?.constructorId || right.model?.entity?.manufacturerId);
  if (leftConstructor && leftConstructor === rightConstructor) reasons.push("Shared constructor");
  if (weatherConcern(left) && left.gameId === right.gameId) reasons.push("Shared weather concern");
  return unique(reasons);
}

export function evaluateResearchCorrelation(records = []) {
  const relationships = [];
  for (let left = 0; left < records.length; left += 1) for (let right = left + 1; right < records.length; right += 1) {
    const reasons = sharedReason(records[left], records[right]);
    if (reasons.length) relationships.push(Object.freeze({ leftId: records[left].id, rightId: records[right].id, reasons: freeze(reasons), level: reasons.some((reason) => /game|fight|race|player/i.test(reason)) ? "high" : "medium" }));
  }
  const level = relationships.some((item) => item.level === "high") ? "high" : relationships.length ? "medium" : "low";
  return Object.freeze({ level, relationships: freeze(relationships), explanation: relationships.length ? relationships.flatMap((item) => item.reasons).join("; ") : "No supported shared entity, team, event, opponent, constructor, market driver, or weather relationship was found. Unobserved relationships remain possible." });
}

function legFromRecord(record) {
  const unknowns = [];
  if (!record.lineupConfirmed) unknowns.push("Lineup is not confirmed by supplied data.");
  if (record.injuryUncertain) unknowns.push("Participant availability contains uncertainty.");
  if (!Number.isFinite(record.researchCompleteness)) unknowns.push("Research completeness is unavailable.");
  if (!record.historicalCoverage) unknowns.push("No matching completed historical rows were supplied.");
  if (weatherConcern(record)) unknowns.push("Weather information contains a concern.");
  if (record.contextReviewRequired) unknowns.push("Provider context changed or conflicts; this locked leg requires explicit review.");
  if (record.certificationState === "limited_live") unknowns.push("This market domain is Limited Live; known coverage limitations remain.");
  if (["degraded", "suspended"].includes(record.certificationState)) unknowns.push(`This market domain is ${record.certificationState}; current refresh is not eligible.`);
  if (record.eventStatus && ["in_progress", "resumed", "delayed", "suspended", "final", "stale"].includes(record.eventStatus)) unknowns.push(`Event status is ${record.eventStatus.replaceAll("_", " ")}; the saved pregame price is not current.`);
  return Object.freeze({
    id: `parlay-leg:${record.selectionId}`, recordId: record.id, marketResearchId: record.marketResearchId,
    selectionId: record.selectionId, entityId: record.entityId, eventId: record.gameId,
    participantName: record.participantName, marketName: record.marketName, currentLine: record.currentLineDisplay,
    currentOdds: record.odds, bestAvailablePrice: record.model?.priceComparison?.best || null,
    sportsbook: record.sportsbook, researchQuality: record.researchQuality, edgeTrust: record.marketTrustScore,
    researchCompleteness: record.researchCompleteness, historicalCoverage: record.historicalCoverage,
    historicalPerformance: record.historicalTrend, supportingEvidence: freeze(record.model?.reasonsFor || []),
    counterarguments: freeze(record.counterarguments.length ? record.counterarguments : ["No additional counterargument is supported by supplied fields; missing evidence remains uncertain."]),
    currentUnknowns: freeze(unknowns), currentStory: record.currentStory, historicalStory: null,
    milestone: record.currentMilestone, streak: record.currentStreak, visualization: record.relatedVisualization,
    comparison: record.entityId ? Object.freeze({ entityId: record.entityId, label: "Compare with a supported peer using identical filters" }) : null,
    freshness: record.freshness, providerAgreement: record.providerAgreement, provider: record.provider,
    sourceMode: record.sourceMode, sample: record.sample, leagueId: record.leagueId, sportId: record.sportId,
    certificationState: record.certificationState, certificationLabel: record.certificationLabel,
    recentForm: record.recentTrend?.phrasing?.headline || record.recentTrend?.title || "Unavailable from supplied deterministic insights.",
    opponentMatchup: record.opponentId || "Opponent matchup unavailable.", homeAway: record.homeAway || "unknown",
    currentTrend: record.historicalTrend, lineupStatus: record.lineupConfirmed ? "confirmed" : "unconfirmed or unavailable",
    injuryStatus: record.injuryUncertain ? "uncertainty present" : "no uncertainty supplied",
    marketType: record.marketType,
    requiresReview: record.contextReviewRequired === true || record.contextConflict === true,
    eventStatus: record.eventStatus || "unknown", trackingState: record.trackingState || "pregame",
    pregameContextCurrent: record.pregameContextCurrent !== false,
    reviewReasons: freeze([
      ...(record.contextReviewRequired ? ["Availability, lineup, starter, roster, weather, or event context changed after this research selection was formed."] : []),
      ...(["in_progress", "resumed", "delayed", "suspended", "final", "stale"].includes(record.eventStatus) ? [`Game is ${record.eventStatus.replaceAll("_", " ")}; the saved pregame price remains an immutable research snapshot.`] : []),
    ]),
  });
}

function average(values) { const valid = values.filter(Number.isFinite); return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null; }
function portfolio(records, correlation) {
  const coverage = records.reduce((sum, item) => sum + item.historicalCoverage, 0);
  const decimals = records.map((item) => item.odds > 0 ? 1 + item.odds / 100 : item.odds < 0 ? 1 + 100 / Math.abs(item.odds) : null);
  const combinedDecimal = decimals.length && decimals.every(Number.isFinite) ? decimals.reduce((total, value) => total * value, 1) : null;
  const potentialReturnOdds = combinedDecimal === null ? null : Math.round(combinedDecimal >= 2 ? (combinedDecimal - 1) * 100 : -100 / (combinedDecimal - 1));
  return Object.freeze({
    researchQuality: average(records.map((item) => item.researchQuality)), edgeTrust: average(records.map((item) => item.marketTrustScore)),
    researchCompleteness: average(records.map((item) => item.researchCompleteness)), historicalCoverage: coverage,
    researchCorrelation: correlation.level, freshness: records.every((item) => item.freshness === "fresh") ? "fresh" : records.some((item) => item.freshness === "stale") ? "stale" : "partial",
    lineupStatus: records.every((item) => item.lineupConfirmed) ? "confirmed" : "mixed or unconfirmed",
    providerAgreement: records.some((item) => item.providerAgreement === "disagreement") ? "conflicting" : records.every((item) => item.providerAgreement === "aligned") ? "aligned" : "partial",
    sports: freeze(unique(records.map((item) => item.sportId))), marketTypes: freeze(unique(records.map((item) => item.marketType))),
    currentStoryCount: records.filter((item) => item.currentStory).length, currentStreakCount: records.filter((item) => item.currentStreak).length,
    counterargumentCount: records.reduce((sum, item) => sum + item.counterarguments.length, 0), visualizationCount: records.filter((item) => item.relatedVisualization).length,
    potentialReturnOdds,
  });
}

function deterministicOrder(left, right) { return right.opportunityScore - left.opportunityScore || right.researchQuality - left.researchQuality || left.id.localeCompare(right.id); }

function changeValue(previous, next, key, label, improvedWhen = "higher") {
  const oldValue = previous?.[key] ?? null; const newValue = next?.[key] ?? null;
  if (oldValue === newValue) return null;
  const delta = Number.isFinite(oldValue) && Number.isFinite(newValue) ? newValue - oldValue : null;
  return Object.freeze({ key, label, previous: oldValue, current: newValue, delta, improved: delta === null ? null : improvedWhen === "higher" ? delta > 0 : delta < 0 });
}

function explainLegChange(previous, next, correlationBefore, correlationAfter, reason) {
  return Object.freeze({
    id: `parlay-change:${previous?.selectionId || "none"}:${next?.selectionId || "none"}`,
    previousLeg: previous ? legFromRecord(previous) : null, newLeg: next ? legFromRecord(next) : null, reason,
    metrics: freeze([
      changeValue(previous, next, "researchQuality", "Research Quality"), changeValue(previous, next, "marketTrustScore", "Edge Trust"),
      changeValue(previous, next, "historicalCoverage", "Historical Support"),
      changeValue(previous, next, "freshness", "Provider Freshness"),
      Object.freeze({ key: "correlation", label: "Correlation", previous: correlationBefore, current: correlationAfter, delta: null, improved: levelRank[correlationAfter] < levelRank[correlationBefore] }),
      Object.freeze({ key: "weather", label: "Weather Concern", previous: weatherConcern(previous), current: weatherConcern(next), delta: null, improved: weatherConcern(previous) && !weatherConcern(next) }),
    ].filter(Boolean)),
  });
}

function resultFromRecords(records, { constraints, eligibleCount, excluded = [], generatedAt, lockedSelectionIds = [], changes = [], idSeed = "build" } = {}) {
  const correlation = evaluateResearchCorrelation(records); const summary = portfolio(records, correlation);
  return Object.freeze({
    schemaVersion: PARLAY_BUILDER_SCHEMA_VERSION, id: `parlay-research:${idSeed}:${records.map((item) => item.selectionId).join("|")}`,
    type: "parlay_research", constraints, researchPlan: PARLAY_RESEARCH_PLAN, eligibleCount,
    legs: freeze(records.map(legFromRecord)), lockedSelectionIds: freeze(lockedSelectionIds),
    excluded: freeze(excluded), changes: freeze(changes), portfolio: summary, correlation,
    generatedAt, sample: records.some((item) => item.sample),
    disclosure: "This is a deterministic research set, not a wager, prediction, or recommendation. Portfolio scores describe evidence quality and never win probability.",
    intelligenceSummary: freeze([`${records.length} market${records.length === 1 ? "" : "s"} satisfy the requested research constraints.`, summary.lineupStatus === "confirmed" ? "Confirmed lineups are available for every selected market." : "At least one lineup remains unconfirmed or unavailable.", summary.historicalCoverage ? `${summary.historicalCoverage} completed historical rows support the selected markets in total.` : "Historical support is unavailable for the selected markets.", summary.providerAgreement === "conflicting" ? "A provider conflict remains visible." : "No provider conflict was detected among selected records.", `Research correlation is ${summary.researchCorrelation}.`]),
  });
}

export class ParlayBuilderService {
  constructor({ marketScreenerService, clock = () => new Date() } = {}) { if (!marketScreenerService) throw new TypeError("Parlay Builder requires Market Screener."); this.marketScreenerService = marketScreenerService; this.clock = clock; this.cache = new Map(); this.sequence = 0; }
  getPresets() { return PARLAY_PRESETS; }
  build(input = {}, options = {}) {
    const constraints = normalizeParlayConstraints(input); const now = options.currentDate || this.clock();
    const lockedSelectionIds = unique(options.lockedSelectionIds || []);
    const key = `${serializeParlayConstraints(constraints)}|${JSON.stringify(options.scope || {})}|${lockedSelectionIds.sort().join(",")}|${new Date(now).toISOString().slice(0, 16)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const allRecords = this.marketScreenerService.getRecords(options.scope || {}, now);
    const eligible = allRecords.filter((item) => recordMeetsParlayConstraints(item, constraints)).sort(deterministicOrder);
    // Locked research is never silently removed when new context makes it ineligible.
    // It remains visible with exclusion/review reasons until the user explicitly replaces it.
    const locked = lockedSelectionIds.map((id) => allRecords.find((item) => item.selectionId === id)).filter(Boolean);
    const chosen = [...locked]; const excluded = [];
    for (const record of eligible) {
      if (chosen.some((item) => item.selectionId === record.selectionId)) continue;
      if (chosen.length >= constraints.maximumLegs) break;
      if (!constraints.allowSameGame && chosen.some((item) => item.gameId && item.gameId === record.gameId)) { excluded.push(Object.freeze({ record: legFromRecord(record), reasons: freeze(["Same-event legs are disabled by the current constraints."]) })); continue; }
      const trial = [...chosen, record]; const correlation = evaluateResearchCorrelation(trial);
      if (levelRank[correlation.level] > levelRank[constraints.maximumResearchCorrelation]) { excluded.push(Object.freeze({ record: legFromRecord(record), reasons: freeze([`Research correlation would be ${correlation.level}, above the ${constraints.maximumResearchCorrelation} limit.`, correlation.explanation]) })); continue; }
      chosen.push(record);
    }
    const chosenIds = new Set(chosen.map((item) => item.selectionId));
    allRecords.forEach((record) => {
      if (chosenIds.has(record.selectionId) || excluded.some((item) => item.record.selectionId === record.selectionId)) return;
      const reasons = explainParlayExclusion(record, constraints);
      excluded.push(Object.freeze({ record: legFromRecord(record), reasons: reasons.length ? reasons : freeze([chosen.length >= constraints.maximumLegs ? "Maximum leg count was reached; stronger evidence-ranked alternatives were selected first." : "Current story and supporting evidence ranked below selected alternatives."]) }));
    });
    locked.forEach((record) => {
      const reasons = [...explainParlayExclusion(record, constraints)];
      if (record.contextReviewRequired && !reasons.includes("Provider context changed; explicit review is required.")) reasons.push("Provider context changed; explicit review is required.");
      if (reasons.length) excluded.push(Object.freeze({ record: legFromRecord(record), reasons: freeze(reasons), locked: true, requiresReview: true }));
    });
    const result = resultFromRecords(chosen, { constraints, eligibleCount: eligible.length, excluded, generatedAt: new Date(now).toISOString(), lockedSelectionIds: locked.map((item) => item.selectionId), idSeed: key.length });
    this.cache.set(key, result); return result;
  }
  async buildAsync(input = {}, options = {}) { const sequence = ++this.sequence; await Promise.resolve(); if (options.signal?.aborted || sequence !== this.sequence) throw new DOMException("Parlay research superseded.", "AbortError"); const result = this.build(input, options); if (options.signal?.aborted || sequence !== this.sequence) throw new DOMException("Parlay research superseded.", "AbortError"); return result; }
  refine(result, action, options = {}) {
    const input = { ...(result?.constraints || {}) };
    if (action === "increase_quality") input.minimumResearchQuality = Math.min(100, (input.minimumResearchQuality || 0) + 10);
    if (action === "increase_trust") input.minimumEdgeTrust = Math.min(100, (input.minimumEdgeTrust || 0) + 10);
    if (action === "improve_history") input.historicalSupportRequired = true;
    if (action === "diversify_books") input.sportsbooks = [];
    if (["lower_correlation", "lower_risk"].includes(action)) input.maximumResearchCorrelation = "low";
    if (action === "confirmed_lineups") input.confirmedLineupsOnly = true;
    if (action === "different_games") input.allowSameGame = false;
    if (action === "mlb_only") input.leagueIds = ["mlb"];
    if (action === "wnba_only") input.leagueIds = ["wnba"];
    if (action === "ufc_only") input.leagueIds = ["ufc"];
    if (action === "remove_weather") input.noWeatherConcerns = true;
    if (action === "remove_injury") input.noInjuryUncertainty = true;
    if (action === "increase_payout") input.minimumOdds = Math.max(finite(input.minimumOdds) ?? -1000, 100);
    const next = action === "replace_weakest" && result?.legs?.length
      ? this.replaceLeg(result, [...result.legs].sort((a, b) => a.researchQuality - b.researchQuality || a.id.localeCompare(b.id))[0].id, options)
      : this.build(input, { ...options, lockedSelectionIds: result?.lockedSelectionIds || [] });
    if (next === result || !result?.legs?.length || !next?.legs?.length) return next;
    const previousIds = new Set(result.legs.map((item) => item.selectionId)); const nextIds = new Set(next.legs.map((item) => item.selectionId));
    const removed = result.legs.filter((item) => !nextIds.has(item.selectionId)); const added = next.legs.filter((item) => !previousIds.has(item.selectionId));
    if (!removed.length && !added.length) return next;
    const records = this.marketScreenerService.getRecords(options.scope || {}, options.currentDate || this.clock());
    const count = Math.max(removed.length, added.length); const modifications = [];
    for (let index = 0; index < count; index += 1) modifications.push(explainLegChange(records.find((item) => item.selectionId === removed[index]?.selectionId), records.find((item) => item.selectionId === added[index]?.selectionId), result.correlation.level, next.correlation.level, `Applied “${action.replaceAll("_", " ")}” while retaining current constraints.`));
    return Object.freeze({ ...next, changes: freeze([...(next.changes || []), ...modifications]) });
  }

  buildAround(result, legId, options = {}) {
    const leg = result?.legs?.find((item) => item.id === legId || item.selectionId === legId);
    if (!leg) return result;
    const next = this.build(result.constraints, { ...options, lockedSelectionIds: unique([...(result.lockedSelectionIds || []), leg.selectionId]) });
    const records = this.marketScreenerService.getRecords(options.scope || {}, options.currentDate || this.clock()); const record = records.find((item) => item.selectionId === leg.selectionId);
    const change = explainLegChange(record, record, result.correlation.level, next.correlation.level, "This leg was locked. Additional compatible legs were researched without removing it or relaxing current constraints.");
    return Object.freeze({ ...next, changes: freeze([...(result.changes || []), change]) });
  }

  replaceLeg(result, legId, options = {}) {
    const index = result?.legs?.findIndex((item) => item.id === legId || item.selectionId === legId) ?? -1;
    if (index < 0) return result;
    const records = this.marketScreenerService.getRecords(options.scope || {}, options.currentDate || this.clock());
    const previousLeg = result.legs[index]; const previousRecord = records.find((item) => item.selectionId === previousLeg.selectionId);
    const fixedLegs = result.legs.filter((_, itemIndex) => itemIndex !== index);
    const fixedRecords = fixedLegs.map((leg) => records.find((item) => item.selectionId === leg.selectionId)).filter(Boolean);
    const candidates = records.filter((record) => record.selectionId !== previousLeg.selectionId && !fixedLegs.some((leg) => leg.selectionId === record.selectionId) && recordMeetsParlayConstraints(record, result.constraints)).sort(deterministicOrder);
    const excluded = [];
    const replacement = candidates.find((record) => {
      if (!result.constraints.allowSameGame && fixedRecords.some((item) => item.gameId && item.gameId === record.gameId)) { excluded.push(Object.freeze({ record: legFromRecord(record), reasons: freeze(["Same-event legs are disabled by the current constraints."]) })); return false; }
      const correlation = evaluateResearchCorrelation([...fixedRecords, record]);
      if (levelRank[correlation.level] > levelRank[result.constraints.maximumResearchCorrelation]) { excluded.push(Object.freeze({ record: legFromRecord(record), reasons: freeze([`Correlation would exceed the ${result.constraints.maximumResearchCorrelation} limit.`]) })); return false; }
      return true;
    });
    if (!replacement) return Object.freeze({ ...result, changes: freeze([...(result.changes || []), Object.freeze({ previousLeg, newLeg: null, reason: "No compatible replacement satisfies every current constraint.", metrics: freeze([]) })]), excluded: freeze([...(result.excluded || []), ...excluded]) });
    const nextRecords = [...fixedRecords]; nextRecords.splice(index, 0, replacement);
    const beforeCorrelation = evaluateResearchCorrelation([previousRecord, ...fixedRecords].filter(Boolean)).level;
    const afterCorrelation = evaluateResearchCorrelation(nextRecords).level;
    const change = explainLegChange(previousRecord, replacement, beforeCorrelation, afterCorrelation, "Only the selected leg was replaced; maximum legs, sportsbook preferences, and all current constraints were preserved.");
    return resultFromRecords(nextRecords, { constraints: result.constraints, eligibleCount: result.eligibleCount, excluded: [...(result.excluded || []), ...excluded], generatedAt: new Date(options.currentDate || this.clock()).toISOString(), lockedSelectionIds: (result.lockedSelectionIds || []).filter((id) => id !== previousLeg.selectionId), changes: [...(result.changes || []), change], idSeed: `replace:${previousLeg.selectionId}` });
  }

  compare(results = []) {
    return Object.freeze({ type: "parlay_version_comparison", items: freeze(results.filter(Boolean).map((result) => Object.freeze({ id: result.id, generatedAt: result.generatedAt, legCount: result.legs.length, ...result.portfolio, counterarguments: freeze(result.legs.flatMap((item) => item.counterarguments)), disclosure: "Research dimensions are displayed without declaring a winner." }))), disclosure: "Versions retain their original snapshots and are compared without an overall winner." });
  }
}

export function createParlayBuilderService(dependencies) { return new ParlayBuilderService(dependencies); }
