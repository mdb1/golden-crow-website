"use client";

// client.tsx
//
// The client-side orchestrator for `/gc-fitness/exercises`. Composes:
//
//   - `useExercisesQuery()` — Firestore listener-backed React-Query feed
//   - `<ExerciseFilters>` — search + 3 combobox filters + localStorage persist
//   - `<DataTable>` — TanStack Table (reuses the shared shadcn primitive)
//   - "+ New exercise" CTA → `/gc-fitness/exercises/new`
//
// Filtering happens client-side via memoized derivations from the cached
// row list. The list is bounded (~150 wger + custom — Pitfall 5 was the
// rationale for the muscle-group cap, not the dataset size) so a client
// memoized .filter() is fast enough for v1.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  useExercisesQuery,
  type ExerciseRow,
} from "@/lib/gc-fitness/exercises-listener";
import { softDeleteExercise } from "@/lib/gc-fitness/exercise-server-actions";
import {
  ExerciseFilters,
  type ExerciseFiltersState,
} from "./_components/ExerciseFilters";
import { makeColumns } from "./columns";

const EMPTY_FILTERS: ExerciseFiltersState = {
  search: "",
  muscleGroups: [],
  equipment: [],
  source: [],
};

function matchesFilters(row: ExerciseRow, f: ExerciseFiltersState): boolean {
  // Search — case-insensitive substring match on EN and ES name + EN
  // description. Trainers expect to search by either language; lower-casing
  // both sides handles ES accents reasonably (full normalization deferred
  // until i18n in P12).
  if (f.search.trim().length > 0) {
    const needle = f.search.trim().toLowerCase();
    const hay = `${row.name.en} ${row.name.es} ${row.description.en}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }

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

  // Source filter — `["wger"]` shows only wger; `["Custom"]` shows only
  // trainer. Empty = show all.
  if (f.source.length > 0) {
    const want = new Set(f.source);
    const tag = row.source === "wger" ? "wger" : "Custom";
    if (!want.has(tag)) return false;
  }

  return true;
}

export function ExerciseLibraryClient() {
  const router = useRouter();
  const t = useTranslations("exercises.list");
  const { data, isLoading, error, hasSnapshot } = useExercisesQuery();
  const [filters, setFilters] = useState<ExerciseFiltersState>(EMPTY_FILTERS);
  const [confirmDelete, setConfirmDelete] = useState<ExerciseRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const rows = useMemo(() => {
    const all = (data ?? []).filter((r) => r.deleted !== true);
    return all.filter((r) => matchesFilters(r, filters));
  }, [data, filters]);

  const handlers = useMemo(
    () => ({
      onEdit: (row: ExerciseRow) =>
        router.push(`/gc-fitness/exercises/${row.id}/edit`),
      onView: (row: ExerciseRow) =>
        router.push(`/gc-fitness/exercises/${row.id}/view`),
      onDelete: (row: ExerciseRow) => setConfirmDelete(row),
    }),
    [router],
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
      toast.success(t("deletedToast"));
      setConfirmDelete(null);
    } catch (err) {
      console.error("[exercises] delete failed", err);
      toast.error(t("deleteFailedToast"));
    } finally {
      setDeletePending(false);
    }
  }, [confirmDelete, t]);

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        {/* Heading row — title + primary CTA */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {t("pageHeading")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
          </div>
          <Button
            type="button"
            onClick={() => router.push("/gc-fitness/exercises/new")}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {t("newExerciseCta")}
          </Button>
        </div>

        <ExerciseFilters onChange={setFilters} />

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t("loadError")}</AlertTitle>
            <AlertDescription>{t("loadErrorDescription")}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border bg-card">
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
                  <TableRow key={row.id}>
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
                      <Button
                        type="button"
                        onClick={() => router.push("/gc-fitness/exercises/new")}
                        className="gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        {t("newExerciseCta")}
                      </Button>
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

        <Toaster richColors closeButton />
      </div>
    </TooltipProvider>
  );
}
