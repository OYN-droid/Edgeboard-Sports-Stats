export const MARKET_CATEGORIES = Object.freeze([
  "Game Lines", "Player Props", "Team Props", "Periods", "Alternate Lines",
  "Specials", "Futures", "Same Game", "Live",
]);

export const CONFIDENCE_BANDS = Object.freeze([
  { min: 0, max: 39, id: "limited", label: "Limited" },
  { min: 40, max: 54, id: "developing", label: "Developing" },
  { min: 55, max: 69, id: "moderate", label: "Moderate" },
  { min: 70, max: 84, id: "strong", label: "Strong" },
  { min: 85, max: 100, id: "very-strong", label: "Very strong" },
]);

export function getConfidenceBand(value) {
  const score = Math.min(100, Math.max(0, Number(value) || 0));
  return CONFIDENCE_BANDS.find((band) => score >= band.min && score <= band.max) || CONFIDENCE_BANDS[0];
}

const defaults = Object.freeze({
  shortName: "",
  category: "Specials",
  browseGroup: "Other",
  sportIds: [],
  leagueIds: [],
  eventTypes: [],
  participantType: "event",
  period: "full-event",
  sideOptions: [],
  lineType: "none",
  settlementScope: "provider-rules",
  supportsLive: false,
  supportsAlternateLines: false,
  supportsSameGame: false,
  supportsOverUnder: false,
  supportsYesNo: false,
  supportsThreeWay: false,
  supportsSameGameParlay: false,
  correlationGroup: "event",
  providerAliases: [],
  searchTerms: [],
  popular: false,
  marketType: "player-prop",
  filterGroup: "props",
  displayOrder: 999,
  enabled: true,
  dataRequirements: [],
  description: "",
});

function market(id, displayName, sportIds, options = {}) {
  return Object.freeze({
    id,
    canonicalType: id,
    displayName,
    ...defaults,
    ...options,
    shortName: options.shortName || displayName,
    sportIds: Object.freeze([...sportIds]),
    leagueIds: Object.freeze(options.leagueIds || []),
    eventTypes: Object.freeze(options.eventTypes || []),
    sideOptions: Object.freeze(options.sideOptions || defaults.sideOptions),
    providerAliases: Object.freeze(options.providerAliases || []),
    searchTerms: Object.freeze(options.searchTerms || []),
    supportsOverUnder: options.supportsOverUnder ?? ["decimal", "integer"].includes(options.lineType || defaults.lineType),
    supportsYesNo: options.supportsYesNo ?? (options.sideOptions || []).includes("yes"),
    supportsThreeWay: options.supportsThreeWay ?? (options.sideOptions || []).length === 3,
    supportsSameGameParlay: options.supportsSameGameParlay ?? options.supportsSameGame ?? false,
    displayOrder: Number.isFinite(options.displayOrder) ? options.displayOrder : 999,
    enabled: options.enabled !== false,
    dataRequirements: Object.freeze(options.dataRequirements || []),
    description: options.description || `${displayName} market for supported ${sportIds.join(", ")} events.`,
  });
}

const gameLines = (sportIds, prefix, options = {}) => [
  market(`${prefix}-moneyline`, "Moneyline", sportIds, { category: "Game Lines", browseGroup: "Core Lines", participantType: "team", lineType: "price", sideOptions: ["home", "away"], marketType: "moneyline", filterGroup: "moneylines", popular: true, supportsLive: true, supportsSameGame: true, providerAliases: ["moneyline", "game winner"], ...options }),
  market(`${prefix}-spread`, "Spread", sportIds, { category: "Game Lines", browseGroup: "Core Lines", participantType: "team", lineType: "decimal", sideOptions: ["home", "away"], marketType: "spread", filterGroup: "spreads", popular: true, supportsLive: true, supportsAlternateLines: true, supportsSameGame: true, providerAliases: ["spread", "handicap"] }),
  market(`${prefix}-total`, "Game total", sportIds, { category: "Game Lines", browseGroup: "Core Lines", participantType: "event", lineType: "decimal", sideOptions: ["over", "under"], supportsOverUnder: true, marketType: "total", filterGroup: "totals", popular: true, supportsLive: true, supportsAlternateLines: true, supportsSameGame: true, providerAliases: ["total", "over under", "game total"] }),
  market(`${prefix}-team-total`, "Team total", sportIds, { category: "Team Props", browseGroup: "Team Markets", participantType: "team", lineType: "decimal", sideOptions: ["over", "under"], supportsOverUnder: true, marketType: "team-prop", filterGroup: "props", supportsLive: true, supportsAlternateLines: true, supportsSameGame: true, providerAliases: ["team total"] }),
];

