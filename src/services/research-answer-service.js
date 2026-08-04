import { getStatDefinition } from "../config/stat-registry.js";
import { normalizeResearchMode } from "./research-mode-service.js";
import { edgeTrustForResearch } from "./edge-trust-service.js";

const unavailable = (value) => value === null
  || value === undefined
  || value === ""
  || value === "Unavailable"
  || value === "—";

const unique = (values) => [...new Set(values.filter(Boolean))];

function displayValue(value) {
  if (unavailable(value)) return "Unavailable";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return String(value);
}

function statsResult(result) {
  return result?.type === "combined" ? result.statsAnswer : result;
}

function resultSource(result, statsProvider) {
  const active = statsResult(result);
  const source = active?.sources?.[0] || {};
  return {
    provider: source.provider || active?.metadata?.source || statsProvider?.name || "Provider unavailable",
    lastUpdated: source.lastUpdated || active?.lastUpdated || active?.metadata?.lastUpdated || statsProvider?.updatedAt || null,
    sample: active?.sample !== false || statsProvider?.mode === "sample",
  };
}

function resultScope(result, plan) {
  const active = statsResult(result);
  return active?.context || active?.scope?.label || active?.scope || plan.resolvedScope.label;
}

function resultSampleSize(result) {
  const active = statsResult(result);
  if (Number.isFinite(active?.sampleSize)) return active.sampleSize;
  if (Number.isFinite(active?.totalQualified)) return active.totalQualified;
  if (Array.isArray(active?.rows)) {
    const sizes = active.rows.map((row) => Number(row.sampleSize)).filter(Number.isFinite);
    if (sizes.length) return Math.max(...sizes);
    return active.rows.length;
  }
  if (Array.isArray(active?.entries)) {
    const sizes = active.entries.map((entry) => Number(entry.sampleSize)).filter(Number.isFinite);
    return sizes.length ? Math.max(...sizes) : active.entries.length;
  }
  if (Array.isArray(active?.insights)) {
    return Math.max(0, ...active.insights.map((insight) => Number(insight.sampleSize) || 0));
  }
  return 0;
}

function evidenceRecord(records, input) {
  if (!input?.label || unavailable(input.value)) return null;
  const record = Object.freeze({
    id: `evidence-${records.length + 1}`,
    type: input.type || "statistic",
    label: String(input.label),
    value: displayValue(input.value),
    entityId: input.entityId || "",
    entityName: input.entityName || "",
    sampleSize: Number.isFinite(Number(input.sampleSize)) ? Number(input.sampleSize) : null,
    source: input.source || "",
    validation: input.validation || "calculated",
    eventIds: Object.freeze(unique(input.eventIds || [])),
  });
  records.push(record);
  return record;
}

function collectStoryEvidence(plan) {
  const story = plan?.storyContext;
  if (!story) return [];
  return story.supportingEvidence.map((item) => Object.freeze({
    type: "story-evidence",
    label: item.label,
    value: Object.entries(item.values || {}).map(([key, value]) => `${key}: ${displayValue(value)}`).join(" · ") || "Retained supporting row",
    entityId: story.entityIds[0] || "",
    entityName: "",
    sampleSize: story.supportingEvidence.length,
    source: item.sourceId || story.sourceIds[0] || "Story source unavailable",
    validation: story.validationStatus,
    eventIds: Object.freeze(unique([item.eventId, ...(story.eventIds || [])])),
    storyEvidenceId: item.id,
  }));
}

function collectDiscoveryContextEvidence(plan) {
  const discovery = plan?.discoveryContext;
  if (!discovery) return [];
  return discovery.sourceSignals.map((signal) => Object.freeze({
    type: "discovery-signal",
    label: signal.label || String(signal.type || "discovery signal").replaceAll("_", " "),
    value: signal.value ?? signal.weight ?? "retained",
    entityId: discovery.entityIds[0] || "",
    entityName: "",
    sampleSize: null,
    source: discovery.sources[0]?.label || "Discovery source unavailable",
    validation: discovery.validationStatus,
    eventIds: discovery.eventIds,
  }));
}

