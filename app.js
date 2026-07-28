import { createSportsRepository } from "./src/services/sports-repository.js";
import { loadProviderPayload } from "./src/services/provider-client.js";
import {
  buildParlay,
  getAvailableMarketFilters,
  getFilteredPicks,
  getPickBySelectionId,
  parseResearchQuery,
} from "./src/services/research-service.js";
import {
  createNavigationModel,
  getLeagueStatusMetadata,
  getVisibleMarketSummaries,
  normalizeNavigationSelection,
  parseNavigationSelection,
  serializeNavigationSelection,
} from "./src/services/navigation-service.js";
import { createEventPresentation } from "./src/services/presentation-service.js";
import { runAnalystWorkflow } from "./src/services/analyst-service.js";
import { getConfidenceBand, getMarketDefinition } from "./src/config/market-catalog.js";

const providerPayload = await loadProviderPayload();
const sportsRepository = createSportsRepository(providerPayload);
const leagues = sportsRepository.getLeagues();
const navigationModel = createNavigationModel(leagues);
const defaultLeague = navigationModel.primaryLeagues[0] || navigationModel.allLeagues[0] || null;
const allEvents = navigationModel.allLeagues.flatMap((league) => sportsRepository.getEvents(league.leagueId));
const allMarkets = navigationModel.allLeagues.flatMap((league) => sportsRepository.getMarkets(league.leagueId));

function loadMinimumConfidence() {
  const queryValue = new URLSearchParams(window.location.search).get("confidence");
  let savedValue = "";
  try {
    savedValue = localStorage.getItem("edgeboard-min-confidence") || "";
  } catch {
    savedValue = "";
  }
  const candidate = queryValue === null ? savedValue : queryValue;
  const numeric = Number(candidate);
  return candidate !== "" && Number.isFinite(numeric) ? Math.min(100, Math.max(0, Math.round(numeric))) : 58;
}

function loadNavigationSelection() {
  const urlSelection = parseNavigationSelection(new URLSearchParams(window.location.search).get("scope"));
  let savedSelection = null;
  try {
    savedSelection = JSON.parse(localStorage.getItem("edgeboard-navigation-selection") || "null");
  } catch {
    savedSelection = null;
  }
  return normalizeNavigationSelection(urlSelection || savedSelection, navigationModel.allLeagues, defaultLeague?.leagueId);
}

function getSelectionSummary(selection) {
  return getVisibleMarketSummaries({
    selection,
    leagues: navigationModel.allLeagues,
    events: allEvents,
    markets: allMarkets,
    currentDate: new Date(),
  });
}

function researchLeagueForSelection(selection, preferredLeagueId = "") {
  if (selection.type === "league") return sportsRepository.getLeague(selection.id);
  const summary = getSelectionSummary(selection);
  return summary.visibleLeagues.find((league) => league.leagueId === preferredLeagueId)
    || summary.visibleLeagues[0]
    || sportsRepository.getLeague(preferredLeagueId)
    || defaultLeague;
}

const initialNavigationSelection = loadNavigationSelection();
const initialResearchLeague = researchLeagueForSelection(initialNavigationSelection);

const state = {
  navigationSelection: initialNavigationSelection,
  leagueId: initialResearchLeague?.leagueId || "",
  market: "props",
  minConfidence: loadMinimumConfidence(),
  canonicalMarketId: "",
  marketSearch: "",
  marketCategoryBySport: {},
  marketSelectionBySport: {},
  unsupportedMarketReason: "",
  interpretationNote: "",
  availableOnly: true,
  flagCorrelation: false,
  query: "",
  queryGame: "",
  parlayNote: "",
  slip: [],
  selectedPickId: "",
  discoveryView: "all",
  researchIntent: "markets",
  marketBoardLoading: true,
  analystWorkflow: null,
};

const elements = {
  sportTabs: document.querySelector("#sportTabs"),
  marketFilters: document.querySelector("#marketFilters"),
  marketSearch: document.querySelector("#marketSearch"),
  marketCategoryNav: document.querySelector("#marketCategoryNav"),
  marketCatalogList: document.querySelector("#marketCatalogList"),
  betGrid: document.querySelector("#betGrid"),
  matchupGrid: document.querySelector("#matchupGrid"),
  slipList: document.querySelector("#slipList"),
  sportLabel: document.querySelector("#sportLabel"),
  confidenceRange: document.querySelector("#confidenceRange"),
  confidenceValue: document.querySelector("#confidenceValue"),
  confidenceFilterStatus: document.querySelector("#confidenceFilterStatus"),
  availableToggle: document.querySelector("#showOnlyAvailable"),
  correlationToggle: document.querySelector("#avoidSameGame"),
  queryInput: document.querySelector("#queryInput"),
  answerCard: document.querySelector(".answer-card"),
  sportParlayPrompt: document.querySelector("#sportParlayPrompt"),
  playerFact: document.querySelector("#playerFact"),
  timestamp: document.querySelector(".timestamp"),
  discoveryDrawer: document.querySelector("#discoveryDrawer"),
  discoveryBackdrop: document.querySelector("#discoveryBackdrop"),
  discoveryFilters: document.querySelector("#discoveryFilters"),
  discoveryContent: document.querySelector("#discoveryContent"),
  discoveryTitle: document.querySelector("#discoveryTitle"),
  researchIntentNav: document.querySelector("#researchIntentNav"),
  todayBoardTitle: document.querySelector("#todayBoardTitle"),
  todayBoardEyebrow: document.querySelector("#todayBoardEyebrow"),
  todayMarketGrid: document.querySelector("#todayMarketGrid"),
  todayBoardSummary: document.querySelector("#todayBoardSummary"),
  mobileSlipToggle: document.querySelector("#mobileSlipToggle"),
  mobileLegCount: document.querySelector("#mobileLegCount"),
  betSlip: document.querySelector("#betSlip"),
  analystWorkflow: document.querySelector("#analystWorkflow"),
  analystWorkflowStatus: document.querySelector("#analystWorkflowStatus"),
  analystScope: document.querySelector("#analystScope"),
  analystWorkflowSteps: document.querySelector("#analystWorkflowSteps"),
  analystWarnings: document.querySelector("#analystWarnings"),
  dataStatus: document.querySelector("#dataStatus"),
  modeBadge: document.querySelector("#modeBadge"),
};

let renderedPicks = new Map();
let marketBoardLoadTimer = 0;
let discoveryReturnFocus = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatOdds(odds) {
  return Number.isFinite(odds) ? `${odds > 0 ? "+" : ""}${odds}` : "N/A";
}

