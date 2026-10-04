// SPDX-License-Identifier: AGPL-3.0-or-later
// Add-by-URL source manager (§6.2, §9.1). Paste a Stremio manifest URL to install
// a source, add M3U playlists / Xtream accounts, then toggle or remove them. All
// copy routes through the labels module (§9.2 / ADR-0007); "addon"/"manifest" is
// internal vocabulary, the UI says "Playlist"/"Source".

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
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
import { setFocus, useBackHandler } from "../focus";
import { Button, Callout, Card, Screen, TextField } from "../ui";
import type { NavigationProps } from "../navigation";
import { isIptvEnabled } from "../features";

const SCREEN_FOCUS_KEY = "ADDONS";
const INPUT_FOCUS_KEY = "ADDONS_INPUT";

export interface AddonManagerScreenProps extends NavigationProps {
  /** Rebuilds the core so a new/removed IPTV playlist's channels take effect. */
  reloadCore: () => Promise<void>;
}

/** A managed-entry row: a label and trailing action buttons. */
function EntryRow({
  label,
  dimmed,
  actions,
  ...rest
}: {
  label: ReactNode;
  dimmed?: boolean;
  actions: ReactNode;
} & Record<`data-${string}`, string>) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.6rem 0",
        opacity: dimmed === true ? 0.5 : 1,
        borderTop: "1px solid var(--line)",
      }}
      {...rest}
    >
      <span style={{ flex: 1, minWidth: 0, wordBreak: "break-all" }}>
        {label}
      </span>
      {actions}
    </div>
  );
}

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
    const ok = await onAdd(trimmed);
    if (ok) {
      setUrl("");
    }
  }
  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submit();
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-end" }}>
        <TextField
          focusKey={INPUT_FOCUS_KEY}
          label={labels.playlistUrl}
          type="url"
          value={url}
          onChangeText={setUrl}
          placeholder="https://…"
          disabled={isInstalling}
          style={{ flex: 1 }}
        />
        <Button
          type="button"
          onPress={() => void submit()}
          disabled={isInstalling || url.trim() === ""}
        >
          {isInstalling ? labels.installing : labels.addSourceButton}
        </Button>
      </div>
      {installError !== null && (
        <Callout tone="error" role="alert">
          {installError}
        </Callout>
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
  return (
    <EntryRow
      data-source={addon.manifestUrl}
      dimmed={!addon.enabled}
      label={addon.manifest.name}
      actions={
        <>
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
        </>
      }
    />
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
  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submit();
  }

  return (
    <Card title={labels.iptvTitle}>
      <form onSubmit={onSubmit}>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-end" }}>
          <TextField
            label={labels.iptvUrlLabel}
            type="url"
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            disabled={isSaving}
            style={{ flex: 1 }}
          />
          <Button
            type="button"
            onPress={() => void submit()}
            disabled={isSaving || url.trim() === ""}
          >
            {isSaving ? labels.installing : labels.iptvAddButton}
          </Button>
        </div>
        {error !== null && (
          <Callout tone="error" role="alert">
            {error}
          </Callout>
        )}
      </form>

      {playlists.length === 0 ? (
        <Callout tone="muted" style={{ marginBottom: 0 }}>
          {labels.iptvEmpty}
        </Callout>
      ) : (
        <div style={{ marginTop: "0.75rem" }}>
          {playlists.map((playlist: IptvPlaylist) => (
            <EntryRow
              key={playlist.url}
              data-playlist={playlist.url}
              label={playlist.name ?? playlist.url}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => void removePlaylist(playlist.url)}
                >
                  {labels.removeSource}
                </Button>
              }
            />
          ))}
        </div>
      )}
    </Card>
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
  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submit();
  }

  return (
    <Card title={labels.xtreamTitle}>
      <form onSubmit={onSubmit}>
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
        >
          <TextField
            label={labels.xtreamHost}
            type="url"
            value={host}
            onChangeText={setHost}
            placeholder="http://host:port"
            disabled={isSaving}
          />
          <TextField
            label={labels.xtreamUsername}
            type="text"
            value={username}
            onChangeText={setUsername}
            disabled={isSaving}
          />
          <TextField
            label={labels.xtreamPassword}
            type="password"
            value={password}
            onChangeText={setPassword}
            disabled={isSaving}
          />
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <Button
            type="button"
            onPress={() => void submit()}
            disabled={isSaving || host.trim() === "" || username.trim() === ""}
          >
            {isSaving ? labels.installing : labels.xtreamAddButton}
          </Button>
        </div>
        {error !== null && (
          <Callout tone="error" role="alert">
            {error}
          </Callout>
        )}
      </form>

      {accounts.length === 0 ? (
        <Callout tone="muted" style={{ marginBottom: 0 }}>
          {labels.xtreamEmpty}
        </Callout>
      ) : (
        <div style={{ marginTop: "0.75rem" }}>
          {accounts.map((account: XtreamAccount) => (
            <EntryRow
              key={`${account.host}|${account.username}`}
              data-xtream={`${account.host}|${account.username}`}
              label={`${account.username} @ ${account.host}`}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    void removeAccount(account.host, account.username)
                  }
                >
                  {labels.removeAccount}
                </Button>
              }
            />
          ))}
        </div>
      )}
    </Card>
  );
}

export function AddonManagerScreen({
  onNavigate,
  reloadCore,
}: AddonManagerScreenProps) {
  const { addons, isInstalling, installError, addByUrl, remove, setEnabled } =
    useAddonManager();

  useBackHandler(() => onNavigate({ screen: "home" }));

  useEffect(() => {
    void setFocus(INPUT_FOCUS_KEY);
  }, []);

  return (
    <Screen
      focusKey={SCREEN_FOCUS_KEY}
      title={labels.sourcesTitle}
      onBack={() => onNavigate({ screen: "home" })}
    >
      <Card>
        <AddSourceForm
          isInstalling={isInstalling}
          installError={installError}
          onAdd={addByUrl}
        />
        {addons.length === 0 ? (
          <Callout tone="muted" style={{ marginBottom: 0 }}>
            {labels.emptySources}
          </Callout>
        ) : (
          <div style={{ marginTop: "0.75rem" }}>
            {addons.map((addon) => (
              <AddonRow
                key={addon.manifestUrl}
                addon={addon}
                onSetEnabled={(url, enabled) => void setEnabled(url, enabled)}
                onRemove={(url) => void remove(url)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Hidden while the IPTV subsystem is gated off (features.ts) — adding a
          source there would do nothing, since nothing refreshes it. */}
      {isIptvEnabled() && (
        <>
          <IptvPlaylistsSection reloadCore={reloadCore} />
          <IptvXtreamSection reloadCore={reloadCore} />
        </>
      )}
    </Screen>
  );
}
