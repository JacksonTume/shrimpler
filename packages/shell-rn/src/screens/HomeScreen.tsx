// SPDX-License-Identifier: AGPL-3.0-or-later
// RN Home screen. Empty-by-default per §9.1 (the user supplies every source),
// mirroring the web HomeScreen but rendered with React Native primitives. Reuses
// the shared-ui useContinueWatching hook + labels verbatim — no logic lives here.

import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { labels, useContinueWatching } from "@shrimpler/shared-ui";
import type { ProgressEntry } from "@shrimpler/core";
import type { NavigationProps } from "../navigation";

function progressPercent(entry: ProgressEntry): number {
  if (entry.durationSec <= 0) {
    return 0;
  }
  return Math.min(
    100,
    Math.round((entry.positionSec / entry.durationSec) * 100),
  );
}

function HomeButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginVertical: 4,
        borderWidth: 1,
        borderColor: "#888",
        borderRadius: 8,
      }}
    >
      <Text style={{ fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

function ContinueWatchingCard({
  entry,
  onOpen,
}: {
  entry: ProgressEntry;
  onOpen: (entry: ProgressEntry) => void;
}) {
  const episodeTag =
    entry.season !== undefined && entry.episode !== undefined
      ? ` · S${entry.season}E${entry.episode}`
      : "";
  return (
    <Pressable onPress={() => onOpen(entry)} style={{ width: 160, marginRight: 12 }}>
      <Text numberOfLines={1}>
        {entry.name ?? entry.id}
        {episodeTag}
      </Text>
      <View style={{ height: 3, marginTop: 4, backgroundColor: "#555" }}>
        <View
          style={{
            height: "100%",
            width: `${progressPercent(entry)}%`,
            backgroundColor: "#fff",
          }}
        />
      </View>
    </Pressable>
  );
}

function ContinueWatchingSection({ onNavigate }: NavigationProps) {
  const { entries, isLoading } = useContinueWatching();
  if (isLoading || entries.length === 0) {
    return null;
  }
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
        {labels.continueWatching}
      </Text>
      <FlatList
        horizontal
        data={[...entries]}
        keyExtractor={(entry) => entry.id}
        renderItem={({ item }) => (
          <ContinueWatchingCard
            entry={item}
            onOpen={(e) =>
              onNavigate({ screen: "detail", id: e.id, type: e.type })
            }
          />
        )}
      />
    </View>
  );
}

export function HomeScreen({ onNavigate }: NavigationProps) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "700" }}>{labels.appName}</Text>
      <Text style={{ marginBottom: 16 }}>{labels.tagline}</Text>

      <ContinueWatchingSection onNavigate={onNavigate} />

      <Text style={{ fontSize: 18, fontWeight: "600" }}>{labels.emptyHome}</Text>
      <Text style={{ marginBottom: 12 }}>{labels.emptyHomeHint}</Text>

      <HomeButton
        label={labels.searchTitle}
        onPress={() => onNavigate({ screen: "search" })}
      />
      <HomeButton
        label={labels.liveTv}
        onPress={() =>
          onNavigate({
            screen: "catalog",
            catalogType: "tv",
            catalogId: "iptv:live",
            title: labels.liveTv,
          })
        }
      />
      <HomeButton
        label={labels.moviesTitle}
        onPress={() =>
          onNavigate({
            screen: "catalog",
            catalogType: "movie",
            catalogId: "iptv:movies",
            title: labels.moviesTitle,
          })
        }
      />
      <HomeButton
        label={labels.seriesTitle}
        onPress={() =>
          onNavigate({
            screen: "catalog",
            catalogType: "series",
            catalogId: "iptv:series",
            title: labels.seriesTitle,
          })
        }
      />
      <HomeButton
        label={labels.addPlaylist}
        onPress={() => onNavigate({ screen: "addons" })}
      />
      <HomeButton
        label={labels.settings}
        onPress={() => onNavigate({ screen: "settings" })}
      />

      <Text style={{ marginTop: 24, fontSize: 12, color: "#888" }}>
        {labels.disclaimer}
      </Text>
    </ScrollView>
  );
}
