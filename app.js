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
import { createStatsRepository } from "./src/services/stats-provider.js";
import { parseStatisticalQuery } from "./src/services/stats-query-service.js";
import { buildStatsResult } from "./src/services/stats-results-service.js";
import {
  getResearchSuggestions,
  normalizeResearchMode,
  RESEARCH_MODES,
} from "./src/services/research-mode-service.js";
import { createAthleteProfileRepository } from "./src/services/athlete-profile-service.js";
import { createInsightService } from "./src/services/insight-service.js";
import { createResearchPlan } from "./src/services/research-planner-service.js";
import { buildResearchAnswer } from "./src/services/research-answer-service.js";
import { createEntityRegistry } from "./src/services/entity-registry-service.js";
import { createEntityProfileRepository } from "./src/services/entity-profile-service.js";
import {
  advancedResultToCsv,
  advancedResultSummaryToText,
  advancedResultToText,
} from "./src/services/advanced-stats-results-service.js";

const providerPayload = await loadProviderPayload();
const sportsRepository = createSportsRepository(providerPayload);
const statsRepository = createStatsRepository();
const insightService = createInsightService(statsRepository, sportsRepository);
const athleteProfileRepository = createAthleteProfileRepository(statsRepository, sportsRepository, insightService);
const entityRegistry = createEntityRegistry();
const entityProfileRepository = createEntityProfileRepository(
  entityRegistry,
  sportsRepository,
  statsRepository,
  insightService,
);
let visualizationModulesPromise = null;
let visualizationRepository = null;
let visualizationServiceModule = null;
let visualizationRenderer = null;
function loadVisualizationModules() {
  if (!visualizationModulesPromise) {
    visualizationModulesPromise = Promise.all([
      import("./src/services/visualization-service.js"),
      import("./src/services/visual-query-service.js"),
      import("./src/components/visualization-renderer.js"),
    ]).then(([service, query, renderer]) => {
      visualizationRepository ||= service.createVisualizationRepository();
      visualizationServiceModule = service;
      visualizationRenderer = renderer;
      return { service, query, renderer };
    });
  }
  return visualizationModulesPromise;
}
let workspaceModulesPromise = null;
let workspaceRepository = null;
let workspaceServiceModule = null;
let workspaceRenderer = null;
let workspaceExternalUnsubscribe = null;
function loadWorkspaceModules() {
  if (!workspaceModulesPromise) {
    workspaceModulesPromise = Promise.all([
      import("./src/services/workspace-service.js"),
      import("./src/components/workspace-renderer.js"),
    ]).then(async ([service, renderer]) => {
      workspaceRepository ||= service.createWorkspaceRepository({
        seedSample: providerPayload?.provider_status?.mode === "sample",
      });
      workspaceServiceModule = service;
      workspaceRenderer = renderer;
      await workspaceRepository.initialize();
      return { service, renderer, repository: workspaceRepository };
    });
  }
  return workspaceModulesPromise;
}
function recordWorkspaceActivity(action, targetType, targetId, label, queryText = "") {
  loadWorkspaceModules().then(({ repository }) => {
    const workspace = repository.listWorkspaces()[0];
    if (!workspace) return null;
    return repository.appendActivity({
      workspaceId: workspace.id,
      action,
      targetType,
      targetId,
      label,
      queryText,
      route: `${window.location.pathname}${window.location.search}`,
    });
  }).catch(() => {});
}
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

function loadResearchState() {
  const params = new URLSearchParams(window.location.search);
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem("edgeboard-research-state") || "{}");
  } catch {
    saved = {};
  }
  const queryFromUrl = params.get("q");
  return {
    mode: normalizeResearchMode(params.get("mode") || saved.mode, "betting"),
    queryText: queryFromUrl === null ? String(saved.queryText || "") : queryFromUrl,
    selectedEntityId: String(params.get("entity") || saved.selectedEntityId || ""),
    resultTab: ["summary", "game-log"].includes(params.get("resultTab") || saved.resultTab)
      ? params.get("resultTab") || saved.resultTab
      : "summary",
    profileAthleteId: String(params.get("player") || ""),
    entityProfileId: String(params.get("entityProfile") || ""),
    visualType: String(params.get("visual") || ""),
    visualEntityId: String(params.get("visualEntity") || ""),
    visualSportId: String(params.get("visualSport") || ""),
    visualLeagueId: String(params.get("visualLeague") || ""),
    visualWindow: params.get("visualWindow") === "season" ? "season"
      : Math.max(1, Number(params.get("visualWindow")) || 10),
    visualThreshold: params.get("visualThreshold") === null ? null : Number(params.get("visualThreshold")),
    visualSeries: String(params.get("visualSeries") || "").split(",").filter(Boolean),
    profileTab: String(params.get("tab") || "overview"),
    advancedDisplay: ["cards", "table", "trend", "overlay"].includes(params.get("display"))
      ? params.get("display") : "table",
    advancedSort: String(params.get("sort") || ""),
    advancedSortDirection: params.get("direction") === "asc" ? "asc" : "desc",
    insightId: String(params.get("insight") || ""),
  };
}

function loadInsightState() {
  try {
    const saved = JSON.parse(localStorage.getItem("edgeboard-insight-state") || "{}");
    return {
      savedInsights: Array.isArray(saved.savedInsights) ? saved.savedInsights : [],
      dismissedInsightIds: Array.isArray(saved.dismissedInsightIds) ? saved.dismissedInsightIds : [],
      followedEntityIds: Array.isArray(saved.followedEntityIds) ? saved.followedEntityIds : [],
      followedInsightRefs: Array.isArray(saved.followedInsightRefs) ? saved.followedInsightRefs : [],
    };
  } catch {
    return { savedInsights: [], dismissedInsightIds: [], followedEntityIds: [], followedInsightRefs: [] };
  }
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
const initialResearchState = loadResearchState();
const initialInsightState = loadInsightState();
const initialWorkspaceParams = new URLSearchParams(window.location.search);
const initialWorkspaceRoute = initialWorkspaceParams.has("workspace") ? {
  workspaceId: initialWorkspaceParams.get("workspace") || "workspace-local-default",
  view: initialWorkspaceParams.get("saved") ? "item"
    : initialWorkspaceParams.get("board") ? "board"
      : initialWorkspaceParams.get("workspaceView") || "home",
  boardId: initialWorkspaceParams.get("board") || "",
  itemId: initialWorkspaceParams.get("saved") || "",
  watchlistId: initialWorkspaceParams.get("watchlist") || "",
  query: "",
} : null;

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
  researchPlan: null,
  researchAnswer: null,
  researchMode: initialResearchState.mode,
  statsResult: null,
  statsParsedQuery: null,
  statsLoading: false,
  selectedEntityId: initialResearchState.selectedEntityId,
  statsResultTab: initialResearchState.resultTab,
  statsContextOverrideDisabled: false,
  showBettingResearch: initialResearchState.mode === "betting",
  profileAthleteId: initialResearchState.profileAthleteId,
  profileTab: initialResearchState.profileTab,
  profileViewModel: null,
  profileLoading: false,
  entityProfileId: initialResearchState.entityProfileId,
  entityProfileViewModel: null,
  entityProfileLoading: false,
  visualRequest: initialResearchState.visualType ? {
    visualizationType: initialResearchState.visualType,
    sportId: initialResearchState.visualSportId,
    leagueId: initialResearchState.visualLeagueId,
    entityType: entityRegistry.getEntity(initialResearchState.visualEntityId)?.type || "athlete",
    entityIds: initialResearchState.visualEntityId ? [initialResearchState.visualEntityId] : [],
    eventIds: [],
    statIds: [],
    dateRange: { type: initialResearchState.visualWindow === "season" ? "season" : "last_n_games", value: initialResearchState.visualWindow },
    filters: {
      threshold: Number.isFinite(initialResearchState.visualThreshold) ? initialResearchState.visualThreshold : null,
      seriesIds: initialResearchState.visualSeries,
    },
  } : null,
  visualResult: null,
  visualAvailable: [],
  visualLoading: false,
  profileLogWindow: 10,
  profileLogSort: "newest",
  profileHomeAway: "all",
  profileOpponent: "",
  profileResult: "all",
  profileVisibleColumns: [],
  profileSplitDimension: "",
  profileTrendStatId: "",
  profileTrendWindow: 10,
  profileTrendThreshold: "",
  profilePropGroup: "all",
  profileSportsbook: "all",
  profileInsightCategory: "recent",
  athleteSearchResults: [],
  athleteSearchIndex: -1,
  advancedDisplay: initialResearchState.advancedDisplay,
  advancedSort: initialResearchState.advancedSort,
  advancedSortDirection: initialResearchState.advancedSortDirection,
  restoringResearchFromUrl: Boolean(initialResearchState.queryText),
  savedInsights: initialInsightState.savedInsights,
  dismissedInsightIds: initialInsightState.dismissedInsightIds,
  followedEntityIds: initialInsightState.followedEntityIds,
  followedInsightRefs: initialInsightState.followedInsightRefs,
  activeInsightId: "",
  sharedInsightId: initialResearchState.insightId,
  sharedInsightOpened: false,
  workspaceActive: Boolean(initialWorkspaceRoute),
  workspaceRoute: initialWorkspaceRoute,
  workspaceViewModel: null,
  workspaceLoading: Boolean(initialWorkspaceRoute),
  workspaceCandidate: null,
  workspaceDuplicate: null,
  workspaceStatus: "",
  workspacePendingImport: "",
  workspaceShareSnapshot: null,
};
let insightReturnFocus = null;

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
  queryFeedback: document.querySelector("#queryFeedback"),
  researchModeControl: document.querySelector("#researchModeControl"),
  quickPrompts: document.querySelector(".quick-prompts"),
  answerCard: document.querySelector(".answer-card"),
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
  researchAnswer: document.querySelector("#researchAnswer"),
  researchAnswerContent: document.querySelector("#researchAnswerContent"),
  dataStatus: document.querySelector("#dataStatus"),
  dataStatusDialog: document.querySelector("#dataStatusDialog"),
  dataStatusDetails: document.querySelector("#dataStatusDetails"),
  closeDataStatusDialog: document.querySelector("#closeDataStatusDialog"),
  modeBadge: document.querySelector("#modeBadge"),
  statsResults: document.querySelector("#statsResults"),
  statsLoading: document.querySelector("#statsLoading"),
  statsInterpretation: document.querySelector("#statsInterpretation"),
  statsResultContent: document.querySelector("#statsResultContent"),
  bettingFilters: document.querySelector("#bettingFilters"),
  researchResults: document.querySelector("#researchResults"),
  bettingEventBoard: document.querySelector("#bettingEventBoard"),
  athleteSearchResults: document.querySelector("#athleteSearchResults"),
  visualAnalyticsView: document.querySelector("#visualAnalyticsView"),
  visualAnalyticsLoading: document.querySelector("#visualAnalyticsLoading"),
  visualAnalyticsContent: document.querySelector("#visualAnalyticsContent"),
  closeVisualAnalytics: document.querySelector("#closeVisualAnalytics"),
  shareVisualAnalytics: document.querySelector("#shareVisualAnalytics"),
  visualSlipToggle: document.querySelector("#visualSlipToggle"),
  visualSlipCount: document.querySelector("#visualSlipCount"),
  visualSlipPanel: document.querySelector("#visualSlipPanel"),
  visualSlipList: document.querySelector("#visualSlipList"),
  entityProfileView: document.querySelector("#entityProfileView"),
  entityProfileLoading: document.querySelector("#entityProfileLoading"),
  entityProfileNotFound: document.querySelector("#entityProfileNotFound"),
  entityProfileContent: document.querySelector("#entityProfileContent"),
  closeEntityProfile: document.querySelector("#closeEntityProfile"),
  shareEntityProfile: document.querySelector("#shareEntityProfile"),
  followEntity: document.querySelector("#followEntity"),
  entityProfileSlipToggle: document.querySelector("#entityProfileSlipToggle"),
  entityProfileSlipCount: document.querySelector("#entityProfileSlipCount"),
  entityProfileSlipPanel: document.querySelector("#entityProfileSlipPanel"),
  entityProfileSlipList: document.querySelector("#entityProfileSlipList"),
  athleteProfileView: document.querySelector("#athleteProfileView"),
  athleteProfileLoading: document.querySelector("#athleteProfileLoading"),
  athleteProfileNotFound: document.querySelector("#athleteProfileNotFound"),
  athleteProfileContent: document.querySelector("#athleteProfileContent"),
  closeAthleteProfile: document.querySelector("#closeAthleteProfile"),
  shareAthleteProfile: document.querySelector("#shareAthleteProfile"),
  followAthlete: document.querySelector("#followAthlete"),
  profileSlipToggle: document.querySelector("#profileSlipToggle"),
  profileSlipCount: document.querySelector("#profileSlipCount"),
  profileSlipPanel: document.querySelector("#profileSlipPanel"),
  profileSlipList: document.querySelector("#profileSlipList"),
  insightDiscovery: document.querySelector("#insightDiscovery"),
  insightDiscoverySummary: document.querySelector("#insightDiscoverySummary"),
  insightDiscoveryGrid: document.querySelector("#insightDiscoveryGrid"),
  insightDialog: document.querySelector("#insightDialog"),
  insightDialogContent: document.querySelector("#insightDialogContent"),
  closeInsightDialog: document.querySelector("#closeInsightDialog"),
  openWorkspace: document.querySelector("#openWorkspace"),
  workspaceSavedCount: document.querySelector("#workspaceSavedCount"),
  workspaceAlertCount: document.querySelector("#workspaceAlertCount"),
  saveCurrentResearch: document.querySelector("#saveCurrentResearch"),
  saveVisualAnalytics: document.querySelector("#saveVisualAnalytics"),
  saveEntityProfile: document.querySelector("#saveEntityProfile"),
  saveAthleteProfile: document.querySelector("#saveAthleteProfile"),
  trackResearchSlip: document.querySelector("#trackResearchSlip"),
  personalWorkspaceView: document.querySelector("#personalWorkspaceView"),
  workspaceLoading: document.querySelector("#workspaceLoading"),
  workspaceContent: document.querySelector("#workspaceContent"),
  workspaceStatus: document.querySelector("#workspaceActionStatus"),
  workspaceSaveDialog: document.querySelector("#workspaceSaveDialog"),
  workspaceSaveDialogContent: document.querySelector("#workspaceSaveDialogContent"),
  workspaceEditDialog: document.querySelector("#workspaceEditDialog"),
  workspaceEditForm: document.querySelector("#workspaceEditForm"),
  workspaceConfirmDialog: document.querySelector("#workspaceConfirmDialog"),
  workspaceConfirmForm: document.querySelector("#workspaceConfirmForm"),
  workspaceConfirmMessage: document.querySelector("#workspaceConfirmMessage"),
  workspaceConfirmTextLabel: document.querySelector("#workspaceConfirmTextLabel"),
  workspaceShareDialog: document.querySelector("#workspaceShareDialog"),
  workspaceSharePreview: document.querySelector("#workspaceSharePreview"),
};

let renderedPicks = new Map();
let marketBoardLoadTimer = 0;
let discoveryReturnFocus = null;
let statsRequestSequence = 0;
let profileRequestSequence = 0;
let entityProfileRequestSequence = 0;
let entityProfileAbortController = null;
let visualRequestSequence = 0;
let visualAbortController = null;
let visualReturnFocus = null;

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
  const league = currentLeague();
  const suggestions = getResearchSuggestions(state.researchMode, {
    sportId: league?.sportId || "",
    leagueId: league?.leagueId || "",
  });
  elements.quickPrompts.innerHTML = suggestions.map((query) => `
    <button type="button" data-query="${escapeHtml(query)}">${escapeHtml(query.length > 48 ? `${query.slice(0, 45)}…` : query)}</button>
  `).join("");
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
  const athleteId = profileIdForPick(selectedPick);
  elements.playerFact.innerHTML = `
    <p class="eyebrow">Edge note</p>
    <h3>${athleteId ? `<a href="${escapeHtml(profileUrl(athleteId))}" data-open-athlete="${escapeHtml(athleteId)}">${escapeHtml(selectedPick.name)}</a>` : escapeHtml(selectedPick.name)}</h3>
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
    const athleteId = profileIdForPick(pick);
    return `
    <article class="bet-card${cardState}">
      <div class="bet-top">
        <div>
          <p class="bet-title">${athleteId ? `<a href="${escapeHtml(profileUrl(athleteId))}" data-open-athlete="${escapeHtml(athleteId)}">${escapeHtml(pick.name)}</a>` : escapeHtml(pick.name)}</p>
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
        ${athleteId ? `<a class="text-button" href="${escapeHtml(profileUrl(athleteId))}" data-open-athlete="${escapeHtml(athleteId)}">View profile</a>` : ""}
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
  elements.profileSlipCount.textContent = String(state.slip.length);
  elements.entityProfileSlipCount.textContent = String(state.slip.length);
  elements.visualSlipCount.textContent = String(state.slip.length);
  elements.profileSlipList.classList.toggle("empty", state.slip.length === 0);
  elements.profileSlipList.innerHTML = state.slip.length ? state.slip.map((pick) => `
    <div class="slip-item">
      <strong>${escapeHtml(pick.name)} · ${escapeHtml(pick.marketDisplayName)}</strong>
      <span>${escapeHtml(pick.line)} · ${formatOdds(pick.odds)}</span>
      <small>${escapeHtml(pick.sportsbook)} · ${escapeHtml(pick.period)} · ${escapeHtml(pick.settlementScope)}</small>
    </div>
  `).join("") : "Add legs from a provider-confirmed profile market.";
  elements.entityProfileSlipList.classList.toggle("empty", state.slip.length === 0);
  elements.entityProfileSlipList.innerHTML = state.slip.length ? state.slip.map((pick) => `
    <div class="slip-item">
      <strong>${escapeHtml(pick.name)} · ${escapeHtml(pick.marketDisplayName)}</strong>
      <span>${escapeHtml(pick.line)} · ${formatOdds(pick.odds)}</span>
      <small>${escapeHtml(pick.sportsbook)} · ${escapeHtml(pick.period)} · ${escapeHtml(pick.settlementScope)}</small>
    </div>
  `).join("") : "Add legs from a provider-confirmed entity market.";
  elements.visualSlipList.classList.toggle("empty", state.slip.length === 0);
  elements.visualSlipList.innerHTML = state.slip.length ? state.slip.map((pick) => `
    <div class="slip-item">
      <strong>${escapeHtml(pick.name)} · ${escapeHtml(pick.marketDisplayName)}</strong>
      <span>${escapeHtml(pick.line)} · ${formatOdds(pick.odds)}</span>
      <small>${escapeHtml(pick.sportsbook)} · ${escapeHtml(pick.period)} · ${escapeHtml(pick.settlementScope)}</small>
    </div>
  `).join("") : "Add legs from provider-confirmed markets.";
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
    : metadata.mode === "sample" ? "sample"
      : metadata.partial ? "partial"
      : metadata.stale ? "stale"
        : metadata.state;
  const labels = {
    sample: "Sample data",
    fresh: "Fresh",
    delayed: "Delayed",
    stale: "Stale",
    partial: "Partial",
    unavailable: "Unavailable",
    expired: "Expired",
    "offline-fallback": "Offline fallback",
    error: "Provider error",
  };
  const updated = formatDateTime(metadata.lastSuccessfulUpdateAt || metadata.generatedAt, "Update unavailable");
  elements.dataStatus.className = `data-status ${escapeHtml(state)}`;
  elements.dataStatus.innerHTML = `
    <span class="data-status-dot" aria-hidden="true"></span>
    <span><strong>${escapeHtml(labels[state] || state)}</strong><small>${escapeHtml(metadata.provider)} · ${escapeHtml(updated)}</small></span>
  `;
  elements.dataStatus.title = `${metadata.sources.length} source domain${metadata.sources.length === 1 ? "" : "s"} · ${metadata.errors.length} provider error${metadata.errors.length === 1 ? "" : "s"}${metadata.sample ? " · no live provider configured" : ""}`;
  const sourceRows = metadata.sources.length
    ? metadata.sources.map((source) => `<tr><td>${escapeHtml(source.domain || "Unknown")}</td><td>${escapeHtml(source.provider || metadata.provider)}</td><td>${escapeHtml(source.state || "unknown")}</td><td>${escapeHtml(source.cache || "unknown")}</td><td>${escapeHtml(formatDateTime(source.updated_at, "Unavailable"))}</td></tr>`).join("")
    : '<tr><td colspan="5">No provider-domain detail is available.</td></tr>';
  elements.dataStatusDetails.innerHTML = `
    <dl class="workspace-detail-list">
      <div><dt>Provider</dt><dd>${escapeHtml(metadata.provider)}</dd></div>
      <div><dt>Mode</dt><dd>${escapeHtml(metadata.mode)}</dd></div>
      <div><dt>EdgeBoard retrieval</dt><dd>${escapeHtml(formatDateTime(metadata.retrievedAt, "Unavailable"))}</dd></div>
      <div><dt>Last successful update</dt><dd>${escapeHtml(updated)}</dd></div>
    </dl>
    <p>${metadata.sample ? "Recorded or generated sample data; no live provider is claimed." : "Server-side provider data. Freshness and attribution remain visible below."}</p>
    <div class="table-scroll"><table><thead><tr><th>Domain</th><th>Source</th><th>Freshness</th><th>Cache</th><th>Provider timestamp</th></tr></thead><tbody>${sourceRows}</tbody></table></div>
    ${metadata.errors.length ? `<div class="data-warning"><strong>${metadata.errors.length} provider warning${metadata.errors.length === 1 ? "" : "s"}</strong><p>${metadata.errors.map((error) => escapeHtml(error.code || error.message || "Provider warning")).join(" · ")}</p></div>` : ""}
  `;
  elements.modeBadge.textContent = metadata.mode === "sample" ? "Sample"
    : metadata.mode === "offline" ? "Offline"
      : metadata.mode === "degraded" ? "Degraded"
        : metadata.mode === "hybrid" ? "Hybrid"
          : "Provider";
  elements.modeBadge.title = metadata.sample
    ? `EdgeBoard is using clearly labeled sample data in ${metadata.mode} mode.`
    : metadata.mode === "offline"
      ? "EdgeBoard is offline; saved local data remains available where possible."
      : metadata.mode === "degraded"
        ? "One or more providers are degraded; inspect freshness and fallback details."
        : "A server-side provider is configured; verify the data-status indicator before use.";
}

elements.dataStatus.addEventListener("click", () => {
  elements.dataStatusDialog.showModal();
  elements.closeDataStatusDialog.focus();
});
elements.closeDataStatusDialog.addEventListener("click", () => {
  elements.dataStatusDialog.close();
  elements.dataStatus.focus();
});

function persistResearchState({ updateUrl = true, historyMode = "replace" } = {}) {
  const queryText = elements.queryInput.value.trim();
  const persisted = {
    mode: state.researchMode,
    queryText,
    parsedFilters: state.statsParsedQuery?.structuredQuery || null,
    selectedEntityId: state.selectedEntityId,
    resultTab: state.statsResultTab,
    leagueId: state.leagueId,
  };
  try {
    localStorage.setItem("edgeboard-research-state", JSON.stringify(persisted));
    if (!updateUrl) return;
    const url = new URL(window.location.href);
    url.searchParams.set("mode", state.researchMode);
    if (queryText) url.searchParams.set("q", queryText);
    else url.searchParams.delete("q");
    if (state.selectedEntityId) url.searchParams.set("entity", state.selectedEntityId);
    else url.searchParams.delete("entity");
    url.searchParams.set("resultTab", state.statsResultTab);
    url.searchParams.set("display", state.advancedDisplay);
    if (state.advancedSort) url.searchParams.set("sort", state.advancedSort);
    else url.searchParams.delete("sort");
    url.searchParams.set("direction", state.advancedSortDirection);
    const method = historyMode === "push" ? "pushState" : "replaceState";
    history[method]({ edgeboardResearch: true, queryText }, "", url);
  } catch {
    // Research remains usable when storage or history is unavailable.
  }
}

function renderAthleteMedia(media, { large = false } = {}) {
  if (!media) return "";
  const candidates = media.candidates || (media.imageUrl ? [{ type: media.imageType, url: media.imageUrl }] : []);
  const encodedCandidates = encodeURIComponent(JSON.stringify(candidates));
  const fallback = `<span class="athlete-media-fallback" role="img" aria-label="${escapeHtml(media.altText)}" ${candidates.length ? "hidden" : ""}>${escapeHtml(media.fallbackInitials)}</span>`;
  return `
    <div class="athlete-media${large ? " profile-media" : ""}" data-media-type="${escapeHtml(media.imageType)}">
      ${candidates.length ? `<img src="${escapeHtml(candidates[0].url)}" alt="${escapeHtml(media.altText)}" data-athlete-image data-media-index="0" data-media-candidates="${escapeHtml(encodedCandidates)}" />` : ""}
      ${fallback}
    </div>
  `;
}

function profileUrl(athleteId, tab = "overview") {
  const url = new URL(window.location.href);
  url.searchParams.set("player", athleteId);
  url.searchParams.set("tab", tab);
  url.searchParams.delete("entityProfile");
  return `${url.pathname}${url.search}${url.hash}`;
}

function entityProfileUrl(entityId) {
  const url = new URL(window.location.href);
  url.searchParams.set("entityProfile", entityId);
  url.searchParams.delete("player");
  url.searchParams.delete("tab");
  return `${url.pathname}${url.search}${url.hash}`;
}

function defaultVisualizationType(entity) {
  if (!entity) return "line_chart";
  if (entity.type === "fighter" || entity.type === "boxer") return "strike_map";
  if (entity.type === "driver" || entity.type === "constructor") return "race_position_chart";
  if (entity.type === "golfer") return "golf_scoring_chart";
  if (entity.type === "tennis-player") return "serve_placement_map";
  if (entity.sportId === "baseball") return entity.entityType === "team" ? "stacked_bar_chart" : "spray_chart";
  if (entity.sportId === "ice-hockey") return "shot_map";
  if (entity.sportId === "soccer") return "shot_map";
  if (entity.sportId === "basketball") return entity.entityType === "team" ? "zone_map" : "line_chart";
  return "line_chart";
}

