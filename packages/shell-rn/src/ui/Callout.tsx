// SPDX-License-Identifier: AGPL-3.0-or-later
// One-line status / error / muted message — the RN mirror of the web Callout.
// Tone only picks the color; errors carry accessibilityLiveRegion so a screen
// reader announces them the way the web's role="alert" does.

import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import type { StyleProp, TextStyle } from "react-native";
import { color, fontSize, space } from "./tokens";

type CalloutTone = "error" | "status" | "muted";

const toneColor: Record<CalloutTone, string> = {
  error: color.danger,
  status: color.sandDim,
  muted: color.sandDim,
};

export function Callout({
  tone = "status",
  children,
  style,
  testID,
}: {
  tone?: CalloutTone;
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  return (
    <Text
      testID={testID}
      accessibilityLiveRegion={tone === "error" ? "assertive" : "polite"}
      style={[styles.text, { color: toneColor[tone] }, style]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    marginVertical: space.md,
    fontSize: fontSize.small,
  },
});
