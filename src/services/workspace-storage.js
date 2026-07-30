import { WORKSPACE_STORAGE_KEY } from "../config/workspace-config.js";

export class WorkspaceStorageError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = "WorkspaceStorageError";
    this.code = code;
    this.cause = cause;
  }
}

const clone = (value) => value === undefined ? undefined : structuredClone(value);

function mapStorageError(error) {
  if (error instanceof WorkspaceStorageError) return error;
  if (error?.name === "QuotaExceededError") {
    return new WorkspaceStorageError("quota_exceeded", "Local workspace storage quota was exceeded.", error);
  }
  if (error?.name === "VersionError") {
    return new WorkspaceStorageError("version_error", "The local workspace database version is incompatible.", error);
  }
  return new WorkspaceStorageError("storage_unavailable", error?.message || "Local workspace storage is unavailable.", error);
}

function withTimeout(promise, timeoutMs, message) {
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => reject(new WorkspaceStorageError("storage_timeout", message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => globalThis.clearTimeout(timer));
}

export class MemoryWorkspaceStorage {
  constructor(initialValue = null, options = {}) {
    this.value = clone(initialValue);
    this.available = options.available !== false;
    this.quotaBytes = Number.isFinite(options.quotaBytes) ? options.quotaBytes : Infinity;
    this.listeners = new Set();
  }

  async read() {
    if (!this.available) throw new WorkspaceStorageError("storage_unavailable", "Memory storage is unavailable.");
    return clone(this.value);
  }

  async write(value) {
    if (!this.available) throw new WorkspaceStorageError("storage_unavailable", "Memory storage is unavailable.");
    const serialized = JSON.stringify(value);
    if (new Blob([serialized]).size > this.quotaBytes) {
      throw new WorkspaceStorageError("quota_exceeded", "Memory storage quota was exceeded.");
    }
    this.value = clone(value);
    this.listeners.forEach((listener) => listener(clone(this.value)));
    return clone(this.value);
  }

  async clear() {
    this.value = null;
    this.listeners.forEach((listener) => listener(null));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async estimate() {
    const usage = this.value ? new Blob([JSON.stringify(this.value)]).size : 0;
    return { usage, quota: Number.isFinite(this.quotaBytes) ? this.quotaBytes : null };
  }
}

export class IndexedDbWorkspaceStorage {
  constructor(options = {}) {
    this.databaseName = options.databaseName || "edgeboard-local-workspace";
    this.storeName = options.storeName || "workspace-state";
    this.recordKey = options.recordKey || WORKSPACE_STORAGE_KEY;
    this.databaseVersion = 1;
    this.timeoutMs = Math.max(500, Number(options.timeoutMs) || 4000);
    this.channel = null;
    this.listeners = new Set();
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("edgeboard-workspace-updates");
      this.channel.addEventListener("message", (event) => {
        if (event.data?.key === this.recordKey) this.listeners.forEach((listener) => listener(event.data));
      });
    }
  }

  open() {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new WorkspaceStorageError("storage_unavailable", "IndexedDB is unavailable."));
    }
    const requestPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, this.databaseVersion);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(this.storeName)) {
          request.result.createObjectStore(this.storeName);
        }
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(mapStorageError(request.error)));
      request.addEventListener("blocked", () => reject(new WorkspaceStorageError("storage_blocked", "Workspace database upgrade is blocked by another tab.")));
    });
    return withTimeout(requestPromise, this.timeoutMs, "Opening the local workspace database timed out.");
  }

  async transaction(mode, operation) {
    let database;
    try {
      database = await this.open();
      const requestPromise = new Promise((resolve, reject) => {
        const transaction = database.transaction(this.storeName, mode);
        const store = transaction.objectStore(this.storeName);
        let request;
        try {
          request = operation(store);
        } catch (error) {
          reject(mapStorageError(error));
          return;
        }
        request.addEventListener("success", () => resolve(clone(request.result)));
        request.addEventListener("error", () => reject(mapStorageError(request.error)));
        transaction.addEventListener("abort", () => reject(mapStorageError(transaction.error)));
      });
      return await withTimeout(requestPromise, this.timeoutMs, "The local workspace transaction timed out.");
    } finally {
      database?.close();
    }
  }

  read() {
    return this.transaction("readonly", (store) => store.get(this.recordKey));
  }

  async write(value) {
    await this.transaction("readwrite", (store) => store.put(clone(value), this.recordKey));
    const notification = { key: this.recordKey, updatedAt: value?.meta?.lastWriteAt || new Date().toISOString() };
    this.channel?.postMessage(notification);
    this.listeners.forEach((listener) => listener(notification));
    return clone(value);
  }

  async clear() {
    await this.transaction("readwrite", (store) => store.delete(this.recordKey));
    const notification = { key: this.recordKey, deleted: true, updatedAt: new Date().toISOString() };
    this.channel?.postMessage(notification);
    this.listeners.forEach((listener) => listener(notification));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async estimate() {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return { usage: estimate.usage || 0, quota: estimate.quota || null };
    }
    const value = await this.read();
    return { usage: value ? new Blob([JSON.stringify(value)]).size : 0, quota: null };
  }

  close() {
    this.channel?.close();
    this.listeners.clear();
  }
}

export function createWorkspaceStorage(options = {}) {
  if (options.memory) return new MemoryWorkspaceStorage(options.initialValue, options);
  return new IndexedDbWorkspaceStorage(options);
}