function collectStatsEvidence(result, source) {
  const active = statsResult(result);
  const records = [];
  if (!active || ["empty", "unsupported", "ambiguous", "error"].includes(active.type)) return records;

  if (active.type === "instant_stat") {
    evidenceRecord(records, {
      label: active.primaryLabel,
      value: active.primaryValue,
      entityId: active.entity?.id,
      entityName: active.entity?.name,
      sampleSize: active.sampleSize,
      source: source.provider,
      eventIds: active.rows?.map((row) => row.event_id),
    });
    (active.supportingStats || []).forEach((stat) => evidenceRecord(records, {
      label: stat.label,
      value: stat.value,
      entityId: active.entity?.id,
      entityName: active.entity?.name,
      sampleSize: active.sampleSize,
      source: source.provider,
    }));
    if (active.threshold) evidenceRecord(records, {
      type: "historical-threshold",
      label: "Historical threshold results",
      value: `${active.threshold.hitCount} of ${active.threshold.sampleSize}`,
      entityId: active.entity?.id,
      entityName: active.entity?.name,
      sampleSize: active.threshold.sampleSize,
      source: source.provider,
    });
  } else if (active.type === "leaderboard") {
    (active.rows || active.entries || []).slice(0, 5).forEach((entry) => evidenceRecord(records, {
      type: "ranking",
      label: `${entry.rank ? `Rank ${entry.rank} · ` : ""}${entry.displayName || entry.entity?.name || "Entity"} · ${active.statLabel}`,
      value: entry.value,
      entityId: entry.entityId || entry.entity?.id,
      entityName: entry.displayName || entry.entity?.name,
      sampleSize: entry.sampleSize,
      source: source.provider,
      eventIds: entry.eventId ? [entry.eventId] : [],
    }));
  } else if (["athlete_comparison", "multi_athlete_comparison", "team_comparison"].includes(active.type)) {
    (active.rows || []).forEach((row) => Object.entries(row.values || {}).forEach(([statId, item]) => {
      evidenceRecord(records, {
        type: "comparison",
        label: `${row.displayName} · ${getStatDefinition(statId)?.displayName || statId}`,
        value: item.value ?? item.formattedValue ?? item.rawValue,
        entityId: row.entityId,
        entityName: row.displayName,
        sampleSize: item.sampleSize ?? row.sampleSize,
        source: source.provider,
      });
    }));
    (active.entities || []).forEach((entry) => Object.values(entry.stats || {}).forEach((stat) => evidenceRecord(records, {
      type: "comparison",
      label: `${entry.entity?.name || "Entity"} · ${stat.label}`,
      value: stat.value,
      entityId: entry.entity?.id,
      entityName: entry.entity?.name,
      sampleSize: stat.sampleSize,
      source: source.provider,
    })));
  } else if (active.type === "split_summary") {
    (active.splits || []).forEach((split) => Object.values(split.stats || {}).forEach((stat) => evidenceRecord(records, {
      type: "split",
      label: `${split.label} · ${stat.label}`,
      value: stat.value,
      entityId: active.entity?.id,
      entityName: active.entity?.name,
      sampleSize: split.sampleSize,
      source: source.provider,
    })));
  } else if (active.type === "record_result" && active.entity) {
    evidenceRecord(records, {
      type: "dataset-high",
      label: `${active.entity.name} · ${active.statLabel}`,
      value: active.value,
      entityId: active.entity.id,
      entityName: active.entity.name,
      sampleSize: 1,
      source: source.provider,
      validation: active.validationStatus,
      eventIds: active.supportingEvent?.eventId ? [active.supportingEvent.eventId] : [],
    });
  } else if (active.type === "insight_result") {
    (active.insights || []).slice(0, 5).forEach((insight) => evidenceRecord(records, {
      type: "validated-insight",
      label: insight.phrasing?.headline || insight.type,
      value: insight.phrasing?.shortSummary,
      entityId: insight.entity?.id,
      entityName: insight.entity?.name,
      sampleSize: insight.sampleSize,
      source: insight.source?.attribution || insight.source?.provider || source.provider,
      validation: insight.validationStatus,
      eventIds: insight.supportingEventIds,
    }));
  } else if (active.type === "game_log") {
    (active.rows || []).slice(0, 5).forEach((row) => {
      (active.statIds || []).forEach((statId) => evidenceRecord(records, {
        type: "game-log",
        label: `${row.event_date || "Date unavailable"} · ${getStatDefinition(statId)?.displayName || statId}`,
        value: row.stats?.[statId],
        entityId: active.entity?.id,
        entityName: active.entity?.name,
        sampleSize: 1,
        source: source.provider,
        eventIds: row.event_id ? [row.event_id] : [],
      }));
    });
  }
  return records;
}

