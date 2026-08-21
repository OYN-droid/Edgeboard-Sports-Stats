import { getStatDefinition } from "../config/stat-registry.js";
import { getInsightRule } from "../config/insight-rules.js";
import {
  STORY_FRESHNESS_POLICIES,
  STORY_LIFECYCLE_STATES,
  STORY_PRESENTATIONS,
  STORY_SCHEMA_VERSION,
  STORY_SCORE_WEIGHTS,
  STORY_TYPES,
  storyFamily,
  storyLimit,
} from "../config/story-config.js";
import { MOCK_STORY_FIXTURES } from "../data/mock-story-fixtures.js";
import { createAthleteMediaViewModel } from "./athlete-media-service.js";
import { evaluateEdgeTrust } from "./edge-trust-service.js";

const INVALID_STATUSES = new Set(["invalid", "unsupported", "insufficient_data", "conflicting_sources", "stale", "retracted"]);
const HOMEPAGE_STATES = new Set(["active", "featured"]);
const clean = (value) => String(value ?? "").trim();
const unique = (values) => [...new Set((values || []).filter(Boolean))];
const freezeList = (values) => Object.freeze([...(values || [])]);
const clamp = (value, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, Number(value) || 0));

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function insightStoryType(insight) {
  if (insight.type === "milestone_reached") return "milestone_reached";
  if (insight.type === "milestone_proximity") return "milestone_approaching";
  if (insight.type === "record_candidate") return "record_candidate";
  if (insight.type === "season_high") return "season_high";
  if (insight.type === "recent_high") return "dataset_high";
  if (insight.type.includes("streak")) return insight.claimData?.active === false ? "streak_ended" : "active_streak";
  if (insight.type.endsWith("_trend") || insight.type === "home_away_difference") {
    if (["mma", "boxing", "kickboxing"].includes(insight.sportId)) return "fighter_form";
    if (insight.sportId === "motorsport") return "driver_form";
    return insight.entityType === "team" ? "team_form" : "athlete_form";
  }
  return "notable_performance";
}

function entityName(entity, claimData = {}) {
  return clean(entity?.name || entity?.displayName || claimData.entityName) || "This entity";
}

function resolveEntity(entityRegistry, statsRepository, id) {
  const unified = entityRegistry?.getEntity?.(id);
  const historical = statsRepository?.entities?.find((item) => item.id === id);
  const source = historical || unified;
  if (!source) return null;
  return Object.freeze({
    ...source,
    name: source.name || source.displayName || id,
    displayName: source.displayName || source.name || id,
    entityType: source.entityType || source.type || "entity",
    profileSystem: historical ? (historical.entityType === "team" ? "entity" : "athlete") : source.profileSystem || "entity",
  });
}

function trustForCandidate(candidate) {
  const validation = candidate.validationStatus;
  const sample = candidate.sources.every((source) => source.sample !== false);
  const components = {
    historical: validation === "verified_complete" || validation === "provider_asserted" ? "verified"
      : validation === "partial_coverage" ? "partial" : validation === "stale" ? "stale" : "sample",
    agreement: validation === "conflicting_sources" ? "conflict" : candidate.sources.length ? "verified" : "unavailable",
    freshness: candidate.freshness.state === "stale" ? "stale" : sample ? "sample" : "fresh",
    coverage: validation === "partial_coverage" ? .5 : candidate.supportingEvidence.length ? 1 : 0,
    identity: candidate.entityIds.length && candidate.primaryEntity ? "verified" : candidate.entityIds.length ? "pending" : "verified",
    completeness: candidate.supportingEvidence.length && Object.keys(candidate.claimData).length ? 1 : .25,
  };
  const evaluated = evaluateEdgeTrust({
    components,
    applicable: ["historical", "agreement", "freshness", "coverage", "identity", "completeness"],
    conflicts: validation === "conflicting_sources" ? ["Fixture sources materially disagree."] : [],
    sample,
    lastValidation: candidate.freshness.lastUpdated,
  });
  const publicStatus = candidate.validationStatus === "provider_asserted" ? "Strong supporting data"
    : candidate.validationStatus === "conflicting_sources" ? "Conflicting sources"
      : candidate.validationStatus === "stale" ? "Stale"
        : candidate.validationStatus === "partial_coverage" ? "Limited historical coverage"
          : candidate.sample ? "Sample data" : "Verified";
  return Object.freeze({
    ...evaluated,
    publicStatus,
    summary: evaluated.limitations.join(" ") || `${publicStatus}; supporting sources and evidence passed the applicable checks.`,
  });
}

function normalizeSource(source = {}) {
  return Object.freeze({
    id: clean(source.id || source.provider || source.label) || "source-unavailable",
    label: clean(source.label || source.attribution || source.provider) || "Source unavailable",
    mode: clean(source.mode) || (source.sample === false ? "live" : "sample"),
    sample: source.sample !== false,
  });
}

