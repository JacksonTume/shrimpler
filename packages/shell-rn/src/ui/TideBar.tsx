// SPDX-License-Identifier: AGPL-3.0-or-later
// The signature coral "tide" progress motif (web: ui/TideBar.tsx) — a thin filled
// track that recurs wherever the app shows how far along something is: the
// continue-watching cards and the player's elapsed position. Display only; the
// draggable player control is SeekBar.

import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { color, radius } from "./tokens";

/** `value` is a 0..1 fraction; anything outside is clamped. */
export function TideBar({
  value,
  style,
}: {
  value: number;
  style?: StyleProp<ViewStyle>;
}) {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[styles.track, style]}>
      <View style={[styles.fill, { width: `${percent}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: color.coral },
});