function collectBettingEvidence(picks, source) {
  const records = [];
  (picks || []).filter((pick) => pick?.available && !pick.stale).slice(0, 5).forEach((pick) => {
    evidenceRecord(records, {
      type: "market",
      label: `${pick.name} · ${pick.marketDisplayName || pick.canonicalMarketId}`,
      value: `${pick.line} · ${Number(pick.odds) > 0 ? "+" : ""}${pick.odds} · ${pick.sportsbook}`,
      entityName: pick.name,
      sampleSize: null,
      source: pick.source || pick.sportsbook || source,
      validation: "provider-confirmed sample market",
      eventIds: pick.eventId ? [pick.eventId] : [],
    });
    if (!unavailable(pick.projection)) evidenceRecord(records, {
      type: "projection",
      label: `${pick.name} · model projection`,
      value: pick.projection,
      entityName: pick.name,
      source: pick.source || source,
      validation: "model field",
    });
    if (!unavailable(pick.trend)) evidenceRecord(records, {
      type: "edge",
      label: `${pick.name} · projected edge`,
      value: pick.trend,
      entityName: pick.name,
      source: pick.source || source,
      validation: "model field",
    });
    if (!unavailable(pick.hitRate)) evidenceRecord(records, {
      type: "historical-hit-rate",
      label: `${pick.name} · historical hit rate`,
      value: pick.hitRate,
      entityName: pick.name,
      source: pick.source || source,
      validation: "historical sample, not projection",
    });
    if (Number.isFinite(Number(pick.confidence))) evidenceRecord(records, {
      type: "model-confidence",
      label: `${pick.name} · model confidence`,
      value: `${Number(pick.confidence)}% signal strength`,
      entityName: pick.name,
      source: pick.source || source,
      validation: "model signal, not win probability",
    });
  });
  return records;
}

function collectDiscoveryEvidence(plan) {
  const records = [];
  (plan.discovery?.leagues || []).slice(0, 12).forEach((league) => evidenceRecord(records, {
    type: "league-availability",
    label: `${league.sportName} · ${league.leagueName}`,
    value: `${league.status} · ${league.liveEventCount} live · ${league.todayEventCount} today · ${league.availableMarketCount} markets${league.playerPropCount ? ` · ${league.playerPropCount} player props` : ""}`,
    source: plan.discovery.provider,
    validation: "normalized league availability",
  }));
  return records;
}

function collectEntityEvidence(plan) {
  const records = [];
  (plan.resolvedEntities || []).slice(0, 6).forEach((entity) => evidenceRecord(records, {
    type: "canonical-entity",
    label: `${entity.name} · ${entity.typeLabel}`,
    value: [entity.sportId, entity.leagueId].filter(Boolean).join(" · ") || "Cross-sport entity",
    entityId: entity.id,
    entityName: entity.name,
    source: "EdgeBoard canonical entity registry",
    validation: "canonical identity match",
  }));
  return records;
}

