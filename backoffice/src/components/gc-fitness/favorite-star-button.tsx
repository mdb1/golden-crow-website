"use client";

// favorite-star-button.tsx
//
// The star toggle shown next to every favoritable row (#297): exercises,
// workout templates, habit templates — in lists AND searches. Self-contained:
// it reads/writes the shared `useFavorites()` cache, so dropping one into a
// table cell or a card needs no prop-drilling of favorite state. Many instances
// mounting at once is fine — React Query dedupes the single favorites query.
//
// Click is isolated (preventDefault + stopPropagation) so starring a row inside
// a clickable table row / card doesn't also trigger the row's navigation.

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useFavorites } from "@/lib/gc-fitness/use-favorites";
import type { FavoriteKind } from "@/lib/gc-fitness/favorites";

export interface FavoriteStarButtonProps {
  kind: FavoriteKind;
  id: string;
  /** Star size in px (default 16). */
  size?: number;
  className?: string;
}

export function FavoriteStarButton({
  kind,
  id,
  size = 16,
  className,
}: FavoriteStarButtonProps) {
  const t = useTranslations("favorites");
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(kind, id);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? t("remove") : t("add")}
      title={active ? t("remove") : t("add")}
      onClick={(event) => {
        // Don't let the click bubble to a clickable row / card.
        event.preventDefault();
        event.stopPropagation();
        toggle(kind, id);
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md p-1 transition-colors hover:bg-muted",
        className,
      )}
    >
      <Star
        style={{ width: size, height: size }}
        className={cn(
          active
            ? "fill-amber-400 text-amber-400"
            : "text-muted-foreground/60 hover:text-muted-foreground",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
