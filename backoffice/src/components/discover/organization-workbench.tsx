"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  PencilLine,
  RotateCcw,
  Save,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { PublisherCategoryMultiSelect } from "@/components/discover/publisher-category-multi-select";
import { PublisherCountryMultiSelect } from "@/components/discover/publisher-country-multi-select";
import { PublisherSocialLinksEditor } from "@/components/discover/publisher-social-links-editor";
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
  type DiscoverIndividualRecord,
  type DiscoverIndividualStatus,
  type DiscoverOrganizationRecord,
  type DiscoverOrganizationStatus,
  type DiscoverPublisherSocialLinks,
} from "@/lib/discover";
import {
  discoverIndividualCategoryProvider,
  discoverOrganizationCategoryProvider,
} from "@/lib/discover-publisher-categories";
import {
  formatDiscoverOrganizationCountries,
  serializeDiscoverOrganizationCountryCodes,
  slugifyDiscoverOrganizationName,
} from "@/lib/discover-organization-fields";

type PublisherKind = "organization" | "individual";
type PublisherRecord = DiscoverOrganizationRecord | DiscoverIndividualRecord;

type OrganizationFormState = {
  name: string;
  imageUrl: string;
  status: DiscoverOrganizationStatus | DiscoverIndividualStatus;
  websiteUrl: string;
  description: string;
  description_en: string;
  social: DiscoverPublisherSocialLinks;
  countryCode: string;
  organizationType: string;
  individualType: string;
  color_hex: string;
  verified: boolean;
  contactEmail: string;
  internalNotes: string;
};

function toFormState(
  publisher?: PublisherRecord | null,
): OrganizationFormState {
  const organization = publisher as Partial<DiscoverOrganizationRecord> | undefined;
  const individual = publisher as Partial<DiscoverIndividualRecord> | undefined;

  return {
    name: publisher?.name ?? "",
    imageUrl: publisher?.imageUrl ?? "",
    status: publisher?.status ?? "active",
    websiteUrl: publisher?.websiteUrl ?? "",
    description: publisher?.description ?? "",
    description_en: publisher?.description_en ?? "",
    social: publisher?.social ?? {},
    countryCode: serializeDiscoverOrganizationCountryCodes(
      publisher?.countryCode ? publisher.countryCode.split(",") : [],
    ),
    organizationType: discoverOrganizationCategoryProvider.normalizeCsv(
      organization?.organizationType,
    ),
    individualType: discoverIndividualCategoryProvider.normalizeCsv(
      individual?.individualType,
    ),
    color_hex: publisher?.color_hex ?? "",
    verified: publisher?.verified ?? false,
    contactEmail: publisher?.contactEmail ?? "",
    internalNotes: publisher?.internalNotes ?? "",
  };
}

function payloadFromState(state: OrganizationFormState, publisherKind: PublisherKind) {
  const organizationType = discoverOrganizationCategoryProvider.normalizeCsv(
    state.organizationType,
  );
  const individualType = discoverIndividualCategoryProvider.normalizeCsv(
    state.individualType,
  );
  const social = cleanPublisherSocialLinks(state.social);

  return {
    ...state,
    slug: slugifyDiscoverOrganizationName(state.name),
    imageUrl: state.imageUrl || null,
    websiteUrl: state.websiteUrl || null,
    social: Object.keys(social).length ? social : undefined,
    countryCode:
      serializeDiscoverOrganizationCountryCodes(state.countryCode.split(",")) ||
      undefined,
    organizationType:
      publisherKind === "organization"
        ? organizationType || undefined
        : undefined,
    individualType:
      publisherKind === "individual"
        ? individualType || undefined
        : undefined,
    color_hex: normalizedColorHex(state.color_hex) || undefined,
  };
}