function statsTable(result) {
  const active = statsResult(result);
  if (!active) return null;
  if (active.type === "leaderboard") {
    return {
      id: "stats-leaderboard",
      caption: `${active.statLabel} · ${active.context || "interpreted scope"}`,
      columns: ["Rank", "Entity", active.statLabel || "Value", "Sample"],
      rows: (active.rows || active.entries || []).slice(0, 10).map((row) => [
        row.rank ?? "—", row.displayName || row.entity?.name || "Unknown",
        row.value, row.sampleSize ?? "Unavailable",
      ]),
    };
  }
  if (["athlete_comparison", "multi_athlete_comparison", "team_comparison"].includes(active.type) && active.rows?.length) {
    const statColumns = active.statColumns || [];
    return {
      id: "stats-comparison",
      caption: `${active.title} · identical interpreted filters`,
      columns: ["Entity", ...statColumns.map((column) => column.label), "Sample"],
      rows: active.rows.map((row) => [
        row.displayName,
        ...statColumns.map((column) => row.values?.[column.statId]?.value ?? row.values?.[column.statId]?.formattedValue ?? "Unavailable"),
        row.sampleSize ?? Math.max(0, ...Object.values(row.values || {}).map((item) => Number(item.sampleSize) || 0)),
      ]),
    };
  }
  if (active.type === "game_log") {
    return {
      id: "stats-game-log",
      caption: `${active.title} · completed events only`,
      columns: ["Date", "Event", ...(active.columns || []).map((column) => column.label)],
      rows: (active.rows || []).slice(0, 10).map((row) => [
        row.event_date || "Unavailable",
        row.event_name || row.event_id || "Unavailable",
        ...(active.columns || []).map((column) => row.stats?.[column.statId] ?? "Unavailable"),
      ]),
    };
  }
  return null;
}

function bettingTable(picks) {
  const rows = (picks || []).filter((pick) => pick?.available && !pick.stale).slice(0, 10);
  if (!rows.length) return null;
  return {
    id: "betting-markets",
    caption: "Provider-confirmed sample markets in the interpreted scope",
    columns: ["Selection", "Line", "Odds", "Sportsbook", "Updated"],
    rows: rows.map((pick) => [
      `${pick.name} · ${pick.marketDisplayName || pick.canonicalMarketId}`,
      pick.line,
      `${Number(pick.odds) > 0 ? "+" : ""}${pick.odds}`,
      pick.sportsbook || "Unavailable",
      pick.lastUpdatedAt || "Unavailable",
    ]),
  };
}

function discoveryTable(plan) {
  if (!plan.discovery?.leagues?.length) return null;
  return {
    id: "league-discovery",
    caption: "Normalized sport and league availability",
    columns: ["Sport", "League", "Status", "Live", "Today", "Markets", "Updated"],
    rows: plan.discovery.leagues.slice(0, 20).map((league) => [
      league.sportName,
      league.leagueName,
      league.status,
      league.liveEventCount,
      league.todayEventCount,
      league.availableMarketCount,
      league.lastUpdated || "Unavailable",
    ]),
  };
}

function collectEntities(result) {
  const active = statsResult(result);
  const entities = [
    active?.entity,
    ...(active?.entities || []).map((entry) => entry.entity || entry),
    ...(active?.rows || []).map((row) => row.entity),
    ...(active?.entries || []).map((entry) => entry.entity),
    ...(active?.insights || []).map((insight) => insight.entity),
  ].filter((entity) => entity?.id);
  return [...new Map(entities.map((entity) => [entity.id, entity])).values()];
}

function buildFollowUps(plan, result, bettingPicks) {
  const entity = collectEntities(result)[0] || plan.resolvedEntities?.[0];
  const name = entity?.name || "this entity";
  const statLabel = getStatDefinition(plan.statIds[0])?.displayName || "the primary statistic";
  const suggestions = [];
  if (entity) suggestions.push({
    label: `View ${name}’s profile`,
    type: entity.profileSystem === "entity" ? "entity-profile" : "profile",
    entityId: entity.id,
  });
  if (entity) suggestions.push({ label: "Show game logs", type: "query", query: `Show ${name}'s last 10 games` });
  if (entity) suggestions.push({ label: "Show splits", type: "query", query: `Show ${name}'s home and away splits for ${statLabel}` });
  if (entity) suggestions.push({ label: "Compare to league leaders", type: "query", query: `Who leads this league in ${statLabel}?` });
  if (bettingPicks?.length) suggestions.push({ label: "View current props", type: "query", query: `Show current props for ${name}` });
  if (entity && ["trends", "game_logs", "splits", "statistical_lookup"].includes(plan.questionType)) {
    suggestions.push({ label: "Visualize the recent trend", type: "query", query: `Visualize ${name}'s recent ${statLabel} trend` });
  }
  if (!entity) {
    suggestions.push({ label: "Show league leaders", type: "query", query: `Who leads this league in ${statLabel}?` });
    suggestions.push({ label: "Compare two athletes", type: "query", query: `Compare two players in ${statLabel}` });
  }
  return suggestions.slice(0, 6);
}

