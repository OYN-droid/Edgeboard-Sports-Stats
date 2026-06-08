const picks = [
  {
    id: "maxey-points",
    sport: "NBA",
    market: "props",
    name: "Tyrese Maxey",
    line: "Over 24.5 points",
    odds: -112,
    confidence: 68,
    hitRate: "7 of last 10",
    matchup: "vs CHI",
    trend: "+3.8 projected edge",
    note: "Usage rises when opponent allows early-clock guard drives.",
    game: "PHI-CHI",
    team: "PHI",
    opponent: "CHI",
    propType: "points",
    confirmed: true,
    available: true,
  },
  {
    id: "lavine-points",
    sport: "NBA",
    market: "props",
    name: "Zach LaVine",
    line: "Over 21.5 points",
    odds: -106,
    confidence: 61,
    hitRate: "6 of last 9",
    matchup: "vs PHI",
    trend: "+2.1 projected edge",
    note: "Shot volume is stable when Chicago trails by one possession or more.",
    game: "PHI-CHI",
    team: "CHI",
    opponent: "PHI",
    propType: "points",
    confirmed: true,
    available: true,
  },
  {
    id: "embiid-points",
    sport: "NBA",
    market: "props",
    name: "Joel Embiid",
    line: "Over 29.5 points",
    odds: -115,
    confidence: 65,
    hitRate: "64% season hit",
    matchup: "at CHI",
    trend: "+3.0 projected edge",
    note: "Post touches project well against a thinner interior rotation.",
    game: "PHI-CHI",
    team: "PHI",
    opponent: "CHI",
    propType: "points",
    confirmed: false,
    available: true,
  },
  {
    id: "fox-assists",
    sport: "NBA",
    market: "props",
    name: "De'Aaron Fox",
    line: "Over 6.5 assists",
    odds: 104,
    confidence: 62,
    hitRate: "61% season hit",
    matchup: "at DAL",
    trend: "Pace-up spot",
    note: "Assist chances climb against switching-heavy defenses.",
    game: "SAC-DAL",
    team: "SAC",
    opponent: "DAL",
    propType: "assists",
    confirmed: true,
    available: true,
  },
  {
    id: "fox-points",
    sport: "NBA",
    market: "props",
    name: "De'Aaron Fox",
    line: "Over 25.5 points",
    odds: -110,
    confidence: 64,
    hitRate: "7 of last 11",
    matchup: "at DAL",
    trend: "+2.6 projected edge",
    note: "Dallas allows strong rim frequency to downhill guards.",
    game: "SAC-DAL",
    team: "SAC",
    opponent: "DAL",
    propType: "points",
    confirmed: true,
    available: true,
  },
  {
    id: "doncic-points",
    sport: "NBA",
    market: "props",
    name: "Luka Doncic",
    line: "Over 30.5 points",
    odds: -120,
    confidence: 67,
    hitRate: "8 of last 12",
    matchup: "vs SAC",
    trend: "+3.4 projected edge",
    note: "Usage and free-throw rate both stay elite in pace-up games.",
    game: "SAC-DAL",
    team: "DAL",
    opponent: "SAC",
    propType: "points",
    confirmed: true,
    available: true,
  },
  {
    id: "knicks-spread",
    sport: "NBA",
    market: "spreads",
    name: "New York Knicks",
    line: "+3.5 spread",
    odds: -108,
    confidence: 59,
    hitRate: "8-4 ATS away",
    matchup: "at BOS",
    trend: "Rest edge +1 day",
    note: "Half-court profile keeps blowout risk moderate.",
    game: "NYK-BOS",
    team: "NYK",
    opponent: "BOS",
    propType: "spread",
    confirmed: true,
    available: true,
  },
  {
    id: "brunson-points",
    sport: "NBA",
    market: "props",
    name: "Jalen Brunson",
    line: "Over 26.5 points",
    odds: -108,
    confidence: 63,
    hitRate: "62% road hit",
    matchup: "at BOS",
    trend: "+2.4 projected edge",
    note: "Pull-up volume gives him a clean path even in slower games.",
    game: "NYK-BOS",
    team: "NYK",
    opponent: "BOS",
    propType: "points",
    confirmed: true,
    available: true,
  },
  {
    id: "tatum-points",
    sport: "NBA",
    market: "props",
    name: "Jayson Tatum",
    line: "Over 27.5 points",
    odds: 102,
    confidence: 60,
    hitRate: "5 of last 8",
    matchup: "vs NYK",
    trend: "Plus-money edge",
    note: "Wing isolation usage rises against New York's switch coverage.",
    game: "NYK-BOS",
    team: "BOS",
    opponent: "NYK",
    propType: "points",
    confirmed: true,
    available: true,
  },
  {
    id: "wolves-total",
    sport: "NBA",
    market: "totals",
    name: "MIN at DEN",
    line: "Under 219.5",
    odds: -105,
    confidence: 64,
    hitRate: "5 straight unders",
    matchup: "late window",
    trend: "Slowest combined pace",
    note: "Both teams project to rank top eight in half-court frequency.",
    game: "MIN-DEN",
    team: "MIN",
    opponent: "DEN",
    propType: "total",
    confirmed: true,
    available: false,
  },
  {
    id: "edwards-points",
    sport: "NBA",
    market: "props",
    name: "Anthony Edwards",
    line: "Over 26.5 points",
    odds: -104,
    confidence: 62,
    hitRate: "6 of last 10",
    matchup: "at DEN",
    trend: "+2.0 projected edge",
    note: "Minnesota leans on his creation when half-court possessions tighten.",
    game: "MIN-DEN",
    team: "MIN",
    opponent: "DEN",
    propType: "points",
    confirmed: true,
    available: true,
  },
  {
    id: "jokic-points",
    sport: "NBA",
    market: "props",
    name: "Nikola Jokic",
    line: "Over 25.5 points",
    odds: -111,
    confidence: 66,
    hitRate: "68% home hit",
    matchup: "vs MIN",
    trend: "+2.9 projected edge",
    note: "Paint-touch efficiency is strong even against elite rim protection.",
    game: "MIN-DEN",
    team: "DEN",
    opponent: "MIN",
    propType: "points",
    confirmed: true,
    available: true,
  },
  {
    id: "cmc-rush",
    sport: "NFL",
    market: "props",
    name: "Christian McCaffrey",
    line: "Over 82.5 rush+rec yds",
    odds: -118,
    confidence: 66,
    hitRate: "69% role hit",
    matchup: "vs SEA",
    trend: "Elite usage floor",
    note: "Route share and red-zone work keep multiple paths alive.",
    game: "SF-SEA",
    team: "SF",
    opponent: "SEA",
    propType: "yards",
    confirmed: true,
    available: true,
  },
  {
    id: "deebo-td",
    sport: "NFL",
    market: "props",
    name: "Deebo Samuel",
    line: "Anytime touchdown",
    odds: 145,
    confidence: 63,
    hitRate: "Red-zone touch in 6 of last 8",
    matchup: "vs SEA",
    trend: "Designed-touch spike",
    note: "Motion usage creates goal-line looks against aggressive linebackers.",
    game: "SF-SEA",
    team: "SF",
    opponent: "SEA",
    propType: "touchdowns",
    confirmed: true,
    available: true,
  },
  {
    id: "walker-td",
    sport: "NFL",
    market: "props",
    name: "Kenneth Walker III",
    line: "Anytime touchdown",
    odds: 128,
    confidence: 61,
    hitRate: "5 TDs in last 7 active games",
    matchup: "at SF",
    trend: "Short-yardage role",
    note: "Seattle keeps him involved near the goal line even as an underdog.",
    game: "SF-SEA",
    team: "SEA",
    opponent: "SF",
    propType: "touchdowns",
    confirmed: true,
    available: true,
  },
  {
    id: "ravens-spread",
    sport: "NFL",
    market: "spreads",
    name: "Baltimore Ravens",
    line: "-2.5 spread",
    odds: -110,
    confidence: 60,
    hitRate: "10-5 ATS favorites",
    matchup: "vs CIN",
    trend: "Trench mismatch",
    note: "Pressure rate gap supports short-field chances.",
    game: "BAL-CIN",
    team: "BAL",
    opponent: "CIN",
    propType: "spread",
    confirmed: true,
    available: true,
  },
  {
    id: "lamar-td",
    sport: "NFL",
    market: "props",
    name: "Lamar Jackson",
    line: "Anytime touchdown",
    odds: 172,
    confidence: 62,
    hitRate: "Rush TD in 4 of last 6 divisional games",
    matchup: "vs CIN",
    trend: "QB run package",
    note: "Designed keepers project better inside the 10-yard line.",
    game: "BAL-CIN",
    team: "BAL",
    opponent: "CIN",
    propType: "touchdowns",
    confirmed: true,
    available: true,
  },
  {
    id: "chase-td",
    sport: "NFL",
    market: "props",
    name: "Ja'Marr Chase",
    line: "Anytime touchdown",
    odds: 118,
    confidence: 60,
    hitRate: "End-zone target in 5 of last 8",
    matchup: "at BAL",
    trend: "Volume ceiling",
    note: "Cincinnati's condensed-formation looks isolate him near the pylon.",
    game: "BAL-CIN",
    team: "CIN",
    opponent: "BAL",
    propType: "touchdowns",
    confirmed: true,
    available: true,
  },
  {
    id: "judge-bases",
    sport: "MLB",
    market: "props",
    name: "Aaron Judge",
    line: "Over 1.5 total bases",
    odds: 122,
    confidence: 63,
    hitRate: "Top 12% barrel spot",
    matchup: "vs RHP",
    trend: "Wind out to left",
    note: "Pitch mix leans into his pull-side damage zone.",
    game: "NYY-TOR",
    team: "NYY",
    opponent: "TOR",
    propType: "bases",
    confirmed: true,
    available: true,
  },
  {
    id: "judge-hr",
    sport: "MLB",
    market: "props",
    name: "Aaron Judge",
    line: "To hit a home run",
    odds: 310,
    confidence: 64,
    hitRate: "Top 12% barrel spot",
    matchup: "vs TOR",
    trend: "Pull-side weather boost",
    note: "Pitch mix leans into his elevated fastball damage zone.",
    game: "NYY-TOR",
    team: "NYY",
    opponent: "TOR",
    propType: "homeruns",
    confirmed: true,
    available: true,
  },
  {
    id: "vlad-hr",
    sport: "MLB",
    market: "props",
    name: "Vladimir Guerrero Jr.",
    line: "To hit a home run",
    odds: 390,
    confidence: 60,
    hitRate: "Hard-hit edge",
    matchup: "at NYY",
    trend: "Mistake-pitch profile",
    note: "Projected starter allows above-average pull-side lift to righties.",
    game: "NYY-TOR",
    team: "TOR",
    opponent: "NYY",
    propType: "homeruns",
    confirmed: true,
    available: true,
  },
  {
    id: "ohtani-hr",
    sport: "MLB",
    market: "props",
    name: "Shohei Ohtani",
    line: "To hit a home run",
    odds: 295,
    confidence: 66,
    hitRate: "Elite launch-angle form",
    matchup: "vs ATL",
    trend: "Park factor edge",
    note: "His power profile plays up against lower-slot right-handed pitching.",
    game: "LAD-ATL",
    team: "LAD",
    opponent: "ATL",
    propType: "homeruns",
    confirmed: true,
    available: true,
  },
  {
    id: "olson-hr",
    sport: "MLB",
    market: "props",
    name: "Matt Olson",
    line: "To hit a home run",
    odds: 360,
    confidence: 61,
    hitRate: "Barrel rate trending up",
    matchup: "at LAD",
    trend: "Platoon lift",
    note: "Fastball-heavy sequences give him a clean power path.",
    game: "LAD-ATL",
    team: "ATL",
    opponent: "LAD",
    propType: "homeruns",
    confirmed: true,
    available: true,
  },
  {
    id: "oilers-total",
    sport: "NHL",
    market: "totals",
    name: "EDM at VAN",
    line: "Over 6.0 goals",
    odds: -102,
    confidence: 61,
    hitRate: "High-event profile",
    matchup: "west slate",
    trend: "Goalie rest concern",
    note: "Both power plays rate above average in shot quality.",
    game: "EDM-VAN",
    team: "EDM",
    opponent: "VAN",
    propType: "total",
    confirmed: true,
    available: true,
  },
  {
    id: "mcdavid-goal",
    sport: "NHL",
    market: "props",
    name: "Connor McDavid",
    line: "Anytime goal scorer",
    odds: 135,
    confidence: 66,
    hitRate: "Goal in 5 of last 8",
    matchup: "at VAN",
    trend: "Shot quality edge",
    note: "Rush chances and power-play touches both project above baseline.",
    game: "EDM-VAN",
    team: "EDM",
    opponent: "VAN",
    propType: "goals",
    confirmed: true,
    available: true,
  },
  {
    id: "pettersson-goal",
    sport: "NHL",
    market: "props",
    name: "Elias Pettersson",
    line: "Anytime goal scorer",
    odds: 175,
    confidence: 60,
    hitRate: "Top-line minutes stable",
    matchup: "vs EDM",
    trend: "Power-play leverage",
    note: "Edmonton's penalty profile creates a viable scorer angle.",
    game: "EDM-VAN",
    team: "VAN",
    opponent: "EDM",
    propType: "goals",
    confirmed: true,
    available: true,
  },
  {
    id: "panarin-goal",
    sport: "NHL",
    market: "props",
    name: "Artemi Panarin",
    line: "Anytime goal scorer",
    odds: 168,
    confidence: 63,
    hitRate: "High-danger share up",
    matchup: "vs CAR",
    trend: "Top unit volume",
    note: "Shot attempts rise when New York faces aggressive forechecks.",
    game: "NYR-CAR",
    team: "NYR",
    opponent: "CAR",
    propType: "goals",
    confirmed: true,
    available: true,
  },
  {
    id: "aho-goal",
    sport: "NHL",
    market: "props",
    name: "Sebastian Aho",
    line: "Anytime goal scorer",
    odds: 154,
    confidence: 62,
    hitRate: "Goal in 4 of last 7",
    matchup: "at NYR",
    trend: "Slot-touch edge",
    note: "Carolina's cycle offense creates repeatable slot chances.",
    game: "NYR-CAR",
    team: "CAR",
    opponent: "NYR",
    propType: "goals",
    confirmed: true,
    available: true,
  },
];

