// SPDX-License-Identifier: AGPL-3.0-or-later
// A pressable full-width row with a leading slot, a title (+ optional subtitle),
// and a trailing slot — the RN mirror of the web ListRow. One press target, so it
// fits single-action rows: search results, episodes, stream candidates. Rows with
// several actions build their own container out of Buttons instead.

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, fontSize, PRESSED_OPACITY, radius, space } from "./tokens";

interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress: () => void;
  testID?: string;
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  testID,
}: ListRowProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { opacity: PRESSED_OPACITY },
      ]}
    >
      {leading}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle !== undefined && subtitle !== "" && (
          <Text style={styles.subtitle} numberOfLines={3}>
            {subtitle}
          </Text>
        )}
      </View>
      {trailing !== undefined && (
        <View style={styles.trailing}>{trailing}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  body: { flex: 1, minWidth: 0 },
  title: { color: color.sand, fontSize: fontSize.body },
  subtitle: {
    marginTop: 2,
    color: color.sandDim,
    fontSize: fontSize.small,
  },
  trailing: { flexShrink: 0 },
});