function researchCompleteness({ evidence, source, sampleSize, warnings, plan, bettingPicks }) {
  let score = 100;
  const reasons = [];
  if (!evidence.length) {
    score -= 65;
    reasons.push("No validated finding was returned.");
  }
  if (source.sample) {
    score -= 18;
    reasons.push("The provider is an illustrative sample snapshot.");
  }
  if (!source.lastUpdated) {
    score -= 15;
    reasons.push("A provider freshness timestamp is missing.");
  }
  if (plan.requirements.stats && sampleSize < 3) {
    score -= 20;
    reasons.push("The statistical sample is smaller than three completed events.");
  } else if (plan.requirements.stats && sampleSize < 10) {
    score -= 8;
    reasons.push("The statistical sample is limited.");
  }
  if (warnings.length) {
    score -= Math.min(20, warnings.length * 4);
    reasons.push(`${warnings.length} data-quality limitation${warnings.length === 1 ? "" : "s"} disclosed.`);
  }
  if (plan.requirements.betting && !(bettingPicks || []).some((pick) => pick.available && !pick.stale)) {
    score -= 18;
    reasons.push("No fresh provider-confirmed market matched.");
  }
  const bounded = Math.max(0, Math.min(100, score));
  const level = bounded >= 90 ? "Excellent" : bounded >= 70 ? "Good" : bounded >= 40 ? "Limited" : "Incomplete";
  return Object.freeze({ level, score: bounded, reasons: Object.freeze(unique(reasons)) });
}

function warningsFor(result, workflow, picks) {
  const active = statsResult(result);
  return unique([
    active?.dataQualityWarning,
    active?.completenessWarning,
    ...(active?.warnings || []),
    ...(active?.metadata?.calculationWarnings || []),
    ...(workflow?.warnings || []),
    ...(picks || []).some((pick) => pick.stale) ? "Stale markets were excluded from the answer." : "",
  ]);
}

