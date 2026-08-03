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
  DISCOVER_ORGANIZATION_TYPE_OPTIONS,
  discoverOrganizationStatusLabel,
  discoverOrganizationTypeLabel,
  type DiscoverOrganizationRecord,
  type DiscoverOrganizationStatus,
  type DiscoverOrganizationsPage,
} from "@/lib/discover";

function statusBadgeVariant(status: DiscoverOrganizationStatus) {
  if (status === "active") {
    return "success" as const;
  }

  if (status === "archived") {
    return "secondary" as const;
  }

  return "outline" as const;
}

function organizationPayload(
  organization: DiscoverOrganizationRecord,
  status: DiscoverOrganizationStatus,
) {
  return {
    name: organization.name,
    imageUrl: organization.imageUrl,
    status,
    slug: organization.slug,
    websiteUrl: organization.websiteUrl,
    description: organization.description,
    countryCode: organization.countryCode,
    organizationType: organization.organizationType,
    verified: organization.verified,
    contactEmail: organization.contactEmail,
    internalNotes: organization.internalNotes,
  };
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
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | DiscoverOrganizationStatus>("all");
  const [organizationType, setOrganizationType] = useState("all");
  const [countryCode, setCountryCode] = useState("");
  const [verified, setVerified] = useState<"all" | "verified" | "unverified">("all");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);

  const filteredOrganizations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedCountry = countryCode.trim().toLowerCase();

    return organizations.filter((organization) => {
      const searchable = [
        organization.id,
        organization.name,
        organization.slug,
        organization.websiteUrl,
        organization.description,
        organization.countryCode,
        organization.organizationType,
        organization.contactEmail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (status === "all" || organization.status === status) &&
        (organizationType === "all" ||
          organization.organizationType === organizationType) &&
        (!normalizedCountry ||
          (organization.countryCode ?? "").toLowerCase().includes(normalizedCountry)) &&
        (verified === "all" ||
          (verified === "verified" ? organization.verified : !organization.verified))
      );
    });
  }, [countryCode, organizationType, organizations, query, status, verified]);

  async function loadMore() {
    if (!nextCursor) {
      return;
    }

    setPending(true);
    try {
      const params = new URLSearchParams({ cursor: nextCursor });
      const page = await sdkFetch<DiscoverOrganizationsPage>(
        `/discover/organizations?${params.toString()}`,
      );
      setOrganizations((current) => [...current, ...page.organizations]);
      setNextCursor(page.nextCursor);
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to load more organizations."),
      });
    } finally {
      setPending(false);
    }
  }

  async function refresh() {
    setPending(true);
    try {
      const page = await sdkFetch<DiscoverOrganizationsPage>(
        "/discover/organizations",
      );
      setOrganizations(page.organizations);
      setNextCursor(page.nextCursor);
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to refresh organizations."),
      });
    } finally {
      setPending(false);
    }
  }

  async function setOrganizationStatus(
    organization: DiscoverOrganizationRecord,
    nextStatus: DiscoverOrganizationStatus,
  ) {
    setPending(true);
    try {
      const response = await sdkFetch<{ organization: DiscoverOrganizationRecord }>(
        `/discover/organizations/${organization.id}`,
        {
          method: "PUT",
          body: JSON.stringify(organizationPayload(organization, nextStatus)),
        },
      );
      setOrganizations((current) =>
        current.map((entry) =>
          entry.id === organization.id ? response.organization : entry,
        ),
      );
      setToast({
        id: Date.now(),
        tone: "success",
        message:
          nextStatus === "archived"
            ? t("Organization archived.")
            : t("Organization reactivated."),
      });
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to update the organization status."),
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
              {t("Organizations")}
            </h2>
            <HeaderUnclutterButton />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={pending}>
              <RefreshCcw className="h-3.5 w-3.5" />
              {pending ? t("Working...") : t("Refresh")}
            </Button>
            {canCreateOrganizations ? (
              <Button size="sm" asChild>
                <Link href="/discover/organizations/new">
                  <Plus className="h-3.5 w-3.5" />
                  {t("New organization")}
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
              placeholder={t("Search organization name, URL, email, or slug")}
              className="pl-9"
            />
          </label>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "all" | DiscoverOrganizationStatus)
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
            value={organizationType}
            onChange={(event) => setOrganizationType(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{t("All types")}</option>
            {DISCOVER_ORGANIZATION_TYPE_OPTIONS.map((option) => (
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
          <span>{t("Organization")}</span>
          <span>{t("Type")}</span>
          <span>{t("Status")}</span>
          <span>{t("Updated")}</span>
          <span className="text-right">{t("Action")}</span>
        </div>

        {filteredOrganizations.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No Discover organizations match the loaded rows.")}
          </div>
        ) : (
          filteredOrganizations.map((organization) => (
            <div
              key={organization.id}
              className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_110px_170px_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {organization.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={organization.imageUrl}
                      alt=""
                      className="h-8 w-8 rounded-md border border-border object-cover"
                    />
                  ) : null}
                  <h3 className="font-medium text-foreground">{organization.name}</h3>
                  {organization.verified ? (
                    <Badge variant="success">{t("Verified")}</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {compactList([
                    organization.id,
                    organization.slug,
                    organization.countryCode,
                    organization.websiteUrl,
                    organization.contactEmail,
                  ]) || t("Discover publisher")}
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                {t(discoverOrganizationTypeLabel(organization.organizationType))}
              </div>

              <div>
                <Badge variant={statusBadgeVariant(organization.status)}>
                  {t(discoverOrganizationStatusLabel(organization.status))}
                </Badge>
              </div>

              <div className="text-sm text-muted-foreground">
                {formatDateTime(organization.updatedAt) ?? t("No timestamp")}
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/discover/organizations/${organization.id}`}>
                    {t("Open")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                {canManageOrganizationStatus ? (
                  organization.status === "archived" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void setOrganizationStatus(organization, "active")}
                      disabled={pending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t("Reactivate")}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void setOrganizationStatus(organization, "archived")}
                      disabled={pending}
                    >
                      <Archive className="h-3.5 w-3.5" />
                      {t("Archive")}
                    </Button>
                  )
                ) : null}
              </div>
            </div>
          ))
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
