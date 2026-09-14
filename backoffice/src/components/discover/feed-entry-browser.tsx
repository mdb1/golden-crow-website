"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Copy,
  Newspaper,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppLanguage } from "@/components/app-language-provider";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import { compactList, formatDateTime } from "@/lib/moderation-utils";
import {
  DISCOVER_FEED_STATUS_OPTIONS,
  DISCOVER_FEED_TYPE_OPTIONS,
  discoverStatusLabel,
  discoverTypeLabel,
  getDiscoverFeedSummary,
  getDiscoverFeedTitle,
  getDiscoverPayload,
  type DiscoverFeedItemRecord,
  type DiscoverFeedItemsPage,
  type DiscoverFeedStatus,
  type DiscoverFeedType,
  type DiscoverIndividualRecord,
  type DiscoverOrganizationRecord,
} from "@/lib/discover";

function statusBadgeVariant(status: DiscoverFeedStatus) {
  if (status === "published") {
    return "success" as const;
  }

  if (status === "archived") {
    return "secondary" as const;
  }

  return "outline" as const;
}

function hasPublishBlocker(item: DiscoverFeedItemRecord) {
  return (
    !item.title.trim() ||
    !item.subtitle.trim() ||
    (!item.body.trim() && !item.htmlBody?.trim())
  );
}

const publisherPanelClass =
  "rounded-2xl border border-violet-200/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,243,255,0.94)_52%,rgba(240,249,255,0.78))] shadow-[0_18px_56px_-44px_rgba(109,40,217,0.48)] dark:border-violet-400/22 dark:bg-[linear-gradient(145deg,rgba(35,24,73,0.94),rgba(26,31,52,0.94)_52%,rgba(12,35,54,0.72))]";
const publisherPrimaryButtonClass =
  "h-9 rounded-xl bg-violet-600 px-3 font-semibold text-white shadow-[0_14px_34px_rgba(109,40,217,0.24)] hover:bg-violet-700";
const publisherSoftButtonClass =
  "h-9 rounded-xl border-violet-200/80 bg-white/78 px-3 text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 dark:border-violet-400/24 dark:bg-violet-500/10 dark:text-violet-50 dark:hover:bg-violet-500/18";
const publisherInputClass =
  "h-11 rounded-xl border-violet-200/80 bg-white/90 shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-300/35 dark:border-violet-400/20 dark:bg-slate-950/45";
const publisherSelectClass =
  "h-11 rounded-xl border border-violet-200/80 bg-white/90 px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-violet-400 focus:ring-3 focus:ring-violet-300/35 dark:border-violet-400/20 dark:bg-slate-950/45";
const publisherTablePanelClass =
  "overflow-hidden rounded-2xl border border-violet-100/80 bg-white/92 shadow-[0_18px_56px_-46px_rgba(15,23,42,0.46)] dark:border-violet-400/16 dark:bg-slate-950/50";
const publisherTableHeaderClass =
  "hidden grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_110px_170px_auto] gap-4 border-b border-violet-100/80 bg-violet-50/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-950/60 dark:border-violet-400/14 dark:bg-violet-500/8 dark:text-violet-100/62 lg:grid";
const publisherRowClass =
  "grid gap-3 border-b border-violet-100/70 px-4 py-4 transition-colors last:border-b-0 hover:bg-violet-50/42 dark:border-violet-400/12 dark:hover:bg-violet-500/6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_110px_170px_auto] lg:items-center";

