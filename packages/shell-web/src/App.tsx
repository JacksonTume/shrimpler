// SPDX-License-Identifier: AGPL-3.0-or-later
import { Suspense, lazy, useState } from "react";
import { HomeScreen } from "./screens/HomeScreen";
import { AddonManagerScreen } from "./screens/AddonManagerScreen";
import type { Screen } from "./navigation";

// Dev-only focus spike (§11 Phase 0). Lazy so the chunk is never fetched in
// production, where the toggle is not rendered.
const FocusSpikeScreen = lazy(() =>
  import("./screens/FocusSpikeScreen").then((m) => ({
    default: m.FocusSpikeScreen,
  })),
);

export function App() {
  const [showSpike, setShowSpike] = useState(false);
  // Lightweight state-based routing (no router dependency). Grows a real router
  // when the screen count justifies it.
  const [screen, setScreen] = useState<Screen>("home");

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
      ) : screen === "addons" ? (
        <AddonManagerScreen onNavigate={setScreen} />
      ) : (
        <HomeScreen onNavigate={setScreen} />
      )}
    </>
  );
}