function canonicalCandidate(input, dependencies = {}) {
  const sourceInsightIds = unique(input.sourceInsightIds || []);
  const claimData = Object.freeze({ ...(input.claimData || input.calculatedClaimData || {}) });
  const scope = Object.freeze({ season: "", dateRange: {}, competition: null, ...(input.scope || {}) });
  const entityIds = unique(input.entityIds || input.entity?.id ? (input.entityIds || [input.entity?.id]) : []);
  const sources = freezeList((input.sources?.length ? input.sources : [input.source || {}]).map(normalizeSource));
  const evidence = freezeList(input.supportingEvidence || []);
  const identity = [
    storyFamily(input.storyType), entityIds.join(","), (input.statIds || []).join(","),
    (input.eventIds || []).join(","), JSON.stringify(scope), JSON.stringify(claimData),
  ].join("|");
  const primaryEntity = entityIds.length
    ? resolveEntity(dependencies.entityRegistry, dependencies.statsRepository, entityIds[0])
    : null;
  const candidate = {
    id: clean(input.id) || `story-${stableHash(identity)}`,
    schemaVersion: STORY_SCHEMA_VERSION,
    storyType: STORY_TYPES.includes(input.storyType) ? input.storyType : "unsupported",
    storyFamily: storyFamily(input.storyType),
    headlineTemplateId: clean(input.headlineTemplateId) || input.storyType,
    entityIds: freezeList(entityIds),
    teamIds: freezeList(unique(input.teamIds || [])),
    eventIds: freezeList(unique(input.eventIds || [])),
    competitionIds: freezeList(unique(input.competitionIds || [])),
    sportId: clean(input.sportId),
    leagueId: clean(input.leagueId),
    statIds: freezeList(unique(input.statIds || [])),
    sourceInsightIds: freezeList(sourceInsightIds),
    sourceRecordIds: freezeList(unique(input.sourceRecordIds || [])),
    sourceLeaderboardIds: freezeList(unique(input.sourceLeaderboardIds || [])),
    claimData,
    scope,
    supportingEvidence: evidence,
    primaryEntity,
    storyScore: Number(input.storyScore) || 0,
    validationStatus: input.validationStatus || "dataset_only",
    lifecycleState: STORY_LIFECYCLE_STATES.includes(input.lifecycleState) ? input.lifecycleState : "candidate",
    freshness: Object.freeze({ state: input.freshness?.state || "unknown", lastUpdated: input.freshness?.lastUpdated || null }),
    sources,
    warnings: freezeList(unique(input.warnings || [])),
    createdAt: input.createdAt || input.generatedAt || input.freshness?.lastUpdated || new Date(0).toISOString(),
    expiresAt: input.expiresAt || null,
    correctedFromId: input.correctedFromId || null,
    correctionReason: clean(input.correctionReason),
    bettingContext: input.bettingContext?.available && !input.bettingContext.stale ? Object.freeze({ ...input.bettingContext }) : null,
    sample: sources.every((source) => source.sample !== false),
  };
  candidate.edgeTrust = trustForCandidate(candidate);
  candidate.researchQuality = candidate.edgeTrust.researchQuality;
  return candidate;
}

function candidateFromInsight(insight, dependencies) {
  const supporting = dependencies.insightService.getInsightSupportingData(insight.id);
  const rule = getInsightRule(insight.ruleId);
  return canonicalCandidate({
    storyType: insightStoryType(insight),
    headlineTemplateId: insight.ruleId,
    entityIds: insight.entityIds,
    teamIds: insight.entityType === "team" ? insight.entityIds : [],
    eventIds: insight.supportingEventIds,
    competitionIds: insight.competitionId ? [insight.competitionId] : [],
    sportId: insight.sportId,
    leagueId: insight.leagueId,
    statIds: insight.statIds,
    sourceInsightIds: [insight.id],
    claimData: {
      ...insight.claimData,
      thresholdOperator: insight.claimData?.thresholdOperator
        || rule?.thresholdConfiguration?.operator
        || null,
    },
    scope: { ...insight.scope, competition: insight.competitionId || null, period: insight.scope?.period || "full-event" },
    supportingEvidence: (supporting?.eventRows || []).map((row) => Object.freeze({
      id: row.row_id,
      type: "completed_stat_row",
      label: row.event_name || row.event_id,
      eventId: row.event_id,
      occurredAt: row.event_date,
      values: Object.freeze({ ...row.stats }),
      sourceId: insight.source?.provider,
      status: row.status,
    })),
    validationStatus: insight.validationStatus,
    lifecycleState: "active",
    freshness: insight.freshness,
    sources: [{ id: insight.source?.provider, label: insight.source?.attribution || insight.source?.provider, mode: "sample", sample: insight.source?.sample !== false }],
    warnings: insight.warnings,
    createdAt: insight.generatedAt,
    bettingContext: insight.bettingContext,
  }, dependencies);
}

function sameNumber(left, right) {
  return Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Number(left) === Number(right);
}

function evidenceSupportsClaim(candidate) {
  const claim = candidate?.claimData || {};
  const evidence = candidate?.supportingEvidence || [];
  const statId = candidate?.statIds?.[0] || claim.statId;
  const values = statId
    ? evidence.map((item) => Number(item.values?.[statId])).filter(Number.isFinite)
    : [];
  if (["active_streak", "streak_ended"].includes(candidate?.storyType)) {
    const length = Number(claim.streakLength ?? claim.count);
    if (!Number.isInteger(length) || length < 1 || evidence.length < length) return false;
    if (claim.threshold === null || claim.threshold === undefined || !values.length) return true;
    const threshold = Number(claim.threshold);
    const operator = claim.thresholdOperator || "gte";
    return values.slice(-length).every((value) => operator === "lte" ? value <= threshold : value >= threshold);
  }
  if (["dataset_high", "season_high", "record_candidate", "verified_record"].includes(candidate?.storyType)) {
    if (!values.length || !Number.isFinite(Number(claim.value))) return false;
    return sameNumber(claim.value, claim.extreme === "best-lower-value" ? Math.min(...values) : Math.max(...values));
  }
  if (["milestone_approaching", "milestone_reached"].includes(candidate?.storyType)) {
    const asserted = evidence.some((item) => sameNumber(item.values?.currentValue, claim.currentValue));
    const calculated = values.length && sameNumber(values.reduce((sum, value) => sum + value, 0), claim.currentValue);
    return Boolean(asserted || calculated);
  }
  if (candidate?.storyType === "comeback") {
    return evidence.some((item) => candidate.sportId === "motorsport"
      ? sameNumber(item.values?.startingPosition, claim.startingPosition)
        && sameNumber(item.values?.finishingPosition, claim.finishingPosition)
        && sameNumber(Number(claim.startingPosition) - Number(claim.finishingPosition), claim.positionsGained)
      : sameNumber(item.values?.deficit, claim.deficit) && sameNumber(item.values?.finalMargin, claim.finalMargin));
  }
  if (candidate?.storyType === "standings_change") {
    return evidence.some((item) => sameNumber(item.values?.previousRank, claim.previousRank)
      && sameNumber(item.values?.currentRank, claim.currentRank));
  }
  if (candidate?.storyType === "data_update") {
    return evidence.some((item) => String(item.values?.oldValue) === String(claim.oldValue)
      && String(item.values?.newValue) === String(claim.newValue));
  }
  return true;
}

