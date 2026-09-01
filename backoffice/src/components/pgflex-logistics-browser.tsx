"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, PlusCircle, RefreshCcw, Search } from "lucide-react";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import {
  PGFLEX_LOGISTICS_PAGE_SIZE,
  PGFLEX_LOGISTICS_SCOPE_OPTIONS,
  canCreatePGFlexLogistics,
  formatPGFlexReadableDateTime,
  getPGFlexStatusBadgeVariant,
  getPGFlexStatusLabel,
  type PGFlexLogisticsListScope,
  type PGFlexLogisticsListItem,
  type PGFlexLogisticsPage,
} from "@/lib/pgflex-logistics";
import { cn } from "@/lib/utils";

function buildLogisticsPath(
  scope: PGFlexLogisticsListScope,
  cursor?: string | null,
) {
  const params = new URLSearchParams({
    limit: String(PGFLEX_LOGISTICS_PAGE_SIZE),
    scope,
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  return `/pgflex/logistics?${params.toString()}`;
}

export function PGFlexLogisticsBrowser({
  initialPage,
}: {
  initialPage: PGFlexLogisticsPage;
}) {
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<PGFlexLogisticsListScope>(
    initialPage.scope ?? "active",
  );
  const [items, setItems] = useState<PGFlexLogisticsListItem[]>(
    initialPage.items,
  );
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialPage.nextCursor,
  );
  const [pending, setPending] = useState<"refresh" | "more" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canCreate = canCreatePGFlexLogistics(adminContext);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      [
        item.id,
        item.identifier,
        item.description,
        item.dispatcherId,
        item.dispatcherFirebaseId,
        item.dispatcherEmail,
        item.origin,
        item.destination,
        getPGFlexStatusLabel(item.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [items, query]);

  async function loadPage(
    mode: "refresh" | "more",
    requestedScope: PGFlexLogisticsListScope = scope,
  ) {
    if (pending) {
      return;
    }

    setPending(mode);
    setError(null);

    try {
      const page = await sdkFetch<PGFlexLogisticsPage>(
        buildLogisticsPath(
          requestedScope,
          mode === "more" && requestedScope === scope ? nextCursor : null,
        ),
      );
      setItems((current) =>
        mode === "more" ? [...current, ...page.items] : page.items,
      );
      setNextCursor(page.nextCursor);
    } catch {
      setError(
        mode === "more"
          ? t("Unable to load more PGFlex logistics items.")
          : t("Unable to refresh PGFlex logistics items."),
      );
    } finally {
      setPending(null);
    }
  }

  function handleScopeChange(value: string) {
    const nextScope = value as PGFlexLogisticsListScope;

    if (pending || nextScope === scope) {
      return;
    }

    setScope(nextScope);
    setQuery("");
    setItems([]);
    setNextCursor(null);
    void loadPage("refresh", nextScope);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="glass-panel flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center">
            <h2
              className="flex min-h-10 items-center"
              aria-label={t("PGFlex logistics")}
            >
              <img
                src="/pgflex_icon.png"
                alt=""
                aria-hidden="true"
                className="h-9 max-w-44 object-contain object-left"
              />
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <HeaderUnclutterButton />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadPage("refresh")}
              disabled={pending !== null}
            >
              <RefreshCcw
                className={cn(
                  "h-3.5 w-3.5",
                  pending === "refresh" && "animate-spin",
                )}
              />
              {pending === "refresh" ? t("Refreshing") : t("Refresh")}
            </Button>
            {canCreate ? (
              <Button size="sm" asChild>
                <Link href="/pgflex/logistics/new">
                  <PlusCircle className="h-3.5 w-3.5" />
                  {t("Create dispatch")}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={scope} onValueChange={handleScopeChange}>
            <TabsList
              aria-label={t("Dispatch status group")}
              className="grid h-11 w-full grid-cols-2 sm:w-80"
            >
              {PGFLEX_LOGISTICS_SCOPE_OPTIONS.map((option) => (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  className="h-9"
                  disabled={pending !== null}
                >
                  {t(option.label)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <label className="relative block w-full max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(
                "Search dispatches by identifier, route, dispatcher, or status...",
              )}
              className="pl-9"
            />
          </label>
          <p className="text-sm text-muted-foreground xl:text-right">
            {t("Showing")} {filteredItems.length} {t("loaded dispatches")}
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      <div className="glass-panel overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No PGFlex logistics items match the current filter.")}
          </div>
        ) : (
          filteredItems.map((item) => {
            const requestedAt =
              formatPGFlexReadableDateTime(item.timeRequested) ??
              item.timeRequested ??
              formatPGFlexReadableDateTime(item.pickupTime) ??
              item.pickupTime;

            return (
              <Link
                key={item.id}
                href={`/pgflex/logistics/${encodeURIComponent(item.id)}`}
                className="group block border-b border-border/70 px-4 py-4 transition duration-200 last:border-b-0 hover:-translate-y-0.5 hover:bg-sky-500/[0.045] hover:shadow-[0_18px_48px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 dark:hover:bg-sky-300/[0.06]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">
                        {item.identifier}
                      </h3>
                      <Badge variant={getPGFlexStatusBadgeVariant(item.status)}>
                        {t(getPGFlexStatusLabel(item.status))}
                      </Badge>
                      {requestedAt ? (
                        <span className="text-sm font-medium text-muted-foreground">
                          {requestedAt}
                        </span>
                      ) : null}
                    </div>

                    {item.description ? (
                      <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}

                    <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground lg:grid-cols-2">
                      <p className="min-w-0">
                        <span className="font-semibold text-foreground">
                          {t("From")}:
                        </span>{" "}
                        <span>{item.origin || t("No route")}</span>
                      </p>
                      <p className="min-w-0">
                        <span className="font-semibold text-foreground">
                          {t("To")}:
                        </span>{" "}
                        <span>{item.destination || t("No route")}</span>
                      </p>
                    </div>
                  </div>

                  <span
                    aria-hidden="true"
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-xl border border-sky-200/80 bg-white/80 px-3 text-sm font-semibold text-sky-700 shadow-sm transition duration-200 group-hover:border-sky-300 group-hover:bg-sky-50 group-hover:text-sky-900 group-hover:shadow-[0_12px_30px_rgba(14,165,233,0.18)] dark:border-sky-300/20 dark:bg-slate-950/60 dark:text-sky-100 dark:group-hover:bg-sky-400/10"
                  >
                    {t("Open")}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="lg"
            onClick={() => void loadPage("more")}
            disabled={pending !== null}
          >
            <RefreshCcw
              className={cn("h-4 w-4", pending === "more" && "animate-spin")}
            />
            {pending === "more" ? t("Loading...") : t("Load more")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
