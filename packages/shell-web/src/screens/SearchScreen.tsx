// SPDX-License-Identifier: AGPL-3.0-or-later
// Search screen (§5): title search over core.metadata (TMDB-backed). The real
// entry point to the detail screen — type a title, pick a result, open detail.
// Results are metadata previews only, never streams (neutrality, §5.1). Copy
// routes through the labels module; focus follows AddonManagerScreen.

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { labels, useSearch } from "@shrimpler/shared-ui";
import type { MetaPreview } from "@shrimpler/core";
import { FocusContext, setFocus, useBackHandler, useFocusable } from "../focus";
import { BackButton } from "../components/BackButton";
import type { NavigationProps } from "../navigation";

const SCREEN_FOCUS_KEY = "SEARCH";
const INPUT_FOCUS_KEY = "SEARCH_INPUT";

const focusOutline = (focused: boolean): CSSProperties => ({
  outline: focused ? "2px solid #fff" : "2px solid transparent",
});

function ResultRow({
  item,
  onOpen,
}: {
  item: MetaPreview;
  onOpen: (item: MetaPreview) => void;
}) {
  const { ref, focused } = useFocusable<object, HTMLLIElement>({
    onEnterPress: () => onOpen(item),
  });
  return (
    <li
      ref={ref}
      data-focused={focused}
      data-result={item.id}
      onClick={() => onOpen(item)}
      style={{
        ...focusOutline(focused),
        display: "flex",
        gap: "0.75rem",
        alignItems: "center",
        padding: "0.5rem 0",
        cursor: "pointer",
      }}
    >
      {item.poster !== undefined && (
        <img src={item.poster} alt="" style={{ width: 46, flexShrink: 0 }} />
      )}
      <span style={{ flex: 1 }}>
        {item.name}
        {item.releaseInfo !== undefined ? ` (${item.releaseInfo})` : ""}
      </span>
      <span style={{ opacity: 0.6 }}>{item.type}</span>
    </li>
  );
}

export function SearchScreen({ onNavigate }: NavigationProps) {
  const { query, results, isSearching, error, setQuery, search } = useSearch();
  const [submitted, setSubmitted] = useState(false);

  const { ref: inputRef, focused: inputFocused } = useFocusable<
    object,
    HTMLInputElement
  >({
    focusKey: INPUT_FOCUS_KEY,
    // Move real DOM focus onto the field so keystrokes land in it (same TV
    // wrinkle noted in the addon form).
    onFocus: () => inputRef.current?.focus(),
  });

  const searchButton = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => void submit(),
  });

  const { ref, focusKey } = useFocusable<object, HTMLElement>({
    focusKey: SCREEN_FOCUS_KEY,
    saveLastFocusedChild: true,
  });

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
    <FocusContext.Provider value={focusKey}>
      <main ref={ref} style={{ padding: "1rem" }}>
        <header style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <BackButton onBack={() => onNavigate({ screen: "home" })} />
          <h1>{labels.searchTitle}</h1>
        </header>

        <form onSubmit={onFormSubmit} style={{ margin: "1rem 0" }}>
          <input
            ref={inputRef}
            type="search"
            value={query}
            aria-label={labels.searchPlaceholder}
            data-focused={inputFocused}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.searchPlaceholder}
            style={{ ...focusOutline(inputFocused), display: "block" }}
          />
          <button
            ref={searchButton.ref}
            type="submit"
            data-focused={searchButton.focused}
            disabled={isSearching || query.trim() === ""}
            style={focusOutline(searchButton.focused)}
          >
            {isSearching ? labels.searching : labels.searchButton}
          </button>
        </form>

        {error !== null && (
          <p role="alert" style={{ color: "#e66" }}>
            {error}
          </p>
        )}
        {showEmpty && <p>{labels.searchEmpty}</p>}

        {results.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {results.map((item) => (
              <ResultRow
                key={item.id}
                item={item}
                onOpen={(picked) =>
                  onNavigate({
                    screen: "detail",
                    id: picked.id,
                    type: picked.type,
                  })
                }
              />
            ))}
          </ul>
        )}
      </main>
    </FocusContext.Provider>
  );
}