function compatibleBettingContext(candidate) {
  const market = candidate?.bettingContext;
  if (!market) return true;
  const expectedEventId = candidate.primaryEntity?.profile?.nextEvent?.id || "";
  return market.available === true
    && market.stale !== true
    && Boolean(market.entityId && candidate.entityIds.includes(market.entityId))
    && Boolean(market.eventId && (!expectedEventId || market.eventId === expectedEventId))
    && Boolean(market.canonicalMarketId && market.period && market.settlementScope)
    && (!candidate.scope?.period || market.period === candidate.scope.period)
    && Number.isFinite(new Date(market.updatedAt).getTime());
}

function eventCandidate(event, league, dependencies) {
  const title = clean(event.display?.title || event.name || event.eventName)
    || (event.participants || []).map((item) => item.name).filter(Boolean).join(" vs ")
    || "Scheduled event";
  return canonicalCandidate({
    id: `story-event-${event.id}`,
    storyType: "upcoming_event",
    headlineTemplateId: "upcoming_event",
    eventIds: [event.id],
    sportId: event.sportId || league.sportId,
    leagueId: event.leagueId || league.leagueId,
    claimData: { eventName: title, startsAt: event.startsAt, status: event.status,
      score: event.liveState?.score || null, period: event.liveState?.period || null },
    scope: { season: "", dateRange: { start: event.startsAt, end: event.startsAt }, competition: event.competitionId || event.leagueId },
    supportingEvidence: [{ id: `schedule-${event.id}`, type: "normalized_schedule", label: title, eventId: event.id, occurredAt: event.startsAt, values: { status: event.status }, sourceId: (typeof event.source === "string" ? event.source : event.source?.provider) || league.dataProvider, status: event.status }],
    validationStatus: event.dataQualityStatus === "error" ? "invalid" : "dataset_only",
    lifecycleState: "active",
    freshness: { state: event.stale ? "stale" : event.sourceMode || "unknown", lastUpdated: event.sourceUpdatedAt || event.lastUpdatedAt || league.lastUpdatedAt },
    sources: [{
      id: (typeof event.source === "string" ? event.source : event.source?.provider) || league.dataProvider,
      label: (typeof event.source === "string" ? event.source : event.source?.provider) || league.dataProvider || "Source unavailable",
      mode: event.sourceMode || "unknown",
      sample: ["sample", "fixture"].includes(event.sourceMode),
    }],
    warnings: [event.sourceMode === "fixture" ? "Validated fixture schedule; not live data." : "Verify current provider status before relying on this schedule."],
    createdAt: event.sourceUpdatedAt || event.lastUpdatedAt || league.lastUpdatedAt,
    expiresAt: ["live", "in_progress", "resumed", "delayed", "suspended", "final"].includes(event.status) ? null : event.startsAt,
  }, dependencies);
}

export function validateStoryCandidate(candidate, { now = new Date(), forHomepage = false } = {}) {
  const errors = [];
  const warnings = [...(candidate?.warnings || [])];
  if (!candidate || !STORY_TYPES.includes(candidate.storyType)) errors.push("Unsupported story type.");
  if (!candidate?.sportId || !candidate?.leagueId) errors.push("Sport and league are required.");
  if (!candidate?.claimData || !Object.keys(candidate.claimData).length) errors.push("Structured claim data is required.");
  if (!candidate?.supportingEvidence?.length) errors.push("Supporting evidence is required.");
  const singleEvidenceTypes = new Set(["upcoming_event", "data_update", "comeback", "upset", "standings_change", "injury_or_lineup_context", "market_movement_context"]);
  if (!singleEvidenceTypes.has(candidate?.storyType) && candidate?.validationStatus !== "provider_asserted" && candidate?.supportingEvidence?.length < 3) errors.push("The story does not meet its minimum evidence sample.");
  if (candidate?.supportingEvidence?.length && !evidenceSupportsClaim(candidate)) errors.push("Supporting evidence does not match the structured claim.");
  if (candidate?.supportingEvidence?.some((item) => ["postponed", "cancelled", "incomplete"].includes(item.status))) errors.push("Incomplete events cannot support a rendered claim.");
  if (candidate?.entityIds?.length && !candidate.primaryEntity) errors.push("A canonical entity did not resolve.");
  if (!candidate?.sources?.length || candidate.sources.some((source) => !source.id)) errors.push("A source is required.");
  if (INVALID_STATUSES.has(candidate?.validationStatus)) errors.push(`Validation state ${candidate?.validationStatus} is not renderable.`);
  if (candidate?.validationStatus === "partial_coverage") warnings.push("Historical coverage is partial.");
  if (candidate?.sample && candidate.validationStatus === "verified_complete") errors.push("Sample-only evidence cannot be presented as fully verified.");
  if (candidate?.storyType === "verified_record" && !["verified_complete", "provider_asserted"].includes(candidate.validationStatus)) errors.push("Record wording requires verified or provider-asserted validation.");
  if (candidate?.bettingContext && !compatibleBettingContext(candidate)) errors.push("Betting context does not match the story entity, event, period, settlement scope, or freshness requirements.");
  const lastUpdated = new Date(candidate?.freshness?.lastUpdated || 0);
  const maximumAge = candidate?.sample ? STORY_FRESHNESS_POLICIES.sample : STORY_FRESHNESS_POLICIES[candidate?.storyType] || STORY_FRESHNESS_POLICIES.default;
  if (Number.isFinite(maximumAge) && (!Number.isFinite(lastUpdated.getTime()) || now - lastUpdated > maximumAge)) errors.push("The story exceeds its freshness policy.");
  if (candidate?.storyType === "market_movement_context" && !candidate.bettingContext) errors.push("Verified current betting context is required for a market-movement story.");
  if (candidate?.expiresAt && new Date(candidate.expiresAt) <= now && candidate.storyType === "upcoming_event") errors.push("The upcoming event has expired.");
  if (["expired", "archived", "retracted"].includes(candidate?.lifecycleState)) errors.push(`Lifecycle state ${candidate.lifecycleState} is not eligible for current displays.`);
  if (forHomepage && !HOMEPAGE_STATES.has(candidate?.lifecycleState)) errors.push(`Lifecycle state ${candidate?.lifecycleState} is not homepage eligible.`);
  return Object.freeze({ valid: errors.length === 0, errors: freezeList(errors), warnings: freezeList(unique(warnings)) });
}

