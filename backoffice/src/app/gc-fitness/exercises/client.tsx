"use client";

// client.tsx
//
// The client-side orchestrator for `/gc-fitness/exercises`. Composes:
//
//   - `useExercisesQuery()` — Firestore listener-backed React-Query feed
//   - `<ExerciseFilters>` — search + 3 combobox filters + localStorage persist
//   - `<DataTable>` — TanStack Table (reuses the shared shadcn primitive)
//   - "+ Nuevo" CTA → opens <NewExerciseDialog> (modal create form, B4).
//     The `/gc-fitness/exercises/new` route stays live as a deep-link fallback.
//
// Filtering happens client-side via memoized derivations from the cached
// row list. The list is bounded (~150 wger + custom — Pitfall 5 was the
// rationale for the muscle-group cap, not the dataset size) so a client
// memoized .filter() is fast enough for v1.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { toast } from "sonner";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { useQueryClient } from "@tanstack/react-query";
import {
  useExercisesQuery,
  EXERCISES_QUERY_KEY,
  type ExerciseRow,
} from "@/lib/gc-fitness/exercises-listener";
import { searchExercises } from "@/lib/gc-fitness/exercise-search";
import { isPickableExercise } from "@/lib/gc-fitness/exercise-visibility";
import { useFavorites } from "@/lib/gc-fitness/use-favorites";
import {
  favoriteIdSet,
  filterFavoritesOnly,
  sortFavoritesFirst,
} from "@/lib/gc-fitness/favorites";
import {
  softDeleteExercise,
  duplicateExercise,
} from "@/lib/gc-fitness/exercise-server-actions";
import {
  ExerciseFilters,
  type ExerciseFiltersState,
} from "./_components/ExerciseFilters";
import { NewExerciseDialog } from "./_components/NewExerciseDialog";
import { makeColumns } from "./columns";

const EMPTY_FILTERS: ExerciseFiltersState = {
  search: "",
  muscleGroups: [],
  equipment: [],
  source: [],
  mineOnly: false,
  favoritesOnly: false,
};

interface ExerciseLibraryClientProps {
  trainerUid: string;
  /** Suppress own heading when rendered inside the Biblioteca shell. */
  embedded?: boolean;
}

function matchesFilters(
  row: ExerciseRow,
  f: ExerciseFiltersState,
  trainerUid: string,
): boolean {
  // Search is handled SEPARATELY by searchExercises in the rows memo (issue
  // #291) — normalized (hyphen/diacritic/plural) AND name-aware ranked. This
  // predicate only handles the chip/select filters below.

  // Muscle filter — array-contains-any semantics (row matches if it contains
  // ANY of the selected groups). Mirrors Firestore `array-contains-any`,
  // which is what the future server-side index in 03-03 row 2 supports.
  if (f.muscleGroups.length > 0) {
    if (!row.muscleGroups.some((m) => f.muscleGroups.includes(m))) {
      return false;
    }
  }

  // Equipment filter — same array-contains-any semantics.
  if (f.equipment.length > 0) {
    if (!row.equipment.some((e) => f.equipment.includes(e))) return false;
  }

  // Source filter — `["Standard"]` shows the shared standard library;
  // `["Custom"]` shows only trainer-authored exercises. Empty = show all.
  if (f.source.length > 0) {
    const want = new Set(f.source);
    const tag = row.source === "wger" || row.tags?.includes("standard-library")
      ? "Standard"
      : "Custom";
    if (!want.has(tag)) return false;
  }

  // "Created by me" — show only trainer-authored exercises whose ownerId
  // matches the calling trainer. Library (wger / free-exercise-db) rows
  // and exercises owned by other trainers are both filtered out.
  if (f.mineOnly) {
    if (row.source !== "trainer") return false;
    if (row.ownerId !== trainerUid) return false;
  }

  return true;
}

