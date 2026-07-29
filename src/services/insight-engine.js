import {
  getMilestonesForSport,
  INSIGHT_SCORE_WEIGHTS,
  INSIGHT_VALIDATION_STATES,
  RARITY_LABELS,
} from "../config/insight-rules.js";
import { getStatDefinition } from "../config/stat-registry.js";

const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const round = (value, places = 2) => finite(value) ? Number(Number(value).toFixed(places)) : null;
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const unique = (values) => [...new Set(values.filter(Boolean))];

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeInsightRows(rows = [], rule = {}) {
  const completed = rows.filter((row) =>
    row?.status === "completed"
    && row.event_id
    && row.event_date
    && !Number.isNaN(new Date(row.event_date).getTime()));
  const deduplicated = new Map();
  completed.forEach((row) => {
    const current = deduplicated.get(row.event_id);
    if (!current || new Date(row.updated_at || row.event_date) >= new Date(current.updated_at || current.event_date)) {
      deduplicated.set(row.event_id, row);
    }
  });
  let normalized = [...deduplicated.values()].sort((left, right) => new Date(left.event_date) - new Date(right.event_date));
  if (rule.seasonType && rule.seasonType !== "combined") {
    normalized = normalized.filter((row) => row.season_type === rule.seasonType);
  }
  if (rule.allowCrossSeason !== true && normalized.length) {
    const latestSeason = normalized.at(-1).season;
    normalized = normalized.filter((row) => row.season === latestSeason);
  }
  if (rule.allowCrossCompetition !== true && normalized.length) {
    const latestLeague = normalized.at(-1).league_id;
    normalized = normalized.filter((row) => row.league_id === latestLeague);
    const latestCompetition = normalized.at(-1)?.competition;
    if (latestCompetition) normalized = normalized.filter((row) => row.competition === latestCompetition);
  }
  return normalized;
}

function rowValue(row, statId) {
  return finite(row?.stats?.[statId]) ? Number(row.stats[statId]) : null;
}

function thresholdPasses(row, rule) {
  const config = rule.thresholdConfiguration || {};
  if (config.methodMatchesBySport) {
    return (config.methodMatchesBySport[row.sport_id] || []).includes(row.method);
  }
  if (config.methodMatches) return config.methodMatches.includes(row.method);
  if (Array.isArray(config.thresholds)) {
    return rule.requiredStats.every((statId, index) => {
      const value = rowValue(row, statId);
      return value !== null && value >= config.thresholds[index];
    });
  }
  if (config.sumOperator) {
    const values = rule.requiredStats.map((statId) => rowValue(row, statId));
    if (values.some((value) => value === null)) return false;
    return values.reduce((sum, value) => sum + value, 0) >= Number(config.value);
  }
  const value = rowValue(row, rule.requiredStats[0]);
  if (value === null) return false;
  const target = Number(config.value);
  return {
    gt: value > target,
    gte: value >= target,
    lt: value < target,
    lte: value <= target,
    eq: value === target,
  }[config.operator || "gte"] ?? false;
}

export function calculateStreak(rows, rule, { activeOnly = false } = {}) {
  const ordered = normalizeInsightRows(rows, rule);
  if (!ordered.length) return null;
  const streaks = [];
  let current = [];
  ordered.forEach((row) => {
    if (thresholdPasses(row, rule)) current.push(row);
    else if (current.length) {
      streaks.push({ rows: current, active: false });
      current = [];
    }
  });
  if (current.length) streaks.push({ rows: current, active: true });
  const selected = activeOnly
    ? streaks.filter((streak) => streak.active).sort((a, b) => b.rows.length - a.rows.length)[0]
    : streaks.sort((a, b) => b.rows.length - a.rows.length || Number(b.active) - Number(a.active))[0];
  if (!selected) return null;
  return Object.freeze({
    length: selected.rows.length,
    active: selected.active,
    startEventId: selected.rows[0].event_id,
    endEventId: selected.active ? null : selected.rows.at(-1).event_id,
    startDate: selected.rows[0].event_date,
    endDate: selected.active ? null : selected.rows.at(-1).event_date,
    rows: Object.freeze(selected.rows),
    interruptionRule: "Only completed athlete appearances count; postponed, cancelled, duplicate, and non-appearance rows are ignored.",
  });
}

