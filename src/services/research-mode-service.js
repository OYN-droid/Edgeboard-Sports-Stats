export const RESEARCH_MODES = Object.freeze(["stats", "betting", "both"]);

export function normalizeResearchMode(value, fallback = "betting") {
  return RESEARCH_MODES.includes(value) ? value : RESEARCH_MODES.includes(fallback) ? fallback : "betting";
}
const MODE_SUGGESTIONS = Object.freeze({
  stats: Object.freeze({
    basketball: Object.freeze([
      "Who leads the WNBA in assists this season?",
      "Show Caitlin Clark’s last 10 games.",
      "Compare A'ja Wilson and Breanna Stewart over their last 5 games.",
      "How many three-pointers has Stephen Curry made in his last 10 games?",
    ]),
    baseball: Object.freeze([
      "Show MLB home-run leaders.",
      "How many home runs has Aaron Judge hit in his last 5 games?",
      "Show Gerrit Cole’s pitcher strikeouts by game.",
    ]),
    "american-football": Object.freeze([
      "What is Patrick Mahomes averaging in passing yards this season?",
      "Show Patrick Mahomes’ last 5 games.",
    ]),
    "ice-hockey": Object.freeze([
      "Which NHL players have the most shots on goal?",
      "Show Auston Matthews’ shots on goal by game.",
    ]),
    soccer: Object.freeze([
      "Which soccer players have the most shots on target?",
      "Show Lionel Messi’s last 5 matches.",
    ]),
    mma: Object.freeze([
      "What is Sample Fighter A’s knockout rate?",
      "Show Sample Fighter A’s significant strikes over the last 5 fights.",
    ]),
    motorsport: Object.freeze([
      "How many podiums does Max Verstappen have in the sample season?",
      "Show Max Verstappen’s last 5 finishes.",
    ]),
    default: Object.freeze([
      "Show this player’s last 10 games.",
      "Compare two players over the last month.",
      "Who leads this league in points this season?",
    ]),
  }),
  betting: Object.freeze({
    default: Object.freeze([
      "Find NBA plus-money player props with hit rate over 60%",
      "Best 4 leg parlay for points",
      "UFC method of victory props for confirmed fighters",
      "Formula 1 podium props at plus money",
      "MLS three-way moneyline",
    ]),
  }),
  both: Object.freeze({
    basketball: Object.freeze([
      "Has Tyrese Maxey gone over 24.5 points in 7 of the last 10 games?",
      "Compare Tyrese Maxey’s recent scoring with tonight’s points line.",
    ]),
    "ice-hockey": Object.freeze([
      "Show Auston Matthews’ recent shots on goal and the current prop.",
    ]),
    mma: Object.freeze([
      "Which fighters have high knockout rates and available method props?",
    ]),
    default: Object.freeze([
      "Has this player gone over the current line in 7 of the last 10 games?",
      "Compare recent performance with tonight’s available prop.",
      "Show observed form and related betting context.",
    ]),
  }),
});

export function getResearchSuggestions(mode, context = {}) {
  const safeMode = normalizeResearchMode(mode);
  const modeSuggestions = MODE_SUGGESTIONS[safeMode];
  const sportId = context.sportId || "";
  const contextual = modeSuggestions[sportId] || modeSuggestions.default;
  return [...contextual].slice(0, 5);
}
