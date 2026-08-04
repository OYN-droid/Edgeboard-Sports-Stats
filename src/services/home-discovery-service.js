import { getStatDefinition } from "../config/stat-registry.js";

export const HOME_DISCOVERY_SCHEMA_VERSION = 1;

const clean = (value) => String(value ?? "").trim();
const unique = (values) => [...new Set((values || []).filter(Boolean))];

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}-${date.getDate()}`;
}

function eventTitle(event) {
  return clean(event?.display?.title)
    || (event?.participants || []).map((item) => clean(item.name)).filter(Boolean).join(" vs ")
    || clean(event?.name)
    || clean(event?.eventName)
    || "Event name unavailable";
}

function sourceMeta(source, updatedAt, sample = true) {
  return Object.freeze({ source: clean(source) || "Source unavailable", updatedAt: updatedAt || null, sample });
}

function queryAction(label, query, kind = "research") {
  return Object.freeze({ type: "query", kind, label, query });
}

function entityActions(entity, mode, contextLabel, statLabel = "recent form") {
  if (!entity?.id) return Object.freeze([
    queryAction("Research", `Research ${contextLabel}`),
  ]);
  const name = entity.name || entity.displayName || entity.id;
  const actions = [
    Object.freeze({ type: "profile", kind: "profile", label: "Profile", entityId: entity.id, profileSystem: entity.profileSystem || (entity.entityType === "team" ? "entity" : "athlete") }),
    queryAction("Game logs", `Show ${name}'s last 10 completed events`, "game-log"),
    queryAction("Compare", `Compare ${name} to the ${contextLabel} leaders in ${statLabel}`, "comparison"),
    queryAction("Visualize", `Visualize ${name}'s recent ${statLabel} trend`, "visualization"),
    queryAction("Research", `Research ${name}'s ${statLabel}`, "research"),
  ];
  if (mode !== "stats") actions.push(queryAction("Markets", `Show available markets for ${name}`, "market"));
  return Object.freeze(actions);
}

function insightCard(insight, mode, contextLabel, kind) {
  return Object.freeze({
    id: `home-${kind}-${insight.id}`,
    kind,
    title: insight.phrasing?.headline || insight.title || "Validated insight",
    summary: insight.phrasing?.shortSummary || insight.label || "Supporting text unavailable.",
    eyebrow: kind === "milestone" ? "Upcoming milestone"
      : kind === "streak" ? "Active streak"
        : kind === "fact" ? "Did you know?" : "Trending research",
    leagueId: insight.leagueId,
    sportId: insight.sportId,
    sampleSize: Number(insight.sampleSize) || 0,
    classification: "historical_fact",
    validationStatus: insight.validationStatus,
    source: sourceMeta(insight.source?.attribution || insight.source?.provider, insight.freshness?.lastUpdated),
    researchQualityInput: insight,
    entity: insight.entity || null,
    insightId: insight.id,
    actions: entityActions(insight.entity, mode, contextLabel, insight.statIds?.[0] || "recent form"),
  });
}

function eventCard(event, league, mode, kind = "game") {
  const title = eventTitle(event);
  const actions = [queryAction("Research game", `Research ${title}`, "research")];
  if (mode !== "stats") actions.push(queryAction("Markets", `Show available markets for ${title}`, "market"));
  return Object.freeze({
    id: `home-${kind}-${event.id}`,
    kind,
    title,
    summary: `${league?.leagueDisplayName || event.leagueId || "League unavailable"} · ${event.status || "status unavailable"}`,
    eyebrow: event.status === "live" ? "Live now" : "Today's game",
    leagueId: event.leagueId,
    sportId: event.sportId || league?.sportId,
    eventTime: event.startsAt || null,
    classification: "current_provider_data",
    validationStatus: event.dataQualityStatus || league?.dataQualityStatus || "unknown",
    source: sourceMeta(event.source?.provider || league?.dataProvider || "EdgeBoard sample provider", event.lastUpdatedAt || league?.lastUpdatedAt, event.sample !== false),
    actions: Object.freeze(actions),
  });
}

