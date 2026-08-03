import {
  ALERT_CATEGORIES,
  ALERT_OPERATORS,
  DASHBOARD_MODULES,
  DASHBOARD_PRESETS,
  DEFAULT_BOARD_TEMPLATES,
  DEFAULT_PREFERENCES,
  SAVED_OBJECT_TYPES,
  TRACKED_IDEA_STATUSES,
  TRACKED_RESULT_STATUSES,
  WATCH_TARGET_TYPES,
  WORKSPACE_SCHEMA_VERSION,
  WORKSPACE_SYNC_STATUS,
  createLocalId,
  normalizeTag,
} from "../config/workspace-config.js";
import { createSampleWorkspaceFixture } from "../data/mock-workspace-provider.js";
import { createWorkspaceStorage, WorkspaceStorageError } from "./workspace-storage.js";

const COLLECTIONS = Object.freeze([
  "workspaces", "boards", "savedObjects", "watchlists", "watchlistItems",
  "alertRules", "alertEvents", "trackedIdeas", "notes", "tags", "activity",
  "preferences", "dashboardLayouts", "sharedSnapshots",
]);
const clone = (value) => structuredClone(value);
const isoNow = (clock) => new Date(clock()).toISOString();
const cleanText = (value, maximum = 5000) => String(value ?? "").replace(/\0/g, "").slice(0, maximum);
const unique = (values) => [...new Set((values || []).filter(Boolean))];
const allowed = (value, values, fallback) => values.includes(value) ? value : fallback;

function emptyState() {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    exportedAt: null,
    sample: false,
    workspaces: [],
    boards: [],
    savedObjects: [],
    watchlists: [],
    watchlistItems: [],
    alertRules: [],
    alertEvents: [],
    trackedIdeas: [],
    notes: [],
    tags: [],
    activity: [],
    preferences: [],
    dashboardLayouts: [],
    sharedSnapshots: [],
    meta: { lastBackupAt: null, activityPaused: false, privacyMode: false, lastWriteAt: null },
  };
}

function createDefaultWorkspaceState() {
  const state = createSampleWorkspaceFixture();
  state.sample = false;
  state.workspaces = state.workspaces.map((workspace) => ({
    ...workspace,
    description: "Local personal workspace",
    sample: false,
  }));
  state.boards = state.boards.map((board) => ({ ...board, sample: false }));
  ["savedObjects", "watchlists", "watchlistItems", "alertRules", "alertEvents", "trackedIdeas", "notes", "tags", "activity", "sharedSnapshots"]
    .forEach((collection) => { state[collection] = []; });
  return state;
}

export function validateWorkspaceState(input) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["Workspace payload must be an object."], warnings, value: null };
  }
  if (!Number.isInteger(Number(input.schemaVersion))) errors.push("Workspace schema version is missing.");
  COLLECTIONS.forEach((collection) => {
    if (!Array.isArray(input[collection])) errors.push(`${collection} must be an array.`);
    else input[collection].forEach((record, index) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        errors.push(`${collection} record ${index + 1} must be an object.`);
      } else if (!["preferences", "dashboardLayouts"].includes(collection) && !record.id) {
        errors.push(`${collection} record ${index + 1} is missing an ID.`);
      } else if (["preferences", "dashboardLayouts"].includes(collection) && !record.workspaceId) {
        errors.push(`${collection} record ${index + 1} is missing a workspace ID.`);
      }
    });
  });
  if (Array.isArray(input.workspaces)) {
    input.workspaces.forEach((workspace, index) => {
      if (!workspace?.id || !workspace?.title) errors.push(`Workspace ${index + 1} is missing an ID or title.`);
    });
  }
  const ids = new Map();
  COLLECTIONS.forEach((collection) => {
    (input[collection] || []).forEach((record) => {
      const identity = record?.id || (
        ["preferences", "dashboardLayouts"].includes(collection)
          ? record?.workspaceId
          : null
      );
      if (!identity) return;
      const key = `${collection}:${identity}`;
      if (ids.has(key)) errors.push(`Duplicate ${collection} identity: ${identity}.`);
      ids.set(key, true);
    });
  });
  if ((input.schemaVersion || 0) > WORKSPACE_SCHEMA_VERSION) {
    errors.push(`Workspace schema ${input.schemaVersion} is newer than supported schema ${WORKSPACE_SCHEMA_VERSION}.`);
  }
  if ((input.schemaVersion || 0) < WORKSPACE_SCHEMA_VERSION) warnings.push("Workspace payload requires migration.");
  return { valid: errors.length === 0, errors, warnings, value: errors.length ? null : input };
}

export function migrateWorkspaceSchema(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new WorkspaceStorageError("invalid_schema", "Workspace payload must be an object.");
  }
  if (input?.schemaVersion !== undefined && !Number.isInteger(Number(input.schemaVersion))) {
    throw new WorkspaceStorageError("invalid_schema", "Workspace schema version must be an integer.");
  }
  const sourceVersion = Number(input?.schemaVersion || 0);
  if (sourceVersion > WORKSPACE_SCHEMA_VERSION) {
    throw new WorkspaceStorageError("unsupported_schema", `Schema ${sourceVersion} is not supported.`);
  }
  COLLECTIONS.forEach((collection) => {
    if (input[collection] !== undefined && !Array.isArray(input[collection])) {
      throw new WorkspaceStorageError("corrupted_record", `${collection} must be an array.`);
    }
    if (sourceVersion === WORKSPACE_SCHEMA_VERSION && input[collection] === undefined) {
      throw new WorkspaceStorageError("corrupted_record", `${collection} is missing from the current workspace schema.`);
    }
  });
  if (input.meta !== undefined && (!input.meta || typeof input.meta !== "object" || Array.isArray(input.meta))) {
    throw new WorkspaceStorageError("corrupted_record", "Workspace metadata must be an object.");
  }
  const migrated = { ...emptyState(), ...(input || {}) };
  COLLECTIONS.forEach((collection) => {
    migrated[collection] = Array.isArray(input?.[collection]) ? clone(input[collection]) : [];
  });
  migrated.schemaVersion = WORKSPACE_SCHEMA_VERSION;
  migrated.meta = { ...emptyState().meta, ...(input?.meta || {}) };
  if (sourceVersion === 0 && Array.isArray(input?.savedItems)) {
    migrated.savedObjects.push(...input.savedItems.map((item) => ({
      ...item,
      type: SAVED_OBJECT_TYPES.includes(item.type) ? item.type : "saved_research",
      syncStatus: WORKSPACE_SYNC_STATUS,
      version: Number(item.version) || 1,
    })));
  }
  return migrated;
}

function normalizeState(input) {
  const migrated = migrateWorkspaceSchema(input);
  const validation = validateWorkspaceState(migrated);
  if (!validation.valid) throw new WorkspaceStorageError("corrupted_record", validation.errors.join(" "));
  return migrated;
}

function baseRecord(input, prefix, now, random) {
  const timestamp = isoNow(now);
  return {
    ...input,
    id: cleanText(input.id || createLocalId(prefix, now(), random()), 160),
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
    version: Number(input.version) || 1,
  };
}

function normalizedReferences(input = {}) {
  return {
    entityIds: unique(input.entityIds),
    eventIds: unique(input.eventIds),
    marketIds: unique(input.marketIds),
    insightIds: unique(input.insightIds),
    storyIds: unique(input.storyIds),
    queryId: input.queryId || null,
    visualizationId: input.visualizationId || null,
  };
}