export function scoreStoryCandidate(candidate, context = {}) {
  const weights = { ...STORY_SCORE_WEIGHTS, ...(context.weights || {}) };
  const reference = context.now instanceof Date ? context.now : new Date(context.now || candidate.createdAt || 0);
  const latest = new Date(candidate.scope?.dateRange?.end || candidate.createdAt || 0);
  const ageDays = Number.isNaN(latest.getTime()) ? 365 : Math.max(0, (reference - latest) / 86400000);
  const recency = candidate.sample ? .7 : Math.max(0, 1 - ageDays / 30);
  const claim = candidate.claimData || {};
  const streak = Math.min(1, Number(claim.streakLength || claim.count || 0) / 10);
  const milestone = candidate.storyType.startsWith("milestone") ? 1 : 0;
  const record = ["verified_record", "record_candidate", "dataset_high", "season_high"].includes(candidate.storyType) ? 1 : 0;
  const rarity = Math.min(1, Number(claim.rarityPercentile || candidate.sourceInsight?.rarity?.percentile || 55) / 100);
  const scopeRelevant = (!context.leagueId || context.leagueId === candidate.leagueId)
    && (!context.sportId || context.sportId === candidate.sportId) ? 1 : 0;
  const query = clean(context.query).toLowerCase();
  const queryRelevant = query && [candidate.primaryEntity?.name, candidate.leagueId, candidate.storyType, ...candidate.statIds]
    .some((value) => query.includes(clean(value).toLowerCase())) ? 1 : 0;
  const smallSample = candidate.supportingEvidence.length < 3 && !["upcoming_event", "data_update"].includes(candidate.storyType) ? 1 : 0;
  const incomplete = candidate.validationStatus === "partial_coverage" ? 1 : 0;
  const stale = candidate.freshness.state === "stale" ? 1 : 0;
  const raw = recency * weights.recency
    + .55 * weights.magnitude
    + rarity * weights.rarity
    + streak * weights.streakLength
    + milestone * weights.milestoneImportance
    + record * weights.recordImportance
    + scopeRelevant * weights.scopeRelevance
    + queryRelevant * weights.queryRelevance
    + Math.min(1, candidate.sources.length) * weights.sourceCompleteness
    + (candidate.edgeTrust.researchQuality.score / 100) * weights.edgeTrust
    + (candidate.researchQuality.score / 100) * weights.researchQuality
    + .7 * weights.novelty
    + Math.min(1, candidate.supportingEvidence.length / 3) * weights.evidenceSupport
    + Number(Boolean(context.mode !== "stats" && candidate.bettingContext)) * weights.marketRelevance
    - Number(Boolean(context.duplicate)) * weights.duplicatePenalty
    - stale * weights.stalePenalty
    - smallSample * weights.smallSamplePenalty
    - incomplete * weights.incompleteCoveragePenalty;
  return clamp(Number(raw.toFixed(1)));
}

function exactPresentationArtwork(candidate) {
  if (!candidate?.primaryEntity) return 0;
  const media = createAthleteMediaViewModel(candidate.primaryEntity, {
    context: "story", desiredVariant: "story", fallbackPolicy: "featured_story",
  });
  return Number(media?.illustration?.fallbackLevel === "exact");
}

export function compareStoryCandidates(left, right) {
  return Number(right?.storyScore || 0) - Number(left?.storyScore || 0)
    || exactPresentationArtwork(right) - exactPresentationArtwork(left)
    || clean(left?.id).localeCompare(clean(right?.id));
}

export function deduplicateStories(candidates, limit = Infinity) {
  const selected = [];
  const byKey = new Map();
  [...(candidates || [])].sort(compareStoryCandidates).forEach((candidate) => {
    const key = [candidate.entityIds.join(","), candidate.storyFamily, candidate.statIds.join(","), candidate.eventIds.join(","), JSON.stringify(candidate.scope?.dateRange || {}), candidate.claimData.threshold ?? ""].join("|");
    const existing = byKey.get(key);
    if (existing) {
      existing.supportingEvidence = freezeList([...new Map([...existing.supportingEvidence, ...candidate.supportingEvidence].map((item) => [item.id, item])).values()]);
      existing.alternateActions = freezeList(unique([...(existing.alternateActions || []), ...(candidate.sourceInsightIds || [])]));
      return;
    }
    if (selected.length >= limit) return;
    const copy = { ...candidate };
    byKey.set(key, copy);
    selected.push(copy);
  });
  return Object.freeze(selected.map((item) => Object.freeze(item)));
}

function plural(value, singular, pluralValue = `${singular}s`) {
  return `${value} ${Number(value) === 1 ? singular : pluralValue}`;
}

