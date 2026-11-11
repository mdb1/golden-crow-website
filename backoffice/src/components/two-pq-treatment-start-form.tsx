"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, FileText, MapPin, Save } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAppLanguage } from "@/components/app-language-provider";
import { OptionSelectField } from "@/components/constrained-fields";
import {
  PGFLEX_ROUTE_ORIGIN_COUNTRY,
  PGFlexRouteOriginFields,
  composePGFlexRouteOrigin,
  normalizePGFlexRouteOriginProvinceDistrict,
  splitPGFlexRouteOrigin,
  validatePGFlexRouteOriginParts,
  type PGFlexRouteOriginParts,
} from "@/components/pgflex-route-preview";
import {
  PreviewPaperSection,
  TWO_PQ_WIZARD_PANEL_CLASS,
  TWO_PQ_WIZARD_PRIMARY_BUTTON_CLASS,
  TWO_PQ_WIZARD_SUBMIT_BUTTON_CLASS,
  TWO_PQ_WIZARD_SUBMIT_PANEL_CLASS,
  TwoPQFormPreviewPaper,
  TwoPQFormWizardHeader,
} from "@/components/two-pq-form-wizard";
import { StudyRequestSelectionTable } from "@/components/two-pq-study-request-selection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getInstitutionAddress } from "@/lib/admin-areas";
import { appText } from "@/lib/language";
import { PGFLEX_2PQ_DESTINATION } from "@/lib/pgflex-logistics";
import { sdkFetch } from "@/lib/sdk-client";
import {
  canGroupWithTwoPQPickup,
  normalizeObservationsValue,
  type TwoPQFormRecord,
  type TwoPQFormsPage,
  type TwoPQPickupSummary,
  type TwoPQTreatmentStartDraftRecord,
  type TwoPQTreatmentStartInput,
} from "@/lib/two-pq-forms";
import {
  isRequestedStudyTestKey,
  REQUESTED_STUDY_TEST_OPTIONS,
} from "@/lib/two-pq-requested-test";
import { formatTwoPQCivilDate, getTwoPQStudySummary } from "@/lib/two-pq-study-summary";

const steps = [
  { key: "linkedStudyRequest", label: "Linked study request form" },
  { key: "treatmentStart", label: "Treatment schedule" },
  { key: "plannedTransport", label: "Planned transport" },
  { key: "preview", label: "Preview" },
] as const satisfies readonly {
  key: TwoPQTreatmentStartDraftRecord["currentStep"];
  label: string;
}[];

const scheduleFields = [
  { key: "treatmentDate", label: "Treatment start date", type: "date" },
  { key: "estimatedBiopsyDate", label: "Estimated biopsy date", type: "date" },
  { key: "estimatedEmbryoCount", label: "Estimated embryos to biopsy", type: "number" },
] as const;

const transportFields = [
  { key: "pickupDate", label: "Expected pickup date", type: "date" },
  { key: "pickupWindowStart", label: "Pickup window start", type: "time" },
  { key: "pickupWindowEnd", label: "Pickup window end", type: "time" },
] as const;

type Step = (typeof steps)[number]["key"];
type PlanningField = Exclude<keyof TwoPQTreatmentStartInput, "pickupOrigin" | "pickupDestination">;
type PlanningFields = Record<PlanningField, string> & { pickupOrigin: PGFlexRouteOriginParts };
type FieldErrors = Partial<Record<keyof PlanningFields | "studyRequest", string>>;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUrgentStudy(studyType: string) {
  return studyType === "pgtAUltraFast" || studyType === "pgtAFast";
}

function isCivilDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function initialFields(
  request: TwoPQFormRecord | undefined,
  draftState?: TwoPQTreatmentStartDraftRecord["state"],
): PlanningFields {
  const institution = request?.institutionInformation;
  const draft = draftState?.treatmentStart;
  const studyType = draft?.studyType ?? (request && getTwoPQStudySummary(request)?.key) ?? "";
  const estimatedBiopsyDate = draft?.estimatedBiopsyDate ?? "";
  return {
    studyType,
    treatmentDate: draft?.treatmentDate ?? request?.estimatedTreatmentDate ?? textValue(request?.requestedTest.estimatedTreatmentDate),
    estimatedBiopsyDate,
    estimatedEmbryoCount: draft?.estimatedEmbryoCount == null ? "" : String(draft.estimatedEmbryoCount),
    pickupDate: isUrgentStudy(studyType) ? estimatedBiopsyDate : draft?.pickupDate ?? "",
    pickupWindowStart: draft?.pickupWindowStart ?? "",
    pickupWindowEnd: draft?.pickupWindowEnd ?? "",
    pickupOrigin: draftState?.pickupOriginParts ?? (draft?.pickupOrigin
      ? splitPGFlexRouteOrigin(draft.pickupOrigin)
      : {
          address: getInstitutionAddress(institution),
          locality: textValue(institution?.city),
          provinceDistrict: normalizePGFlexRouteOriginProvinceDistrict(textValue(institution?.state)),
          country: PGFLEX_ROUTE_ORIGIN_COUNTRY,
        }),
    notes: draft?.notes ?? "",
  };
}

function withPickupGroup(fields: PlanningFields, pickup: TwoPQPickupSummary): PlanningFields {
  return {
    ...fields,
    pickupDate: pickup.pickupDate,
    pickupWindowStart: pickup.pickupWindowStart,
    pickupWindowEnd: pickup.pickupWindowEnd,
    pickupOrigin: splitPGFlexRouteOrigin(pickup.origin),
  };
}

function validateStep(step: Step, fields: PlanningFields, selectedRequest?: TwoPQFormRecord): FieldErrors {
  if (step === "linkedStudyRequest") {
    return selectedRequest ? {} : { studyRequest: "Select a study request for this treatment plan." };
  }

  const errors: FieldErrors = {};
  if (step === "treatmentStart") {
    if (!isRequestedStudyTestKey(fields.studyType)) errors.studyType = "Select a study type.";
    if (!isCivilDate(fields.treatmentDate)) errors.treatmentDate = "Enter a valid date.";
    if (!isCivilDate(fields.estimatedBiopsyDate)) {
      errors.estimatedBiopsyDate = "Enter a valid date.";
    } else if (!errors.treatmentDate && fields.estimatedBiopsyDate <= fields.treatmentDate) {
      errors.estimatedBiopsyDate = "The biopsy date must be after treatment starts.";
    }
    const count = Number(fields.estimatedEmbryoCount);
    if (!Number.isSafeInteger(count) || count < 1) {
      errors.estimatedEmbryoCount = "Enter a whole number greater than zero.";
    }
  }

  if (step === "plannedTransport") {
    if (!isCivilDate(fields.pickupDate)) {
      errors.pickupDate = "Enter a valid date.";
    } else if (isUrgentStudy(fields.studyType) && fields.pickupDate !== fields.estimatedBiopsyDate) {
      errors.pickupDate = "Urgent studies require pickup on the biopsy date.";
    } else if (fields.pickupDate < fields.estimatedBiopsyDate) {
      errors.pickupDate = "Pickup cannot be before the biopsy date.";
    }
    for (const key of ["pickupWindowStart", "pickupWindowEnd"] as const) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(fields[key])) errors[key] = "Enter a valid time.";
    }
    if (!errors.pickupWindowStart && !errors.pickupWindowEnd && fields.pickupWindowEnd <= fields.pickupWindowStart) {
      errors.pickupWindowEnd = "Pickup must end after it starts.";
    }
    const addressError = validatePGFlexRouteOriginParts(fields.pickupOrigin);
    if (addressError) errors.pickupOrigin = addressError;
  }
  return errors;
}

