// SPDX-License-Identifier: AGPL-3.0-or-later
// Home screen. Empty-by-default per §9.1: no sources, no suggestions — the user
// supplies everything. Its interactive elements route to the addon manager and
// the settings screen.

import { useEffect } from "react";
import type { CSSProperties } from "react";
import { labels } from "@shrimpler/shared-ui";
import { FocusContext, setFocus, useFocusable } from "../focus";
import type { NavigationProps } from "../navigation";

const SCREEN_FOCUS_KEY = "HOME";
const SEARCH_FOCUS_KEY = "HOME_SEARCH";
const ADD_FOCUS_KEY = "HOME_ADD";
const SETTINGS_FOCUS_KEY = "HOME_SETTINGS";

const focusOutline = (focused: boolean): CSSProperties => ({
  outline: focused ? "2px solid #fff" : "2px solid transparent",
  display: "block",
});

function HomeButton({
  focusKey,
  label,
  onPress,
}: {
  focusKey: string;
  label: string;
  onPress: () => void;
}) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    focusKey,
    onEnterPress: onPress,
  });
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused}
      onClick={onPress}
      style={focusOutline(focused)}
    >
      {label}
    </button>
  );
}

export function HomeScreen({ onNavigate }: NavigationProps) {
  const { ref, focusKey } = useFocusable<object, HTMLElement>({
    focusKey: SCREEN_FOCUS_KEY,
    saveLastFocusedChild: true,
  });

  useEffect(() => {
    void setFocus(SEARCH_FOCUS_KEY);
  }, []);

  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref}>
        <h1>{labels.appName}</h1>
        <p>{labels.tagline}</p>
        <section>
          <h2>{labels.emptyHome}</h2>
          <p>{labels.emptyHomeHint}</p>
          <HomeButton
            focusKey={SEARCH_FOCUS_KEY}
            label={labels.searchTitle}
            onPress={() => onNavigate({ screen: "search" })}
          />
          <HomeButton
            focusKey={ADD_FOCUS_KEY}
            label={labels.addPlaylist}
            onPress={() => onNavigate({ screen: "addons" })}
          />
          <HomeButton
            focusKey={SETTINGS_FOCUS_KEY}
            label={labels.settings}
            onPress={() => onNavigate({ screen: "settings" })}
          />
        </section>
        <footer>
          <small>{labels.disclaimer}</small>
        </footer>
      </main>
    </FocusContext.Provider>
  );
}