function buildSummary(plan, result, statsEvidence, bettingPicks) {
  const active = statsResult(result);
  if (plan.storyContext) {
    return `EdgeBoard retained the structured claim and ${plan.storyContext.supportingEvidence.length} supporting evidence item${plan.storyContext.supportingEvidence.length === 1 ? "" : "s"} for “${plan.storyContext.headline}.” Follow-up analysis may test or contextualize that claim, but cannot broaden its validation scope.`;
  }
  if (plan.discoveryContext) {
    return `EdgeBoard retained ${plan.discoveryContext.sourceSignals.length} deterministic discovery signal${plan.discoveryContext.sourceSignals.length === 1 ? "" : "s"} for “${plan.discoveryContext.title}.” Relevance identifies a research path, not public popularity, prediction, or outcome probability.`;
  }
  if (["sport_discovery", "league_discovery"].includes(plan.questionType) && plan.discovery.leagues.length) {
    const activeLeagues = plan.discovery.leagues.filter((league) =>
      ["live", "active", "upcoming", "futures-only"].includes(league.status));
    const liveEvents = activeLeagues.reduce((sum, league) => sum + league.liveEventCount, 0);
    const todayEvents = activeLeagues.reduce((sum, league) => sum + league.todayEventCount, 0);
    return `${activeLeagues.length} enabled league scope${activeLeagues.length === 1 ? "" : "s"} currently report live, active, upcoming, or futures availability in the sample registry, with ${liveEvents} live and ${todayEvents} today event${todayEvents === 1 ? "" : "s"} disclosed by the provider.`;
  }
  if (!statsEvidence.length && !bettingPicks.length) {
    return `I checked the interpreted ${plan.resolvedScope.label || "selected"} scope, but the available provider rows do not support this answer yet. No fallback statistic or market was generated. Use one of the scoped follow-ups to keep researching.`;
  }
  if (plan.resolvedEntities?.length && statsEvidence.every((item) => item.type === "canonical-entity")) {
    const entity = plan.resolvedEntities[0];
    return `${entity.name} resolved to canonical ${entity.typeLabel.toLowerCase()} ID ${entity.id}. No unsupported statistic or market was generated; open the profile for verified relationships and available sample coverage.`;
  }
  if (active?.type === "instant_stat" && statsEvidence[0]) {
    return `${active.entity?.name || "The resolved entity"} has ${statsEvidence[0].value} for ${statsEvidence[0].label} in ${active.context || "the interpreted scope"}, based on ${active.sampleSize} completed event${active.sampleSize === 1 ? "" : "s"}.`;
  }
  if (active?.type === "leaderboard" && statsEvidence[0]) {
    return `${statsEvidence[0].entityName || "The first qualified entity"} ranks first in the available ${active.context || "sample scope"} for ${active.statLabel}, with ${statsEvidence[0].value} across a disclosed sample of ${statsEvidence[0].sampleSize ?? "available"} completed events.`;
  }
  if (["athlete_comparison", "multi_athlete_comparison", "team_comparison"].includes(active?.type)) {
    return `${active.title} was evaluated with the same interpreted date and split filters. The evidence table preserves each value and sample size rather than selecting a winner from incompatible measures.`;
  }
  if (active?.type === "insight_result" && statsEvidence[0]) return statsEvidence[0].value;
  if (active?.type === "record_result" && statsEvidence[0]) {
    return `${statsEvidence[0].entityName} has the highest validated value in the available dataset for ${active.statLabel}: ${statsEvidence[0].value}. This is not presented as an all-time record.`;
  }
  if (bettingPicks.length) {
    const top = bettingPicks[0];
    return `${bettingPicks.length} fresh sample market selection${bettingPicks.length === 1 ? "" : "s"} matched the interpreted filters. The first ranked result is ${top.name} ${top.line} at ${Number(top.odds) > 0 ? "+" : ""}${top.odds} from ${top.sportsbook}; model confidence remains signal strength, not win probability.`;
  }
  return `EdgeBoard assembled ${statsEvidence.length} validated evidence item${statsEvidence.length === 1 ? "" : "s"} for this ${plan.questionType.replaceAll("_", " ")} question.`;
}