function baseCandidate({
  rule, entity, rows, statIds, claimData, metadata = {}, supportingRows = rows,
  type = rule.insightType, warnings = [],
}) {
  const scope = {
    season: rows.at(-1)?.season || "",
    seasonType: rows.at(-1)?.season_type || "",
    dateRange: rows.length ? { start: rows[0].event_date, end: rows.at(-1).event_date } : {},
    homeAway: null,
    opponentId: null,
  };
  const identity = `${rule.ruleId}|${entity.id}|${statIds.join(",")}|${JSON.stringify(scope)}|${JSON.stringify(claimData)}`;
  return {
    id: `insight-${stableHash(identity)}`,
    ruleId: rule.ruleId,
    type,
    entityType: entity.entityType === "team" ? "team" : "athlete",
    entityIds: Object.freeze([entity.id]),
    entity,
    sportId: entity.sportId,
    leagueId: entity.leagueId,
    competitionId: rows.at(-1)?.competition || null,
    statIds: Object.freeze(statIds),
    scope: Object.freeze(scope),
    claimData: Object.freeze(claimData),
    supportingEventIds: Object.freeze(unique(supportingRows.map((row) => row.event_id))),
    supportingRowIds: Object.freeze(unique(supportingRows.map((row) => row.row_id))),
    comparisonPool: null,
    sampleSize: supportingRows.length,
    coverage: Object.freeze({
      suppliedRows: rows.length,
      completedRows: rows.length,
      status: metadata.partial ? "partial_coverage" : "dataset_only",
      explanation: metadata.partial
        ? "The provider marked this sample as partial."
        : "The claim is limited to completed rows in the available sample dataset.",
    }),
    validationStatus: metadata.providerAsserted ? "provider_asserted"
      : metadata.partial ? "partial_coverage" : metadata.stale ? "stale" : "dataset_only",
    rarity: Object.freeze({}),
    priorityScore: 0,
    confidenceInData: metadata.partial ? 0.45 : metadata.stale ? 0.35 : Math.min(0.9, 0.45 + rows.length * 0.05),
    warnings: Object.freeze(warnings),
    source: Object.freeze({ provider: metadata.source || "EdgeBoard Mock Historical", sample: true }),
    freshness: Object.freeze({ state: metadata.stale ? "stale" : "sample", lastUpdated: metadata.lastUpdated || null }),
    generatedAt: metadata.generatedAt || metadata.lastUpdated || new Date(0).toISOString(),
    calculationRule: rule.description,
    selectionReason: "Eligible rule passed validation and deterministic priority scoring.",
  };
}

function evaluateStreakRule(rule, entity, rows, metadata) {
  const streak = calculateStreak(rows, rule);
  if (!streak || streak.length < Math.max(2, rule.minimumSampleSize - 1)) return null;
  return baseCandidate({
    rule, entity, rows, statIds: rule.requiredStats, metadata, supportingRows: streak.rows,
    claimData: {
      threshold: rule.thresholdConfiguration.value ?? null,
      thresholds: rule.thresholdConfiguration.thresholds || null,
      streakLength: streak.length,
      active: streak.active,
      startEventId: streak.startEventId,
      endEventId: streak.endEventId,
      startDate: streak.startDate,
      endDate: streak.endDate,
      interruptionRule: streak.interruptionRule,
    },
  });
}

function evaluateHighRule(rule, entity, rows, statId, metadata) {
  const values = rows.map((row) => ({ row, value: rowValue(row, statId) })).filter((item) => item.value !== null);
  if (values.length < rule.minimumSampleSize) return null;
  const definition = getStatDefinition(statId);
  const selected = values.sort((left, right) =>
    definition?.higherIsBetter === false ? left.value - right.value : right.value - left.value)[0];
  return baseCandidate({
    rule, entity, rows, statIds: [statId], metadata, supportingRows: values.map((item) => item.row),
    claimData: {
      value: selected.value,
      eventId: selected.row.event_id,
      eventDate: selected.row.event_date,
      extreme: definition?.higherIsBetter === false ? "best-lower-value" : "highest-value",
    },
  });
}

