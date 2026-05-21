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

  const columns = useMemo(() => makeColumns(handlers), [handlers]);

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
      toast.success("Exercise deleted.");
      setConfirmDelete(null);
    } catch (err) {
      console.error("[exercises] delete failed", err);
      toast.error("Couldn't delete. Please try again.");
    } finally {
      setDeletePending(false);
    }
  }, [confirmDelete]);

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        {/* Heading row — title + primary CTA */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Exercise Library
            </h1>
            <p className="text-sm text-muted-foreground">
              Browse the wger-seeded library and manage your custom exercises.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => router.push("/gc-fitness/exercises/new")}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New exercise
          </Button>
        </div>

        <ExerciseFilters onChange={setFilters} />

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load exercises.</AlertTitle>
            <AlertDescription>
              Check your connection and try again.
            </AlertDescription>
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
                    Loading…
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
                      <p className="font-medium">No exercises yet.</p>
                      <p className="text-sm text-muted-foreground">
                        Add a custom exercise to get started, or run the wger
                        seed script to load the open-source library.
                      </p>
                      <Button
                        type="button"
                        onClick={() => router.push("/gc-fitness/exercises/new")}
                        className="gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        New exercise
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
                      <p className="font-medium">No matches.</p>
                      <p className="text-sm text-muted-foreground">
                        Try removing a filter or clearing your search.
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
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {Math.max(1, table.getPageCount())}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
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
              <AlertDialogTitle>Delete this exercise?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the exercise from your library.
                Workouts that reference it will keep the snapshot. This
                can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletePending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={deletePending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletePending ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Toaster richColors closeButton />
      </div>
    </TooltipProvider>
  );
}
