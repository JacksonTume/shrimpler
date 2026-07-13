// SPDX-License-Identifier: AGPL-3.0-or-later
// Small deterministic string hash (djb2 → base36). Pure, dependency-free: used
// for stable ids where no natural key exists (M3U channel urls, Xtream account
// keys) and for cheap content signatures (the IPTV snapshot cache compares
// hashes rather than whole bodies).

/** Deterministic djb2 hash of `input`, rendered base36. */
export function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
