// SPDX-License-Identifier: AGPL-3.0-or-later
// A poster tile with a title and an optional tide progress bar — the RN mirror of
// the web PosterCard, used by the continue-watching rail. Posters are remote URLs
// from the user's own metadata provider; a missing one falls back to an empty
// surface block rather than any bundled artwork (neutrality, §14.3).

import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { color, fontSize, PRESSED_OPACITY, radius, space } from "./tokens";
import { TideBar } from "./TideBar";

interface PosterCardProps {
  title: string;
  poster?: string;
  /** 0..1 watch progress; omit to hide the bar. */
  progress?: number;
  width?: number;
  onPress: () => void;
}

export function PosterCard({
  title,
  poster,
  progress,
  width = 132,
  onPress,
}: PosterCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        { width },
        pressed && { opacity: PRESSED_OPACITY },
      ]}
    >
      <View style={[styles.poster, { height: width * 1.5 }]}>
        {poster !== undefined && (
          <Image source={{ uri: poster }} style={styles.image} />
        )}
      </View>
      {progress !== undefined && (
        <TideBar value={progress} style={styles.bar} />
      )}
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  poster: {
    width: "100%",
    borderRadius: radius.md,
    backgroundColor: color.surface2,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  bar: { marginTop: space.sm },
  title: {
    marginTop: space.sm,
    color: color.sand,
    fontSize: fontSize.small,
  },
});
