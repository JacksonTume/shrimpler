// SPDX-License-Identifier: AGPL-3.0-or-later
// Detail screen (§4.2, §10 step 3): the first UI consumer of core.metadata.
// Shows resolved MetaDetail (addon-meta-first, TMDB gap-fill — ADR-0003) and,
// for series, the episode list grouped by season. Display-only for now: the
// primary action (stream picker / playback) is a separate roadmap item, so
// episode rows are focusable but inert. Copy routes through the labels module
// (§9.2 / ADR-0007); focus follows the AddonManagerScreen conventions.

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { labels, useDetail } from "@shrimpler/shared-ui";
import type {
  ContentId,
  EpisodeRef,
  MediaType,
  PlayableSource,
} from "@shrimpler/core";
import { FocusContext, setFocus, useBackHandler, useFocusable } from "../focus";
import { BackButton } from "../components/BackButton";
import { StreamPickerOverlay } from "../components/StreamPickerOverlay";
import type { NavigationProps } from "../navigation";

const SCREEN_FOCUS_KEY = "DETAIL";
const BACK_FOCUS_KEY = "DETAIL_BACK";

const focusOutline = (focused: boolean): CSSProperties => ({
  outline: focused ? "2px solid #fff" : "2px solid transparent",
});

interface DetailScreenProps extends NavigationProps {
  id: ContentId;
  type: MediaType;
}

function seasonsOf(episodes: readonly EpisodeRef[]): number[] {
  const seasons = new Set<number>();
  for (const episode of episodes) {
    seasons.add(episode.season);
  }
  return [...seasons].sort((a, b) => a - b);
}

function SeasonTab({
  season,
  active,
  onSelect,
}: {
  season: number;
  active: boolean;
  onSelect: (season: number) => void;
}) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => onSelect(season),
  });
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused}
      aria-pressed={active}
      onClick={() => onSelect(season)}
      style={{
        ...focusOutline(focused),
        fontWeight: active ? "bold" : "normal",
      }}
    >
      {labels.seasonLabel} {season}
    </button>
  );
}

function EpisodeRow({
  episode,
  onPlay,
}: {
  episode: EpisodeRef;
  onPlay: (id: ContentId) => void;
}) {
  const { ref, focused } = useFocusable<object, HTMLLIElement>({
    onEnterPress: () => onPlay(episode.id),
  });
  return (
    <li
      ref={ref}
      data-focused={focused}
      data-episode={episode.id}
      onClick={() => onPlay(episode.id)}
      style={{
        ...focusOutline(focused),
        padding: "0.5rem 0",
        cursor: "pointer",
      }}
    >
      <strong>
        {episode.episode}
        {episode.name !== undefined ? `. ${episode.name}` : ""}
      </strong>
      {episode.overview !== undefined && <p>{episode.overview}</p>}
    </li>
  );
}

function EpisodesSection({
  episodes,
  onPlay,
}: {
  episodes: readonly EpisodeRef[];
  onPlay: (id: ContentId) => void;
}) {
  const seasons = seasonsOf(episodes);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  // Reset the manual selection when the episode set changes (e.g. a new series
  // opened in the same screen instance); the effective season falls back to the
  // first one below.
  useEffect(() => {
    setSelectedSeason(null);
  }, [episodes]);

  // Never show every season at once — default to the first until the user picks.
  const activeSeason = selectedSeason ?? seasons[0] ?? null;
  const visible =
    activeSeason === null
      ? episodes
      : episodes.filter((e) => e.season === activeSeason);

  return (
    <section>
      <h2>{labels.episodesTitle}</h2>
      {seasons.length > 1 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {seasons.map((season) => (
            <SeasonTab
              key={season}
              season={season}
              active={season === activeSeason}
              onSelect={setSelectedSeason}
            />
          ))}
        </div>
      )}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {visible.map((episode) => (
          <EpisodeRow key={episode.id} episode={episode} onPlay={onPlay} />
        ))}
      </ul>
    </section>
  );
}

