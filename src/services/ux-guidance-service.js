const TEAM_TYPES = new Set(["team", "national-team", "constructor", "manufacturer"]);
const ATHLETE_TYPES = new Set(["athlete", "fighter", "boxer", "driver", "golfer", "tennis-player"]);

const unique = (items) => [...new Map(items.filter(Boolean).map((item) => [item.query || item.label, item])).values()];

function sportNoun(sportId = "") {
  if (["mma", "boxing", "combat", "kickboxing"].includes(sportId)) return "fights";
  if (sportId === "motorsport") return "races";
  if (["tennis", "golf"].includes(sportId)) return sportId === "golf" ? "tournaments" : "matches";
  return "games";
}

export function getEntityResearchActions(entity, { hasMarkets = false } = {}) {
  if (!entity?.name) return [];
  const name = entity.name;
  const noun = sportNoun(entity.sportId);
  const actions = [];
  if (ATHLETE_TYPES.has(entity.type)) {
    actions.push(
      { label: `Recent ${noun}`, query: `Show ${name}'s recent ${noun}` },
      { label: "Upcoming matchup", query: `Show ${name}'s next event and matchup` },
      { label: "Team and teammates", query: `Show ${name}'s team and teammates` },
      { label: "Splits and trends", query: `Show ${name}'s splits and recent trends` },
      { label: "Compare in league", query: `Compare ${name} to the league leaders` },
    );
    if (hasMarkets) actions.push({ label: "Current props", query: `Show current props for ${name}` });
  } else if (TEAM_TYPES.has(entity.type)) {
    actions.push(
      { label: "Roster and players", query: `Show the roster for ${name}` },
      { label: "Recent results", query: `Show recent results for ${name}` },
      { label: "Upcoming schedule", query: `Show upcoming events for ${name}` },
      { label: "Team stats", query: `Show team stats and trends for ${name}` },
    );
    if (hasMarkets) actions.push({ label: "Available markets", query: `What markets are available for ${name}?` });
  } else {
    actions.push(
      { label: "Recent events", query: `Show recent events for ${name}` },
      { label: "Available insights", query: `Show insights about ${name}` },
    );
  }
  return unique(actions).slice(0, 6);
}

export function getRecoveryActions(result, { leagueName = "this league", entityName = "" } = {}) {
  const suggestions = (result?.suggestions || []).map((query) => ({ label: query, query }));
  if (result?.type === "ambiguous") return suggestions;
  const defaults = entityName
    ? [
      { label: "Open recent results", query: `Show recent results for ${entityName}` },
      { label: "Try a supported stat", query: `Show available stats for ${entityName}` },
    ]
    : [
      { label: "See league leaders", query: `Who leads ${leagueName} in an available statistic?` },
      { label: "Browse recent results", query: `Show recent results in ${leagueName}` },
    ];
  return unique([...suggestions, ...defaults]).slice(0, 4);
}

export function isComplexResearchPlan(plan) {
  return new Set([
    "comparison", "leaderboards", "historical_threshold", "records", "trends", "streaks",
    "milestones", "fun_facts", "same_game_correlation", "parlay_research", "matchup_research",
  ]).has(plan?.questionType);
}

export function getResearchProgressCopy(plan) {
  const type = String(plan?.questionType || "statistical_lookup").replaceAll("_", " ");
  const scope = plan?.resolvedScope?.label || "the selected scope";
  return {
    label: `Researching ${type}`,
    detail: `Resolving entities in ${scope}, checking compatible source rows, then validating the answer.`,
  };
}

export function getOnboardingSteps() {
  return Object.freeze([
    { id: "edge-intelligence", label: "Edge Intelligence", detail: "Turn a question into a transparent research plan, evidence, counterarguments, and next steps." },
    { id: "edge-trust", label: "Edge Trust", detail: "Open Research Quality details to understand freshness, coverage, agreement, and uncertainty." },
    { id: "stories", label: "Stories", detail: "Explore deterministic claims that always retain their supporting evidence and scope." },
    { id: "discovery", label: "Discovery", detail: "Move between related profiles, comparisons, visuals, history, and current research." },
    { id: "markets", label: "Edge Markets", detail: "Research provider-confirmed markets and movement without treating them as recommendations." },
    { id: "history", label: "Historical Explorer", detail: "Browse evidence-backed history with visible dataset coverage and validation limits." },
    { id: "workspace", label: "Workspace", detail: "Save research, watch entities, and track ideas locally in this browser." },
  ]);
}