function evaluateTrendRule(rule, entity, rows, statId, metadata) {
  const values = rows.map((row) => ({ row, value: rowValue(row, statId) })).filter((item) => item.value !== null);
  const window = Math.min(rule.thresholdConfiguration.recentWindow || 3, Math.floor(values.length / 2));
  if (values.length < rule.minimumSampleSize || window < 2) return null;
  const recentRows = values.slice(-window);
  const baselineRows = values.slice(0, -window);
  if (baselineRows.length < 2) return null;
  const recentValue = average(recentRows.map((item) => item.value));
  const baselineValue = average(baselineRows.map((item) => item.value));
  if (!finite(recentValue) || !finite(baselineValue)) return null;
  const difference = recentValue - baselineValue;
  const percentDifference = baselineValue === 0 ? null : difference / Math.abs(baselineValue);
  if (percentDifference === null || Math.abs(percentDifference) < rule.thresholdConfiguration.minimumRelativeDifference) return null;
  const definition = getStatDefinition(statId);
  const improvement = definition?.higherIsBetter === false ? difference < 0 : difference > 0;
  const variance = recentRows.reduce((sum, item) => sum + ((item.value - recentValue) ** 2), 0) / recentRows.length;
  return baseCandidate({
    rule, entity, rows, statIds: [statId], metadata, supportingRows: values.map((item) => item.row),
    type: improvement ? "improvement_trend" : "decline_trend",
    claimData: {
      recentValue: round(recentValue), baselineValue: round(baselineValue), difference: round(difference),
      percentDifference: round(percentDifference * 100, 1), recentSampleSize: recentRows.length,
      baselineSampleSize: baselineRows.length, direction: improvement ? "improved" : "declined",
      higherIsBetter: definition?.higherIsBetter !== false, variance: round(variance),
    },
    warnings: [
      ...(recentRows.length !== baselineRows.length ? ["Recent and baseline samples are unequal and are labeled separately."] : []),
      ...(recentRows.length < 3 || baselineRows.length < 3 ? ["At least one trend window is a small sample."] : []),
      "Observed differences do not establish causation.",
    ],
  });
}

function evaluateSplitRule(rule, entity, rows, statId, metadata) {
  const home = rows.filter((row) => row.home_away === "home" && rowValue(row, statId) !== null);
  const away = rows.filter((row) => row.home_away === "away" && rowValue(row, statId) !== null);
  const minimum = rule.thresholdConfiguration.minimumGroupSize || 2;
  if (home.length < minimum || away.length < minimum) return null;
  const homeValue = average(home.map((row) => rowValue(row, statId)));
  const awayValue = average(away.map((row) => rowValue(row, statId)));
  const difference = homeValue - awayValue;
  const relative = awayValue === 0 ? null : Math.abs(difference / awayValue);
  if (relative === null || relative < rule.thresholdConfiguration.minimumRelativeDifference) return null;
  return baseCandidate({
    rule, entity, rows, statIds: [statId], metadata, supportingRows: [...home, ...away],
    claimData: {
      homeValue: round(homeValue), awayValue: round(awayValue), difference: round(difference),
      homeSampleSize: home.length, awaySampleSize: away.length,
    },
  });
}

function evaluateConsistencyRule(rule, entity, rows, statId, metadata) {
  const values = rows.map((row) => rowValue(row, statId)).filter((value) => value !== null);
  if (values.length < rule.minimumSampleSize) return null;
  const mean = average(values);
  if (!finite(mean) || mean === 0) return null;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  const coefficientOfVariation = Math.abs(standardDeviation / mean);
  if (coefficientOfVariation > rule.thresholdConfiguration.maximumCoefficientOfVariation) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = sorted.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
  return baseCandidate({
    rule, entity, rows, statIds: [statId], metadata,
    claimData: {
      mean: round(mean), standardDeviation: round(standardDeviation),
      coefficientOfVariation: round(coefficientOfVariation, 3),
      medianAbsoluteDeviation: round(deviations[Math.floor(deviations.length / 2)]),
      method: "Population standard deviation and coefficient of variation",
    },
  });
}

