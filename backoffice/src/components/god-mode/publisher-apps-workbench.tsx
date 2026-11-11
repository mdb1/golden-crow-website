"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Building2,
  FileJson2,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Trash2,
  UserRound,
} from "lucide-react";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  publisherAppStatusLabel,
  type PublisherAppCatalogSnapshotResponse,
  type PublisherAppConfig,
  type PublisherAppConfigsPage,
} from "@/lib/publisher-app-config";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const API_ROUTE = "/admin/publisher-app-configs";
const APPS_QUERY_KEY = ["god-mode-publisher-apps"] as const;
const SNAPSHOT_ROUTE = `${API_ROUTE}/snapshot`;
const SNAPSHOT_QUERY_KEY = ["god-mode-publisher-apps-snapshot"] as const;

function statusClassName(status: PublisherAppConfig["status"]) {
  switch (status) {
    case "active":
    case "active_for_testing":
      return "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-100";
    case "active_waiting_for_payment":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100";
    case "active_waiting_for_upload":
      return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-100";
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100";
    case "changes_requested":
      return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-100";
    case "rejected":
      return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100";
    default:
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100";
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function SnapshotAppThumbnail({
  image,
  name,
}: {
  image: string | null;
  name: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(image) && !imageFailed;

  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
      {showImage ? (
        // The snapshot supports arbitrary HTTPS and data-image sources, so
        // this preview cannot use Next Image's configured host allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image ?? undefined}
          alt={`${name} thumbnail`}
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <ImageIcon aria-hidden="true" className="size-5" />
      )}
    </span>
  );
}

function AppRow({
  app,
  selected,
  disabled,
  onSelect,
  onDelete,
}: {
  app: PublisherAppConfig;
  selected: boolean;
  disabled: boolean;
  onSelect: (checked: boolean) => void;
  onDelete: () => void;
}) {
  const href = `/god-mode/apps/${encodeURIComponent(app.id)}`;
  const enabledFeatures =
    2 +
    [
      app.connectEnabled,
      app.learnCustomizationEnabled,
      app.profileEnabled,
    ].filter(Boolean).length;
  const PublisherIcon =
    app.publisherKind === "organization" ? Building2 : UserRound;

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-violet-100/80 bg-white/88 p-4 shadow-[0_20px_54px_-44px_rgba(109,40,217,0.55)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_26px_64px_-42px_rgba(109,40,217,0.72)] dark:border-violet-400/16 dark:bg-slate-950/40",
        selected &&
          "border-violet-400 bg-violet-50/80 ring-1 ring-violet-300 dark:bg-violet-950/40",
      )}
    >
      <Link
        href={href}
        aria-label={`Editar app de ${app.publisherName}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative z-20 flex size-10 shrink-0 items-center justify-center">
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onSelect(checked === true)}
              disabled={disabled}
              aria-label={`Seleccionar app de ${app.publisherName}`}
              className="size-5"
            />
          </div>
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/80 shadow-[0_12px_26px_-18px_rgba(15,23,42,0.75)]"
            style={{ backgroundColor: app.colors.primary }}
          >
            <PublisherIcon className="size-5 text-white drop-shadow-sm" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-heading text-base font-semibold text-foreground">
                {app.publisherName}
              </h3>
              <Badge
                variant="outline"
                className={cn("rounded-full", statusClassName(app.status))}
              >
                {publisherAppStatusLabel(app.status)}
              </Badge>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {app.publisherEmail}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground/80">
              {app.id}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[37rem]">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/75 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/55">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Publicador
            </dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">
              {app.publisherKind === "organization"
                ? "Organización"
                : "Individual"}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/75 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/55">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Plataformas
            </dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">
              {app.platformOption === "ios_android"
                ? "iOS + Android"
                : "Solo iOS"}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/75 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/55">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Funciones
            </dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">
              {enabledFeatures} de 5
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/75 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/55">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Actualizada
            </dt>
            <dd className="mt-1 truncate text-xs font-semibold text-foreground">
              {formatDate(app.updatedAt)}
            </dd>
          </div>
        </dl>

        <div className="relative z-20 flex shrink-0 items-center gap-2 self-end lg:self-auto">
          <Link
            href={href}
            aria-label={`Abrir app de ${app.publisherName}`}
            className="flex size-10 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700 transition hover:border-violet-500 hover:bg-violet-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-100"
          >
            <ArrowRight className="size-4" />
          </Link>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onDelete}
            disabled={disabled}
            aria-label={`Eliminar app de ${app.publisherName}`}
            title="Eliminar app"
            className="size-10 rounded-xl border-rose-200 text-rose-600 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-400/25 dark:hover:bg-rose-500/10"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}

type AppDeleteOutcome = { configId: string; error: string | null };

function PublisherAppsDeleteDialog({
  targets,
  outcomes,
  pending,
  onConfirm,
  onClose,
}: {
  targets: PublisherAppConfig[];
  outcomes: AppDeleteOutcome[] | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const successCount = outcomes?.filter((item) => !item.error).length ?? 0;
  const failureCount = outcomes?.filter((item) => item.error).length ?? 0;
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <AlertDialogContent className="flex max-h-[85vh] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl data-[size=default]:sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {outcomes === null
              ? targets.length === 1
                ? "¿Eliminar esta app?"
                : `¿Eliminar ${targets.length} apps?`
              : pending
                ? "Eliminando apps…"
                : "Resultado de la eliminación"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {outcomes === null
              ? "Se eliminará la configuración de las apps indicadas y se quitarán del catálogo. Las apps activas dejarán de tener configuración disponible. Esta acción no se puede deshacer. Los perfiles de publicador y sus publicaciones se conservan."
              : pending
                ? `${outcomes.length} de ${targets.length} apps procesadas.`
                : `${successCount} eliminadas · ${failureCount} con errores.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul
          className="min-h-0 space-y-2 overflow-y-auto"
          aria-label="Apps a eliminar"
        >
          {targets.map((app, index) => {
            const outcome = outcomes?.find((item) => item.configId === app.id);
            return (
              <li key={app.id} className="rounded-xl border p-3">
                <p className="font-semibold">{app.publisherName}</p>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {app.id}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {publisherAppStatusLabel(app.status)}
                </p>
                {outcome ? (
                  <p
                    className={cn(
                      "mt-2 text-sm",
                      outcome.error
                        ? "text-destructive"
                        : "text-emerald-700 dark:text-emerald-300",
                    )}
                    role={outcome.error ? "alert" : "status"}
                  >
                    {outcome.error || "Eliminada"}
                  </p>
                ) : pending ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {index === outcomes?.length ? "Eliminando…" : "Pendiente"}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            {outcomes === null ? "Cancelar" : "Listo"}
          </Button>
          {outcomes === null || pending ? (
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {pending
                ? "Eliminando…"
                : targets.length === 1
                  ? "Eliminar definitivamente"
                  : `Eliminar ${targets.length} apps`}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PublisherAppsSnapshotDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const snapshotQuery = useQuery({
    queryKey: SNAPSHOT_QUERY_KEY,
    enabled: open,
    queryFn: () =>
      sdkFetch<PublisherAppCatalogSnapshotResponse>(SNAPSHOT_ROUTE, {
        cache: "no-store",
      }),
  });
  const updateSnapshot = useMutation({
    mutationFn: () =>
      sdkFetch<PublisherAppCatalogSnapshotResponse>(SNAPSHOT_ROUTE, {
        method: "PUT",
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(SNAPSHOT_QUERY_KEY, response);
    },
  });
  const snapshot = snapshotQuery.data?.snapshot ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader className="pr-10">
          <div className="flex items-center gap-2">
            <FileJson2 className="size-5 text-violet-600" />
            <DialogTitle>custom_apps_snapshot/simple</DialogTitle>
          </div>
          <DialogDescription>
            Single lightweight catalog document for clients that need available
            app options without loading every full app configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {snapshotQuery.isPending ? (
            <div className="grid gap-3" aria-label="Loading snapshot stats">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-48 rounded-2xl" />
            </div>
          ) : snapshotQuery.isError ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100"
            >
              Unable to load the app snapshot.
            </div>
          ) : snapshot ? (
            <article
              data-testid="publisher-apps-snapshot-file"
              className="space-y-5 rounded-2xl border border-violet-100 bg-violet-50/35 p-4 dark:border-violet-400/20 dark:bg-violet-500/6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">
                    custom_apps_snapshot/simple
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Updated {formatDate(snapshot.updatedAt)} by{" "}
                    {snapshot.updatedByUserId}
                  </p>
                </div>
                <Badge variant="outline" className="rounded-full">
                  schema v{snapshot.schemaVersion}
                </Badge>
              </div>

              <dl className="grid gap-2 sm:grid-cols-4">
                {[
                  ["Available apps", snapshot.totalCount],
                  ["Active", snapshot.activeCount],
                  ["Inactive", snapshot.inactiveCount],
                  ["Source reads", snapshot.sourceReadCount],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-violet-100 bg-background/80 p-3 dark:border-violet-400/15"
                  >
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-2xl font-semibold text-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <section aria-labelledby="snapshot-statuses-title">
                <h3
                  id="snapshot-statuses-title"
                  className="text-sm font-semibold text-foreground"
                >
                  Statuses
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {snapshot.statusCounts.map(({ status, count }) => (
                    <Badge
                      key={status}
                      variant="outline"
                      className={cn("rounded-full", statusClassName(status))}
                    >
                      {publisherAppStatusLabel(status)} · {count}
                    </Badge>
                  ))}
                </div>
              </section>

              <section aria-labelledby="snapshot-apps-title">
                <div className="flex items-center justify-between gap-3">
                  <h3
                    id="snapshot-apps-title"
                    className="font-mono text-sm font-semibold text-foreground"
                  >
                    apps[]
                  </h3>
                  <Badge variant="secondary">{snapshot.apps.length}</Badge>
                </div>
                <div className="mt-2 grid gap-2">
                  {snapshot.apps.length > 0 ? (
                    snapshot.apps.map((app) => (
                      <div
                        key={app.id}
                        className="rounded-xl border border-slate-200 bg-background/85 p-3 dark:border-slate-700"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <SnapshotAppThumbnail
                              key={app.image ?? "no-image"}
                              image={app.image}
                              name={app.name}
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground">
                                {app.name}
                              </p>
                              <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                                {app.id}
                              </p>
                              {app.appProviderIdentifier ? (
                                <p className="mt-0.5 break-all font-mono text-xs text-violet-700 dark:text-violet-200">
                                  {app.appProviderIdentifier}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full",
                              statusClassName(app.status),
                            )}
                          >
                            {publisherAppStatusLabel(app.status)}
                          </Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {app.description || "No description"}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {app.publisherKind} · {app.publisherId}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      The snapshot catalog is empty.
                    </p>
                  )}
                </div>
              </section>
            </article>
          ) : (
            <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/45 p-8 text-center dark:border-violet-400/25 dark:bg-violet-500/8">
              <BarChart3 className="mx-auto size-8 text-violet-500" />
              <p className="mt-3 font-semibold text-foreground">
                Snapshot not created yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Update the snapshot to create custom_apps_snapshot/simple.
              </p>
            </div>
          )}

          {updateSnapshot.isError ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100"
            >
              {updateSnapshot.error instanceof Error
                ? updateSnapshot.error.message
                : "Unable to update the app snapshot."}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t pt-4">
          <Button
            type="button"
            onClick={() => updateSnapshot.mutate()}
            disabled={updateSnapshot.isPending}
          >
            <RefreshCw
              className={cn(
                "size-4",
                updateSnapshot.isPending && "animate-spin",
              )}
            />
            {updateSnapshot.isPending ? "Updating…" : "Update snapshot"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GodModePublisherAppsBrowser() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<
    PublisherAppConfig[] | null
  >(null);
  const [deleteOutcomes, setDeleteOutcomes] = useState<
    AppDeleteOutcome[] | null
  >(null);
  const [deletePending, setDeletePending] = useState(false);
  const deleteInFlight = useRef(false);
  const appsQuery = useInfiniteQuery({
    queryKey: APPS_QUERY_KEY,
    enabled: !deletePending,
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      return sdkFetch<PublisherAppConfigsPage>(
        `${API_ROUTE}?${params.toString()}`,
      );
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const apps = useMemo(
    () => appsQuery.data?.pages.flatMap((page) => page.apps) ?? [],
    [appsQuery.data],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleApps = useMemo(() => {
    if (!normalizedQuery) return apps;
    return apps.filter((app) =>
      [
        app.id,
        app.publisherId,
        app.publisherName,
        app.publisherEmail,
        app.publisherUsername,
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [apps, normalizedQuery]);
  const selectedApps = apps.filter((app) => selectedIds.has(app.id));
  const allVisibleSelected =
    visibleApps.length > 0 &&
    visibleApps.every((app) => selectedIds.has(app.id));
  const someVisibleSelected = visibleApps.some((app) =>
    selectedIds.has(app.id),
  );
  const hiddenSelectionCount = selectedApps.filter(
    (app) => !visibleApps.some((visible) => visible.id === app.id),
  ).length;

  useEffect(() => {
    if (!appsQuery.isSuccess) return;
    const available = new Set(apps.map((app) => app.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [apps, appsQuery.isSuccess]);

  function openDelete(targets: PublisherAppConfig[]) {
    if (deleteInFlight.current || !targets.length) return;
    setDeleteOutcomes(null);
    setDeleteTargets([...targets]);
  }

  async function deleteApps() {
    if (
      deleteInFlight.current ||
      !deleteTargets?.length ||
      deleteOutcomes !== null
    )
      return;
    deleteInFlight.current = true;
    setDeletePending(true);
    setDeleteOutcomes([]);
    const outcomes: AppDeleteOutcome[] = [];
    try {
      await queryClient.cancelQueries({ queryKey: APPS_QUERY_KEY });
      for (const app of deleteTargets) {
        try {
          const response = await sdkFetch<{
            deleted: boolean;
            configId: string;
          }>(`${API_ROUTE}/${encodeURIComponent(app.id)}`, {
            method: "DELETE",
            body: JSON.stringify({ expectedUpdatedAt: app.updatedAt }),
          });
          if (!response.deleted || response.configId !== app.id)
            throw new Error("La eliminación no fue confirmada.");
          outcomes.push({ configId: app.id, error: null });
          queryClient.setQueryData<InfiniteData<PublisherAppConfigsPage>>(
            APPS_QUERY_KEY,
            (data) =>
              data
                ? {
                    ...data,
                    pages: data.pages.map((page) => ({
                      ...page,
                      apps: page.apps.filter((entry) => entry.id !== app.id),
                    })),
                  }
                : data,
          );
          setSelectedIds((current) => {
            const next = new Set(current);
            next.delete(app.id);
            return next;
          });
        } catch (error) {
          outcomes.push({
            configId: app.id,
            error:
              error instanceof SdkRequestError && error.status === 409
                ? "La app cambió. Revisá la lista actualizada antes de volver a eliminarla."
                : "No pudimos confirmar la eliminación. Revisá la lista actualizada antes de reintentar.",
          });
        }
        setDeleteOutcomes([...outcomes]);
      }
    } finally {
      // Discard cursors that may now reference deleted apps before enabling the list again.
      await queryClient.resetQueries({ queryKey: APPS_QUERY_KEY, exact: true });
      setDeletePending(false);
      deleteInFlight.current = false;
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: SNAPSHOT_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["connected-partners"] }),
      ]);
    }
  }

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="god-mode-apps-browser"
    >
      <div className="rounded-2xl border border-violet-100/80 bg-white/92 p-4 shadow-[0_20px_60px_-48px_rgba(109,40,217,0.55)] dark:border-violet-400/16 dark:bg-slate-950/45">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/14 dark:text-violet-100">
              <Smartphone className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-xl font-semibold text-foreground">
                  Apps
                </h2>
                <HeaderUnclutterButton />
              </div>
              <p className="text-sm text-muted-foreground">
                {apps.length} configuraciones cargadas
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-2xl lg:justify-end">
            <Button asChild className="h-11 shrink-0 rounded-xl">
              <Link href="/god-mode/apps/new">
                <Plus className="size-4" />
                Nueva app
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 rounded-xl"
              onClick={() => setSnapshotOpen(true)}
            >
              <BarChart3 className="size-4" />
              Show snapshot stats
            </Button>
            <label className="relative block w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cliente, email o ID"
                className="h-11 rounded-xl pl-10"
              />
            </label>
          </div>
        </div>
      </div>

      <PublisherAppsSnapshotDialog
        open={snapshotOpen}
        onOpenChange={setSnapshotOpen}
      />

      {deleteTargets ? (
        <PublisherAppsDeleteDialog
          targets={deleteTargets}
          outcomes={deleteOutcomes}
          pending={deletePending}
          onConfirm={() => void deleteApps()}
          onClose={() => {
            if (!deleteInFlight.current) setDeleteTargets(null);
          }}
        />
      ) : null}

      {appsQuery.isSuccess && apps.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 dark:border-violet-400/20 dark:bg-violet-950/25">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox
                aria-label="Seleccionar apps visibles"
                disabled={deletePending || visibleApps.length === 0}
                checked={
                  allVisibleSelected
                    ? true
                    : someVisibleSelected
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(checked) =>
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    for (const app of visibleApps) {
                      if (checked === true) next.add(app.id);
                      else next.delete(app.id);
                    }
                    return next;
                  })
                }
              />
              Seleccionar apps visibles ({visibleApps.length})
            </label>
            <span className="text-sm text-muted-foreground">
              {selectedApps.length} seleccionadas
              {hiddenSelectionCount > 0
                ? ` · ${hiddenSelectionCount} fuera del filtro`
                : ""}
            </span>
          </div>
          {selectedApps.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deletePending}
                onClick={() => setSelectedIds(new Set())}
              >
                Limpiar selección
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deletePending}
                onClick={() => openDelete(selectedApps)}
              >
                <Trash2 className="size-4" />
                Eliminar seleccionadas ({selectedApps.length})
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {appsQuery.isPending ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : appsQuery.isError ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100"
        >
          No pudimos cargar las apps. Volvé a intentarlo.
        </div>
      ) : visibleApps.length > 0 ? (
        <div className="grid gap-3">
          {visibleApps.map((app) => (
            <AppRow
              key={app.id}
              app={app}
              selected={selectedIds.has(app.id)}
              disabled={deletePending}
              onSelect={(checked) =>
                setSelectedIds((current) => {
                  const next = new Set(current);
                  if (checked) next.add(app.id);
                  else next.delete(app.id);
                  return next;
                })
              }
              onDelete={() => openDelete([app])}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/45 p-10 text-center dark:border-violet-400/25 dark:bg-violet-500/8">
          <Smartphone className="mx-auto size-8 text-violet-500" />
          <p className="mt-3 font-semibold text-foreground">
            {apps.length === 0
              ? "Todavía no hay apps configuradas."
              : "No hay coincidencias en las apps cargadas."}
          </p>
        </div>
      )}

      {appsQuery.hasNextPage ? (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void appsQuery.fetchNextPage()}
            disabled={appsQuery.isFetching || deletePending}
            className="h-11 rounded-xl"
          >
            {appsQuery.isFetchingNextPage ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {appsQuery.isFetchingNextPage ? "Cargando…" : "Cargar más"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