export function DiscoverFeedEntryBrowser({
  initialFeedItems,
  initialNextCursor,
  organizations,
  individuals,
  initialLoadError,
  routeBase = "/discover/feed-entries",
}: {
  initialFeedItems: DiscoverFeedItemRecord[];
  initialNextCursor: string | null;
  organizations: DiscoverOrganizationRecord[];
  individuals: DiscoverIndividualRecord[];
  initialLoadError?: string | null;
  routeBase?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const [feedItems, setFeedItems] = useState(initialFeedItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | DiscoverFeedType>("all");
  const [status, setStatus] = useState<"all" | DiscoverFeedStatus>("all");
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(
    initialLoadError
      ? {
          id: 0,
          tone: "error",
          message: initialLoadError,
          durationMs: 30000,
        }
      : null,
  );

  const organizationById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const individualById = useMemo(
    () => new Map(individuals.map((individual) => [individual.id, individual])),
    [individuals],
  );
  const filteredFeedItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return feedItems.filter((item) => {
      const payload = getDiscoverPayload(item);
      const searchable = [
        item.id,
        item.publisherOrganizationId,
        item.publisherIndividualId,
        item.publisherSnapshot.name,
        item.type,
        item.status,
        item.sourceUrl,
        item.language,
        item.title,
        item.subtitle,
        item.body,
        typeof payload?.category === "string" ? payload.category : "",
        typeof payload?.region === "string" ? payload.region : "",
        typeof payload?.virtualMeetingLink === "string"
          ? payload.virtualMeetingLink
          : "",
        typeof payload?.meetingUrl === "string" ? payload.meetingUrl : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (type === "all" || item.type === type) &&
        (status === "all" || item.status === status) &&
        (publisherFilter === "all" ||
          (publisherFilter.startsWith("organization:") &&
            item.publisherOrganizationId === publisherFilter.slice("organization:".length)) ||
          (publisherFilter.startsWith("individual:") &&
            item.publisherIndividualId === publisherFilter.slice("individual:".length)))
      );
    });
  }, [feedItems, publisherFilter, query, status, type]);

  async function loadMore() {
    if (!nextCursor) {
      return;
    }

    setPending(true);
    try {
      const params = new URLSearchParams({ cursor: nextCursor });
      const page = await sdkFetch<DiscoverFeedItemsPage>(
        `/discover/feed-items?${params.toString()}`,
      );
      setFeedItems((current) => [...current, ...page.feedItems]);
      setNextCursor(page.nextCursor);
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to load more feed entries."),
      });
    } finally {
      setPending(false);
    }
  }

  async function refresh() {
    setPending(true);
    try {
      const page = await sdkFetch<DiscoverFeedItemsPage>("/discover/feed-items");
      setFeedItems(page.feedItems);
      setNextCursor(page.nextCursor);
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to refresh feed entries."),
      });
    } finally {
      setPending(false);
    }
  }

  async function deleteFeedItem(item: DiscoverFeedItemRecord) {
    setPending(true);
    try {
      await sdkFetch<{ deleted: boolean; feedItemId: string }>(
        `/discover/feed-items/${item.id}`,
        { method: "DELETE" },
      );
      setFeedItems((current) => current.filter((entry) => entry.id !== item.id));
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Feed entry deleted."),
      });
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to delete the feed entry."),
      });
    } finally {
      setPending(false);
    }
  }

  async function duplicateFeedItem(item: DiscoverFeedItemRecord) {
    setPending(true);
    try {
      const response = await sdkFetch<{ feedItem: DiscoverFeedItemRecord }>(
        `/discover/feed-items/${item.id}/duplicate`,
        { method: "POST" },
      );
      router.push(`${routeBase}/${response.feedItem.id}`);
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to duplicate the feed entry."),
      });
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      {initialLoadError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {initialLoadError}
        </div>
      ) : null}

      <div className={`${publisherPanelClass} flex flex-col gap-4 px-5 py-4`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-100 text-violet-700 shadow-inner dark:border-violet-400/20 dark:bg-violet-500/14 dark:text-violet-100">
              <Newspaper className="size-5" />
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="font-heading text-xl font-semibold text-foreground">
                {t("Feed entries")}
              </h2>
              <HeaderUnclutterButton />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={pending}
              className={publisherSoftButtonClass}
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              {pending ? t("Working...") : t("Refresh")}
            </Button>
            <Button size="sm" asChild className={publisherPrimaryButtonClass}>
              <Link href={`${routeBase}/new`}>
                <Plus className="h-3.5 w-3.5" />
                {t("New feed entry")}
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_12rem_11rem_minmax(12rem,16rem)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search title, publisher, body, or URL")}
            className={`${publisherInputClass} pl-9`}
          />
        </label>
        <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as "all" | DiscoverFeedType)
            }
            className={publisherSelectClass}
          >
            <option value="all">{t("All types")}</option>
            {DISCOVER_FEED_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "all" | DiscoverFeedStatus)
            }
            className={publisherSelectClass}
          >
            <option value="all">{t("All statuses")}</option>
            {DISCOVER_FEED_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <select
            value={publisherFilter}
            onChange={(event) => setPublisherFilter(event.target.value)}
            className={publisherSelectClass}
          >
            <option value="all">{t("All publishers")}</option>
            {organizations.length > 0 ? (
              <optgroup label={t("Organizations")}>
                {organizations.map((organization) => (
                  <option key={organization.id} value={`organization:${organization.id}`}>
                    {organization.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {individuals.length > 0 ? (
              <optgroup label={t("Individual Publishers")}>
                {individuals.map((individual) => (
                  <option key={individual.id} value={`individual:${individual.id}`}>
                    {individual.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </div>
      </div>

      <div className={publisherTablePanelClass}>
        <div className={publisherTableHeaderClass}>
          <span>{t("Entry")}</span>
          <span>{t("Publisher")}</span>
          <span>{t("Status")}</span>
          <span>{t("Published")}</span>
          <span className="text-right">{t("Action")}</span>
        </div>

        {filteredFeedItems.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/14 dark:text-violet-100">
              <Newspaper className="size-6" />
            </div>
            {t("No Discover feed entries match the loaded rows.")}
          </div>
        ) : (
          filteredFeedItems.map((item) => {
            const publisher = item.publisherOrganizationId
              ? organizationById.get(item.publisherOrganizationId)
              : item.publisherIndividualId
                ? individualById.get(item.publisherIndividualId)
                : undefined;
            const blocker = hasPublishBlocker(item);

            return (
              <div
                key={item.id}
                className={publisherRowClass}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">
                      {getDiscoverFeedTitle(item)}
                    </h3>
                    <Badge variant="brand">{t(discoverTypeLabel(item.type))}</Badge>
                    {blocker ? (
                      <Badge variant="warning">
                        <TriangleAlert className="h-3 w-3" />
                        {t("Needs content")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {getDiscoverFeedSummary(item)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {compactList([item.id, item.language, item.sourceUrl ?? undefined])}
                  </p>
                </div>

                <div className="text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">
                    {item.publisherSnapshot.name}
                  </div>
                  <div>
                    {publisher?.status
                      ? t(publisher.status)
                      : item.publisherOrganizationId ?? item.publisherIndividualId}
                  </div>
                </div>

                <div>
                  <Badge variant={statusBadgeVariant(item.status)}>
                    {t(discoverStatusLabel(item.status))}
                  </Badge>
                </div>

                <div className="text-sm text-muted-foreground">
                  {formatDateTime(item.publishedAt ?? item.updatedAt) ??
                    t("No timestamp")}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className={publisherSoftButtonClass}
                  >
                    <Link href={`${routeBase}/${item.id}`}>
                      {t("Open")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void duplicateFeedItem(item)}
                    disabled={pending}
                    className={publisherSoftButtonClass}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t("Duplicate")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void deleteFeedItem(item)}
                    disabled={pending}
                    className="h-9 rounded-xl"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("Delete")}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void loadMore()}
            disabled={pending}
            className={`${publisherSoftButtonClass} h-10 px-5`}
          >
            {pending ? t("Loading...") : t("Load more")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