function formatDateTime(value, fallback = "Time unavailable") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function americanToDecimal(odds) {
  if (!Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
}

function decimalToAmerican(decimal) {
  if (!Number.isFinite(decimal) || decimal <= 1) return "+0";
  const american = decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
  return `${american > 0 ? "+" : ""}${Math.round(american)}`;
}

function currentLeague() {
  return sportsRepository.getLeague(state.leagueId);
}

function renderNavigation() {
  const concepts = [
    { id: "for-you", label: "For You", status: "Top edges" },
    { id: "live", label: "Live", status: `${navigationModel.liveLeagues.length} active` },
    { id: "today", label: "Today", status: `${navigationModel.todayLeagues.length} sports` },
  ];
  const conceptButtons = concepts.map((concept) => {
    const active = state.navigationSelection.type === "system" && state.navigationSelection.id === concept.id;
    return `
    <button class="tab has-status${active ? " active" : ""}" type="button" data-nav-view="${concept.id}"
      aria-pressed="${active}" ${active ? 'aria-current="page"' : ""}>
      <span>${concept.label}</span><span class="nav-status">${concept.status}</span>
    </button>
  `;
  }).join("");
  const leagueButtons = navigationModel.primaryLeagues.map((league) => {
    const status = getLeagueStatusMetadata(league);
    const active = state.navigationSelection.type === "league" && league.leagueId === state.navigationSelection.id;
    return `
    <button
      class="tab has-status${active ? " active" : ""}"
      type="button"
      data-league="${escapeHtml(league.leagueId)}"
      aria-pressed="${active}"
      ${active ? 'aria-current="page"' : ""}
    ><span>${escapeHtml(league.leagueDisplayName)}</span><span class="nav-status">${escapeHtml(status.label)}</span></button>
  `;
  }).join("");
  const soccerActive = navigationModel.soccerLeagues.filter((league) => league.liveEventCount || league.todayEventCount).length;
  const soccerSelected = state.navigationSelection.type === "sport" && state.navigationSelection.id === "soccer";
  const primaryLeagueIds = new Set(navigationModel.primaryLeagues.map((league) => league.leagueId));
  const moreSelected = state.navigationSelection.type === "category"
    || state.navigationSelection.type === "destination"
    || (state.navigationSelection.type === "sport" && state.navigationSelection.id !== "soccer")
    || (state.navigationSelection.type === "league" && !primaryLeagueIds.has(state.navigationSelection.id))
    || (state.navigationSelection.type === "system" && state.navigationSelection.id === "all");
  elements.sportTabs.innerHTML = `${conceptButtons}${leagueButtons}
    <button class="tab has-status${soccerSelected ? " active" : ""}" type="button" data-sport="soccer"
      aria-pressed="${soccerSelected}" ${soccerSelected ? 'aria-current="page"' : ""}>
      <span>Soccer</span><span class="nav-status">${soccerActive} active</span>
    </button>
    <button class="tab has-status${moreSelected ? " active" : ""}" type="button" data-nav-view="more"
      aria-controls="discoveryDrawer" aria-expanded="${elements.discoveryDrawer.classList.contains("open")}" aria-pressed="${moreSelected}">
      <span>More</span><span class="nav-status">${leagues.length} leagues</span>
    </button>`;
}

function leagueDiscoveryCard(league) {
  const status = getLeagueStatusMetadata(league);
  const active = state.navigationSelection.type === "league" && state.navigationSelection.id === league.leagueId;
  return `
    <button class="league-discovery-card${active ? " active" : ""}" type="button" data-league="${escapeHtml(league.leagueId)}"
      aria-pressed="${active}">
      <strong>${escapeHtml(league.leagueDisplayName)}</strong>
      <span class="league-status">${escapeHtml(status.label)}</span>
      <span class="league-detail">${escapeHtml(league.sportDisplayName)} · ${escapeHtml(status.detail)}</span>
      <span class="league-tier">Tier ${league.priorityTier}</span>
    </button>
  `;
}

function discoveryGroupsForView(view) {
  if (view === "soccer") {
    return ["United States", "Mexico", "Europe", "International"].map((name) => ({
      name,
      leagues: navigationModel.soccerLeagues.filter((league) => league.soccerGroup === name),
    }));
  }
  const viewMap = {
    upcoming: navigationModel.upcomingLeagues,
    offseason: navigationModel.offseasonLeagues,
    futures: navigationModel.futuresLeagues,
    tier2: navigationModel.tierTwoLeagues,
    tier3: navigationModel.tierThreeLeagues,
    unavailable: navigationModel.unavailableLeagues,
  };
  if (viewMap[view]) return [{ name: view === "tier2" ? "Expanded Sports" : view === "tier3" ? "Specialty Sports" : view, leagues: viewMap[view] }];
  return [1, 2, 3].map((tier) => ({
    name: tier === 1 ? "Tier 1 · Core" : tier === 2 ? "Tier 2 · Expanded" : "Tier 3 · Specialty",
    leagues: navigationModel.allLeagues.filter((league) => league.priorityTier === tier),
  }));
}

function renderDiscovery() {
  const titles = {
    all: "All Sports & Leagues",
    soccer: "Soccer",
    upcoming: "Upcoming",
    offseason: "Offseason",
    futures: "Futures",
    tier2: "Tier 2 Sports",
    tier3: "Tier 3 Sports",
    unavailable: "Unavailable Leagues",
  };
  elements.discoveryTitle.textContent = titles[state.discoveryView] || "All Sports";
  elements.discoveryFilters.querySelectorAll("[data-discovery-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.discoveryView === state.discoveryView);
  });
  const groups = discoveryGroupsForView(state.discoveryView).filter((group) => group.leagues.length);
  const scopeOptions = state.discoveryView === "all" ? `
    <section class="discovery-group">
      <h3>Browse by sport</h3>
      <div class="league-discovery-list">
        ${[
          ["basketball", "Basketball"],
          ["soccer", "Soccer"],
          ["motorsport", "Motorsports"],
        ].map(([id, label]) => {
          const active = state.navigationSelection.type === "sport" && state.navigationSelection.id === id;
          return `<button class="league-discovery-card${active ? " active" : ""}" type="button" data-sport="${id}" aria-pressed="${active}">
            <strong>${label}</strong><span class="league-detail">Show configured ${label.toLowerCase()} leagues</span><span class="league-tier">Sport scope</span>
          </button>`;
        }).join("")}
        <button class="league-discovery-card${state.navigationSelection.type === "category" && state.navigationSelection.id === "combat-sports" ? " active" : ""}"
          type="button" data-category="combat-sports"
          aria-pressed="${state.navigationSelection.type === "category" && state.navigationSelection.id === "combat-sports"}">
          <strong>Combat Sports</strong><span class="league-detail">MMA, boxing, bare knuckle, and kickboxing</span><span class="league-tier">Category scope</span>
        </button>
      </div>
    </section>
  ` : "";
  elements.discoveryContent.innerHTML = groups.length ? `${scopeOptions}${groups.map((group) => `
    <section class="discovery-group">
      <h3>${escapeHtml(group.name)}</h3>
      <div class="league-discovery-list">${group.leagues.map(leagueDiscoveryCard).join("")}</div>
    </section>
  `).join("")}` : `<div class="discovery-empty">No sample leagues match this view.</div>`;
}

function openDiscovery(view = "all") {
  discoveryReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.discoveryView = view;
  renderDiscovery();
  elements.discoveryBackdrop.hidden = false;
  elements.discoveryDrawer.classList.add("open");
  elements.discoveryDrawer.setAttribute("aria-hidden", "false");
  renderNavigation();
  document.querySelector("#closeDiscovery").focus({ preventScroll: true });
}

function closeDiscovery({ restoreFocus = false } = {}) {
  const wasOpen = elements.discoveryDrawer.classList.contains("open");
  const returnTarget = discoveryReturnFocus;
  elements.discoveryDrawer.classList.remove("open");
  elements.discoveryDrawer.setAttribute("aria-hidden", "true");
  elements.discoveryBackdrop.hidden = true;
  renderNavigation();
  discoveryReturnFocus = null;
  if (!wasOpen || !restoreFocus) return;
  const focusTarget = returnTarget?.isConnected
    ? returnTarget
    : elements.sportTabs.querySelector('[data-nav-view="more"]');
  focusTarget?.focus({ preventScroll: true });
}