const matchups = [
  { sport: "NBA", away: "PHI", home: "CHI", spread: "PHI -4.5", total: "229.5", edge: "Guard props" },
  { sport: "NBA", away: "NYK", home: "BOS", spread: "BOS -3.5", total: "214.0", edge: "Dog spread" },
  { sport: "NBA", away: "MIN", home: "DEN", spread: "DEN -2.0", total: "219.5", edge: "Under lean" },
  { sport: "NFL", away: "CIN", home: "BAL", spread: "BAL -2.5", total: "47.5", edge: "Home pressure" },
  { sport: "MLB", away: "TOR", home: "NYY", spread: "NYY -1.5", total: "8.5", edge: "Power bats" },
  { sport: "MLB", away: "ATL", home: "LAD", spread: "LAD -1.5", total: "9.0", edge: "HR props" },
  { sport: "NHL", away: "EDM", home: "VAN", spread: "VAN -1.5", total: "6.0", edge: "Total pace" },
  { sport: "NHL", away: "CAR", home: "NYR", spread: "NYR -1.5", total: "5.5", edge: "Goal scorers" },
];

const teamAliases = {
  PHI: ["phi", "sixers", "76ers", "philadelphia"],
  CHI: ["chi", "bulls", "chicago"],
  SAC: ["sac", "kings", "sacramento"],
  DAL: ["dal", "mavericks", "mavs", "dallas"],
  NYK: ["nyk", "knicks", "new york"],
  BOS: ["bos", "celtics", "boston"],
  MIN: ["min", "wolves", "timberwolves", "minnesota"],
  DEN: ["den", "nuggets", "denver"],
  SF: ["sf", "49ers", "san francisco"],
  SEA: ["sea", "seahawks", "seattle"],
  BAL: ["bal", "ravens", "baltimore"],
  CIN: ["cin", "bengals", "cincinnati"],
  NYY: ["nyy", "yankees"],
  TOR: ["tor", "blue jays", "toronto"],
  LAD: ["lad", "dodgers", "los angeles dodgers"],
  ATL: ["atl", "braves", "atlanta"],
  EDM: ["edm", "oilers", "edmonton"],
  VAN: ["van", "canucks", "vancouver"],
  NYR: ["nyr", "rangers", "new york rangers"],
  CAR: ["car", "hurricanes", "canes", "carolina"],
};

