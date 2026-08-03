import {
  getVisualizationDefinition,
  getVisualizationDefinitions,
} from "../config/visualization-registry.js";
import { getProviderVisualizationCapabilities } from "../config/provider-visualization-capabilities.js";
import { mockVisualizationProviderPayload } from "../data/mock-visualization-provider.js";
import { evaluateEdgeTrust } from "./edge-trust-service.js";

const SPATIAL_TYPES = new Set([
  "shot_chart", "shot_map", "spray_chart", "pitch_location_map", "heat_map",
  "corner_map", "golf_dispersion_map", "scatter_plot", "track_map",
]);
const TIMELINE_TYPES = new Set([
  "timeline", "event_sequence", "takedown_map", "fight_timeline",
  "tennis_match_flow", "pit_stop_timeline",
]);
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const numeric = (value) => value !== null && value !== "" && Number.isFinite(Number(value));
const unique = (values) => [...new Set(values.filter(Boolean))];

function abortError() {
  return new DOMException("Visualization request was cancelled.", "AbortError");
}

function delay(signal, milliseconds) {
  if (signal?.aborted) return Promise.reject(abortError());
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

export function buildVisualizationRequest(input = {}) {
  const dateRange = input.dateRange && typeof input.dateRange === "object"
    ? input.dateRange : { type: "last_n_games", value: 10 };
  return Object.freeze({
    visualizationType: String(input.visualizationType || "line_chart"),
    sportId: String(input.sportId || ""),
    leagueId: String(input.leagueId || ""),
    entityType: String(input.entityType || "athlete"),
    entityIds: Object.freeze(unique(input.entityIds || [])),
    eventIds: Object.freeze(unique(input.eventIds || [])),
    statIds: Object.freeze(unique(input.statIds || [])),
    dateRange: Object.freeze({
      type: String(dateRange.type || "last_n_games"),
      value: dateRange.value ?? 10,
      start: dateRange.start || null,
      end: dateRange.end || null,
    }),
    filters: Object.freeze({
      homeAway: input.filters?.homeAway || null,
      opponentIds: Object.freeze(unique(input.filters?.opponentIds || [])),
      period: input.filters?.period ?? null,
      round: input.filters?.round ?? null,
      madeMissed: input.filters?.madeMissed || "all",
      zoneIds: Object.freeze(unique(input.filters?.zoneIds || [])),
      strengthState: input.filters?.strengthState || "",
      onTargetOnly: input.filters?.onTargetOnly === true,
      pitchType: input.filters?.pitchType || "",
      handedness: input.filters?.handedness || "",
      threshold: numeric(input.filters?.threshold) ? Number(input.filters.threshold) : null,
      seriesIds: Object.freeze(unique(input.filters?.seriesIds || [])),
    }),
    comparisonMode: input.comparisonMode || null,
    includeLeagueBaseline: input.includeLeagueBaseline === true,
    includeBettingContext: input.includeBettingContext === true,
  });
}

export function validateVisualizationRequest(request, capabilityRecord = getProviderVisualizationCapabilities()) {
  const definition = getVisualizationDefinition(request.visualizationType);
  const errors = [];
  const warnings = [];
  if (!definition) errors.push(`Unknown visualization type: ${request.visualizationType}.`);
  if (definition && !definition.implemented) errors.push(`${definition.label} is represented but not implemented in this phase.`);
  if (definition?.sports.length && request.sportId && !definition.sports.includes(request.sportId)) {
    errors.push(`${definition.label} is not compatible with ${request.sportId}.`);
  }
  if (definition && request.entityType && !definition.entityTypes.includes(request.entityType)) {
    errors.push(`${definition.label} is not compatible with ${request.entityType}.`);
  }
  if (request.dateRange.type === "custom") {
    const start = new Date(request.dateRange.start).getTime();
    const end = new Date(request.dateRange.end).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      errors.push("Custom visualization date range is invalid.");
    }
  }
  const missingCapabilities = definition
    ? definition.requiredCapabilities.filter((capability) => capabilityRecord.capabilities[capability] !== true)
    : [];
  if (missingCapabilities.length) {
    errors.push(`Provider is missing ${missingCapabilities.join(", ")}.`);
  }
  if (!request.entityIds.length && !request.eventIds.length && !["correlation_matrix"].includes(request.visualizationType)) {
    warnings.push("No canonical entity or event was supplied; provider-default sample scope will be used.");
  }
  return Object.freeze({
    valid: errors.length === 0,
    definition,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    missingCapabilities: Object.freeze(missingCapabilities),
  });
}