function propSet(sportId, prefix, names, browseGroup, options = {}) {
  return names.map(([id, label, aliases = []]) => market(`${prefix}-${id}`, label, [sportId], {
    category: "Player Props",
    browseGroup: options.groupForId?.(id) || browseGroup,
    participantType: options.participantType || "player",
    lineType: "decimal",
    sideOptions: ["over", "under"],
    supportsOverUnder: true,
    providerAliases: [id.replaceAll("-", " "), label.toLowerCase(), ...aliases],
    searchTerms: aliases,
    supportsLive: options.supportsLive ?? true,
    supportsAlternateLines: true,
    supportsSameGame: options.supportsSameGame ?? true,
    correlationGroup: `${sportId}-${id}`,
    popular: options.popularIds?.includes(id) || false,
    marketType: options.marketType || "player-prop",
    filterGroup: "props",
  }));
}

function simpleMarkets(sportIds, prefix, category, browseGroup, names, options = {}) {
  return names.map(([id, label, aliases = []], index) => market(`${prefix}-${id}`, label, sportIds, {
    category,
    browseGroup,
    participantType: options.participantType || (category === "Team Props" ? "team" : "event"),
    marketType: options.marketType || (category === "Player Props" ? "player-prop" : category === "Futures" ? "futures" : "team-prop"),
    filterGroup: options.filterGroup || (category === "Game Lines" ? "moneylines" : category === "Periods" ? "totals" : "props"),
    period: options.period || (category === "Periods" ? "period-specific" : "full-event"),
    settlementScope: options.settlementScope || "provider-rules",
    supportsLive: options.supportsLive ?? true,
    supportsAlternateLines: category === "Alternate Lines" || options.supportsAlternateLines === true,
    supportsSameGame: options.supportsSameGame ?? !["Futures"].includes(category),
    sideOptions: options.sideOptions || (options.supportsYesNo || id.includes("yes-no") || id.includes("to-finish") || id.includes("make-cut") ? ["yes", "no"] : []),
    supportsYesNo: options.supportsYesNo || id.includes("yes-no") || id.includes("to-finish") || id.includes("make-cut"),
    providerAliases: [id.replaceAll("-", " "), label.toLowerCase(), ...aliases],
    searchTerms: aliases,
    displayOrder: options.displayOrder ? options.displayOrder + index : 999,
    correlationGroup: options.correlationGroup || `${prefix}-${browseGroup.toLowerCase().replaceAll(/\W+/g, "-")}`,
  }));
}

const football = "american-football";
const basketball = "basketball";
const baseball = "baseball";
const hockey = "ice-hockey";
const soccer = "soccer";
const motorsport = "motorsport";
const combatSports = ["mma", "boxing", "combat", "kickboxing"];

