const COMPONENT_LABELS = Object.freeze({
  historical: "Historical Statistics",
  markets: "Markets",
  lineups: "Lineups",
  injuries: "Injuries",
  agreement: "Provider Agreement",
  freshness: "Freshness",
  coverage: "Coverage",
  identity: "Identity Resolution",
  visualizations: "Visualization Support",
  completeness: "Research Completeness",
});

const STATUS_SCORES = Object.freeze({
  verified: 1, fresh: 1, available: 1, sample: .62, fixture: .66,
  conditional: .72, delayed: .45, partial: .48, pending: .5,
  stale: .2, unavailable: 0, error: 0,
});

const WEIGHTS = Object.freeze({
  historical: .18, markets: .14, lineups: .08, injuries: .07, agreement: .13,
  freshness: .13, coverage: .11, identity: .09, visualizations: .03, completeness: .14,
});

const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function researchQualityLabel(score) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 40) return "Limited";
  return "Incomplete";
}

function publicStatus(state, score) {
  const labels = {
    verified: "Verified", fresh: "Fresh", available: "Verified",
    sample: "Validated Sample", fixture: "Validated Sample", conditional: "Conditional",
    delayed: "Delayed", partial: "Partial", pending: "Waiting for Confirmation",
    stale: "Stale", unavailable: "Unavailable", error: "Validation Error",
  };
  return labels[state] || (score >= .9 ? "Verified" : score >= .4 ? "Limited" : "Unavailable");
}

export function evaluateEdgeTrust({ components = {}, applicable = [], conflicts = [], sample = false, lastValidation = null } = {}) {
  const active = applicable.length ? applicable : Object.keys(components);
  const normalized = active.filter((id) => COMPONENT_LABELS[id]).map((id) => {
    const raw = components[id];
    const state = typeof raw === "object" ? raw.state || "unavailable" : typeof raw === "string" ? raw : "verified";
    const score = clamp(typeof raw === "number" ? raw : typeof raw === "object" && Number.isFinite(raw.score) ? raw.score : STATUS_SCORES[state]);
    return { id, label: COMPONENT_LABELS[id], state, score, updatedAt: typeof raw === "object" ? raw.updatedAt || null : null };
  });
  if (conflicts.length) {
    const agreement = normalized.find((item) => item.id === "agreement");
    if (agreement) {
      agreement.score = Math.min(agreement.score, Math.max(0, 1 - conflicts.length * .2));
      agreement.state = agreement.score < .6 ? "error" : "partial";
    }
  }
  const denominator = normalized.reduce((sum, item) => sum + WEIGHTS[item.id], 0);
  let score = denominator
    ? normalized.reduce((sum, item) => sum + item.score * WEIGHTS[item.id], 0) / denominator * 100
    : 0;
  if (sample) score = Math.min(score, 69);
  score = Math.round(Math.max(0, Math.min(100, score)));
  const details = normalized.map((item) => Object.freeze({
    id: item.id,
    label: item.label,
    status: publicStatus(item.state, item.score),
    updatedAt: item.updatedAt,
    ...(["agreement", "completeness"].includes(item.id) ? { percentage: Math.round(item.score * 100) } : {}),
  }));
  const waiting = details.filter((item) => ["Waiting for Confirmation", "Unavailable", "Stale", "Validation Error"].includes(item.status));
  const limitations = [
    sample ? "Validated sample or fixture evidence is not live data." : "",
    conflicts.length ? `${conflicts.length} unresolved provider conflict${conflicts.length === 1 ? "" : "s"} reduced research quality.` : "",
    waiting.length ? `Waiting on ${waiting.slice(0, 4).map((item) => item.label).join(", ")}.` : "",
  ].filter(Boolean);
  return Object.freeze({
    researchQuality: Object.freeze({ label: researchQualityLabel(score), score, isBettingConfidence: false, isModelConfidence: false, isProbability: false }),
    details: Object.freeze(details),
    lastValidation: lastValidation || new Date().toISOString(),
    limitations: Object.freeze(limitations),
    conflicts: Object.freeze(conflicts.map((item) => Object.freeze({
      category: item.category || "provider_conflict",
      recordId: item.recordId || "",
      sources: Object.freeze(item.sources || []),
      recommendation: "Await official confirmation before relying on the disputed field.",
    }))),
    applicableComponents: details.length,
  });
}

export function edgeTrustForResearch({ plan, disclosure, completeness, evidence = [], relatedProps = [], conflicts = [] } = {}) {
  const needsMarkets = plan?.requirements?.betting === true;
  const sportId = plan?.resolvedScope?.sportId || "";
  const teamSport = ["basketball", "baseball", "american-football", "ice-hockey", "soccer"].includes(sportId);
  const visualQuestion = /visual|chart|telemetry|tracking/i.test(`${plan?.questionType || ""} ${plan?.query || ""}`);
  const sample = disclosure?.sample !== false;
  const components = {
    historical: evidence.some((item) => !String(item.type).includes("market")) ? (sample ? "sample" : "verified") : "unavailable",
    markets: relatedProps.length ? (sample ? "sample" : "verified") : needsMarkets ? "unavailable" : "pending",
    lineups: teamSport && needsMarkets ? "pending" : "unavailable",
    injuries: teamSport && needsMarkets ? "pending" : "unavailable",
    agreement: conflicts.length ? "partial" : "verified",
    freshness: disclosure?.freshness ? (sample ? "sample" : "fresh") : "unavailable",
    coverage: clamp((completeness?.score || 0) / 100),
    identity: plan?.entityIds?.length || ["leaderboards", "sport_discovery", "league_discovery"].includes(plan?.questionType) ? "verified" : "pending",
    visualizations: visualQuestion ? "pending" : "unavailable",
    completeness: clamp((completeness?.score || 0) / 100),
  };
  const applicable = ["historical", "agreement", "freshness", "coverage", "identity", "completeness"];
  if (needsMarkets) applicable.push("markets");
  if (teamSport && needsMarkets) applicable.push("lineups", "injuries");
  if (visualQuestion) applicable.push("visualizations");
  return evaluateEdgeTrust({ components, applicable, conflicts, sample, lastValidation: disclosure?.freshness });
}

export function edgeTrustForLeague(league) {
  if (league?.edgeTrust?.researchQuality) return league.edgeTrust;
  const domains = new Map((league?.domains || []).map((item) => [item.id, item]));
  const mode = league?.dataMode || "unavailable";
  const domainState = (id) => domains.get(id)?.sourceMode || "unavailable";
  const available = [...domains.values()].filter((item) => item.sourceMode !== "unavailable").length;
  return evaluateEdgeTrust({
    components: {
      historical: domainState("historical_stats"), markets: domainState("markets"),
      lineups: domainState("lineups"), injuries: domainState("injuries"), agreement: "verified",
      freshness: mode === "fixture" ? "sample" : league?.lastUpdatedAt ? "fresh" : "unavailable",
      coverage: available / Math.max(1, domains.size), identity: domainState("entities"),
      visualizations: domainState("spatial_data"), completeness: available / Math.max(1, domains.size),
    },
    applicable: ["historical", "markets", "agreement", "freshness", "coverage", "identity", "completeness",
      ...(domains.has("lineups") ? ["lineups"] : []), ...(domains.has("injuries") ? ["injuries"] : []),
      ...(domains.has("spatial_data") ? ["visualizations"] : [])],
    sample: ["fixture", "sample"].includes(mode),
    lastValidation: league?.lastUpdatedAt,
  });
}
