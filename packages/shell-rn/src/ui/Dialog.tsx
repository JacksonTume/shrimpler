// SPDX-License-Identifier: AGPL-3.0-or-later
// Modal overlay scaffold (the stream picker) — the RN mirror of the web Dialog.
//
// Deliberately *not* RN's <Modal>: it renders into its own native window whose
// hardware-back handling competes with the app's BackHandler stack. An absolutely
// positioned sibling keeps one back stack — because this mounts after App.tsx's
// route-stack subscription, RN's reverse-order dispatch (see back.ts) asks it
// first, so Back closes the dialog and leaves the screen beneath alone.

import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { labels } from "@shrimpler/shared-ui";
import { useHardwareBack } from "../back";
import { color, fontSize, radius, space } from "./tokens";
import { Button } from "./Button";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ title, onClose, children }: DialogProps) {
  useHardwareBack(() => {
    onClose();
    return true;
  });

  return (
    <View style={styles.scrim}>
      {/* Tapping the scrim dismisses, matching the platform expectation. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel={labels.back}
        onPress={onClose}
      />
      <View
        style={styles.sheet}
        accessibilityViewIsModal
        accessibilityLabel={title}
      >
        <View style={styles.header}>
          <Button variant="ghost" size="sm" onPress={onClose}>
            {`‹ ${labels.back}`}
          </Button>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.scrim,
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "82%",
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.line,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  title: {
    flexShrink: 1,
    fontSize: fontSize.h2,
    fontWeight: "700",
    color: color.sand,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.sm,
  },
});
