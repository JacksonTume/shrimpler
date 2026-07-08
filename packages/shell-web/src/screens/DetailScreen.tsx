// SPDX-License-Identifier: AGPL-3.0-or-later
// Detail screen (§4.2, §10 step 3): the first UI consumer of core.metadata.
// Shows resolved MetaDetail (addon-meta-first, TMDB gap-fill — ADR-0003) and,
// for series, the episode list grouped by season. Display-only for now: the
// primary action (stream picker / playback) is a separate roadmap item, so
// episode rows are focusable but inert. Copy routes through the labels module
// (§9.2 / ADR-0007); focus follows the AddonManagerScreen conventions.

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { labels, useDetail } from "@shrimpler/shared-ui";
import type { ContentId, EpisodeRef, MediaType } from "@shrimpler/core";
import { FocusContext, setFocus, useBackHandler, useFocusable } from "../focus";
import { BackButton } from "../components/BackButton";
import type { NavigationProps } from "../navigation";

const SCREEN_FOCUS_KEY = "DETAIL";
const BACK_FOCUS_KEY = "DETAIL_BACK";

// Display-only placeholder: rows are focusable so a remote can scroll them, but
// activating one does nothing until the stream picker lands.
const NOOP = (): void => undefined;

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
      style={{ ...focusOutline(focused), fontWeight: active ? "bold" : "normal" }}
    >
      {labels.seasonLabel} {season}
    </button>
  );
}

function EpisodeRow({ episode }: { episode: EpisodeRef }) {
  const { ref, focused } = useFocusable<object, HTMLLIElement>({
    onEnterPress: NOOP,
  });
  return (
    <li
      ref={ref}
      data-focused={focused}
      data-episode={episode.id}
      style={{ ...focusOutline(focused), padding: "0.5rem 0" }}
    >
      <strong>
        {episode.episode}
        {episode.name !== undefined ? `. ${episode.name}` : ""}
      </strong>
      {episode.overview !== undefined && <p>{episode.overview}</p>}
    </li>
  );
}

function EpisodesSection({ episodes }: { episodes: readonly EpisodeRef[] }) {
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
          <EpisodeRow key={episode.id} episode={episode} />
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
          detail.imdbRating !== undefined ? `★ ${detail.imdbRating}` : undefined,
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
            {episodes.length > 0 && <EpisodesSection episodes={episodes} />}
          </>
        )}
      </main>
    </FocusContext.Provider>
  );
}