function cleanPublisherSocialLinks(social: DiscoverPublisherSocialLinks) {
  return Object.fromEntries(
    Object.entries(social).filter(([, value]) => value.trim()),
  ) as DiscoverPublisherSocialLinks;
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

function DiscoverPublisherWorkbench({
  publisher,
  publisherKind,
  mode = "edit",
  canManageSystemFields = true,
}: {
  publisher?: PublisherRecord;
  publisherKind: PublisherKind;
  mode?: "create" | "edit";
  canManageSystemFields?: boolean;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const [state, setState] = useState(() => toFormState(publisher));
  const [activeDescriptionLanguage, setActiveDescriptionLanguage] =
    useState<DescriptionLanguage>("es");
  const [manualColorMode, setManualColorMode] = useState(false);
  const [manualColorDraft, setManualColorDraft] = useState(() =>
    colorTextValue(toFormState(publisher).color_hex),
  );
  const [manualColorError, setManualColorError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const sourceState = useMemo(() => toFormState(publisher), [publisher]);
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);
  const countryLabel = formatDiscoverOrganizationCountries(
    state.countryCode,
    language,
  );
  const isIndividual = publisherKind === "individual";
  const publisherListHref = isIndividual
    ? "/discover/individuals"
    : "/discover/organizations";
  const publisherDetailHref = (id: string) =>
    isIndividual
      ? `/discover/individuals/${id}`
      : `/discover/organizations/${id}`;
  const endpointBase = isIndividual
    ? "/discover/individuals"
    : "/discover/organizations";
  const categoryProvider = isIndividual
    ? discoverIndividualCategoryProvider
    : discoverOrganizationCategoryProvider;
  const publisherNameLabel = isIndividual
    ? t("Individual publisher name")
    : t("Organization name");
  const colorErrorText = isIndividual
    ? t("Individual publisher color must be a 6-digit hex value.")
    : t("Organization color must be a 6-digit hex value.");
  const colorHex = normalizedColorHex(state.color_hex);
  const appliedColorError =
    state.color_hex.trim() && colorHex === null
      ? colorErrorText
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
  const selectedCategoryLabels = categoryProvider.labelsForCsv(
    isIndividual ? state.individualType : state.organizationType,
  );
  const selectedCategoryDisplayLabels = selectedCategoryLabels.map((label) =>
    t(label),
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
      setManualColorError(colorErrorText);
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
        message: isIndividual
          ? t("Individual publisher name is required.")
          : t("Organization name is required."),
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

    if (!state.imageUrl.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Image URL is required."),
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
        const response = await sdkFetch<
          { organization: DiscoverOrganizationRecord } |
          { individual: DiscoverIndividualRecord }
        >(
          endpointBase,
          {
            method: "POST",
            body: JSON.stringify(payloadFromState(nextState, publisherKind)),
          },
        );
        const saved = isIndividual
          ? (response as { individual: DiscoverIndividualRecord }).individual
          : (response as { organization: DiscoverOrganizationRecord }).organization;
        setState(nextState);
        closeManualColorEditor(nextState.color_hex);
        setToast({
          id: Date.now(),
          tone: "success",
          message: isIndividual
            ? t("Individual publisher created.")
            : t("Organization created."),
        });
        router.push(publisherDetailHref(saved.id));
        router.refresh();
        return;
      }

      if (!publisher) {
        return;
      }

      await sdkFetch<
        { organization: DiscoverOrganizationRecord } |
        { individual: DiscoverIndividualRecord }
      >(
        `${endpointBase}/${publisher.id}`,
        {
          method: "PUT",
          body: JSON.stringify(payloadFromState(nextState, publisherKind)),
        },
      );
      setState(nextState);
      closeManualColorEditor(nextState.color_hex);
      setToast({
        id: Date.now(),
        tone: "success",
        message: isIndividual
          ? t("Individual publisher changes saved.")
          : t("Organization changes saved."),
      });
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : isIndividual
              ? t("Unable to save the individual publisher.")
              : t("Unable to save the organization."),
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
          <Link href={publisherListHref}>
            <ArrowLeft className="h-3.5 w-3.5" />
            {isIndividual ? t("Back to individual publishers") : t("Back to organizations")}
          </Link>
        </Button>
        {publisher ? (
          <span className="font-mono text-xs text-muted-foreground">
            {publisher.id}
          </span>
        ) : null}
      </div>

      <section className="glass-panel flex flex-col gap-5 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {mode === "create"
                ? isIndividual
                  ? t("Create individual publisher")
                  : t("Create organization")
                : isIndividual
                  ? t("Individual publisher")
                  : t("Organization")}
            </h2>
            <HeaderUnclutterButton />
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
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-country">{t("Country coverage")}</Label>
              <PublisherCountryMultiSelect
                id="discover-org-country"
                value={state.countryCode}
                onChange={(countryCode) => updateState({ countryCode })}
                language={language}
                t={t}
              />
            </div>
            <PublisherCategoryMultiSelect
              provider={categoryProvider}
              value={isIndividual ? state.individualType : state.organizationType}
              onChange={(value: string) =>
                updateState(
                  isIndividual
                    ? { individualType: value }
                    : { organizationType: value },
                )
              }
              optionLabel={(option) => t(option.label)}
              label={isIndividual ? t("Professional categories") : t("Organization category")}
              dialogTitle={
                isIndividual
                  ? t("Select professional categories")
                  : t("Select organization category")
              }
              dialogDescription={t("Choose one or more canonical Discover categories. They will be saved as comma-separated keys.")}
              emptyLabel={t("No categories selected")}
              searchPlaceholder={t("Search categories")}
              clearLabel={t("Clear all")}
              removeLabel={t("Remove")}
              doneLabel={t("Done")}
              selectedCountLabel={(count: number) =>
                `${count} ${count === 1 ? t("category selected") : t("categories selected")}`
              }
              className="md:col-span-2"
            />
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-color">{t("Accent color")}</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="color"
                  value={colorHex || "#4F46E5"}
                  onChange={(event) =>
                    handleColorPickerChange(event.target.value)
                  }
                  className="size-10 shrink-0 cursor-pointer overflow-hidden rounded-full border border-input bg-background p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
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
                      : manualColorMode
                        ? ""
                        : "cursor-default border-transparent bg-transparent px-0 shadow-none hover:border-transparent focus-visible:border-transparent focus-visible:ring-0 read-only:bg-transparent read-only:text-foreground dark:border-transparent dark:bg-transparent dark:read-only:bg-transparent"
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
                required
              />
            </div>
            <PublisherSocialLinksEditor
              value={state.social}
              onChange={(social) => updateState({ social })}
              t={t}
            />
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
                  {isIndividual
                    ? t("Add an English individual publisher description to reach a broader audience.")
                    : t("Add an English organization description to reach a broader audience.")}
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
                {state.name || publisherNameLabel}
              </div>
              <div>{state.websiteUrl || t("No website URL")}</div>
              <div>{countryLabel || t("No country")}</div>
              <div>
                {selectedCategoryDisplayLabels.length
                  ? selectedCategoryDisplayLabels.join(", ")
                  : t("No categories selected")}
              </div>
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

        <div className="sticky bottom-0 z-20 border-t border-border bg-background/94 px-5 py-4 shadow-[0_-18px_42px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 text-sm text-muted-foreground">
              {changed ? t("Unsaved changes") : t("No unsaved changes")}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                size="lg"
                onClick={handleReset}
                disabled={
                  (!changed && !manualColorMode && !manualColorError) || pending
                }
                className="h-14 justify-center text-base font-semibold sm:min-w-36"
              >
                <RotateCcw className="h-4 w-4" />
                {t("Reset")}
              </Button>
              <Button
                size="lg"
                onClick={() => void handleSave()}
                disabled={pending || (!changed && mode === "edit")}
                className="h-14 min-w-[min(100%,22rem)] justify-center text-base font-semibold"
              >
                <Save className="h-5 w-5" />
                {pending
                  ? t("Saving...")
                  : mode === "create"
                    ? isIndividual
                      ? t("Create individual publisher")
                      : t("Create organization")
                    : t("Save changes")}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
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
  return (
    <DiscoverPublisherWorkbench
      publisher={organization}
      publisherKind="organization"
      mode={mode}
      canManageSystemFields={canManageSystemFields}
    />
  );
}

export function DiscoverIndividualWorkbench({
  individual,
  mode = "edit",
  canManageSystemFields = true,
}: {
  individual?: DiscoverIndividualRecord;
  mode?: "create" | "edit";
  canManageSystemFields?: boolean;
}) {
  return (
    <DiscoverPublisherWorkbench
      publisher={individual}
      publisherKind="individual"
      mode={mode}
      canManageSystemFields={canManageSystemFields}
    />
  );
}