export function ExerciseLibraryClient({
  trainerUid,
  embedded = false,
}: ExerciseLibraryClientProps) {
  const router = useRouter();
  const t = useTranslations("exercises.list");
  const { data, isLoading, error, hasSnapshot } = useExercisesQuery(trainerUid);
  const { favorites } = useFavorites();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ExerciseFiltersState>(EMPTY_FILTERS);
  const [confirmDelete, setConfirmDelete] = useState<ExerciseRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const favIds = useMemo(
    () => favoriteIdSet(favorites, "exercise"),
    [favorites],
  );

  const rows = useMemo(() => {
    const all = (data ?? []).filter(isPickableExercise);
    // Apply the non-search chip/select filters first, THEN rank + search
    // (issue #291): normalized, plural/hyphen-tolerant, best-match-first.
    const filtered = all.filter((r) => matchesFilters(r, filters, trainerUid));
    const searched = searchExercises(filtered, filters.search);
    // #297 — favorites: optionally keep only starred rows, then always float
    // favorites to the top (stable within each group).
    const scoped = filterFavoritesOnly(
      searched,
      (r) => r.id,
      favIds,
      filters.favoritesOnly,
    );
    return sortFavoritesFirst(scoped, (r) => r.id, favIds);
  }, [data, filters, trainerUid, favIds]);

  const handleDuplicate = useCallback(
    async (row: ExerciseRow) => {
      try {
        const { id } = await duplicateExercise(row.id);
        await queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
        toast.success(t("duplicatedToast"));
        // Land the trainer on their new editable copy, mirroring the
        // Duplicate-to-customize flow in the view-form CTA.
        router.push(`/gc-fitness/exercises/${id}/edit`);
      } catch (err) {
        console.error("[exercises] duplicate failed", err);
        toast.error(t("duplicateFailedToast"));
      }
    },
    [router, queryClient, t],
  );

  const handlers = useMemo(
    () => ({
      onEdit: (row: ExerciseRow) =>
        router.push(`/gc-fitness/exercises/${row.id}/edit`),
      onView: (row: ExerciseRow) =>
        router.push(`/gc-fitness/exercises/${row.id}/view`),
      onDuplicate: (row: ExerciseRow) => handleDuplicate(row),
      onDelete: (row: ExerciseRow) => setConfirmDelete(row),
    }),
    [router, handleDuplicate],
  );

  const columnsT = useTranslations("exercises.columns");
  const columns = useMemo(() => makeColumns(handlers, columnsT), [handlers, columnsT]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  const isFilteredEmpty =
    !isLoading &&
    (data?.length ?? 0) > 0 &&
    rows.length === 0;
  const isUnfilteredEmpty =
    !isLoading && (data?.length ?? 0) === 0;

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeletePending(true);
    try {
      await softDeleteExercise(confirmDelete.id);
      // 260529 — one-shot feed: invalidate so the deleted row leaves the
      // table immediately (the live listener used to do this automatically).
      await queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
      toast.success(t("deletedToast"));
      setConfirmDelete(null);
    } catch (err) {
      console.error("[exercises] delete failed", err);
      toast.error(t("deleteFailedToast"));
    } finally {
      setDeletePending(false);
    }
  }, [confirmDelete, t, queryClient]);

  return (
    <TooltipProvider>
      <div className="flex min-w-0 flex-col gap-6">
        {/* Heading row — title + primary CTA */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {embedded ? (
            <span />
          ) : (
            <div className="flex flex-col gap-1">
              <h1 className="gc-page-title text-2xl tracking-tight">
                {t("pageHeading")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("pageSubtitle")}
              </p>
            </div>
          )}
          {/* B4 — "+ Nuevo" opens the create form in a modal over the
              library instead of routing to /gc-fitness/exercises/new (that
              route stays live as a deep-link fallback). */}
          <NewExerciseDialog trainerUid={trainerUid} />
        </div>

        <ExerciseFilters onChange={setFilters} />

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t("loadError")}</AlertTitle>
            <AlertDescription>{t("loadErrorDescription")}</AlertDescription>
          </Alert>
        )}

        <div className="min-w-0 overflow-x-auto rounded-[1.25rem] border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading || !hasSnapshot ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {t("loading")}
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() =>
                      // Owned exercises open the editable form (there's no
                      // separate read-only view for your own); library
                      // exercises open the read-only detail.
                      row.original.source === "trainer"
                        ? handlers.onEdit(row.original)
                        : handlers.onView(row.original)
                    }
                    className="cursor-pointer"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isUnfilteredEmpty ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <p className="font-medium">{t("emptyHeadline")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("emptySubtitle")}
                      </p>
                      <NewExerciseDialog trainerUid={trainerUid} />
                    </div>
                  </TableCell>
                </TableRow>
              ) : isFilteredEmpty ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <p className="font-medium">{t("filteredEmptyHeadline")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("filteredEmptySubtitle")}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {rows.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("pagination", {
                current: table.getState().pagination.pageIndex + 1,
                total: Math.max(1, table.getPageCount()),
              })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                {t("previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                {t("next")}
              </Button>
            </div>
          </div>
        )}

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
    </TooltipProvider>
  );
}