function leaderCard(entry, league, statDefinition, metadata, mode) {
  const entity = entry.entity;
  const statLabel = statDefinition?.displayName || statDefinition?.label || statDefinition?.id || "statistic";
  return Object.freeze({
    id: `home-leader-${league.leagueId}-${statDefinition.id}-${entity.id}`,
    kind: "leader",
    title: entity.name || entity.displayName || entity.id,
    summary: `${entry.value} ${statDefinition?.unit || ""}`.trim(),
    eyebrow: `${league.leagueDisplayName} · ${statLabel}`,
    leagueId: league.leagueId,
    sportId: league.sportId,
    sampleSize: entry.sampleSize || 0,
    classification: "historical_fact",
    validationStatus: "qualified_sample_leader",
    source: sourceMeta(metadata?.source, metadata?.lastUpdated),
    entity,
    actions: entityActions(entity, mode, league.leagueDisplayName, statLabel),
  });
}

function historicalEventCard(row, entity, mode, contextLabel) {
  return Object.freeze({
    id: `home-on-this-day-${row.row_id}`,
    kind: "on-this-day",
    title: row.event_name || row.event_id,
    summary: `${entity?.name || "Entity unavailable"} · completed sample event`,
    eyebrow: "On this day · available dataset",
    leagueId: row.league_id,
    sportId: row.sport_id,
    eventTime: row.event_date,
    sampleSize: 1,
    classification: "historical_fact",
    validationStatus: "completed_sample_row",
    source: sourceMeta("EdgeBoard sample historical provider", row.updated_at),
    entity: entity || null,
    actions: entityActions(entity, mode, contextLabel, "game log"),
  });
}

function discoveryCard(item, kind = "discovery") {
  return Object.freeze({
    id: item.id,
    kind,
    title: item.title,
    summary: item.summary,
    eyebrow: item.label,
    leagueId: item.leagueId,
    sportId: item.sportId,
    sampleSize: null,
    classification: item.localOnly ? "local_activity" : item.type === "market_topic" ? "current_provider_data" : "historical_fact",
    validationStatus: item.status,
    source: sourceMeta(item.sourceLabel, item.freshness?.lastUpdated, item.sampleMode),
    edgeTrust: item.edgeTrust,
    researchQuality: item.researchQuality,
    entity: item.primaryEntity,
    discoveryId: item.id,
    actions: item.actions,
    localOnly: item.localOnly,
    change: item.change,
    whyNotable: item.whyNotable,
  });
}

function section(id, title, description, cards, emptyMessage) {
  return Object.freeze({ id, title, description, cards: Object.freeze(cards), emptyMessage });
}

function firstLeaderboard(statsRepository, league) {
  const definitions = statsRepository.getAvailableLeaderboardStats(league.sportId, league.leagueId);
  for (const definition of definitions) {
    const board = statsRepository.getPlayerLeaderboard(definition.id, {
      sportId: league.sportId,
      leagueId: league.leagueId,
      dateRange: { type: "season", value: "current" },
      resultLimit: 1,
    });
    if (board.entries?.length) return { definition: getStatDefinition(definition.id) || definition, board };
  }
  return null;
}

