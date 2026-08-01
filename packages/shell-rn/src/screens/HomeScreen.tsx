// SPDX-License-Identifier: AGPL-3.0-or-later
// RN Home screen. Empty-by-default per §9.1 (the user supplies every source),
// mirroring the web HomeScreen: a wordmark hero, the continue-watching rail when
// there is progress, and the primary navigation as tiles. Reuses the shared-ui
// useContinueWatching hook + labels verbatim — no logic lives here.
//
// The Live TV / Movies / Series tiles are gated on features.ts and therefore
// hidden: their catalog screens ship with the paused IPTV work, and a gated-off
// core builds no IPTV addon for them to browse.

import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { labels, useContinueWatching } from "@shrimpler/shared-ui";
import {
  Button,
  Card,
  PosterCard,
  Screen,
  color,
  fontSize,
  space,
} from "../ui";
import { episodeTag, progressFraction } from "../format";
import { isIptvEnabled } from "../features";
import type { NavigationProps } from "../navigation";

function ContinueWatchingRail({ onNavigate }: NavigationProps) {
  const { entries, isLoading } = useContinueWatching();
  if (isLoading || entries.length === 0) {
    return null;
  }
  return (
    <View style={styles.rail}>
      <Text style={styles.railTitle}>{labels.continueWatching}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[...entries]}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={styles.railItems}
        renderItem={({ item }) => (
          <PosterCard
            title={`${item.name ?? item.id}${episodeTag(item)}`}
            poster={item.poster}
            progress={progressFraction(item)}
            onPress={() =>
              onNavigate({ screen: "detail", id: item.id, type: item.type })
            }
          />
        )}
      />
    </View>
  );
}

/** IPTV browse tiles. Rendered only while the subsystem is on (features.ts). */
function LiveTvSection({ onNavigate }: NavigationProps) {
  return (
    <Card title={labels.homeLiveGroup}>
      <Text style={styles.groupHint}>{labels.homeLiveHint}</Text>
      <View style={styles.tiles}>
        <Button
          variant="subtle"
          style={styles.tile}
          onPress={() =>
            onNavigate({
              screen: "catalog",
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
          style={styles.tile}
          onPress={() =>
            onNavigate({
              screen: "catalog",
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
          style={styles.tile}
          onPress={() =>
            onNavigate({
              screen: "catalog",
              catalogType: "series",
              catalogId: "iptv:series",
              title: labels.seriesTitle,
            })
          }
        >
          {labels.seriesTitle}
        </Button>
      </View>
    </Card>
  );
}

export function HomeScreen({ onNavigate }: NavigationProps) {
  const hero = (
    <View style={styles.hero}>
      <Text style={styles.wordmark}>{labels.appName}</Text>
      <Text style={styles.tagline}>{labels.tagline}</Text>
    </View>
  );

  return (
    <Screen hero={hero}>
      <ScrollView contentContainerStyle={styles.content}>
        <ContinueWatchingRail onNavigate={onNavigate} />

        <Card title={labels.homeAddonsGroup}>
          <Text style={styles.groupHint}>{labels.homeAddonsHint}</Text>
          <Button
            testID="home-search"
            fullWidth
            onPress={() => onNavigate({ screen: "search" })}
          >
            {labels.searchTitle}
          </Button>
        </Card>

        {isIptvEnabled() && <LiveTvSection onNavigate={onNavigate} />}

        <View style={styles.tiles}>
          <Button
            variant="ghost"
            style={styles.tile}
            onPress={() => onNavigate({ screen: "addons" })}
          >
            {labels.addPlaylist}
          </Button>
          <Button
            variant="ghost"
            style={styles.tile}
            onPress={() => onNavigate({ screen: "settings" })}
          >
            {labels.settings}
          </Button>
        </View>

        <Text style={styles.disclaimer}>{labels.disclaimer}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
  },
  wordmark: {
    fontSize: fontSize.display,
    fontWeight: "700",
    color: color.sand,
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: space.sm,
    color: color.sandDim,
    fontSize: fontSize.body,
  },
  content: { paddingBottom: space.xxl },
  rail: { marginBottom: space.lg },
  railTitle: {
    fontSize: fontSize.h2,
    fontWeight: "700",
    color: color.sand,
    marginBottom: space.md,
  },
  railItems: { gap: space.md },
  groupHint: {
    marginTop: -space.xs,
    marginBottom: space.lg,
    color: color.sandDim,
    fontSize: fontSize.small,
  },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tile: { flexGrow: 1, flexBasis: 140 },
  disclaimer: {
    marginTop: space.xxl,
    color: color.sandFaint,
    fontSize: fontSize.caption,
  },
});
