// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useRef, useState } from "react";
import type { IptvRefreshPhase, IptvRefreshProgress } from "@shrimpler/core";
import { labels, useIptvRefresh } from "@shrimpler/shared-ui";
import { HomeScreen } from "./screens/HomeScreen";
import { AddonManagerScreen } from "./screens/AddonManagerScreen";
import { DetailScreen } from "./screens/DetailScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { CatalogScreen } from "./screens/CatalogScreen";
import { CategoriesScreen } from "./screens/CategoriesScreen";
import { PlaybackScreen } from "./screens/PlaybackScreen";
import { Spinner, TideBar } from "./ui";
import type { Route } from "./navigation";
import { hashToRoute, routeToHash } from "./route-url";
import { isIptvEnabled } from "./features";

/** Screens that only exist for IPTV content (the catalog drill-down). */
const IPTV_SCREENS: ReadonlySet<Route["screen"]> = new Set([
  "categories",
  "catalog",
]);

/**
 * Send IPTV-only routes home while the subsystem is gated off (features.ts), so
 * a stale bookmark or a hash left in the address bar can't land on a screen whose
 * catalogs no longer exist.
 */
function allowedRoute(route: Route): Route {
  return !isIptvEnabled() && IPTV_SCREENS.has(route.screen)
    ? { screen: "home" }
    : route;
}

export interface AppProps {
  /** Rebuilds the composed Core (used by Settings to apply a new TMDB key). */
  reloadCore: () => Promise<void>;
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
        padding: "0.7rem 0.85rem",
        borderRadius: "var(--r-md)",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        color: "var(--sand)",
        boxShadow: "var(--shadow)",
        pointerEvents: "none",
        fontSize: "var(--fs-small)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Spinner />
        <span style={{ fontWeight: 600 }}>{labels.iptvRefreshTitle}</span>
      </div>
      <div
        style={{
          marginTop: "0.35rem",
          color: "var(--sand-dim)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {detail}
      </div>
      {total > 0 && (
        <TideBar
          value={total > 0 ? completed / total : 0}
          style={{ marginTop: "0.5rem" }}
        />
      )}
    </div>
  );
}

export function App({ reloadCore }: AppProps) {
  // Serve cached IPTV instantly, then refresh sources in the background and
  // rebuild the core if anything changed (ADR-0006). Gated off, core's refresh is
  // an immediate no-op — the hook still runs (hook rules) but never fetches, and
  // the indicator stays hidden rather than flashing on every mount.
  const iptvEnabled = isIptvEnabled();
  const { isRefreshing, progress } = useIptvRefresh(reloadCore);
  // Hash-based routing (route-url.ts): the Route union stays the in-app source of
  // truth, mirrored to `location.hash` so screens are deep-linkable and survive a
  // reload. Initial route is decoded from the current hash.
  const [route, setRoute] = useState<Route>(() =>
    allowedRoute(hashToRoute(window.location.hash)),
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
      setRoute(allowedRoute(hashToRoute(window.location.hash)));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <>
      {iptvEnabled && isRefreshing && (
        <IptvRefreshIndicator progress={progress} />
      )}
      {route.screen === "addons" ? (
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
