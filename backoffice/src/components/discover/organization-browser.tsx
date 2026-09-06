"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { appText, type AppLanguage } from "@/lib/language";
import { useAppLanguage } from "@/components/app-language-provider";
import { compactList, formatDateTime } from "@/lib/moderation-utils";
import { cn } from "@/lib/utils";
import {
  DISCOVER_GENETIC_REPORT_CATEGORY_OPTIONS,
  DISCOVER_ORGANIZATION_STATUS_OPTIONS,
  discoverGeneticReportCategoryHasKey,
  discoverGeneticReportCategoryLabels,
  discoverOrganizationStatusLabel,
  type DiscoverGeneticReportCategory,
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
import {
  formatDiscoverOrganizationCountry,
  getDiscoverOrganizationCountryGroups,
  parseDiscoverOrganizationCountryCodes,
} from "@/lib/discover-organization-fields";

type PublisherKind = "organization" | "individual";
type PublisherRecord = DiscoverOrganizationRecord | DiscoverIndividualRecord;
type PublisherStatus = DiscoverOrganizationStatus | DiscoverIndividualStatus;
type PublisherPage =
  | DiscoverOrganizationsPage
  | DiscoverIndividualsPage;
type BadgeGroup = {
  visibleLabels: string[];
  hiddenCount: number;
  title: string | undefined;
};
type CountryPill = {
  code: string;
  label: string;
};

const COUNTRY_PILL_GAP_PX = 6;

function countryPillsFor(countryCode: string | undefined, language: AppLanguage) {
  return parseDiscoverOrganizationCountryCodes(countryCode ?? "").map((code) => ({
    code,
    label: formatDiscoverOrganizationCountry(code, language) ?? code,
  }));
}

function countryPillLineWidth({
  visibleCount,
  pillWidths,
  overflowWidth,
  gapWidth,
}: {
  visibleCount: number;
  pillWidths: number[];
  overflowWidth: number;
  gapWidth: number;
}) {
  const totalCount = pillWidths.length;
  const hasOverflow = visibleCount < totalCount;
  const itemCount = visibleCount + (hasOverflow ? 1 : 0);
  const pillWidth = pillWidths
    .slice(0, visibleCount)
    .reduce((sum, width) => sum + width, 0);

  return (
    pillWidth +
    (hasOverflow ? overflowWidth : 0) +
    Math.max(itemCount - 1, 0) * gapWidth
  );
}

export function visibleCountryPillCountForWidth({
  containerWidth,
  pillWidths,
  overflowWidth,
  gapWidth = COUNTRY_PILL_GAP_PX,
}: {
  containerWidth: number;
  pillWidths: number[];
  overflowWidth: number;
  gapWidth?: number;
}) {
  if (!pillWidths.length) {
    return 0;
  }

  if (containerWidth <= 0) {
    return 1;
  }

  for (let visibleCount = pillWidths.length; visibleCount > 0; visibleCount -= 1) {
    if (
      countryPillLineWidth({
        visibleCount,
        pillWidths,
        overflowWidth,
        gapWidth,
      }) <= containerWidth
    ) {
      return visibleCount;
    }
  }

  return 1;
}

function badgeGroup(labels: string[], limit = 3): BadgeGroup {
  return {
    visibleLabels: labels.slice(0, limit),
    hiddenCount: Math.max(labels.length - limit, 0),
    title: labels.length > limit ? labels.join(", ") : undefined,
  };
}

function measuredWidth(element: HTMLElement | null) {
  if (!element) {
    return 0;
  }

  return element.getBoundingClientRect().width || element.offsetWidth || 0;
}

function CountryPillRow({
  countries,
  emptyLabel,
  overflowLabel,
  testId,
}: {
  countries: CountryPill[];
  emptyLabel: string;
  overflowLabel: string;
  testId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(() =>
    countries.length > 0 ? 1 : 0,
  );
  const countryTitle = countries.map((country) => country.label).join(", ");
  const hiddenCount = Math.max(countries.length - visibleCount, 0);
  const visibleCountries = countries.slice(0, Math.max(visibleCount, 1));

  const updateVisibleCount = useCallback(() => {
    const containerWidth = measuredWidth(containerRef.current);
    const measureNode = measureRef.current;
    const pillWidths = Array.from(
      measureNode?.querySelectorAll<HTMLElement>("[data-country-pill-measure]") ??
        [],
    ).map((node) => measuredWidth(node));
    const overflowWidth = measuredWidth(
      measureNode?.querySelector<HTMLElement>("[data-country-overflow-measure]") ??
        null,
    );
    const nextVisibleCount = visibleCountryPillCountForWidth({
      containerWidth,
      pillWidths,
      overflowWidth,
    });

    setVisibleCount(nextVisibleCount);
  }, []);

  useEffect(() => {
    setVisibleCount(countries.length > 0 ? 1 : 0);
  }, [countries]);

  useEffect(() => {
    updateVisibleCount();

    const observedNode = containerRef.current;
    if (!observedNode || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(observedNode);

    return () => observer.disconnect();
  }, [countries, updateVisibleCount]);

  if (!countries.length) {
    return (
      <div
        className="flex h-7 max-w-full items-center overflow-hidden"
        data-testid={testId}
      >
        <span className="inline-flex h-6 max-w-full items-center rounded-full border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground">
          {emptyLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="relative max-w-full" title={countryTitle}>
      <div
        ref={containerRef}
        className="flex h-7 max-w-full items-center gap-1.5 overflow-hidden whitespace-nowrap"
        data-testid={testId}
      >
        {visibleCountries.map((country, index) => (
          <span
            key={country.code}
            className={cn(
              "inline-flex h-6 min-w-0 shrink-0 items-center rounded-full border border-border/80 bg-background px-2.5 text-xs font-medium text-muted-foreground shadow-[0_1px_0_rgba(15,23,42,0.04)]",
              index === 0 && hiddenCount > 0 ? "max-w-[calc(100%-2rem)]" : "max-w-44",
            )}
          >
            <span className="truncate">{country.label}</span>
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700"
            aria-label={`+${hiddenCount} ${overflowLabel}`}
            title={`+${hiddenCount} ${overflowLabel}`}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      <div
        ref={measureRef}
        className="pointer-events-none invisible absolute left-0 top-0 flex h-7 max-w-none items-center gap-1.5 whitespace-nowrap"
        aria-hidden="true"
      >
        {countries.map((country) => (
          <span
            key={country.code}
            className="inline-flex h-6 items-center rounded-full border border-border/80 bg-background px-2.5 text-xs font-medium"
            data-country-pill-measure
          >
            {country.label}
          </span>
        ))}
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border"
          data-country-overflow-measure
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function statusBadgeVariant(status: PublisherStatus) {
  if (status === "active") {
    return "success" as const;
  }

  if (status === "pending_approval") {
    return "warning" as const;
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
    descriptionEn: publisher.descriptionEn,
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
    colorHex: publisher.colorHex,
    verified: publisher.verified,
    isGeneticReportProvider:
      publisherKind === "organization"
        ? organization.isGeneticReportProvider ?? false
        : undefined,
    geneticReportCategory:
      publisherKind === "organization"
        ? organization.geneticReportCategory ?? null
        : undefined,
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
  routeBase,
}: {
  publisherKind: PublisherKind;
  initialPublishers: PublisherRecord[];
  initialNextCursor: string | null;
  canCreatePublishers?: boolean;
  canManagePublisherStatus?: boolean;
  routeBase?: string;
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
  const [geneticReportProvider, setGeneticReportProvider] =
    useState<"all" | "provider" | "not_provider">("all");
  const [geneticReportCategory, setGeneticReportCategory] =
    useState<"all" | "none" | DiscoverGeneticReportCategory>("all");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const isIndividual = publisherKind === "individual";
  const endpointBase = isIndividual
    ? "/discover/individuals"
    : "/discover/organizations";
  const publisherRouteBase =
    routeBase ??
    (isIndividual ? "/discover/individuals" : "/discover/organizations");
  const listTitle = isIndividual ? "Individual Publishers" : "Organizations";
  const createHref = `${publisherRouteBase}/new`;
  const detailHref = (id: string) => `${publisherRouteBase}/${id}`;
  const categoryProvider = isIndividual
    ? discoverIndividualCategoryProvider
    : discoverOrganizationCategoryProvider;
  const countryGroups = useMemo(
    () => getDiscoverOrganizationCountryGroups(language),
    [language],
  );
  const listGridClass = isIndividual
    ? "2xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.85fr)_auto]"
    : "2xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)_minmax(0,1.15fr)_auto]";

  function publishersFromPage(page: PublisherPage): PublisherRecord[] {
    return isIndividual
      ? (page as DiscoverIndividualsPage).individuals
      : (page as DiscoverOrganizationsPage).organizations;
  }

  const filteredPublishers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const selectedCountryCode = countryCode.trim().toUpperCase();

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
      const geneticReportCategoryLabels = !isIndividual
        ? discoverGeneticReportCategoryLabels(
            organization.geneticReportCategory,
          )
        : [];
      const translatedGeneticReportCategoryLabels =
        geneticReportCategoryLabels.map((label) => appText(language, label));
      const searchable = [
        publisher.id,
        publisher.name,
        publisher.slug,
        publisher.websiteUrl,
        publisher.description,
        publisher.descriptionEn,
        publisher.countryCode,
        currentType,
        ...currentTypeLabels,
        ...translatedTypeLabels,
        publisher.colorHex,
        publisher.contactEmail,
        !isIndividual && organization.isGeneticReportProvider
          ? "genetic report provider yes"
          : !isIndividual
            ? "not genetic report provider no"
            : "",
        !isIndividual
          ? organization.geneticReportCategory
          : "",
        ...geneticReportCategoryLabels,
        ...translatedGeneticReportCategoryLabels,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const providerMatches =
        isIndividual ||
        geneticReportProvider === "all" ||
        (geneticReportProvider === "provider"
          ? organization.isGeneticReportProvider
          : !organization.isGeneticReportProvider);
      const categoryMatches =
        isIndividual ||
        geneticReportCategory === "all" ||
        (geneticReportCategory === "none"
          ? !geneticReportCategoryLabels.length
          : discoverGeneticReportCategoryHasKey(
              organization.geneticReportCategory,
              geneticReportCategory,
            ));

      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (status === "all" || publisher.status === status) &&
        (publisherType === "all" ||
          categoryProvider.hasKey(currentType, publisherType)) &&
        (!selectedCountryCode ||
          parseDiscoverOrganizationCountryCodes(publisher.countryCode ?? "")
            .includes(selectedCountryCode)) &&
        (verified === "all" ||
          (verified === "verified" ? publisher.verified : !publisher.verified)) &&
        providerMatches &&
        categoryMatches
      );
    });
  }, [
    categoryProvider,
    countryCode,
    geneticReportCategory,
    geneticReportProvider,
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

        <div className="grid gap-3">
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

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "all" | PublisherStatus)
              }
              className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
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
              className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">{t("All categories")}</option>
              {categoryProvider.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
            <select
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              aria-label={t("Country")}
              className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t("All countries")}</option>
              {countryGroups.map((group) => (
                <optgroup key={group.key} label={t(group.label)}>
                  {group.options.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={verified}
              onChange={(event) =>
                setVerified(event.target.value as "all" | "verified" | "unverified")
              }
              className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">{t("All")}</option>
              <option value="verified">{t("Verified")}</option>
              <option value="unverified">{t("Unverified")}</option>
            </select>
          </div>

          {!isIndividual ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={geneticReportProvider}
                onChange={(event) =>
                  setGeneticReportProvider(
                    event.target.value as "all" | "provider" | "not_provider",
                  )
                }
                className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">{t("All report providers")}</option>
                <option value="provider">{t("Report providers only")}</option>
                <option value="not_provider">{t("Non-providers")}</option>
              </select>
              <select
                value={geneticReportCategory}
                onChange={(event) =>
                  setGeneticReportCategory(
                    event.target.value as
                      | "all"
                      | "none"
                      | DiscoverGeneticReportCategory,
                  )
                }
                className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">{t("All report categories")}</option>
                <option value="none">{t("No genetic report category")}</option>
                {DISCOVER_GENETIC_REPORT_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div
          className={cn(
            "hidden gap-4 border-b border-border/80 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground 2xl:grid",
            listGridClass,
          )}
        >
          <span>{isIndividual ? t("Individual publisher") : t("Organization")}</span>
          <span>{t("Categories")}</span>
          <span>{t("Status")}</span>
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
            const categoryBadgeGroup = badgeGroup(categoryLabels);
            const geneticReportLabels = !isIndividual
              ? discoverGeneticReportCategoryLabels(
                  organization.geneticReportCategory,
                )
              : [];
            const geneticReportBadgeGroup = badgeGroup(geneticReportLabels);
            const countryPills = countryPillsFor(
              publisher.countryCode,
              language,
            );
            const publisherImageSource =
              publisher.imageUrl || publisher.imageUploadDataUrl;
            const fallbackInitial =
              publisher.name.trim().slice(0, 1).toUpperCase() || "P";

            return (
              <div
                key={publisher.id}
                className={cn(
                  "grid gap-4 border-b border-border/70 px-4 py-4 last:border-b-0 lg:px-5 lg:py-5 2xl:items-start",
                  listGridClass,
                )}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-start gap-3">
                    {publisherImageSource ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={publisherImageSource}
                        alt=""
                        className="h-11 w-11 flex-none rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-border bg-muted text-sm font-semibold text-muted-foreground"
                        aria-hidden="true"
                      >
                        {fallbackInitial}
                      </span>
                    )}
                    <div className="min-w-0 space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="break-words font-medium leading-snug text-foreground">
                          {publisher.name}
                        </h3>
                        {publisher.colorHex ? (
                          <span
                            className="h-3.5 w-3.5 flex-none rounded-full border border-border"
                            style={{ backgroundColor: publisher.colorHex }}
                            title={publisher.colorHex}
                          />
                        ) : null}
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                        {compactList([
                          publisher.id,
                          publisher.slug,
                          publisher.websiteUrl,
                          publisher.contactEmail,
                        ]) || t("Discover publisher")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 space-y-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground 2xl:hidden">
                    {t("Categories")}
                  </span>
                  <div
                    className="flex flex-wrap gap-1.5"
                    title={categoryBadgeGroup.title}
                  >
                    {categoryLabels.length ? (
                      <>
                        {categoryBadgeGroup.visibleLabels.map((label) => (
                          <Badge
                            key={label}
                            variant="secondary"
                            className="rounded-md"
                          >
                            {t(label)}
                          </Badge>
                        ))}
                        {categoryBadgeGroup.hiddenCount ? (
                          <Badge variant="outline" className="rounded-md">
                            +{categoryBadgeGroup.hiddenCount}
                          </Badge>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {t("Unspecified")}
                      </span>
                    )}
                  </div>
                  <CountryPillRow
                    countries={countryPills}
                    emptyLabel={t("No country")}
                    overflowLabel={t("Countries")}
                    testId={`publisher-country-row-${publisher.id}`}
                  />
                </div>

                <div className="min-w-0 space-y-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground 2xl:hidden">
                    {t("Status")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={statusBadgeVariant(publisher.status)}>
                      {t(discoverOrganizationStatusLabel(publisher.status))}
                    </Badge>
                    {publisher.verified ? (
                      <Badge variant="success">{t("Verified")}</Badge>
                    ) : null}
                  </div>

                  {!isIndividual ? (
                    <div
                      className="flex flex-wrap gap-1.5"
                      title={geneticReportBadgeGroup.title}
                    >
                      <Badge
                        variant={
                          organization.isGeneticReportProvider
                            ? "violet"
                            : "outline"
                        }
                        className="rounded-md"
                      >
                        {organization.isGeneticReportProvider
                          ? t("Genetic report provider")
                          : t("Not a genetic report provider")}
                      </Badge>
                      {geneticReportLabels.length ? (
                        <>
                          {geneticReportBadgeGroup.visibleLabels.map((label) => (
                            <Badge
                              key={label}
                              variant="secondary"
                              className="rounded-md"
                            >
                              {t(label)}
                            </Badge>
                          ))}
                          {geneticReportBadgeGroup.hiddenCount ? (
                            <Badge variant="outline" className="rounded-md">
                              +{geneticReportBadgeGroup.hiddenCount}
                            </Badge>
                          ) : null}
                        </>
                      ) : (
                        <Badge variant="secondary" className="rounded-md">
                          {t("No genetic report category")}
                        </Badge>
                      )}
                    </div>
                  ) : null}

                  <div className="text-sm text-muted-foreground">
                    {t("Updated")}:{" "}
                    {formatDateTime(publisher.updatedAt) ?? t("No timestamp")}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 2xl:justify-end">
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
                        onClick={() =>
                          void setPublisherStatus(publisher, "active")
                        }
                        disabled={pending}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("Reactivate")}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void setPublisherStatus(publisher, "archived")
                        }
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
  routeBase,
}: {
  initialOrganizations: DiscoverOrganizationRecord[];
  initialNextCursor: string | null;
  canCreateOrganizations?: boolean;
  canManageOrganizationStatus?: boolean;
  routeBase?: string;
}) {
  return (
    <DiscoverPublisherBrowser
      publisherKind="organization"
      initialPublishers={initialOrganizations}
      initialNextCursor={initialNextCursor}
      canCreatePublishers={canCreateOrganizations}
      canManagePublisherStatus={canManageOrganizationStatus}
      routeBase={routeBase}
    />
  );
}

export function DiscoverIndividualBrowser({
  initialIndividuals,
  initialNextCursor,
  canCreateIndividuals = true,
  canManageIndividualStatus = true,
  routeBase,
}: {
  initialIndividuals: DiscoverIndividualRecord[];
  initialNextCursor: string | null;
  canCreateIndividuals?: boolean;
  canManageIndividualStatus?: boolean;
  routeBase?: string;
}) {
  return (
    <DiscoverPublisherBrowser
      publisherKind="individual"
      initialPublishers={initialIndividuals}
      initialNextCursor={initialNextCursor}
      canCreatePublishers={canCreateIndividuals}
      canManagePublisherStatus={canManageIndividualStatus}
      routeBase={routeBase}
    />
  );
}