function initialStepIndex(
  draft: TwoPQTreatmentStartDraftRecord | null,
  fields: PlanningFields,
  request?: TwoPQFormRecord,
) {
  if (!draft || !request) return 0;
  const savedIndex = steps.findIndex(({ key }) => key === draft.currentStep);
  const firstInvalid = steps.findIndex(({ key }) => Object.keys(validateStep(key, fields, request)).length > 0);
  return Math.min(Math.max(savedIndex, 0), firstInvalid < 0 ? steps.length - 1 : firstInvalid);
}

export function TwoPQTreatmentStartForm({
  initialRequestsPage,
  initialDraft,
  initialStudyRequestId,
  unavailableStudyRequest,
  initialPickupGroup,
  unavailablePickupGroup,
}: {
  initialRequestsPage: TwoPQFormsPage;
  initialDraft: TwoPQTreatmentStartDraftRecord | null;
  initialStudyRequestId?: string;
  unavailableStudyRequest: boolean;
  initialPickupGroup: (TwoPQFormRecord & { pickup: TwoPQPickupSummary }) | null;
  unavailablePickupGroup: boolean;
}) {
  const { language } = useAppLanguage();
  const t = (label: string) => appText(language, label);
  const router = useRouter();
  const [requestsPage, setRequestsPage] = useState(initialRequestsPage);
  const [selectedId, setSelectedId] = useState(initialStudyRequestId ?? "");
  const selectedRequest = requestsPage.forms.find((form) => form.id === selectedId);
  const [fields, setFields] = useState(() => {
    const draftFields = initialFields(selectedRequest, initialDraft?.state);
    return initialPickupGroup ? withPickupGroup(draftFields, initialPickupGroup.pickup) : draftFields;
  });
  const [stepIndex, setStepIndex] = useState(() => initialStepIndex(initialDraft, fields, selectedRequest));
  const [furthestStep, setFurthestStep] = useState(stepIndex);
  const [invalidStep, setInvalidStep] = useState<Step | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [groupsPage, setGroupsPage] = useState<TwoPQFormsPage | null>(null);
  const [groupFormId, setGroupFormId] = useState(initialPickupGroup?.id ?? "");
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const currentStep = steps[stepIndex]!.key;
  const isPreview = currentStep === "preview";
  const isUrgent = isUrgentStudy(fields.studyType);
  const temperature = isUrgent ? "4 °C" : "−20 °C";
  const studyOptions = REQUESTED_STUDY_TEST_OPTIONS.map(({ value, label }) => ({ value, label: t(label) }));
  const patientName = selectedRequest?.patientName || textValue(selectedRequest?.patientInformation.fullName) || t("Not provided");
  const institutionName = selectedRequest?.institutionName || selectedRequest?.institutionId || t("Not provided");
  const doctorName = textValue(selectedRequest?.patientInformation.doctorName) || selectedRequest?.doctorId || t("Not provided");
  const pickupGroups = selectedRequest
    ? [...(initialPickupGroup ? [initialPickupGroup] : []), ...(groupsPage?.forms ?? [])]
      .filter((form): form is TwoPQFormRecord & { pickup: TwoPQPickupSummary } =>
        canGroupWithTwoPQPickup(form, selectedRequest.institutionId),
      )
      .filter((form, index, forms) => forms.findIndex((entry) => entry.pickup.id === form.pickup.id) === index)
    : [];
  const selectedGroup = pickupGroups.find((form) => form.id === groupFormId);
  const saving = savingDraft || savingForm;

  function reportError(error: unknown, fallback: string) {
    const message = error instanceof Error && error.message.trim() ? error.message : fallback;
    setToast({ id: Date.now(), tone: "error", message: t(message) });
  }

  async function loadMore() {
    if (!requestsPage.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        formType: "study_request",
        availableForTreatmentStart: "1",
        limit: "20",
        cursor: requestsPage.nextCursor,
      });
      const page = await sdkFetch<TwoPQFormsPage>(`/2pq/forms?${params}`);
      setRequestsPage((current) => ({
        ...page,
        forms: [...new Map([...current.forms, ...page.forms].map((form) => [form.id, form])).values()],
      }));
    } catch (error) {
      reportError(error, "Unable to load study requests.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadPickupGroups() {
    if (!selectedRequest || loadingGroups) return;
    setLoadingGroups(true);
    try {
      const params = new URLSearchParams({
        formType: "treatment_start",
        institution: selectedRequest.institutionId,
        limit: "20",
      });
      if (groupsPage?.nextCursor) params.set("cursor", groupsPage.nextCursor);
      const page = await sdkFetch<TwoPQFormsPage>(`/2pq/forms?${params}`);
      setGroupsPage((current) => ({ ...page, forms: [...(current?.forms ?? []), ...page.forms] }));
    } catch (error) {
      reportError(error, "Unable to load planned pickups.");
    } finally {
      setLoadingGroups(false);
    }
  }

  function selectRequest(id: string) {
    if (id === selectedId || saving) return;
    setSelectedId(id);
    setGroupFormId("");
    setGroupsPage(null);
    setFields(initialFields(requestsPage.forms.find((form) => form.id === id)));
    setFurthestStep(0);
    setInvalidStep(null);
    setErrors({});
  }

  function selectPickupGroup(id: string) {
    setGroupFormId(id);
    const pickup = pickupGroups.find((form) => form.id === id)?.pickup;
    if (pickup) setFields((current) => withPickupGroup(current, pickup));
    setErrors({});
  }

  function updateField(key: PlanningField, value: string) {
    if (key === "studyType" && (!isRequestedStudyTestKey(value) || isUrgentStudy(value))) {
      setGroupFormId("");
    }
    setFields((current) => {
      const next = { ...current, [key]: value };
      if ((key === "estimatedBiopsyDate" || key === "studyType") && isUrgentStudy(next.studyType)) {
        next.pickupDate = next.estimatedBiopsyDate;
      }
      return next;
    });
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function draftTreatmentStart(): Partial<TwoPQTreatmentStartInput> {
    const { pickupOrigin, studyType, estimatedEmbryoCount, notes, ...schedule } = fields;
    return {
      ...schedule,
      studyType: isRequestedStudyTestKey(studyType) ? studyType : undefined,
      estimatedEmbryoCount: estimatedEmbryoCount ? Number(estimatedEmbryoCount) : undefined,
      pickupOrigin: composePGFlexRouteOrigin(pickupOrigin),
      pickupDestination: PGFLEX_2PQ_DESTINATION,
      notes: normalizeObservationsValue(notes),
    };
  }

  async function saveDraft(index: number, showSuccess = false) {
    setSavingDraft(true);
    try {
      await sdkFetch("/2pq/form-draft", {
        method: "PUT",
        body: JSON.stringify({
          formType: "treatment_start",
          currentStep: steps[index]!.key,
          stepIndex: index,
          state: {
            linkedStudyRequestFormId: selectedId,
            groupWithTreatmentStartFormId: selectedGroup?.id,
            treatmentStart: draftTreatmentStart(),
            pickupOriginParts: fields.pickupOrigin,
          },
        }),
      });
      if (showSuccess) setToast({ id: Date.now(), tone: "success", message: t("Draft saved.") });
      return true;
    } catch (error) {
      reportError(error, "Unable to save the form draft.");
      return false;
    } finally {
      setSavingDraft(false);
    }
  }

  function checkPreviousSteps(nextIndex: number) {
    for (let index = 0; index < nextIndex; index++) {
      const step = steps[index]!.key;
      const nextErrors = validateStep(step, fields, selectedRequest);
      if (Object.keys(nextErrors).length === 0) continue;
      setStepIndex(index);
      setInvalidStep(step);
      setErrors(nextErrors);
      return false;
    }
    setInvalidStep(null);
    setErrors({});
    return true;
  }

  async function selectStep(nextIndex: number) {
    if (saving || loadingGroups || nextIndex === stepIndex) return;
    if (nextIndex > stepIndex && !checkPreviousSteps(nextIndex)) return;
    if (await saveDraft(nextIndex)) {
      setErrors({});
      setStepIndex(nextIndex);
      setFurthestStep((current) => Math.max(current, nextIndex));
    }
  }

  async function saveForm() {
    if (saving || !checkPreviousSteps(steps.length - 1)) return;
    setSavingForm(true);
    try {
      const { form } = await sdkFetch<{ form: TwoPQFormRecord }>("/2pq/forms", {
        method: "POST",
        body: JSON.stringify({
          formType: "treatment_start",
          linkedStudyRequestFormId: selectedId,
          groupWithTreatmentStartFormId: selectedGroup?.id,
          treatmentStart: draftTreatmentStart(),
        }),
      });
      router.push(`/2pq-dashboard/forms?createdId=${encodeURIComponent(form.id)}&createdType=treatment_start`);
      router.refresh();
    } catch (error) {
      reportError(error, "Unable to store the form. Review the form and try again.");
      setSavingForm(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPreview) void saveForm();
    else void selectStep(stepIndex + 1);
  }

  function renderField(field: (typeof scheduleFields | typeof transportFields)[number]) {
    const id = `treatment-start-${field.key}`;
    const error = errors[field.key];
    const locked = currentStep === "plannedTransport" && (Boolean(selectedGroup) || (isUrgent && field.key === "pickupDate"));
    return (
      <div key={field.key} className="space-y-2">
        <Label htmlFor={id}>{t(field.label)}</Label>
        <Input
          id={id}
          type={field.type}
          required
          min={field.type === "number" ? 1 : undefined}
          step={field.type === "number" ? 1 : undefined}
          readOnly={locked}
          className={locked ? "bg-muted/55 text-muted-foreground" : undefined}
          value={fields[field.key]}
          onChange={(event) => updateField(field.key, event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <FieldError id={`${id}-error`} message={error ? t(error) : undefined} />
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-5 overflow-x-hidden">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} language={language} />
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/2pq-dashboard/forms">
            <ArrowLeft className="size-3.5" />
            {t("Back to forms")}
          </Link>
        </Button>
      </div>

      <form noValidate onSubmit={handleSubmit} className={TWO_PQ_WIZARD_PANEL_CLASS}>
        <TwoPQFormWizardHeader
          title={t("Treatment start form")}
          progressLabel={`${stepIndex + 1} ${t("of")} ${steps.length}`}
          steps={steps.map(({ key, label }, index) => ({
            key,
            label: t(label),
            status: invalidStep === key ? "invalid" : index < furthestStep && !Object.keys(validateStep(key, fields, selectedRequest)).length ? "valid" : undefined,
          }))}
          activeIndex={stepIndex}
          onSelectStep={(index) => void selectStep(index)}
          restoredLabel={initialDraft ? t("Recovered draft") : undefined}
          savingLabel={savingDraft ? t("Saving draft") : undefined}
          disabled={saving || loadingGroups}
          stepsClassName="sm:grid-cols-2 xl:grid-cols-4"
        />

        {currentStep === "linkedStudyRequest" ? (
          <div className="space-y-4">
            {unavailableStudyRequest && !selectedRequest ? (
              <p role="alert" className="rounded-xl border border-amber-300/60 px-4 py-3 text-sm">
                {t("The linked study request is no longer available for planning.")}
              </p>
            ) : null}
            <StudyRequestSelectionTable
              forms={requestsPage.forms}
              selectedFormId={selectedId}
              onSelect={selectRequest}
              language={language}
              emptyMessage={t("No study requests are available for treatment planning.")}
              error={errors.studyRequest ? t(errors.studyRequest) : undefined}
            />
            {requestsPage.hasMore && requestsPage.nextCursor ? (
              <Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loadingMore || saving}>
                {t(loadingMore ? "Loading..." : "Load more")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {currentStep === "treatmentStart" ? (
          <div className="space-y-5">
            <dl className="grid gap-4 sm:grid-cols-3">
              <SummaryField label={t("Patient")} value={patientName} />
              <SummaryField label={t("Institution")} value={institutionName} />
              <SummaryField label={t("Doctor")} value={doctorName} />
            </dl>
            <section className="space-y-4 border-y border-border/70 py-5">
              <h3 className="font-heading text-lg font-semibold">{t("Treatment schedule")}</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="treatment-start-study">{t("Study type")}</Label>
                  <OptionSelectField
                    id="treatment-start-study"
                    options={studyOptions}
                    value={fields.studyType}
                    onChange={(value) => updateField("studyType", value)}
                    placeholder={t("Select a study type.")}
                    emptyLabel={t("Select a study type.")}
                  />
                  <FieldError message={errors.studyType ? t(errors.studyType) : undefined} />
                </div>
                {scheduleFields.map(renderField)}
              </div>
            </section>
          </div>
        ) : null}

        {currentStep === "plannedTransport" ? (
          <div className="space-y-5">
            <section className="space-y-4 border-b border-border/70 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-heading text-lg font-semibold">{t("Planned transport")}</h3>
                <Badge variant="outline">{t("Transport temperature")} · {temperature}</Badge>
              </div>
              {!isUrgent ? (
                <div className="space-y-3">
                  {groupsPage || initialPickupGroup ? (
                    <div className="space-y-2">
                      <Label htmlFor="treatment-pickup-group">{t("Group with a planned pickup")}</Label>
                      <OptionSelectField
                        id="treatment-pickup-group"
                        options={pickupGroups.map(({ id, pickup }) => ({
                          value: id,
                          label: `${id} · ${formatTwoPQCivilDate(pickup.pickupDate, language)} · ${pickup.pickupWindowStart}–${pickup.pickupWindowEnd}`,
                        }))}
                        value={selectedGroup?.id ?? ""}
                        onChange={selectPickupGroup}
                        placeholder={t("Plan a separate pickup")}
                        emptyLabel={t("Plan a separate pickup")}
                        disabled={loadingGroups}
                      />
                      {!pickupGroups.length && groupsPage && !groupsPage.hasMore ? (
                        <p className="text-sm text-muted-foreground">{t("No eligible pickup groups were found.")}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {!groupsPage || groupsPage.hasMore ? (
                    <Button type="button" size="sm" variant="outline" disabled={loadingGroups} onClick={() => void loadPickupGroups()}>
                      {t(loadingGroups ? "Loading..." : groupsPage ? "Load more" : "Find planned pickup groups")}
                    </Button>
                  ) : null}
                  {unavailablePickupGroup && !selectedGroup ? (
                    <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{t("The saved pickup group is no longer available.")}</p>
                  ) : null}
                  {selectedGroup ? (
                    <p className="text-sm text-muted-foreground">{t("The grouped pickup can be confirmed once all its biopsies are saved.")}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-3">{transportFields.map(renderField)}</div>
            </section>
            <PGFlexRouteOriginFields
              idPrefix="treatment-start-origin"
              legend={t("Pickup origin")}
              parts={fields.pickupOrigin}
              onChange={(pickupOrigin) => {
                setFields((current) => ({ ...current, pickupOrigin }));
                setErrors((current) => ({ ...current, pickupOrigin: undefined }));
              }}
              disabled={Boolean(selectedGroup)}
              translate={t}
            />
            <FieldError message={errors.pickupOrigin ? t(errors.pickupOrigin) : undefined} />
            <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/60 px-4 py-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
              <dl>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">{t("Pickup destination")}</dt>
                <dd className="mt-1 text-sm font-medium">{PGFLEX_2PQ_DESTINATION}</dd>
              </dl>
            </div>
            <div className="space-y-2">
              <Label htmlFor="treatment-start-notes">{t("Observations")}</Label>
              <Textarea id="treatment-start-notes" value={fields.notes} onChange={(event) => updateField("notes", event.target.value)} />
            </div>
          </div>
        ) : null}

        {isPreview ? (
          <div className="space-y-6">
            <TwoPQFormPreviewPaper
              title={t("Treatment start form preview")}
              description={t("Go back to the previous steps to make changes before sending this form.")}
            >
              <PreviewPaperSection section={{
                title: t("Linked study request form"),
                fields: [
                  { label: t("Study request"), value: selectedId },
                  { label: t("Patient"), value: patientName },
                  { label: t("Institution"), value: institutionName },
                  { label: t("Doctor"), value: doctorName },
                ],
              }} />
              <PreviewPaperSection section={{
                title: t("Treatment schedule"),
                fields: [
                  { label: t("Study type"), value: studyOptions.find(({ value }) => value === fields.studyType)?.label ?? fields.studyType },
                  ...scheduleFields.map(({ key, label, type }) => ({
                    label: t(label),
                    value: type === "date" ? formatTwoPQCivilDate(fields[key], language) : fields[key],
                  })),
                ],
              }} />
              <PreviewPaperSection section={{
                title: t("Planned transport"),
                fields: [
                  { label: t("Expected pickup date"), value: formatTwoPQCivilDate(fields.pickupDate, language) },
                  { label: t("Pickup window"), value: `${fields.pickupWindowStart}–${fields.pickupWindowEnd}` },
                  { label: t("Transport temperature"), value: temperature },
                  ...(selectedGroup ? [{ label: t("Group with a planned pickup"), value: selectedGroup.id }] : []),
                  { label: t("Pickup origin"), value: composePGFlexRouteOrigin(fields.pickupOrigin), wide: true },
                  { label: t("Pickup destination"), value: PGFLEX_2PQ_DESTINATION, wide: true },
                  { label: t("Observations"), value: normalizeObservationsValue(fields.notes), wide: true },
                ],
              }} />
            </TwoPQFormPreviewPaper>

            <div className={TWO_PQ_WIZARD_SUBMIT_PANEL_CLASS}>
              <div className="mb-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={saving} onClick={() => void selectStep(stepIndex - 1)}>
                  <ArrowLeft className="size-4" />
                  {t("Previous")}
                </Button>
                <Button type="button" variant="outline" disabled={saving} onClick={() => void saveDraft(stepIndex, true)}>
                  <Save className="size-4" />
                  {t("Save draft")}
                </Button>
              </div>
              <p className="text-sm leading-6 text-indigo-950/78 dark:text-indigo-50/78">
                {t("Saving this plan notifies the assigned transporter of the provisional pickup.")}
              </p>
              <Button type="submit" disabled={saving} className={TWO_PQ_WIZARD_SUBMIT_BUTTON_CLASS}>
                {savingForm ? <FileText className="size-5 animate-pulse" /> : <Save className="size-5" />}
                {t(savingForm ? "Sending..." : "Save treatment plan")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedRequest ? `${institutionName} · ${doctorName}` : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving || loadingGroups || stepIndex === 0} onClick={() => void selectStep(stepIndex - 1)}>
                <ArrowLeft className="size-4" />
                {t("Previous")}
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => void saveDraft(stepIndex, true)}>
                <Save className="size-4" />
                {t("Save draft")}
              </Button>
              <Button type="submit" disabled={saving || loadingGroups || !selectedRequest} className={`min-h-11 ${TWO_PQ_WIZARD_PRIMARY_BUTTON_CLASS}`}>
                {t(currentStep === "plannedTransport" ? "Continue to preview" : "Continue")}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  return message ? <p id={id} role="alert" className="text-sm text-destructive">{message}</p> : null;
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-background/60 px-4 py-3">
      <dt className="text-xs font-semibold uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}
