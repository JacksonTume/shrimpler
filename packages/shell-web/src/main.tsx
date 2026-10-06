// SPDX-License-Identifier: AGPL-3.0-or-later
import "./ui/theme.css";
import { StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { CoreProvider } from "@shrimpler/shared-ui";
import type { Core } from "@shrimpler/core";
import { App } from "./App";
import { createWebCore } from "./composition-root";
import { initBackHandling, initFocusEngine } from "./focus";
import { applyReefTokens } from "./ui/tokens";

// Shared Reef palette + radii onto :root before anything renders (ADR-0016).
applyReefTokens();
initFocusEngine();
initBackHandling();

// Root owns the composed Core in state so a settings change (e.g. the TMDB key)
// can rebuild it: createCore takes its providers at construction, so applying a
// new key means composing a fresh Core and swapping the CoreProvider value.
// Addon state and the metadata cache are storage-backed, so a rebuild is cheap
// and loses nothing.
function Root({ initialCore }: { initialCore: Core }) {
  const [core, setCore] = useState<Core>(initialCore);
  const reloadCore = useCallback(async (): Promise<void> => {
    setCore(await createWebCore());
  }, []);

  return (
    <CoreProvider core={core}>
      <App reloadCore={reloadCore} />
    </CoreProvider>
  );
}

// Bootstrap: the core loads persisted addon state (and the stored TMDB key)
// asynchronously, so we await it before first render and hand it to the tree.
async function bootstrap(): Promise<void> {
  const core = await createWebCore();

  const container = document.getElementById("root");
  if (container === null) {
    throw new Error("Missing #root element");
  }

  createRoot(container).render(
    <StrictMode>
      <Root initialCore={core} />
    </StrictMode>,
  );
}

void bootstrap();
