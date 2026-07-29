import { getStatDefinition } from "../config/stat-registry.js";
import { average, maximum, statValues, thresholdHitCount } from "./stat-calculations.js";

const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const round = (value, places = 1) => Number(Number(value).toFixed(places));

function baseInsight(ruleId, entity, rows, statId, metadata, extra = {}) {
  const supportingRows = extra.supportingRows || rows;
  return Object.freeze({
    ruleId,
    athleteId: entity.id,
    entityId: entity.id,
    type: extra.type || ruleId.replaceAll("-", "_"),
    title: extra.title || "Sample statistical insight",
    statId,
    calculatedClaimData: Object.freeze(extra.claim || {}),
    supportingEventIds: Object.freeze(supportingRows.map((row) => row.event_id).filter(Boolean)),
    supportingRowIds: Object.freeze(supportingRows.map((row) => row.row_id).filter(Boolean)),
    comparisonPopulation: extra.comparisonPopulation || "Athlete sample rows",
    sampleSize: extra.sampleSize ?? supportingRows.length,
    dateRange: metadata.dateRangeUsed || null,
    calculationMethod: extra.calculationMethod || "Deterministic calculation from completed provider rows",
    source: metadata.source || "EdgeBoard Mock Historical",
    freshness: metadata.dataFreshness || "sample-snapshot",
    lastUpdated: metadata.lastUpdated || null,
    warnings: Object.freeze(extra.warnings || []),
    dataCompletenessConfidence: extra.dataCompletenessConfidence || "sample-only",
    selectionReason: extra.selectionReason || "Supported by available completed sample rows.",
    label: extra.label || extra.title || "Sample statistical insight",
  });
}
function recentHighInsight(entity, rows, statId, metadata) {
  const values = statValues(rows, statId);
  const value = maximum(values);
  const supportingRow = [...rows].reverse().find((row) => finite(row.stats?.[statId]) && Number(row.stats[statId]) === value);
  const label = getStatDefinition(statId)?.displayName || statId;
  return baseInsight("recent-high", entity, rows, statId, metadata, {
    type: "recent_high",
    title: `Recent sample high: ${value} ${label.toLowerCase()}`,
    label: `Sample insight: recent high of ${value}.`,
    claim: { value },
    supportingRows: supportingRow ? [supportingRow] : [],
    sampleSize: values.length,
    selectionReason: "The maximum observed value is useful recent-form context.",
  });
}

function thresholdStreakInsight(entity, rows, statId, metadata) {
  const values = statValues(rows, statId);
  const threshold = Math.floor(maximum(values) * 0.8);
  const ordered = [...rows].sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
  const streakRows = [];
  for (const row of ordered) {
    if (!finite(row.stats?.[statId]) || Number(row.stats[statId]) < threshold) break;
    streakRows.push(row);
  }
  const hits = thresholdHitCount(rows, statId, "gte", threshold);
  if (hits.sampleSize < 3 || (streakRows.length < 2 && hits.hitCount < 2)) return null;
  const title = streakRows.length >= 2
    ? `${streakRows.length} straight sample events with at least ${threshold}`
    : `At least ${threshold} in ${hits.hitCount} of ${hits.sampleSize} sample events`;
  return baseInsight("threshold-streak", entity, rows, statId, metadata, {
    type: "threshold_streak",
    title,
    label: `Sample insight: reached ${threshold} in ${hits.hitCount} of ${hits.sampleSize} sample events.`,
    claim: { threshold, streakLength: streakRows.length, hitCount: hits.hitCount },
    supportingRows: streakRows.length >= 2
      ? streakRows
      : rows.filter((row) => finite(row.stats?.[statId]) && Number(row.stats[statId]) >= threshold),
    sampleSize: hits.sampleSize,
    calculationMethod: "Ordered completed rows newest first, then counted consecutive threshold hits",
    selectionReason: "A repeated threshold result was present in at least two completed sample events.",
  });
}

function homeAwayInsight(entity, rows, statId, metadata) {
  const homeRows = rows.filter((row) => row.home_away === "home" && finite(row.stats?.[statId]));
  const awayRows = rows.filter((row) => row.home_away === "away" && finite(row.stats?.[statId]));
  if (homeRows.length < 2 || awayRows.length < 2) return null;
  const homeAverage = average(homeRows.map((row) => row.stats[statId]));
  const awayAverage = average(awayRows.map((row) => row.stats[statId]));
  const difference = round(homeAverage - awayAverage);
  if (!finite(difference) || difference === 0) return null;
  return baseInsight("home-away-difference", entity, rows, statId, metadata, {
    type: "home_away_difference",
    title: `${Math.abs(difference)} ${difference > 0 ? "higher at home" : "higher away"} in the sample`,
    label: `Sample insight: home average ${round(homeAverage)} versus away average ${round(awayAverage)}.`,
    claim: { homeAverage: round(homeAverage), awayAverage: round(awayAverage), difference },
    supportingRows: [...homeRows, ...awayRows],
    sampleSize: homeRows.length + awayRows.length,
    comparisonPopulation: `${homeRows.length} home and ${awayRows.length} away sample events`,
    selectionReason: "Both home and away groups contain at least two completed sample events.",
  });
}

function varianceInsight(entity, rows, statId, metadata) {
  const values = statValues(rows, statId);
  if (values.length < 4) return null;
  const mean = average(values);
  if (!finite(mean) || mean === 0) return null;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  const coefficient = Math.abs(standardDeviation / mean);
  if (coefficient < 0.35) return null;
  return baseInsight("high-variance", entity, rows, statId, metadata, {
    type: "high_variance",
    title: "High variation across recent sample events",
    label: `Sample insight: results varied by a standard deviation of ${round(standardDeviation)} around a ${round(mean)} average.`,
    claim: { average: round(mean), standardDeviation: round(standardDeviation), coefficientOfVariation: round(coefficient, 2) },
    sampleSize: values.length,
    warnings: ["Variation describes the supplied sample and is not a prediction."],
    selectionReason: "Coefficient of variation exceeded the deterministic 0.35 threshold.",
  });
}

export function createInsightCandidates(entity, rows, statId, metadata = {}) {
  if (!entity || !Array.isArray(rows) || !rows.length || !statId) return [];
  const values = statValues(rows, statId);
  if (!values.length) return [];
  const candidates = [
    recentHighInsight(entity, rows, statId, metadata),
    thresholdStreakInsight(entity, rows, statId, metadata),
    homeAwayInsight(entity, rows, statId, metadata),
    varianceInsight(entity, rows, statId, metadata),
  ].filter(Boolean);
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.ruleId}:${candidate.statId}:${JSON.stringify(candidate.calculatedClaimData)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}