function filterRows(rows, request) {
  const filters = request.filters;
  const filtered = rows.filter((row) => {
    if (request.dateRange.type === "custom" && row.timestamp) {
      const timestamp = new Date(row.timestamp).getTime();
      const start = request.dateRange.start ? new Date(request.dateRange.start).getTime() : -Infinity;
      const end = request.dateRange.end ? new Date(request.dateRange.end).getTime() : Infinity;
      if (!Number.isFinite(timestamp) || timestamp < start || timestamp > end) return false;
    }
    if (filters.homeAway && row.homeAway && row.homeAway !== filters.homeAway) return false;
    if (filters.opponentIds.length && row.opponentId && !filters.opponentIds.includes(row.opponentId)) return false;
    if (filters.period !== null && row.period !== undefined && Number(row.period) !== Number(filters.period)) return false;
    if (filters.round !== null && row.round !== undefined && Number(row.round) !== Number(filters.round)) return false;
    if (filters.madeMissed !== "all" && row.outcome) {
      if (filters.madeMissed === "made" && !["made", "goal"].includes(row.outcome)) return false;
      if (filters.madeMissed === "missed" && ["made", "goal"].includes(row.outcome)) return false;
    }
    if (filters.zoneIds.length && row.zoneId && !filters.zoneIds.includes(row.zoneId)) return false;
    if (filters.strengthState && row.strengthState && row.strengthState !== filters.strengthState) return false;
    if (filters.onTargetOnly && row.onTarget !== true && !["goal", "saved"].includes(row.outcome)) return false;
    if (filters.pitchType && row.pitchType !== filters.pitchType) return false;
    if (filters.handedness && row.handedness !== filters.handedness) return false;
    if (filters.seriesIds.length && row.seriesId && !filters.seriesIds.includes(row.seriesId)) return false;
    return true;
  });
  const windowSize = request.dateRange.type === "last_n_games" ? Number(request.dateRange.value) : 0;
  return windowSize > 0 && !SPATIAL_TYPES.has(request.visualizationType)
    ? filtered.slice(-windowSize * Math.max(1, unique(filtered.map((row) => row.seriesId)).length))
    : filtered;
}

