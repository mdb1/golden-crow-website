"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Clock,
  RotateCcw,
  Save,
  Send,
  UploadCloud,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppLanguage } from "@/components/app-language-provider";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import {
  DISCOVER_FEED_STATUS_OPTIONS,
  DISCOVER_FEED_TYPE_OPTIONS,
  arrayFromPayload,
  discoverStatusLabel,
  discoverTypeLabel,
  getDiscoverPayload,
  stringFromPayload,
  type DiscoverFeedItemRecord,
  type DiscoverFeedStatus,
  type DiscoverFeedType,
  type DiscoverOrganizationRecord,
  type DiscoverOrganizationsPage,
} from "@/lib/discover";

type SharedPayloadState = {
  title: string;
  summary: string;
  imageUrl: string;
};

type FeedEntryFormState = {
  publisherOrganizationId: string;
  type: DiscoverFeedType;
  status: DiscoverFeedStatus;
  publishedAt: string;
  scheduledFor: string;
  sourceUrl: string;
  editorialNotes: string;
  tagsText: string;
  locale: string;
  priority: string;
  expiresAt: string;
  news: SharedPayloadState & {
    category: string;
    region: string;
    detailTitle: string;
    detailBody: string;
    keyPointsText: string;
  };
  research_update: SharedPayloadState & {
    topic: string;
    genesText: string;
    conditionsText: string;
    journalName: string;
    publicationDate: string;
    doi: string;
    plainLanguageTakeaway: string;
    detailBody: string;
    keyPointsText: string;
  };
  upcoming_event: SharedPayloadState & {
    startsAt: string;
    endsAt: string;
    timezone: string;
    locationType: string;
    locationName: string;
    registrationUrl: string;
    priceLabel: string;
    audienceLabel: string;
    agendaText: string;
    detailBody: string;
  };
  opportunity: SharedPayloadState & {
    opportunityType: string;
    deadlineAt: string;
    locationType: string;
    locationName: string;
    eligibility: string;
    applicationUrl: string;
    detailBody: string;
    requirementsText: string;
  };
};

