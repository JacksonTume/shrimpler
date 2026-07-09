// SPDX-License-Identifier: AGPL-3.0-or-later
// Generic IPTV catalog browser (§8, ADR-0006): renders a MetaPreview[] from an
// addon catalog (Live TV `iptv:live`, Movies `iptv:movies`, Series `iptv:series`)
// and opens a card's detail. Poster shape follows the item (square for channels,
// poster for VOD). Items are metadata previews only — the source is on the detail
// screen (neutrality, §5.1). Copy routes through labels; focus follows Search.

import { useEffect } from "react";
import type { CSSProperties } from "react";
import { labels, useCatalog } from "@shrimpler/shared-ui";
import type { MediaType, MetaPreview } from "@shrimpler/core";
import { FocusContext, setFocus, useBackHandler, useFocusable } from "../focus";
import { BackButton } from "../components/BackButton";
import type { Route } from "../navigation";

const SCREEN_FOCUS_KEY = "CATALOG";
const BACK_FOCUS_KEY = "CATALOG_BACK";

const focusOutline = (focused: boolean): CSSProperties => ({
  outline: focused ? "2px solid #fff" : "2px solid transparent",
});

interface CatalogScreenProps {
  catalogType: MediaType;
  catalogId: string;
  title: string;
  onNavigate: (route: Route) => void;
}

function CatalogCard({
  item,
  onOpen,
}: {
  item: MetaPreview;
  onOpen: (item: MetaPreview) => void;
}) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => onOpen(item),
  });
  const square = item.posterShape === "square";
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused}
      data-item={item.id}
      onClick={() => onOpen(item)}
      style={{
        ...focusOutline(focused),
        width: square ? 140 : 120,
        textAlign: "center",
        padding: "0.5rem",
        cursor: "pointer",
      }}
    >
      {item.poster !== undefined && (
        <img
          src={item.poster}
          alt=""
          style={{
            width: "100%",
            aspectRatio: square ? "1 / 1" : "2 / 3",
            objectFit: square ? "contain" : "cover",
          }}
        />
      )}
      <span style={{ display: "block", marginTop: "0.25rem" }}>
        {item.name}
      </span>
    </button>
  );
}

export function CatalogScreen({
  catalogType,
  catalogId,
  title,
  onNavigate,
}: CatalogScreenProps) {
  const { items, isLoading, error } = useCatalog(catalogType, catalogId);
  const { ref, focusKey } = useFocusable<object, HTMLElement>({
    focusKey: SCREEN_FOCUS_KEY,
    saveLastFocusedChild: true,
  });

  useBackHandler(() => onNavigate({ screen: "home" }));

  useEffect(() => {
    void setFocus(BACK_FOCUS_KEY);
  }, []);

  const showEmpty = !isLoading && error === null && items.length === 0;

  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref} style={{ padding: "1rem" }}>
        <header style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <BackButton
            focusKey={BACK_FOCUS_KEY}
            onBack={() => onNavigate({ screen: "home" })}
          />
          <h1>{title}</h1>
        </header>

        {isLoading && <p>{labels.channelsLoading}</p>}
        {error !== null && (
          <p role="alert" style={{ color: "#e66" }}>
            {error}
          </p>
        )}
        {showEmpty && (
          <p>
            {labels.channelsEmpty}{" "}
            <button
              type="button"
              onClick={() => onNavigate({ screen: "addons" })}
            >
              {labels.iptvTitle}
            </button>
          </p>
        )}

        {items.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginTop: "1rem",
            }}
          >
            {items.map((item) => (
              <CatalogCard
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
          </div>
        )}
      </main>
    </FocusContext.Provider>
  );
}