export const MARKET_CATALOG = Object.freeze([
  ...gameLines([football], "football"),
  ...propSet(football, "football", [
    ["passing-yards", "Passing yards"], ["passing-touchdowns", "Passing touchdowns", ["passing td", "pass touchdown", "passing touchdown", "pass touchdowns"]],
    ["passing-attempts", "Passing attempts"], ["passing-completions", "Passing completions"], ["interceptions-thrown", "Interceptions thrown"],
    ["longest-completion", "Longest completion"], ["rushing-yards", "Rushing yards"], ["rushing-attempts", "Rushing attempts"],
    ["longest-rush", "Longest rush"], ["receiving-yards", "Receiving yards"], ["receptions", "Receptions"],
    ["receiving-targets", "Receiving targets"], ["longest-reception", "Longest reception"], ["rush-receiving-yards", "Rush + receiving yards", ["yards"]],
    ["anytime-touchdown", "Anytime touchdown", ["td", "touchdown"]], ["first-touchdown", "First touchdown"],
    ["last-touchdown", "Last touchdown"], ["two-plus-touchdowns", "2+ touchdowns"], ["field-goals-made", "Field goals made"],
    ["kicking-points", "Kicking points"], ["sacks", "Player sacks"], ["tackles", "Tackles"], ["fantasy-points", "Fantasy points"],
  ], "Player Production", {
    popularIds: ["passing-yards", "passing-touchdowns", "rushing-yards", "receiving-yards", "receptions", "anytime-touchdown"],
    groupForId: (id) => id.startsWith("passing") || id.includes("completion") || id.includes("interception") ? "Passing"
      : id.startsWith("rushing") || id === "longest-rush" ? "Rushing"
        : id.startsWith("receiv") || id.includes("reception") || id.includes("target") ? "Receiving"
          : id.includes("touchdown") ? "Touchdowns"
            : id.includes("field-goal") || id.includes("kicking") ? "Kicking" : "Defense & Fantasy",
  }),

  ...gameLines([basketball], "basketball"),
  ...propSet(basketball, "basketball", [
    ["points", "Points"], ["rebounds", "Rebounds"], ["assists", "Assists"], ["points-rebounds-assists", "Points + rebounds + assists", ["pra"]],
    ["three-pointers-made", "Three-pointers made", ["three pointer", "three pointers", "three-pointer props", "threes", "3 pointer", "3 pointers", "3s"]],
    ["three-pointers-attempted", "Three-pointers attempted"], ["steals", "Steals"], ["blocks", "Blocks"],
    ["steals-blocks", "Steals + blocks"], ["turnovers", "Turnovers"], ["double-double", "Double-double"],
    ["triple-double", "Triple-double"], ["first-basket", "First basket"], ["player-fantasy-points", "Fantasy points"],
  ], "Player Production", {
    popularIds: ["points", "rebounds", "assists", "three-pointers-made", "points-rebounds-assists"],
    groupForId: (id) => id.includes("three-pointer") || id === "points" ? "Scoring"
      : id.includes("rebound") ? "Rebounding"
        : id === "assists" || id === "turnovers" ? "Playmaking"
          : id.includes("steal") || id.includes("block") ? "Defense" : "Combos & Specials",
  }),

  ...gameLines([baseball], "baseball"),
  ...propSet(baseball, "baseball", [
    ["hits", "Hits"], ["total-bases", "Total bases", ["bases"]], ["home-runs", "Home runs", ["home run", "homer", "hr"]],
    ["runs", "Runs"], ["runs-batted-in", "Runs batted in", ["rbi"]], ["stolen-bases", "Stolen bases"],
    ["walks", "Batter walks"], ["strikeouts-batter", "Batter strikeouts"], ["pitcher-strikeouts", "Pitcher strikeouts", ["pitcher strikeout", "pitcher ks", "strikeouts"]],
    ["pitcher-outs", "Pitcher outs"], ["hits-allowed", "Hits allowed"], ["walks-allowed", "Walks allowed"],
    ["earned-runs-allowed", "Earned runs allowed"], ["first-five-moneyline", "First 5 innings moneyline"],
    ["first-five-spread", "First 5 innings spread"], ["first-five-total", "First 5 innings total"],
  ], "Batters & Pitchers", {
    popularIds: ["total-bases", "home-runs", "pitcher-strikeouts"],
    groupForId: (id) => id.includes("pitcher") || id.includes("allowed") || id === "first-five-total" ? "Pitching"
      : id.startsWith("first-five") ? "First 5 Innings" : "Batting & Baserunning",
  }),

  ...gameLines([hockey], "hockey"),
  ...propSet(hockey, "hockey", [
    ["shots-on-goal", "Shots on goal", ["shots-on-goal", "sog", "shots"]], ["goals", "Goals", ["goal scorer", "anytime goal"]],
    ["assists", "Assists"], ["points", "Points"], ["blocked-shots", "Blocked shots"], ["power-play-points", "Power-play points"],
    ["goalie-saves", "Goalie saves"], ["goals-allowed", "Goals allowed"], ["first-goal", "First goal"],
  ], "Skaters & Goalies", {
    popularIds: ["shots-on-goal", "goals", "assists", "goalie-saves"],
    groupForId: (id) => id.includes("goalie") || id === "goals-allowed" ? "Goaltending"
      : id === "blocked-shots" ? "Defense" : "Skater Production",
  }),

  market("soccer-three-way-moneyline", "Three-way moneyline", [soccer], { category: "Game Lines", browseGroup: "Match Result", participantType: "team", sideOptions: ["home", "draw", "away"], lineType: "price", marketType: "moneyline", filterGroup: "moneylines", popular: true, supportsLive: true, providerAliases: ["three way", "three-way", "1x2", "draw", "moneyline"] }),
  market("soccer-draw-no-bet", "Draw no bet", [soccer], { category: "Game Lines", browseGroup: "Match Result", participantType: "team", sideOptions: ["home", "away"], lineType: "price", marketType: "moneyline", filterGroup: "moneylines", providerAliases: ["draw no bet", "dnb"] }),
  market("soccer-asian-handicap", "Asian handicap", [soccer], { category: "Game Lines", browseGroup: "Handicaps", participantType: "team", marketType: "spread", filterGroup: "spreads", supportsAlternateLines: true, providerAliases: ["asian handicap"] }),
  ...gameLines([soccer], "soccer", { sideOptions: ["home", "draw", "away"] }).filter((item) => item.id !== "soccer-moneyline"),
  ...propSet(soccer, "soccer", [
    ["player-shots", "Player shots", ["shots"]], ["shots-on-target", "Shots on target", ["sot"]],
    ["anytime-scorer", "Anytime scorer", ["goal scorer"]], ["player-assists", "Player assists"],
    ["player-cards", "Player cards"], ["player-tackles", "Player tackles"], ["player-passes", "Player passes"],
  ], "Player Markets", { popularIds: ["player-shots", "shots-on-target", "anytime-scorer"] }),
  ...[
    ["both-teams-to-score", "Both teams to score", "Match Props"], ["corners-total", "Total corners", "Corners"],
    ["team-corners", "Team corners", "Corners"], ["corner-handicap", "Corner handicap", "Corners"],
    ["cards-total", "Total cards", "Cards"], ["team-cards", "Team cards", "Cards"], ["first-team-to-score", "First team to score", "Match Props"],
    ["correct-score", "Correct score", "Specials"], ["half-time-full-time", "Half-time / full-time", "Periods"],
  ].map(([id, label, group]) => market(`soccer-${id}`, label, [soccer], {
    category: group === "Periods" ? "Periods" : group === "Specials" ? "Specials" : "Team Props",
    browseGroup: group, participantType: "team", marketType: "team-prop", filterGroup: "props",
    supportsLive: true, supportsSameGame: true, providerAliases: [
      id.replaceAll("-", " "),
      label.toLowerCase(),
      id === "corners-total" ? "corner totals" : "",
    ].filter(Boolean),
    popular: ["both-teams-to-score", "corners-total"].includes(id),
  })),

  ...combatSports.flatMap((sportId) => [
    market(`${sportId}-fight-winner`, "Fight winner", [sportId], { category: "Game Lines", browseGroup: "Fight Lines", participantType: "competitor", lineType: "price", sideOptions: ["fighter-a", "fighter-b", "draw"], marketType: "moneyline", filterGroup: "moneylines", popular: true, providerAliases: ["fight winner", "moneyline"] }),
    ...[
      ["method-of-victory", "Method of victory"], ["win-by-ko-tko", "Win by KO/TKO"], ["win-by-submission", "Win by submission"],
      ["win-by-decision", "Win by decision"], ["fight-goes-distance", "Fight goes the distance"], ["round-total", "Round total"],
      ["winning-round", "Winning round"], ["exact-round", "Exact round"], ["knockdowns", "Knockdowns"],
      ["significant-strikes", "Significant strikes"], ["takedowns", "Takedowns"],
    ].filter(([id]) => !["win-by-submission", "takedowns"].includes(id) || sportId === "mma")
      .map(([id, label]) => market(`${sportId}-${id}`, label, [sportId], {
      category: "Player Props", browseGroup: id.includes("round") ? "Round Markets" : "Fight Props",
      participantType: "competitor", marketType: id === "method-of-victory" ? "method-of-victory" : id.includes("round") ? "round" : "fight-prop",
      filterGroup: id === "round-total" ? "totals" : "props", popular: ["method-of-victory", "win-by-ko-tko", "fight-goes-distance"].includes(id),
      providerAliases: [id.replaceAll("-", " "), label.toLowerCase(), id === "win-by-ko-tko" ? "ko" : "", id === "round-total" ? "rounds" : ""].filter(Boolean),
      supportsSameGame: true, correlationGroup: id.includes("decision") || id.includes("distance") ? "fight-distance" : "fight-finish",
    })),
  ]),

  ...[
    ["race-winner", "Race winner", "Outrights"], ["podium", "Podium finish", "Finishing Position"],
    ["top-5", "Top 5 finish", "Finishing Position"], ["top-10", "Top 10 finish", "Finishing Position"],
    ["driver-head-to-head", "Driver head-to-head", "Matchups"], ["qualifying-winner", "Qualifying winner", "Qualifying"],
    ["qualifying-head-to-head", "Qualifying head-to-head", "Qualifying"], ["fastest-lap", "Fastest lap", "Race Props"],
    ["finishing-position", "Finishing position", "Finishing Position"], ["manufacturer-winner", "Manufacturer winner", "Race Props"],
    ["stage-winner", "Stage winner", "Segments"], ["segment-winner", "Segment winner", "Segments"],
    ["points-finish", "Points finish", "Finishing Position"], ["pole-position", "Pole position", "Qualifying"],
  ].map(([id, label, group]) => market(`motorsport-${id}`, label, [motorsport], {
    category: group === "Qualifying" ? "Periods" : id === "race-winner" ? "Game Lines" : "Player Props",
    browseGroup: group, participantType: id.includes("manufacturer") ? "team" : "competitor",
    leagueIds: id === "stage-winner" ? ["nascar-cup", "nascar-xfinity", "nascar-trucks"] : [],
    lineType: id.includes("position") ? "integer" : "price", sideOptions: id.includes("head-to-head") ? ["competitor-a", "competitor-b"] : [],
    marketType: id === "race-winner" ? "winner" : id.includes("qualifying") || id === "pole-position" ? "qualifying" : id === "podium" ? "podium" : "race-prop",
    filterGroup: id === "race-winner" ? "moneylines" : "props", popular: ["race-winner", "podium", "top-10", "driver-head-to-head"].includes(id),
    providerAliases: [id.replaceAll("-", " "), label.toLowerCase(), id === "driver-head-to-head" ? "driver matchup" : ""].filter(Boolean),
  })),

  ...simpleMarkets([football], "football", "Periods", "Halves & Quarters", [
    ["first-half-moneyline", "First-half moneyline"], ["first-half-spread", "First-half spread"], ["first-half-total", "First-half total"],
    ["first-quarter-moneyline", "First-quarter moneyline"], ["first-quarter-spread", "First-quarter spread"], ["first-quarter-total", "First-quarter total"],
  ]),
  ...simpleMarkets([football], "football", "Alternate Lines", "Alternate Lines", [
    ["alternate-spread", "Alternate spread"], ["alternate-total", "Alternate game total"], ["alternate-team-total", "Alternate team total"],
  ], { supportsAlternateLines: true }),
  ...simpleMarkets([football], "football", "Specials", "Game Specials", [
    ["winning-margin", "Winning margin"], ["race-to-points", "Race to points"], ["highest-scoring-half", "Highest-scoring half"], ["overtime-yes-no", "Overtime yes/no"],
  ]),
  ...propSet(football, "football", [
    ["first-quarter-passing-yards", "First-quarter passing yards"], ["first-half-passing-yards", "First-half passing yards"],
    ["quarterback-rushing-yards", "Quarterback rushing yards"], ["receiving-touchdowns", "Receiving touchdowns"],
    ["first-reception", "First reception"], ["first-half-receiving-yards", "First-half receiving yards"],
    ["rushing-touchdowns", "Rushing touchdowns"], ["first-half-rushing-yards", "First-half rushing yards"],
    ["tackles-assists", "Tackles plus assists"], ["interceptions-recorded", "Interceptions recorded"],
    ["defensive-special-teams-touchdown", "Defensive or special-teams touchdown"], ["passing-rushing-yards", "Passing + rushing yards"],
    ["receptions-carries", "Receptions + carries"], ["passing-touchdowns-interceptions", "Passing touchdowns + interceptions"],
    ["player-milestones", "Player milestones"],
  ], "Expanded Player Props"),

  ...simpleMarkets([basketball], "basketball", "Periods", "Halves & Quarters", [
    ["first-half-moneyline", "First-half moneyline"], ["first-half-spread", "First-half spread"], ["first-half-total", "First-half total"],
    ["first-quarter-moneyline", "First-quarter moneyline"], ["first-quarter-spread", "First-quarter spread"], ["first-quarter-total", "First-quarter total"],
    ["quarter-moneyline", "Quarter moneyline"], ["quarter-spread", "Quarter spread"], ["quarter-total", "Quarter total"],
  ]),
  ...simpleMarkets([basketball], "basketball", "Alternate Lines", "Alternate Lines", [
    ["alternate-spread", "Alternate spread"], ["alternate-total", "Alternate total"],
  ], { supportsAlternateLines: true }),
  ...simpleMarkets([basketball], "basketball", "Specials", "Game Specials", [
    ["winning-margin", "Winning margin"], ["race-to-points", "Race to points"], ["highest-scoring-quarter", "Highest-scoring quarter"], ["overtime-yes-no", "Overtime yes/no"],
  ]),
  ...propSet(basketball, "basketball", [
    ["free-throws-made", "Free throws made"], ["free-throws-attempted", "Free throws attempted"],
    ["field-goals-made", "Field goals made"], ["field-goals-attempted", "Field goals attempted"],
    ["offensive-rebounds", "Offensive rebounds"], ["defensive-rebounds", "Defensive rebounds"],
    ["personal-fouls", "Personal fouls"], ["minutes", "Minutes"], ["points-rebounds", "Points + rebounds"],
    ["points-assists", "Points + assists"], ["rebounds-assists", "Rebounds + assists"], ["player-milestones", "Player milestones"],
    ["first-quarter-points", "First-quarter points"], ["first-half-points", "First-half points"],
    ["first-quarter-assists", "First-quarter assists"], ["first-half-assists", "First-half assists"],
    ["first-quarter-rebounds", "First-quarter rebounds"], ["first-half-rebounds", "First-half rebounds"],
    ["first-quarter-three-pointers", "First-quarter three-pointers"], ["first-half-three-pointers", "First-half three-pointers"],
  ], "Expanded Player Props"),

  ...simpleMarkets([baseball], "baseball", "Game Lines", "Game Lines", [
    ["run-line", "Run line"], ["first-inning-result", "First-inning result"], ["first-inning-run-yes-no", "First-inning run yes/no"],
    ["extra-innings-yes-no", "Extra innings yes/no"], ["winning-margin", "Winning margin"],
  ]),
  ...simpleMarkets([baseball], "baseball", "Alternate Lines", "Alternate Lines", [
    ["alternate-run-line", "Alternate run line"], ["alternate-total", "Alternate game total"],
  ], { supportsAlternateLines: true }),
  ...propSet(baseball, "baseball", [
    ["singles", "Singles"], ["doubles", "Doubles"], ["triples", "Triples"], ["hits-runs-rbi", "Hits + runs + RBI"],
    ["batter-record-hit", "Batter to record a hit"], ["batter-two-plus-bases", "Batter to record 2+ bases"],
    ["pitches-thrown", "Pitches thrown"], ["first-inning-strikeouts", "First-inning strikeouts"],
    ["pitcher-win", "Pitcher win"], ["quality-start", "Quality start"],
  ], "Expanded Batters & Pitchers"),
  ...simpleMarkets([baseball], "baseball", "Team Props", "Team & Inning Props", [
    ["team-runs", "Team runs"], ["team-hits", "Team hits"], ["team-home-runs", "Team home runs"],
    ["first-team-to-score", "First team to score"], ["highest-scoring-inning", "Highest-scoring inning"],
    ["inning-totals", "Inning totals"], ["race-to-runs", "Race to runs"],
  ]),

  ...simpleMarkets([hockey], "hockey", "Game Lines", "Regulation & Overtime", [
    ["regulation-three-way-moneyline", "Regulation three-way moneyline"], ["puck-line", "Puck line"],
    ["first-team-to-score", "First team to score"], ["overtime-yes-no", "Overtime yes/no"], ["winning-margin", "Winning margin"],
  ], { settlementScope: "regulation-only" }),
  ...simpleMarkets([hockey], "hockey", "Alternate Lines", "Alternate Lines", [
    ["alternate-puck-line", "Alternate puck line"], ["alternate-total", "Alternate total"],
  ], { supportsAlternateLines: true }),
  ...simpleMarkets([hockey], "hockey", "Periods", "Period Markets", [
    ["period-moneyline", "Period moneyline"], ["period-puck-line", "Period puck line"], ["period-total", "Period total"],
  ], { settlementScope: "period-only" }),
  ...propSet(hockey, "hockey", [
    ["time-on-ice", "Time on ice"], ["goalie-shutout", "Goalie shutout"], ["anytime-goal-scorer", "Anytime goal scorer"], ["first-goal-scorer", "First goal scorer"],
  ], "Expanded Skaters & Goalies"),
  ...simpleMarkets([hockey], "hockey", "Team Props", "Team Props", [
    ["team-shots-on-goal", "Team shots on goal"], ["team-goals", "Team goals"], ["power-play-goals", "Power-play goals"],
    ["penalty-minutes", "Penalty minutes"], ["period-team-total", "Period team total"],
  ]),

  ...simpleMarkets([soccer], "soccer", "Game Lines", "Match Result", [
    ["double-chance", "Double chance"], ["match-total", "Match total"], ["winning-margin", "Winning margin"],
    ["clean-sheet", "Clean sheet"], ["last-team-to-score", "Last team to score"], ["qualification", "Qualification / advancement"],
  ], { settlementScope: "regulation-only" }),
  ...simpleMarkets([soccer], "soccer", "Alternate Lines", "Alternate Lines", [
    ["alternate-handicap", "Alternate handicap"], ["alternate-total", "Alternate match total"],
  ], { supportsAlternateLines: true, settlementScope: "regulation-only" }),
  ...simpleMarkets([soccer], "soccer", "Periods", "Halves & Extra Time", [
    ["halftime-result", "Halftime result"], ["first-half-total", "First-half total"], ["second-half-total", "Second-half total"],
    ["draw-either-half", "Draw in either half"], ["extra-time-result", "Extra-time result"], ["penalty-shootout", "Penalty shootout"],
  ]),
  ...propSet(soccer, "soccer", [
    ["player-goals", "Player goals"], ["first-goal-scorer", "First goal scorer"], ["last-goal-scorer", "Last goal scorer"],
    ["goalkeeper-saves", "Goalkeeper saves"], ["fouls-committed", "Fouls committed"], ["fouls-drawn", "Fouls drawn"], ["offsides", "Player offsides"],
  ], "Expanded Player Markets"),
  ...simpleMarkets([soccer], "soccer", "Team Props", "Corners & Cards", [
    ["alternate-corners-total", "Alternate total corners"], ["first-half-corners", "First-half corners"],
    ["first-corner", "First corner"], ["race-to-corners", "Race to corners"], ["most-corners", "Most corners"],
    ["first-card", "First card"], ["card-handicap", "Card handicap"],
  ], { settlementScope: "regulation-only" }),

  ...simpleMarkets(["mma"], "mma", "Player Props", "MMA Props", [
    ["knockout-or-submission", "Win by knockout or submission"], ["inside-distance", "Fighter inside distance"],
    ["first-takedown", "First takedown"], ["submission-attempts", "Submission attempts"], ["total-strikes", "Total strikes"],
    ["control-time", "Control time"], ["reaches-round-2", "Fight reaches round 2"], ["reaches-round-3", "Fight reaches round 3"],
    ["reaches-championship-rounds", "Fight reaches championship rounds"],
  ], { participantType: "competitor", marketType: "fight-prop" }),
  ...combatSports.flatMap((sportId) => simpleMarkets([sportId], sportId, "Specials", "Fight Specials", [
    ["not-go-distance", "Fight not to go the distance"], ["alternate-round-total", "Alternate total rounds"],
    ["round-group", "Round group"], ["draw", "Draw"], ["technical-decision", "Technical decision"], ["ends-inside-distance", "Fight ends inside distance"],
  ], { participantType: "competitor", marketType: "fight-prop" })),
  ...simpleMarkets(["boxing", "combat", "kickboxing"], "boxing-compatible", "Player Props", "Boxing Props", [
    ["either-fighter-knocked-down", "Either fighter to be knocked down"], ["inside-distance", "Fighter inside distance"],
  ], { participantType: "competitor", marketType: "fight-prop" }),

  ...simpleMarkets([motorsport], "motorsport", "Player Props", "Race Props", [
    ["top-3", "Top 3 finish"], ["manufacturer-head-to-head", "Manufacturer head-to-head"],
    ["driver-to-finish", "Driver to finish"], ["driver-not-to-finish", "Driver not to finish"],
    ["classified-finish", "Classified finish"], ["safety-car-yes-no", "Safety car yes/no"],
    ["group-betting", "Group betting"], ["margin-of-victory", "Margin of victory"],
    ["number-of-race-leaders", "Number of race leaders"], ["lead-lap-finish", "Lead-lap finish"], ["laps-led", "Laps led"],
  ], { participantType: "competitor", marketType: "race-prop" }),
  ...simpleMarkets([motorsport], "motorsport", "Futures", "Season Futures", [
    ["championship-winner", "Championship winner"], ["season-wins", "Season wins"], ["season-podiums", "Season podiums"],
  ], { participantType: "competitor", marketType: "futures" }),

  ...gameLines(["tennis"], "tennis"),
  ...propSet("tennis", "tennis", [["aces", "Aces"], ["double-faults", "Double faults"], ["games-won", "Games won"], ["sets-won", "Sets won"], ["breaks-of-serve", "Breaks of serve"]], "Player Markets"),
  ...simpleMarkets(["tennis"], "tennis", "Game Lines", "Match & Set Markets", [
    ["match-winner", "Match winner"], ["set-betting", "Set betting"], ["game-handicap", "Game handicap"],
    ["set-handicap", "Set handicap"], ["total-games", "Total games"], ["total-sets", "Total sets"],
    ["exact-set-score", "Exact set score"], ["first-set-winner", "First-set winner"], ["tiebreak-yes-no", "Tiebreak yes/no"],
  ], { participantType: "competitor" }),
  ...[
    ["tournament-winner", "Tournament winner"], ["top-5", "Top 5 finish"], ["top-10", "Top 10 finish"],
    ["make-cut", "Make the cut"], ["round-score", "Round score"], ["birdies", "Birdies"], ["golfer-head-to-head", "Golfer head-to-head"],
  ].map(([id, label]) => market(`golf-${id}`, label, ["golf"], { category: id === "tournament-winner" ? "Futures" : "Player Props", browseGroup: "Tournament Markets", participantType: "competitor", marketType: id === "tournament-winner" ? "winner" : "player-prop", filterGroup: id === "tournament-winner" ? "moneylines" : "props", providerAliases: [id.replaceAll("-", " "), label.toLowerCase()] })),
  ...simpleMarkets(["golf"], "golf", "Player Props", "Tournament Markets", [
    ["top-20", "Top 20 finish"], ["miss-cut", "Miss the cut"], ["round-leader", "Round leader"],
    ["player-matchup", "Player matchup"], ["group-betting", "Group betting"], ["nationality-winner", "Nationality winner"],
    ["finishing-position", "Finishing position"], ["bogey-free-round", "Bogey-free round"], ["hole-in-one", "Hole in one"],
    ["tournament-score", "Tournament score"],
  ], { participantType: "competitor" }),
]);

