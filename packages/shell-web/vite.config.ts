// SPDX-License-Identifier: AGPL-3.0-or-later
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// No aliases needed: pnpm workspace resolution maps @shrimpler/* to package
// source via their "exports" fields.
export default defineConfig({
  plugins: [react()],
});
