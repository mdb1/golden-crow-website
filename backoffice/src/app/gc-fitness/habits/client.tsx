"use client";

// habits/client.tsx
//
// Client orchestrator for `/gc-fitness/habits`. Composes:
//
//   - `useHabitsForTrainerQuery` — Server-Action-backed React-Query feed
//   - Type filter (shadcn `Select`) — client-side memoized filter
//   - Client filter (shadcn `Select`) — client-side memoized filter
//   - Search input — case-insensitive substring on name.en/name.es
//   - TanStack Table with sorting + pagination
//   - "+ New habit" CTA → /gc-fitness/habits/new
//   - Delete action → confirm dialog → softDeleteHabit + cache invalidate
//
// Filtering is client-side (memoized) because Cordero's habit count is
// bounded — listHabitsForTrainer returns ≤ 200 rows and Pitfall 4 (composite
// index #2) already gives us trainerId+deleted+updatedAt DESC. v2 may
// move filters server-side if a single trainer exceeds the limit.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Toaster } from "@/components/ui/sonner";

import {
  listHabitsForTrainer,
  softDeleteHabit,
  type HabitRow,
} from "@/lib/gc-fitness/habit-actions";
import { HABIT_TYPES, type HabitType } from "@/lib/gc-fitness/habit-schema";
import { makeHabitColumns } from "./columns";

export const HABITS_BASE_KEY = ["gc-fitness", "habits"] as const;

export interface ClientNameEntry {
  uid: string;
  displayName: string;
}

export interface HabitsLibraryClientProps {
  /**
   * Trainer's client roster from `listClients()` (P04-05). Used to:
   *   - Resolve clientId → displayName for the columns
   *   - Populate the client filter dropdown
   */
  clientRoster: ClientNameEntry[];
}

const TYPE_LABELS: Record<HabitType, string> = {
  binary: "Yes / No",
  "multi-choice": "Multiple choice",
  numeric: "Numeric",
  weight: "Weight",
};

export function HabitsLibraryClient({
  clientRoster,
}: HabitsLibraryClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<HabitType | "all">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ]);
  const [confirmDelete, setConfirmDelete] = useState<HabitRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: HABITS_BASE_KEY,
    queryFn: () => listHabitsForTrainer(),
  });

  const clientNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientRoster) m.set(c.uid, c.displayName);
    return m;
  }, [clientRoster]);

  const rows = useMemo(() => {
    const all = (data ?? []) as HabitRow[];
    const needle = search.trim().toLowerCase();
    return all.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (clientFilter !== "all" && r.clientId !== clientFilter) return false;
      if (needle.length > 0) {
        const hay =
          `${r.name.en} ${r.name.es} ${clientNameMap.get(r.clientId) ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, typeFilter, clientFilter, search, clientNameMap]);

  const handlers = useMemo(
    () => ({
      onEdit: (row: HabitRow) =>
        router.push(`/gc-fitness/habits/${row.id}/edit`),
      onView: (row: HabitRow) =>
        router.push(`/gc-fitness/habits/${row.id}`),
      onDelete: (row: HabitRow) => setConfirmDelete(row),
    }),
    [router],
  );

  const columns = useMemo(
    () => makeHabitColumns(handlers, clientNameMap),
    [handlers, clientNameMap],
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
      await softDeleteHabit(confirmDelete.id);
      await queryClient.invalidateQueries({
        queryKey: HABITS_BASE_KEY,
      });
      toast.success("Habit deleted.");
      setConfirmDelete(null);
    } catch (err) {
      console.error("[habits] delete failed", err);
      const message =
        err instanceof Error ? err.message : "Couldn't delete.";
      toast.error(message);
    } finally {
      setDeletePending(false);
    }
  }, [confirmDelete, queryClient]);

  const totalFromServer = (data ?? []).length;
  const isUnfilteredEmpty = !isLoading && totalFromServer === 0;
  const isFilteredEmpty =
    !isLoading && totalFromServer > 0 && rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Habits
          </h1>
          <p className="text-sm text-muted-foreground">
            Author and assign daily habits. Each habit belongs to one client.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => router.push("/gc-fitness/habits/new")}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New habit
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as HabitType | "all")}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {HABIT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={clientFilter}
          onValueChange={(v) => setClientFilter(v)}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clientRoster.map((c) => (
              <SelectItem key={c.uid} value={c.uid}>
                {c.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load habits.</AlertTitle>
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
                    <p className="font-medium">No habits yet.</p>
                    <p className="text-sm text-muted-foreground">
                      Assign a habit to a client to get started.
                    </p>
                    <Button
                      type="button"
                      onClick={() => router.push("/gc-fitness/habits/new")}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      New habit
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
                      Try a different filter or clear your search.
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
            <AlertDialogTitle>Delete this habit?</AlertDialogTitle>
            <AlertDialogDescription>
              The habit will be hidden from the client&apos;s iOS app. Logs
              are preserved in case you want to restore the habit. This is a
              soft-delete and can be reversed later.
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
