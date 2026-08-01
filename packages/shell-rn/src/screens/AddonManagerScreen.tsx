// SPDX-License-Identifier: AGPL-3.0-or-later
// Add-by-URL source manager (§6.2, §9.1) — the RN mirror of the web
// AddonManagerScreen. Paste a Stremio manifest URL to install a source, then
// toggle or remove it. All copy routes through the labels module (§9.2 /
// ADR-0007); "addon"/"manifest" is internal vocabulary, the UI says
// "Playlist"/"Source".
//
// The web screen also hosts M3U playlist + Xtream account sections behind its
// IPTV gate. Those are not ported yet: the subsystem is off on mobile
// (features.ts) and paused project-wide, so they would be unreachable UI for a
// subsystem nothing refreshes. They belong with the IPTV increment that brings
// the catalog/categories screens (docs/ROADMAP.md).

import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { labels, useAddonManager } from "@shrimpler/shared-ui";
import type { InstalledAddon } from "@shrimpler/core";
import { Button, Callout, Card, Screen, TextField, color, space } from "../ui";
import type { NavigationProps } from "../navigation";

function AddSourceForm({
  isInstalling,
  installError,
  onAdd,
}: {
  isInstalling: boolean;
  installError: string | null;
  onAdd: (url: string) => Promise<boolean>;
}) {
  const [url, setUrl] = useState("");

  async function submit(): Promise<void> {
    const trimmed = url.trim();
    if (trimmed === "" || isInstalling) {
      return;
    }
    if (await onAdd(trimmed)) {
      setUrl("");
    }
  }

  return (
    <View>
      <View style={styles.form}>
        <TextField
          testID="source-url"
          label={labels.playlistUrl}
          type="url"
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={() => void submit()}
          placeholder="https://…"
          disabled={isInstalling}
        />
        <Button
          onPress={() => void submit()}
          disabled={isInstalling || url.trim() === ""}
        >
          {isInstalling ? labels.installing : labels.addSourceButton}
        </Button>
      </View>
      {installError !== null && <Callout tone="error">{installError}</Callout>}
    </View>
  );
}

function AddonRow({
  addon,
  onSetEnabled,
  onRemove,
}: {
  addon: InstalledAddon;
  onSetEnabled: (url: string, enabled: boolean) => void;
  onRemove: (url: string) => void;
}) {
  return (
    <View style={[styles.entry, !addon.enabled && styles.entryDimmed]}>
      <Text style={styles.entryLabel} numberOfLines={2}>
        {addon.manifest.name}
      </Text>
      <Button
        size="sm"
        variant="subtle"
        onPress={() => onSetEnabled(addon.manifestUrl, !addon.enabled)}
      >
        {addon.enabled ? labels.disableSource : labels.enableSource}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onPress={() => onRemove(addon.manifestUrl)}
      >
        {labels.removeSource}
      </Button>
    </View>
  );
}

export function AddonManagerScreen({ onNavigate }: NavigationProps) {
  const { addons, isInstalling, installError, addByUrl, remove, setEnabled } =
    useAddonManager();

  // No reloadCore here (unlike Settings): the addon engine held by core.addons is
  // the same instance the fan-out reads, so an install/remove is live immediately.
  return (
    <Screen
      title={labels.sourcesTitle}
      onBack={() => onNavigate({ screen: "home" })}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <AddSourceForm
            isInstalling={isInstalling}
            installError={installError}
            onAdd={addByUrl}
          />
          {addons.length === 0 ? (
            <Callout tone="muted" style={styles.flushCallout}>
              {labels.emptySources}
            </Callout>
          ) : (
            <View style={styles.entries}>
              {addons.map((addon) => (
                <AddonRow
                  key={addon.manifestUrl}
                  addon={addon}
                  onSetEnabled={(url, enabled) => void setEnabled(url, enabled)}
                  onRemove={(url) => void remove(url)}
                />
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl },
  form: { gap: space.md },
  entries: { marginTop: space.md },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  entryDimmed: { opacity: 0.5 },
  entryLabel: { flex: 1, color: color.sand },
  flushCallout: { marginBottom: 0 },
});
