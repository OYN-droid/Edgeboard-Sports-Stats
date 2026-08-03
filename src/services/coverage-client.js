import { SPORTS_REGISTRY } from "../config/sports-registry.js";
import { edgeTrustForLeague } from "./edge-trust-service.js";

const DOMAIN_LABELS = Object.freeze([
  ["schedules", "Schedules"], ["entities", "Entities"], ["historical_stats", "Historical Stats"],
  ["standings", "Standings"], ["markets", "Markets"], ["props", "Props"],
  ["insights", "Insights"], ["spatial_data", "Visualizations"], ["research", "Research"],
]);

const FIRST_GROUP = new Set(["mlb", "wnba", "ufc", "mls"]);
const SECOND_GROUP = new Set([
  "boxing", "pfl", "one", "bkfc", "f1", "nascar-cup", "nascar-xfinity", "nascar-trucks",
  "indycar", "motogp", "supercross", "motocross", "atp", "wta", "pga", "lpga", "kbo",
  "npb", "euroleague", "iihf", "shl", "liiga", "swiss-nl",
]);
const THIRD_GROUP = new Set([
  "nfl", "nba", "nhl", "ncaaf", "ncaamb", "ncaawb", "epl", "ucl", "la-liga",
  "bundesliga", "serie-a", "ligue-1",
]);

function certificationLabel(state = "disabled") {
  return ({
    disabled: "Disabled", fixture_only: "Fixture", internal_testing: "Fixture", shadow: "Shadow",
    limited_live: "Limited Live", production: "Certified Live", degraded: "Degraded", suspended: "Suspended",
  })[state] || "Disabled";
}

function plannedLeague(entry) {
  const group = FIRST_GROUP.has(entry.leagueId) ? 1 : SECOND_GROUP.has(entry.leagueId) ? 2 : THIRD_GROUP.has(entry.leagueId) ? 3 : 4;
  const domains = DOMAIN_LABELS.map(([id, label]) => ({
    id, label, sourceMode: "unavailable", publicStatus: group <= 3 ? "Planned" : "Unavailable",
    readiness: "not_started", lastUpdatedAt: null,
    limitations: [`${label} has not completed league certification.`],
  }));
  const league = {
    leagueId: entry.leagueId,
    sportId: entry.sportId,
    displayName: entry.leagueDisplayName,
    rolloutState: "disabled",
    certificationState: "Disabled",
    certificationGroup: group,
    dataMode: "unavailable",
    provider: "Not configured",
    selectedCompetition: false,
    lastUpdatedAt: null,
    knownLimitations: ["No provider-backed certification evidence is available. Sample app support remains available where configured."],
    domains,
  };
  return { ...league, edgeTrust: edgeTrustForLeague(league) };
}

function normalizeCoverage(payload = {}) {
  const supplied = new Map((payload.leagues || []).map((league) => [league.leagueId, league]));
  const leagues = SPORTS_REGISTRY.filter((league) => league.enabled).map((entry) => {
    const current = supplied.get(entry.leagueId);
    if (!current) return plannedLeague(entry);
    const domainMap = new Map((current.domains || []).map((domain) => [domain.id, domain]));
    const domains = DOMAIN_LABELS.map(([id, label]) => domainMap.get(id) || {
      id, label, sourceMode: "unavailable", publicStatus: "Planned", readiness: "not_started",
      lastUpdatedAt: null, limitations: [`${label} has not completed certification.`],
    });
    const league = {
      ...current,
      sportId: current.sportId || entry.sportId,
      displayName: current.displayName || entry.leagueDisplayName,
      certificationState: certificationLabel(current.rolloutState),
      certificationGroup: FIRST_GROUP.has(entry.leagueId) ? 1 : SECOND_GROUP.has(entry.leagueId) ? 2 : THIRD_GROUP.has(entry.leagueId) ? 3 : 4,
      domains,
    };
    return { ...league, edgeTrust: edgeTrustForLeague(league) };
  });
  const soccerCandidates = leagues.filter((league) => league.sportId === "soccer" && league.certificationGroup === 1);
  const selectedSoccer = soccerCandidates.sort((left, right) => right.edgeTrust.researchQuality.score - left.edgeTrust.researchQuality.score)[0];
  if (selectedSoccer) selectedSoccer.selectedCompetition = true;
  return { ...payload, leagues };
}

export function fixtureCoverageFallback() {
  return normalizeCoverage({
    generatedAt: null,
    liveProviderVerified: false,
    notice: "Coverage service unavailable. Certification states remain visible; no fixture or sample data is claimed as live.",
    leagues: [],
  });
}

export async function loadCoverage({ timeoutMs = 3000 } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/coverage", { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`Coverage service returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.leagues)) throw new Error("Coverage response is malformed.");
    return normalizeCoverage(payload);
  } catch (error) {
    return { ...fixtureCoverageFallback(), error: error?.message || "Coverage service unavailable." };
  } finally {
    window.clearTimeout(timer);
  }
}
