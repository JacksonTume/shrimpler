// SPDX-License-Identifier: AGPL-3.0-or-later
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createWebCore } from "./composition-root";
import { initBackHandling, initFocusEngine } from "./focus";

const core = createWebCore();
// TODO(Phase 1): hand `core` to the tree via React context instead of this
// placeholder reference.
void core;

initFocusEngine();
initBackHandling();

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Missing #root element");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
