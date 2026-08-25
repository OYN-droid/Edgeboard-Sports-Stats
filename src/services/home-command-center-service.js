import {
  HOME_COMMAND_CENTER_INTELLIGENCE,
  HOME_COMMAND_CENTER_QUICK_RESEARCH,
  HOME_COMMAND_CENTER_SCHEDULE_LEAGUES,
  HOME_COMMAND_CENTER_STORY_IDS,
} from "../config/home-command-center-config.js";

export const HOME_COMMAND_CENTER_SCHEMA_VERSION = 1;

const freeze = (value) => Object.freeze(value);
const FIXTURE_PERSON_ID_PATTERN = /(?:^|-)sample(?:-|$)/i;

export function isSyntheticFixturePersonId(value) {
  return typeof value === "string" && FIXTURE_PERSON_ID_PATTERN.test(value.trim());
}

export function isHomeStoryEligible(story) {
  const entity = story?.primaryEntity;
  return story?.media?.illustration?.fallbackLevel === "exact"
    && (!entity || entity.entityType === "team" || !isSyntheticFixturePersonId(entity.id));
}

function eventHasSyntheticFixturePerson(event) {
  return (event?.participants || []).some((participant) => {
    const role = participant?.participantType || participant?.participant_type || participant?.role;
    return ["athlete", "competitor", "driver", "fighter", "player"].includes(role)
      && isSyntheticFixturePersonId(participant.id);
  });
}

function marketHasSyntheticFixturePerson(record) {
  if ([record?.entityId, record?.playerId, record?.fighterId, record?.driverId].some(isSyntheticFixturePersonId)
    || eventHasSyntheticFixturePerson(record?.model?.event)) return true;
  const role = record?.participantRole;
  if (!["athlete", "competitor", "driver", "fighter", "player"].includes(role)) return false;
  // Legacy provider-only fixture selections can lack canonical entity IDs. Treat
  // their normalized identity token as an ID at this presentation boundary.
  const normalizedIdentity = String(record?.participantName || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return isSyntheticFixturePersonId(normalizedIdentity);
}

function selectByConfiguredOrder(items, ids, idFor = (item) => item?.id) {
  const indexed = new Map((items || []).map((item) => [idFor(item), item]));
  return ids.map((id) => indexed.get(id)).filter(Boolean);
}

function selectSchedule(eventEntries = [], limit = 7) {
  const usable = eventEntries.filter(({ event }) => event?.startsAt
    && !["cancelled", "postponed"].includes(event.status)
    && !eventHasSyntheticFixturePerson(event));
  const preferred = selectByConfiguredOrder(usable, HOME_COMMAND_CENTER_SCHEDULE_LEAGUES, ({ league }) => league?.leagueId);
  const usedLeagues = new Set(preferred.map(({ league }) => league.leagueId));
  const remainder = usable
    .filter(({ league }) => !usedLeagues.has(league?.leagueId))
    .sort((left, right) => new Date(left.event.startsAt) - new Date(right.event.startsAt));
  return [...preferred, ...remainder].slice(0, limit);
}

function selectMarkets(records = [], limit = 5) {
  const selected = [];
  const leagues = new Set();
  for (const record of records) {
    if (!record?.valid || marketHasSyntheticFixturePerson(record) || leagues.has(record.leagueId)) continue;
    selected.push(record);
    leagues.add(record.leagueId);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) {
    for (const record of records) {
      if (!record?.valid || marketHasSyntheticFixturePerson(record) || selected.includes(record)) continue;
      selected.push(record);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

export function createHomeCommandCenterModel({ storyViews = [], eventEntries = [], marketRecords = [] } = {}) {
  const eligibleStories = storyViews.filter(isHomeStoryEligible);
  const preferredStories = selectByConfiguredOrder(eligibleStories, HOME_COMMAND_CENTER_STORY_IDS);
  const storyIds = new Set(preferredStories.map((story) => story.id));
  const stories = [...preferredStories, ...eligibleStories.filter((story) => !storyIds.has(story.id))].slice(0, 6);
  const headlines = eligibleStories.filter((story) => story.id !== stories[0]?.id).slice(0, 8);
  return freeze({
    schemaVersion: HOME_COMMAND_CENTER_SCHEMA_VERSION,
    sample: true,
    featuredStory: stories[0] || null,
    topStories: freeze(stories),
    headlines: freeze(headlines),
    schedule: freeze(selectSchedule(eventEntries)),
    markets: freeze(selectMarkets(marketRecords)),
    quickResearch: HOME_COMMAND_CENTER_QUICK_RESEARCH,
    intelligence: HOME_COMMAND_CENTER_INTELLIGENCE,
    disclosure: "Validated fixture and sample data for portfolio demonstration; no live feed or betting recommendation.",
  });
}
