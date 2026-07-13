// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.2 — the RN implementation of StorageAdapter, backed by AsyncStorage.
// Mirrors the web shell's WebStorageAdapter (same `shrimpler:` prefix + JSON
// encoding) so the two shells persist settings identically. AsyncStorage is
// natively async, so the Promise-returning contract maps straight through with
// no wrapping. Large datasets (EPG/cache) can move to MMKV later (§7.2).

import type { StorageAdapter } from "@shrimpler/core";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "shrimpler:";

export class RnStorageAdapter implements StorageAdapter {
  async get<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_PREFIX + key);
  }

  async keys(prefix = ""): Promise<string[]> {
    const all = await AsyncStorage.getAllKeys();
    const full = STORAGE_PREFIX + prefix;
    return all
      .filter((key) => key.startsWith(full))
      .map((key) => key.slice(STORAGE_PREFIX.length));
  }
}
