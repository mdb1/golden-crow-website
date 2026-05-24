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
import { useTranslations } from "next-intl";
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
import { Input } from "@/components/ui/input";
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
import {
  softDeleteWorkoutTemplate,
  duplicateWorkoutTemplate,
} from "@/lib/gc-fitness/workout-template-actions";
import type { WorkoutTemplateRow } from "@/lib/gc-fitness/workout-template-actions";
import { makeTemplateColumns } from "@/components/gc-fitness/templates/columns";

export function TemplatesLibraryClient() {
  const router = useRouter();
  const t = useTranslations("templates.list");
  const queryClient = useQueryClient();
  const [tagFilter, setTagFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ]);
  const [confirmDelete, setConfirmDelete] =
    useState<WorkoutTemplateRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const { data, isLoading, error } = useWorkoutTemplates({
    tag: tagFilter.trim() ? tagFilter.trim() : undefined,
  });

  const rows = useMemo(() => data ?? [], [data]);

  const handlers = useMemo(
    () => ({
      onEdit: (row: WorkoutTemplateRow) =>
        router.push(`/gc-fitness/templates/${row.id}/edit`),
      onDelete: (row: WorkoutTemplateRow) => setConfirmDelete(row),
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
  const columns = useMemo(
    () => makeTemplateColumns(handlers, columnsT),
    [handlers, columnsT],
  );

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

  const isUnfilteredEmpty = !isLoading && !tagFilter.trim() && rows.length === 0;
  const isFilteredEmpty = !isLoading && tagFilter.trim() && rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {t("pageHeading")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Button
          type="button"
          onClick={() => router.push("/gc-fitness/templates/new")}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {t("newTemplateCta")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
          placeholder={t("filterPlaceholder")}
          className="w-56"
        />
      </div>

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
            {isLoading ? (
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
                      onClick={() => router.push("/gc-fitness/templates/new")}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      {t("newTemplateCta")}
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
  );
}
