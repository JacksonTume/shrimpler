// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          environment: "node",
          include: ["packages/core/src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "shell-web",
          environment: "jsdom",
          include: ["packages/shell-web/src/**/*.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "shared-ui",
          environment: "jsdom",
          include: ["packages/shared-ui/src/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
