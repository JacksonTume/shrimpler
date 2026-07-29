// SPDX-License-Identifier: AGPL-3.0-or-later
// Home screen. Empty-by-default per §9.1: no sources, no suggestions — the user
// supplies everything. A wordmark hero, the continue-watching rail (when there is
// progress), and the primary navigation as tiles into search, live/movies/series
// browse, the source manager, and settings.

import { useEffect } from "react";
import { labels, useContinueWatching } from "@shrimpler/shared-ui";
import type { ProgressEntry } from "@shrimpler/core";
import { setFocus } from "../focus";
import { Button, Card, PosterCard, Rail, Screen, Wordmark } from "../ui";
import type { NavigationProps } from "../navigation";
import { isIptvEnabled } from "../features";

const SCREEN_FOCUS_KEY = "HOME";
const SEARCH_FOCUS_KEY = "HOME_SEARCH";
const LIVE_FOCUS_KEY = "HOME_LIVE";
const MOVIES_FOCUS_KEY = "HOME_MOVIES";
const SERIES_FOCUS_KEY = "HOME_SERIES";
const ADD_FOCUS_KEY = "HOME_ADD";
const SETTINGS_FOCUS_KEY = "HOME_SETTINGS";

function progressFraction(entry: ProgressEntry): number {
  if (entry.durationSec <= 0) {
    return 0;
  }
  return Math.min(1, entry.positionSec / entry.durationSec);
}

function episodeTag(entry: ProgressEntry): string {
  return entry.season !== undefined && entry.episode !== undefined
    ? ` · S${entry.season}E${entry.episode}`
    : "";
}

function ContinueWatchingSection({ onNavigate }: NavigationProps) {
  const { entries, isLoading } = useContinueWatching();
  if (isLoading || entries.length === 0) {
    return null;
  }
  return (
    <Rail title={labels.continueWatching}>
      {entries.map((entry) => (
        <PosterCard
          key={entry.id}
          title={`${entry.name ?? entry.id}${episodeTag(entry)}`}
          poster={entry.poster}
          progress={progressFraction(entry)}
          width={168}
          onPress={() =>
            onNavigate({ screen: "detail", id: entry.id, type: entry.type })
          }
        />
      ))}
    </Rail>
  );
}

const tileStyle = { flex: "1 1 160px" } as const;
const tileRowStyle = { display: "flex", flexWrap: "wrap", gap: "0.75rem" } as const;
const groupHintStyle = {
  margin: "-0.35rem 0 1rem",
  color: "var(--sand-dim)",
} as const;

/** IPTV browse tiles. Rendered only while the subsystem is on (features.ts). */
function LiveTvSection({ onNavigate }: NavigationProps) {
  return (
    <Card title={labels.homeLiveGroup}>
      <p style={groupHintStyle}>{labels.homeLiveHint}</p>
      <div style={tileRowStyle}>
        <Button
          variant="subtle"
          focusKey={LIVE_FOCUS_KEY}
          style={tileStyle}
          onPress={() =>
            onNavigate({
              screen: "categories",
              catalogType: "tv",
              catalogId: "iptv:live",
              title: labels.liveTv,
            })
          }
        >
          {labels.liveTv}
        </Button>
        <Button
          variant="subtle"
          focusKey={MOVIES_FOCUS_KEY}
          style={tileStyle}
          onPress={() =>
            onNavigate({
              screen: "categories",
              catalogType: "movie",
              catalogId: "iptv:movies",
              title: labels.moviesTitle,
            })
          }
        >
          {labels.moviesTitle}
        </Button>
        <Button
          variant="subtle"
          focusKey={SERIES_FOCUS_KEY}
          style={tileStyle}
          onPress={() =>
            onNavigate({
              screen: "categories",
              catalogType: "series",
              catalogId: "iptv:series",
              title: labels.seriesTitle,
            })
          }
        >
          {labels.seriesTitle}
        </Button>
      </div>
    </Card>
  );
}

export function HomeScreen({ onNavigate }: NavigationProps) {
  useEffect(() => {
    void setFocus(SEARCH_FOCUS_KEY);
  }, []);

  const hero = (
    <div style={{ margin: "1.5rem 0 2.5rem" }}>
      <Wordmark size="var(--fs-display)" />
      <p style={{ marginTop: "0.5rem", color: "var(--sand-dim)" }}>
        {labels.tagline}
      </p>
    </div>
  );

  return (
    <Screen focusKey={SCREEN_FOCUS_KEY} hero={hero}>
      <ContinueWatchingSection onNavigate={onNavigate} />

      <Card title={labels.homeAddonsGroup}>
        <p style={groupHintStyle}>{labels.homeAddonsHint}</p>
        <div style={tileRowStyle}>
          <Button
            variant="primary"
            focusKey={SEARCH_FOCUS_KEY}
            style={tileStyle}
            onPress={() => onNavigate({ screen: "search" })}
          >
            {labels.searchTitle}
          </Button>
        </div>
      </Card>

      {isIptvEnabled() && <LiveTvSection onNavigate={onNavigate} />}

      <div style={tileRowStyle}>
        <Button
          variant="ghost"
          focusKey={ADD_FOCUS_KEY}
          style={tileStyle}
          onPress={() => onNavigate({ screen: "addons" })}
        >
          {labels.addPlaylist}
        </Button>
        <Button
          variant="ghost"
          focusKey={SETTINGS_FOCUS_KEY}
          style={tileStyle}
          onPress={() => onNavigate({ screen: "settings" })}
        >
          {labels.settings}
        </Button>
      </div>

      <footer style={{ marginTop: "3rem" }}>
        <small style={{ color: "var(--sand-faint)", fontSize: "var(--fs-caption)" }}>
          {labels.disclaimer}
        </small>
      </footer>
    </Screen>
  );
}