function leaguesForResearchIntent(intent, scopedLeagues) {
  const active = scopedLeagues.filter((league) =>
    !["unavailable", "error"].includes(league.availabilityStatus)
    && (league.liveEventCount || league.todayEventCount || league.upcomingEventCount || league.availableMarketCount),
  );
  const filters = {
    live: (league) => league.liveEventCount > 0,
    "player-props": (league) => league.playerPropCount > 0,
    "game-props": (league) => league.supportedMarketTypes.includes("team-prop") && league.availableMarketCount > 0,
    sgp: (league) => league.category === "team-sport" && league.playerPropCount > 0,
    value: (league) => league.availableMarketCount >= 30,
    movement: (league) => league.liveEventCount > 0 || league.todayEventCount > 0,
    trending: (league) => league.todayEventCount > 0 || league.featuredEventWeight >= 70,
  };
  return (filters[intent] ? active.filter(filters[intent]) : active).slice(0, 6);
}

function renderResearchIntentNavigation() {
  elements.researchIntentNav.querySelectorAll("[data-intent]").forEach((button) => {
    const active = button.dataset.intent === state.researchIntent;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderTodayMarketBoard() {
  renderResearchIntentNavigation();
  const summary = getSelectionSummary(state.navigationSelection);
  elements.todayBoardTitle.textContent = summary.heading;
  elements.todayBoardEyebrow.textContent = summary.selection.type === "system" && ["all", "for-you"].includes(summary.selection.id)
    ? "Cross-sport discovery"
    : `${summary.contextLabel} scope`;
  const skeletonCount = summary.selection.type === "league" ? 1 : Math.min(6, Math.max(1, summary.visibleLeagues.length));
  if (state.marketBoardLoading) {
    elements.todayMarketGrid.setAttribute("aria-busy", "true");
    elements.todayMarketGrid.innerHTML = Array.from({ length: skeletonCount }, () => `<div class="skeleton-card" aria-hidden="true"></div>`).join("");
    elements.todayBoardSummary.textContent = `Loading ${summary.contextLabel} sample market availability…`;
    return;
  }

  const intentLabels = {
    markets: "active market coverage",
    live: "live events",
    "player-props": "player-prop availability",
    "game-props": "game-prop availability",
    sgp: "same-game parlay research",
    value: "high-availability value research",
    movement: "line-movement monitoring",
    "ai-research": "AI-assisted research",
    trending: "trending events",
  };
  const leaguesForBoard = leaguesForResearchIntent(state.researchIntent, summary.visibleLeagues);
  const boardCounts = leaguesForBoard.reduce((counts, league) => ({
    events: counts.events + league.todayEventCount,
    live: counts.live + league.liveEventCount,
    markets: counts.markets + league.availableMarketCount,
    props: counts.props + league.playerPropCount,
  }), { events: 0, live: 0, markets: 0, props: 0 });
  const intentCopy = state.researchIntent === "markets"
    ? ""
    : ` Research intent: ${intentLabels[state.researchIntent] || "market research"}.`;
  elements.todayBoardSummary.textContent = `${summary.supportingText}${intentCopy} ${boardCounts.events} today · ${boardCounts.live} live · ${boardCounts.markets} markets · ${boardCounts.props} player props.`;
  elements.todayMarketGrid.setAttribute("aria-busy", "false");
  elements.todayMarketGrid.dataset.scope = serializeNavigationSelection(summary.selection);
  elements.todayMarketGrid.dataset.leagueCount = String(leaguesForBoard.length);
  elements.todayMarketGrid.dataset.eventCount = String(boardCounts.events);
  elements.todayMarketGrid.dataset.marketCount = String(boardCounts.markets);

  if (!leaguesForBoard.length) {
    const emptyMessages = {
      live: "No live sample events are available. Upcoming events remain accessible in More.",
      "player-props": "No supported player props are available for this view.",
      sgp: "No same-game parlay sample markets are currently available.",
      movement: "No active sample lines are available for movement monitoring.",
    };
    elements.todayMarketGrid.innerHTML = `<div class="discovery-empty">${escapeHtml(summary.emptyStateReason || emptyMessages[state.researchIntent] || "Data is temporarily unavailable for this research view.")}</div>`;
    return;
  }

  const leagueScopeNotice = summary.selection.type === "league" && summary.emptyStateReason
    ? `<div class="scope-empty-state"><strong>${escapeHtml(summary.emptyStateReason)}</strong><span>${escapeHtml(leaguesForBoard[0].statusLabel || getLeagueStatusMetadata(leaguesForBoard[0]).label)}</span></div>`
    : "";
  elements.todayMarketGrid.innerHTML = `${leagueScopeNotice}${leaguesForBoard.map((league) => {
    const status = getLeagueStatusMetadata(league);
    const nextEvent = sportsRepository.getEvents(league.leagueId)
      .filter((event) => event.startsAt)
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0];
    const todayText = league.todayEventCount
      ? `${league.todayEventCount} today`
      : league.availabilityStatus === "futures-only" ? "Futures only" : status.label;
    return `
      <button class="today-market-card" type="button" data-market-league="${escapeHtml(league.leagueId)}" aria-label="Open ${escapeHtml(league.leagueDisplayName)} research board">
        <span class="market-card-header">
          <span><strong>${escapeHtml(league.leagueDisplayName)}</strong>${escapeHtml(league.sportDisplayName)}</span>
          <span class="market-status">${escapeHtml(status.label)}</span>
        </span>
        <span class="market-card-metrics">
          <span>Live<strong>${league.liveEventCount}</strong></span>
          <span>Events<strong>${escapeHtml(todayText)}</strong></span>
          <span>Markets<strong>${league.availableMarketCount}</strong></span>
          <span>Player props<strong>${league.playerPropCount || "Not supported"}</strong></span>
        </span>
        <span class="market-card-footer">
          <span>${nextEvent ? `Next ${formatDateTime(nextEvent.startsAt)}` : status.label}</span>
          <span>Fresh ${formatDateTime(league.lastUpdatedAt, "unknown")}</span>
        </span>
        <span class="market-card-footer"><span class="sample-inline">Sample data</span><span>${escapeHtml(league.dataQualityStatus)} quality</span></span>
      </button>
    `;
  }).join("")}`;
}

function scheduleMarketBoardLoad() {
  state.marketBoardLoading = true;
  renderTodayMarketBoard();
  window.clearTimeout(marketBoardLoadTimer);
  marketBoardLoadTimer = window.setTimeout(() => {
    state.marketBoardLoading = false;
    renderTodayMarketBoard();
  }, 420);
}

function renderMarketFilters() {
  const filters = getAvailableMarketFilters(sportsRepository, state.leagueId);
  if (!filters.some((filter) => filter.id === state.market && filter.supported)) {
    state.market = filters.find((filter) => filter.supported)?.id || "props";
  }
  elements.marketFilters.innerHTML = filters.map((filter) => `
    <button
      class="${filter.id === state.market ? "active" : ""}"
      type="button"
      data-market="${escapeHtml(filter.id)}"
      ${filter.supported ? "" : "disabled"}
      aria-pressed="${filter.id === state.market}"
      title="${filter.available ? "" : "No current sample markets"}"
    >${escapeHtml(filter.displayName)}</button>
  `).join("");
}

function renderMarketBrowser() {
  const league = currentLeague();
  const availability = sportsRepository.getMarketAvailability(state.leagueId)
    .filter((item) => item.definition && (item.activeCount > 0 || item.suspended));
  const availableCategories = [...new Set(availability.map((item) => item.definition.category))];
  const categories = availability.some((item) => item.definition.popular)
    ? ["Popular", ...availableCategories]
    : availableCategories;
  let selectedCategory = state.marketCategoryBySport[league?.sportId] || categories[0] || "";
  if (!categories.includes(selectedCategory)) selectedCategory = categories[0] || "";
  if (league) state.marketCategoryBySport[league.sportId] = selectedCategory;

  elements.marketCategoryNav.innerHTML = categories.map((category) => `
    <button type="button" role="tab" data-market-category="${escapeHtml(category)}"
      class="${category === selectedCategory ? "active" : ""}"
      aria-selected="${category === selectedCategory}">${escapeHtml(category)}</button>
  `).join("");

  const search = state.marketSearch.trim().toLowerCase();
  const visible = availability.filter(({ definition }) => {
    const matchesCategory = search || (selectedCategory === "Popular" ? definition.popular : definition.category === selectedCategory);
    const haystack = [definition.displayName, definition.shortName, definition.browseGroup, ...definition.searchTerms, ...definition.providerAliases].join(" ").toLowerCase();
    return matchesCategory && (!search || haystack.includes(search));
  });
  const groups = [...new Set(visible.map((item) => item.definition.browseGroup))];
  elements.marketCatalogList.innerHTML = groups.length ? groups.map((group) => `
    <details class="market-catalog-group" open>
      <summary>${escapeHtml(group)} <span>${visible.filter((item) => item.definition.browseGroup === group).length}</span></summary>
      <div>
        ${visible.filter((item) => item.definition.browseGroup === group).map((item) => `
          <button type="button" data-canonical-market="${escapeHtml(item.canonicalMarketId)}"
            class="${state.canonicalMarketId === item.canonicalMarketId ? "active" : ""}"
            aria-pressed="${state.canonicalMarketId === item.canonicalMarketId}"
            ${item.available ? "" : "disabled"}>
            <span>${escapeHtml(item.definition.displayName)}</span>
            <small>${escapeHtml(item.definition.participantType)} · ${item.available ? `${item.activeCount} open` : item.suspended ? "Suspended" : "Unavailable"}</small>
          </button>
        `).join("")}
      </div>
    </details>
  `).join("") : `<p class="market-browser-empty">${search ? "No available markets match this search." : "No markets are available in this category."}</p>`;
}

function persistMinimumConfidence() {
  try {
    localStorage.setItem("edgeboard-min-confidence", String(state.minConfidence));
    const url = new URL(window.location.href);
    url.searchParams.set("confidence", String(state.minConfidence));
    history.replaceState(null, "", url);
  } catch {
    // Filtering still works when persistence is unavailable.
  }
}

function updateSportParlayPrompt() {
  const prompt = currentLeague()?.parlayPrompt;
  if (!prompt) {
    elements.sportParlayPrompt.hidden = true;
    return;
  }
  elements.sportParlayPrompt.hidden = false;
  elements.sportParlayPrompt.textContent = prompt.label;
  elements.sportParlayPrompt.dataset.query = prompt.query;
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
  return propFacts[pick.propType] || "The best prop angles usually come from role, matchup, and line value agreeing at the same time.";
}

function renderPlayerFact() {
  const selectedPick = state.slip.find((pick) => pick.id === state.selectedPickId) || state.slip[0];
  if (!selectedPick) {
    state.selectedPickId = "";
    elements.playerFact.innerHTML = `
      <p class="eyebrow">Edge note</p>
      <h3>Select a player</h3>
      <p>Add or select a leg to see a quick player fact.</p>
    `;
    return;
  }

  state.selectedPickId = selectedPick.id;
  elements.playerFact.innerHTML = `
    <p class="eyebrow">Edge note</p>
    <h3>${escapeHtml(selectedPick.name)}</h3>
    <p>${escapeHtml(getPlayerFact(selectedPick))}</p>
    <div class="fact-chips">
      <span>${escapeHtml(selectedPick.team || "TBD")} vs ${escapeHtml(selectedPick.opponent || "TBD")}</span>
      <span>${escapeHtml(selectedPick.hitRate)}</span>
      <span>${escapeHtml(selectedPick.trend)}</span>
    </div>
  `;
}

function renderAnswer(list) {
  const leagueName = currentLeague()?.leagueDisplayName || "League";
  const title = state.query ? `Analysis for "${state.query}"` : `${leagueName} ${state.market} matching your filters`;
  const hasPlusMoney = list.some((pick) => Number.isFinite(pick.odds) && pick.odds > 0);
  const topPick = list[0];
  const parlayLead = [state.interpretationNote, state.parlayNote].filter(Boolean).join(" ");
  document.querySelector("#answerTitle").textContent = title;
  document.querySelector("#answerText").textContent = topPick
    ? `${parlayLead ? `${parlayLead} ` : ""}I found ${list.length} ${leagueName} ${state.market} angle${list.length === 1 ? "" : "s"}. Start with ${topPick.name} ${topPick.line} at ${formatOdds(topPick.odds)}; it has the strongest sample signal at ${topPick.confidence}%. ${hasPlusMoney ? "There is at least one plus-money leg in this result set." : "These are mostly price-efficient legs, so parlay risk matters more than payout size."}`
    : `${parlayLead ? `${parlayLead} ` : ""}I could not find a sample ${leagueName} ${state.market} pick above ${state.minConfidence}% confidence. Try lowering the confidence slider or switching markets.`;
}

function renderAnalystWorkflow() {
  const workflow = state.analystWorkflow;
  elements.analystWorkflow.hidden = !workflow;
  if (!workflow) return;

  elements.analystWorkflow.dataset.status = workflow.status;
  elements.analystWorkflowStatus.textContent = workflow.status === "ready"
    ? "Evidence ready"
    : workflow.status === "limited" ? "Limited evidence" : "Blocked";
  elements.analystScope.innerHTML = `
    <div><span>Resolved scope</span><strong>${escapeHtml(workflow.sportName)} · ${escapeHtml(workflow.leagueName)}</strong></div>
    <div><span>Event model</span><strong>${escapeHtml(workflow.category)}</strong></div>
    <div><span>Market intent</span><strong>${escapeHtml(workflow.marketLabel)}</strong></div>
    <div><span>Evidence</span><strong>${workflow.evidence.availableCount} available / ${workflow.evidence.marketCount} scoped</strong></div>
  `;
  elements.analystWorkflowSteps.innerHTML = workflow.steps.map((step) => `
    <li class="workflow-step ${escapeHtml(step.status)}">
      <span class="workflow-step-marker" aria-hidden="true"></span>
      <div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.detail)}</p></div>
      <span class="workflow-step-status">${escapeHtml(step.status)}</span>
    </li>
  `).join("");
  elements.analystWarnings.innerHTML = `
    <div class="analyst-constraints"><strong>Applied constraints</strong>${workflow.constraints.map((constraint) => `<span>${escapeHtml(constraint)}</span>`).join("")}</div>
    <details>
      <summary>Data-quality notes · ${workflow.warnings.length}</summary>
      <ul>${workflow.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
    </details>
  `;
}

function renderPicks() {
  const list = getFilteredPicks(sportsRepository, {
    leagueId: state.leagueId,
    market: state.market,
    canonicalMarketId: state.canonicalMarketId,
    minConfidence: state.minConfidence,
    availableOnly: state.availableOnly,
    query: state.query,
    queryGame: state.queryGame,
  });
  renderedPicks = new Map(list.map((pick) => [pick.id, pick]));

  const league = currentLeague();
  const emptyMessage = state.unsupportedMarketReason
    ? state.unsupportedMarketReason
    : league?.availabilityStatus === "error"
    ? "Market data is temporarily unavailable for this league."
    : league?.availabilityStatus === "stale"
      ? "The latest odds are stale. Refresh the sample provider before researching this board."
      : league?.availabilityStatus === "futures-only"
        ? "This league currently has futures only; game and player props are not supported."
        : league?.todayEventCount === 0 && league?.upcomingEventCount > 0
          ? league.statusLabel || "No games today. The next event is upcoming."
          : "No sample picks match these filters. Lower confidence or switch markets.";

  elements.betGrid.innerHTML = list.length ? list.map((pick) => {
    const actionable = pick.available && !pick.stale;
    const cardState = pick.stale ? " stale" : !pick.available ? " unavailable" : "";
    const confidenceBand = getConfidenceBand(pick.confidence);
    return `
    <article class="bet-card${cardState}">
      <div class="bet-top">
        <div>
          <p class="bet-title">${escapeHtml(pick.name)}</p>
          <div class="bet-market">${escapeHtml(pick.marketDisplayName)} · ${escapeHtml(pick.matchup)} · ${escapeHtml(pick.competitorStatus)}</div>
        </div>
        <div class="odds">${formatOdds(pick.odds)}</div>
      </div>
      <div class="bet-source-row"><span>${escapeHtml(pick.sportsbook)}</span><span>Updated ${formatDateTime(pick.lastUpdatedAt)}</span></div>
      <div class="prop-metrics">
        <div class="prop-metric">
          <span class="prop-metric-label">Line <button class="info-button" type="button" aria-label="About line" title="The displayed threshold or outcome for this sample market.">i</button></span>
          <strong>${escapeHtml(pick.line)}</strong>
        </div>
        <div class="prop-metric">
          <span class="prop-metric-label">Projection <button class="info-button" type="button" aria-label="About projection" title="The model estimate for the selected outcome.">i</button></span>
          <strong>${escapeHtml(pick.projection)}</strong>
        </div>
        <div class="prop-metric">
          <span class="prop-metric-label">Projected edge <button class="info-button" type="button" aria-label="About projected edge" title="The model projection compared with the offered line or price.">i</button></span>
          <strong>${escapeHtml(pick.trend)}</strong>
        </div>
        <div class="prop-metric">
          <span class="prop-metric-label">Historical hit rate <button class="info-button" type="button" aria-label="About historical hit rate" title="How often the historical sample cleared this type of line. It does not predict a guaranteed result.">i</button></span>
          <strong>${escapeHtml(pick.hitRate)}</strong>
        </div>
      </div>
      <div class="stat-line"><span>Model confidence <button class="info-button" type="button" aria-label="About model confidence" title="Signal strength and data agreement, not a guaranteed win probability.">i</button></span><strong class="confidence-band ${confidenceBand.id}">${pick.confidence}% · ${escapeHtml(confidenceBand.label)}</strong></div>
      <div class="signal-bar" aria-hidden="true"><span style="width:${pick.confidence}%"></span></div>
      <div class="bet-event-row"><span>Event ${formatDateTime(pick.eventTime, "Time TBD")}</span><span>${escapeHtml(pick.game || "Event TBD")}</span></div>
      <p class="bet-market">${escapeHtml(pick.note)}</p>
      <div class="data-warning" title="${pick.stale ? "Stale data may no longer match the current sportsbook market." : "This application is using sample provider data."}">
        ${escapeHtml(pick.stale ? "Odds are stale — verify before using." : pick.dataQualityWarning || "Data-quality status unavailable.")}
      </div>
      <div class="card-actions">
        <button class="add-button" type="button" data-add="${escapeHtml(pick.id)}" ${actionable ? "" : "disabled"}>${actionable ? "Add to slip" : "Unavailable"}</button>
        <span class="tag">${escapeHtml(pick.competitorStatus)}</span>
      </div>
    </article>
  `;
  }).join("") : `<div class="answer-card">${escapeHtml(emptyMessage)}</div>`;

  const avg = list.length ? Math.round(list.reduce((sum, pick) => sum + pick.confidence, 0) / list.length) : 0;
  document.querySelector("#edgeCount").textContent = String(list.length);
  document.querySelector("#avgConfidence").textContent = `${avg}%`;
  document.querySelector("#riskLevel").textContent = list.length > 4 ? "Medium" : "Selective";
  renderAnswer(list);
  renderAnalystWorkflow();
}

function renderSlip() {
  elements.slipList.innerHTML = "";
  elements.slipList.classList.toggle("empty", state.slip.length === 0);
  if (!state.slip.length) {
    elements.slipList.textContent = "Add legs from the board.";
  } else {
    elements.slipList.innerHTML = state.slip.map((pick) => `
      <div class="slip-item${pick.id === state.selectedPickId ? " active" : ""}" data-pick-id="${escapeHtml(pick.id)}" tabindex="0" role="button">
        <strong>${escapeHtml(pick.name)} · ${escapeHtml(pick.marketDisplayName)}</strong>
        <span>${escapeHtml(pick.game || "Event TBD")} · ${pick.side ? `${escapeHtml(pick.side)} · ` : ""}${escapeHtml(pick.line)} · ${formatOdds(pick.odds)}</span>
        <small>${escapeHtml(pick.sportsbook)} · ${formatDateTime(pick.eventTime, "Time TBD")} · updated ${formatDateTime(pick.lastUpdatedAt)}</small>
        <small>${escapeHtml(pick.competitorStatus)} · ${pick.available ? "Open" : "Unavailable"} · ${escapeHtml(pick.period)} · ${escapeHtml(pick.settlementScope)}</small>
      </div>
    `).join("");
  }

  const decimalOdds = state.slip.map((pick) => americanToDecimal(pick.odds));
  const combinedDecimal = decimalOdds.some((odds) => odds === null) ? null : decimalOdds.reduce((product, odds) => product * odds, 1);
  const duplicateGames = new Set();
  const games = new Set();
  state.slip.forEach((pick) => {
    if (pick.game && games.has(pick.game)) duplicateGames.add(pick.game);
    if (pick.game) games.add(pick.game);
  });
  const correlationWarnings = [];
  for (let first = 0; first < state.slip.length; first += 1) {
    for (let second = first + 1; second < state.slip.length; second += 1) {
      const left = state.slip[first];
      const right = state.slip[second];
      if (!left.game || left.game !== right.game) continue;
      const leftGroup = getMarketDefinition(left.canonicalMarketId)?.correlationGroup || "";
      const rightGroup = getMarketDefinition(right.canonicalMarketId)?.correlationGroup || "";
      const related = leftGroup === rightGroup
        || /passing|receiving/.test(`${leftGroup} ${rightGroup}`)
        || /points|three-pointers|assists/.test(`${leftGroup} ${rightGroup}`)
        || /shots|scorer|corners/.test(`${leftGroup} ${rightGroup}`)
        || /fight-(finish|distance)/.test(`${leftGroup} ${rightGroup}`)
        || /winner|podium|top-5|top-10/.test(`${left.canonicalMarketId} ${right.canonicalMarketId}`);
      if (related) correlationWarnings.push(`${left.marketDisplayName} + ${right.marketDisplayName}`);
    }
  }
  const uniqueTeams = new Set(state.slip.map((pick) => pick.team).filter(Boolean));
  const broadUniqueParlay = state.slip.length >= 4 && uniqueTeams.size === state.slip.length && !duplicateGames.size;
  const risk = !state.slip.length ? "None" : duplicateGames.size ? "High" : broadUniqueParlay ? "Medium" : state.slip.length >= 4 ? "High" : state.slip.length >= 3 ? "Medium" : "Low";

  document.querySelector("#legCount").textContent = String(state.slip.length);
  elements.mobileLegCount.textContent = String(state.slip.length);
  document.querySelector("#combinedOdds").textContent = state.slip.length && combinedDecimal ? decimalToAmerican(combinedDecimal) : "+0";
  document.querySelector("#slipRisk").textContent = risk;
  document.querySelector("#riskBox").textContent = correlationWarnings.length
    ? `Correlation warning: ${correlationWarnings.join("; ")} share an event and related market drivers. Correlation can be positive or negative; verify the relationship.`
    : duplicateGames.size
    ? `Same-event warning: ${Array.from(duplicateGames).join(", ")} has multiple legs. No catalog relationship was confirmed, but check provider SGP rules.`
    : broadUniqueParlay
      ? "Multi-team parlay: legs come from different teams and games, reducing obvious correlation. Price and variance still matter."
      : "Combine independent edges first. Correlated legs can inflate payout while reducing true probability.";
  renderPlayerFact();
}

function renderPresentationDetails(details = []) {
  return details.map(([label, value]) => `
    <div class="presentation-detail">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? "Unavailable from sample provider")}</strong>
    </div>
  `).join("");
}

function renderMarketSupport(markets = []) {
  return markets.map((market) => `
    <span class="market-support${market.available ? " available" : ""}" aria-disabled="${!market.available}">
      ${escapeHtml(market.label)} · ${market.available ? "Available" : "Unavailable"}
    </span>
  `).join("");
}

function renderMarketSnapshot(selections = []) {
  if (!selections.length) {
    return `<div class="event-market-empty">No current sample prices for this event.</div>`;
  }
  return `
    <div class="event-market-snapshot" aria-label="Available event markets">
      ${selections.map((selection) => `
        <div class="event-market-row${selection.stale ? " stale" : ""}">
          <span>
            <strong>${escapeHtml(selection.name)}</strong>
            <small>${escapeHtml(selection.line)} · ${escapeHtml(selection.sportsbook)}</small>
          </span>
          <span class="event-market-action">
            <strong>${formatOdds(selection.odds)}</strong>
            <button class="event-add-button" type="button" data-event-add="${escapeHtml(selection.id)}" ${selection.stale ? "disabled" : ""}>
              ${selection.stale ? "Stale" : "Add"}
            </button>
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderFighter(fighter) {
  if (!fighter) return `<div class="fighter-panel unavailable">Fighter data unavailable</div>`;
  return `
    <div class="fighter-panel">
      <strong>${escapeHtml(fighter.name || "Fighter unavailable")}</strong>
      <span>${escapeHtml(fighter.record || "Record unavailable")} · ${escapeHtml(fighter.stance || "Stance unavailable")}</span>
      <span>Reach ${escapeHtml(fighter.reach ?? "Unavailable")} · Age ${escapeHtml(fighter.age ?? "Unavailable")}</span>
      <span>Layoff ${escapeHtml(fighter.layoff_days ?? "Unavailable")} · ${fighter.short_notice ? "Short notice" : "Standard notice"}</span>
      <span>${fighter.weight_miss ? "Weight miss flagged" : fighter.catchweight ? "Catchweight bout" : "No weight flag supplied"}</span>
    </div>
  `;
}

function renderBout(label, bout) {
  if (!bout) return `<section class="bout-panel"><h4>${escapeHtml(label)}</h4><p>Fight details unavailable.</p></section>`;
  return `
    <section class="bout-panel">
      <div class="bout-heading"><h4>${escapeHtml(label)}</h4><span>${escapeHtml(bout.weight_class || "Weight class unavailable")}</span></div>
      <div class="fighter-grid">${renderFighter(bout.fighter_a)}${renderFighter(bout.fighter_b)}</div>
    </section>
  `;
}

function renderEventPresentation(presentation) {
  const commonHeader = `
    <div class="presentation-header">
      <div><p class="eyebrow">${escapeHtml(presentation.sportName)} · ${escapeHtml(presentation.leagueName)}</p><h3>${escapeHtml(presentation.title)}</h3><p>${escapeHtml(presentation.subtitle)}</p></div>
      <div class="presentation-status"><strong>${escapeHtml(presentation.status)}</strong><span>${formatDateTime(presentation.startsAt, "Time unavailable")}</span><small>Updated ${formatDateTime(presentation.lastUpdatedAt)}</small></div>
    </div>
  `;
  const markets = `<div class="market-support-grid">${renderMarketSupport(presentation.markets)}</div>`;
  const marketSnapshot = renderMarketSnapshot(presentation.marketSnapshot);
  const warning = `<p class="presentation-warning">${escapeHtml(presentation.dataQualityWarning)}</p>`;

  if (presentation.kind === "fight-card") {
    const undercard = presentation.undercard.length
      ? `<details class="undercard-panel"><summary>Undercard · ${presentation.undercard.length} bout${presentation.undercard.length === 1 ? "" : "s"}</summary>${presentation.undercard.map((bout, index) => renderBout(`Bout ${index + 1}`, bout)).join("")}</details>`
      : `<div class="event-market-empty">Undercard unavailable from sample provider.</div>`;
    return `<article class="event-presentation fight-card-view">${commonHeader}${renderBout("Main event", presentation.mainEvent)}${renderBout("Co-main event", presentation.coMainEvent)}
      ${undercard}<div class="presentation-detail-grid">${renderPresentationDetails(presentation.details)}</div>${marketSnapshot}${markets}${warning}</article>`;
  }
  if (presentation.kind === "race-weekend") {
    const sessions = presentation.sessions.map(([name, status, results, startsAt]) => `
      <div class="race-session"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(status || "Status unavailable")}</span><small>${formatDateTime(startsAt, "Time unavailable")}</small><small>${escapeHtml(results || "Results unavailable")}</small></div>
    `).join("");
    const entrants = presentation.entrants.length ? `
      <div class="race-entrants">${presentation.entrants.map((entrant) => `
        <div><span>${escapeHtml(entrant.starting_position ?? "—")}</span><strong>${escapeHtml(entrant.name || "Driver unavailable")}</strong><small>${escapeHtml(entrant.manufacturer || "Manufacturer unavailable")}</small></div>
      `).join("")}</div>` : `<div class="event-market-empty">Starting grid unavailable from sample provider.</div>`;
    return `<article class="event-presentation race-weekend-view">${commonHeader}<div class="race-sessions">${sessions}</div>
      ${entrants}<div class="presentation-detail-grid">${renderPresentationDetails(presentation.details)}</div>${marketSnapshot}${markets}${warning}</article>`;
  }
  if (presentation.kind === "individual-event") {
    const competitors = presentation.participants.map((participant) => `
      <div class="competitor-row"><strong>${escapeHtml(participant.name)}</strong><span>${escapeHtml(participant.role)}</span></div>
    `).join("");
    return `<article class="event-presentation individual-event-view">${commonHeader}<div class="competitor-list">${competitors || "Competitors unavailable"}</div>
      <div class="presentation-detail-grid">${renderPresentationDetails(presentation.details)}</div>${marketSnapshot}${markets}${warning}</article>`;
  }

  const lineRows = `<div class="presentation-line-grid">${renderPresentationDetails(presentation.lines)}</div>`;
  return `<article class="event-presentation ${presentation.kind === "soccer-match" ? "soccer-match-view" : presentation.kind === "international-team-game" ? "international-event-view" : "team-game-view"}">${commonHeader}${lineRows}
    <div class="presentation-detail-grid">${renderPresentationDetails(presentation.details)}</div>${marketSnapshot}${markets}${warning}</article>`;
}

function renderMatchups() {
  const events = sportsRepository.getEvents(state.leagueId, { featuredOnly: true }).slice(0, 4);
  const league = currentLeague();
  const leagueMarkets = sportsRepository.getMarkets(state.leagueId);
  const presentations = events.map((event) =>
    createEventPresentation(event, league, leagueMarkets.filter((market) => market.eventId === event.id)),
  ).filter(Boolean);
  elements.matchupGrid.dataset.presentationKind = presentations[0]?.kind || "empty";
  elements.matchupGrid.innerHTML = presentations.length
    ? presentations.map(renderEventPresentation).join("")
    : `<div class="answer-card">No sample events are currently available for this league. Check Upcoming, Offseason, Futures, or All Sports in More.</div>`;
}

function renderTimestamp() {
  const metadata = sportsRepository.getMetadata();
  if (!metadata.generatedAt) {
    elements.timestamp.textContent = `${metadata.provider} · update time unavailable`;
    return;
  }
  const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(metadata.generatedAt));
  elements.timestamp.textContent = `${metadata.provider} · ${metadata.stale ? "stale since" : "updated"} ${time}`;
}

function renderDataStatus() {
  const metadata = sportsRepository.getMetadata();
  const state = metadata.offlineFallback
    ? "offline-fallback"
    : metadata.partial ? "partial"
      : metadata.stale ? "stale"
        : metadata.mode === "sample" ? "sample" : metadata.state;
  const labels = {
    sample: "Sample data",
    fresh: "Fresh",
    delayed: "Delayed",
    stale: "Stale",
    partial: "Partial",
    "offline-fallback": "Offline fallback",
    error: "Provider error",
  };
  const updated = formatDateTime(metadata.lastSuccessfulUpdateAt || metadata.generatedAt, "Update unavailable");
  elements.dataStatus.className = `data-status ${escapeHtml(state)}`;
  elements.dataStatus.innerHTML = `
    <span class="data-status-dot" aria-hidden="true"></span>
    <span><strong>${escapeHtml(labels[state] || state)}</strong><small>${escapeHtml(metadata.provider)} · ${escapeHtml(updated)}</small></span>
  `;
  elements.dataStatus.title = `${metadata.sources.length} source domain${metadata.sources.length === 1 ? "" : "s"} · ${metadata.errors.length} provider error${metadata.errors.length === 1 ? "" : "s"}${metadata.mode === "sample" ? " · no live provider configured" : ""}`;
  elements.modeBadge.textContent = metadata.mode === "sample" ? "Sample" : "Provider";
  elements.modeBadge.title = metadata.mode === "sample"
    ? "EdgeBoard is using sample data."
    : "A server-side provider is configured; verify the data-status indicator before use.";
}

function renderAll() {
  const league = currentLeague();
  const status = getLeagueStatusMetadata(league);
  elements.sportLabel.textContent = league ? `${league.leagueDisplayName} · ${status.label}` : "Unavailable";
  document.querySelector("#selectedLeagueContext").textContent = league
    ? `${league.sportDisplayName} · ${league.leagueDisplayName} · ${status.label}`
    : "League unavailable";
  const confidenceBand = getConfidenceBand(state.minConfidence);
  elements.confidenceRange.value = String(state.minConfidence);
  elements.confidenceValue.textContent = state.minConfidence === 0
    ? "0% · Filter off"
    : `${state.minConfidence}% · ${confidenceBand.label}`;
  elements.confidenceFilterStatus.textContent = state.minConfidence === 0 ? "all confidence levels" : "minimum signal";
  renderNavigation();
  renderMarketFilters();
  renderMarketBrowser();
  updateSportParlayPrompt();
  renderPicks();
  renderSlip();
  renderMatchups();
  renderTimestamp();
  renderDataStatus();
  renderTodayMarketBoard();
  if (elements.discoveryDrawer.classList.contains("open")) renderDiscovery();
}

function persistNavigationSelection() {
  try {
    localStorage.setItem("edgeboard-navigation-selection", JSON.stringify(state.navigationSelection));
    const url = new URL(window.location.href);
    url.searchParams.set("scope", serializeNavigationSelection(state.navigationSelection));
    history.replaceState(null, "", url);
  } catch {
    // Selection still works when storage or history is unavailable.
  }
}

function focusCurrentNavigationSelection() {
  const selection = state.navigationSelection;
  let target = null;
  if (selection.type === "league") {
    target = elements.sportTabs.querySelector(`[data-league="${selection.id}"]`);
  } else if (selection.type === "sport" && selection.id === "soccer") {
    target = elements.sportTabs.querySelector('[data-sport="soccer"]');
  } else if (selection.type === "system" && ["for-you", "live", "today"].includes(selection.id)) {
    target = elements.sportTabs.querySelector(`[data-nav-view="${selection.id}"]`);
  }
  (target || elements.sportTabs.querySelector('[data-nav-view="more"]'))?.focus({ preventScroll: true });
}

function activateNavigationSelection(selection, {
  closeMenu = true,
  restoreFocus = true,
  resetResearch = true,
} = {}) {
  const normalized = normalizeNavigationSelection(selection, navigationModel.allLeagues, defaultLeague?.leagueId);
  const previousSportId = currentLeague()?.sportId;
  const resolvedLeague = researchLeagueForSelection(normalized, state.leagueId);
  if (!resolvedLeague?.enabled) return;
  state.navigationSelection = normalized;
  state.leagueId = resolvedLeague.leagueId;
  persistNavigationSelection();
  const nextLeague = currentLeague();
  const savedCanonical = state.marketSelectionBySport[nextLeague.sportId] || "";
  const canonicalSupported = nextLeague.supportedCanonicalMarketIds.includes(savedCanonical);
  if (previousSportId !== nextLeague.sportId || !nextLeague.supportedCanonicalMarketIds.includes(state.canonicalMarketId)) {
    state.canonicalMarketId = canonicalSupported ? savedCanonical : "";
  }
  const availableGroups = sportsRepository.getMarkets(state.leagueId)
    .filter((market) => market.available)
    .map((market) => market.filterGroup);
  if (!availableGroups.includes(state.market) && availableGroups.length) {
    state.market = availableGroups.includes("props") ? "props" : availableGroups[0];
  }
  if (resetResearch) {
    state.query = "";
    state.queryGame = "";
    state.parlayNote = "";
    state.unsupportedMarketReason = "";
    state.interpretationNote = "";
    state.analystWorkflow = null;
  }
  state.selectedPickId = "";
  state.slip = state.slip.filter((pick) => pick.leagueId === state.leagueId);
  if (closeMenu) closeDiscovery();
  setMobileSlipOpen(false);
  state.marketBoardLoading = false;
  renderAll();
  if (restoreFocus) requestAnimationFrame(focusCurrentNavigationSelection);
}

elements.sportTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-league]");
  if (button) {
    activateNavigationSelection({ type: "league", id: button.dataset.league });
    return;
  }
  const sportButton = event.target.closest("[data-sport]");
  if (sportButton) {
    activateNavigationSelection({ type: "sport", id: sportButton.dataset.sport });
    return;
  }
  const viewButton = event.target.closest("[data-nav-view]");
  if (!viewButton) return;
  const view = viewButton.dataset.navView;
  if (["for-you", "live", "today"].includes(view)) {
    activateNavigationSelection({ type: "system", id: view });
  } else {
    openDiscovery("all");
  }
});

