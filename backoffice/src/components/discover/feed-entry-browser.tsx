"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Copy,
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
    (!item.body.trim() && !item.html_body?.trim())
  );
}

export function DiscoverFeedEntryBrowser({
  initialFeedItems,
  initialNextCursor,
  organizations,
  initialLoadError,
}: {
  initialFeedItems: DiscoverFeedItemRecord[];
  initialNextCursor: string | null;
  organizations: DiscoverOrganizationRecord[];
  initialLoadError?: string | null;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const [feedItems, setFeedItems] = useState(initialFeedItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | DiscoverFeedType>("all");
  const [status, setStatus] = useState<"all" | DiscoverFeedStatus>("all");
  const [organizationId, setOrganizationId] = useState("all");
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
  const filteredFeedItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return feedItems.filter((item) => {
      const payload = getDiscoverPayload(item);
      const searchable = [
        item.id,
        item.publisherOrganizationId,
        item.publisherSnapshot.name,
        item.type,
        item.status,
        item.source_url,
        item.language,
        item.title,
        item.subtitle,
        item.body,
        typeof payload?.category === "string" ? payload.category : "",
        typeof payload?.region === "string" ? payload.region : "",
        typeof payload?.virtual_meeting_link === "string"
          ? payload.virtual_meeting_link
          : "",
        typeof payload?.virtualMeetingLink === "string"
          ? payload.virtualMeetingLink
          : "",
        typeof payload?.meeting_url === "string" ? payload.meeting_url : "",
        typeof payload?.meetingUrl === "string" ? payload.meetingUrl : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (type === "all" || item.type === type) &&
        (status === "all" || item.status === status) &&
        (organizationId === "all" ||
          item.publisherOrganizationId === organizationId)
      );
    });
  }, [feedItems, organizationId, query, status, type]);

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
      router.push(`/discover/feed-entries/${response.feedItem.id}`);
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

      <div className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {t("Feed entries")}
            </h2>
            <HeaderUnclutterButton />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={pending}>
              <RefreshCcw className="h-3.5 w-3.5" />
              {pending ? t("Working...") : t("Refresh")}
            </Button>
            <Button size="sm" asChild>
              <Link href="/discover/feed-entries/new">
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
              className="pl-9"
            />
          </label>
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as "all" | DiscoverFeedType)
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{t("All statuses")}</option>
            {DISCOVER_FEED_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <select
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{t("All publishers")}</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_110px_170px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>{t("Entry")}</span>
          <span>{t("Publisher")}</span>
          <span>{t("Status")}</span>
          <span>{t("Published")}</span>
          <span className="text-right">{t("Action")}</span>
        </div>

        {filteredFeedItems.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No Discover feed entries match the loaded rows.")}
          </div>
        ) : (
          filteredFeedItems.map((item) => {
            const organization = organizationById.get(item.publisherOrganizationId);
            const blocker = hasPublishBlocker(item);

            return (
              <div
                key={item.id}
                className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_110px_170px_auto] lg:items-center"
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
                    {compactList([item.id, item.language, item.source_url ?? undefined])}
                  </p>
                </div>

                <div className="text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">
                    {item.publisherSnapshot.name}
                  </div>
                  <div>{organization?.status ? t(organization.status) : item.publisherOrganizationId}</div>
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
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/discover/feed-entries/${item.id}`}>
                      {t("Open")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void duplicateFeedItem(item)}
                    disabled={pending}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t("Duplicate")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void deleteFeedItem(item)}
                    disabled={pending}
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
          <Button variant="outline" onClick={() => void loadMore()} disabled={pending}>
            {pending ? t("Loading...") : t("Load more")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
