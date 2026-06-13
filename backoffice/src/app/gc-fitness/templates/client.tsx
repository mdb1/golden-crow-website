"use client";

// templates/client.tsx
//
// Client orchestrator for `/gc-fitness/templates`. Composes:
//
//   - `useWorkoutTemplates({ tag })` — Server-Action-backed React-Query feed
//   - Tag filter (shadcn `Select`) — re-runs the query on change
//   - TanStack Table with `getSortedRowModel()` per RESEARCH §Pattern 6
//   - "+ New template" CTA → `/gc-fitness/templates/new`
//   - Delete action → confirm dialog → softDeleteWorkoutTemplate + cache invalidate

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Copy,
  Dumbbell,
  Eye,
  Pencil,
  Plus,
  Search,
  Sparkles,
  SlidersHorizontal,
  Star,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  useWorkoutTemplates,
  WORKOUT_TEMPLATES_BASE_KEY,
} from "@/lib/gc-fitness/workout-templates-listener";
import {
  softDeleteWorkoutTemplate,
  duplicateWorkoutTemplate,
} from "@/lib/gc-fitness/workout-template-actions";
import type { WorkoutTemplateRow } from "@/lib/gc-fitness/workout-template-actions";
import { estimateTemplateDurationMinutesFromRaw } from "@/lib/gc-fitness/workout-duration-estimate";
import { fuzzyTokenScore } from "@/lib/gc-fitness/exercise-search";
import { useFavorites } from "@/lib/gc-fitness/use-favorites";
import {
  favoriteIdSet,
  filterFavoritesOnly,
  sortFavoritesFirst,
} from "@/lib/gc-fitness/favorites";
import { FavoriteStarButton } from "@/components/gc-fitness/favorite-star-button";
import type { TemplateListRow } from "@/components/gc-fitness/templates/columns";

// Tag → human label (kept local — small, list-only).
const TAG_LABELS: Record<string, string> = {
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  upper: "Upper",
  lower: "Lower",
  "full-body": "Full body",
  custom: "Custom",
};

// Difficulty-ish tag → semantic Badge variant per the redesign doc.
// Principiante/beginner → success, Intermedio/intermediate → brand,
// Avanzado/advanced → violet. Everything else falls back to secondary.
function tagBadgeVariant(
  raw: string,
): "success" | "brand" | "violet" | "secondary" {
  const v = raw.toLowerCase();
  if (/(principiante|beginner|f[aá]cil|easy)/.test(v)) return "success";
  if (/(intermedio|intermediate|medio)/.test(v)) return "brand";
  if (/(avanzado|advanced|expert|dif[ií]cil|hard)/.test(v)) return "violet";
  return "secondary";
}

// localStorage prefix used by template-form.tsx for autosaved drafts.
// We only surface the "new" key here — edit drafts mutate an existing row.
const DRAFT_STORAGE_KEY_NEW = "gc-fitness:template-draft:new";

interface NewTemplateDraft {
  name?: { en?: string; es?: string };
  description?: { en?: string; es?: string };
  tag?: string;
  tags?: string[];
  exercises?: Array<unknown>;
}

function readNewDraft(): NewTemplateDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY_NEW);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as NewTemplateDraft) : null;
  } catch {
    return null;
  }
}

export interface TemplatesLibraryClientProps {
  trainerUid: string;
  /** When rendered inside the Biblioteca shell, the page title is provided by
   *  the shell — suppress this component's own heading. */
  embedded?: boolean;
}

