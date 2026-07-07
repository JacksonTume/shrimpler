// SPDX-License-Identifier: AGPL-3.0-or-later
import { Suspense, lazy, useState } from "react";
import { HomeScreen } from "./screens/HomeScreen";

// Dev-only focus spike (§11 Phase 0). Lazy so the chunk is never fetched in
// production, where the toggle is not rendered.
const FocusSpikeScreen = lazy(() =>
  import("./screens/FocusSpikeScreen").then((m) => ({
    default: m.FocusSpikeScreen,
  })),
);

export function App() {
  const [showSpike, setShowSpike] = useState(false);
  // TODO(Phase 1): route between screens; provide the core instance via React
  // context so shared-ui view-models can reach it.
  return (
    <>
      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={() => setShowSpike((s) => !s)}
          style={{ position: "fixed", top: 8, right: 8, zIndex: 10 }}
        >
          {showSpike ? "Show home" : "Show focus spike"}
        </button>
      )}
      {showSpike ? (
        <Suspense fallback={null}>
          <FocusSpikeScreen />
        </Suspense>
      ) : (
        <HomeScreen />
      )}
    </>
  );
}
