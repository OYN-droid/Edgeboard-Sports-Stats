import {
  ANNIVERSARY_CATEGORIES, ANNIVERSARY_DEFAULT_LIMIT, ANNIVERSARY_SCHEMA_VERSION, ANNIVERSARY_SCORE_WEIGHTS,
} from "../config/anniversary-config.js";
const clean = (value) => String(value ?? "").trim();
const freeze = (values) => Object.freeze([...(values || [])]);
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));

function calendarParts(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? { year, month, day } : null;
}

function isoDate(parts) { return parts ? `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}` : ""; }
function monthDay(parts) { return parts ? `${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}` : ""; }

export function resolveAnniversaryDate(value = new Date(), offsetDays = 0) {
  const parts = calendarParts(value);
  if (!parts) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  date.setDate(date.getDate() + Number(offsetDays || 0));
  return Object.freeze({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), iso: isoDate({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }) });
}

function categoryFor(item) {
  const explicit = clean(item.metadata?.anniversaryCategory);
  if (ANNIVERSARY_CATEGORIES.includes(explicit)) return explicit;
  return ({ championship: "Championship", title_change: "Championship", record: "Record", dataset_high: "Record", milestone: "Milestone", debut: "Debut", final_appearance: "Retirement", comeback: "Comeback", upset: "Upset", fighter_performance: "Fight", driver_performance: "Race", tournament: "Tournament" })[item.type] || "Historic Performance";
}

function eventEvidence(item) {
  return item.supportingEvidence.filter((entry) => entry.status === "completed" && calendarParts(entry.occurredAt));
}

function significance(item, category) {
  const supplied = Number(item.metadata?.historicalSignificance);
  if (Number.isFinite(supplied)) return clamp(supplied);
  return ["Championship", "World Championship", "Olympic Event"].includes(category) ? 85
    : ["Record", "Perfect Game", "No Hitter"].includes(category) ? 78
      : ["Milestone", "Debut", "Retirement"].includes(category) ? 68 : 60;
}

export function parseAnniversaryQuery(query, { today = new Date() } = {}) {
  const text = clean(query); const normalized = text.toLowerCase();
  const offset = /\byesterday\b/.test(normalized) ? -1 : /\btomorrow\b/.test(normalized) ? 1 : 0;
  const explicit = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const target = resolveAnniversaryDate(explicit?.[0] || today, offset);
  const year = /\b(?:19|20)\d{2}\b/.exec(text)?.[0] || "";
  const category = /championship/i.test(text) ? "Championship" : /milestone/i.test(text) ? "Milestone"
    : /knockout|finish/i.test(text) ? "Fight" : /no[- ]?hitter/i.test(text) ? "No Hitter"
      : /formula 1|race/i.test(text) ? "Race" : "";
  return Object.freeze({ intent: "event_anniversary", query: text, date: target?.iso || "", originalYear: year ? Number(year) : null, category, warnings: freeze(target ? [] : ["The requested anniversary date is invalid."]) });
}

export class AnniversaryService {
  constructor({ historicalService, sportsRepository, statsRepository, entityRegistry, clock = () => new Date() } = {}) {
    if (!historicalService || !sportsRepository || !statsRepository || !entityRegistry) throw new TypeError("Anniversaries require Historical Explorer and canonical sports, statistics, and entity repositories.");
    this.historicalService = historicalService; this.sportsRepository = sportsRepository; this.statsRepository = statsRepository; this.entityRegistry = entityRegistry; this.clock = clock;
    this.categories = ANNIVERSARY_CATEGORIES;
    this.cache = new Map(); this.requestSequence = 0;
  }

