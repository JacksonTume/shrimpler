// SPDX-License-Identifier: AGPL-3.0-or-later
// A bordered surface panel with an optional heading — the standard grouping
// container (source-manager sections, home-screen groups), mirroring the web Card.

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { color, fontSize, radius, space } from "./tokens";

export function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      {title !== undefined && <Text style={styles.title}>{title}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.lg,
  },
  title: {
    fontSize: fontSize.h2,
    fontWeight: "700",
    color: color.sand,
    marginBottom: space.md,
  },
});