function visualAnalyticsUrl(request) {
  const url = new URL(window.location.href);
  url.searchParams.delete("player");
  url.searchParams.delete("tab");
  url.searchParams.delete("entityProfile");
  url.searchParams.set("visual", request.visualizationType);
  const entityId = request.entityIds?.[0] || "";
  if (entityId) url.searchParams.set("visualEntity", entityId);
  else url.searchParams.delete("visualEntity");
  if (request.sportId) url.searchParams.set("visualSport", request.sportId);
  else url.searchParams.delete("visualSport");
  if (request.leagueId) url.searchParams.set("visualLeague", request.leagueId);
  else url.searchParams.delete("visualLeague");
  const windowValue = request.dateRange?.type === "season" ? "season" : request.dateRange?.value || 10;
  url.searchParams.set("visualWindow", windowValue);
  if (Number.isFinite(request.filters?.threshold)) url.searchParams.set("visualThreshold", request.filters.threshold);
  else url.searchParams.delete("visualThreshold");
  if (request.filters?.seriesIds?.length) url.searchParams.set("visualSeries", request.filters.seriesIds.join(","));
  else url.searchParams.delete("visualSeries");
  return `${url.pathname}${url.search}${url.hash}`;
}

function researchResultUrl(queryText) {
  const url = new URL(window.location.href);
  url.searchParams.delete("player");
  url.searchParams.delete("tab");
  url.searchParams.set("mode", "stats");
  url.searchParams.set("q", queryText);
  return `${url.pathname}${url.search}${url.hash}`;
}

function supportingEventLink(eventId, label) {
  if (!eventId) return escapeHtml(label || "Supporting event unavailable");
  const query = `Show events by date for event ID ${eventId}`;
  return `<a href="${escapeHtml(researchResultUrl(query))}" data-supporting-event-query="${escapeHtml(query)}">${escapeHtml(label || eventId)}</a>`;
}

function renderAdvancedQualityWarning(result) {
  return result.dataQualityWarning
    ? `<p class="data-warning">${escapeHtml(result.dataQualityWarning)}</p>`
    : "";
}

function athleteLink(entity, className = "athlete-link") {
  if (!entity?.id || entity.entityType === "team") return escapeHtml(entity?.name || "Unknown athlete");
  return `<a class="${escapeHtml(className)}" href="${escapeHtml(profileUrl(entity.id))}" data-open-athlete="${escapeHtml(entity.id)}">${escapeHtml(entity.name)}</a>`;
}

function persistInsightState() {
  try {
    localStorage.setItem("edgeboard-insight-state", JSON.stringify({
      savedInsights: state.savedInsights,
      dismissedInsightIds: state.dismissedInsightIds,
      followedEntityIds: state.followedEntityIds,
      followedInsightRefs: state.followedInsightRefs,
    }));
  } catch {
    // Insight actions remain available for the current session when local storage is unavailable.
  }
}

function insightCategory(insight) {
  if (insight.type.startsWith("milestone")) return "milestones";
  if (insight.type.includes("streak")) return "streaks";
  if (insight.type.includes("home_away") || insight.type.includes("opponent") || insight.type.includes("competition")) return "splits";
  if (["record_candidate", "career_high_available"].includes(insight.type)) return "career";
  if (insight.type.includes("matchup")) return "matchup";
  if (insight.type.includes("season") || insight.type.includes("rank") || insight.type.includes("rarity")) return "season";
  return "recent";
}

function insightShareUrl(insight) {
  const url = new URL(window.location.href);
  url.searchParams.set("mode", state.researchMode);
  url.searchParams.set("insight", insight.id);
  if (insight.entityType === "athlete") {
    url.searchParams.set("player", insight.entity.id);
    url.searchParams.set("tab", "insights");
  }
  return `${url.origin}${url.pathname}${url.search}`;
}

function savedInsightIndex(insight) {
  return state.savedInsights.findIndex((saved) =>
    saved.id === insight.id
    || (saved.ruleId === insight.ruleId
      && Array.isArray(saved.entityIds)
      && saved.entityIds.join("|") === insight.entityIds.join("|")
      && (!Array.isArray(saved.statIds)
        || !saved.statIds.length
        || saved.statIds.join("|") === insight.statIds.join("|"))));
}

function renderInsightCard(insight, { feature = false, context = "discovery" } = {}) {
  const savedIndex = savedInsightIndex(insight);
  const saved = savedIndex >= 0;
  const savedStatus = saved ? insightService.reconcileSavedInsight(state.savedInsights[savedIndex]) : null;
  const archived = ["stale", "invalid", "incomplete"].includes(insight.validationStatus);
  return `
    <article class="insight-card${feature ? " feature" : ""}${archived ? " archived" : ""}" data-insight-card="${escapeHtml(insight.id)}">
      <div class="insight-card-kickers">
        <span class="sample-badge">Sample insight</span>
        <span class="validation-label">${escapeHtml(insight.validationStatus.replaceAll("_", " "))}</span>
      </div>
      <h3>${escapeHtml(insight.phrasing.headline)}</h3>
      <p>${escapeHtml(insight.phrasing.shortSummary)}</p>
      <div class="insight-chips">
        <span>${escapeHtml(insight.leagueId.toUpperCase())}</span>
        <span>${insight.sampleSize} event${insight.sampleSize === 1 ? "" : "s"}</span>
        <span>${escapeHtml(insightCategory(insight))}</span>
      </div>
      ${insight.rarity?.comparisonPoolSize ? `<p class="insight-rarity">${escapeHtml(insight.rarity.label)} · ${insight.rarity.qualifyingEntityCount} of ${insight.rarity.comparisonPoolSize} qualified entities</p>` : ""}
      ${insight.bettingContext ? `<aside class="related-insight-market"><strong>Related current market</strong><span>${escapeHtml(insight.bettingContext.line)} · ${formatOdds(insight.bettingContext.odds)} · ${escapeHtml(insight.bettingContext.sportsbook)}</span><small>Historical context remains separate from projection and model confidence.</small></aside>` : ""}
      <div class="insight-card-footer">
        <span>${escapeHtml(insight.source.attribution || insight.source.provider)} · ${formatDateTime(insight.freshness.lastUpdated)}</span>
        <div>
          <button type="button" class="text-button" data-view-insight="${escapeHtml(insight.id)}">View supporting data</button>
          ${insight.entityType === "athlete" ? `<a class="text-button" href="${escapeHtml(profileUrl(insight.entity.id, "insights"))}" data-open-athlete="${escapeHtml(insight.entity.id)}">Profile</a>` : ""}
          <button type="button" class="text-button" data-save-insight="${escapeHtml(insight.id)}" aria-pressed="${saved}">${savedStatus?.changed ? "Saved · changed" : saved ? "Saved" : "Save"}</button>
          <button type="button" class="text-button" data-workspace-save-insight="${escapeHtml(insight.id)}">Save to workspace</button>
          ${insight.entityType === "team" ? `<button type="button" class="text-button" data-follow-entity="${escapeHtml(insight.entity.id)}" aria-pressed="${state.followedEntityIds.includes(insight.entity.id)}">${state.followedEntityIds.includes(insight.entity.id) ? "Following team" : "Follow team"}</button>` : ""}
          ${insight.type.includes("streak") || insight.type.startsWith("milestone") ? `<button type="button" class="text-button" data-follow-insight-rule="${escapeHtml(`${insight.entity.id}:${insight.ruleId}`)}" aria-pressed="${state.followedInsightRefs.includes(`${insight.entity.id}:${insight.ruleId}`)}">${state.followedInsightRefs.includes(`${insight.entity.id}:${insight.ruleId}`) ? "Following" : "Follow"}</button>` : ""}
          <button type="button" class="text-button" data-share-insight="${escapeHtml(insight.id)}">Share</button>
          <button type="button" class="text-button" data-dismiss-insight="${escapeHtml(insight.id)}" aria-label="Dismiss this ${escapeHtml(context)} insight">Dismiss</button>
        </div>
      </div>
      <span class="insight-action-status" role="status" aria-live="polite"></span>
    </article>
  `;
}

function visibleInsightCandidates(candidates) {
  const dismissed = new Set(state.dismissedInsightIds);
  return candidates.filter((insight) =>
    !dismissed.has(insight.id)
    && insight.validationStatus !== "stale"
    && insight.freshness?.state !== "stale");
}

function renderInsightDiscovery() {
  const summary = getSelectionSummary(state.navigationSelection);
  const leagueIds = summary.visibleLeagues.map((league) => league.leagueId);
  const sportIds = [...new Set(summary.visibleLeagues.map((league) => league.sportId))];
  const liveOnly = summary.selection.type === "system" && summary.selection.id === "live";
  const todayOnly = summary.selection.type === "system" && summary.selection.id === "today";
  const candidates = liveOnly ? [] : insightService.getFeaturedInsights({
    leagueIds,
    sportIds,
    limit: 6,
    includeBettingContext: state.researchMode === "both",
    ...(todayOnly ? { dateRange: { type: "today" } } : {}),
  });
  const visible = visibleInsightCandidates(candidates).slice(0, 4);
  elements.insightDiscovery.dataset.scope = serializeNavigationSelection(summary.selection);
  elements.insightDiscoverySummary.textContent = liveOnly
    ? "The sample historical provider cannot validate live-event insights, so none are shown."
    : `${visible.length} prioritized sample insight${visible.length === 1 ? "" : "s"} for ${summary.contextLabel}. Today’s Markets remains the primary discovery board.`;
  elements.insightDiscoveryGrid.innerHTML = visible.length
    ? visible.map((insight, index) => renderInsightCard(insight, { feature: index === 0 })).join("")
    : `<div class="discovery-empty" role="status">No fresh, validated sample insight is available for this scope.</div>`;
}

function renderInsightDialog(insight) {
  const supporting = insightService.getInsightSupportingData(insight.id);
  if (!supporting) return;
  state.activeInsightId = insight.id;
  elements.insightDialogContent.innerHTML = `
    <article class="share-stat-card" aria-label="${escapeHtml(insight.phrasing.sharingCaption)}">
      <span class="brand">EdgeBoard</span>
      <p class="eyebrow">Deterministic sample insight</p>
      <h3>${escapeHtml(insight.phrasing.headline)}</h3>
      <p>${escapeHtml(insight.phrasing.shortSummary)}</p>
      <div class="insight-chips"><span>${escapeHtml(insight.leagueId.toUpperCase())}</span><span>${insight.sampleSize} completed events</span><span>${escapeHtml(insight.validationStatus)}</span></div>
      <small>${escapeHtml(insight.phrasing.validationDisclosure)} · Source: ${escapeHtml(insight.phrasing.sourceLabel)} · Generated ${formatDateTime(insight.generatedAt)} · Sample data</small>
    </article>
    <div class="insight-dialog-actions">
      <button type="button" data-copy-insight="${escapeHtml(insight.id)}">Copy text</button>
      <button type="button" data-copy-insight-link="${escapeHtml(insight.id)}">Copy link</button>
      <button type="button" data-print-insight>Print card</button>
      <span role="status" aria-live="polite" class="insight-dialog-status"></span>
    </div>
    <dl class="insight-support-metadata">
      <div><dt>Structured claim</dt><dd><code>${escapeHtml(JSON.stringify(supporting.structuredClaim))}</code></dd></div>
      <div><dt>Calculation rule</dt><dd>${escapeHtml(supporting.calculationRule)}</dd></div>
      <div><dt>Date range</dt><dd>${escapeHtml(JSON.stringify(supporting.dateRange))}</dd></div>
      <div><dt>Sample size</dt><dd>${supporting.sampleSize}</dd></div>
      <div><dt>Comparison pool</dt><dd>${escapeHtml(JSON.stringify(supporting.comparisonPool || {}))}</dd></div>
      <div><dt>Qualification</dt><dd>${escapeHtml(JSON.stringify(supporting.qualificationRules))}</dd></div>
      <div><dt>Validation</dt><dd>${escapeHtml(supporting.validationStatus)}</dd></div>
      <div><dt>Coverage</dt><dd>${escapeHtml(supporting.coverage.explanation)}</dd></div>
      <div><dt>Source</dt><dd>${escapeHtml(supporting.source.attribution || supporting.source.provider)} · updated ${formatDateTime(supporting.lastUpdated)}</dd></div>
      <div><dt>Why selected</dt><dd>${escapeHtml(supporting.whySelected)}</dd></div>
    </dl>
    <div class="stats-table-wrap"><table class="stats-table"><caption>Supporting completed provider rows</caption><thead><tr><th scope="col">Event</th><th scope="col">Date</th><th scope="col">Result</th><th scope="col">Source row</th></tr></thead><tbody>
      ${supporting.eventRows.map((row) => `<tr><th scope="row">${escapeHtml(row.event_name || row.event_id)}</th><td>${formatDateTime(row.event_date)}</td><td>${escapeHtml(row.result || row.method || "Observed")}</td><td>${escapeHtml(row.row_id)}</td></tr>`).join("")}
    </tbody></table></div>
    ${supporting.warnings.map((warning) => `<p class="data-warning">${escapeHtml(warning)}</p>`).join("")}
  `;
  elements.insightDialog.showModal();
  elements.closeInsightDialog.focus();
}

function profileIdForPick(pick) {
  const matches = athleteProfileRepository.searchAthletes(pick?.name || "", {
    leagueId: state.leagueId,
    sportId: currentLeague()?.sportId || "",
  });
  const normalized = String(pick?.name || "").toLowerCase().replaceAll(/[^a-z0-9]+/g, "");
  return matches.find((entry) =>
    entry.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "") === normalized)?.id || "";
}

function profileHeaderFields(viewModel) {
  const { athlete, header, config } = viewModel;
  const leagueName = sportsRepository.getLeague(athlete.leagueId)?.leagueDisplayName || athlete.leagueId.toUpperCase();
  const fields = [];
  if (athlete.sportId === "motorsport") {
    fields.push(["Series", leagueName], ["Team", header.teamName], ["Number", header.jerseyNumber], ["Discipline", header.role]);
    if (header.handedness) fields.push([header.handednessLabel || "Manufacturer", header.handedness]);
    if (header.nationality) fields.push(["Nationality", header.nationality]);
  } else if (["mma", "boxing", "combat", "kickboxing"].includes(athlete.sportId)) {
    fields.push(["Promotion", header.organization], [config.roleLabel, header.role]);
    if (header.stance) fields.push(["Stance", header.stance]);
    if (header.record) fields.push(["Record", header.record]);
    if (header.reach) fields.push(["Reach", header.reach]);
    if (header.age) fields.push(["Age", String(header.age)]);
  } else {
    fields.push(["Team", header.teamName], [config.roleLabel, header.role]);
    if (header.jerseyNumber) fields.push(["Jersey", header.jerseyNumber]);
    if (header.height) fields.push(["Height", header.height]);
    if (header.weight) fields.push(["Weight", header.weight]);
    if (header.handedness) fields.push([header.handednessLabel, header.handedness]);
    if (header.age) fields.push(["Age", String(header.age)]);
    if (header.nationality) fields.push(["Nationality", header.nationality]);
  }
  fields.push(["Status", `${header.status} · ${header.availabilityStatus}`]);
  return fields.filter(([, value]) => value);
}

function renderTrendSvg(trends, threshold = null) {
  const points = trends.series || [];
  const finitePoints = points.filter((point) => Number.isFinite(point.value));
  if (!finitePoints.length) return `<div class="profile-empty">No completed trend values are available.</div>`;
  const values = finitePoints.map((point) => point.value);
  const min = Math.min(...values, Number.isFinite(threshold) ? threshold : Infinity);
  const max = Math.max(...values, Number.isFinite(threshold) ? threshold : -Infinity);
  const range = max - min || 1;
  const x = (index) => points.length === 1 ? 50 : 6 + (index / (points.length - 1)) * 88;
  const y = (value) => 88 - ((value - min) / range) * 72;
  const lineSegments = (field) => {
    const segments = [];
    let active = [];
    points.forEach((point, index) => {
      if (!Number.isFinite(point[field])) {
        if (active.length) segments.push(active);
        active = [];
        return;
      }
      active.push(`${x(index)},${y(point[field])}`);
    });
    if (active.length) segments.push(active);
    return segments;
  };
  const segments = lineSegments("value");
  const rollingSegments = lineSegments("rollingAverage");
  return `
    <figure class="profile-trend-figure">
      <svg class="profile-trend-chart" viewBox="0 0 100 100" role="img" aria-labelledby="trendChartTitle trendChartDesc" preserveAspectRatio="none">
        <title id="trendChartTitle">${escapeHtml(trends.activeStatLabel)} sample trend</title>
        <desc id="trendChartDesc">${escapeHtml(trends.accessibleSummary)}</desc>
        <line x1="6" y1="88" x2="94" y2="88" class="chart-axis" />
        ${Number.isFinite(threshold) ? `<line x1="6" y1="${y(threshold)}" x2="94" y2="${y(threshold)}" class="chart-threshold" />` : ""}
        ${segments.map((segment) => `<polyline points="${segment.join(" ")}" class="chart-line" />`).join("")}
        ${rollingSegments.map((segment) => `<polyline points="${segment.join(" ")}" class="chart-rolling" />`).join("")}
        ${points.map((point, index) => Number.isFinite(point.value)
          ? `<circle cx="${x(index)}" cy="${y(point.value)}" r="1.8" class="chart-point"><title>${escapeHtml(formatDateTime(point.date, "Unknown date"))}: ${point.value}</title></circle>`
          : "").join("")}
      </svg>
      <figcaption>${escapeHtml(trends.accessibleSummary)} Solid line: source value. Dashed line: three-event rolling average.${Number.isFinite(threshold) ? ` Threshold: ${threshold}.` : ""} Source: ${escapeHtml(trends.source)} · ${trends.sampleSize} events.</figcaption>
    </figure>
  `;
}

function renderProfileHeader(viewModel) {
  const { athlete, header } = viewModel;
  const leagueName = sportsRepository.getLeague(athlete.leagueId)?.leagueDisplayName || athlete.leagueId.toUpperCase();
  return `
    <header class="athlete-profile-header">
      <div class="profile-media-wrap">
        ${renderAthleteMedia(header.media, { large: true })}
        ${header.media.attribution ? `<small>${escapeHtml(header.media.attribution)} · ${escapeHtml(header.media.rightsStatus)}</small>` : ""}
      </div>
      <div class="profile-heading-copy">
        <div class="profile-kickers">
          <span class="sample-badge">Sample profile</span>
          <span>${escapeHtml(leagueName)} · ${escapeHtml(athlete.sportId.replaceAll("-", " "))}</span>
        </div>
        <h1 id="athleteProfileTitle">${escapeHtml(header.fullName)}</h1>
        <p>${escapeHtml(header.shortName)} · ${escapeHtml(header.seasonLabel)}</p>
        <dl class="profile-facts">${profileHeaderFields(viewModel).map(([label, value]) => `
          <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
        `).join("")}</dl>
        <p class="profile-freshness">Sample provider · updated ${formatDateTime(viewModel.dataSources[0]?.updatedAt)} · not live data</p>
      </div>
    </header>
  `;
}

function renderProfileOverview(viewModel) {
  const { overview, props } = viewModel;
  const insight = overview.insights[0];
  const next = overview.nextEvent;
  return `
    <div class="profile-overview-grid">
      <section class="profile-card profile-summary-card" aria-labelledby="seasonSummaryHeading">
        <div class="profile-card-heading"><div><p class="eyebrow">Observed statistics</p><h2 id="seasonSummaryHeading">Season sample</h2></div><span>${overview.dataStatus.sampleSize} recent events</span></div>
        ${overview.primaryStats.length ? `<div class="profile-stat-grid">${overview.primaryStats.map((stat) => `
          <div class="profile-stat"><span>${escapeHtml(stat.shortLabel)}</span><strong>${escapeHtml(stat.value)}</strong><small>${escapeHtml(stat.label)} · ${stat.aggregation === "sum" ? "total" : "per event"} · ${stat.sampleSize} rows</small></div>
        `).join("")}</div>` : `<div class="profile-empty">No safely calculable season summary is available.</div>`}
        ${overview.supportingStats.length ? `<details><summary>Supporting stats</summary><div class="profile-stat-grid supporting">${overview.supportingStats.map((stat) => `
          <div class="profile-stat"><span>${escapeHtml(stat.shortLabel)}</span><strong>${escapeHtml(stat.value)}</strong><small>${stat.sampleSize} rows</small></div>
        `).join("")}</div></details>` : ""}
      </section>
      <section class="profile-card" aria-labelledby="recentFormHeading">
        <div class="profile-card-heading"><div><p class="eyebrow">Completed events</p><h2 id="recentFormHeading">Recent form</h2></div><button type="button" class="text-button" data-profile-tab-target="game-logs">View logs</button></div>
        ${overview.recentForm.length ? `<div class="recent-form-strip">${overview.recentForm.map((item) => `
          <div><span>${escapeHtml(item.opponent || "Opponent")}</span><strong>${item.value ?? "—"}</strong><small>${formatDateTime(item.date, "Date unavailable")}</small></div>
        `).join("")}</div>` : `<div class="profile-empty">No completed recent events are available.</div>`}
      </section>
      <section class="profile-card" aria-labelledby="nextEventHeading">
        <div class="profile-card-heading"><div><p class="eyebrow">Schedule context</p><h2 id="nextEventHeading">Next event</h2></div></div>
        ${next ? `<div class="next-event"><strong>${escapeHtml(next.opponent)}</strong><span>${formatDateTime(next.startsAt)}</span><span>${escapeHtml(next.venue || "Venue unavailable")} · ${escapeHtml(next.homeAway || "Location unavailable")}</span></div>`
          : `<div class="profile-empty">No upcoming event is supplied by the sample provider.</div>`}
      </section>
      <section class="profile-card" aria-labelledby="relatedMarketsHeading">
        <div class="profile-card-heading"><div><p class="eyebrow">Betting analysis</p><h2 id="relatedMarketsHeading">Related markets</h2></div><button type="button" class="text-button" data-profile-tab-target="props">View props</button></div>
        ${props.markets.length ? `<p>${props.markets.length} provider-confirmed sample market${props.markets.length === 1 ? "" : "s"}. Historical statistics remain separate from model analysis.</p>`
          : `<div class="profile-empty">No current market available. Historical rows do not create odds.</div>`}
      </section>
      ${insight ? `<section class="profile-card profile-insight-card" aria-labelledby="overviewInsightHeading">
        <div class="profile-card-heading"><div><p class="eyebrow">Deterministic sample insight</p><h2 id="overviewInsightHeading">${escapeHtml(insight.title)}</h2></div></div>
        <p>${escapeHtml(insight.label)}</p>
        <button type="button" class="text-button" data-view-insight="${escapeHtml(insight.id)}">View supporting data</button>
      </section>` : ""}
    </div>
  `;
}

