// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="vite/client" />

// Typed env vars (augments vite/client's ImportMetaEnv). User-supplied and
// never committed — see .env.example and composition-root.ts.
interface ImportMetaEnv {
  readonly VITE_TMDB_API_KEY?: string;
  readonly VITE_REALDEBRID_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
