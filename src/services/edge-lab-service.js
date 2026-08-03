import { evaluateEdgeTrust, researchQualityLabel } from "./edge-trust-service.js";

export const EDGE_LAB_SCHEMA_VERSION = 1;
export const EDGE_LAB_CLASSIFICATIONS = Object.freeze({
  historical: "historical_fact",
  provider: "current_provider_data",
  model: "model_output",
  assumption: "scenario_assumption",
  simulation: "future_simulation",
});

const clone = (value, fallback = null) => {
  try { return structuredClone(value); } catch {
    try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
  }
};

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const nowIso = (clock) => new Date(clock()).toISOString();
const finite = (value) => Number.isFinite(Number(value));
const cleanText = (value, limit = 5000) => String(value || "").trim().slice(0, limit);

function scenarioId(clock, random) {
  return `edge-lab-${clock().toString(36)}-${Math.floor(random() * 1e9).toString(36)}`;
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return { number: value, unit: "" };
  const text = String(value ?? "").trim();
  const match = text.match(/^([+-]?\d+(?:\.\d+)?)\s*([\s\S]*)$/);
  return match ? { number: Number(match[1]), unit: match[2] } : null;
}

function displayValue(value, unit = "") {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return unit ? `${rounded} ${unit}` : rounded;
}

function applyOperation(before, operation, operand) {
  if (operation === "set") return operand;
  if (operation === "add") return before + operand;
  if (operation === "percent") return before * (1 + operand / 100);
  return null;
}

function normalizeAssumption(input, index, scenario, clock) {
  const targetType = ["evidence", "market"].includes(input?.targetType) ? input.targetType : "";
  const kind = targetType === "market"
    ? (["market_line", "market_odds"].includes(input?.kind) ? input.kind : "market_line")
    : "evidence_adjustment";
  return {
    id: cleanText(input?.id, 160) || `assumption-${scenario.id}-${index + 1}`,
    targetType,
    targetId: cleanText(input?.targetId, 240),
    kind,
    operation: ["set", "add", "percent"].includes(input?.operation) ? input.operation : "set",
    value: Number(input?.value),
    rationale: cleanText(input?.rationale, 2000) || "User-supplied sandbox assumption.",
    horizon: input?.horizon === "future" ? "future" : "current",
    classification: input?.horizon === "future"
      ? EDGE_LAB_CLASSIFICATIONS.simulation : EDGE_LAB_CLASSIFICATIONS.assumption,
    createdAt: input?.createdAt || nowIso(clock),
  };
}

function marketId(market) {
  return String(market?.selectionId || market?.id || "");
}

function evidenceClassification(item) {
  if (["projection", "edge", "model-confidence"].includes(item?.type)) return EDGE_LAB_CLASSIFICATIONS.model;
  if (item?.type === "market") return EDGE_LAB_CLASSIFICATIONS.provider;
  return EDGE_LAB_CLASSIFICATIONS.historical;
}

function assumptionValidation(assumption, baseline) {
  if (!assumption.targetType || !assumption.targetId) return "A canonical target is required.";
  if (!finite(assumption.value)) return "The assumption value must be a finite number.";
  if (assumption.targetType === "evidence") {
    const evidence = baseline.evidence?.find((item) => String(item.id) === assumption.targetId);
    if (!evidence) return "The evidence target is not part of the original session.";
    if (!numericValue(evidence.value)) return `This evidence value (${cleanText(evidence.value, 80) || "unavailable"}) cannot be adjusted numerically.`;
  }
  if (assumption.targetType === "market") {
    const market = baseline.markets?.find((item) => marketId(item) === assumption.targetId);
    if (!market) return "The market target is not part of the original session.";
    const field = assumption.kind === "market_odds" ? "odds" : "line";
    if (!numericValue(market[field])) return `The original market ${field} is unavailable.`;
    if (assumption.kind === "market_odds" && assumption.operation === "set"
      && Math.abs(assumption.value) < 100) return "American odds must be at least +100 or -100.";
  }
  return "";
}

