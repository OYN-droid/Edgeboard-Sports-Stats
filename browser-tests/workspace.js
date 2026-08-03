import { MemoryWorkspaceStorage } from "../src/services/workspace-storage.js";
import {
  buildJournalSummary,
  buildWorkspaceViewModel,
  compareSnapshots,
  createWorkspaceRepository,
  evaluateCondition,
  searchWorkspace,
} from "../src/services/workspace-service.js";

const results = [];
const assert = (condition, label) => {
  if (!condition) throw new Error(label);
  results.push(`PASS ${label}`);
};
let tick = Date.parse("2026-07-30T18:00:00Z");
let random = 0;
const clock = () => ++tick;
const nextRandom = () => (random = (random + 0.137) % 1);

async function run() {
  document.querySelector("#results").textContent = "Opening IndexedDB…";
  const indexedDbRepository = createWorkspaceRepository({
    seedSample: true,
    storageOptions: { databaseName: `edgeboard-workspace-test-${Date.now()}` },
  });
  const indexedState = await indexedDbRepository.initialize();
  const indexedDiagnostics = indexedDbRepository.getDiagnostics();
  assert(indexedState.workspaces.length === 1
    && (indexedDiagnostics.storageStatus === "ready" || indexedDiagnostics.storageError === "storage_timeout"),
  "IndexedDB adapter initializes or returns a bounded unavailable state");

  const storage = new MemoryWorkspaceStorage();
  const repository = createWorkspaceRepository({ storage, clock, random: nextRandom, seedSample: false });
  await repository.initialize();
  assert(repository.getDiagnostics().localOnly, "repository reports local-only storage");
  const workspace = await repository.createWorkspace({ title: "Research Lab" });
  assert(repository.listWorkspaces().some((item) => item.id === workspace.id && item.title === "Research Lab"), "create workspace");
  await repository.updateWorkspace(workspace.id, { title: "Renamed Lab" });
  assert(repository.listWorkspaces().find((item) => item.id === workspace.id).title === "Renamed Lab", "rename workspace");

  const originalBoards = repository.listBoards(workspace.id, { includeArchived: true });
  assert(originalBoards.length === 7 && originalBoards.some((board) => board.title === "Edge Lab"),
    "default boards include Edge Lab");
  const board = await repository.createBoard({ workspaceId: workspace.id, title: "WNBA Lab", tags: ["WNBA"] });
  await repository.updateBoard(board.id, { title: "WNBA Research", isPinned: true });
  assert(repository.listBoards(workspace.id).find((item) => item.id === board.id)?.isPinned, "pin and rename board");
  await repository.reorderBoards(workspace.id, [board.id, ...originalBoards.map((item) => item.id)]);
  assert(repository.listBoards(workspace.id).some((item) => item.sortOrder === 0), "keyboard-compatible board reorder");
  const copy = await repository.duplicateBoard(board.id);
  assert(copy.title.includes("copy"), "duplicate board");

  const savedInput = {
    type: "saved_comparison",
    workspaceId: workspace.id,
    boardId: board.id,
    title: "WNBA guard comparison",
    canonicalReferences: { entityIds: ["athlete-a", "athlete-b"] },
    sourceState: { mode: "stats", sportId: "basketball", leagueId: "wnba", queryText: "compare guards", structuredQuery: { intent: "comparison" } },
    researchSnapshot: { ranking: 1, line: 20.5, confidence: 61, source: "Sample" },
    tags: ["WNBA", "Guard"],
    sample: true,
  };
  const saved = await repository.saveResearchObject(savedInput);
  assert(saved.status === "created", "save comparison");
  assert((await repository.saveResearchObject(savedInput)).status === "duplicate", "detect duplicate saved research");
  const updated = await repository.saveResearchObject({ ...savedInput, title: "Updated title" }, { duplicateStrategy: "update" });
  assert(updated.status === "updated" && updated.item.id === saved.item.id, "update existing duplicate");
  assert(updated.item.snapshots.length === 1, "updating saved research preserves the original snapshot");
  const staleVersion = updated.item.version;
  await repository.updateSavedResearchObject(saved.item.id, { description: "Newer edit" }, staleVersion);
  const conflict = await repository.updateSavedResearchObject(saved.item.id, { description: "Stale edit" }, staleVersion)
    .then(() => null, (error) => error);
  assert(conflict?.code === "version_conflict" && conflict.currentRecord.description === "Newer edit", "stale edit cannot overwrite a newer record");
  const copied = await repository.saveResearchObject(savedInput, { duplicateStrategy: "copy" });
  assert(copied.item.id !== saved.item.id, "save duplicate as another copy");
  const refreshed = await repository.refreshSavedResearchObject(saved.item.id, { ranking: 2, line: 21.5, confidence: 58, source: "Sample v2" });
  assert(refreshed.item.snapshots.length === 2, "refresh preserves original and prior saved snapshots");
  assert(refreshed.comparison.changedFields.includes("ranking"), "refresh compares changed rankings");
  await repository.refreshSavedResearchObject(saved.item.id, { ranking: 2, line: 22, confidence: 57, source: "Sample v3" });
  const thirdRefresh = await repository.refreshSavedResearchObject(saved.item.id, { ranking: 3, line: 22, confidence: 55, source: "Sample v4" });
  assert(thirdRefresh.item.snapshots.length === 4, "saved revision and three refresh snapshots remain available");
  assert(compareSnapshots({ line: 20 }, { line: null }).changes[0].missingRegression, "missing refresh value is a regression");
  await repository.updateSavedResearchObject(saved.item.id, { researchSnapshot: { id: "research-session-test", notes: [{ text: "private" }], evidence: [] } });
  const sharedResearchSession = await repository.createShareSnapshot({ itemId: saved.item.id });
  assert(sharedResearchSession.privateNotesExcluded && !("notes" in sharedResearchSession.researchSnapshot), "shared research session excludes embedded private notes");
  const scenarioSaved = await repository.saveResearchObject({
    ...savedInput,
    type: "saved_scenario",
    boardId: originalBoards.find((item) => item.title === "Edge Lab").id,
    title: "Immutable assists scenario",
    sourceState: { ...savedInput.sourceState, queryText: "scenario assists" },
    researchSnapshot: {
      type: "edge_lab_scenario", id: "edge-lab-test", scenarioDifferences: [{ targetId: "evidence-1", before: 7, after: 8 }],
      originalData: { id: "research-session-test", notes: [{ text: "private baseline note" }] },
      updatedResearch: { notes: [{ text: "private derived note" }] },
    },
  });
  const sharedScenario = await repository.createShareSnapshot({ itemId: scenarioSaved.item.id });
  assert(scenarioSaved.item.type === "saved_scenario"
    && !("notes" in sharedScenario.researchSnapshot.originalData)
    && !("notes" in sharedScenario.researchSnapshot.updatedResearch),
  "saved Edge Lab scenarios use the workspace domain and exclude nested private notes when shared");

  await repository.addNote({ workspaceId: workspace.id, attachmentType: "saved_research", attachmentId: saved.item.id, text: "<script>alert(1)</script>\nplain text" });
  assert(searchWorkspace(repository.snapshot(), "plain text", { workspaceId: workspace.id }).length === 1, "search private notes");
  assert(searchWorkspace(repository.snapshot(), "guard", { workspaceId: workspace.id }).length >= 1, "search titles and tags");

  const watchlist = await repository.createWatchlist({ workspaceId: workspace.id, title: "Following" });
  await repository.createWatchlist({ workspaceId: workspace.id, title: "Events" });
  await repository.createWatchlist({ workspaceId: workspace.id, title: "Markets" });
  assert(repository.listWatchlists(workspace.id).length === 3, "multiple watchlists");
  const watched = await repository.addWatchlistItem({ watchlistId: watchlist.id, targetType: "athlete", targetId: "athlete-a", label: "Athlete A" });
  assert(watched.status === "created", "add canonical athlete to watchlist");
  assert((await repository.addWatchlistItem({ watchlistId: watchlist.id, targetType: "athlete", targetId: "athlete-a" })).status === "duplicate", "prevent duplicate watch target");
  await repository.updateWatchlistItem(watched.item.id, { isPaused: true });
  assert(repository.listWatchlists(workspace.id).find((item) => item.id === watchlist.id).items[0].isPaused, "pause watch item");

  const alert = await repository.createAlertRule({
    workspaceId: workspace.id,
    name: "Line moved",
    category: "markets",
    target: { type: "market", id: "market-a" },
    condition: { metric: "line", operator: "changed_by_at_least", value: 1 },
    lastKnownValue: 20.5,
    sample: true,
  });
  const additionalAlerts = await Promise.all([
    repository.createAlertRule({ workspaceId: workspace.id, name: "Milestone", category: "stats", target: { type: "milestone", id: "milestone-a" }, condition: { metric: "total", operator: "greater_than_or_equal", value: 10 } }),
    repository.createAlertRule({ workspaceId: workspace.id, name: "Event soon", category: "events", target: { type: "event", id: "event-a" }, condition: { metric: "startsAt", operator: "starts_within_minutes", value: 60 } }),
    repository.createAlertRule({ workspaceId: workspace.id, name: "Odds crossed", category: "markets", target: { type: "market", id: "market-b" }, condition: { metric: "odds", operator: "less_than_or_equal", value: -120 } }),
    repository.createAlertRule({ workspaceId: workspace.id, name: "Freshness", category: "system", target: { type: "provider", id: "provider-a" }, condition: { metric: "freshness", operator: "became_stale", value: null } }),
    repository.createAlertRule({ workspaceId: workspace.id, name: "Market available", category: "insights", target: { type: "market", id: "market-c" }, condition: { metric: "status", operator: "became_available", value: null } }),
  ]);
  assert(additionalAlerts.length === 5 && repository.listAlertRules({ workspaceId: workspace.id }).length === 6, "six provider-agnostic alert types");
  const staleEvents = await repository.evaluateAlerts({ [alert.id]: { value: 22, freshness: "stale", sample: true } });
  assert(staleEvents.length === 0, "stale data does not trigger non-staleness alert");
  const events = await repository.evaluateAlerts({ [alert.id]: { value: 22, freshness: "fresh", source: "Sample", sample: true } });
  assert(events.length === 1, "trigger local in-app alert");
  assert((await repository.evaluateAlerts({ [alert.id]: { value: 22, freshness: "fresh", sample: true } })).length === 0, "suppress duplicate alert");
  const freshnessAlert = additionalAlerts[3];
  await repository.evaluateAlerts({ [freshnessAlert.id]: { freshness: "fresh", source: "Sample" } });
  const freshnessEvents = await repository.evaluateAlerts({ [freshnessAlert.id]: { freshness: "stale", source: "Sample" } });
  assert(freshnessEvents[0]?.oldValue === "fresh" && freshnessEvents[0]?.newValue === "stale", "freshness alert explains the actual state transition");
  await repository.markAllAlertsRead(workspace.id);
  assert(repository.listAlertEvents({ workspaceId: workspace.id, unread: true }).length === 0, "mark all alerts read");
  assert(evaluateCondition({ operator: "became_available" }, "unavailable", { status: "available" }), "availability alert operator");

  const idea = await repository.createTrackedIdea({
    workspaceId: workspace.id,
    title: "Assists research",
    thesis: "Role and matchup align.",
    counterpoints: ["Small recent sample.", "Role could change."],
    legs: [{ selectionId: "selection-a", canonicalMarketId: "basketball-assists", line: 7.5, odds: -110, sportsbook: "Sample Book", sourceUpdatedAt: "2026-07-30T17:00:00Z" }],
    sample: true,
  });
  await Promise.all(["Fighter research", "Driver matchup", "Team total", "Soccer shots"].map((title) =>
    repository.createTrackedIdea({ workspaceId: workspace.id, title, status: "researching", legs: [], resultStatus: "not_tracked" })));
  assert(repository.snapshot().trackedIdeas.filter((item) => item.workspaceId === workspace.id).length === 5, "five tracked research ideas");
  assert(idea.legs[0].savedLine === 7.5 && idea.legs[0].currentLine === null, "saved and current market values remain separate");
  assert(idea.counterpoints.length === 2, "tracked idea preserves thesis counterpoints");
  await repository.updateTrackedIdea(idea.id, { resultStatus: "won", status: "closed" });
  const journal = buildJournalSummary(repository.snapshot().trackedIdeas);
  assert(journal.resolved === 1 && journal.smallSample, "journal warns on small tracked sample");

  await repository.updatePreferences(workspace.id, { preferredResearchMode: "stats", preferredConfidenceThreshold: 42, reduceMotion: true, privacyMode: true });
  await repository.appendActivity({ workspaceId: workspace.id, action: "ran_query", targetType: "query", targetId: "q1", label: "Query", queryText: "private query" });
  assert(repository.getActivity(workspace.id)[0].queryText === "", "privacy mode excludes typed query text");
  await repository.updateDashboardLayout(workspace.id, { preset: "combat" });
  assert(buildWorkspaceViewModel(repository.snapshot(), workspace.id, { view: "home" }).dashboard.preset === "combat", "dashboard preset persists");

  const exported = await repository.exportWorkspace(workspace.id);
  const exportedText = JSON.stringify(exported);
  assert(!exportedText.includes("private query") && exported.activity.length === 0, "export excludes activity and private query text");
  assert(!/(api[_-]?key|auth[_-]?token|password)/i.test(exportedText), "export contains no credential fields");
  const preview = repository.previewImport(exported);
  assert(preview.valid && preview.counts.savedObjects >= 2, "validate and preview versioned import");
  const imported = await repository.importWorkspace(exported, "merge");
  assert(Array.isArray(imported.skipped), "merge import reports skipped records");
  assert(repository.snapshot().preferences.filter((item) => item.workspaceId === workspace.id).length === 1, "merge import does not duplicate preference records without IDs");
  assert(repository.snapshot().dashboardLayouts.filter((item) => item.workspaceId === workspace.id).length === 1, "merge import does not duplicate dashboard layouts without IDs");
  const replaceOnlyWatchlist = await repository.createWatchlist({ workspaceId: workspace.id, title: "Replace me" });
  const replaceOnlyItem = await repository.addWatchlistItem({ watchlistId: replaceOnlyWatchlist.id, targetType: "team", targetId: "team-replace", label: "Replace team" });
  await repository.importWorkspace(exported, "replace");
  assert(!repository.snapshot().watchlistItems.some((item) => item.id === replaceOnlyItem.item.id), "replace import removes child records owned through a replaced watchlist");
  await repository.importWorkspace(exported, "duplicate");
  assert(repository.listWorkspaces().some((item) => item.id === workspace.id), "duplicate import does not rewrite original workspace references");
  assert(!repository.previewImport('{"schemaVersion":"bad"}').valid, "reject malformed import");
  assert(!repository.previewImport({ schemaVersion: 1, workspaces: [] }).valid, "reject incomplete current-schema records instead of silently discarding collections");
  assert(!repository.previewImport({ ...exported, watchlists: {} }).valid, "reject corrupted collection types");

  const secondRepository = createWorkspaceRepository({ storage, clock, random: nextRandom, seedSample: false });
  await secondRepository.initialize();
  await repository.updateWorkspace(workspace.id, { description: "Cross-tab update" });
  assert(secondRepository.getDiagnostics().externalUpdateAvailable, "cross-tab update detected");
  const staleCrossTabWrite = await secondRepository.updateWorkspace(workspace.id, { description: "Stale overwrite" })
    .then(() => null, (error) => error);
  assert(staleCrossTabWrite?.code === "version_conflict", "known-stale tab cannot overwrite a newer cross-tab edit");
  await secondRepository.reloadFromStorage();
  assert(secondRepository.listWorkspaces().find((item) => item.id === workspace.id).description === "Cross-tab update", "load newer cross-tab state");

  const nonEmptyDelete = repository.deleteWorkspace(workspace.id).then(() => false, (error) => error.code === "confirmation_required");
  assert(await nonEmptyDelete, "non-empty workspace deletion requires confirmation");
  const unavailable = createWorkspaceRepository({ storage: new MemoryWorkspaceStorage(null, { available: false }), seedSample: false });
  await unavailable.initialize();
  assert(unavailable.getDiagnostics().storageStatus === "unavailable", "storage unavailable state");
  const quotaRepository = createWorkspaceRepository({ storage: new MemoryWorkspaceStorage(null, { quotaBytes: 8 }), seedSample: false });
  await quotaRepository.initialize();
  assert(quotaRepository.getDiagnostics().storageStatus === "unavailable", "quota error is exposed");

  document.querySelector("#results").textContent = `${results.join("\n")}\n\n${results.length} assertions passed`;
  document.body.dataset.status = "passed";
}

run().catch((error) => {
  document.querySelector("#results").textContent = `FAIL ${error.stack || error.message}`;
  document.body.dataset.status = "failed";
  throw error;
});
