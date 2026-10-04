// SPDX-License-Identifier: AGPL-3.0-or-later
// Search screen (§5): title search over core.metadata (TMDB-backed). The real
// entry point to the detail screen — type a title, pick a result, open detail.
// Results are metadata previews only, never streams (neutrality, §5.1). Copy
// routes through the labels module.

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { labels, useSearch } from "@shrimpler/shared-ui";
import type { MetaPreview } from "@shrimpler/core";
import { setFocus, useBackHandler } from "../focus";
import { Button, Callout, ListRow, Screen, TextField } from "../ui";
import type { NavigationProps } from "../navigation";

const SCREEN_FOCUS_KEY = "SEARCH";
const INPUT_FOCUS_KEY = "SEARCH_INPUT";

function resultLabel(item: MetaPreview): string {
  return item.releaseInfo !== undefined
    ? `${item.name} (${item.releaseInfo})`
    : item.name;
}

function PosterThumb({ src }: { src?: string }) {
  return (
    <span
      style={{
        width: 40,
        height: 56,
        flexShrink: 0,
        borderRadius: "var(--r-sm)",
        overflow: "hidden",
        background: "var(--surface-2)",
        display: "block",
      }}
    >
      {src !== undefined && (
        <img
          src={src}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </span>
  );
}

export function SearchScreen({ onNavigate }: NavigationProps) {
  const { query, results, isSearching, error, setQuery, search } = useSearch();
  const [submitted, setSubmitted] = useState(false);

  useBackHandler(() => onNavigate({ screen: "home" }));

  useEffect(() => {
    void setFocus(INPUT_FOCUS_KEY);
  }, []);

  async function submit(): Promise<void> {
    setSubmitted(true);
    await search();
  }

  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submit();
  }

  const showEmpty =
    submitted && !isSearching && error === null && results.length === 0;

  return (
    <Screen
      focusKey={SCREEN_FOCUS_KEY}
      title={labels.searchTitle}
      onBack={() => onNavigate({ screen: "home" })}
    >
      <form
        onSubmit={onFormSubmit}
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          margin: "0 0 1.5rem",
        }}
      >
        <TextField
          focusKey={INPUT_FOCUS_KEY}
          type="search"
          value={query}
          onChangeText={setQuery}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          style={{ flex: 1 }}
        />
        <Button
          onPress={() => void submit()}
          disabled={isSearching || query.trim() === ""}
        >
          {isSearching ? labels.searching : labels.searchButton}
        </Button>
      </form>

      {error !== null && (
        <Callout tone="error" role="alert">
          {error}
        </Callout>
      )}
      {showEmpty && <Callout tone="muted">{labels.searchEmpty}</Callout>}

      {results.length > 0 && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          {results.map((item) => (
            <ListRow
              key={item.id}
              data-result={item.id}
              leading={<PosterThumb src={item.poster} />}
              title={resultLabel(item)}
              trailing={item.type}
              onPress={() =>
                onNavigate({ screen: "detail", id: item.id, type: item.type })
              }
            />
          ))}
        </div>
      )}
    </Screen>
  );
}
