// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings screen. Runtime entry/persistence of the TMDB API key (§5, §14.3):
// the key is user-supplied, stored locally via the StorageAdapter, and applied
// by rebuilding the core (reloadCore, passed from the composition root). TMDB is
// a metadata provider — presentation data only (§5.1) — so naming it is
// neutrality-safe. Copy routes through the labels module; focus follows the
// AddonManagerScreen conventions.

import { useEffect } from "react";
import type { CSSProperties, FormEvent } from "react";
import { labels, useTmdbSettings } from "@shrimpler/shared-ui";
import { FocusContext, setFocus, useBackHandler, useFocusable } from "../focus";
import { BackButton } from "../components/BackButton";
import type { NavigationProps } from "../navigation";

const SCREEN_FOCUS_KEY = "SETTINGS";
const INPUT_FOCUS_KEY = "SETTINGS_INPUT";

const focusOutline = (focused: boolean): CSSProperties => ({
  outline: focused ? "2px solid #fff" : "2px solid transparent",
});

interface SettingsScreenProps extends NavigationProps {
  reloadCore: () => Promise<void>;
}

export function SettingsScreen({ onNavigate, reloadCore }: SettingsScreenProps) {
  const { apiKey, hasProvider, isSaving, justSaved, setApiKey, save, clear } =
    useTmdbSettings(reloadCore);

  const { ref: inputRef, focused: inputFocused } = useFocusable<
    object,
    HTMLInputElement
  >({
    focusKey: INPUT_FOCUS_KEY,
    // Move real DOM focus onto the field so keystrokes land in it (the engine
    // only tracks logical focus). Same TV wrinkle acknowledged in the addon form.
    onFocus: () => inputRef.current?.focus(),
  });

  const saveButton = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => void save(),
  });
  const clearButton = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => void clear(),
  });

  const { ref, focusKey } = useFocusable<object, HTMLElement>({
    focusKey: SCREEN_FOCUS_KEY,
    saveLastFocusedChild: true,
  });

  useBackHandler(() => onNavigate({ screen: "home" }));

  useEffect(() => {
    void setFocus(INPUT_FOCUS_KEY);
  }, []);

  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void save();
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref} style={{ padding: "1rem" }}>
        <header style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <BackButton onBack={() => onNavigate({ screen: "home" })} />
          <h1>{labels.settings}</h1>
        </header>

        <form onSubmit={onFormSubmit} style={{ margin: "1rem 0" }}>
          <label>
            {labels.tmdbKeyLabel}
            <input
              ref={inputRef}
              type="text"
              value={apiKey}
              data-focused={inputFocused}
              disabled={isSaving}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ ...focusOutline(inputFocused), display: "block" }}
            />
          </label>
          <p>
            <small>{labels.tmdbKeyHint}</small>
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              ref={saveButton.ref}
              type="submit"
              data-focused={saveButton.focused}
              disabled={isSaving}
              style={focusOutline(saveButton.focused)}
            >
              {labels.save}
            </button>
            <button
              ref={clearButton.ref}
              type="button"
              data-focused={clearButton.focused}
              disabled={isSaving}
              onClick={() => void clear()}
              style={focusOutline(clearButton.focused)}
            >
              {labels.clear}
            </button>
          </div>
        </form>

        <p role="status">
          {hasProvider ? labels.tmdbKeyActive : labels.tmdbKeyInactive}
          {justSaved ? ` — ${labels.saved}` : ""}
        </p>
      </main>
    </FocusContext.Provider>
  );
}