function renderProfileGameLogs(viewModel) {
  const logs = viewModel.gameLogs;
  const visibleColumns = state.profileVisibleColumns.length
    ? logs.columns.filter((column) => state.profileVisibleColumns.includes(column.id))
    : logs.columns;
  const rows = [...logs.rows].sort((a, b) => state.profileLogSort === "oldest"
    ? new Date(a.date) - new Date(b.date)
    : new Date(b.date) - new Date(a.date));
  return `
    <section class="profile-card profile-log-card" aria-labelledby="profileGameLogsHeading">
      <div class="profile-card-heading"><div><p class="eyebrow">Source rows</p><h2 id="profileGameLogsHeading">${escapeHtml(viewModel.tabs.find((tab) => tab.id === "game-logs")?.label || "Game Logs")}</h2></div><span>${rows.length} completed events</span></div>
      <div class="profile-filter-row">
        <label>Window<select data-profile-filter="log-window">
          ${[5, 10, 20, "season"].map((value) => `<option value="${value}" ${String(state.profileLogWindow) === String(value) ? "selected" : ""}>${value === "season" ? "Season" : `Last ${value}`}</option>`).join("")}
        </select></label>
        <label>Order<select data-profile-filter="log-sort"><option value="newest" ${state.profileLogSort === "newest" ? "selected" : ""}>Newest first</option><option value="oldest" ${state.profileLogSort === "oldest" ? "selected" : ""}>Oldest first</option></select></label>
        <label>Location<select data-profile-filter="home-away"><option value="all">All</option><option value="home" ${state.profileHomeAway === "home" ? "selected" : ""}>Home</option><option value="away" ${state.profileHomeAway === "away" ? "selected" : ""}>Away</option></select></label>
        <label>Result<select data-profile-filter="result"><option value="all">All results</option><option value="win" ${state.profileResult === "win" ? "selected" : ""}>Wins</option><option value="loss" ${state.profileResult === "loss" ? "selected" : ""}>Losses</option></select></label>
        ${logs.filters.opponents.length ? `<label>Opponent<select data-profile-filter="opponent"><option value="">All opponents</option>${logs.filters.opponents.map((opponent) => `<option value="${escapeHtml(opponent)}" ${state.profileOpponent === opponent ? "selected" : ""}>${escapeHtml(opponent)}</option>`).join("")}</select></label>` : ""}
      </div>
      <details class="profile-column-picker"><summary>Choose stat columns · ${visibleColumns.length} shown</summary><div>${logs.columns.map((column) => `
        <label><input type="checkbox" data-profile-column="${escapeHtml(column.id)}" ${visibleColumns.some((visible) => visible.id === column.id) ? "checked" : ""} />${escapeHtml(column.label)}</label>
      `).join("")}</div></details>
      ${rows.length ? `<div class="stats-table-wrap"><table class="stats-table profile-log-table">
        <caption>${escapeHtml(viewModel.header.fullName)} completed sample history · source ${escapeHtml(logs.source)}</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Opponent / Event</th><th scope="col">Result</th>${visibleColumns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr id="profile-event-${escapeHtml(row.eventId)}"><th scope="row">${formatDateTime(row.date, "Unknown")}</th><td>${escapeHtml(row.eventName || row.opponent)}</td><td>${escapeHtml(row.result)}${row.method ? ` · ${escapeHtml(row.method)}` : ""}</td>${visibleColumns.map((column) => `<td>${row.values[column.id] === null ? "—" : escapeHtml(row.values[column.id])}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>` : `<div class="profile-empty">No completed events match these filters.</div>`}
      <p class="stats-source">Sample historical data · updated ${formatDateTime(logs.updatedAt)} · postponed and duplicate events excluded</p>
    </section>
  `;
}

function renderProfileSplits(viewModel) {
  const splits = viewModel.splits;
  return `
    <section class="profile-card" aria-labelledby="profileSplitsHeading">
      <div class="profile-card-heading"><div><p class="eyebrow">Observed splits</p><h2 id="profileSplitsHeading">Split analysis</h2></div></div>
      <div class="profile-choice-row" role="group" aria-label="Split dimension">${splits.availableDimensions.map((dimension) => `
        <button type="button" data-profile-split="${escapeHtml(dimension)}" aria-pressed="${dimension === splits.activeDimension}">${escapeHtml(dimension.replaceAll("-", " "))}</button>
      `).join("")}</div>
      ${splits.rows.length ? `<div class="split-grid">${splits.rows.map((row) => `
        <article><h3>${escapeHtml(row.label)}</h3><strong>${row.value === null ? "Unavailable" : escapeHtml(row.value)}</strong><span>${row.sampleSize} completed events</span><small>Baseline ${row.comparisonBaseline ?? "—"} · difference ${row.differenceFromBaseline ?? "—"} · variance ${row.variance ?? "—"}</small>${row.warning ? `<p class="data-warning">${escapeHtml(row.warning)}</p>` : ""}</article>
      `).join("")}</div>` : `<div class="profile-empty">This split is unavailable from the sample provider.</div>`}
      <p class="stats-source">Source ${escapeHtml(splits.source)} · updated ${formatDateTime(splits.updatedAt)}</p>
    </section>
  `;
}

function renderProfileTrends(viewModel) {
  const trends = viewModel.trends;
  return `
    <section class="profile-card" aria-labelledby="profileTrendsHeading">
      <div class="profile-card-heading"><div><p class="eyebrow">Observed values</p><h2 id="profileTrendsHeading">Trend explorer</h2></div><span>${trends.sampleSize} events</span></div>
      <div class="profile-filter-row">
        <label>Statistic<select data-profile-filter="trend-stat">${trends.availableStats.map((stat) => `<option value="${escapeHtml(stat.id)}" ${stat.id === trends.activeStatId ? "selected" : ""}>${escapeHtml(stat.label)}</option>`).join("")}</select></label>
        <label>Window<select data-profile-filter="trend-window">${[5, 10, 20].map((value) => `<option value="${value}" ${Number(state.profileTrendWindow) === value ? "selected" : ""}>Last ${value}</option>`).join("")}<option value="100" ${Number(state.profileTrendWindow) === 100 ? "selected" : ""}>Season</option></select></label>
        <label>Threshold<input type="number" inputmode="decimal" data-profile-filter="trend-threshold" value="${escapeHtml(state.profileTrendThreshold)}" placeholder="Optional" /></label>
      </div>
      ${renderTrendSvg(trends, state.profileTrendThreshold === "" ? null : Number(state.profileTrendThreshold))}
      <p class="data-warning">Missing values are omitted rather than treated as zero. Lines are not drawn across missing events.</p>
    </section>
  `;
}

function renderProfileProps(viewModel) {
  const markets = viewModel.props.markets.filter((market) =>
    (state.profilePropGroup === "all" || market.group === state.profilePropGroup)
    && (state.profileSportsbook === "all" || market.sportsbook === state.profileSportsbook));
  return `
    <section aria-labelledby="profilePropsHeading">
      <div class="profile-section-heading"><div><p class="eyebrow">Provider-confirmed markets</p><h2 id="profilePropsHeading">${escapeHtml(viewModel.tabs.find((tab) => tab.id === "props")?.label || "Props")}</h2></div><span class="sample-badge">Sample odds</span></div>
      ${viewModel.props.markets.length ? `<div class="profile-filter-row">
        <label>Market group<select data-profile-filter="prop-group"><option value="all">All groups</option>${viewModel.props.groups.map((group) => `<option value="${escapeHtml(group)}" ${state.profilePropGroup === group ? "selected" : ""}>${escapeHtml(group)}</option>`).join("")}</select></label>
        <label>Sportsbook<select data-profile-filter="sportsbook"><option value="all">All sportsbooks</option>${viewModel.props.sportsbooks.map((book) => `<option value="${escapeHtml(book)}" ${state.profileSportsbook === book ? "selected" : ""}>${escapeHtml(book)}</option>`).join("")}</select></label>
      </div>` : ""}
      ${markets.length ? `<div class="profile-prop-grid">${markets.map((market) => {
        const actionable = market.available && !market.stale && !market.suspended && Number.isFinite(market.odds);
        const statusWarnings = [
          market.suspended ? "Market suspended." : "",
          market.stale ? "Odds are stale — shown for sample context only." : "",
          !market.suspended && !market.stale ? market.dataQualityWarning || "Sample market." : "",
        ].filter(Boolean);
        return `<article class="bet-card${market.stale ? " stale" : ""}${!market.available ? " unavailable" : ""}">
          <div class="bet-top"><div><p class="bet-title">${escapeHtml(market.marketName)}</p><div class="bet-market">${escapeHtml(market.side)} · ${escapeHtml(market.line)}</div></div><div class="odds">${formatOdds(market.odds)}</div></div>
          <div class="bet-source-row"><span>${escapeHtml(market.sportsbook)}</span><span>Updated ${formatDateTime(market.updatedAt)}</span></div>
          <div class="prop-metrics">
            <div class="prop-metric"><span>Projection</span><strong>${market.modelAvailable ? escapeHtml(market.projection) : "Model unavailable"}</strong></div>
            <div class="prop-metric"><span>Projected edge</span><strong>${market.modelAvailable ? escapeHtml(market.projectedEdge) : "Unavailable"}</strong></div>
            <div class="prop-metric"><span>Historical hit rate</span><strong>${escapeHtml(market.historicalHitRate || "Unavailable")}</strong></div>
            <div class="prop-metric"><span>Model confidence</span><strong>${Number.isFinite(market.confidence) ? `${market.confidence}% signal` : "Unavailable"}</strong></div>
          </div>
          <p class="data-warning">${escapeHtml(statusWarnings.join(" "))}</p>
          <button class="add-button" type="button" data-profile-add="${escapeHtml(market.id)}" ${actionable ? "" : "disabled"}>${actionable ? "Add to slip" : "Unavailable"}</button>
        </article>`;
      }).join("")}</div>` : `<div class="profile-empty profile-card">${viewModel.props.markets.length ? "No provider markets match these filters." : "No current market available. Historical performance does not create a betting line."}</div>`}
      <p class="data-warning">Historical hit rate is observed sample history. Projection and confidence are separate model fields; confidence is not win probability.</p>
    </section>
  `;
}

function renderProfileMatchup(viewModel) {
  const matchup = viewModel.matchup;
  return `
    <section class="profile-card" aria-labelledby="profileMatchupHeading">
      <div class="profile-card-heading"><div><p class="eyebrow">Evidence-backed context</p><h2 id="profileMatchupHeading">${escapeHtml(viewModel.tabs.find((tab) => tab.id === "matchup")?.label || "Matchup")}</h2></div></div>
      ${matchup.event ? `<div class="matchup-context-header"><strong>${escapeHtml(matchup.opponent || matchup.event.opponent)}</strong><span>${formatDateTime(matchup.eventTime || matchup.event.startsAt)}</span><span>${escapeHtml(matchup.venue || matchup.event.venue || "Venue unavailable")}</span></div>` : `<div class="profile-empty">No upcoming matchup is supplied.</div>`}
      ${matchup.factors?.length ? `<div class="profile-factors">${matchup.factors.map((factor) => `<div><span>${escapeHtml(factor.label)}</span><strong>${escapeHtml(factor.value)}</strong><small>Sample: ${factor.sampleSize ?? "unavailable"} · ${escapeHtml(matchup.source)}</small></div>`).join("")}</div>` : ""}
      ${(matchup.warnings || []).map((warning) => `<p class="data-warning">${escapeHtml(warning)}</p>`).join("")}
    </section>
  `;
}

function renderProfileInsights(viewModel) {
  const categories = [
    ["recent", "Recent"], ["season", "Season"], ["career", "Career in available data"],
    ["splits", "Splits"], ["streaks", "Streaks"], ["milestones", "Milestones"], ["matchup", "Matchup"],
  ];
  const overviewId = viewModel.overview.insights[0]?.id || "";
  const matching = visibleInsightCandidates(viewModel.insights)
    .filter((insight) => insight.id !== overviewId)
    .filter((insight) => insightCategory(insight) === state.profileInsightCategory);
  return `
    <section aria-labelledby="profileInsightsHeading">
      <div class="profile-section-heading"><div><p class="eyebrow">Calculated before phrasing</p><h2 id="profileInsightsHeading">Deterministic insights</h2></div><span>${viewModel.insights.length} selected</span></div>
      <div class="profile-insight-filters" role="group" aria-label="Insight category">
        ${categories.map(([id, label]) => `<button type="button" data-insight-category="${id}" aria-pressed="${state.profileInsightCategory === id}">${label}</button>`).join("")}
      </div>
      ${matching.length ? `<div class="profile-insights">${matching.map((insight) =>
        renderInsightCard(insight, { context: "profile" })).join("")}</div>`
      : `<div class="profile-empty profile-card" role="status">No additional ${escapeHtml(state.profileInsightCategory)} insight is supported after excluding the Overview card.</div>`}
      <p class="data-warning">No claim is labeled a league or career record. The sample provider does not contain complete historical evidence.</p>
    </section>
  `;
}

function renderProfilePanel(viewModel) {
  if (state.profileTab === "game-logs") return renderProfileGameLogs(viewModel);
  if (state.profileTab === "splits") return renderProfileSplits(viewModel);
  if (state.profileTab === "trends") return renderProfileTrends(viewModel);
  if (state.profileTab === "props") return renderProfileProps(viewModel);
  if (state.profileTab === "matchup") return renderProfileMatchup(viewModel);
  if (state.profileTab === "insights") return renderProfileInsights(viewModel);
  return renderProfileOverview(viewModel);
}

function renderAthleteProfile() {
  const active = Boolean(state.profileAthleteId);
  document.body.classList.toggle("profile-active", active);
  elements.athleteProfileView.hidden = !active;
  if (!active) return;
  elements.athleteProfileLoading.hidden = !state.profileLoading;
  const notFound = !state.profileLoading && state.profileViewModel?.status === "not-found";
  elements.athleteProfileNotFound.hidden = !notFound;
  if (state.profileLoading || notFound || !state.profileViewModel) {
    elements.athleteProfileContent.innerHTML = "";
    return;
  }
  const viewModel = state.profileViewModel;
  const followed = state.followedEntityIds.includes(viewModel.athlete.id);
  elements.followAthlete.setAttribute("aria-pressed", String(followed));
  elements.followAthlete.textContent = followed ? "Following locally" : "Follow";
  elements.athleteProfileContent.innerHTML = `
    ${renderProfileHeader(viewModel)}
    <div class="profile-visual-entry"><div><p class="eyebrow">Evidence-backed charts</p><strong>Visual analytics</strong><span>Open provider-gated trends and sport-specific visuals.</span></div><button type="button" class="text-button" data-open-visual="${escapeHtml(defaultVisualizationType(viewModel.athlete))}" data-visual-entity="${escapeHtml(viewModel.athlete.id)}">Open visuals</button></div>
    <nav class="profile-tabs" role="tablist" aria-label="${escapeHtml(viewModel.header.fullName)} profile sections">
      ${viewModel.tabs.map((tab) => `<a id="profile-tab-${escapeHtml(tab.id)}" role="tab" href="${escapeHtml(profileUrl(viewModel.athlete.id, tab.id))}" data-profile-tab="${escapeHtml(tab.id)}" aria-controls="athleteProfileTabPanel" aria-selected="${tab.id === state.profileTab}" tabindex="${tab.id === state.profileTab ? 0 : -1}">${escapeHtml(tab.label)}</a>`).join("")}
    </nav>
    <div id="athleteProfileTabPanel" class="profile-tab-panel" role="tabpanel" tabindex="0" aria-labelledby="profile-tab-${escapeHtml(state.profileTab)}">
      ${renderProfilePanel(viewModel)}
    </div>
    <aside class="related-searches" aria-labelledby="relatedSearchesHeading"><div><p class="eyebrow">Continue researching</p><h2 id="relatedSearchesHeading">Related searches</h2></div><div>${viewModel.relatedQueries.map((query) => `<button type="button" data-profile-query="${escapeHtml(query)}">${escapeHtml(query)}</button>`).join("")}</div></aside>
  `;
}

function renderEntityProfile() {
  const active = Boolean(state.entityProfileId);
  document.body.classList.toggle("entity-profile-active", active);
  elements.entityProfileView.hidden = !active;
  if (!active) return;
  elements.entityProfileLoading.hidden = !state.entityProfileLoading;
  const notFound = !state.entityProfileLoading && state.entityProfileViewModel?.status === "not-found";
  elements.entityProfileNotFound.hidden = !notFound;
  if (state.entityProfileLoading || notFound || !state.entityProfileViewModel) {
    elements.entityProfileContent.innerHTML = "";
    return;
  }
  const viewModel = state.entityProfileViewModel;
  const { entity, dataStatus } = viewModel;
  const followed = state.followedEntityIds.includes(entity.id);
  elements.followEntity.setAttribute("aria-pressed", String(followed));
  elements.followEntity.textContent = followed ? "Following locally" : "Follow";
  elements.entityProfileSlipCount.textContent = String(state.slip.length);
  const facts = Object.values(viewModel.facts);
  const markets = viewModel.markets.flatMap((market) => market.selections.slice(0, 2).map((selection) => {
    const pick = getPickBySelectionId(sportsRepository, market.leagueId, selection.id);
    const actionable = pick?.available && !pick.stale && !state.slip.some((item) => item.id === pick.id);
    return `
      <article class="entity-market-card">
        <div><span class="entity-type-chip">${escapeHtml(market.displayName)}</span><h3>${escapeHtml(selection.name)}</h3></div>
        <dl><div><dt>Line</dt><dd>${escapeHtml(selection.line)}</dd></div><div><dt>Odds</dt><dd>${selection.odds === null ? "Unavailable" : `${selection.odds > 0 ? "+" : ""}${selection.odds}`}</dd></div></dl>
        <p>${escapeHtml(selection.sportsbook)} · updated ${formatDateTime(selection.lastUpdatedAt)}</p>
        <button class="add-button" type="button" data-entity-add="${escapeHtml(selection.id)}" ${actionable ? "" : "disabled"}>${actionable ? "Add to slip" : pick?.stale ? "Stale" : "Unavailable"}</button>
      </article>`;
  })).join("");
  elements.entityProfileContent.innerHTML = `
    <header class="entity-profile-header">
      ${renderAthleteMedia(entity.media, { large: true })}
      <div>
        <div class="entity-profile-badges"><span class="entity-type-chip">${escapeHtml(viewModel.typeDefinition.label)}</span><span class="sample-badge">Sample data</span></div>
        <h1 id="entityProfileTitle">${escapeHtml(entity.displayName)}</h1>
        <p>${escapeHtml([entity.sportId, entity.leagueId?.toUpperCase()].filter(Boolean).join(" · ") || "Multi-sport entity")}</p>
        <p class="stats-source">${escapeHtml(dataStatus.source)} · updated ${formatDateTime(dataStatus.updatedAt)} · ${escapeHtml(dataStatus.freshness)} · partial sample profile</p>
      </div>
    </header>
    <div class="profile-visual-entry"><div><p class="eyebrow">Evidence-backed charts</p><strong>Visual analytics</strong><span>Availability follows provider capabilities and source coverage.</span></div><button type="button" class="text-button" data-open-visual="${escapeHtml(defaultVisualizationType(entity))}" data-visual-entity="${escapeHtml(entity.id)}">Open visuals</button></div>
    <div class="entity-data-warning" role="status">${escapeHtml(dataStatus.warning)}</div>
    <section class="entity-profile-section" aria-labelledby="entityIdentityHeading">
      <div class="panel-heading"><div><p class="eyebrow">Canonical identity</p><h2 id="entityIdentityHeading">Overview</h2></div></div>
      <dl class="entity-facts">${facts.map((fact) => `<div class="${fact.available ? "" : "unavailable"}"><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`).join("")}</dl>
    </section>
    <section class="entity-profile-section" aria-labelledby="entityRelationshipsHeading">
      <div class="panel-heading"><div><p class="eyebrow">Entity graph</p><h2 id="entityRelationshipsHeading">Related entities</h2></div></div>
      <div class="entity-links">${viewModel.relatedEntities.length ? viewModel.relatedEntities.map((related) => {
        const result = entityRegistry.search(related.displayName, {}, 20).find((item) => item.id === related.id);
        const href = result?.profileSystem === "athlete" ? profileUrl(related.id) : entityProfileUrl(related.id);
        const attribute = result?.profileSystem === "athlete" ? `data-open-athlete="${escapeHtml(related.id)}"` : `data-open-entity="${escapeHtml(related.id)}"`;
        return `<a href="${escapeHtml(href)}" ${attribute}><strong>${escapeHtml(related.displayName)}</strong><span>${escapeHtml(result?.typeLabel || related.type)}</span></a>`;
      }).join("") : '<p class="profile-empty">No verified relationships are available in the sample registry.</p>'}</div>
    </section>
    <section class="entity-profile-section" aria-labelledby="entityRosterHeading">
      <div class="panel-heading"><div><p class="eyebrow">Connected people</p><h2 id="entityRosterHeading">Roster and participants</h2></div></div>
      <div class="entity-links">${viewModel.roster.length ? viewModel.roster.map((member) => {
        const result = entityRegistry.search(member.displayName, {}, 20).find((item) => item.id === member.id);
        const href = result?.profileSystem === "athlete" ? profileUrl(member.id) : entityProfileUrl(member.id);
        return `<a href="${escapeHtml(href)}" ${result?.profileSystem === "athlete" ? `data-open-athlete="${escapeHtml(member.id)}"` : `data-open-entity="${escapeHtml(member.id)}"`}><strong>${escapeHtml(member.displayName)}</strong><span>${escapeHtml(result?.typeLabel || member.type)}</span></a>`;
      }).join("") : '<p class="profile-empty">Roster data is unavailable from the sample provider.</p>'}</div>
    </section>
    <section class="entity-profile-section" aria-labelledby="entityScheduleHeading">
      <div class="panel-heading"><div><p class="eyebrow">Schedule and results</p><h2 id="entityScheduleHeading">Events</h2></div></div>
      <div class="entity-event-list">${viewModel.events.length ? viewModel.events.map((event) => `<article><strong>${escapeHtml(event.display.title || event.participants.map((participant) => participant.name).join(" vs "))}</strong><span>${formatDateTime(event.startsAt)} · ${escapeHtml(event.status)}</span></article>`).join("") : '<p class="profile-empty">No verified events are available for this entity.</p>'}</div>
    </section>
    <section class="entity-profile-section" aria-labelledby="entityMetricsHeading">
      <div class="panel-heading"><div><p class="eyebrow">Calculated from completed source rows</p><h2 id="entityMetricsHeading">Team and competition metrics</h2></div></div>
      ${viewModel.metrics?.stats?.length ? `<dl class="entity-facts">${viewModel.metrics.stats.map((metric) => `<div><dt>${escapeHtml(metric.label)}</dt><dd>${escapeHtml(Number.isInteger(metric.value) ? metric.value : metric.value.toFixed(1))}</dd><small>Sample ${metric.sampleSize} · ${escapeHtml(metric.unit)}</small></div>`).join("")}</dl><p class="stats-source">${escapeHtml(viewModel.metrics.metadata.source)} · ${viewModel.metrics.metadata.sampleSize} completed rows</p>` : '<p class="profile-empty">No calculated team metrics are available in the normalized sample rows.</p>'}
    </section>
    <section class="entity-profile-section" aria-labelledby="entityMarketsHeading">
      <div class="panel-heading"><div><p class="eyebrow">Provider-confirmed only</p><h2 id="entityMarketsHeading">Related markets</h2></div></div>
      <div class="entity-market-grid">${markets || '<p class="profile-empty">No available markets are linked to this entity. Unsupported markets are not inferred.</p>'}</div>
    </section>
    <section class="entity-profile-section" aria-labelledby="entityInsightsHeading">
      <div class="panel-heading"><div><p class="eyebrow">Calculated findings</p><h2 id="entityInsightsHeading">Insights</h2></div></div>
      ${viewModel.insights.length ? `<div class="insight-card-grid">${viewModel.insights.map((insight) => renderInsightCard(insight, { context: "entity" })).join("")}</div>` : '<p class="profile-empty">No validated insight candidate exists for this entity in the sample rows.</p>'}
    </section>
    <section class="entity-profile-section" aria-labelledby="entityUnavailableHeading">
      <div class="panel-heading"><div><p class="eyebrow">Provider coverage</p><h2 id="entityUnavailableHeading">Unavailable fields</h2></div></div>
      ${viewModel.placeholders.length ? `<ul class="entity-placeholder-list">${viewModel.placeholders.map((item) => `<li>${escapeHtml(item)}: unavailable from sample provider</li>`).join("")}</ul>` : '<p class="profile-empty">No additional profile fields are configured.</p>'}
    </section>
    <aside class="related-searches" aria-labelledby="entityRelatedSearchesHeading"><div><p class="eyebrow">Continue researching</p><h2 id="entityRelatedSearchesHeading">Related searches</h2></div><div>${viewModel.relatedQueries.map((query) => `<button type="button" data-profile-query="${escapeHtml(query)}">${escapeHtml(query)}</button>`).join("")}</div></aside>
  `;
}

function renderVisualAnalytics() {
  const active = Boolean(state.visualRequest);
  document.body.classList.toggle("visual-analytics-active", active);
  elements.visualAnalyticsView.hidden = !active;
  if (!active) return;
  elements.visualAnalyticsLoading.hidden = !state.visualLoading;
  if (state.visualLoading || !state.visualResult || !visualizationRenderer) {
    elements.visualAnalyticsContent.innerHTML = "";
    return;
  }
  elements.visualAnalyticsContent.innerHTML = visualizationRenderer.renderVisualization(state.visualResult, {
    availableVisualizations: state.visualAvailable,
  });
}

function setVisualAnalyticsUrl(request, { replace = false } = {}) {
  const url = new URL(request ? visualAnalyticsUrl(request) : window.location.href, window.location.href);
  if (!request) {
    ["visual", "visualEntity", "visualSport", "visualLeague", "visualWindow", "visualThreshold", "visualSeries"]
      .forEach((parameter) => url.searchParams.delete(parameter));
  }
  history[replace ? "replaceState" : "pushState"]({ edgeboardVisual: Boolean(request), visual: request?.visualizationType }, "", url);
}

async function loadVisualAnalytics({ focusHeading = false } = {}) {
  if (!state.visualRequest) return;
  visualAbortController?.abort();
  visualAbortController = new AbortController();
  const requestId = ++visualRequestSequence;
  state.visualLoading = true;
  state.visualResult = null;
  renderVisualAnalytics();
  try {
    await loadVisualizationModules();
    if (requestId !== visualRequestSequence || !state.visualRequest) return;
    state.visualRequest = visualizationServiceModule.buildVisualizationRequest(state.visualRequest);
    const entity = entityRegistry.getEntity(state.visualRequest.entityIds[0]);
    state.visualAvailable = visualizationRepository.getAvailableVisualizations({
      sportId: state.visualRequest.sportId,
      entityType: state.visualRequest.entityType || entity?.type || "",
      entityIds: state.visualRequest.entityIds,
    });
    const result = await visualizationRepository.getVisualizationData(state.visualRequest, {
      signal: visualAbortController.signal,
    });
    if (requestId !== visualRequestSequence || !state.visualRequest) return;
    state.visualLoading = false;
    state.visualResult = result;
    renderVisualAnalytics();
    if (focusHeading) {
      const heading = elements.visualAnalyticsContent.querySelector("#visualizationTitle");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
      elements.visualAnalyticsView.scrollIntoView({ block: "start" });
    }
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== visualRequestSequence) return;
    state.visualLoading = false;
    elements.visualAnalyticsContent.innerHTML = `<div class="visual-unavailable" role="alert"><strong>Visualization failed</strong><p>${escapeHtml(error?.message || "Unknown visualization error")}</p></div>`;
  }
}

function openVisualAnalytics(input, { replace = false, focusHeading = true, returnFocus = null } = {}) {
  const entityId = input.entityIds?.[0] || "";
  const entity = entityRegistry.getEntity(entityId);
  visualReturnFocus = returnFocus || document.activeElement;
  profileRequestSequence += 1;
  entityProfileRequestSequence += 1;
  entityProfileAbortController?.abort();
  state.profileAthleteId = "";
  state.profileViewModel = null;
  state.profileLoading = false;
  state.entityProfileId = "";
  state.entityProfileViewModel = null;
  state.entityProfileLoading = false;
  state.visualRequest = {
    visualizationType: input.visualizationType || defaultVisualizationType(entity),
    sportId: input.sportId || entity?.sportId || currentLeague()?.sportId || "",
    leagueId: input.leagueId || entity?.leagueId || state.leagueId,
    entityType: input.entityType || entity?.type || "athlete",
    entityIds: input.entityIds || (entityId ? [entityId] : []),
    eventIds: input.eventIds || [],
    statIds: input.statIds || [],
    dateRange: input.dateRange || { type: "last_n_games", value: 10 },
    filters: input.filters || {},
    comparisonMode: input.comparisonMode || null,
    includeBettingContext: input.includeBettingContext === true,
  };
  renderAthleteProfile();
  renderEntityProfile();
  renderVisualAnalytics();
  setVisualAnalyticsUrl(state.visualRequest, { replace });
  loadVisualAnalytics({ focusHeading });
  recordWorkspaceActivity("viewed_visualization", "visualization", state.visualRequest.visualizationType, "Viewed visual analytics");
}

function closeVisualAnalytics({ useHistory = true } = {}) {
  visualAbortController?.abort();
  visualRequestSequence += 1;
  state.visualRequest = null;
  state.visualResult = null;
  state.visualAvailable = [];
  state.visualLoading = false;
  elements.visualSlipPanel.hidden = true;
  elements.visualSlipToggle.setAttribute("aria-expanded", "false");
  renderVisualAnalytics();
  setVisualAnalyticsUrl(null, { replace: !useHistory });
  const target = visualReturnFocus?.isConnected ? visualReturnFocus : elements.queryInput;
  visualReturnFocus = null;
  target?.focus({ preventScroll: true });
}

function renderInterpretation(parsed) {
  if (!parsed) return "";
  const query = parsed.structuredQuery;
  const confidence = Math.round(parsed.interpretationConfidence * 100);
  const warnings = [...parsed.warnings, ...parsed.unsupportedFilters.map((filter) => `Unsupported filter: ${filter}`)];
  return `
    <div class="interpretation-heading">
      <div><span>Detected interpretation</span><strong>${escapeHtml(query.intent.replaceAll("_", " "))}</strong></div>
      <span>${confidence}% parser confidence</span>
    </div>
    <div class="interpreted-filters" aria-label="Interpreted query filters">
      <span>${escapeHtml(query.leagueId.toUpperCase() || "No league")}</span>
      ${query.statIds.map((statId) => `<span>${escapeHtml(statId)}</span>`).join("")}
      <span>${escapeHtml(query.dateRange.type.replaceAll("_", " "))}</span>
      <span>${escapeHtml(query.aggregation)}</span>
      ${query.contextOverride ? '<button type="button" data-clear-stats-override>Use selected navigation context ×</button>' : ""}
    </div>
    ${warnings.length ? `<ul class="stats-warnings">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
  `;
}

function renderStatsTable(result) {
  const statIds = result.statIds || result.structuredQuery?.statIds || [];
  return `
    <div class="stats-table-wrap">
      <table class="stats-table">
        <caption>${escapeHtml(result.title)} · ${escapeHtml(result.context || "available sample")}</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Opponent</th><th scope="col">Split</th>${statIds.map((statId) => `<th scope="col">${escapeHtml(statId.split("-").at(-1).toUpperCase())}</th>`).join("")}</tr></thead>
        <tbody>${result.rows.map((row) => `
          <tr>
            <th scope="row">${escapeHtml(formatDateTime(row.event_date, "Unknown"))}</th>
            <td>${escapeHtml(row.opponent_id || "Unknown")}</td>
            <td>${escapeHtml(row.home_away || "—")} · ${escapeHtml(row.result || "—")}</td>
            ${statIds.map((statId) => `<td>${Number.isFinite(Number(row.stats?.[statId])) ? escapeHtml(row.stats[statId]) : "—"}</td>`).join("")}
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderAdvancedActions(result, views = ["table"]) {
  return `
    <div class="advanced-result-actions" aria-label="Result actions">
      <div class="advanced-view-switch" role="group" aria-label="Result view">
        ${views.map((view) => `<button type="button" data-advanced-view="${view}" aria-pressed="${state.advancedDisplay === view}">${view.replaceAll("-", " ")}</button>`).join("")}
      </div>
      <button type="button" data-copy-advanced="summary">Copy summary</button>
      <button type="button" data-copy-advanced="table">Copy table</button>
      <button type="button" data-export-advanced="csv">Download CSV</button>
      <button type="button" data-copy-advanced="link">Copy link</button>
      <button type="button" data-workspace-save-result>Save to workspace</button>
      <span class="advanced-copy-status" role="status" aria-live="polite"></span>
    </div>
  `;
}

function renderComparisonResult(result) {
  const view = ["cards", "table", "trend", "overlay"].includes(state.advancedDisplay) ? state.advancedDisplay : "table";
  const rows = result.rows;
  const table = `
    <div class="stats-table-wrap advanced-table-wrap" tabindex="0" aria-label="Scrollable comparison table">
      <table class="stats-table advanced-comparison-table">
        <caption>${escapeHtml(result.title)} · ${escapeHtml(result.context)} · illustrative sample</caption>
        <thead><tr><th scope="col">Entity</th>${result.statColumns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}<th scope="col">Sample</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><th scope="row">${athleteLink(row.entity || result.entities.find((entity) => entity.id === row.entityId))}</th>
          ${result.statColumns.map((column) => {
            const value = row.values[column.statId];
            return `<td><strong>${escapeHtml(value.value)}</strong><small>Rank ${column.ranks[row.entityId] || "—"} · Δ ${value.difference ?? "—"} · variance ${value.variance ?? "—"}</small></td>`;
          }).join("")}<td>${result.sampleSizes[row.entityId]} events</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
  const cards = `<div class="advanced-comparison-cards">${rows.map((row) => `
    <article class="advanced-entity-card">
      <div>${renderAthleteMedia(row.media)}<h4>${athleteLink(result.entities.find((entity) => entity.id === row.entityId))}</h4><span>${escapeHtml(row.teamName || row.leagueId.toUpperCase())} · ${escapeHtml(row.role || row.entityType)}</span></div>
      <button type="button" class="text-button" data-compare-remove="${escapeHtml(row.entityId)}" aria-label="Remove ${escapeHtml(row.displayName)} from comparison">Remove</button>
      ${result.statColumns.map((column) => `<div class="supporting-stat"><span>${escapeHtml(column.shortLabel)}</span><strong>${escapeHtml(row.values[column.statId].value)}</strong><small>${row.values[column.statId].sampleSize} events · rank ${column.ranks[row.entityId] || "—"}</small></div>`).join("")}
    </article>`).join("")}</div>`;
  const trend = `<div class="advanced-trend-summary" role="img" aria-label="Comparison trend summary">
    <p>Accessible trend summary across the same completed-event window. Missing values are omitted.</p>
    ${result.statColumns.slice(0, 2).map((column) => `<section><h4>${escapeHtml(column.label)}</h4>${rows.map((row) => {
      const value = row.values[column.statId];
      return `<div><span>${escapeHtml(row.displayName)}</span><strong>${escapeHtml(value.value)}</strong><small>${value.sampleSize} source values</small></div>`;
    }).join("")}</section>`).join("")}
  </div>`;
  return `
    <article class="stats-answer-card advanced-result" data-advanced-result>
      <div class="stats-answer-heading"><div><p class="eyebrow">${result.type === "team_comparison" ? "Team" : "Athlete"} comparison · sample</p><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3><span>${escapeHtml(result.context)}</span></div><span>${rows.length} entities</span></div>
      ${renderAdvancedActions(result, ["cards", "table", "trend", "overlay"])}
      <div class="comparison-editor">
        <div class="comparison-selected" aria-label="Selected comparison entities">
          ${rows.map((row) => `<span>${escapeHtml(row.displayName)}<button type="button" data-compare-remove="${escapeHtml(row.entityId)}" aria-label="Remove ${escapeHtml(row.displayName)} from comparison">×</button></span>`).join("")}
        </div>
        <label for="comparisonEntitySearch">Add ${result.type === "team_comparison" ? "team" : "athlete"}
          <input id="comparisonEntitySearch" type="search" list="comparisonEntityOptions" data-comparison-search autocomplete="off" placeholder="Search this comparison pool" />
        </label>
        <datalist id="comparisonEntityOptions">${(result.availableEntities || []).map((entity) => `<option value="${escapeHtml(entity.name)}">${escapeHtml(entity.leagueId.toUpperCase())} · ${escapeHtml(entity.role || entity.teamId || entity.entityType)}</option>`).join("")}</datalist>
        <button type="button" data-comparison-add>Add to comparison</button>
        <div role="group" aria-label="Comparison window">
          <button type="button" data-comparison-window="5">Last 5</button>
          <button type="button" data-comparison-window="10">Last 10</button>
          <button type="button" data-comparison-window="season">Season</button>
        </div>
      </div>
      <div class="advanced-filter-summary">${result.scope.filters.map((filter) => `<span>${escapeHtml(filter)}</span>`).join("")}<span>${escapeHtml(result.scope.aggregation)}</span></div>
      ${result.headlineDifferences.length ? `<div class="headline-differences">${result.headlineDifferences.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.leaderName)}</strong><small>Difference ${item.difference} · ${escapeHtml(item.criteria)}</small></div>`).join("")}</div>` : ""}
      ${view === "cards" ? cards : view === "trend" || view === "overlay" ? `${trend}${view === "overlay" ? table : ""}` : table}
      ${result.warnings.map((warning) => `<p class="data-warning">${escapeHtml(warning)}</p>`).join("")}
      ${renderAdvancedQualityWarning(result)}
      <p class="stats-source">${escapeHtml(result.sources[0]?.provider)} · updated ${formatDateTime(result.lastUpdated)} · sample sizes shown per entity</p>
    </article>`;
}

function renderAdvancedLeaderboard(result) {
  const sortId = state.advancedSort || result.statId;
  const direction = state.advancedSortDirection;
  const definitionLowerIsBetter = result.structuredQuery?.sortDirection === "asc";
  const rows = [...result.rows].sort((left, right) => {
    if (sortId === "entity") return left.displayName.localeCompare(right.displayName) * (direction === "asc" ? 1 : -1);
    if (sortId === "sample") return (left.sampleSize - right.sampleSize) * (direction === "asc" ? 1 : -1);
    return (left.rawValue - right.rawValue) * (direction === "asc" ? 1 : -1);
  });
  return `
    <article class="stats-answer-card advanced-result" data-advanced-result>
      <div class="stats-answer-heading"><div><p class="eyebrow">Qualified sample leaderboard</p><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3><span>${escapeHtml(result.context)}</span></div><span>${result.totalQualified} qualified</span></div>
      ${renderAdvancedActions(result, ["table", "cards"])}
      <div class="qualification-summary"><strong>Qualification</strong>${Object.entries(result.qualification || {}).filter(([, value]) => value > 0).map(([key, value]) => `<span>${escapeHtml(key.replaceAll(/([A-Z])/g, " $1"))}: ${value}</span>`).join("") || "<span>No additional threshold</span>"}</div>
      <div class="stats-table-wrap advanced-table-wrap" tabindex="0" aria-label="Scrollable leaderboard table">
        <table class="stats-table">
          <caption>${escapeHtml(result.statLabel)} · ${escapeHtml(result.tieStrategy)} · sample provider</caption>
          <thead><tr>
            <th scope="col">Rank</th>
            <th scope="col" aria-sort="${sortId === "entity" ? direction === "asc" ? "ascending" : "descending" : "none"}"><button type="button" data-advanced-sort="entity">Entity</button></th>
            <th scope="col" aria-sort="${sortId === result.statId ? direction === "asc" ? "ascending" : "descending" : "none"}"><button type="button" data-advanced-sort="${escapeHtml(result.statId)}">${escapeHtml(result.statLabel)}</button></th>
            <th scope="col">Percentile</th>
            <th scope="col" aria-sort="${sortId === "sample" ? direction === "asc" ? "ascending" : "descending" : "none"}"><button type="button" data-advanced-sort="sample">Sample</button></th>
            <th scope="col">Context</th>
          </tr></thead>
          <tbody>${rows.map((row) => `<tr><th scope="row">${row.rank}</th><td>${athleteLink(row.entity)}</td><td>${escapeHtml(row.value)}</td><td>${row.percentile === null ? "Unavailable" : `${row.percentile}% of ${row.comparisonPoolSize} qualified`}</td><td>${row.sampleSize}</td><td>${row.bettingMarket ? `<span class="sample-badge">Current sample market</span>` : row.eventId ? supportingEventLink(row.eventId, row.eventId) : "Observed stats only"}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <p class="stats-source">${escapeHtml(result.sources[0]?.provider)} · updated ${formatDateTime(result.lastUpdated)} · ${escapeHtml(result.percentileMethod)}</p>
      ${definitionLowerIsBetter ? `<p class="data-warning">Lower values rank first for this metric.</p>` : ""}
      ${result.warnings.map((warning) => `<p class="data-warning">${escapeHtml(warning)}</p>`).join("")}
      ${renderAdvancedQualityWarning(result)}
    </article>`;
}

function renderFilteredList(result) {
  return `<article class="stats-answer-card advanced-result" data-advanced-result>
    <div class="stats-answer-heading"><div><p class="eyebrow">Deterministic multi-stat filter</p><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3><span>${escapeHtml(result.conditionLogic.toUpperCase())} conditions · thresholds unchanged</span></div></div>
    ${renderAdvancedActions(result, ["table"])}
    <div class="interpreted-filters" aria-label="Interpreted editable conditions">${result.conditions.map((condition) => `<button type="button" data-edit-stat-condition title="Edit this condition in the research query">${escapeHtml(condition.label)} ${escapeHtml(condition.operator)} ${condition.value}${condition.maxValue !== null ? `–${condition.maxValue}` : ""}</button>`).join("")}</div>
    ${result.rows.length ? `<div class="stats-table-wrap"><table class="stats-table"><caption>Qualified entities · sample historical rows</caption><thead><tr><th scope="col">Entity</th><th scope="col">Why qualified</th><th scope="col">Sample</th></tr></thead><tbody>${result.rows.map((row) => `<tr><th scope="row">${athleteLink(row.entity)}</th><td>${escapeHtml(row.reason)}</td><td>${row.sampleSize}</td></tr>`).join("")}</tbody></table></div>` : `<div class="stats-empty"><h4>No entities qualified</h4><p>EdgeBoard did not relax the interpreted thresholds.</p></div>`}
    ${result.warnings.map((warning) => `<p class="data-warning">${escapeHtml(warning)}</p>`).join("")}
    ${renderAdvancedQualityWarning(result)}
  </article>`;
}

function renderRecordResult(result) {
  if (!result.entity) return `<div class="stats-empty"><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3><p>${escapeHtml(result.message)}</p></div>`;
  return `<article class="stats-answer-card advanced-result" data-advanced-result>
    <div class="stats-answer-heading"><div><p class="eyebrow">Dataset-scoped high</p><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3><span>${escapeHtml(result.scope)}</span></div></div>
    ${renderAdvancedActions(result, ["cards"])}
    <div class="record-result-value"><strong>${escapeHtml(result.value)}</strong><span>${escapeHtml(result.statLabel)}</span></div>
    <p>${athleteLink(result.entity)} · ${result.supportingEvent ? `${supportingEventLink(result.supportingEvent.eventId, result.supportingEvent.eventName || result.supportingEvent.eventId)} · ${formatDateTime(result.supportingEvent.date)}` : "Supporting event unavailable"}</p>
    <dl class="record-validation"><div><dt>Validation</dt><dd>${escapeHtml(result.validationStatus)}</dd></div><div><dt>Coverage</dt><dd>${escapeHtml(result.dataCoverage)}</dd></div></dl>
    <p class="data-warning">${escapeHtml(result.completenessWarning)}</p>
    ${renderAdvancedQualityWarning(result)}
  </article>`;
}

function renderHeadToHead(result) {
  return `<article class="stats-answer-card advanced-result" data-advanced-result>
    <div class="stats-answer-heading"><div><p class="eyebrow">Head-to-head history</p><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3><span>Direct meetings remain separate from common-opponent context</span></div></div>
    ${renderAdvancedActions(result, ["table"])}
    <p>${result.entities.map((entity) => athleteLink(entity)).join(" vs ")}</p>
    <div class="h2h-grid"><section><h4>Direct meetings</h4>${result.directMeetings.length ? result.directMeetings.map((meeting) => `<div><strong>${supportingEventLink(meeting.eventId, formatDateTime(meeting.date))}</strong><span>${escapeHtml(meeting.result || "Result unavailable")} · ${escapeHtml(meeting.competition || "Competition unavailable")}</span></div>`).join("") : "<p>No prior direct meeting in the sample.</p>"}</section>
    <section><h4>Common opponents · indirect</h4>${result.commonOpponents.length ? result.commonOpponents.map((item) => `<div><strong>${escapeHtml(item.opponentId)}</strong><span>Samples ${item.leftSample} and ${item.rightSample}</span></div>`).join("") : "<p>No common-opponent rows in the sample.</p>"}</section></div>
    ${result.warnings.map((warning) => `<p class="data-warning">${escapeHtml(warning)}</p>`).join("")}
    ${renderAdvancedQualityWarning(result)}
  </article>`;
}

function renderEventExplorer(result) {
  return `<article class="stats-answer-card advanced-result" data-advanced-result>
    <div class="stats-answer-heading"><div><p class="eyebrow">Historical event explorer</p><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3><span>Completed sample events only</span></div></div>
    ${renderAdvancedActions(result, ["table"])}
    ${result.events.length ? `<div class="event-explorer-list">${result.events.map((event) => `<article><div><strong>${supportingEventLink(event.eventId, event.eventName)}</strong><span>${formatDateTime(event.date)} · ${escapeHtml(event.competition || "Competition unavailable")} · ${escapeHtml(event.venue || "Venue unavailable")}</span></div><div>${event.notablePerformances.map((performance) => `<span>${performance.entity ? athleteLink(performance.entity) : escapeHtml(performance.entityId)}</span>`).join("")}</div></article>`).join("")}</div>` : `<div class="stats-empty"><h4>No completed events</h4><p>No provider events match the interpreted filters.</p></div>`}
    ${result.warnings.map((warning) => `<p class="data-warning">${escapeHtml(warning)}</p>`).join("")}
    ${renderAdvancedQualityWarning(result)}
  </article>`;
}

function renderResearchAnswer(answer) {
  if (!answer) return "";
  const completeness = answer.researchCompleteness;
  const source = answer.disclosure;
  return `
    <article class="research-answer-card" data-completeness="${escapeHtml(completeness.level.toLowerCase())}">
      <header class="research-answer-header">
        <div>
          <p class="eyebrow">EdgeBoard deterministic analyst</p>
          <h2 id="researchAnswerTitle">${escapeHtml(answer.headline)}</h2>
          <p class="research-answer-summary">${escapeHtml(answer.summary)}</p>
        </div>
        <div class="research-completeness" aria-label="Research completeness: ${escapeHtml(completeness.level)}">
          <span>Research completeness</span>
          <strong>${escapeHtml(completeness.level)}</strong>
          <small>${completeness.score}/100</small>
        </div>
      </header>

      <div class="research-disclosure" aria-label="Research transparency">
        <div><span>Source</span><strong>${escapeHtml(source.source)}</strong></div>
        <div><span>Sample size</span><strong>${source.sampleSize || "Unavailable"}</strong></div>
        <div><span>Date range</span><strong>${escapeHtml(source.dateRange || "Unavailable")}</strong></div>
        <div><span>Coverage</span><strong>${escapeHtml(source.coverage)}</strong></div>
        <div><span>Validation</span><strong>${escapeHtml(source.validation)}</strong></div>
        <div><span>Freshness</span><strong>${formatDateTime(source.freshness, "Unavailable")}</strong></div>
      </div>

      <section class="research-answer-section" aria-labelledby="researchEvidenceTitle">
        <h3 id="researchEvidenceTitle">Evidence</h3>
        <ul>${answer.sections.find((section) => section.id === "evidence").items.map((item) =>
          `<li>${escapeHtml(item.text)}${item.evidenceIds.length ? `<small>${item.evidenceIds.map((id) => `#${escapeHtml(id)}`).join(" · ")}</small>` : ""}</li>`).join("")}</ul>
      </section>

      <details class="research-explanation" open>
        <summary>Full explanation and counterpoints</summary>
        <div class="research-explanation-grid">
          ${answer.sections.filter((section) => section.id !== "evidence").map((section) => `
            <section aria-labelledby="research-${escapeHtml(section.id)}">
              <h3 id="research-${escapeHtml(section.id)}">${escapeHtml(section.title)}</h3>
              <ul>${section.items.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>
            </section>
          `).join("")}
        </div>
      </details>

      ${answer.supportingTables.map((table) => `
        <details class="research-supporting-table">
          <summary>${escapeHtml(table.caption)}</summary>
          <div class="stats-table-wrap"><table class="stats-table">
            <caption>${escapeHtml(table.caption)}</caption>
            <thead><tr>${table.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead>
            <tbody>${table.rows.map((row) => `<tr>${row.map((value, index) =>
              `<${index === 0 ? "th scope=\"row\"" : "td"}>${escapeHtml(value)}</${index === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</tbody>
          </table></div>
        </details>
      `).join("")}

      ${answer.relatedEntities.length ? `
        <section class="research-related" aria-labelledby="researchRelatedEntities">
          <h3 id="researchRelatedEntities">Related athletes and teams</h3>
          <div>${answer.relatedEntities.map((entity) =>
            entity.entityType === "team"
              ? `<span class="research-related-chip">${escapeHtml(entity.name)}</span>`
              : `<a class="text-button" href="${escapeHtml(profileUrl(entity.id))}" data-open-athlete="${escapeHtml(entity.id)}">${escapeHtml(entity.name)} profile</a>`).join("")}</div>
        </section>
      ` : ""}

      ${answer.relatedProps.length ? `
        <section class="research-related" aria-labelledby="researchRelatedProps">
          <h3 id="researchRelatedProps">Related provider-confirmed props</h3>
          <div class="research-related-props">${answer.relatedProps.map((prop) => `
            <article>
              <strong>${escapeHtml(prop.name)} · ${escapeHtml(prop.marketName)}</strong>
              <span>${escapeHtml(prop.line)} · ${formatOdds(prop.odds)} · ${escapeHtml(prop.sportsbook)}</span>
              <small>Updated ${formatDateTime(prop.updatedAt)}</small>
              <button type="button" class="text-button" data-ai-market-add="${escapeHtml(prop.selectionId)}" data-ai-market-league="${escapeHtml(prop.leagueId)}">Add to research slip</button>
            </article>
          `).join("")}</div>
        </section>
      ` : ""}

      ${answer.relatedInsights.length ? `
        <section class="research-related" aria-labelledby="researchRelatedInsights">
          <h3 id="researchRelatedInsights">Related validated insights</h3>
          <ul>${answer.relatedInsights.map((insight) =>
            `<li><strong>${escapeHtml(insight.headline)}</strong><span>${escapeHtml(insight.summary)}</span><small>${escapeHtml(insight.validation)}</small></li>`).join("")}</ul>
        </section>
      ` : ""}

      <section class="research-related" aria-labelledby="researchFollowUps">
        <h3 id="researchFollowUps">Related questions</h3>
        <div>${answer.relatedQuestions.map((item) =>
          item.type === "profile"
            ? `<a class="text-button" href="${escapeHtml(profileUrl(item.entityId))}" data-open-athlete="${escapeHtml(item.entityId)}">${escapeHtml(item.label)}</a>`
            : item.type === "entity-profile"
              ? `<a class="text-button" href="${escapeHtml(entityProfileUrl(item.entityId))}" data-open-entity="${escapeHtml(item.entityId)}">${escapeHtml(item.label)}</a>`
            : `<button type="button" class="text-button" data-ai-followup="${escapeHtml(item.query)}">${escapeHtml(item.label)}</button>`).join("")}</div>
      </section>

      <details class="research-plan">
        <summary>Interpreted research plan · ${escapeHtml(answer.plan.questionType.replaceAll("_", " "))}</summary>
        <ol>${answer.plan.stages.map((stage) => `
          <li data-status="${escapeHtml(stage.status)}"><strong>${escapeHtml(stage.label)}</strong><span>${escapeHtml(stage.detail)}</span></li>
        `).join("")}</ol>
        <p>${escapeHtml(answer.languagePolicy)}</p>
      </details>

      <div class="research-quality">
        <strong>Data quality</strong>
        ${source.warnings.length
          ? `<ul>${source.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
          : "<p>No additional provider warning was returned.</p>"}
        ${completeness.reasons.length
          ? `<ul>${completeness.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`
          : ""}
        <p>Research Completeness measures evidence coverage, sample size, freshness, and missing data. It is not betting confidence or win probability.</p>
      </div>
    </article>
  `;
}

function renderStatsAnswer(result) {
  if (!result) {
    return `<div class="stats-empty"><h3 id="statsResultTitle">Ask a statistical question</h3><p>Use a sample athlete, team, split, comparison, or leaderboard query. Stats mode does not require odds or a betting market.</p></div>`;
  }
  if (["empty", "unsupported", "error"].includes(result.type)) {
    return `<div class="stats-empty ${escapeHtml(result.type)}"><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3><p>${escapeHtml(result.message)}</p>
      ${result.suggestions?.length ? `<ul>${result.suggestions.map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`).join("")}</ul>` : ""}</div>`;
  }
  if (result.type === "ambiguous") {
    return `<div class="stats-empty ambiguous"><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3><p>${escapeHtml(result.message)}</p>
      <div class="entity-candidates">${(result.candidates || []).map((candidate) => `
        <span><button type="button" data-entity-candidate="${escapeHtml(candidate.id)}">${escapeHtml(candidate.name)} · ${escapeHtml(candidate.leagueId.toUpperCase())} · ${candidate.active ? "Active" : "Inactive"}</button><a href="${escapeHtml(profileUrl(candidate.id))}" data-open-athlete="${escapeHtml(candidate.id)}">Profile</a></span>
      `).join("")}</div></div>`;
  }
  if (result.type === "combined") {
    const market = result.bettingContext;
    return `
      <div class="combined-result">
        <section aria-label="Observed statistics">
          <p class="eyebrow">Observed sample statistics</p>
          ${renderStatsAnswer(result.statsAnswer)}
        </section>
        <section class="combined-market-context" aria-label="Related betting context">
          <p class="eyebrow">Related betting context</p>
          ${market && !Array.isArray(market) ? `
            <h3>Provider-confirmed sample market</h3>
            <div class="combined-context-grid">
              <div><span>Market line</span><strong>${escapeHtml(market.line)}</strong></div>
              <div><span>Sportsbook odds</span><strong>${formatOdds(market.odds)}</strong></div>
              <div><span>Historical threshold results</span><strong>${market.hitCount ?? "—"} of ${market.sampleSize ?? "—"}</strong></div>
              <div><span>Observed hit rate</span><strong>${Number.isFinite(market.historicalHitRate) ? `${Math.round(market.historicalHitRate)}%` : "Unavailable"}</strong></div>
              <div><span>Model projection</span><strong>${escapeHtml(market.projection)}</strong></div>
              <div><span>Projected edge</span><strong>${escapeHtml(market.projectedEdge)}</strong></div>
              <div><span>Model confidence</span><strong>${market.confidence}% signal strength</strong></div>
              <div><span>Source</span><strong>${escapeHtml(market.sportsbook)} · ${formatDateTime(market.updatedAt)}</strong></div>
            </div>
            <p class="data-warning">Sample market context. Confidence is not a win probability, and historical hit rate is not a model projection.</p>
          ` : Array.isArray(market) && market.length ? `<div class="advanced-market-list">${market.map((item) => `
            <article><strong>${escapeHtml(item.canonicalMarketId)}</strong><span>${escapeHtml(item.line)} · ${formatOdds(item.odds)} · ${escapeHtml(item.sportsbook)}</span>
            <small>${escapeHtml(item.settlementScope)} · ${escapeHtml(item.period)} · updated ${formatDateTime(item.updatedAt)}</small>
            <button type="button" data-advanced-market-add="${escapeHtml(item.selectionId)}" ${item.available ? "" : "disabled"}>${item.available ? "Add to research slip" : item.stale ? "Stale" : "Unavailable"}</button></article>
          `).join("")}</div>` : `<div class="stats-empty"><h3>No compatible market attached</h3><p>The statistical answer remains valid in sample mode, but no fresh participant-, event-, stat-, and settlement-compatible market exists.</p></div>`}
        </section>
      </div>
    `;
  }
  if (result.type === "insight_result") {
    return `<section class="insight-query-result" aria-labelledby="statsResultTitle">
      <div class="stats-answer-heading"><div><p class="eyebrow">Evidence-backed storytelling</p><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3><span>${escapeHtml(result.message)}</span></div><span class="sample-badge">Sample data</span></div>
      <div class="profile-insights">${visibleInsightCandidates(result.insights).map((insight) =>
        renderInsightCard(insight, { context: "query" })).join("")}</div>
      <p class="stats-source">${escapeHtml(result.sources[0]?.provider)} · updated ${formatDateTime(result.lastUpdated)} · no language model is used as the statistical source of truth</p>
    </section>`;
  }
  if (["athlete_comparison", "multi_athlete_comparison", "team_comparison"].includes(result.type)) return renderComparisonResult(result);
  if (result.type === "leaderboard" && result.rows) return renderAdvancedLeaderboard(result);
  if (result.type === "multi_stat_filtered_list") return renderFilteredList(result);
  if (result.type === "record_result") return renderRecordResult(result);
  if (result.type === "head_to_head_history") return renderHeadToHead(result);
  if (result.type === "event_explorer") return renderEventExplorer(result);
  if (result.type === "leaderboard") {
    return `
      <article class="stats-answer-card">
        <div class="stats-answer-heading"><div><p class="eyebrow">Sample leaderboard</p><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3></div><span>${escapeHtml(result.context)}</span></div>
        <div class="stats-table-wrap"><table class="stats-table">
          <caption>${escapeHtml(result.statLabel)} · ${escapeHtml(result.sourceLabel)}</caption>
          <thead><tr><th scope="col">Rank</th><th scope="col">Athlete</th><th scope="col">${escapeHtml(result.statLabel)}</th><th scope="col">Sample</th></tr></thead>
          <tbody>${result.entries.map((entry) => `<tr><th scope="row">${entry.rank}</th><td>${athleteLink(entry.entity)}</td><td>${escapeHtml(entry.value)}</td><td>${entry.sampleSize}</td></tr>`).join("")}</tbody>
        </table></div>
        <p class="stats-source">Sample historical data · updated ${formatDateTime(result.lastUpdated)}</p>
      </article>
    `;
  }
  if (result.type === "player_comparison") {
    return `
      <article class="stats-answer-card">
        <div class="stats-answer-heading"><div><p class="eyebrow">Sample comparison</p><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3></div><span>${escapeHtml(result.context)}</span></div>
        <div class="comparison-grid">${result.entities.map((entry) => `
          <section>${renderAthleteMedia(entry.media)}<h4>${athleteLink(entry.entity)}</h4>
            ${Object.values(entry.stats).map((stat) => `<div class="supporting-stat"><span>${escapeHtml(stat.label)}</span><strong>${escapeHtml(stat.value)}</strong><small>${stat.sampleSize} events</small></div>`).join("")}
          </section>
        `).join("")}</div>
        <p class="stats-source">Sample historical data · updated ${formatDateTime(result.lastUpdated)}</p>
      </article>
    `;
  }
  if (result.type === "split_summary") {
    return `
      <article class="stats-answer-card">
        <div class="stats-answer-heading"><div><p class="eyebrow">Sample split</p><h3 id="statsResultTitle">${athleteLink(result.entity)}</h3><span>${escapeHtml(result.title)}</span></div>${renderAthleteMedia(result.media)}</div>
        <div class="split-grid">${result.splits.map((split) => `
          <section><h4>${escapeHtml(split.label)}</h4><span>${split.sampleSize} events</span>
            ${Object.values(split.stats).map((stat) => `<div class="supporting-stat"><span>${escapeHtml(stat.label)}</span><strong>${escapeHtml(stat.value)}</strong></div>`).join("")}
          </section>
        `).join("")}</div>
        <p class="stats-source">Sample historical data · updated ${formatDateTime(result.lastUpdated)}</p>
      </article>
    `;
  }
  if (result.type === "game_log") {
    return `<article class="stats-answer-card"><div class="stats-answer-heading"><div><p class="eyebrow">Sample game log</p><h3 id="statsResultTitle">${athleteLink(result.entity)}</h3><span>${escapeHtml(result.title)}</span></div>${renderAthleteMedia(result.media)}</div>
      ${renderStatsTable(result)}<p class="stats-source">Sample historical data · ${result.sampleSize} completed events · updated ${formatDateTime(result.lastUpdated)}</p></article>`;
  }
  const showGameLog = state.statsResultTab === "game-log";
  return `
    <article class="stats-answer-card">
      <div class="stats-answer-heading">
        <div><p class="eyebrow">Instant stat answer</p><h3 id="statsResultTitle">${athleteLink(result.entity)}</h3><span>${escapeHtml(result.context)}</span></div>
        ${renderAthleteMedia(result.media)}
      </div>
      <div class="stats-result-tabs" role="tablist" aria-label="Stat result view">
        <button type="button" role="tab" data-stats-tab="summary" aria-selected="${!showGameLog}" tabindex="${showGameLog ? -1 : 0}">Summary</button>
        <button type="button" role="tab" data-stats-tab="game-log" aria-selected="${showGameLog}" tabindex="${showGameLog ? 0 : -1}">Game log</button>
      </div>
      ${showGameLog ? renderStatsTable({ ...result, statIds: result.structuredQuery.statIds }) : `
        <div class="instant-stat-value"><strong>${escapeHtml(result.primaryValue)}</strong><span>${escapeHtml(result.primaryLabel)}</span></div>
        <div class="stats-supporting-row">
          <div><span>Sample size</span><strong>${result.sampleSize} events</strong></div>
          ${result.supportingStats.map((stat) => `<div><span>${escapeHtml(stat.label)}</span><strong>${escapeHtml(stat.value)}</strong></div>`).join("")}
          ${result.threshold ? `<div><span>Threshold hits</span><strong>${result.threshold.hitCount} of ${result.threshold.sampleSize}</strong></div>` : ""}
        </div>
        ${result.insights?.length ? renderInsightCard(result.insights[0], { context: "query" }) : ""}
      `}
      <p class="stats-source">Sample historical data · updated ${formatDateTime(result.lastUpdated)} · calculations use supplied rows only</p>
      <p class="data-warning">${escapeHtml(result.dataQualityWarning)}</p>
    </article>
  `;
}

function renderResearchMode() {
  const statsVisible = state.researchMode !== "betting";
  const bettingVisible = state.researchMode === "betting" || state.showBettingResearch;
  elements.researchModeControl.querySelectorAll("[data-research-mode]").forEach((button) => {
    const active = button.dataset.researchMode === state.researchMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  elements.statsResults.hidden = !statsVisible;
  elements.statsResults.setAttribute("aria-busy", String(state.statsLoading));
  elements.statsLoading.hidden = !state.statsLoading;
  elements.statsInterpretation.innerHTML = statsVisible ? renderInterpretation(state.statsParsedQuery) : "";
  elements.statsResultContent.innerHTML = statsVisible && !state.statsLoading ? renderStatsAnswer(state.statsResult) : "";
  elements.researchAnswer.hidden = !state.researchAnswer || state.statsLoading;
  elements.researchAnswerContent.innerHTML = state.researchAnswer && !state.statsLoading
    ? renderResearchAnswer(state.researchAnswer)
    : "";
  elements.bettingFilters.hidden = !bettingVisible;
  elements.answerCard.hidden = !bettingVisible;
  elements.betGrid.hidden = !bettingVisible;
  if (!bettingVisible) elements.analystWorkflow.hidden = true;
  elements.betSlip.hidden = !bettingVisible;
  elements.mobileSlipToggle.hidden = !bettingVisible;
  elements.bettingEventBoard.hidden = !bettingVisible;
  elements.researchIntentNav.hidden = state.researchMode === "stats";
  elements.researchResults.dataset.mode = state.researchMode;
  document.querySelector("#researchWorkspace").classList.toggle("stats-only", !bettingVisible);
  if (state.researchMode === "stats") {
    document.querySelector("#answerTitle").textContent = "Statistical research";
    elements.queryFeedback.textContent = "Stats mode uses deterministic sample historical rows and does not require odds.";
  } else if (state.researchMode === "both") {
    document.querySelector("#answerTitle").textContent = "Stats and related betting context";
    elements.queryFeedback.textContent = state.showBettingResearch
      ? "Both mode found compatible observed statistics and sample betting context."
      : "Both mode attaches betting context only when a compatible fresh sample market exists.";
  } else {
    elements.queryFeedback.textContent = "Betting mode uses available sample markets and model context.";
  }
}

function parseWorkspaceRoute(params = new URLSearchParams(window.location.search)) {
  if (!params.has("workspace")) return null;
  return {
    workspaceId: params.get("workspace") || "workspace-local-default",
    view: params.get("saved") ? "item" : params.get("board") ? "board" : params.get("workspaceView") || "home",
    boardId: params.get("board") || "",
    itemId: params.get("saved") || "",
    watchlistId: params.get("watchlist") || "",
    query: "",
  };
}

function setWorkspaceUrl(route, { replace = false } = {}) {
  const url = new URL(window.location.href);
  ["workspace", "workspaceView", "board", "saved", "watchlist"].forEach((key) => url.searchParams.delete(key));
  if (route) {
    url.searchParams.set("workspace", route.workspaceId || "workspace-local-default");
    url.searchParams.set("workspaceView", route.view || "home");
    if (route.boardId) url.searchParams.set("board", route.boardId);
    if (route.itemId) url.searchParams.set("saved", route.itemId);
    if (route.watchlistId) url.searchParams.set("watchlist", route.watchlistId);
  }
  history[replace ? "replaceState" : "pushState"]({ edgeboardWorkspace: Boolean(route) }, "", url);
}

function updateWorkspaceCounts(viewModel = state.workspaceViewModel) {
  const counts = viewModel?.counts || { saved: 0, alerts: 0 };
  elements.workspaceSavedCount.textContent = String(counts.saved);
  elements.workspaceSavedCount.setAttribute("aria-label", `${counts.saved} saved item${counts.saved === 1 ? "" : "s"}`);
  elements.workspaceAlertCount.textContent = String(counts.alerts);
  elements.workspaceAlertCount.setAttribute("aria-label", `${counts.alerts} unread alert${counts.alerts === 1 ? "" : "s"}`);
}

function applyWorkspaceVisibility() {
  document.body.classList.toggle("workspace-active", state.workspaceActive);
  elements.personalWorkspaceView.hidden = !state.workspaceActive;
  elements.workspaceLoading.hidden = !state.workspaceActive || !state.workspaceLoading;
  if (state.workspaceActive) {
    elements.visualAnalyticsView.hidden = true;
    elements.entityProfileView.hidden = true;
    elements.athleteProfileView.hidden = true;
  }
}

async function loadWorkspace({ focusHeading = false } = {}) {
  state.workspaceLoading = true;
  applyWorkspaceVisibility();
  try {
    const { service, renderer, repository } = await loadWorkspaceModules();
    const route = state.workspaceRoute || { workspaceId: "workspace-local-default", view: "home" };
    let viewModel = service.buildWorkspaceViewModel(repository.snapshot(), route.workspaceId, route);
    if (viewModel.status === "not-found") {
      const fallback = repository.listWorkspaces()[0];
      if (fallback) {
        state.workspaceRoute = { workspaceId: fallback.id, view: "home" };
        setWorkspaceUrl(state.workspaceRoute, { replace: true });
        viewModel = service.buildWorkspaceViewModel(repository.snapshot(), fallback.id, state.workspaceRoute);
      } else if (repository.getDiagnostics().storageStatus === "ready") {
        const created = await repository.createWorkspace({ title: "My EdgeBoard", description: "Local personal workspace" });
        state.workspaceRoute = { workspaceId: created.id, view: "home" };
        setWorkspaceUrl(state.workspaceRoute, { replace: true });
        viewModel = service.buildWorkspaceViewModel(repository.snapshot(), created.id, state.workspaceRoute);
      }
    }
    viewModel.storageDiagnostics = repository.getDiagnostics();
    if (viewModel.status === "ready" && route.view === "saved" && (route.query || Object.keys(route.filters || {}).length)) {
      const matches = service.searchWorkspace(repository.snapshot(), route.query, { workspaceId: route.workspaceId, ...(route.filters || {}) });
      viewModel.savedObjects = matches.map((result) => result.item);
    }
    if (viewModel.status === "ready" && route.view === "settings") {
      viewModel.storage = await repository.getStorageEstimate();
    }
    state.workspaceViewModel = viewModel;
    elements.workspaceContent.innerHTML = renderer.renderWorkspace(viewModel);
    updateWorkspaceCounts(viewModel);
    if (!workspaceExternalUnsubscribe) {
      workspaceExternalUnsubscribe = repository.subscribe((event) => {
        if (event.type === "external_update") {
          elements.workspaceStatus.innerHTML = 'A newer local update is available in another tab. <button type="button" data-load-external>Load newer</button>';
        } else if (!state.workspaceActive) {
          const vm = service.buildWorkspaceViewModel(repository.snapshot(), route.workspaceId, { view: "home" });
          updateWorkspaceCounts(vm);
        }
      });
    }
    if (focusHeading) {
      const heading = elements.workspaceContent.querySelector("h1, h2");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus?.({ preventScroll: true });
    }
  } catch (error) {
    elements.workspaceContent.innerHTML = `<div class="workspace-empty" role="alert"><h1>Local workspace unavailable</h1><p>${escapeHtml(error?.message || "The browser could not open local workspace storage.")}</p></div>`;
    elements.workspaceStatus.textContent = "No EdgeBoard research data was changed.";
  } finally {
    state.workspaceLoading = false;
    applyWorkspaceVisibility();
  }
}

async function openWorkspace(route = null, { replace = false, focusHeading = true, updateUrl = true } = {}) {
  state.workspaceActive = true;
  state.workspaceRoute = route || state.workspaceRoute || { workspaceId: "workspace-local-default", view: "home" };
  if (updateUrl) setWorkspaceUrl(state.workspaceRoute, { replace });
  await loadWorkspace({ focusHeading });
}

function closeWorkspace({ updateUrl = true } = {}) {
  state.workspaceActive = false;
  state.workspaceRoute = null;
  if (updateUrl) setWorkspaceUrl(null);
  applyWorkspaceVisibility();
  renderAthleteProfile();
  renderEntityProfile();
  renderVisualAnalytics();
}

function safeSnapshot(value, fallback = {}) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return fallback;
  }
}

function currentWorkspaceCandidate() {
  const league = currentLeague();
  const queryText = elements.queryInput.value.trim();
  const sourceState = {
    mode: state.researchMode,
    sportId: league?.sportId || "",
    leagueId: league?.leagueId || "",
    queryText,
    structuredQuery: safeSnapshot(state.statsParsedQuery || state.researchPlan || {}),
  };
  const base = {
    title: queryText || `${league?.leagueDisplayName || "EdgeBoard"} research`,
    description: "Saved structured EdgeBoard research",
    type: "saved_research",
    boardId: "board-saved-research",
    sourceState,
    canonicalReferences: { entityIds: [], eventIds: [], marketIds: [], insightIds: [], queryId: null, visualizationId: null },
    researchSnapshot: { summary: queryText || "Current EdgeBoard research context", source: "EdgeBoard sample providers", sample: true },
    sample: true,
  };
  if (state.visualResult || state.visualRequest) {
    const entityIds = state.visualRequest?.entityIds || [];
    return { ...base, type: "saved_visualization", boardId: "board-visuals", title: state.visualResult?.title || "Saved visual analytics", canonicalReferences: { ...base.canonicalReferences, entityIds, visualizationId: state.visualRequest?.visualizationType || null }, researchSnapshot: safeSnapshot(state.visualResult || state.visualRequest) };
  }
  if (state.profileViewModel?.status === "ready") {
    const profile = state.profileViewModel;
    return { ...base, type: "saved_entity", boardId: "board-stats-trends", title: `${profile.athlete?.displayName || profile.athlete?.name || "Athlete"} profile`, canonicalReferences: { ...base.canonicalReferences, entityIds: [state.profileAthleteId] }, researchSnapshot: safeSnapshot({ athlete: profile.athlete, summary: profile.summary, source: profile.source }) };
  }
  if (state.entityProfileViewModel?.status === "ready") {
    const profile = state.entityProfileViewModel;
    return { ...base, type: "saved_entity", boardId: "board-stats-trends", title: `${profile.entity?.displayName || profile.entity?.name || "Entity"} profile`, canonicalReferences: { ...base.canonicalReferences, entityIds: [state.entityProfileId] }, researchSnapshot: safeSnapshot({ entity: profile.entity, summary: profile.summary, source: profile.source }) };
  }
  if (state.statsResult) {
    const result = state.statsResult;
    const kind = String(result.type || result.kind || state.statsParsedQuery?.intent || "");
    const type = kind.includes("comparison") ? "saved_comparison" : kind.includes("leaderboard") ? "saved_leaderboard" : "saved_query";
    return { ...base, type, boardId: "board-stats-trends", title: result.title || result.headline || queryText || "Saved statistical research", canonicalReferences: { ...base.canonicalReferences, entityIds: [result.entity?.id, ...(result.entities || []).map((item) => item.id)].filter(Boolean) }, researchSnapshot: safeSnapshot(result) };
  }
  if (state.researchAnswer) return { ...base, type: "saved_answer", boardId: "board-betting-research", title: state.researchAnswer.headline || queryText || "Saved research answer", researchSnapshot: safeSnapshot(state.researchAnswer) };
  return base;
}

async function openWorkspaceSave(candidate = currentWorkspaceCandidate()) {
  const { renderer, repository } = await loadWorkspaceModules();
  const workspace = repository.listWorkspaces()[0];
  const boards = repository.listBoards(workspace.id, { includeArchived: true });
  const boardId = boards.some((board) => board.id === candidate.boardId)
    ? candidate.boardId : boards.find((board) => !board.isArchived)?.id;
  state.workspaceCandidate = { ...candidate, workspaceId: workspace.id, boardId };
  state.workspaceDuplicate = null;
  elements.workspaceSaveDialogContent.innerHTML = renderer.renderSaveDialogFields({ boards, candidate: state.workspaceCandidate });
  elements.workspaceSaveDialog.showModal();
  elements.workspaceSaveDialog.querySelector("input[name=title]")?.focus();
}

function openWorkspaceEdit(action, targetId = "", title = "", description = "") {
  const form = elements.workspaceEditForm;
  form.reset();
  form.elements.action.value = action;
  form.elements.targetId.value = targetId;
  form.elements.title.value = title;
  form.elements.description.value = description;
  form.querySelector("[data-track-idea-only]").hidden = action !== "track-slip";
  elements.workspaceEditDialog.showModal();
  form.elements.title.focus();
}

function confirmWorkspaceAction(action, targetId, message, phrase = "") {
  const form = elements.workspaceConfirmForm;
  form.reset();
  form.elements.action.value = action;
  form.elements.targetId.value = targetId;
  elements.workspaceConfirmMessage.textContent = message;
  elements.workspaceConfirmTextLabel.hidden = !phrase;
  form.elements.confirmationText.required = Boolean(phrase);
  form.dataset.phrase = phrase;
  elements.workspaceConfirmDialog.showModal();
}

function downloadWorkspaceJson(payload, filename = "edgeboard-workspace.json") {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
  renderInsightDiscovery();
  renderResearchMode();
  renderAthleteProfile();
  renderEntityProfile();
  applyWorkspaceVisibility();
  if (elements.discoveryDrawer.classList.contains("open")) renderDiscovery();
}

function setProfileUrl(athleteId, tab, { replace = false } = {}) {
  const url = new URL(window.location.href);
  if (athleteId) {
    url.searchParams.set("player", athleteId);
    url.searchParams.set("tab", tab || "overview");
    url.searchParams.delete("entityProfile");
  } else {
    url.searchParams.delete("player");
    url.searchParams.delete("tab");
    url.searchParams.delete("insight");
  }
  const method = replace ? "replaceState" : "pushState";
  history[method]({ edgeboardProfile: Boolean(athleteId), athleteId, tab }, "", url);
}

function resetProfileControls() {
  state.profileLogWindow = 10;
  state.profileLogSort = "newest";
  state.profileHomeAway = "all";
  state.profileOpponent = "";
  state.profileResult = "all";
  state.profileVisibleColumns = [];
  state.profileSplitDimension = "";
  state.profileTrendStatId = "";
  state.profileTrendWindow = 10;
  state.profileTrendThreshold = "";
  state.profilePropGroup = "all";
  state.profileSportsbook = "all";
  state.profileInsightCategory = "recent";
}

async function loadAthleteProfile({ focusHeading = false } = {}) {
  if (!state.profileAthleteId) {
    state.profileViewModel = null;
    state.profileLoading = false;
    renderAthleteProfile();
    return;
  }
  const requestId = ++profileRequestSequence;
  state.profileLoading = true;
  state.profileViewModel = null;
  renderAthleteProfile();
  const result = await athleteProfileRepository.getProfile(state.profileAthleteId, {
    logWindow: state.profileLogWindow,
    homeAway: state.profileHomeAway,
    opponent: state.profileOpponent,
    result: state.profileResult,
    splitDimension: state.profileSplitDimension,
    trendStatId: state.profileTrendStatId,
    trendWindow: state.profileTrendWindow,
    includeBettingContext: state.researchMode === "both",
  });
  if (requestId !== profileRequestSequence || state.profileAthleteId !== (result.athlete?.id || result.athleteId)) return;
  state.profileLoading = false;
  state.profileViewModel = result;
  if (result.status === "ready") {
    const validTabs = result.tabs.map((tab) => tab.id);
    if (!validTabs.includes(state.profileTab)) {
      state.profileTab = "overview";
      setProfileUrl(state.profileAthleteId, state.profileTab, { replace: true });
    }
  }
  renderAthleteProfile();
  if (state.sharedInsightId && !state.sharedInsightOpened) {
    const sharedInsight = insightService.getInsight(state.sharedInsightId);
    if (sharedInsight) {
      state.sharedInsightOpened = true;
      renderInsightDialog(sharedInsight);
    }
  }
  if (focusHeading) {
    const heading = document.querySelector("#athleteProfileTitle");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    elements.athleteProfileView.scrollIntoView({ block: "start" });
  }
}

function openAthleteProfile(athleteId, tab = "overview", { replace = false, focusHeading = true } = {}) {
  if (!athleteId) return;
  entityProfileAbortController?.abort();
  entityProfileRequestSequence += 1;
  state.entityProfileId = "";
  state.entityProfileViewModel = null;
  state.entityProfileLoading = false;
  state.sharedInsightId = "";
  state.sharedInsightOpened = false;
  state.profileAthleteId = athleteId;
  state.profileTab = tab || "overview";
  resetProfileControls();
  setProfileUrl(athleteId, state.profileTab, { replace });
  renderEntityProfile();
  loadAthleteProfile({ focusHeading }).catch((error) => {
    if (!state.profileAthleteId) return;
    state.profileLoading = false;
    state.profileViewModel = { status: "not-found", athleteId, error: error?.message || "Profile unavailable" };
    renderAthleteProfile();
  });
  recordWorkspaceActivity("opened_profile", "athlete", athleteId, entityRegistry.getEntity(athleteId)?.name || athleteId);
}

function closeAthleteProfile({ useHistory = true } = {}) {
  profileRequestSequence += 1;
  state.profileAthleteId = "";
  state.profileViewModel = null;
  state.profileLoading = false;
  renderAthleteProfile();
  setProfileUrl("", "", { replace: !useHistory });
  document.querySelector("[data-open-athlete]")?.focus({ preventScroll: true });
}

function setEntityProfileUrl(entityId, { replace = false } = {}) {
  const url = new URL(window.location.href);
  if (entityId) {
    url.searchParams.set("entityProfile", entityId);
    url.searchParams.delete("player");
    url.searchParams.delete("tab");
  } else {
    url.searchParams.delete("entityProfile");
  }
  history[replace ? "replaceState" : "pushState"]({ edgeboardEntityProfile: Boolean(entityId), entityId }, "", url);
}

async function loadEntityProfile({ focusHeading = false } = {}) {
  if (!state.entityProfileId) {
    state.entityProfileViewModel = null;
    state.entityProfileLoading = false;
    renderEntityProfile();
    return;
  }
  entityProfileAbortController?.abort();
  entityProfileAbortController = new AbortController();
  const requestId = ++entityProfileRequestSequence;
  state.entityProfileLoading = true;
  state.entityProfileViewModel = null;
  renderEntityProfile();
  try {
    const result = await entityProfileRepository.getProfile(state.entityProfileId, {
      signal: entityProfileAbortController.signal,
    });
    if (requestId !== entityProfileRequestSequence || state.entityProfileId !== (result.entity?.id || result.entityId)) return;
    state.entityProfileLoading = false;
    state.entityProfileViewModel = result;
    renderEntityProfile();
    if (focusHeading) {
      const heading = document.querySelector("#entityProfileTitle");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
      elements.entityProfileView.scrollIntoView({ block: "start" });
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (requestId !== entityProfileRequestSequence) return;
    state.entityProfileLoading = false;
    state.entityProfileViewModel = { status: "not-found", entityId: state.entityProfileId, error: error?.message };
    renderEntityProfile();
  }
}

function openEntityProfile(entityId, { replace = false, focusHeading = true } = {}) {
  if (!entityId) return;
  profileRequestSequence += 1;
  state.profileAthleteId = "";
  state.profileViewModel = null;
  state.profileLoading = false;
  state.entityProfileId = entityId;
  setEntityProfileUrl(entityId, { replace });
  renderAthleteProfile();
  loadEntityProfile({ focusHeading });
  recordWorkspaceActivity("opened_profile", "entity", entityId, entityRegistry.getEntity(entityId)?.name || entityId);
}

function closeEntityProfile({ useHistory = true } = {}) {
  entityProfileAbortController?.abort();
  entityProfileRequestSequence += 1;
  state.entityProfileId = "";
  state.entityProfileViewModel = null;
  state.entityProfileLoading = false;
  elements.entityProfileSlipPanel.hidden = true;
  elements.entityProfileSlipToggle.setAttribute("aria-expanded", "false");
  renderEntityProfile();
  setEntityProfileUrl("", { replace: !useHistory });
  document.querySelector("[data-open-entity]")?.focus({ preventScroll: true });
}

function openSearchResult(result) {
  if (!result) return;
  if (result.profileSystem === "athlete") openAthleteProfile(result.id);
  else openEntityProfile(result.id);
}

function renderAthleteSearchResults() {
  const results = state.athleteSearchResults;
  elements.athleteSearchResults.hidden = results.length === 0;
  elements.queryInput.setAttribute("aria-expanded", String(results.length > 0));
  elements.queryInput.setAttribute(
    "aria-activedescendant",
    state.athleteSearchIndex >= 0 ? `athlete-search-option-${state.athleteSearchIndex}` : "",
  );
  elements.athleteSearchResults.innerHTML = results.map((entity, index) => `
    <a id="athlete-search-option-${index}" role="option" aria-selected="${index === state.athleteSearchIndex}" href="${escapeHtml(entity.profileSystem === "athlete" ? profileUrl(entity.id) : entityProfileUrl(entity.id))}" ${entity.profileSystem === "athlete" ? `data-open-athlete="${escapeHtml(entity.id)}"` : `data-open-entity="${escapeHtml(entity.id)}"`}>
      <span>${escapeHtml(entity.name)}${entity.active ? "" : " · Inactive"}</span>
      <small>${escapeHtml(entity.typeLabel)}${entity.context ? ` · ${escapeHtml(entity.context)}` : ""}</small>
    </a>
  `).join("");
}

function updateAthleteSearch(query) {
  const text = String(query || "").trim();
  if (text.length < 2) {
    state.athleteSearchResults = [];
    state.athleteSearchIndex = -1;
    renderAthleteSearchResults();
    return;
  }
  const matches = entityRegistry.search(text, {
    leagueId: state.leagueId,
    sportId: currentLeague()?.sportId || "",
  }, 10);
  const activeMatches = matches.filter((match) => match.active);
  state.athleteSearchResults = (activeMatches.length ? activeMatches : matches).slice(0, 6);
  state.athleteSearchIndex = -1;
  renderAthleteSearchResults();
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
    state.statsResult = null;
    state.statsParsedQuery = null;
    state.researchPlan = null;
    state.researchAnswer = null;
    state.statsContextOverrideDisabled = false;
    statsRequestSequence += 1;
  }
  state.selectedPickId = "";
  state.slip = state.slip.filter((pick) => pick.leagueId === state.leagueId);
  if (closeMenu) closeDiscovery();
  setMobileSlipOpen(false);
  state.marketBoardLoading = false;
  persistResearchState({ updateUrl: false });
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

function runBettingResearch(query) {
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
  const filteredAnswerPicks = getFilteredPicks(sportsRepository, {
    leagueId: state.leagueId,
    market: state.market,
    canonicalMarketId: state.canonicalMarketId,
    minConfidence: state.minConfidence,
    availableOnly: true,
    query,
    queryGame: state.queryGame,
  });
  const combinedMarketContext = state.researchMode === "both" && state.statsResult?.type === "combined"
    ? state.statsResult.bettingContext
    : null;
  const compatibleSelectionIds = (Array.isArray(combinedMarketContext) ? combinedMarketContext : [combinedMarketContext])
    .filter(Boolean)
    .map((market) => market.selectionId)
    .filter(Boolean);
  const answerPicks = state.researchMode === "both"
    ? compatibleSelectionIds
      .map((selectionId) => getPickBySelectionId(sportsRepository, state.leagueId, selectionId))
      .filter((pick) => pick?.available && !pick.stale)
    : filteredAnswerPicks;
  state.researchPlan = createResearchPlan({
    query,
    mode: state.researchMode,
    parsedStats: state.researchMode === "both" ? state.statsParsedQuery : null,
    bettingWorkflow: state.analystWorkflow,
    currentLeague: currentLeague(),
    availableLeagues: navigationModel.allLeagues,
    providerName: sportsRepository.getMetadata().provider,
    resolvedEntities: entityRegistry.search(query, {
      leagueId: state.leagueId,
      sportId: currentLeague()?.sportId || "",
    }, 5),
  });
  state.researchAnswer = buildResearchAnswer({
    query,
    mode: state.researchMode,
    plan: state.researchPlan,
    statsResult: state.researchMode === "both" ? state.statsResult : null,
    bettingWorkflow: state.analystWorkflow,
    bettingPicks: answerPicks,
    statsProvider: statsRepository,
  });
  renderAll();
  elements.answerCard.classList.remove("analyzed");
  requestAnimationFrame(() => elements.answerCard.classList.add("analyzed"));
}

async function runStatsResearch(query) {
  const requestId = ++statsRequestSequence;
  state.statsLoading = true;
  state.showBettingResearch = false;
  state.statsResult = null;
  state.researchAnswer = null;
  state.researchPlan = null;
  state.statsParsedQuery = parseStatisticalQuery(query, {
    mode: state.researchMode,
    sportsRepository,
    currentLeagueId: state.leagueId,
    selectedEntityId: state.selectedEntityId,
    ignoreExplicitLeague: state.statsContextOverrideDisabled,
  });
  renderResearchMode();
  await new Promise((resolve) => window.setTimeout(resolve, 140));
  if (requestId !== statsRequestSequence) return null;
  const parsed = state.statsParsedQuery;
  const plan = createResearchPlan({
    query,
    mode: state.researchMode,
    parsedStats: parsed,
    currentLeague: sportsRepository.getLeague(parsed.structuredQuery.leagueId) || currentLeague(),
    availableLeagues: navigationModel.allLeagues,
    providerName: sportsRepository.getMetadata().provider,
    resolvedEntities: entityRegistry.search(query, {
      leagueId: parsed.structuredQuery.leagueId || state.leagueId,
      sportId: parsed.structuredQuery.sportId || currentLeague()?.sportId || "",
    }, 5),
  });
  const result = buildStatsResult(statsRepository, parsed, sportsRepository, insightService, query);
  if (requestId !== statsRequestSequence) return null;
  state.statsResult = result;
  state.researchPlan = plan;
  state.researchAnswer = buildResearchAnswer({
    query,
    mode: state.researchMode,
    plan,
    statsResult: result,
    bettingPicks: [],
    statsProvider: statsRepository,
  });
  state.statsLoading = false;
  const interpretedLeague = sportsRepository.getLeague(parsed.structuredQuery.leagueId);
  if (parsed.structuredQuery.contextOverride && interpretedLeague?.enabled) {
    state.navigationSelection = normalizeNavigationSelection(
      { type: "league", id: interpretedLeague.leagueId },
      navigationModel.allLeagues,
      defaultLeague?.leagueId,
    );
    state.leagueId = interpretedLeague.leagueId;
    persistNavigationSelection();
  }
  state.showBettingResearch = state.researchMode === "both"
    && result.type === "combined"
    && Boolean(result.bettingContext);
  persistResearchState();
  renderAll();
  return result;
}

async function submitResearchQuery() {
  const query = elements.queryInput.value.trim();
  state.query = query;
  persistResearchState({
    historyMode: query && !state.restoringResearchFromUrl ? "push" : "replace",
  });
  state.restoringResearchFromUrl = false;
  if (!query) {
    statsRequestSequence += 1;
    state.statsLoading = false;
    state.statsResult = null;
    state.statsParsedQuery = null;
    state.researchPlan = null;
    state.researchAnswer = null;
    elements.queryFeedback.textContent = "Enter a sports research question.";
    renderAll();
    return;
  }
  if (/\b(chart|map|visual|plot|telemetry|passing network|line movement|odds movement|round by round|race position|lap time)\b/i.test(query)) {
    const modules = await loadVisualizationModules();
    const matches = entityRegistry.search(query, {
      leagueId: state.leagueId,
      sportId: currentLeague()?.sportId || "",
    }, 8);
    let entity = matches[0] ? entityRegistry.getEntity(matches[0].id) : null;
    const querySport = /\bformula 1|nascar|lap|telemetry|race position\b/i.test(query) ? "motorsport"
      : /\bbaseball|pitch|batter|hitter|spray\b/i.test(query) ? "baseball"
        : /\bhockey|shots? on goal|rink\b/i.test(query) ? "ice-hockey"
          : /\bsoccer|touch|passing network|corner map\b/i.test(query) ? "soccer"
            : /\bfight|fighter|strike|takedown|ufc|boxing\b/i.test(query) ? "mma"
              : /\bgolf|golfer|hole\b/i.test(query) ? "golf"
                : /\btennis|serve|rally\b/i.test(query) ? "tennis"
                  : entity?.sportId || currentLeague()?.sportId || "";
    const preliminary = modules.query.parseVisualizationQuery(query, {
      sportId: querySport,
      leagueId: entity?.leagueId || state.leagueId,
      entityType: entity?.type || "athlete",
      entityIds: entity ? [entity.id] : [],
    });
    if (preliminary.visualizationType) {
      const defaultIds = {
        shot_chart: ["wnba-caitlin-clark"],
        spray_chart: ["mlb-aaron-judge"],
        pitch_location_map: ["mlb-gerrit-cole"],
        shot_map: querySport === "soccer" ? ["mls-lionel-messi"] : ["nhl-auston-matthews"],
        heat_map: ["mls-lionel-messi"],
        passing_network: ["MIA"],
        strike_map: ["ufc-sample-fighter-a"],
        fight_timeline: ["ufc-sample-fighter-a", "ufc-sample-fighter-b"],
        race_position_chart: ["f1-max-verstappen", "f1-lando-norris"],
        lap_time_chart: ["f1-max-verstappen", "f1-lando-norris"],
        telemetry_chart: ["f1-max-verstappen", "f1-lando-norris"],
        qualifying_chart: ["f1-max-verstappen", "f1-lando-norris"],
        golf_scoring_chart: ["golf-sample-golfer"],
        golf_dispersion_map: ["golf-sample-golfer"],
        serve_placement_map: ["tennis-sample-player"],
        tennis_match_flow: ["tennis-sample-player"],
        market_line_chart: ["wnba-caitlin-clark"],
        odds_movement_chart: ["wnba-caitlin-clark"],
        threshold_chart: ["wnba-caitlin-clark"],
      }[preliminary.visualizationType] || [];
      const entityIds = entity && !["league", "promotion", "competition", "organization"].includes(entity.type)
        ? [entity.id] : defaultIds;
      entity = entityRegistry.getEntity(entityIds[0]) || entity;
      const request = {
        ...preliminary.request,
        sportId: entity?.sportId || querySport,
        leagueId: entity?.leagueId || (querySport === "motorsport" ? "f1" : state.leagueId),
        entityType: entity?.type || preliminary.request.entityType,
        entityIds,
      };
      state.researchPlan = createResearchPlan({
        query,
        mode: state.researchMode,
        currentLeague: sportsRepository.getLeague(request.leagueId) || currentLeague(),
        availableLeagues: navigationModel.allLeagues,
        providerName: sportsRepository.getMetadata().provider,
        resolvedEntities: matches,
      });
      elements.queryFeedback.textContent = `Visual request interpreted as ${preliminary.visualizationType.replaceAll("_", " ")}. Provider capability and row validation will run before rendering.`;
      openVisualAnalytics(request, { returnFocus: elements.queryInput });
      return;
    }
  }
  if (state.researchMode === "betting") {
    state.showBettingResearch = true;
    state.statsResult = null;
    state.statsParsedQuery = null;
    state.researchPlan = null;
    state.researchAnswer = null;
    runBettingResearch(query);
  } else {
    const statsResult = await runStatsResearch(query);
    if (!statsResult) return;
    if (state.researchMode === "both" && state.showBettingResearch) runBettingResearch(query);
  }
  document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  const resultHeading = document.querySelector("#researchAnswerTitle")
    || document.querySelector("#statsResultTitle")
    || document.querySelector("#answerTitle");
  resultHeading?.setAttribute("tabindex", "-1");
  resultHeading?.focus?.({ preventScroll: true });
  recordWorkspaceActivity("ran_query", state.statsResult?.type || "research", state.selectedEntityId || state.leagueId, "Ran research query", query);
}

document.querySelector("#queryForm").addEventListener("submit", (event) => {
  event.preventDefault();
  submitResearchQuery().catch((error) => {
    statsRequestSequence += 1;
    state.statsLoading = false;
    state.statsResult = {
      type: "error",
      title: "Research request failed",
      message: error?.message || "An unexpected research error occurred.",
      suggestions: [],
    };
    state.researchPlan = null;
    state.researchAnswer = null;
    elements.queryFeedback.textContent = "The research request failed. Review the visible error and try again.";
    renderAll();
  });
});

document.querySelector(".quick-prompts").addEventListener("click", (event) => {
  const button = event.target.closest("[data-query]");
  if (!button) return;
  elements.queryInput.value = button.dataset.query;
  state.selectedEntityId = "";
  state.statsContextOverrideDisabled = false;
  persistResearchState({ updateUrl: false });
  document.querySelector("#queryForm").requestSubmit();
});

function setResearchMode(mode) {
  const safeMode = normalizeResearchMode(mode, state.researchMode);
  if (safeMode === state.researchMode) return;
  state.researchMode = safeMode;
  statsRequestSequence += 1;
  state.statsLoading = false;
  state.researchPlan = null;
  state.researchAnswer = null;
  state.showBettingResearch = safeMode === "betting"
    || (safeMode === "both" && state.statsResult?.type === "combined" && Boolean(state.statsResult.bettingContext));
  persistResearchState();
  updateSportParlayPrompt();
  renderResearchMode();
}

elements.researchModeControl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-research-mode]");
  if (!button) return;
  setResearchMode(button.dataset.researchMode);
});

elements.researchModeControl.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const focusedMode = event.target.closest("[data-research-mode]")?.dataset.researchMode;
  const currentIndex = RESEARCH_MODES.indexOf(focusedMode || state.researchMode);
  const nextIndex = event.key === "Home" ? 0
    : event.key === "End" ? RESEARCH_MODES.length - 1
      : event.key === "ArrowRight" ? (currentIndex + 1) % RESEARCH_MODES.length
        : (currentIndex - 1 + RESEARCH_MODES.length) % RESEARCH_MODES.length;
  setResearchMode(RESEARCH_MODES[nextIndex]);
  elements.researchModeControl.querySelector(`[data-research-mode="${RESEARCH_MODES[nextIndex]}"]`)?.focus();
});

elements.queryInput.addEventListener("input", () => {
  statsRequestSequence += 1;
  state.statsLoading = false;
  state.statsResult = null;
  state.statsParsedQuery = null;
  state.researchPlan = null;
  state.researchAnswer = null;
  state.selectedEntityId = "";
  state.statsContextOverrideDisabled = false;
  persistResearchState({ updateUrl: false });
  renderResearchMode();
  updateAthleteSearch(elements.queryInput.value);
});

elements.queryInput.addEventListener("keydown", (event) => {
  if (!state.athleteSearchResults.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const offset = event.key === "ArrowDown" ? 1 : -1;
    state.athleteSearchIndex = (state.athleteSearchIndex + offset + state.athleteSearchResults.length)
      % state.athleteSearchResults.length;
    renderAthleteSearchResults();
    return;
  }
  if (event.key === "Enter" && state.athleteSearchIndex >= 0) {
    event.preventDefault();
    const entity = state.athleteSearchResults[state.athleteSearchIndex];
    state.athleteSearchResults = [];
    renderAthleteSearchResults();
    openSearchResult(entity);
    return;
  }
  if (event.key === "Escape") {
    state.athleteSearchResults = [];
    state.athleteSearchIndex = -1;
    renderAthleteSearchResults();
  }
});

elements.statsResults.addEventListener("click", (event) => {
  const candidate = event.target.closest("[data-entity-candidate]");
  if (candidate) {
    state.selectedEntityId = candidate.dataset.entityCandidate;
    persistResearchState();
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
  const tab = event.target.closest("[data-stats-tab]");
  if (tab) {
    state.statsResultTab = tab.dataset.statsTab;
    persistResearchState();
    renderResearchMode();
    elements.statsResultContent.querySelector(`[data-stats-tab="${state.statsResultTab}"]`)?.focus();
    return;
  }
  if (event.target.closest("[data-clear-stats-override]")) {
    state.statsContextOverrideDisabled = true;
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
  const activeResult = state.statsResult?.type === "combined" ? state.statsResult.statsAnswer : state.statsResult;
  const supportingEvent = event.target.closest("[data-supporting-event-query]");
  if (supportingEvent) {
    event.preventDefault();
    elements.queryInput.value = supportingEvent.dataset.supportingEventQuery;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
  const view = event.target.closest("[data-advanced-view]");
  if (view && activeResult) {
    state.advancedDisplay = view.dataset.advancedView;
    persistResearchState();
    renderResearchMode();
    return;
  }
  const sort = event.target.closest("[data-advanced-sort]");
  if (sort && activeResult) {
    const nextColumn = sort.dataset.advancedSort;
    state.advancedSortDirection = state.advancedSort === nextColumn && state.advancedSortDirection === "desc" ? "asc" : "desc";
    state.advancedSort = nextColumn;
    persistResearchState();
    renderResearchMode();
    elements.statsResultContent.querySelector(`[data-advanced-sort="${CSS.escape(nextColumn)}"]`)?.focus();
    return;
  }
  const remove = event.target.closest("[data-compare-remove]");
  if (remove && activeResult?.rows) {
    const remaining = activeResult.rows.filter((row) => row.entityId !== remove.dataset.compareRemove);
    if (remaining.length < 2) {
      elements.queryFeedback.textContent = "A comparison needs at least two entities.";
      return;
    }
    const statLabels = activeResult.statColumns.map((column) => column.label).join(", ");
    const windowText = activeResult.structuredQuery.dateRange.type === "last_n_games"
      ? ` over their last ${activeResult.structuredQuery.dateRange.value} games`
      : "";
    elements.queryInput.value = `Compare ${remaining.map((row) => row.displayName).join(" and ")} in ${statLabels}${windowText}`;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
  const comparisonAdd = event.target.closest("[data-comparison-add]");
  if (comparisonAdd && activeResult?.rows) {
    const search = elements.statsResultContent.querySelector("[data-comparison-search]");
    const normalized = String(search?.value || "").trim().toLowerCase();
    const candidate = (activeResult.availableEntities || []).find((entity) =>
      entity.name.toLowerCase() === normalized || entity.id.toLowerCase() === normalized);
    if (!candidate) {
      elements.queryFeedback.textContent = "Choose an entity from the available comparison list.";
      search?.focus();
      return;
    }
    const names = [...activeResult.rows.map((row) => row.displayName), candidate.name];
    const statLabels = activeResult.statColumns.map((column) => column.label).join(", ");
    const windowText = activeResult.structuredQuery.dateRange.type === "last_n_games"
      ? ` over their last ${activeResult.structuredQuery.dateRange.value} games`
      : activeResult.structuredQuery.dateRange.type === "season" ? " this season" : "";
    elements.queryInput.value = `Compare ${names.join(" and ")} in ${statLabels}${windowText}`;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
  const comparisonWindow = event.target.closest("[data-comparison-window]");
  if (comparisonWindow && activeResult?.rows) {
    const names = activeResult.rows.map((row) => row.displayName);
    const statLabels = activeResult.statColumns.map((column) => column.label).join(", ");
    const windowText = comparisonWindow.dataset.comparisonWindow === "season"
      ? " this season"
      : ` over their last ${comparisonWindow.dataset.comparisonWindow} games`;
    elements.queryInput.value = `Compare ${names.join(" and ")} in ${statLabels}${windowText}`;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
  if (event.target.closest("[data-edit-stat-condition]")) {
    elements.queryFeedback.textContent = "Edit the condition in your research question, then submit it again.";
    elements.queryInput.focus();
    elements.queryInput.select();
    return;
  }
  const marketAdd = event.target.closest("[data-advanced-market-add]");
  if (marketAdd) {
    const leagueId = activeResult?.structuredQuery?.leagueId || state.leagueId;
    const pick = getPickBySelectionId(sportsRepository, leagueId, marketAdd.dataset.advancedMarketAdd);
    if (!pick?.available || pick.stale || state.slip.some((item) => item.id === pick.id)) return;
    state.slip.push(pick);
    state.selectedPickId = pick.id;
    renderSlip();
    marketAdd.textContent = "Added";
    marketAdd.disabled = true;
    return;
  }
  const copy = event.target.closest("[data-copy-advanced]");
  if (copy && activeResult) {
    const status = elements.statsResultContent.querySelector(".advanced-copy-status");
    const value = copy.dataset.copyAdvanced === "link"
      ? window.location.href
      : copy.dataset.copyAdvanced === "summary"
        ? advancedResultSummaryToText(activeResult)
        : advancedResultToText(activeResult);
    navigator.clipboard.writeText(value).then(() => {
      if (status) status.textContent = copy.dataset.copyAdvanced === "link" ? "Link copied" : "Result copied";
    }).catch((error) => {
      if (status) status.textContent = `Copy unavailable: ${error?.message || "permission denied"}`;
    });
    return;
  }
  const exportButton = event.target.closest("[data-export-advanced]");
  if (exportButton && activeResult) {
    const blob = new Blob([advancedResultToCsv(activeResult)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `edgeboard-${activeResult.exportType || "result"}-sample.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
});

elements.researchAnswer.addEventListener("click", (event) => {
  const followUp = event.target.closest("[data-ai-followup]");
  if (followUp) {
    elements.queryInput.value = followUp.dataset.aiFollowup;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
  const marketAdd = event.target.closest("[data-ai-market-add]");
  if (!marketAdd) return;
  const leagueId = marketAdd.dataset.aiMarketLeague || state.leagueId;
  const pick = getPickBySelectionId(sportsRepository, leagueId, marketAdd.dataset.aiMarketAdd);
  if (!pick?.available || pick.stale || state.slip.some((item) => item.id === pick.id)) return;
  state.slip.push(pick);
  state.selectedPickId = pick.id;
  renderSlip();
  marketAdd.textContent = "Added";
  marketAdd.disabled = true;
});

elements.statsResults.addEventListener("keydown", (event) => {
  const tab = event.target.closest("[data-stats-tab]");
  if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const tabs = [...elements.statsResultContent.querySelectorAll("[data-stats-tab]")];
  const currentIndex = tabs.indexOf(tab);
  const nextIndex = event.key === "Home" ? 0
    : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" ? (currentIndex + 1) % tabs.length
        : (currentIndex - 1 + tabs.length) % tabs.length;
  state.statsResultTab = tabs[nextIndex].dataset.statsTab;
  persistResearchState();
  renderResearchMode();
  elements.statsResultContent.querySelector(`[data-stats-tab="${state.statsResultTab}"]`)?.focus();
});

elements.statsResults.addEventListener("error", (event) => {
  const image = event.target.closest("[data-athlete-image]");
  if (!image) return;
  handleAthleteMediaError(image);
}, true);

function handleAthleteMediaError(image) {
  let candidates = [];
  try {
    candidates = JSON.parse(decodeURIComponent(image.dataset.mediaCandidates || ""));
  } catch {
    candidates = [];
  }
  const nextIndex = Number(image.dataset.mediaIndex || 0) + 1;
  if (candidates[nextIndex]?.url) {
    image.dataset.mediaIndex = String(nextIndex);
    image.src = candidates[nextIndex].url;
    image.closest("[data-media-type]")?.setAttribute("data-media-type", candidates[nextIndex].type);
    return;
  }
  image.hidden = true;
  image.nextElementSibling?.removeAttribute("hidden");
}

document.addEventListener("click", (event) => {
  const workspaceInsight = event.target.closest("[data-workspace-save-insight]");
  if (workspaceInsight) {
    const insight = insightService.getInsight(workspaceInsight.dataset.workspaceSaveInsight);
    if (!insight) return;
    openWorkspaceSave({
      ...currentWorkspaceCandidate(),
      type: "saved_insight",
      boardId: "board-stats-trends",
      title: insight.phrasing.headline,
      description: insight.phrasing.shortSummary,
      canonicalReferences: {
        entityIds: [...insight.entityIds],
        eventIds: insight.supportingEventIds || [],
        marketIds: insight.bettingContext?.marketId ? [insight.bettingContext.marketId] : [],
        insightIds: [insight.id],
        queryId: null,
        visualizationId: null,
      },
      researchSnapshot: safeSnapshot(insight),
      sample: true,
    }).catch(() => {});
    return;
  }
  if (event.target.closest("[data-workspace-save-result]")) {
    openWorkspaceSave(currentWorkspaceCandidate()).catch(() => {});
    return;
  }
  const viewInsight = event.target.closest("[data-view-insight]");
  if (viewInsight) {
    const insight = insightService.getInsight(viewInsight.dataset.viewInsight);
    if (insight) {
      insightReturnFocus = viewInsight;
      renderInsightDialog(insight);
    }
    return;
  }
  const saveInsight = event.target.closest("[data-save-insight]");
  if (saveInsight) {
    const insight = insightService.getInsight(saveInsight.dataset.saveInsight);
    if (!insight) return;
    const existing = savedInsightIndex(insight);
    if (existing >= 0) state.savedInsights.splice(existing, 1);
    else state.savedInsights.push({
      id: insight.id,
      ruleId: insight.ruleId,
      entityIds: [...insight.entityIds],
      statIds: [...insight.statIds],
      structuredClaim: insight.claimData,
      validationStatus: insight.validationStatus,
      savedAt: new Date().toISOString(),
      localOnly: true,
    });
    persistInsightState();
    renderAll();
    return;
  }
  const dismissInsight = event.target.closest("[data-dismiss-insight]");
  if (dismissInsight) {
    state.dismissedInsightIds = [...new Set([...state.dismissedInsightIds, dismissInsight.dataset.dismissInsight])].slice(-100);
    persistInsightState();
    renderAll();
    return;
  }
  const shareInsight = event.target.closest("[data-share-insight]");
  if (shareInsight) {
    const insight = insightService.getInsight(shareInsight.dataset.shareInsight);
    const status = shareInsight.closest("[data-insight-card]")?.querySelector(".insight-action-status");
    if (!insight) return;
    navigator.clipboard.writeText(`${insight.phrasing.sharingCaption}\n${insightShareUrl(insight)}`).then(() => {
      if (status) status.textContent = "Insight text and link copied";
    }).catch((error) => {
      if (status) status.textContent = `Share unavailable: ${error?.message || "permission denied"}`;
    });
    return;
  }
  const followEntity = event.target.closest("[data-follow-entity]");
  if (followEntity) {
    const id = followEntity.dataset.followEntity;
    state.followedEntityIds = state.followedEntityIds.includes(id)
      ? state.followedEntityIds.filter((item) => item !== id)
      : [...new Set([...state.followedEntityIds, id])];
    persistInsightState();
    syncWorkspaceFollow(id, state.followedEntityIds.includes(id)).catch(() => {});
    renderAll();
    return;
  }
  const followInsightRule = event.target.closest("[data-follow-insight-rule]");
  if (followInsightRule) {
    const ref = followInsightRule.dataset.followInsightRule;
    state.followedInsightRefs = state.followedInsightRefs.includes(ref)
      ? state.followedInsightRefs.filter((item) => item !== ref)
      : [...new Set([...state.followedInsightRefs, ref])];
    persistInsightState();
    renderAll();
    return;
  }
  const visualLinkTarget = event.target.closest("[data-open-visual]");
  if (visualLinkTarget) {
    event.preventDefault();
    const entity = entityRegistry.getEntity(visualLinkTarget.dataset.visualEntity);
    openVisualAnalytics({
      visualizationType: visualLinkTarget.dataset.openVisual || defaultVisualizationType(entity),
      sportId: entity?.sportId || "",
      leagueId: entity?.leagueId || "",
      entityType: entity?.type || "athlete",
      entityIds: entity ? [entity.id] : [],
      dateRange: { type: "last_n_games", value: 10 },
      filters: {},
    }, { returnFocus: visualLinkTarget });
    return;
  }
  const athleteLinkTarget = event.target.closest("[data-open-athlete]");
  if (athleteLinkTarget) {
    event.preventDefault();
    state.athleteSearchResults = [];
    state.athleteSearchIndex = -1;
    renderAthleteSearchResults();
    openAthleteProfile(athleteLinkTarget.dataset.openAthlete);
    return;
  }
  const entityLinkTarget = event.target.closest("[data-open-entity]");
  if (entityLinkTarget) {
    event.preventDefault();
    state.athleteSearchResults = [];
    state.athleteSearchIndex = -1;
    renderAthleteSearchResults();
    openEntityProfile(entityLinkTarget.dataset.openEntity);
  }
});

elements.closeAthleteProfile.addEventListener("click", () => closeAthleteProfile());
elements.closeEntityProfile.addEventListener("click", () => closeEntityProfile());
elements.closeVisualAnalytics.addEventListener("click", () => closeVisualAnalytics());
elements.visualSlipToggle.addEventListener("click", () => {
  const open = elements.visualSlipPanel.hidden;
  elements.visualSlipPanel.hidden = !open;
  elements.visualSlipToggle.setAttribute("aria-expanded", String(open));
});
document.querySelector("#closeVisualSlip").addEventListener("click", () => {
  elements.visualSlipPanel.hidden = true;
  elements.visualSlipToggle.setAttribute("aria-expanded", "false");
  elements.visualSlipToggle.focus();
});
elements.shareVisualAnalytics.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    elements.shareVisualAnalytics.textContent = "Link copied";
  } catch (error) {
    elements.shareVisualAnalytics.textContent = "Copy unavailable";
    elements.shareVisualAnalytics.title = error?.message || "Clipboard permission was denied.";
  }
});
elements.visualAnalyticsContent.addEventListener("click", async (event) => {
  if (!state.visualRequest || !state.visualResult) return;
  const status = elements.visualAnalyticsContent.querySelector(".visual-action-status");
  const fallback = event.target.closest("[data-visual-fallback]");
  if (fallback) {
    openVisualAnalytics({ ...state.visualRequest, visualizationType: fallback.dataset.visualFallback }, { replace: false });
    return;
  }
  const reset = event.target.closest("[data-visual-reset]");
  if (reset) {
    const entity = entityRegistry.getEntity(state.visualRequest.entityIds[0]);
    openVisualAnalytics({
      ...state.visualRequest,
      visualizationType: defaultVisualizationType(entity),
      dateRange: { type: "last_n_games", value: 10 },
      filters: {},
    }, { replace: true });
    return;
  }
  const legend = event.target.closest("[data-series-toggle]");
  if (legend) {
    const current = state.visualRequest.filters?.seriesIds?.length
      ? [...state.visualRequest.filters.seriesIds]
      : state.visualResult.series.map((series) => series.id);
    const next = current.includes(legend.dataset.seriesToggle)
      ? current.filter((id) => id !== legend.dataset.seriesToggle)
      : [...current, legend.dataset.seriesToggle];
    if (!next.length) {
      if (status) status.textContent = "At least one series must remain visible.";
      return;
    }
    openVisualAnalytics({
      ...state.visualRequest,
      filters: { ...state.visualRequest.filters, seriesIds: next },
    }, { replace: true, focusHeading: false });
    return;
  }
  try {
    if (event.target.closest("[data-copy-visual-summary]")) {
      await navigator.clipboard.writeText(state.visualResult.accessibleSummary);
      if (status) status.textContent = "Accessible summary copied.";
    } else if (event.target.closest("[data-copy-visual-data]")) {
      await navigator.clipboard.writeText(visualizationServiceModule.visualizationTableToTsv(state.visualResult));
      if (status) status.textContent = "Visible data copied as TSV.";
    } else if (event.target.closest("[data-copy-visual-link]")) {
      await navigator.clipboard.writeText(window.location.href);
      if (status) status.textContent = "Visualization link copied.";
    } else if (event.target.closest("[data-download-visual-csv]")) {
      const blob = new Blob([visualizationServiceModule.visualizationTableToCsv(state.visualResult)], { type: "text/csv;charset=utf-8" });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `edgeboard-${state.visualResult.type}.csv`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      if (status) status.textContent = "CSV download prepared.";
    }
  } catch (error) {
    if (status) status.textContent = `Action unavailable: ${error?.message || "permission denied"}`;
  }
});
elements.visualAnalyticsContent.addEventListener("change", (event) => {
  const control = event.target.closest("[data-visual-control]");
  if (!control || !state.visualRequest) return;
  const next = {
    ...state.visualRequest,
    filters: { ...state.visualRequest.filters },
    dateRange: { ...state.visualRequest.dateRange },
  };
  if (control.dataset.visualControl === "type") {
    next.visualizationType = control.value;
    next.filters = {};
  }
  if (control.dataset.visualControl === "window") {
    next.dateRange = control.value === "season"
      ? { type: "season", value: "season" }
      : { type: "last_n_games", value: Number(control.value) };
  }
  if (control.dataset.visualControl === "threshold") {
    next.filters.threshold = control.value === "" ? null : Number(control.value);
  }
  setVisualAnalyticsUrl(next);
  state.visualRequest = next;
  loadVisualAnalytics({ focusHeading: false });
});
elements.entityProfileSlipToggle.addEventListener("click", () => {
  const open = elements.entityProfileSlipPanel.hidden;
  elements.entityProfileSlipPanel.hidden = !open;
  elements.entityProfileSlipToggle.setAttribute("aria-expanded", String(open));
});
document.querySelector("#closeEntityProfileSlip").addEventListener("click", () => {
  elements.entityProfileSlipPanel.hidden = true;
  elements.entityProfileSlipToggle.setAttribute("aria-expanded", "false");
  elements.entityProfileSlipToggle.focus();
});
elements.entityProfileContent.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-entity-add]");
  if (addButton) {
    const pick = getPickBySelectionId(sportsRepository, state.entityProfileViewModel?.entity?.leagueId, addButton.dataset.entityAdd);
    if (pick?.available && !pick.stale && !state.slip.some((item) => item.id === pick.id)) {
      state.slip.push(pick);
      state.selectedPickId = pick.id;
      renderSlip();
      renderEntityProfile();
    }
    return;
  }
  const queryButton = event.target.closest("[data-profile-query]");
  if (queryButton) {
    closeEntityProfile({ useHistory: false });
    elements.queryInput.value = queryButton.dataset.profileQuery;
    document.querySelector("#queryForm").requestSubmit();
  }
});
elements.followEntity.addEventListener("click", () => {
  const id = state.entityProfileId;
  if (!id) return;
  state.followedEntityIds = state.followedEntityIds.includes(id)
    ? state.followedEntityIds.filter((item) => item !== id)
    : [...new Set([...state.followedEntityIds, id])];
  persistInsightState();
  syncWorkspaceFollow(id, state.followedEntityIds.includes(id)).catch(() => {});
  renderEntityProfile();
});
elements.profileSlipToggle.addEventListener("click", () => {
  const open = elements.profileSlipPanel.hidden;
  elements.profileSlipPanel.hidden = !open;
  elements.profileSlipToggle.setAttribute("aria-expanded", String(open));
});
document.querySelector("#closeProfileSlip").addEventListener("click", () => {
  elements.profileSlipPanel.hidden = true;
  elements.profileSlipToggle.setAttribute("aria-expanded", "false");
  elements.profileSlipToggle.focus();
});

elements.athleteProfileView.addEventListener("error", (event) => {
  const image = event.target.closest("[data-athlete-image]");
  if (image) handleAthleteMediaError(image);
}, true);

elements.athleteProfileContent.addEventListener("click", (event) => {
  const category = event.target.closest("[data-insight-category]");
  if (category) {
    state.profileInsightCategory = category.dataset.insightCategory;
    renderAthleteProfile();
    elements.athleteProfileContent.querySelector(`[data-insight-category="${state.profileInsightCategory}"]`)?.focus();
    return;
  }
  const tab = event.target.closest("[data-profile-tab], [data-profile-tab-target]");
  if (tab) {
    event.preventDefault();
    const requested = tab.dataset.profileTab || tab.dataset.profileTabTarget;
    if (!state.profileViewModel?.tabs.some((item) => item.id === requested)) return;
    state.profileTab = requested;
    setProfileUrl(state.profileAthleteId, requested);
    renderAthleteProfile();
    elements.athleteProfileContent.querySelector(`[data-profile-tab="${requested}"]`)?.focus({ preventScroll: true });
    return;
  }
  const split = event.target.closest("[data-profile-split]");
  if (split) {
    state.profileSplitDimension = split.dataset.profileSplit;
    athleteProfileRepository.clearCache(state.profileAthleteId);
    loadAthleteProfile().catch((error) => {
      elements.athleteProfileContent.innerHTML = `<div class="profile-empty">Unable to load split: ${escapeHtml(error?.message || "Unknown error")}</div>`;
    });
    return;
  }
  const add = event.target.closest("[data-profile-add]");
  if (add) {
    const leagueId = state.profileViewModel?.athlete?.leagueId;
    const pick = getPickBySelectionId(sportsRepository, leagueId, add.dataset.profileAdd);
    if (!pick?.available || pick.stale || state.slip.some((item) => item.id === pick.id)) return;
    state.slip.push(pick);
    state.selectedPickId = pick.id;
    renderSlip();
    add.textContent = "Added";
    add.disabled = true;
    return;
  }
  const query = event.target.closest("[data-profile-query]");
  if (query) {
    const text = query.dataset.profileQuery;
    const athleteId = state.profileViewModel?.athlete?.id || "";
    closeAthleteProfile({ useHistory: false });
    elements.queryInput.value = text;
    state.selectedEntityId = athleteId;
    persistResearchState();
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
  const supportingEvent = event.target.closest("[data-support-event]");
  if (supportingEvent) {
    state.profileTab = "game-logs";
    setProfileUrl(state.profileAthleteId, state.profileTab);
    renderAthleteProfile();
    document.querySelector(`#profile-event-${CSS.escape(supportingEvent.dataset.supportEvent)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

elements.athleteProfileContent.addEventListener("change", (event) => {
  const column = event.target.closest("[data-profile-column]");
  if (column) {
    const allColumns = state.profileViewModel?.gameLogs?.columns.map((item) => item.id) || [];
    const selected = new Set(state.profileVisibleColumns.length ? state.profileVisibleColumns : allColumns);
    if (column.checked) selected.add(column.dataset.profileColumn);
    else selected.delete(column.dataset.profileColumn);
    if (!selected.size) {
      column.checked = true;
      return;
    }
    state.profileVisibleColumns = [...selected];
    renderAthleteProfile();
    return;
  }
  const filter = event.target.closest("[data-profile-filter]");
  if (!filter) return;
  if (filter.dataset.profileFilter === "log-sort") {
    state.profileLogSort = filter.value;
    renderAthleteProfile();
    return;
  }
  if (filter.dataset.profileFilter === "log-window") state.profileLogWindow = filter.value;
  if (filter.dataset.profileFilter === "home-away") state.profileHomeAway = filter.value;
  if (filter.dataset.profileFilter === "opponent") state.profileOpponent = filter.value;
  if (filter.dataset.profileFilter === "result") state.profileResult = filter.value;
  if (filter.dataset.profileFilter === "trend-stat") state.profileTrendStatId = filter.value;
  if (filter.dataset.profileFilter === "trend-window") state.profileTrendWindow = Number(filter.value);
  if (filter.dataset.profileFilter === "trend-threshold") {
    state.profileTrendThreshold = filter.value;
    renderAthleteProfile();
    return;
  }
  if (filter.dataset.profileFilter === "prop-group") {
    state.profilePropGroup = filter.value;
    renderAthleteProfile();
    return;
  }
  if (filter.dataset.profileFilter === "sportsbook") {
    state.profileSportsbook = filter.value;
    renderAthleteProfile();
    return;
  }
  athleteProfileRepository.clearCache(state.profileAthleteId);
  loadAthleteProfile().catch((error) => {
    elements.athleteProfileContent.innerHTML = `<div class="profile-empty">Unable to update profile: ${escapeHtml(error?.message || "Unknown error")}</div>`;
  });
});

elements.athleteProfileContent.addEventListener("keydown", (event) => {
  const tab = event.target.closest("[data-profile-tab]");
  if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const tabs = [...elements.athleteProfileContent.querySelectorAll("[data-profile-tab]")];
  const index = tabs.indexOf(tab);
  const next = event.key === "Home" ? 0
    : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" ? (index + 1) % tabs.length
        : (index - 1 + tabs.length) % tabs.length;
  tabs[next].click();
});

elements.followAthlete.addEventListener("click", () => {
  const athleteId = state.profileAthleteId;
  const followed = !state.followedEntityIds.includes(athleteId);
  state.followedEntityIds = followed
    ? [...new Set([...state.followedEntityIds, athleteId])]
    : state.followedEntityIds.filter((id) => id !== athleteId);
  persistInsightState();
  syncWorkspaceFollow(athleteId, followed).catch(() => {});
  elements.followAthlete.setAttribute("aria-pressed", String(followed));
  elements.followAthlete.textContent = followed ? "Following locally" : "Follow";
});

elements.closeInsightDialog.addEventListener("click", () => {
  const fallback = document.querySelector(`[data-view-insight="${CSS.escape(state.activeInsightId)}"]`);
  const returnTarget = insightReturnFocus?.isConnected ? insightReturnFocus : fallback;
  elements.insightDialog.close();
  returnTarget?.focus({ preventScroll: true });
});
elements.insightDialog.addEventListener("close", () => {
  const fallback = document.querySelector(`[data-view-insight="${CSS.escape(state.activeInsightId)}"]`);
  const returnTarget = insightReturnFocus?.isConnected ? insightReturnFocus : fallback;
  insightReturnFocus = null;
  state.activeInsightId = "";
  window.setTimeout(() => returnTarget?.focus({ preventScroll: true }), 0);
});
elements.insightDialog.addEventListener("click", (event) => {
  const insight = insightService.getInsight(state.activeInsightId);
  if (!insight) return;
  const status = elements.insightDialogContent.querySelector(".insight-dialog-status");
  if (event.target.closest("[data-copy-insight]")) {
    navigator.clipboard.writeText(insight.phrasing.sharingCaption).then(() => {
      if (status) status.textContent = "Insight text copied";
    }).catch((error) => {
      if (status) status.textContent = `Copy unavailable: ${error?.message || "permission denied"}`;
    });
  } else if (event.target.closest("[data-copy-insight-link]")) {
    navigator.clipboard.writeText(insightShareUrl(insight)).then(() => {
      if (status) status.textContent = "Insight link copied";
    }).catch((error) => {
      if (status) status.textContent = `Copy unavailable: ${error?.message || "permission denied"}`;
    });
  } else if (event.target.closest("[data-print-insight]")) {
    window.print();
  }
});

elements.shareAthleteProfile.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    elements.shareAthleteProfile.textContent = "Link copied";
  } catch (error) {
    elements.shareAthleteProfile.textContent = "Copy unavailable";
    elements.shareAthleteProfile.title = error?.message || "Clipboard permission was denied.";
  }
});

elements.shareEntityProfile.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    elements.shareEntityProfile.textContent = "Link copied";
  } catch (error) {
    elements.shareEntityProfile.textContent = "Copy unavailable";
    elements.shareEntityProfile.title = error?.message || "Clipboard permission was denied.";
  }
});

elements.openWorkspace.addEventListener("click", () => {
  openWorkspace({ workspaceId: state.workspaceViewModel?.workspace?.id || "workspace-local-default", view: "home" }).catch(() => {});
});
[elements.saveCurrentResearch, elements.saveVisualAnalytics, elements.saveEntityProfile, elements.saveAthleteProfile]
  .filter(Boolean)
  .forEach((button) => button.addEventListener("click", () => {
    openWorkspaceSave().catch((error) => {
      elements.queryFeedback.textContent = error?.message || "Unable to open the local save dialog.";
    });
  }));

function openTrackSlipDialog() {
  if (!state.slip.length) {
    elements.queryFeedback.textContent = "Add at least one available market to the research slip before tracking it.";
    return;
  }
  openWorkspaceEdit("track-slip", "", `${currentLeague()?.leagueDisplayName || "EdgeBoard"} research idea`, "Record the research thesis and counterpoints here.");
}
elements.trackResearchSlip.addEventListener("click", openTrackSlipDialog);

async function syncWorkspaceFollow(targetId, followed) {
  const { repository } = await loadWorkspaceModules();
  const workspace = repository.listWorkspaces()[0];
  const entity = entityRegistry.getEntity(targetId);
  const snapshot = repository.snapshot();
  const matches = snapshot.watchlistItems.filter((item) => item.targetId === targetId);
  if (!followed) {
    await Promise.all(matches.map((item) => repository.removeWatchlistItem(item.id)));
    return;
  }
  if (matches.length) return;
  let watchlist = snapshot.watchlists.find((item) => item.workspaceId === workspace.id && item.title === "Following");
  if (!watchlist) watchlist = await repository.createWatchlist({ workspaceId: workspace.id, title: "Following", description: "Entities followed from canonical EdgeBoard profiles and insights." });
  await repository.addWatchlistItem({
    watchlistId: watchlist.id,
    targetType: entity?.type === "athlete" ? "athlete" : entity?.type || "entity",
    targetId,
    label: entity?.displayName || entity?.name || targetId,
    sportId: entity?.sportId || "",
    leagueId: entity?.leagueId || "",
    sample: true,
  });
}

elements.workspaceSaveDialog.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-save-dialog]")) elements.workspaceSaveDialog.close();
});
elements.workspaceSaveDialog.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting === "true") return;
  form.dataset.submitting = "true";
  form.querySelectorAll("button[type=submit]").forEach((button) => { button.disabled = true; });
  const strategy = event.submitter?.dataset.saveStrategy || "";
  if (strategy === "open" && state.workspaceDuplicate) {
    elements.workspaceSaveDialog.close();
    await openWorkspace({ workspaceId: state.workspaceDuplicate.workspaceId, view: "item", itemId: state.workspaceDuplicate.id });
    return;
  }
  try {
    const data = new FormData(form);
    const candidate = {
      ...state.workspaceCandidate,
      title: data.get("title"),
      boardId: data.get("boardId"),
      tags: String(data.get("tags") || "").split(","),
      isPinned: data.has("isPinned"),
      saveMode: data.get("saveMode"),
    };
    const result = await workspaceRepository.saveResearchObject(candidate, {
      duplicateStrategy: strategy === "update" ? "update" : strategy === "copy" ? "copy" : undefined,
    });
    if (result.status === "duplicate") {
      state.workspaceDuplicate = result.duplicate;
      const boards = workspaceRepository.listBoards(candidate.workspaceId, { includeArchived: true });
      elements.workspaceSaveDialogContent.innerHTML = workspaceRenderer.renderSaveDialogFields({ boards, candidate, duplicate: result.duplicate });
      return;
    }
    const note = String(data.get("note") || "").trim();
    if (note) await workspaceRepository.addNote({ workspaceId: candidate.workspaceId, attachmentType: "saved_research", attachmentId: result.item.id, text: note });
    elements.workspaceSaveDialog.close();
    state.workspaceStatus = `${result.status === "updated" ? "Updated" : "Saved"} “${result.item.title}” locally.`;
    elements.queryFeedback.textContent = state.workspaceStatus;
    if (state.workspaceActive) await loadWorkspace();
  } catch (error) {
    elements.workspaceSaveDialogContent.querySelector(".data-warning")?.remove();
    form.insertAdjacentHTML("afterbegin", `<p class="data-warning" role="alert">${escapeHtml(error?.message || "Unable to save local research.")}</p>`);
  } finally {
    if (form.isConnected) {
      form.dataset.submitting = "false";
      form.querySelectorAll("button[type=submit]").forEach((button) => { button.disabled = false; });
    }
  }
});

document.querySelectorAll("[data-close-workspace-dialog]").forEach((button) => {
  button.addEventListener("click", () => elements.workspaceEditDialog.close());
});
document.querySelectorAll("[data-close-confirm-dialog]").forEach((button) => {
  button.addEventListener("click", () => elements.workspaceConfirmDialog.close());
});

elements.workspaceEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  const action = data.get("action");
  const targetId = data.get("targetId");
  const title = String(data.get("title") || "").trim();
  const description = String(data.get("description") || "").trim();
  const vm = state.workspaceViewModel;
  try {
    if (action === "create-board") await workspaceRepository.createBoard({ workspaceId: vm.workspace.id, title, description });
    else if (action === "edit-board") await workspaceRepository.updateBoard(targetId, { title, description });
    else if (action === "rename-workspace") await workspaceRepository.updateWorkspace(vm.workspace.id, { title, description });
    else if (action === "create-watchlist") await workspaceRepository.createWatchlist({ workspaceId: vm.workspace.id, title, description });
    else if (action === "add-note") await workspaceRepository.addNote({ workspaceId: vm.workspace.id, attachmentType: "saved_research", attachmentId: targetId, text: description || title });
    else if (action === "create-alert") await workspaceRepository.createAlertRule({
      workspaceId: vm.workspace.id,
      name: title,
      category: "stats",
      target: { type: "workspace", id: vm.workspace.id },
      condition: { metric: "sample_value", operator: "greater_than_or_equal", value: Number(description) || 1 },
      source: "Local sample evaluation",
    });
    else if (action === "track-slip") await workspaceRepository.createTrackedIdea({
      workspaceId: vm?.workspace?.id || workspaceRepository.listWorkspaces()[0].id,
      title,
      thesis: description,
      counterpoints: String(data.get("counterpoints") || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
      status: "researching",
      legs: state.slip.map((pick) => ({
        selectionId: pick.id,
        canonicalMarketId: pick.canonicalMarketId || pick.marketId,
        line: pick.line,
        odds: pick.odds,
        sportsbook: pick.sportsbook,
        sourceUpdatedAt: pick.lastUpdatedAt,
        settlementScope: pick.settlementScope,
      })),
      confidenceAtSave: state.slip.length ? Math.round(state.slip.reduce((sum, pick) => sum + (Number(pick.confidence) || 0), 0) / state.slip.length) : null,
      eventStartAt: state.slip.map((pick) => pick.eventTime).filter(Boolean).sort()[0] || null,
      sample: true,
    });
    elements.workspaceEditDialog.close();
    elements.workspaceStatus.textContent = "Local workspace updated.";
    if (state.workspaceActive) await loadWorkspace();
  } catch (error) {
    elements.workspaceStatus.textContent = error?.message || "The local workspace update failed.";
  }
});

elements.workspaceConfirmForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const action = data.get("action");
  const targetId = data.get("targetId");
  const phrase = form.dataset.phrase || "";
  if (phrase && data.get("confirmationText") !== phrase) {
    elements.workspaceConfirmMessage.textContent = `Type “${phrase}” exactly to continue.`;
    return;
  }
  try {
    if (action === "delete-board") {
      const destination = state.workspaceViewModel.boards.find((board) => board.id !== targetId && board.title === "Saved Research")
        || state.workspaceViewModel.boards.find((board) => board.id !== targetId && !board.isArchived);
      await workspaceRepository.deleteBoard(targetId, { confirmed: true, moveToBoardId: destination?.id || null });
      if (state.workspaceRoute?.boardId === targetId) {
        state.workspaceRoute = { workspaceId: state.workspaceViewModel.workspace.id, view: "boards" };
        setWorkspaceUrl(state.workspaceRoute, { replace: true });
      }
    } else if (action === "delete-saved") {
      await workspaceRepository.deleteSavedResearchObject(targetId);
      if (state.workspaceRoute?.itemId === targetId) {
        state.workspaceRoute = { workspaceId: state.workspaceViewModel.workspace.id, view: "saved" };
        setWorkspaceUrl(state.workspaceRoute, { replace: true });
      }
    }
    else if (action === "delete-alert") await workspaceRepository.deleteAlertRule(targetId);
    else if (action === "delete-note") await workspaceRepository.deleteNote(targetId);
    else if (action === "clear-alerts") await workspaceRepository.clearAlertEvents(state.workspaceViewModel.workspace.id);
    else if (action === "delete-workspace") {
      await workspaceRepository.deleteWorkspace(targetId, { confirmed: true });
      elements.workspaceConfirmDialog.close();
      state.workspaceRoute = { workspaceId: targetId, view: "home" };
      await loadWorkspace();
      return;
    }
    else if (action === "delete-all") {
      await workspaceRepository.clearAll({ confirmation: phrase });
      elements.workspaceConfirmDialog.close();
      closeWorkspace();
      updateWorkspaceCounts(null);
      return;
    }
    elements.workspaceConfirmDialog.close();
    await loadWorkspace();
  } catch (error) {
    elements.workspaceConfirmMessage.textContent = error?.message || "The confirmed action failed.";
  }
});

async function restoreSavedResearch(itemId) {
  const item = workspaceRepository.listSavedResearchObjects().find((record) => record.id === itemId);
  if (!item) return;
  await workspaceRepository.updateSavedResearchObject(item.id, { lastOpenedAt: new Date().toISOString() });
  closeWorkspace();
  const entityId = item.canonicalReferences?.entityIds?.[0];
  if (item.type === "saved_entity" && entityId) {
    const entity = entityRegistry.getEntity(entityId);
    if (["athlete", "fighter", "boxer", "driver"].includes(entity?.type)) openAthleteProfile(entityId);
    else openEntityProfile(entityId);
    return;
  }
  state.researchMode = normalizeResearchMode(item.sourceState.mode, "stats");
  elements.queryInput.value = item.sourceState.queryText || "";
  if (item.sourceState.queryText) document.querySelector("#queryForm").requestSubmit();
}

function reportWorkspaceError(error) {
  elements.workspaceStatus.textContent = error?.message || "The local workspace action failed. No saved data was discarded.";
}

async function handleWorkspaceClick(event) {
  const routeLink = event.target.closest("[data-workspace-route]");
  const boardLink = event.target.closest("[data-workspace-board]");
  const itemLink = event.target.closest("[data-workspace-item]");
  if (routeLink || boardLink || itemLink) {
    event.preventDefault();
    const route = {
      workspaceId: state.workspaceViewModel.workspace.id,
      view: itemLink ? "item" : boardLink ? "board" : routeLink.dataset.workspaceRoute,
      boardId: boardLink?.dataset.workspaceBoard || "",
      itemId: itemLink?.dataset.workspaceItem || "",
    };
    await openWorkspace(route);
    return;
  }
  if (event.target.closest("[data-close-workspace]")) return closeWorkspace();
  if (event.target.closest("[data-clear-workspace-filters]")) {
    state.workspaceRoute = { ...state.workspaceRoute, query: "", filters: {} };
    return loadWorkspace();
  }
  const toggleNav = event.target.closest("[data-toggle-workspace-nav]");
  if (toggleNav) {
    const nav = elements.workspaceContent.querySelector(".workspace-nav");
    const open = !nav.classList.contains("open");
    nav.classList.toggle("open", open);
    toggleNav.setAttribute("aria-expanded", String(open));
    return;
  }
  if (event.target.closest("[data-load-external]")) {
    await workspaceRepository.reloadFromStorage();
    elements.workspaceStatus.textContent = "Loaded the newer local workspace state.";
    await loadWorkspace();
    return;
  }
  if (event.target.closest("[data-create-board]")) return openWorkspaceEdit("create-board");
  if (event.target.closest("[data-rename-workspace]")) return openWorkspaceEdit("rename-workspace", "", state.workspaceViewModel.workspace.title, state.workspaceViewModel.workspace.description);
  if (event.target.closest("[data-create-watchlist]")) return openWorkspaceEdit("create-watchlist");
  if (event.target.closest("[data-create-alert]")) return openWorkspaceEdit("create-alert", "", "Local sample threshold alert", "1");
  if (event.target.closest("[data-track-slip]")) return openTrackSlipDialog();
  const editBoard = event.target.closest("[data-board-edit]");
  if (editBoard) {
    const board = state.workspaceViewModel.boards.find((item) => item.id === editBoard.dataset.boardEdit);
    return openWorkspaceEdit("edit-board", board.id, board.title, board.description);
  }
  const deleteBoard = event.target.closest("[data-board-delete]");
  if (deleteBoard) return confirmWorkspaceAction("delete-board", deleteBoard.dataset.boardDelete, "Delete this board? Contained items will move to Saved Research.");
  const deleteSaved = event.target.closest("[data-delete-saved]");
  if (deleteSaved) return confirmWorkspaceAction("delete-saved", deleteSaved.dataset.deleteSaved, "Delete this saved research and its private notes?");
  const deleteNote = event.target.closest("[data-delete-note]");
  if (deleteNote) return confirmWorkspaceAction("delete-note", deleteNote.dataset.deleteNote, "Delete this private note?");
  const addNote = event.target.closest("[data-add-note]");
  if (addNote) return openWorkspaceEdit("add-note", addNote.dataset.addNote, "Private note", "");
  const openSaved = event.target.closest("[data-open-saved]");
  if (openSaved) return restoreSavedResearch(openSaved.dataset.openSaved);
  const archive = event.target.closest("[data-archive-saved]");
  if (archive) {
    const item = workspaceRepository.listSavedResearchObjects().find((record) => record.id === archive.dataset.archiveSaved);
    await workspaceRepository.archiveSavedResearchObject(item.id, !item.isArchived);
    return loadWorkspace();
  }
  const refresh = event.target.closest("[data-refresh-saved]");
  if (refresh) {
    const item = workspaceRepository.listSavedResearchObjects().find((record) => record.id === refresh.dataset.refreshSaved);
    await workspaceRepository.refreshSavedResearchObject(item.id, { ...item.researchSnapshot, refreshedAt: new Date().toISOString(), sample: true });
    elements.workspaceStatus.textContent = "Sample snapshot refreshed; the original remains in history.";
    return loadWorkspace();
  }
  const share = event.target.closest("[data-share-saved]");
  if (share) {
    const snapshot = await workspaceRepository.createShareSnapshot({ itemId: share.dataset.shareSaved });
    state.workspaceShareSnapshot = snapshot;
    elements.workspaceSharePreview.textContent = JSON.stringify(snapshot, null, 2);
    elements.workspaceShareDialog.showModal();
    elements.workspaceShareDialog.querySelector("[data-copy-share-snapshot]")?.focus();
    return;
  }
  const boardMove = event.target.closest("[data-board-move]");
  if (boardMove) {
    const ids = state.workspaceViewModel.boards.map((board) => board.id);
    const index = ids.indexOf(boardMove.dataset.boardMove);
    const next = Math.max(0, Math.min(ids.length - 1, index + Number(boardMove.dataset.direction)));
    ids.splice(next, 0, ids.splice(index, 1)[0]);
    await workspaceRepository.reorderBoards(state.workspaceViewModel.workspace.id, ids);
    return loadWorkspace();
  }
  const pinBoard = event.target.closest("[data-board-pin]");
  if (pinBoard) {
    const board = state.workspaceViewModel.boards.find((item) => item.id === pinBoard.dataset.boardPin);
    await workspaceRepository.updateBoard(board.id, { isPinned: !board.isPinned });
    return loadWorkspace();
  }
  const duplicateBoard = event.target.closest("[data-board-duplicate]");
  if (duplicateBoard) {
    await workspaceRepository.duplicateBoard(duplicateBoard.dataset.boardDuplicate);
    return loadWorkspace();
  }
  const archiveBoard = event.target.closest("[data-board-archive]");
  if (archiveBoard) {
    const board = state.workspaceViewModel.boards.find((item) => item.id === archiveBoard.dataset.boardArchive);
    await workspaceRepository.updateBoard(board.id, { isArchived: !board.isArchived });
    return loadWorkspace();
  }
  const exportBoard = event.target.closest("[data-board-export]");
  if (exportBoard) return downloadWorkspaceJson(await workspaceRepository.exportWorkspace(state.workspaceViewModel.workspace.id, { boardId: exportBoard.dataset.boardExport }), "edgeboard-board.json");
  const shareBoard = event.target.closest("[data-board-share]");
  if (shareBoard) {
    const board = state.workspaceViewModel.boards.find((item) => item.id === shareBoard.dataset.boardShare);
    const items = state.workspaceViewModel.savedObjects.filter((item) => item.boardId === board.id);
    state.workspaceShareSnapshot = {
      visibility: "link_snapshot",
      readOnly: true,
      localDeviceOnly: true,
      generatedAt: new Date().toISOString(),
      title: board.title,
      description: board.description,
      itemCount: items.length,
      items: items.map((item) => ({
        type: item.type,
        title: item.title,
        canonicalReferences: item.canonicalReferences,
        source: item.researchSnapshot?.source || "Unavailable",
        freshness: item.dataSnapshotAt,
        sample: item.sample,
      })),
      warnings: ["Read-only local board summary", ...(state.workspaceViewModel.sample ? ["Sample data"] : [])],
      excludes: ["private notes", "activity history", "hidden metadata", "other boards"],
    };
    elements.workspaceSharePreview.textContent = JSON.stringify(state.workspaceShareSnapshot, null, 2);
    elements.workspaceShareDialog.showModal();
    elements.workspaceShareDialog.querySelector("[data-copy-share-snapshot]")?.focus();
    return;
  }
  const pauseWatch = event.target.closest("[data-watch-pause]");
  if (pauseWatch) {
    const item = workspaceRepository.snapshot().watchlistItems.find((record) => record.id === pauseWatch.dataset.watchPause);
    await workspaceRepository.updateWatchlistItem(item.id, { isPaused: !item.isPaused });
    return loadWorkspace();
  }
  const removeWatch = event.target.closest("[data-watch-remove]");
  if (removeWatch) {
    await workspaceRepository.removeWatchlistItem(removeWatch.dataset.watchRemove);
    return loadWorkspace();
  }
  const pauseAlert = event.target.closest("[data-alert-pause]");
  if (pauseAlert) {
    const rule = state.workspaceViewModel.alertRules.find((item) => item.id === pauseAlert.dataset.alertPause);
    await workspaceRepository.updateAlertRule(rule.id, { isEnabled: !rule.isEnabled });
    return loadWorkspace();
  }
  const deleteAlert = event.target.closest("[data-alert-delete]");
  if (deleteAlert) return confirmWorkspaceAction("delete-alert", deleteAlert.dataset.alertDelete, "Delete this local alert rule?");
  const snoozeAlert = event.target.closest("[data-alert-snooze]");
  if (snoozeAlert) {
    await workspaceRepository.updateAlertRule(snoozeAlert.dataset.alertSnooze, { snoozedUntil: new Date(Date.now() + 60 * 60_000).toISOString() });
    return loadWorkspace();
  }
  if (event.target.closest("[data-evaluate-alerts]")) {
    const readings = Object.fromEntries(state.workspaceViewModel.alertRules.map((rule) => [rule.id, { value: Number(rule.lastKnownValue || 0) + 1, status: "available", freshness: "fresh", source: "EdgeBoard sample provider", sample: true }]));
    await workspaceRepository.evaluateAlerts(readings);
    return loadWorkspace();
  }
  if (event.target.closest("[data-mark-alerts-read]")) {
    await workspaceRepository.markAllAlertsRead(state.workspaceViewModel.workspace.id);
    return loadWorkspace();
  }
  const alertRead = event.target.closest("[data-alert-read]");
  if (alertRead) {
    await workspaceRepository.updateAlertEvent(alertRead.dataset.alertRead, { isRead: true });
    return loadWorkspace();
  }
  const alertDismiss = event.target.closest("[data-alert-dismiss]");
  if (alertDismiss) {
    await workspaceRepository.updateAlertEvent(alertDismiss.dataset.alertDismiss, { isDismissed: true });
    return loadWorkspace();
  }
  const alertArchive = event.target.closest("[data-alert-archive]");
  if (alertArchive) {
    await workspaceRepository.updateAlertEvent(alertArchive.dataset.alertArchive, { isArchived: true, isRead: true });
    return loadWorkspace();
  }
  const ideaStatus = event.target.closest("[data-idea-status]");
  if (ideaStatus) {
    const idea = state.workspaceViewModel.trackedIdeas.find((item) => item.id === ideaStatus.dataset.ideaStatus);
    const statuses = ["researching", "shortlisted", "monitoring", "closed", "archived"];
    await workspaceRepository.updateTrackedIdea(idea.id, { status: statuses[(statuses.indexOf(idea.status) + 1) % statuses.length] });
    return loadWorkspace();
  }
  const ideaOutcome = event.target.closest("[data-idea-outcome]");
  if (ideaOutcome) {
    const idea = state.workspaceViewModel.trackedIdeas.find((item) => item.id === ideaOutcome.dataset.ideaOutcome);
    const results = ["unresolved", "won", "lost", "push", "void", "partial", "unavailable", "not_tracked"];
    await workspaceRepository.updateTrackedIdea(idea.id, { resultStatus: results[(results.indexOf(idea.resultStatus) + 1) % results.length] });
    return loadWorkspace();
  }
  const hideModule = event.target.closest("[data-dashboard-hide]");
  const moveModule = event.target.closest("[data-dashboard-move]");
  if (hideModule || moveModule) {
    const layout = state.workspaceViewModel.dashboard;
    let moduleIds = [...layout.moduleIds];
    let hiddenModuleIds = [...layout.hiddenModuleIds];
    if (hideModule) hiddenModuleIds = [...new Set([...hiddenModuleIds, hideModule.dataset.dashboardHide])];
    if (moveModule) {
      const index = moduleIds.indexOf(moveModule.dataset.dashboardMove);
      const next = Math.max(0, Math.min(moduleIds.length - 1, index + Number(moveModule.dataset.direction)));
      moduleIds.splice(next, 0, moduleIds.splice(index, 1)[0]);
    }
    await workspaceRepository.updateDashboardLayout(state.workspaceViewModel.workspace.id, { preset: "custom", moduleIds, hiddenModuleIds });
    return loadWorkspace();
  }
  if (event.target.closest("[data-reset-preferences]")) {
    await workspaceRepository.resetPreferences(state.workspaceViewModel.workspace.id);
    return loadWorkspace();
  }
  if (event.target.closest("[data-export-workspace]")) return downloadWorkspaceJson(await workspaceRepository.exportWorkspace(state.workspaceViewModel.workspace.id), "edgeboard-workspace.json");
  const confirmImport = event.target.closest("[data-confirm-import]");
  if (confirmImport && state.workspacePendingImport) {
    const result = await workspaceRepository.importWorkspace(state.workspacePendingImport, confirmImport.dataset.confirmImport);
    state.workspacePendingImport = "";
    elements.workspaceStatus.textContent = `Import complete. Skipped ${result.skipped.length} existing record${result.skipped.length === 1 ? "" : "s"}.`;
    return loadWorkspace();
  }
  if (event.target.closest("[data-clear-activity]")) {
    await workspaceRepository.clearActivity(state.workspaceViewModel.workspace.id);
    return loadWorkspace();
  }
  if (event.target.closest("[data-clear-alerts]")) return confirmWorkspaceAction("clear-alerts", "", "Clear all local alert events? Alert rules will remain.");
  if (event.target.closest("[data-delete-workspace]")) return confirmWorkspaceAction("delete-workspace", state.workspaceViewModel.workspace.id, "Delete this workspace and all contained local research? Export first if you need a backup.");
  if (event.target.closest("[data-delete-all]")) return confirmWorkspaceAction("delete-all", "", "This permanently deletes all local EdgeBoard workspace data in this browser.", "DELETE MY EDGEBOARD DATA");
}

elements.workspaceContent.addEventListener("click", (event) => {
  handleWorkspaceClick(event).catch(reportWorkspaceError);
});

async function handleWorkspaceChange(event) {
  if (event.target.matches("[data-workspace-filter]")) {
    const key = event.target.dataset.workspaceFilter;
    let value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    if (key === "archived") value = value === "true" ? true : undefined;
    if (key === "pinned" && !value) value = undefined;
    const filters = { ...(state.workspaceRoute.filters || {}) };
    if (value === "" || value === undefined) delete filters[key];
    else filters[key] = value;
    state.workspaceRoute = { ...state.workspaceRoute, filters };
    await loadWorkspace();
    return;
  }
  if (event.target.matches("[data-dashboard-preset]")) {
    await workspaceRepository.updateDashboardLayout(state.workspaceViewModel.workspace.id, { preset: event.target.value });
    await loadWorkspace();
  }
  if (event.target.matches("[data-import-workspace]")) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const preview = workspaceRepository.previewImport(text);
    const output = elements.workspaceContent.querySelector("[data-import-preview]");
    if (!preview.valid) output.textContent = `Import rejected: ${preview.errors.join(" ")}`;
    else {
      state.workspacePendingImport = text;
      output.innerHTML = `Valid schema ${escapeHtml(preview.schemaVersion)}; ${escapeHtml(preview.counts.savedObjects)} saved items. Choose how to continue:
        <button type="button" data-confirm-import="merge">Merge newer records</button>
        <button type="button" data-confirm-import="duplicate">Import as copies</button>
        <button type="button" data-confirm-import="replace">Replace matching workspace</button>`;
    }
  }
}

elements.workspaceContent.addEventListener("change", (event) => {
  handleWorkspaceChange(event).catch(reportWorkspaceError);
});

async function handleWorkspaceSubmit(event) {
  if (!event.target.matches("[data-preferences-form]")) return;
  event.preventDefault();
  const data = new FormData(event.target);
  await workspaceRepository.updatePreferences(state.workspaceViewModel.workspace.id, {
    favoriteSportIds: String(data.get("favoriteSportIds") || "").split(",").map((item) => item.trim()).filter(Boolean),
    favoriteLeagueIds: String(data.get("favoriteLeagueIds") || "").split(",").map((item) => item.trim()).filter(Boolean),
    favoriteEntityIds: String(data.get("favoriteEntityIds") || "").split(",").map((item) => item.trim()).filter(Boolean),
    hiddenSportIds: String(data.get("hiddenSportIds") || "").split(",").map((item) => item.trim()).filter(Boolean),
    preferredResearchMode: data.get("preferredResearchMode"),
    preferredOddsFormat: data.get("preferredOddsFormat"),
    preferredConfidenceThreshold: Number(data.get("preferredConfidenceThreshold")),
    preferredDateWindow: Math.max(1, Number(data.get("preferredDateWindow")) || 10),
    preferredChartType: data.get("preferredChartType"),
    emphasis: data.get("emphasis"),
    density: data.get("density"),
    reduceMotion: data.has("reduceMotion"),
    privacyMode: data.has("privacyMode"),
    activityPaused: data.has("activityPaused"),
    financialSimulationVisible: data.has("financialSimulationVisible"),
  });
  elements.workspaceStatus.textContent = "Personalization saved locally.";
  await loadWorkspace();
}

elements.workspaceContent.addEventListener("submit", (event) => {
  handleWorkspaceSubmit(event).catch(reportWorkspaceError);
});

let workspaceSearchTimer = 0;
elements.workspaceContent.addEventListener("input", (event) => {
  if (!event.target.matches("[data-workspace-search]")) return;
  window.clearTimeout(workspaceSearchTimer);
  const query = event.target.value;
  workspaceSearchTimer = window.setTimeout(() => {
    state.workspaceRoute = { ...state.workspaceRoute, query };
    loadWorkspace().then(() => {
      const input = elements.workspaceContent.querySelector("[data-workspace-search]");
      input?.focus();
      if (input) input.setSelectionRange(query.length, query.length);
    }).catch(reportWorkspaceError);
  }, 180);
});

elements.workspaceShareDialog.addEventListener("click", async (event) => {
  if (event.target.closest("[data-close-share-dialog]")) {
    elements.workspaceShareDialog.close();
    return;
  }
  if (!state.workspaceShareSnapshot) return;
  if (event.target.closest("[data-copy-share-snapshot]")) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.workspaceShareSnapshot, null, 2));
      elements.workspaceStatus.textContent = "Read-only local snapshot copied. Private notes and activity were excluded.";
      elements.workspaceShareDialog.close();
    } catch (error) {
      elements.workspaceSharePreview.insertAdjacentHTML("beforebegin", `<p class="data-warning" role="alert">${escapeHtml(error?.message || "Clipboard access is unavailable.")}</p>`);
    }
  }
  if (event.target.closest("[data-download-share-snapshot]")) {
    downloadWorkspaceJson(state.workspaceShareSnapshot, "edgeboard-read-only-snapshot.json");
    elements.workspaceStatus.textContent = "Read-only local snapshot downloaded.";
    elements.workspaceShareDialog.close();
  }
});

window.addEventListener("popstate", () => {
  const params = new URLSearchParams(window.location.search);
  const workspaceRoute = parseWorkspaceRoute(params);
  if (workspaceRoute) {
    state.workspaceActive = true;
    state.workspaceRoute = workspaceRoute;
    loadWorkspace({ focusHeading: true });
    return;
  }
  if (state.workspaceActive) {
    state.workspaceActive = false;
    state.workspaceRoute = null;
    applyWorkspaceVisibility();
  }
  const visualType = params.get("visual") || "";
  const entityId = params.get("entityProfile") || "";
  const athleteId = params.get("player") || "";
  const tab = params.get("tab") || "overview";
  if (visualType) {
    const visualEntityId = params.get("visualEntity") || "";
    const entity = entityRegistry.getEntity(visualEntityId);
    state.profileAthleteId = "";
    state.profileViewModel = null;
    state.entityProfileId = "";
    state.entityProfileViewModel = null;
    renderAthleteProfile();
    renderEntityProfile();
    state.visualRequest = {
      visualizationType: visualType,
      sportId: params.get("visualSport") || entity?.sportId || "",
      leagueId: params.get("visualLeague") || entity?.leagueId || "",
      entityType: entity?.type || "athlete",
      entityIds: visualEntityId ? [visualEntityId] : [],
      eventIds: [],
      statIds: [],
      dateRange: params.get("visualWindow") === "season"
        ? { type: "season", value: "season" }
        : { type: "last_n_games", value: Math.max(1, Number(params.get("visualWindow")) || 10) },
      filters: {
        threshold: params.get("visualThreshold") === null ? null : Number(params.get("visualThreshold")),
        seriesIds: String(params.get("visualSeries") || "").split(",").filter(Boolean),
      },
    };
    loadVisualAnalytics({ focusHeading: true });
    return;
  }
  if (state.visualRequest) {
    visualAbortController?.abort();
    visualRequestSequence += 1;
    state.visualRequest = null;
    state.visualResult = null;
    state.visualLoading = false;
    renderVisualAnalytics();
  }
  if (entityId) {
    profileRequestSequence += 1;
    state.profileAthleteId = "";
    state.profileViewModel = null;
    state.profileLoading = false;
    renderAthleteProfile();
    if (entityId === state.entityProfileId && state.entityProfileViewModel?.status === "ready") {
      renderEntityProfile();
      return;
    }
    state.entityProfileId = entityId;
    loadEntityProfile({ focusHeading: true });
    return;
  }
  if (state.entityProfileId) {
    entityProfileAbortController?.abort();
    entityProfileRequestSequence += 1;
    state.entityProfileId = "";
    state.entityProfileViewModel = null;
    state.entityProfileLoading = false;
    renderEntityProfile();
  }
  if (!athleteId) {
    profileRequestSequence += 1;
    state.profileAthleteId = "";
    state.profileViewModel = null;
    state.profileLoading = false;
    const restoredSelection = parseNavigationSelection(params.get("scope"));
    if (restoredSelection) {
      state.navigationSelection = normalizeNavigationSelection(
        restoredSelection,
        navigationModel.allLeagues,
        defaultLeague?.leagueId,
      );
      state.leagueId = researchLeagueForSelection(state.navigationSelection, state.leagueId)?.leagueId || state.leagueId;
    }
    state.researchMode = normalizeResearchMode(params.get("mode"), "betting");
    state.selectedEntityId = String(params.get("entity") || "");
    state.statsResultTab = ["summary", "game-log"].includes(params.get("resultTab"))
      ? params.get("resultTab") : "summary";
    state.advancedDisplay = ["cards", "table", "trend", "overlay"].includes(params.get("display"))
      ? params.get("display") : "table";
    state.advancedSort = String(params.get("sort") || "");
    state.advancedSortDirection = params.get("direction") === "asc" ? "asc" : "desc";
    state.statsContextOverrideDisabled = false;
    state.statsResult = null;
    state.statsParsedQuery = null;
    state.researchPlan = null;
    state.researchAnswer = null;
    state.statsLoading = false;
    const queryText = String(params.get("q") || "");
    elements.queryInput.value = queryText;
    state.query = queryText;
    state.showBettingResearch = state.researchMode === "betting";
    renderAthleteProfile();
    renderAll();
    if (queryText) {
      if (state.researchMode === "betting") {
        runBettingResearch(queryText);
      } else {
        runStatsResearch(queryText).then(() => {
          const heading = document.querySelector("#statsResultTitle");
          heading?.setAttribute("tabindex", "-1");
          heading?.focus?.({ preventScroll: true });
        }).catch((error) => {
          elements.queryFeedback.textContent = error?.message || "Unable to restore the research result.";
        });
      }
    }
    return;
  }
  if (athleteId === state.profileAthleteId && state.profileViewModel?.status === "ready") {
    const validTab = state.profileViewModel.tabs.some((item) => item.id === tab);
    state.profileTab = validTab ? tab : "overview";
    if (!validTab) setProfileUrl(athleteId, state.profileTab, { replace: true });
    renderAthleteProfile();
    return;
  }
  if (athleteId !== state.profileAthleteId) resetProfileControls();
  state.profileAthleteId = athleteId;
  state.profileTab = tab;
  loadAthleteProfile({ focusHeading: true }).catch((error) => {
    state.profileLoading = false;
    state.profileViewModel = { status: "not-found", athleteId, error: error?.message || "Profile unavailable" };
    renderAthleteProfile();
  });
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

document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  if (state.workspaceActive) closeWorkspace();
  else if (state.visualRequest) closeVisualAnalytics();
  else if (state.profileAthleteId) closeAthleteProfile();
  else if (state.entityProfileId) closeEntityProfile();
  else window.scrollTo({ top: 0, behavior: "smooth" });
});

let savedTheme = "dark";
try {
  savedTheme = localStorage.getItem("edgeboard-theme") || "dark";
} catch {
  savedTheme = "dark";
}
if (initialResearchState.queryText) elements.queryInput.value = initialResearchState.queryText;
setTheme(savedTheme);
persistNavigationSelection();
renderAll();
scheduleMarketBoardLoad();
if (initialWorkspaceRoute) {
  loadWorkspace({ focusHeading: false });
}
if (!initialWorkspaceRoute && initialResearchState.profileAthleteId) {
  loadAthleteProfile({ focusHeading: false }).catch((error) => {
    state.profileLoading = false;
    state.profileViewModel = {
      status: "not-found",
      athleteId: initialResearchState.profileAthleteId,
      error: error?.message || "Profile unavailable",
    };
    renderAthleteProfile();
  });
}
if (!initialWorkspaceRoute && initialResearchState.entityProfileId) {
  loadEntityProfile({ focusHeading: false });
}
if (!initialWorkspaceRoute && state.visualRequest) {
  loadVisualAnalytics({ focusHeading: false });
}
if (!initialWorkspaceRoute && initialResearchState.queryText
  && !initialResearchState.visualType
  && !initialResearchState.profileAthleteId
  && !initialResearchState.entityProfileId) {
  window.setTimeout(() => document.querySelector("#queryForm").requestSubmit(), 0);
}