export function DetailScreen({ onNavigate, id, type }: DetailScreenProps) {
  const { detail, episodes, isLoading, error, hasProvider } = useDetail(
    id,
    type,
  );
  const { ref, focusKey } = useFocusable<object, HTMLElement>({
    focusKey: SCREEN_FOCUS_KEY,
    saveLastFocusedChild: true,
  });

  // Which content the stream picker overlay is open for (null = closed). A movie
  // opens on its own id; a series opens per episode.
  const [picker, setPicker] = useState<{
    id: ContentId;
    type: MediaType;
  } | null>(null);
  const openPicker = useCallback(
    (pickId: ContentId, pickType: MediaType) =>
      setPicker({ id: pickId, type: pickType }),
    [],
  );
  const closePicker = useCallback(() => setPicker(null), []);
  const handlePlay = useCallback(
    (source: PlayableSource, contentId: ContentId, contentType: MediaType) => {
      onNavigate({
        screen: "player",
        source,
        contentId,
        type: contentType,
        // Display snapshot for the continue-watching row (the show name/poster
        // for a series episode too).
        title: detail?.name,
        poster: detail?.poster,
        back: { screen: "detail", id, type },
      });
    },
    [onNavigate, id, type, detail?.name, detail?.poster],
  );

  const playButton = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => openPicker(id, "movie"),
  });

  const goHome = () => onNavigate({ screen: "home" });
  useBackHandler(goHome);

  useEffect(() => {
    void setFocus(BACK_FOCUS_KEY);
  }, []);

  const metaLine =
    detail === null
      ? []
      : [
          detail.released ?? detail.releaseInfo,
          detail.runtime,
          detail.imdbRating !== undefined
            ? `★ ${detail.imdbRating}`
            : undefined,
        ].filter((part): part is string => part !== undefined && part !== "");

  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref} style={{ padding: "1rem" }}>
        <header style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <BackButton onBack={goHome} focusKey={BACK_FOCUS_KEY} />
          {detail !== null && <h1>{detail.name}</h1>}
        </header>

        {isLoading ? (
          <p>{labels.detailLoading}</p>
        ) : error !== null ? (
          <p role="alert" style={{ color: "#e66" }}>
            {error}
          </p>
        ) : detail === null ? (
          <>
            <p>{labels.detailEmpty}</p>
            {!hasProvider && <p>{labels.detailNoProviderHint}</p>}
          </>
        ) : (
          <>
            {detail.background !== undefined && (
              <img
                src={detail.background}
                alt=""
                style={{ maxWidth: "100%", display: "block" }}
              />
            )}
            {detail.poster !== undefined && (
              <img
                src={detail.poster}
                alt=""
                style={{ maxWidth: "200px", display: "block" }}
              />
            )}
            {metaLine.length > 0 && <p>{metaLine.join(" · ")}</p>}
            {type === "movie" && (
              <button
                ref={playButton.ref}
                type="button"
                data-focused={playButton.focused}
                onClick={() => openPicker(id, "movie")}
                style={focusOutline(playButton.focused)}
              >
                {labels.play}
              </button>
            )}
            {detail.genres !== undefined && detail.genres.length > 0 && (
              <p>
                {labels.genresTitle}: {detail.genres.join(", ")}
              </p>
            )}
            {detail.description !== undefined && <p>{detail.description}</p>}
            {detail.cast !== undefined && detail.cast.length > 0 && (
              <p>
                {labels.castTitle}: {detail.cast.join(", ")}
              </p>
            )}
            {episodes.length > 0 && (
              <EpisodesSection
                episodes={episodes}
                onPlay={(episodeId) => openPicker(episodeId, "series")}
              />
            )}
          </>
        )}
      </main>
      {picker !== null && (
        <StreamPickerOverlay
          id={picker.id}
          type={picker.type}
          onClose={closePicker}
          onPlay={handlePlay}
        />
      )}
    </FocusContext.Provider>
  );
}
