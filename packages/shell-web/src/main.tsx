// SPDX-License-Identifier: AGPL-3.0-or-later
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CoreProvider } from "@shrimpler/shared-ui";
import { App } from "./App";
import { createWebCore } from "./composition-root";
import { initBackHandling, initFocusEngine } from "./focus";

initFocusEngine();
initBackHandling();

// Bootstrap: the core loads persisted addon state asynchronously, so we await
// it before first render and hand it to the tree via CoreProvider.
async function bootstrap(): Promise<void> {
  const core = await createWebCore();

  const container = document.getElementById("root");
  if (container === null) {
    throw new Error("Missing #root element");
  }

  createRoot(container).render(
    <StrictMode>
      <CoreProvider core={core}>
        <App />
      </CoreProvider>
    </StrictMode>,
  );
}

void bootstrap();
