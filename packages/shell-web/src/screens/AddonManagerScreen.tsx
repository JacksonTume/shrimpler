// SPDX-License-Identifier: AGPL-3.0-or-later
// Add-by-URL addon manager (§6.2, §9.1). First consumer of the addon engine:
// paste a manifest URL to install a source, then toggle or remove installed
// ones. All copy routes through the labels module (§9.2 / ADR-0007). Focus
// wiring follows the FocusSpikeScreen conventions (norigin spatial nav).

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  labels,
  useAddonManager,
  useIptvPlaylists,
  useIptvXtream,
} from "@shrimpler/shared-ui";
import type {
  InstalledAddon,
  IptvPlaylist,
  XtreamAccount,
} from "@shrimpler/core";
import { FocusContext, setFocus, useBackHandler, useFocusable } from "../focus";
import { BackButton } from "../components/BackButton";
import type { NavigationProps } from "../navigation";

export interface AddonManagerScreenProps extends NavigationProps {
  /** Rebuilds the core so a new/removed IPTV playlist's channels take effect. */
  reloadCore: () => Promise<void>;
}

const SCREEN_FOCUS_KEY = "ADDONS";
const INPUT_FOCUS_KEY = "ADDONS_INPUT";

const focusOutline = (focused: boolean): CSSProperties => ({
  outline: focused ? "2px solid #fff" : "2px solid transparent",
});

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

  const { ref: inputRef, focused: inputFocused } = useFocusable<
    object,
    HTMLInputElement
  >({
    focusKey: INPUT_FOCUS_KEY,
    // Move real DOM focus onto the field so keystrokes land in it (the engine
    // only tracks logical focus; the ref points at the same input node).
    // Arrow-key vs. caret conflict is a known TV wrinkle — acceptable for the
    // web-first MVP (revisit in the RN/TV pass).
    onFocus: () => inputRef.current?.focus(),
  });

  const { ref: buttonRef, focused: buttonFocused } = useFocusable<
    object,
    HTMLButtonElement
  >({ onEnterPress: () => void submit() });

  async function submit(): Promise<void> {
    const trimmed = url.trim();
    if (trimmed === "" || isInstalling) {
      return;
    }
    const ok = await onAdd(trimmed);
    if (ok) {
      setUrl("");
    }
  }

  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submit();
  }

  return (
    <form onSubmit={onFormSubmit} style={{ margin: "1rem 0" }}>
      <label>
        {labels.playlistUrl}
        <input
          ref={inputRef}
          type="url"
          value={url}
          data-focused={inputFocused}
          disabled={isInstalling}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          style={{ ...focusOutline(inputFocused), display: "block" }}
        />
      </label>
      <button
        ref={buttonRef}
        type="submit"
        data-focused={buttonFocused}
        disabled={isInstalling || url.trim() === ""}
        style={focusOutline(buttonFocused)}
      >
        {isInstalling ? labels.installing : labels.addSourceButton}
      </button>
      {installError !== null && (
        <p role="alert" style={{ color: "#e66" }}>
          {installError}
        </p>
      )}
    </form>
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
  const { ref, focusKey } = useFocusable<object, HTMLLIElement>({
    saveLastFocusedChild: true,
  });
  const toggle = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => onSetEnabled(addon.manifestUrl, !addon.enabled),
  });
  const remove = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => onRemove(addon.manifestUrl),
  });

  return (
    <FocusContext.Provider value={focusKey}>
      <li
        ref={ref}
        data-source={addon.manifestUrl}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.5rem 0",
          opacity: addon.enabled ? 1 : 0.5,
        }}
      >
        <span style={{ flex: 1 }}>{addon.manifest.name}</span>
        <button
          ref={toggle.ref}
          type="button"
          data-focused={toggle.focused}
          onClick={() => onSetEnabled(addon.manifestUrl, !addon.enabled)}
          style={focusOutline(toggle.focused)}
        >
          {addon.enabled ? labels.disableSource : labels.enableSource}
        </button>
        <button
          ref={remove.ref}
          type="button"
          data-focused={remove.focused}
          onClick={() => onRemove(addon.manifestUrl)}
          style={focusOutline(remove.focused)}
        >
          {labels.removeSource}
        </button>
      </li>
    </FocusContext.Provider>
  );
}

function IptvPlaylistRow({
  playlist,
  onRemove,
}: {
  playlist: IptvPlaylist;
  onRemove: (url: string) => void;
}) {
  const { ref, focusKey } = useFocusable<object, HTMLLIElement>({
    saveLastFocusedChild: true,
  });
  const remove = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => onRemove(playlist.url),
  });
  return (
    <FocusContext.Provider value={focusKey}>
      <li
        ref={ref}
        data-playlist={playlist.url}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.5rem 0",
        }}
      >
        <span style={{ flex: 1, wordBreak: "break-all" }}>
          {playlist.name ?? playlist.url}
        </span>
        <button
          ref={remove.ref}
          type="button"
          data-focused={remove.focused}
          onClick={() => onRemove(playlist.url)}
          style={focusOutline(remove.focused)}
        >
          {labels.removeSource}
        </button>
      </li>
    </FocusContext.Provider>
  );
}

