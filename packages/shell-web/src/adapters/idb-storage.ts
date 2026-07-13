// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.2 / ADR-0006 — IndexedDB-backed StorageAdapter for the web shell. Used
// for the (potentially multi-MB) IPTV content-snapshot cache, which would blow
// localStorage's ~5 MB quota. Values are stored as JSON strings — same encoding
// as WebStorageAdapter, so functions (e.g. a series' loadEpisodes closure) are
// dropped exactly as before and structured-clone's DataCloneError is avoided —
// but IndexedDB removes the size ceiling. Falls back to the injected adapter
// (localStorage) when IndexedDB is unavailable or fails to open.

import type { StorageAdapter } from "@shrimpler/core";

const DB_NAME = "shrimpler-cache";
const STORE = "kv";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

/** Run one request in a transaction; resolves with its result, rejects on error
 *  or abort (e.g. a quota-exceeded write aborts the transaction). */
function runRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  make: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = make(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result as T);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
  });
}

export class IdbStorageAdapter implements StorageAdapter {
  /** Resolves to the open DB, or null when IndexedDB is unusable (→ fallback). */
  private readonly ready: Promise<IDBDatabase | null>;

  constructor(private readonly fallback: StorageAdapter) {
    this.ready = openDb().catch((error: unknown) => {
      console.warn("[idb-storage] falling back to localStorage:", error);
      return null;
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const db = await this.ready;
    if (db === null) {
      return this.fallback.get<T>(key);
    }
    const raw = await runRequest<string | undefined>(db, "readonly", (s) =>
      s.get(key),
    );
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await this.ready;
    if (db === null) {
      return this.fallback.set(key, value);
    }
    await runRequest(db, "readwrite", (s) => s.put(JSON.stringify(value), key));
  }

  async delete(key: string): Promise<void> {
    const db = await this.ready;
    if (db === null) {
      return this.fallback.delete(key);
    }
    await runRequest(db, "readwrite", (s) => s.delete(key));
  }

  async keys(prefix = ""): Promise<string[]> {
    const db = await this.ready;
    if (db === null) {
      return this.fallback.keys(prefix);
    }
    const all = await runRequest<IDBValidKey[]>(db, "readonly", (s) =>
      s.getAllKeys(),
    );
    return all.map(String).filter((k) => k.startsWith(prefix));
  }
}