function toDateTimeInput(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sharedPayloadFromRecord(payload?: Record<string, unknown>): SharedPayloadState {
  return {
    title: stringFromPayload(payload?.title),
    summary: stringFromPayload(payload?.summary),
    imageUrl: stringFromPayload(payload?.imageUrl),
  };
}

function toFormState(item?: DiscoverFeedItemRecord): FeedEntryFormState {
  const news = item?.news;
  const research = item?.research_update;
  const event = item?.upcoming_event;
  const opportunity = item?.opportunity;

  return {
    publisherOrganizationId: item?.publisherOrganizationId ?? "",
    type: item?.type ?? "news",
    status: item?.status ?? "draft",
    publishedAt: toDateTimeInput(item?.publishedAt),
    scheduledFor: toDateTimeInput(item?.scheduledFor),
    sourceUrl: item?.sourceUrl ?? "",
    editorialNotes: item?.editorialNotes ?? "",
    tagsText: item?.tags.join("\n") ?? "",
    locale: item?.locale ?? "en",
    priority: String(item?.priority ?? 0),
    expiresAt: toDateTimeInput(item?.expiresAt),
    news: {
      ...sharedPayloadFromRecord(news),
      category: stringFromPayload(news?.category),
      region: stringFromPayload(news?.region),
      detailTitle: stringFromPayload(news?.detailTitle),
      detailBody: stringFromPayload(news?.detailBody),
      keyPointsText: arrayFromPayload(news?.keyPoints).join("\n"),
    },
    research_update: {
      ...sharedPayloadFromRecord(research),
      topic: stringFromPayload(research?.topic),
      genesText: arrayFromPayload(research?.genes).join("\n"),
      conditionsText: arrayFromPayload(research?.conditions).join("\n"),
      journalName: stringFromPayload(research?.journalName),
      publicationDate: stringFromPayload(research?.publicationDate),
      doi: stringFromPayload(research?.doi),
      plainLanguageTakeaway: stringFromPayload(research?.plainLanguageTakeaway),
      detailBody: stringFromPayload(research?.detailBody),
      keyPointsText: arrayFromPayload(research?.keyPoints).join("\n"),
    },
    upcoming_event: {
      ...sharedPayloadFromRecord(event),
      startsAt: toDateTimeInput(stringFromPayload(event?.startsAt)),
      endsAt: toDateTimeInput(stringFromPayload(event?.endsAt)),
      timezone: stringFromPayload(event?.timezone),
      locationType: stringFromPayload(event?.locationType),
      locationName: stringFromPayload(event?.locationName),
      registrationUrl: stringFromPayload(event?.registrationUrl),
      priceLabel: stringFromPayload(event?.priceLabel),
      audienceLabel: stringFromPayload(event?.audienceLabel),
      agendaText: arrayFromPayload(event?.agenda).join("\n"),
      detailBody: stringFromPayload(event?.detailBody),
    },
    opportunity: {
      ...sharedPayloadFromRecord(opportunity),
      opportunityType: stringFromPayload(opportunity?.opportunityType),
      deadlineAt: toDateTimeInput(stringFromPayload(opportunity?.deadlineAt)),
      locationType: stringFromPayload(opportunity?.locationType),
      locationName: stringFromPayload(opportunity?.locationName),
      eligibility: stringFromPayload(opportunity?.eligibility),
      applicationUrl: stringFromPayload(opportunity?.applicationUrl),
      detailBody: stringFromPayload(opportunity?.detailBody),
      requirementsText: arrayFromPayload(opportunity?.requirements).join("\n"),
    },
  };
}

function payloadForType(state: FeedEntryFormState) {
  if (state.type === "news") {
    return {
      title: state.news.title,
      summary: state.news.summary,
      imageUrl: state.news.imageUrl || null,
      category: state.news.category,
      region: state.news.region,
      detailTitle: state.news.detailTitle,
      detailBody: state.news.detailBody,
      keyPoints: lines(state.news.keyPointsText),
    };
  }

  if (state.type === "research_update") {
    return {
      title: state.research_update.title,
      summary: state.research_update.summary,
      imageUrl: state.research_update.imageUrl || null,
      topic: state.research_update.topic,
      genes: lines(state.research_update.genesText),
      conditions: lines(state.research_update.conditionsText),
      journalName: state.research_update.journalName,
      publicationDate: state.research_update.publicationDate,
      doi: state.research_update.doi,
      plainLanguageTakeaway: state.research_update.plainLanguageTakeaway,
      detailBody: state.research_update.detailBody,
      keyPoints: lines(state.research_update.keyPointsText),
    };
  }

  if (state.type === "upcoming_event") {
    return {
      title: state.upcoming_event.title,
      summary: state.upcoming_event.summary,
      imageUrl: state.upcoming_event.imageUrl || null,
      startsAt: fromDateTimeInput(state.upcoming_event.startsAt),
      endsAt: fromDateTimeInput(state.upcoming_event.endsAt),
      timezone: state.upcoming_event.timezone,
      locationType: state.upcoming_event.locationType,
      locationName: state.upcoming_event.locationName,
      registrationUrl: state.upcoming_event.registrationUrl || null,
      priceLabel: state.upcoming_event.priceLabel,
      audienceLabel: state.upcoming_event.audienceLabel,
      agenda: lines(state.upcoming_event.agendaText),
      detailBody: state.upcoming_event.detailBody,
    };
  }

  return {
    title: state.opportunity.title,
    summary: state.opportunity.summary,
    imageUrl: state.opportunity.imageUrl || null,
    opportunityType: state.opportunity.opportunityType,
    deadlineAt: fromDateTimeInput(state.opportunity.deadlineAt),
    locationType: state.opportunity.locationType,
    locationName: state.opportunity.locationName,
    eligibility: state.opportunity.eligibility,
    applicationUrl: state.opportunity.applicationUrl || null,
    detailBody: state.opportunity.detailBody,
    requirements: lines(state.opportunity.requirementsText),
  };
}

function payloadFromState(state: FeedEntryFormState) {
  return {
    publisherOrganizationId: state.publisherOrganizationId,
    type: state.type,
    status: state.status,
    publishedAt: fromDateTimeInput(state.publishedAt),
    scheduledFor: fromDateTimeInput(state.scheduledFor),
    sourceUrl: state.sourceUrl || null,
    editorialNotes: state.editorialNotes,
    tags: lines(state.tagsText),
    locale: state.locale,
    priority: Number(state.priority) || 0,
    expiresAt: fromDateTimeInput(state.expiresAt),
    [state.type]: payloadForType(state),
  };
}

function currentPayloadState(state: FeedEntryFormState): SharedPayloadState {
  return state[state.type];
}

function FieldShell({
  label,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function DiscoverFeedEntryWorkbench({
  feedItem,
  mode = "edit",
  initialOrganizations,
  initialOrganizationsNextCursor,
}: {
  feedItem?: DiscoverFeedItemRecord;
  mode?: "create" | "edit";
  initialOrganizations: DiscoverOrganizationRecord[];
  initialOrganizationsNextCursor: string | null;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const [state, setState] = useState(() => toFormState(feedItem));
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [organizationsNextCursor, setOrganizationsNextCursor] = useState(
    initialOrganizationsNextCursor,
  );
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const sourceState = useMemo(() => toFormState(feedItem), [feedItem]);
  const selectedOrganization = organizations.find(
    (organization) => organization.id === state.publisherOrganizationId,
  );
  const selectedPayload = currentPayloadState(state);
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);

  function updateState(patch: Partial<FeedEntryFormState>) {
    setState((current) => ({ ...current, ...patch }));
  }

  function updatePayload<T extends DiscoverFeedType>(
    type: T,
    patch: Partial<FeedEntryFormState[T]>,
  ) {
    setState((current) => ({
      ...current,
      [type]: {
        ...current[type],
        ...patch,
      },
    }));
  }

  async function loadMoreOrganizations() {
    if (!organizationsNextCursor) {
      return;
    }

    setPending(true);
    try {
      const params = new URLSearchParams({
        cursor: organizationsNextCursor,
        limit: "50",
      });
      const page = await sdkFetch<DiscoverOrganizationsPage>(
        `/discover/organizations?${params.toString()}`,
      );
      setOrganizations((current) => [...current, ...page.organizations]);
      setOrganizationsNextCursor(page.nextCursor);
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to load more publishers."),
      });
    } finally {
      setPending(false);
    }
  }

  function validate(nextState: FeedEntryFormState) {
    if (!nextState.publisherOrganizationId) {
      return t("Choose a publisher organization.");
    }

    const organization = organizations.find(
      (entry) => entry.id === nextState.publisherOrganizationId,
    );
    if (
      (nextState.status === "published" || nextState.status === "scheduled") &&
      organization?.status !== "active"
    ) {
      return t("Only active organizations can publish or schedule feed entries.");
    }

    if (
      ["in_review", "scheduled", "published"].includes(nextState.status) &&
      (!currentPayloadState(nextState).title.trim() ||
        !currentPayloadState(nextState).summary.trim())
    ) {
      return t("Title and summary are required before review, scheduling, or publishing.");
    }

    if (nextState.status === "scheduled" && !nextState.scheduledFor) {
      return t("Scheduled feed entries need a scheduled publish time.");
    }

    return null;
  }

  async function save(nextStatus?: DiscoverFeedStatus, publishNow = false) {
    const nextState: FeedEntryFormState = {
      ...state,
      status: nextStatus ?? state.status,
      publishedAt: publishNow ? toDateTimeInput(new Date().toISOString()) : state.publishedAt,
    };
    const validationError = validate(nextState);
    if (validationError) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: validationError,
      });
      return;
    }

    setPending(true);
    setState(nextState);
    try {
      if (mode === "create") {
        const response = await sdkFetch<{ feedItem: DiscoverFeedItemRecord }>(
          "/discover/feed-items",
          {
            method: "POST",
            body: JSON.stringify(payloadFromState(nextState)),
          },
        );
        setToast({
          id: Date.now(),
          tone: "success",
          message: t("Feed entry created."),
        });
        router.push(`/discover/feed-entries/${response.feedItem.id}`);
        router.refresh();
        return;
      }

      if (!feedItem) {
        return;
      }

      await sdkFetch<{ feedItem: DiscoverFeedItemRecord }>(
        `/discover/feed-items/${feedItem.id}`,
        {
          method: "PUT",
          body: JSON.stringify(payloadFromState(nextState)),
        },
      );
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Feed entry saved."),
      });
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error ? error.message : t("Unable to save the feed entry."),
      });
    } finally {
      setPending(false);
    }
  }

  function renderSharedPayloadFields(type: DiscoverFeedType) {
    const payload = state[type];

    return (
      <>
        <FieldShell label={t("Title")} htmlFor={`discover-${type}-title`} className="md:col-span-2">
          <Input
            id={`discover-${type}-title`}
            value={payload.title}
            onChange={(event) => updatePayload(type, { title: event.target.value })}
          />
        </FieldShell>
        <FieldShell label={t("Summary")} htmlFor={`discover-${type}-summary`} className="md:col-span-2">
          <Textarea
            id={`discover-${type}-summary`}
            value={payload.summary}
            onChange={(event) => updatePayload(type, { summary: event.target.value })}
            rows={3}
          />
        </FieldShell>
        <FieldShell label={t("Image URL")} htmlFor={`discover-${type}-image`} className="md:col-span-2">
          <Input
            id={`discover-${type}-image`}
            type="url"
            value={payload.imageUrl}
            onChange={(event) => updatePayload(type, { imageUrl: event.target.value })}
            placeholder="https://"
          />
        </FieldShell>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/discover/feed-entries">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("Back to feed entries")}
          </Link>
        </Button>
        {feedItem ? (
          <span className="font-mono text-xs text-muted-foreground">{feedItem.id}</span>
        ) : null}
      </div>

      <section className="glass-panel flex flex-col gap-5 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create" ? t("Create feed entry") : t("Feed entry")}
            </h2>
            <HeaderUnclutterButton />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState(sourceState)}
              disabled={!changed || pending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("Reset")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void save("draft")}
              disabled={pending}
            >
              <Save className="h-3.5 w-3.5" />
              {t("Save draft")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void save("in_review")}
              disabled={pending}
            >
              <Send className="h-3.5 w-3.5" />
              {t("Send to review")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void save("scheduled")}
              disabled={pending}
            >
              <Clock className="h-3.5 w-3.5" />
              {t("Schedule")}
            </Button>
            <Button
              size="sm"
              onClick={() => void save("published", true)}
              disabled={pending}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              {t("Publish now")}
            </Button>
            {mode === "edit" && state.status !== "archived" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void save("archived")}
                disabled={pending}
              >
                <Archive className="h-3.5 w-3.5" />
                {t("Archive")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell label={t("Publisher")} htmlFor="discover-feed-publisher" className="md:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    id="discover-feed-publisher"
                    value={state.publisherOrganizationId}
                    onChange={(event) =>
                      updateState({ publisherOrganizationId: event.target.value })
                    }
                    className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{t("Choose organization")}</option>
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name} ({organization.status})
                      </option>
                    ))}
                  </select>
                  {organizationsNextCursor ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadMoreOrganizations()}
                      disabled={pending}
                    >
                      {t("Load more publishers")}
                    </Button>
                  ) : null}
                </div>
              </FieldShell>
              <FieldShell label={t("Type")} htmlFor="discover-feed-type">
                <select
                  id="discover-feed-type"
                  value={state.type}
                  onChange={(event) => {
                    updateState({ type: event.target.value as DiscoverFeedType });
                    setToast({
                      id: Date.now(),
                      tone: "success",
                      message: t("Changing type will save only the selected payload."),
                    });
                  }}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {DISCOVER_FEED_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </FieldShell>
              <FieldShell label={t("Status")} htmlFor="discover-feed-status">
                <select
                  id="discover-feed-status"
                  value={state.status}
                  onChange={(event) =>
                    updateState({ status: event.target.value as DiscoverFeedStatus })
                  }
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {DISCOVER_FEED_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </FieldShell>
              <FieldShell label={t("Published at")} htmlFor="discover-feed-published">
                <Input
                  id="discover-feed-published"
                  type="datetime-local"
                  value={state.publishedAt}
                  onChange={(event) =>
                    updateState({ publishedAt: event.target.value })
                  }
                />
              </FieldShell>
              <FieldShell label={t("Scheduled for")} htmlFor="discover-feed-scheduled">
                <Input
                  id="discover-feed-scheduled"
                  type="datetime-local"
                  value={state.scheduledFor}
                  onChange={(event) =>
                    updateState({ scheduledFor: event.target.value })
                  }
                />
              </FieldShell>
              <FieldShell label={t("Source URL")} htmlFor="discover-feed-source" className="md:col-span-2">
                <Input
                  id="discover-feed-source"
                  type="url"
                  value={state.sourceUrl}
                  onChange={(event) => updateState({ sourceUrl: event.target.value })}
                  placeholder="https://"
                />
              </FieldShell>
              <FieldShell label={t("Tags")} htmlFor="discover-feed-tags">
                <Textarea
                  id="discover-feed-tags"
                  value={state.tagsText}
                  onChange={(event) => updateState({ tagsText: event.target.value })}
                  rows={3}
                />
              </FieldShell>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldShell label={t("Locale")} htmlFor="discover-feed-locale">
                  <Input
                    id="discover-feed-locale"
                    value={state.locale}
                    onChange={(event) => updateState({ locale: event.target.value })}
                  />
                </FieldShell>
                <FieldShell label={t("Priority")} htmlFor="discover-feed-priority">
                  <Input
                    id="discover-feed-priority"
                    type="number"
                    value={state.priority}
                    onChange={(event) => updateState({ priority: event.target.value })}
                  />
                </FieldShell>
                <FieldShell label={t("Expires at")} htmlFor="discover-feed-expires" className="sm:col-span-2">
                  <Input
                    id="discover-feed-expires"
                    type="datetime-local"
                    value={state.expiresAt}
                    onChange={(event) => updateState({ expiresAt: event.target.value })}
                  />
                </FieldShell>
              </div>
              <FieldShell label={t("Editorial notes")} htmlFor="discover-feed-notes" className="md:col-span-2">
                <Textarea
                  id="discover-feed-notes"
                  value={state.editorialNotes}
                  onChange={(event) =>
                    updateState({ editorialNotes: event.target.value })
                  }
                  rows={3}
                />
              </FieldShell>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {state.type === "news" ? (
                <>
                  {renderSharedPayloadFields("news")}
                  <FieldShell label={t("Category")} htmlFor="discover-news-category">
                    <Input
                      id="discover-news-category"
                      value={state.news.category}
                      onChange={(event) =>
                        updatePayload("news", { category: event.target.value })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Region")} htmlFor="discover-news-region">
                    <Input
                      id="discover-news-region"
                      value={state.news.region}
                      onChange={(event) =>
                        updatePayload("news", { region: event.target.value })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Detail title")} htmlFor="discover-news-detail-title" className="md:col-span-2">
                    <Input
                      id="discover-news-detail-title"
                      value={state.news.detailTitle}
                      onChange={(event) =>
                        updatePayload("news", { detailTitle: event.target.value })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Detail body")} htmlFor="discover-news-detail-body" className="md:col-span-2">
                    <Textarea
                      id="discover-news-detail-body"
                      value={state.news.detailBody}
                      onChange={(event) =>
                        updatePayload("news", { detailBody: event.target.value })
                      }
                      rows={6}
                    />
                  </FieldShell>
                  <FieldShell label={t("Key points")} htmlFor="discover-news-key-points" className="md:col-span-2">
                    <Textarea
                      id="discover-news-key-points"
                      value={state.news.keyPointsText}
                      onChange={(event) =>
                        updatePayload("news", { keyPointsText: event.target.value })
                      }
                      rows={4}
                    />
                  </FieldShell>
                </>
              ) : null}

              {state.type === "research_update" ? (
                <>
                  {renderSharedPayloadFields("research_update")}
                  <FieldShell label={t("Topic")} htmlFor="discover-research-topic">
                    <Input
                      id="discover-research-topic"
                      value={state.research_update.topic}
                      onChange={(event) =>
                        updatePayload("research_update", { topic: event.target.value })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Publication date")} htmlFor="discover-research-publication-date">
                    <Input
                      id="discover-research-publication-date"
                      value={state.research_update.publicationDate}
                      onChange={(event) =>
                        updatePayload("research_update", {
                          publicationDate: event.target.value,
                        })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Genes")} htmlFor="discover-research-genes">
                    <Textarea
                      id="discover-research-genes"
                      value={state.research_update.genesText}
                      onChange={(event) =>
                        updatePayload("research_update", { genesText: event.target.value })
                      }
                      rows={3}
                    />
                  </FieldShell>
                  <FieldShell label={t("Conditions")} htmlFor="discover-research-conditions">
                    <Textarea
                      id="discover-research-conditions"
                      value={state.research_update.conditionsText}
                      onChange={(event) =>
                        updatePayload("research_update", {
                          conditionsText: event.target.value,
                        })
                      }
                      rows={3}
                    />
                  </FieldShell>
                  <FieldShell label={t("Journal name")} htmlFor="discover-research-journal">
                    <Input
                      id="discover-research-journal"
                      value={state.research_update.journalName}
                      onChange={(event) =>
                        updatePayload("research_update", {
                          journalName: event.target.value,
                        })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("DOI")} htmlFor="discover-research-doi">
                    <Input
                      id="discover-research-doi"
                      value={state.research_update.doi}
                      onChange={(event) =>
                        updatePayload("research_update", { doi: event.target.value })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Plain-language takeaway")} htmlFor="discover-research-takeaway" className="md:col-span-2">
                    <Textarea
                      id="discover-research-takeaway"
                      value={state.research_update.plainLanguageTakeaway}
                      onChange={(event) =>
                        updatePayload("research_update", {
                          plainLanguageTakeaway: event.target.value,
                        })
                      }
                      rows={3}
                    />
                  </FieldShell>
                  <FieldShell label={t("Detail body")} htmlFor="discover-research-detail-body" className="md:col-span-2">
                    <Textarea
                      id="discover-research-detail-body"
                      value={state.research_update.detailBody}
                      onChange={(event) =>
                        updatePayload("research_update", {
                          detailBody: event.target.value,
                        })
                      }
                      rows={6}
                    />
                  </FieldShell>
                  <FieldShell label={t("Key points")} htmlFor="discover-research-key-points" className="md:col-span-2">
                    <Textarea
                      id="discover-research-key-points"
                      value={state.research_update.keyPointsText}
                      onChange={(event) =>
                        updatePayload("research_update", {
                          keyPointsText: event.target.value,
                        })
                      }
                      rows={4}
                    />
                  </FieldShell>
                </>
              ) : null}

              {state.type === "upcoming_event" ? (
                <>
                  {renderSharedPayloadFields("upcoming_event")}
                  <FieldShell label={t("Starts at")} htmlFor="discover-event-starts">
                    <Input
                      id="discover-event-starts"
                      type="datetime-local"
                      value={state.upcoming_event.startsAt}
                      onChange={(event) =>
                        updatePayload("upcoming_event", { startsAt: event.target.value })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Ends at")} htmlFor="discover-event-ends">
                    <Input
                      id="discover-event-ends"
                      type="datetime-local"
                      value={state.upcoming_event.endsAt}
                      onChange={(event) =>
                        updatePayload("upcoming_event", { endsAt: event.target.value })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Timezone")} htmlFor="discover-event-timezone">
                    <Input
                      id="discover-event-timezone"
                      value={state.upcoming_event.timezone}
                      onChange={(event) =>
                        updatePayload("upcoming_event", { timezone: event.target.value })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Location type")} htmlFor="discover-event-location-type">
                    <select
                      id="discover-event-location-type"
                      value={state.upcoming_event.locationType}
                      onChange={(event) =>
                        updatePayload("upcoming_event", {
                          locationType: event.target.value,
                        })
                      }
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">{t("Unspecified")}</option>
                      <option value="virtual">{t("Virtual")}</option>
                      <option value="in_person">{t("In person")}</option>
                      <option value="hybrid">{t("Hybrid")}</option>
                    </select>
                  </FieldShell>
                  <FieldShell label={t("Location name")} htmlFor="discover-event-location-name">
                    <Input
                      id="discover-event-location-name"
                      value={state.upcoming_event.locationName}
                      onChange={(event) =>
                        updatePayload("upcoming_event", {
                          locationName: event.target.value,
                        })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Registration URL")} htmlFor="discover-event-registration">
                    <Input
                      id="discover-event-registration"
                      type="url"
                      value={state.upcoming_event.registrationUrl}
                      onChange={(event) =>
                        updatePayload("upcoming_event", {
                          registrationUrl: event.target.value,
                        })
                      }
                      placeholder="https://"
                    />
                  </FieldShell>
                  <FieldShell label={t("Price label")} htmlFor="discover-event-price">
                    <Input
                      id="discover-event-price"
                      value={state.upcoming_event.priceLabel}
                      onChange={(event) =>
                        updatePayload("upcoming_event", {
                          priceLabel: event.target.value,
                        })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Audience label")} htmlFor="discover-event-audience">
                    <Input
                      id="discover-event-audience"
                      value={state.upcoming_event.audienceLabel}
                      onChange={(event) =>
                        updatePayload("upcoming_event", {
                          audienceLabel: event.target.value,
                        })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Agenda")} htmlFor="discover-event-agenda" className="md:col-span-2">
                    <Textarea
                      id="discover-event-agenda"
                      value={state.upcoming_event.agendaText}
                      onChange={(event) =>
                        updatePayload("upcoming_event", {
                          agendaText: event.target.value,
                        })
                      }
                      rows={4}
                    />
                  </FieldShell>
                  <FieldShell label={t("Detail body")} htmlFor="discover-event-detail" className="md:col-span-2">
                    <Textarea
                      id="discover-event-detail"
                      value={state.upcoming_event.detailBody}
                      onChange={(event) =>
                        updatePayload("upcoming_event", {
                          detailBody: event.target.value,
                        })
                      }
                      rows={6}
                    />
                  </FieldShell>
                </>
              ) : null}

              {state.type === "opportunity" ? (
                <>
                  {renderSharedPayloadFields("opportunity")}
                  <FieldShell label={t("Opportunity type")} htmlFor="discover-opportunity-type">
                    <select
                      id="discover-opportunity-type"
                      value={state.opportunity.opportunityType}
                      onChange={(event) =>
                        updatePayload("opportunity", {
                          opportunityType: event.target.value,
                        })
                      }
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">{t("Unspecified")}</option>
                      {[
                        "fellowship",
                        "grant",
                        "scholarship",
                        "clinical_study",
                        "research_program",
                        "job",
                        "training",
                        "volunteer",
                        "dataset",
                        "challenge",
                        "other",
                      ].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </FieldShell>
                  <FieldShell label={t("Deadline")} htmlFor="discover-opportunity-deadline">
                    <Input
                      id="discover-opportunity-deadline"
                      type="datetime-local"
                      value={state.opportunity.deadlineAt}
                      onChange={(event) =>
                        updatePayload("opportunity", {
                          deadlineAt: event.target.value,
                        })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Location type")} htmlFor="discover-opportunity-location-type">
                    <Input
                      id="discover-opportunity-location-type"
                      value={state.opportunity.locationType}
                      onChange={(event) =>
                        updatePayload("opportunity", {
                          locationType: event.target.value,
                        })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Location name")} htmlFor="discover-opportunity-location-name">
                    <Input
                      id="discover-opportunity-location-name"
                      value={state.opportunity.locationName}
                      onChange={(event) =>
                        updatePayload("opportunity", {
                          locationName: event.target.value,
                        })
                      }
                    />
                  </FieldShell>
                  <FieldShell label={t("Eligibility")} htmlFor="discover-opportunity-eligibility" className="md:col-span-2">
                    <Textarea
                      id="discover-opportunity-eligibility"
                      value={state.opportunity.eligibility}
                      onChange={(event) =>
                        updatePayload("opportunity", {
                          eligibility: event.target.value,
                        })
                      }
                      rows={3}
                    />
                  </FieldShell>
                  <FieldShell label={t("Application URL")} htmlFor="discover-opportunity-application" className="md:col-span-2">
                    <Input
                      id="discover-opportunity-application"
                      type="url"
                      value={state.opportunity.applicationUrl}
                      onChange={(event) =>
                        updatePayload("opportunity", {
                          applicationUrl: event.target.value,
                        })
                      }
                      placeholder="https://"
                    />
                  </FieldShell>
                  <FieldShell label={t("Detail body")} htmlFor="discover-opportunity-detail" className="md:col-span-2">
                    <Textarea
                      id="discover-opportunity-detail"
                      value={state.opportunity.detailBody}
                      onChange={(event) =>
                        updatePayload("opportunity", {
                          detailBody: event.target.value,
                        })
                      }
                      rows={6}
                    />
                  </FieldShell>
                  <FieldShell label={t("Requirements")} htmlFor="discover-opportunity-requirements" className="md:col-span-2">
                    <Textarea
                      id="discover-opportunity-requirements"
                      value={state.opportunity.requirementsText}
                      onChange={(event) =>
                        updatePayload("opportunity", {
                          requirementsText: event.target.value,
                        })
                      }
                      rows={4}
                    />
                  </FieldShell>
                </>
              ) : null}
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-md border border-border bg-background/70 p-4">
              <div className="flex items-center gap-2">
                {selectedOrganization?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedOrganization.imageUrl}
                    alt=""
                    className="h-9 w-9 rounded-md border border-border object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {selectedOrganization?.name ?? t("Publisher")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedOrganization?.status ?? t("No publisher selected")}
                  </div>
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-md border border-border bg-muted/30">
                {selectedPayload.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedPayload.imageUrl}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    {t("No image URL")}
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="brand">{t(discoverTypeLabel(state.type))}</Badge>
                <Badge variant="outline">{t(discoverStatusLabel(state.status))}</Badge>
              </div>
              <h3 className="mt-3 font-heading text-lg font-semibold text-foreground">
                {selectedPayload.title || t("Untitled feed entry")}
              </h3>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                {selectedPayload.summary || t("No summary")}
              </p>
            </div>

            {feedItem ? (
              <div className="rounded-md border border-border px-3 py-3 text-xs text-muted-foreground">
                <div>{feedItem.id}</div>
                <div>{getDiscoverPayload(feedItem)?.title ? t("Original payload loaded") : t("Draft payload")}</div>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}