const sportParlayPrompts = {
  NBA: { label: "4-leg points parlay", query: "Best 4 leg parlay for points" },
  NFL: { label: "4-leg TD parlay", query: "Best 4 leg TD parlay" },
  MLB: { label: "4-leg homerun parlay", query: "Best 4 leg homerun parlay" },
  NHL: { label: "4 goal scorers parlay", query: "Best 4 goal scorers parlay" },
};

const state = {
  sport: "NBA",
  market: "props",
  minConfidence: 58,
  availableOnly: true,
  flagCorrelation: false,
  query: "",
  queryGame: "",
  parlayNote: "",
  slip: [],
  selectedPickId: "",
};

const betGrid = document.querySelector("#betGrid");
const matchupGrid = document.querySelector("#matchupGrid");
const slipList = document.querySelector("#slipList");
const sportLabel = document.querySelector("#sportLabel");
const confidenceRange = document.querySelector("#confidenceRange");
const confidenceValue = document.querySelector("#confidenceValue");
const availableToggle = document.querySelector("#showOnlyAvailable");
const correlationToggle = document.querySelector("#avoidSameGame");
const queryInput = document.querySelector("#queryInput");
const answerCard = document.querySelector(".answer-card");
const sportParlayPrompt = document.querySelector("#sportParlayPrompt");
const playerFact = document.querySelector("#playerFact");