export function buildResearchAnswer({
  query = "",
  mode = "stats",
  plan,
  statsResult: suppliedStatsResult = null,
  bettingWorkflow = null,
  bettingPicks = [],
  statsProvider = null,
} = {}) {
  if (!plan) throw new Error("A structured research plan is required.");
  const safeMode = normalizeResearchMode(mode, plan.mode);
  const defaultSource = resultSource(suppliedStatsResult, statsProvider);
  const source = plan.storyContext
    ? {
      provider: plan.storyContext.sources.map((item) => item.label).join(" + ")
        || plan.storyContext.sourceIds.join(" + ") || "Story source unavailable",
      lastUpdated: plan.storyContext.freshness.lastUpdated || null,
      sample: !plan.storyContext.sources.length || plan.storyContext.sources.every((item) => item.sample),
    }
    : plan.discoveryContext
      ? {
        provider: plan.discoveryContext.sources.map((item) => item.label).join(" + ") || "Discovery source unavailable",
        lastUpdated: plan.discoveryContext.freshness.lastUpdated || null,
        sample: !plan.discoveryContext.sources.length || plan.discoveryContext.sources.every((item) => item.sample),
      }
      : ["sport_discovery", "league_discovery"].includes(plan.questionType)
    ? {
      provider: plan.discovery.provider,
      lastUpdated: plan.discovery.leagues.map((league) => league.lastUpdated).filter(Boolean).sort().at(-1) || null,
      sample: true,
    }
    : !suppliedStatsResult && bettingWorkflow
      ? {
        provider: bettingWorkflow.evidence?.provider || "Market provider unavailable",
        lastUpdated: bettingWorkflow.evidence?.generatedAt || null,
        sample: true,
      }
      : defaultSource;
  const freshPicks = (bettingPicks || []).filter((pick) => pick?.available && !pick.stale);
  const collectedStatEvidence = [
    ...collectStoryEvidence(plan),
    ...collectDiscoveryContextEvidence(plan),
    ...collectDiscoveryEvidence(plan),
    ...collectEntityEvidence(plan),
    ...collectStatsEvidence(suppliedStatsResult, source),
  ];
  const collectedMarketEvidence = collectBettingEvidence(freshPicks, bettingWorkflow?.evidence?.provider || "Market provider");
  const evidence = Object.freeze([...collectedStatEvidence, ...collectedMarketEvidence].map((item, index) => Object.freeze({
    ...item,
    id: `evidence-${index + 1}`,
  })));
  const statEvidence = evidence.slice(0, collectedStatEvidence.length);
  const marketEvidence = evidence.slice(collectedStatEvidence.length);
  const sampleSize = plan.storyContext?.supportingEvidence.length || plan.discoveryContext?.sourceSignals.length || resultSampleSize(suppliedStatsResult);
  const warnings = unique([
    ...warningsFor(suppliedStatsResult, bettingWorkflow, bettingPicks),
    ...(plan.storyContext?.warnings || []),
    ...(plan.discoveryContext?.warnings || []),
  ]);
  const tables = [discoveryTable(plan), statsTable(suppliedStatsResult), bettingTable(freshPicks)].filter(Boolean);
  const completeness = researchCompleteness({
    evidence, source, sampleSize, warnings, plan, bettingPicks,
  });
  const active = statsResult(suppliedStatsResult);
  const summary = buildSummary(plan, suppliedStatsResult, statEvidence, freshPicks);
  const statEvidenceIds = statEvidence.map((item) => item.id);
  const marketEvidenceIds = marketEvidence.map((item) => item.id);
  const trendEvidence = statEvidence.filter((item) =>
    ["validated-insight", "historical-threshold", "split"].includes(item.type));
  const counterpoints = unique([
    ...warnings,
    sampleSize > 0 && sampleSize < 5 ? `Only ${sampleSize} completed events support the primary statistical scope.` : "",
    source.sample ? "The dataset is illustrative sample data and does not establish complete career, league, or all-time coverage." : "",
    plan.storyContext ? `The retained story is ${plan.storyContext.validationStatus.replaceAll("_", " ")}; research text cannot strengthen that status.` : "",
    plan.discoveryContext ? "Discovery relevance is not measured public popularity and does not strengthen the underlying evidence." : "",
    freshPicks.length ? "Odds, lines, and model fields can change; verify the provider timestamp before use." : "",
  ]);
  const disclosure = Object.freeze({
    source: source.provider,
    sample: source.sample,
    sampleSize,
    dateRange: plan.storyContext?.dateRange || plan.discoveryContext?.queryTemplate?.dateRange || resultScope(suppliedStatsResult, plan),
    coverage: active?.dataCoverage || active?.scope?.coverage || (source.sample ? "Illustrative sample rows only" : "Provider-reported scope"),
    validation: active?.validationStatus || (evidence.length ? "Calculated from structured engine output" : "No validated finding"),
    freshness: source.lastUpdated,
    warnings: Object.freeze(warnings),
  });
  const edgeTrust = edgeTrustForResearch({
    plan, disclosure, completeness, evidence, relatedProps: freshPicks,
    conflicts: active?.providerConflicts || bettingWorkflow?.providerConflicts || [],
  });

  return Object.freeze({
    version: 1,
    query: String(query || plan.query || "").trim(),
    mode: safeMode,
    headline: plan.storyContext?.headline
      ? `${plan.storyContext.headline} research`
      : plan.discoveryContext?.title
        ? `${plan.discoveryContext.title} research`
      : active?.title || bettingWorkflow?.marketLabel
      ? `${active?.title || bettingWorkflow?.marketLabel} research`
      : "EdgeBoard research answer",
    summary,
    plan,
    storyContext: plan.storyContext,
    discoveryContext: plan.discoveryContext,
    evidence,
    sections: Object.freeze([
      Object.freeze({
        id: "evidence",
        title: "Evidence",
        items: Object.freeze(statEvidence.length
          ? statEvidence.slice(0, 6).map((item) => Object.freeze({
            text: `${item.label}: ${item.value}${item.sampleSize !== null ? ` · sample ${item.sampleSize}` : ""}`,
            evidenceIds: Object.freeze([item.id]),
          }))
          : [Object.freeze({ text: "No validated statistical finding was returned.", evidenceIds: Object.freeze([]) })]),
      }),
      Object.freeze({
        id: "supporting-statistics",
        title: "Supporting statistics",
        items: Object.freeze(statEvidence.length > 1
          ? statEvidence.slice(1, 7).map((item) => Object.freeze({ text: `${item.label}: ${item.value}`, evidenceIds: Object.freeze([item.id]) }))
          : [Object.freeze({ text: "No additional canonical statistic was available for this scope.", evidenceIds: Object.freeze([]) })]),
      }),
      Object.freeze({
        id: "trends",
        title: "Important trends",
        items: Object.freeze(trendEvidence.length
          ? trendEvidence.map((item) => Object.freeze({ text: `${item.label}: ${item.value}`, evidenceIds: Object.freeze([item.id]) }))
          : [Object.freeze({ text: "No validated trend was returned, so EdgeBoard did not infer one.", evidenceIds: Object.freeze([]) })]),
      }),
      Object.freeze({
        id: "counterpoints",
        title: "Counterpoints",
        items: Object.freeze(counterpoints.length
          ? counterpoints.map((text) => Object.freeze({ text, evidenceIds: Object.freeze([]) }))
          : [Object.freeze({ text: "No additional provider limitation was reported.", evidenceIds: Object.freeze([]) })]),
      }),
      Object.freeze({
        id: "betting-relevance",
        title: "Betting relevance",
        items: Object.freeze(safeMode === "stats" && !plan.requirements.betting
          ? [Object.freeze({ text: "Betting context was not requested in Stats mode; no odds or projections were attached.", evidenceIds: Object.freeze([]) })]
          : marketEvidence.length
            ? marketEvidence.slice(0, 8).map((item) => Object.freeze({ text: `${item.label}: ${item.value}`, evidenceIds: Object.freeze([item.id]) }))
            : [Object.freeze({ text: "No fresh, compatible provider-confirmed market was available. Historical findings remain separate.", evidenceIds: Object.freeze([]) })]),
      }),
    ]),
    supportingTables: Object.freeze(tables.map((table) => Object.freeze({
      ...table,
      columns: Object.freeze(table.columns),
      rows: Object.freeze(table.rows.map((row) => Object.freeze(row))),
    }))),
    relatedEntities: Object.freeze(collectEntities(suppliedStatsResult)),
    relatedProps: Object.freeze(freshPicks.slice(0, 5).map((pick) => Object.freeze({
      selectionId: pick.id,
      leagueId: pick.leagueId || plan.resolvedScope.leagueId,
      name: pick.name,
      marketName: pick.marketDisplayName || pick.canonicalMarketId,
      line: pick.line,
      odds: pick.odds,
      sportsbook: pick.sportsbook,
      updatedAt: pick.lastUpdatedAt,
      available: true,
    }))),
    relatedInsights: Object.freeze((active?.insights || []).slice(0, 5).map((insight) => Object.freeze({
      id: insight.id,
      headline: insight.phrasing?.headline || insight.type,
      summary: insight.phrasing?.shortSummary || "",
      validation: insight.validationStatus,
    }))),
    relatedQuestions: Object.freeze(buildFollowUps(plan, suppliedStatsResult, freshPicks)),
    disclosure,
    edgeTrust,
    researchCompleteness: completeness,
    factualEvidenceIds: Object.freeze(evidence.map((item) => item.id)),
    languagePolicy: "Explanation text may reference structured evidence IDs only; it is not the factual source.",
    sectionEvidence: Object.freeze({
      statistics: Object.freeze(statEvidenceIds),
      betting: Object.freeze(marketEvidenceIds),
    }),
  });
}