function evaluateMilestoneRule(rule, entity, rows, statId, metadata) {
  const sequence = getMilestonesForSport(entity.sportId)[statId] || [];
  if (!sequence.length) return null;
  const values = rows.map((row) => rowValue(row, statId)).filter((value) => value !== null);
  if (values.length < rule.minimumSampleSize) return null;
  const currentValue = round(values.reduce((sum, value) => sum + value, 0));
  const reached = [...sequence].reverse().find((target) => currentValue === target);
  const target = reached || sequence.find((item) => item > currentValue);
  if (!target) return null;
  const remaining = Math.max(0, round(target - currentValue));
  if (!reached && remaining / target > rule.thresholdConfiguration.maximumRemainingRatio) return null;
  return baseCandidate({
    rule, entity, rows, statIds: [statId], metadata,
    type: reached ? "milestone_reached" : "milestone_proximity",
    claimData: { currentValue, target, remaining, scopeLabel: "available sample records" },
  });
}

export function evaluateInsightRule(rule, { entity, rows = [], statId = "", metadata = {} } = {}) {
  if (!rule?.enabled || !entity) return null;
  const normalized = normalizeInsightRows(rows, rule);
  if (normalized.length < rule.minimumSampleSize) return null;
  const available = new Set(normalized.flatMap((row) => Object.keys(row.stats || {})));
  if (rule.requiredStats.some((id) => !available.has(id))) return null;
  const resolvedStatId = statId && available.has(statId) ? statId : rule.requiredStats[0] || [...available][0];
  if (!resolvedStatId) return null;
  if (rule.wordingTemplateId === "streak") return evaluateStreakRule(rule, entity, normalized, metadata);
  if (rule.wordingTemplateId === "high" || rule.wordingTemplateId === "record") {
    return evaluateHighRule(rule, entity, normalized, resolvedStatId, metadata);
  }
  if (rule.wordingTemplateId === "trend") return evaluateTrendRule(rule, entity, normalized, resolvedStatId, metadata);
  if (rule.wordingTemplateId === "split") return evaluateSplitRule(rule, entity, normalized, resolvedStatId, metadata);
  if (rule.wordingTemplateId === "consistency") return evaluateConsistencyRule(rule, entity, normalized, resolvedStatId, metadata);
  if (rule.wordingTemplateId === "milestone") return evaluateMilestoneRule(rule, entity, normalized, resolvedStatId, metadata);
  return null;
}

export function getRarityLabel(rate) {
  return RARITY_LABELS.find((boundary) => rate <= boundary.maximumRate) || RARITY_LABELS.at(-1);
}

export function buildRarityContext({ qualifyingEntityCount, comparisonPoolSize, qualifyingEventCount = 0, scope = "", complete = false } = {}) {
  if (!comparisonPoolSize || qualifyingEntityCount < 0) return null;
  const occurrenceRate = qualifyingEntityCount / comparisonPoolSize;
  const label = getRarityLabel(occurrenceRate);
  return Object.freeze({
    comparisonPoolSize,
    qualifyingEntityCount,
    qualifyingEventCount,
    occurrenceRate: round(occurrenceRate, 4),
    percentile: round((1 - occurrenceRate) * 100, 1),
    scope,
    coverageStatus: complete ? "verified_complete" : "dataset_only",
    label: comparisonPoolSize < 5 ? "Small sample" : label.label,
    unique: complete && comparisonPoolSize >= 10 && qualifyingEntityCount === 1,
    warnings: Object.freeze(comparisonPoolSize < 5 ? ["Comparison pool is too small for a strong rarity label."] : []),
  });
}

export function validateInsightCandidate(candidate) {
  if (!candidate || !candidate.id || !candidate.ruleId || !candidate.entityIds?.length) {
    return { valid: false, status: "invalid", reasons: ["Canonical identity or rule metadata is missing."] };
  }
  if (!INSIGHT_VALIDATION_STATES.includes(candidate.validationStatus)) {
    return { valid: false, status: "invalid", reasons: ["Validation state is unknown."] };
  }
  if (!candidate.supportingRowIds.length || !candidate.sampleSize) {
    return { valid: false, status: "incomplete", reasons: ["Supporting completed rows are required."] };
  }
  if (["invalid", "incomplete", "unsupported", "partial_coverage"].includes(candidate.validationStatus)) {
    return { valid: false, status: candidate.validationStatus, reasons: [candidate.coverage?.explanation || "Coverage is insufficient."] };
  }
  return { valid: true, status: candidate.validationStatus, reasons: [] };
}

