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
import {
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import { NewHabitDialog } from "@/components/gc-fitness/schedule/new-habit-dialog";
import { BulkAssignHabitDialog } from "@/components/gc-fitness/schedule/bulk-assign-habit-dialog";
import {
  deleteHabitRecurrenceFromDate,
  listHabitsForTrainer,
  listHabitTemplates,
  listHiddenGlobalTemplateIds,
  softDeleteHabit,
  unhideGlobalHabitTemplate,
  type HabitRow,
  type HabitTemplateRow,
} from "@/lib/gc-fitness/habit-actions";
import { HabitLibraryTable } from "./_components/HabitLibraryTable";
import { HabitTemplateDetailDialog } from "./_components/HabitTemplateDetailDialog";
import { RecurrencePill, ReminderCell } from "./_components/habit-pills";

export const HABITS_BASE_KEY = ["gc-fitness", "habits"] as const;

export interface ClientNameEntry {
  uid: string;
  displayName: string;
  email: string;
  /** Client profile photo (`users/{uid}.photoURL`) — Google photo or Storage
   *  upload, or null. Rendered as a cached avatar in the client filter. */
  photoURL: string | null;
  pendingProvisioning: boolean;
}

export interface HabitsLibraryClientProps {
  /**
   * Trainer's client roster from `listClients()` (P04-05). Resolves
   * clientId → displayName, populates the client filter, and feeds the
   * create dialog's client picker.
   */
  clientRoster: ClientNameEntry[];
  trainerUid: string;
  /** Suppress own heading when rendered inside the Biblioteca shell. */
  embedded?: boolean;
}

type HabitsView = "assignments" | "library";

export function HabitsLibraryClient({
  clientRoster,
  trainerUid,
  embedded = false,
}: HabitsLibraryClientProps) {
  const router = useRouter();
  const t = useTranslations("habits.list");
  const columnsT = useTranslations("habits.columns");
  const tTypeLabels = useTranslations("habits.list.typeLabels");
  const queryClient = useQueryClient();
  const [view, setView] = useState<HabitsView>("assignments");
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<HabitRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<HabitTemplateRow | null>(null);
  // B5 — reveal toggle for the per-trainer hidden GLOBAL templates.
  const [showHidden, setShowHidden] = useState(false);
  const [restorePendingId, setRestorePendingId] = useState<string | null>(null);

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
  // B5 — ids of GLOBAL templates this trainer has hidden. Drives the
  // "Mostrar ocultos (N)" toggle + the restore list. One read, library-only.
  const { data: hiddenIds = [] } = useQuery({
    queryKey: [...HABITS_BASE_KEY, "templates", "hidden"],
    queryFn: () => listHiddenGlobalTemplateIds(),
    enabled: view === "library",
  });

  const clientNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientRoster) m.set(c.uid, c.displayName);
    return m;
  }, [clientRoster]);
  const clientById = useMemo(() => {
    const m = new Map<string, ClientNameEntry>();
    for (const c of clientRoster) m.set(c.uid, c);
    return m;
  }, [clientRoster]);
  const activeClientRoster = useMemo(
    () => clientRoster.filter((c) => !c.pendingProvisioning),
    [clientRoster],
  );
  const selectedClient =
    clientFilter === "all"
      ? null
      : (activeClientRoster.find((c) => c.uid === clientFilter) ?? null);

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

  // B3 — group the filtered assignments by habit title so the coach can scan
  // "who has habit X". Title is the display name (EN ?? ES). Groups are sorted
  // alphabetically; assignments within a group keep the server order (updatedAt
  // DESC). The grouping is purely presentational — every row is still an
  // individual assignment with its own recurrence / reminder / actions.
  const assignmentGroups = useMemo(() => {
    const untitledLabel = columnsT("untitled");
    const map = new Map<
      string,
      { title: string; rows: HabitRow[] }
    >();
    for (const row of rows) {
      const title = row.name.en || row.name.es || untitledLabel;
      const key = title.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.rows.push(row);
      } else {
        map.set(key, { title, rows: [row] });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
  }, [rows, columnsT]);

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

  // B5 — friendly labels for the hidden GLOBAL ids. `listHabitTemplates`
  // excludes hidden globals from `templates`, so their names aren't in that
  // list; map the known seed ids to a Spanish-first label, with a humanized
  // fallback for any future global id.
  const hiddenGlobals = useMemo(() => {
    const labels: Record<string, string> = {
      "global-water": "Beber agua",
      "global-mobility": "Movilidad",
      "global-walk": "Caminata de 30 minutos",
      "global-food-log": "Registro de comidas",
    };
    return (hiddenIds as string[]).map((id) => ({
      id,
      name:
        labels[id] ??
        (id.replace(/^global-/, "").replace(/-/g, " ") || id),
    }));
  }, [hiddenIds]);

  const handlers = useMemo(
    () => ({
      onEdit: (row: HabitRow) =>
        router.push(`/gc-fitness/habits/${row.id}/edit`),
      onView: (row: HabitRow) => router.push(`/gc-fitness/habits/${row.id}`),
      onDelete: (row: HabitRow) => setConfirmDelete(row),
    }),
    [router],
  );

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

  // B5 — restore (unhide) a hidden GLOBAL template back into the library.
  const handleRestoreGlobal = useCallback(
    async (templateId: string) => {
      setRestorePendingId(templateId);
      try {
        await unhideGlobalHabitTemplate(templateId);
        // Both the visible-templates list AND the hidden-ids list change.
        await queryClient.invalidateQueries({
          queryKey: [...HABITS_BASE_KEY, "templates"],
        });
        toast.success(t("restoredGlobalToast"));
      } catch (err) {
        console.error("[habits] restore global template failed", err);
        toast.error(
          err instanceof Error ? err.message : t("restoreGlobalFailedToast"),
        );
      } finally {
        setRestorePendingId(null);
      }
    },
    [queryClient, t],
  );

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
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setBulkAssignOpen(true)}
            className="gap-2 rounded-full"
          >
            <Users className="h-4 w-4" />
            {t("bulkAssignCta")}
          </Button>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="gap-2 rounded-full"
          >
            <Plus className="h-4 w-4" />
            {t("createHabitCta")}
          </Button>
        </div>
      </div>

      {/* View toggle: per-client assignments vs reusable template library. */}
      <div className="inline-flex w-fit items-center gap-1 rounded-full bg-muted/70 p-1 text-sm">
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
              "min-h-9 rounded-full px-4 py-1.5 font-medium transition-colors",
              view === value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters (search applies to both views; client filter only makes sense
          for assignments). Rounded search-row card matching the redesign. */}
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
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-full pl-9"
          />
        </div>
        {view === "assignments" ? (
          <Select value={clientFilter} onValueChange={(v) => setClientFilter(v)}>
            <SelectTrigger className="h-10 w-full rounded-full sm:w-56">
              <SelectValue placeholder={t("filterByClientPlaceholder")}>
                {selectedClient ? (
                  <span className="flex items-center gap-2">
                    <ClientAvatar
                      name={selectedClient.displayName}
                      photoURL={selectedClient.photoURL}
                      size="sm"
                    />
                    <span className="truncate">
                      {selectedClient.displayName}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {t("allClients")}
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {t("allClients")}
                </span>
              </SelectItem>
              {activeClientRoster.map((c) => (
                <SelectItem key={c.uid} value={c.uid}>
                  <span className="flex items-center gap-2">
                    <ClientAvatar
                      name={c.displayName}
                      photoURL={c.photoURL}
                      size="sm"
                    />
                    <span className="truncate">{c.displayName}</span>
                  </span>
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
        <div className="flex flex-col gap-4">
          <HabitLibraryTable
            templates={filteredTemplates}
            isLoading={templatesLoading}
            t={columnsT}
            emptyText={t("libraryEmpty")}
            loadingText={t("loading")}
            onRowClick={setSelectedTemplate}
          />

          {/* B5 — reversible path: reveal + restore hidden GLOBAL templates so
              hiding is never a trap. Only shown when there's something hidden. */}
          {hiddenGlobals.length > 0 ? (
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowHidden((v) => !v)}
                className="w-fit gap-2 text-muted-foreground"
              >
                {showHidden ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
                {showHidden
                  ? t("hideHiddenToggle")
                  : t("showHiddenToggle", { count: hiddenGlobals.length })}
              </Button>

              {showHidden ? (
                <Card className="overflow-hidden">
                  <CardContent className="flex flex-col gap-0 p-0">
                    <div className="border-b border-border bg-muted/40 px-4 py-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {t("hiddenSectionTitle")}
                      </h3>
                    </div>
                    <ul className="divide-y divide-border">
                      {hiddenGlobals.map((g) => (
                        <li
                          key={g.id}
                          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Badge variant="violet" className="shrink-0">
                              {t("templateScopeGlobal")}
                            </Badge>
                            <span className="min-w-0 truncate font-medium text-foreground">
                              {g.name}
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={restorePendingId === g.id}
                            onClick={() => void handleRestoreGlobal(g.id)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            {t("restoreGlobalCta")}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-24 animate-pulse" />
          ))}
        </div>
      ) : rows.length > 0 ? (
        // B3 — vertical list grouped by habit title. Each group lists every
        // assignment (one per client) with its own recurrence + reminder +
        // edit/delete, so the coach can scan "who has habit X".
        <div className="flex flex-col gap-4">
          {assignmentGroups.map((group) => (
            <Card key={group.title} className="overflow-hidden">
              <CardContent className="flex flex-col gap-0 p-0">
                <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
                  <h3 className="min-w-0 truncate text-base font-semibold text-foreground">
                    {group.title}
                  </h3>
                  <Badge variant="violet" className="shrink-0 font-medium">
                    {tTypeLabels(group.rows[0].type)}
                  </Badge>
                </div>
                <ul className="divide-y divide-border">
                  {group.rows.map((row) => {
                    const client =
                      row.clientId.length > 0
                        ? clientById.get(row.clientId)
                        : undefined;
                    const clientName =
                      client?.displayName ??
                      clientNameMap.get(row.clientId) ??
                      row.clientId;
                    return (
                      <li
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handlers.onView(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handlers.onView(row);
                          }
                        }}
                        className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <ClientAvatar
                            name={clientName}
                            photoURL={client?.photoURL ?? null}
                            size="sm"
                          />
                          <span className="min-w-0 truncate font-medium text-foreground">
                            {clientName}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <RecurrencePill rec={row} t={columnsT} />
                          <ReminderCell
                            reminderEnabled={row.reminderEnabled}
                            reminderTime={row.reminderTime}
                          />
                        </span>
                        <span
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={columnsT("edit")}
                            className="h-11 w-11 text-muted-foreground hover:text-foreground"
                            onClick={() => handlers.onEdit(row)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={columnsT("delete")}
                            className="h-11 w-11 text-destructive hover:text-destructive"
                            onClick={() => handlers.onDelete(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isUnfilteredEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="font-medium">{t("emptyHeadline")}</p>
            <p className="text-sm text-muted-foreground">{t("emptySubtitle")}</p>
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

      <NewHabitDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        clients={activeClientRoster.map((c) => ({
          uid: c.uid,
          displayName: c.displayName,
        }))}
        trainerUid={trainerUid}
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
        clientNames={clientNameMap}
        onChanged={() =>
          // Prefix-match invalidates the assignments feed, the templates list,
          // AND the hidden-ids list (B5 hide refreshes the library).
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
