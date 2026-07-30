import { getEntityProfileConfig } from "../config/entity-profile-config.js";
import { getEntityTypeDefinition } from "../config/entity-types.js";
import { getAvailableStats } from "../config/stat-registry.js";
import {
  ENTITY_FIELD_UNAVAILABLE,
  ENTITY_PROFILE_UPDATED_AT,
  MOCK_ENTITY_PROFILES,
} from "../data/mock-entity-profiles.js";

const TEAM_TYPES = new Set(["team", "national-team", "constructor"]);
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function abortError() {
  return new DOMException("Entity profile request was cancelled.", "AbortError");
}

function waitForMock(signal, delayMs) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

function freezeList(values) {
  return Object.freeze(values.map((value) => Object.freeze(value)));
}

function marketMatchesEntity(market, entity) {
  if (market.leagueId !== entity.leagueId) return false;
  if (entity.type === "league" || entity.type === "promotion" || entity.type === "competition") return true;
  return market.event?.participants?.some((participant) => participant.id === entity.id)
    || market.selections.some((selection) =>
      selection.participantId === entity.id
      || selection.teamId === entity.id
      || selection.competitorId === entity.id);
}

function eventMatchesEntity(event, entity) {
  if (event.leagueId !== entity.leagueId) return false;
  if (["league", "promotion", "competition"].includes(entity.type)) return true;
  return event.participants.some((participant) => participant.id === entity.id);
}

export class EntityProfileRepository {
  constructor(entityRegistry, sportsRepository, statsRepository, insightService, options = {}) {
    this.entityRegistry = entityRegistry;
    this.sportsRepository = sportsRepository;
    this.statsRepository = statsRepository;
    this.insightService = insightService;
    this.delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 90;
    this.cache = new Map();
    this.inflight = new Map();
    this.providerCalls = 0;
  }

  clearCache(entityId = "") {
    if (entityId) this.cache.delete(entityId);
    else this.cache.clear();
  }

  getDiagnostics() {
    return Object.freeze({
      providerCalls: this.providerCalls,
      cachedProfiles: this.cache.size,
      inflightRequests: this.inflight.size,
    });
  }

  async getProfile(entityId, { signal, force = false } = {}) {
    const id = String(entityId || "");
    if (!force && this.cache.has(id)) return this.cache.get(id);
    if (!force && this.inflight.has(id)) {
      const shared = await this.inflight.get(id);
      if (signal?.aborted) throw abortError();
      return shared;
    }
    const request = this.loadProfile(id, signal);
    this.inflight.set(id, request);
    try {
      const result = await request;
      if (result.status === "ready") this.cache.set(id, result);
      return result;
    } finally {
      if (this.inflight.get(id) === request) this.inflight.delete(id);
    }
  }