function americanToDecimal(odds) {
  return odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
}

function decimalToAmerican(decimal) {
  const american = decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
  return `${american > 0 ? "+" : ""}${Math.round(american)}`;
}

function getLegCount(query) {
  const lower = query.toLowerCase();
  const numeric = lower.match(/\b([2-8])\s*[- ]?\s*(leg|legs)\b/);
  if (numeric) return Number(numeric[1]);

  const words = { two: 2, three: 3, four: 4, five: 5, six: 6 };
  const word = Object.entries(words).find(([label]) => lower.includes(`${label} leg`));
  return word ? word[1] : lower.includes("parlay") ? 4 : 0;
}

function getRequestedPropType(query) {
  const lower = query.toLowerCase();
  if (lower.includes("td") || lower.includes("touchdown")) return "touchdowns";
  if (lower.includes("homerun") || lower.includes("home run") || lower.includes("hr")) return "homeruns";
  if (lower.includes("goal scorer") || lower.includes("goalscorer") || lower.includes("goal scorers") || lower.includes("goal")) return "goals";
  if (lower.includes("point")) return "points";
  if (lower.includes("assist")) return "assists";
  if (lower.includes("yard")) return "yards";
  if (lower.includes("base") || lower.includes("hit")) return "bases";
  if (lower.includes("shot")) return "shots";
  return "";
}