function IptvPlaylistsSection({
  reloadCore,
}: {
  reloadCore: () => Promise<void>;
}) {
  const { playlists, isSaving, error, addPlaylist, removePlaylist } =
    useIptvPlaylists(reloadCore);
  const [url, setUrl] = useState("");

  const { ref: inputRef, focused: inputFocused } = useFocusable<
    object,
    HTMLInputElement
  >({ onFocus: () => inputRef.current?.focus() });
  const { ref: buttonRef, focused: buttonFocused } = useFocusable<
    object,
    HTMLButtonElement
  >({ onEnterPress: () => void submit() });

  async function submit(): Promise<void> {
    const trimmed = url.trim();
    if (trimmed === "" || isSaving) {
      return;
    }
    const ok = await addPlaylist(trimmed);
    if (ok) {
      setUrl("");
    }
  }

  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submit();
  }

  return (
    <section style={{ marginTop: "2rem" }}>
      <h2>{labels.iptvTitle}</h2>
      <form onSubmit={onFormSubmit} style={{ margin: "1rem 0" }}>
        <label>
          {labels.iptvUrlLabel}
          <input
            ref={inputRef}
            type="url"
            value={url}
            data-focused={inputFocused}
            disabled={isSaving}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            style={{ ...focusOutline(inputFocused), display: "block" }}
          />
        </label>
        <button
          ref={buttonRef}
          type="submit"
          data-focused={buttonFocused}
          disabled={isSaving || url.trim() === ""}
          style={focusOutline(buttonFocused)}
        >
          {isSaving ? labels.installing : labels.iptvAddButton}
        </button>
        {error !== null && (
          <p role="alert" style={{ color: "#e66" }}>
            {error}
          </p>
        )}
      </form>

      {playlists.length === 0 ? (
        <p>{labels.iptvEmpty}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {playlists.map((playlist) => (
            <IptvPlaylistRow
              key={playlist.url}
              playlist={playlist}
              onRemove={(u) => void removePlaylist(u)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function XtreamAccountRow({
  account,
  onRemove,
}: {
  account: XtreamAccount;
  onRemove: (host: string, username: string) => void;
}) {
  const { ref, focusKey } = useFocusable<object, HTMLLIElement>({
    saveLastFocusedChild: true,
  });
  const remove = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => onRemove(account.host, account.username),
  });
  return (
    <FocusContext.Provider value={focusKey}>
      <li
        ref={ref}
        data-xtream={`${account.host}|${account.username}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.5rem 0",
        }}
      >
        <span style={{ flex: 1, wordBreak: "break-all" }}>
          {account.username} @ {account.host}
        </span>
        <button
          ref={remove.ref}
          type="button"
          data-focused={remove.focused}
          onClick={() => onRemove(account.host, account.username)}
          style={focusOutline(remove.focused)}
        >
          {labels.removeAccount}
        </button>
      </li>
    </FocusContext.Provider>
  );
}

function IptvXtreamSection({
  reloadCore,
}: {
  reloadCore: () => Promise<void>;
}) {
  const { accounts, isSaving, error, addAccount, removeAccount } =
    useIptvXtream(reloadCore);
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const field = (): CSSProperties => ({
    display: "block",
    margin: "0.25rem 0",
  });

  async function submit(): Promise<void> {
    if (host.trim() === "" || username.trim() === "" || isSaving) {
      return;
    }
    const ok = await addAccount({ host: host.trim(), username, password });
    if (ok) {
      setHost("");
      setUsername("");
      setPassword("");
    }
  }

  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submit();
  }

  return (
    <section style={{ marginTop: "2rem" }}>
      <h2>{labels.xtreamTitle}</h2>
      <form onSubmit={onFormSubmit} style={{ margin: "1rem 0" }}>
        <label style={field()}>
          {labels.xtreamHost}
          <input
            type="url"
            value={host}
            disabled={isSaving}
            onChange={(e) => setHost(e.target.value)}
            placeholder="http://host:port"
            style={{ display: "block" }}
          />
        </label>
        <label style={field()}>
          {labels.xtreamUsername}
          <input
            type="text"
            value={username}
            disabled={isSaving}
            onChange={(e) => setUsername(e.target.value)}
            style={{ display: "block" }}
          />
        </label>
        <label style={field()}>
          {labels.xtreamPassword}
          <input
            type="password"
            value={password}
            disabled={isSaving}
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: "block" }}
          />
        </label>
        <button
          type="submit"
          disabled={isSaving || host.trim() === "" || username.trim() === ""}
        >
          {isSaving ? labels.installing : labels.xtreamAddButton}
        </button>
        {error !== null && (
          <p role="alert" style={{ color: "#e66" }}>
            {error}
          </p>
        )}
      </form>

      {accounts.length === 0 ? (
        <p>{labels.xtreamEmpty}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {accounts.map((account) => (
            <XtreamAccountRow
              key={`${account.host}|${account.username}`}
              account={account}
              onRemove={(h, u) => void removeAccount(h, u)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function AddonManagerScreen({
  onNavigate,
  reloadCore,
}: AddonManagerScreenProps) {
  const { addons, isInstalling, installError, addByUrl, remove, setEnabled } =
    useAddonManager();
  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({
    focusKey: SCREEN_FOCUS_KEY,
    saveLastFocusedChild: true,
  });

  useBackHandler(() => onNavigate({ screen: "home" }));

  useEffect(() => {
    void setFocus(INPUT_FOCUS_KEY);
  }, []);

  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref} style={{ padding: "1rem" }}>
        <header style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <BackButton onBack={() => onNavigate({ screen: "home" })} />
          <h1>{labels.sourcesTitle}</h1>
        </header>

        <AddSourceForm
          isInstalling={isInstalling}
          installError={installError}
          onAdd={addByUrl}
        />

        {addons.length === 0 ? (
          <p>{labels.emptySources}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {addons.map((addon) => (
              <AddonRow
                key={addon.manifestUrl}
                addon={addon}
                onSetEnabled={(url, enabled) => void setEnabled(url, enabled)}
                onRemove={(url) => void remove(url)}
              />
            ))}
          </ul>
        )}

        <IptvPlaylistsSection reloadCore={reloadCore} />
        <IptvXtreamSection reloadCore={reloadCore} />
      </main>
    </FocusContext.Provider>
  );
}