export function validateRecordCandidate(candidate) {
  const checks = Object.freeze({
    ruleEvaluation: Boolean(candidate?.ruleId),
    coverageEvaluation: Boolean(candidate?.coverage?.status),
    comparisonPoolValidation: Boolean(candidate?.rarity?.comparisonPoolSize),
    duplicateCheck: Boolean(candidate?.id),
    supportingEventValidation: Boolean(candidate?.supportingEventIds?.length),
    recordScopeValidation: ["verified_complete", "provider_asserted", "dataset_only"].includes(candidate?.validationStatus),
    wordingEligibility: ["verified_complete", "provider_asserted"].includes(candidate?.validationStatus),
  });
  const displayEligible = Object.entries(checks)
    .filter(([key]) => key !== "wordingEligibility")
    .every(([, passed]) => passed);
  return Object.freeze({
    checks,
    displayEligible,
    strongRecordLanguageAllowed: checks.wordingEligibility,
    rejectedStrongWordingReason: checks.wordingEligibility
      ? ""
      : "Available rows cannot verify a franchise, league, world, or all-time record.",
  });
}

export function scoreInsightCandidate(candidate, context = {}) {
  const weights = { ...INSIGHT_SCORE_WEIGHTS, ...(context.weights || {}) };
  const rarityScore = candidate.rarity?.percentile ? candidate.rarity.percentile / 100 : 0.35;
  const streakScore = Math.min(1, Number(candidate.claimData.streakLength || 0) / 8);
  const milestoneScore = candidate.type.startsWith("milestone") ? 1 : 0;
  const completeness = candidate.confidenceInData || 0;
  const query = String(context.query || "").toLowerCase();
  const queryRelevance = query && (
    query.includes(candidate.entity?.name?.toLowerCase())
    || candidate.statIds.some((id) => query.includes(getStatDefinition(id)?.displayName?.toLowerCase() || id))
    || query.includes(candidate.type.replaceAll("_", " "))
  ) ? 1 : 0;
  const scopeRelevance = context.leagueId && context.leagueId === candidate.leagueId ? 1 : 0.4;
  const smallSample = candidate.sampleSize < 5 ? 1 : 0;
  const stale = candidate.validationStatus === "stale" || candidate.freshness?.state === "stale" ? 1 : 0;
  const reference = context.now instanceof Date ? context.now : new Date(candidate.generatedAt || 0);
  const latest = new Date(candidate.scope?.dateRange?.end || candidate.generatedAt || 0);
  const ageDays = Number.isNaN(latest.getTime()) || Number.isNaN(reference.getTime())
    ? 365 : Math.max(0, (reference - latest) / 86400000);
  const recencyScore = Math.max(0, 1 - ageDays / 365);
  const priorityWeight = 0.25;
  const positiveWeightTotal = priorityWeight
    + weights.recency
    + weights.rarity
    + weights.streakLength
    + weights.milestone
    + weights.queryRelevance
    + weights.scopeRelevance
    + weights.completeness
    + weights.bettingRelevance;
  const raw = (candidate.rulePriority / 100) * priorityWeight
    + recencyScore * weights.recency
    + rarityScore * weights.rarity
    + streakScore * weights.streakLength
    + milestoneScore * weights.milestone
    + queryRelevance * weights.queryRelevance
    + scopeRelevance * weights.scopeRelevance
    + completeness * weights.completeness
    + Number(Boolean(context.bettingCompatible)) * weights.bettingRelevance
    - smallSample * weights.smallSamplePenalty
    - stale * weights.stalePenalty;
  return round(Math.max(0, Math.min(100, (raw / positiveWeightTotal) * 100)), 1);
}

export function deduplicateInsights(candidates, limit = 8) {
  const selected = [];
  const claimKeys = new Set();
  const exclusive = new Set();
  [...candidates].sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id)).forEach((candidate) => {
    const claimKey = `${candidate.entityIds.join(",")}|${candidate.type}|${candidate.statIds.join(",")}|${JSON.stringify(candidate.claimData)}`;
    if (claimKeys.has(claimKey) || exclusive.has(candidate.ruleId) || selected.length >= limit) return;
    claimKeys.add(claimKey);
    candidate.mutuallyExclusiveRules?.forEach((id) => exclusive.add(id));
    selected.push(candidate);
  });
  return selected;
}

function formatValue(value, statId) {
  if (!finite(value)) return "unavailable";
  const definition = getStatDefinition(statId);
  if (definition?.unit === "ratio") return Number(value).toFixed(3);
  if (definition?.valueType === "percentage") return `${round(value, 1)}%`;
  return Number.isInteger(Number(value)) ? String(value) : String(round(value, 1));
}