function findMentionedTeams(query) {
  const lower = query.toLowerCase();
  return Object.entries(teamAliases)
    .filter(([, aliases]) => aliases.some((alias) => lower.includes(alias)))
    .map(([team]) => team);
}

function findMentionedGame(query) {
  const teams = findMentionedTeams(query);
  if (teams.length < 2) return "";

  const game = matchups.find((matchup) => teams.includes(matchup.away) && teams.includes(matchup.home));
  return game ? `${game.away}-${game.home}` : "";
}

function pickParlayLegs(query) {
  const legCount = getLegCount(query);
  if (!legCount) return [];

  const requestedPropType = getRequestedPropType(query);
  const mentionedGame = findMentionedGame(query);
  state.queryGame = mentionedGame;
  let candidates = picks
    .filter((pick) => pick.sport === state.sport)
    .filter((pick) => pick.market === "props")
    .filter((pick) => pick.available)
    .filter((pick) => pick.confirmed)
    .filter((pick) => pick.confidence >= state.minConfidence)
    .filter((pick) => !requestedPropType || pick.propType === requestedPropType)
    .sort((a, b) => b.confidence - a.confidence);

  if (mentionedGame) {
    candidates = candidates.filter((pick) => pick.game === mentionedGame && pick.confirmed);
    state.parlayNote = candidates.length
      ? `Specific-game mode: only confirmed players from ${mentionedGame} were considered.`
      : `Specific-game mode: I could not find enough confirmed ${state.sport} players from ${mentionedGame} in the sample board.`;
    const legs = candidates.slice(0, legCount);
    state.selectedPickId = legs[0]?.id || "";
    return legs;
  }

  const usedTeams = new Set();
  const legs = [];
  candidates.forEach((pick) => {
    if (legs.length >= legCount || usedTeams.has(pick.team)) return;
    usedTeams.add(pick.team);
    legs.push(pick);
  });

  state.parlayNote =
    legs.length >= legCount
      ? `Broad parlay mode: selected ${legs.length} legs from ${legs.length} different teams to reduce same-team dependence.`
      : `Broad parlay mode: found ${legs.length} qualifying legs from different teams; add more sample props or lower confidence for a full ${legCount}-leg slip.`;
  state.selectedPickId = legs[0]?.id || "";
  return legs;
}

