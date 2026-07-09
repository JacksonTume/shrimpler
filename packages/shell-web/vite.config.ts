// SPDX-License-Identifier: AGPL-3.0-or-later
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// No aliases needed: pnpm workspace resolution maps @shrimpler/* to package
// source via their "exports" fields.
export default defineConfig({
  plugins: [react()],
  build: {
    // hls.js (~0.5 MB) is dynamically imported into its own chunk and fetched
    // only when a live stream plays (see players/hls-engine.ts), so its size is
    // intentional and off the initial load path — lift the warning above it.
    chunkSizeWarningLimit: 600,
  },
});