export function phraseInsight(candidate) {
  const name = candidate.entity?.name || "This entity";
  const statId = candidate.statIds[0];
  const stat = getStatDefinition(statId);
  const label = stat?.displayName?.toLowerCase() || statId || "statistic";
  const scope = `${candidate.scope.season || "available"} ${candidate.leagueId.toUpperCase()} ${candidate.scope.seasonType || ""}`.trim();
  let headline = `${name} has a supported sample insight`;
  let summary = "The claim is calculated from completed provider rows.";
  if (candidate.type.includes("streak")) {
    headline = `${name} has an ${candidate.claimData.active ? "active" : "available-data"} ${candidate.claimData.streakLength}-event ${label} streak`;
    const threshold = candidate.claimData.threshold;
    summary = threshold === null || threshold === undefined
      ? `${candidate.claimData.streakLength} consecutive completed ${candidate.claimData.streakLength === 1 ? "appearance" : "appearances"} met the configured ${label} rule.`
      : `${name} recorded ${candidate.statIds.length > 1 ? "the configured combination" : `at least ${threshold} ${label}`} in ${candidate.claimData.streakLength} consecutive ${candidate.claimData.streakLength === 1 ? "appearance" : "appearances"}.`;
  } else if (candidate.type === "recent_high" || candidate.type === "season_high" || candidate.type === "record_candidate") {
    const lowerIsBetter = candidate.claimData.extreme === "best-lower-value";
    headline = lowerIsBetter
      ? `${name}'s best available-data ${label} is ${formatValue(candidate.claimData.value, statId)}`
      : `${name}'s available-data high is ${formatValue(candidate.claimData.value, statId)} ${label}`;
    summary = `The value was selected from ${candidate.sampleSize} completed events inside the ${scope} sample.`;
  } else if (candidate.type === "improvement_trend" || candidate.type === "decline_trend") {
    headline = `${name}'s recent ${label} average ${candidate.claimData.direction}`;
    summary = `${formatValue(candidate.claimData.recentValue, statId)} over ${candidate.claimData.recentSampleSize} recent events versus ${formatValue(candidate.claimData.baselineValue, statId)} across ${candidate.claimData.baselineSampleSize} earlier events.`;
  } else if (candidate.type === "home_away_difference") {
    headline = `${name}'s ${label} differs between home and away samples`;
    summary = `${formatValue(candidate.claimData.homeValue, statId)} at home (${candidate.claimData.homeSampleSize}) versus ${formatValue(candidate.claimData.awayValue, statId)} away (${candidate.claimData.awaySampleSize}).`;
  } else if (candidate.type === "consistency_insight") {
    headline = `${name}'s ${label} stayed within a narrow sample range`;
    summary = `Standard deviation ${candidate.claimData.standardDeviation} across ${candidate.sampleSize} completed events; consistency does not imply betting value.`;
  } else if (candidate.type === "milestone_reached") {
    headline = `${name} reached ${candidate.claimData.target} ${label} in available records`;
    summary = `Current available-records total: ${candidate.claimData.currentValue}.`;
  } else if (candidate.type === "milestone_proximity") {
    headline = `${name} is ${candidate.claimData.remaining} away from ${candidate.claimData.target} ${label}`;
    summary = `Current total: ${candidate.claimData.currentValue} within the available sample records.`;
  }
  const disclosure = candidate.validationStatus === "provider_asserted"
    ? `Provider-asserted claim · ${scope}`
    : `True only within the available sample dataset · ${scope}`;
  const prohibited = /\b(guaranteed|lock|can'?t miss|unstoppable|historic|record-breaking)\b/i;
  if (prohibited.test(`${headline} ${summary}`)) throw new Error("Insight phrasing contains prohibited unsupported language.");
  const sourceLabel = candidate.source.attribution || candidate.source.provider;
  return Object.freeze({
    headline,
    shortSummary: summary,
    detailedExplanation: `${summary} Sample size: ${candidate.sampleSize}. ${disclosure}.`,
    supportingDataLabel: "View supporting data",
    validationDisclosure: disclosure,
    sourceLabel,
    sharingCaption: `${headline}. ${summary} ${disclosure}. Source: ${sourceLabel}. Sample data.`,
  });
}