export function validateVisualizationData(definition, rows, dataset = {}) {
  const warnings = [];
  const seen = new Set();
  const validRows = [];
  rows.forEach((row) => {
    if (!row || typeof row !== "object") {
      warnings.push("A malformed visualization row was excluded.");
      return;
    }
    if (row.row_id && seen.has(row.row_id)) {
      warnings.push(`Duplicate row ${row.row_id} was excluded.`);
      return;
    }
    if (row.row_id) seen.add(row.row_id);
    if (SPATIAL_TYPES.has(definition.id)) {
      if (!numeric(row.x) || !numeric(row.y) || Number(row.x) < 0 || Number(row.x) > 100 || Number(row.y) < 0 || Number(row.y) > 100) {
        warnings.push(`A row with invalid or out-of-bounds coordinates was excluded.`);
        return;
      }
    }
    if (definition.id === "passing_network") {
      const coordinates = [row.fromX, row.fromY, row.toX, row.toY];
      if (coordinates.some((value) => !numeric(value) || Number(value) < 0 || Number(value) > 100)) {
        warnings.push("A passing-network row with invalid or out-of-bounds coordinates was excluded.");
        return;
      }
    }
    const validOutcomes = {
      shot_chart: ["made", "missed"],
      shot_map: ["goal", "saved", "blocked", "missed"],
      spray_chart: ["single", "double", "triple", "home-run", "out", "foul"],
      corner_map: ["cleared", "first-contact", "shot-generated", "goal-generated"],
    }[definition.id];
    if (validOutcomes && row.outcome && !validOutcomes.includes(row.outcome)) {
      warnings.push("A row with an unsupported outcome state was excluded.");
      return;
    }
    if (TIMELINE_TYPES.has(definition.id) || ["line_chart", "threshold_chart", "market_line_chart", "odds_movement_chart"].includes(definition.id)) {
      if (row.timestamp && Number.isNaN(new Date(row.timestamp).getTime())) {
        warnings.push("A row with an invalid timestamp was excluded.");
        return;
      }
    }
    if (definition.id === "race_position_chart" && (!numeric(row.position) || Number(row.position) < 1 || Number(row.position) > 60)) {
      warnings.push("An invalid race position was excluded.");
      return;
    }
    if (["market_line_chart", "odds_movement_chart"].includes(definition.id)
      && (!row.timestamp || !numeric(row.value))) {
      warnings.push("A market-history row without a valid timestamp and value was excluded.");
      return;
    }
    if (definition.id === "lap_time_chart" && row.valid === false && !row.pitLap) {
      warnings.push("An invalid lap was excluded.");
      return;
    }
    validRows.push(Object.freeze({ ...row }));
  });

  if (definition.id === "telemetry_chart") {
    const groups = new Map();
    validRows.forEach((row) => {
      const key = `${row.seriesId || ""}:${row.metric || ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    groups.forEach((group) => {
      for (let index = 1; index < group.length; index += 1) {
        if (Number(group[index].distance) < Number(group[index - 1].distance)) {
          warnings.push("Unordered telemetry samples were sorted by distance.");
          group.sort((left, right) => Number(left.distance) - Number(right.distance));
          break;
        }
      }
    });
    validRows.sort((left, right) => String(left.seriesId || "").localeCompare(String(right.seriesId || ""))
      || String(left.metric || "").localeCompare(String(right.metric || ""))
      || Number(left.distance) - Number(right.distance));
  }
  if (["market_line_chart", "odds_movement_chart"].includes(definition.id)) {
    const identities = unique(validRows.map((row) => row.marketId));
    if (identities.length > 1) warnings.push("Multiple market identities were excluded from a single-history visualization.");
    const primary = identities[0];
    for (let index = validRows.length - 1; index >= 0; index -= 1) {
      if (primary && validRows[index].marketId !== primary) validRows.splice(index, 1);
    }
    const groups = new Map();
    validRows.forEach((row) => {
      const key = row.sportsbook || "market";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    groups.forEach((group) => {
      const ordered = group.every((row, index) => index === 0
        || new Date(row.timestamp).getTime() >= new Date(group[index - 1].timestamp).getTime());
      if (!ordered) {
        warnings.push("Unordered market-history timestamps were sorted chronologically.");
        group.sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
      }
    });
    validRows.sort((left, right) => String(left.sportsbook || "").localeCompare(String(right.sportsbook || ""))
      || new Date(left.timestamp) - new Date(right.timestamp));
  }

  const requiredMissing = definition.requiredFields.filter((field) =>
    !validRows.some((row) => row[field] !== null && row[field] !== undefined && row[field] !== ""));
  if (requiredMissing.length) warnings.push(`Required data is missing: ${requiredMissing.join(", ")}.`);
  if (dataset.unit === "mixed") warnings.push("Mixed units cannot share one numeric axis.");
  return Object.freeze({
    validRows: Object.freeze(validRows),
    warnings: Object.freeze(unique(warnings)),
    requiredMissing: Object.freeze(requiredMissing),
    valid: validRows.length >= definition.minimumSampleSize && requiredMissing.length === 0,
  });
}

function summaryMetrics(rows, request, unit) {
  const values = rows.map((row) => Number(row.value)).filter(Number.isFinite);
  if (!values.length) return [];
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const threshold = request.filters.threshold
    ?? rows.find((row) => numeric(row.threshold))?.threshold
    ?? null;
  return [
    { id: "average", label: "Average", value: average, unit },
    { id: "median", label: "Median", value: median, unit },
    { id: "minimum", label: "Minimum", value: Math.min(...values), unit },
    { id: "maximum", label: "Maximum", value: Math.max(...values), unit },
    ...(numeric(threshold) ? [{
      id: "threshold", label: "Above threshold", value: values.filter((value) => value > Number(threshold)).length,
      unit: `of ${values.length}`, threshold: Number(threshold),
    }] : []),
  ].map(Object.freeze);
}

function seriesForRows(rows, type) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const id = row.seriesId || row.sportsbook || "primary";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(Object.freeze({
      id: row.row_id,
      x: row.timestamp || row.lap || row.hole || row.distance || row.label || index + 1,
      y: row.value,
      value: row.value,
      label: row.label || `Point ${index + 1}`,
      raw: row,
    }));
  });
  const base = [...groups.entries()].map(([id, points]) => Object.freeze({
    id,
    label: id === "primary" ? "Observed" : id,
    points: Object.freeze(points.length > 240
      ? points.filter((_, index) => index % Math.ceil(points.length / 240) === 0 || index === points.length - 1)
      : points),
  }));
  if (type !== "rolling_average_chart") return base;
  return Object.freeze(base.flatMap((series) => {
    const rolling = series.points.map((point, index, points) => {
      const window = points.slice(Math.max(0, index - 2), index + 1).map((item) => Number(item.y)).filter(Number.isFinite);
      return Object.freeze({ ...point, id: `${point.id}-rolling`, y: window.length ? window.reduce((sum, value) => sum + value, 0) / window.length : null });
    });
    return [series, Object.freeze({ id: `${series.id}-rolling`, label: `${series.label} · rolling average`, points: Object.freeze(rolling) })];
  }));
}

function tableForRows(rows, definition) {
  const preferred = definition.family === "spatial"
    ? ["label", "x", "y", "outcome", "zoneId", "eventKind", "value"]
    : definition.family === "timeline"
      ? ["timestamp", "label", "eventKind", "round", "period", "value"]
      : ["timestamp", "lap", "hole", "label", "seriesId", "value", "position", "threshold"];
  const columns = preferred.filter((column) => rows.some((row) => row[column] !== undefined));
  return Object.freeze({
    caption: `${definition.label} source data`,
    columns: Object.freeze(columns),
    rows: Object.freeze(rows.map((row) => Object.freeze(columns.map((column) => row[column] ?? "Unavailable")))),
  });
}

function accessibleSummary(definition, rows, metrics, dataset, warnings) {
  const prefix = `${definition.label}. ${rows.length} valid sample row${rows.length === 1 ? "" : "s"} from ${dataset.source}.`;
  const metricText = metrics.length
    ? ` Average ${Number(metrics[0].value).toFixed(1)} ${dataset.unit}; range ${metrics[2].value} to ${metrics[3].value}.`
    : "";
  const spatialText = SPATIAL_TYPES.has(definition.id)
    ? " Coordinates are provider-supplied fictional sample coordinates in the disclosed neutral coordinate system."
    : "";
  const warningText = warnings.length ? ` ${warnings.length} validation warning${warnings.length === 1 ? "" : "s"} disclosed.` : "";
  return `${prefix}${metricText}${spatialText}${warningText}`;
}

function unavailableResult(request, validation, provider, reason, fallback = null) {
  const edgeTrust = evaluateEdgeTrust({
    components: { visualizations: "unavailable", freshness: provider.lastUpdatedAt ? "stale" : "unavailable", coverage: 0, identity: request.entityIds?.length ? "verified" : "pending", completeness: 0 },
    applicable: ["visualizations", "freshness", "coverage", "identity", "completeness"],
    sample: provider.sample === true,
    lastValidation: provider.lastUpdatedAt,
  });
  return Object.freeze({
    status: "unavailable",
    type: "unavailable",
    requestedType: request.visualizationType,
    title: validation.definition?.label || "Visualization unavailable",
    subtitle: "Unavailable from current provider",
    scope: Object.freeze({ ...request }),
    dateRange: request.dateRange,
    coordinateSystem: null,
    series: Object.freeze([]),
    points: Object.freeze([]),
    zones: Object.freeze([]),
    annotations: Object.freeze([]),
    summaryMetrics: Object.freeze([]),
    sampleSize: 0,
    coverage: Object.freeze({ sample: provider.sample, partial: true }),
    validationStatus: "unavailable",
    dataFreshness: Object.freeze({ status: "unknown", lastUpdatedAt: provider.lastUpdatedAt }),
    sources: Object.freeze([{ provider: provider.providerName, sample: provider.sample, lastUpdatedAt: provider.lastUpdatedAt }]),
    warnings: Object.freeze(unique([reason, ...validation.errors, ...validation.warnings])),
    accessibleSummary: `${validation.definition?.label || "Requested visualization"} is unavailable. ${reason}`,
    fallbackPresentation: Object.freeze({
      type: fallback?.id || validation.definition?.fallbackType || "unavailable",
      label: fallback?.label || "No supported fallback",
      available: Boolean(fallback),
    }),
    table: Object.freeze({ caption: "No visualization data", columns: Object.freeze([]), rows: Object.freeze([]) }),
    edgeTrust,
  });
}

export class VisualizationRepository {
  constructor(payload = mockVisualizationProviderPayload, options = {}) {
    this.payload = payload;
    this.provider = getProviderVisualizationCapabilities(payload.provider_id);
    this.datasets = Array.isArray(payload.datasets) ? payload.datasets : [];
    this.cache = new Map();
    this.inflight = new Map();
    this.delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 80;
    this.providerCalls = 0;
  }

  getVisualizationCapabilities() {
    return this.provider;
  }

  getAvailableVisualizations({ sportId = "", entityType = "", entityIds = [] } = {}) {
    return getVisualizationDefinitions({ sportId, entityType, implementedOnly: false }).map((definition) => {
      const capable = definition.requiredCapabilities.every((key) => this.provider.capabilities[key] === true);
      const datasetAvailable = this.datasets.some((dataset) =>
        dataset.visualization_type === definition.id
        && (!sportId || dataset.sport_id === sportId)
        && (!entityIds.length || entityIds.some((id) => dataset.entity_ids.includes(id))));
      return Object.freeze({
        ...definition,
        available: definition.implemented && capable && datasetAvailable,
        capabilityAvailable: capable,
        datasetAvailable,
      });
    });
  }

  getDiagnostics() {
    return Object.freeze({ providerCalls: this.providerCalls, cacheSize: this.cache.size, inflight: this.inflight.size });
  }

  clearCache() {
    this.cache.clear();
  }

  async getVisualizationData(input, { signal, force = false } = {}) {
    const request = buildVisualizationRequest(input);
    const key = JSON.stringify(request);
    if (!force && this.cache.has(key)) return this.cache.get(key);
    if (!force && this.inflight.has(key)) {
      const result = await this.inflight.get(key);
      if (signal?.aborted) throw abortError();
      return result;
    }
    const task = this.load(request, signal);
    this.inflight.set(key, task);
    try {
      const result = await task;
      this.cache.set(key, result);
      return result;
    } finally {
      if (this.inflight.get(key) === task) this.inflight.delete(key);
    }
  }

  async load(request, signal) {
    this.providerCalls += 1;
    await delay(signal, this.delayMs);
    const validation = validateVisualizationRequest(request, this.provider);
    if (!validation.valid) {
      const fallback = getVisualizationDefinition(validation.definition?.fallbackType);
      return unavailableResult(request, validation, this.provider, validation.errors[0] || "Request is unsupported.", fallback?.implemented ? fallback : null);
    }
    const sourceTypes = ["rolling_average_chart", "distribution_plot"].includes(request.visualizationType)
      ? [request.visualizationType, "line_chart"] : [request.visualizationType];
    const candidates = this.datasets.filter((dataset) =>
      sourceTypes.includes(dataset.visualization_type)
      && (!request.sportId || dataset.sport_id === request.sportId)
      && (!request.leagueId || !dataset.league_id || dataset.league_id === request.leagueId)
      && (!request.entityIds.length || request.entityIds.some((id) => dataset.entity_ids.includes(id)))
      && (!request.eventIds.length || request.eventIds.some((id) => dataset.event_ids.includes(id))));
    const dataset = candidates[0];
    if (!dataset) {
      const fallback = this.getAvailableVisualizations({
        sportId: request.sportId,
        entityType: request.entityType,
        entityIds: request.entityIds,
      }).find((item) => item.available && item.id === validation.definition.fallbackType);
      return unavailableResult(
        request,
        validation,
        this.provider,
        `No ${validation.definition.label.toLowerCase()} rows exist for this sample scope. Required fields: ${validation.definition.requiredFields.join(", ")}.`,
        fallback || null,
      );
    }
    const filtered = filterRows(dataset.rows, request);
    const checked = validateVisualizationData(validation.definition, filtered, dataset);
    if (!checked.valid) {
      return unavailableResult(
        request,
        validation,
        this.provider,
        checked.requiredMissing.length
          ? `The provider did not supply ${checked.requiredMissing.join(", ")}.`
          : `Only ${checked.validRows.length} valid row${checked.validRows.length === 1 ? "" : "s"} remained; ${validation.definition.minimumSampleSize} required.`,
        null,
      );
    }
    const rows = checked.validRows;
    const metrics = summaryMetrics(rows, request, dataset.unit);
    const timestamp = new Date(dataset.last_updated_at).getTime();
    const stale = !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_AFTER_MS;
    const warnings = unique([
      ...validation.warnings,
      ...checked.warnings,
      dataset.partial ? "Provider returned partial visualization coverage." : "",
      stale ? "Visualization source timestamp is stale." : "",
      rows.length > 240 ? "Displayed chart points were decimated for performance; the accessible table and summary use the complete validated sample." : "",
      dataset.sample ? "Illustrative sample data; not live analysis." : "",
      validation.definition.id === "matchup_radar" ? "Normalized radar dimensions are descriptive sample indices, not a predictive model." : "",
      validation.definition.id === "correlation_matrix" ? "Historical correlation does not imply causation or a joint probability." : "",
    ]);
    const edgeTrust = evaluateEdgeTrust({
      components: {
        visualizations: "verified", freshness: stale ? "stale" : "fresh",
        coverage: dataset.partial ? .55 : 1, identity: request.entityIds.length ? "verified" : "pending",
        completeness: checked.validRows.length / Math.max(checked.validRows.length, filtered.length || 1),
      },
      applicable: ["visualizations", "freshness", "coverage", "identity", "completeness"],
      sample: dataset.sample === true,
      lastValidation: dataset.last_updated_at,
    });
    return Object.freeze({
      status: "ready",
      type: validation.definition.id,
      family: validation.definition.family,
      title: dataset.title || validation.definition.label,
      subtitle: "Sample data",
      scope: Object.freeze({
        sportId: dataset.sport_id,
        leagueId: dataset.league_id,
        entityType: dataset.entity_type,
        entityIds: dataset.entity_ids,
        eventIds: dataset.event_ids,
        statIds: dataset.stat_ids,
      }),
      dateRange: request.dateRange,
      coordinateSystem: dataset.coordinate_system ? Object.freeze({
        id: dataset.coordinate_system,
        xDomain: Object.freeze([0, 100]),
        yDomain: Object.freeze([0, 100]),
        providerSupplied: true,
      }) : null,
      series: Object.freeze(seriesForRows(rows, validation.definition.id)),
      points: rows,
      zones: Object.freeze(rows.filter((row) => row.zoneId)),
      annotations: Object.freeze(rows.filter((row) => row.pitStop || row.caution || row.stage || row.eventKind)),
      summaryMetrics: Object.freeze(metrics),
      sampleSize: rows.length,
      coverage: Object.freeze({ sample: dataset.sample === true, partial: dataset.partial === true }),
      validationStatus: dataset.validation_status || "dataset_only",
      dataFreshness: Object.freeze({
        status: stale ? "stale" : "fresh",
        lastUpdatedAt: dataset.last_updated_at,
      }),
      sources: Object.freeze([Object.freeze({
        provider: this.provider.providerName,
        providerId: dataset.source,
        sample: dataset.sample === true,
        lastUpdatedAt: dataset.last_updated_at,
      })]),
      warnings: Object.freeze(warnings),
      accessibleSummary: accessibleSummary(validation.definition, rows, metrics, dataset, warnings),
      fallbackPresentation: Object.freeze({ type: "table", label: "Accessible data table", available: true }),
      table: tableForRows(rows, validation.definition),
      request,
      unit: dataset.unit,
      interactions: validation.definition.interactions,
      edgeTrust,
    });
  }
}

export function createVisualizationRepository(payload = mockVisualizationProviderPayload, options) {
  return new VisualizationRepository(payload, options);
}

export function visualizationTableToTsv(result) {
  if (!result?.table?.columns?.length) return "";
  return [
    result.table.columns.join("\t"),
    ...result.table.rows.map((row) => row.map((value) => String(value ?? "")).join("\t")),
    "",
    `Source\t${result.sources[0]?.provider || "Unavailable"}`,
    `Sample data\t${result.coverage.sample ? "Yes" : "No"}`,
    `Sample size\t${result.sampleSize}`,
  ].join("\n");
}

const safeCsvCell = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function visualizationTableToCsv(result) {
  if (!result?.table?.columns?.length) return "";
  return [
    ["Visualization", result.title],
    ["Source", result.sources[0]?.provider || "Unavailable"],
    ["Sample data", result.coverage.sample ? "Yes" : "No"],
    ["Sample size", result.sampleSize],
    [],
    result.table.columns,
    ...result.table.rows,
  ].map((row) => row.map(safeCsvCell).join(",")).join("\n");
}
