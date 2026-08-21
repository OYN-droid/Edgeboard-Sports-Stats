import { AVAILABILITY_STATES, SPORTS_REGISTRY } from "../config/sports-registry.js";
import { getMarketDefinition, resolveCanonicalMarketId } from "../config/market-catalog.js";
import { mockProviderPayload } from "../data/mock-provider.js";

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const fallbackText = (value, fallback) => typeof value === "string" && value.trim() ? value.trim() : fallback;

function normalizeOdds(value) {
  const odds = Number(value);
  return Number.isFinite(odds) && odds !== 0 && Math.abs(odds) >= 100 ? Math.round(odds) : null;
}

function normalizeNumericLine(value, displayValue = "") {
  const direct = Number(value);
  if (value !== null && value !== undefined && value !== "" && Number.isFinite(direct)) return direct;
  const display = String(displayValue || "").trim();
  const directional = display.match(/^(?:over|under|total|spread|handicap)\s*([+-]?\d+(?:\.\d+)?)/i);
  const trailingLabel = display.match(/^([+-]?\d+(?:\.\d+)?)\s+(?:spread|total|handicap)\b/i);
  const parsed = Number(directional?.[1] || trailingLabel?.[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePriceSnapshot(raw, fallback = {}) {
  const odds = normalizeOdds(raw?.american_odds);
  const observedAt = normalizeTimestamp(raw?.observed_at || raw?.last_updated_at);
  const changeType = fallbackText(raw?.change_type, "movement").toLowerCase();
  return Object.freeze({
    sportsbook: fallbackText(raw?.sportsbook, fallback.sportsbook || "Source unavailable"),
    line: normalizeNumericLine(raw?.line, raw?.line_display),
    lineDisplay: fallbackText(raw?.line_display, fallback.line || "Line unavailable"),
    odds,
    observedAt,
    provider: fallbackText(raw?.source, fallback.source || "Source unavailable"),
    sourceMode: fallbackText(raw?.source_mode, fallback.sourceMode || "sample"),
    changeType: ["opening", "movement", "current", "suspended", "reopened"].includes(changeType) ? changeType : "movement",
    verification: fallbackText(raw?.verification, "provider-reported").toLowerCase(),
    status: fallbackText(raw?.status, changeType === "suspended" ? "suspended" : "open").toLowerCase(),
    stale: isStale(observedAt),
    valid: Boolean(observedAt) && (odds !== null || changeType === "suspended"),
  });
}

function normalizeMarketEvent(raw) {
  const occurredAt = normalizeTimestamp(raw?.occurred_at || raw?.updated_at);
  const type = fallbackText(raw?.event_type, "unknown").toLowerCase();
  const verification = fallbackText(raw?.verification, "unverified").toLowerCase().replaceAll("_", "-");
  return Object.freeze({
    id: fallbackText(raw?.event_id, ""), type, occurredAt,
    provider: fallbackText(raw?.provider, "Provider unavailable"),
    verification,
    verified: verification === "verified",
    causalRelationship: fallbackText(raw?.causal_relationship, "related").toLowerCase().replaceAll("_", "-"),
    summary: fallbackText(raw?.summary, "Event summary unavailable"),
    entityId: fallbackText(raw?.entity_id, ""),
    valid: Boolean(occurredAt) && ["lineup", "injury", "weather", "schedule", "opponent_change", "provider_correction"].includes(type),
  });
}

function normalizeResearchSnapshot(raw) {
  const observedAt = normalizeTimestamp(raw?.observed_at || raw?.updated_at);
  const projection = Number(raw?.projection);
  const researchQuality = Number(raw?.research_quality);
  return Object.freeze({
    observedAt,
    projection: Number.isFinite(projection) ? projection : null,
    researchQuality: Number.isFinite(researchQuality) ? Math.min(100, Math.max(0, researchQuality)) : null,
    provider: fallbackText(raw?.provider, "Provider unavailable"),
    verification: fallbackText(raw?.verification, "unverified").toLowerCase(),
    valid: Boolean(observedAt),
  });
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
    supportedCanonicalMarketIds: Array.isArray(entry.supportedCanonicalMarketIds) ? [...new Set(entry.supportedCanonicalMarketIds)] : [],
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

function normalizeLiveState(raw) {
  if (!raw || typeof raw !== "object") return null;
  const score = raw.score && Number.isInteger(Number(raw.score.away)) && Number.isInteger(Number(raw.score.home))
    ? Object.freeze({ away: Number(raw.score.away), home: Number(raw.score.home) }) : null;
  const period = raw.period && Number.isInteger(Number(raw.period.inning))
    ? Object.freeze({ sport: "baseball", inning: Number(raw.period.inning), half: fallbackText(raw.period.half, "unknown") }) : null;
  const freshness = raw.freshness && typeof raw.freshness === "object" ? Object.freeze({
    state: fallbackText(raw.freshness.state, "unavailable"),
    ageSeconds: Number.isFinite(Number(raw.freshness.ageSeconds)) ? Math.max(0, Number(raw.freshness.ageSeconds)) : null,
    providerDelaySeconds: Number.isFinite(Number(raw.freshness.providerDelaySeconds)) ? Math.max(0, Number(raw.freshness.providerDelaySeconds)) : null,
  }) : Object.freeze({ state: "unavailable", ageSeconds: null, providerDelaySeconds: null });
  return Object.freeze({
    id: fallbackText(raw.id, ""), eventId: fallbackText(raw.eventId, ""),
    status: fallbackText(raw.status, "unknown"), score, period,
    outs: Number.isInteger(Number(raw.outs)) ? Number(raw.outs) : null,
    count: raw.count && typeof raw.count === "object" ? Object.freeze({ ...raw.count }) : null,
    bases: raw.bases && typeof raw.bases === "object" ? Object.freeze({ ...raw.bases }) : null,
    currentBatterId: fallbackText(raw.currentBatterId, ""), currentPitcherId: fallbackText(raw.currentPitcherId, ""),
    providerUpdatedAt: normalizeTimestamp(raw.providerUpdatedAt), fetchedAt: normalizeTimestamp(raw.fetchedAt),
    freshness, warnings: Object.freeze(Array.isArray(raw.warnings) ? raw.warnings.map(String) : []),
    source: fallbackText(raw.source, "Source unavailable"), sourceMode: fallbackText(raw.sourceMode, "fixture"),
    edgeTrust: raw.edgeTrust || null,
  });
}

function normalizeEvent(raw, liveCertification = null) {
  const participants = Array.isArray(raw?.participants) ? raw.participants.map(normalizeParticipant) : [];
  const away = participants.find((participant) => participant.role === "away");
  const home = participants.find((participant) => participant.role === "home");
  const liveState = normalizeLiveState(raw?.live_state);
  return Object.freeze({
    id: fallbackText(raw?.event_id, "unknown-event"),
    leagueId: fallbackText(raw?.league_key, "unknown-league"),
    eventType: ["team", "individual", "combat-card", "motorsport", "tournament"].includes(raw?.event_type) ? raw.event_type : "individual",
    status: fallbackText(raw?.status, "unknown"),
    sourceMode: fallbackText(raw?.source_mode, "sample"),
    source: fallbackText(raw?.source, "EdgeBoard sample provider"),
    sourceUpdatedAt: normalizeTimestamp(raw?.provider_updated_at),
    liveState,
    liveCertification,
    liveBadgeEligible: Boolean(
      liveCertification?.liveEligible
      && ["healthy", "impaired"].includes(liveCertification?.providerHealth)
      && ["live", "in_progress", "resumed"].includes(fallbackText(raw?.status, "unknown"))
      && liveState?.freshness?.state === "fresh"
    ),
    live: raw?.live && typeof raw.live === "object" ? {
      period: fallbackText(raw.live.period, ""),
      clock: fallbackText(raw.live.clock, ""),
      score: fallbackText(raw.live.score, ""),
      connectionState: fallbackText(raw.live.connection_state, "connected"),
      delaySeconds: Number.isFinite(Number(raw.live.delay_seconds)) ? Math.max(0, Number(raw.live.delay_seconds)) : null,
      lastUpdatedAt: normalizeTimestamp(raw.live.last_updated_at || raw.provider_updated_at),
    } : null,
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

function certificationDomainForMarket(canonicalMarketId, marketType) {
  const value = `${canonicalMarketId || ""} ${marketType || ""}`.toLowerCase();
  if (/player|pitcher|batter|hits|runs|strikeout|walk/.test(value)) return "player_props";
  if (/moneyline|winner/.test(value)) return "moneyline";
  if (/run.line|spread/.test(value)) return "run_line";
  if (/total/.test(value)) return "totals";
  return "market_status";
}

function normalizeMarket(raw, eventMap, leagueMap, certificationMap) {
  const event = eventMap.get(raw?.event_id) || null;
  const leagueId = fallbackText(raw?.league_key, event?.leagueId || "unknown-league");
  const league = leagueMap.get(leagueId);
  const canonicalMarketId = resolveCanonicalMarketId(
    raw?.canonical_market_id || raw?.provider_market_id || raw?.market_name
      || raw?.selections?.[0]?.prop_type || raw?.market_type,
    { sportId: league?.sportId, leagueId, eventType: event?.eventType },
  );
  const definition = getMarketDefinition(canonicalMarketId);
  const certification = leagueId === "mlb"
    ? certificationMap.get(certificationDomainForMarket(canonicalMarketId, raw?.market_type)) || null
    : null;
  const selections = (Array.isArray(raw?.selections) ? raw.selections : []).map((selection, index) => {
    const odds = normalizeOdds(selection?.american_odds);
    const participantName = fallbackText(selection?.participant?.name, fallbackText(selection?.label, "Unknown participant"));
    const lastUpdatedAt = normalizeTimestamp(selection?.last_updated_at);
    const stale = isStale(selection?.last_updated_at);
    const priceHistory = (Array.isArray(selection?.price_history) ? selection.price_history : [])
      .map((snapshot) => normalizePriceSnapshot(snapshot, {
        sportsbook: selection?.sportsbook,
        line: selection?.line_display,
        source: selection?.source || raw?.source,
        sourceMode: selection?.source_mode || raw?.source_mode,
      })).filter((snapshot) => snapshot.valid)
      .sort((left, right) => new Date(left.observedAt) - new Date(right.observedAt));
    const bookPrices = (Array.isArray(selection?.book_prices) ? selection.book_prices : [])
      .map((snapshot) => normalizePriceSnapshot(snapshot, {
        sportsbook: selection?.sportsbook, line: selection?.line_display,
        source: selection?.source || raw?.source, sourceMode: selection?.source_mode || raw?.source_mode,
      })).filter((snapshot) => snapshot.valid && snapshot.odds !== null)
      .sort((left, right) => left.sportsbook.localeCompare(right.sportsbook));
    const marketEvents = (Array.isArray(selection?.market_events) ? selection.market_events : [])
      .map(normalizeMarketEvent).filter((item) => item.valid)
      .sort((left, right) => new Date(left.occurredAt) - new Date(right.occurredAt));
    const researchHistory = (Array.isArray(selection?.research_history) ? selection.research_history : [])
      .map(normalizeResearchSnapshot).filter((item) => item.valid)
      .sort((left, right) => new Date(left.observedAt) - new Date(right.observedAt));
    return Object.freeze({
      id: fallbackText(selection?.selection_id, `${raw?.offer_id || "unknown"}-${index}`),
      participant: selection?.participant ? {
        id: fallbackText(selection.participant.id, "unknown"),
        name: participantName,
        participantType: fallbackText(selection.participant.participant_type, "unknown"),
      } : null,
      participantId: fallbackText(selection?.participant?.id, ""),
      teamId: fallbackText(selection?.team_id, ""),
      competitorId: fallbackText(selection?.competitor_id, fallbackText(selection?.participant?.id, "")),
      name: participantName,
      line: fallbackText(selection?.line_display, "Line unavailable"),
      numericLine: normalizeNumericLine(selection?.line, selection?.line_display),
      side: fallbackText(selection?.side,
        /^over\b/i.test(selection?.line_display || "") ? "over"
          : /^under\b/i.test(selection?.line_display || "") ? "under" : ""),
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
      dataQualityStatus: fallbackText(selection?.data_quality_status, stale ? "stale" : "sample"),
      sourceMode: fallbackText(selection?.source_mode, fallbackText(raw?.source_mode, "sample")),
      source: fallbackText(selection?.source, fallbackText(raw?.source, "Sample Sportsbook")),
      stale,
      team: fallbackText(selection?.team_id, ""),
      opponent: fallbackText(selection?.opponent_id, ""),
      propType: fallbackText(selection?.prop_type, "other"),
      canonicalStatId: fallbackText(selection?.canonical_stat_id, ""),
      confirmed: selection?.confirmed === true,
      availabilityStatus: fallbackText(selection?.availability_status, "unknown"),
      rosterStatus: fallbackText(selection?.roster_status, "unknown"),
      lineupStatus: fallbackText(selection?.lineup_status, "unavailable"),
      starterStatus: fallbackText(selection?.starter_status, "unavailable"),
      contextFreshness: fallbackText(selection?.context_freshness, "unavailable"),
      weatherStatus: fallbackText(selection?.weather_status, "unavailable"),
      contextConflict: selection?.context_conflict === true,
      contextReviewRequired: selection?.context_review_required === true,
      eventStatus: fallbackText(selection?.event_status, event?.status || "unknown"),
      pregameContextCurrent: selection?.pregame_context_current !== false,
      trackingState: fallbackText(selection?.tracking_state, "pregame"),
      certification,
      available: raw?.status === "open" && selection?.available !== false && odds !== null,
      suspended: raw?.status === "suspended" || selection?.suspended === true,
      priceHistory: Object.freeze(priceHistory),
      bookPrices: Object.freeze(bookPrices),
      marketEvents: Object.freeze(marketEvents),
      researchHistory: Object.freeze(researchHistory),
    });
  });

  return Object.freeze({
    id: fallbackText(raw?.offer_id, "unknown-market"),
    leagueId,
    eventId: fallbackText(raw?.event_id, "unknown-event"),
    event,
    canonicalMarketId,
    canonicalType: definition?.canonicalType || canonicalMarketId || "unknown",
    providerMarketId: fallbackText(raw?.provider_market_id, fallbackText(raw?.market_type, "unknown")),
    displayName: definition?.displayName || fallbackText(raw?.market_name, fallbackText(raw?.market_type, "Unknown market")),
    category: definition?.category || "Specials",
    browseGroup: definition?.browseGroup || "Other",
    marketType: definition?.marketType || fallbackText(raw?.market_type, "unknown"),
    filterGroup: definition?.filterGroup || fallbackText(raw?.ui_group, "unavailable"),
    period: fallbackText(raw?.period, definition?.period || "full-event"),
    settlementScope: fallbackText(raw?.settlement_scope, definition?.settlementScope || "provider-rules"),
    isLive: raw?.is_live === true,
    isAlternate: raw?.is_alternate === true,
    isSgpEligible: raw?.sgp_eligible === true,
    source: fallbackText(raw?.source, "Sample Sportsbook"),
    sourceMode: fallbackText(raw?.source_mode, "sample"),
    openedAt: normalizeTimestamp(raw?.opened_at),
    lastUpdatedAt: normalizeTimestamp(raw?.last_updated_at),
    status: fallbackText(raw?.status, "unavailable"),
    certification,
    available: raw?.status === "open" && selections.some((selection) => selection.available),
    selections,
  });
}

export function createSportsRepository(payload = mockProviderPayload) {
  const certificationMap = new Map(
    (Array.isArray(payload?.mlb_certification?.domains) ? payload.mlb_certification.domains : [])
      .map((domain) => [domain?.domain, Object.freeze({
        domain: fallbackText(domain?.domain, "unknown"), state: fallbackText(domain?.state, "unknown"),
        publicLabel: fallbackText(domain?.publicLabel, "Unavailable"),
        providerHealth: fallbackText(domain?.providerHealth, "unavailable"),
        liveEligible: ["limited_live", "certified_live"].includes(domain?.state),
        certified: domain?.state === "certified_live",
        knownLimitations: Object.freeze(Array.isArray(domain?.knownLimitations) ? domain.knownLimitations.map(String) : []),
      })]),
  );
  const providerStatuses = new Map(
    (Array.isArray(payload?.league_statuses) ? payload.league_statuses : [])
      .map((status) => [status?.league_key, status]),
  );
  const leagues = SPORTS_REGISTRY
    .map((entry) => normalizeLeague(entry, providerStatuses.get(entry.leagueId)))
    .sort((a, b) => a.priorityTier - b.priorityTier);
  const liveCertification = certificationMap.get("live_score") || null;
  const events = (Array.isArray(payload?.events) ? payload.events : []).map((event) => normalizeEvent(event, liveCertification));
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const leagueMap = new Map(leagues.map((league) => [league.leagueId, league]));
  const markets = (Array.isArray(payload?.offers) ? payload.offers : []).map((market) => normalizeMarket(market, eventMap, leagueMap, certificationMap));
  const aliases = payload?.aliases && typeof payload.aliases === "object" ? payload.aliases : {};
  const liveStateChanges = (Array.isArray(payload?.live_state_events) ? payload.live_state_events : []).map((item) => Object.freeze({
    id: fallbackText(item?.id, ""), eventId: fallbackText(item?.eventId, ""), type: fallbackText(item?.type, "unknown"),
    previousStatus: fallbackText(item?.previousStatus, "unknown"), currentStatus: fallbackText(item?.currentStatus, "unknown"),
    occurredAt: normalizeTimestamp(item?.occurredAt), source: fallbackText(item?.source, "Source unavailable"),
    sourceMode: fallbackText(item?.sourceMode, "fixture"), verification: fallbackText(item?.verification, "unavailable"),
    summary: fallbackText(item?.summary, "Game status changed."),
  })).filter((item) => item.id && item.eventId && item.occurredAt);

  return Object.freeze({
    getLeagues: ({ enabledOnly = true } = {}) => leagues.filter((league) => !enabledOnly || league.enabled),
    getLeague: (leagueId) => leagues.find((league) => league.leagueId === leagueId) || null,
    getEvents: (leagueId, { featuredOnly = false } = {}) => events.filter((event) => event.leagueId === leagueId && (!featuredOnly || event.display.featured)),
    getMarkets: (leagueId) => markets.filter((market) => market.leagueId === leagueId),
    getMarketAvailability: (leagueId, { eventId = "" } = {}) => {
      const league = leagueMap.get(leagueId);
      const leagueMarkets = markets.filter((market) =>
        market.leagueId === leagueId && (!eventId || market.eventId === eventId));
      return (league?.supportedCanonicalMarketIds || []).map((canonicalMarketId) => {
        const instances = leagueMarkets.filter((market) => market.canonicalMarketId === canonicalMarketId);
        return Object.freeze({
          definition: getMarketDefinition(canonicalMarketId),
          canonicalMarketId,
          supported: true,
          available: instances.some((market) => market.available),
          activeCount: instances.filter((market) => market.available).length,
          suspended: instances.length > 0 && instances.every((market) => market.status === "suspended"),
          hasOdds: instances.some((market) => market.selections.some((selection) => Number.isFinite(selection.odds))),
          hasAnalysis: instances.some((market) => market.selections.some((selection) => selection.projection !== "Projection unavailable")),
        });
      });
    },
    getMarketBySelectionId: (selectionId) => markets.find((market) => market.selections.some((selection) => selection.id === selectionId)) || null,
    getLiveStateChanges: () => [...liveStateChanges],
    getCertification: (domainId) => certificationMap.get(domainId) || null,
    getAliases: () => ({ ...aliases }),
    getMetadata: () => {
      const status = payload?.provider_status && typeof payload.provider_status === "object" ? payload.provider_status : {};
      const generatedAt = normalizeTimestamp(status.last_updated_at || payload?.generated_at);
      const retrievedAt = normalizeTimestamp(status.fetched_at || payload?.generated_at);
      return {
        provider: fallbackText(status.provider, fallbackText(payload?.provider, "unknown")),
        mode: fallbackText(status.mode, "sample"),
        sample: status.sample === true || status.mode === "sample",
        state: fallbackText(status.state, isStale(generatedAt) ? "stale" : "fresh"),
        generatedAt,
        retrievedAt,
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
