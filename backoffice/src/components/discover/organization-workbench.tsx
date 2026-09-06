"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Check,
  CheckCircle2,
  Palette,
  PencilLine,
  RotateCcw,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { PublisherCategoryMultiSelect } from "@/components/discover/publisher-category-multi-select";
import { PublisherCountryMultiSelect } from "@/components/discover/publisher-country-multi-select";
import { PublisherSocialLinksEditor } from "@/components/discover/publisher-social-links-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppLanguage } from "@/components/app-language-provider";
import { sdkFetch } from "@/lib/sdk-client";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_LOGIN_ROUTE } from "@/lib/publisher-portal-routes";
import { cn } from "@/lib/utils";
import {
  DISCOVER_ORGANIZATION_STATUS_OPTIONS,
  discoverGeneticReportCategoryLabels,
  discoverGeneticReportCategoryProvider,
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
type DeleteSuccessAction = "list" | "publisher-login";

type OrganizationFormState = {
  name: string;
  imageUrl: string;
  imageUploadDataUrl: string;
  imageUploadName: string;
  imageUploadMimeType: string;
  status: DiscoverOrganizationStatus | DiscoverIndividualStatus;
  websiteUrl: string;
  description: string;
  descriptionEn: string;
  social: DiscoverPublisherSocialLinks;
  countryCode: string;
  organizationType: string;
  individualType: string;
  colorHex: string;
  verified: boolean;
  isGeneticReportProvider: boolean;
  geneticReportCategory: string;
  contactEmail: string;
  internalNotes: string;
};

function toFormState(
  publisher?: PublisherRecord | null,
): OrganizationFormState {
  const organization = publisher as
    Partial<DiscoverOrganizationRecord> | undefined;
  const individual = publisher as Partial<DiscoverIndividualRecord> | undefined;
  const isGeneticReportProvider =
    organization?.isGeneticReportProvider ?? false;

  return {
    name: publisher?.name ?? "",
    imageUrl: publisher?.imageUrl ?? "",
    imageUploadDataUrl: publisher?.imageUploadDataUrl ?? "",
    imageUploadName: publisher?.imageUploadName ?? "",
    imageUploadMimeType: publisher?.imageUploadMimeType ?? "",
    status: publisher?.status ?? "active",
    websiteUrl: publisher?.websiteUrl ?? "",
    description: publisher?.description ?? "",
    descriptionEn: publisher?.descriptionEn ?? "",
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
    colorHex: publisher?.colorHex ?? "",
    verified: publisher?.verified ?? false,
    isGeneticReportProvider,
    geneticReportCategory: isGeneticReportProvider
      ? (organization?.geneticReportCategory ?? "")
      : "",
    contactEmail: publisher?.contactEmail ?? "",
    internalNotes: publisher?.internalNotes ?? "",
  };
}

function payloadFromState(
  state: OrganizationFormState,
  publisherKind: PublisherKind,
) {
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
    imageUploadDataUrl: state.imageUploadDataUrl || undefined,
    imageUploadName: state.imageUploadName || undefined,
    imageUploadMimeType: state.imageUploadMimeType || undefined,
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
      publisherKind === "individual" ? individualType || undefined : undefined,
    colorHex: normalizedColorHex(state.colorHex) || undefined,
    isGeneticReportProvider:
      publisherKind === "organization"
        ? state.isGeneticReportProvider
        : undefined,
    geneticReportCategory:
      publisherKind === "organization"
        ? state.isGeneticReportProvider
          ? state.geneticReportCategory || null
          : null
        : undefined,
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

type DescriptionLanguage =
  (typeof DESCRIPTION_LANGUAGE_OPTIONS)[number]["value"];

function DiscoverPublisherWorkbench({
  publisher,
  publisherKind,
  mode = "edit",
  canManageSystemFields = true,
  canDeletePublisher = false,
  deleteSuccessAction = "list",
  routeBase,
}: {
  publisher?: PublisherRecord;
  publisherKind: PublisherKind;
  mode?: "create" | "edit";
  canManageSystemFields?: boolean;
  canDeletePublisher?: boolean;
  deleteSuccessAction?: DeleteSuccessAction;
  routeBase?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const [state, setState] = useState(() => toFormState(publisher));
  const [activeDescriptionLanguage, setActiveDescriptionLanguage] =
    useState<DescriptionLanguage>("es");
  const [manualColorMode, setManualColorMode] = useState(false);
  const [manualColorDraft, setManualColorDraft] = useState(() =>
    colorTextValue(toFormState(publisher).colorHex),
  );
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const [manualColorError, setManualColorError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false);
  const [isSubmissionEvaluationOpen, setIsSubmissionEvaluationOpen] =
    useState(false);
  const [evaluationPending, setEvaluationPending] = useState<
    "approve" | "reject" | null
  >(null);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const sourceState = useMemo(() => toFormState(publisher), [publisher]);
  const changed = JSON.stringify(state) !== JSON.stringify(sourceState);
  const countryLabel = formatDiscoverOrganizationCountries(
    state.countryCode,
    language,
  );
  const isIndividual = publisherKind === "individual";
  const publisherRouteBase =
    routeBase ??
    (isIndividual ? "/discover/individuals" : "/discover/organizations");
  const publisherListHref = publisherRouteBase;
  const publisherDetailHref = (id: string) => `${publisherRouteBase}/${id}`;
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
  const colorHex = normalizedColorHex(state.colorHex);
  const appliedColorError =
    state.colorHex.trim() && colorHex === null ? colorErrorText : null;
  const colorError = manualColorError || appliedColorError;
  const visibleColorText = manualColorMode
    ? manualColorDraft
    : colorTextValue(state.colorHex);
  const activeDescriptionId =
    activeDescriptionLanguage === "es"
      ? "discover-org-description"
      : "discover-org-description-en";
  const activeDescriptionValue =
    activeDescriptionLanguage === "es"
      ? state.description
      : state.descriptionEn;
  const showEnglishDescriptionWarning = Boolean(
    state.description.trim() && !state.descriptionEn.trim(),
  );
  const selectedCategoryLabels = categoryProvider.labelsForCsv(
    isIndividual ? state.individualType : state.organizationType,
  );
  const selectedCategoryDisplayLabels = selectedCategoryLabels.map((label) =>
    t(label),
  );
  const selectedGeneticReportCategoryLabels =
    discoverGeneticReportCategoryLabels(
      state.geneticReportCategory || null,
    ).map((label) => t(label));
  const geneticReportCategoryLabel = selectedGeneticReportCategoryLabels.length
    ? selectedGeneticReportCategoryLabels.join(", ")
    : t("No genetic report category");
  const imagePreviewSource = state.imageUrl.trim() || state.imageUploadDataUrl;
  const showDangerZone =
    mode === "edit" && Boolean(publisher) && canDeletePublisher;
  const showSubmissionEvaluation =
    mode === "edit" && Boolean(publisher) && canManageSystemFields;
  const publisherDeletionTitle = isIndividual
    ? t("Individual publisher deletion")
    : t("Organization deletion");
  const publisherDeleteButtonLabel = isIndividual
    ? t("Delete individual publisher")
    : t("Delete organization");
  const publisherDeleteDialogTitle = isIndividual
    ? t("Delete individual publisher?")
    : t("Delete organization?");
  const publisherDeleteDescription = isIndividual
    ? t(
        "Delete this individual publisher, every linked Discover feed entry, and every publisher role linked to this individual. Publisher users for this individual will lose access and be signed out. This action is irreversible.",
      )
    : t(
        "Delete this organization, every linked Discover feed entry, and every publisher role linked to this organization. Publisher users for this organization will lose access and be signed out. This action is irreversible.",
      );
  const publisherDeleteDialogDescription = isIndividual
    ? t(
        "This permanently removes this individual publisher from feed_individuals, deletes linked feed_items, and deletes all user_roles tied to this individual. If you are one of those publisher users, your current session will end and you will be sent to the publisher portal login. This cannot be undone.",
      )
    : t(
        "This permanently removes this organization from feed_organizations, deletes linked feed_items, and deletes all user_roles tied to this organization. If you are one of those publisher users, your current session will end and you will be sent to the publisher portal login. This cannot be undone.",
      );
  const evaluationApproveSuccess = isIndividual
    ? t("Individual publisher approved and credentials sent.")
    : t("Organization approved and credentials sent.");
  const evaluationRejectSuccess = isIndividual
    ? t("Individual publisher archived.")
    : t("Organization archived.");
  const evaluationError = isIndividual
    ? t("Unable to evaluate the individual publisher submission.")
    : t("Unable to evaluate the organization submission.");

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
    closeManualColorEditor(sourceState.colorHex);
  }

  function handleColorPickerChange(value: string) {
    const nextColor = value.toUpperCase();
    updateState({ colorHex: nextColor });
    closeManualColorEditor(nextColor);
  }

  function openColorPicker() {
    const colorPicker = colorPickerRef.current;
    if (!colorPicker) {
      return;
    }

    const colorPickerWithDialog = colorPicker as HTMLInputElement & {
      showPicker?: () => void;
    };
    if (typeof colorPickerWithDialog.showPicker === "function") {
      colorPickerWithDialog.showPicker();
      return;
    }

    colorPicker.click();
  }

  function startManualColorEdit() {
    setManualColorDraft(colorTextValue(state.colorHex));
    setManualColorMode(true);
    setManualColorError(null);
  }

  function applyManualColor() {
    const nextColor = normalizedColorHex(manualColorDraft);
    if (!nextColor) {
      setManualColorError(colorErrorText);
      return;
    }

    updateState({ colorHex: nextColor });
    closeManualColorEditor(nextColor);
  }

  function updateActiveDescription(value: string) {
    updateState(
      activeDescriptionLanguage === "es"
        ? { description: value }
        : { descriptionEn: value },
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

    if (!state.imageUrl.trim() && !state.imageUploadDataUrl.trim()) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Image URL is required."),
      });
      return;
    }

    const nextState = {
      ...state,
      colorHex: colorHex || "",
    };

    setPending(true);
    try {
      if (mode === "create") {
        const response = await sdkFetch<
          | { organization: DiscoverOrganizationRecord }
          | { individual: DiscoverIndividualRecord }
        >(endpointBase, {
          method: "POST",
          body: JSON.stringify(payloadFromState(nextState, publisherKind)),
        });
        const saved = isIndividual
          ? (response as { individual: DiscoverIndividualRecord }).individual
          : (response as { organization: DiscoverOrganizationRecord })
              .organization;
        setState(nextState);
        closeManualColorEditor(nextState.colorHex);
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
        | { organization: DiscoverOrganizationRecord }
        | { individual: DiscoverIndividualRecord }
      >(`${endpointBase}/${publisher.id}`, {
        method: "PUT",
        body: JSON.stringify(payloadFromState(nextState, publisherKind)),
      });
      setState(nextState);
      closeManualColorEditor(nextState.colorHex);
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

  async function handleDeletePublisher() {
    if (!publisher || !showDangerZone || deletePending) {
      return;
    }

    setDeletePending(true);
    try {
      await sdkFetch(`${endpointBase}/${encodeURIComponent(publisher.id)}`, {
        method: "DELETE",
      });
      setToast({
        id: Date.now(),
        tone: "success",
        message: isIndividual
          ? t("Individual publisher deleted.")
          : t("Organization deleted."),
      });
      if (deleteSuccessAction === "publisher-login") {
        try {
          await signOut({
            callbackUrl: PUBLISHER_PORTAL_LOGIN_ROUTE,
            redirect: true,
          });
        } catch {
          router.push(PUBLISHER_PORTAL_LOGIN_ROUTE);
          router.refresh();
        }
        return;
      }
      router.push(publisherListHref);
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: isIndividual
          ? t("Unable to delete the individual publisher.")
          : t("Unable to delete the organization."),
        details: error instanceof Error ? error.message : undefined,
      });
      setDeletePending(false);
    }
  }

  async function handleSubmissionEvaluation(decision: "approve" | "reject") {
    if (!publisher || !showSubmissionEvaluation || evaluationPending) {
      return;
    }

    setEvaluationPending(decision);
    try {
      const response = await sdkFetch<
        | { organization: DiscoverOrganizationRecord }
        | { individual: DiscoverIndividualRecord }
      >(
        `${endpointBase}/${encodeURIComponent(publisher.id)}/submission-evaluation`,
        {
          method: "POST",
          body: JSON.stringify({ decision }),
        },
      );
      const saved = isIndividual
        ? (response as { individual: DiscoverIndividualRecord }).individual
        : (response as { organization: DiscoverOrganizationRecord })
            .organization;
      const nextState = toFormState(saved);
      setState(nextState);
      closeManualColorEditor(nextState.colorHex);
      setToast({
        id: Date.now(),
        tone: "success",
        message:
          decision === "approve"
            ? evaluationApproveSuccess
            : evaluationRejectSuccess,
      });
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message: evaluationError,
        details: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setEvaluationPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-52 sm:pb-36 lg:pb-32">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={publisherListHref}>
            <ArrowLeft className="h-3.5 w-3.5" />
            {isIndividual
              ? t("Back to individual publishers")
              : t("Back to organizations")}
          </Link>
        </Button>
        {publisher ? (
          <span className="font-mono text-xs text-muted-foreground">
            {publisher.id}
          </span>
        ) : null}
      </div>

      <section
        data-testid="discover-publisher-content-panel"
        className="glass-panel flex flex-col gap-5 px-5 py-4"
      >
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
              <Label htmlFor="discover-org-country">
                {t("Country coverage")}
              </Label>
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
              value={
                isIndividual ? state.individualType : state.organizationType
              }
              onChange={(value: string) =>
                updateState(
                  isIndividual
                    ? { individualType: value }
                    : { organizationType: value },
                )
              }
              optionLabel={(option) => t(option.label)}
              label={
                isIndividual
                  ? t("Professional categories")
                  : t("Organization category")
              }
              dialogTitle={
                isIndividual
                  ? t("Select professional categories")
                  : t("Select organization category")
              }
              dialogDescription={t(
                "Choose one or more canonical Discover categories. They will be saved as comma-separated keys.",
              )}
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
            {!isIndividual ? (
              <>
                <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={state.isGeneticReportProvider}
                    onChange={(event) =>
                      updateState({
                        isGeneticReportProvider: event.target.checked,
                        geneticReportCategory: event.target.checked
                          ? state.geneticReportCategory
                          : "",
                      })
                    }
                    disabled={!canManageSystemFields}
                    className="h-4 w-4"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-foreground">
                      {t("Genetic report provider")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {state.isGeneticReportProvider ? t("Yes") : t("No")}
                    </span>
                  </span>
                </label>
                {state.isGeneticReportProvider ? (
                  <PublisherCategoryMultiSelect
                    id="discover-org-genetic-report-category"
                    provider={discoverGeneticReportCategoryProvider}
                    value={state.geneticReportCategory}
                    onChange={(geneticReportCategory) =>
                      updateState({ geneticReportCategory })
                    }
                    optionLabel={(option) => t(option.label)}
                    label={t("Genetic report categories")}
                    dialogTitle={t("Select genetic report categories")}
                    dialogDescription={t(
                      "Choose one or more genetic report categories. They will be saved as comma-separated keys.",
                    )}
                    emptyLabel={t("No report categories selected")}
                    searchPlaceholder={t("Search report categories")}
                    clearLabel={t("Clear all")}
                    removeLabel={t("Remove")}
                    doneLabel={t("Done")}
                    selectedCountLabel={(count: number) =>
                      `${count} ${
                        count === 1
                          ? t("report category selected")
                          : t("report categories selected")
                      }`
                    }
                    className="md:col-span-2"
                    disabled={!canManageSystemFields}
                  />
                ) : null}
              </>
            ) : null}
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="discover-org-color">{t("Accent color")}</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  ref={colorPickerRef}
                  type="color"
                  value={colorHex || "#4F46E5"}
                  onChange={(event) =>
                    handleColorPickerChange(event.target.value)
                  }
                  className="size-10 shrink-0 cursor-pointer overflow-hidden rounded-full border border-input bg-background p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                  aria-label={t("Accent color picker")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openColorPicker}
                >
                  <Palette className="h-3.5 w-3.5" />
                  {t("Open color picker")}
                </Button>
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
                onChange={(event) =>
                  updateState({ imageUrl: event.target.value })
                }
                placeholder="https://"
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
                        onClick={() =>
                          setActiveDescriptionLanguage(option.value)
                        }
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
                onChange={(event) =>
                  updateActiveDescription(event.target.value)
                }
                rows={4}
              />
              {showEnglishDescriptionWarning ? (
                <p className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-2 text-xs font-medium text-violet-900 dark:border-violet-400/30 dark:bg-violet-500/12 dark:text-violet-100">
                  {isIndividual
                    ? t(
                        "Add an English individual publisher description to reach a broader audience.",
                      )
                    : t(
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
          </div>

          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-md border border-border bg-muted/30">
              {imagePreviewSource ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreviewSource}
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
              {!isIndividual ? (
                <>
                  <div>
                    {state.isGeneticReportProvider
                      ? t("Genetic report provider")
                      : t("Not a genetic report provider")}
                  </div>
                  {state.isGeneticReportProvider ? (
                    <div>{geneticReportCategoryLabel}</div>
                  ) : null}
                </>
              ) : null}
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

        {showDangerZone ? (
          <div
            data-testid="discover-publisher-danger-zone"
            className="rounded-md border border-destructive/20 bg-destructive/[0.03] px-4 py-4"
          >
            <button
              type="button"
              className="flex w-full min-w-0 items-start gap-3 text-left"
              onClick={() => setIsDangerZoneOpen((open) => !open)}
              aria-expanded={isDangerZoneOpen}
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-heading text-lg font-semibold text-foreground">
                    {t("Danger zone")}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isDangerZoneOpen && "rotate-180",
                    )}
                  />
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  {t(
                    "Irreversible actions that permanently delete this Discover publisher.",
                  )}
                </span>
              </span>
            </button>

            {isDangerZoneOpen ? (
              <div className="mt-4 grid gap-4 border-t border-destructive/15 pt-4 text-sm text-muted-foreground lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    {publisherDeletionTitle}
                  </h4>
                  <p className="mt-1 leading-6">{publisherDeleteDescription}</p>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-fit"
                      disabled={pending || deletePending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {publisherDeleteButtonLabel}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogMedia className="bg-destructive/12 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                      </AlertDialogMedia>
                      <AlertDialogTitle>
                        {publisherDeleteDialogTitle}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {publisherDeleteDialogDescription}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        disabled={deletePending}
                        onClick={(event) => {
                          event.preventDefault();
                          void handleDeletePublisher();
                        }}
                      >
                        {deletePending ? t("Deleting...") : t("Delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : null}
          </div>
        ) : null}

        {showSubmissionEvaluation ? (
          <div
            data-testid="discover-publisher-submission-evaluation"
            className="rounded-md border border-violet-200 bg-violet-500/[0.035] px-4 py-4 dark:border-violet-400/25 dark:bg-violet-500/10"
          >
            <button
              type="button"
              className="flex w-full min-w-0 items-start gap-3 text-left"
              onClick={() => setIsSubmissionEvaluationOpen((open) => !open)}
              aria-expanded={isSubmissionEvaluationOpen}
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/20 dark:text-violet-200">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-heading text-lg font-semibold text-foreground">
                    {t("Submission evaluation")}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isSubmissionEvaluationOpen && "rotate-180",
                    )}
                  />
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  {t(
                    "Approve to create portal access and email credentials, or reject to archive this publisher.",
                  )}
                </span>
              </span>
            </button>

            {isSubmissionEvaluationOpen ? (
              <div className="mt-4 grid gap-4 border-t border-violet-200/70 pt-4 text-sm text-muted-foreground lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start dark:border-violet-400/20">
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    {t("Approval decision")}
                  </h4>
                  <p className="mt-1 leading-6">
                    {t(
                      "Approval activates the publisher, assigns the correct publisher role, generates a new access key, and emails it as Clave de acceso.",
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || evaluationPending !== null}
                    onClick={() => void handleSubmissionEvaluation("reject")}
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {evaluationPending === "reject"
                      ? t("Rejecting...")
                      : t("Reject")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || evaluationPending !== null}
                    onClick={() => void handleSubmissionEvaluation("approve")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {evaluationPending === "approve"
                      ? t("Approving...")
                      : t("Approve")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div
        data-testid="discover-publisher-save-dock"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-0"
      >
        <div className="pointer-events-auto mx-auto md:ml-[calc(var(--sidebar-width)+1rem)] md:mr-6 lg:mr-8">
          <div className="rounded-[1.25rem] border border-border/70 bg-background/88 p-3 shadow-[0_-10px_38px_rgba(15,23,42,0.12)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/72 sm:p-4">
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
                    (!changed && !manualColorMode && !manualColorError) ||
                    pending
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
        </div>
      </div>
    </div>
  );
}

export function DiscoverOrganizationWorkbench({
  organization,
  mode = "edit",
  canManageSystemFields = true,
  canDeletePublisher = false,
  deleteSuccessAction = "list",
  routeBase,
}: {
  organization?: DiscoverOrganizationRecord;
  mode?: "create" | "edit";
  canManageSystemFields?: boolean;
  canDeletePublisher?: boolean;
  deleteSuccessAction?: DeleteSuccessAction;
  routeBase?: string;
}) {
  return (
    <DiscoverPublisherWorkbench
      publisher={organization}
      publisherKind="organization"
      mode={mode}
      canManageSystemFields={canManageSystemFields}
      canDeletePublisher={canDeletePublisher}
      deleteSuccessAction={deleteSuccessAction}
      routeBase={routeBase}
    />
  );
}

export function DiscoverIndividualWorkbench({
  individual,
  mode = "edit",
  canManageSystemFields = true,
  canDeletePublisher = false,
  deleteSuccessAction = "list",
  routeBase,
}: {
  individual?: DiscoverIndividualRecord;
  mode?: "create" | "edit";
  canManageSystemFields?: boolean;
  canDeletePublisher?: boolean;
  deleteSuccessAction?: DeleteSuccessAction;
  routeBase?: string;
}) {
  return (
    <DiscoverPublisherWorkbench
      publisher={individual}
      publisherKind="individual"
      mode={mode}
      canManageSystemFields={canManageSystemFields}
      canDeletePublisher={canDeletePublisher}
      deleteSuccessAction={deleteSuccessAction}
      routeBase={routeBase}
    />
  );
}