elements.discoveryFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-discovery-view]");
  if (!button) return;
  state.discoveryView = button.dataset.discoveryView;
  const selection = state.discoveryView === "all"
    ? { type: "system", id: "all" }
    : { type: "destination", id: state.discoveryView };
  activateNavigationSelection(selection, { closeMenu: false, restoreFocus: false });
  renderDiscovery();
});

elements.discoveryContent.addEventListener("click", (event) => {
  const button = event.target.closest("[data-league], [data-sport], [data-category]");
  if (!button) return;
  if (button.dataset.league) activateNavigationSelection({ type: "league", id: button.dataset.league });
  else if (button.dataset.sport) activateNavigationSelection({ type: "sport", id: button.dataset.sport });
  else activateNavigationSelection({ type: "category", id: button.dataset.category });
});

document.querySelectorAll("[data-open-discovery]").forEach((button) => {
  button.addEventListener("click", () => {
    activateNavigationSelection({ type: "system", id: "all" }, { closeMenu: false, restoreFocus: false });
    openDiscovery(button.dataset.openDiscovery || "all");
  });
});

elements.researchIntentNav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-intent]");
  if (!button) return;
  state.researchIntent = button.dataset.intent;
  if (state.researchIntent === "ai-research") {
    elements.queryInput.focus();
    document.querySelector(".hero").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  scheduleMarketBoardLoad();
});