  async loadProfile(entityId, signal) {
    this.providerCalls += 1;
    await waitForMock(signal, this.delayMs);
    const entity = this.entityRegistry.getEntity(entityId);
    if (!entity) return Object.freeze({ status: "not-found", entityId });

    const mock = MOCK_ENTITY_PROFILES[entity.id] || {
      facts: {},
      collections: {},
      source: "edgeboard-mock-entity-provider",
      updatedAt: ENTITY_PROFILE_UPDATED_AT,
      sample: true,
    };
    const league = entity.leagueId ? this.sportsRepository.getLeague(entity.leagueId) : null;
    const events = entity.leagueId
      ? this.sportsRepository.getEvents(entity.leagueId).filter((event) => eventMatchesEntity(event, entity)).slice(0, 8)
      : [];
    const markets = entity.leagueId
      ? this.sportsRepository.getMarkets(entity.leagueId).filter((market) => marketMatchesEntity(market, entity)).slice(0, 8)
      : [];
    const relatedEntities = this.entityRegistry.getRelatedEntities(entity);
    const roster = this.entityRegistry.getEntities({ leagueId: entity.leagueId }).filter((candidate) =>
      candidate.teamId === entity.id
      || (entity.type === "constructor" && candidate.type === "driver"
        && candidate.relatedEntityIds.includes(entity.id))
      || (entity.type === "promotion" && ["fighter", "boxer"].includes(candidate.type)
        && candidate.relatedEntityIds.includes(entity.id)));

    let metrics = null;
    let insights = [];
    if (TEAM_TYPES.has(entity.type) && this.statsRepository.entities?.some((item) => item.id === entity.id)) {
      try {
        const definitions = getAvailableStats(entity.sportId, entity.leagueId);
        const summary = this.statsRepository.getTeamSummary(entity.id, {
          statIds: definitions.map((definition) => definition.id),
        });
        metrics = Object.freeze({
          ...summary,
          stats: Object.freeze(definitions.flatMap((definition) => {
            const calculated = summary.stats[definition.id];
            return Number.isFinite(calculated?.value) ? [Object.freeze({
              id: definition.id,
              label: definition.displayName,
              value: calculated.value,
              sampleSize: calculated.sampleSize,
              unit: definition.unit,
            })] : [];
          }).slice(0, 8)),
        });
        insights = this.insightService.generateTeamInsightCandidates(entity.id, { limit: 4 });
      } catch {
        metrics = null;
      }
    } else if (entity.type === "league") {
      insights = this.insightService.generateLeagueInsightCandidates(entity.leagueId, { limit: 4 });
    }

    const updatedAt = league?.lastUpdatedAt || mock.updatedAt || ENTITY_PROFILE_UPDATED_AT;
    const updatedTime = new Date(updatedAt).getTime();
    const stale = !Number.isFinite(updatedTime) || Date.now() - updatedTime > STALE_AFTER_MS;
    const config = getEntityProfileConfig(entity.type);
    const facts = Object.fromEntries(config.fields.map(([key, label]) => [
      key,
      Object.freeze({
        key,
        label,
        value: mock.facts?.[key]
          || entity.metadata?.[key]
          || (key === "sport" ? entity.sportId : "")
          || (key === "league" ? entity.leagueId?.toUpperCase() : "")
          || ENTITY_FIELD_UNAVAILABLE,
        available: Boolean(mock.facts?.[key] || entity.metadata?.[key]
          || (key === "sport" && entity.sportId) || (key === "league" && entity.leagueId)),
      }),
    ]));

    return Object.freeze({
      status: "ready",
      entity,
      typeDefinition: getEntityTypeDefinition(entity.type),
      config,
      facts: Object.freeze(facts),
      relatedEntities: freezeList(relatedEntities),
      roster: freezeList(roster),
      events: freezeList(events),
      markets: freezeList(markets),
      metrics,
      insights: freezeList(insights),
      placeholders: Object.freeze([...new Set([
        ...(mock.collections?.placeholders || []),
        ...config.sections
          .filter(([id]) => !["identity", "overview", "relationships", "markets", "insights", "roster", "schedule"].includes(id))
          .map(([, label]) => label),
      ])]),
      relatedQueries: Object.freeze([
        `Show recent results for ${entity.displayName}`,
        `What markets are available for ${entity.displayName}?`,
        `Show insights about ${entity.displayName}`,
      ]),
      dataStatus: Object.freeze({
        source: mock.source || "edgeboard-mock-entity-provider",
        updatedAt,
        sample: mock.sample !== false,
        freshness: stale ? "stale" : "fresh",
        partial: true,
        warning: stale
          ? "Sample entity metadata may be stale. No live provider is configured."
          : "Sample entity metadata is partial. Unavailable fields are shown explicitly.",
      }),
    });
  }
}

export function createEntityProfileRepository(entityRegistry, sportsRepository, statsRepository, insightService, options) {
  return new EntityProfileRepository(entityRegistry, sportsRepository, statsRepository, insightService, options);
}