export function phraseStory(candidate) {
  const claim = candidate.claimData;
  const name = entityName(candidate.primaryEntity, claim);
  const statId = candidate.statIds[0] || claim.statId || "";
  const statLabel = clean(claim.statLabel || getStatDefinition(statId)?.displayName).toLowerCase() || "configured statistic";
  let headline = `${name} has a supported statistical story`;
  let summary = `The claim is supported by ${plural(candidate.supportingEvidence.length, "evidence row")}.`;
  if (candidate.storyType === "active_streak" || candidate.storyType === "streak_ended") {
    const count = Number(claim.streakLength || claim.count || 0);
    headline = `${name}'s ${statLabel} streak ${candidate.storyType === "streak_ended" ? "ended at" : "reached"} ${plural(count, "event")}`;
    summary = claim.threshold === null || claim.threshold === undefined
      ? `${plural(count, "consecutive completed appearance")} met the configured ${statLabel} rule.`
      : `${name} recorded at least ${claim.threshold} ${statLabel} in ${plural(count, "consecutive completed appearance")}.`;
  } else if (candidate.storyType === "milestone_approaching") {
    headline = `${name} is ${claim.remaining} away from ${claim.target} ${statLabel}`;
    summary = `The available sample currently totals ${claim.currentValue}; this is not a verified career total.`;
  } else if (candidate.storyType === "milestone_reached") {
    headline = `${name} reached ${claim.target} ${statLabel} in the attributed sample`;
    summary = `The retained evidence reports ${claim.currentValue} within the disclosed scope.`;
  } else if (["dataset_high", "season_high", "record_candidate", "verified_record"].includes(candidate.storyType)) {
    headline = `${name} produced the highest ${statLabel} value in the available ${candidate.storyType === "season_high" ? "season " : ""}dataset`;
    summary = `${claim.value} was selected from ${plural(candidate.supportingEvidence.length, "completed event")}; no broader historical record claim is made.`;
  } else if (candidate.storyType === "comeback" && candidate.sportId === "motorsport") {
    headline = `${name} moved from ${claim.startingPosition}th to ${claim.finishingPosition}rd in the sample race`;
    summary = `${name} gained ${plural(claim.positionsGained, "position")} between the starting grid and completed classification.`;
  } else if (candidate.storyType === "comeback") {
    headline = `${name} erased a ${claim.deficit}-${clean(claim.unit) || "point"} deficit in the sample event`;
    summary = `The completed score progression shows a final margin of ${claim.finalMargin}.`;
  } else if (candidate.storyType === "standings_change") {
    headline = `${name} moved from ${claim.previousRank} to ${claim.currentRank} in the available standings snapshot`;
    summary = `The comparison is limited to ${claim.competitionName || candidate.leagueId.toUpperCase()}.`;
  } else if (candidate.storyType === "upset") {
    headline = `${name} defeated the No. ${claim.opponentSeed} seed in the sample tournament`;
    summary = `The fixture identifies ${name} as the No. ${claim.winnerSeed} seed; it is not a current real-world result.`;
  } else if (["athlete_form", "fighter_form", "driver_form", "team_form"].includes(candidate.storyType)) {
    headline = `${name}'s available ${statLabel} sample is worth exploring`;
    summary = claim.count ? `${name} recorded ${plural(claim.count, statLabel)} in ${plural(claim.sampleSize, "completed event")}.` : summary;
  } else if (candidate.storyType === "upcoming_event") {
    if (["live", "in_progress", "resumed"].includes(claim.status)) {
      headline = `${claim.eventName || name} is reported in progress`;
      summary = claim.score ? `The validated ${candidate.sample ? "fixture" : "provider"} state reports ${claim.score.away}–${claim.score.home}${claim.period ? ` in the ${claim.period.half} of inning ${claim.period.inning}` : ""}.` : "The event is reported in progress; a supported score is unavailable.";
    } else {
      headline = `${claim.eventName || name} is next on the ${candidate.sources.some((source) => source.mode === "fixture") ? "fixture" : candidate.sample ? "sample" : "provider"} schedule`;
      summary = claim.startsAt ? `Scheduled for ${new Date(claim.startsAt).toLocaleString()}; verify the current provider before relying on the time.` : "The source did not provide a valid event time.";
    }
  } else if (candidate.storyType === "data_update") {
    headline = `${name}'s sample ${claim.field || "statistic"} was corrected`;
    summary = `The retained audit changes the value from ${claim.oldValue} to ${claim.newValue}.`;
  } else if (candidate.sourceInsightIds.length) {
    const insightSummary = clean(candidate.sourceInsight?.phrasing?.shortSummary);
    headline = clean(candidate.sourceInsight?.phrasing?.headline) || headline;
    summary = insightSummary || summary;
  }
  const scope = [candidate.scope.season, candidate.leagueId.toUpperCase()].filter(Boolean).join(" ");
  const fixtureOnly = candidate.sources.length > 0 && candidate.sources.every((source) => source.mode === "fixture");
  const disclosure = candidate.validationStatus === "provider_asserted"
    ? `Provider-asserted ${fixtureOnly ? "fixture" : "sample"} · ${scope}`
    : candidate.validationStatus === "dataset_only" ? `Available ${fixtureOnly ? "fixture" : "sample"} dataset only · ${scope}`
      : `${fixtureOnly ? "Fixture data · " : candidate.sample ? "Sample data · " : ""}${candidate.validationStatus.replaceAll("_", " ")} · ${scope}`;
  const prohibited = /\b(guaranteed|lock|can'?t miss|unstoppable|record-breaking|all-time|because of|wanted it more)\b/i;
  if (prohibited.test(`${headline} ${summary}`)) throw new Error("Story phrasing contains unsupported language.");
  return Object.freeze({
    headline,
    shortSummary: summary,
    expandedExplanation: `${summary} Scope: ${scope || "available sample"}. Supporting evidence: ${candidate.supportingEvidence.length}.`,
    evidenceSummary: `${plural(candidate.supportingEvidence.length, "supporting item")} retained.`,
    uncertaintyDisclosure: disclosure,
    sourceLabel: candidate.sources.map((source) => source.label).join(" + "),
    shareCaption: `${headline}. ${summary} ${disclosure}. ${fixtureOnly ? "Fixture data; not live." : candidate.sample ? "Sample data." : "Provider data."}`,
  });
}

function storyActions(candidate, mode) {
  const actions = [];
  const entity = candidate.primaryEntity;
  if (entity) actions.push(Object.freeze({ type: "profile", label: `Open ${entity.entityType === "team" ? "team" : "profile"}`, entityId: entity.id, profileSystem: entity.profileSystem }));
  if (entity && candidate.supportingEvidence.some((item) => item.type === "completed_stat_row")) actions.push(Object.freeze({ type: "query", kind: "game-log", label: "View game logs", query: `Show ${entity.name}'s supporting completed game logs` }));
  if (candidate.eventIds.length) actions.push(Object.freeze({ type: "query", kind: "event", label: "View event", query: `Research event ${candidate.eventIds[0]}` }));
  if (entity) actions.push(Object.freeze({ type: "query", kind: "comparison", label: "Compare", query: `Compare ${entity.name} with qualified ${candidate.leagueId.toUpperCase()} peers` }));
  if (candidate.statIds.length) actions.push(Object.freeze({ type: "query", kind: "visualization", label: "Visualize", query: `Visualize ${entity?.name || candidate.leagueId} ${candidate.statIds[0]}` }));
  actions.push(Object.freeze({ type: "research-story", kind: "research", label: "Research this story", storyId: candidate.id, query: `Explain this story with its supporting evidence: ${phraseStory(candidate).headline}` }));
  actions.push(Object.freeze({ type: "evidence", label: "Supporting evidence", storyId: candidate.id }));
  actions.push(Object.freeze({ type: "save-story", label: "Save story", storyId: candidate.id }));
  if (entity) actions.push(Object.freeze({ type: "follow-entity", label: "Follow entity", entityId: entity.id }));
  actions.push(Object.freeze({ type: "share-story", label: "Share", storyId: candidate.id }));
  if (mode !== "stats" && candidate.bettingContext) actions.push(Object.freeze({ type: "market", kind: "market", label: candidate.sample ? "Sample market analysis" : "Current market", query: `Show ${candidate.sample ? "sample" : "verified current"} markets related to ${entity?.name || candidate.leagueId}` }));
  return freezeList(actions);
}

export function buildStoryViewModel(candidate, { presentation = "standard", mode = "stats" } = {}) {
  const phrasing = phraseStory(candidate);
  const media = candidate.primaryEntity ? createAthleteMediaViewModel(candidate.primaryEntity) : Object.freeze({ imageType: "initials", imageUrl: "", fallbackInitials: candidate.leagueId.slice(0, 2).toUpperCase(), altText: `${candidate.leagueId.toUpperCase()} story placeholder`, attribution: "", rightsStatus: "original-placeholder", source: "EdgeBoard", candidates: Object.freeze([]) });
  return Object.freeze({
    id: candidate.id,
    presentation: STORY_PRESENTATIONS.includes(presentation) ? presentation : "standard",
    headline: phrasing.headline,
    summary: phrasing.shortSummary,
    expandedExplanation: phrasing.expandedExplanation,
    storyType: candidate.storyType,
    primaryEntity: candidate.primaryEntity,
    relatedEntities: Object.freeze([]),
    media,
    statChips: freezeList([
      ...candidate.statIds.map((id) => getStatDefinition(id)?.displayName || id),
      `${candidate.supportingEvidence.length} evidence`,
    ]),
    sportId: candidate.sportId,
    leagueId: candidate.leagueId,
    eventIds: candidate.eventIds,
    sourceInsightIds: candidate.sourceInsightIds,
    scopeLabel: [candidate.scope.season, candidate.leagueId.toUpperCase()].filter(Boolean).join(" · "),
    researchQuality: candidate.researchQuality,
    edgeTrust: candidate.edgeTrust,
    validationLabel: candidate.validationStatus === "dataset_only" ? "Dataset only"
      : candidate.validationStatus === "provider_asserted" ? "Provider asserted" : candidate.validationStatus.replaceAll("_", " "),
    sourceLabel: phrasing.sourceLabel,
    sourceMode: candidate.sources.length && candidate.sources.every((source) => source.mode === candidate.sources[0].mode) ? candidate.sources[0].mode : "mixed",
    freshnessLabel: candidate.freshness.state === "sample" ? "Sample snapshot" : candidate.freshness.state,
    lastUpdated: candidate.freshness.lastUpdated,
    primaryAction: storyActions(candidate, mode)[0] || null,
    secondaryActions: storyActions(candidate, mode).slice(1),
    supportingEvidence: candidate.supportingEvidence,
    warnings: candidate.warnings,
    lifecycleState: candidate.lifecycleState,
    classification: candidate.storyType === "upcoming_event" ? "current_provider_data" : "historical_fact",
    storyScore: candidate.storyScore,
    sample: candidate.sample,
    shareCaption: phrasing.shareCaption,
    market: mode === "stats" ? null : candidate.bettingContext,
  });
}

export class DeterministicStoryEngine {
  constructor({ insightService, sportsRepository, statsRepository, entityRegistry, fixtures = MOCK_STORY_FIXTURES, clock = () => new Date() } = {}) {
    if (!insightService || !sportsRepository || !statsRepository) throw new TypeError("Story Engine requires insight, sports, and statistics repositories.");
    this.insightService = insightService;
    this.sportsRepository = sportsRepository;
    this.statsRepository = statsRepository;
    this.entityRegistry = entityRegistry;
    this.fixtures = fixtures;
    this.clock = clock;
    this.cache = new Map();
    this.index = new Map();
    this.lifecycleOverrides = new Map();
    this.requestSequence = 0;
    this.dependencies = { insightService, sportsRepository, statsRepository, entityRegistry };
  }

  cacheKey(scope, options) {
    const now = options.now instanceof Date ? options.now : this.clock();
    return JSON.stringify([
      unique(scope.leagueIds || []).sort(), unique(scope.sportIds || []).sort(),
      Boolean(scope.liveOnly), Boolean(scope.todayOnly),
      options.mode || "stats", clean(options.query).toLowerCase(), options.candidateLimit || 60,
      unique((options.visibleLeagues || []).map((league) => league?.leagueId)).sort(),
      scope.todayOnly ? localDateKey(now) : "", this.statsRepository.updatedAt,
    ]);
  }

  applyLifecycleOverride(candidate, ignore = false) {
    const override = ignore ? null : this.lifecycleOverrides.get(candidate.id);
    return override ? Object.freeze({ ...candidate, ...override }) : candidate;
  }

  generateStoryCandidates(scope = {}, options = {}) {
    const key = this.cacheKey(scope, options);
    if (!options.noCache && this.cache.has(key)) return this.cache.get(key);
    const leagueIds = unique(scope.leagueIds || []);
    const sportIds = unique(scope.sportIds || []);
    const now = options.now instanceof Date ? options.now : this.clock();
    const entitiesWithCompletedEvidence = new Set(this.statsRepository.rows
      .filter((row) => row.status === "completed")
      .map((row) => row.entity_id));
    const eligibleEntities = this.statsRepository.entities.filter((entity) => entity.active
      && entitiesWithCompletedEvidence.has(entity.id)
      && (!leagueIds.length || leagueIds.includes(entity.leagueId))
      && (!sportIds.length || sportIds.includes(entity.sportId)));
    const entityGroups = [...eligibleEntities.reduce((bySport, entity) => {
      const group = bySport.get(entity.sportId) || [];
      group.push(entity);
      bySport.set(entity.sportId, group);
      return bySport;
    }, new Map()).values()];
    const scopedEntities = [];
    for (let index = 0; scopedEntities.length < 18 && entityGroups.some((group) => group[index]); index += 1) {
      entityGroups.forEach((group) => {
        if (group[index] && scopedEntities.length < 18) scopedEntities.push(group[index]);
      });
    }
    const insights = scope.liveOnly ? [] : this.insightService.deduplicateInsights(scopedEntities.flatMap((entity) =>
      this.insightService.generateEntityInsightCandidates(entity, {
        limit: 6,
        includeBettingContext: options.mode !== "stats",
        query: options.query || "",
        leagueId: leagueIds.length === 1 ? leagueIds[0] : entity.leagueId,
      })), Math.min(72, Math.max(24, (options.limit || 6) * 8)));
    const insightCandidates = insights.map((insight) => {
      const candidate = candidateFromInsight(insight, this.dependencies);
      candidate.sourceInsight = insight;
      candidate.storyScore = scoreStoryCandidate(candidate, { ...options, now, leagueId: leagueIds.length === 1 ? leagueIds[0] : "", sportId: sportIds.length === 1 ? sportIds[0] : "" });
      return candidate;
    });
    const fixtureCandidates = this.fixtures
      .filter((fixture) => !leagueIds.length || leagueIds.includes(fixture.leagueId))
      .filter((fixture) => !sportIds.length || sportIds.includes(fixture.sportId))
      .map((fixture) => canonicalCandidate(fixture, this.dependencies))
      .map((candidate) => ({ ...candidate, storyScore: scoreStoryCandidate(candidate, { ...options, now, leagueId: leagueIds.length === 1 ? leagueIds[0] : "", sportId: sportIds.length === 1 ? sportIds[0] : "" }) }));
    const visibleLeagues = options.visibleLeagues || leagueIds.map((id) => this.sportsRepository.getLeague(id)).filter(Boolean);
    const eventCandidates = visibleLeagues.flatMap((league) => this.sportsRepository.getEvents(league.leagueId)
      .filter((event) => scope.liveOnly ? ["live", "in_progress", "resumed"].includes(event.status) && event.liveState?.freshness?.state !== "stale" : scope.todayOnly ? localDateKey(event.startsAt) === localDateKey(now) : ["live", "in_progress", "resumed", "scheduled", "pregame"].includes(event.status))
      .map((event) => eventCandidate(event, league, this.dependencies)))
      .map((candidate) => ({ ...candidate, storyScore: scoreStoryCandidate(candidate, { ...options, now, leagueId: leagueIds.length === 1 ? leagueIds[0] : "", sportId: sportIds.length === 1 ? sportIds[0] : "" }) }));
    let candidates = [...insightCandidates, ...fixtureCandidates, ...eventCandidates]
      .map((candidate) => this.applyLifecycleOverride(candidate, options.ignoreLifecycleOverrides === true));
    if (scope.liveOnly) candidates = candidates.filter((candidate) => candidate.storyType === "upcoming_event" && ["live", "in_progress", "resumed"].includes(candidate.claimData.status));
    if (scope.todayOnly) {
      const recentCutoff = now.getTime() - 7 * 86400000;
      candidates = candidates.filter((candidate) => {
        if (candidate.storyType === "upcoming_event") return localDateKey(candidate.claimData.startsAt) === localDateKey(now);
        return candidate.supportingEvidence.some((item) => {
          const occurredAt = new Date(item.occurredAt).getTime();
          return item.status === "completed" && Number.isFinite(occurredAt) && occurredAt <= now.getTime() && occurredAt >= recentCutoff;
        });
      });
    }
    const selected = deduplicateStories(candidates, options.candidateLimit || 60);
    if (options.index !== false) selected.forEach((candidate) => this.index.set(candidate.id, candidate));
    if (!options.noCache) this.cache.set(key, selected);
    return selected;
  }

  getStoryCandidates(scope = {}, options = {}) {
    return this.generateStoryCandidates(scope, options);
  }

  getStoriesForScope(scope = {}, options = {}) {
    return this.generateStoryCandidates(scope, options)
      .filter((candidate) => validateStoryCandidate(candidate, { now: options.now || this.clock(), forHomepage: options.forHomepage === true }).valid)
      .sort(compareStoryCandidates);
  }

  getFeaturedStories(scope = {}, options = {}) {
    const limit = options.limit || storyLimit("todayStories");
    const eligible = this.getStoriesForScope(scope, { ...options, forHomepage: true });
    const selected = [];
    const sportCounts = new Map();
    const canonical = options.canonicalStoryId
      ? eligible.find((candidate) => candidate.id === options.canonicalStoryId)
      : null;
    if (canonical) {
      selected.push(canonical);
      sportCounts.set(canonical.sportId, 1);
    }
    for (const candidate of eligible) {
      if (selected.length >= limit) break;
      if (selected.includes(candidate)) continue;
      const count = sportCounts.get(candidate.sportId) || 0;
      if (scope.sportIds?.length !== 1 && scope.leagueIds?.length !== 1 && count >= 2 && eligible.some((item) => !selected.includes(item) && (sportCounts.get(item.sportId) || 0) === 0)) continue;
      selected.push(candidate);
      sportCounts.set(candidate.sportId, count + 1);
    }
    return Object.freeze(selected.map((candidate, index) => buildStoryViewModel(candidate, { presentation: index === 0 ? "hero" : "feature", mode: options.mode })));
  }

  async getFeaturedStoriesAsync(scope = {}, options = {}) {
    const sequence = ++this.requestSequence;
    await Promise.resolve();
    if (options.signal?.aborted || sequence !== this.requestSequence) throw new DOMException("Story request superseded.", "AbortError");
    return this.getFeaturedStories(scope, options);
  }

  getStory(id) { return this.index.get(id) || null; }
  getStorySupportingEvidence(id) { return this.getStory(id)?.supportingEvidence || Object.freeze([]); }

  getStoriesForEntity(entityId, options = {}) {
    return [...this.index.values()].filter((item) => item.entityIds.includes(entityId)).slice(0, options.limit || storyLimit("athleteProfile"));
  }

  getStoriesForEvent(eventId, options = {}) {
    return [...this.index.values()].filter((item) => item.eventIds.includes(eventId)).slice(0, options.limit || storyLimit("eventPage"));
  }

  getStoriesForQuery(query, options = {}) {
    return this.searchStories(query, options);
  }

  refreshStory(id, scope = {}, options = {}) {
    const previous = this.getStory(id);
    const candidates = this.generateStoryCandidates(scope, { ...options, noCache: true, index: false, ignoreLifecycleOverrides: true });
    const current = candidates.find((item) => item.id === id || (previous && item.storyFamily === previous.storyFamily && item.entityIds.join("|") === previous.entityIds.join("|") && item.statIds.join("|") === previous.statIds.join("|")));
    return Object.freeze({ previous, current: current || null, changed: Boolean(previous && current && JSON.stringify(previous.claimData) !== JSON.stringify(current.claimData)), archived: !current });
  }

  transitionStory(id, lifecycleState, metadata = {}) {
    if (!STORY_LIFECYCLE_STATES.includes(lifecycleState)) throw new TypeError("Unknown story lifecycle state.");
    const current = this.getStory(id);
    if (!current) return null;
    const updated = Object.freeze({ ...current, lifecycleState, audit: Object.freeze([...(current.audit || []), { state: lifecycleState, at: metadata.at || this.clock().toISOString(), reason: clean(metadata.reason) }]) });
    this.lifecycleOverrides.set(id, Object.freeze({ lifecycleState: updated.lifecycleState, audit: updated.audit }));
    this.clearCache({ leagueId: current.leagueId, entityId: current.entityIds[0] });
    this.index.set(id, updated);
    return updated;
  }

  archiveStory(id, reason = "Archived by user") { return this.transitionStory(id, "archived", { reason }); }
  correctStory(id, claimData, reason) {
    const current = this.getStory(id);
    if (!current) return null;
    const updated = Object.freeze({ ...current, claimData: Object.freeze({ ...claimData }), lifecycleState: "corrected", validationStatus: "corrected", correctionReason: clean(reason), audit: Object.freeze([...(current.audit || []), { state: "corrected", at: this.clock().toISOString(), reason: clean(reason), previousClaim: current.claimData }]) });
    this.lifecycleOverrides.set(id, Object.freeze({ claimData: updated.claimData, lifecycleState: updated.lifecycleState, validationStatus: updated.validationStatus, correctionReason: updated.correctionReason, audit: updated.audit }));
    this.clearCache({ leagueId: current.leagueId, entityId: current.entityIds[0] });
    this.index.set(id, updated);
    return updated;
  }
  retractStory(id, reason) { return this.transitionStory(id, "retracted", { reason }); }

  searchStories(query = "", filters = {}) {
    const text = clean(query).toLowerCase();
    const states = filters.lifecycleStates || (filters.archived ? ["archived"] : []);
    return [...this.index.values()]
      .filter((item) => !filters.sportId || item.sportId === filters.sportId)
      .filter((item) => !filters.leagueId || item.leagueId === filters.leagueId)
      .filter((item) => !filters.storyType || item.storyType === filters.storyType)
      .filter((item) => !states.length || states.includes(item.lifecycleState))
      .filter((item) => !filters.date || localDateKey(item.scope?.dateRange?.end || item.createdAt) === localDateKey(filters.date))
      .filter((item) => !text || [phraseStory(item).headline, item.primaryEntity?.name, item.sportId, item.leagueId, item.storyType, ...item.statIds].some((value) => clean(value).toLowerCase().includes(text)))
      .sort(compareStoryCandidates)
      .slice(Number(filters.offset) || 0, (Number(filters.offset) || 0) + (filters.limit || storyLimit("archivePage")))
      .map((candidate) => buildStoryViewModel(candidate, { presentation: "compact", mode: filters.mode || "stats" }));
  }

  buildStoryViewModel(candidate, options) { return buildStoryViewModel(candidate, options); }
  validateStoryCandidate(candidate, options) { return validateStoryCandidate(candidate, options); }
  scoreStoryCandidate(candidate, context) { return scoreStoryCandidate(candidate, context); }
  deduplicateStories(candidates, limit) { return deduplicateStories(candidates, limit); }
  phraseStory(candidate) { return phraseStory(candidate); }
  clearCache(affected = {}) {
    if (!affected.leagueId && !affected.entityId && !affected.eventId) {
      this.cache.clear();
      return;
    }
    [...this.cache.entries()].filter(([, stories]) => stories.some((story) =>
      (!affected.leagueId || story.leagueId === affected.leagueId)
      && (!affected.entityId || story.entityIds.includes(affected.entityId))
      && (!affected.eventId || story.eventIds.includes(affected.eventId))))
      .forEach(([key]) => this.cache.delete(key));
    [...this.index.entries()].filter(([, story]) => (!affected.leagueId || story.leagueId === affected.leagueId) && (!affected.entityId || story.entityIds.includes(affected.entityId)) && (!affected.eventId || story.eventIds.includes(affected.eventId))).forEach(([id]) => this.index.delete(id));
  }
}

export function createStoryEngine(dependencies) {
  return new DeterministicStoryEngine(dependencies);
}
