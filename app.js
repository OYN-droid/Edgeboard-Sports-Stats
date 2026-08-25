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
import { createAthleteMediaViewModel } from "./src/services/athlete-media-service.js";
import { createInsightService } from "./src/services/insight-service.js?v=portfolio-narrative-20260821-2";
import { createResearchPlan } from "./src/services/research-planner-service.js";
import { buildResearchAnswer } from "./src/services/research-answer-service.js";
import { createEntityRegistry, mergeProviderEntities } from "./src/services/entity-registry-service.js";
import { createEntityProfileRepository } from "./src/services/entity-profile-service.js";
import {
  advancedResultToCsv,
  advancedResultSummaryToText,
  advancedResultToText,
} from "./src/services/advanced-stats-results-service.js";
import { loadCoverage } from "./src/services/coverage-client.js";
import {
  getEntityResearchActions,
  getOnboardingSteps,
  getRecoveryActions,
  getResearchProgressCopy,
} from "./src/services/ux-guidance-service.js";
import { edgeTrustForResearch, evaluateEdgeTrust } from "./src/services/edge-trust-service.js";
import {
  addResearchSessionNote,
  createResearchSession,
  refreshResearchSession,
  researchSessionShareSnapshot,
  researchSessionToCsv,
  researchSessionToMarkdown,
} from "./src/services/research-session-service.js";
import {
  addEdgeLabAssumption,
  createEdgeLabScenario,
  edgeLabShareSnapshot,
  edgeLabToCsv,
  edgeLabToMarkdown,
} from "./src/services/edge-lab-service.js";
import { createHomeDiscoveryModel } from "./src/services/home-discovery-service.js?v=portfolio-narrative-20260821-2";
import { createHomeCommandCenterModel } from "./src/services/home-command-center-service.js?v=home-command-center-20260824-synthetic-eligibility";
import { createStoryEngine } from "./src/services/story-engine.js?v=portfolio-narrative-20260821-2";
import { createDiscoveryService } from "./src/services/discovery-service.js";
import { createKnowledgeGraphService } from "./src/services/knowledge-graph-service.js";
import { classifyMarketExplainerQuery, createMarketResearchService } from "./src/services/market-research-service.js";
import {
  createMarketScreenerService,
  normalizeScreenerFilters,
  parseScreenerFilters,
  serializeScreenerFilters,
} from "./src/services/market-screener-service.js";
import {
  MARKET_SCREENER_ARRAY_FILTERS,
  MARKET_SCREENER_BOOLEAN_FILTERS,
  MARKET_SCREENER_GROUPS,
  MARKET_SCREENER_NUMERIC_FILTERS,
  MARKET_SCREENER_SORTS,
  MARKET_SCREENER_WINDOW_SIZE,
} from "./src/config/market-screener-config.js";
import { createParlayBuilderService, normalizeParlayConstraints, parseParlayConstraints, serializeParlayConstraints } from "./src/services/parlay-builder-service.js";
import { PARLAY_BOOLEAN_CONSTRAINTS, PARLAY_REFINEMENTS } from "./src/config/parlay-builder-config.js";
import { APP_CONFIG } from "./src/config/app-config.js";

const providerPayload = await loadProviderPayload();
const sportsRepository = createSportsRepository(providerPayload);
const testFixtureTimestamp = document.referrer.includes("/browser-tests/")
  ? new URLSearchParams(window.location.search).get("testFixtureTimestamp") || ""
  : "";
const statsRepository = createStatsRepository(undefined, { generatedAt: testFixtureTimestamp });
const insightService = createInsightService(statsRepository, sportsRepository);
const athleteProfileRepository = createAthleteProfileRepository(statsRepository, sportsRepository, insightService);
const entityRegistry = createEntityRegistry(mergeProviderEntities(providerPayload?.entities));
const storyEngine = createStoryEngine({ insightService, sportsRepository, statsRepository, entityRegistry });
const discoveryService = createDiscoveryService({ sportsRepository, statsRepository, insightService, storyEngine, entityRegistry });
const knowledgeGraphService = createKnowledgeGraphService({ entityRegistry, sportsRepository, statsRepository, insightService, storyEngine });
const marketResearchService = createMarketResearchService({ sportsRepository, statsRepository, entityRegistry, insightService, storyEngine });
const marketScreenerService = createMarketScreenerService({ marketResearchService, clock: () => new Date(testFixtureTimestamp || Date.now()) });
const parlayBuilderService = createParlayBuilderService({ marketScreenerService, clock: () => new Date(testFixtureTimestamp || Date.now()) });
let historicalModulesPromise = null;
let historicalService = null;
let historicalQueryParser = null;
let anniversaryService = null;
let anniversaryQueryParser = null;
function loadHistoricalModules() {
  if (!historicalModulesPromise) {
    historicalModulesPromise = Promise.all([
      import("./src/services/historical-service.js"),
      import("./src/services/historical-query-service.js"),
      import("./src/services/anniversary-service.js"),
    ]).then(([serviceModule, queryModule, anniversaryModule]) => {
      historicalService ||= serviceModule.createHistoricalExplorerService({ sportsRepository, statsRepository, entityRegistry });
      historicalQueryParser = queryModule.parseHistoricalQuery;
      anniversaryService ||= anniversaryModule.createAnniversaryService({ historicalService, sportsRepository, statsRepository, entityRegistry });
      anniversaryQueryParser = anniversaryModule.parseAnniversaryQuery;
      knowledgeGraphService.connectHistorical({ historicalService, anniversaryService });
      marketResearchService.connectHistorical(historicalService);
      discoveryService.historicalService = historicalService;
      discoveryService.clearCache();
      return { historicalService, parseHistoricalQuery: historicalQueryParser, anniversaryService, parseAnniversaryQuery: anniversaryQueryParser };
    });
  }
  return historicalModulesPromise;
}
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
      knowledgeGraphService.connectVisualizations(visualizationRepository);
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
    }).then((result) => {
      if (result && !state.workspaceActive) renderHomeDiscovery();
      return result;
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
  const launchSelection = { type: "system", id: "all", label: "All Sports" };
  return normalizeNavigationSelection(urlSelection || savedSelection || launchSelection, navigationModel.allLeagues, defaultLeague?.leagueId);
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
    queryText: queryFromUrl === null ? "" : queryFromUrl,
    selectedEntityId: String(params.get("entity") || ""),
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
    storyId: String(params.get("story") || ""),
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

function parseDiscoveryRoute(params = new URLSearchParams(window.location.search)) {
  const explore = cleanRouteValue(params.get("explore"));
  const [sportId = "", leagueId = ""] = explore.split(":");
  if (params.get("path")) return { type: "path", id: cleanRouteValue(params.get("path")), sportId, leagueId };
  if (params.get("topic")) return { type: "topic", id: cleanRouteValue(params.get("topic")), sportId, leagueId };
  if (params.get("changes") === "1") return { type: "changes", id: cleanRouteValue(params.get("discovery")) || "changes", sportId, leagueId };
  if (params.get("discovery")) return { type: "item", id: cleanRouteValue(params.get("discovery")), sportId, leagueId };
  if (explore) return { type: "explore", id: explore, sportId, leagueId };
  return null;
}

function cleanRouteValue(value) {
  return String(value || "").trim().slice(0, 240);
}

function parseHistoricalRoute(location = window.location) {
  const parts = location.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts[0] !== "history") return null;
  const params = new URLSearchParams(location.search);
  if (parts[1] === "anniversaries" && parts[2]) return { type: "anniversary", anniversaryId: cleanRouteValue(parts[2]) };
  if (parts[1] === "on-this-day") return {
    type: "anniversaries", date: cleanRouteValue(params.get("date")), year: cleanRouteValue(params.get("year")),
    category: cleanRouteValue(params.get("category")), sportId: cleanRouteValue(params.get("sport")), leagueId: cleanRouteValue(params.get("league")),
  };
  if (parts[1] === "items" && parts[2]) return { type: "item", itemId: cleanRouteValue(parts[2]) };
  if (parts[1] === "rivalries" && parts[2]) return { type: "rivalry", rivalryId: cleanRouteValue(parts[2]) };
  if (["records", "performances", "rivalries", "championships"].includes(parts[1])) return { type: parts[1] };
  if (parts[3] === "seasons" && parts[4]) return { type: "season", sportId: cleanRouteValue(parts[1]), leagueId: cleanRouteValue(parts[2]), seasonId: cleanRouteValue(parts[4]) };
  if (parts[1] && parts[2]) return { type: "league", sportId: cleanRouteValue(parts[1]), leagueId: cleanRouteValue(parts[2]) };
  if (parts[1]) return { type: "sport", sportId: cleanRouteValue(parts[1]) };
  return { type: "home" };
}

function parseMarketRoute(location = window.location) {
  const parts = location.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts[0] !== "markets") return null;
  if (parts[1] === "parlay-builder") {
    const params = new URLSearchParams(location.search);
    return { type: "parlay-builder", constraints: parseParlayConstraints(params.get("constraints") || "") };
  }
  if (parts[1] === "screener") {
    const params = new URLSearchParams(location.search);
    return {
      type: "screener",
      filters: parseScreenerFilters(params.get("filters") || ""),
      sortBy: cleanRouteValue(params.get("sort") || "highest_research_quality"),
      groupBy: cleanRouteValue(params.get("group") || "none"),
    };
  }
  if (parts[1] === "movement") return { type: "movement" };
  if (parts[1] && parts[2]) return { type: "detail", leagueId: cleanRouteValue(parts[1]), selectionId: cleanRouteValue(parts.at(-1)) };
  return { type: "hub" };
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

const initialDiscoveryRoute = parseDiscoveryRoute();
const initialHistoricalRoute = parseHistoricalRoute();
const initialMarketRoute = parseMarketRoute();
const initialAboutRoute = window.location.pathname.replace(/\/+$/, "") === "/about";
const routeLeagueId = initialMarketRoute?.leagueId || initialHistoricalRoute?.leagueId || initialDiscoveryRoute?.leagueId;
const initialNavigationSelection = routeLeagueId && sportsRepository.getLeague(routeLeagueId)
  ? normalizeNavigationSelection({ type: "league", id: routeLeagueId }, navigationModel.allLeagues, defaultLeague?.leagueId)
  : loadNavigationSelection();
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

function loadFavoriteParlayLegs() {
  try { const value = JSON.parse(localStorage.getItem("edgeboard-parlay-favorite-legs-v1") || "[]"); return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, 100) : []; }
  catch { return []; }
}

const state = {
  aboutActive: initialAboutRoute,
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
  graphResearchEntityId: "",
  researchSession: null,
  researchSessionRefreshRequested: false,
  edgeLabScenario: null,
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
  athleteSearchGuidance: [],
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
  activeStoryId: "",
  sharedStoryId: initialResearchState.storyId,
  sharedStoryOpened: false,
  storyResearchContext: null,
  discoveryResearchContext: null,
  discoveryRoute: initialDiscoveryRoute,
  discoverySearch: null,
  discoveryCategory: "",
  marketResearchActive: Boolean(initialMarketRoute),
  marketResearchRoute: initialMarketRoute,
  marketResearchModel: null,
  marketResearchLoading: Boolean(initialMarketRoute),
  marketResearchRequestSequence: 0,
  marketSearchResults: [],
  marketSearchIntent: null,
  marketResearchContext: null,
  marketScreenerFilters: initialMarketRoute?.type === "screener" ? initialMarketRoute.filters : Object.freeze({}),
  marketScreenerSort: initialMarketRoute?.type === "screener" ? initialMarketRoute.sortBy : "highest_research_quality",
  marketScreenerGroup: initialMarketRoute?.type === "screener" ? initialMarketRoute.groupBy : "none",
  marketScreenerResult: null,
  marketScreenerSelectedIds: [],
  marketScreenerOffset: 0,
  marketScreenerAbortController: null,
  parlayConstraints: initialMarketRoute?.type === "parlay-builder" ? initialMarketRoute.constraints : normalizeParlayConstraints(),
  parlayBuilderResult: null,
  parlayBuilderAbortController: null,
  parlayFavoriteSelectionIds: loadFavoriteParlayLegs(),
  parlayVersions: [],
  historyActive: Boolean(initialHistoricalRoute),
  historyRoute: initialHistoricalRoute,
  historicalResult: null,
  historicalLoading: false,
  historicalRequestSequence: 0,
  historicalParsedQuery: null,
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
  openCoverage: document.querySelector("#openCoverage"),
  coverageDialog: document.querySelector("#coverageDialog"),
  coverageTitle: document.querySelector("#coverageDialogTitle"),
  coverageNotice: document.querySelector("#coverageNotice"),
  coverageContent: document.querySelector("#coverageContent"),
  closeCoverageDialog: document.querySelector("#closeCoverageDialog"),
  edgeTrustDialog: document.querySelector("#edgeTrustDialog"),
  edgeTrustDialogContent: document.querySelector("#edgeTrustDialogContent"),
  closeEdgeTrustDialog: document.querySelector("#closeEdgeTrustDialog"),
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
  todayPulse: document.querySelector("#todayPulse"),
  todayPulseTitle: document.querySelector("#todayPulseTitle"),
  todayPulseSummary: document.querySelector("#todayPulseSummary"),
  todayPulseGrid: document.querySelector("#todayPulseGrid"),
  homeCommandCenter: document.querySelector("#homeCommandCenter"),
  homeDiscoverySections: document.querySelector("#homeDiscoverySections"),
  discoveryExplorer: document.querySelector("#discoveryExplorer"),
  discoveryExplorerTitle: document.querySelector("#discoveryExplorerTitle"),
  discoveryExplorerSummary: document.querySelector("#discoveryExplorerSummary"),
  discoveryExplorerContent: document.querySelector("#discoveryExplorerContent"),
  closeDiscoveryExplorer: document.querySelector("#closeDiscoveryExplorer"),
  openHistory: document.querySelector("#openHistory"),
  openMarkets: document.querySelector("#openMarkets"),
  marketResearchView: document.querySelector("#marketResearchView"),
  marketResearchTitle: document.querySelector("#marketResearchTitle"),
  marketResearchSummary: document.querySelector("#marketResearchSummary"),
  marketResearchNav: document.querySelector("#marketResearchNav"),
  marketResearchLoading: document.querySelector("#marketResearchLoading"),
  marketResearchContent: document.querySelector("#marketResearchContent"),
  marketResearchStatus: document.querySelector("#marketResearchStatus"),
  closeMarketResearch: document.querySelector("#closeMarketResearch"),
  saveMarketResearch: document.querySelector("#saveMarketResearch"),
  shareMarketResearch: document.querySelector("#shareMarketResearch"),
  historicalExplorer: document.querySelector("#historicalExplorer"),
  historicalExplorerTitle: document.querySelector("#historicalExplorerTitle"),
  historicalExplorerSummary: document.querySelector("#historicalExplorerSummary"),
  historicalCoverage: document.querySelector("#historicalCoverage"),
  historicalNav: document.querySelector("#historicalNav"),
  historicalLoading: document.querySelector("#historicalLoading"),
  historicalExplorerContent: document.querySelector("#historicalExplorerContent"),
  historicalActionStatus: document.querySelector("#historicalActionStatus"),
  closeHistoricalExplorer: document.querySelector("#closeHistoricalExplorer"),
  saveHistoricalExplorer: document.querySelector("#saveHistoricalExplorer"),
  shareHistoricalExplorer: document.querySelector("#shareHistoricalExplorer"),
  insightDialog: document.querySelector("#insightDialog"),
  insightDialogTitle: document.querySelector("#insightDialogTitle"),
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
  edgeLabDialog: document.querySelector("#edgeLabDialog"),
  edgeLabForm: document.querySelector("#edgeLabForm"),
  edgeLabTarget: document.querySelector("#edgeLabTarget"),
  edgeLabStatus: document.querySelector("#edgeLabStatus"),
  onboarding: document.querySelector("#edgeboardOnboarding"),
  onboardingSteps: document.querySelector("#onboardingSteps"),
  toggleOnboarding: document.querySelector("#toggleOnboarding"),
  dismissOnboarding: document.querySelector("#dismissOnboarding"),
  aboutView: document.querySelector("#aboutView"),
  aboutVersion: document.querySelector("#aboutVersion"),
  aboutFeatureStatus: document.querySelector("#aboutFeatureStatus"),
  aboutLiveStatus: document.querySelector("#aboutLiveStatus"),
  commandPalette: document.querySelector("#commandPalette"),
  openCommandPalette: document.querySelector("#openCommandPalette"),
  closeCommandPalette: document.querySelector("#closeCommandPalette"),
  commandPaletteInput: document.querySelector("#commandPaletteInput"),
  commandPaletteResults: document.querySelector("#commandPaletteResults"),
  commandPaletteStatus: document.querySelector("#commandPaletteStatus"),
};

let renderedPicks = new Map();
let discoverySearchTimer = null;
let marketBoardLoadTimer = 0;
let discoveryReturnFocus = null;
let statsRequestSequence = 0;
let profileRequestSequence = 0;
let entityProfileRequestSequence = 0;
let entityProfileAbortController = null;
let visualRequestSequence = 0;
let visualAbortController = null;
let visualReturnFocus = null;
let commandPaletteReturnFocus = null;
let commandPaletteRequestSequence = 0;
let commandPaletteTimer = 0;
let commandPaletteItems = [];
let commandPaletteIndex = -1;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const RECENT_SEARCHES_KEY = "edgeboard-recent-searches-v1";
const COMMAND_TOPICS = Object.freeze([
  "Today’s verified stories",
  "Current league leaders",
  "Recent line movement",
  "Upcoming milestones",
]);

