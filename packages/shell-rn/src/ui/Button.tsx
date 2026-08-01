// SPDX-License-Identifier: AGPL-3.0-or-later
// The pressable button primitive — the RN mirror of shell-web/src/ui/Button.tsx
// (same variant/size vocabulary, so a screen reads the same in both shells).
// There is no spatial-nav focus ring here: the mobile shell is touch-first and
// the D-pad focus engine (ADR-0010) arrives with the TV shells in Phase 3.
// A string child is wrapped in <Text> automatically — RN cannot render bare text.

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import {
  color,
  DISABLED_OPACITY,
  fontSize,
  PRESSED_OPACITY,
  radius,
  space,
} from "./tokens";

type Variant = "primary" | "ghost" | "subtle";
type Size = "md" | "sm";

interface ButtonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  onPress?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  onPress,
  disabled,
  fullWidth,
  style,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth === true && styles.fullWidth,
        pressed && { opacity: PRESSED_OPACITY },
        disabled === true && { opacity: DISABLED_OPACITY },
        style,
      ]}
    >
      {typeof children === "string" ? (
        <Text style={[styles.label, labelStyles[variant], labelSizes[size]]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    borderRadius: radius.pill,
  },
  fullWidth: { alignSelf: "stretch" },
  label: { fontWeight: "600", textAlign: "center" },
});

const variantStyles = StyleSheet.create({
  // Flat coral rather than the web's coral→coral-deep gradient (see tokens.ts).
  primary: { backgroundColor: color.coral },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  subtle: { backgroundColor: color.surface },
});

const labelStyles = StyleSheet.create({
  primary: { color: color.bg },
  ghost: { color: color.sand },
  subtle: { color: color.sand },
});

const sizeStyles = StyleSheet.create({
  md: { paddingVertical: 10, paddingHorizontal: 18 },
  sm: { paddingVertical: 6, paddingHorizontal: 13 },
});

const labelSizes = StyleSheet.create({
  md: { fontSize: fontSize.body },
  sm: { fontSize: fontSize.small },
});
