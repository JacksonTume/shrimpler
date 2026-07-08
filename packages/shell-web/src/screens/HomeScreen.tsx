// SPDX-License-Identifier: AGPL-3.0-or-later
// Home screen. Empty-by-default per §9.1: no sources, no suggestions — the user
// supplies everything. Its interactive elements route to the addon manager and
// the settings screen.

import { useEffect } from "react";
import type { CSSProperties } from "react";
import { labels, useContinueWatching } from "@shrimpler/shared-ui";
import type { ProgressEntry } from "@shrimpler/core";
import { FocusContext, setFocus, useFocusable } from "../focus";
import type { NavigationProps } from "../navigation";

const SCREEN_FOCUS_KEY = "HOME";
const SEARCH_FOCUS_KEY = "HOME_SEARCH";
const ADD_FOCUS_KEY = "HOME_ADD";
const SETTINGS_FOCUS_KEY = "HOME_SETTINGS";

const focusOutline = (focused: boolean): CSSProperties => ({
  outline: focused ? "2px solid #fff" : "2px solid transparent",
  display: "block",
});

function HomeButton({
  focusKey,
  label,
  onPress,
}: {
  focusKey: string;
  label: string;
  onPress: () => void;
}) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    focusKey,
    onEnterPress: onPress,
  });
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused}
      onClick={onPress}
      style={focusOutline(focused)}
    >
      {label}
    </button>
  );
}

function progressPercent(entry: ProgressEntry): number {
  if (entry.durationSec <= 0) {
    return 0;
  }
  return Math.min(
    100,
    Math.round((entry.positionSec / entry.durationSec) * 100),
  );
}

function ContinueWatchingCard({
  entry,
  onOpen,
}: {
  entry: ProgressEntry;
  onOpen: (entry: ProgressEntry) => void;
}) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => onOpen(entry),
  });
  const episodeTag =
    entry.season !== undefined && entry.episode !== undefined
      ? ` · S${entry.season}E${entry.episode}`
      : "";
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused}
      onClick={() => onOpen(entry)}
      style={{
        ...focusOutline(focused),
        width: "160px",
        textAlign: "left",
        padding: 0,
      }}
    >
      {entry.poster !== undefined && (
        <img
          src={entry.poster}
          alt=""
          style={{ width: "100%", display: "block" }}
        />
      )}
      <span style={{ display: "block", padding: "0.25rem" }}>
        {entry.name ?? entry.id}
        {episodeTag}
      </span>
      <span
        aria-hidden
        style={{
          display: "block",
          height: "3px",
          margin: "0 0.25rem",
          background: "#555",
        }}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${progressPercent(entry)}%`,
            background: "#fff",
          }}
        />
      </span>
    </button>
  );
}

function ContinueWatchingSection({ onNavigate }: NavigationProps) {
  const { entries, isLoading } = useContinueWatching();
  if (isLoading || entries.length === 0) {
    return null;
  }
  return (
    <section>
      <h2>{labels.continueWatching}</h2>
      <div style={{ display: "flex", gap: "0.75rem", overflowX: "auto" }}>
        {entries.map((entry) => (
          <ContinueWatchingCard
            key={entry.id}
            entry={entry}
            onOpen={(e) =>
              onNavigate({ screen: "detail", id: e.id, type: e.type })
            }
          />
        ))}
      </div>
    </section>
  );
}

export function HomeScreen({ onNavigate }: NavigationProps) {
  const { ref, focusKey } = useFocusable<object, HTMLElement>({
    focusKey: SCREEN_FOCUS_KEY,
    saveLastFocusedChild: true,
  });

  useEffect(() => {
    void setFocus(SEARCH_FOCUS_KEY);
  }, []);

  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref}>
        <h1>{labels.appName}</h1>
        <p>{labels.tagline}</p>
        <ContinueWatchingSection onNavigate={onNavigate} />
        <section>
          <h2>{labels.emptyHome}</h2>
          <p>{labels.emptyHomeHint}</p>
          <HomeButton
            focusKey={SEARCH_FOCUS_KEY}
            label={labels.searchTitle}
            onPress={() => onNavigate({ screen: "search" })}
          />
          <HomeButton
            focusKey={ADD_FOCUS_KEY}
            label={labels.addPlaylist}
            onPress={() => onNavigate({ screen: "addons" })}
          />
          <HomeButton
            focusKey={SETTINGS_FOCUS_KEY}
            label={labels.settings}
            onPress={() => onNavigate({ screen: "settings" })}
          />
        </section>
        <footer>
          <small>{labels.disclaimer}</small>
        </footer>
      </main>
    </FocusContext.Provider>
  );
}