function deriveScenario(originalData, assumptions) {
  const evidence = clone(originalData.evidence || [], []).map((item) => ({
    ...item,
    classification: item.classification || evidenceClassification(item),
  }));
  const markets = clone(originalData.markets || [], []).map((item) => ({
    ...item,
    classification: item.classification || EDGE_LAB_CLASSIFICATIONS.provider,
    originalAvailable: item.available !== false,
    scenarioOnly: true,
    actionable: false,
    available: false,
  }));
  const differences = [];
  const rejectedAssumptions = [];

  assumptions.forEach((assumption) => {
    const error = assumptionValidation(assumption, originalData);
    if (error) {
      rejectedAssumptions.push({ ...assumption, status: "rejected", error });
      return;
    }
    const collection = assumption.targetType === "evidence" ? evidence : markets;
    const target = collection.find((item) => String(assumption.targetType === "evidence" ? item.id : marketId(item)) === assumption.targetId);
    const field = assumption.targetType === "evidence" ? "value" : assumption.kind === "market_odds" ? "odds" : "line";
    const parsed = numericValue(target[field]);
    const after = applyOperation(parsed.number, assumption.operation, assumption.value);
    if (!Number.isFinite(after)) {
      rejectedAssumptions.push({ ...assumption, status: "rejected", error: "The operation did not produce a finite value." });
      return;
    }
    if (assumption.kind === "market_odds" && Math.abs(after) < 100) {
      rejectedAssumptions.push({ ...assumption, status: "rejected", error: "The operation would produce invalid American odds." });
      return;
    }
    const beforeValue = target[field];
    const originalClassification = target.classification;
    target[field] = assumption.kind === "market_odds" && after >= 100
      ? `+${displayValue(after, parsed.unit)}` : displayValue(after, parsed.unit);
    target.edgeLab = {
      scenarioOnly: true,
      actionable: false,
      assumptionId: assumption.id,
      classification: assumption.classification,
      originalValue: beforeValue,
      originalClassification,
    };
    target.classification = assumption.classification;
    if (assumption.targetType === "market") {
      target.available = false;
      target.scenarioOnly = true;
      target.actionable = false;
    }
    differences.push({
      id: `difference-${assumption.id}`,
      assumptionId: assumption.id,
      targetType: assumption.targetType,
      targetId: assumption.targetId,
      label: target.label || target.name || target.marketName || assumption.targetId,
      field,
      before: beforeValue,
      after: target[field],
      classification: assumption.classification,
    });
  });

  const scenarioContext = {
    isScenario: true,
    isPrediction: false,
    acceptedAssumptions: differences.length,
    disclaimer: "Sandbox output only. Scenario changes are assumptions, not predictions or provider updates.",
  };
  const statistics = (originalData.statistics || []).map((item) => ({
    ...clone(item, {}),
    scenarioContext: { ...scenarioContext, differences: clone(differences, []) },
  }));
  const comparisons = (originalData.comparisons || []).map((item) => ({
    ...clone(item, {}),
    scenarioContext: { ...scenarioContext, differences: clone(differences, []) },
  }));
  const visualizations = (originalData.visualizations || []).map((item) => ({
    ...clone(item, {}),
    scenarioOverlay: { ...scenarioContext, differences: clone(differences, []) },
  }));
  const insights = (originalData.insights || []).map((item) => ({
    ...clone(item, {}),
    scenarioContext: { ...scenarioContext, factualClaimUnchanged: true },
  }));
  const counterarguments = [
    ...(originalData.counterarguments || []).map((item) => clone(item, {})),
    ...(differences.length ? [{
      text: "Scenario results depend on user-supplied assumptions; the original evidence remains the historical or provider source of truth.",
      evidenceIds: [],
      classification: EDGE_LAB_CLASSIFICATIONS.assumption,
    }] : []),
    ...(assumptions.some((item) => item.horizon === "future") ? [{
      text: "Future simulation inputs describe a hypothetical state and must not be read as a forecast or prediction.",
      evidenceIds: [],
      classification: EDGE_LAB_CLASSIFICATIONS.simulation,
    }] : []),
  ];
  return { evidence, markets, statistics, comparisons, visualizations, insights, counterarguments, differences, rejectedAssumptions };
}

function scenarioQuality(originalData, accepted, total, clock) {
  const originalScore = Number(originalData.researchQuality?.researchQuality?.score);
  const coverage = total ? accepted / total : 0;
  const trust = evaluateEdgeTrust({
    components: {
      historical: originalData.sample ? "sample" : "verified",
      agreement: "conditional",
      freshness: originalData.source?.freshness || originalData.updatedAt ? (originalData.sample ? "sample" : "fresh") : "unavailable",
      coverage,
      identity: originalData.scope ? "verified" : "pending",
      completeness: Number.isFinite(originalScore) ? Math.min(originalScore / 100, coverage || 1) : coverage,
    },
    applicable: ["historical", "agreement", "freshness", "coverage", "identity", "completeness"],
    sample: true,
    lastValidation: nowIso(clock),
  });
  const cappedScore = Number.isFinite(originalScore)
    ? Math.min(originalScore, trust.researchQuality.score) : trust.researchQuality.score;
  return {
    ...clone(trust, {}),
    researchQuality: {
      ...clone(trust.researchQuality, {}),
      label: researchQualityLabel(cappedScore),
      score: cappedScore,
    },
    limitations: [
      ...(trust.limitations || []),
      "Research Quality measures source support and assumption coverage. It is not probability, betting confidence, or predictive accuracy.",
    ],
    scenarioAssessment: true,
  };
}

