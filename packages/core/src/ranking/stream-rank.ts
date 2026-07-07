// SPDX-License-Identifier: AGPL-3.0-or-later
// Stream ranking (§6.3 / ADR-0004): resolution → debrid-cached → seeders →
// source reliability. Reliability is a stub signal (always 0) until there is
// data to base it on; the ordering is a product decision tunable here without
// touching the engine.

import type { PlayableSource } from "../types/sources";

const RESOLUTION_PATTERNS: readonly (readonly [RegExp, number])[] = [
  [/\b(2160p?|4k|uhd)\b/i, 2160],
  [/\b1440p?\b/i, 1440],
  [/\b1080p?\b/i, 1080],
  [/\b720p?\b/i, 720],
  [/\b480p?\b/i, 480],
  [/\b360p?\b/i, 360],
];

/** Vertical resolution parsed from quality/title text; 0 when unknown. */
export function parseResolution(source: PlayableSource): number {
  const haystack = [source.quality, source.title]
    .filter((part): part is string => part !== undefined)
    .join(" ");
  for (const [pattern, resolution] of RESOLUTION_PATTERNS) {
    if (pattern.test(haystack)) {
      return resolution;
    }
  }
  return 0;
}

function reliability(_source: PlayableSource): number {
  // TODO: real per-source reliability once there is telemetry to base it on.
  return 0;
}

/** Non-mutating ADR-0004 sort; ties keep their incoming (install) order. */
export function rankStreams(sources: PlayableSource[]): PlayableSource[] {
  return [...sources].sort((a, b) => {
    const byResolution = parseResolution(b) - parseResolution(a);
    if (byResolution !== 0) {
      return byResolution;
    }
    const byCached = Number(b.cached ?? false) - Number(a.cached ?? false);
    if (byCached !== 0) {
      return byCached;
    }
    const bySeeders = (b.seeders ?? 0) - (a.seeders ?? 0);
    if (bySeeders !== 0) {
      return bySeeders;
    }
    return reliability(b) - reliability(a);
  });
}