export function createHomeDiscoveryModel({
  selection,
  visibleLeagues = [],
  sportsRepository,
  statsRepository,
  insightService,
  storyEngine = null,
  discoveryService = null,
  workspaceState = null,
  preferences = {},
  researchMode = "stats",
  currentDate = new Date(),
} = {}) {
  if (!sportsRepository || !statsRepository || !insightService) {
    throw new TypeError("Home discovery requires sports, statistics, and insight repositories.");
  }
  const leagueIds = visibleLeagues.map((league) => league.leagueId);
  const sportIds = unique(visibleLeagues.map((league) => league.sportId));
  const contextLabel = selection?.contextLabel || visibleLeagues[0]?.leagueDisplayName || "All Sports";
  const todayOnly = selection?.selection?.type === "system" && selection.selection.id === "today";
  const liveOnly = selection?.selection?.type === "system" && selection.selection.id === "live";
  const allInsights = liveOnly || todayOnly ? [] : insightService.getFeaturedInsights({
    leagueIds,
    sportIds,
    limit: 30,
    includeBettingContext: researchMode === "both",
    ...(todayOnly ? { dateRange: { type: "today" } } : {}),
  }).filter((item) => !["stale", "invalid", "incomplete"].includes(item.validationStatus)
    && item.freshness?.state !== "stale");
  const usedInsightIds = new Set();
  const takeInsights = (predicate, limit) => {
    const selected = [];
    for (const item of allInsights) {
      if (selected.length >= limit) break;
      if (usedInsightIds.has(item.id) || !predicate(item)) continue;
      usedInsightIds.add(item.id);
      selected.push(item);
    }
    return selected;
  };

  const allEvents = visibleLeagues.flatMap((league) => sportsRepository.getEvents(league.leagueId)
    .map((event) => ({ event, league })));
  const todayKey = localDateKey(currentDate);
  const todayEvents = allEvents.filter(({ event }) => localDateKey(event.startsAt) === todayKey
    && !["cancelled", "postponed"].includes(event.status));
  const scopedTodayEvents = liveOnly ? todayEvents.filter(({ event }) => event.status === "live") : todayEvents;
  const storyEvents = liveOnly ? allEvents.filter(({ event }) => event.status === "live") : scopedTodayEvents;

  const storyInsights = storyEngine || liveOnly ? [] : takeInsights(() => true, 2);
  const engineStories = storyEngine ? storyEngine.getFeaturedStories({
    leagueIds,
    sportIds,
    liveOnly,
    todayOnly,
  }, {
    limit: 6,
    mode: researchMode,
    now: currentDate,
    visibleLeagues,
  }).map((story) => Object.freeze({
    id: story.id,
    kind: "story",
    title: story.headline,
    summary: story.summary,
    eyebrow: story.storyType.replaceAll("_", " "),
    leagueId: story.leagueId,
    sportId: story.sportId,
    sampleSize: story.supportingEvidence.length,
    classification: story.classification,
    validationStatus: story.validationLabel,
    source: sourceMeta(story.sourceLabel, story.lastUpdated, story.sample),
    edgeTrust: story.edgeTrust,
    researchQuality: story.researchQuality,
    entity: story.primaryEntity,
    storyId: story.id,
    sourceInsightIds: story.sourceInsightIds || Object.freeze([]),
    actions: Object.freeze([story.primaryAction, ...story.secondaryActions].filter(Boolean)),
  })) : [];
  engineStories.flatMap((story) => story.sourceInsightIds || []).forEach((id) => usedInsightIds.add(id));
  const stories = storyEngine ? engineStories : [
    ...storyInsights.map((item) => insightCard(item, researchMode, contextLabel, "story")),
    ...storyEvents.slice(0, Math.max(0, 3 - storyInsights.length)).map(({ event, league }) => eventCard(event, league, researchMode, "story-game")),
  ];
  const discoveryScope = { leagueIds, sportIds, liveOnly, todayOnly };
  const discoveryOptions = { mode: researchMode, now: currentDate, visibleLeagues, preferences };
  const trending = discoveryService
    ? discoveryService.getTrendingResearch(discoveryScope, { ...discoveryOptions, limit: 6 }).map((item) => discoveryCard(item, "trending"))
    : takeInsights((item) => !item.type.includes("milestone"), 4)
      .map((item) => insightCard(item, researchMode, contextLabel, "trending"));
  const facts = takeInsights((item) => !item.type.includes("streak") && !item.type.includes("milestone"), 4)
    .map((item) => insightCard(item, researchMode, contextLabel, "fact"));
  const milestones = takeInsights((item) => item.type.startsWith("milestone"), 4)
    .map((item) => insightCard(item, researchMode, contextLabel, "milestone"));
  const streaks = (liveOnly ? [] : insightService.getActiveStreaks({ leagueIds, sportIds, limit: 8 }))
    .filter((item) => !usedInsightIds.has(item.id)
      && !["stale", "invalid", "incomplete"].includes(item.validationStatus) && item.claimData?.active !== false)
    .slice(0, 4).map((item) => {
      usedInsightIds.add(item.id);
      return insightCard(item, researchMode, contextLabel, "streak");
    });

  const historicalRows = (liveOnly ? [] : statsRepository.rows).filter((row) => row.status === "completed"
    && leagueIds.includes(row.league_id)
    && monthDayKey(row.event_date) === monthDayKey(currentDate));
  const onThisDay = [...new Map(historicalRows.map((row) => [row.event_id, row])).values()].slice(0, 4).map((row) =>
    historicalEventCard(row, statsRepository.entities.find((item) => item.id === row.entity_id), researchMode, contextLabel));

  const leaders = (liveOnly ? [] : visibleLeagues).slice(0, 6).flatMap((league) => {
    const result = firstLeaderboard(statsRepository, league);
    return result ? [leaderCard(result.board.entries[0], league, result.definition, result.board.metadata, researchMode)] : [];
  }).slice(0, 6);
  const games = scopedTodayEvents.slice(0, 8).map(({ event, league }) => eventCard(event, league, researchMode));
  const continueExploring = discoveryService
    ? discoveryService.getContinueExploring(workspaceState, discoveryScope, {
      ...discoveryOptions,
      defaultSportId: sportIds[0] || "multi-sport",
      defaultLeagueId: leagueIds[0] || "all",
      limit: 4,
    }).map((item) => discoveryCard(item, "continue"))
    : [];
  const changed = discoveryService
    ? discoveryService.getRecentlyChanged(discoveryScope, { ...discoveryOptions, limit: 5 }).map((item) => discoveryCard(item, "change"))
    : [];
  const explore = discoveryService
    ? discoveryService.getDiscoveryItems(discoveryScope, discoveryOptions)
      .filter((item) => ["research_topic", "market_topic"].includes(item.type))
      .slice(0, 6)
      .map((item) => discoveryCard(discoveryService.buildDiscoveryViewModel(item, discoveryOptions), "explore"))
    : [];

  return Object.freeze({
    schemaVersion: HOME_DISCOVERY_SCHEMA_VERSION,
    scope: Object.freeze({ selection: selection?.selection || null, contextLabel, leagueIds: Object.freeze(leagueIds), sportIds: Object.freeze(sportIds) }),
    researchMode,
    generatedAt: statsRepository.updatedAt || null,
    sample: true,
    sections: Object.freeze([
      section("stories", "Today’s Stories", `Validated stories for ${contextLabel}.`, stories, liveOnly
        ? "No normalized event currently has live status in this scope."
        : todayOnly ? "No validated story or scheduled event is available for today in this scope."
          : "No fresh deterministic story is available for this scope."),
      section("trending", "Trending Research", "Prioritized by deterministic insight relevance, validation, and sample quality—not popularity tracking.", trending, "No additional validated research trend is available."),
      section("continue", "Continue Exploring", "Local-device activity and saved research only. Personalization never changes explicit search results.", continueExploring, "Research a player, team, story, or statistic and it will appear here."),
      section("changed", "Recently Changed", "Meaningful fixture-backed changes with old and new values retained; routine refreshes are excluded.", changed, "No meaningful validated change is available for this scope."),
      section("explore", "Explore Sports", "Progressive sport-aware topics backed by currently available normalized data.", explore, "No verified discovery topics are available for this league right now."),
      section("facts", "Did You Know?", "Calculated facts from completed source rows.", facts, "No distinct calculated fact passed the current scope rules."),
      section("on-this-day", "On This Day", `Completed sample events matching ${currentDate.toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`, onThisDay, "No completed event in the available sample matches this local calendar date."),
      section("milestones", "Upcoming Milestones", "Only eligible, nearby dataset-scoped milestones are shown.", milestones, "No nearby milestone passed the configured distance and sample rules."),
      section("streaks", "Active Streaks", "Active sequences calculated from chronologically ordered completed events.", streaks, "No active streak passed the configured validation and sample rules."),
      section("leaders", "Current Leaders", "Qualified leaders from the available current-season sample.", leaders, "No qualified leaderboard entry is available for this scope."),
      section("games", "Today’s Games", "Normalized events scheduled for the local calendar date.", games, "No games or events are scheduled today in the available sample for this scope."),
    ]),
    disclaimer: "Discovery cards use deterministic sample data. Trending means prioritized research relevance, not measured public popularity.",
  });
}
