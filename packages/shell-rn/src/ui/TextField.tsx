// SPDX-License-Identifier: AGPL-3.0-or-later
// Styled text input with an optional label — the RN mirror of the web TextField.
// The web version's `type` prop maps onto RN's keyboard/autocorrect/secure props
// here, so screens keep one vocabulary across the two shells; `onSubmitEditing`
// replaces the web's enclosing <form onSubmit>, which RN has no equivalent for.

import { StyleSheet, Text, TextInput, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { color, DISABLED_OPACITY, fontSize, radius, space } from "./tokens";

type FieldType = "text" | "search" | "url" | "password";

interface TextFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  label?: string;
  type?: FieldType;
  placeholder?: string;
  disabled?: boolean;
  /** Fired by the keyboard's return key — the screen's submit action. */
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TextField({
  value,
  onChangeText,
  label,
  type = "text",
  placeholder,
  disabled,
  onSubmitEditing,
  accessibilityLabel,
  style,
  testID,
}: TextFieldProps) {
  // URL/password/search fields are all case- and autocorrect-sensitive: an
  // autocapitalized manifest URL or token is silently wrong.
  const isPlainText = type === "text";

  const input = (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmitEditing}
      editable={disabled !== true}
      placeholder={placeholder}
      placeholderTextColor={color.sandFaint}
      accessibilityLabel={accessibilityLabel ?? label}
      keyboardType={type === "url" ? "url" : "default"}
      secureTextEntry={type === "password"}
      returnKeyType={type === "search" ? "search" : "done"}
      autoCapitalize={isPlainText ? "sentences" : "none"}
      autoCorrect={isPlainText}
      style={[
        styles.input,
        label !== undefined && styles.inputWithLabel,
        disabled === true && { opacity: DISABLED_OPACITY },
      ]}
    />
  );

  return (
    <View style={style}>
      {label !== undefined && <Text style={styles.label}>{label}</Text>}
      {input}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: fontSize.small,
    color: color.sandDim,
  },
  input: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    color: color.sand,
    fontSize: fontSize.body,
  },
  inputWithLabel: { marginTop: space.xs },
});
