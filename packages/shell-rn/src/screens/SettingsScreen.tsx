// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings screen — the RN mirror of the web SettingsScreen. Runtime entry and
// persistence of the TMDB API key and Real-Debrid token (§5, §14.3): user-
// supplied, stored locally via the StorageAdapter, and applied by rebuilding the
// core (reloadCore, from the composition root). On mobile this is the *only* way
// to supply them — unlike web there is no build-time env fallback. TMDB is a
// metadata provider (presentation data only, §5.1) and Real-Debrid a stream
// resolver, so naming them is neutrality-safe. Copy routes through labels.

import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  labels,
  useDebridSettings,
  useTmdbSettings,
} from "@shrimpler/shared-ui";
import {
  Button,
  Callout,
  Card,
  Screen,
  TextField,
  color,
  fontSize,
  space,
} from "../ui";
import type { NavigationProps } from "../navigation";

interface SettingsScreenProps extends NavigationProps {
  reloadCore: () => Promise<void>;
}

/** A settings card: labeled field, hint, Save/Clear, and a status line. */
function SettingKey({
  label,
  hint,
  value,
  onChangeText,
  onSave,
  onClear,
  isSaving,
  active,
  activeLabel,
  inactiveLabel,
  justSaved,
  testID,
}: {
  label: string;
  hint: string;
  value: string;
  onChangeText: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  isSaving: boolean;
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  justSaved: boolean;
  testID: string;
}) {
  return (
    <Card>
      <TextField
        testID={testID}
        label={label}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSave}
        disabled={isSaving}
      />
      <Text style={styles.hint}>{hint}</Text>
      <View style={styles.actions}>
        <Button onPress={onSave} disabled={isSaving}>
          {labels.save}
        </Button>
        <Button variant="ghost" onPress={onClear} disabled={isSaving}>
          {labels.clear}
        </Button>
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.dot, active ? styles.dotOn : styles.dotOff]} />
        <Callout tone="status" style={styles.status}>
          {`${active ? activeLabel : inactiveLabel}${justSaved ? ` — ${labels.saved}` : ""}`}
        </Callout>
      </View>
    </Card>
  );
}

export function SettingsScreen({
  onNavigate,
  reloadCore,
}: SettingsScreenProps) {
  const tmdb = useTmdbSettings(reloadCore);
  const debrid = useDebridSettings(reloadCore);

  return (
    <Screen
      title={labels.settings}
      onBack={() => onNavigate({ screen: "home" })}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <SettingKey
          testID="tmdb-key"
          label={labels.tmdbKeyLabel}
          hint={labels.tmdbKeyHint}
          value={tmdb.apiKey}
          onChangeText={tmdb.setApiKey}
          onSave={() => void tmdb.save()}
          onClear={() => void tmdb.clear()}
          isSaving={tmdb.isSaving}
          active={tmdb.hasProvider}
          activeLabel={labels.tmdbKeyActive}
          inactiveLabel={labels.tmdbKeyInactive}
          justSaved={tmdb.justSaved}
        />
        <SettingKey
          testID="debrid-token"
          label={labels.debridTokenLabel}
          hint={labels.debridTokenHint}
          value={debrid.token}
          onChangeText={debrid.setToken}
          onSave={() => void debrid.save()}
          onClear={() => void debrid.clear()}
          isSaving={debrid.isSaving}
          active={debrid.hasDebrid}
          activeLabel={labels.debridTokenActive}
          inactiveLabel={labels.debridTokenInactive}
          justSaved={debrid.justSaved}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl },
  hint: {
    marginTop: space.sm,
    marginBottom: space.lg,
    color: color.sandFaint,
    fontSize: fontSize.small,
  },
  actions: { flexDirection: "row", gap: space.md },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: color.seafoam },
  dotOff: { backgroundColor: color.sandFaint },
  status: { marginBottom: 0 },
});
