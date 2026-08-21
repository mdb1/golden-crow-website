"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Archive,
  CheckCircle2,
  Plus,
  RefreshCcw,
  Search,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import { useAppLanguage } from "@/components/app-language-provider";
import { compactList, formatDateTime } from "@/lib/moderation-utils";
import {
  DISCOVER_ORGANIZATION_STATUS_OPTIONS,
  discoverOrganizationStatusLabel,
  type DiscoverIndividualRecord,
  type DiscoverIndividualsPage,
  type DiscoverIndividualStatus,
  type DiscoverOrganizationRecord,
  type DiscoverOrganizationStatus,
  type DiscoverOrganizationsPage,
} from "@/lib/discover";
import {
  discoverIndividualCategoryProvider,
  discoverOrganizationCategoryProvider,
} from "@/lib/discover-publisher-categories";

type PublisherKind = "organization" | "individual";
type PublisherRecord = DiscoverOrganizationRecord | DiscoverIndividualRecord;
type PublisherStatus = DiscoverOrganizationStatus | DiscoverIndividualStatus;
type PublisherPage =
  | DiscoverOrganizationsPage
  | DiscoverIndividualsPage;

function statusBadgeVariant(status: PublisherStatus) {
  if (status === "active") {
    return "success" as const;
  }

  if (status === "archived") {
    return "secondary" as const;
  }

  return "outline" as const;
}

function publisherPayload(
  publisher: PublisherRecord,
  status: PublisherStatus,
  publisherKind: PublisherKind,
) {
  const organization = publisher as DiscoverOrganizationRecord;
  const individual = publisher as DiscoverIndividualRecord;

  return {
    name: publisher.name,
    imageUrl: publisher.imageUrl,
    status,
    websiteUrl: publisher.websiteUrl,
    description: publisher.description,
    description_en: publisher.description_en,
    social: publisher.social,
    countryCode: publisher.countryCode,
    organizationType:
      publisherKind === "organization"
        ? organization.organizationType
        : undefined,
    individualType:
      publisherKind === "individual"
        ? individual.individualType
        : undefined,
    color_hex: publisher.color_hex,
    verified: publisher.verified,
    contactEmail: publisher.contactEmail,
    internalNotes: publisher.internalNotes,
  };
}