function buildScenario(input, options = {}) {
  const clock = options.clock || Date.now;
  const random = options.random || Math.random;
  const originalData = clone(input.originalData || input.session, null);
  if (!originalData?.id) throw new TypeError("Edge Lab requires a normalized research session.");
  const base = { id: input.id || scenarioId(clock, random) };
  const assumptions = (input.modifiedAssumptions || input.assumptions || [])
    .map((item, index) => normalizeAssumption(item, index, base, clock));
  const derived = deriveScenario(originalData, assumptions);
  const timestamp = nowIso(clock);
  return deepFreeze({
    schemaVersion: EDGE_LAB_SCHEMA_VERSION,
    type: "edge_lab_scenario",
    id: base.id,
    title: cleanText(input.title, 240) || `Scenario · ${originalData.question || "EdgeBoard research"}`,
    sessionId: originalData.id,
    sessionRevision: originalData.revision || 1,
    status: derived.differences.length ? "ready" : derived.rejectedAssumptions.length ? "limited" : "draft",
    deterministic: true,
    isPrediction: false,
    modifiesRealData: false,
    originalData,
    modifiedAssumptions: assumptions,
    updatedResearch: { ...clone(originalData, {}), evidence: derived.evidence, markets: derived.markets, notes: [] },
    updatedStatistics: derived.statistics,
    updatedComparisons: derived.comparisons,
    updatedVisuals: derived.visualizations,
    updatedInsights: derived.insights,
    updatedMarkets: derived.markets,
    researchQuality: scenarioQuality(originalData, derived.differences.length, assumptions.length, clock),
    counterarguments: derived.counterarguments,
    scenarioDifferences: derived.differences,
    rejectedAssumptions: derived.rejectedAssumptions,
    classifications: clone(EDGE_LAB_CLASSIFICATIONS, {}),
    disclaimer: "Edge Lab is a research sandbox. Scenario assumptions and future simulations are not predictions and never alter historical or provider data.",
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
  });
}

export function createEdgeLabScenario(input = {}, options = {}) {
  return buildScenario(input, options);
}

export function addEdgeLabAssumption(scenario, assumption, options = {}) {
  if (!scenario?.id || scenario.type !== "edge_lab_scenario") throw new TypeError("A valid Edge Lab scenario is required.");
  return buildScenario({
    id: scenario.id,
    title: scenario.title,
    originalData: scenario.originalData,
    modifiedAssumptions: [...scenario.modifiedAssumptions, assumption],
    createdAt: scenario.createdAt,
  }, options);
}

export function edgeLabShareSnapshot(scenario, options = {}) {
  if (!scenario?.id) return null;
  const copy = clone(scenario, {});
  if (!options.includePrivateNotes) {
    delete copy.originalData?.notes;
    delete copy.updatedResearch?.notes;
  }
  return deepFreeze({
    type: "edgeboard_edge_lab_snapshot",
    readOnly: true,
    localDeviceOnly: true,
    privateNotesExcluded: !options.includePrivateNotes,
    sharedAt: new Date((options.clock || Date.now)()).toISOString(),
    scenario: copy,
  });
}

function csvSafe(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function edgeLabToCsv(scenario) {
  if (!scenario?.id) return "";
  const rows = [["section", "target", "field", "original", "scenario", "classification", "disclaimer"]];
  scenario.scenarioDifferences.forEach((item) => rows.push([
    "difference", item.label, item.field, item.before, item.after, item.classification, scenario.disclaimer,
  ]));
  scenario.rejectedAssumptions.forEach((item) => rows.push([
    "rejected_assumption", item.targetId, item.kind, "", item.value, item.classification, item.error,
  ]));
  return rows.map((row) => row.map(csvSafe).join(",")).join("\n");
}

export function edgeLabToMarkdown(scenario) {
  if (!scenario?.id) return "";
  const quality = scenario.researchQuality?.researchQuality;
  return [
    `# ${scenario.title}`,
    "",
    `- Scenario: ${scenario.id}`,
    `- Baseline session: ${scenario.sessionId} · revision ${scenario.sessionRevision}`,
    `- Research Quality: ${quality ? `${quality.label} · ${quality.score}%` : "Unavailable"}`,
    "- Prediction: No",
    "- Modifies original data: No",
    "",
    "## Modified assumptions",
    ...(scenario.modifiedAssumptions.length ? scenario.modifiedAssumptions.map((item) => `- ${item.targetId}: ${item.operation} ${item.value} · ${item.classification} · ${item.rationale}`) : ["- No assumptions added."]),
    "",
    "## Scenario differences",
    ...(scenario.scenarioDifferences.length ? scenario.scenarioDifferences.map((item) => `- ${item.label} · ${item.field}: ${item.before} → ${item.after} · ${item.classification}`) : ["- No supported differences calculated."]),
    "",
    "## Counterarguments",
    ...scenario.counterarguments.map((item) => `- ${item.text}`),
    "",
    scenario.disclaimer,
  ].join("\n");
}
