// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.2 — StorageAdapter. RN-TV: MMKV/AsyncStorage. Web: IndexedDB + localStorage.

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}