function getPlayerFact(pick) {
  const propFacts = {
    points: "Scoring props are most interesting when usage and minutes agree. That is the sweet spot for overs.",
    assists: "Assist props usually need teammates to finish the job, so chance quality matters as much as pass volume.",
    touchdowns: "Anytime TD legs are tiny stories about role. Red-zone touches are the headline, not season-long yardage.",
    homeruns: "Home run bets live in the launch-angle neighborhood. Barrel form plus pitcher shape is the fun combo.",
    goals: "Goal scorer props love players who pair shot volume with power-play time. One without the other gets noisy.",
    yards: "Yardage props are floor plays when snaps, routes, and game script all point the same way.",
    bases: "Total bases props reward damage, not just contact. Doubles count, and that makes hard-hit form useful.",
  };

  return pick.funFact || propFacts[pick.propType] || "The best prop angles usually come from role, matchup, and line value agreeing at the same time.";
}

function renderPlayerFact() {
  const selectedPick = state.slip.find((pick) => pick.id === state.selectedPickId) || state.slip[0];

  if (!selectedPick) {
    state.selectedPickId = "";
    playerFact.innerHTML = `
      <p class="eyebrow">Edge note</p>
      <h3>Select a player</h3>
      <p>Add or select a leg to see a quick player fact.</p>
    `;
    return;
  }

  state.selectedPickId = selectedPick.id;
  playerFact.innerHTML = `
    <p class="eyebrow">Edge note</p>
    <h3>${selectedPick.name}</h3>
    <p>${getPlayerFact(selectedPick)}</p>
    <div class="fact-chips">
      <span>${selectedPick.team} vs ${selectedPick.opponent}</span>
      <span>${selectedPick.hitRate}</span>
      <span>${selectedPick.trend}</span>
    </div>
  `;
}

function filteredPicks() {
  let list = picks.filter((pick) => pick.sport === state.sport && pick.market === state.market);
  if (!list.length) list = picks.filter((pick) => pick.sport === state.sport);
  if (state.availableOnly) list = list.filter((pick) => pick.available);
  list = list.filter((pick) => pick.confidence >= state.minConfidence);
  if (state.queryGame) list = list.filter((pick) => pick.game === state.queryGame && pick.confirmed);

  if (!state.query) return list;

  const tokens = state.query
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 2 && !["the", "for", "are", "with", "tonight", "show", "find", "which"].includes(token));

  const scored = list
    .map((pick) => {
      const searchable = `${pick.name} ${pick.line} ${pick.hitRate} ${pick.matchup} ${pick.trend} ${pick.note} ${pick.game} ${pick.team} ${pick.opponent} ${pick.propType}`.toLowerCase();
      const score = tokens.reduce((total, token) => total + (searchable.includes(token) ? 1 : 0), 0);
      return { pick, score };
    })
    .sort((a, b) => b.score - a.score || b.pick.confidence - a.pick.confidence);

  const directMatches = scored.filter((item) => item.score > 0).map((item) => item.pick);
  return directMatches.length ? directMatches : scored.map((item) => item.pick);
}

function renderPicks() {
  const list = filteredPicks();
  betGrid.innerHTML = "";

  if (!list.length) {
    betGrid.innerHTML = `<div class="answer-card">No sample picks match these filters. Lower confidence or switch markets.</div>`;
  }

  list.forEach((pick) => {
    const article = document.createElement("article");
    article.className = "bet-card";
    article.innerHTML = `
      <div class="bet-top">
        <div>
          <p class="bet-title">${pick.name}</p>
          <div class="bet-market">${pick.line} - ${pick.matchup}</div>
        </div>
        <div class="odds">${pick.odds > 0 ? "+" : ""}${pick.odds}</div>
      </div>
      <div class="stat-line"><span>Confidence</span><strong>${pick.confidence}%</strong></div>
      <div class="signal-bar" aria-hidden="true"><span style="width:${pick.confidence}%"></span></div>
      <div class="stat-line"><span>${pick.hitRate}</span><strong>${pick.trend}</strong></div>
      <div class="stat-line"><span>Team</span><strong>${pick.team || "Board"}</strong></div>
      <div class="stat-line"><span>Status</span><strong>${pick.confirmed ? "Confirmed" : "Unconfirmed"}</strong></div>
      <p class="bet-market">${pick.note}</p>
      <div class="card-actions">
        <button class="add-button" type="button" data-add="${pick.id}">Add leg</button>
        <span class="tag">${pick.game}</span>
      </div>
    `;
    betGrid.appendChild(article);
  });

  const avg = list.length ? Math.round(list.reduce((sum, pick) => sum + pick.confidence, 0) / list.length) : 0;
  document.querySelector("#edgeCount").textContent = String(list.length);
  document.querySelector("#avgConfidence").textContent = `${avg}%`;
  document.querySelector("#riskLevel").textContent = list.length > 4 ? "Medium" : "Selective";
  renderAnswer(list);
}

