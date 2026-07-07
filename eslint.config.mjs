// SPDX-License-Identifier: AGPL-3.0-or-later
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "docs/",
      "coverage/",
      "**/*.config.*",
      ".dependency-cruiser.cjs",
    ],
  },
  {
    files: ["packages/**/src/**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Editor-time signal only — dependency-cruiser is the authoritative
    // boundary enforcer (see .dependency-cruiser.cjs and docs/adr/ADR-0001).
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              message: "core must stay renderer-free (ADR-0001).",
            },
            {
              name: "react-dom",
              message: "core must stay renderer-free (ADR-0001).",
            },
          ],
        },
      ],
    },
  },
);
