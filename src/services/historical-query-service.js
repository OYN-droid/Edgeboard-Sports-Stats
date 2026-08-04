import { HISTORICAL_QUERY_INTENTS } from "../config/historical-config.js";

const clean = (value) => String(value || "").trim();

const RULES = Object.freeze([
  ["championship_history", /\b(championship|champions?|title history|title lineage)\b/i],
  ["dynasty_history", /\b(dynast(?:y|ies)|dominant run)\b/i],
  ["rivalry_history", /\b(rivalr(?:y|ies)|trilogy|rematches?)\b/i],
  ["comeback_history", /\b(comebacks?|deficit overcome|position gain)\b/i],
  ["upset_history", /\b(upset|seeded|underdog)\b/i],
  ["streak_history", /\b(longest|streaks?)\b/i],
  ["milestone_history", /\b(milestone|reached)\b/i],
  ["athlete_career_timeline", /\b(career timeline|career history)\b/i],
  ["team_timeline", /\b(team|franchise) timeline\b/i],
  ["organization_timeline", /\b(organization|promotion|constructor) timeline\b/i],
  ["event_anniversary", /\b(on this day|anniversary)\b/i],
  ["era_comparison", /\b(era|decade)\b.*\b(compare|versus|vs\.?|comparison)\b/i],
  ["season_comparison", /\b(compare|versus|vs\.?|comparison)\b.*\bseasons?\b|\b20\d{2}\b.*\b20\d{2}\b/i],
  ["historical_comparison", /\b(compare|versus|vs\.?|comparison)\b/i],
  ["head_to_head_history", /\b(head[- ]to[- ]head|versus|vs\.?)\b/i],
  ["historical_leaderboard", /\b(historical leaders?|leaderboard|who led)\b/i],
  ["single_game_record", /\b(single[- ]game|in a game)\b.*\b(record|high|most|highest)\b/i],
  ["single_event_record", /\b(single[- ]event|in an event|fastest finishes?|fastest knockouts?)\b/i],
  ["season_record", /\bseason\b.*\b(record|high|most|highest)\b/i],
  ["career_record_available", /\bcareer\b.*\b(record|high|most|highest)\b/i],
  ["competition_record", /\bcompetition\b.*\b(record|high|most|highest)\b/i],
  ["team_record", /\bteam|franchise\b.*\b(record|high|most|highest)\b/i],
  ["greatest_performances", /\bgreatest\b.*\b(performance|game|fight|race|match)/i],
  ["top_available_performances", /\b(top|best|highest|most|fastest|largest)\b.*\b(performance|game|fight|race|match|knockout|finish|scor|passing|strikeout)/i],
  ["playoff_history", /\b(playoff|postseason) history\b/i],
  ["tournament_history", /\b(tournament|grand slam) history\b/i],
  ["historical_fun_fact", /\b(fun fact|did you know)\b/i],
  ["historical_story", /\b(historical story|what happened next)\b/i],
  ["historical_exploration", /\b(history|historical|past seasons?|available data)\b/i],
]);

function seasons(text) {
  return [...new Set(clean(text).match(/\b(?:19|20)\d{2}\b/g) || [])];
}

export function parseHistoricalQuery(query, { entityRegistry, sportsRepository, sportId = "", leagueId = "" } = {}) {
  const text = clean(query);
  const normalized = text.toLowerCase();
  const matched = RULES.find(([, pattern]) => pattern.test(text));
  let intent = matched?.[0] || "historical_exploration";
  const allTimeRequested = /\ball[- ]time|ever|greatest of all time|first ever\b/i.test(text);
  const foundSeasons = seasons(text);
  const leagueMatch = sportsRepository?.getLeagues?.().find((league) => [league.leagueId, league.leagueDisplayName, ...(league.queryTerms || [])]
    .some((term) => normalized.includes(String(term).toLowerCase())));
  const resolvedLeagueId = leagueMatch?.leagueId || leagueId;
  const resolvedSportId = leagueMatch?.sportId || sportId;
  const entityMatches = entityRegistry?.search?.(text, { sportId: resolvedSportId, leagueId: resolvedLeagueId }, 6) || [];
  const exactEntities = entityMatches.filter((match) => {
    const entity = entityRegistry?.getEntity?.(match.id) || match;
    return [entity.displayName, entity.name, ...(entity.aliases || [])]
      .filter(Boolean)
      .some((term) => normalized.includes(String(term).toLowerCase()));
  });
  const ambiguous = exactEntities.length > 2 || (/\bthis (athlete|team|driver|fighter)\b/i.test(text) && exactEntities.length === 0);
  // A recognized historical operation remains deterministic even when its
  // subject must be supplied from navigation context. Only otherwise generic
  // queries become ambiguity-only results.
  if (ambiguous && !matched) intent = "ambiguous_historical_scope";
  const requiredValidationLevel = allTimeRequested ? "verified_complete"
    : /\brecord|longest|most|first\b/i.test(text) ? "provider_asserted" : "dataset_only";
  const unsupportedPortions = [];
  const warnings = [];
  if (allTimeRequested) {
    unsupportedPortions.push("All-time scope requires complete provider-certified coverage.");
    warnings.push("The current sample provider cannot support universal all-time wording unless a bounded complete scope is explicitly validated.");
  }
  if (/\bupset\b/i.test(text) && !/\b(seed|rank|odds|standings)\b/i.test(text)) warnings.push("Upset identification requires a supplied pre-event seed, ranking, standings, or odds baseline.");
  return Object.freeze({
    intent: HISTORICAL_QUERY_INTENTS.includes(intent) ? intent : "unsupported_historical_scope",
    query: text,
    intendedHistoricalScope: allTimeRequested ? "all_time_requested" : foundSeasons.length > 1 ? "cross_season" : foundSeasons.length === 1 ? "season" : "available_dataset",
    dateRange: Object.freeze({ type: foundSeasons.length ? "season" : "available", seasons: Object.freeze(foundSeasons), start: null, end: null }),
    entityIds: Object.freeze(exactEntities.slice(0, 2).map((entity) => entity.id)),
    ambiguityStatus: ambiguous ? "requires_context" : "resolved",
    ambiguousCandidates: Object.freeze(ambiguous ? entityMatches : []),
    sportId: resolvedSportId,
    leagueId: resolvedLeagueId,
    competitionId: exactEntities.find((entity) => entity.type === "competition")?.id || "",
    statOrEventType: /\b(assists?|rebounds?|points?|home runs?|strikeouts?|passing|goals?|podiums?|knockouts?|submissions?)\b/i.exec(text)?.[0]?.toLowerCase() || "",
    requiredValidationLevel,
    providerCoverageRequired: Object.freeze({ completeSeasons: allTimeRequested, eventResults: true, identityResolution: true }),
    unsupportedPortions: Object.freeze(unsupportedPortions), warnings: Object.freeze(warnings), allTimeRequested,
  });
}
