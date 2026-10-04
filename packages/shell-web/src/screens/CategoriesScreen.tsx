// SPDX-License-Identifier: AGPL-3.0-or-later
// Category drill-down, step 1 (ADR-0006): lists a catalog's groups (M3U
// group-title / Xtream categories) with counts, so a 10k-channel source stays
// navigable. Selecting a category opens the paged CatalogScreen filtered to that
// group. "All" is first, then groups alpha-sorted with "Uncategorized" last
// (core + useCatalogCategories order them). Copy routes through labels.

import { useEffect } from "react";
import { labels, useCatalogCategories } from "@shrimpler/shared-ui";
import type { CatalogCategory } from "@shrimpler/shared-ui";
import type { MediaType } from "@shrimpler/core";
import { setFocus, useBackHandler } from "../focus";
import { Badge, Button, Callout, EmptyState, ListRow, Screen } from "../ui";
import type { Route } from "../navigation";

const SCREEN_FOCUS_KEY = "CATEGORIES";
const BACK_FOCUS_KEY = "CATEGORIES_BACK";

interface CategoriesScreenProps {
  catalogType: MediaType;
  catalogId: string;
  title: string;
  onNavigate: (route: Route) => void;
}

export function CategoriesScreen({
  catalogType,
  catalogId,
  title,
  onNavigate,
}: CategoriesScreenProps) {
  const { categories, isLoading, error } = useCatalogCategories(
    catalogType,
    catalogId,
  );

  useBackHandler(() => onNavigate({ screen: "home" }));

  useEffect(() => {
    void setFocus(BACK_FOCUS_KEY);
  }, []);

  const showEmpty = !isLoading && error === null && categories.length === 0;

  const openCategory = (category: CatalogCategory) =>
    onNavigate({
      screen: "catalog",
      catalogType,
      catalogId,
      title: `${title} · ${category.label}`,
      ...(category.key !== undefined ? { genre: category.key } : {}),
      total: category.count,
    });

  return (
    <Screen
      focusKey={SCREEN_FOCUS_KEY}
      title={title}
      onBack={() => onNavigate({ screen: "home" })}
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

      {categories.length > 0 && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          {categories.map((category) => (
            <ListRow
              key={category.key ?? "__all__"}
              data-category={category.key ?? "__all__"}
              title={category.label}
              trailing={
                <Badge tone="neutral">{`${category.count} ${labels.categoryCount}`}</Badge>
              }
              onPress={() => openCategory(category)}
            />
          ))}
        </div>
      )}
    </Screen>
  );
}