elements.todayMarketGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-market-league]");
  if (!card) return;
  activateNavigationSelection({ type: "league", id: card.dataset.marketLeague }, { restoreFocus: false });
  document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("#closeDiscovery").addEventListener("click", () => closeDiscovery({ restoreFocus: true }));
elements.discoveryBackdrop.addEventListener("click", () => closeDiscovery({ restoreFocus: true }));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDiscovery({ restoreFocus: true });
    setMobileSlipOpen(false);
  }
});

elements.marketFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-market]");
  if (!button || button.disabled) return;
  state.market = button.dataset.market;
  state.canonicalMarketId = "";
  state.unsupportedMarketReason = "";
  state.interpretationNote = "";
  state.query = "";
  state.queryGame = "";
  state.parlayNote = "";
  state.selectedPickId = "";
  renderAll();
});

elements.confidenceRange.addEventListener("input", (event) => {
  state.minConfidence = Math.min(100, Math.max(0, Number(event.target.value) || 0));
  persistMinimumConfidence();
  renderAll();
});

elements.marketSearch.addEventListener("input", (event) => {
  state.marketSearch = event.target.value;
  renderMarketBrowser();
});

elements.marketCategoryNav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-market-category]");
  if (!button) return;
  const sportId = currentLeague()?.sportId;
  if (sportId) state.marketCategoryBySport[sportId] = button.dataset.marketCategory;
  renderMarketBrowser();
});

