// SPDX-License-Identifier: AGPL-3.0-or-later
// Small status pill: LIVE (coral, uppercase), cached ⚡ (seafoam), or a neutral
// chip. Mirrors the web Badge; tone picks the palette, children the content.

import { StyleSheet, Text, View } from "react-native";
import { color, fontSize, radius, space } from "./tokens";

type BadgeTone = "live" | "cached" | "neutral";

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: string;
}) {
  return (
    <View style={[styles.pill, pillTones[tone]]}>
      <Text style={[styles.text, textTones[tone]]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingVertical: 2,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
  },
  text: { fontSize: fontSize.caption, lineHeight: 17 },
});

const pillTones = StyleSheet.create({
  live: { backgroundColor: color.coral },
  cached: { backgroundColor: "rgba(111, 217, 192, 0.16)" },
  neutral: { backgroundColor: color.surface2 },
});

const textTones = StyleSheet.create({
  live: {
    color: color.bg,
    fontWeight: "600",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  cached: { color: color.seafoam, fontWeight: "500" },
  neutral: { color: color.sandDim, fontWeight: "500" },
});
