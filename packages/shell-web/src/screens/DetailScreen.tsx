// SPDX-License-Identifier: AGPL-3.0-or-later
// Detail screen (§4.2, §10 step 3): the first UI consumer of core.metadata.
// Shows resolved MetaDetail (addon-meta-first, TMDB gap-fill — ADR-0003) and,
// for series, the episode list grouped by season. The primary action opens the
// stream picker: a single Play button for movies and live channels, and per-row
// for series episodes. Copy routes through the labels module (§9.2 / ADR-0007).

import { useCallback, useEffect, useState } from "react";
import { labels, useDetail } from "@shrimpler/shared-ui";
import type {
  ContentId,
  EpisodeRef,
  MediaType,
  MetaDetail,
  PlayableSource,
} from "@shrimpler/core";
import { setFocus, useBackHandler } from "../focus";
import { StreamPickerOverlay } from "../components/StreamPickerOverlay";
import { Button, Callout, ListRow, Screen } from "../ui";
import type { NavigationProps } from "../navigation";

const SCREEN_FOCUS_KEY = "DETAIL";
const BACK_FOCUS_KEY = "DETAIL_BACK";

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

function EpisodesSection({
  episodes,
  onPlay,
}: {
  episodes: readonly EpisodeRef[];
  onPlay: (id: ContentId) => void;
}) {
  const seasons = seasonsOf(episodes);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  useEffect(() => {
    setSelectedSeason(null);
  }, [episodes]);

  const activeSeason = selectedSeason ?? seasons[0] ?? null;
  const visible =
    activeSeason === null
      ? episodes
      : episodes.filter((e) => e.season === activeSeason);

  return (
    <section style={{ marginTop: "2rem" }}>
      <h2
        style={{
          fontSize: "var(--fs-h2)",
          fontWeight: 700,
          marginBottom: "0.75rem",
        }}
      >
        {labels.episodesTitle}
      </h2>
      {seasons.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            marginBottom: "0.85rem",
          }}
        >
          {seasons.map((season) => (
            <Button
              key={season}
              size="sm"
              variant={season === activeSeason ? "primary" : "subtle"}
              aria-pressed={season === activeSeason}
              onPress={() => setSelectedSeason(season)}
            >
              {`${labels.seasonLabel} ${season}`}
            </Button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {visible.map((episode) => (
          <ListRow
            key={episode.id}
            data-episode={episode.id}
            title={
              <strong>
                {episode.episode}
                {episode.name !== undefined ? `. ${episode.name}` : ""}
              </strong>
            }
            subtitle={episode.overview}
            onPress={() => onPlay(episode.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function DetailScreen({ onNavigate, id, type }: DetailScreenProps) {
  const { detail, episodes, isLoading, error, hasProvider } = useDetail(
    id,
    type,
  );

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
        title: detail?.name,
        poster: detail?.poster,
        back: { screen: "detail", id, type },
      });
    },
    [onNavigate, id, type, detail?.name, detail?.poster],
  );

  const isDirectlyPlayable = type !== "series";

  const goHome = () => onNavigate({ screen: "home" });
  useBackHandler(goHome);

  useEffect(() => {
    void setFocus(BACK_FOCUS_KEY);
  }, []);

  return (
    <Screen
      focusKey={SCREEN_FOCUS_KEY}
      title={detail?.name}
      onBack={goHome}
      backFocusKey={BACK_FOCUS_KEY}
    >
      {isLoading ? (
        <Callout tone="status">{labels.detailLoading}</Callout>
      ) : error !== null ? (
        <Callout tone="error" role="alert">
          {error}
        </Callout>
      ) : detail === null ? (
        <>
          <Callout tone="muted">{labels.detailEmpty}</Callout>
          {!hasProvider && (
            <Callout tone="muted">{labels.detailNoProviderHint}</Callout>
          )}
        </>
      ) : (
        <DetailBody
          detail={detail}
          episodes={episodes}
          isDirectlyPlayable={isDirectlyPlayable}
          onPlayMain={() => openPicker(id, type)}
          onPlayEpisode={(episodeId) => openPicker(episodeId, "series")}
        />
      )}

      {picker !== null && (
        <StreamPickerOverlay
          id={picker.id}
          type={picker.type}
          onClose={closePicker}
          onPlay={handlePlay}
        />
      )}
    </Screen>
  );
}

function DetailBody({
  detail,
  episodes,
  isDirectlyPlayable,
  onPlayMain,
  onPlayEpisode,
}: {
  detail: MetaDetail;
  episodes: readonly EpisodeRef[];
  isDirectlyPlayable: boolean;
  onPlayMain: () => void;
  onPlayEpisode: (id: ContentId) => void;
}) {
  const metaLine = [
    detail.released ?? detail.releaseInfo,
    detail.runtime,
    detail.imdbRating !== undefined ? `★ ${detail.imdbRating}` : undefined,
  ].filter((p): p is string => p !== undefined && p !== "");

  return (
    <>
      {detail.background !== undefined && (
        <div
          style={{
            position: "relative",
            borderRadius: "var(--r-lg)",
            overflow: "hidden",
            marginBottom: "1.25rem",
          }}
        >
          <img
            src={detail.background}
            alt=""
            style={{
              width: "100%",
              maxHeight: 360,
              objectFit: "cover",
              display: "block",
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(14,26,30,0) 35%, var(--bg))",
            }}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
        {detail.poster !== undefined && (
          <img
            src={detail.poster}
            alt=""
            style={{
              width: 180,
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow)",
              flexShrink: 0,
            }}
          />
        )}
        <div
          style={{
            flex: "1 1 280px",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
          }}
        >
          {metaLine.length > 0 && (
            <p style={{ color: "var(--sand-dim)" }}>{metaLine.join("  ·  ")}</p>
          )}
          {isDirectlyPlayable && (
            <div>
              <Button onPress={onPlayMain}>
                <span aria-hidden>▶</span> {labels.play}
              </Button>
            </div>
          )}
          {detail.genres !== undefined && detail.genres.length > 0 && (
            <p
              style={{ color: "var(--sand-dim)", fontSize: "var(--fs-small)" }}
            >
              {labels.genresTitle}: {detail.genres.join(", ")}
            </p>
          )}
          {detail.description !== undefined && <p>{detail.description}</p>}
          {detail.cast !== undefined && detail.cast.length > 0 && (
            <p
              style={{ color: "var(--sand-dim)", fontSize: "var(--fs-small)" }}
            >
              {labels.castTitle}: {detail.cast.join(", ")}
            </p>
          )}
        </div>
      </div>

      {episodes.length > 0 && (
        <EpisodesSection episodes={episodes} onPlay={onPlayEpisode} />
      )}
    </>
  );
}