export function TemplatesLibraryClient({
  trainerUid,
  embedded = false,
}: TemplatesLibraryClientProps) {
  const router = useRouter();
  const t = useTranslations("templates.list");
  const tFilters = useTranslations("exercises.filters");
  const queryClient = useQueryClient();
  const [tagFilter, setTagFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [confirmDelete, setConfirmDelete] =
    useState<WorkoutTemplateRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const { favorites } = useFavorites();
  const favIds = useMemo(
    () => favoriteIdSet(favorites, "workoutTemplate"),
    [favorites],
  );

  // Pull the entire roster from the server (the trainer surface tops out at a
  // few dozen templates, so paging server-side adds latency without saving
  // reads). Filtering runs client-side as a case-insensitive substring across
  // both names and tags, so a query like "Pull" surfaces "PULL Manu" as well
  // as rows tagged "Pull".
  const { data, isLoading, error } = useWorkoutTemplates();

  // Read the in-progress "new" draft from localStorage so we can surface it as
  // a virtual row at the top of the list. Re-read on the `storage` event so a
  // change in another tab is reflected here without a manual refresh.
  const [newDraft, setNewDraft] = useState<NewTemplateDraft | null>(null);
  useEffect(() => {
    setNewDraft(readNewDraft());
    function onStorage(e: StorageEvent) {
      if (e.key === DRAFT_STORAGE_KEY_NEW) setNewDraft(readNewDraft());
    }
    function onFocus() {
      setNewDraft(readNewDraft());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const draftRow = useMemo<TemplateListRow | null>(() => {
    if (!newDraft) return null;
    const exerciseCount = Array.isArray(newDraft.exercises)
      ? newDraft.exercises.length
      : 0;
    return {
      id: "__draft:new",
      name: {
        en: newDraft.name?.en ?? "",
        es: newDraft.name?.es ?? "",
      },
      description: undefined,
      // Cast: the draft can hold any free-form tag the trainer typed; for list
      // rendering we only need the string. The Badge / filter logic tolerates
      // arbitrary strings already.
      tag: (newDraft.tag ?? newDraft.tags?.[0] ?? "custom") as WorkoutTemplateRow["tag"],
      tags: Array.isArray(newDraft.tags) && newDraft.tags.length > 0
        ? newDraft.tags
        : newDraft.tag
          ? [newDraft.tag]
          : [],
      exerciseCount,
      estimatedDurationMinutes: estimateTemplateDurationMinutesFromRaw(
        newDraft.exercises,
      ),
      trainerId: trainerUid,
      isStandard: false,
      deleted: false,
      version: 0,
      createdAt: null,
      updatedAt: null,
      __isDraft: true,
    };
  }, [newDraft, trainerUid]);

  const rows = useMemo<TemplateListRow[]>(() => {
    let list: TemplateListRow[] = data ?? [];
    if (mineOnly) {
      list = list.filter(
        (row) => row.trainerId === trainerUid && !row.isStandard,
      );
    }
    const needle = tagFilter.trim();
    if (needle) {
      // Normalized, token-based, order-independent match + relevance rank
      // (same matcher as the exercise search). A plain substring `includes`
      // failed multi-word queries because punctuation in the name breaks the
      // span — e.g. "nete etapa" didn't match "Nete - Etapa 3 - Dia 1" since
      // the " - " sits between the two words. fuzzyTokenScore normalizes both
      // sides (hyphens/punctuation → spaces) and matches each query token
      // against any name/tag word, then ranks best-match first.
      const scored = list
        .map((row) => {
          const all = row.tags && row.tags.length > 0
            ? row.tags
            : row.tag
              ? [row.tag]
              : [];
          const haystack = [row.name.en, row.name.es, ...all]
            .filter((value): value is string => typeof value === "string")
            .join(" ");
          return { row, score: fuzzyTokenScore(needle, haystack) };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);
      list = scored.map((entry) => entry.row);
    }
    // #297 — favorites: optionally keep only starred templates, then always
    // float favorites to the top. The in-progress draft row is added AFTER, so
    // it stays pinned at the very top regardless of favorites.
    list = filterFavoritesOnly(list, (r) => r.id, favIds, favoritesOnly);
    list = sortFavoritesFirst(list, (r) => r.id, favIds);
    return draftRow ? [draftRow, ...list] : list;
  }, [data, mineOnly, trainerUid, tagFilter, draftRow, favIds, favoritesOnly]);

  const handlers = useMemo(
    () => ({
      onEdit: (row: WorkoutTemplateRow) =>
        router.push(`/gc-fitness/templates/${row.id}/edit`),
      // Standard/library templates open a read-only VIEW instead of /edit —
      // /edit on a non-owned standard template would auto-fork and silently
      // create duplicates. The trainer forks explicitly from the view page.
      onView: (row: WorkoutTemplateRow) =>
        router.push(`/gc-fitness/templates/${row.id}/view`),
      onDelete: (row: WorkoutTemplateRow) => setConfirmDelete(row),
      onResumeDraft: () => router.push("/gc-fitness/templates/new"),
      // P21 — duplicate trainer-owned template. Triggers a Server Action
      // that creates a fork with " (copia)" suffix on the ES + EN name,
      // then invalidates the templates cache so the new row appears at
      // the top of the list.
      onDuplicate: async (row: WorkoutTemplateRow) => {
        try {
          const result = await duplicateWorkoutTemplate(row.id);
          await queryClient.invalidateQueries({
            queryKey: WORKOUT_TEMPLATES_BASE_KEY,
          });
          toast.success(t("duplicatedToast"));
          // Navigate the trainer straight into the new template's editor
          // — this matches the iOS UX of "duplicate then refine".
          router.push(`/gc-fitness/templates/${result.id}/edit`);
        } catch (err) {
          console.error("[templates] duplicate failed", err);
          const message =
            err instanceof Error ? err.message : t("duplicateFailedToast");
          toast.error(message);
        }
      },
    }),
    [router, queryClient, t],
  );

  const columnsT = useTranslations("templates.columns");

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeletePending(true);
    try {
      await softDeleteWorkoutTemplate(confirmDelete.id);
      // Invalidate the templates cache so the row drops out of view.
      await queryClient.invalidateQueries({
        queryKey: WORKOUT_TEMPLATES_BASE_KEY,
      });
      toast.success(t("deletedToast"));
      setConfirmDelete(null);
    } catch (err) {
      console.error("[templates] delete failed", err);
      const message =
        err instanceof Error ? err.message : t("deleteFailedToast");
      toast.error(message);
    } finally {
      setDeletePending(false);
    }
  }, [confirmDelete, queryClient, t]);

  const hasFilter = tagFilter.trim().length > 0 || mineOnly || favoritesOnly;
  const isUnfilteredEmpty = !isLoading && !hasFilter && rows.length === 0;
  const isFilteredEmpty = !isLoading && hasFilter && rows.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {embedded ? (
          <span />
        ) : (
          <div className="flex flex-col gap-1">
            <h1 className="gc-page-title text-2xl tracking-tight">
              {t("pageHeading")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/gc-fitness/templates/generate")}
            className="gap-2 rounded-full"
          >
            <Sparkles className="h-4 w-4" />
            {t("generateCta")}
          </Button>
          <Button
            type="button"
            onClick={() => router.push("/gc-fitness/templates/new")}
            className="gap-2 rounded-full"
          >
            <Plus className="h-4 w-4" />
            {t("newTemplateCta")}
          </Button>
        </div>
      </div>

      {/* Search row — rounded input with leading icon + filter affordance +
          Todos / Creados por mí pill toggle. */}
      <div className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-border bg-card px-3 py-2.5 shadow-sm">
        <SlidersHorizontal
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
        <div className="relative min-w-[180px] flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            placeholder={t("filterPlaceholder")}
            className="h-10 rounded-full pl-9"
          />
        </div>
        <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/70 p-1">
          <button
            type="button"
            onClick={() => setMineOnly(false)}
            data-active={!mineOnly}
            className={cn(
              "min-h-9 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              !mineOnly
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tFilters("allLabel")}
          </button>
          <button
            type="button"
            onClick={() => setMineOnly(true)}
            data-active={mineOnly}
            className={cn(
              "min-h-9 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              mineOnly
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tFilters("mineOnlyLabel")}
          </button>
        </div>
        {/* #297 — favorites-only toggle. */}
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
          aria-label={tFilters("favoritesOnlyAria")}
          className={cn(
            "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            favoritesOnly
              ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300 dark:bg-amber-400/15 dark:text-amber-300"
              : "bg-muted/70 text-muted-foreground hover:text-foreground",
          )}
        >
          <Star
            className={cn(
              "h-4 w-4",
              favoritesOnly ? "fill-amber-400 text-amber-500" : "",
            )}
            aria-hidden="true"
          />
          {tFilters("favoritesOnlyLabel")}
        </button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t("loadError")}</AlertTitle>
          <AlertDescription>{t("loadErrorDescription")}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="h-4 w-40 animate-pulse rounded-full bg-muted" />
                  <div className="h-3 w-28 animate-pulse rounded-full bg-muted" />
                </div>
                <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : rows.length > 0 ? (
        <TooltipProvider>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {rows.map((row) => {
                const allTags =
                  row.tags && row.tags.length > 0
                    ? row.tags
                    : row.tag
                      ? [row.tag]
                      : [];
                const title =
                  row.name.en ||
                  row.name.es ||
                  (row.__isDraft
                    ? columnsT("draftUntitled")
                    : columnsT("untitled"));
                const duration =
                  row.estimatedDurationMinutes > 0
                    ? columnsT("durationValue", {
                        minutes: row.estimatedDurationMinutes,
                      })
                    : null;
                return (
                  <div
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      row.__isDraft
                        ? handlers.onResumeDraft()
                        : row.isStandard
                          ? handlers.onView(row)
                          : handlers.onEdit(row)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        row.__isDraft
                          ? handlers.onResumeDraft()
                          : row.isStandard
                            ? handlers.onView(row)
                            : handlers.onEdit(row);
                      }
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors first:rounded-t-[1.25rem] last:rounded-b-[1.25rem] hover:bg-muted/50 sm:px-5",
                      row.__isDraft &&
                        "bg-amber-500/[0.06] hover:bg-amber-500/[0.1] dark:bg-amber-400/[0.06] dark:hover:bg-amber-400/[0.1]",
                    )}
                  >
                    {row.__isDraft ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            aria-label={columnsT("draftBadgeTooltip")}
                            className="inline-flex shrink-0"
                          >
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {columnsT("draftBadgeTooltip")}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}

                    {!row.__isDraft ? (
                      <FavoriteStarButton
                        kind="workoutTemplate"
                        id={row.id}
                      />
                    ) : null}

                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="truncate text-base font-semibold text-foreground">
                          {title}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {row.isStandard ? (
                            <Badge variant="outline" className="capitalize">
                              Standard
                            </Badge>
                          ) : null}
                          {allTags.map((raw) => (
                            <Badge
                              key={raw}
                              variant={tagBadgeVariant(raw)}
                              className="capitalize"
                            >
                              {TAG_LABELS[raw] ?? raw}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Dumbbell className="h-3.5 w-3.5 shrink-0" />
                        {columnsT("exerciseCount", {
                          count: row.exerciseCount,
                        })}
                        {duration ? <span>· {duration}</span> : null}
                      </p>
                    </div>

                    {!row.__isDraft ? (
                      <div
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={columnsT("actionsAria")}
                              className="h-11 w-11 shrink-0"
                            >
                              <SlidersHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {row.isStandard ? (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handlers.onView(row)}
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  {columnsT("view")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handlers.onDuplicate(row)}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  {columnsT("duplicate")}
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handlers.onEdit(row)}
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  {columnsT("edit")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handlers.onDuplicate(row)}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  {columnsT("duplicate")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handlers.onDelete(row)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {columnsT("delete")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TooltipProvider>
      ) : isUnfilteredEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="font-medium">{t("emptyHeadline")}</p>
            <p className="text-sm text-muted-foreground">{t("emptySubtitle")}</p>
            <Button
              type="button"
              onClick={() => router.push("/gc-fitness/templates/new")}
              className="mt-2 gap-2 rounded-full"
            >
              <Plus className="h-4 w-4" />
              {t("newTemplateCta")}
            </Button>
          </CardContent>
        </Card>
      ) : isFilteredEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="font-medium">{t("filteredEmptyHeadline")}</p>
            <p className="text-sm text-muted-foreground">
              {t("filteredEmptySubtitle")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDialogBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>
              {t("deleteDialogCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deletePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePending ? t("deleting") : t("deleteDialogConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
