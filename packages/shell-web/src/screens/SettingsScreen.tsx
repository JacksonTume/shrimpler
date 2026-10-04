// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings screen. Runtime entry/persistence of the TMDB API key and Real-Debrid
// token (§5, §14.3): user-supplied, stored locally via the StorageAdapter, and
// applied by rebuilding the core (reloadCore, from the composition root). TMDB is
// a metadata provider (presentation data only, §5.1) and Real-Debrid a stream
// resolver — naming them is neutrality-safe. Copy routes through labels.

import { useEffect } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  labels,
  useDebridSettings,
  useTmdbSettings,
} from "@shrimpler/shared-ui";
import { setFocus, useBackHandler } from "../focus";
import { Button, Callout, Screen, TextField } from "../ui";
import type { NavigationProps } from "../navigation";

const SCREEN_FOCUS_KEY = "SETTINGS";
const INPUT_FOCUS_KEY = "SETTINGS_INPUT";

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
  inputFocusKey,
}: {
  label: string;
  hint: string;
  value: string;
  onChangeText: (v: string) => void;
  onSave: () => void;
  onClear: () => void;
  isSaving: boolean;
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  justSaved: boolean;
  inputFocusKey?: string;
}) {
  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSave();
  }
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-lg)",
        padding: "1.25rem",
        marginBottom: "1.25rem",
      }}
    >
      <form onSubmit={onSubmit}>
        <TextField
          focusKey={inputFocusKey}
          label={label}
          type="text"
          value={value}
          onChangeText={onChangeText}
          disabled={isSaving}
        />
        <p
          style={{
            margin: "0.5rem 0 1rem",
            color: "var(--sand-faint)",
            fontSize: "var(--fs-small)",
          }}
        >
          {hint}
        </p>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <Button type="button" onPress={onSave} disabled={isSaving}>
            {labels.save}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onPress={onClear}
            disabled={isSaving}
          >
            {labels.clear}
          </Button>
        </div>
      </form>
      <Callout tone="status" role="status" style={{ marginBottom: 0 }}>
        <StatusDot on={active} />
        {active ? activeLabel : inactiveLabel}
        {justSaved ? ` — ${labels.saved}` : ""}
      </Callout>
    </section>
  );
}

function StatusDot({ on }: { on: boolean }): ReactNode {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        marginRight: "0.5rem",
        verticalAlign: "middle",
        background: on ? "var(--seafoam)" : "var(--sand-faint)",
      }}
    />
  );
}

export function SettingsScreen({
  onNavigate,
  reloadCore,
}: SettingsScreenProps) {
  const tmdb = useTmdbSettings(reloadCore);
  const debrid = useDebridSettings(reloadCore);

  useBackHandler(() => onNavigate({ screen: "home" }));

  useEffect(() => {
    void setFocus(INPUT_FOCUS_KEY);
  }, []);

  return (
    <Screen
      focusKey={SCREEN_FOCUS_KEY}
      title={labels.settings}
      onBack={() => onNavigate({ screen: "home" })}
    >
      <SettingKey
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
        inputFocusKey={INPUT_FOCUS_KEY}
      />
      <SettingKey
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
    </Screen>
  );
}
