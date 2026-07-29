// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="vite/client" />

// Typed env vars (augments vite/client's ImportMetaEnv). User-supplied and
// never committed — see .env.example and composition-root.ts.
interface ImportMetaEnv {
  readonly VITE_TMDB_API_KEY?: string;
  readonly VITE_REALDEBRID_TOKEN?: string;
  /** Opt in to the IPTV/EPG subsystem ("true"); off otherwise — see features.ts. */
  readonly VITE_IPTV_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