elements.marketCatalogList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-canonical-market]");
  if (!button || button.disabled) return;
  const definition = getMarketDefinition(button.dataset.canonicalMarket);
  if (!definition) return;
  state.canonicalMarketId = definition.id;
  state.market = definition.filterGroup;
  state.unsupportedMarketReason = "";
  state.interpretationNote = "";
  const sportId = currentLeague()?.sportId;
  if (sportId) state.marketSelectionBySport[sportId] = definition.id;
  state.query = "";
  state.queryGame = "";
  state.parlayNote = "";
  renderAll();
});

elements.availableToggle.addEventListener("change", (event) => {
  state.availableOnly = event.target.checked;
  renderAll();
});

elements.correlationToggle.addEventListener("change", (event) => {
  state.flagCorrelation = event.target.checked;
  document.querySelector("#riskBox").style.borderColor = event.target.checked ? "var(--coral)" : "var(--gold)";
  renderSlip();
});

elements.betGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  if (!addButton) return;
  const pick = renderedPicks.get(addButton.dataset.add);
  if (!pick?.available || pick.stale || state.slip.some((item) => item.id === pick.id)) return;
  state.slip.push(pick);
  state.selectedPickId = pick.id;
  renderSlip();
});

elements.matchupGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-event-add]");
  if (!addButton) return;
  const pick = getPickBySelectionId(sportsRepository, state.leagueId, addButton.dataset.eventAdd);
  if (!pick?.available || pick.stale || state.slip.some((item) => item.id === pick.id)) return;
  state.slip.push(pick);
  state.selectedPickId = pick.id;
  renderSlip();
  addButton.textContent = "Added";
  addButton.disabled = true;
});

