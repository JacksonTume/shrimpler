// SPDX-License-Identifier: AGPL-3.0-or-later
// Android hardware-back plumbing. RN calls BackHandler subscriptions in reverse
// registration order and stops at the first that returns true, which gives us the
// same layered "back stack" the web shell gets from its focus engine (ADR-0010):
// App.tsx registers the route-stack pop on mount, so anything mounted later — an
// open stream-picker overlay — is asked first and can swallow the press.
//
// The handler is held in a ref so callers can pass an inline closure without
// re-subscribing (and re-ordering themselves to the top of the stack) on every
// render.

import { useEffect, useRef } from "react";
import { BackHandler } from "react-native";

/**
 * Subscribe to the Android back button for this component's lifetime.
 * Return true from `onBack` to consume the press, false to let the next
 * subscription (ultimately the OS) handle it.
 */
export function useHardwareBack(onBack: () => boolean): void {
  const handlerRef = useRef(onBack);
  handlerRef.current = onBack;

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () =>
      handlerRef.current(),
    );
    return () => subscription.remove();
  }, []);
}
