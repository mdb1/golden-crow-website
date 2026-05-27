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
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import {
  assignHabitTemplate,
  createHabitTemplate,
  listHabitTemplates,
  listHabitsForTrainer,
  softDeleteHabit,
  type HabitTemplateRow,
  type HabitRow,
} from "@/lib/gc-fitness/habit-actions";
import { HABIT_TYPES, type HabitType } from "@/lib/gc-fitness/habit-schema";
import { makeHabitColumns } from "./columns";

export const HABITS_BASE_KEY = ["gc-fitness", "habits"] as const;

export interface ClientNameEntry {
  uid: string;
  displayName: string;
  email: string;
  pendingProvisioning: boolean;
}

export interface HabitsLibraryClientProps {
  /**
   * Trainer's client roster from `listClients()` (P04-05). Used to:
   *   - Resolve clientId → displayName for the columns
   *   - Populate the client filter dropdown
   */
  clientRoster: ClientNameEntry[];
}

// Maps HabitType → message-catalog key (resolved via
// `t(`typeLabels.${HABIT_TYPE_LABEL_KEYS[type]}`)`). Keeps the keys
// grep-able and lookups O(1).
const HABIT_TYPE_LABEL_KEYS: Record<HabitType, string> = {
  binary: "binary",
  "multi-choice": "multiChoice",
  numeric: "numeric",
  weight: "weight",
};

