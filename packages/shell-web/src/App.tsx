// SPDX-License-Identifier: AGPL-3.0-or-later
import { Suspense, lazy, useState } from "react";
import type { FormEvent } from "react";
import type { MediaType } from "@shrimpler/core";
import { HomeScreen } from "./screens/HomeScreen";
import { AddonManagerScreen } from "./screens/AddonManagerScreen";
import { DetailScreen } from "./screens/DetailScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SearchScreen } from "./screens/SearchScreen";
import type { Route } from "./navigation";

// Dev-only focus spike (§11 Phase 0). Lazy so the chunk is never fetched in
// production, where the toggle is not rendered.
const FocusSpikeScreen = lazy(() =>
  import("./screens/FocusSpikeScreen").then((m) => ({
    default: m.FocusSpikeScreen,
  })),
);

export interface AppProps {
  /** Rebuilds the composed Core (used by Settings to apply a new TMDB key). */
  reloadCore: () => Promise<void>;
}

// Dev-only entry point for the detail screen. There is no browse/catalog screen
// yet (Phase 3), so this lets a developer open a detail by typing an id + type.
// Ships nothing to production and hard-codes no ids (neutrality, §9.1).
function OpenByIdControl({
  onOpen,
}: {
  onOpen: (id: string, type: MediaType) => void;
}) {
  const [id, setId] = useState("");
  const [type, setType] = useState<"movie" | "series">("movie");

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = id.trim();
    if (trimmed !== "") {
      onOpen(trimmed, type);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "0.25rem" }}>
      <input
        aria-label="content id"
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="content id"
      />
      <select
        aria-label="content type"
        value={type}
        onChange={(e) => setType(e.target.value as "movie" | "series")}
      >
        <option value="movie">movie</option>
        <option value="series">series</option>
      </select>
      <button type="submit">Open</button>
    </form>
  );
}

export function App({ reloadCore }: AppProps) {
  const [showSpike, setShowSpike] = useState(false);
  // Lightweight state-based routing (no router dependency). Routes are a
  // discriminated union (see navigation.ts) so the detail route carries its
  // content id + type. Grows a real router when the screen count justifies it.
  const [route, setRoute] = useState<Route>({ screen: "home" });

  return (
    <>
      {import.meta.env.DEV && (
        <div
          style={{
            position: "fixed",
            top: 8,
            right: 8,
            zIndex: 10,
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <OpenByIdControl
            onOpen={(id, type) => setRoute({ screen: "detail", id, type })}
          />
          <button type="button" onClick={() => setShowSpike((s) => !s)}>
            {showSpike ? "Show home" : "Show focus spike"}
          </button>
        </div>
      )}
      {showSpike ? (
        <Suspense fallback={null}>
          <FocusSpikeScreen />
        </Suspense>
      ) : route.screen === "addons" ? (
        <AddonManagerScreen onNavigate={setRoute} />
      ) : route.screen === "settings" ? (
        <SettingsScreen onNavigate={setRoute} reloadCore={reloadCore} />
      ) : route.screen === "search" ? (
        <SearchScreen onNavigate={setRoute} />
      ) : route.screen === "detail" ? (
        <DetailScreen onNavigate={setRoute} id={route.id} type={route.type} />
      ) : (
        <HomeScreen onNavigate={setRoute} />
      )}
    </>
  );
}