function normalizeSavedObject(input, now, random) {
  const record = baseRecord(input, "saved", now, random);
  return {
    ...record,
    workspaceId: cleanText(input.workspaceId, 160),
    boardId: cleanText(input.boardId, 160),
    title: cleanText(input.title || "Untitled saved research", 240),
    description: cleanText(input.description, 2000),
    canonicalReferences: normalizedReferences(input.canonicalReferences),
    researchSnapshot: clone(input.researchSnapshot || {}),
    sourceState: {
      mode: allowed(input.sourceState?.mode, ["stats", "betting", "both"], "stats"),
      sportId: cleanText(input.sourceState?.sportId, 100),
      leagueId: cleanText(input.sourceState?.leagueId, 100),
      queryText: cleanText(input.sourceState?.queryText, 2000),
      structuredQuery: clone(input.sourceState?.structuredQuery || {}),
    },
    tags: unique((input.tags || []).map(normalizeTag)),
    noteIds: unique(input.noteIds),
    lastOpenedAt: input.lastOpenedAt || null,
    dataSnapshotAt: input.dataSnapshotAt || record.updatedAt,
    isArchived: input.isArchived === true,
    isPinned: input.isPinned === true,
    saveMode: allowed(input.saveMode, ["snapshot", "refreshable", "snapshot_and_refreshable"], "snapshot_and_refreshable"),
    syncStatus: WORKSPACE_SYNC_STATUS,
    snapshots: Array.isArray(input.snapshots) ? clone(input.snapshots) : [],
    sample: input.sample === true,
    type: allowed(input.type, SAVED_OBJECT_TYPES, "saved_research"),
  };
}

function duplicateIdentity(item) {
  const references = item.canonicalReferences || {};
  return JSON.stringify({
    type: item.type,
    boardId: item.boardId,
    entityIds: [...(references.entityIds || [])].sort(),
    eventIds: [...(references.eventIds || [])].sort(),
    marketIds: [...(references.marketIds || [])].sort(),
    insightIds: [...(references.insightIds || [])].sort(),
    storyIds: [...(references.storyIds || [])].sort(),
    queryId: references.queryId,
    visualizationId: references.visualizationId,
    structuredQuery: item.sourceState?.structuredQuery || {},
  });
}

function shareableResearchSnapshot(snapshot, includePrivateNotes = false) {
  const copy = clone(snapshot || {});
  if (!includePrivateNotes && copy?.id?.startsWith?.("research-session-")) delete copy.notes;
  if (!includePrivateNotes && copy?.type === "edge_lab_scenario") {
    if (copy.originalData) delete copy.originalData.notes;
    if (copy.updatedResearch) delete copy.updatedResearch.notes;
  }
  return copy;
}

function importRecordIdentity(collection, record) {
  if (record?.id) return record.id;
  if (["preferences", "dashboardLayouts"].includes(collection)) return record?.workspaceId || null;
  return null;
}

function remapImportedReferences(record, idMap) {
  ["workspaceId", "boardId", "watchlistId", "attachmentId", "sourceItemId", "ruleId"].forEach((field) => {
    if (idMap.has(record[field])) record[field] = idMap.get(record[field]);
  });
  return record;
}

function ensureTagRecords(state, workspaceId, tags, clock, random) {
  (tags || []).forEach((label) => {
    const normalizedLabel = normalizeTag(label);
    if (!normalizedLabel || state.tags.some((tag) => tag.workspaceId === workspaceId && tag.normalizedLabel === normalizedLabel)) return;
    state.tags.push(baseRecord({
      workspaceId,
      normalizedLabel,
      displayLabel: cleanText(label, 80).trim() || normalizedLabel,
      color: "pink",
      sample: false,
    }, "tag", clock, random));
  });
}

export class WorkspaceConflictError extends Error {
  constructor(message, currentRecord) {
    super(message);
    this.name = "WorkspaceConflictError";
    this.code = "version_conflict";
    this.currentRecord = clone(currentRecord);
  }
}

export class WorkspaceRepository {
  constructor(options = {}) {
    this.storage = options.storage || createWorkspaceStorage(options.storageOptions);
    this.seedSample = options.seedSample !== false;
    this.clock = options.clock || Date.now;
    this.random = options.random || Math.random;
    this.state = null;
    this.initializing = null;
    this.writeQueue = Promise.resolve();
    this.listeners = new Set();
    this.storageStatus = "initializing";
    this.storageError = null;
    this.isPersisting = false;
    this.externalUpdateAvailable = false;
    this.unsubscribeStorage = this.storage.subscribe?.(() => {
      if (this.isPersisting) return;
      this.externalUpdateAvailable = true;
      this.emit({ type: "external_update" });
    });
  }

