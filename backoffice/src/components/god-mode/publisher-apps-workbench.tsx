"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Loader2,
  Search,
  Smartphone,
  UserRound,
} from "lucide-react";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  publisherAppStatusLabel,
  type PublisherAppConfig,
  type PublisherAppConfigsPage,
} from "@/lib/publisher-app-config";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const API_ROUTE = "/admin/publisher-app-configs";

function statusClassName(status: PublisherAppConfig["status"]) {
  switch (status) {
    case "active":
      return "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-100";
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

function AppRow({ app }: { app: PublisherAppConfig }) {
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
    <article className="group relative overflow-hidden rounded-2xl border border-violet-100/80 bg-white/88 p-4 shadow-[0_20px_54px_-44px_rgba(109,40,217,0.55)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_26px_64px_-42px_rgba(109,40,217,0.72)] dark:border-violet-400/16 dark:bg-slate-950/40">
      <Link
        href={href}
        aria-label={`Editar app de ${app.publisherName}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      />
      <div className="relative z-0 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
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

        <span className="flex size-10 shrink-0 items-center justify-center self-end rounded-xl border border-violet-200 bg-violet-50 text-violet-700 transition group-hover:border-violet-500 group-hover:bg-violet-600 group-hover:text-white lg:self-auto dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-100">
          <ArrowRight className="size-4" />
        </span>
      </div>
    </article>
  );
}

export function GodModePublisherAppsBrowser() {
  const [query, setQuery] = useState("");
  const appsQuery = useInfiniteQuery({
    queryKey: ["god-mode-publisher-apps"],
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
            <AppRow key={app.id} app={app} />
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
            disabled={appsQuery.isFetchingNextPage}
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
