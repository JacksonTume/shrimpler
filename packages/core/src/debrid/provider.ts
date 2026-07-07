// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.4 — Debrid resolver. Collapses the "torrent" case into the "direct
// URL" case so the player layer never sees a magnet in v1 (ADR-0005).

export interface DebridProvider {
  readonly id: string;
  resolve(input: {
    magnet?: string;
    infoHash?: string;
    url?: string;
    fileIdx?: number;
  }): Promise<{ url: string; cached: boolean } | null>;
  checkCached?(infoHashes: string[]): Promise<Record<string, boolean>>;
}
