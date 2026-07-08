// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §3 / §7.3 — the bridge between a shell's composition root and the shared
// view-models. The shell wires a concrete Core (composition root) and provides
// it here; view-model hooks read it via useCore(). Holds the whole Core so
// future hooks reach every namespace (addons, and later metadata/debrid/library).

import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";
import type { Core } from "@shrimpler/core";

const CoreContext = createContext<Core | null>(null);

export function CoreProvider({
  core,
  children,
}: {
  core: Core;
  children: ReactNode;
}) {
  return createElement(CoreContext.Provider, { value: core }, children);
}

/** Reach the shell-provided Core. Throws if used outside a CoreProvider. */
export function useCore(): Core {
  const core = useContext(CoreContext);
  if (core === null) {
    throw new Error("useCore must be used within a <CoreProvider>.");
  }
  return core;
}
