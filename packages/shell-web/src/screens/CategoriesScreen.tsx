// SPDX-License-Identifier: AGPL-3.0-or-later
// Category drill-down, step 1 (ADR-0006): lists a catalog's groups (M3U
// group-title / Xtream categories) with counts, so a 10k-channel source stays
// navigable. Selecting a category opens the paged CatalogScreen filtered to that
// group. "All" is first, then groups alpha-sorted with "Uncategorized" last
// (core + useCatalogCategories order them). Copy routes through labels; focus/
// back mirror CatalogScreen.

import { useEffect } from "react";
import type { CSSProperties } from "react";
import { labels, useCatalogCategories } from "@shrimpler/shared-ui";
import type { CatalogCategory } from "@shrimpler/shared-ui";
import type { MediaType } from "@shrimpler/core";
import { FocusContext, setFocus, useBackHandler, useFocusable } from "../focus";
import { BackButton } from "../components/BackButton";
import type { Route } from "../navigation";

const SCREEN_FOCUS_KEY = "CATEGORIES";
const BACK_FOCUS_KEY = "CATEGORIES_BACK";

const focusOutline = (focused: boolean): CSSProperties => ({
  outline: focused ? "2px solid #fff" : "2px solid transparent",
});

interface CategoriesScreenProps {
  catalogType: MediaType;
  catalogId: string;
  title: string;
  onNavigate: (route: Route) => void;
}

function CategoryRow({
  category,
  onOpen,
}: {
  category: CatalogCategory;
  onOpen: (category: CatalogCategory) => void;
}) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    onEnterPress: () => onOpen(category),
  });
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused}
      data-category={category.key ?? "__all__"}
      onClick={() => onOpen(category)}
      style={{
        ...focusOutline(focused),
        display: "flex",
        justifyContent: "space-between",
        gap: "1rem",
        width: "100%",
        maxWidth: 480,
        padding: "0.75rem 1rem",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span>{category.label}</span>
      <span style={{ opacity: 0.7 }}>
        {category.count} {labels.categoryCount}
      </span>
    </button>
  );
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
  const { ref, focusKey } = useFocusable<object, HTMLElement>({
    focusKey: SCREEN_FOCUS_KEY,
    saveLastFocusedChild: true,
  });

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

        {categories.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              marginTop: "1rem",
            }}
          >
            {categories.map((category) => (
              <CategoryRow
                key={category.key ?? "__all__"}
                category={category}
                onOpen={openCategory}
              />
            ))}
          </div>
        )}
      </main>
    </FocusContext.Provider>
  );
}