export const MARKET_CATALOG_BY_ID = new Map(MARKET_CATALOG.map((item) => [item.id, item]));

export function getMarketDefinition(id) {
  return MARKET_CATALOG_BY_ID.get(id) || null;
}

export function getCatalogForLeague({ sportId, leagueId, eventType } = {}) {
  return MARKET_CATALOG.filter((item) =>
    (!item.sportIds.length || item.sportIds.includes(sportId))
    && (!item.leagueIds.length || item.leagueIds.includes(leagueId))
    && (!item.eventTypes.length || item.eventTypes.includes(eventType)));
}

export function resolveCanonicalMarketId(value, context = {}) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  const normalizedText = text.replaceAll(/[^a-z0-9]+/g, " ").trim();
  const scoped = getCatalogForLeague(context);
  const exact = scoped.find((item) =>
    item.id === text
    || item.canonicalType === text
    || item.displayName.toLowerCase() === text
    || item.providerAliases.some((alias) => alias === text));
  if (exact) return exact.id;
  const candidates = scoped
    .map((item) => ({
      item,
      score: [item.displayName, item.shortName, item.id, ...item.providerAliases, ...item.searchTerms]
        .reduce((score, term) => {
          const normalized = String(term).toLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();
          return score + (normalized && normalizedText.includes(normalized) ? normalized.length : 0);
        }, 0),
    }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.score > 2 ? candidates[0].item.id : "";
}