function DiscoverPublisherBrowser({
  publisherKind,
  initialPublishers,
  initialNextCursor,
  canCreatePublishers = true,
  canManagePublisherStatus = true,
}: {
  publisherKind: PublisherKind;
  initialPublishers: PublisherRecord[];
  initialNextCursor: string | null;
  canCreatePublishers?: boolean;
  canManagePublisherStatus?: boolean;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [publishers, setPublishers] = useState(initialPublishers);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | PublisherStatus>("all");
  const [publisherType, setPublisherType] = useState("all");
  const [countryCode, setCountryCode] = useState("");
  const [verified, setVerified] = useState<"all" | "verified" | "unverified">("all");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const isIndividual = publisherKind === "individual";
  const endpointBase = isIndividual
    ? "/discover/individuals"
    : "/discover/organizations";
  const listTitle = isIndividual ? "Individual Publishers" : "Organizations";
  const createHref = isIndividual
    ? "/discover/individuals/new"
    : "/discover/organizations/new";
  const detailHref = (id: string) =>
    isIndividual ? `/discover/individuals/${id}` : `/discover/organizations/${id}`;
  const categoryProvider = isIndividual
    ? discoverIndividualCategoryProvider
    : discoverOrganizationCategoryProvider;

  function publishersFromPage(page: PublisherPage): PublisherRecord[] {
    return isIndividual
      ? (page as DiscoverIndividualsPage).individuals
      : (page as DiscoverOrganizationsPage).organizations;
  }

  const filteredPublishers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedCountry = countryCode.trim().toLowerCase();

    return publishers.filter((publisher) => {
      const organization = publisher as DiscoverOrganizationRecord;
      const individual = publisher as DiscoverIndividualRecord;
      const currentType = isIndividual
        ? individual.individualType
        : organization.organizationType;
      const currentTypeLabels = categoryProvider.labelsForCsv(currentType);
      const translatedTypeLabels = currentTypeLabels.map((label) =>
        appText(language, label),
      );
      const searchable = [
        publisher.id,
        publisher.name,
        publisher.slug,
        publisher.websiteUrl,
        publisher.description,
        publisher.description_en,
        publisher.countryCode,
        currentType,
        ...currentTypeLabels,
        ...translatedTypeLabels,
        publisher.color_hex,
        publisher.contactEmail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (status === "all" || publisher.status === status) &&
        (publisherType === "all" ||
          categoryProvider.hasKey(currentType, publisherType)) &&
        (!normalizedCountry ||
          (publisher.countryCode ?? "").toLowerCase().includes(normalizedCountry)) &&
        (verified === "all" ||
          (verified === "verified" ? publisher.verified : !publisher.verified))
      );
    });
  }, [
    categoryProvider,
    countryCode,
    isIndividual,
    language,
    publisherType,
    publishers,
    query,
    status,
    verified,
  ]);

  async function loadMore() {
    if (!nextCursor) {
      return;
    }

    setPending(true);
    try {
      const params = new URLSearchParams({ cursor: nextCursor });
      const page = await sdkFetch<PublisherPage>(
        `${endpointBase}?${params.toString()}`,
      );
      const pagePublishers = publishersFromPage(page);
      setPublishers((current) => [...current, ...pagePublishers]);
      setNextCursor(page.nextCursor);
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: isIndividual
          ? t("Unable to load more individual publishers.")
          : t("Unable to load more organizations."),
      });
    } finally {
      setPending(false);
    }
  }

  async function refresh() {
    setPending(true);
    try {
      const page = await sdkFetch<PublisherPage>(endpointBase);
      setPublishers(publishersFromPage(page));
      setNextCursor(page.nextCursor);
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: isIndividual
          ? t("Unable to refresh individual publishers.")
          : t("Unable to refresh organizations."),
      });
    } finally {
      setPending(false);
    }
  }

  async function setPublisherStatus(
    publisher: PublisherRecord,
    nextStatus: PublisherStatus,
  ) {
    setPending(true);
    try {
      const response = await sdkFetch<
        { organization: DiscoverOrganizationRecord } |
        { individual: DiscoverIndividualRecord }
      >(
        `${endpointBase}/${publisher.id}`,
        {
          method: "PUT",
          body: JSON.stringify(publisherPayload(publisher, nextStatus, publisherKind)),
        },
      );
      const saved = isIndividual
        ? (response as { individual: DiscoverIndividualRecord }).individual
        : (response as { organization: DiscoverOrganizationRecord }).organization;
      setPublishers((current) =>
        current.map((entry) =>
          entry.id === publisher.id ? saved : entry,
        ),
      );
      setToast({
        id: Date.now(),
        tone: "success",
        message:
          nextStatus === "archived"
            ? isIndividual
              ? t("Individual publisher archived.")
              : t("Organization archived.")
            : isIndividual
              ? t("Individual publisher reactivated.")
              : t("Organization reactivated."),
      });
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: isIndividual
          ? t("Unable to update the individual publisher status.")
          : t("Unable to update the organization status."),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="glass-panel flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {t(listTitle)}
            </h2>
            <HeaderUnclutterButton />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={pending}>
              <RefreshCcw className="h-3.5 w-3.5" />
              {pending ? t("Working...") : t("Refresh")}
            </Button>
            {canCreatePublishers ? (
              <Button size="sm" asChild>
                <Link href={createHref}>
                  <Plus className="h-3.5 w-3.5" />
                  {isIndividual ? t("New individual publisher") : t("New organization")}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_11rem_13rem_9rem_9rem]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                isIndividual
                  ? t("Search individual publisher name, URL, email, or slug")
                  : t("Search organization name, URL, email, or slug")
              }
              className="pl-9"
            />
          </label>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "all" | PublisherStatus)
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{t("All statuses")}</option>
            {DISCOVER_ORGANIZATION_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <select
            value={publisherType}
            onChange={(event) => setPublisherType(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{t("All categories")}</option>
            {categoryProvider.options.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <Input
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value)}
            placeholder={t("Country")}
          />
          <select
            value={verified}
            onChange={(event) =>
              setVerified(event.target.value as "all" | "verified" | "unverified")
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{t("All")}</option>
            <option value="verified">{t("Verified")}</option>
            <option value="unverified">{t("Unverified")}</option>
          </select>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_110px_170px_auto] gap-4 border-b border-border/80 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:grid">
          <span>{isIndividual ? t("Individual publisher") : t("Organization")}</span>
          <span>{t("Categories")}</span>
          <span>{t("Status")}</span>
          <span>{t("Updated")}</span>
          <span className="text-right">{t("Action")}</span>
        </div>

        {filteredPublishers.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {isIndividual
              ? t("No Discover individual publishers match the loaded rows.")
              : t("No Discover organizations match the loaded rows.")}
          </div>
        ) : (
          filteredPublishers.map((publisher) => {
            const organization = publisher as DiscoverOrganizationRecord;
            const individual = publisher as DiscoverIndividualRecord;
            const categoryLabels = categoryProvider.labelsForCsv(
              isIndividual
                ? individual.individualType
                : organization.organizationType,
            );

            return (
            <div
              key={publisher.id}
              className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_110px_170px_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {publisher.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={publisher.imageUrl}
                      alt=""
                      className="h-8 w-8 rounded-md border border-border object-cover"
                    />
                  ) : null}
                  <h3 className="font-medium text-foreground">{publisher.name}</h3>
                  {publisher.color_hex ? (
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-border"
                      style={{ backgroundColor: publisher.color_hex }}
                      title={publisher.color_hex}
                    />
                  ) : null}
                  {publisher.verified ? (
                    <Badge variant="success">{t("Verified")}</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {compactList([
                    publisher.id,
                    publisher.slug,
                    publisher.countryCode,
                    publisher.websiteUrl,
                    publisher.contactEmail,
                  ]) || t("Discover publisher")}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {categoryLabels.length ? (
                  categoryLabels.map((label) => (
                    <Badge key={label} variant="secondary" className="rounded-md">
                      {t(label)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {t("Unspecified")}
                  </span>
                )}
              </div>

              <div>
                <Badge variant={statusBadgeVariant(publisher.status)}>
                  {t(discoverOrganizationStatusLabel(publisher.status))}
                </Badge>
              </div>

              <div className="text-sm text-muted-foreground">
                {formatDateTime(publisher.updatedAt) ?? t("No timestamp")}
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={detailHref(publisher.id)}>
                    {t("Open")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                {canManagePublisherStatus ? (
                  publisher.status === "archived" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void setPublisherStatus(publisher, "active")}
                      disabled={pending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t("Reactivate")}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void setPublisherStatus(publisher, "archived")}
                      disabled={pending}
                    >
                      <Archive className="h-3.5 w-3.5" />
                      {t("Archive")}
                    </Button>
                  )
                ) : null}
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

export function DiscoverOrganizationBrowser({
  initialOrganizations,
  initialNextCursor,
  canCreateOrganizations = true,
  canManageOrganizationStatus = true,
}: {
  initialOrganizations: DiscoverOrganizationRecord[];
  initialNextCursor: string | null;
  canCreateOrganizations?: boolean;
  canManageOrganizationStatus?: boolean;
}) {
  return (
    <DiscoverPublisherBrowser
      publisherKind="organization"
      initialPublishers={initialOrganizations}
      initialNextCursor={initialNextCursor}
      canCreatePublishers={canCreateOrganizations}
      canManagePublisherStatus={canManageOrganizationStatus}
    />
  );
}

export function DiscoverIndividualBrowser({
  initialIndividuals,
  initialNextCursor,
  canCreateIndividuals = true,
  canManageIndividualStatus = true,
}: {
  initialIndividuals: DiscoverIndividualRecord[];
  initialNextCursor: string | null;
  canCreateIndividuals?: boolean;
  canManageIndividualStatus?: boolean;
}) {
  return (
    <DiscoverPublisherBrowser
      publisherKind="individual"
      initialPublishers={initialIndividuals}
      initialNextCursor={initialNextCursor}
      canCreatePublishers={canCreateIndividuals}
      canManagePublisherStatus={canManageIndividualStatus}
    />
  );
}
