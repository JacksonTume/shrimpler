// SPDX-License-Identifier: AGPL-3.0-or-later
// Home screen. Empty-by-default per §9.1: no sources, no suggestions — the user
// supplies everything. Its one interactive element routes to the addon manager.

import { useEffect } from "react";
import { labels } from "@shrimpler/shared-ui";
import { setFocus, useFocusable } from "../focus";
import type { NavigationProps } from "../navigation";

const ADD_FOCUS_KEY = "HOME_ADD";

export function HomeScreen({ onNavigate }: NavigationProps) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    focusKey: ADD_FOCUS_KEY,
    onEnterPress: () => onNavigate("addons"),
  });

  useEffect(() => {
    void setFocus(ADD_FOCUS_KEY);
  }, []);

  return (
    <main>
      <h1>{labels.appName}</h1>
      <p>{labels.tagline}</p>
      <section>
        <h2>{labels.emptyHome}</h2>
        <p>{labels.emptyHomeHint}</p>
        <button
          ref={ref}
          type="button"
          data-focused={focused}
          onClick={() => onNavigate("addons")}
          style={{ outline: focused ? "2px solid #fff" : undefined }}
        >
          {labels.addPlaylist}
        </button>
      </section>
      <footer>
        <small>{labels.disclaimer}</small>
      </footer>
    </main>
  );
}