  async initialize() {
    if (this.state) return clone(this.state);
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      try {
        const stored = await this.storage.read();
        this.state = stored ? normalizeState(stored) : this.seedSample ? createSampleWorkspaceFixture() : createDefaultWorkspaceState();
        this.storageStatus = "ready";
        if (!stored) await this.persist();
      } catch (error) {
        this.storageStatus = "unavailable";
        this.storageError = error;
        this.state = this.seedSample ? createSampleWorkspaceFixture() : createDefaultWorkspaceState();
      }
      return clone(this.state);
    })();
    return this.initializing;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    this.listeners.forEach((listener) => listener({ ...event, state: clone(this.state) }));
  }

  async persist() {
    this.state.meta.lastWriteAt = isoNow(this.clock);
    this.isPersisting = true;
    try {
      await this.storage.write(this.state);
      this.storageStatus = "ready";
      this.storageError = null;
    } finally {
      this.isPersisting = false;
    }
  }

  async mutate(operation, eventType = "updated") {
    await this.initialize();
    if (this.externalUpdateAvailable) {
      throw new WorkspaceConflictError("A newer local workspace update is available. Load it before making changes.", this.state);
    }
    const execute = async () => {
      const before = clone(this.state);
      try {
        const result = await operation(this.state);
        await this.persist();
        this.emit({ type: eventType, result: clone(result) });
        return clone(result);
      } catch (error) {
        this.state = before;
        this.storageError = error;
        throw error;
      }
    };
    const task = this.writeQueue.then(execute, execute);
    this.writeQueue = task.catch(() => {});
    return task;
  }

  snapshot() {
    if (!this.state) throw new WorkspaceStorageError("not_initialized", "Workspace repository has not initialized.");
    return clone(this.state);
  }

  async reloadFromStorage() {
    const stored = await this.storage.read();
    if (!stored) return this.snapshot();
    this.state = normalizeState(stored);
    this.externalUpdateAvailable = false;
    this.emit({ type: "reloaded" });
    return this.snapshot();
  }

  getDiagnostics() {
    return {
      storageStatus: this.storageStatus,
      storageError: this.storageError?.code || null,
      localOnly: true,
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      externalUpdateAvailable: this.externalUpdateAvailable,
      sample: this.state?.sample === true,
    };
  }

  async createWorkspace(input = {}) {
    return this.mutate((state) => {
      const record = baseRecord({
        title: cleanText(input.title || "My EdgeBoard", 160),
        description: cleanText(input.description, 1000),
        visibility: "private",
        ownerId: null,
        collaborators: [],
        permissions: { localOwner: true },
        isArchived: false,
        syncStatus: WORKSPACE_SYNC_STATUS,
        sample: false,
      }, "workspace", this.clock, this.random);
      state.workspaces.push(record);
      DEFAULT_BOARD_TEMPLATES.forEach((template) => state.boards.push(baseRecord({
        ...template,
        id: createLocalId("board", this.clock(), this.random()),
        workspaceId: record.id,
        description: "",
        tags: [],
        isPinned: template.sortOrder === 0,
        sample: false,
      }, "board", this.clock, this.random)));
      state.preferences.push({ workspaceId: record.id, ...clone(DEFAULT_PREFERENCES), defaultWorkspaceId: record.id, updatedAt: record.updatedAt, version: 1 });
      state.dashboardLayouts.push({ workspaceId: record.id, preset: "balanced", moduleIds: [...DASHBOARD_PRESETS.balanced], hiddenModuleIds: [], updatedAt: record.updatedAt, version: 1 });
      return record;
    }, "workspace_created");
  }

  listWorkspaces({ includeArchived = false } = {}) {
    return clone((this.state?.workspaces || []).filter((item) => includeArchived || !item.isArchived));
  }

  async updateWorkspace(id, patch, expectedVersion = null) {
    return this.updateRecord("workspaces", id, patch, expectedVersion);
  }

  async deleteWorkspace(id, { confirmed = false } = {}) {
    return this.mutate((state) => {
      const workspace = state.workspaces.find((item) => item.id === id);
      if (!workspace) throw new WorkspaceStorageError("not_found", "Workspace was not found.");
      const workspaceBoardIds = new Set(state.boards.filter((item) => item.workspaceId === id).map((item) => item.id));
      const workspaceWatchlistIds = new Set(state.watchlists.filter((item) => item.workspaceId === id).map((item) => item.id));
      const hasContent = state.savedObjects.some((item) => item.workspaceId === id)
        || state.trackedIdeas.some((item) => item.workspaceId === id)
        || state.watchlistItems.some((item) => workspaceWatchlistIds.has(item.watchlistId));
      if (hasContent && !confirmed) throw new WorkspaceStorageError("confirmation_required", "Deleting a non-empty workspace requires confirmation.");
      COLLECTIONS.forEach((collection) => {
        state[collection] = state[collection].filter((item) =>
          item.workspaceId !== id && item.id !== id
          && !workspaceBoardIds.has(item.boardId)
          && !workspaceWatchlistIds.has(item.watchlistId));
      });
      return workspace;
    }, "workspace_deleted");
  }

  async createBoard(input) {
    return this.mutate((state) => {
      if (!state.workspaces.some((item) => item.id === input.workspaceId)) throw new WorkspaceStorageError("not_found", "Workspace was not found.");
      const sortOrder = state.boards.filter((item) => item.workspaceId === input.workspaceId).length;
      const record = baseRecord({
        workspaceId: input.workspaceId,
        title: cleanText(input.title || "Untitled board", 160),
        description: cleanText(input.description, 1000),
        marker: cleanText(input.marker || "B", 4),
        tags: unique((input.tags || []).map(normalizeTag)),
        sortOrder,
        isPinned: input.isPinned === true,
        isArchived: false,
        sample: false,
      }, "board", this.clock, this.random);
      state.boards.push(record);
      return record;
    }, "board_created");
  }

  listBoards(workspaceId, { includeArchived = false } = {}) {
    return clone((this.state?.boards || [])
      .filter((item) => item.workspaceId === workspaceId && (includeArchived || !item.isArchived))
      .sort((left, right) => Number(right.isPinned) - Number(left.isPinned) || left.sortOrder - right.sortOrder));
  }

  async updateBoard(id, patch, expectedVersion = null) {
    return this.updateRecord("boards", id, {
      ...patch,
      title: patch.title === undefined ? undefined : cleanText(patch.title, 160),
      description: patch.description === undefined ? undefined : cleanText(patch.description, 1000),
    }, expectedVersion);
  }

  async reorderBoards(workspaceId, orderedIds) {
    return this.mutate((state) => {
      const requested = unique(orderedIds);
      state.boards.filter((board) => board.workspaceId === workspaceId).forEach((board) => {
        const index = requested.indexOf(board.id);
        if (index >= 0) {
          board.sortOrder = index;
          board.updatedAt = isoNow(this.clock);
          board.version += 1;
        }
      });
      return state.boards.filter((board) => board.workspaceId === workspaceId);
    }, "boards_reordered");
  }

  async duplicateBoard(id, title = "") {
    await this.initialize();
    const source = this.state.boards.find((item) => item.id === id);
    if (!source) throw new WorkspaceStorageError("not_found", "Board was not found.");
    const copy = await this.createBoard({ ...source, title: title || `${source.title} copy` });
    const items = this.state.savedObjects.filter((item) => item.boardId === id);
    for (const item of items) {
      await this.saveResearchObject({ ...item, id: null, boardId: copy.id, title: item.title }, { duplicateStrategy: "copy" });
    }
    return copy;
  }

  async deleteBoard(id, { confirmed = false, moveToBoardId = null } = {}) {
    return this.mutate((state) => {
      const board = state.boards.find((item) => item.id === id);
      if (!board) throw new WorkspaceStorageError("not_found", "Board was not found.");
      const items = state.savedObjects.filter((item) => item.boardId === id);
      if (items.length && !confirmed) throw new WorkspaceStorageError("confirmation_required", "Deleting a non-empty board requires confirmation.");
      if (items.length && moveToBoardId) {
        if (!state.boards.some((item) => item.id === moveToBoardId && item.workspaceId === board.workspaceId)) {
          throw new WorkspaceStorageError("invalid_target", "Destination board was not found.");
        }
        items.forEach((item) => {
          item.boardId = moveToBoardId;
          item.updatedAt = isoNow(this.clock);
          item.version += 1;
        });
      } else if (items.length) {
        state.savedObjects = state.savedObjects.filter((item) => item.boardId !== id);
      }
      state.boards = state.boards.filter((item) => item.id !== id);
      return board;
    }, "board_deleted");
  }

  async saveResearchObject(input, options = {}) {
    return this.mutate((state) => {
      const record = normalizeSavedObject(input, this.clock, this.random);
      if (!state.workspaces.some((item) => item.id === record.workspaceId)) throw new WorkspaceStorageError("not_found", "Workspace was not found.");
      if (!state.boards.some((item) => item.id === record.boardId && item.workspaceId === record.workspaceId)) {
        throw new WorkspaceStorageError("not_found", "Board was not found.");
      }
      const identity = duplicateIdentity(record);
      const existing = state.savedObjects.find((item) => duplicateIdentity(item) === identity);
      if (existing && options.duplicateStrategy !== "copy") {
        if (options.duplicateStrategy === "update") {
          const priorSnapshots = [
            ...(existing.snapshots || []),
            {
              id: createLocalId("snapshot", this.clock(), this.random()),
              capturedAt: existing.dataSnapshotAt || existing.updatedAt,
              source: clone(existing.researchSnapshot?.source || {}),
              data: clone(existing.researchSnapshot),
              schemaVersion: WORKSPACE_SCHEMA_VERSION,
            },
          ];
          Object.assign(existing, record, {
            id: existing.id,
            createdAt: existing.createdAt,
            snapshots: priorSnapshots,
            version: existing.version + 1,
            updatedAt: isoNow(this.clock),
          });
          ensureTagRecords(state, existing.workspaceId, existing.tags, this.clock, this.random);
          return { status: "updated", item: existing, duplicate: existing };
        }
        return { status: "duplicate", item: existing, duplicate: existing };
      }
      if (existing && options.duplicateStrategy === "copy") record.id = createLocalId("saved", this.clock(), this.random());
      state.savedObjects.push(record);
      ensureTagRecords(state, record.workspaceId, record.tags, this.clock, this.random);
      return { status: "created", item: record, duplicate: existing || null };
    }, "research_saved");
  }

  listSavedResearchObjects(filters = {}) {
    const query = cleanText(filters.query, 500).toLocaleLowerCase();
    return clone((this.state?.savedObjects || [])
      .filter((item) => !filters.workspaceId || item.workspaceId === filters.workspaceId)
      .filter((item) => !filters.boardId || item.boardId === filters.boardId)
      .filter((item) => !filters.type || item.type === filters.type)
      .filter((item) => filters.archived === undefined || item.isArchived === filters.archived)
      .filter((item) => filters.pinned === undefined || item.isPinned === filters.pinned)
      .filter((item) => !filters.tag || item.tags.includes(normalizeTag(filters.tag)))
      .filter((item) => !filters.sportId || item.sourceState?.sportId === filters.sportId)
      .filter((item) => !filters.leagueId || item.sourceState?.leagueId === filters.leagueId)
      .filter((item) => !query || [
        item.title, item.description, item.sourceState?.queryText,
        item.sourceState?.sportId, item.sourceState?.leagueId, ...(item.tags || []),
      ].some((value) => String(value || "").toLocaleLowerCase().includes(query)))
      .sort((left, right) => Number(right.isPinned) - Number(left.isPinned) || new Date(right.updatedAt) - new Date(left.updatedAt)));
  }

  async updateSavedResearchObject(id, patch, expectedVersion = null) {
    return this.updateRecord("savedObjects", id, patch, expectedVersion);
  }

  async archiveSavedResearchObject(id, archived = true) {
    return this.updateSavedResearchObject(id, { isArchived: archived });
  }

  async deleteSavedResearchObject(id) {
    return this.mutate((state) => {
      const record = state.savedObjects.find((item) => item.id === id);
      if (!record) throw new WorkspaceStorageError("not_found", "Saved research was not found.");
      state.savedObjects = state.savedObjects.filter((item) => item.id !== id);
      state.notes = state.notes.filter((item) => item.attachmentId !== id);
      return record;
    }, "research_deleted");
  }

  async refreshSavedResearchObject(id, nextSnapshot, options = {}) {
    return this.mutate((state) => {
      const item = state.savedObjects.find((record) => record.id === id);
      if (!item) throw new WorkspaceStorageError("not_found", "Saved research was not found.");
      if (item.saveMode === "snapshot") throw new WorkspaceStorageError("not_refreshable", "This item was saved as a snapshot only.");
      const snapshot = {
        id: createLocalId("snapshot", this.clock(), this.random()),
        capturedAt: isoNow(this.clock),
        source: clone(options.source || {}),
        data: clone(nextSnapshot || {}),
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
      };
      item.snapshots.push({ id: createLocalId("snapshot", this.clock(), this.random()), capturedAt: item.dataSnapshotAt, source: clone(item.researchSnapshot?.source || {}), data: clone(item.researchSnapshot), schemaVersion: WORKSPACE_SCHEMA_VERSION });
      item.researchSnapshot = clone(nextSnapshot || {});
      item.dataSnapshotAt = snapshot.capturedAt;
      item.updatedAt = snapshot.capturedAt;
      item.version += 1;
      item.lastRefreshComparison = compareSnapshots(item.snapshots.at(-1)?.data || {}, snapshot.data);
      return { item, snapshot, comparison: item.lastRefreshComparison };
    }, "research_refreshed");
  }

  async addNote(input) {
    return this.mutate((state) => {
      const note = baseRecord({
        workspaceId: input.workspaceId,
        attachmentType: cleanText(input.attachmentType, 100),
        attachmentId: cleanText(input.attachmentId, 160),
        text: cleanText(input.text, 10000),
        isPinned: input.isPinned === true,
        authorId: null,
        sample: false,
      }, "note", this.clock, this.random);
      state.notes.push(note);
      return note;
    }, "note_added");
  }

  async updateNote(id, patch, expectedVersion = null) {
    return this.updateRecord("notes", id, { ...patch, text: patch.text === undefined ? undefined : cleanText(patch.text, 10000) }, expectedVersion);
  }

  async deleteNote(id) {
    return this.removeRecord("notes", id, "note_deleted");
  }

  async addTag(workspaceId, label, color = "pink") {
    return this.mutate((state) => {
      const normalizedLabel = normalizeTag(label);
      if (!normalizedLabel) throw new WorkspaceStorageError("invalid_tag", "Tag label is required.");
      const existing = state.tags.find((tag) => tag.workspaceId === workspaceId && tag.normalizedLabel === normalizedLabel);
      if (existing) return existing;
      const tag = {
        id: createLocalId("tag", this.clock(), this.random()),
        workspaceId,
        normalizedLabel,
        displayLabel: cleanText(label, 80).trim(),
        color: cleanText(color, 30),
        usageCount: 0,
      };
      state.tags.push(tag);
      return tag;
    }, "tag_added");
  }

  async renameTag(id, label) {
    return this.mutate((state) => {
      const tag = state.tags.find((item) => item.id === id);
      if (!tag) throw new WorkspaceStorageError("not_found", "Tag was not found.");
      const next = normalizeTag(label);
      const duplicate = state.tags.find((item) => item.workspaceId === tag.workspaceId && item.normalizedLabel === next && item.id !== id);
      if (duplicate) throw new WorkspaceStorageError("duplicate_tag", "A tag with that normalized label already exists.");
      const old = tag.normalizedLabel;
      tag.normalizedLabel = next;
      tag.displayLabel = cleanText(label, 80).trim();
      COLLECTIONS.forEach((collection) => state[collection].forEach((record) => {
        if (Array.isArray(record.tags)) record.tags = record.tags.map((value) => value === old ? next : value);
      }));
      return tag;
    }, "tag_renamed");
  }

  async mergeTags(sourceId, targetId) {
    return this.mutate((state) => {
      const source = state.tags.find((item) => item.id === sourceId);
      const target = state.tags.find((item) => item.id === targetId);
      if (!source || !target || source.workspaceId !== target.workspaceId) throw new WorkspaceStorageError("invalid_tag", "Tags cannot be merged.");
      COLLECTIONS.forEach((collection) => state[collection].forEach((record) => {
        if (Array.isArray(record.tags) && record.tags.includes(source.normalizedLabel)) {
          record.tags = unique(record.tags.map((value) => value === source.normalizedLabel ? target.normalizedLabel : value));
        }
      }));
      state.tags = state.tags.filter((item) => item.id !== sourceId);
      return target;
    }, "tags_merged");
  }

  async createWatchlist(input) {
    return this.mutate((state) => {
      const record = baseRecord({
        workspaceId: input.workspaceId,
        title: cleanText(input.title || "Untitled watchlist", 160),
        description: cleanText(input.description, 1000),
        tags: unique((input.tags || []).map(normalizeTag)),
        isPinned: input.isPinned === true,
        sample: false,
      }, "watchlist", this.clock, this.random);
      state.watchlists.push(record);
      return record;
    }, "watchlist_created");
  }

  listWatchlists(workspaceId) {
    return clone((this.state?.watchlists || [])
      .filter((item) => !workspaceId || item.workspaceId === workspaceId)
      .map((watchlist) => ({
        ...watchlist,
        items: (this.state?.watchlistItems || []).filter((item) => item.watchlistId === watchlist.id),
      }))
      .sort((left, right) => Number(right.isPinned) - Number(left.isPinned) || new Date(right.updatedAt) - new Date(left.updatedAt)));
  }

  async addWatchlistItem(input) {
    return this.mutate((state) => {
      if (!state.watchlists.some((item) => item.id === input.watchlistId)) throw new WorkspaceStorageError("not_found", "Watchlist was not found.");
      const targetType = allowed(input.targetType, WATCH_TARGET_TYPES, null);
      if (!targetType || !input.targetId) throw new WorkspaceStorageError("invalid_target", "Watch target is invalid.");
      const existing = state.watchlistItems.find((item) => item.watchlistId === input.watchlistId && item.targetType === targetType && item.targetId === input.targetId);
      if (existing) return { status: "duplicate", item: existing };
      const record = {
        id: createLocalId("watch", this.clock(), this.random()),
        watchlistId: input.watchlistId,
        targetType,
        targetId: cleanText(input.targetId, 160),
        label: cleanText(input.label || input.targetId, 240),
        sportId: cleanText(input.sportId, 100),
        leagueId: cleanText(input.leagueId, 100),
        watchReasons: unique(input.watchReasons || ["stats"]),
        conditions: clone(input.conditions || []),
        tags: unique((input.tags || []).map(normalizeTag)),
        noteIds: [],
        createdAt: isoNow(this.clock),
        lastEvaluatedAt: input.lastEvaluatedAt || null,
        lastKnownState: clone(input.lastKnownState || {}),
        isPaused: input.isPaused === true,
        sample: input.sample === true,
        version: 1,
      };
      state.watchlistItems.push(record);
      return { status: "created", item: record };
    }, "watchlist_item_added");
  }

  async updateWatchlistItem(id, patch, expectedVersion = null) {
    return this.updateRecord("watchlistItems", id, patch, expectedVersion);
  }

  async removeWatchlistItem(id) {
    return this.removeRecord("watchlistItems", id, "watchlist_item_removed");
  }

  async createAlertRule(input) {
    return this.mutate((state) => {
      const operator = allowed(input.condition?.operator, ALERT_OPERATORS, null);
      if (!operator) throw new WorkspaceStorageError("invalid_alert", "Alert operator is unsupported.");
      const record = baseRecord({
        workspaceId: input.workspaceId,
        name: cleanText(input.name || "Untitled in-app alert", 200),
        category: allowed(input.category, ALERT_CATEGORIES, "system"),
        target: { type: cleanText(input.target?.type, 100), id: cleanText(input.target?.id, 160) },
        condition: { metric: cleanText(input.condition?.metric, 100), operator, value: input.condition?.value ?? null },
        scope: clone(input.scope || {}),
        frequency: "on_refresh",
        isEnabled: input.isEnabled !== false,
        cooldownMinutes: Math.max(0, Number(input.cooldownMinutes) || 60),
        snoozedUntil: null,
        lastEvaluatedAt: null,
        lastTriggeredAt: null,
        lastKnownValue: input.lastKnownValue ?? null,
        delivery: { inApp: true, push: false, email: false },
        source: cleanText(input.source || "Local evaluation", 240),
        sample: input.sample === true,
      }, "alert", this.clock, this.random);
      state.alertRules.push(record);
      return record;
    }, "alert_rule_created");
  }

  listAlertRules(filters = {}) {
    return clone((this.state?.alertRules || [])
      .filter((item) => !filters.workspaceId || item.workspaceId === filters.workspaceId)
      .filter((item) => !filters.category || item.category === filters.category)
      .filter((item) => filters.enabled === undefined || item.isEnabled === filters.enabled)
      .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt)));
  }

  async updateAlertRule(id, patch, expectedVersion = null) {
    const safePatch = { ...patch };
    if (patch.delivery) safePatch.delivery = { inApp: true, push: false, email: false };
    return this.updateRecord("alertRules", id, safePatch, expectedVersion);
  }

  async deleteAlertRule(id) {
    return this.removeRecord("alertRules", id, "alert_rule_deleted");
  }

  async evaluateAlerts(readings = {}) {
    return this.mutate((state) => {
      const now = this.clock();
      const events = [];
      state.alertRules.forEach((rule) => {
        const reading = readings[rule.id] || readings[rule.target.id];
        if (!reading || !rule.isEnabled) return;
        if (rule.snoozedUntil && new Date(rule.snoozedUntil).getTime() > now) return;
        const stale = reading.freshness === "stale";
        if (stale && rule.condition.operator !== "became_stale") {
          rule.lastEvaluatedAt = isoNow(this.clock);
          return;
        }
        const observedValue = rule.condition.operator === "became_stale"
          ? reading.freshness
          : ["became_available", "became_unavailable"].includes(rule.condition.operator)
            ? reading.status
            : reading.value ?? reading.status ?? null;
        const triggered = evaluateCondition(rule.condition, rule.lastKnownValue, reading);
        const cooldownUntil = rule.lastTriggeredAt
          ? new Date(rule.lastTriggeredAt).getTime() + rule.cooldownMinutes * 60_000 : 0;
        const duplicate = rule.lastTriggeredValue === observedValue && rule.lastKnownValue === observedValue;
        rule.lastEvaluatedAt = isoNow(this.clock);
        const oldValue = rule.lastKnownValue;
        rule.lastKnownValue = observedValue;
        rule.updatedAt = rule.lastEvaluatedAt;
        rule.version += 1;
        if (!triggered || duplicate || now < cooldownUntil) return;
        rule.lastTriggeredAt = rule.lastEvaluatedAt;
        rule.lastTriggeredValue = observedValue;
        const event = {
          id: createLocalId("alert-event", this.clock(), this.random()),
          workspaceId: rule.workspaceId,
          ruleId: rule.id,
          category: rule.category,
          title: rule.name,
          explanation: explainAlert(rule, oldValue, observedValue),
          target: clone(rule.target),
          oldValue,
          newValue: observedValue,
          triggerCondition: clone(rule.condition),
          source: reading.source || rule.source,
          freshness: reading.freshness || "unknown",
          triggeredAt: rule.lastTriggeredAt,
          isRead: false,
          isDismissed: false,
          isArchived: false,
          sample: reading.sample === true || rule.sample === true,
          version: 1,
        };
        state.alertEvents.push(event);
        events.push(event);
      });
      return events;
    }, "alerts_evaluated");
  }

  listAlertEvents(filters = {}) {
    return clone((this.state?.alertEvents || [])
      .filter((item) => !filters.workspaceId || item.workspaceId === filters.workspaceId)
      .filter((item) => !filters.category || item.category === filters.category)
      .filter((item) => filters.unread !== true || !item.isRead)
      .filter((item) => filters.dismissed !== true || item.isDismissed)
      .filter((item) => filters.archived !== true || item.isArchived)
      .sort((left, right) => new Date(right.triggeredAt) - new Date(left.triggeredAt)));
  }

  async updateAlertEvent(id, patch) {
    return this.updateRecord("alertEvents", id, patch);
  }

  async markAllAlertsRead(workspaceId) {
    return this.mutate((state) => {
      state.alertEvents.filter((item) => item.workspaceId === workspaceId).forEach((item) => {
        item.isRead = true;
        item.version += 1;
      });
      return state.alertEvents;
    }, "alerts_read");
  }

  async clearAlertEvents(workspaceId) {
    return this.mutate((state) => {
      const removed = state.alertEvents.filter((item) => item.workspaceId === workspaceId).length;
      state.alertEvents = state.alertEvents.filter((item) => item.workspaceId !== workspaceId);
      return { removed };
    }, "alert_events_cleared");
  }

  async createTrackedIdea(input) {
    return this.mutate((state) => {
      const record = baseRecord({
        workspaceId: input.workspaceId,
        title: cleanText(input.title || "Untitled tracked research idea", 240),
        status: allowed(input.status, TRACKED_IDEA_STATUSES, "researching"),
        legs: (input.legs || []).map((leg) => ({
          selectionId: cleanText(leg.selectionId || leg.id, 160),
          canonicalMarketId: cleanText(leg.canonicalMarketId, 160),
          savedLine: Number.isFinite(Number(leg.savedLine ?? leg.line)) ? Number(leg.savedLine ?? leg.line) : null,
          savedOdds: Number.isFinite(Number(leg.savedOdds ?? leg.odds)) ? Number(leg.savedOdds ?? leg.odds) : null,
          currentLine: Number.isFinite(Number(leg.currentLine)) ? Number(leg.currentLine) : null,
          currentOdds: Number.isFinite(Number(leg.currentOdds)) ? Number(leg.currentOdds) : null,
          sportsbook: cleanText(leg.sportsbook || leg.oddsSource, 160),
          sourceUpdatedAt: leg.sourceUpdatedAt || leg.lastUpdatedAt || null,
          settlementScope: cleanText(leg.settlementScope, 100),
        })),
        thesis: cleanText(input.thesis, 5000),
        counterpoints: (input.counterpoints || []).map((item) => cleanText(item, 1000)),
        sources: clone(input.sources || []),
        confidenceAtSave: Number.isFinite(Number(input.confidenceAtSave)) ? Number(input.confidenceAtSave) : null,
        researchCompleteness: cleanText(input.researchCompleteness || "partial", 40),
        eventStartAt: input.eventStartAt || null,
        outcome: input.outcome || null,
        resultStatus: allowed(input.resultStatus, TRACKED_RESULT_STATUSES, "unresolved"),
        notes: (input.notes || []).map((item) => cleanText(item, 5000)),
        tags: unique((input.tags || []).map(normalizeTag)),
        hypotheticalStake: Number.isFinite(Number(input.hypotheticalStake)) ? Math.max(0, Number(input.hypotheticalStake)) : null,
        oddsFormat: allowed(input.oddsFormat, ["american", "decimal", "fractional"], "american"),
        simulationVisible: input.simulationVisible === true,
        sample: input.sample === true,
      }, "idea", this.clock, this.random);
      state.trackedIdeas.push(record);
      return record;
    }, "tracked_idea_created");
  }

  async updateTrackedIdea(id, patch, expectedVersion = null) {
    const safePatch = { ...patch };
    if (patch.status) safePatch.status = allowed(patch.status, TRACKED_IDEA_STATUSES, "researching");
    if (patch.resultStatus) safePatch.resultStatus = allowed(patch.resultStatus, TRACKED_RESULT_STATUSES, "unresolved");
    if (patch.thesis !== undefined) safePatch.thesis = cleanText(patch.thesis, 5000);
    return this.updateRecord("trackedIdeas", id, safePatch, expectedVersion);
  }

  async appendActivity(input) {
    await this.initialize();
    const preferences = this.state.preferences.find((item) => item.workspaceId === input.workspaceId);
    if (this.state.meta.activityPaused || preferences?.activityPaused) return null;
    return this.mutate((state) => {
      const timestamp = isoNow(this.clock);
      const queryText = (state.meta.privacyMode || preferences?.privacyMode) ? "" : cleanText(input.queryText, 1000);
      const latest = state.activity.at(-1);
      if (latest && latest.action === input.action && latest.targetId === input.targetId
        && this.clock() - new Date(latest.createdAt).getTime() < 10_000) return latest;
      const entry = {
        id: createLocalId("activity", this.clock(), this.random()),
        workspaceId: input.workspaceId,
        action: cleanText(input.action, 100),
        targetType: cleanText(input.targetType, 100),
        targetId: cleanText(input.targetId, 160),
        label: cleanText(input.label, 240),
        queryText,
        route: cleanText(input.route, 1000),
        createdAt: timestamp,
        localOnly: true,
      };
      state.activity.push(entry);
      state.activity = state.activity.slice(-200);
      return entry;
    }, "activity_appended");
  }

  getActivity(workspaceId, { limit = 50 } = {}) {
    return clone((this.state?.activity || [])
      .filter((item) => !workspaceId || item.workspaceId === workspaceId)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .slice(0, Math.max(0, Math.min(200, Number(limit) || 50))));
  }

  async clearActivity(workspaceId) {
    return this.mutate((state) => {
      const removed = state.activity.filter((item) => item.workspaceId === workspaceId).length;
      state.activity = state.activity.filter((item) => item.workspaceId !== workspaceId);
      return { removed };
    }, "activity_cleared");
  }

  async updatePreferences(workspaceId, patch) {
    return this.mutate((state) => {
      let preferences = state.preferences.find((item) => item.workspaceId === workspaceId);
      if (!preferences) {
        preferences = { workspaceId, ...clone(DEFAULT_PREFERENCES), updatedAt: isoNow(this.clock), version: 1 };
        state.preferences.push(preferences);
      }
      const safe = {
        ...patch,
        preferredResearchMode: patch.preferredResearchMode
          ? allowed(patch.preferredResearchMode, ["stats", "betting", "both"], preferences.preferredResearchMode) : undefined,
        preferredOddsFormat: patch.preferredOddsFormat
          ? allowed(patch.preferredOddsFormat, ["american", "decimal", "fractional"], preferences.preferredOddsFormat) : undefined,
        preferredConfidenceThreshold: patch.preferredConfidenceThreshold === undefined
          ? undefined : Math.min(100, Math.max(0, Math.round(Number(patch.preferredConfidenceThreshold) || 0))),
      };
      Object.entries(safe).forEach(([key, value]) => {
        if (value !== undefined) preferences[key] = Array.isArray(value) ? unique(value) : value;
      });
      preferences.updatedAt = isoNow(this.clock);
      preferences.version += 1;
      return preferences;
    }, "preferences_updated");
  }

  async resetPreferences(workspaceId) {
    return this.mutate((state) => {
      const index = state.preferences.findIndex((item) => item.workspaceId === workspaceId);
      const value = { workspaceId, ...clone(DEFAULT_PREFERENCES), defaultWorkspaceId: workspaceId, updatedAt: isoNow(this.clock), version: 1 };
      if (index >= 0) state.preferences[index] = value;
      else state.preferences.push(value);
      return value;
    }, "preferences_reset");
  }

  async updateDashboardLayout(workspaceId, input) {
    return this.mutate((state) => {
      let layout = state.dashboardLayouts.find((item) => item.workspaceId === workspaceId);
      const validIds = new Set(DASHBOARD_MODULES.map((item) => item.id));
      const preset = Object.hasOwn(DASHBOARD_PRESETS, input.preset) ? input.preset : "custom";
      const moduleIds = unique(input.moduleIds || (preset !== "custom" ? DASHBOARD_PRESETS[preset] : layout?.moduleIds || []))
        .filter((id) => validIds.has(id));
      if (!layout) {
        layout = { workspaceId, preset, moduleIds, hiddenModuleIds: [], updatedAt: isoNow(this.clock), version: 1 };
        state.dashboardLayouts.push(layout);
      } else {
        layout.preset = preset;
        layout.moduleIds = moduleIds;
        layout.hiddenModuleIds = unique(input.hiddenModuleIds ?? layout.hiddenModuleIds).filter((id) => validIds.has(id));
        layout.updatedAt = isoNow(this.clock);
        layout.version += 1;
      }
      return layout;
    }, "dashboard_updated");
  }

  async createShareSnapshot(input) {
    return this.mutate((state) => {
      const item = state.savedObjects.find((record) => record.id === input.itemId);
      if (!item) throw new WorkspaceStorageError("not_found", "Saved item was not found.");
      const snapshot = {
        id: createLocalId("share", this.clock(), this.random()),
        workspaceId: item.workspaceId,
        sourceItemId: item.id,
        visibility: "link_snapshot",
        readOnly: true,
        title: item.title,
        generatedAt: isoNow(this.clock),
        canonicalReferences: clone(item.canonicalReferences),
        sourceState: clone(item.sourceState),
        researchSnapshot: shareableResearchSnapshot(item.researchSnapshot, input.includePrivateNotes === true),
        notes: input.includePrivateNotes === true
          ? clone(state.notes.filter((note) => note.attachmentId === item.id))
          : [],
        privateNotesExcluded: input.includePrivateNotes !== true,
        excludesActivity: true,
        sample: item.sample === true,
        source: item.researchSnapshot?.source || "Unavailable",
        freshness: item.dataSnapshotAt,
        warnings: unique([item.sample ? "Sample data" : "", "Read-only local snapshot"]),
        localDeviceOnly: true,
        version: 1,
      };
      state.sharedSnapshots.push(snapshot);
      return snapshot;
    }, "snapshot_shared");
  }

  async exportWorkspace(workspaceId, options = {}) {
    await this.initialize();
    if (this.externalUpdateAvailable) {
      throw new WorkspaceConflictError("A newer local workspace update is available. Load it before exporting.", this.state);
    }
    const workspace = this.state.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) throw new WorkspaceStorageError("not_found", "Workspace was not found.");
    const boardIds = new Set(this.state.boards.filter((item) => item.workspaceId === workspaceId).map((item) => item.id));
    const selectedIds = options.itemIds?.length ? new Set(options.itemIds) : null;
    const exported = {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      exportedAt: isoNow(this.clock),
      sample: this.state.sample === true,
      workspaces: [clone(workspace)],
      boards: clone(this.state.boards.filter((item) => item.workspaceId === workspaceId && (!options.boardId || item.id === options.boardId))),
      savedObjects: clone(this.state.savedObjects.filter((item) =>
        item.workspaceId === workspaceId
        && (!options.boardId || item.boardId === options.boardId)
        && (!selectedIds || selectedIds.has(item.id)))),
      watchlists: options.includeWatchlists === false ? [] : clone(this.state.watchlists.filter((item) => item.workspaceId === workspaceId)),
      watchlistItems: [],
      alertRules: options.includeAlertRules === false ? [] : clone(this.state.alertRules.filter((item) => item.workspaceId === workspaceId)),
      alertEvents: [],
      trackedIdeas: options.includeTrackedIdeas === false ? [] : clone(this.state.trackedIdeas.filter((item) => item.workspaceId === workspaceId)),
      notes: options.includeNotes === false ? [] : clone(this.state.notes.filter((item) => item.workspaceId === workspaceId)),
      tags: options.includeTags === false ? [] : clone(this.state.tags.filter((item) => item.workspaceId === workspaceId)),
      activity: [],
      preferences: options.includePreferences === false ? [] : clone(this.state.preferences.filter((item) => item.workspaceId === workspaceId)),
      dashboardLayouts: clone(this.state.dashboardLayouts.filter((item) => item.workspaceId === workspaceId)),
      sharedSnapshots: [],
      meta: { lastBackupAt: isoNow(this.clock), activityPaused: this.state.meta.activityPaused, privacyMode: this.state.meta.privacyMode, lastWriteAt: this.state.meta.lastWriteAt },
    };
    const exportedWatchlistIds = new Set(exported.watchlists.map((item) => item.id));
    exported.watchlistItems = clone(this.state.watchlistItems.filter((item) => exportedWatchlistIds.has(item.watchlistId)));
    if (options.boardId && !boardIds.has(options.boardId)) throw new WorkspaceStorageError("not_found", "Board was not found.");
    this.state.meta.lastBackupAt = exported.exportedAt;
    await this.persist();
    return exported;
  }

  previewImport(input) {
    let parsed = input;
    if (typeof input === "string") {
      try {
        parsed = JSON.parse(input);
      } catch {
        return { valid: false, errors: ["Import file is not valid JSON."], warnings: [], counts: {} };
      }
    }
    let migrated;
    try {
      migrated = migrateWorkspaceSchema(parsed);
    } catch (error) {
      return { valid: false, errors: [error.message], warnings: [], counts: {} };
    }
    const validation = validateWorkspaceState(migrated);
    return {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      schemaVersion: parsed.schemaVersion || 0,
      migratedSchemaVersion: migrated.schemaVersion,
      counts: Object.fromEntries(COLLECTIONS.map((collection) => [collection, migrated[collection].length])),
      value: validation.valid ? migrated : null,
    };
  }

  async importWorkspace(input, strategy = "merge") {
    const preview = this.previewImport(input);
    if (!preview.valid) throw new WorkspaceStorageError("invalid_import", preview.errors.join(" "));
    if (!["merge", "duplicate", "replace"].includes(strategy)) throw new WorkspaceStorageError("invalid_strategy", "Import strategy is invalid.");
    return this.mutate((state) => {
      const incoming = clone(preview.value);
      const skipped = [];
      if (strategy === "replace") {
        const incomingWorkspaceIds = new Set(incoming.workspaces.map((item) => item.id));
        const replacedBoardIds = new Set(state.boards
          .filter((item) => incomingWorkspaceIds.has(item.workspaceId))
          .map((item) => item.id));
        const replacedWatchlistIds = new Set(state.watchlists
          .filter((item) => incomingWorkspaceIds.has(item.workspaceId))
          .map((item) => item.id));
        COLLECTIONS.forEach((collection) => {
          state[collection] = state[collection].filter((item) =>
            !incomingWorkspaceIds.has(item.workspaceId || item.id)
            && !replacedBoardIds.has(item.boardId)
            && !replacedWatchlistIds.has(item.watchlistId));
        });
      }
      const idMap = new Map();
      const insertedRecords = [];
      COLLECTIONS.forEach((collection) => {
        incoming[collection].forEach((record) => {
          const copy = remapImportedReferences(clone(record), idMap);
          const recordIdentity = importRecordIdentity(collection, copy);
          const existing = state[collection].find((item) =>
            importRecordIdentity(collection, item) === recordIdentity);
          if (existing && strategy === "merge") {
            if (new Date(record.updatedAt || 0) > new Date(existing.updatedAt || 0)) Object.assign(existing, record);
            else skipped.push({ collection, id: recordIdentity, reason: "existing_newer_or_equal" });
            return;
          }
          if (existing && strategy === "duplicate") {
            if (!record.id) {
              skipped.push({ collection, id: recordIdentity, reason: "duplicate_non_identified_record" });
              return;
            }
            const nextId = createLocalId(collection.replace(/s$/, ""), this.clock(), this.random());
            idMap.set(record.id, nextId);
            copy.id = nextId;
            if (copy.title) copy.title = `${copy.title} imported copy`;
          }
          state[collection].push(copy);
          insertedRecords.push(copy);
        });
      });
      if (idMap.size) {
        insertedRecords.forEach((record) => remapImportedReferences(record, idMap));
      }
      return { imported: preview.counts, skipped, strategy, originalSchemaVersion: preview.schemaVersion };
    }, "workspace_imported");
  }

  async getStorageEstimate() {
    const estimate = await this.storage.estimate();
    return { ...estimate, localOnly: true, lastBackupAt: this.state?.meta?.lastBackupAt || null };
  }

  async clearAll({ confirmation = "" } = {}) {
    if (confirmation !== "DELETE MY EDGEBOARD DATA") {
      throw new WorkspaceStorageError("confirmation_required", "Delete-all confirmation text did not match.");
    }
    if (this.externalUpdateAvailable) {
      throw new WorkspaceConflictError("A newer local workspace update is available. Load it before deleting data.", this.state);
    }
    this.isPersisting = true;
    try {
      await this.storage.clear();
    } finally {
      this.isPersisting = false;
    }
    this.state = emptyState();
    await this.persist();
    this.emit({ type: "all_data_deleted" });
    return this.snapshot();
  }

  async updateRecord(collection, id, patch, expectedVersion = null) {
    return this.mutate((state) => {
      const record = state[collection].find((item) => item.id === id);
      if (!record) throw new WorkspaceStorageError("not_found", `${collection} record was not found.`);
      if (expectedVersion !== null && record.version !== expectedVersion) {
        throw new WorkspaceConflictError("This record was updated in another view.", record);
      }
      Object.entries(patch || {}).forEach(([key, value]) => {
        if (value !== undefined && !["id", "createdAt", "workspaceId"].includes(key)) record[key] = clone(value);
      });
      record.updatedAt = isoNow(this.clock);
      record.version = Number(record.version || 0) + 1;
      return record;
    }, `${collection}_updated`);
  }

  async removeRecord(collection, id, eventType) {
    return this.mutate((state) => {
      const record = state[collection].find((item) => item.id === id);
      if (!record) throw new WorkspaceStorageError("not_found", `${collection} record was not found.`);
      state[collection] = state[collection].filter((item) => item.id !== id);
      return record;
    }, eventType);
  }
}

