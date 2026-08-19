"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppLanguage } from "@/components/app-language-provider";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import { cn } from "@/lib/utils";
import {
  DISCOVER_ORGANIZATION_STATUS_OPTIONS,
  DISCOVER_ORGANIZATION_TYPE_OPTIONS,
  type DiscoverOrganizationRecord,
  type DiscoverOrganizationStatus,
  type DiscoverOrganizationType,
} from "@/lib/discover";
import {
  formatDiscoverOrganizationCountry,
  getDiscoverOrganizationCountryGroups,
  slugifyDiscoverOrganizationName,
} from "@/lib/discover-organization-fields";

type OrganizationFormState = {
  name: string;
  imageUrl: string;
  status: DiscoverOrganizationStatus;
  websiteUrl: string;
  description: string;
  description_en: string;
  countryCode: string;
  organizationType: "" | DiscoverOrganizationType;
  color_hex: string;
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
    websiteUrl: organization?.websiteUrl ?? "",
    description: organization?.description ?? "",
    description_en: organization?.description_en ?? "",
    countryCode: organization?.countryCode?.toUpperCase() ?? "",
    organizationType: organization?.organizationType ?? "",
    color_hex: organization?.color_hex ?? "",
    verified: organization?.verified ?? false,
    contactEmail: organization?.contactEmail ?? "",
    internalNotes: organization?.internalNotes ?? "",
  };
}

function payloadFromState(state: OrganizationFormState) {
  return {
    ...state,
    slug: slugifyDiscoverOrganizationName(state.name),
    imageUrl: state.imageUrl || null,
    websiteUrl: state.websiteUrl || null,
    countryCode: state.countryCode || undefined,
    organizationType: state.organizationType || undefined,
    color_hex: normalizedColorHex(state.color_hex) || undefined,
  };
}

function normalizedColorHex(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : null;
}

function colorTextValue(value: string) {
  return normalizedColorHex(value) || value.trim();
}

const DESCRIPTION_LANGUAGE_OPTIONS = [
  { value: "es", label: "Spanish" },
  { value: "en", label: "English" },
] as const;

