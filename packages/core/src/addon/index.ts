// SPDX-License-Identifier: AGPL-3.0-or-later
// Addon engine (§6): protocol client, manifest parsing, resource clients,
// fan-out with per-addon timeouts and partial-failure isolation.
export type { AddonEngine } from "./engine";
export type { InternalAddon } from "./internal-addon";
export { createAddonEngine, DEFAULT_ADDON_TIMEOUTS } from "./create-engine";
export type {
  AddonEngineDeps,
  AddonEngineError,
  AddonEngineErrorHandler,
  AddonEngineTimeouts,
} from "./create-engine";
export {
  AddonInstallError,
  normalizeManifestUrl,
  parseManifest,
  servesResource,
} from "./manifest";
export { AddonTimeoutError } from "./timeout";
