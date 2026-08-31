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
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import {
  PGFLEX_LOGISTICS_PAGE_SIZE,
  canCreatePGFlexLogistics,
  getPGFlexRouteSummary,
  getPGFlexStatusBadgeVariant,
  getPGFlexStatusLabel,
  type PGFlexLogisticsListItem,
  type PGFlexLogisticsPage,
} from "@/lib/pgflex-logistics";
import { compactList, formatDateTime } from "@/lib/moderation-utils";
import { cn } from "@/lib/utils";

function buildLogisticsPath(cursor?: string | null) {
  const params = new URLSearchParams({
    limit: String(PGFLEX_LOGISTICS_PAGE_SIZE),
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

  async function loadPage(mode: "refresh" | "more") {
    if (pending) {
      return;
    }

    setPending(mode);
    setError(null);

    try {
      const page = await sdkFetch<PGFlexLogisticsPage>(
        buildLogisticsPath(mode === "more" ? nextCursor : null),
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
                className={cn("h-3.5 w-3.5", pending === "refresh" && "animate-spin")}
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

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search dispatches by identifier, route, dispatcher, or status...")}
              className="pl-9"
            />
          </label>
          <p className="text-sm text-muted-foreground">
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
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_180px_180px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>{t("Dispatch")}</span>
          <span>{t("Route")}</span>
          <span>{t("Requested")}</span>
          <span>{t("Status")}</span>
          <span className="text-right">{t("Action")}</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No PGFlex logistics items match the current filter.")}
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_180px_180px_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-foreground">
                    {item.identifier}
                  </h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.id}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {compactList([item.description, item.dispatcherEmail]) ||
                    t("Standalone dispatch")}
                </p>
              </div>

              <p className="min-w-0 text-sm text-muted-foreground">
                {getPGFlexRouteSummary(item) || t("No route")}
              </p>

              <p className="text-sm text-muted-foreground">
                {formatDateTime(item.timeRequested) ??
                  item.timeRequested ??
                  formatDateTime(item.pickupTime) ??
                  item.pickupTime}
              </p>

              <div className="flex flex-wrap gap-2">
                <Badge variant={getPGFlexStatusBadgeVariant(item.status)}>
                  {t(getPGFlexStatusLabel(item.status))}
                </Badge>
                {item.dispatcherEmail ? (
                  <Badge variant="secondary">{item.dispatcherEmail}</Badge>
                ) : item.dispatcherFirebaseId || item.dispatcherId ? (
                  <Badge variant="secondary">
                    {item.dispatcherFirebaseId ?? item.dispatcherId}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t("Unassigned")}</Badge>
                )}
              </div>

              <div className="flex lg:justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/pgflex/logistics/${item.id}`}>
                    {t("Open")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          ))
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
