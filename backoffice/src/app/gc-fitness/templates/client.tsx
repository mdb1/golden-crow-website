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

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Toaster } from "@/components/ui/sonner";

import {
  useWorkoutTemplates,
  WORKOUT_TEMPLATES_BASE_KEY,
} from "@/lib/gc-fitness/workout-templates-listener";
import { softDeleteWorkoutTemplate } from "@/lib/gc-fitness/workout-template-actions";
import type { WorkoutTemplateRow } from "@/lib/gc-fitness/workout-template-actions";
import type { WorkoutTag } from "@/lib/gc-fitness/workout-template-schema";
import { makeTemplateColumns } from "@/components/gc-fitness/templates/columns";

const TAG_OPTIONS: Array<{ value: WorkoutTag | "all"; label: string }> = [
  { value: "all", label: "All tags" },
  { value: "push", label: "Push" },
  { value: "pull", label: "Pull" },
  { value: "legs", label: "Legs" },
  { value: "upper", label: "Upper" },
  { value: "lower", label: "Lower" },
  { value: "full-body", label: "Full body" },
  { value: "custom", label: "Custom" },
];

export function TemplatesLibraryClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tagFilter, setTagFilter] = useState<WorkoutTag | "all">("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ]);
  const [confirmDelete, setConfirmDelete] =
    useState<WorkoutTemplateRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const { data, isLoading, error } = useWorkoutTemplates({
    tag: tagFilter === "all" ? undefined : tagFilter,
  });

  const rows = useMemo(() => data ?? [], [data]);

  const handlers = useMemo(
    () => ({
      onEdit: (row: WorkoutTemplateRow) =>
        router.push(`/gc-fitness/templates/${row.id}/edit`),
      onDelete: (row: WorkoutTemplateRow) => setConfirmDelete(row),
    }),
    [router],
  );

  const columns = useMemo(() => makeTemplateColumns(handlers), [handlers]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeletePending(true);
    try {
      await softDeleteWorkoutTemplate(confirmDelete.id);
      // Invalidate the templates cache so the row drops out of view.
      await queryClient.invalidateQueries({
        queryKey: WORKOUT_TEMPLATES_BASE_KEY,
      });
      toast.success("Template deleted.");
      setConfirmDelete(null);
    } catch (err) {
      console.error("[templates] delete failed", err);
      const message =
        err instanceof Error ? err.message : "Couldn't delete.";
      toast.error(message);
    } finally {
      setDeletePending(false);
    }
  }, [confirmDelete, queryClient]);

  const isUnfilteredEmpty =
    !isLoading && tagFilter === "all" && rows.length === 0;
  const isFilteredEmpty =
    !isLoading && tagFilter !== "all" && rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Workout Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Author push / pull / legs templates and assign them from the
            schedule view.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => router.push("/gc-fitness/templates/new")}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New template
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={tagFilter}
          onValueChange={(v) => setTagFilter(v as WorkoutTag | "all")}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by tag" />
          </SelectTrigger>
          <SelectContent>
            {TAG_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load templates.</AlertTitle>
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
            {isLoading ? (
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
                    <p className="font-medium">No templates yet.</p>
                    <p className="text-sm text-muted-foreground">
                      Author your first workout template to start assigning
                      it to clients.
                    </p>
                    <Button
                      type="button"
                      onClick={() => router.push("/gc-fitness/templates/new")}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      New template
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
                      Try a different tag or clear the filter.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

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
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing assignments keep their snapshot — they will not be
              affected. This is a soft-delete and can be reversed later.
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
  );
}