  buildAnniversary(item, evidence, target, context = {}) {
    const occurred = calendarParts(evidence.occurredAt); if (!occurred || occurred.year > target.year) return null;
    const historical = this.historicalService.buildHistoricalViewModel(item);
    const category = categoryFor(item); const league = this.sportsRepository.getLeague(item.leagueId);
    const primary = historical.primaryEntity; const yearsAgo = target.year - occurred.year;
    const primaryEntityAction = historical.actions.find((action) => action.type === "entity");
    const currentEvents = this.sportsRepository.getEvents(item.leagueId).filter((event) => !["cancelled", "postponed", "completed"].includes(event.status));
    const currentMarkets = context.mode === "stats" ? [] : this.sportsRepository.getMarkets(item.leagueId).filter((market) => market.available && currentEvents.some((event) => event.id === market.eventId));
    const timeline = this.getTimeline(item, evidence);
    const historicalSignificance = significance(item, category);
    const quality = historical.researchQuality?.score || 0;
    const trust = historical.edgeTrust?.researchQuality?.score || quality;
    const score = clamp(
      historicalSignificance / 100 * ANNIVERSARY_SCORE_WEIGHTS.historicalSignificance
      + trust / 100 * ANNIVERSARY_SCORE_WEIGHTS.edgeTrust
      + quality / 100 * ANNIVERSARY_SCORE_WEIGHTS.researchQuality
      + Number(context.leagueId === item.leagueId) * ANNIVERSARY_SCORE_WEIGHTS.selectedLeague
      + Number(context.sportId === item.sportId) * ANNIVERSARY_SCORE_WEIGHTS.selectedSport
      + Number(primary?.active) * ANNIVERSARY_SCORE_WEIGHTS.currentEntityActivity
      + Number(Boolean(item.metadata?.rivalryId)) * ANNIVERSARY_SCORE_WEIGHTS.currentRivalry
      + Number(item.type === "milestone") * ANNIVERSARY_SCORE_WEIGHTS.currentMilestone
      + Number(currentEvents.length > 0) * ANNIVERSARY_SCORE_WEIGHTS.currentMatchup
      + Math.max(0, 1 - yearsAgo / 100) * ANNIVERSARY_SCORE_WEIGHTS.recency
      + Number(Boolean(item.coverage)) * ANNIVERSARY_SCORE_WEIGHTS.coverage
      + ANNIVERSARY_SCORE_WEIGHTS.novelty,
    );
    const summary = clean(item.metadata?.anniversarySummary) || `${evidence.label}. ${historical.coverageLabel}.`;
    return Object.freeze({
      id: `anniversary-${item.id}-${evidence.id}`, schemaVersion: ANNIVERSARY_SCHEMA_VERSION, type: "historical_anniversary",
      historicalItemId: item.id, eventId: evidence.eventId || item.eventIds[0] || null, title: item.title, summary,
      date: isoDate(occurred), originalYear: occurred.year, yearsAgo, monthDay: monthDay(occurred), category,
      sportId: item.sportId, sportName: league?.sportDisplayName || item.sportId, leagueId: item.leagueId, leagueName: league?.leagueDisplayName || item.leagueId,
      entityIds: item.entityIds, eventIds: item.eventIds, primaryEntity: primary, story: Object.freeze({ classification: "historical_fact", claimSource: "structured_historical_item", historicalItemId: item.id }),
      validationStatus: item.validationStatus, validationLabel: historical.validationLabel, coverage: item.coverage, coverageLabel: historical.coverageLabel,
      sources: item.sources, freshness: item.freshness, edgeTrust: item.edgeTrust, researchQuality: item.researchQuality,
      media: primary?.media || null, supportingEvidence: freeze([evidence]), relatedItems: this.historicalService.getRelatedHistoricalItems(item, 4),
      facts: freeze([
        { id: "evidence-date", label: "Evidence date", value: isoDate(occurred), sourceId: evidence.sourceId },
        { id: "elapsed-years", label: "Calendar distance", value: `${yearsAgo} year${yearsAgo === 1 ? "" : "s"} ago`, sourceId: evidence.sourceId },
        { id: "validated-scope", label: "Validated scope", value: historical.coverageLabel, sourceId: item.sources[0]?.id || evidence.sourceId },
      ]),
      timeline, currentConnections: Object.freeze({ entity: primary || null, entityProfileSystem: primaryEntityAction?.profileSystem || "entity", league: league || null, currentEvents: freeze(currentEvents.slice(0, 3)), currentMarkets: freeze(currentMarkets.slice(0, 4)), marketsMessage: currentMarkets.length ? "Current provider-confirmed markets are available for related upcoming events." : "No compatible current market is attached." }),
      score: Number(score.toFixed(1)), historicalSignificance, sample: item.sample,
      warnings: freeze([...item.warnings, "Anniversary year and years-ago values are calculated from the completed historical evidence date."]),
      route: `/history/anniversaries/${encodeURIComponent(`anniversary-${item.id}-${evidence.id}`)}`,
      actions: freeze([
        { type: "route", label: "View Story", href: `/history/anniversaries/${encodeURIComponent(`anniversary-${item.id}-${evidence.id}`)}` },
        { type: "research", label: "Ask Edge Intelligence", query: `What happened on ${isoDate(occurred)} in the available ${league?.leagueDisplayName || item.leagueId} historical data?`, context: { itemId: item.id } },
        { type: "route", label: "View Timeline", href: `/history/anniversaries/${encodeURIComponent(`anniversary-${item.id}-${evidence.id}`)}#anniversaryTimeline` },
        { type: "share-anniversary", label: "Share", anniversaryId: `anniversary-${item.id}-${evidence.id}` },
      ]),
    });
  }

  getAnniversaries({ date = this.clock(), sportId = "", leagueId = "", year = null, category = "", limit = ANNIVERSARY_DEFAULT_LIMIT, mode = "stats" } = {}) {
    const target = resolveAnniversaryDate(date); if (!target) return Object.freeze({ date: null, items: freeze([]), total: 0, warnings: freeze(["Choose a valid calendar date."]) });
    const key = JSON.stringify([target.iso, sportId, leagueId, year, category, limit, mode]); if (this.cache.has(key)) return this.cache.get(key);
    const items = this.historicalService.items.flatMap((item) => eventEvidence(item).map((evidence) => this.buildAnniversary(item, evidence, target, { sportId, leagueId, mode })))
      .filter(Boolean).filter((item) => item.monthDay === monthDay(target) && (!sportId || item.sportId === sportId) && (!leagueId || item.leagueId === leagueId)
        && (!year || item.originalYear === Number(year)) && (!category || item.category === category))
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    const result = Object.freeze({ date: target, items: freeze(items.slice(0, Math.max(1, Math.min(50, Number(limit) || ANNIVERSARY_DEFAULT_LIMIT)))), total: items.length, warnings: freeze(items.length ? [] : ["No validated historical event in the selected sample coverage matches this calendar date and scope."]) });
    this.cache.set(key, result); return result;
  }

