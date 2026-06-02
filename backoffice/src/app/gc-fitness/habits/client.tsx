"use client";

// habits/client.tsx
//
// Client orchestrator for `/gc-fitness/habits`. Two views via a segmented
// toggle:
//
//   - "Asignaciones" — the per-client habit assignments table (default).
//   - "Biblioteca"   — the reusable habit templates (global + own), WITHOUT
//                      any per-client assignment.
//
// A "Crear hábito" button opens the SAME create flow used on the calendar
// (NewHabitDialog), in roster mode so the trainer picks the client + start
// date inside the form.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
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

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

import { NewHabitDialog } from "@/components/gc-fitness/schedule/new-habit-dialog";
import { BulkAssignHabitDialog } from "@/components/gc-fitness/schedule/bulk-assign-habit-dialog";
import {
  deleteHabitRecurrenceFromDate,
  listHabitsForTrainer,
  listHabitTemplates,
  softDeleteHabit,
  type HabitRow,
  type HabitTemplateRow,
} from "@/lib/gc-fitness/habit-actions";
import { makeHabitColumns } from "./columns";
import { HabitLibraryTable } from "./_components/HabitLibraryTable";
import { HabitTemplateDetailDialog } from "./_components/HabitTemplateDetailDialog";

export const HABITS_BASE_KEY = ["gc-fitness", "habits"] as const;

export interface ClientNameEntry {
  uid: string;
  displayName: string;
  email: string;
  pendingProvisioning: boolean;
}

export interface HabitsLibraryClientProps {
  /**
   * Trainer's client roster from `listClients()` (P04-05). Resolves
   * clientId → displayName, populates the client filter, and feeds the
   * create dialog's client picker.
   */
  clientRoster: ClientNameEntry[];
}

type HabitsView = "assignments" | "library";

