// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reefColor } from "@shrimpler/shared-ui";
import indexHtml from "../../index.html?raw";
import { applyReefTokens, reefCssVars } from "./tokens";

// Vitest blanks CSS imports (even `?raw`), so theme.css is read from disk
// (a path, not a URL: jsdom replaces the global URL class node:fs checks for).
const themeCss = readFileSync(join(import.meta.dirname, "theme.css"), "utf8");

// Every shell-web TS source that can reference a CSS custom property.
const sources: Record<string, string> = {
  ...import.meta.glob<string>("../**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  "./theme.css": themeCss,
};

/** Prose like "`var(--token)` styles" in comments isn't a real reference. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("Reef tokens (ADR-0016)", () => {
  it("maps shared token names onto the CSS custom properties theme.css uses", () => {
    const vars = reefCssVars();
    expect(vars["--bg"]).toBe(reefColor.bg);
    expect(vars["--surface-2"]).toBe(reefColor.surface2);
    expect(vars["--coral-deep"]).toBe(reefColor.coralDeep);
    expect(vars["--sand-faint"]).toBe(reefColor.sandFaint);
    expect(vars["--r-pill"]).toBe("999px");
    expect(vars["--coral-rgb"]).toBe("255, 110, 90");
  });

  it("writes every shared token onto the root element", () => {
    const root = document.createElement("html");
    applyReefTokens(root);
    for (const [name, value] of Object.entries(reefCssVars())) {
      expect(root.style.getPropertyValue(name)).toBe(value);
    }
  });

  it("defines every var(--…) referenced anywhere in the shell", () => {
    const declaredInCss = [
      ...themeCss.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm),
    ].map((m) => m[1]);
    const defined = new Set([...Object.keys(reefCssVars()), ...declaredInCss]);
    const undefinedRefs = Object.entries(sources).flatMap(([file, text]) =>
      [...stripComments(text).matchAll(/var\((--[a-z0-9-]+)/g)]
        .map((m) => m[1])
        .filter((name) => !defined.has(name))
        .map((name) => `${file}: ${name}`),
    );
    expect(undefinedRefs).toEqual([]);
  });

  it("keeps the shared palette out of theme.css (single source)", () => {
    const declaredInCss = new Set(
      [...themeCss.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
    );
    const duplicated = Object.keys(reefCssVars()).filter((name) =>
      declaredInCss.has(name),
    );
    expect(duplicated).toEqual([]);
  });

  it("matches index.html's pre-JS paint colour to the shared bg", () => {
    // index.html can't import TS, so it carries a literal for the first paint.
    const literals = indexHtml.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(literals.length).toBeGreaterThan(0);
    for (const hex of literals) expect(hex.toLowerCase()).toBe(reefColor.bg);
  });
});