function todayCivilDateUTC(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function HabitsLibraryClient({
  clientRoster,
}: HabitsLibraryClientProps) {
  const router = useRouter();
  const t = useTranslations("habits.list");
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<HabitType | "all">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ]);
  const [confirmDelete, setConfirmDelete] = useState<HabitRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [assignPending, setAssignPending] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateType, setNewTemplateType] = useState<HabitType>("binary");
  const [newTemplateTarget, setNewTemplateTarget] = useState("");
  const [newTemplateUnit, setNewTemplateUnit] = useState("");
  const [createTemplatePending, setCreateTemplatePending] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: HABITS_BASE_KEY,
    queryFn: () => listHabitsForTrainer(),
  });
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: [...HABITS_BASE_KEY, "templates"],
    queryFn: () => listHabitTemplates(),
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
  const pendingClientRoster = useMemo(
    () => clientRoster.filter((c) => c.pendingProvisioning),
    [clientRoster],
  );

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

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeletePending(true);
    try {
      await softDeleteHabit(confirmDelete.id);
      await queryClient.invalidateQueries({
        queryKey: HABITS_BASE_KEY,
      });
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

  const toggleClient = useCallback((clientId: string, checked: boolean) => {
    setSelectedClientIds((current) =>
      checked
        ? Array.from(new Set([...current, clientId]))
        : current.filter((id) => id !== clientId),
    );
  }, []);

  const handleAssignTemplate = useCallback(async () => {
    if (!selectedTemplateId || selectedClientIds.length === 0) return;
    setAssignPending(true);
    try {
      const result = await assignHabitTemplate({
        templateId: selectedTemplateId,
        clientIds: selectedClientIds,
      });
      await queryClient.invalidateQueries({ queryKey: HABITS_BASE_KEY });
      toast.success(
        result.created === 1
          ? t("assignedToastSingular", { count: result.created })
          : t("assignedToastPlural", { count: result.created }),
      );
      setSelectedClientIds([]);
    } catch (err) {
      console.error("[habits] assign template failed", err);
      toast.error(err instanceof Error ? err.message : t("assignmentFailed"));
    } finally {
      setAssignPending(false);
    }
  }, [queryClient, selectedClientIds, selectedTemplateId, t]);

  const handleCreateTemplate = useCallback(async () => {
    const name = newTemplateName.trim();
    if (!name) return;
    setCreateTemplatePending(true);
    try {
      await createHabitTemplate({
        type: newTemplateType,
        name: { en: name, es: name },
        scheduleType: "recurring",
        startsOn: todayCivilDateUTC(),
        scheduleCadence: "daily",
        targetValue:
          newTemplateTarget.trim().length > 0
            ? Number(newTemplateTarget)
            : undefined,
        unit: newTemplateUnit.trim() || undefined,
        reminderEnabled: false,
      });
      await queryClient.invalidateQueries({
        queryKey: [...HABITS_BASE_KEY, "templates"],
      });
      toast.success(t("templateCreatedToast"));
      setNewTemplateName("");
      setNewTemplateTarget("");
      setNewTemplateUnit("");
      setNewTemplateType("binary");
    } catch (err) {
      console.error("[habits] create template failed", err);
      toast.error(err instanceof Error ? err.message : t("templateFailed"));
    } finally {
      setCreateTemplatePending(false);
    }
  }, [
    newTemplateName,
    newTemplateTarget,
    newTemplateType,
    newTemplateUnit,
    queryClient,
    t,
  ]);

  const totalFromServer = (data ?? []).length;
  const isUnfilteredEmpty = !isLoading && totalFromServer === 0;
  const isFilteredEmpty =
    !isLoading && totalFromServer > 0 && rows.length === 0;

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
          onClick={() => router.push("/gc-fitness/habits/new")}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {t("newHabitCta")}
        </Button>
      </div>

      <section className="grid gap-4 rounded-md border bg-card p-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-medium">{t("librarySectionTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("librarySectionSubtitle")}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)]">
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
              disabled={templatesLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("templatePickerPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(templates as HabitTemplateRow[]).map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name.en} ·{" "}
                    {template.scope === "global"
                      ? t("templateScopeGlobal")
                      : t("templateScopeMine")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              disabled={
                assignPending ||
                !selectedTemplateId ||
                selectedClientIds.length === 0
              }
              onClick={handleAssignTemplate}
            >
              {assignPending ? t("assigning") : t("assignCta")}
            </Button>
          </div>
          <div className="grid max-h-40 gap-2 overflow-auto rounded-md border p-3 md:grid-cols-2">
            {activeClientRoster.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noClientsHint")}
              </p>
            ) : (
              activeClientRoster.map((client) => (
                <Label
                  key={client.uid}
                  className="flex items-center gap-2 text-sm font-normal"
                >
                  <Checkbox
                    checked={selectedClientIds.includes(client.uid)}
                    onCheckedChange={(checked) =>
                      toggleClient(client.uid, checked === true)
                    }
                  />
                  {client.displayName}
                </Label>
              ))
            )}
          </div>
          {pendingClientRoster.length > 0 ? (
            <div className="rounded-md border border-dashed p-3">
              <p className="text-sm font-medium">Pendientes de ingreso</p>
              <p className="text-xs text-muted-foreground">
                Los pending se gestionan desde su vista de pre-carga.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {pendingClientRoster.map((client) => (
                  <li key={client.uid}>
                    <Link
                      className="text-sm text-primary hover:underline"
                      href={`/gc-fitness/clients/pending/${encodeURIComponent(client.email)}`}
                    >
                      {client.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <div>
            <h2 className="font-medium">{t("createTemplateTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("createTemplateSubtitle")}
            </p>
          </div>
          <Input
            value={newTemplateName}
            onChange={(event) => setNewTemplateName(event.target.value)}
            placeholder={t("habitNamePlaceholder")}
          />
          <Select
            value={newTemplateType}
            onValueChange={(v) => setNewTemplateType(v as HabitType)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("typePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {HABIT_TYPES.map((ht) => (
                <SelectItem key={ht} value={ht}>
                  {t(`typeLabels.${HABIT_TYPE_LABEL_KEYS[ht]}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {newTemplateType === "numeric" ? (
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={newTemplateTarget}
                onChange={(event) => setNewTemplateTarget(event.target.value)}
                placeholder={t("targetPlaceholder")}
                inputMode="decimal"
              />
              <Input
                value={newTemplateUnit}
                onChange={(event) => setNewTemplateUnit(event.target.value)}
                placeholder={t("unitPlaceholder")}
              />
            </div>
          ) : null}
          <Button
            type="button"
            variant="default"
            disabled={createTemplatePending || newTemplateName.trim() === ""}
            onClick={handleCreateTemplate}
            className="w-fit"
          >
            {createTemplatePending
              ? t("creating")
              : t("createTemplateCta")}
          </Button>
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as HabitType | "all")}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("filterByTypePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allTypes")}</SelectItem>
            {HABIT_TYPES.map((ht) => (
              <SelectItem key={ht} value={ht}>
                {t(`typeLabels.${HABIT_TYPE_LABEL_KEYS[ht]}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={clientFilter}
          onValueChange={(v) => setClientFilter(v)}
        >
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
                      onClick={() => router.push("/gc-fitness/habits/new")}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      {t("newHabitCta")}
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

    </div>
  );
}