export function HabitsLibraryClient({
  clientRoster,
}: HabitsLibraryClientProps) {
  const router = useRouter();
  const t = useTranslations("habits.list");
  const queryClient = useQueryClient();
  const [view, setView] = useState<HabitsView>("assignments");
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ]);
  const [confirmDelete, setConfirmDelete] = useState<HabitRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<HabitTemplateRow | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: HABITS_BASE_KEY,
    queryFn: () => listHabitsForTrainer(),
  });
  // Templates power the "Biblioteca" view. Fetched lazily the first time the
  // library tab is opened; cached thereafter.
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: [...HABITS_BASE_KEY, "templates"],
    queryFn: () => listHabitTemplates(),
    enabled: view === "library",
  });

  const clientNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientRoster) m.set(c.uid, c.displayName);
    return m;
  }, [clientRoster]);
  const activeClientRoster = useMemo(
    () => clientRoster.filter((c) => !c.pendingProvisioning),
    [clientRoster],
  );

  const rows = useMemo(() => {
    const all = (data ?? []) as HabitRow[];
    const needle = search.trim().toLowerCase();
    return all.filter((r) => {
      if (clientFilter !== "all" && r.clientId !== clientFilter) return false;
      if (needle.length > 0) {
        const hay =
          `${r.name.en} ${r.name.es} ${clientNameMap.get(r.clientId) ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, clientFilter, search, clientNameMap]);

  const filteredTemplates = useMemo(() => {
    const all = templates as HabitTemplateRow[];
    const needle = search.trim().toLowerCase();
    return all.filter((tpl) => {
      if (needle.length > 0) {
        const hay = `${tpl.name.en} ${tpl.name.es}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [templates, search]);

  const handlers = useMemo(
    () => ({
      onEdit: (row: HabitRow) =>
        router.push(`/gc-fitness/habits/${row.id}/edit`),
      onView: (row: HabitRow) => router.push(`/gc-fitness/habits/${row.id}`),
      onDelete: (row: HabitRow) => setConfirmDelete(row),
    }),
    [router],
  );

  const columnsT = useTranslations("habits.columns");
  const columns = useMemo(
    () => makeHabitColumns(handlers, clientNameMap, columnsT),
    [handlers, clientNameMap, columnsT],
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

  // Soft-delete the whole habit (hides it + its history from the client).
  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeletePending(true);
    try {
      await softDeleteHabit(confirmDelete.id);
      await queryClient.invalidateQueries({ queryKey: HABITS_BASE_KEY });
      toast.success(t("deletedToast"));
      setConfirmDelete(null);
    } catch (err) {
      console.error("[habits] delete failed", err);
      const message =
        err instanceof Error ? err.message : t("deleteFailedToast");
      toast.error(message);
    } finally {
      setDeletePending(false);
    }
  }, [confirmDelete, queryClient, t]);

  // Recurring-only: end the recurrence from today onward (caps endsOn to
  // yesterday), keeping past days + their logs intact. Mirrors the calendar
  // habit-detail dialog's "delete from this day forward" action, anchored at
  // today since the list has no per-day context.
  const handleEndFromToday = useCallback(async () => {
    if (!confirmDelete) return;
    setDeletePending(true);
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      await deleteHabitRecurrenceFromDate(confirmDelete.id, today);
      await queryClient.invalidateQueries({ queryKey: HABITS_BASE_KEY });
      toast.success(t("endedFromTodayToast"));
      setConfirmDelete(null);
    } catch (err) {
      console.error("[habits] end-from-today failed", err);
      const message =
        err instanceof Error ? err.message : t("deleteFailedToast");
      toast.error(message);
    } finally {
      setDeletePending(false);
    }
  }, [confirmDelete, queryClient, t]);

  // Create flow shared with the calendar invalidates both the assignments
  // feed AND the templates cache (prefix match on HABITS_BASE_KEY).
  const handleHabitCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: HABITS_BASE_KEY });
    toast.success(t("habitCreatedToast"));
  }, [queryClient, t]);

  // Bulk assign (one habit → many clients) invalidates the assignments feed.
  // The dialog owns its own "{n} assigned" toast (count-aware), so we only
  // refresh caches here.
  const handleBulkAssigned = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: HABITS_BASE_KEY });
  }, [queryClient]);

  const totalFromServer = (data ?? []).length;
  const isUnfilteredEmpty = !isLoading && totalFromServer === 0;
  const isFilteredEmpty =
    !isLoading && totalFromServer > 0 && rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {t("pageHeading")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setBulkAssignOpen(true)}
            className="gap-2"
          >
            <Users className="h-4 w-4" />
            {t("bulkAssignCta")}
          </Button>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {t("createHabitCta")}
          </Button>
        </div>
      </div>

      {/* View toggle: per-client assignments vs reusable template library. */}
      <div className="inline-flex w-fit rounded-lg border p-0.5 text-sm">
        {(
          [
            ["assignments", t("tabAssignments")],
            ["library", t("tabLibrary")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value as HabitsView)}
            className={cn(
              "rounded-md px-4 py-1.5 font-medium transition",
              view === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters (search + type apply to both views; client filter only makes
          sense for assignments). */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {view === "assignments" ? (
          <Select value={clientFilter} onValueChange={(v) => setClientFilter(v)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t("filterByClientPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allClients")}</SelectItem>
              {activeClientRoster.map((c) => (
                <SelectItem key={c.uid} value={c.uid}>
                  {c.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t("loadError")}</AlertTitle>
          <AlertDescription>{t("loadErrorDescription")}</AlertDescription>
        </Alert>
      )}

      {view === "library" ? (
        <HabitLibraryTable
          templates={filteredTemplates}
          isLoading={templatesLoading}
          t={columnsT}
          emptyText={t("libraryEmpty")}
          loadingText={t("loading")}
          onRowClick={setSelectedTemplate}
        />
      ) : (
        <>
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
                    <TableRow
                      key={row.id}
                      onClick={() => handlers.onView(row.original)}
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
                        <p className="font-medium">
                          {t("filteredEmptyHeadline")}
                        </p>
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
        </>
      )}

      <NewHabitDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        clients={activeClientRoster.map((c) => ({
          uid: c.uid,
          displayName: c.displayName,
        }))}
        onCreated={handleHabitCreated}
      />

      <BulkAssignHabitDialog
        open={bulkAssignOpen}
        onOpenChange={setBulkAssignOpen}
        clients={activeClientRoster.map((c) => ({
          uid: c.uid,
          displayName: c.displayName,
        }))}
        onAssigned={handleBulkAssigned}
      />

      <HabitTemplateDetailDialog
        open={selectedTemplate !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedTemplate(null);
        }}
        template={selectedTemplate}
        onChanged={() =>
          queryClient.invalidateQueries({ queryKey: HABITS_BASE_KEY })
        }
      />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          {confirmDelete?.scheduleType === "recurring" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteRecurringTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteRecurringBody")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="sm:flex-col sm:items-stretch sm:space-x-0 sm:gap-2">
                {/* End from today: keeps past history + logs. */}
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleEndFromToday();
                  }}
                  disabled={deletePending}
                >
                  {deletePending ? t("deleting") : t("deleteFromTodayCta")}
                </AlertDialogAction>
                {/* Delete the entire habit + history. */}
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleConfirmDelete();
                  }}
                  disabled={deletePending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deletePending ? t("deleting") : t("deleteEntireCta")}
                </AlertDialogAction>
                <AlertDialogCancel disabled={deletePending}>
                  {t("deleteDialogCancel")}
                </AlertDialogCancel>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("deleteDialogBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletePending}>
                  {t("deleteDialogCancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleConfirmDelete();
                  }}
                  disabled={deletePending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deletePending ? t("deleting") : t("deleteDialogConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
