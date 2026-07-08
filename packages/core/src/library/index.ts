// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §3 — Library/state: continue-watching (watchlist + installed sources
// later). Persisted via the injected StorageAdapter (ADR-0014).
export { createLibrary } from "./create-library";
export type {
  Library,
  LibraryDeps,
  ProgressEntry,
  ProgressInput,
} from "./create-library";
