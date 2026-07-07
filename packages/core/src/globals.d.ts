// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal host-timer declarations. setTimeout/clearTimeout exist in every
// supported runtime (Node, browsers, TV webviews) but are host globals, not
// part of the ES lib — and core deliberately compiles without the DOM lib
// (§2.2). Declaring the narrow surface we use keeps core's timeout
// enforcement possible without widening the lib.

declare function setTimeout(handler: () => void, timeout?: number): unknown;
declare function clearTimeout(handle: unknown): void;
