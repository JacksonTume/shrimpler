// SPDX-License-Identifier: AGPL-3.0-or-later
// Generic IPTV catalog browser (§8, ADR-0006): renders a MetaPreview[] from an
// addon catalog (Live TV `iptv:live`, Movies `iptv:movies`, Series `iptv:series`)
// and opens a card's detail. Reached via CategoriesScreen with a `genre` filter;
// items page in incrementally (useCatalogPage + CatalogExtra.skip) so a category
// with thousands of items never mounts all at once. An IntersectionObserver
// sentinel auto-loads on scroll, with a focusable "Load more" fallback for
// spatial-nav/TV (ADR-0010). Poster shape follows the item (square for channels,
// poster for VOD). Items are metadata previews only — the source is on the detail
// screen (neutrality, §5.1). Copy routes through labels; focus follows Search.

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { labels, useCatalogPage, useNowNext } from "@shrimpler/shared-ui";
import type { MediaType, MetaPreview, NowNext } from "@shrimpler/core";
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
  genre?: string;
  total?: number;
  onNavigate: (route: Route) => void;
}

// Now/next strip under a live-channel card (§8.2, ADR-0015). Supplementary: absent
// when the channel has no matched guide. The progress bar reflects how far into the
// current programme we are (computed at render from the wall clock).
function NowNextStrip({ nowNext }: { nowNext: NowNext }) {
  const { now, next } = nowNext;
  const at = Date.now();
  const progress =
    now !== undefined && now.stop > now.start
      ? Math.min(1, Math.max(0, (at - now.start) / (now.stop - now.start)))
      : 0;
  const line: CSSProperties = {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "100%",
  };
  return (
    <span
      style={{
        display: "block",
        marginTop: "0.25rem",
        textAlign: "left",
        fontSize: 11,
        color: "#aaa",
      }}
    >
      {now !== undefined && (
        <>
          <span style={line} title={now.title}>
            {labels.epgNow}: {now.title}
          </span>
          <span
            aria-hidden
            style={{
              display: "block",
              height: 2,
              marginTop: 2,
              background: "#444",
            }}
          >
            <span
              style={{
                display: "block",
                height: "100%",
                width: `${Math.round(progress * 100)}%`,
                background: "#c33",
              }}
            />
          </span>
        </>
      )}
      {next !== undefined && (
        <span style={{ ...line, marginTop: 2 }} title={next.title}>
          {labels.epgNext}: {next.title}
        </span>
      )}
    </span>
  );
}

function CatalogCard({
  item,
  nowNext,
  onOpen,
}: {
  item: MetaPreview;
  nowNext?: NowNext;
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
      {nowNext !== undefined && <NowNextStrip nowNext={nowNext} />}
    </button>
  );
}

function LoadMoreButton({ onLoadMore }: { onLoadMore: () => void }) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    onEnterPress: onLoadMore,
  });
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused}
      onClick={onLoadMore}
      style={{
        ...focusOutline(focused),
        padding: "0.5rem 1rem",
        cursor: "pointer",
      }}
    >
      {labels.loadMore}
    </button>
  );
}

export function CatalogScreen({
  catalogType,
  catalogId,
  title,
  genre,
  total,
  onNavigate,
}: CatalogScreenProps) {
  const { items, isLoading, isLoadingMore, hasMore, error, loadMore } =
    useCatalogPage(catalogType, catalogId, genre, total);
  // now/next for the loaded live channels (§8.2, ADR-0015). No-op for VOD catalogs
  // (no `tv` items → empty id set); the hook batches the whole visible page.
  const { byId: epgById } = useNowNext(
    items.filter((item) => item.type === "tv").map((item) => item.id),
  );
  const { ref, focusKey } = useFocusable<object, HTMLElement>({
    focusKey: SCREEN_FOCUS_KEY,
    saveLastFocusedChild: true,
  });

  const backToCategories = (): Route => ({
    screen: "categories",
    catalogType,
    catalogId,
    title,
  });

  useBackHandler(() => onNavigate(backToCategories()));

  useEffect(() => {
    void setFocus(BACK_FOCUS_KEY);
  }, []);

  // Auto-load the next page when the sentinel scrolls into view; the focusable
  // "Load more" button below is the fallback where scroll can't drive it (TV).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMoreRef.current();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]);

  const showEmpty = !isLoading && error === null && items.length === 0;

  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref} style={{ padding: "1rem" }}>
        <header style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <BackButton
            focusKey={BACK_FOCUS_KEY}
            onBack={() => onNavigate(backToCategories())}
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
                nowNext={epgById[item.id]}
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

        {hasMore && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: "1rem",
            }}
          >
            <div ref={sentinelRef} aria-hidden />
            {isLoadingMore ? (
              <p>{labels.channelsLoading}</p>
            ) : (
              <LoadMoreButton onLoadMore={loadMore} />
            )}
          </div>
        )}
      </main>
    </FocusContext.Provider>
  );
}
