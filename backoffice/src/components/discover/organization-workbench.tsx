"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Save, RefreshCw } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppLanguage } from "@/components/app-language-provider";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import {
  DISCOVER_ORGANIZATION_STATUS_OPTIONS,
  DISCOVER_ORGANIZATION_TYPE_OPTIONS,
  type DiscoverOrganizationRecord,
  type DiscoverOrganizationStatus,
  type DiscoverOrganizationType,
} from "@/lib/discover";

type OrganizationFormState = {
  name: string;
  imageUrl: string;
  status: DiscoverOrganizationStatus;
  slug: string;
  websiteUrl: string;
  description: string;
  countryCode: string;
  organizationType: "" | DiscoverOrganizationType;
  verified: boolean;
  contactEmail: string;
  internalNotes: string;
};

function toFormState(
  organization?: DiscoverOrganizationRecord | null,
): OrganizationFormState {
  return {
    name: organization?.name ?? "",
    imageUrl: organization?.imageUrl ?? "",
    status: organization?.status ?? "active",
    slug: organization?.slug ?? "",
    websiteUrl: organization?.websiteUrl ?? "",
    description: organization?.description ?? "",
    countryCode: organization?.countryCode ?? "",
    organizationType: organization?.organizationType ?? "",
    verified: organization?.verified ?? false,
    contactEmail: organization?.contactEmail ?? "",
    internalNotes: organization?.internalNotes ?? "",
  };
}

function payloadFromState(state: OrganizationFormState) {
  return {
    ...state,
    imageUrl: state.imageUrl || null,
    websiteUrl: state.websiteUrl || null,
    organizationType: state.organizationType || undefined,
  };
}

export function DiscoverOrganizationWorkbench({
  organization,
  mode = "edit",
  canManageSystemFields = true,
}: {
  organization?: DiscoverOrganizationRecord;
  mode?: "create" | "edit";
  canManageSystemFields?: boolean;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const [state, setState] = useState(() => toFormState(organization));
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const sourceState = useMemo(() => toFormState(organization), [organization]);
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);

  function updateState(patch: Partial<OrganizationFormState>) {
    setState((current) => ({ ...current, ...patch }));
  }

  async function handleSave() {
    if (!state.name.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Organization name is required."),
      });
      return;
    }

    setPending(true);
    try {
      if (mode === "create") {
        const response = await sdkFetch<{ organization: DiscoverOrganizationRecord }>(
          "/discover/organizations",
          {
            method: "POST",
            body: JSON.stringify(payloadFromState(state)),
          },
        );
        setToast({
          id: Date.now(),
          tone: "success",
          message: t("Organization created."),
        });
        router.push(`/discover/organizations/${response.organization.id}`);
        router.refresh();
        return;
      }

      if (!organization) {
        return;
      }

      await sdkFetch<{ organization: DiscoverOrganizationRecord }>(
        `/discover/organizations/${organization.id}`,
        {
          method: "PUT",
          body: JSON.stringify(payloadFromState(state)),
        },
      );
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Organization changes saved."),
      });
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("Unable to save the organization."),
      });
    } finally {
      setPending(false);
    }
  }

  async function syncPublisherSnapshot() {
    if (!organization) {
      return;
    }

    setPending(true);
    try {
      const result = await sdkFetch<{ updated: number }>(
        `/discover/organizations/${organization.id}/sync-publisher-snapshot`,
        { method: "POST" },
      );
      setToast({
        id: Date.now(),
        tone: "success",
        message: `${t("Publisher snapshot synced.")} ${result.updated} ${t("feed entries updated.")}`,
      });
      router.refresh();
    } catch {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to sync publisher snapshots."),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/discover/organizations">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("Back to organizations")}
          </Link>
        </Button>
        {organization ? (
          <span className="font-mono text-xs text-muted-foreground">
            {organization.id}
          </span>
        ) : null}
      </div>

      <section className="glass-panel flex flex-col gap-5 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create" ? t("Create organization") : t("Organization")}
            </h2>
            <HeaderUnclutterButton />
          </div>
          <div className="flex flex-wrap gap-2">
            {organization ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void syncPublisherSnapshot()}
                disabled={pending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("Sync publisher snapshot")}
              </Button>
            ) : null}
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
              size="sm"
              onClick={() => void handleSave()}
              disabled={pending || (!changed && mode === "edit")}
            >
              <Save className="h-3.5 w-3.5" />
              {pending ? t("Saving...") : t("Save")}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-name">{t("Name")}</Label>
              <Input
                id="discover-org-name"
                value={state.name}
                onChange={(event) => updateState({ name: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="discover-org-status">{t("Status")}</Label>
              <select
                id="discover-org-status"
                value={state.status}
                onChange={(event) =>
                  updateState({
                    status: event.target.value as DiscoverOrganizationStatus,
                  })
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                disabled={!canManageSystemFields}
              >
                {DISCOVER_ORGANIZATION_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="discover-org-type">{t("Organization type")}</Label>
              <select
                id="discover-org-type"
                value={state.organizationType}
                onChange={(event) =>
                  updateState({
                    organizationType: event.target
                      .value as OrganizationFormState["organizationType"],
                  })
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t("Unspecified")}</option>
                {DISCOVER_ORGANIZATION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="discover-org-slug">{t("Slug")}</Label>
              <Input
                id="discover-org-slug"
                value={state.slug}
                onChange={(event) => updateState({ slug: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="discover-org-country">{t("Country code")}</Label>
              <Input
                id="discover-org-country"
                value={state.countryCode}
                onChange={(event) =>
                  updateState({ countryCode: event.target.value.toUpperCase() })
                }
                maxLength={2}
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-website">{t("Website URL")}</Label>
              <Input
                id="discover-org-website"
                type="url"
                value={state.websiteUrl}
                onChange={(event) =>
                  updateState({ websiteUrl: event.target.value })
                }
                placeholder="https://"
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-image">{t("Image URL")}</Label>
              <Input
                id="discover-org-image"
                type="url"
                value={state.imageUrl}
                onChange={(event) => updateState({ imageUrl: event.target.value })}
                placeholder="https://"
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-description">{t("Description")}</Label>
              <Textarea
                id="discover-org-description"
                value={state.description}
                onChange={(event) =>
                  updateState({ description: event.target.value })
                }
                rows={4}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="discover-org-contact">{t("Contact email")}</Label>
              <Input
                id="discover-org-contact"
                type="email"
                value={state.contactEmail}
                onChange={(event) =>
                  updateState({ contactEmail: event.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-2 self-end rounded-md border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={state.verified}
                onChange={(event) =>
                  updateState({ verified: event.target.checked })
                }
                disabled={!canManageSystemFields}
                className="h-4 w-4"
              />
              {t("Verified publisher")}
            </label>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-notes">{t("Internal notes")}</Label>
              <Textarea
                id="discover-org-notes"
                value={state.internalNotes}
                onChange={(event) =>
                  updateState({ internalNotes: event.target.value })
                }
                disabled={!canManageSystemFields}
                rows={3}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-md border border-border bg-muted/30">
              {state.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.imageUrl}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  {t("No image URL")}
                </div>
              )}
            </div>
            <div className="rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">
                {state.name || t("Organization name")}
              </div>
              <div>{state.websiteUrl || t("No website URL")}</div>
              <div>{state.countryCode || t("No country code")}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
