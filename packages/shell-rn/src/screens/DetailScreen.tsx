// SPDX-License-Identifier: AGPL-3.0-or-later
// Detail screen (§4.2, §10 step 3) — the RN mirror of the web DetailScreen. Shows
// a resolved MetaDetail (addon-meta-first, TMDB gap-fill — ADR-0003) and, for
// series, the episode list grouped by season. The primary action opens the stream
// picker: one Play button for a directly playable item, per-row for episodes.
//
// The episode list is the FlatList itself, with everything above it as the list
// header, rather than a ScrollView wrapping a list: a long-running series is
// hundreds of rows, and nesting the two is what triggers RN's VirtualizedList
// warning. Copy routes through the labels module (§9.2 / ADR-0007).

import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import { labels, useDetail } from "@shrimpler/shared-ui";
import type {
  ContentId,
  EpisodeRef,
  MediaType,
  MetaDetail,
  PlayableSource,
} from "@shrimpler/core";
import { StreamPickerOverlay } from "../components/StreamPickerOverlay";
import {
  Button,
  Callout,
  ListRow,
  Screen,
  color,
  fontSize,
  radius,
  space,
} from "../ui";
import { seasonsOf } from "../format";
import type { NavigationProps } from "../navigation";

interface DetailScreenProps extends NavigationProps {
  id: ContentId;
  type: MediaType;
}

function episodeTitle(episode: EpisodeRef): string {
  return episode.name !== undefined
    ? `${episode.episode}. ${episode.name}`
    : String(episode.episode);
}

function DetailBody({
  detail,
  isDirectlyPlayable,
  onPlayMain,
}: {
  detail: MetaDetail;
  isDirectlyPlayable: boolean;
  onPlayMain: () => void;
}) {
  const metaLine = [
    detail.released ?? detail.releaseInfo,
    detail.runtime,
    detail.imdbRating !== undefined ? `★ ${detail.imdbRating}` : undefined,
  ].filter((part): part is string => part !== undefined && part !== "");

  return (
    <View>
      {detail.background !== undefined && (
        <Image source={{ uri: detail.background }} style={styles.background} />
      )}

      <View style={styles.headRow}>
        {detail.poster !== undefined && (
          <Image source={{ uri: detail.poster }} style={styles.poster} />
        )}
        <View style={styles.headText}>
          {metaLine.length > 0 && (
            <Text style={styles.meta}>{metaLine.join("  ·  ")}</Text>
          )}
          {isDirectlyPlayable && (
            <Button onPress={onPlayMain} style={styles.playButton}>
              {`▶  ${labels.play}`}
            </Button>
          )}
          {detail.genres !== undefined && detail.genres.length > 0 && (
            <Text style={styles.meta}>
              {`${labels.genresTitle}: ${detail.genres.join(", ")}`}
            </Text>
          )}
        </View>
      </View>

      {detail.description !== undefined && (
        <Text style={styles.description}>{detail.description}</Text>
      )}
      {detail.cast !== undefined && detail.cast.length > 0 && (
        <Text style={styles.meta}>
          {`${labels.castTitle}: ${detail.cast.join(", ")}`}
        </Text>
      )}
    </View>
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
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  useEffect(() => {
    setSelectedSeason(null);
  }, [episodes]);

  const openPicker = useCallback(
    (pickId: ContentId, pickType: MediaType) =>
      setPicker({ id: pickId, type: pickType }),
    [],
  );

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

  const seasons = seasonsOf(episodes);
  const activeSeason = selectedSeason ?? seasons[0] ?? null;
  const visible =
    activeSeason === null
      ? episodes
      : episodes.filter((episode) => episode.season === activeSeason);

  const isDirectlyPlayable = type !== "series";

  const header = (
    <View style={styles.header}>
      {isLoading ? (
        <Callout tone="status">{labels.detailLoading}</Callout>
      ) : error !== null ? (
        <Callout tone="error">{error}</Callout>
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
          isDirectlyPlayable={isDirectlyPlayable}
          onPlayMain={() => openPicker(id, type)}
        />
      )}

      {episodes.length > 0 && (
        <View style={styles.episodesHead}>
          <Text style={styles.sectionTitle}>{labels.episodesTitle}</Text>
          {seasons.length > 1 && (
            <View style={styles.seasonRow}>
              {seasons.map((season) => (
                <Button
                  key={season}
                  size="sm"
                  variant={season === activeSeason ? "primary" : "subtle"}
                  onPress={() => setSelectedSeason(season)}
                >
                  {`${labels.seasonLabel} ${season}`}
                </Button>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <Screen
        title={detail?.name}
        onBack={() => onNavigate({ screen: "home" })}
      >
        <FlatList
          data={[...visible]}
          keyExtractor={(episode) => episode.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ListRow
              testID={`episode-${item.id}`}
              title={episodeTitle(item)}
              subtitle={item.overview}
              onPress={() => openPicker(item.id, "series")}
            />
          )}
        />
      </Screen>

      {picker !== null && (
        <StreamPickerOverlay
          id={picker.id}
          type={picker.type}
          onClose={() => setPicker(null)}
          onPlay={handlePlay}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { gap: space.sm, paddingBottom: space.xl },
  header: { gap: space.sm },
  background: {
    width: "100%",
    height: 170,
    borderRadius: radius.lg,
    marginBottom: space.lg,
    resizeMode: "cover",
    backgroundColor: color.surface2,
  },
  headRow: { flexDirection: "row", gap: space.lg },
  poster: {
    width: 110,
    height: 165,
    borderRadius: radius.md,
    backgroundColor: color.surface2,
    resizeMode: "cover",
  },
  headText: { flex: 1, gap: space.md },
  playButton: { alignSelf: "flex-start" },
  meta: { color: color.sandDim, fontSize: fontSize.small },
  description: {
    marginTop: space.lg,
    color: color.sand,
    fontSize: fontSize.body,
    lineHeight: 23,
  },
  episodesHead: { marginTop: space.xl, gap: space.md },
  sectionTitle: {
    fontSize: fontSize.h2,
    fontWeight: "700",
    color: color.sand,
  },
  seasonRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