export function evaluateCondition(condition, oldValue, reading) {
  const value = reading.value;
  const threshold = condition.value;
  switch (condition.operator) {
    case "greater_than": return Number(value) > Number(threshold);
    case "greater_than_or_equal": return Number(value) >= Number(threshold);
    case "less_than": return Number(value) < Number(threshold);
    case "less_than_or_equal": return Number(value) <= Number(threshold);
    case "equals": return value === threshold || reading.status === threshold;
    case "changed_by_at_least": return Number.isFinite(Number(oldValue)) && Math.abs(Number(value) - Number(oldValue)) >= Number(threshold);
    case "became_available": return reading.status === "available" && oldValue !== "available";
    case "became_unavailable": return reading.status === "unavailable" && oldValue !== "unavailable";
    case "became_stale": return reading.freshness === "stale" && oldValue !== "stale";
    case "starts_within_minutes": {
      const startsAt = new Date(reading.startsAt).getTime();
      const now = Number(reading.evaluatedAt || Date.now());
      return Number.isFinite(startsAt) && startsAt >= now && startsAt - now <= Number(threshold) * 60_000;
    }
    default: return false;
  }
}

function explainAlert(rule, oldValue, newValue) {
  const oldText = oldValue === null || oldValue === undefined ? "unavailable" : String(oldValue);
  const nextText = newValue === null || newValue === undefined ? "unavailable" : String(newValue);
  return `${rule.condition.metric} changed from ${oldText} to ${nextText}; local rule ${rule.condition.operator.replaceAll("_", " ")} ${rule.condition.value ?? ""}.`;
}

