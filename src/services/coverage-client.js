const FALLBACK_LEAGUES = [
  ["mlb", "baseball", "MLB"], ["wnba", "basketball", "WNBA"],
  ["ufc", "mma", "UFC"], ["mls", "soccer", "MLS"],
];

const DOMAIN_LABELS = [
  ["schedules", "Schedules"], ["historical_stats", "Stats"], ["standings", "Standings"],
  ["injuries", "Injuries"], ["lineups", "Lineups"], ["markets", "Odds"],
  ["props", "Props"], ["line_movement", "Line movement"], ["spatial_data", "Visuals"],
];

export function fixtureCoverageFallback() {
  return {
    generatedAt: null,
    liveProviderVerified: false,
    notice: "Coverage service unavailable. Recorded fixture capability is shown; no live data is claimed.",
    leagues: FALLBACK_LEAGUES.map(([leagueId, sportId, displayName]) => ({
      leagueId, sportId, displayName, rolloutState: "fixture_only", dataMode: "fixture",
      provider: "EdgeBoard recorded fixture", lastUpdatedAt: null, healthScore: 0, healthState: "failing",
      knownLimitations: ["No verified live provider is configured."],
      domains: DOMAIN_LABELS.map(([id, label]) => ({
        id, label, sourceMode: ["schedules", "historical_stats", "markets", "props"].includes(id) ? "fixture" : "unavailable",
        publicStatus: ["schedules", "historical_stats", "markets", "props"].includes(id) ? "Sample" : "Planned",
        lastUpdatedAt: null, limitations: [],
      })),
    })),
  };
}

export async function loadCoverage({ timeoutMs = 3000 } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/coverage", { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`Coverage service returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.leagues)) throw new Error("Coverage response is malformed.");
    return payload;
  } catch (error) {
    return { ...fixtureCoverageFallback(), error: error?.message || "Coverage service unavailable." };
  } finally {
    window.clearTimeout(timer);
  }
}