function loadRecentSearches() {
  try {
    const values = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
    return Array.isArray(values) ? values.filter((value) => typeof value === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function rememberRecentSearch(query) {
  const text = String(query || "").trim();
  if (!text) return;
  try {
    if (workspaceRepository?.snapshot?.().meta?.privacyMode) return;
    const next = [text, ...loadRecentSearches().filter((value) => value.toLowerCase() !== text.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    elements.commandPaletteStatus.textContent = "Recent searches could not be saved in this browser. Your search still works.";
  }
}

function commandDefinitions() {
  return [
    { id: "command-home", group: "Commands", label: "Go to sports discovery", detail: "Home", action: () => { window.location.href = "/"; } },
    { id: "command-intelligence", group: "Commands", label: "Ask Edge Intelligence", detail: "Start or continue a Research Session", action: () => { elements.queryInput.focus(); elements.queryInput.select(); } },
    { id: "command-markets", group: "Commands", label: "Open Edge Markets", detail: "Market research", action: () => setMarketResearchRoute({ type: "hub" }) },
    { id: "command-screener", group: "Commands", label: "Open Market Screener", detail: "Deterministic research filters", action: () => setMarketResearchRoute({ type: "screener" }) },
    { id: "command-parlay", group: "Commands", label: "Open Parlay Builder", detail: "Research tool — not a placed wager", action: () => setMarketResearchRoute({ type: "parlay-builder" }) },
    { id: "command-history", group: "Commands", label: "Open Historical Explorer", detail: "Evidence-backed history", action: () => elements.openHistory.click() },
    { id: "command-workspace", group: "Commands", label: "Open Workspace", detail: "Saved research, watchlists, alerts, and tracking", action: () => openWorkspace() },
    { id: "command-about", group: "Commands", label: "About EdgeBoard", detail: "Purpose, research principles, coverage, and current status", action: () => setAboutRoute(true) },
    { id: "command-comparison", group: "Commands", label: "Start a comparison", detail: "Use identical filters for both entities", query: "Compare two players using the same date and split filters" },
  ];
}

function updateRouteMetadata() {
  const about = state.aboutActive;
  document.title = about ? APP_CONFIG.aboutTitle : APP_CONFIG.defaultTitle;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = about ? APP_CONFIG.aboutDescription : APP_CONFIG.defaultDescription;
}

function applyAboutVisibility({ focus = false } = {}) {
  document.body.classList.toggle("about-active", state.aboutActive);
  elements.aboutView.hidden = !state.aboutActive;
  elements.aboutVersion.textContent = `Version ${APP_CONFIG.version}`;
  elements.aboutFeatureStatus.textContent = APP_CONFIG.status;
  elements.aboutLiveStatus.textContent = APP_CONFIG.liveDataStatus;
  document.querySelectorAll("[data-about-route]").forEach((link) => {
    if (state.aboutActive) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  updateRouteMetadata();
  if (state.aboutActive && focus) elements.aboutView.focus({ preventScroll: true });
}

function setAboutRoute(active, { replace = false, focus = true } = {}) {
  state.aboutActive = Boolean(active);
  const url = new URL(window.location.href);
  url.pathname = state.aboutActive ? "/about" : "/";
  if (!state.aboutActive) {
    state.marketResearchActive = false;
    state.marketResearchRoute = null;
    state.historyActive = false;
    state.historyRoute = null;
    state.workspaceActive = false;
    state.workspaceRoute = null;
    applyMarketResearchVisibility();
    applyHistoryVisibility();
    applyWorkspaceVisibility();
  }
  history[replace ? "replaceState" : "pushState"]({ edgeboardAbout: state.aboutActive }, "", url);
  applyAboutVisibility({ focus });
}

function commandPaletteMarkup(items) {
  if (!items.length) return `<div class="command-palette-empty" role="status"><strong>No supported match yet</strong><p>Try an exact player, team, fighter, driver, story, historical topic, or market. You can also ask Edge Intelligence.</p><button type="button" data-command-query="Show current leaders for the selected scope">Ask Edge Intelligence</button></div>`;
  let group = "";
  return items.map((item, index) => {
    const heading = item.group !== group ? `<h3>${escapeHtml(item.group)}</h3>` : "";
    group = item.group;
    return `${heading}<button id="command-palette-option-${index}" type="button" role="option" aria-selected="${index === commandPaletteIndex}" data-command-index="${index}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.detail || "Open")}</small></button>`;
  }).join("");
}

function renderCommandPalette(items, status = "") {
  commandPaletteItems = items;
  if (commandPaletteIndex >= items.length) commandPaletteIndex = items.length ? 0 : -1;
  elements.commandPaletteResults.innerHTML = commandPaletteMarkup(items);
  elements.commandPaletteInput.setAttribute("aria-activedescendant", commandPaletteIndex >= 0 ? `command-palette-option-${commandPaletteIndex}` : "");
  elements.commandPaletteStatus.textContent = status || `${items.length} supported result${items.length === 1 ? "" : "s"}.`;
}

async function searchCommandPalette(query, requestId) {
  const text = String(query || "").trim();
  if (!text) {
    const recent = loadRecentSearches().map((label, index) => ({ id: `recent-${index}`, group: "Recent searches", label, detail: "Run this research again", query: label }));
    const topics = COMMAND_TOPICS.map((label, index) => ({ id: `topic-${index}`, group: "Explore now", label, detail: "Deterministic topic — not global popularity", query: label }));
    renderCommandPalette([...recent, ...topics, ...commandDefinitions()], "Recent searches stay on this device and are disabled by Workspace privacy mode.");
    return;
  }
  const lower = text.toLowerCase();
  const entities = entityRegistry.search(text, {}, 8).map((entity) => ({
    id: `entity-${entity.id}`, group: "Profiles", label: entity.name, detail: `${entity.typeLabel}${entity.context ? ` · ${entity.context}` : ""}`, entity,
  }));
  const stories = storyEngine.searchStories(text, { limit: 5 }).map((view) => ({
    id: `story-${view.id}`, group: "Stories", label: view.headline, detail: `${view.scopeLabel} · ${view.validationLabel}`, storyId: view.id,
  }));
  const markets = marketResearchService.search(text, {}, 5).map((model) => ({
    id: `market-${model.selectionId}`, group: "Markets", label: `${model.participantName} · ${model.marketName}`, detail: `${model.leagueName} · ${model.status}`, market: model,
  }));
  const commands = commandDefinitions().filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(lower));
  renderCommandPalette([...entities, ...stories, ...markets, ...commands], "Searching profiles, stories, markets, history, and local Workspace…");
  try {
    const [{ repository }, historical] = await Promise.all([loadWorkspaceModules(), loadHistoricalModules()]);
    if (requestId !== commandPaletteRequestSequence || elements.commandPaletteInput.value.trim() !== text) return;
    const history = historical.historicalService.searchHistoricalItems({ query: text, pageSize: 5 }).items.map((item) => ({
      id: `history-${item.id}`, group: "History", label: item.title || item.label, detail: item.coverageLabel || "Historical Explorer", href: item.route,
    }));
    const snapshot = repository.snapshot();
    const saved = (snapshot.savedObjects || []).filter((item) => `${item.title || ""} ${item.description || ""}`.toLowerCase().includes(lower)).slice(0, 5).map((item) => ({
      id: `workspace-${item.id}`, group: "Workspace", label: item.title || "Saved research", detail: `${String(item.type || "research").replaceAll("_", " ")} · local device`, workspaceItem: item,
    }));
    renderCommandPalette([...entities, ...stories, ...markets, ...history, ...saved, ...commands]);
  } catch {
    if (requestId === commandPaletteRequestSequence) renderCommandPalette([...entities, ...stories, ...markets, ...commands], "Current results are available. History or local Workspace search could not be loaded; try again or open that section directly.");
  }
}

function scheduleCommandPaletteSearch() {
  window.clearTimeout(commandPaletteTimer);
  const requestId = ++commandPaletteRequestSequence;
  elements.commandPaletteStatus.textContent = "Searching canonical EdgeBoard sources…";
  commandPaletteTimer = window.setTimeout(() => searchCommandPalette(elements.commandPaletteInput.value, requestId), 120);
}

function openCommandPalette() {
  commandPaletteReturnFocus = document.activeElement;
  commandPaletteIndex = -1;
  if (!elements.commandPalette.open) elements.commandPalette.showModal();
  elements.commandPaletteInput.value = "";
  searchCommandPalette("", ++commandPaletteRequestSequence);
  elements.commandPaletteInput.focus();
}

function closeCommandPalette() {
  if (elements.commandPalette.open) elements.commandPalette.close();
  (commandPaletteReturnFocus instanceof HTMLElement ? commandPaletteReturnFocus : elements.openCommandPalette)?.focus({ preventScroll: true });
}

function executeCommandPaletteItem(item) {
  if (!item) return;
  rememberRecentSearch(elements.commandPaletteInput.value || item.query || item.label);
  closeCommandPalette();
  if (item.action) return item.action();
  if (item.entity) return openSearchResult(item.entity);
  if (item.storyId) return renderStoryDetail(storyEngine.getStory(item.storyId));
  if (item.market) return setMarketResearchRoute({ type: "detail", leagueId: item.market.leagueId, marketId: item.market.marketId, selectionId: item.market.selectionId });
  if (item.href) { window.history.pushState({}, "", item.href); window.dispatchEvent(new PopStateEvent("popstate")); return; }
  if (item.workspaceItem) return openWorkspace({ workspaceId: item.workspaceItem.workspaceId || "workspace-local-default", view: "item", itemId: item.workspaceItem.id });
  if (item.query) {
    elements.queryInput.value = item.query;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#queryForm").requestSubmit();
  }
}

async function writeClipboardWithTimeout(value, timeoutMs = 1500) {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
  let timeoutId;
  try {
    await Promise.race([
      navigator.clipboard.writeText(String(value)),
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("Clipboard permission did not respond.")), timeoutMs);
      }),
    ]);
  } finally {
    window.clearTimeout(timeoutId);
  }
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
    const trust = trustForMarket(pick);
    return `
    <article class="bet-card${cardState}">
      <div class="bet-top">
        <div>
          <p class="bet-title">${athleteId ? `<a href="${escapeHtml(profileUrl(athleteId))}" data-open-athlete="${escapeHtml(athleteId)}">${escapeHtml(pick.name)}</a>` : escapeHtml(pick.name)}</p>
          <div class="bet-market">${escapeHtml(pick.marketDisplayName)} · ${escapeHtml(pick.matchup)} · ${escapeHtml(pick.competitorStatus)}</div>
        </div>
        <div class="odds">${formatOdds(pick.odds)}</div>
      </div>
      <div class="bet-source-row"><span>${escapeHtml(pick.sportsbook)} <span class="source-mode-badge ${escapeHtml(pick.sourceMode || "unavailable")}">${escapeHtml(sourceModeLabel(pick.sourceMode))}</span></span><span>Updated ${formatDateTime(pick.lastUpdatedAt)}</span></div>
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
      <div class="market-research-quality" title="Research Quality evaluates source evidence, not model confidence or win probability."><span>Research Quality</span><strong>${escapeHtml(trust.researchQuality.label)} · ${trust.researchQuality.score}%</strong></div>
      <div class="card-actions">
        <button class="add-button" type="button" data-add="${escapeHtml(pick.id)}" ${actionable ? "" : "disabled"}>${actionable ? "Add to slip" : "Unavailable"}</button>
        <a class="text-button" href="${escapeHtml(marketResearchHref({ type: "detail", leagueId: pick.leagueId || state.leagueId, marketId: pick.marketId || pick.canonicalMarketId, selectionId: pick.id }))}" data-open-market="${escapeHtml(pick.id)}" data-market-league="${escapeHtml(pick.leagueId || state.leagueId)}">Research market</a>
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
      <strong>${escapeHtml(value ?? "Unavailable from configured source")}</strong>
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
  const providerDelay = Number.isFinite(Number(presentation.live?.delaySeconds))
    ? Math.max(0, Math.round(Number(presentation.live.delaySeconds)))
    : null;
  const liveEligible = presentation.liveBadgeEligible === true;
  const liveLabel = !liveEligible
    ? ["sample", "fixture"].includes(presentation.sourceMode) ? sourceModeLabel(presentation.sourceMode) : "Delayed update"
    : presentation.live?.connectionState === "reconnecting"
    ? "Reconnecting"
    : providerDelay > 0 ? `Delayed ${providerDelay}s` : "Live";
  const liveSourceMode = !liveEligible ? "fixture" : presentation.live?.connectionState === "connected" && providerDelay === 0
    ? "live_verified" : "live_partial";
  const liveStatus = presentation.live
    ? `<span class="source-mode-badge ${liveSourceMode}">${escapeHtml(liveLabel)}</span>
       <span>${escapeHtml([presentation.live.period, presentation.live.clock, presentation.live.score].filter(Boolean).join(" · "))}</span>`
    : `<span class="source-mode-badge ${escapeHtml(presentation.sourceMode || "sample")}">${escapeHtml(sourceModeLabel(presentation.sourceMode))}</span>`;
  const commonHeader = `
    <div class="presentation-header">
      <div><p class="eyebrow">${escapeHtml(presentation.sportName)} · ${escapeHtml(presentation.leagueName)}</p><h3>${escapeHtml(presentation.title)}</h3><p>${escapeHtml(presentation.subtitle)}</p></div>
      <div class="presentation-status"><strong>${escapeHtml(presentation.status)}</strong>${liveStatus}<span>${formatDateTime(presentation.startsAt, "Time unavailable")}</span><small>Updated ${formatDateTime(presentation.live?.lastUpdatedAt || presentation.lastUpdatedAt)}</small></div>
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
    sample: "Portfolio demo",
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
    <span><strong>${escapeHtml(labels[state] || state)}</strong><small>${metadata.sample ? "Validated sample data" : escapeHtml(metadata.provider)} · ${escapeHtml(updated)}</small></span>
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

function sourceModeLabel(value) {
  return ({
    live_verified: "Live", live_partial: "Partial", cached_fresh: "Delayed",
    cached_stale: "Delayed", fixture: "Fixture", sample: "Sample", unavailable: "Unavailable",
  })[value] || "Unavailable";
}

function trustForResearchAnswer(answer) {
  if (answer?.edgeTrust?.researchQuality) return answer.edgeTrust;
  return edgeTrustForResearch({
    plan: answer?.plan,
    disclosure: answer?.disclosure,
    completeness: answer?.researchCompleteness,
    evidence: answer?.evidence,
    relatedProps: answer?.relatedProps,
    conflicts: answer?.providerConflicts,
  });
}

function trustForMarket(market = {}) {
  const sample = !["live_verified", "live_partial"].includes(market.sourceMode);
  const timestamp = market.lastUpdatedAt || market.updatedAt || null;
  return evaluateEdgeTrust({
    components: {
      markets: market.available === false || market.suspended ? "unavailable" : sample ? "sample" : "verified",
      freshness: market.stale ? "stale" : timestamp ? sample ? "sample" : "fresh" : "unavailable",
      coverage: market.available === false ? 0 : 1,
      identity: market.playerId || market.competitorId || market.entityId || market.name ? "verified" : "pending",
      completeness: [market.odds, market.line, timestamp].filter((value) => value !== null && value !== undefined && value !== "").length / 3,
    },
    applicable: ["markets", "freshness", "coverage", "identity", "completeness"],
    sample,
    lastValidation: timestamp,
  });
}

function synchronizeResearchSession(question, overrides = {}) {
  const previousQuestion = state.researchSession?.question || "";
  const input = {
    question,
    mode: state.researchMode,
    scope: {
      sportId: currentLeague()?.sportId || "",
      leagueId: currentLeague()?.leagueId || "",
      label: currentLeague()?.leagueDisplayName || "All sports",
    },
    plan: state.researchPlan,
    answer: state.researchAnswer,
    statistics: state.statsResult,
    visualizations: state.visualResult ? [state.visualResult] : [],
    markets: state.researchAnswer?.relatedProps || [],
    ...overrides,
  };
  if (state.researchSessionRefreshRequested && state.researchSession?.id) {
    state.researchSession = refreshResearchSession(state.researchSession, input);
    state.researchSessionRefreshRequested = false;
  } else if (state.researchSession?.question === question) {
    state.researchSession = createResearchSession({
      ...input,
      id: state.researchSession.id,
      revision: state.researchSession.revision,
      createdAt: state.researchSession.createdAt,
      notes: state.researchSession.notes,
      history: state.researchSession.history,
      refreshedAt: state.researchSession.refreshedAt,
    });
  } else {
    state.researchSession = createResearchSession(input);
    if (previousQuestion && previousQuestion !== question) state.edgeLabScenario = null;
  }
  return state.researchSession;
}

function renderEdgeTrustDetails(trust) {
  if (!trust?.researchQuality) return '<div class="data-warning"><strong>Research Quality unavailable</strong><p>Edge Trust has not received enough validated metadata to evaluate this result.</p></div>';
  return `<section class="edge-trust-details" aria-label="Edge Trust details">
    <div class="edge-trust-score"><span>Research Quality</span><strong>${escapeHtml(trust.researchQuality.label)}</strong><span>${trust.researchQuality.score}%</span></div>
    <p>Last validation ${formatDateTime(trust.lastValidation, "Not available")}</p>
    <dl>${trust.details.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.status)}${Number.isFinite(item.percentage) ? ` · ${item.percentage}%` : ""}</dd></div>`).join("")}</dl>
    ${trust.conflicts?.length ? `<section class="edge-trust-conflicts" aria-labelledby="edgeTrustConflictsTitle"><h3 id="edgeTrustConflictsTitle">Conflicting sources</h3>${trust.conflicts.map((conflict) => `<article><strong>${escapeHtml(conflict.category.replaceAll("_", " "))}</strong>${conflict.sources?.map((source) => `<span>${escapeHtml(source.provider || source.name || "Provider")} · ${escapeHtml(source.value || source.status || "Conflicting value")}</span>`).join("") || ""}<p>${escapeHtml(conflict.recommendation)}</p></article>`).join("")}</section>` : ""}
    ${trust.limitations?.length ? `<div class="data-warning"><strong>Why quality is reduced</strong><ul>${trust.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
    <p class="edge-trust-disclaimer">Edge Trust evaluates underlying research quality. It is not betting confidence, model confidence, probability, projection, edge, or historical hit rate.</p>
  </section>`;
}

function openEdgeTrustDetails(trust) {
  elements.edgeTrustDialogContent.innerHTML = renderEdgeTrustDetails(trust);
  elements.edgeTrustDialog.showModal();
  elements.closeEdgeTrustDialog.focus();
}

elements.closeEdgeTrustDialog.addEventListener("click", () => {
  elements.edgeTrustDialog.close();
  elements.researchAnswer.querySelector("[data-open-edge-trust]")?.focus();
});

async function openCoverageView() {
  elements.dataStatusDialog.close();
  elements.coverageDialog.showModal();
  const coverageUrl = new URL(window.location.href);
  coverageUrl.searchParams.set("coverage", "1");
  history.replaceState(null, "", coverageUrl);
  elements.coverageContent.setAttribute("aria-busy", "true");
  elements.coverageContent.innerHTML = '<div class="profile-loading"><span class="stats-skeleton wide" aria-hidden="true"></span><span>Loading coverage…</span></div>';
  elements.coverageTitle.focus({ preventScroll: true });
  const coverage = await loadCoverage();
  elements.coverageNotice.textContent = coverage.notice || "Coverage varies by league and domain.";
  elements.coverageContent.innerHTML = `<div class="coverage-summary"><strong>${coverage.leagues.length} supported league scopes</strong><span>${coverage.liveProviderVerified ? "Certified live coverage is enabled only where shown." : "No league is currently labeled Certified Live."}</span></div><div class="coverage-grid">${coverage.leagues.map((league) => `
    <article class="coverage-card">
      <header><div><span class="coverage-sport">${escapeHtml(league.sportId)} · Group ${league.certificationGroup || "—"}</span><h3>${escapeHtml(league.displayName)}</h3></div><span class="source-mode-badge ${escapeHtml(league.dataMode)}">${escapeHtml(league.certificationState || league.rolloutState.replaceAll("_", " "))}</span></header>
      <div class="coverage-quality"><span>Research Quality</span><strong>${escapeHtml(league.edgeTrust.researchQuality.label)}</strong><span>${league.edgeTrust.researchQuality.score}%</span></div>
      <p>${escapeHtml(league.provider)} · last validation ${formatDateTime(league.edgeTrust.lastValidation, "not available")} · last certification ${formatDateTime(league.lastCertification, "not available")} · last update ${formatDateTime(league.lastUpdatedAt, "not available")}</p>
      <div class="table-scroll"><table><thead><tr><th>Domain</th><th>Coverage</th><th>Updated</th><th>Known limitations</th></tr></thead><tbody>
        ${(league.certificationDomains || league.domains).map((domain) => `<tr><th scope="row">${escapeHtml(domain.label)}</th><td><span class="source-mode-badge ${escapeHtml(domain.state || domain.sourceMode)}">${escapeHtml(domain.publicLabel || domain.publicStatus || sourceModeLabel(domain.sourceMode))}</span></td><td>${escapeHtml(formatDateTime(domain.lastCertifiedAt || domain.lastUpdatedAt, "Not certified"))}</td><td>${escapeHtml((domain.knownLimitations || domain.limitations || [])[0] || "No published limitation")}</td></tr>`).join("")}
      </tbody></table></div>
      <details class="coverage-trust-details"><summary>Edge Trust details</summary>${renderEdgeTrustDetails(league.edgeTrust)}</details>
      ${league.knownLimitations?.length ? `<details><summary>Known limitations</summary><ul>${league.knownLimitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}
    </article>
  `).join("")}</div>`;
  elements.coverageContent.setAttribute("aria-busy", "false");
}

elements.openCoverage.addEventListener("click", () => {
  openCoverageView().catch((error) => {
    elements.coverageContent.setAttribute("aria-busy", "false");
    elements.coverageContent.innerHTML = `<div class="data-warning"><strong>Coverage unavailable</strong><p>${escapeHtml(error?.message || "Unable to load league coverage.")}</p></div>`;
  });
});
elements.closeCoverageDialog.addEventListener("click", () => {
  elements.coverageDialog.close();
  const coverageUrl = new URL(window.location.href);
  coverageUrl.searchParams.delete("coverage");
  history.replaceState(null, "", coverageUrl);
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

function renderAthleteMedia(media, { large = false, loading = "lazy" } = {}) {
  if (!media) return "";
  const candidates = media.candidates || (media.imageUrl ? [{ type: media.imageType, url: media.imageUrl }] : []);
  const encodedCandidates = encodeURIComponent(JSON.stringify(candidates));
  const decorative = media.illustration?.decorative === true;
  const fallback = `<span class="athlete-media-fallback" aria-label="${escapeHtml(media.altText)}" ${decorative ? 'aria-hidden="true"' : 'role="img"'} ${candidates.length ? "hidden" : ""}>${escapeHtml(media.fallbackInitials)}</span>`;
  return `
    <div class="athlete-media${large ? " profile-media" : ""}" data-media-type="${escapeHtml(media.imageType)}">
      ${candidates.length ? `<img src="${escapeHtml(candidates[0].url)}" alt="${decorative ? "" : escapeHtml(media.altText)}" ${decorative ? 'aria-hidden="true"' : ""} loading="${loading === "eager" ? "eager" : "lazy"}" decoding="async" data-athlete-image data-media-index="0" data-media-candidates="${escapeHtml(encodedCandidates)}" />` : ""}
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

function trustForInsight(insight = {}) {
  const complete = insight.validationStatus === "validated" || insight.validationStatus === "provider_asserted";
  return evaluateEdgeTrust({
    components: {
      historical: "sample",
      agreement: insight.providerConflicts?.length ? "partial" : "verified",
      freshness: insight.freshness?.state === "stale" ? "stale" : "sample",
      coverage: complete ? 1 : .5,
      identity: insight.entity?.id || insight.entityIds?.length ? "verified" : "pending",
      completeness: complete ? 1 : .5,
    },
    applicable: ["historical", "agreement", "freshness", "coverage", "identity", "completeness"],
    conflicts: insight.providerConflicts || [],
    sample: true,
    lastValidation: insight.freshness?.lastUpdated,
  });
}

function renderInsightCard(insight, { feature = false, context = "discovery" } = {}) {
  const savedIndex = savedInsightIndex(insight);
  const saved = savedIndex >= 0;
  const savedStatus = saved ? insightService.reconcileSavedInsight(state.savedInsights[savedIndex]) : null;
  const archived = ["stale", "invalid", "incomplete"].includes(insight.validationStatus);
  const trust = trustForInsight(insight);
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
      <div class="market-research-quality" title="Research Quality evaluates source evidence, not projection or probability."><span>Research Quality</span><strong>${escapeHtml(trust.researchQuality.label)} · ${trust.researchQuality.score}%</strong></div>
      ${insight.bettingContext ? `<aside class="related-insight-market"><strong>Related sample market</strong><span>${escapeHtml(insight.bettingContext.line)} · ${formatOdds(insight.bettingContext.odds)} · ${escapeHtml(insight.bettingContext.sportsbook)}</span><small>Fixture market context remains separate from projection and model confidence.</small></aside>` : ""}
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

function homeDiscoveryTrust(card) {
  if (card.edgeTrust) return card.edgeTrust;
  if (card.researchQualityInput) return trustForInsight(card.researchQualityInput);
  return evaluateEdgeTrust({
    components: {
      historical: card.classification === "historical_fact" ? "sample" : "unavailable",
      agreement: "verified",
      freshness: card.source?.updatedAt ? "sample" : "unavailable",
      coverage: card.sampleSize ? 1 : .6,
      identity: card.entity?.id || card.eventTime ? "verified" : "pending",
      completeness: card.validationStatus ? 1 : .5,
    },
    applicable: ["historical", "agreement", "freshness", "coverage", "identity", "completeness"],
    sample: true,
    lastValidation: card.source?.updatedAt,
  });
}

function renderHomeDiscoveryAction(action) {
  if (action.type === "profile") {
    const entityProfile = action.profileSystem === "entity";
    return `<a class="text-button" href="${escapeHtml(entityProfile ? entityProfileUrl(action.entityId) : profileUrl(action.entityId))}" ${entityProfile ? `data-open-entity="${escapeHtml(action.entityId)}"` : `data-open-athlete="${escapeHtml(action.entityId)}"`}>${escapeHtml(action.label)}</a>`;
  }
  if (action.type === "evidence") return `<button type="button" class="text-button" data-view-story="${escapeHtml(action.storyId)}">${escapeHtml(action.label)}</button>`;
  if (action.type === "save-story") return `<button type="button" class="text-button" data-save-story="${escapeHtml(action.storyId)}">${escapeHtml(action.label)}</button>`;
  if (action.type === "follow-entity") return `<button type="button" class="text-button" data-follow-entity="${escapeHtml(action.entityId)}" aria-pressed="${state.followedEntityIds.includes(action.entityId)}">${state.followedEntityIds.includes(action.entityId) ? "Following" : escapeHtml(action.label)}</button>`;
  if (action.type === "share-story") return `<button type="button" class="text-button" data-share-story="${escapeHtml(action.storyId)}">${escapeHtml(action.label)}</button>`;
  if (action.type === "share-anniversary") return `<button type="button" class="text-button" data-share-anniversary="${escapeHtml(action.anniversaryId)}">${escapeHtml(action.label)}</button>`;
  if (action.type === "research-story") return `<button type="button" class="text-button" data-home-query="${escapeHtml(action.query)}" data-home-action="research" data-research-story="${escapeHtml(action.storyId)}">${escapeHtml(action.label)}</button>`;
  if (action.type === "route") return action.href.startsWith("/history")
    ? `<a class="text-button" href="${escapeHtml(action.href)}" data-history-route>${escapeHtml(action.label)}</a>`
    : `<a class="text-button" href="${escapeHtml(action.href)}" data-discovery-route="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`;
  if (action.type === "research") return `<button type="button" class="text-button" data-home-query="${escapeHtml(action.query)}" data-home-action="research" data-discovery-research="${escapeHtml(action.context?.itemId || "")}">${escapeHtml(action.label)}</button>`;
  return `<button type="button" class="text-button" data-home-query="${escapeHtml(action.query)}" data-home-action="${escapeHtml(action.kind)}">${escapeHtml(action.label)}</button>`;
}

function renderHomeDiscoveryCard(card, { feature = false } = {}) {
  const trust = homeDiscoveryTrust(card);
  const sourceLabel = card.localOnly ? "Local only" : card.source?.mode === "fixture" ? "Fixture sample" : card.source?.sample ? "Sample" : "Provider";
  const illustrationEntity = card.entity?.id ? entityRegistry.getEntity(card.entity.id) || card.entity : {
    id: `story-context-${card.leagueId || card.sportId || "multi-sport"}`,
    name: card.leagueId ? `${String(card.leagueId).toUpperCase()} story context` : `${card.sportId || "Multi-sport"} story context`,
    entityType: card.leagueId ? "competition" : "sport",
    sportId: card.sportId || "multi-sport",
    leagueId: card.leagueId || "",
  };
  const illustrationMedia = createAthleteMediaViewModel(illustrationEntity, {
    context: "story", desiredVariant: feature ? "story" : "compact", decorative: true,
    fallbackPolicy: "featured_story",
  });
  const illustration = illustrationMedia?.candidates?.length ? `<div class="home-card-illustration" aria-hidden="true" data-illustration-level="${escapeHtml(illustrationMedia.illustration?.fallbackLevel || "none")}" data-illustration-registry-id="${escapeHtml(illustrationMedia.illustration?.registryId || "")}">${renderAthleteMedia(illustrationMedia, { loading: feature ? "eager" : "lazy" })}</div>` : "";
  return `<article class="home-discovery-card${feature ? " feature" : ""}${card.insightId ? " insight-card" : ""}${illustration ? " has-illustration" : ""}" data-home-card="${escapeHtml(card.id)}" data-card-kind="${escapeHtml(card.kind)}" data-classification="${escapeHtml(card.classification)}" data-league-id="${escapeHtml(card.leagueId || "")}" data-sport-id="${escapeHtml(card.sportId || "")}"${card.insightId ? ` data-insight-card="${escapeHtml(card.insightId)}"` : ""}>
    <div class="home-card-kickers"><span>${escapeHtml(card.eyebrow)}</span><span class="validation-label">${escapeHtml((card.validationStatus || "validation unavailable").replaceAll("_", " "))}</span><span class="sample-badge">${sourceLabel}</span></div>
    ${illustration}
    <h3>${escapeHtml(card.title)}</h3>
    <p>${escapeHtml(card.summary)}</p>
    ${card.whyNotable ? `<p class="discovery-why"><strong>Why notable:</strong> ${escapeHtml(card.whyNotable)}</p>` : ""}
    <div class="home-card-meta">
      ${card.leagueId ? `<span>${escapeHtml(card.leagueId.toUpperCase())}</span>` : ""}
      ${card.sampleSize ? `<span>${card.sampleSize} completed event${card.sampleSize === 1 ? "" : "s"}</span>` : ""}
      ${card.eventTime ? `<span>${formatDateTime(card.eventTime)}</span>` : ""}
      ${card.change ? `<span>${escapeHtml(String(card.change.oldValue))} → ${escapeHtml(String(card.change.newValue))}</span>` : ""}
      <span>${escapeHtml(card.classification.replaceAll("_", " "))}</span>
    </div>
    <div class="market-research-quality" title="Research Quality evaluates source evidence and is not betting confidence or probability."><span>Research Quality</span><strong>${escapeHtml(trust.researchQuality.label)} · ${trust.researchQuality.score}%</strong></div>
    <div class="home-card-actions" aria-label="Explore ${escapeHtml(card.title)}">
      ${card.storyId ? `<button type="button" class="text-button" data-view-story="${escapeHtml(card.storyId)}">Open story</button>` : ""}
      ${card.insightId ? `<button type="button" class="text-button" data-view-insight="${escapeHtml(card.insightId)}">Supporting data</button>` : ""}
      ${card.actions.map(renderHomeDiscoveryAction).join("")}
    </div>
    <small>${escapeHtml(card.source?.source || "Source unavailable")} · ${formatDateTime(card.source?.updatedAt, "timestamp unavailable")} · ${escapeHtml(card.validationStatus || "validation unavailable")}</small>
    <span class="insight-action-status" role="status" aria-live="polite"></span>
  </article>`;
}

function renderKnowledgeGraphAction(item) {
  const action = item.action || {};
  if (action.type === "profile") {
    const entityProfile = action.profileSystem !== "athlete";
    return `<a class="text-button" href="${escapeHtml(entityProfile ? entityProfileUrl(action.entityId) : profileUrl(action.entityId))}" ${entityProfile ? `data-open-entity="${escapeHtml(action.entityId)}"` : `data-open-athlete="${escapeHtml(action.entityId)}"`}>Open</a>`;
  }
  if (action.type === "story") return `<button type="button" class="text-button" data-view-story="${escapeHtml(action.storyId)}">Open story</button>`;
  if (action.type === "insight") return `<button type="button" class="text-button" data-view-insight="${escapeHtml(action.insightId)}">Supporting data</button>`;
  if (action.type === "route") return `<a class="text-button" href="${escapeHtml(action.href)}" data-history-route>Open</a>`;
  if (action.type === "visual") {
    const entity = entityRegistry.getEntity(action.entityId);
    return `<button type="button" class="text-button" data-open-visual="${escapeHtml(defaultVisualizationType(entity))}" data-visual-entity="${escapeHtml(action.entityId)}">Open visuals</button>`;
  }
  if (action.type === "workspace") return `<button type="button" class="text-button" data-graph-workspace="${escapeHtml(action.entityId)}">Save</button>`;
  return `<button type="button" class="text-button" data-graph-query="${escapeHtml(action.query || item.description)}">Research</button>`;
}

function renderKnowledgeGraph(entityId, { context = "page", limit = 30 } = {}) {
  const graph = knowledgeGraphService.getEntityGraph(entityId, { mode: state.researchMode, currentDate: new Date(), limit });
  if (graph.status !== "ready") return `<section class="knowledge-graph" aria-labelledby="knowledgeGraphTitle"><div class="discovery-empty" role="status">No verified connected research graph is available for this canonical entity.</div></section>`;
  const headingId = `knowledgeGraphTitle-${context.replaceAll(/[^a-z0-9-]/gi, "-")}`;
  return `<section class="knowledge-graph" data-knowledge-graph="${escapeHtml(graph.center.id)}" aria-labelledby="${escapeHtml(headingId)}">
    <header class="knowledge-graph-header"><div><p class="eyebrow">Connected sports knowledge graph</p><h2 id="${escapeHtml(headingId)}">What should I research next?</h2><p>${escapeHtml(graph.center.displayName)} is connected only through canonical IDs and supported EdgeBoard evidence.</p></div><span class="sample-badge">Deterministic sample graph</span></header>
    <div class="knowledge-graph-center"><span>${escapeHtml(graph.center.displayName)}</span><small>${escapeHtml(getSelectionSummary(state.navigationSelection).contextLabel)} · ${graph.nodes.length} verified path${graph.nodes.length === 1 ? "" : "s"}</small></div>
    <div class="knowledge-graph-sections">${graph.sections.map((section) => `<section aria-labelledby="${escapeHtml(`${headingId}-${section.id}`)}"><h3 id="${escapeHtml(`${headingId}-${section.id}`)}">${escapeHtml(section.label)}</h3><ul>${section.items.map((item) => `<li data-graph-node="${escapeHtml(item.id)}" data-graph-type="${escapeHtml(item.type)}"><div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.description)}</span><small>${escapeHtml(item.reason)}</small></div>${renderKnowledgeGraphAction(item)}</li>`).join("")}</ul></section>`).join("")}</div>
    <details class="knowledge-graph-method"><summary>How these connections were selected</summary><p>${escapeHtml(graph.warnings[0])}</p><p>Sources: ${escapeHtml(graph.generatedFrom.join(" · "))}. Betting confidence and probability are not graph-scoring inputs.</p></details>
  </section>`;
}

function renderHomeSection(section) {
  const sourceModes = new Set(section.cards.map((card) => card.source?.mode).filter(Boolean));
  const sourceLabel = section.cards.length && section.cards.every((card) => card.localOnly) ? "Local activity"
    : sourceModes.size === 1 && sourceModes.has("fixture") ? "Fixture sample data"
    : sourceModes.size === 1 && sourceModes.has("live") ? "Provider data" : "Sample data";
  return `<section class="home-discovery-section" data-home-section="${escapeHtml(section.id)}" aria-labelledby="home-${escapeHtml(section.id)}-title">
    <div class="today-board-heading"><div><p class="eyebrow">Deterministic discovery</p><h2 id="home-${escapeHtml(section.id)}-title">${escapeHtml(section.title)}</h2><p>${escapeHtml(section.description)}</p></div><span class="sample-badge">${sourceLabel}</span></div>
    <div class="home-discovery-grid">${section.cards.length ? section.cards.map((card) => renderHomeDiscoveryCard(card)).join("") : `<div class="discovery-empty" role="status">${escapeHtml(section.emptyMessage)}</div>`}</div>
  </section>`;
}

function currentDiscoveryWorkspaceState() {
  try {
    return workspaceRepository?.snapshot?.() || null;
  } catch {
    return null;
  }
}

function discoveryScopeAndOptions() {
  const summary = getSelectionSummary(state.navigationSelection);
  const workspaceState = currentDiscoveryWorkspaceState();
  const workspaceId = workspaceState?.workspaces?.find((item) => !item.isArchived)?.id;
  const preferences = workspaceState?.preferences?.find((item) => item.workspaceId === workspaceId) || {};
  return {
    summary,
    scope: {
      leagueIds: summary.visibleLeagues.map((league) => league.leagueId),
      sportIds: [...new Set(summary.visibleLeagues.map((league) => league.sportId))],
      liveOnly: summary.selection.type === "system" && summary.selection.id === "live",
      todayOnly: summary.selection.type === "system" && summary.selection.id === "today",
    },
    options: { mode: state.researchMode, now: new Date(), visibleLeagues: summary.visibleLeagues, preferences, workspaceState },
  };
}

function renderDiscoveryViewCard(item) {
  return `<article class="discovery-engine-card" data-discovery-item="${escapeHtml(item.id)}">
    <div class="home-card-kickers"><span>${escapeHtml(item.label)}</span><span class="validation-label">${escapeHtml(item.status)}</span><span class="sample-badge">${item.localOnly ? "Local only" : item.sampleMode ? "Sample data" : "Provider data"}</span></div>
    <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>
    <p class="discovery-why"><strong>Why notable:</strong> ${escapeHtml(item.whyNotable)}</p>
    <div class="home-card-meta"><span>${escapeHtml(item.leagueId.toUpperCase())}</span><span>${escapeHtml(item.type.replaceAll("_", " "))}</span><span>Score ${item.discoveryScore}</span></div>
    <div class="market-research-quality"><span>Research Quality</span><strong>${escapeHtml(item.researchQuality.label)} · ${item.researchQuality.score}%</strong></div>
    <div class="home-card-actions">${item.actions.map(renderHomeDiscoveryAction).join("")}</div>
    <small>${escapeHtml(item.sourceLabel)} · ${formatDateTime(item.freshness.lastUpdated)} · ${escapeHtml(item.status)}</small>
  </article>`;
}

function setDiscoveryRoute(route, { replace = false, focus = true } = {}) {
  state.discoveryRoute = route;
  const url = new URL(window.location.href);
  ["explore", "topic", "discovery", "path", "changes"].forEach((key) => url.searchParams.delete(key));
  if (route?.href) {
    const target = new URL(route.href, window.location.origin);
    ["explore", "topic", "discovery", "path", "changes"].forEach((key) => {
      if (target.searchParams.has(key)) url.searchParams.set(key, target.searchParams.get(key));
    });
    state.discoveryRoute = parseDiscoveryRoute(url.searchParams);
  }
  history[replace ? "replaceState" : "pushState"]({ edgeboardDiscovery: Boolean(state.discoveryRoute) }, "", url);
  renderDiscoveryExplorer({ focus });
}

function renderDiscoveryExplorer({ focus = false } = {}) {
  const route = state.discoveryRoute;
  elements.discoveryExplorer.hidden = !route;
  if (!route) {
    elements.discoveryExplorerContent.innerHTML = "";
    return;
  }
  const { scope, options, summary } = discoveryScopeAndOptions();
  discoveryService.getDiscoveryItems(scope, options);
  const paths = discoveryService.getExplorationPaths(scope, { ...options, limit: 18 });
  let title = "Explore";
  let summaryText = `Progressive discovery for ${summary.contextLabel}.`;
  let content = "";
  if (route.type === "path") {
    const path = paths.find((item) => item.id === route.id);
    if (path) {
      title = path.title;
      summaryText = path.disclosure;
      content = `<ol class="exploration-path" aria-label="${escapeHtml(path.title)}">${path.steps.map((step) => `<li><button type="button" data-home-query="${escapeHtml(step.queryTemplate.query)}" data-discovery-path-step="${escapeHtml(step.id)}"><strong>${escapeHtml(step.label)}</strong><span>${escapeHtml(step.type.replaceAll("_", " "))}</span></button></li>`).join("")}</ol>`;
    } else content = '<div class="discovery-empty" role="status"><h3>Exploration path unavailable</h3><p>The path ID is invalid or no longer has supported evidence in this scope.</p></div>';
  } else if (route.type === "changes") {
    title = "Recently Changed";
    const changed = discoveryService.getRecentlyChanged(scope, { ...options, limit: 18 });
    content = changed.length ? `<div class="discovery-engine-grid">${changed.map(renderDiscoveryViewCard).join("")}</div>` : '<div class="discovery-empty" role="status">No meaningful validated change is available for this scope.</div>';
  } else if (route.type === "item" || route.type === "topic") {
    const itemId = route.type === "topic" ? `topic-${route.id}` : route.id;
    const item = discoveryService.getItem(itemId);
    if (item) {
      const view = discoveryService.buildDiscoveryViewModel(item, options);
      const related = discoveryService.getRelatedDiscovery(item, options);
      title = view.title;
      summaryText = view.summary;
      content = `${renderDiscoveryViewCard(view)}<section aria-labelledby="relatedDiscoveryTitle"><h3 id="relatedDiscoveryTitle">Related Research</h3>${related.length ? `<div class="discovery-engine-grid">${related.map(renderDiscoveryViewCard).join("")}</div>` : '<div class="discovery-empty">No directly related supported item is available.</div>'}</section>`;
    } else content = '<div class="discovery-empty" role="status"><h3>Discovery item unavailable</h3><p>The stable ID is invalid or outside the selected scope.</p></div>';
  } else {
    const league = route.leagueId ? sportsRepository.getLeague(route.leagueId) : summary.visibleLeagues[0];
    const sportId = route.sportId || league?.sportId || scope.sportIds[0];
    const leagueId = route.leagueId || league?.leagueId || scope.leagueIds[0];
    const categories = discoveryService.getExploreCategories({ sportId, leagueId, mode: state.researchMode });
    const topics = discoveryService.getExploreTopics({ sportId, leagueId, mode: state.researchMode });
    const selectedItems = state.discoveryCategory
      ? discoveryService.getExploreCategoryItems(state.discoveryCategory, { sportIds: [sportId], leagueIds: [leagueId] }, { ...options, visibleLeagues: league ? [league] : options.visibleLeagues })
      : topics;
    title = league ? `Explore ${league.leagueDisplayName}` : "Explore Sports";
    content = `<nav class="explore-category-list" aria-label="Supported discovery categories">${categories.map((category) => `<button type="button" aria-pressed="${state.discoveryCategory === category.id}" data-explore-category="${escapeHtml(category.id)}">${escapeHtml(category.label)}</button>`).join("")}</nav>
      ${selectedItems.length ? `<div class="discovery-engine-grid">${selectedItems.map(renderDiscoveryViewCard).join("")}</div>` : '<div class="discovery-empty" role="status">No supported discovery items are available in this category for the selected league.</div>'}
      <section aria-labelledby="guidedPathsTitle"><h3 id="guidedPathsTitle">Suggested Paths</h3><div class="exploration-path-links">${paths.filter((path) => !leagueId || path.leagueId === leagueId).slice(0, 6).map((path) => `<a href="${escapeHtml(path.route.href)}" data-discovery-route="${escapeHtml(path.route.href)}">${escapeHtml(path.title)}</a>`).join("") || "No supported path is available."}</div></section>`;
  }
  elements.discoveryExplorerTitle.textContent = title;
  elements.discoveryExplorerSummary.textContent = summaryText;
  elements.discoveryExplorerContent.innerHTML = content;
  if (focus) elements.discoveryExplorer.focus({ preventScroll: true });
}

function marketResearchHref(modelOrRoute) {
  if (!modelOrRoute || modelOrRoute.type === "hub") return "/markets";
  if (modelOrRoute.type === "movement") return "/markets/movement";
  if (modelOrRoute.type === "parlay-builder") {
    const constraints = normalizeParlayConstraints(modelOrRoute.constraints || state.parlayConstraints);
    return `/markets/parlay-builder?constraints=${encodeURIComponent(serializeParlayConstraints(constraints))}`;
  }
  if (modelOrRoute.type === "screener") {
    const params = new URLSearchParams();
    const filters = normalizeScreenerFilters(modelOrRoute.filters || state.marketScreenerFilters);
    if (Object.keys(filters).length) params.set("filters", serializeScreenerFilters(filters));
    if ((modelOrRoute.sortBy || state.marketScreenerSort) !== "highest_research_quality") params.set("sort", modelOrRoute.sortBy || state.marketScreenerSort);
    if ((modelOrRoute.groupBy || state.marketScreenerGroup) !== "none") params.set("group", modelOrRoute.groupBy || state.marketScreenerGroup);
    return `/markets/screener${params.size ? `?${params}` : ""}`;
  }
  const leagueId = modelOrRoute.leagueId || "unknown";
  const marketId = modelOrRoute.marketId || "market";
  const selectionId = modelOrRoute.selectionId || "";
  return `/markets/${encodeURIComponent(leagueId)}/${encodeURIComponent(marketId)}/${encodeURIComponent(selectionId)}`;
}

function marketResearchContextFor(model, intent = "explain_market", screener = null) {
  if (!model) return null;
  return Object.freeze({
    id: model.id, selectionId: model.selectionId, marketId: model.marketId,
    canonicalMarketId: model.canonicalMarketId, intent,
    sportId: model.sportId, leagueId: model.leagueId,
    entityIds: Object.freeze(model.entity ? [model.entity.id] : []),
    eventIds: Object.freeze(model.event?.id ? [model.event.id] : []),
    participantName: model.participantName, marketName: model.marketName,
    currentLine: model.currentLine, currentOdds: model.currentOdds,
    source: model.source, researchQuality: model.researchQuality,
    marketExplainer: model.marketExplainer, researchChange: model.researchChange,
    counterarguments: model.counterarguments,
    ...(screener ? { screener } : {}),
  });
}

function marketResearchCard(model) {
  const actionable = model.status === "available" && !model.stale;
  return `<article class="market-intelligence-card ${escapeHtml(model.status)}">
    <div class="home-card-kickers"><span>${escapeHtml(model.leagueName)}</span><span>${escapeHtml(model.status)}</span>${model.source.sample ? '<span class="sample-badge">Sample</span>' : ""}</div>
    <h3>${escapeHtml(model.participantName)} · ${escapeHtml(model.marketName)}</h3>
    <p>${escapeHtml(model.currentLine)} · ${formatOdds(model.currentOdds)} · ${escapeHtml(model.sportsbook || "Sportsbook unavailable")}</p>
    <dl class="market-card-metrics"><div><dt>Research Quality</dt><dd>${escapeHtml(model.researchQuality.label)} · ${model.researchQuality.score}%</dd></div><div><dt>Historical sample</dt><dd>${model.historicalPerformance.sampleSize}</dd></div><div><dt>Movement</dt><dd>${model.movement.observed ? `${model.movement.timeline.length} observed snapshots` : "Not supplied"}</dd></div></dl>
    <p class="market-card-reason">${escapeHtml(model.reasonsFor[0] || model.reasonsAgainst[0] || "Review source coverage and current availability before drawing a conclusion.")}</p>
    <small>${escapeHtml(model.source.provider || "Source unavailable")} · updated ${formatDateTime(model.lastUpdatedAt)} · ${actionable ? "available for research" : "not actionable"}</small>
    <div class="card-actions"><a class="text-button" href="${escapeHtml(marketResearchHref(model))}" data-open-market="${escapeHtml(model.selectionId)}" data-market-league="${escapeHtml(model.leagueId)}">Open research</a><button class="text-button" type="button" data-market-query="Research ${escapeHtml(model.participantName)} ${escapeHtml(model.marketName)} ${escapeHtml(model.currentLine)}">Ask Edge Intelligence</button></div>
  </article>`;
}

function marketPerformanceCard(label, performance) {
  return `<article><span>${escapeHtml(label)}</span><strong>${performance.supported ? `${performance.hits}/${performance.sampleSize}` : "Unavailable"}</strong><small>${escapeHtml(performance.message || "No completed provider rows support this view.")}</small></article>`;
}

function screenerInputValue(key) {
  const value = state.marketScreenerFilters?.[key];
  return Array.isArray(value) ? value.join(", ") : value ?? "";
}

function screenerOptions(values, selected = [], labelFor = (value) => value) {
  const accepted = new Set(Array.isArray(selected) ? selected : [selected]);
  return values.map((value) => `<option value="${escapeHtml(value)}"${accepted.has(value) ? " selected" : ""}>${escapeHtml(labelFor(value))}</option>`).join("");
}

function renderMarketScreenerForm(result) {
  const facets = result.facets;
  const leagueLabel = (id) => sportsRepository.getLeague(id)?.leagueDisplayName || id;
  const booleanLabel = {
    projectionAboveLine: "Projection above line", upcomingOnly: "Upcoming events only", freshOnly: "Fresh data only",
    confirmedLineupOnly: "Confirmed lineup only", noInjuryUncertainty: "No injury uncertainty", currentStoriesOnly: "Current stories attached",
    confirmedStarterOnly: "Confirmed starter only", activeRosterOnly: "Active roster only", freshContextOnly: "Fresh context only", noContextConflicts: "No context conflicts",
    milestoneOnly: "Upcoming milestone", streakOnly: "Active streak", recentTrendOnly: "Recent trend",
    movementObservedOnly: "Observed market change required", noProviderConflicts: "No conflicting providers",
  };
  const numberFields = [
    ["currentLineMin", "Current line minimum"], ["currentLineMax", "Current line maximum"],
    ["openingLineMin", "Opening line minimum"], ["openingLineMax", "Opening line maximum"],
    ["movementMin", "Minimum absolute line movement"], ["priceMovementMin", "Minimum absolute price movement"], ["oddsMin", "Odds minimum"], ["oddsMax", "Odds maximum"],
    ["researchQualityMin", "Research Quality minimum"], ["edgeTrustMin", "Market Trust minimum"],
    ["historicalCoverageMin", "Historical rows minimum"], ["historicalHitRateMin", "Historical hit rate minimum %"],
    ["projectionMin", "Projection minimum"], ["edgeMin", "Projected edge minimum"], ["confidenceMin", "Model confidence minimum"],
    ["researchCompletenessMin", "Research Completeness minimum %"],
  ];
  const textFields = [
    ["competitions", "Competition"], ["gameIds", "Game or event"], ["playerIds", "Player"], ["teamIds", "Team"],
    ["fighterIds", "Fighter"], ["driverIds", "Driver"], ["opponentIds", "Opponent"], ["positions", "Position"],
    ["weightClasses", "Weight class"], ["tracks", "Track"], ["surfaces", "Surface"],
  ];
  return `<form class="market-screener-form" id="marketScreenerForm">
    <div class="market-section-heading"><div><p class="eyebrow">Research filters</p><h2>Screen normalized markets</h2></div><span>${Object.keys(state.marketScreenerFilters).length} active filter${Object.keys(state.marketScreenerFilters).length === 1 ? "" : "s"}</span></div>
    <div class="screener-filter-grid primary">
      <label>Sport<select name="sportIds" multiple size="3">${screenerOptions(facets.sportIds, state.marketScreenerFilters.sportIds)}</select></label>
      <label>League<select name="leagueIds" multiple size="3">${screenerOptions(facets.leagueIds, state.marketScreenerFilters.leagueIds, leagueLabel)}</select></label>
      <label>Market type<select name="marketTypes" multiple size="3">${screenerOptions(facets.marketTypes, state.marketScreenerFilters.marketTypes)}</select></label>
      <label>Sportsbook<select name="sportsbooks" multiple size="3">${screenerOptions(facets.sportsbooks, state.marketScreenerFilters.sportsbooks)}</select></label>
      <label>Provider<select name="providers" multiple size="3">${screenerOptions(facets.providers, state.marketScreenerFilters.providers)}</select></label>
      <label>Freshness<select name="freshness" multiple size="3">${screenerOptions(facets.freshness, state.marketScreenerFilters.freshness)}</select></label>
    </div>
    <details class="screener-advanced"${Object.keys(state.marketScreenerFilters).some((key) => !["sportIds", "leagueIds", "marketTypes", "sportsbooks", "providers", "freshness"].includes(key)) ? " open" : ""}><summary>Advanced research filters</summary>
      <div class="screener-filter-grid">${textFields.map(([key, label]) => `<label>${escapeHtml(label)}<input name="${key}" value="${escapeHtml(screenerInputValue(key))}" placeholder="ID or name, comma separated"></label>`).join("")}
        <label>Home or away<select name="homeAway" multiple size="3">${screenerOptions(["home", "away", "unknown"], state.marketScreenerFilters.homeAway)}</select></label>
        ${numberFields.map(([key, label]) => `<label>${escapeHtml(label)}<input type="number" step="any" name="${key}" value="${escapeHtml(screenerInputValue(key))}"></label>`).join("")}
      </div>
      <fieldset class="screener-switches"><legend>Evidence requirements</legend>${MARKET_SCREENER_BOOLEAN_FILTERS.map((key) => `<label><input type="checkbox" name="${key}"${state.marketScreenerFilters[key] ? " checked" : ""}> ${escapeHtml(booleanLabel[key])}</label>`).join("")}</fieldset>
    </details>
    <div class="screener-form-actions"><button class="primary-action" type="submit">Apply filters</button><button class="text-button" type="button" data-screener-reset>Reset</button><button class="text-button" type="button" data-screener-save-preset>Save preset to Workspace</button></div>
  </form>`;
}

function screenerStoryLabel(story) {
  if (!story) return "No exact current story";
  try { return storyEngine.phraseStory(story).headline; } catch { return story.headline || story.title || "Validated current story"; }
}

function screenerInsightLabel(insight, fallback) {
  return insight?.phrasing?.headline || insight?.title || fallback;
}

function renderMarketScreenerCard(item) {
  const selected = state.marketScreenerSelectedIds.includes(item.id);
  return `<article class="market-screener-card" data-screener-result="${escapeHtml(item.id)}">
    <header><label class="screener-select"><input type="checkbox" data-screener-select="${escapeHtml(item.id)}"${selected ? " checked" : ""}> <span class="sr-only">Select ${escapeHtml(item.participantName)} for comparison</span></label><div><div class="home-card-kickers"><span>${escapeHtml(item.leagueName)}</span><span>${escapeHtml(item.model.status || "status unavailable")}</span><span>${escapeHtml(item.freshness)}</span>${item.sample ? '<span class="sample-badge">Sample</span>' : ""}</div><h3>${escapeHtml(item.participantName)} · ${escapeHtml(item.marketName)}</h3><p>${escapeHtml(item.gameLabel)} · ${formatDateTime(item.startsAt)}</p></div></header>
    <div class="screener-result-metrics">
      <div><span>Current line</span><strong>${escapeHtml(item.currentLineDisplay)}</strong></div><div><span>Sportsbook</span><strong>${escapeHtml(item.sportsbook)}</strong></div>
      <div><span>Research Quality</span><strong>${item.researchQuality}% · ${escapeHtml(item.researchQualityLabel)}</strong></div><div><span>Market Trust</span><strong>${item.marketTrustScore}% · ${escapeHtml(item.marketTrustLabel)}</strong></div>
      <div><span>Projection</span><strong>${Number.isFinite(item.projection) ? item.projection : escapeHtml(item.projectionDisplay)}</strong></div><div><span>Projected edge</span><strong>${Number.isFinite(item.projectedEdge) ? item.projectedEdge : escapeHtml(item.edgeDisplay)}</strong></div>
      <div><span>Historical trend</span><strong>${Number.isFinite(item.historicalHitRate) ? `${item.historicalHitRate}%` : "Unavailable"}</strong><small>${escapeHtml(item.historicalTrend)}</small></div><div><span>Provider agreement</span><strong>${escapeHtml(item.providerAgreement)} · ${item.providerCount}</strong></div>
    </div>
    <div class="screener-context-grid"><p><span>Current story</span><strong>${escapeHtml(screenerStoryLabel(item.currentStory))}</strong></p><p><span>Current streak</span><strong>${escapeHtml(screenerInsightLabel(item.currentStreak, "No supported active streak"))}</strong></p><p><span>Current milestone</span><strong>${escapeHtml(screenerInsightLabel(item.currentMilestone, "No supported upcoming milestone"))}</strong></p><p><span>Related visualization</span><strong>${escapeHtml(item.relatedVisualization?.label || "Unavailable without a canonical entity")}</strong></p></div>
    <div class="data-warning"><strong>Counterargument</strong><p>${escapeHtml(item.counterarguments[0] || "No additional counterargument is supported by supplied fields; missing evidence remains unavailable.")}</p></div>
    <footer><small>${escapeHtml(item.provider)} · updated ${formatDateTime(item.lastUpdatedAt)} · ${item.historicalCoverage} completed historical row${item.historicalCoverage === 1 ? "" : "s"} · Research Quality is not probability.</small><div class="card-actions"><a class="text-button" href="${escapeHtml(marketResearchHref(item.model))}" data-open-market="${escapeHtml(item.selectionId)}" data-market-league="${escapeHtml(item.leagueId)}">Open market</a><button class="text-button" type="button" data-market-query="Why is this market in the screener?" data-market-intent="explain_screener_result">Why is this here?</button><button class="text-button" type="button" data-market-query="Show supporting evidence for this screener result." data-market-intent="screener_evidence">Evidence</button>${item.relatedVisualization ? `<button class="text-button" type="button" data-open-visual="${escapeHtml(item.relatedVisualization.type)}" data-visual-entity="${escapeHtml(item.relatedVisualization.entityId)}">Trend visual</button>` : ""}<button class="text-button" type="button" data-screener-save="favorite" data-screener-id="${escapeHtml(item.id)}">Favorite</button><button class="text-button" type="button" data-screener-save="pin" data-screener-id="${escapeHtml(item.id)}">Pin</button><button class="text-button" type="button" data-screener-share="${escapeHtml(item.id)}">Share</button></div></footer>
  </article>`;
}

function renderScreenerComparison(comparison) {
  if (!comparison?.items?.length) return "";
  return `<section class="market-research-section screener-comparison" aria-labelledby="screenerComparisonTitle"><div class="market-section-heading"><div><p class="eyebrow">Compare opportunities</p><h2 id="screenerComparisonTitle">Identical research fields</h2></div><span>${comparison.items.length} selected</span></div><div class="table-scroll"><table><caption>Selected market research comparison; no overall winner is calculated.</caption><thead><tr><th scope="col">Market</th><th scope="col">Research Quality</th><th scope="col">Market Trust</th><th scope="col">Coverage</th><th scope="col">Hit rate</th><th scope="col">Projection</th><th scope="col">Edge</th><th scope="col">Movement</th></tr></thead><tbody>${comparison.items.map((item) => `<tr><th scope="row">${escapeHtml(item.participantName)} · ${escapeHtml(item.marketName)}</th><td>${item.researchQuality}%</td><td>${item.marketTrustScore}%</td><td>${item.historicalCoverage}</td><td>${Number.isFinite(item.historicalHitRate) ? `${item.historicalHitRate}%` : "Unavailable"}</td><td>${Number.isFinite(item.projection) ? item.projection : "Unavailable"}</td><td>${Number.isFinite(item.projectedEdge) ? item.projectedEdge : "Unavailable"}</td><td>${item.movementVerified && Number.isFinite(item.movement) ? item.movement : "Unavailable"}</td></tr>`).join("")}</tbody></table></div><p>${escapeHtml(comparison.disclosure)}</p></section>`;
}

function parlayConstraintForm(result) {
  const records = marketScreenerService.getRecords({ leagueIds: getSelectionSummary(state.navigationSelection).visibleLeagues.map((league) => league.leagueId) }, new Date(testFixtureTimestamp || Date.now()));
  const values = (key) => [...new Set(records.map((item) => item[key]).filter(Boolean))].sort();
  const selected = (key, value) => state.parlayConstraints[key]?.includes(value) ? " selected" : "";
  const checks = {
    confirmedLineupsOnly: "Confirmed lineups only", freshDataOnly: "Fresh data only", noProviderConflicts: "No provider conflicts",
    noInjuryUncertainty: "No injury uncertainty", noWeatherConcerns: "No weather concerns", allowSameGame: "Allow same game",
    confirmedStarterOnly: "Confirmed starter only", activeRosterOnly: "Active roster only", freshContextOnly: "Fresh context only", noContextConflicts: "No context conflicts",
    currentStoriesRequired: "Current stories required", historicalSupportRequired: "Historical support required",
    visualizationAvailable: "Visualization available", currentMilestone: "Current milestone", currentStreak: "Current streak",
    onlyLiveCertifiedData: "Only live certified data", movementObservedOnly: "Observed market change required",
  };
  const number = (name, label, min = "", max = "") => `<label>${label}<input type="number" name="${name}" value="${state.parlayConstraints[name] ?? ""}" ${min !== "" ? `min="${min}"` : ""} ${max !== "" ? `max="${max}"` : ""}></label>`;
  return `<form id="parlayBuilderForm" class="parlay-builder-form">
    <section aria-labelledby="parlayStep1"><p class="eyebrow">Step 1</p><h2 id="parlayStep1">Choose sports</h2><div class="parlay-form-grid"><label>Sports<select name="sportIds" multiple size="4">${values("sportId").map((value) => `<option value="${escapeHtml(value)}"${selected("sportIds", value)}>${escapeHtml(value)}</option>`).join("")}</select></label><label>Current and seasonal leagues<select name="leagueIds" multiple size="4">${values("leagueId").map((value) => `<option value="${escapeHtml(value)}"${selected("leagueIds", value)}>${escapeHtml(sportsRepository.getLeague(value)?.leagueDisplayName || value)}</option>`).join("")}</select></label></div></section>
    <section aria-labelledby="parlayStep2"><p class="eyebrow">Step 2</p><h2 id="parlayStep2">Choose verified market types</h2><label>Available normalized markets<select name="marketTypes" multiple size="6">${values("marketType").map((value) => `<option value="${escapeHtml(value)}"${selected("marketTypes", value)}>${escapeHtml(value)}</option>`).join("")}</select></label><p>Future provider-confirmed market types appear automatically through the normalized market registry.</p></section>
    <section aria-labelledby="parlayStep3"><p class="eyebrow">Step 3</p><h2 id="parlayStep3">Research constraints</h2><div class="parlay-form-grid">${number("minimumResearchQuality", "Minimum Research Quality", 0, 100)}${number("minimumEdgeTrust", "Minimum Edge Trust", 0, 100)}${number("minimumResearchCompleteness", "Minimum Research Completeness", 0, 100)}${number("minimumLineMovement", "Minimum observed line movement", 0)}${number("minimumPriceMovement", "Minimum observed price movement", 0)}${number("maximumLegs", "Maximum legs", 1, 12)}${number("minimumOdds", "Minimum American odds")}${number("maximumOdds", "Maximum American odds")}<label>Preferred sportsbooks<select name="sportsbooks" multiple size="3">${values("sportsbook").map((value) => `<option value="${escapeHtml(value)}"${selected("sportsbooks", value)}>${escapeHtml(value)}</option>`).join("")}</select></label><label>Maximum research correlation<select name="maximumResearchCorrelation">${["low", "medium", "high"].map((value) => `<option value="${value}"${state.parlayConstraints.maximumResearchCorrelation === value ? " selected" : ""}>${value}</option>`).join("")}</select></label></div><fieldset class="parlay-constraint-checks"><legend>Evidence requirements</legend>${PARLAY_BOOLEAN_CONSTRAINTS.map((key) => `<label><input type="checkbox" name="${key}"${state.parlayConstraints[key] ? " checked" : ""}> ${escapeHtml(checks[key])}</label>`).join("")}</fieldset></section>
    <div class="screener-form-actions"><button class="primary-action" type="submit">Build research set</button><button class="text-button" type="button" data-parlay-reset>Reset</button><button class="text-button" type="button" data-parlay-save-preset>Save constraints</button></div>
    <div class="screener-presets" aria-label="Constraint presets">${parlayBuilderService.getPresets().map((preset) => `<button class="text-button" type="button" data-parlay-preset="${escapeHtml(preset.id)}">${escapeHtml(preset.title)}</button>`).join("")}</div>
  </form>`;
}

function renderParlayLeg(leg, index) {
  const story = leg.currentStory ? screenerStoryLabel(leg.currentStory) : "No exact current story";
  const favorite = state.parlayFavoriteSelectionIds.includes(leg.selectionId); const locked = state.parlayBuilderResult?.lockedSelectionIds?.includes(leg.selectionId);
  const illustrationEntity = leg.entityId ? entityRegistry.getEntity(leg.entityId) : null;
  const illustrationMedia = illustrationEntity ? createAthleteMediaViewModel(illustrationEntity, {
    context: "parlay", desiredVariant: "compact", decorative: true,
  }) : null;
  const illustration = illustrationMedia?.candidates?.length
    ? `<aside class="parlay-leg-illustration" aria-hidden="true"><span>Entity context</span>${renderAthleteMedia(illustrationMedia)}</aside>` : "";
  return `<article class="parlay-leg${locked ? " locked" : ""}" data-parlay-leg="${escapeHtml(leg.id)}"><header><div><p class="eyebrow">Research leg ${index + 1}${locked ? " · locked foundation" : ""}</p><h3>${escapeHtml(leg.participantName)} · ${escapeHtml(leg.marketName)}</h3><p>${escapeHtml(leg.currentLine)} · ${formatOdds(leg.currentOdds)} · ${escapeHtml(leg.sportsbook)}</p></div><span class="sample-badge">${leg.sample ? "Sample" : "Provider"}</span></header>${leg.requiresReview ? `<div class="data-warning" role="status"><strong>Review required</strong><p>${escapeHtml(leg.reviewReasons?.[0] || "Provider context changed. This locked research leg remains visible until you explicitly replace or remove it.")}</p></div>` : ""}
    <dl class="parlay-leg-metrics"><div><dt>Best available price</dt><dd>${leg.bestAvailablePrice ? `${escapeHtml(leg.bestAvailablePrice.sportsbook)} · ${formatOdds(leg.bestAvailablePrice.odds)}` : "Unavailable"}</dd></div><div><dt>Research Quality</dt><dd>${leg.researchQuality}% · not probability</dd></div><div><dt>Edge Trust</dt><dd>${leg.edgeTrust}% · not probability</dd></div><div><dt>Research Completeness</dt><dd>${Number.isFinite(leg.researchCompleteness) ? `${leg.researchCompleteness}%` : "Unavailable"}</dd></div><div><dt>Historical coverage</dt><dd>${leg.historicalCoverage} completed rows</dd></div><div><dt>Freshness</dt><dd>${escapeHtml(leg.freshness)}</dd></div><div><dt>Provider agreement</dt><dd>${escapeHtml(leg.providerAgreement)}</dd></div><div><dt>Lineup / injury</dt><dd>${escapeHtml(leg.lineupStatus)} · ${escapeHtml(leg.injuryStatus)}</dd></div><div><dt>Event tracking</dt><dd>${escapeHtml((leg.eventStatus || "unknown").replaceAll("_", " "))}${leg.pregameContextCurrent === false ? " · saved pregame snapshot only" : ""}</dd></div></dl>
    <details><summary>Why this leg?</summary>${illustration}<div class="market-argument-grid"><section><h4>Supporting evidence</h4><ul>${leg.supportingEvidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>No positive conclusion is supported by supplied evidence.</li>"}</ul><dl class="parlay-reason-grid"><div><dt>Historical support</dt><dd>${escapeHtml(leg.historicalPerformance)}</dd></div><div><dt>Recent form</dt><dd>${escapeHtml(leg.recentForm)}</dd></div><div><dt>Opponent matchup</dt><dd>${escapeHtml(leg.opponentMatchup)}</dd></div><div><dt>Home / away</dt><dd>${escapeHtml(leg.homeAway)}</dd></div><div><dt>Current story</dt><dd>${escapeHtml(story)}</dd></div><div><dt>Historical story</dt><dd>${escapeHtml(leg.historicalStory || "Unavailable from supplied evidence.")}</dd></div><div><dt>Current trend</dt><dd>${escapeHtml(leg.currentTrend)}</dd></div><div><dt>Sportsbook</dt><dd>${escapeHtml(leg.sportsbook)}</dd></div></dl><p><strong>Milestone:</strong> ${escapeHtml(screenerInsightLabel(leg.milestone, "None supported"))}</p><p><strong>Streak:</strong> ${escapeHtml(screenerInsightLabel(leg.streak, "None supported"))}</p></section><section><h4>Counterarguments</h4><ul>${leg.counterarguments.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h4>Current unknowns</h4><ul>${leg.currentUnknowns.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>No additional unknown was identified in supplied fields; unobserved uncertainty remains possible.</li>"}</ul></section></div></details>
    <details><summary>Related research</summary><div class="card-actions"><a class="text-button" href="${escapeHtml(marketResearchHref({ type: "detail", leagueId: leg.leagueId, marketId: leg.marketResearchId, selectionId: leg.selectionId }))}" data-open-market="${escapeHtml(leg.selectionId)}" data-market-league="${escapeHtml(leg.leagueId)}">Related markets and props</a>${leg.entityId ? `<button class="text-button" type="button" data-open-visual="market_line_chart" data-visual-entity="${escapeHtml(leg.entityId)}">Related visualization</button><button class="text-button" type="button" data-market-query="Compare ${escapeHtml(leg.participantName)} using identical filters">Related comparison</button>` : ""}<button class="text-button" type="button" data-parlay-query="Research related stories, milestones, streaks, and markets for ${escapeHtml(leg.participantName)}.">Edge Intelligence research</button></div></details>
    <div class="card-actions"><button class="primary-action" type="button" data-parlay-build-around="${escapeHtml(leg.id)}">Build Around This Leg</button><button class="text-button" type="button" data-parlay-replace="${escapeHtml(leg.id)}">Replace This Leg</button><button class="text-button" type="button" aria-pressed="${favorite}" data-parlay-favorite="${escapeHtml(leg.selectionId)}">${favorite ? "Favorited" : "Favorite leg"}</button></div></article>`;
}

function renderParlayChanges(changes = []) {
  if (!changes.length) return "";
  return `<section class="parlay-change-log" aria-labelledby="parlayChangesTitle"><h2 id="parlayChangesTitle">Explain every change</h2>${changes.map((change) => `<article><div class="parlay-change-flow"><span>${escapeHtml(change.previousLeg ? `${change.previousLeg.participantName} · ${change.previousLeg.marketName}` : "No previous leg")}</span><span aria-hidden="true">↓</span><strong>${escapeHtml(change.newLeg ? `${change.newLeg.participantName} · ${change.newLeg.marketName}` : "No compatible replacement")}</strong></div><p>${escapeHtml(change.reason)}</p><dl>${change.metrics.map((metric) => `<div><dt>${escapeHtml(metric.label)}</dt><dd>${escapeHtml(metric.previous ?? "Unavailable")} → ${escapeHtml(metric.current ?? "Unavailable")}${Number.isFinite(metric.delta) ? ` (${metric.delta > 0 ? "+" : ""}${metric.delta})` : ""}${metric.improved === true ? " · improved" : metric.improved === false ? " · tradeoff" : ""}</dd></div>`).join("")}</dl></article>`).join("")}</section>`;
}

function renderParlayExclusions(excluded = []) {
  return `<section class="parlay-exclusions" aria-labelledby="parlayExclusionsTitle"><div class="market-section-heading"><div><p class="eyebrow">Transparent selection</p><h2 id="parlayExclusionsTitle">Why not this leg?</h2></div><span>${excluded.length} excluded market${excluded.length === 1 ? "" : "s"}</span></div>${excluded.length ? `<div class="parlay-exclusion-list">${excluded.map((item) => `<details><summary>${escapeHtml(item.record.participantName)} · ${escapeHtml(item.record.marketName)}</summary><ul>${item.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul><a class="text-button" href="${escapeHtml(marketResearchHref({ type: "detail", leagueId: item.record.leagueId, marketId: item.record.marketResearchId, selectionId: item.record.selectionId }))}">Inspect market evidence</a></details>`).join("")}</div>` : '<div class="discovery-empty">No additional normalized market was available in this scope.</div>'}</section>`;
}

function renderParlayComparison(comparison) {
  if (!comparison?.items?.length) return "";
  return `<section class="parlay-version-comparison" aria-labelledby="parlayVersionComparisonTitle"><h2 id="parlayVersionComparisonTitle">Parlay version comparison</h2><div class="table-scroll"><table><caption>Research versions compared without declaring a winner.</caption><thead><tr><th>Version</th><th>Quality</th><th>Trust</th><th>Completeness</th><th>Correlation</th><th>Historical support</th><th>Potential return</th><th>Sports</th><th>Markets</th><th>Stories</th><th>Streaks</th><th>Counterarguments</th><th>Visuals</th></tr></thead><tbody>${comparison.items.map((item, index) => `<tr><th scope="row">Version ${index + 1}</th><td>${item.researchQuality ?? "Unavailable"}</td><td>${item.edgeTrust ?? "Unavailable"}</td><td>${item.researchCompleteness ?? "Unavailable"}</td><td>${escapeHtml(item.researchCorrelation)}</td><td>${item.historicalCoverage}</td><td>${item.potentialReturnOdds === null ? "Unavailable" : formatOdds(item.potentialReturnOdds)}</td><td>${escapeHtml(item.sports.join(", ") || "Unavailable")}</td><td>${escapeHtml(item.marketTypes.join(", ") || "Unavailable")}</td><td>${item.currentStoryCount}</td><td>${item.currentStreakCount}</td><td>${item.counterargumentCount}</td><td>${item.visualizationCount}</td></tr>`).join("")}</tbody></table></div><p>${escapeHtml(comparison.disclosure)}</p></section>`;
}

function renderParlayBuilder(result) {
  const metric = (label, value) => `<div><span>${label}</span><strong>${value ?? "Unavailable"}</strong></div>`;
  const favoriteMatches = result.legs.filter((leg) => state.parlayFavoriteSelectionIds.includes(leg.selectionId));
  const comparison = state.parlayVersions.length > 1 ? parlayBuilderService.compare(state.parlayVersions) : null;
  return `<div class="parlay-builder">
    <div class="market-hub-disclosure" role="note">${escapeHtml(result.disclosure)}</div>${favoriteMatches.length ? `<div class="favorite-opportunity-notice" role="status">A favorite research opportunity is available: ${escapeHtml(favoriteMatches.map((item) => item.participantName).join(", "))}. This does not imply betting success.</div>` : ""}${parlayConstraintForm(result)}
    <section class="parlay-research-plan" aria-labelledby="parlayPlanTitle"><p class="eyebrow">Step 4 · Edge Intelligence</p><h2 id="parlayPlanTitle">Research plan</h2><ol>${result.researchPlan.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section>
    <section class="parlay-portfolio-summary" aria-labelledby="parlaySummaryTitle"><div class="market-section-heading"><div><p class="eyebrow">Portfolio summary</p><h2 id="parlaySummaryTitle">Evidence across selected legs</h2></div><span>${result.legs.length} of ${result.eligibleCount} eligible markets selected</span></div><div class="parlay-summary-grid">${metric("Research Quality", Number.isFinite(result.portfolio.researchQuality) ? `${result.portfolio.researchQuality}% · not probability` : "Unavailable · not probability")}${metric("Edge Trust", Number.isFinite(result.portfolio.edgeTrust) ? `${result.portfolio.edgeTrust}% · not probability` : "Unavailable · not probability")}${metric("Research Completeness", Number.isFinite(result.portfolio.researchCompleteness) ? `${result.portfolio.researchCompleteness}%` : null)}${metric("Historical Coverage", `${result.portfolio.historicalCoverage} rows`)}${metric("Research Correlation", result.portfolio.researchCorrelation)}${metric("Freshness", result.portfolio.freshness)}${metric("Lineup Status", result.portfolio.lineupStatus)}${metric("Provider Agreement", result.portfolio.providerAgreement)}</div><div class="data-warning"><strong>Correlation: ${escapeHtml(result.correlation.level)}</strong><p>${escapeHtml(result.correlation.explanation)}</p><p>No unsupported probability is calculated.</p></div></section>
    <section aria-labelledby="parlayIntelligenceTitle"><h2 id="parlayIntelligenceTitle">Edge Intelligence summary</h2><ul>${result.intelligenceSummary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><button class="text-button" type="button" data-parlay-query="Explain this parlay research set, its evidence, counterarguments, and uncertainty.">Open structured research session</button></section>
    <section aria-labelledby="suggestedParlayTitle"><p class="eyebrow">Step 5</p><h2 id="suggestedParlayTitle">Suggested research set</h2>${result.legs.length ? `<div class="parlay-leg-list">${result.legs.map(renderParlayLeg).join("")}</div>` : '<div class="discovery-empty" role="status"><h3>No market satisfies every constraint</h3><p>Constraints were not relaxed and unrelated markets were not substituted.</p></div>'}</section>
    ${renderParlayChanges(result.changes)}${renderParlayExclusions(result.excluded)}${renderParlayComparison(comparison)}
    <section aria-labelledby="improveParlayTitle"><h2 id="improveParlayTitle">Improve my parlay research</h2><div class="screener-presets">${PARLAY_REFINEMENTS.map(([id, label]) => `<button class="text-button" type="button" data-parlay-refine="${id}">${escapeHtml(label)}</button>`).join("")}</div><div class="market-explainer-actions" aria-label="Edge Intelligence parlay questions"><button class="text-button" type="button" data-parlay-query="Explain every exclusion in this parlay research set.">Explain exclusions</button><button class="text-button" type="button" data-parlay-query="Explain the supported correlation relationships and remaining unknowns.">Explain correlation</button><button class="text-button" type="button" data-parlay-query="Show stronger alternatives without relaxing my current constraints.">Show stronger alternatives</button><button class="text-button" type="button" data-parlay-query="Show alternatives with less injury and weather uncertainty.">Show lower-uncertainty alternatives</button><button class="text-button" type="button" data-parlay-query="Show higher-price alternatives and their research tradeoffs.">Show higher-price alternatives</button></div></section>
    <section aria-labelledby="parlayVisualsTitle"><h2 id="parlayVisualsTitle">Research visuals</h2><div class="card-actions"><button class="text-button" type="button" data-parlay-query="Show the research timeline and explain every version change.">Research timeline</button><button class="text-button" type="button" data-parlay-query="Visualize line movement for every supported parlay leg.">Line movement</button><button class="text-button" type="button" data-parlay-query="Compare historical trends and Research Quality across these legs.">Historical trend and Research Quality</button><button class="text-button" type="button" data-parlay-query="Explain the supported correlation map for these legs.">Correlation map</button></div><p>Heavy visualizations remain lazy and open only after a user request.</p></section>
    <div class="parlay-sticky-actions" aria-label="Parlay research actions"><button type="button" data-parlay-action="save">Save version</button><button type="button" data-parlay-action="share">Share</button><button type="button" data-parlay-action="export">Export</button><button type="button" data-parlay-action="track">Track version</button><button type="button" data-parlay-action="refresh">Refresh version</button><button type="button" data-parlay-action="duplicate">Duplicate version</button><button type="button" data-parlay-action="archive">Archive version</button><button type="button" data-parlay-action="compare">Compare versions</button></div>
  </div>`;
}

function renderMarketScreener(result) {
  const comparison = marketScreenerService.compare(state.marketScreenerSelectedIds, { leagueIds: getSelectionSummary(state.navigationSelection).visibleLeagues.map((league) => league.leagueId) }, new Date(testFixtureTimestamp || Date.now()));
  const visibleIds = new Set(result.items.map((item) => item.id));
  const groups = result.groupBy === "none" ? [{ label: "Research opportunities", itemIds: result.items.map((item) => item.id) }] : result.groups.map((group) => ({ ...group, itemIds: group.itemIds.filter((id) => visibleIds.has(id)) })).filter((group) => group.itemIds.length);
  const byId = new Map(result.items.map((item) => [item.id, item]));
  return `${renderMarketScreenerForm(result)}
    <section class="market-research-section screener-results" aria-labelledby="screenerResultsTitle"><div class="market-section-heading"><div><p class="eyebrow">Opportunity Explorer</p><h2 id="screenerResultsTitle">${result.total} research result${result.total === 1 ? "" : "s"}</h2><p>${escapeHtml(result.explanation.uncertainty)}</p></div><span>Window ${result.total ? result.window.offset + 1 : 0}–${Math.min(result.total, result.window.offset + result.items.length)} of ${result.total}</span></div>
      <div class="screener-presets" aria-label="Example screener presets">${marketScreenerService.getPresets().map((preset) => `<button class="text-button" type="button" data-screener-preset="${escapeHtml(preset.id)}">${escapeHtml(preset.title)}</button>`).join("")}</div>
      <div class="screener-result-tools"><label>Sort<select data-screener-sort>${screenerOptions(MARKET_SCREENER_SORTS.map((item) => item.id), result.sortBy, (id) => MARKET_SCREENER_SORTS.find((item) => item.id === id)?.label || id)}</select></label><label>Group<select data-screener-group>${screenerOptions(MARKET_SCREENER_GROUPS.map((item) => item.id), result.groupBy, (id) => MARKET_SCREENER_GROUPS.find((item) => item.id === id)?.label || id)}</select></label><button class="text-button" type="button" data-screener-compare${state.marketScreenerSelectedIds.length < 2 ? " disabled" : ""}>Compare selected (${state.marketScreenerSelectedIds.length})</button></div>
      <div class="market-explainer-actions" aria-label="Explain the screener with Edge Intelligence"><button class="text-button" type="button" data-screener-query="Explain this screener." data-screener-intent="explain_screener">Explain this screener</button><button class="text-button" type="button" data-screener-query="Remove weak research from this screener." data-screener-intent="remove_weak_research">Remove weak research</button><button class="text-button" type="button" data-screener-query="Compare these research opportunities." data-screener-intent="compare_opportunities">Compare opportunities</button></div>
      <p class="market-hub-disclosure">${escapeHtml(result.disclosure)}</p>
      ${groups.map((group) => `<section class="screener-result-group" aria-labelledby="screener-group-${escapeHtml(group.label.replace(/\W+/g, "-"))}"><div class="section-title"><h3 id="screener-group-${escapeHtml(group.label.replace(/\W+/g, "-"))}">${escapeHtml(group.label)}</h3><span>${group.itemIds.length}</span></div><div class="market-screener-grid">${group.itemIds.map((id) => renderMarketScreenerCard(byId.get(id))).join("")}</div></section>`).join("") || '<div class="discovery-empty" role="status"><h3>No markets match these research filters</h3><p>Missing values were not treated as favorable evidence. Adjust or reset filters; unrelated markets will not be substituted.</p></div>'}
      <div class="screener-window-controls" aria-label="Virtualized result pages"><button class="text-button" type="button" data-screener-previous${result.window.offset === 0 ? " disabled" : ""}>Previous results</button><button class="text-button" type="button" data-screener-next${result.window.hasMore ? "" : " disabled"}>Next results</button></div>
    </section>${renderScreenerComparison(comparison)}`;
}

function renderMarketExplainerPanel(model) {
  const explainer = model.marketExplainer;
  const currentStory = explainer.currentStory;
  const storyHeadline = currentStory ? storyEngine.phraseStory(currentStory).headline : "No exact current story is connected to this event and market.";
  return `<section class="market-research-section market-explainer-panel" aria-labelledby="marketExplainerTitle">
    <div class="market-section-heading"><div><p class="eyebrow">Explain the market</p><h3 id="marketExplainerTitle">What the evidence says</h3></div><span class="market-trust-badge">${escapeHtml(explainer.researchQuality.label)} · ${explainer.researchQuality.score}% Research Quality</span></div>
    <div class="market-explainer-grid">
      <article><span>Current line</span><strong>${escapeHtml(explainer.currentLine)}</strong></article>
      <article><span>Opening line</span><strong>${escapeHtml(explainer.openingLine)}</strong></article>
      <article><span>Best verified price</span><strong>${explainer.bestPrice ? `${escapeHtml(explainer.bestPrice.sportsbook)} · ${formatOdds(explainer.bestPrice.odds)} · ${escapeHtml(model.priceComparison.freshness.status)}` : "Unavailable"}</strong></article>
      <article><span>Movement</span><strong>${explainer.movement.observed ? `${explainer.movement.lineDelta > 0 ? "+" : ""}${explainer.movement.lineDelta ?? "Observed"}` : "No verified movement"}</strong></article>
      <article><span>Market Trust</span><strong>${escapeHtml(explainer.marketTrust.researchQuality.label)}</strong></article>
      <article><span>Historical context</span><strong>${explainer.historicalContext.supported ? `${explainer.historicalContext.hits}/${explainer.historicalContext.sampleSize} sample rows` : "Unavailable"}</strong></article>
    </div>
    <div class="market-current-story"><span>Current story</span><strong>${escapeHtml(storyHeadline)}</strong>${currentStory ? `<button class="text-button" type="button" data-view-story="${escapeHtml(currentStory.id)}">View supporting story</button>` : ""}</div>
    <div class="data-warning ${explainer.movement.causeStatus !== "unknown" ? "verified-context" : ""}"><strong>${explainer.movement.causeStatus === "verified-cause" ? "Verified movement cause" : explainer.movement.causeStatus === "related-context" ? "Related verified context" : "Explanation limit"}</strong><p>${escapeHtml(explainer.explanation)}</p></div>
    <div class="market-explainer-actions" aria-label="Explain with Edge Intelligence">${[
      ["explain_market", "Explain this market."], ["explain_movement", "Explain today's movement."],
      ["compare_books", "Compare books."], ["historical_movement", "Show historical movement."],
      ["related_research", "Show related research."], ["counterarguments", "Show opposing arguments."],
    ].map(([intent, query]) => `<button class="text-button" type="button" data-market-intent="${intent}" data-market-query="${escapeHtml(query)}">${escapeHtml(query)}</button>`).join("")}</div>
  </section>`;
}

function renderResearchImpact(model) {
  const affected = model.impact.affected;
  const currentSessionAffected = Boolean(state.researchSession?.markets?.some((item) => [item.id, item.selectionId].includes(model.selectionId)));
  const impactPanel = (label, impact, items) => `<article class="market-impact-card ${escapeHtml(impact.status)}"><h4>${escapeHtml(label)}</h4>${impact.events.length ? impact.events.map((item) => `<p><strong>${escapeHtml(item.summary)}</strong><small>${formatDateTime(item.occurredAt)} · ${escapeHtml(item.provider)} · ${escapeHtml(item.verification)}</small></p>`).join("") : `<p>No verified ${escapeHtml(label.toLowerCase())} change is available.</p>`}<dl>${items.map(([name, count]) => `<div><dt>${escapeHtml(name)}</dt><dd>${count}</dd></div>`).join("")}</dl><small>${escapeHtml(impact.researchQualityImpact)}</small></article>`;
  return `<section class="market-research-section" aria-labelledby="researchImpactTitle"><div class="market-section-heading"><div><p class="eyebrow">Research impact</p><h3 id="researchImpactTitle">What changed?</h3></div><span>Structured differences only</span></div>
    <div class="research-change-list">${model.researchChange.changes.map((item) => `<article class="${escapeHtml(item.status)}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.status.replaceAll("-", " "))}</strong><p>${escapeHtml(item.detail)}</p></article>`).join("")}</div>
    <div class="market-impact-grid">
      ${impactPanel("Lineup impact", model.impact.lineup, [["Affected props", affected.marketIds.length], ["Affected stories", affected.storyIds.length], ["Affected research sessions", currentSessionAffected ? 1 : 0], ["Affected comparisons", affected.comparisonQueries.length], ["Affected projections", affected.projectionIds.length]])}
      ${impactPanel("Injury impact", model.impact.injury, [["Affected markets", affected.marketIds.length], ["Affected visualizations", affected.visualizationTypes.length], ["Affected milestones", model.insights.filter((item) => /milestone/i.test(`${item.category} ${item.ruleId}`)).length], ["Affected stories", affected.storyIds.length], ["Affected comparisons", affected.comparisonQueries.length], ["Affected insights", affected.insightIds.length]])}
    </div>
  </section>`;
}

function renderMarketDetail(model) {
  const entityHref = model.entity ? (model.entity.profileSystem === "athlete" ? profileUrl(model.entity.id) : entityProfileUrl(model.entity.id)) : "";
  const entityAttribute = model.entity ? (model.entity.profileSystem === "athlete" ? `data-open-athlete="${escapeHtml(model.entity.id)}"` : `data-open-entity="${escapeHtml(model.entity.id)}"`) : "";
  const performance = model.historicalPerformance;
  const rowValue = (row) => row?.stats?.[performance.statId] ?? row?.[performance.statId] ?? "—";
  const currentPick = getPickBySelectionId(sportsRepository, model.leagueId, model.selectionId);
  return `<article class="market-research-detail">
    <header class="market-detail-hero"><div><div class="home-card-kickers"><span>${escapeHtml(model.leagueName)}</span><span>${escapeHtml(model.status)}</span>${model.source.sample ? '<span class="sample-badge">Fixture demo</span>' : ""}</div><h2>${escapeHtml(model.participantName)} · ${escapeHtml(model.marketName)}</h2><p>${escapeHtml(model.period)} · ${escapeHtml(model.settlementScope)}${model.event?.startsAt ? ` · ${formatDateTime(model.event.startsAt)}` : " · Event time unavailable"}</p></div><div class="market-current-price"><span>${model.source.sample ? "Fixture market snapshot" : "Current provider offer"}</span><strong>${escapeHtml(model.currentLine)} · ${formatOdds(model.currentOdds)}</strong><small>${escapeHtml(model.sportsbook)} · ${model.source.sample ? "sample updated" : "updated"} ${formatDateTime(model.lastUpdatedAt)}</small></div></header>
    ${model.stale ? '<div class="data-warning" role="status"><strong>Stale market</strong><p>This offer may no longer match the provider. Research remains visible with a warning; add-to-slip is disabled.</p></div>' : ""}
    ${renderMarketExplainerPanel(model)}
    ${renderResearchImpact(model)}
    <section class="market-research-section" aria-labelledby="marketWhyTitle"><h3 id="marketWhyTitle">Why research this market?</h3><div class="market-argument-grid"><article><h4>Supporting evidence</h4><ul>${model.reasonsFor.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>No provider evidence supports a positive conclusion.</li>"}</ul></article><article><h4>Counterarguments and uncertainty</h4><ul>${model.reasonsAgainst.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>No additional counterargument was generated from supplied fields.</li>"}</ul></article></div></section>
    <section class="market-research-section" aria-labelledby="marketHistoryTitle"><h3 id="marketHistoryTitle">Historical performance</h3><p>Observed completed source rows only. Hit rate is historical context, not projection or win probability.</p><div class="market-performance-grid">${[["Last 5",performance.last5],["Last 10",performance.last10],["Season sample",performance],["Home",performance.home],["Away",performance.away],["Opponent",performance.opponent]].map(([label,item]) => marketPerformanceCard(label,item)).join("")}</div>
      ${performance.rows.length ? `<div class="table-scroll"><table><caption>Supporting completed event rows</caption><thead><tr><th scope="col">Date</th><th scope="col">Event</th><th scope="col">Observed value</th></tr></thead><tbody>${performance.rows.map((row) => `<tr><td>${formatDateTime(row.event_date, "Unknown")}</td><th scope="row">${escapeHtml(row.event_name || row.opponent_id || row.event_id)}</th><td>${escapeHtml(rowValue(row))}</td></tr>`).join("")}</tbody></table></div>` : '<div class="discovery-empty">No matching completed rows are available for this market statistic.</div>'}
    </section>
    <section class="market-research-section" aria-labelledby="movementTitle"><h3 id="movementTitle">Market timeline</h3>${model.movement.observed ? `<div class="movement-summary"><strong>Opening ${escapeHtml(model.movement.opening?.lineDisplay || "Unavailable")} · ${formatOdds(model.movement.opening?.odds)}</strong><span>Current ${escapeHtml(model.movement.current?.lineDisplay || "Unavailable")} · ${formatOdds(model.movement.current?.odds)}</span><span>Line change ${model.movement.lineDelta > 0 ? "+" : ""}${model.movement.lineDelta ?? "—"}</span></div><ol class="movement-timeline">${model.movement.timeline.map((item) => `<li class="${escapeHtml(item.changeType)}"><span class="timeline-state">${escapeHtml(item.changeType)}</span><time>${formatDateTime(item.observedAt)}</time><strong>${escapeHtml(item.lineDisplay)} · ${formatOdds(item.odds)}</strong><span>${escapeHtml(item.sportsbook)} · ${escapeHtml(item.provider)} · ${escapeHtml(item.verification)}</span></li>`).join("")}</ol>` : '<div class="discovery-empty">The provider supplied no historical price snapshots.</div>'}<div class="data-warning"><strong>Movement explanation: ${escapeHtml(model.movement.causeStatus)}</strong><p>${escapeHtml(model.movement.causeDisclosure)}</p></div>${model.movement.contributingEvents.length ? `<div class="verified-event-list"><h4>Related verified events</h4>${model.movement.contributingEvents.map((item) => `<article><strong>${escapeHtml(item.summary)}</strong><span>${formatDateTime(item.occurredAt)} · ${escapeHtml(item.provider)} · verified</span></article>`).join("")}</div>` : ""}</section>
    <section class="market-research-section" aria-labelledby="pricesTitle"><h3 id="pricesTitle">Compare books</h3><div class="market-price-summary"><article><span>Best</span><strong>${model.priceComparison.best ? `${escapeHtml(model.priceComparison.best.sportsbook)} · ${formatOdds(model.priceComparison.best.odds)}` : "Unavailable"}</strong></article><article><span>Worst</span><strong>${model.priceComparison.worst ? `${escapeHtml(model.priceComparison.worst.sportsbook)} · ${formatOdds(model.priceComparison.worst.odds)}` : "Unavailable"}</strong></article><article><span>Median</span><strong>${model.priceComparison.medianOdds === null ? "Unavailable" : formatOdds(model.priceComparison.medianOdds)}</strong></article><article><span>Average</span><strong>${model.priceComparison.averageOdds === null ? "Unavailable" : formatOdds(Math.round(model.priceComparison.averageOdds))}</strong></article><article><span>Provider agreement</span><strong>${escapeHtml(model.priceComparison.providerAgreement.status)} · ${model.priceComparison.providerAgreement.providerCount} verified</strong></article></div><div class="table-scroll"><table><thead><tr><th scope="col">Sportsbook</th><th scope="col">Line</th><th scope="col">Odds</th><th scope="col">Freshness</th><th scope="col">Verification</th><th scope="col">Market Trust</th></tr></thead><tbody>${model.priceComparison.prices.map((price) => `<tr><th scope="row">${escapeHtml(price.sportsbook)}</th><td>${escapeHtml(price.lineDisplay || price.line)}</td><td>${formatOdds(price.odds)}</td><td>${escapeHtml(price.freshness)} · ${formatDateTime(price.observedAt)}</td><td>${escapeHtml(price.verification)}</td><td>${escapeHtml(price.marketTrust)}</td></tr>`).join("")}</tbody></table></div><p>${escapeHtml(model.priceComparison.disclosure)}</p></section>
    <section class="market-research-section" aria-labelledby="modelContextTitle"><h3 id="modelContextTitle">Provider and model context</h3><div class="market-context-grid"><article><span>Projection</span><strong>${escapeHtml(model.projection || "Unavailable")}</strong></article><article><span>Projected edge</span><strong>${escapeHtml(model.projectedEdge || "Unavailable")}</strong></article><article><span>Model confidence</span><strong>${Number.isFinite(model.modelConfidence) ? `${model.modelConfidence}%` : "Unavailable"}</strong><small>Signal agreement, not win probability.</small></article><article><span>Lineup</span><strong>${escapeHtml(model.lineupStatus)}</strong></article><article><span>Injury</span><strong>${escapeHtml(model.injuryStatus)}</strong></article><article><span>Weather</span><strong>${escapeHtml(model.weatherStatus)}</strong></article></div></section>
    <section class="market-research-section" aria-labelledby="marketVisualsTitle"><h3 id="marketVisualsTitle">Market visuals</h3><p>Visuals use only normalized market snapshots and completed source rows.</p><div class="market-explainer-actions">${[["market_line_chart","Line movement"],["odds_movement_chart","Price history"],["threshold_chart","Threshold history"]].map(([type,label]) => model.entity ? `<button class="text-button" type="button" data-open-visual="${type}" data-visual-entity="${escapeHtml(model.entity.id)}">${label}</button>` : `<button class="text-button" type="button" data-open-visual="${type}" disabled aria-label="${label} unavailable because no canonical entity resolved">${label} unavailable</button>`).join("")}</div>${model.entity ? "" : '<p class="data-warning">A canonical entity did not resolve for these provider rows, so entity-based charts are disabled rather than attached to the wrong participant.</p>'}<div class="market-quality-visual" role="img" aria-label="Research Quality evidence over time. ${model.researchChange.opening?.researchQuality ?? "Opening provider snapshot unavailable"}; ${model.researchChange.current?.researchQuality ?? "latest provider snapshot unavailable"}; current Edge Trust ${model.researchQuality.score}."><h4>Research Quality over time</h4>${model.researchChange.opening?.researchQuality !== null && model.researchChange.opening ? `<label>Opening provider evidence <meter min="0" max="100" value="${model.researchChange.opening.researchQuality}">${model.researchChange.opening.researchQuality}%</meter><span>${model.researchChange.opening.researchQuality}%</span></label>` : '<p>Opening provider quality snapshot unavailable.</p>'}${model.researchChange.current?.researchQuality !== null && model.researchChange.current ? `<label>Latest provider evidence <meter min="0" max="100" value="${model.researchChange.current.researchQuality}">${model.researchChange.current.researchQuality}%</meter><span>${model.researchChange.current.researchQuality}%</span></label>` : '<p>Latest provider quality snapshot unavailable.</p>'}<label>Current Edge Trust <meter min="0" max="100" value="${model.researchQuality.score}">${model.researchQuality.score}%</meter><span>${model.researchQuality.score}%</span></label><small>Provider-shaped quality snapshots and Edge Trust are labeled separately. Neither is probability.</small></div></section>
    <section class="market-research-section" aria-labelledby="marketTrustTitle"><h3 id="marketTrustTitle">Edge Trust</h3>${renderEdgeTrustDetails(model.edgeTrust)}</section>
    <section class="market-research-section" aria-labelledby="marketEvidenceTitle"><h3 id="marketEvidenceTitle">Supporting evidence</h3>${model.supportingEvidence.length ? `<div class="table-scroll"><table><thead><tr><th scope="col">Evidence</th><th scope="col">Timestamp</th><th scope="col">Provider</th><th scope="col">Verification</th></tr></thead><tbody>${model.supportingEvidence.map((item) => `<tr><th scope="row">${escapeHtml(item.label)}</th><td>${formatDateTime(item.timestamp)}</td><td>${escapeHtml(item.provider)}</td><td>${escapeHtml(item.verification)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="discovery-empty">No structured supporting evidence is available.</div>'}</section>
    <section class="market-research-section" aria-labelledby="relatedMarketTitle"><h3 id="relatedMarketTitle">Continue researching</h3><div class="card-actions">${model.entity ? `<a class="text-button" href="${escapeHtml(entityHref)}" ${entityAttribute}>Canonical profile</a><button class="text-button" type="button" data-open-visual="market_line_chart" data-visual-entity="${escapeHtml(model.entity.id)}">Visualize source rows</button><button class="text-button" type="button" data-market-query="Compare ${escapeHtml(model.participantName)} with a supported peer using the same filters">Open comparison</button><button class="text-button" type="button" data-market-query="Show ${escapeHtml(model.leagueName)} leaders for ${escapeHtml(performance.statId || model.marketName)}">Open leaderboard</button>` : ""}<a class="text-button" href="/history/${escapeHtml(model.sportId)}/${escapeHtml(model.leagueId)}" data-history-route>Historical Explorer</a><button class="text-button" type="button" data-market-query="Research ${escapeHtml(model.participantName)} ${escapeHtml(model.marketName)} with counterarguments">Open in Edge Intelligence</button>${currentPick && model.status === "available" && !model.stale ? `<button class="add-button" type="button" data-add="${escapeHtml(model.selectionId)}">Add to research slip</button>` : ""}</div>
      <h4>Related markets</h4><div class="market-related-grid">${model.relatedMarkets.length ? model.relatedMarkets.map(({ market, selection }) => marketResearchCard(marketResearchService.buildModel(market, selection))).join("") : '<div class="discovery-empty">No verified related markets share this event.</div>'}</div>
      <h4>Related deterministic evidence</h4><div class="market-related-grid">${model.stories.map((story) => `<article class="market-intelligence-card"><h3>${escapeHtml(storyEngine.phraseStory(story).headline)}</h3><p>${escapeHtml(story.coverageLabel || story.validationStatus || "Validated story evidence")}</p><button class="text-button" type="button" data-view-story="${escapeHtml(story.id)}">View supporting story</button></article>`).join("")}${model.insights.map((insight) => `<article class="market-intelligence-card"><h3>${escapeHtml(insight.phrasing?.headline || insight.title || "Deterministic insight")}</h3><p>${escapeHtml(insight.phrasing?.validationDisclosure || insight.validationStatus || "Calculated source evidence")}</p><button class="text-button" type="button" data-view-insight="${escapeHtml(insight.id)}">View supporting data</button></article>`).join("") || '<div class="discovery-empty">No exact canonical story or insight connection is available.</div>'}</div>
    </section>
    <footer><small>${escapeHtml(model.source.provider)} · ${escapeHtml(model.source.mode)} · updated ${formatDateTime(model.source.updatedAt)}. ${escapeHtml(model.disclosures.join(" "))}</small></footer>
  </article>`;
}

function applyMarketResearchVisibility() {
  document.body.classList.toggle("markets-active", state.marketResearchActive);
  elements.marketResearchView.hidden = !state.marketResearchActive;
  if (state.marketResearchActive) {
    state.historyActive = false; state.workspaceActive = false;
    elements.historicalExplorer.hidden = true; elements.personalWorkspaceView.hidden = true;
    elements.visualAnalyticsView.hidden = true; elements.entityProfileView.hidden = true; elements.athleteProfileView.hidden = true;
  }
}

async function renderMarketResearch({ focus = false } = {}) {
  if (!state.marketResearchActive) return;
  const request = ++state.marketResearchRequestSequence;
  state.marketResearchLoading = true; elements.marketResearchLoading.hidden = false; elements.marketResearchContent.innerHTML = "";
  const route = state.marketResearchRoute || { type: "hub" };
  elements.marketResearchNav.querySelectorAll("[data-market-route]").forEach((link) => {
    const active = link.dataset.marketRoute === route.type;
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  elements.saveMarketResearch.textContent = ["screener", "parlay-builder"].includes(route.type) ? "Save preset" : "Save";
  try {
    await Promise.resolve();
    if (request !== state.marketResearchRequestSequence) return;
    const summary = getSelectionSummary(state.navigationSelection);
    const scope = { leagueIds: summary.visibleLeagues.map((league) => league.leagueId), sportIds: [] };
    if (route.type === "parlay-builder") {
      state.marketResearchModel = null;
      state.parlayBuilderAbortController?.abort();
      state.parlayBuilderAbortController = new AbortController();
      state.parlayConstraints = normalizeParlayConstraints(route.constraints || state.parlayConstraints);
      const result = await parlayBuilderService.buildAsync(state.parlayConstraints, { scope, currentDate: new Date(testFixtureTimestamp || Date.now()), signal: state.parlayBuilderAbortController.signal });
      if (request !== state.marketResearchRequestSequence) return;
      state.parlayBuilderResult = result;
      if (!state.parlayVersions.some((item) => item.id === result.id)) state.parlayVersions = [...state.parlayVersions, result].slice(-8);
      elements.marketResearchTitle.textContent = "Parlay Builder";
      elements.marketResearchSummary.textContent = "Evaluate fixture market combinations with Edge Intelligence and Edge Trust—not betting advice.";
      elements.marketResearchContent.innerHTML = renderParlayBuilder(result);
    } else if (route.type === "screener") {
      state.marketResearchModel = null;
      state.marketScreenerAbortController?.abort();
      state.marketScreenerAbortController = new AbortController();
      state.marketScreenerFilters = normalizeScreenerFilters(route.filters || state.marketScreenerFilters);
      state.marketScreenerSort = MARKET_SCREENER_SORTS.some((item) => item.id === route.sortBy) ? route.sortBy : state.marketScreenerSort;
      state.marketScreenerGroup = MARKET_SCREENER_GROUPS.some((item) => item.id === route.groupBy) ? route.groupBy : state.marketScreenerGroup;
      const result = await marketScreenerService.screenAsync(state.marketScreenerFilters, {
        scope,
        sortBy: state.marketScreenerSort,
        groupBy: state.marketScreenerGroup,
        offset: state.marketScreenerOffset,
        limit: MARKET_SCREENER_WINDOW_SIZE,
        currentDate: new Date(testFixtureTimestamp || Date.now()),
        signal: state.marketScreenerAbortController.signal,
      });
      if (request !== state.marketResearchRequestSequence) return;
      state.marketScreenerResult = result;
      state.marketScreenerSelectedIds = state.marketScreenerSelectedIds.filter((id) => marketScreenerService.getRecords(scope, new Date(testFixtureTimestamp || Date.now())).some((item) => item.id === id));
      elements.marketResearchTitle.textContent = "Market Screener & Opportunity Explorer";
      elements.marketResearchSummary.textContent = `${summary.contextLabel} · ${result.total} of ${result.candidateCount} normalized research markets match.`;
      elements.marketResearchContent.innerHTML = renderMarketScreener(result);
    } else if (route.type === "detail") {
      const model = await marketResearchService.getBySelectionAsync(route.selectionId, route.leagueId);
      if (request !== state.marketResearchRequestSequence) return;
      state.marketResearchModel = model;
      elements.marketResearchTitle.textContent = model ? `${model.participantName} market research` : "Market unavailable";
      elements.marketResearchSummary.textContent = model ? `${model.leagueName} · ${model.marketName} · ${model.status}` : "The canonical market selection is invalid or no longer supplied.";
      elements.marketResearchContent.innerHTML = model ? renderMarketDetail(model) : '<div class="discovery-empty" role="status"><h2>Market research unavailable</h2><p>No unrelated fallback market has been substituted.</p></div>';
    } else {
      state.marketResearchModel = null;
      let savedItems = [];
      try {
        const { repository } = await loadWorkspaceModules();
        savedItems = repository.snapshot().savedObjects || [];
      } catch {
        elements.marketResearchStatus.textContent = "Local saved-market research is unavailable; current provider research remains available.";
      }
      if (request !== state.marketResearchRequestSequence) return;
      const hub = marketResearchService.buildHub({ ...scope, currentDate: new Date(), savedItems, researchSessions: state.researchSession?.markets?.length ? [state.researchSession] : [] });
      const sections = route.type === "movement" ? hub.sections.filter((section) => ["movement", "changed"].includes(section.id)) : hub.sections;
      elements.marketResearchTitle.textContent = route.type === "movement" ? "Market Movement Explorer" : "Edge Markets";
      elements.marketResearchSummary.textContent = `${summary.contextLabel} · ${hub.total} normalized market selection${hub.total === 1 ? "" : "s"}.`;
      elements.marketResearchContent.innerHTML = `<p class="market-hub-disclosure">${escapeHtml(hub.disclosure)}</p>${sections.map((section) => `<section class="market-hub-section" aria-labelledby="market-section-${escapeHtml(section.id)}"><div class="section-title"><h2 id="market-section-${escapeHtml(section.id)}">${escapeHtml(section.title)}</h2><span>${section.items.length}</span></div>${section.items.length ? `<div class="market-hub-grid">${section.items.map((item) => item.type === "market_research" ? marketResearchCard(item) : `<article class="market-intelligence-card"><h3>${escapeHtml(item.title || item.question || "Saved market research")}</h3><p>Local workspace or current research session reference.</p></article>`).join("")}</div>` : `<div class="discovery-empty">${escapeHtml(section.emptyMessage)}</div>`}</section>`).join("")}`;
    }
  } catch (error) {
    if (error?.name !== "AbortError") elements.marketResearchContent.innerHTML = `<div class="data-warning" role="alert"><strong>Market research unavailable</strong><p>${escapeHtml(error?.message || "Unable to build market research.")}</p></div>`;
  } finally {
    if (request === state.marketResearchRequestSequence) { state.marketResearchLoading = false; elements.marketResearchLoading.hidden = true; if (focus) elements.marketResearchView.focus({ preventScroll: true }); }
  }
}

function setMarketResearchRoute(route, { replace = false, focus = true } = {}) {
  state.marketResearchRoute = route; state.marketResearchActive = Boolean(route);
  const url = new URL(window.location.href);
  if (["screener", "parlay-builder"].includes(route?.type)) {
    const target = new URL(marketResearchHref(route), window.location.origin);
    const scope = url.searchParams.get("scope");
    const fixtureTimestamp = url.searchParams.get("testFixtureTimestamp");
    url.pathname = target.pathname; url.search = target.search;
    if (scope) url.searchParams.set("scope", scope);
    if (fixtureTimestamp) url.searchParams.set("testFixtureTimestamp", fixtureTimestamp);
  } else {
    url.pathname = route ? marketResearchHref(route) : "/";
    url.searchParams.delete("filters"); url.searchParams.delete("sort"); url.searchParams.delete("group"); url.searchParams.delete("constraints");
  }
  history[replace ? "replaceState" : "pushState"]({ edgeboardMarkets: Boolean(route) }, "", url);
  applyMarketResearchVisibility();
  return route ? renderMarketResearch({ focus }) : null;
}

function historicalScope(route = state.historyRoute) {
  const summary = getSelectionSummary(state.navigationSelection);
  const anniversary = route?.type === "anniversary" && anniversaryService
    ? anniversaryService.getAnniversary(route.anniversaryId, { mode: state.researchMode }) : null;
  const inheritNavigationScope = !route || route.type === "home";
  const leagueId = anniversary?.leagueId || route?.leagueId || (inheritNavigationScope && summary.selection.type === "league" ? summary.selection.id : "");
  const league = sportsRepository.getLeague(leagueId);
  return {
    sportId: anniversary?.sportId || route?.sportId || league?.sportId || (inheritNavigationScope && summary.selection.type === "sport" ? summary.selection.id : ""),
    leagueId,
  };
}

function historicalRouteHref(route = { type: "home" }) {
  if (route.type === "anniversaries") return "/history/on-this-day";
  if (route.type === "anniversary") return `/history/anniversaries/${encodeURIComponent(route.anniversaryId)}`;
  if (route.type === "records") return "/history/records";
  if (route.type === "performances") return "/history/performances";
  if (route.type === "championships") return "/history/championships";
  if (route.type === "rivalries" && !route.rivalryId) return "/history/rivalries";
  if (route.type === "rivalry") return `/history/rivalries/${encodeURIComponent(route.rivalryId)}`;
  if (route.type === "item") return `/history/items/${encodeURIComponent(route.itemId)}`;
  if (route.type === "season") return `/history/${encodeURIComponent(route.sportId)}/${encodeURIComponent(route.leagueId)}/seasons/${encodeURIComponent(route.seasonId)}`;
  if (route.type === "league") return `/history/${encodeURIComponent(route.sportId)}/${encodeURIComponent(route.leagueId)}`;
  if (route.type === "sport") return `/history/${encodeURIComponent(route.sportId)}`;
  return "/history";
}

function setHistoricalRoute(route, { replace = false, focus = true } = {}) {
  if (route && state.marketResearchActive) { state.marketResearchActive = false; state.marketResearchRoute = null; applyMarketResearchVisibility(); }
  state.historyRoute = route;
  state.historyActive = Boolean(route);
  const url = new URL(window.location.href);
  url.pathname = route ? historicalRouteHref(route) : "/";
  ["date", "year", "category", "sport", "league"].forEach((key) => url.searchParams.delete(key));
  if (route?.type === "anniversaries") {
    if (route.date) url.searchParams.set("date", route.date);
    if (route.year) url.searchParams.set("year", route.year);
    if (route.category) url.searchParams.set("category", route.category);
    if (route.sportId) url.searchParams.set("sport", route.sportId);
    if (route.leagueId) url.searchParams.set("league", route.leagueId);
  }
  if (!route) ["historyItem", "historyView"].forEach((key) => url.searchParams.delete(key));
  history[replace ? "replaceState" : "pushState"]({ edgeboardHistory: Boolean(route) }, "", url);
  applyHistoryVisibility();
  if (route) return renderHistoricalExplorer({ focus });
  return null;
}

function applyHistoryVisibility() {
  document.body.classList.toggle("history-active", state.historyActive);
  elements.historicalExplorer.hidden = !state.historyActive;
  if (state.historyActive) {
    state.workspaceActive = false;
    elements.personalWorkspaceView.hidden = true;
    elements.visualAnalyticsView.hidden = true;
    elements.entityProfileView.hidden = true;
    elements.athleteProfileView.hidden = true;
  }
}

function renderHistoricalActions(item) {
  return item.actions.map((action) => {
    if (action.type === "entity") return `<a class="text-button" href="${escapeHtml(action.profileSystem === "athlete" ? profileUrl(action.entityId) : entityProfileUrl(action.entityId))}" ${action.profileSystem === "athlete" ? `data-open-athlete="${escapeHtml(action.entityId)}"` : `data-open-entity="${escapeHtml(action.entityId)}"`}>${escapeHtml(action.label)}</a>`;
    if (action.type === "visualize") return `<button class="text-button" type="button" data-history-visual="${escapeHtml(item.id)}">${escapeHtml(action.label)}</button>`;
    if (action.type === "research") return `<button class="text-button" type="button" data-history-research="${escapeHtml(item.id)}" data-history-query="${escapeHtml(action.query)}">${escapeHtml(action.label)}</button>`;
    return "";
  }).join("");
}

function renderHistoricalCard(item) {
  const value = item.titleData.value ?? item.titleData.champion ?? item.titleData.meetings ?? item.titleData.championships ?? null;
  return `<article class="historical-card" data-historical-item="${escapeHtml(item.id)}">
    <div class="home-card-kickers"><span>${escapeHtml(item.leagueName)} · ${escapeHtml(item.sportName)}</span><span>${escapeHtml(item.type.replaceAll("_", " "))}</span><span class="validation-label">${escapeHtml(item.validationLabel)}</span><span class="sample-badge">Sample</span></div>
    <h3><a href="${escapeHtml(item.route)}" data-history-route>${escapeHtml(item.title)}</a></h3>
    ${value !== null ? `<p class="historical-value">${escapeHtml(String(value))}</p>` : ""}
    <p>${escapeHtml(item.coverageLabel)}</p>
    <div class="market-research-quality" title="Research Quality measures evidence support, not probability."><span>Research Quality</span><strong>${escapeHtml(item.researchQuality.label)} · ${item.researchQuality.score}%</strong></div>
    ${item.correction ? `<p class="data-warning"><strong>Corrected result</strong> Previous value ${escapeHtml(String(item.correction.oldValue))}; corrected to ${escapeHtml(String(item.correction.newValue))} on ${escapeHtml(item.correction.correctedAt || "date unavailable")}.</p>` : ""}
    ${item.dynastyCriteria ? `<p class="data-warning"><strong>Candidate criteria:</strong> at least ${item.dynastyCriteria.minimumTitles} championships within ${item.dynastyCriteria.windowSeasons} seasons. This is not a verified dynasty label.</p>` : ""}
    ${item.warnings.map((warning) => `<p class="data-warning">${escapeHtml(warning)}</p>`).join("")}
    <div class="home-card-actions">${renderHistoricalActions(item)}</div>
    <small>${escapeHtml(item.sources[0]?.label || "Source unavailable")} · ${formatDateTime(item.freshness.lastUpdated)} · ${escapeHtml(item.validationStatus.replaceAll("_", " "))}</small>
  </article>`;
}

function renderHistoricalCoverage(coverage) {
  return `<section aria-labelledby="historicalCoverageTitle"><h2 id="historicalCoverageTitle">Historical Coverage</h2>
    <dl class="historical-coverage-grid">
      <div><dt>Scope</dt><dd>${escapeHtml(coverage.leagueName || "Selected sports")}</dd></div>
      <div><dt>Available period</dt><dd>${escapeHtml(coverage.label)}</dd></div>
      <div><dt>Events</dt><dd>${escapeHtml(coverage.eventCompleteness || "Unavailable")}</dd></div>
      <div><dt>Standings</dt><dd>${escapeHtml(coverage.standingsCoverage || "Unavailable")}</dd></div>
      <div><dt>Playoffs or tournament</dt><dd>${escapeHtml(coverage.playoffCoverage || "Unavailable")}</dd></div>
      <div><dt>Championships</dt><dd>${escapeHtml(coverage.championshipCoverage || "Unavailable")}</dd></div>
      <div><dt>Play-by-play</dt><dd>${escapeHtml(coverage.playByPlayAvailability || "Unavailable")}</dd></div>
      <div><dt>All-time claims</dt><dd>${coverage.allTimeClaimsSupported ? "Supported for the verified bounded scope" : "Not supported"}</dd></div>
    </dl>
    ${(coverage.providerLimitations || []).map((warning) => `<p class="data-warning">${escapeHtml(warning)}</p>`).join("")}
  </section>`;
}

function renderHistoricalEvidence(item) {
  return `<div class="stats-table-wrap" tabindex="0" aria-label="Scrollable supporting evidence"><table class="stats-table"><caption>Supporting historical evidence for ${escapeHtml(item.title)}</caption><thead><tr><th scope="col">Date</th><th scope="col">Evidence</th><th scope="col">Event</th><th scope="col">Source</th></tr></thead><tbody>${item.supportingEvidence.map((entry) => `<tr><td>${escapeHtml(entry.occurredAt || "Unavailable")}</td><th scope="row">${escapeHtml(entry.label)}</th><td>${escapeHtml(entry.eventId || "Unavailable")}</td><td>${escapeHtml(entry.sourceId || "Unavailable")}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderAnniversaryCard(item) {
  return `<article class="historical-card anniversary-card" data-anniversary-id="${escapeHtml(item.id)}">
    <div class="home-card-kickers"><span>${escapeHtml(item.leagueName)} · ${escapeHtml(item.sportName)}</span><span>${escapeHtml(item.category)}</span><span class="validation-label">${escapeHtml(item.validationLabel)}</span><span class="sample-badge">Sample history</span></div>
    <p class="anniversary-year"><strong>${item.originalYear}</strong><span>${item.yearsAgo} year${item.yearsAgo === 1 ? "" : "s"} ago</span></p>
    <h3><a href="${escapeHtml(item.route)}" data-history-route>${escapeHtml(item.title)}</a></h3>
    <p>${escapeHtml(item.summary)}</p>
    <div class="market-research-quality" title="Research Quality measures evidence support, not probability."><span>Research Quality</span><strong>${escapeHtml(item.researchQuality.label)} · ${item.researchQuality.score}%</strong></div>
    <div class="home-card-actions">${item.actions.map(renderHomeDiscoveryAction).join("")}</div>
    <small>${escapeHtml(item.sources[0]?.label || "Source unavailable")} · ${formatDateTime(item.freshness.lastUpdated)} · ${escapeHtml(item.coverageLabel)}</small>
  </article>`;
}

function renderAnniversaryTimeline(item) {
  const entries = [["Before", item.timeline.before], ["Event", item.timeline.event], ["After", item.timeline.after]];
  return `<section id="anniversaryTimeline" class="historical-section" aria-labelledby="anniversaryTimelineTitle"><h2 id="anniversaryTimelineTitle">Before, event, and after</h2><p class="sr-only">${escapeHtml(item.timeline.accessibleSummary)}</p><ol class="historical-timeline">${entries.map(([label, entry]) => `<li><time>${escapeHtml(entry?.date || "Date unavailable")}</time><strong>${escapeHtml(label)} · ${entry?.title || (label === "Event" ? item.title : "No supported event")}</strong><span>${escapeHtml(entry?.eventId || "No canonical event in available coverage")}</span></li>`).join("")}</ol></section>`;
}

function renderAnniversaryDetail(item) {
  const paths = anniversaryService.getResearchPaths(item);
  const connections = item.currentConnections;
  return `<article class="anniversary-detail">
    <div class="home-card-kickers"><span>${escapeHtml(item.leagueName)} · ${escapeHtml(item.sportName)}</span><span>${escapeHtml(item.category)}</span><span class="validation-label">${escapeHtml(item.validationLabel)}</span><span class="sample-badge">Illustrative sample history</span></div>
    <p class="anniversary-year"><strong>${item.originalYear}</strong><span>${item.yearsAgo} year${item.yearsAgo === 1 ? "" : "s"} ago</span></p>
    <p class="anniversary-lede">${escapeHtml(item.summary)}</p>
    <dl class="historical-coverage-grid"><div><dt>Date</dt><dd>${escapeHtml(item.date)}</dd></div><div><dt>Coverage</dt><dd>${escapeHtml(item.coverageLabel)}</dd></div><div><dt>Validation</dt><dd>${escapeHtml(item.validationLabel)}</dd></div><div><dt>Research Quality</dt><dd>${escapeHtml(item.researchQuality.label)} · ${item.researchQuality.score}%</dd></div></dl>
    ${item.warnings.map((warning) => `<p class="data-warning">${escapeHtml(warning)}</p>`).join("")}
    <div class="home-card-actions">${item.actions.map(renderHomeDiscoveryAction).join("")}</div>
    ${renderHistoricalEvidence(item)}
    ${renderAnniversaryTimeline(item)}
    <section class="historical-section" aria-labelledby="anniversaryFactsTitle"><h2 id="anniversaryFactsTitle">Did you know?</h2><p>These facts are formatted directly from the same structured event evidence.</p><dl class="historical-coverage-grid">${item.facts.map((fact) => `<div><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`).join("")}</dl></section>
    <section class="historical-section" aria-labelledby="currentConnectionsTitle"><h2 id="currentConnectionsTitle">Current connections</h2><p>Historical facts remain separate from current provider data and model output.</p><div class="historical-grid">
      <article class="historical-card"><h3>Canonical entity</h3><p>${escapeHtml(connections.entity?.name || "No current canonical entity connection is available.")}</p>${connections.entity?.id ? `<div class="home-card-actions">${renderHomeDiscoveryAction({ type: "profile", label: "Open profile", entityId: connections.entity.id, profileSystem: connections.entityProfileSystem })}</div>` : ""}</article>
      <article class="historical-card"><h3>Current events</h3><p>${connections.currentEvents.length ? `${connections.currentEvents.length} related upcoming event${connections.currentEvents.length === 1 ? "" : "s"} in normalized provider data.` : "No related current event is available."}</p></article>
      <article class="historical-card"><h3>Current markets</h3><p>${escapeHtml(connections.marketsMessage)}</p><small>${connections.currentMarkets.length ? "Provider-confirmed availability only; historical context is not a prediction." : "No market was fabricated from the historical result."}</small></article>
    </div></section>
    ${item.relatedItems.length ? `<section class="historical-section"><h2>Related history</h2><div class="historical-grid">${item.relatedItems.map(renderHistoricalCard).join("")}</div></section>` : ""}
    <section class="historical-section" aria-labelledby="anniversaryPathsTitle"><h2 id="anniversaryPathsTitle">Continue researching</h2><div class="home-card-actions">${paths.map((path) => `<button type="button" class="text-button" data-anniversary-query="${escapeHtml(path.query)}">${escapeHtml(path.label)}</button>`).join("")}</div></section>
    ${item.primaryEntity?.id ? renderKnowledgeGraph(item.primaryEntity.id, { context: "anniversary-detail", limit: 24 }) : ""}
  </article>`;
}

function renderAnniversaryFilters(route, result) {
  const sports = [...new Map(sportsRepository.getLeagues().map((league) => [league.sportId, league.sportDisplayName])).entries()];
  const leaguesForSport = sportsRepository.getLeagues().filter((league) => !route.sportId || league.sportId === route.sportId);
  return `<form class="anniversary-filters" data-anniversary-filters><label>Date<input type="date" name="date" value="${escapeHtml(result.date?.iso || route.date || "")}" required></label><label>Original year<input type="number" name="year" min="1800" max="${result.date?.year || new Date().getFullYear()}" value="${escapeHtml(route.year || "")}" placeholder="Any year"></label><label>Sport<select name="sport"><option value="">All sports</option>${sports.map(([id, label]) => `<option value="${escapeHtml(id)}" ${route.sportId === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label><label>League<select name="league"><option value="">All leagues</option>${leaguesForSport.map((league) => `<option value="${escapeHtml(league.leagueId)}" ${route.leagueId === league.leagueId ? "selected" : ""}>${escapeHtml(league.leagueDisplayName)}</option>`).join("")}</select></label><label>Category<select name="category"><option value="">All categories</option>${anniversaryService.categories.map((category) => `<option value="${escapeHtml(category)}" ${route.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select></label><button type="submit" class="primary-button">Explore date</button></form><div class="home-card-actions" aria-label="Nearby anniversary dates"><button type="button" class="text-button" data-anniversary-offset="-1">Yesterday</button><button type="button" class="text-button" data-anniversary-today>Today</button><button type="button" class="text-button" data-anniversary-offset="1">Tomorrow</button></div>`;
}

async function renderHistoricalExplorer({ focus = false } = {}) {
  if (!state.historyActive) return;
  await loadHistoricalModules();
  if (!state.historyActive) return;
  const route = state.historyRoute || { type: "home" };
  const scope = historicalScope(route);
  const coverageResult = historicalService.getHistoricalCoverage(scope);
  const coverageList = Array.isArray(coverageResult) ? coverageResult : [coverageResult];
  const primaryCoverage = coverageList[0] || null;
  elements.historicalCoverage.innerHTML = primaryCoverage ? renderHistoricalCoverage(primaryCoverage) : `<div class="discovery-empty">No historical coverage is configured for this scope.</div>`;
  const navScope = scope.leagueId ? `/${encodeURIComponent(scope.sportId)}/${encodeURIComponent(scope.leagueId)}` : "";
  elements.historicalNav.innerHTML = [
    ["Overview", navScope ? `/history${navScope}` : "/history"], ["On This Day", "/history/on-this-day"], ["Records", "/history/records"], ["Performances", "/history/performances"], ["Championships", "/history/championships"], ["Rivalries", "/history/rivalries"],
  ].map(([label, href]) => `<a href="${href}" data-history-route>${label}</a>`).join("");
  let title = scope.leagueId ? `${sportsRepository.getLeague(scope.leagueId)?.leagueDisplayName || scope.leagueId.toUpperCase()} Historical Explorer` : scope.sportId ? `${scope.sportId.replaceAll("-", " ")} history` : "Historical Explorer";
  let summary = "Evidence-backed sample history with explicit coverage and validation limits.";
  let content = "";
  if (route.type === "anniversary") {
    const item = anniversaryService.getAnniversary(route.anniversaryId, { mode: state.researchMode });
    title = item?.title || "Anniversary unavailable";
    summary = item ? `${item.date} · ${item.yearsAgo} year${item.yearsAgo === 1 ? "" : "s"} ago · ${item.coverageLabel}` : "This stable anniversary ID is invalid or outside current historical coverage.";
    content = item ? renderAnniversaryDetail(item) : `<div class="discovery-empty" role="alert"><h2>Anniversary unavailable</h2><p>No unrelated historical card has been substituted.</p></div>`;
  } else if (route.type === "anniversaries") {
    const result = anniversaryService.getAnniversaries({ date: route.date || new Date(), sportId: route.sportId, leagueId: route.leagueId, year: route.year, category: route.category, limit: 50, mode: state.researchMode });
    title = "On This Day";
    summary = result.date ? `${result.date.iso} · deterministic local-calendar anniversaries with explicit sample coverage.` : "Choose a valid calendar date.";
    content = `${renderAnniversaryFilters(route, result)}${result.items.length ? `<p>${result.total} validated sample anniversar${result.total === 1 ? "y" : "ies"} in this exact scope.</p><div class="historical-grid">${result.items.map(renderAnniversaryCard).join("")}</div>` : `<div class="discovery-empty" role="status"><h2>No anniversaries found</h2><p>${escapeHtml(result.warnings[0] || "No validated historical event matches this date and scope.")}</p></div>`}`;
  } else if (route.type === "item") {
    const raw = historicalService.getItem(route.itemId);
    if (!raw) content = `<div class="discovery-empty" role="alert"><h2>Historical item unavailable</h2><p>The stable historical ID is invalid or no longer supported.</p></div>`;
    else {
      const item = historicalService.buildHistoricalViewModel(raw); title = item.title; summary = item.coverageLabel;
      const related = historicalService.getRelatedHistoricalItems(raw);
      content = `${renderHistoricalCard(item)}${renderHistoricalEvidence(item)}<h2>Accessible timeline</h2><ol class="historical-timeline">${item.supportingEvidence.map((entry) => `<li><time>${escapeHtml(entry.occurredAt || "Date unavailable")}</time><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.eventId || "No event ID")}</span></li>`).join("")}</ol>${related.length ? `<h2>Related history</h2><div class="historical-grid">${related.map(renderHistoricalCard).join("")}</div>` : ""}${item.primaryEntity?.id ? renderKnowledgeGraph(item.primaryEntity.id, { context: "historical-item", limit: 24 }) : ""}`;
    }
  } else if (route.type === "rivalry") {
    const rivalry = historicalService.getRivalryHistory(route.rivalryId); title = rivalry.status === "ready" ? rivalry.label : "Rivalry unavailable";
    content = rivalry.status === "ready" ? `<p>${escapeHtml(rivalry.disclosure)}</p><div class="historical-grid">${rivalry.events.map(renderHistoricalCard).join("") || `<div class="discovery-empty">No completed meetings are available.</div>`}</div>` : `<div class="discovery-empty" role="status">${escapeHtml(rivalry.message)}</div>`;
  } else if (route.type === "season") {
    const season = historicalService.getSeasonSummary(route.sportId, route.leagueId, route.seasonId); title = `${route.leagueId.toUpperCase()} ${route.seasonId} season`;
    content = `<dl class="historical-coverage-grid"><div><dt>Completed events</dt><dd>${season.completedEvents}</dd></div><div><dt>Participants</dt><dd>${season.participantCount}</dd></div><div><dt>Standings</dt><dd>${escapeHtml(season.standingsMessage)}</dd></div></dl>${season.items.length ? `<div class="historical-grid">${season.items.map(renderHistoricalCard).join("")}</div>` : `<div class="discovery-empty">No normalized historical items are available for this season.</div>`}`;
  } else if (route.type === "records") {
    title = "Records Explorer"; const records = historicalService.getRecordResults(scope);
    content = [["Verified records", records.verified], ["Provider-asserted records", records.providerAsserted], ["Dataset highs", records.datasetHighs], ["Record candidates", records.candidates]].map(([label, values]) => values.length ? `<section><h2>${label}</h2><div class="historical-grid">${values.map(renderHistoricalCard).join("")}</div></section>` : "").join("") || `<div class="discovery-empty">No validated record result exists for this scope.</div>`;
  } else if (route.type === "performances") {
    title = "Greatest Available Performances"; const values = historicalService.getPerformanceRankings(scope);
    content = values.length ? `<p class="data-warning"><strong>Ranking method:</strong> Raw source values are ranked only within matching sport, league, statistic, and unit cohorts. No composite greatness score or era adjustment is used. Equal values share a rank.</p><div class="stats-table-wrap" tabindex="0" aria-label="Scrollable historical performance rankings"><table class="stats-table"><caption>Deterministic raw-stat performance rankings within comparable sample cohorts</caption><thead><tr><th scope="col">Rank</th><th scope="col">Performance</th><th scope="col">Cohort</th><th scope="col">Raw component</th><th scope="col">Qualification</th><th scope="col">Coverage</th><th scope="col">Validation</th></tr></thead><tbody>${values.map((item) => `<tr><td>${item.rank}</td><th scope="row"><a href="${item.route}" data-history-route>${escapeHtml(item.title)}</a></th><td>${escapeHtml(item.cohortKey)}</td><td>${escapeHtml(item.components.map((component) => `${component.label}: ${component.value}`).join("; "))}</td><td>${escapeHtml(item.qualification.rule)}</td><td>${escapeHtml(item.coverageLabel)}</td><td>${escapeHtml(item.validationLabel)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="discovery-empty">No supported performance ranking is available for this scope.</div>`;
  } else if (route.type === "championships") {
    title = "Championship and Tournament History"; const values = historicalService.getChampionshipHistory(scope);
    content = values.length ? `<div class="historical-grid">${values.map(renderHistoricalCard).join("")}</div>` : `<div class="discovery-empty">Championship history is not available from the configured provider for this scope.</div>`;
  } else if (route.type === "rivalries") {
    title = "Rivalry Explorer"; const values = historicalService.searchHistoricalItems({ ...scope, type: "rivalry_event", pageSize: 50 }).items;
    const documented = values.filter((item) => item.metadata.rivalryId && item.metadata.classification !== "direct_head_to_head");
    const direct = values.filter((item) => !item.metadata.rivalryId || item.metadata.classification === "direct_head_to_head");
    content = documented.length || direct.length ? `${documented.length ? `<section><h2>Configured or evidence-classified rivalries</h2><div class="historical-grid">${documented.map(renderHistoricalCard).join("")}</div></section>` : ""}${direct.length ? `<section><h2>Direct head-to-head history — not classified as a rivalry</h2><div class="historical-grid">${direct.map(renderHistoricalCard).join("")}</div></section>` : ""}` : `<div class="discovery-empty">No documented rivalry is available for this scope. Frequent matchups are not relabeled as rivalries.</div>`;
  } else {
    const sections = historicalService.getHistoricalExplorerSections(scope);
    const categories = scope.sportId ? historicalService.getCategories(scope.sportId) : [];
    content = `${categories.length ? `<section class="historical-section"><h2>Supported historical categories</h2><ul class="historical-category-list">${categories.map((category) => `<li>${escapeHtml(category)}</li>`).join("")}</ul></section>` : ""}${sections.length ? sections.map((section) => `<section class="historical-section" aria-labelledby="historical-${section.id}"><h2 id="historical-${section.id}">${escapeHtml(section.title)}</h2><div class="historical-grid">${section.items.map(renderHistoricalCard).join("")}</div></section>`).join("") : `<div class="discovery-empty" role="status"><h2>Insufficient historical coverage</h2><p>EdgeBoard does not have verified historical items for this selected scope.</p><button type="button" class="text-button" data-history-query="Show current-season leaders" data-history-research="">View current-season leaders</button></div>`}`;
  }
  elements.historicalExplorerTitle.textContent = title;
  elements.historicalExplorerSummary.textContent = summary;
  elements.historicalExplorerContent.innerHTML = content;
  if (focus) elements.historicalExplorer.focus({ preventScroll: true });
}

const homeDiscoveryRenderSignatures = new WeakMap();

function replaceHomeDiscoveryContent(container, content) {
  if (homeDiscoveryRenderSignatures.get(container) === content) return false;
  container.innerHTML = content;
  homeDiscoveryRenderSignatures.set(container, content);
  return true;
}

function commandCenterStoryMedia(story, className = "", { loading = "lazy" } = {}) {
  const illustration = story.media?.illustration;
  return `<div class="command-story-media ${escapeHtml(className)}" aria-hidden="true" data-illustration-level="${escapeHtml(illustration?.fallbackLevel || "none")}" data-illustration-registry-id="${escapeHtml(illustration?.registryId || "")}">${renderAthleteMedia(story.media, { loading })}</div>`;
}

function commandCenterEventTitle(event) {
  return event.display?.title
    || (event.participants || []).map((participant) => participant.shortName || participant.name).filter(Boolean).join(" vs ")
    || event.card?.event_name || event.race?.event_name || event.tournament?.name || "Fixture event";
}

function renderCommandScheduleItem({ event, league }) {
  const startsAt = new Date(event.startsAt);
  const date = Number.isNaN(startsAt.getTime()) ? "Time unavailable" : startsAt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = Number.isNaN(startsAt.getTime()) ? "" : startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `<li class="command-schedule-item" data-schedule-sport="${escapeHtml(league.sportId)}" data-schedule-league="${escapeHtml(league.leagueId)}">
    <div><span class="command-sport-mark" aria-hidden="true">${escapeHtml(league.leagueDisplayName.slice(0, 2).toUpperCase())}</span><strong>${escapeHtml(league.leagueDisplayName)}</strong><span>${escapeHtml(date)}</span></div>
    <p>${escapeHtml(commandCenterEventTitle(event))}</p>
    <small>${escapeHtml(time)} · ${escapeHtml(event.sourceMode === "live" ? "Provider" : "Fixture sample")}</small>
  </li>`;
}

function renderCommandFeaturedStory(story) {
  if (!story) return '<div class="discovery-empty" role="status">No supported featured story is available.</div>';
  const researchAction = story.secondaryActions.find((action) => action.type === "research-story");
  return `<article class="command-feature-card" data-command-feature="${escapeHtml(story.id)}" data-league-id="${escapeHtml(story.leagueId)}" data-sport-id="${escapeHtml(story.sportId)}">
    <div class="command-feature-copy">
      <div class="home-card-kickers"><span>Featured story</span><span class="sample-badge">Fixture sample</span></div>
      <h1>${escapeHtml(story.headline)}</h1>
      <p>${escapeHtml(story.summary)}</p>
      <div class="home-card-meta"><span>${escapeHtml(story.leagueId.toUpperCase())}</span>${story.statChips.slice(0, 2).map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}</div>
      <div class="command-quality" title="Research Quality measures evidence support, not probability."><span>Research Quality</span><strong>${escapeHtml(story.researchQuality.label)} · ${story.researchQuality.score}%</strong><meter min="0" max="100" value="${story.researchQuality.score}">${story.researchQuality.score}%</meter></div>
      <div class="home-card-actions" aria-label="Explore ${escapeHtml(story.headline)}">
        <button class="primary-action" type="button" data-view-story="${escapeHtml(story.id)}">Open story</button>
        ${story.primaryAction ? renderHomeDiscoveryAction(story.primaryAction) : ""}
        ${researchAction ? renderHomeDiscoveryAction(researchAction) : ""}
      </div>
    </div>
    ${commandCenterStoryMedia(story, "command-feature-art", { loading: "eager" })}
  </article>`;
}

function renderCommandHeadline(story, index) {
  return `<li><button type="button" data-view-story="${escapeHtml(story.id)}"><span class="command-headline-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHtml(story.headline)}</strong><small>${escapeHtml(story.leagueId.toUpperCase())} · ${escapeHtml(story.sourceMode === "fixture" ? "Fixture sample" : story.sourceLabel)}</small></span><span aria-hidden="true">→</span></button></li>`;
}

function renderCommandStoryCard(story) {
  return `<article class="command-story-card" data-command-story="${escapeHtml(story.id)}" data-sport-id="${escapeHtml(story.sportId)}" data-league-id="${escapeHtml(story.leagueId)}">
    <div class="home-card-kickers"><span>${escapeHtml(story.leagueId.toUpperCase())}</span><span class="sample-badge">Sample</span></div>
    ${commandCenterStoryMedia(story, "command-card-art")}
    <h3>${escapeHtml(story.headline)}</h3>
    <p>${escapeHtml(story.summary)}</p>
    <div class="command-card-metric"><strong>${escapeHtml(story.statChips[0] || `${story.supportingEvidence.length} evidence`)}</strong><span>${story.supportingEvidence.length} retained item${story.supportingEvidence.length === 1 ? "" : "s"}</span></div>
    <div class="command-card-quality"><span>Research Quality</span><strong>${escapeHtml(story.researchQuality.label)} · ${story.researchQuality.score}%</strong></div>
    <div class="home-card-actions"><button type="button" class="text-button" data-view-story="${escapeHtml(story.id)}">Open story</button>${story.primaryAction ? renderHomeDiscoveryAction(story.primaryAction) : ""}</div>
  </article>`;
}

function renderCommandMarketCard(record) {
  const movement = record.movementObserved && Number.isFinite(record.movement)
    ? `${record.movement > 0 ? "+" : ""}${record.movement}` : "No observed move";
  return `<article class="command-market-card" data-command-market="${escapeHtml(record.id)}" data-market-league="${escapeHtml(record.leagueId)}">
    <div class="home-card-kickers"><span>${escapeHtml(record.leagueName)}</span><span class="sample-badge">Sample market</span></div>
    <h3>${escapeHtml(record.participantName)} · ${escapeHtml(record.marketName)}</h3>
    <p>${escapeHtml(record.gameLabel)}</p>
    <dl><div><dt>Current line</dt><dd>${escapeHtml(record.currentLineDisplay)}</dd></div><div><dt>Price</dt><dd>${Number.isFinite(record.odds) ? formatOdds(record.odds) : "Unavailable"}</dd></div><div><dt>Movement</dt><dd>${escapeHtml(movement)}</dd></div><div><dt>Research Quality</dt><dd>${record.researchQuality}%</dd></div></dl>
    <a class="text-button" href="${escapeHtml(marketResearchHref(record.model))}" data-open-market="${escapeHtml(record.selectionId)}" data-market-league="${escapeHtml(record.leagueId)}">Research market</a>
  </article>`;
}

function renderCommandQuickAction(action) {
  const content = `<span class="command-quick-icon" aria-hidden="true">${escapeHtml(action.label.slice(0, 1))}</span><span><strong>${escapeHtml(action.label)}</strong><small>${escapeHtml(action.description)}</small></span><span aria-hidden="true">→</span>`;
  if (action.type === "profile") return `<a href="${escapeHtml(profileUrl(action.entityId))}" data-open-athlete="${escapeHtml(action.entityId)}">${content}</a>`;
  if (action.type === "route") return `<a href="${escapeHtml(action.href)}">${content}</a>`;
  return `<button type="button" data-home-query="${escapeHtml(action.query)}" data-home-action="${escapeHtml(action.kind)}">${content}</button>`;
}

function renderHomeCommandCenter(model) {
  const featured = model.featuredStory;
  return `<div class="command-center-shell" data-command-center-version="${model.schemaVersion}">
    <section class="command-schedule" aria-labelledby="commandScheduleTitle">
      <div class="command-section-heading"><div><p class="eyebrow">Featured schedule</p><h2 id="commandScheduleTitle">Fixture board</h2></div><span class="sample-badge">Sample data</span></div>
      <div class="command-scroll-region" tabindex="0" role="region" aria-label="Horizontally scrollable multi-sport fixture schedule"><ul>${model.schedule.map(renderCommandScheduleItem).join("")}</ul></div>
    </section>
    <div class="command-lead-grid">
      ${renderCommandFeaturedStory(featured)}
      <aside class="command-headlines" aria-labelledby="commandHeadlinesTitle"><div class="command-section-heading"><div><p class="eyebrow">EdgeBoard research</p><h2 id="commandHeadlinesTitle">Top Headlines</h2></div><span>${model.headlines.length}</span></div><ol>${model.headlines.map(renderCommandHeadline).join("")}</ol></aside>
    </div>
    <section class="command-stories" aria-labelledby="commandStoriesTitle"><div class="command-section-heading"><div><p class="eyebrow">Multi-sport intelligence</p><h2 id="commandStoriesTitle">Top Stories &amp; Insights</h2></div><span class="sample-badge">Deterministic sample</span></div><div class="command-story-grid">${model.topStories.map(renderCommandStoryCard).join("")}</div></section>
    <section class="command-markets" aria-labelledby="commandMarketsTitle"><div class="command-section-heading"><div><p class="eyebrow">Edge Markets</p><h2 id="commandMarketsTitle">Sample market research</h2><p>Normalized fixture markets for evidence review—not betting advice or a live feed.</p></div><a class="text-button" href="/markets/screener">Open Market Screener →</a></div><div class="command-market-grid">${model.markets.map(renderCommandMarketCard).join("")}</div></section>
    <div class="command-utility-grid">
      <section class="command-quick" aria-labelledby="commandQuickTitle"><div class="command-section-heading"><div><p class="eyebrow">Quick Research</p><h2 id="commandQuickTitle">Start with a focused path</h2></div></div><div>${model.quickResearch.map(renderCommandQuickAction).join("")}</div></section>
      <section class="command-intelligence" aria-labelledby="commandIntelligenceTitle"><div class="command-section-heading"><div><p class="eyebrow">EdgeBoard Intelligence</p><h2 id="commandIntelligenceTitle">Research you can inspect</h2></div></div><div>${model.intelligence.map((item, index) => `<article><span aria-hidden="true">0${index + 1}</span><div><h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(item.description)}</p></div></article>`).join("")}</div></section>
    </div>
    <p class="command-disclosure"><span class="sample-badge">Sample data</span>${escapeHtml(model.disclosure)}</p>
  </div>`;
}

function renderHomeDiscovery() {
  const summary = getSelectionSummary(state.navigationSelection);
  const portfolioLaunch = summary.selection.type === "system" && ["all", "for-you"].includes(summary.selection.id);
  elements.homeCommandCenter.hidden = !portfolioLaunch;
  document.querySelectorAll(".legacy-home-section").forEach((section) => { section.hidden = portfolioLaunch; });
  const model = createHomeDiscoveryModel({
    selection: summary,
    visibleLeagues: summary.visibleLeagues,
    sportsRepository,
    statsRepository,
    insightService,
    storyEngine,
    discoveryService,
    anniversaryService,
    workspaceState: currentDiscoveryWorkspaceState(),
    preferences: discoveryScopeAndOptions().options.preferences,
    researchMode: state.researchMode,
    currentDate: new Date(),
    canonicalStoryId: portfolioLaunch ? "story-fixture-ended-streak" : "",
  });
  if (portfolioLaunch) {
    const storyViews = storyEngine.getFeaturedStories({}, {
      limit: 30,
      mode: state.researchMode,
      now: new Date(testFixtureTimestamp || Date.now()),
      visibleLeagues: summary.visibleLeagues,
      canonicalStoryId: "story-fixture-ended-streak",
    });
    const eventEntries = summary.visibleLeagues.flatMap((league) => sportsRepository.getEvents(league.leagueId).map((event) => ({ event, league })));
    const marketRecords = marketScreenerService.getRecords({ leagueIds: summary.visibleLeagues.map((league) => league.leagueId) }, new Date(testFixtureTimestamp || Date.now()));
    const commandModel = createHomeCommandCenterModel({ storyViews, eventEntries, marketRecords });
    replaceHomeDiscoveryContent(elements.homeCommandCenter, renderHomeCommandCenter(commandModel));
    replaceHomeDiscoveryContent(elements.todayPulseGrid, "");
    replaceHomeDiscoveryContent(elements.insightDiscoveryGrid, "");
    replaceHomeDiscoveryContent(elements.homeDiscoverySections, "");
    renderDiscoveryExplorer();
    return;
  }
  const sections = new Map(model.sections.map((item) => [item.id, item]));
  const stories = sections.get("stories");
  const trending = sections.get("trending");
  elements.todayPulse.dataset.scope = serializeNavigationSelection(summary.selection);
  elements.todayPulseTitle.textContent = stories.title;
  elements.todayPulseSummary.textContent = `${stories.description} ${model.disclaimer}`;
  const storiesContent = stories.cards.length
    ? stories.cards.map((card, index) => renderHomeDiscoveryCard(card, { feature: index === 0 })).join("")
    : `<div class="discovery-empty" role="status">${escapeHtml(stories.emptyMessage)}</div>`;
  replaceHomeDiscoveryContent(elements.todayPulseGrid, storiesContent);
  elements.insightDiscovery.dataset.scope = serializeNavigationSelection(summary.selection);
  elements.insightDiscoverySummary.textContent = `${trending.description} Scope: ${summary.contextLabel}.`;
  const trendingContent = trending.cards.length
    ? trending.cards.map((card) => renderHomeDiscoveryCard(card)).join("")
    : `<div class="discovery-empty" role="status">${escapeHtml(trending.emptyMessage)}</div>`;
  replaceHomeDiscoveryContent(elements.insightDiscoveryGrid, trendingContent);
  elements.homeDiscoverySections.dataset.scope = serializeNavigationSelection(summary.selection);
  elements.homeDiscoverySections.dataset.mode = state.researchMode;
  const sectionContent = model.sections
    .filter((item) => !["stories", "trending"].includes(item.id))
    .map(renderHomeSection).join("");
  replaceHomeDiscoveryContent(elements.homeDiscoverySections, sectionContent);
  renderDiscoveryExplorer();
}

function renderInsightDialog(insight) {
  const supporting = insightService.getInsightSupportingData(insight.id);
  if (!supporting) return;
  state.activeInsightId = insight.id;
  elements.insightDialogTitle.textContent = "Insight supporting data";
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
    ${insight.entity?.id ? renderKnowledgeGraph(insight.entity.id, { context: "insight-detail", limit: 18 }) : ""}
  `;
  elements.insightDialog.showModal();
  elements.closeInsightDialog.focus();
}

function storyShareUrl(story) {
  const url = new URL(window.location.href);
  url.searchParams.set("story", story.id);
  url.searchParams.delete("insight");
  return `${url.pathname}${url.search}${url.hash}`;
}

function setStoryUrl(storyId, { replace = false } = {}) {
  const url = new URL(window.location.href);
  if (storyId) {
    url.searchParams.set("story", storyId);
    url.searchParams.delete("insight");
  } else {
    url.searchParams.delete("story");
  }
  history[replace ? "replaceState" : "pushState"]({ edgeboardStory: Boolean(storyId), storyId }, "", url);
}

function storyWorkspaceCandidate(story) {
  const view = storyEngine.buildStoryViewModel(story, { presentation: "share", mode: state.researchMode });
  return {
    ...currentWorkspaceCandidate(),
    type: "saved_story",
    boardId: "board-stats-trends",
    title: view.headline,
    description: view.summary,
    sourceState: {
      mode: state.researchMode,
      sportId: story.sportId,
      leagueId: story.leagueId,
      queryText: view.headline,
      structuredQuery: { type: "story", storyId: story.id, claimData: safeSnapshot(story.claimData) },
    },
    canonicalReferences: {
      entityIds: [...story.entityIds],
      eventIds: [...story.eventIds],
      marketIds: story.bettingContext?.marketId ? [story.bettingContext.marketId] : [],
      insightIds: [...story.sourceInsightIds],
      storyIds: [story.id],
      queryId: null,
      visualizationId: null,
    },
    researchSnapshot: safeSnapshot({
      schemaVersion: story.schemaVersion,
      structuredClaim: story.claimData,
      renderedText: { headline: view.headline, summary: view.summary, shareCaption: view.shareCaption },
      sourceIds: story.sources.map((source) => source.id),
      evidenceIds: story.supportingEvidence.map((item) => item.id),
      validationStatus: story.validationStatus,
      freshness: story.freshness,
      researchQuality: story.researchQuality,
      snapshotAt: new Date().toISOString(),
      refreshConfiguration: { storyId: story.id, sportId: story.sportId, leagueId: story.leagueId },
      sample: story.sample,
    }),
    sample: story.sample,
  };
}

function renderStoryDetail(story, { updateUrl = true } = {}) {
  const view = storyEngine.buildStoryViewModel(story, { presentation: "feature", mode: state.researchMode });
  state.activeStoryId = story.id;
  elements.insightDialogTitle.textContent = "Story details";
  elements.insightDialogContent.innerHTML = `
    <article class="story-detail" data-story-detail="${escapeHtml(story.id)}">
      <header class="story-detail-header">
        ${renderAthleteMedia(view.media, { large: true })}
        <div><p class="eyebrow">${escapeHtml(view.storyType.replaceAll("_", " "))}</p><h3>${escapeHtml(view.headline)}</h3><p>${escapeHtml(view.summary)}</p></div>
      </header>
      <div class="story-detail-badges"><span class="validation-label">${escapeHtml(view.validationLabel)}</span><span class="sample-badge">${view.sourceMode === "fixture" ? "Fixture data" : view.sample ? "Sample data" : "Provider data"}</span><span>${escapeHtml(view.lifecycleState)}</span></div>
      <section aria-labelledby="storyKeyStats"><h4 id="storyKeyStats">Key statistics and scope</h4><div class="insight-chips">${view.statChips.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}<span>${escapeHtml(view.scopeLabel)}</span></div><p>${escapeHtml(view.expandedExplanation)}</p></section>
      <section aria-labelledby="storyTrust"><h4 id="storyTrust">Edge Trust and Research Quality</h4><div class="market-research-quality"><span>${escapeHtml(view.edgeTrust.publicStatus)}</span><strong>${escapeHtml(view.researchQuality.label)} · ${view.researchQuality.score}%</strong></div><p>${escapeHtml(view.edgeTrust.summary)}</p></section>
      <section aria-labelledby="storyEvidence" tabindex="-1" data-story-evidence-panel><h4 id="storyEvidence">Supporting evidence</h4>
        <div class="stats-table-wrap"><table class="stats-table"><caption>Evidence retained for this structured claim</caption><thead><tr><th scope="col">Evidence</th><th scope="col">Event</th><th scope="col">Date</th><th scope="col">Status</th></tr></thead><tbody>
          ${view.supportingEvidence.map((item) => `<tr><th scope="row">${escapeHtml(item.label || item.id)}</th><td>${escapeHtml(item.eventId || "Not event-specific")}</td><td>${formatDateTime(item.occurredAt)}</td><td>${escapeHtml(item.status || "validated")}</td></tr>`).join("")}
        </tbody></table></div>
      </section>
      <section aria-labelledby="storyLimits"><h4 id="storyLimits">Known limitations</h4>${view.warnings.length ? view.warnings.map((warning) => `<p class="data-warning">${escapeHtml(warning)}</p>`).join("") : "<p>No additional limitation was reported.</p>"}<p>${escapeHtml(storyEngine.phraseStory(story).uncertaintyDisclosure)}</p></section>
      ${view.market ? `<aside class="related-insight-market"><strong>Optional current betting context</strong><span>${escapeHtml(view.market.line)} · ${formatOdds(view.market.odds)} · ${escapeHtml(view.market.sportsbook)}</span><small>The observed fact is separate from projection, edge, confidence, odds, and Research Quality.</small></aside>` : ""}
      <div class="story-detail-actions" aria-label="Story research actions">${[view.primaryAction, ...view.secondaryActions].filter(Boolean).map((action) => action.type === "evidence" ? `<button type="button" class="text-button" data-focus-story-evidence>${escapeHtml(action.label)}</button>` : renderHomeDiscoveryAction(action)).join("")}</div>
      ${story.entityIds[0] ? renderKnowledgeGraph(story.entityIds[0], { context: "story-detail", limit: 18 }) : ""}
      <footer><small>${escapeHtml(view.sourceLabel)} · ${formatDateTime(view.lastUpdated)} · ${escapeHtml(view.freshnessLabel)}</small><span class="insight-dialog-status" role="status" aria-live="polite"></span></footer>
    </article>`;
  if (updateUrl) setStoryUrl(story.id);
  if (!elements.insightDialog.open) elements.insightDialog.showModal();
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
  const insightCounts = viewModel.insights.reduce((counts, item) => {
    const category = item.type?.includes("milestone") ? "milestones" : item.type?.includes("streak") ? "streaks" : "trends";
    counts[category] += 1;
    return counts;
  }, { trends: 0, milestones: 0, streaks: 0 });
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
          : `<div class="profile-empty"><strong>Schedule not supplied</strong><p>The sample provider has no upcoming event for this athlete. Recent form and completed logs are still available.</p><button type="button" class="text-button" data-profile-tab-target="game-logs">Review recent logs</button></div>`}
      </section>
      <section class="profile-card" aria-labelledby="relatedMarketsHeading">
        <div class="profile-card-heading"><div><p class="eyebrow">Betting analysis</p><h2 id="relatedMarketsHeading">Related markets</h2></div><button type="button" class="text-button" data-profile-tab-target="props">View props</button></div>
        ${props.markets.length ? `<p>${props.markets.length} provider-confirmed sample market${props.markets.length === 1 ? "" : "s"}. Historical statistics remain separate from model analysis.</p>`
          : `<div class="profile-empty"><strong>No current market</strong><p>Historical rows do not create odds. Keep researching observed form or check another active league.</p><button type="button" class="text-button" data-profile-tab-target="trends">Review trends</button></div>`}
      </section>
      ${insight ? `<section class="profile-card profile-insight-card" aria-labelledby="overviewInsightHeading">
        <div class="profile-card-heading"><div><p class="eyebrow">What stands out</p><h2 id="overviewInsightHeading">${escapeHtml(insight.title)}</h2></div><button type="button" class="text-button" data-profile-tab-target="insights">All insights</button></div>
        <p>${escapeHtml(insight.label)}</p>
        <div class="insight-chips"><span>${insightCounts.trends} trend${insightCounts.trends === 1 ? "" : "s"}</span><span>${insightCounts.milestones} milestone${insightCounts.milestones === 1 ? "" : "s"}</span><span>${insightCounts.streaks} streak${insightCounts.streaks === 1 ? "" : "s"}</span></div>
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
        const trust = trustForMarket(market);
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
          <div class="market-research-quality" title="Research Quality evaluates source evidence, not model confidence or win probability."><span>Research Quality</span><strong>${escapeHtml(trust.researchQuality.label)} · ${trust.researchQuality.score}%</strong></div>
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
    ${renderKnowledgeGraph(viewModel.athlete.id, { context: "athlete-profile" })}
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
    ${renderKnowledgeGraph(entity.id, { context: "entity-profile" })}
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
  }) + (state.visualRequest?.entityIds?.[0] ? renderKnowledgeGraph(state.visualRequest.entityIds[0], { context: "visual-analytics", limit: 24 }) : "");
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
    const visualQuestion = elements.queryInput.value.trim() || result.title || "Visual sports research";
    synchronizeResearchSession(visualQuestion, {
      visualizations: [result],
      researchQuality: result.edgeTrust,
      source: { source: result.sources?.[0]?.provider || "Unavailable", freshness: result.dataFreshness?.lastUpdatedAt, sample: result.coverage?.sample === true },
      sample: result.coverage?.sample === true,
    });
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

function edgeLabClassificationLabel(value) {
  return ({
    historical_fact: "Historical fact",
    current_provider_data: "Current provider data",
    model_output: "Model output",
    scenario_assumption: "Scenario assumption",
    future_simulation: "Future simulation",
  })[value] || String(value || "Unclassified").replaceAll("_", " ");
}

function renderEdgeLabScenario(scenario) {
  if (!scenario?.id) return "";
  const quality = scenario.researchQuality?.researchQuality;
  const activeClassifications = new Set(
    (scenario.updatedResearch?.evidence || []).flatMap((item) => [item.edgeLab?.originalClassification, item.classification]).filter(Boolean),
  );
  if (scenario.originalData?.markets?.length) activeClassifications.add(scenario.classifications.provider);
  scenario.modifiedAssumptions.forEach((item) => activeClassifications.add(item.classification));
  const collectionCounts = [
    ["Research", scenario.updatedResearch?.evidence?.length || 0],
    ["Comparisons", scenario.updatedComparisons?.length || 0],
    ["Visuals", scenario.updatedVisuals?.length || 0],
    ["Insights", scenario.updatedInsights?.length || 0],
    ["Markets", scenario.updatedMarkets?.length || 0],
  ];
  return `<section class="edge-lab-panel" aria-labelledby="edgeLabTitle">
    <header class="edge-lab-header">
      <div><p class="eyebrow">Edge Lab · deterministic research sandbox</p><h3 id="edgeLabTitle">${escapeHtml(scenario.title)}</h3><p>Baseline ${escapeHtml(scenario.sessionId)} · revision ${scenario.sessionRevision} · original data unchanged</p></div>
      <div class="edge-lab-status-badges"><span class="edge-lab-not-prediction">Not a prediction</span>${scenario.originalData?.sample ? '<span class="sample-badge">Sample baseline</span>' : ""}</div>
    </header>
    <div class="edge-lab-classifications" aria-label="Data classifications">
      ${[...activeClassifications].map((item) => `<span data-classification="${escapeHtml(item)}">${escapeHtml(edgeLabClassificationLabel(item))}</span>`).join("")}
    </div>
    <div class="edge-lab-summary">
      <div><span>Assumptions</span><strong>${scenario.modifiedAssumptions.length}</strong><small>${scenario.rejectedAssumptions.length ? `${scenario.rejectedAssumptions.length} rejected` : "validated controls"}</small></div>
      <div><span>Differences</span><strong>${scenario.scenarioDifferences.length}</strong><small>original → sandbox</small></div>
      <div><span>Research Quality</span><strong>${escapeHtml(quality?.label || "Unavailable")}</strong><small>${quality?.score ?? 0}% · not probability</small></div>
    </div>
    <div class="edge-lab-updates" aria-label="Scenario research outputs">${collectionCounts.map(([label, count]) => `<span><strong>${count}</strong> ${label}</span>`).join("")}</div>
    ${scenario.scenarioDifferences.length ? `<div class="edge-lab-differences"><h4>Scenario differences</h4><ul>${scenario.scenarioDifferences.map((item) => `<li><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.field)} · ${escapeHtml(edgeLabClassificationLabel(item.classification))}</small></div><span><del>${escapeHtml(item.before)}</del><b aria-hidden="true">→</b><ins>${escapeHtml(item.after)}</ins></span></li>`).join("")}</ul></div>` : `<div class="edge-lab-empty"><strong>No assumptions yet</strong><span>Add a supported numeric evidence or market assumption. EdgeBoard will preserve the baseline.</span></div>`}
    ${scenario.rejectedAssumptions.length ? `<div class="edge-lab-rejected" role="status"><strong>Unsupported assumptions were not applied</strong><ul>${scenario.rejectedAssumptions.map((item) => `<li>${escapeHtml(item.error)}</li>`).join("")}</ul></div>` : ""}
    <details class="edge-lab-counterarguments" ${scenario.scenarioDifferences.length ? "open" : ""}><summary>Counterarguments and uncertainty · ${scenario.counterarguments.length}</summary><ul>${scenario.counterarguments.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul></details>
    <p class="edge-lab-disclaimer">${escapeHtml(scenario.disclaimer)}</p>
    <div class="edge-lab-actions" aria-label="Edge Lab scenario actions">
      <button type="button" class="text-button" data-edge-lab-add>Add assumption</button>
      <button type="button" class="text-button" data-edge-lab-save>Save scenario</button>
      <button type="button" class="text-button" data-edge-lab-share>Share</button>
      <button type="button" class="text-button" data-edge-lab-export="markdown">Export .md</button>
      <button type="button" class="text-button" data-edge-lab-export="csv">Export CSV</button>
      <button type="button" class="text-button" data-edge-lab-discard>Discard scenario</button>
    </div>
  </section>`;
}

function renderResearchAnswer(answer) {
  if (!answer) return "";
  const completeness = answer.researchCompleteness;
  const source = answer.disclosure;
  const trust = trustForResearchAnswer(answer);
  const session = state.researchSession;
  const graphEntityId = (answer.relatedEntities || []).find((item) => entityRegistry.getEntity(item.id))?.id
    || state.graphResearchEntityId || "";
  return `
    <article class="research-answer-card" data-completeness="${escapeHtml(completeness.level.toLowerCase())}" data-research-quality="${escapeHtml(trust.researchQuality.label.toLowerCase())}">
      ${session ? `<section class="research-session-shell" aria-labelledby="researchSessionTitle">
        <header class="research-session-header">
          <div><p class="eyebrow">Research session · revision ${session.revision}</p><h2 id="researchSessionTitle">${escapeHtml(session.question)}</h2><p>${escapeHtml(session.id)} · ${escapeHtml(session.status)}</p></div>
          <div class="research-session-actions" aria-label="Research session actions">
            <button type="button" class="text-button" data-session-new>Start new</button>
            <button type="button" class="text-button" data-session-save>Save</button>
            <button type="button" class="text-button" data-session-refresh>Refresh</button>
            <button type="button" class="text-button" data-session-share>Share</button>
            <button type="button" class="text-button" data-session-export="markdown">Export .md</button>
            <button type="button" class="text-button" data-session-export="csv">Export CSV</button>
            <button type="button" class="text-button" data-session-note>Add note</button>
            <button type="button" class="text-button" data-edge-lab-open>Open Edge Lab</button>
          </div>
        </header>
        <details class="research-session-workflow" open>
          <summary>Research workflow · ${session.workflow.filter((item) => item.status === "complete").length} of ${session.workflow.length} steps complete</summary>
          <ol>${session.workflow.map((item) => `<li data-status="${escapeHtml(item.status)}"><span aria-hidden="true"></span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></div><em>${escapeHtml(item.status.replaceAll("_", " "))}</em></li>`).join("")}</ol>
        </details>
        ${session.notes.length ? `<details class="research-session-notes"><summary>Private session notes · ${session.notes.length}</summary><ul>${session.notes.map((note) => `<li>${escapeHtml(note.text)}</li>`).join("")}</ul></details>` : ""}
        ${state.edgeLabScenario?.sessionId === session.id ? renderEdgeLabScenario(state.edgeLabScenario) : ""}
      </section>` : ""}
      <header class="research-answer-header">
        <div>
          <p class="eyebrow">EdgeBoard deterministic analyst</p>
          <h2 id="researchAnswerTitle">${escapeHtml(answer.headline)}</h2>
        </div>
        <button type="button" class="research-completeness research-quality-trigger" data-open-edge-trust aria-label="Research Quality: ${escapeHtml(trust.researchQuality.label)}, ${trust.researchQuality.score} percent. Open Edge Trust details.">
          <span>Research Quality</span><strong>${escapeHtml(trust.researchQuality.label)}</strong><small>${trust.researchQuality.score}% · Edge Trust details</small>
        </button>
      </header>

      <details class="research-plan" open>
        <summary>Research plan · ${escapeHtml(answer.plan.questionType.replaceAll("_", " "))}</summary>
        <ol>${answer.plan.stages.map((stage) => `
          <li data-status="${escapeHtml(stage.status)}"><strong>${escapeHtml(stage.label)}</strong><span>${escapeHtml(stage.detail)}</span></li>
        `).join("")}</ol>
        <p>${escapeHtml(answer.languagePolicy)}</p>
      </details>

      <div class="research-disclosure" aria-label="Research transparency">
        <div><span>Source</span><strong>${escapeHtml(source.source)}</strong></div>
        <div><span>Sample size</span><strong>${source.sampleSize || "Unavailable"}</strong></div>
        <div><span>Date range</span><strong>${escapeHtml(source.dateRange || "Unavailable")}</strong></div>
        <div><span>Coverage</span><strong>${escapeHtml(source.coverage)}</strong></div>
        <div><span>Validation</span><strong>${escapeHtml(source.validation)}</strong></div>
        <div><span>Freshness</span><strong>${formatDateTime(source.freshness, "Unavailable")}</strong></div>
      </div>

      ${trust.details.some((item) => ["Waiting for Confirmation", "Unavailable", "Stale", "Validation Error"].includes(item.status)) ? `<p class="edge-intelligence-uncertainty" role="status">Research quality is reduced because ${escapeHtml(trust.details.filter((item) => ["Waiting for Confirmation", "Unavailable", "Stale", "Validation Error"].includes(item.status)).slice(0, 3).map((item) => `${item.label} is ${item.status.toLowerCase()}`).join(" and "))}. I can strengthen this answer once the remaining information is available.</p>` : ""}

      <section class="research-summary" aria-labelledby="researchSummaryTitle"><p class="eyebrow">Research summary</p><h3 id="researchSummaryTitle">What the evidence supports</h3><p class="research-answer-summary">${escapeHtml(answer.summary)}</p></section>

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
            ["team", "national-team", "constructor", "manufacturer"].includes(entity.type || entity.entityType)
              ? `<a class="text-button research-related-chip" href="${escapeHtml(entityProfileUrl(entity.id))}" data-open-entity="${escapeHtml(entity.id)}">${escapeHtml(entity.name)} profile</a>`
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
        <div class="research-recommendations">${answer.relatedQuestions.map((item, index) => {
          const recommendation = session?.recommendations?.[index];
          const action = item.type === "profile"
            ? `<a class="text-button" href="${escapeHtml(profileUrl(item.entityId))}" data-open-athlete="${escapeHtml(item.entityId)}">${escapeHtml(item.label)}</a>`
            : item.type === "entity-profile"
              ? `<a class="text-button" href="${escapeHtml(entityProfileUrl(item.entityId))}" data-open-entity="${escapeHtml(item.entityId)}">${escapeHtml(item.label)}</a>`
              : `<button type="button" class="text-button" data-ai-followup="${escapeHtml(item.query)}">${escapeHtml(item.label)}</button>`;
          return `<article>${action}<small>${recommendation ? `${recommendation.supportingEvidenceIds.length} supporting evidence item${recommendation.supportingEvidenceIds.length === 1 ? "" : "s"} · ${recommendation.counterarguments.length} counterargument${recommendation.counterarguments.length === 1 ? "" : "s"} · Research Quality ${escapeHtml(recommendation.researchQuality?.label || "Unavailable")}` : "Supporting evidence and uncertainty will be reevaluated before answering."}</small></article>`;
        }).join("")}</div>
      </section>

      <div class="research-quality">
        <strong>Why Research Quality is ${escapeHtml(trust.researchQuality.label)}</strong>
        ${source.warnings.length
          ? `<ul>${source.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
          : "<p>No additional provider warning was returned.</p>"}
        ${completeness.reasons.length
          ? `<ul>${completeness.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`
          : ""}
        ${trust.limitations.length ? `<ul>${trust.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>All applicable trust checks passed.</p>"}
        <p>Research Quality measures source trust only. It is not betting confidence, historical hit rate, projection, edge, or win probability.</p>
      </div>
      ${graphEntityId ? renderKnowledgeGraph(graphEntityId, { context: "research-answer", limit: 22 }) : ""}
    </article>
  `;
}

function canonicalEntityIdFromStatsResult(result) {
  if (!result) return "";
  if (result.type === "combined") return canonicalEntityIdFromStatsResult(result.statsAnswer);
  const candidates = [
    result.entity?.id,
    result.athlete?.id,
    ...(result.entities || []).map((item) => item?.id),
    ...(result.entries || []).map((item) => item?.entity?.id || item?.entityId),
    ...(result.rows || []).map((item) => item?.entity?.id || item?.entityId),
    ...(result.structuredQuery?.entityIds || []),
  ].filter(Boolean);
  return candidates.find((id) => entityRegistry.getEntity(id)) || "";
}

function renderStatsAnswer(result) {
  if (!result) {
    return `<div class="stats-empty"><h3 id="statsResultTitle">Ask a statistical question</h3><p>Use a sample athlete, team, split, comparison, or leaderboard query. Stats mode does not require odds or a betting market.</p></div>`;
  }
  if (["empty", "unsupported", "error"].includes(result.type)) {
    const actions = getRecoveryActions(result, { leagueName: currentLeague()?.leagueDisplayName || "this league" });
    return `<div class="stats-empty ${escapeHtml(result.type)}"><h3 id="statsResultTitle">${escapeHtml(result.title)}</h3><p>${escapeHtml(result.message)}</p>
      <p><strong>Here’s what you can do next:</strong></p><div class="recovery-actions">${actions.map((item) => `<button type="button" data-stats-followup="${escapeHtml(item.query)}">${escapeHtml(item.label)}</button>`).join("")}</div></div>`;
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
  if (state.statsLoading) {
    const progress = getResearchProgressCopy(state.researchPlan || {
      questionType: "statistical_lookup",
      resolvedScope: { label: currentLeague()?.leagueDisplayName || "the selected scope" },
    });
    elements.statsLoading.querySelector(".stats-loading-copy")?.replaceChildren(
      Object.assign(document.createElement("strong"), { textContent: progress.label }),
      Object.assign(document.createElement("span"), { textContent: progress.detail }),
    );
  }
  elements.statsInterpretation.innerHTML = statsVisible ? renderInterpretation(state.statsParsedQuery) : "";
  const statsGraphEntityId = !state.researchAnswer
    ? canonicalEntityIdFromStatsResult(state.statsResult) || state.graphResearchEntityId
    : "";
  elements.statsResultContent.innerHTML = statsVisible && !state.statsLoading
    ? `${renderStatsAnswer(state.statsResult)}${statsGraphEntityId ? renderKnowledgeGraph(statsGraphEntityId, { context: "stats-result", limit: 22 }) : ""}`
    : "";
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
        const created = await repository.createWorkspace({ title: "Workspace", description: "Local personal workspace" });
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
  if (state.edgeLabScenario?.sessionId === state.researchSession?.id) {
    return {
      ...base,
      title: state.edgeLabScenario.title,
      description: "Saved immutable Edge Lab research scenario",
      type: "saved_scenario",
      boardId: "board-edge-lab",
      researchSnapshot: safeSnapshot(state.edgeLabScenario),
      sourceState: { ...sourceState, queryText: state.edgeLabScenario.originalData?.question || queryText },
      canonicalReferences: {
        ...base.canonicalReferences,
        marketIds: state.edgeLabScenario.modifiedAssumptions.filter((item) => item.targetType === "market").map((item) => item.targetId),
      },
    };
  }
  if (state.visualResult || state.visualRequest) {
    const entityIds = state.visualRequest?.entityIds || [];
    return { ...base, type: state.researchSession ? "saved_research" : "saved_visualization", boardId: "board-visuals", title: state.researchSession?.question || state.visualResult?.title || "Saved visual analytics", canonicalReferences: { ...base.canonicalReferences, entityIds, visualizationId: state.visualRequest?.visualizationType || null }, researchSnapshot: safeSnapshot(state.researchSession || state.visualResult || state.visualRequest) };
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
    return { ...base, type: state.researchSession ? "saved_research" : type, boardId: "board-stats-trends", title: state.researchSession?.question || result.title || result.headline || queryText || "Saved statistical research", canonicalReferences: { ...base.canonicalReferences, entityIds: [result.entity?.id, ...(result.entities || []).map((item) => item.id)].filter(Boolean) }, researchSnapshot: safeSnapshot(state.researchSession || result) };
  }
  if (state.researchAnswer) return { ...base, type: state.researchSession ? "saved_research" : "saved_answer", boardId: "board-betting-research", title: state.researchSession?.question || state.researchAnswer.headline || queryText || "Saved research answer", researchSnapshot: safeSnapshot(state.researchSession || state.researchAnswer) };
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

function downloadResearchText(content, filename, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
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
  renderHomeDiscovery();
  if (state.sharedStoryId && !state.sharedStoryOpened) {
    let sharedStory = storyEngine.getStory(state.sharedStoryId);
    if (!sharedStory) {
      storyEngine.generateStoryCandidates({}, {
        mode: state.researchMode,
        now: new Date(),
        visibleLeagues: navigationModel.allLeagues,
      });
      sharedStory = storyEngine.getStory(state.sharedStoryId);
    }
    if (sharedStory) {
      state.sharedStoryOpened = true;
      renderStoryDetail(sharedStory, { updateUrl: false });
    }
  }
  renderResearchMode();
  renderAthleteProfile();
  renderEntityProfile();
  applyWorkspaceVisibility();
  applyHistoryVisibility();
  applyMarketResearchVisibility();
  if (state.historyActive) renderHistoricalExplorer();
  if (state.marketResearchActive) renderMarketResearch();
  if (elements.discoveryDrawer.classList.contains("open")) renderDiscovery();
}

function setProfileUrl(athleteId, tab, { replace = false } = {}) {
  const url = new URL(window.location.href);
  if (athleteId) {
    url.pathname = "/";
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
  state.historyActive = false;
  state.historyRoute = null;
  applyHistoryVisibility();
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
    url.pathname = "/";
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
  state.historyActive = false;
  state.historyRoute = null;
  applyHistoryVisibility();
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
  const discoveryGroups = state.discoverySearch?.groups || [];
  const marketResults = state.marketSearchResults || [];
  elements.athleteSearchResults.hidden = results.length === 0 && discoveryGroups.length === 0 && marketResults.length === 0;
  elements.queryInput.setAttribute("aria-expanded", String(results.length > 0 || discoveryGroups.length > 0 || marketResults.length > 0));
  elements.queryInput.setAttribute(
    "aria-activedescendant",
    state.athleteSearchIndex >= 0 ? `athlete-search-option-${state.athleteSearchIndex}` : "",
  );
  elements.athleteSearchResults.innerHTML = `${results.map((entity, index) => `
    <a id="athlete-search-option-${index}" role="option" aria-selected="${index === state.athleteSearchIndex}" href="${escapeHtml(entity.profileSystem === "athlete" ? profileUrl(entity.id) : entityProfileUrl(entity.id))}" ${entity.profileSystem === "athlete" ? `data-open-athlete="${escapeHtml(entity.id)}"` : `data-open-entity="${escapeHtml(entity.id)}"`}>
      <span>${escapeHtml(entity.name)}${entity.active ? "" : " · Inactive"}</span>
      <small>${escapeHtml(entity.typeLabel)}${entity.context ? ` · ${escapeHtml(entity.context)}` : ""}</small>
    </a>
  `).join("")}${state.athleteSearchGuidance.length ? `<div class="athlete-search-guidance" aria-label="Suggested research paths"><strong>Research next</strong><div>${state.athleteSearchGuidance.map((item) => `<button type="button" data-search-followup="${escapeHtml(item.query)}">${escapeHtml(item.label)}</button>`).join("")}</div></div>` : ""}
  ${marketResults.length ? `<section class="discovery-search-group" role="group" aria-labelledby="market-search-results"><strong id="market-search-results">${state.marketSearchIntent?.matched ? "Explain the Market" : "Relevant Markets"}</strong><div>${marketResults.slice(0, 6).map((model) => `<a href="${escapeHtml(marketResearchHref(model))}" data-open-market="${escapeHtml(model.selectionId)}" data-market-league="${escapeHtml(model.leagueId)}">${escapeHtml(model.participantName)} · ${escapeHtml(model.marketName)} <small>${escapeHtml(model.leagueName)} · ${escapeHtml(model.status)}${state.marketSearchIntent?.matched ? ` · ${escapeHtml(state.marketSearchIntent.intent.replaceAll("-", " "))}` : ""}</small></a>`).join("")}</div></section>` : ""}
  ${discoveryGroups.filter((group) => group.id !== "direct").map((group) => `<section class="discovery-search-group" role="group" aria-labelledby="discovery-search-${escapeHtml(group.id)}"><strong id="discovery-search-${escapeHtml(group.id)}">${escapeHtml(group.label)}</strong><div>${group.items.slice(0, 4).map((item) => item.route?.href || item.route
    ? ["history", "anniversaries"].includes(group.id) ? `<a href="${escapeHtml(item.route)}" data-history-route>${escapeHtml(item.title)}</a>` : `<a href="${escapeHtml(item.route.href)}" data-discovery-route="${escapeHtml(item.route.href)}">${escapeHtml(item.title)}</a>`
    : `<button type="button" data-discovery-search-query="${escapeHtml(item.queryTemplate?.query || item.query || item.title)}">${escapeHtml(item.title || item.label)}</button>`).join("")}</div></section>`).join("")}`;
}

function updateAthleteSearch(query) {
  const text = String(query || "").trim();
  if (text.length < 2) {
    window.clearTimeout(discoverySearchTimer);
    state.athleteSearchResults = [];
    state.athleteSearchIndex = -1;
    state.athleteSearchGuidance = [];
    state.marketSearchResults = [];
    state.marketSearchIntent = null;
    state.discoverySearch = null;
    renderAthleteSearchResults();
    return;
  }
  const matches = entityRegistry.search(text, {
    leagueId: state.leagueId,
    sportId: currentLeague()?.sportId || "",
  }, 10);
  const activeMatches = matches.filter((match) => match.active);
  state.athleteSearchResults = (activeMatches.length ? activeMatches : matches).slice(0, 6);
  const selectionSummary = getSelectionSummary(state.navigationSelection);
  state.marketSearchIntent = classifyMarketExplainerQuery(text);
  state.marketSearchResults = marketResearchService.search(text, { leagueIds: selectionSummary.visibleLeagues.map((league) => league.leagueId) }, 6);
  const primary = state.athleteSearchResults[0];
  const canonical = primary ? entityRegistry.getEntity(primary.id) : null;
  const hasMarkets = primary?.profileSystem === "athlete"
    ? statsRepository.getAthleteMarkets(canonical.id, sportsRepository).length > 0
    : Boolean(canonical && sportsRepository.getMarkets(canonical.leagueId).some((market) => market.available));
  state.athleteSearchGuidance = getEntityResearchActions(primary, { hasMarkets });
  state.athleteSearchIndex = -1;
  renderAthleteSearchResults();
  window.clearTimeout(discoverySearchTimer);
  discoverySearchTimer = window.setTimeout(async () => {
    const { scope, options } = discoveryScopeAndOptions();
    const discoverySearch = discoveryService.searchDiscovery(text, scope, { ...options, includeDirectMatches: false });
    await loadHistoricalModules();
    if (elements.queryInput.value.trim() !== text) return;
    const history = historicalService.searchHistoricalItems({ query: text, sportId: scope.sportIds.length === 1 ? scope.sportIds[0] : "", leagueId: scope.leagueIds.length === 1 ? scope.leagueIds[0] : "", pageSize: 4 }).items;
    const anniversaries = anniversaryService.searchAnniversaries(text, { date: new Date(), sportId: scope.sportIds.length === 1 ? scope.sportIds[0] : "", leagueId: scope.leagueIds.length === 1 ? scope.leagueIds[0] : "", limit: 4 }).items;
    const groups = [...discoverySearch.groups, ...(anniversaries.length ? [{ id: "anniversaries", label: "On This Day & Anniversaries", items: anniversaries }] : []), ...(history.length ? [{ id: "history", label: "History", items: history }] : [])];
    state.discoverySearch = { ...discoverySearch, groups, total: groups.reduce((sum, group) => sum + group.items.length, 0) };
    renderAthleteSearchResults();
  }, 180);
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
  if (state.researchIntent === "sgp") {
    setMarketResearchRoute({ type: "parlay-builder", constraints: state.parlayConstraints });
    return;
  }
  if (state.researchIntent === "ai-research") {
    elements.queryInput.focus();
    document.querySelector(".hero").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  scheduleMarketBoardLoad();
});

elements.openHistory.addEventListener("click", (event) => {
  event.preventDefault();
  const summary = getSelectionSummary(state.navigationSelection);
  const league = summary.selection.type === "league" ? sportsRepository.getLeague(summary.selection.id) : null;
  setHistoricalRoute(league ? { type: "league", sportId: league.sportId, leagueId: league.leagueId }
    : summary.selection.type === "sport" ? { type: "sport", sportId: summary.selection.id } : { type: "home" });
  recordWorkspaceActivity("opened", "historical_explorer", league?.leagueId || summary.selection.id, "Opened Historical Explorer");
});

elements.openMarkets.addEventListener("click", (event) => {
  event.preventDefault();
  setMarketResearchRoute({ type: "hub" });
  recordWorkspaceActivity("opened", "market_research", "markets", "Opened Edge Markets");
});

elements.closeMarketResearch.addEventListener("click", (event) => {
  event.preventDefault();
  setMarketResearchRoute(null, { focus: false });
  elements.openMarkets.focus({ preventScroll: true });
});

elements.shareMarketResearch.addEventListener("click", async () => {
  try { await writeClipboardWithTimeout(window.location.href); elements.marketResearchStatus.textContent = "Edge Markets link copied."; }
  catch (error) { elements.marketResearchStatus.textContent = error?.message || "Copy is unavailable."; }
});

function marketScreenerWorkspaceCandidate(item, { pinned = false } = {}) {
  return {
    title: `${item.participantName} · ${item.marketName}`,
    description: "Saved Market Screener research result. This is not a betting recommendation.",
    type: "saved_research", boardId: "board-betting-research", sample: item.sample,
    isPinned: pinned,
    tags: ["market screener", pinned ? "pinned opportunity research" : "favorite research"],
    sourceState: { mode: state.researchMode, sportId: item.sportId, leagueId: item.leagueId, queryText: "", structuredQuery: { marketScreener: state.marketScreenerFilters, resultId: item.id, sortBy: state.marketScreenerSort, groupBy: state.marketScreenerGroup } },
    canonicalReferences: { entityIds: item.entityId ? [item.entityId] : [], eventIds: item.gameId ? [item.gameId] : [], marketIds: [item.marketResearchId], insightIds: [item.currentStreak?.id, item.currentMilestone?.id].filter(Boolean), queryId: null, visualizationId: item.relatedVisualization?.type || null },
    researchSnapshot: safeSnapshot({ type: "market_screener_result", result: item, filters: state.marketScreenerFilters, sortBy: state.marketScreenerSort, groupBy: state.marketScreenerGroup, savedAt: new Date().toISOString(), disclosure: state.marketScreenerResult?.disclosure }),
  };
}

function marketScreenerPresetCandidate() {
  const result = state.marketScreenerResult;
  return {
    title: "Saved Market Screener preset",
    description: "Refreshable deterministic market research filters. Not a betting recommendation.",
    type: "saved_query", boardId: "board-stats-trends", sample: true,
    tags: ["market screener", "research preset"],
    sourceState: { mode: state.researchMode, sportId: "", leagueId: "", queryText: "", structuredQuery: { marketScreener: state.marketScreenerFilters, sortBy: state.marketScreenerSort, groupBy: state.marketScreenerGroup } },
    canonicalReferences: { entityIds: [], eventIds: [], marketIds: result?.items.map((item) => item.marketResearchId) || [], insightIds: [], queryId: `market-screener:${serializeScreenerFilters(state.marketScreenerFilters)}`, visualizationId: null },
    researchSnapshot: safeSnapshot({ type: "market_screener_preset", filters: state.marketScreenerFilters, sortBy: state.marketScreenerSort, groupBy: state.marketScreenerGroup, resultCount: result?.total || 0, capturedAt: new Date().toISOString(), disclosure: result?.disclosure }),
  };
}

function parlayWorkspaceCandidate({ preset = false, tracked = false, archived = false, title = "Parlay research set" } = {}) {
  const result = state.parlayBuilderResult;
  return {
    title, description: "Evidence-backed parlay research. This is not a wager, prediction, or recommendation.",
    type: tracked ? "tracked_research_idea" : preset ? "saved_query" : "saved_research",
    boardId: archived ? "board-archived" : "board-betting-research", sample: result?.sample ?? true, isArchived: archived, tags: ["parlay research", preset ? "constraints" : "evidence", `version ${state.parlayVersions.length || 1}`],
    sourceState: { mode: state.researchMode, sportId: "", leagueId: "", queryText: "", structuredQuery: { parlayConstraints: state.parlayConstraints } },
    canonicalReferences: { entityIds: result?.legs.map((item) => item.entityId).filter(Boolean) || [], eventIds: result?.legs.map((item) => item.eventId).filter(Boolean) || [], marketIds: result?.legs.map((item) => item.marketResearchId) || [], insightIds: result?.legs.flatMap((item) => [item.milestone?.id, item.streak?.id]).filter(Boolean) || [], queryId: `parlay-builder:${serializeParlayConstraints(state.parlayConstraints)}`, visualizationId: null },
    researchSnapshot: safeSnapshot({ ...(preset ? { type: "parlay_constraint_preset", constraints: state.parlayConstraints } : result), savedAt: new Date().toISOString() }),
  };
}

function applyParlayResult(result, message = "Parlay research updated with a transparent change record.") {
  if (!result) return;
  state.parlayBuilderResult = result; state.parlayConstraints = result.constraints;
  if (!state.parlayVersions.some((item) => item.id === result.id && item.generatedAt === result.generatedAt)) state.parlayVersions = [...state.parlayVersions, result].slice(-8);
  const url = new URL(window.location.href); const target = new URL(marketResearchHref({ type: "parlay-builder", constraints: result.constraints }), window.location.origin); url.pathname = target.pathname; url.search = target.search; history.replaceState({ edgeboardMarkets: true }, "", url);
  elements.marketResearchContent.innerHTML = renderParlayBuilder(result); elements.marketResearchStatus.textContent = message;
}

function marketScreenerResearchContext(intent = "explain_screener") {
  const result = state.marketScreenerResult;
  const selected = result?.items.filter((item) => state.marketScreenerSelectedIds.includes(item.id)) || [];
  const items = (selected.length ? selected : result?.items || []).slice(0, 4);
  if (!items.length) return null;
  const screener = Object.freeze({
    intent,
    filters: state.marketScreenerFilters,
    sortBy: state.marketScreenerSort,
    groupBy: state.marketScreenerGroup,
    candidateCount: result.candidateCount,
    matchedCount: result.total,
    resultIds: Object.freeze(items.map((item) => item.id)),
    explanation: result.explanation,
    supportingEvidence: Object.freeze(items.map((item) => Object.freeze({
      id: item.id, type: "screener_result", label: `${item.participantName} · ${item.marketName}`,
      provider: item.provider, verification: item.sample ? "validated-sample" : "provider-verified",
      values: Object.freeze({ researchQuality: item.researchQuality, marketTrust: item.marketTrustScore, historicalCoverage: item.historicalCoverage, movement: item.movementVerified ? item.movement : null }),
    }))),
    disclosure: result.disclosure,
  });
  return marketResearchContextFor(items[0].model, intent, screener);
}

elements.saveMarketResearch.addEventListener("click", () => {
  if (state.marketResearchRoute?.type === "parlay-builder") {
    openWorkspaceSave(parlayWorkspaceCandidate({ preset: true, title: "Saved Parlay Builder constraints" })).catch(reportWorkspaceError);
    return;
  }
  if (state.marketResearchRoute?.type === "screener") {
    openWorkspaceSave(marketScreenerPresetCandidate()).catch(reportWorkspaceError);
    return;
  }
  const model = state.marketResearchModel;
  openWorkspaceSave({
    title: model ? `${model.participantName} · ${model.marketName}` : elements.marketResearchTitle.textContent,
    description: "Saved immutable Edge Markets research snapshot",
    type: "saved_research", boardId: "board-betting-research", sample: model?.source.sample ?? true,
    sourceState: { mode: state.researchMode, sportId: model?.sportId || "", leagueId: model?.leagueId || "", queryText: "", structuredQuery: { marketResearchRoute: state.marketResearchRoute } },
    canonicalReferences: { entityIds: model?.entity ? [model.entity.id] : [], eventIds: model?.event?.id ? [model.event.id] : [], marketIds: model ? [model.id] : [], insightIds: model?.insights?.map((item) => item.id) || [], queryId: null, visualizationId: null },
    researchSnapshot: safeSnapshot(model || { route: state.marketResearchRoute, scope: getSelectionSummary(state.navigationSelection).contextLabel, savedAt: new Date().toISOString(), sample: true }),
  }).catch(reportWorkspaceError);
});

elements.marketResearchNav.addEventListener("click", (event) => {
  const link = event.target.closest("[data-market-route]");
  if (!link) return;
  event.preventDefault(); setMarketResearchRoute({ type: link.dataset.marketRoute });
});

function screenerFiltersFromForm(form) {
  const data = new FormData(form);
  const input = {};
  MARKET_SCREENER_ARRAY_FILTERS.forEach((key) => {
    const values = data.getAll(key).flatMap((value) => String(value || "").split(",")).map((value) => value.trim()).filter(Boolean);
    if (values.length) input[key] = values;
  });
  MARKET_SCREENER_NUMERIC_FILTERS.forEach((key) => {
    const value = String(data.get(key) || "").trim();
    if (value !== "" && Number.isFinite(Number(value))) input[key] = Number(value);
  });
  MARKET_SCREENER_BOOLEAN_FILTERS.forEach((key) => { if (data.has(key)) input[key] = true; });
  return normalizeScreenerFilters(input);
}

function parlayConstraintsFromForm(form) {
  const data = new FormData(form); const input = {};
  ["sportIds", "leagueIds", "marketTypes", "sportsbooks"].forEach((key) => { const values = data.getAll(key).filter(Boolean); if (values.length) input[key] = values; });
  ["minimumResearchQuality", "minimumEdgeTrust", "minimumResearchCompleteness", "minimumLineMovement", "minimumPriceMovement", "maximumLegs", "minimumOdds", "maximumOdds"].forEach((key) => { const value = String(data.get(key) || "").trim(); if (value !== "" && Number.isFinite(Number(value))) input[key] = Number(value); });
  input.maximumResearchCorrelation = data.get("maximumResearchCorrelation");
  PARLAY_BOOLEAN_CONSTRAINTS.forEach((key) => { input[key] = data.has(key); });
  return normalizeParlayConstraints(input);
}

elements.marketResearchView.addEventListener("submit", (event) => {
  if (event.target.id === "parlayBuilderForm") {
    event.preventDefault(); state.parlayConstraints = parlayConstraintsFromForm(event.target);
    setMarketResearchRoute({ type: "parlay-builder", constraints: state.parlayConstraints }, { replace: true, focus: false }); return;
  }
  if (event.target.id !== "marketScreenerForm") return;
  event.preventDefault();
  state.marketScreenerFilters = screenerFiltersFromForm(event.target);
  state.marketScreenerOffset = 0;
  state.marketScreenerSelectedIds = [];
  setMarketResearchRoute({ type: "screener", filters: state.marketScreenerFilters, sortBy: state.marketScreenerSort, groupBy: state.marketScreenerGroup }, { replace: true, focus: false });
});

elements.marketResearchView.addEventListener("change", (event) => {
  const selected = event.target.closest("[data-screener-select]");
  if (selected) {
    const id = selected.dataset.screenerSelect;
    state.marketScreenerSelectedIds = selected.checked ? [...new Set([...state.marketScreenerSelectedIds, id])].slice(0, 4) : state.marketScreenerSelectedIds.filter((item) => item !== id);
    const button = elements.marketResearchView.querySelector("[data-screener-compare]");
    if (button) { button.disabled = state.marketScreenerSelectedIds.length < 2; button.textContent = `Compare selected (${state.marketScreenerSelectedIds.length})`; }
    return;
  }
  if (event.target.matches("[data-screener-sort]")) state.marketScreenerSort = event.target.value;
  else if (event.target.matches("[data-screener-group]")) state.marketScreenerGroup = event.target.value;
  else return;
  state.marketScreenerOffset = 0;
  setMarketResearchRoute({ type: "screener", filters: state.marketScreenerFilters, sortBy: state.marketScreenerSort, groupBy: state.marketScreenerGroup }, { replace: true, focus: false });
});

elements.marketResearchView.addEventListener("click", async (event) => {
  if (event.target.closest("[data-parlay-reset]")) { state.parlayConstraints = normalizeParlayConstraints(); await setMarketResearchRoute({ type: "parlay-builder", constraints: state.parlayConstraints }, { replace: true, focus: false }); return; }
  const parlayPreset = event.target.closest("[data-parlay-preset]");
  if (parlayPreset) { const preset = parlayBuilderService.getPresets().find((item) => item.id === parlayPreset.dataset.parlayPreset); if (preset) { state.parlayConstraints = normalizeParlayConstraints(preset.constraints); await setMarketResearchRoute({ type: "parlay-builder", constraints: state.parlayConstraints }, { replace: true, focus: false }); } return; }
  if (event.target.closest("[data-parlay-save-preset]")) { await openWorkspaceSave(parlayWorkspaceCandidate({ preset: true, title: "Saved Parlay Builder constraints" })); return; }
  const buildAround = event.target.closest("[data-parlay-build-around]");
  if (buildAround) { const summary = getSelectionSummary(state.navigationSelection); const next = parlayBuilderService.buildAround(state.parlayBuilderResult, buildAround.dataset.parlayBuildAround, { scope: { leagueIds: summary.visibleLeagues.map((item) => item.leagueId) }, currentDate: new Date(testFixtureTimestamp || Date.now()) }); applyParlayResult(next, "Selected leg locked. Compatible legs were researched without relaxing constraints."); return; }
  const replaceLeg = event.target.closest("[data-parlay-replace]");
  if (replaceLeg) { const summary = getSelectionSummary(state.navigationSelection); const next = parlayBuilderService.replaceLeg(state.parlayBuilderResult, replaceLeg.dataset.parlayReplace, { scope: { leagueIds: summary.visibleLeagues.map((item) => item.leagueId) }, currentDate: new Date(testFixtureTimestamp || Date.now()) }); applyParlayResult(next, next.changes.at(-1)?.reason || "Replacement evaluated without rebuilding other legs."); return; }
  const favorite = event.target.closest("[data-parlay-favorite]");
  if (favorite) { const id = favorite.dataset.parlayFavorite; const wasFavorite = state.parlayFavoriteSelectionIds.includes(id); state.parlayFavoriteSelectionIds = wasFavorite ? state.parlayFavoriteSelectionIds.filter((item) => item !== id) : [...state.parlayFavoriteSelectionIds, id]; try { localStorage.setItem("edgeboard-parlay-favorite-legs-v1", JSON.stringify(state.parlayFavoriteSelectionIds)); } catch { elements.marketResearchStatus.textContent = "Favorite changed for this session; local persistence is unavailable."; } applyParlayResult(state.parlayBuilderResult, wasFavorite ? "Favorite removed." : "Favorite research leg saved locally. Availability notifications do not imply betting success."); return; }
  const refine = event.target.closest("[data-parlay-refine]");
  if (refine) { const action = refine.dataset.parlayRefine; const summary = getSelectionSummary(state.navigationSelection); const next = parlayBuilderService.refine(state.parlayBuilderResult, action, { scope: { leagueIds: summary.visibleLeagues.map((item) => item.leagueId) }, currentDate: new Date(testFixtureTimestamp || Date.now()) }); applyParlayResult(next, next.changes.at(-1)?.reason || `Applied ${action.replaceAll("_", " ")} while preserving explicit constraints.`); return; }
  const parlayQuery = event.target.closest("[data-parlay-query]");
  if (parlayQuery) { const first = state.parlayBuilderResult?.legs[0]; const record = first ? marketScreenerService.getRecords({}, new Date(testFixtureTimestamp || Date.now())).find((item) => item.selectionId === first.selectionId) : null; setMarketResearchRoute(null, { replace: true, focus: false }); elements.queryInput.value = parlayQuery.dataset.parlayQuery; state.marketResearchContext = record ? marketResearchContextFor(record.model, "parlay_research", { parlay: state.parlayBuilderResult }) : null; document.querySelector("#queryForm").requestSubmit(); return; }
  const action = event.target.closest("[data-parlay-action]");
  if (action) {
    const kind = action.dataset.parlayAction;
    if (["save", "track", "duplicate", "archive"].includes(kind)) await openWorkspaceSave(parlayWorkspaceCandidate({ tracked: kind === "track", archived: kind === "archive", title: kind === "duplicate" ? "Copy of Parlay research set" : kind === "archive" ? "Archived Parlay research version" : "Parlay research set" }));
    else if (kind === "refresh") { parlayBuilderService.cache.clear(); const summary = getSelectionSummary(state.navigationSelection); const next = parlayBuilderService.build(state.parlayConstraints, { scope: { leagueIds: summary.visibleLeagues.map((item) => item.leagueId) }, currentDate: new Date(testFixtureTimestamp || Date.now()), lockedSelectionIds: state.parlayBuilderResult?.lockedSelectionIds || [] }); applyParlayResult(next, "A new refreshable version was created. Earlier snapshots remain unchanged."); }
    else if (kind === "share") { try { await writeClipboardWithTimeout(window.location.href); elements.marketResearchStatus.textContent = "Parlay research link copied. Private notes were not included."; } catch (error) { elements.marketResearchStatus.textContent = error?.message || "Copy is unavailable."; } }
    else if (kind === "export") { const payload = JSON.stringify(safeSnapshot({ ...state.parlayBuilderResult, privateNotes: undefined }), null, 2); const blob = new Blob([payload], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "edgeboard-parlay-research.json"; link.click(); URL.revokeObjectURL(link.href); elements.marketResearchStatus.textContent = "Parlay research exported with source and uncertainty metadata."; }
    else if (kind === "compare") { elements.marketResearchContent.querySelector("#parlayVersionComparisonTitle")?.scrollIntoView({ behavior: "smooth", block: "start" }); elements.marketResearchStatus.textContent = state.parlayVersions.length > 1 ? "Saved in-session versions are compared without declaring a winner." : "Create or refresh another version before comparing."; }
    return;
  }
  const reset = event.target.closest("[data-screener-reset]");
  if (reset) {
    state.marketScreenerFilters = Object.freeze({}); state.marketScreenerOffset = 0; state.marketScreenerSelectedIds = [];
    await setMarketResearchRoute({ type: "screener", filters: {}, sortBy: state.marketScreenerSort, groupBy: state.marketScreenerGroup }, { replace: true, focus: false }); return;
  }
  const presetButton = event.target.closest("[data-screener-preset]");
  if (presetButton) {
    const preset = marketScreenerService.getPreset(presetButton.dataset.screenerPreset);
    if (!preset) return;
    state.marketScreenerFilters = normalizeScreenerFilters(preset.filters); state.marketScreenerOffset = 0; state.marketScreenerSelectedIds = [];
    await setMarketResearchRoute({ type: "screener", filters: state.marketScreenerFilters, sortBy: state.marketScreenerSort, groupBy: state.marketScreenerGroup }, { replace: true, focus: false }); return;
  }
  if (event.target.closest("[data-screener-save-preset]")) { await openWorkspaceSave(marketScreenerPresetCandidate()); return; }
  if (event.target.closest("[data-screener-next]")) { state.marketScreenerOffset += MARKET_SCREENER_WINDOW_SIZE; await renderMarketResearch({ focus: false }); return; }
  if (event.target.closest("[data-screener-previous]")) { state.marketScreenerOffset = Math.max(0, state.marketScreenerOffset - MARKET_SCREENER_WINDOW_SIZE); await renderMarketResearch({ focus: false }); return; }
  if (event.target.closest("[data-screener-compare]")) { await renderMarketResearch({ focus: false }); const heading = elements.marketResearchView.querySelector("#screenerComparisonTitle"); heading?.setAttribute("tabindex", "-1"); heading?.focus(); return; }
  const save = event.target.closest("[data-screener-save]");
  if (save) {
    const item = marketScreenerService.getRecords({ leagueIds: getSelectionSummary(state.navigationSelection).visibleLeagues.map((league) => league.leagueId) }, new Date(testFixtureTimestamp || Date.now())).find((record) => record.id === save.dataset.screenerId);
    if (item) await openWorkspaceSave(marketScreenerWorkspaceCandidate(item, { pinned: save.dataset.screenerSave === "pin" }));
    return;
  }
  const share = event.target.closest("[data-screener-share]");
  if (share) {
    const item = state.marketScreenerResult?.items.find((record) => record.id === share.dataset.screenerShare);
    if (!item) return;
    try { await writeClipboardWithTimeout(new URL(marketResearchHref(item.model), window.location.origin).href); elements.marketResearchStatus.textContent = "Canonical market research link copied."; }
    catch (error) { elements.marketResearchStatus.textContent = error?.message || "Copy is unavailable."; }
    return;
  }
  const screenerQuery = event.target.closest("[data-screener-query]");
  if (screenerQuery) {
    const context = marketScreenerResearchContext(screenerQuery.dataset.screenerIntent || "explain_screener");
    setMarketResearchRoute(null, { replace: true, focus: false });
    elements.queryInput.value = screenerQuery.dataset.screenerQuery;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    state.marketResearchContext = context;
    document.querySelector("#queryForm").requestSubmit();
    document.querySelector("#researchWorkspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const addButton = event.target.closest("[data-add]");
  if (!addButton) return;
  const model = state.marketResearchModel;
  const pick = model ? getPickBySelectionId(sportsRepository, model.leagueId, addButton.dataset.add) : null;
  if (!pick?.available || pick.stale || state.slip.some((item) => item.id === pick.id)) return;
  state.slip.push(pick); state.selectedPickId = pick.id; renderSlip(); addButton.textContent = "Added"; addButton.disabled = true;
});

elements.closeHistoricalExplorer.addEventListener("click", (event) => {
  event.preventDefault();
  setHistoricalRoute(null, { focus: false });
  elements.openHistory.focus({ preventScroll: true });
});

elements.shareHistoricalExplorer.addEventListener("click", async () => {
  try {
    await writeClipboardWithTimeout(window.location.href);
    elements.historicalActionStatus.textContent = "Historical Explorer link copied.";
  } catch (error) {
    elements.historicalActionStatus.textContent = error?.message || "Copy is unavailable.";
  }
});

elements.saveHistoricalExplorer.addEventListener("click", async () => {
  await loadHistoricalModules();
  const route = state.historyRoute || { type: "home" };
  const scope = historicalScope(route);
  const anniversary = route.type === "anniversary" ? anniversaryService.getAnniversary(route.anniversaryId, { mode: state.researchMode }) : null;
  const item = route.type === "item" ? historicalService.getItem(route.itemId) : anniversary ? historicalService.getItem(anniversary.historicalItemId) : null;
  const coverage = historicalService.getHistoricalCoverage(scope);
  openWorkspaceSave({
    title: item?.title || elements.historicalExplorerTitle.textContent,
    description: "Saved Historical Explorer snapshot with coverage and validation limits",
    type: "saved_research", boardId: "board-stats-trends", sample: true,
    sourceState: { mode: state.researchMode, sportId: scope.sportId, leagueId: scope.leagueId, queryText: "", structuredQuery: { historicalRoute: route } },
    canonicalReferences: { entityIds: item?.entityIds || [], eventIds: item?.eventIds || [], marketIds: [], insightIds: [], queryId: null, visualizationId: null },
    researchSnapshot: safeSnapshot({ route, item, anniversary, coverage, savedAt: new Date().toISOString(), source: "EdgeBoard historical sample fixtures", sample: true }),
  }).catch(reportWorkspaceError);
});

elements.historicalExplorer.addEventListener("click", async (event) => {
  const routeLink = event.target.closest("[data-history-route]");
  if (routeLink) {
    event.preventDefault();
    const existingTimeline = document.querySelector("#anniversaryTimeline");
    if (routeLink.hash === "#anniversaryTimeline" && existingTimeline) {
      existingTimeline.scrollIntoView({ behavior: "smooth", block: "start" });
      existingTimeline.setAttribute("tabindex", "-1");
      existingTimeline.focus({ preventScroll: true });
      return;
    }
    await setHistoricalRoute(parseHistoricalRoute(new URL(routeLink.href, window.location.origin)));
    if (routeLink.hash === "#anniversaryTimeline") {
      const timeline = document.querySelector("#anniversaryTimeline");
      timeline?.scrollIntoView({ behavior: "smooth", block: "start" });
      timeline?.setAttribute("tabindex", "-1");
      timeline?.focus({ preventScroll: true });
    }
    return;
  }
  const offset = event.target.closest("[data-anniversary-offset]");
  if (offset || event.target.closest("[data-anniversary-today]")) {
    const current = state.historyRoute?.date || new Date();
    const query = offset ? (Number(offset.dataset.anniversaryOffset) < 0 ? "yesterday" : "tomorrow") : "today";
    const parsed = anniversaryQueryParser(query, { today: offset ? current : new Date() });
    setHistoricalRoute({ ...state.historyRoute, type: "anniversaries", date: parsed.date });
    return;
  }
  const anniversaryQuery = event.target.closest("[data-anniversary-query]");
  if (anniversaryQuery) {
    elements.queryInput.value = anniversaryQuery.dataset.anniversaryQuery;
    setHistoricalRoute(null, { focus: false });
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
  const research = event.target.closest("[data-history-research]");
  if (research) {
    const raw = historicalService.getItem(research.dataset.historyResearch);
    elements.queryInput.value = research.dataset.historyQuery || `Explore ${raw?.title || "the available historical data"}`;
    if (raw) state.discoveryResearchContext = {
      itemId: raw.id, type: "historical_item", title: raw.title, entityIds: raw.entityIds, eventIds: raw.eventIds, storyIds: [], statIds: raw.statIds, marketIds: [], sportId: raw.sportId, leagueId: raw.leagueId,
      queryTemplate: { query: elements.queryInput.value, intent: "historical_exploration" },
      sourceSignals: raw.supportingEvidence.map((entry) => ({ type: "historical_evidence", label: entry.label, weight: 1 })),
      sources: raw.sources, freshness: raw.freshness, validationStatus: raw.validationStatus, edgeTrust: raw.edgeTrust, researchQuality: raw.researchQuality,
      warnings: [...raw.warnings, `Historical coverage: ${raw.coverage?.label || "unavailable"}`],
    };
    setHistoricalRoute(null, { focus: false });
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#queryForm").requestSubmit();
    elements.queryInput.focus({ preventScroll: true });
    return;
  }
  const visual = event.target.closest("[data-history-visual]");
  if (visual) {
    const item = historicalService.getItem(visual.dataset.historyVisual);
    const entity = item?.resolvedEntities[0];
    if (!item || !entity) return;
    state.historyActive = false;
    openVisualAnalytics({ visualizationType: "timeline", sportId: item.sportId, leagueId: item.leagueId, entityType: entity.type, entityIds: [entity.id], eventIds: item.eventIds, statIds: item.statIds, dateRange: { type: "season", value: item.season }, filters: {} });
  }
});

elements.historicalExplorer.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-anniversary-filters]");
  if (!form) return;
  event.preventDefault();
  const values = new FormData(form);
  const sportId = String(values.get("sport") || "");
  let leagueId = String(values.get("league") || "");
  if (leagueId && sportId && sportsRepository.getLeague(leagueId)?.sportId !== sportId) leagueId = "";
  setHistoricalRoute({ type: "anniversaries", date: String(values.get("date") || ""), year: String(values.get("year") || ""), sportId, leagueId, category: String(values.get("category") || "") });
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
  const parsed = parseResearchQuery(query, sportsRepository, state.marketResearchContext?.leagueId || state.discoveryResearchContext?.leagueId || state.leagueId, state.market);
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
    storyContext: state.storyResearchContext,
    discoveryContext: state.discoveryResearchContext,
    marketContext: state.marketResearchContext,
    historicalQuery: state.historicalParsedQuery,
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
  synchronizeResearchSession(query);
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
    currentLeagueId: state.marketResearchContext?.leagueId || state.storyResearchContext?.leagueId || state.discoveryResearchContext?.leagueId || state.leagueId,
    selectedEntityId: state.marketResearchContext?.entityIds?.[0] || state.storyResearchContext?.entityIds?.[0] || state.discoveryResearchContext?.entityIds?.[0] || state.selectedEntityId,
    ignoreExplicitLeague: state.statsContextOverrideDisabled,
  });
  if (state.marketResearchContext) {
    state.statsParsedQuery = Object.freeze({
      ...state.statsParsedQuery,
      structuredQuery: Object.freeze({
        ...state.statsParsedQuery.structuredQuery,
        sportId: state.marketResearchContext.sportId,
        leagueId: state.marketResearchContext.leagueId,
        primaryEntityIds: state.marketResearchContext.entityIds,
        entitySet: state.marketResearchContext.entityIds,
        entitySetSource: "structured-market-context",
        contextOverride: false,
        scopeOverride: true,
      }),
    });
  } else if (state.storyResearchContext) {
    state.statsParsedQuery = Object.freeze({
      ...state.statsParsedQuery,
      structuredQuery: Object.freeze({
        ...state.statsParsedQuery.structuredQuery,
        sportId: state.storyResearchContext.sportId,
        leagueId: state.storyResearchContext.leagueId,
        primaryEntityIds: state.storyResearchContext.entityIds,
        entitySet: state.storyResearchContext.entityIds,
        entitySetSource: "structured-story-context",
        contextOverride: false,
        scopeOverride: true,
      }),
    });
  } else if (state.discoveryResearchContext) {
    state.statsParsedQuery = Object.freeze({
      ...state.statsParsedQuery,
      structuredQuery: Object.freeze({
        ...state.statsParsedQuery.structuredQuery,
        sportId: state.discoveryResearchContext.sportId,
        leagueId: state.discoveryResearchContext.leagueId,
        statIds: state.discoveryResearchContext.statIds.length
          ? state.discoveryResearchContext.statIds : state.statsParsedQuery.structuredQuery.statIds,
        primaryEntityIds: state.discoveryResearchContext.entityIds,
        entitySet: state.discoveryResearchContext.entityIds,
        entitySetSource: "structured-discovery-context",
        contextOverride: false,
        scopeOverride: true,
      }),
    });
  }
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
    storyContext: state.storyResearchContext,
    discoveryContext: state.discoveryResearchContext,
    marketContext: state.marketResearchContext,
    historicalQuery: state.historicalParsedQuery,
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
  synchronizeResearchSession(query);
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
    state.researchSession = null;
    elements.queryFeedback.textContent = "Enter a sports research question.";
    renderAll();
    return;
  }
  const historicalRequested = /\b(history|historical|all[- ]time|championship|rivalr|dynast|comeback|upset|career timeline|season comparison|record progression|on this day|anniversar(?:y|ies)|what happened (?:today|on this date)|fastest finish|longest streak)\b/i.test(query);
  if (historicalRequested) await loadHistoricalModules();
  state.historicalParsedQuery = historicalRequested ? historicalQueryParser(query, {
    entityRegistry, sportsRepository, sportId: currentLeague()?.sportId || "", leagueId: state.leagueId,
  }) : null;
  if (state.historicalParsedQuery) {
    const parsedHistory = state.historicalParsedQuery;
    const coverage = historicalService.getHistoricalCoverage({ sportId: parsedHistory.sportId, leagueId: parsedHistory.leagueId });
    if (parsedHistory.intent === "event_anniversary") {
      const parsedAnniversary = anniversaryQueryParser(query, { today: new Date() });
      const anniversaryResult = anniversaryService.searchAnniversaries(query, { date: parsedAnniversary.date || new Date(), sportId: parsedHistory.sportId, leagueId: parsedHistory.leagueId, year: parsedAnniversary.originalYear, category: parsedAnniversary.category, limit: 5, mode: state.researchMode });
      const anniversary = anniversaryResult.items[0] || null;
      state.discoveryResearchContext = anniversary ? {
        itemId: anniversary.id, type: "historical_anniversary", title: anniversary.title, entityIds: anniversary.entityIds, eventIds: anniversary.eventIds, storyIds: [], statIds: historicalService.getItem(anniversary.historicalItemId)?.statIds || [], marketIds: anniversary.currentConnections.currentMarkets.map((market) => market.id), sportId: anniversary.sportId, leagueId: anniversary.leagueId,
        queryTemplate: { query, intent: "event_anniversary", date: parsedAnniversary.date, originalYear: parsedAnniversary.originalYear },
        sourceSignals: anniversary.supportingEvidence.map((entry) => ({ type: "historical_evidence", label: entry.label, weight: 1 })),
        sources: anniversary.sources, freshness: anniversary.freshness, validationStatus: anniversary.validationStatus, edgeTrust: anniversary.edgeTrust, researchQuality: anniversary.researchQuality,
        warnings: [...anniversary.warnings, `Historical coverage: ${anniversary.coverageLabel}`, "This anniversary is a historical fact, not a prediction."],
      } : {
        itemId: `anniversary-query-${parsedAnniversary.date || "invalid"}`, type: "historical_anniversary_query", title: "No supported anniversary found", entityIds: [], eventIds: [], storyIds: [], statIds: [], marketIds: [], sportId: parsedHistory.sportId, leagueId: parsedHistory.leagueId,
        queryTemplate: { query, intent: "event_anniversary", date: parsedAnniversary.date }, sourceSignals: [], sources: [], freshness: { state: "unavailable", lastUpdated: null }, validationStatus: "incomplete", edgeTrust: null, researchQuality: null,
        warnings: [...parsedAnniversary.warnings, ...anniversaryResult.warnings, "No unrelated event was substituted."],
      };
    } else {
    const result = historicalService.searchHistoricalItems({ query, sportId: parsedHistory.sportId, leagueId: parsedHistory.leagueId, entityIds: parsedHistory.entityIds, pageSize: 5 });
    const raw = result.items[0] ? historicalService.getItem(result.items[0].id) : null;
    const unsupportedAllTime = parsedHistory.allTimeRequested && !coverage?.allTimeClaimsSupported;
    state.discoveryResearchContext = {
      itemId: raw?.id || `historical-query-${Date.now()}`, type: "historical_query", title: raw?.title || "Historical research request",
      entityIds: raw?.entityIds || parsedHistory.entityIds, eventIds: raw?.eventIds || [], storyIds: [], statIds: raw?.statIds || [], marketIds: [],
      sportId: raw?.sportId || parsedHistory.sportId, leagueId: raw?.leagueId || parsedHistory.leagueId,
      queryTemplate: { query, intent: parsedHistory.intent, historicalScope: parsedHistory.intendedHistoricalScope },
      sourceSignals: raw?.supportingEvidence.map((entry) => ({ type: "historical_evidence", label: entry.label, weight: 1 })) || [{ type: "historical_coverage", label: coverage?.label || "Historical coverage unavailable", weight: 1 }],
      sources: raw?.sources || (coverage?.source ? [coverage.source] : [{ id: "edgeboard-history-coverage", label: "EdgeBoard historical coverage", sample: true }]),
      freshness: raw?.freshness || { state: "sample", lastUpdated: coverage?.lastSuccessfulUpdate || null },
      validationStatus: unsupportedAllTime ? "incomplete" : raw?.validationStatus || coverage?.validationStatus || "unknown",
      edgeTrust: raw?.edgeTrust || null, researchQuality: raw?.researchQuality || null,
      warnings: [...(raw?.warnings || []), ...(parsedHistory.warnings || []), ...(parsedHistory.unsupportedPortions || []), `Historical coverage: ${coverage?.label || "unavailable"}`],
    };
    }
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
        storyContext: state.storyResearchContext,
        discoveryContext: state.discoveryResearchContext,
        marketContext: state.marketResearchContext,
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
  if (/\b(parlay|builder|same[- ]game|sgp)\b/i.test(elements.queryInput.value)) {
    setMarketResearchRoute({ type: "parlay-builder", constraints: state.parlayConstraints });
    return;
  }
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
  state.storyResearchContext = null;
  state.discoveryResearchContext = null;
  state.marketResearchContext = null;
  state.graphResearchEntityId = "";
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

elements.athleteSearchResults.addEventListener("click", (event) => {
  const discoveryRoute = event.target.closest("[data-discovery-route]");
  if (discoveryRoute) {
    event.preventDefault();
    state.athleteSearchResults = [];
    state.discoverySearch = null;
    renderAthleteSearchResults();
    setDiscoveryRoute({ href: discoveryRoute.dataset.discoveryRoute });
    return;
  }
  const discoveryQuery = event.target.closest("[data-discovery-search-query]");
  if (discoveryQuery) {
    elements.queryInput.value = discoveryQuery.dataset.discoverySearchQuery;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
  const followUp = event.target.closest("[data-search-followup]");
  if (!followUp) return;
  elements.queryInput.value = followUp.dataset.searchFollowup;
  state.athleteSearchResults = [];
  state.athleteSearchGuidance = [];
  renderAthleteSearchResults();
  document.querySelector("#queryForm").requestSubmit();
});

elements.statsResults.addEventListener("click", (event) => {
  const followUp = event.target.closest("[data-stats-followup]");
  if (followUp) {
    elements.queryInput.value = followUp.dataset.statsFollowup;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
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

function isNumericScenarioValue(value) {
  return typeof value === "number" && Number.isFinite(value)
    || /^[+-]?\d+(?:\.\d+)?(?:\s|$)/.test(String(value ?? "").trim());
}

function openEdgeLabDialog() {
  const session = state.researchSession;
  if (!session?.id) return;
  const select = elements.edgeLabTarget;
  select.replaceChildren();
  const addGroup = (label, items) => {
    if (!items.length) return;
    const group = document.createElement("optgroup");
    group.label = label;
    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      option.dataset.targetType = item.targetType;
      option.dataset.targetId = item.targetId;
      option.dataset.kind = item.kind;
      group.append(option);
    });
    select.append(group);
  };
  addGroup("Numeric evidence", session.evidence.filter((item) => isNumericScenarioValue(item.value)).map((item) => ({
    value: `evidence:${item.id}`,
    label: `${item.label || item.type || item.id} · original ${item.value}`,
    targetType: "evidence",
    targetId: item.id,
    kind: "evidence_adjustment",
  })));
  const marketTargets = [];
  session.markets.forEach((market) => {
    const id = String(market.selectionId || market.id || "");
    if (!id) return;
    if (isNumericScenarioValue(market.line)) marketTargets.push({
      value: `market-line:${id}`, label: `${market.name || market.marketName || id} line · original ${market.line}`,
      targetType: "market", targetId: id, kind: "market_line",
    });
    if (isNumericScenarioValue(market.odds)) marketTargets.push({
      value: `market-odds:${id}`, label: `${market.name || market.marketName || id} odds · original ${market.odds}`,
      targetType: "market", targetId: id, kind: "market_odds",
    });
  });
  addGroup("Provider-confirmed markets", marketTargets);
  const form = elements.edgeLabForm;
  form.reset();
  form.elements.title.value = state.edgeLabScenario?.title || `Scenario · ${session.question}`;
  elements.edgeLabStatus.textContent = select.options.length
    ? "Choose a supported source field. The original value will remain unchanged."
    : "No numeric evidence or market field is available for a supported scenario assumption.";
  form.querySelector("button[type=submit]").disabled = select.options.length === 0;
  elements.edgeLabDialog.showModal();
  (select.options.length ? select : form.elements.title).focus();
}

elements.edgeLabDialog.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-edge-lab]")) elements.edgeLabDialog.close();
});

elements.edgeLabForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const session = state.researchSession;
  const option = elements.edgeLabTarget.selectedOptions[0];
  if (!session?.id || !option) return;
  const data = new FormData(elements.edgeLabForm);
  const assumption = {
    targetType: option.dataset.targetType,
    targetId: option.dataset.targetId,
    kind: option.dataset.kind,
    operation: data.get("operation"),
    value: data.get("value"),
    horizon: data.get("horizon"),
    rationale: data.get("rationale"),
  };
  state.edgeLabScenario = state.edgeLabScenario?.sessionId === session.id
    ? addEdgeLabAssumption(state.edgeLabScenario, assumption)
    : createEdgeLabScenario({ session, title: data.get("title"), assumptions: [assumption] });
  elements.edgeLabDialog.close();
  renderAll();
  elements.queryFeedback.textContent = state.edgeLabScenario.rejectedAssumptions.length
    ? "The unsupported assumption was preserved as rejected and did not alter the scenario."
    : "Scenario recalculated from its immutable research baseline. This is not a prediction.";
  document.querySelector("#edgeLabTitle")?.focus?.();
});

elements.researchAnswer.addEventListener("click", (event) => {
  if (event.target.closest("[data-session-new]")) {
    statsRequestSequence += 1;
    state.researchSession = null;
    state.researchPlan = null;
    state.researchAnswer = null;
    state.statsResult = null;
    state.statsParsedQuery = null;
    state.edgeLabScenario = null;
    state.query = "";
    elements.queryInput.value = "";
    persistResearchState({ historyMode: "push" });
    renderAll();
    elements.queryFeedback.textContent = "New research session ready. Enter a question to begin.";
    elements.queryInput.focus();
    return;
  }
  if (event.target.closest("[data-edge-lab-open], [data-edge-lab-add]")) {
    openEdgeLabDialog();
    return;
  }
  if (event.target.closest("[data-edge-lab-discard]")) {
    state.edgeLabScenario = null;
    renderAll();
    elements.queryFeedback.textContent = "Scenario discarded. Original research remains unchanged.";
    return;
  }
  if (event.target.closest("[data-edge-lab-save]")) {
    openWorkspaceSave(currentWorkspaceCandidate()).catch(reportWorkspaceError);
    return;
  }
  if (event.target.closest("[data-edge-lab-share]")) {
    state.workspaceShareSnapshot = edgeLabShareSnapshot(state.edgeLabScenario);
    elements.workspaceSharePreview.textContent = JSON.stringify(state.workspaceShareSnapshot, null, 2);
    elements.workspaceShareDialog.showModal();
    elements.workspaceShareDialog.querySelector("[data-copy-share-snapshot]")?.focus();
    return;
  }
  const edgeLabExport = event.target.closest("[data-edge-lab-export]");
  if (edgeLabExport) {
    const csv = edgeLabExport.dataset.edgeLabExport === "csv";
    downloadResearchText(
      csv ? edgeLabToCsv(state.edgeLabScenario) : edgeLabToMarkdown(state.edgeLabScenario),
      `edgeboard-edge-lab-${state.edgeLabScenario.id}.${csv ? "csv" : "md"}`,
      csv ? "text/csv;charset=utf-8" : "text/markdown;charset=utf-8",
    );
    elements.queryFeedback.textContent = `Edge Lab scenario exported as ${csv ? "CSV" : "Markdown"}.`;
    return;
  }
  if (event.target.closest("[data-session-save]")) {
    openWorkspaceSave(currentWorkspaceCandidate()).catch(reportWorkspaceError);
    return;
  }
  if (event.target.closest("[data-session-refresh]")) {
    if (!state.researchSession?.question) return;
    state.researchSessionRefreshRequested = true;
    elements.queryInput.value = state.researchSession.question;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#queryForm").requestSubmit();
    return;
  }
  if (event.target.closest("[data-session-share]")) {
    state.workspaceShareSnapshot = researchSessionShareSnapshot(state.researchSession);
    elements.workspaceSharePreview.textContent = JSON.stringify(state.workspaceShareSnapshot, null, 2);
    elements.workspaceShareDialog.showModal();
    elements.workspaceShareDialog.querySelector("[data-copy-share-snapshot]")?.focus();
    return;
  }
  const sessionExport = event.target.closest("[data-session-export]");
  if (sessionExport) {
    const csv = sessionExport.dataset.sessionExport === "csv";
    downloadResearchText(
      csv ? researchSessionToCsv(state.researchSession) : researchSessionToMarkdown(state.researchSession),
      `edgeboard-research-session-${state.researchSession.id}.${csv ? "csv" : "md"}`,
      csv ? "text/csv;charset=utf-8" : "text/markdown;charset=utf-8",
    );
    elements.queryFeedback.textContent = `Research session exported as ${csv ? "CSV" : "Markdown"}.`;
    return;
  }
  if (event.target.closest("[data-session-note]")) {
    openWorkspaceEdit("session-note", state.researchSession?.id || "", "Session note", "");
    return;
  }
  if (event.target.closest("[data-open-edge-trust]")) {
    openEdgeTrustDetails(trustForResearchAnswer(state.researchAnswer));
    return;
  }
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

function handleHomeDiscoveryQuery(event) {
  const action = event.target.closest("[data-home-query]");
  if (!action) return;
  const story = action.dataset.researchStory ? storyEngine.getStory(action.dataset.researchStory) : null;
  const discoveryItem = action.dataset.discoveryResearch ? discoveryService.getItem(action.dataset.discoveryResearch) : null;
  const storyContext = story ? Object.freeze({
    storyId: story.id,
    headline: storyEngine.phraseStory(story).headline,
    entityIds: story.entityIds,
    sportId: story.sportId,
    leagueId: story.leagueId,
    eventIds: story.eventIds,
    claimData: story.claimData,
    supportingEvidence: story.supportingEvidence,
    dateRange: story.scope.dateRange,
    sourceIds: story.sources.map((source) => source.id),
    sources: story.sources,
    freshness: story.freshness,
    warnings: story.warnings,
    validationStatus: story.validationStatus,
    researchQuality: story.researchQuality,
  }) : null;
  const discoveryContext = discoveryItem ? Object.freeze({
    itemId: discoveryItem.id,
    type: discoveryItem.type,
    title: discoveryItem.title,
    entityIds: discoveryItem.entityIds,
    eventIds: discoveryItem.eventIds,
    storyIds: discoveryItem.storyIds,
    statIds: discoveryItem.statIds,
    marketIds: discoveryItem.marketIds,
    sportId: discoveryItem.sportId,
    leagueId: discoveryItem.leagueId,
    queryTemplate: discoveryItem.queryTemplate,
    sourceSignals: discoveryItem.sourceSignals,
    sources: discoveryItem.sources,
    freshness: discoveryItem.freshness,
    validationStatus: discoveryItem.validationStatus,
    edgeTrust: discoveryItem.edgeTrust,
    researchQuality: discoveryItem.researchQuality,
    warnings: discoveryItem.warnings,
  }) : null;
  elements.queryInput.value = action.dataset.homeQuery;
  elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
  state.storyResearchContext = storyContext;
  state.discoveryResearchContext = discoveryContext;
  document.querySelector("#queryForm").requestSubmit();
}

[elements.homeCommandCenter, elements.todayPulse, elements.insightDiscovery, elements.homeDiscoverySections, elements.discoveryExplorer]
  .forEach((container) => container.addEventListener("click", handleHomeDiscoveryQuery));

document.addEventListener("click", async (event) => {
  const marketLink = event.target.closest("[data-open-market]");
  if (marketLink) {
    event.preventDefault();
    const model = marketResearchService.getBySelection(marketLink.dataset.openMarket, marketLink.dataset.marketLeague || "");
    setMarketResearchRoute(model ? { type: "detail", leagueId: model.leagueId, marketId: model.marketId, selectionId: model.selectionId } : { type: "detail", leagueId: marketLink.dataset.marketLeague || "", marketId: "market", selectionId: marketLink.dataset.openMarket });
    return;
  }
  const marketQuery = event.target.closest("[data-market-query]");
  if (marketQuery) {
    const marketCard = marketQuery.closest(".market-intelligence-card, [data-screener-result]");
    const selectionId = state.marketResearchModel?.selectionId
      || marketCard?.querySelector("[data-open-market]")?.dataset.openMarket || "";
    const leagueId = state.marketResearchModel?.leagueId
      || marketCard?.querySelector("[data-open-market]")?.dataset.marketLeague || "";
    const contextModel = state.marketResearchModel || marketResearchService.getBySelection(selectionId, leagueId);
    setMarketResearchRoute(null, { replace: true, focus: false });
    elements.queryInput.value = marketQuery.dataset.marketQuery;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    state.marketResearchContext = marketResearchContextFor(contextModel, marketQuery.dataset.marketIntent || "explain_market");
    document.querySelector("#queryForm").requestSubmit();
    document.querySelector("#researchWorkspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const graphQuery = event.target.closest("[data-graph-query]");
  if (graphQuery) {
    if (elements.insightDialog.open) elements.insightDialog.close();
    if (state.workspaceActive) closeWorkspace({ updateUrl: false });
    if (state.historyActive) setHistoricalRoute(null, { replace: true, focus: false });
    if (state.visualRequest) closeVisualAnalytics({ useHistory: false });
    if (state.profileAthleteId) closeAthleteProfile({ useHistory: false });
    if (state.entityProfileId) closeEntityProfile({ useHistory: false });
    if (state.discoveryRoute) setDiscoveryRoute(null, { replace: true, focus: false });
    elements.queryInput.value = graphQuery.dataset.graphQuery;
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    state.graphResearchEntityId = graphQuery.closest("[data-knowledge-graph]")?.dataset.knowledgeGraph || "";
    document.querySelector("#queryForm").requestSubmit();
    document.querySelector("#researchWorkspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const graphWorkspace = event.target.closest("[data-graph-workspace]");
  if (graphWorkspace) {
    const entity = entityRegistry.getEntity(graphWorkspace.dataset.graphWorkspace);
    if (!entity) return;
    const graph = knowledgeGraphService.getEntityGraph(entity.id, { mode: state.researchMode, currentDate: new Date() });
    const base = currentWorkspaceCandidate();
    await openWorkspaceSave({
      ...base,
      type: "saved_entity",
      boardId: "board-stats-trends",
      title: `${entity.displayName} connected research graph`,
      description: "Saved deterministic EdgeBoard knowledge graph snapshot",
      canonicalReferences: { ...base.canonicalReferences, entityIds: [entity.id] },
      researchSnapshot: safeSnapshot({
        schemaVersion: graph.schemaVersion,
        center: graph.center,
        nodes: graph.nodes,
        edges: graph.edges,
        source: graph.source,
        warnings: graph.warnings,
        savedAt: new Date().toISOString(),
      }),
    });
    return;
  }
  const shareAnniversary = event.target.closest("[data-share-anniversary]");
  if (shareAnniversary) {
    await loadHistoricalModules();
    const item = anniversaryService.getAnniversary(shareAnniversary.dataset.shareAnniversary, { mode: state.researchMode });
    const snapshot = anniversaryService.shareSnapshot(item);
    const localStatus = shareAnniversary.closest("[data-home-card]")?.querySelector("[role=status]") || elements.historicalActionStatus;
    try {
      await writeClipboardWithTimeout(JSON.stringify(snapshot, null, 2));
      localStatus.textContent = "Read-only anniversary snapshot copied with source, coverage, and sample disclosure.";
    } catch (error) {
      localStatus.textContent = error?.message || "Copy is unavailable.";
    }
    return;
  }
  const historyLink = event.target.closest("[data-history-route]");
  if (historyLink && !historyLink.closest("#historicalExplorer")) {
    event.preventDefault();
    await setHistoricalRoute(parseHistoricalRoute(new URL(historyLink.href, window.location.origin)));
    if (historyLink.hash === "#anniversaryTimeline") {
      const timeline = document.querySelector("#anniversaryTimeline");
      timeline?.scrollIntoView({ behavior: "smooth", block: "start" });
      timeline?.setAttribute("tabindex", "-1");
      timeline?.focus({ preventScroll: true });
    }
    return;
  }
  const routeLink = event.target.closest("[data-discovery-route]");
  if (routeLink) {
    event.preventDefault();
    const href = routeLink.dataset.discoveryRoute;
    const parsed = parseDiscoveryRoute(new URL(href, window.location.origin).searchParams);
    if (parsed?.leagueId && sportsRepository.getLeague(parsed.leagueId)) {
      activateNavigationSelection({ type: "league", id: parsed.leagueId }, { closeMenu: true, restoreFocus: false, resetResearch: false });
    } else if (parsed?.sportId) {
      activateNavigationSelection({ type: "sport", id: parsed.sportId }, { closeMenu: true, restoreFocus: false, resetResearch: false });
    }
    setDiscoveryRoute({ href });
    recordWorkspaceActivity("opened", "discovery", parsed?.id || href, routeLink.textContent.trim());
    return;
  }
  const category = event.target.closest("[data-explore-category]");
  if (category) {
    state.discoveryCategory = category.dataset.exploreCategory;
    renderDiscoveryExplorer();
    elements.discoveryExplorerSummary.textContent = `${category.textContent.trim()} selected. Results remain scoped to ${getSelectionSummary(state.navigationSelection).contextLabel}.`;
  }
});

elements.closeDiscoveryExplorer.addEventListener("click", () => {
  setDiscoveryRoute(null, { focus: false });
  document.querySelector("[data-discovery-route]")?.focus({ preventScroll: true });
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
  const viewStory = event.target.closest("[data-view-story]");
  if (viewStory) {
    const story = storyEngine.getStory(viewStory.dataset.viewStory);
    if (story) {
      insightReturnFocus = viewStory;
      renderStoryDetail(story);
    }
    return;
  }
  const saveStory = event.target.closest("[data-save-story]");
  if (saveStory) {
    const story = storyEngine.getStory(saveStory.dataset.saveStory);
    if (story) openWorkspaceSave(storyWorkspaceCandidate(story)).catch(reportWorkspaceError);
    return;
  }
  const shareStory = event.target.closest("[data-share-story]");
  if (shareStory) {
    const story = storyEngine.getStory(shareStory.dataset.shareStory);
    if (!story) return;
    const status = shareStory.closest("[data-story-detail], [data-home-card]")?.querySelector("[role=status]");
    navigator.clipboard.writeText(storyShareUrl(story)).then(() => {
      if (status) status.textContent = "Read-only story link copied.";
    }).catch((error) => {
      if (status) status.textContent = `Copy unavailable: ${error?.message || "permission denied"}`;
    });
    return;
  }
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
    if (state.marketResearchActive) { state.marketResearchActive = false; state.marketResearchRoute = null; applyMarketResearchVisibility(); }
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
    if (state.marketResearchActive) { state.marketResearchActive = false; state.marketResearchRoute = null; applyMarketResearchVisibility(); }
    state.athleteSearchResults = [];
    state.athleteSearchIndex = -1;
    renderAthleteSearchResults();
    openAthleteProfile(athleteLinkTarget.dataset.openAthlete);
    return;
  }
  const entityLinkTarget = event.target.closest("[data-open-entity]");
  if (entityLinkTarget) {
    event.preventDefault();
    if (state.marketResearchActive) { state.marketResearchActive = false; state.marketResearchRoute = null; applyMarketResearchVisibility(); }
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
  const status = elements.visualAnalyticsContent.querySelector(".visual-action-status");
  if (!state.visualRequest || !state.visualResult) {
    if (event.target.closest("[data-copy-visual-summary], [data-copy-visual-data], [data-copy-visual-link], [data-download-visual-csv]") && status) {
      status.textContent = "Action unavailable while the visualization is refreshing.";
    }
    return;
  }
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
      if (status) status.textContent = "Copying accessible summary…";
      await writeClipboardWithTimeout(state.visualResult.accessibleSummary);
      if (status) status.textContent = "Accessible summary copied.";
    } else if (event.target.closest("[data-copy-visual-data]")) {
      if (status) status.textContent = "Copying visible data…";
      await writeClipboardWithTimeout(visualizationServiceModule.visualizationTableToTsv(state.visualResult));
      if (status) status.textContent = "Visible data copied as TSV.";
    } else if (event.target.closest("[data-copy-visual-link]")) {
      if (status) status.textContent = "Copying visualization link…";
      await writeClipboardWithTimeout(window.location.href);
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
  const activeId = state.activeStoryId || state.activeInsightId;
  const fallback = state.activeStoryId
    ? document.querySelector(`[data-view-story="${CSS.escape(activeId)}"]`)
    : document.querySelector(`[data-view-insight="${CSS.escape(activeId)}"]`);
  const returnTarget = insightReturnFocus?.isConnected ? insightReturnFocus : fallback;
  elements.insightDialog.close();
  if (state.activeStoryId) setStoryUrl("", { replace: true });
  returnTarget?.focus({ preventScroll: true });
});
elements.insightDialog.addEventListener("close", () => {
  const activeId = state.activeStoryId || state.activeInsightId;
  const returnSelector = state.activeStoryId
    ? `[data-view-story="${CSS.escape(activeId)}"]`
    : `[data-view-insight="${CSS.escape(activeId)}"]`;
  const fallback = document.querySelector(returnSelector);
  const returnTarget = insightReturnFocus?.isConnected ? insightReturnFocus : fallback;
  if (state.activeStoryId && new URLSearchParams(window.location.search).has("story")) setStoryUrl("", { replace: true });
  insightReturnFocus = null;
  state.activeInsightId = "";
  state.activeStoryId = "";
  state.sharedStoryId = "";
  state.sharedStoryOpened = false;
  window.setTimeout(() => {
    const currentTarget = returnTarget?.isConnected ? returnTarget : document.querySelector(returnSelector);
    currentTarget?.focus({ preventScroll: true });
  }, 0);
});
elements.insightDialog.addEventListener("click", (event) => {
  if (event.target.closest("[data-focus-story-evidence]")) {
    elements.insightDialogContent.querySelector("[data-story-evidence-panel]")?.focus();
    return;
  }
  if (event.target.closest("[data-home-query]")) {
    event.stopPropagation();
    handleHomeDiscoveryQuery(event);
    elements.insightDialog.close();
    return;
  }
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
    if (action === "session-note") {
      state.researchSession = addResearchSessionNote(state.researchSession, description || title);
      renderResearchMode();
      elements.queryFeedback.textContent = "Private note added to the active Research Session. Save the session to retain it in Workspace.";
    }
    else if (action === "create-board") await workspaceRepository.createBoard({ workspaceId: vm.workspace.id, title, description });
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
  if (item.researchSnapshot?.schemaVersion === 1 && item.researchSnapshot?.id?.startsWith("research-session-")) {
    state.researchSession = item.researchSnapshot;
  }
  if (item.type === "saved_scenario" && item.researchSnapshot?.type === "edge_lab_scenario") {
    state.edgeLabScenario = item.researchSnapshot;
    state.researchSession = item.researchSnapshot.originalData;
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
    if (item?.researchSnapshot?.id?.startsWith("research-session-")) {
      state.researchSession = item.researchSnapshot;
      state.researchSessionRefreshRequested = true;
      await restoreSavedResearch(item.id);
      elements.queryFeedback.textContent = "Research session resumed and refreshed. Save it to append the new revision while retaining the original snapshot.";
      return;
    }
    if (item?.type === "saved_story") {
      const storyId = item.canonicalReferences?.storyIds?.[0] || item.researchSnapshot?.refreshConfiguration?.storyId;
      const leagueId = item.sourceState?.leagueId || item.researchSnapshot?.refreshConfiguration?.leagueId;
      const sportId = item.sourceState?.sportId || item.researchSnapshot?.refreshConfiguration?.sportId;
      const refreshed = storyEngine.refreshStory(storyId, {
        leagueIds: leagueId ? [leagueId] : [],
        sportIds: sportId ? [sportId] : [],
      }, {
        mode: item.sourceState?.mode || state.researchMode,
        now: new Date(),
        visibleLeagues: leagueId ? [sportsRepository.getLeague(leagueId)].filter(Boolean) : navigationModel.allLeagues,
      });
      if (!refreshed.current) {
        elements.workspaceStatus.textContent = "The story no longer has an eligible deterministic candidate. The saved snapshot was not changed.";
        return;
      }
      const nextSnapshot = {
        ...storyWorkspaceCandidate(refreshed.current).researchSnapshot,
        refreshedAt: new Date().toISOString(),
        refreshedFromStoryId: refreshed.previous?.id || storyId,
      };
      await workspaceRepository.refreshSavedResearchObject(item.id, nextSnapshot);
      elements.workspaceStatus.textContent = refreshed.changed
        ? "Story refreshed from recalculated evidence; the original snapshot remains in history."
        : "Story evidence was rechecked with no claim change; the original snapshot remains in history.";
      return loadWorkspace();
    }
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
    personalizedDiscoveryEnabled: data.has("personalizedDiscoveryEnabled"),
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

document.addEventListener("click", (event) => {
  const aboutLink = event.target.closest("[data-about-route]");
  if (aboutLink) {
    event.preventDefault();
    setAboutRoute(true);
    return;
  }
  const closeAbout = event.target.closest("[data-close-about]");
  if (closeAbout) {
    event.preventDefault();
    setAboutRoute(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (event.target.closest("[data-about-research]")) {
    setAboutRoute(false, { focus: false });
    elements.queryInput.focus({ preventScroll: true });
    elements.queryInput.select();
    return;
  }
  if (event.target.closest("[data-open-coverage]")) {
    openCoverageView().catch((error) => {
      elements.coverageContent.setAttribute("aria-busy", "false");
      elements.coverageContent.innerHTML = `<div class="data-warning" role="alert"><strong>Coverage details are unavailable</strong><p>${escapeHtml(error?.message || "Try again or review the coverage documentation.")}</p></div>`;
    });
  }
});

window.addEventListener("popstate", () => {
  state.aboutActive = window.location.pathname.replace(/\/+$/, "") === "/about";
  applyAboutVisibility({ focus: state.aboutActive });
  if (state.aboutActive) return;
  const marketRoute = parseMarketRoute();
  state.marketResearchRoute = marketRoute;
  state.marketResearchActive = Boolean(marketRoute);
  if (marketRoute?.leagueId && sportsRepository.getLeague(marketRoute.leagueId)) {
    state.navigationSelection = { type: "league", id: marketRoute.leagueId };
    state.leagueId = marketRoute.leagueId;
  }
  if (marketRoute) {
    state.historyActive = false; state.historyRoute = null; state.workspaceActive = false; state.workspaceRoute = null;
    renderAll(); elements.marketResearchView.focus({ preventScroll: true }); return;
  }
  applyMarketResearchVisibility();
  const historicalRoute = parseHistoricalRoute();
  state.historyRoute = historicalRoute;
  state.historyActive = Boolean(historicalRoute);
  if (historicalRoute?.leagueId && sportsRepository.getLeague(historicalRoute.leagueId)) {
    const league = sportsRepository.getLeague(historicalRoute.leagueId);
    state.navigationSelection = { type: "league", id: league.leagueId };
    state.leagueId = league.leagueId;
  } else if (historicalRoute?.sportId) {
    state.navigationSelection = { type: "sport", id: historicalRoute.sportId };
  }
  if (historicalRoute) {
    renderAll();
    elements.historicalExplorer.focus({ preventScroll: true });
    return;
  }
  applyHistoryVisibility();
  const params = new URLSearchParams(window.location.search);
  const discoveryRoute = parseDiscoveryRoute(params);
  state.discoveryRoute = discoveryRoute;
  if (discoveryRoute?.leagueId && sportsRepository.getLeague(discoveryRoute.leagueId)) {
    state.navigationSelection = { type: "league", id: discoveryRoute.leagueId };
    state.leagueId = discoveryRoute.leagueId;
  } else if (discoveryRoute?.sportId) {
    state.navigationSelection = { type: "sport", id: discoveryRoute.sportId };
    state.leagueId = researchLeagueForSelection(state.navigationSelection, state.leagueId)?.leagueId || state.leagueId;
  }
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
  const storyId = params.get("story") || "";
  if (storyId) {
    state.sharedStoryId = storyId;
    state.sharedStoryOpened = false;
    renderAll();
    return;
  }
  if (state.activeStoryId && elements.insightDialog.open) elements.insightDialog.close();
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
  if (state.marketResearchActive) setMarketResearchRoute(null, { focus: false });
  else if (state.historyActive) setHistoricalRoute(null, { focus: false });
  else if (state.workspaceActive) closeWorkspace();
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

function initializeOnboarding() {
  const forceTestOnboarding = new URLSearchParams(window.location.search).get("testOnboarding") === "1";
  if (!elements.onboarding || (document.referrer.includes("/browser-tests/") && !forceTestOnboarding)) return;
  let completed = false;
  try {
    completed = localStorage.getItem("edgeboard-onboarding-v1.6-complete") === "true"
      || localStorage.getItem("edgeboard-onboarding-v1.1-complete") === "true";
  } catch {
    completed = false;
  }
  if (completed) return;
  elements.onboardingSteps.innerHTML = getOnboardingSteps().map((step) => `<article><strong>${escapeHtml(step.label)}</strong><span>${escapeHtml(step.detail)}</span></article>`).join("");
  elements.onboarding.hidden = false;
}

elements.dismissOnboarding?.addEventListener("click", () => {
  elements.onboarding.hidden = true;
  try {
    localStorage.setItem("edgeboard-onboarding-v1.6-complete", "true");
    localStorage.setItem("edgeboard-onboarding-v1.1-complete", "true");
  } catch {
    elements.queryFeedback.textContent = "The guide is hidden for this visit, but browser storage is unavailable so the preference cannot be saved.";
  }
});

elements.toggleOnboarding?.addEventListener("click", () => {
  const expanded = elements.toggleOnboarding.getAttribute("aria-expanded") === "true";
  elements.toggleOnboarding.setAttribute("aria-expanded", String(!expanded));
  elements.toggleOnboarding.textContent = expanded ? "Show guide" : "Hide guide";
  elements.onboardingSteps.hidden = expanded;
});

elements.openCommandPalette?.addEventListener("click", openCommandPalette);
elements.closeCommandPalette?.addEventListener("click", closeCommandPalette);
elements.commandPalette?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeCommandPalette();
});
elements.commandPaletteInput?.addEventListener("input", scheduleCommandPaletteSearch);
elements.commandPaletteInput?.addEventListener("keydown", (event) => {
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    if (!commandPaletteItems.length) return;
    commandPaletteIndex = (commandPaletteIndex + (event.key === "ArrowDown" ? 1 : -1) + commandPaletteItems.length) % commandPaletteItems.length;
    renderCommandPalette(commandPaletteItems);
    document.querySelector(`#command-palette-option-${commandPaletteIndex}`)?.scrollIntoView({ block: "nearest" });
  } else if (event.key === "Enter" && commandPaletteIndex >= 0) {
    event.preventDefault();
    executeCommandPaletteItem(commandPaletteItems[commandPaletteIndex]);
  }
});
elements.commandPaletteResults?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-command-index]");
  if (option) executeCommandPaletteItem(commandPaletteItems[Number(option.dataset.commandIndex)]);
  const query = event.target.closest("[data-command-query]");
  if (query) executeCommandPaletteItem({ query: query.dataset.commandQuery });
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (elements.commandPalette.open) closeCommandPalette(); else openCommandPalette();
  }
});

initializeOnboarding();
applyAboutVisibility();
persistNavigationSelection();
renderAll();
scheduleMarketBoardLoad();
window.setTimeout(() => {
  loadWorkspaceModules().then(() => renderHomeDiscovery()).catch(() => {});
  loadHistoricalModules().then(() => {
    if (!state.historyActive && !state.workspaceActive) renderHomeDiscovery();
  }).catch(() => {});
}, 0);
if (new URLSearchParams(window.location.search).get("coverage") === "1") {
  window.setTimeout(() => {
    openCoverageView().catch((error) => {
      elements.coverageContent.setAttribute("aria-busy", "false");
      elements.coverageContent.textContent = error?.message || "Unable to load league coverage.";
    });
  }, 0);
}
if (initialWorkspaceRoute && !initialMarketRoute) {
  loadWorkspace({ focusHeading: false });
}
if (!initialWorkspaceRoute && !initialMarketRoute && initialResearchState.profileAthleteId) {
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
if (!initialWorkspaceRoute && !initialMarketRoute && initialResearchState.entityProfileId) {
  loadEntityProfile({ focusHeading: false });
}
if (!initialWorkspaceRoute && !initialMarketRoute && state.visualRequest) {
  loadVisualAnalytics({ focusHeading: false });
}
if (!initialWorkspaceRoute && !initialMarketRoute && initialResearchState.queryText
  && !initialResearchState.visualType
  && !initialResearchState.profileAthleteId
  && !initialResearchState.entityProfileId) {
  window.setTimeout(() => document.querySelector("#queryForm").requestSubmit(), 0);
}