export function compareSnapshots(previous = {}, current = {}) {
  const keys = unique([...Object.keys(previous || {}), ...Object.keys(current || {})]);
  const changes = keys.filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]))
    .map((key) => ({ field: key, previous: clone(previous[key]), current: clone(current[key]), missingRegression: current[key] === null || current[key] === undefined }));
  return { changed: changes.length > 0, changes, changedFields: changes.map((item) => item.field) };
}

export function searchWorkspace(state, query = "", filters = {}) {
  const normalizedQuery = cleanText(query, 500).toLocaleLowerCase();
  const boardById = new Map(state.boards.map((board) => [board.id, board]));
  const notesByAttachment = new Map();
  state.notes.forEach((note) => {
    if (!notesByAttachment.has(note.attachmentId)) notesByAttachment.set(note.attachmentId, []);
    notesByAttachment.get(note.attachmentId).push(note.text);
  });
  return state.savedObjects
    .filter((item) => !filters.workspaceId || item.workspaceId === filters.workspaceId)
    .filter((item) => !filters.boardId || item.boardId === filters.boardId)
    .filter((item) => !filters.type || item.type === filters.type)
    .filter((item) => !filters.sportId || item.sourceState?.sportId === filters.sportId)
    .filter((item) => !filters.leagueId || item.sourceState?.leagueId === filters.leagueId)
    .filter((item) => !filters.tag || item.tags.includes(normalizeTag(filters.tag)))
    .filter((item) => filters.archived === undefined || item.isArchived === filters.archived)
    .filter((item) => filters.pinned === undefined || item.isPinned === filters.pinned)
    .filter((item) => !filters.saveMode || item.saveMode === filters.saveMode)
    .map((item) => {
      const board = boardById.get(item.boardId);
      const haystack = [
        item.title, item.description, item.sourceState?.queryText, item.sourceState?.sportId,
        item.sourceState?.leagueId, board?.title, ...(item.tags || []), ...(notesByAttachment.get(item.id) || []),
        ...(item.canonicalReferences?.entityIds || []), ...(item.canonicalReferences?.marketIds || []),
      ].join(" ").toLocaleLowerCase();
      const score = !normalizedQuery ? 1
        : item.title.toLocaleLowerCase().includes(normalizedQuery) ? 3
          : haystack.includes(normalizedQuery) ? 1 : 0;
      return { item: clone(item), board: board ? clone(board) : null, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || new Date(right.item.updatedAt) - new Date(left.item.updatedAt));
}

export function buildWorkspaceViewModel(state, workspaceId, route = { view: "home" }) {
  const workspace = state.workspaces.find((item) => item.id === workspaceId) || null;
  if (!workspace) return { status: "not-found", route, workspace: null };
  const boards = state.boards.filter((item) => item.workspaceId === workspaceId)
    .map((board) => ({
      ...clone(board),
      itemCount: state.savedObjects.filter((item) => item.boardId === board.id && !item.isArchived).length,
      totalItemCount: state.savedObjects.filter((item) => item.boardId === board.id).length,
    }))
    .sort((left, right) => Number(right.isPinned) - Number(left.isPinned) || left.sortOrder - right.sortOrder);
  const preferences = state.preferences.find((item) => item.workspaceId === workspaceId)
    || { workspaceId, ...clone(DEFAULT_PREFERENCES) };
  const layout = state.dashboardLayouts.find((item) => item.workspaceId === workspaceId)
    || { workspaceId, preset: "balanced", moduleIds: [...DASHBOARD_PRESETS.balanced], hiddenModuleIds: [] };
  const unreadAlerts = state.alertEvents.filter((item) => item.workspaceId === workspaceId && !item.isRead && !item.isDismissed).length;
  const watchlists = state.watchlists.filter((item) => item.workspaceId === workspaceId)
    .map((watchlist) => ({ ...clone(watchlist), items: clone(state.watchlistItems.filter((item) => item.watchlistId === watchlist.id)) }));
  const saved = state.savedObjects.filter((item) => item.workspaceId === workspaceId);
  const tracked = state.trackedIdeas.filter((item) => item.workspaceId === workspaceId);
  return {
    status: "ready",
    route,
    workspace: clone(workspace),
    boards,
    savedObjects: clone(saved),
    watchlists,
    alertRules: clone(state.alertRules.filter((item) => item.workspaceId === workspaceId)),
    alertEvents: clone(state.alertEvents.filter((item) => item.workspaceId === workspaceId)),
    trackedIdeas: clone(tracked),
    notes: clone(state.notes.filter((item) => item.workspaceId === workspaceId)),
    tags: clone(state.tags.filter((item) => item.workspaceId === workspaceId)),
    activity: clone(state.activity.filter((item) => item.workspaceId === workspaceId).slice(-20).reverse()),
    preferences: clone(preferences),
    dashboard: {
      ...clone(layout),
      modules: layout.moduleIds.filter((id) => !layout.hiddenModuleIds.includes(id))
        .map((id) => DASHBOARD_MODULES.find((module) => module.id === id)).filter(Boolean),
    },
    counts: {
      saved: saved.filter((item) => !item.isArchived).length,
      boards: boards.filter((item) => !item.isArchived).length,
      watched: watchlists.reduce((sum, item) => sum + item.items.length, 0),
      alerts: unreadAlerts,
      tracked: tracked.filter((item) => item.status !== "archived").length,
    },
    journal: buildJournalSummary(tracked),
    localOnly: true,
    sample: state.sample === true,
  };
}

export function buildJournalSummary(ideas) {
  const resolved = ideas.filter((item) => !["unresolved", "not_tracked"].includes(item.resultStatus));
  const breakdown = Object.fromEntries(TRACKED_RESULT_STATUSES.map((status) => [status, ideas.filter((item) => item.resultStatus === status).length]));
  const lineMoves = ideas.flatMap((item) => item.legs || [])
    .filter((leg) => Number.isFinite(leg.savedLine) && Number.isFinite(leg.currentLine))
    .map((leg) => leg.currentLine - leg.savedLine);
  return {
    total: ideas.length,
    resolved: resolved.length,
    unresolved: ideas.length - resolved.length,
    breakdown,
    averageLineMovement: lineMoves.length ? lineMoves.reduce((sum, value) => sum + value, 0) / lineMoves.length : null,
    lineMovementSampleSize: lineMoves.length,
    smallSample: resolved.length < 10,
    warning: resolved.length < 10 ? "Small tracked sample; outcomes do not establish predictive validity." : "",
  };
}

export function calculateHypotheticalResult(idea) {
  if (!idea.simulationVisible || !Number.isFinite(Number(idea.hypotheticalStake))) {
    return { available: false, label: "Financial simulation hidden" };
  }
  const odds = idea.legs?.[0]?.savedOdds;
  if (!Number.isFinite(Number(odds)) || Number(odds) === 0) return { available: false, label: "Saved odds are invalid" };
  const stake = Number(idea.hypotheticalStake);
  const decimal = Number(odds) > 0 ? 1 + Number(odds) / 100 : 1 + 100 / Math.abs(Number(odds));
  const profit = idea.resultStatus === "won" ? stake * (decimal - 1)
    : idea.resultStatus === "lost" ? -stake
      : ["push", "void"].includes(idea.resultStatus) ? 0 : null;
  return {
    available: profit !== null,
    hypothetical: true,
    stake,
    potentialReturn: stake * decimal,
    profit,
    disclaimer: "Hypothetical simulation; not connected to a sportsbook and not proof of future performance.",
  };
}

export function createWorkspaceRepository(options = {}) {
  return new WorkspaceRepository(options);
}
