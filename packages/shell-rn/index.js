// SPDX-License-Identifier: AGPL-3.0-or-later
// Expo entry point. Metro (not Node) bundles this, so ESM import + the JSX-free
// registration below are fine. The typed root component lives in App.tsx.
import { registerRootComponent } from "expo";

import { App } from "./App";

registerRootComponent(App);
