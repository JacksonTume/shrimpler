// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Enforces the §2.2 core-purity invariant from docs/TECHNICAL_SPEC.md:
 * core never imports from a shell, shared-ui, or any npm package at all.
 * DOM *globals* in core are caught separately by its tsconfig ("lib": ["ES2022"]).
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies make the layered model unmaintainable.",
      from: {},
      to: { circular: true },
    },
    {
      name: "core-not-to-shells-or-ui",
      severity: "error",
      comment:
        "core is the pure-TS brain; dependency direction is shell → core only (§2.3). " +
        "The shell- prefix also covers future shells (shell-rn).",
      from: { path: "^packages/core" },
      to: { path: "^packages/(shell-|shared-ui)" },
    },
    {
      name: "core-no-external-deps",
      severity: "error",
      comment:
        "core declares zero runtime dependencies — it may not import anything " +
        "from node_modules (React, DOM libs, fetch polyfills, player SDKs, …).",
      from: { path: "^packages/core/src" },
      to: { path: "node_modules" },
    },
    {
      name: "shared-ui-not-to-shells",
      severity: "error",
      comment:
        "shared-ui may depend on core and React, but never on a shell (§3).",
      from: { path: "^packages/shared-ui" },
      to: { path: "^packages/shell-" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    // Tests and build output (Vite chunks legitimately cross-reference) are
    // not part of the source graph.
    exclude: { path: ["\\.test\\.tsx?$", "(^|/)dist/"] },
  },
};
