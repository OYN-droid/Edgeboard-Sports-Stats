import { normalizeResearchMode } from "./research-mode-service.js";

const bettingTerms = /\b(prop|props|odds|sportsbook|parlay|moneyline|spread|line movement|sgp|same game|plus money|confidence|edge|upside|over candidate|under candidate|rated highly)\b/i;
const marketLine = /\b(over|under|line)\s*[+-]?\d+(?:\.\d+)?/i;
const statTerms = /\b(average|averaging|total|per game|games?|points?|assists?|rebounds?|yards?|touchdowns?|hits?|home runs?|strikeouts?|goals?|shots?|wins?|podiums?|minutes?|threes?|three-pointers?|leader|most|fewest|highest|lowest)\b/i;
const unsupportedTerms = /\b(fantasy points?|qbr|wins above replacement|war)\b/i;
const insightTerms = /\b(fun fact|insight|streak|milestone|unusual|rare|rarity|trend|changed|season high|career high|record candidate)\b/i;

const comparisonTerms = /\b(compare|comparison|compared with|versus|vs\.?)\b/i;
const leaderboardTerms = /\b(who leads|leaderboard|leaders?|top\s+\d+|rank|ranking|most|fewest|highest|lowest|best)\b/i;

export function classifyResearchQuery(query, selectedMode = "betting") {
  const text = String(query || "").trim();
  const mode = normalizeResearchMode(selectedMode);
  const signals = [];
  if (!text) {
    return Object.freeze({
      intent: "ambiguous",
      recommendedMode: mode,
      selectedMode: mode,
      confidence: 0,
      conflict: false,
      signals: Object.freeze(["empty query"]),
    });
  }

  const hasBetting = bettingTerms.test(text) || marketLine.test(text);
  const hasStats = statTerms.test(text)
    || /\b(last|this season|career|consecutive|streak|record|compare|versus|by game)\b/i.test(text);
  if (hasBetting) signals.push("betting terminology");
  if (hasStats) signals.push("statistical terminology");

  let intent = "unsupported";
  if (unsupportedTerms.test(text)) {
    intent = "unsupported";
  } else if (hasBetting && insightTerms.test(text)) {
    intent = "mixed_insight_betting";
  } else if (/\b(fun fact|tell me something interesting|what is unusual)\b/i.test(text)) {
    intent = "fun_fact";
  } else if (/\bhow close\b.+\bmilestone\b|\baway from\b.+\bmilestone\b/i.test(text)) {
    intent = "milestone_proximity";
  } else if (/\bmilestone\b/i.test(text)) {
    intent = "milestone_lookup";
  } else if (/\b(rare|rarity|unusual combination|how unusual)\b/i.test(text)) {
    intent = "rarity_search";
  } else if (/\bwhat streak|active .+ streak|streak is\b/i.test(text)) {
    intent = "active_streak";
  } else if (/\bwhat changed|better at home|recent trend|trend explanation|last \d+ (?:games?|events?) versus\b/i.test(text)) {
    intent = "trend_explanation";
  } else if (/\bavailable (?:career )?high\b/i.test(text)) {
    intent = "available_career_high";
  } else if (/\brecord candidate\b/i.test(text)) {
    intent = "record_candidate";
  } else if (hasBetting && hasStats && /\b(last|recent|hit|gone|made|recorded|average|rate|compare)\b/i.test(text)) {
    intent = "mixed_stats_betting";
  } else if (hasBetting) {
    intent = "betting_research";
  } else if (/\b(head[- ]to[- ]head|prior meetings?|met before|against each other)\b/i.test(text)) {
    intent = "head_to_head_history";
  } else if (/\b(record progression|progression of the record)\b/i.test(text)) {
    intent = "record_progression";
  } else if (/\b(all[- ]time|historical record|league record|world record|record holder)\b/i.test(text)) {
    intent = "historical_record";
  } else if (/\b(single(?:[- ][a-z0-9]+)? (?:game|event)|in one (?:game|event)|single-game)\b/i.test(text)
    && /\b(most|highest|best|fewest|lowest)\b/i.test(text)) {
    intent = "single_game_high";
  } else if (/\bcareer high\b/i.test(text)) {
    intent = "career_high";
  } else if (/\bseason high\b/i.test(text)) {
    intent = "season_high";
  } else if (/\b(streak|consecutive|in a row)\b/i.test(text) && leaderboardTerms.test(text)) {
    intent = "streak_leaderboard";
  } else if ((/\b(exceeded|cleared|hit)\b.+\blast\s+\d+\b/i.test(text)
    || /\b(over|under)\s*[+-]?\d+(?:\.\d+)?\b.+\blast\s+\d+\b/i.test(text))
    || /\bthreshold leaderboard\b/i.test(text)) {
    intent = "threshold_leaderboard";
  } else if (/\bon (?:this|the|saturday'?s?) (?:card|event)\b/i.test(text) && leaderboardTerms.test(text)) {
    intent = "event_leaderboard";
  } else if (comparisonTerms.test(text) && /\b(this player|player x|someone|unknown athlete)\b/i.test(text)) {
    intent = "ambiguous";
  } else if (comparisonTerms.test(text)) {
    intent = /\bteam|teams|offense|defense\b/i.test(text) ? "team_comparison" : "athlete_comparison";
  } else if ((/\b(which|show|find|players?|quarterbacks?|hitters?|fighters?|drivers?)\b/i.test(text))
    && (text.match(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)/g) || []).length >= 2
    && (/\b(?:at least|more than|above|over|under|fewer than|less than|below)\s*[+-]?(?:\d|\.\d)/i.test(text)
      || /\bbetween\s*[+-]?(?:\d|\.\d)/i.test(text))) {
    intent = "multi_stat_filter";
  } else if (/\b(which|show|find)\b/i.test(text)
    && /\b(?:at least|more than|over|under|fewer than|less than|between)\s*[+-]?\d+(?:\.\d+)?/i.test(text)) {
    intent = "statistical_filter";
  } else if (/\b(cohort|street circuits?|road courses?|position group|role group)\b/i.test(text)) {
    intent = "cohort_analysis";
  } else if (leaderboardTerms.test(text)) {
    intent = /\bteams?\b/i.test(text) ? "team_leaderboard" : "league_leaderboard";
  } else if (/\b(find|show|search)\b.+\b(events?|games?|matches?|fights?|races?)\b/i.test(text)
    && /\b(date|against|ending|round|circuit|corners|recorded)\b/i.test(text)) {
    intent = "event_search";
  } else if (/\b(by game|game log|game-by-game|each game)\b/i.test(text)
    || /\bshow\b.+\blast\s+\d{1,2}\s+(?:games?|matches?|fights?|races?)\b/i.test(text)) {
    intent = "game_log_search";
  } else if (/\b(home|away|split|wins|losses|starter|bench|first half|second half|first quarter|vs left|vs right)\b/i.test(text)) {
    intent = "statistical_filter";
  } else if (/\b(consecutive|streak|in a row)\b/i.test(text)) {
    intent = "streak_leaderboard";
  } else if (/\b(milestone|away from|needs? \d+)\b/i.test(text)) {
    intent = "statistical_filter";
  } else if (/\b(trend|trending|recent form)\b/i.test(text)) {
    intent = "performance_ranking";
  } else if (hasStats || /\b(how many|how much|what is|show)\b/i.test(text)) {
    intent = "statistical_lookup";
  } else if (text.split(/\s+/).length < 3 || /\b(this player|player x|someone)\b/i.test(text)) {
    intent = "ambiguous";
  }

  const recommendedMode = intent === "betting_research"
    ? "betting"
    : ["mixed_stats_betting", "mixed_insight_betting"].includes(intent) ? "both"
    : ["unsupported", "ambiguous"].includes(intent) ? mode : "stats";
  return Object.freeze({
    intent,
    recommendedMode,
    selectedMode: mode,
    confidence: intent === "unsupported" ? 0.25 : intent === "ambiguous" ? 0.4 : signals.length > 1 ? 0.92 : 0.82,
    conflict: recommendedMode !== mode && mode !== "both",
    signals: Object.freeze(signals),
  });
}
