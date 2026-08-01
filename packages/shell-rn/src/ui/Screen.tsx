// SPDX-License-Identifier: AGPL-3.0-or-later
// Page scaffold — the RN mirror of the web Screen: a full-bleed Reef background,
// a status-bar inset, and a header row (Back + title, or a caller-supplied hero).
// Unlike web it does *not* wrap children in a scroller: RN screens choose their
// own (ScrollView, or a FlatList when the list can grow long), and nesting one
// inside another is what produces the VirtualizedList warning.

import type { ReactNode } from "react";
import { Platform, StatusBar, StyleSheet, Text, View } from "react-native";
import { labels } from "@shrimpler/shared-ui";
import { color, fontSize, space } from "./tokens";
import { Button } from "./Button";

// Android draws behind the status bar; iOS reports its inset through the (here
// unavailable) safe-area context, so the notch allowance is a flat constant.
const statusBarInset =
  Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 20;

interface ScreenProps {
  title?: string;
  onBack?: () => void;
  headerRight?: ReactNode;
  /** Replaces the default header (the home hero). */
  hero?: ReactNode;
  children: ReactNode;
}

export function Screen({
  title,
  onBack,
  headerRight,
  hero,
  children,
}: ScreenProps) {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={color.bg} />
      {hero !== undefined ? (
        hero
      ) : (
        <View style={styles.header}>
          {onBack !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              onPress={onBack}
              accessibilityLabel={labels.back}
            >
              {`‹ ${labels.back}`}
            </Button>
          )}
          {title !== undefined && (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          )}
          {headerRight !== undefined && (
            <View style={styles.headerRight}>{headerRight}</View>
          )}
        </View>
      )}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
    paddingTop: statusBarInset,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  title: {
    flexShrink: 1,
    fontSize: fontSize.h1,
    fontWeight: "700",
    color: color.sand,
  },
  headerRight: { marginLeft: "auto" },
  body: { flex: 1, paddingHorizontal: space.lg },
});
