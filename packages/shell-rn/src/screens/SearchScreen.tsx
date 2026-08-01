// SPDX-License-Identifier: AGPL-3.0-or-later
// Search screen (§5) — the RN mirror of the web SearchScreen: title search over
// core.metadata (TMDB-backed), and the real entry point to the detail screen.
// Results are metadata previews only, never streams (neutrality, §5.1). Submit is
// deliberate (button or the keyboard's search key), matching useSearch's
// submit-driven contract. Copy routes through the labels module.

import { useState } from "react";
import { FlatList, Image, StyleSheet, View } from "react-native";
import { labels, useSearch } from "@shrimpler/shared-ui";
import type { MetaPreview } from "@shrimpler/core";
import {
  Button,
  Callout,
  ListRow,
  Screen,
  TextField,
  color,
  radius,
  space,
} from "../ui";
import type { NavigationProps } from "../navigation";

function resultLabel(item: MetaPreview): string {
  return item.releaseInfo !== undefined
    ? `${item.name} (${item.releaseInfo})`
    : item.name;
}

function PosterThumb({ src }: { src?: string }) {
  return (
    <View style={styles.thumb}>
      {src !== undefined && (
        <Image source={{ uri: src }} style={styles.thumbImage} />
      )}
    </View>
  );
}

export function SearchScreen({ onNavigate }: NavigationProps) {
  const { query, results, isSearching, error, setQuery, search } = useSearch();
  const [submitted, setSubmitted] = useState(false);

  async function submit(): Promise<void> {
    if (isSearching || query.trim() === "") {
      return;
    }
    setSubmitted(true);
    await search();
  }

  const showEmpty =
    submitted && !isSearching && error === null && results.length === 0;

  return (
    <Screen
      title={labels.searchTitle}
      onBack={() => onNavigate({ screen: "home" })}
    >
      <View style={styles.form}>
        <TextField
          testID="search-input"
          type="search"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void submit()}
          placeholder={labels.searchPlaceholder}
          accessibilityLabel={labels.searchPlaceholder}
          style={styles.field}
        />
        <Button
          onPress={() => void submit()}
          disabled={isSearching || query.trim() === ""}
        >
          {isSearching ? labels.searching : labels.searchButton}
        </Button>
      </View>

      {error !== null && <Callout tone="error">{error}</Callout>}
      {showEmpty && <Callout tone="muted">{labels.searchEmpty}</Callout>}

      <FlatList
        data={[...results]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ListRow
            testID={`result-${item.id}`}
            leading={<PosterThumb src={item.poster} />}
            title={resultLabel(item)}
            subtitle={item.type}
            onPress={() =>
              onNavigate({ screen: "detail", id: item.id, type: item.type })
            }
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.md,
    marginBottom: space.lg,
  },
  field: { flex: 1 },
  list: { gap: space.sm, paddingBottom: space.xl },
  thumb: {
    width: 40,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: color.surface2,
    overflow: "hidden",
  },
  thumbImage: { width: "100%", height: "100%", resizeMode: "cover" },
});