type DescriptionLanguage = (typeof DESCRIPTION_LANGUAGE_OPTIONS)[number]["value"];

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
  const [activeDescriptionLanguage, setActiveDescriptionLanguage] =
    useState<DescriptionLanguage>("es");
  const [manualColorMode, setManualColorMode] = useState(false);
  const [manualColorDraft, setManualColorDraft] = useState(() =>
    colorTextValue(toFormState(organization).color_hex),
  );
  const [manualColorError, setManualColorError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const sourceState = useMemo(() => toFormState(organization), [organization]);
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);
  const countryGroups = useMemo(
    () => getDiscoverOrganizationCountryGroups(language),
    [language],
  );
  const countryLabel = formatDiscoverOrganizationCountry(
    state.countryCode,
    language,
  );
  const colorHex = normalizedColorHex(state.color_hex);
  const appliedColorError =
    state.color_hex.trim() && colorHex === null
      ? t("Organization color must be a 6-digit hex value.")
      : null;
  const colorError = manualColorError || appliedColorError;
  const visibleColorText = manualColorMode
    ? manualColorDraft
    : colorTextValue(state.color_hex);
  const activeDescriptionId =
    activeDescriptionLanguage === "es"
      ? "discover-org-description"
      : "discover-org-description-en";
  const activeDescriptionValue =
    activeDescriptionLanguage === "es"
      ? state.description
      : state.description_en;
  const showEnglishDescriptionWarning = Boolean(
    state.description.trim() && !state.description_en.trim(),
  );

  function updateState(patch: Partial<OrganizationFormState>) {
    setState((current) => ({ ...current, ...patch }));
  }

  function closeManualColorEditor(nextColor: string) {
    setManualColorMode(false);
    setManualColorDraft(colorTextValue(nextColor));
    setManualColorError(null);
  }

  function handleReset() {
    setState(sourceState);
    closeManualColorEditor(sourceState.color_hex);
  }

  function handleColorPickerChange(value: string) {
    const nextColor = value.toUpperCase();
    updateState({ color_hex: nextColor });
    closeManualColorEditor(nextColor);
  }

  function startManualColorEdit() {
    setManualColorDraft(colorTextValue(state.color_hex));
    setManualColorMode(true);
    setManualColorError(null);
  }

  function applyManualColor() {
    const nextColor = normalizedColorHex(manualColorDraft);
    if (!nextColor) {
      setManualColorError(t("Organization color must be a 6-digit hex value."));
      return;
    }

    updateState({ color_hex: nextColor });
    closeManualColorEditor(nextColor);
  }

  function updateActiveDescription(value: string) {
    updateState(
      activeDescriptionLanguage === "es"
        ? { description: value }
        : { description_en: value },
    );
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

    if (appliedColorError) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: appliedColorError,
      });
      return;
    }

    const nextState = {
      ...state,
      color_hex: colorHex || "",
    };

    setPending(true);
    try {
      if (mode === "create") {
        const response = await sdkFetch<{ organization: DiscoverOrganizationRecord }>(
          "/discover/organizations",
          {
            method: "POST",
            body: JSON.stringify(payloadFromState(nextState)),
          },
        );
        setState(nextState);
        closeManualColorEditor(nextState.color_hex);
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
          body: JSON.stringify(payloadFromState(nextState)),
        },
      );
      setState(nextState);
      closeManualColorEditor(nextState.color_hex);
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
              onClick={handleReset}
              disabled={
                (!changed && !manualColorMode && !manualColorError) || pending
              }
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
              <Label htmlFor="discover-org-country">{t("Country")}</Label>
              <select
                id="discover-org-country"
                value={state.countryCode}
                onChange={(event) =>
                  updateState({ countryCode: event.target.value })
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t("Select country")}</option>
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
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-color">{t("Accent color")}</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="color"
                  value={colorHex || "#4F46E5"}
                  onChange={(event) =>
                    handleColorPickerChange(event.target.value)
                  }
                  className="h-10 w-full cursor-pointer rounded-md border border-input bg-background p-1 sm:w-16"
                  aria-label={t("Accent color picker")}
                />
                <Input
                  id="discover-org-color"
                  value={visibleColorText}
                  onChange={(event) => {
                    setManualColorDraft(event.target.value);
                    setManualColorError(null);
                  }}
                  onKeyDown={(event) => {
                    if (manualColorMode && event.key === "Enter") {
                      event.preventDefault();
                      applyManualColor();
                    }
                  }}
                  readOnly={!manualColorMode}
                  placeholder="#4F46E5"
                  aria-invalid={Boolean(colorError)}
                  aria-describedby={
                    colorError ? "discover-org-color-error" : undefined
                  }
                  className={
                    colorError
                      ? "border-destructive focus-visible:ring-destructive"
                      : "read-only:bg-muted/45 read-only:text-muted-foreground"
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (manualColorMode) {
                      applyManualColor();
                      return;
                    }
                    startManualColorEdit();
                  }}
                  disabled={pending}
                >
                  {manualColorMode ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <PencilLine className="h-3.5 w-3.5" />
                  )}
                  {manualColorMode ? t("Apply") : t("Set manually")}
                </Button>
              </div>
              {colorError ? (
                <p
                  id="discover-org-color-error"
                  className="text-xs font-medium text-destructive"
                >
                  {colorError}
                </p>
              ) : null}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={activeDescriptionId}>{t("Description")}</Label>
                <div
                  role="group"
                  aria-label={t("Description language")}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-muted/50 p-0.5"
                >
                  {DESCRIPTION_LANGUAGE_OPTIONS.map((option) => {
                    const active = activeDescriptionLanguage === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setActiveDescriptionLanguage(option.value)}
                        className={cn(
                          "h-7 rounded-[6px] px-2.5 text-xs font-medium transition-colors",
                          active
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t(option.label)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Textarea
                id={activeDescriptionId}
                value={activeDescriptionValue}
                onChange={(event) => updateActiveDescription(event.target.value)}
                rows={4}
              />
              {showEnglishDescriptionWarning ? (
                <p className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-2 text-xs font-medium text-violet-900 dark:border-violet-400/30 dark:bg-violet-500/12 dark:text-violet-100">
                  {t(
                    "Add an English organization description to reach a broader audience.",
                  )}
                </p>
              ) : null}
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
              <div>{countryLabel || t("No country")}</div>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-full border border-border"
                  style={{ backgroundColor: colorHex || "transparent" }}
                />
                <span>{colorHex || t("No accent color")}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
