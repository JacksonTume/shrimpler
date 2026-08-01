// SPDX-License-Identifier: AGPL-3.0-or-later
// The RN shell's root — the mobile counterpart of the web shell's main.tsx Root.
// Holds the composed Core in state so a settings change can rebuild it
// (reloadCore) and swap the CoreProvider value; a lightweight route stack (held
// here, popped by the Android hardware-back button) stands in for a router, the
// same hand-rolled approach the web shell uses.
//
// The stack pop is registered on mount, so anything mounted later — an open
// stream-picker overlay — is offered the back press first (see src/back.ts). That
// also makes the `back` route the player carries redundant here: web navigates to
// it explicitly, RN just pops.

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { CoreProvider, labels } from "@shrimpler/shared-ui";
import type { Core } from "@shrimpler/core";
import { createRnCore } from "./src/composition-root";
import { useHardwareBack } from "./src/back";
import type { Route } from "./src/navigation";
import { AddonManagerScreen } from "./src/screens/AddonManagerScreen";
import { DetailScreen } from "./src/screens/DetailScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { PlaybackScreen } from "./src/screens/PlaybackScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { Button, Screen, color, space } from "./src/ui";

/**
 * Fallback for a route with no screen on mobile yet — today only the IPTV
 * `catalog` drill-down, which ships with the paused IPTV work (see
 * src/features.ts). Reachable only if a caller navigates there while the gate is
 * off, so it stays a plain "go back", not user-facing copy about a feature.
 */
function UnavailableRoute({ onBack }: { onBack: () => void }) {
  return (
    <Screen onBack={onBack}>
      <Text style={styles.unavailable}>{labels.channelsEmpty}</Text>
      <Button variant="ghost" onPress={onBack} style={styles.unavailableButton}>
        {labels.back}
      </Button>
    </Screen>
  );
}

function AppRoot({ reloadCore }: { reloadCore: () => Promise<void> }) {
  const [stack, setStack] = useState<Route[]>([{ screen: "home" }]);
  const canGoBack = useRef(false);

  useEffect(() => {
    canGoBack.current = stack.length > 1;
  }, [stack]);

  const navigate = useCallback((next: Route): void => {
    setStack((prev) => [...prev, next]);
  }, []);

  const goBack = useCallback((): boolean => {
    if (!canGoBack.current) {
      return false; // let the OS handle back (exit) at the root
    }
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    return true;
  }, []);

  useHardwareBack(goBack);

  const route = stack[stack.length - 1]!;
  switch (route.screen) {
    case "home":
      return <HomeScreen onNavigate={navigate} />;
    case "search":
      return <SearchScreen onNavigate={navigate} />;
    case "detail":
      return (
        <DetailScreen onNavigate={navigate} id={route.id} type={route.type} />
      );
    case "player":
      return (
        <PlaybackScreen
          source={route.source}
          contentId={route.contentId}
          type={route.type}
          title={route.title}
          poster={route.poster}
          onBack={() => void goBack()}
        />
      );
    case "addons":
      return <AddonManagerScreen onNavigate={navigate} />;
    case "settings":
      return <SettingsScreen onNavigate={navigate} reloadCore={reloadCore} />;
    default:
      return <UnavailableRoute onBack={() => void goBack()} />;
  }
}

export function App() {
  const [core, setCore] = useState<Core | null>(null);

  const reloadCore = useCallback(async (): Promise<void> => {
    setCore(await createRnCore());
  }, []);

  // The core loads persisted addon state + the stored TMDB key asynchronously,
  // so we build it once after mount and show a splash until it resolves.
  useEffect(() => {
    void reloadCore();
  }, [reloadCore]);

  if (core === null) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={color.coral} />
      </View>
    );
  }

  return (
    <CoreProvider core={core}>
      <AppRoot reloadCore={reloadCore} />
    </CoreProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.bg,
  },
  unavailable: { color: color.sandDim },
  unavailableButton: { alignSelf: "flex-start", marginTop: space.lg },
});
