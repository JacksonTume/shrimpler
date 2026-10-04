// SPDX-License-Identifier: AGPL-3.0-or-later
// Generic IPTV catalog browser (§8, ADR-0006): renders a MetaPreview[] from an
// addon catalog (Live TV `iptv:live`, Movies `iptv:movies`, Series `iptv:series`)
// and opens a card's detail. Reached via CategoriesScreen with a `genre` filter;
// items page in incrementally (useCatalogPage + CatalogExtra.skip) so a category
// with thousands of items never mounts all at once. An IntersectionObserver
// sentinel auto-loads on scroll, with a focusable "Load more" fallback for
// spatial-nav/TV (ADR-0010). Live channels carry an EPG now/next strip.

import { useEffect, useRef } from "react";
import { labels, useCatalogPage, useNowNext } from "@shrimpler/shared-ui";
import type { MediaType, MetaPreview, NowNext } from "@shrimpler/core";
import { setFocus, useBackHandler } from "../focus";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  PosterCard,
  PosterGrid,
  Screen,
  TideBar,
} from "../ui";
import type { Route } from "../navigation";

const SCREEN_FOCUS_KEY = "CATALOG";
const BACK_FOCUS_KEY = "CATALOG_BACK";

interface CatalogScreenProps {
  catalogType: MediaType;
  catalogId: string;
  title: string;
  genre?: string;
  total?: number;
  onNavigate: (route: Route) => void;
}

// Now/next strip under a live-channel card (§8.2, ADR-0015). Supplementary: the
// tide bar shows how far into the current programme we are (from the wall clock).
function NowNextStrip({ nowNext }: { nowNext: NowNext }) {
  const { now, next } = nowNext;
  const at = Date.now();
  const progress =
    now !== undefined && now.stop > now.start
      ? Math.min(1, Math.max(0, (at - now.start) / (now.stop - now.start)))
      : 0;
  const line = {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "var(--fs-caption)",
    color: "var(--sand-dim)",
  } as const;
  return (
    <span style={{ display: "block" }}>
      {now !== undefined && (
        <>
          <span style={line} title={now.title}>
            {labels.epgNow}: {now.title}
          </span>
          <TideBar
            value={progress}
            height={2}
            crest={false}
            style={{ margin: "3px 0" }}
          />
        </>
      )}
      {next !== undefined && (
        <span style={line} title={next.title}>
          {labels.epgNext}: {next.title}
        </span>
      )}
    </span>
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
  const { byId: epgById } = useNowNext(
    items.filter((item) => item.type === "tv").map((item) => item.id),
  );

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
    <Screen
      focusKey={SCREEN_FOCUS_KEY}
      title={title}
      onBack={() => onNavigate(backToCategories())}
      backFocusKey={BACK_FOCUS_KEY}
    >
      {isLoading && <Callout tone="status">{labels.channelsLoading}</Callout>}
      {error !== null && (
        <Callout tone="error" role="alert">
          {error}
        </Callout>
      )}
      {showEmpty && (
        <EmptyState
          title={labels.channelsEmpty}
          action={
            <Button
              variant="ghost"
              onPress={() => onNavigate({ screen: "addons" })}
            >
              {labels.iptvTitle}
            </Button>
          }
        />
      )}

      {items.length > 0 && (
        <PosterGrid>
          {items.map((item: MetaPreview) => {
            const nowNext = epgById[item.id];
            return (
              <PosterCard
                key={item.id}
                data-item={item.id}
                title={item.name}
                poster={item.poster}
                posterShape={
                  item.posterShape === "square" ? "square" : "poster"
                }
                badge={
                  item.type === "tv" ? (
                    <Badge tone="live">{labels.live}</Badge>
                  ) : undefined
                }
                footer={
                  nowNext !== undefined ? (
                    <NowNextStrip nowNext={nowNext} />
                  ) : undefined
                }
                onPress={() =>
                  onNavigate({ screen: "detail", id: item.id, type: item.type })
                }
              />
            );
          })}
        </PosterGrid>
      )}

      {hasMore && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "1.5rem",
          }}
        >
          <div ref={sentinelRef} aria-hidden />
          {isLoadingMore ? (
            <Callout tone="status">{labels.channelsLoading}</Callout>
          ) : (
            <Button variant="ghost" onPress={loadMore}>
              {labels.loadMore}
            </Button>
          )}
        </div>
      )}
    </Screen>
  );
}