function renderAnswer(list) {
  const title = state.query ? `Analysis for "${state.query}"` : `${state.sport} ${state.market} matching your filters`;
  const hasPlusMoney = list.some((pick) => pick.odds > 0);
  const topPick = list[0];
  const parlayLead = state.parlayNote ? `${state.parlayNote} ` : "";
  document.querySelector("#answerTitle").textContent = title;
  document.querySelector("#answerText").textContent = topPick
    ? `${parlayLead}I found ${list.length} ${state.sport} ${state.market} angle${list.length === 1 ? "" : "s"}. Start with ${topPick.name} ${topPick.line} at ${topPick.odds > 0 ? "+" : ""}${topPick.odds}; it has the strongest sample signal at ${topPick.confidence}%. ${hasPlusMoney ? "There is at least one plus-money leg in this result set." : "These are mostly price-efficient legs, so parlay risk matters more than payout size."}`
    : `${parlayLead}I could not find a sample ${state.sport} ${state.market} pick above ${state.minConfidence}% confidence. Try lowering the confidence slider or switching markets.`;
}

function renderSlip() {
  slipList.innerHTML = "";
  slipList.classList.toggle("empty", state.slip.length === 0);

  if (!state.slip.length) {
    slipList.textContent = "Add legs from the board.";
  } else {
    state.slip.forEach((pick) => {
      const item = document.createElement("div");
      item.className = `slip-item${pick.id === state.selectedPickId ? " active" : ""}`;
      item.dataset.pickId = pick.id;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.innerHTML = `
        <strong>${pick.name}</strong>
        <span>${pick.team || pick.game} - ${pick.line} - ${pick.odds > 0 ? "+" : ""}${pick.odds}</span>
      `;
      slipList.appendChild(item);
    });
  }

  const combinedDecimal = state.slip.reduce((product, pick) => product * americanToDecimal(pick.odds), 1);
  const duplicateGames = new Set();
  const games = new Set();
  state.slip.forEach((pick) => {
    if (games.has(pick.game)) duplicateGames.add(pick.game);
    games.add(pick.game);
  });

  const uniqueTeams = new Set(state.slip.map((pick) => pick.team).filter(Boolean));
  const broadUniqueParlay = state.slip.length >= 4 && uniqueTeams.size === state.slip.length && !duplicateGames.size;
  const risk = !state.slip.length ? "None" : duplicateGames.size ? "High" : broadUniqueParlay ? "Medium" : state.slip.length >= 4 ? "High" : state.slip.length >= 3 ? "Medium" : "Low";
  document.querySelector("#legCount").textContent = String(state.slip.length);
  document.querySelector("#combinedOdds").textContent = state.slip.length ? decimalToAmerican(combinedDecimal) : "+0";
  document.querySelector("#slipRisk").textContent = risk;
  document.querySelector("#riskBox").textContent = duplicateGames.size
    ? `Correlation warning: ${Array.from(duplicateGames).join(", ")} has multiple legs. Check whether one outcome depends on another.`
    : broadUniqueParlay
      ? "Multi-team parlay: legs come from different teams and games, reducing obvious correlation. Price and variance still matter."
    : "Combine independent edges first. Correlated legs can inflate payout while reducing true probability.";
  renderPlayerFact();
}

function renderMatchups() {
  matchupGrid.innerHTML = "";
  matchups
    .filter((game) => game.sport === state.sport)
    .slice(0, 4)
    .forEach((game) => {
      const card = document.createElement("article");
      card.className = "matchup-card";
      card.innerHTML = `
        <div class="teams">
          <div class="team-row"><span>${game.away}</span><span>Away</span></div>
          <div class="team-row"><span>${game.home}</span><span>Home</span></div>
        </div>
        <div class="board-line"><span>Spread</span><strong>${game.spread}</strong></div>
        <div class="board-line"><span>Total</span><strong>${game.total}</strong></div>
        <div class="board-line"><span>Lean</span><strong>${game.edge}</strong></div>
      `;
      matchupGrid.appendChild(card);
    });
}

function renderAll() {
  sportLabel.textContent = state.sport;
  confidenceValue.textContent = `${state.minConfidence}%`;
  updateSportParlayPrompt();
  renderPicks();
  renderSlip();
  renderMatchups();
}

function updateSportParlayPrompt() {
  const prompt = sportParlayPrompts[state.sport];
  if (!prompt) return;
  sportParlayPrompt.textContent = prompt.label;
  sportParlayPrompt.dataset.query = prompt.query;
}

