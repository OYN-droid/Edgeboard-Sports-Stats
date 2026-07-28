import { AVAILABILITY_STATES, SPORTS_REGISTRY } from "../config/sports-registry.js";
import { mockProviderPayload } from "../data/mock-provider.js";

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const fallbackText = (value, fallback) => typeof value === "string" && value.trim() ? value.trim() : fallback;

function normalizeOdds(value) {
  const odds = Number(value);
  return Number.isFinite(odds) && odds !== 0 && Math.abs(odds) >= 100 ? Math.round(odds) : null;
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isStale(value) {
  const timestamp = normalizeTimestamp(value);
  return !timestamp || Date.now() - new Date(timestamp).getTime() > STALE_AFTER_MS;
}

function normalizeLeague(entry, providerStatus = {}) {
  const providerAvailability = providerStatus.availability_status;
  const configuredStatus = AVAILABILITY_STATES.includes(providerAvailability)
    ? providerAvailability
    : AVAILABILITY_STATES.includes(entry.availabilityStatus) ? entry.availabilityStatus : "unavailable";
  const lastUpdatedAt = providerStatus.last_updated_at || entry.lastUpdatedAt;
  return Object.freeze({
    sportId: fallbackText(entry.sportId, "unknown-sport"),
    sportDisplayName: fallbackText(entry.sportDisplayName, "Unknown sport"),
    leagueId: fallbackText(entry.leagueId, "unknown-league"),
    leagueDisplayName: fallbackText(entry.leagueDisplayName, "Unknown league"),
    category: fallbackText(entry.category, "other"),
    priorityTier: Number.isFinite(entry.priorityTier) ? entry.priorityTier : 99,
    scheduleType: ["seasonal", "event-based"].includes(entry.scheduleType) ? entry.scheduleType : "event-based",
    availabilityStatus: isStale(lastUpdatedAt) && ["live", "active"].includes(configuredStatus) ? "stale" : configuredStatus,
    liveEventCount: Math.max(0, Number(providerStatus.live_event_count ?? entry.liveEventCount) || 0),
    todayEventCount: Math.max(0, Number(providerStatus.today_event_count ?? entry.todayEventCount) || 0),
    upcomingEventCount: Math.max(0, Number(providerStatus.upcoming_event_count ?? entry.upcomingEventCount) || 0),
    availableMarketCount: Math.max(0, Number(providerStatus.available_market_count ?? entry.availableMarketCount) || 0),
    playerPropCount: Math.max(0, Number(providerStatus.player_prop_count ?? entry.playerPropCount) || 0),
    lastUpdatedAt: normalizeTimestamp(lastUpdatedAt),
    dataQualityStatus: fallbackText(providerStatus.data_quality_status, fallbackText(entry.dataQualityStatus, "unknown")),
    featuredEventWeight: Math.max(0, Number(providerStatus.featured_event_weight) || 0),
    statusLabel: fallbackText(providerStatus.status_label, ""),
    enabled: entry.enabled === true,
    supportedMarketTypes: Array.isArray(entry.supportedMarketTypes) ? [...new Set(entry.supportedMarketTypes)] : [],
    queryTerms: Array.isArray(entry.queryTerms) ? entry.queryTerms.filter(Boolean) : [],
    parlayPrompt: entry.parlayPrompt || null,
    region: fallbackText(entry.region, "Global"),
    soccerGroup: fallbackText(entry.soccerGroup, ""),
  });
}

function normalizeParticipant(participant, index) {
  if (!participant || typeof participant !== "object") {
    return { id: `unknown-${index}`, name: "Unknown participant", shortName: "TBD", role: "unknown", participantType: "unknown" };
  }
  return {
    id: fallbackText(participant.id, `unknown-${index}`),
    name: fallbackText(participant.name, "Unknown participant"),
    shortName: fallbackText(participant.short_name, fallbackText(participant.name, "TBD")),
    role: fallbackText(participant.role, "unknown"),
    participantType: fallbackText(participant.participant_type, "unknown"),
  };
}

function normalizeEvent(raw) {
  const participants = Array.isArray(raw?.participants) ? raw.participants.map(normalizeParticipant) : [];
  const away = participants.find((participant) => participant.role === "away");
  const home = participants.find((participant) => participant.role === "home");
  return Object.freeze({
    id: fallbackText(raw?.event_id, "unknown-event"),
    leagueId: fallbackText(raw?.league_key, "unknown-league"),
    eventType: ["team", "individual", "combat-card", "motorsport", "tournament"].includes(raw?.event_type) ? raw.event_type : "individual",
    status: fallbackText(raw?.status, "unknown"),
    startsAt: normalizeTimestamp(raw?.starts_at),
    timeStatus: normalizeTimestamp(raw?.starts_at) ? "scheduled" : "unknown",
    participants,
    away: away?.shortName || "TBD",
    home: home?.shortName || "TBD",
    tournament: raw?.tournament || null,
    card: raw?.card || null,
    race: raw?.race || null,
    teamGame: raw?.team_game || null,
    soccer: raw?.soccer || null,
    venue: raw?.venue || null,
    display: {
      title: fallbackText(raw?.display?.title, ""),
      spread: fallbackText(raw?.display?.spread, "Unavailable"),
      total: fallbackText(raw?.display?.total, "Unavailable"),
      edge: fallbackText(raw?.display?.edge, "No current lean"),
      featured: raw?.display?.featured !== false,
    },
  });
}

function normalizeMarket(raw, eventMap) {
  const event = eventMap.get(raw?.event_id) || null;
  const selections = (Array.isArray(raw?.selections) ? raw.selections : []).map((selection, index) => {
    const odds = normalizeOdds(selection?.american_odds);
    const participantName = fallbackText(selection?.participant?.name, fallbackText(selection?.label, "Unknown participant"));
    const lastUpdatedAt = normalizeTimestamp(selection?.last_updated_at);
    const stale = isStale(selection?.last_updated_at);
    return Object.freeze({
      id: fallbackText(selection?.selection_id, `${raw?.offer_id || "unknown"}-${index}`),
      participant: selection?.participant ? {
        id: fallbackText(selection.participant.id, "unknown"),
        name: participantName,
        participantType: fallbackText(selection.participant.participant_type, "unknown"),
      } : null,
      name: participantName,
      line: fallbackText(selection?.line_display, "Line unavailable"),
      odds,
      confidence: Math.min(100, Math.max(0, Number(selection?.model_confidence) || 0)),
      hitRate: fallbackText(selection?.trend_summary, "Trend unavailable"),
      matchup: fallbackText(selection?.matchup_summary, "Matchup unavailable"),
      trend: fallbackText(selection?.edge_summary, "No model edge"),
      projection: fallbackText(selection?.projection_display, "Projection unavailable"),
      note: fallbackText(selection?.analysis_note, "No analysis is available for this market."),
      sportsbook: fallbackText(selection?.sportsbook, "Source unavailable"),
      lastUpdatedAt,
      eventTime: event?.startsAt || null,
      competitorStatus: selection?.confirmed === true ? "Confirmed" : "Unconfirmed",
      dataQualityWarning: fallbackText(selection?.data_quality_warning, stale ? "Odds may be stale" : ""),
      stale,
      team: fallbackText(selection?.team_id, ""),
      opponent: fallbackText(selection?.opponent_id, ""),
      propType: fallbackText(selection?.prop_type, "other"),
      confirmed: selection?.confirmed === true,
      available: raw?.status === "open" && selection?.available !== false && odds !== null,
    });
  });

  return Object.freeze({
    id: fallbackText(raw?.offer_id, "unknown-market"),
    leagueId: fallbackText(raw?.league_key, event?.leagueId || "unknown-league"),
    eventId: fallbackText(raw?.event_id, "unknown-event"),
    event,
    marketType: fallbackText(raw?.market_type, "unknown"),
    filterGroup: fallbackText(raw?.ui_group, "unavailable"),
    status: fallbackText(raw?.status, "unavailable"),
    available: raw?.status === "open" && selections.some((selection) => selection.available),
    selections,
  });
}

export function createSportsRepository(payload = mockProviderPayload) {
  const providerStatuses = new Map(
    (Array.isArray(payload?.league_statuses) ? payload.league_statuses : [])
      .map((status) => [status?.league_key, status]),
  );
  const leagues = SPORTS_REGISTRY
    .map((entry) => normalizeLeague(entry, providerStatuses.get(entry.leagueId)))
    .sort((a, b) => a.priorityTier - b.priorityTier);
  const events = (Array.isArray(payload?.events) ? payload.events : []).map(normalizeEvent);
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const markets = (Array.isArray(payload?.offers) ? payload.offers : []).map((market) => normalizeMarket(market, eventMap));
  const aliases = payload?.aliases && typeof payload.aliases === "object" ? payload.aliases : {};

  return Object.freeze({
    getLeagues: ({ enabledOnly = true } = {}) => leagues.filter((league) => !enabledOnly || league.enabled),
    getLeague: (leagueId) => leagues.find((league) => league.leagueId === leagueId) || null,
    getEvents: (leagueId, { featuredOnly = false } = {}) => events.filter((event) => event.leagueId === leagueId && (!featuredOnly || event.display.featured)),
    getMarkets: (leagueId) => markets.filter((market) => market.leagueId === leagueId),
    getMarketBySelectionId: (selectionId) => markets.find((market) => market.selections.some((selection) => selection.id === selectionId)) || null,
    getAliases: () => ({ ...aliases }),
    getMetadata: () => {
      const status = payload?.provider_status && typeof payload.provider_status === "object" ? payload.provider_status : {};
      const generatedAt = normalizeTimestamp(status.last_updated_at || payload?.generated_at);
      return {
        provider: fallbackText(status.provider, fallbackText(payload?.provider, "unknown")),
        mode: fallbackText(status.mode, "sample"),
        state: fallbackText(status.state, isStale(generatedAt) ? "stale" : "fresh"),
        generatedAt,
        lastSuccessfulUpdateAt: normalizeTimestamp(status.last_successful_update_at),
        stale: isStale(generatedAt) || status.state === "stale",
        partial: status.partial === true,
        offlineFallback: status.offline_fallback === true,
        sources: Array.isArray(status.sources) ? status.sources : [],
        errors: Array.isArray(status.errors) ? status.errors : [],
      };
    },
  });
}