  getAnniversary(id, { asOfDate = this.clock(), mode = "stats" } = {}) {
    const targetId = clean(id);
    const target = resolveAnniversaryDate(asOfDate);
    if (!target) return null;
    for (const item of this.historicalService.items) for (const evidence of eventEvidence(item)) {
      const candidate = this.buildAnniversary(item, evidence, target, { sportId: item.sportId, leagueId: item.leagueId, mode });
      if (candidate?.id === targetId) return candidate;
    }
    return null;
  }

  searchAnniversaries(query, filters = {}) {
    const text = clean(query).toLowerCase(); const parsed = parseAnniversaryQuery(query, { today: filters.date || this.clock() });
    const result = this.getAnniversaries({ ...filters, date: parsed.date || filters.date || this.clock(), year: parsed.originalYear || filters.year, category: parsed.category || filters.category, limit: filters.limit || 12 });
    const generic = /\b(today|history|on this day|anniversar(?:y|ies)|records?|championship)\b/i.test(text);
    return Object.freeze({ ...result, parsed, items: freeze(result.items.filter((item) => generic || [item.title, item.summary, item.category, item.sportName, item.leagueName, item.primaryEntity?.name, ...item.eventIds].some((value) => clean(value).toLowerCase().includes(text)))) });
  }

  getTimeline(item, evidence) {
    const primaryId = item.entityIds[0]; const events = primaryId ? this.historicalService.getEntityTimeline(primaryId).events : [];
    const currentTime = calendarParts(evidence.occurredAt); const currentKey = Number(isoDate(currentTime).replaceAll("-", ""));
    const ordered = events.filter((entry) => calendarParts(entry.date)).map((entry) => ({ ...entry, key: Number(isoDate(calendarParts(entry.date)).replaceAll("-", "")) })).sort((a, b) => a.key - b.key || a.id.localeCompare(b.id));
    const before = [...ordered].reverse().find((entry) => entry.key < currentKey) || null; const after = ordered.find((entry) => entry.key > currentKey) || null;
    return Object.freeze({ before, event: Object.freeze({ id: evidence.id, date: evidence.occurredAt, title: item.title, type: item.type, eventId: evidence.eventId, sourceId: evidence.sourceId, validationStatus: item.validationStatus }), after, accessibleSummary: `Before: ${before?.title || "no earlier supported event"}. Historical event: ${item.title}. After: ${after?.title || "no later supported event"}.` });
  }

  getResearchPaths(anniversary) {
    if (!anniversary) return freeze([]); const name = anniversary.primaryEntity?.name || anniversary.leagueName;
    return freeze([
      { label: "Compare to today", query: `Compare ${anniversary.title} with current ${anniversary.leagueName} data` },
      { label: "Show career", query: `Show ${name} career timeline` }, { label: "Show season", query: `Explore the ${anniversary.originalYear} ${anniversary.leagueName} season` },
      { label: "Show records", query: `Show available ${anniversary.leagueName} records` }, { label: "Show current leaders", query: `Show current ${anniversary.leagueName} leaders` },
      { label: "Show rivalry", query: `Show supported rivalry history related to ${name}` }, { label: "Show visualization", query: `Visualize the timeline for ${anniversary.title}` },
      { label: "Ask Edge Intelligence", query: `Explain why ${anniversary.title} was notable within ${anniversary.coverageLabel.toLowerCase()}` },
    ]);
  }

  shareSnapshot(anniversary) {
    if (!anniversary) return null;
    return Object.freeze({ schemaVersion: ANNIVERSARY_SCHEMA_VERSION, type: "historical_anniversary_share", headline: anniversary.title, date: anniversary.date, yearsAgo: anniversary.yearsAgo, summary: anniversary.summary, source: anniversary.sources[0] || null, researchQuality: anniversary.researchQuality, edgeTrust: anniversary.edgeTrust, coverage: anniversary.coverage, validationStatus: anniversary.validationStatus, sample: anniversary.sample, sharedAt: new Date().toISOString() });
  }

  invalidateHistoricalItem(itemId) { [...this.cache.entries()].filter(([, result]) => result.items.some((item) => item.historicalItemId === itemId)).forEach(([key]) => this.cache.delete(key)); }
  clearCache() { this.cache.clear(); }
  async getAnniversariesAsync(filters = {}, options = {}) { const sequence = ++this.requestSequence; await Promise.resolve(); if (options.signal?.aborted || sequence !== this.requestSequence) throw new DOMException("Anniversary request superseded.", "AbortError"); return this.getAnniversaries(filters); }
}

export function createAnniversaryService(dependencies) { return new AnniversaryService(dependencies); }
export { ANNIVERSARY_CATEGORIES };