document.querySelector("#clearSlip").addEventListener("click", () => {
  state.slip = [];
  state.selectedPickId = "";
  renderSlip();
});

function setMobileSlipOpen(open) {
  elements.betSlip.classList.toggle("mobile-open", open);
  elements.mobileSlipToggle.setAttribute("aria-expanded", String(open));
}

elements.mobileSlipToggle.addEventListener("click", () => {
  setMobileSlipOpen(!elements.betSlip.classList.contains("mobile-open"));
});
document.querySelector("#closeMobileSlip").addEventListener("click", () => setMobileSlipOpen(false));

function selectSlipItem(event) {
  const item = event.target.closest("[data-pick-id]");
  if (!item) return;
  state.selectedPickId = item.dataset.pickId;
  renderSlip();
}

elements.slipList.addEventListener("click", selectSlipItem);
elements.slipList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  selectSlipItem(event);
});

document.querySelector("#queryForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = elements.queryInput.value.trim();
  const parsed = parseResearchQuery(query, sportsRepository, state.leagueId, state.market);
  const priorSportId = currentLeague()?.sportId;
  const priorCanonicalMarketId = state.canonicalMarketId;
  state.query = query;
  state.parlayNote = "";
  const parsedLeague = sportsRepository.getLeague(parsed.leagueId);
  if (parsedLeague?.enabled) {
    state.navigationSelection = normalizeNavigationSelection(
      { type: "league", id: parsedLeague.leagueId },
      navigationModel.allLeagues,
      defaultLeague?.leagueId,
    );
    state.leagueId = parsedLeague.leagueId;
    persistNavigationSelection();
  }
  state.market = parsed.market;
  const nextLeague = currentLeague();
  const mayPreserveCanonical = priorSportId === nextLeague?.sportId
    && nextLeague?.supportedCanonicalMarketIds.includes(priorCanonicalMarketId);
  state.canonicalMarketId = parsed.canonicalMarketId || (mayPreserveCanonical ? priorCanonicalMarketId : "");
  state.unsupportedMarketReason = parsed.unsupportedReason;
  state.interpretationNote = parsed.interpretationNote;
  if (parsed.constraints.minimumConfidence !== null) {
    state.minConfidence = parsed.constraints.minimumConfidence;
    persistMinimumConfidence();
  }
  const parsedSportId = currentLeague()?.sportId;
  if (parsedSportId && parsed.canonicalMarketId) state.marketSelectionBySport[parsedSportId] = parsed.canonicalMarketId;
  state.queryGame = parsed.gameId;
  state.analystWorkflow = runAnalystWorkflow(sportsRepository, query, {
    currentLeagueId: state.leagueId,
    currentMarket: state.market,
    currentCanonicalMarketId: state.canonicalMarketId,
    minimumConfidence: state.minConfidence,
  });
  const parlay = buildParlay(sportsRepository, query, { leagueId: state.leagueId, minConfidence: state.minConfidence });
  state.queryGame = parlay.gameId || state.queryGame;
  state.parlayNote = parlay.note;
  if (parlay.legs.length) {
    state.slip = parlay.legs;
    state.selectedPickId = parlay.legs[0].id;
    state.market = "props";
    state.canonicalMarketId = "";
    state.unsupportedMarketReason = "";
    state.interpretationNote = "";
  }
  renderAll();
  elements.answerCard.classList.remove("analyzed");
  requestAnimationFrame(() => elements.answerCard.classList.add("analyzed"));
  document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector(".quick-prompts").addEventListener("click", (event) => {
  const button = event.target.closest("[data-query]");
  if (!button) return;
  elements.queryInput.value = button.dataset.query;
  document.querySelector("#queryForm").requestSubmit();
});

function setTheme(theme) {
  const safeTheme = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = safeTheme;
  try {
    localStorage.setItem("edgeboard-theme", safeTheme);
  } catch {
    // Theme still works when storage is unavailable.
  }
  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeOption === safeTheme);
    button.setAttribute("aria-pressed", String(button.dataset.themeOption === safeTheme));
  });
}

document.querySelectorAll("[data-theme-option]").forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.themeOption));
});

let savedTheme = "dark";
try {
  savedTheme = localStorage.getItem("edgeboard-theme") || "dark";
} catch {
  savedTheme = "dark";
}
setTheme(savedTheme);
persistNavigationSelection();
renderAll();
scheduleMarketBoardLoad();