function setActiveSport(sport) {
  state.sport = sport;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.sport === sport);
  });
}

function setActiveMarket(market) {
  state.market = market;
  document.querySelectorAll(".segmented button").forEach((button) => {
    button.classList.toggle("active", button.dataset.market === market);
  });
}

function detectQueryState(query) {
  const lower = query.toLowerCase();
  const sportMatches = [
    { sport: "NBA", terms: ["nba", "basketball", "guard", "guards", "points", "rebounds", "assists"] },
    { sport: "NFL", terms: ["nfl", "football", "touchdown", "td", "rush", "passing", "receiving"] },
    { sport: "MLB", terms: ["mlb", "baseball", "bases", "hits", "pitcher", "homer", "homerun", "home run"] },
    { sport: "NHL", terms: ["nhl", "hockey", "goals", "goal scorer", "goal scorers", "shots", "goalie", "power play"] },
  ];

  const sportMatch = sportMatches.find((item) => item.terms.some((term) => lower.includes(term)));
  if (sportMatch) setActiveSport(sportMatch.sport);

  const propTerms = ["prop", "player", "points", "assist", "yards", "bases", "shots", "rebounds", "td", "touchdown", "homerun", "home run", "hr", "goal scorer", "goal scorers"];

  if (lower.includes("spread") || lower.includes("cover") || lower.includes("ats")) {
    setActiveMarket("spreads");
  } else if (propTerms.some((term) => lower.includes(term))) {
    setActiveMarket("props");
  } else if (lower.includes("total") || lower.includes("under") || lower.includes("over/under")) {
    setActiveMarket("totals");
  }
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveSport(button.dataset.sport);
    state.query = "";
    state.queryGame = "";
    state.parlayNote = "";
    state.selectedPickId = "";
    state.slip = state.slip.filter((pick) => pick.sport === state.sport);
    renderAll();
  });
});

document.querySelectorAll(".segmented button").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveMarket(button.dataset.market);
    state.query = "";
    state.queryGame = "";
    state.parlayNote = "";
    state.selectedPickId = "";
    renderAll();
  });
});

confidenceRange.addEventListener("input", (event) => {
  state.minConfidence = Number(event.target.value);
  renderAll();
});

availableToggle.addEventListener("change", (event) => {
  state.availableOnly = event.target.checked;
  renderAll();
});

correlationToggle.addEventListener("change", (event) => {
  state.flagCorrelation = event.target.checked;
  document.querySelector("#riskBox").style.borderColor = event.target.checked ? "var(--coral)" : "var(--gold)";
  renderSlip();
});

betGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  if (!addButton) return;
  const pick = picks.find((item) => item.id === addButton.dataset.add);
  if (!pick || state.slip.some((item) => item.id === pick.id)) return;
  state.slip.push(pick);
  state.selectedPickId = pick.id;
  renderSlip();
});

document.querySelector("#clearSlip").addEventListener("click", () => {
  state.slip = [];
  state.selectedPickId = "";
  renderSlip();
});

slipList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-pick-id]");
  if (!item) return;
  state.selectedPickId = item.dataset.pickId;
  renderSlip();
});

slipList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const item = event.target.closest("[data-pick-id]");
  if (!item) return;
  event.preventDefault();
  state.selectedPickId = item.dataset.pickId;
  renderSlip();
});

document.querySelector("#queryForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = queryInput.value.trim();
  state.query = query;
  state.parlayNote = "";
  detectQueryState(query);
  state.queryGame = findMentionedGame(query);
  const parlayLegs = pickParlayLegs(query);
  if (parlayLegs.length) {
    state.slip = parlayLegs;
    state.selectedPickId = parlayLegs[0].id;
    setActiveMarket("props");
  }
  renderAll();
  answerCard.classList.remove("analyzed");
  requestAnimationFrame(() => answerCard.classList.add("analyzed"));
  document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelectorAll(".quick-prompts button").forEach((button) => {
  button.addEventListener("click", () => {
    queryInput.value = button.dataset.query;
    document.querySelector("#queryForm").requestSubmit();
  });
});

function setTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem("edgeboard-theme", theme);
  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeOption === theme);
  });
}

document.querySelectorAll("[data-theme-option]").forEach((button) => {
  button.addEventListener("click", () => {
    setTheme(button.dataset.themeOption);
  });
});

const savedTheme = localStorage.getItem("edgeboard-theme");
setTheme(savedTheme === "light" ? "light" : "dark");
renderAll();
