// SPDX-License-Identifier: AGPL-3.0-or-later
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { IptvRefreshPhase, IptvRefreshProgress, MediaType } from "@shrimpler/core";
import { labels, useIptvRefresh } from "@shrimpler/shared-ui";
import { HomeScreen } from "./screens/HomeScreen";
import { AddonManagerScreen } from "./screens/AddonManagerScreen";
import { DetailScreen } from "./screens/DetailScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { CatalogScreen } from "./screens/CatalogScreen";
import { CategoriesScreen } from "./screens/CategoriesScreen";
import { PlaybackScreen } from "./screens/PlaybackScreen";
import type { Route } from "./navigation";
import { hashToRoute, routeToHash } from "./route-url";

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

function phaseLabel(phase: IptvRefreshPhase | undefined): string {
  switch (phase) {
    case "download":
      return labels.iptvRefreshDownload;
    case "parse":
      return labels.iptvRefreshParse;
    case "categories":
      return labels.iptvRefreshCategories;
    case "streams":
      return labels.iptvRefreshStreams;
    default:
      return labels.iptvRefreshWaiting;
  }
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** A rotating SVG spinner — self-contained (SMIL), no global CSS needed. */
function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="3"
      />
      <path
        d="M12 3 a9 9 0 0 1 9 9"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

/**
 * Non-blocking card shown while IPTV sources refresh in the background. Surfaces
 * the current phase, which source (when several), a progress bar, and elapsed
 * time so a multi-minute Xtream fetch reads as alive, not stuck.
 */
function IptvRefreshIndicator({
  progress,
}: {
  progress: IptvRefreshProgress | null;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const total = progress?.total ?? 0;
  const completed = progress?.completed ?? 0;
  const multi = total > 1;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const detail = [
    phaseLabel(progress?.phase),
    multi ? `${Math.min(completed + 1, total)} of ${total}` : null,
    formatElapsed(elapsed),
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        zIndex: 20,
        width: 260,
        padding: "0.6rem 0.8rem",
        borderRadius: 10,
        background: "rgba(20, 20, 22, 0.92)",
        color: "#fff",
        boxShadow: "0 6px 24px rgba(0, 0, 0, 0.4)",
        pointerEvents: "none",
        fontSize: "0.85rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Spinner />
        <span style={{ fontWeight: 600 }}>{labels.iptvRefreshTitle}</span>
      </div>
      <div
        style={{
          marginTop: "0.35rem",
          opacity: 0.8,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {detail}
      </div>
      {total > 0 && (
        <div
          style={{
            marginTop: "0.5rem",
            height: 4,
            borderRadius: 2,
            background: "rgba(255, 255, 255, 0.18)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "#4ea1ff",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}

export function App({ reloadCore }: AppProps) {
  const [showSpike, setShowSpike] = useState(false);
  // Serve cached IPTV instantly, then refresh sources in the background and
  // rebuild the core if anything changed (ADR-0006).
  const { isRefreshing, progress } = useIptvRefresh(reloadCore);
  // Hash-based routing (route-url.ts): the Route union stays the in-app source of
  // truth, mirrored to `location.hash` so screens are deep-linkable and survive a
  // reload. Initial route is decoded from the current hash.
  const [route, setRoute] = useState<Route>(() =>
    hashToRoute(window.location.hash),
  );
  // navigate() writes the hash we set ourselves; the hashchange listener must
  // ignore that echo and only react to user-driven changes (Back/Forward, edits).
  const selfHash = useRef<string | null>(null);

  const navigate = useCallback((next: Route) => {
    setRoute(next);
    const target = `#${routeToHash(next)}`;
    if (window.location.hash !== target) {
      selfHash.current = target;
      window.location.hash = target; // pushes a history entry for Back/Forward
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      if (selfHash.current === window.location.hash) {
        selfHash.current = null;
        return;
      }
      setRoute(hashToRoute(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <>
      {isRefreshing && <IptvRefreshIndicator progress={progress} />}
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
            onOpen={(id, type) => navigate({ screen: "detail", id, type })}
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
        <AddonManagerScreen onNavigate={navigate} reloadCore={reloadCore} />
      ) : route.screen === "settings" ? (
        <SettingsScreen onNavigate={navigate} reloadCore={reloadCore} />
      ) : route.screen === "search" ? (
        <SearchScreen onNavigate={navigate} />
      ) : route.screen === "categories" ? (
        <CategoriesScreen
          onNavigate={navigate}
          catalogType={route.catalogType}
          catalogId={route.catalogId}
          title={route.title}
        />
      ) : route.screen === "catalog" ? (
        <CatalogScreen
          onNavigate={navigate}
          catalogType={route.catalogType}
          catalogId={route.catalogId}
          title={route.title}
          genre={route.genre}
          total={route.total}
        />
      ) : route.screen === "detail" ? (
        <DetailScreen onNavigate={navigate} id={route.id} type={route.type} />
      ) : route.screen === "player" ? (
        <PlaybackScreen
          onNavigate={navigate}
          source={route.source}
          contentId={route.contentId}
          type={route.type}
          title={route.title}
          poster={route.poster}
          back={route.back}
        />
      ) : (
        <HomeScreen onNavigate={navigate} />
      )}
    </>
  );
}
