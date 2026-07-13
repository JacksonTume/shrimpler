// SPDX-License-Identifier: AGPL-3.0-or-later
// The RN shell's root — the mobile counterpart of the web shell's main.tsx Root.
// Holds the composed Core in state so a settings/IPTV change can rebuild it
// (reloadCore) and swap the CoreProvider value; a lightweight route stack (held
// here, popped by the Android hardware-back button) stands in for a router, the
// same hand-rolled approach the web shell uses. Screens beyond Home are stubbed
// until increment 4b.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { CoreProvider, labels } from "@shrimpler/shared-ui";
import type { Core } from "@shrimpler/core";
import { createRnCore } from "./src/composition-root";
import type { Route } from "./src/navigation";
import { HomeScreen } from "./src/screens/HomeScreen";

/** Placeholder for the screens that land in increment 4b. */
function ComingSoon({
  route,
  onBack,
}: {
  route: Route;
  onBack: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Pressable onPress={onBack} style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 16 }}>{`‹ ${labels.back}`}</Text>
      </Pressable>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>{route.screen}</Text>
      <Text style={{ marginTop: 8, color: "#888" }}>
        Coming in increment 4b.
      </Text>
    </ScrollView>
  );
}

function AppRoot() {
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

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", goBack);
    return () => sub.remove();
  }, [goBack]);

  const route = stack[stack.length - 1]!;
  switch (route.screen) {
    case "home":
      return <HomeScreen onNavigate={navigate} />;
    default:
      return <ComingSoon route={route} onBack={goBack} />;
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
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <CoreProvider core={core}>
      <AppRoot />
    </CoreProvider>
  );
}
