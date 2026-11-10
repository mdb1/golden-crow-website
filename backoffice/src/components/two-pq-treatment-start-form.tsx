"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Eye, Save } from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAppLanguage } from "@/components/app-language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { isRequestedStudyTestKey, REQUESTED_STUDY_TEST_OPTIONS } from "@/lib/two-pq-requested-test";
import { formatTwoPQCivilDate, getTwoPQStudySummary } from "@/lib/two-pq-study-summary";

const scheduleFields = [
  { key: "treatmentDate", label: "Treatment start date", type: "date" },
  { key: "estimatedBiopsyDate", label: "Estimated biopsy date", type: "date" },
  { key: "estimatedEmbryoCount", label: "Estimated embryos to biopsy", type: "number" },
] as const;

const transportFields = [
  { key: "pickupDate", label: "Expected pickup date", type: "date" },
  { key: "pickupWindowStart", label: "Pickup window start", type: "time" },
  { key: "pickupWindowEnd", label: "Pickup window end", type: "time" },
  { key: "pickupOrigin", label: "Pickup origin", type: "text" },
  { key: "pickupDestination", label: "Pickup destination", type: "text" },
] as const;

type PlanningFields = Record<keyof TwoPQTreatmentStartInput, string>;
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

function requestPatientName(form: TwoPQFormRecord) {
  return form.patientName || textValue(form.patientInformation.fullName) || form.selectedPatientId || "";
}

function initialFields(
  request: TwoPQFormRecord | undefined,
  draft?: Partial<TwoPQTreatmentStartInput>,
): PlanningFields {
  const institution = request?.institutionInformation;
  const origin = [
    getInstitutionAddress(institution),
    textValue(institution?.city),
    textValue(institution?.state),
    textValue(institution?.country),
  ].filter(Boolean).join(", ");
  return {
    studyType: draft?.studyType ?? (request && getTwoPQStudySummary(request)?.key) ?? "",
    treatmentDate: draft?.treatmentDate ?? request?.estimatedTreatmentDate ?? textValue(request?.requestedTest.estimatedTreatmentDate),
    estimatedBiopsyDate: draft?.estimatedBiopsyDate ?? "",
    estimatedEmbryoCount: draft?.estimatedEmbryoCount == null ? "" : String(draft.estimatedEmbryoCount),
    pickupDate: draft?.pickupDate ?? "",
    pickupWindowStart: draft?.pickupWindowStart ?? "",
    pickupWindowEnd: draft?.pickupWindowEnd ?? "",
    pickupOrigin: draft?.pickupOrigin ?? origin,
    pickupDestination: draft?.pickupDestination ?? PGFLEX_2PQ_DESTINATION,
    notes: draft?.notes ?? "",
  };
}

function withPickupGroup(fields: PlanningFields, pickup: TwoPQPickupSummary): PlanningFields {
  return {
    ...fields,
    pickupDate: pickup.pickupDate,
    pickupWindowStart: pickup.pickupWindowStart,
    pickupWindowEnd: pickup.pickupWindowEnd,
    pickupOrigin: pickup.origin,
    pickupDestination: pickup.destination,
  };
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
  const [fields, setFields] = useState(() => {
    const draftFields = initialFields(
      initialRequestsPage.forms.find((form) => form.id === initialStudyRequestId),
      initialDraft?.state.treatmentStart,
    );
    return initialPickupGroup ? withPickupGroup(draftFields, initialPickupGroup.pickup) : draftFields;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [groupsPage, setGroupsPage] = useState<TwoPQFormsPage | null>(null);
  const [groupFormId, setGroupFormId] = useState(initialPickupGroup?.id ?? "");
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [preview, setPreview] = useState<TwoPQTreatmentStartInput | null>(null);
  const selectedRequest = requestsPage.forms.find((form) => form.id === selectedId);
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
    setToast({
      id: Date.now(),
      tone: "error",
      message: error instanceof Error && error.message.trim() ? error.message : t(fallback),
    });
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

  function selectPickupGroup(id: string) {
    setGroupFormId(id);
    const pickup = pickupGroups.find((form) => form.id === id)?.pickup;
    if (pickup) setFields((current) => withPickupGroup(current, pickup));
  }

  function selectRequest(id: string) {
    setSelectedId(id);
    setGroupFormId("");
    setGroupsPage(null);
    setFields(initialFields(requestsPage.forms.find((form) => form.id === id)));
    setErrors({});
  }

  function updateField(key: keyof PlanningFields, value: string) {
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

  async function saveDraft() {
    setSavingDraft(true);
    try {
      await sdkFetch("/2pq/form-draft", {
        method: "PUT",
        body: JSON.stringify({
          formType: "treatment_start",
          currentStep: "treatmentStart",
          stepIndex: 0,
          state: {
            linkedStudyRequestFormId: selectedId,
            groupWithTreatmentStartFormId: selectedGroup?.id,
            treatmentStart: {
              ...fields,
              studyType: fields.studyType || undefined,
              estimatedEmbryoCount: fields.estimatedEmbryoCount ? Number(fields.estimatedEmbryoCount) : undefined,
              notes: normalizeObservationsValue(fields.notes),
            },
          },
        }),
      });
      setToast({ id: Date.now(), tone: "success", message: t("Draft saved.") });
    } catch (error) {
      reportError(error, "Unable to save the form draft.");
    } finally {
      setSavingDraft(false);
    }
  }

  function reviewForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    const studyType = fields.studyType;
    const estimatedEmbryoCount = Number(fields.estimatedEmbryoCount);
    if (!selectedRequest) nextErrors.studyRequest = t("Select a study request for this treatment plan.");
    if (!isRequestedStudyTestKey(studyType)) nextErrors.studyType = t("Select a study type.");
    for (const key of ["treatmentDate", "estimatedBiopsyDate", "pickupDate"] as const) {
      if (!isCivilDate(fields[key])) nextErrors[key] = t("Enter a valid date.");
    }
    if (!nextErrors.treatmentDate && !nextErrors.estimatedBiopsyDate && fields.estimatedBiopsyDate <= fields.treatmentDate) {
      nextErrors.estimatedBiopsyDate = t("The biopsy date must be after treatment starts.");
    }
    if (!Number.isSafeInteger(estimatedEmbryoCount) || estimatedEmbryoCount < 1) {
      nextErrors.estimatedEmbryoCount = t("Enter a whole number greater than zero.");
    }
    if (!nextErrors.estimatedBiopsyDate && !nextErrors.pickupDate) {
      if (isUrgentStudy(studyType) && fields.pickupDate !== fields.estimatedBiopsyDate) {
        nextErrors.pickupDate = t("Urgent studies require pickup on the biopsy date.");
      } else if (fields.pickupDate < fields.estimatedBiopsyDate) {
        nextErrors.pickupDate = t("Pickup cannot be before the biopsy date.");
      }
    }
    for (const key of ["pickupWindowStart", "pickupWindowEnd"] as const) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(fields[key])) nextErrors[key] = t("Enter a valid time.");
    }
    if (!nextErrors.pickupWindowStart && !nextErrors.pickupWindowEnd && fields.pickupWindowEnd <= fields.pickupWindowStart) {
      nextErrors.pickupWindowEnd = t("Pickup must end after it starts.");
    }
    if (!fields.pickupOrigin.trim()) nextErrors.pickupOrigin = t("Enter the pickup origin.");
    if (!fields.pickupDestination.trim()) nextErrors.pickupDestination = t("Enter the pickup destination.");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !isRequestedStudyTestKey(studyType)) return;
    setPreview({
      ...fields,
      studyType,
      estimatedEmbryoCount,
      pickupOrigin: fields.pickupOrigin.trim(),
      pickupDestination: fields.pickupDestination.trim(),
      notes: normalizeObservationsValue(fields.notes),
    });
  }

  async function saveForm() {
    if (!preview || savingForm) return;
    setSavingForm(true);
    try {
      const { form } = await sdkFetch<{ form: TwoPQFormRecord }>("/2pq/forms", {
        method: "POST",
        body: JSON.stringify({
          formType: "treatment_start",
          linkedStudyRequestFormId: selectedId,
          groupWithTreatmentStartFormId: selectedGroup?.id,
          treatmentStart: preview,
        }),
      });
      router.push(`/2pq-dashboard/forms?createdId=${encodeURIComponent(form.id)}&createdType=treatment_start`);
      router.refresh();
    } catch (error) {
      reportError(error, "Unable to store the form. Review the form and try again.");
      setSavingForm(false);
    }
  }

  function renderField(field: (typeof scheduleFields | typeof transportFields)[number]) {
    const id = `treatment-start-${field.key}`;
    return (
      <div key={field.key} className={field.type === "text" ? "space-y-2 sm:col-span-3" : "space-y-2"}>
        <Label htmlFor={id}>{t(field.label)}</Label>
        <Input
          id={id}
          type={field.type}
          required
          min={field.type === "number" ? 1 : undefined}
          step={field.type === "number" ? 1 : undefined}
          readOnly={Boolean(selectedGroup) && transportFields.some(({ key }) => key === field.key)}
          value={fields[field.key]}
          onChange={(event) => updateField(field.key, event.target.value)}
          aria-invalid={Boolean(errors[field.key])}
          aria-describedby={errors[field.key] ? `${id}-error` : undefined}
        />
        <FieldError id={`${id}-error`} message={errors[field.key]} />
      </div>
    );
  }

  const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex flex-col gap-4">
      <ActionToast toast={toast} onDismiss={() => setToast(null)} language={language} />
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/2pq-dashboard/forms">
            <ArrowLeft className="size-3.5" />
            {t("Back to forms")}
          </Link>
        </Button>
      </div>
      <form noValidate onSubmit={reviewForm} className="glass-panel flex flex-col gap-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-heading text-2xl font-semibold">{t("Treatment start form")}</h1>
          {initialDraft ? <Badge variant="rose">{t("Recovered draft")}</Badge> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="treatment-start-request">{t("Linked study request form")}</Label>
          <select
            id="treatment-start-request"
            value={selectedId}
            onChange={(event) => selectRequest(event.target.value)}
            disabled={loadingGroups}
            required
            aria-invalid={Boolean(errors.studyRequest)}
            aria-describedby={errors.studyRequest ? "treatment-start-request-error" : undefined}
            className={selectClass}
          >
            <option value="">{t("Select study request")}</option>
            {requestsPage.forms.map((form) => (
              <option key={form.id} value={form.id}>
                {[form.id, requestPatientName(form), form.institutionName || form.institutionId].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
          <FieldError id="treatment-start-request-error" message={errors.studyRequest} />
          {unavailableStudyRequest && !selectedRequest ? (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{t("The linked study request is no longer available for planning.")}</p>
          ) : null}
          {requestsPage.forms.length === 0 && !requestsPage.hasMore ? (
            <p className="text-sm text-muted-foreground">{t("No study requests are available for treatment planning.")}</p>
          ) : null}
          {requestsPage.hasMore && requestsPage.nextCursor ? (
            <Button type="button" variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {t(loadingMore ? "Loading..." : "Load more")}
            </Button>
          ) : null}
        </div>

        {selectedRequest ? (
          <>
            <dl className="grid gap-4 rounded-xl border bg-muted/25 p-4 text-sm sm:grid-cols-3">
              <SummaryField label={t("Patient")} value={requestPatientName(selectedRequest) || t("Not provided")} />
              <SummaryField label={t("Institution")} value={selectedRequest.institutionName || selectedRequest.institutionId} />
              <SummaryField label={t("Doctor")} value={textValue(selectedRequest.patientInformation.doctorName) || selectedRequest.doctorId} />
            </dl>
            <section className="space-y-3" aria-labelledby="treatment-schedule-title">
              <h2 id="treatment-schedule-title" className="font-heading font-semibold">{t("Treatment schedule")}</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="treatment-start-study">{t("Study type")}</Label>
                  <select
                    id="treatment-start-study"
                    value={fields.studyType}
                    onChange={(event) => updateField("studyType", event.target.value)}
                    required
                    aria-invalid={Boolean(errors.studyType)}
                    aria-describedby={errors.studyType ? "treatment-start-study-error" : undefined}
                    className={selectClass}
                  >
                    <option value="">{t("Select a study type.")}</option>
                    {REQUESTED_STUDY_TEST_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{t(label)}</option>)}
                  </select>
                  <FieldError id="treatment-start-study-error" message={errors.studyType} />
                </div>
                {scheduleFields.map(renderField)}
              </div>
            </section>
            <section className="space-y-3" aria-labelledby="treatment-transport-title">
              <h2 id="treatment-transport-title" className="font-heading font-semibold">{t("Planned transport")}</h2>
              {isRequestedStudyTestKey(fields.studyType) && !isUrgentStudy(fields.studyType) ? (
                <div className="space-y-2">
                  {groupsPage || initialPickupGroup ? (
                    <>
                      <Label htmlFor="treatment-pickup-group">{t("Group with a planned pickup")}</Label>
                      <select
                        id="treatment-pickup-group"
                        value={groupFormId}
                        onChange={(event) => selectPickupGroup(event.target.value)}
                        className={selectClass}
                      >
                        <option value="">{t("Plan a separate pickup")}</option>
                        {pickupGroups.map(({ id, pickup }) => (
                          <option key={id} value={id}>
                            {id} · {formatTwoPQCivilDate(pickup.pickupDate, language)} · {pickup.pickupWindowStart}–{pickup.pickupWindowEnd}
                          </option>
                        ))}
                      </select>
                      {!pickupGroups.length && groupsPage && !groupsPage.hasMore ? (
                        <p className="text-sm text-muted-foreground">{t("No eligible pickup groups were found.")}</p>
                      ) : null}
                    </>
                  ) : null}
                  {!groupsPage || groupsPage.hasMore ? (
                    <Button type="button" size="sm" variant="outline" disabled={loadingGroups} onClick={loadPickupGroups}>
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
              {fields.studyType ? (
                <p className="text-sm text-muted-foreground">
                  {t("Transport temperature")} <strong>{isUrgentStudy(fields.studyType) ? "4 °C" : "−20 °C"}</strong>
                </p>
              ) : null}
            </section>
            <div className="space-y-2">
              <Label htmlFor="treatment-start-notes">{t("Observations")}</Label>
              <Textarea id="treatment-start-notes" value={fields.notes} onChange={(event) => updateField("notes", event.target.value)} />
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={saveDraft}>
            <Save className="size-4" />
            {t(savingDraft ? "Saving draft" : "Save draft")}
          </Button>
          <Button type="submit" disabled={!selectedRequest || saving}>
            <Eye className="size-4" />
            {t("Review treatment plan")}
          </Button>
        </div>
      </form>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open && !savingForm) setPreview(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Review treatment plan")}</DialogTitle>
            <DialogDescription>
              {t("Saving this plan notifies the assigned transporter of the provisional pickup.")}
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <SummaryField label={t("Linked study request form")} value={selectedId} />
              {selectedRequest ? <SummaryField label={t("Patient")} value={requestPatientName(selectedRequest) || t("Not provided")} /> : null}
              <SummaryField label={t("Study type")} value={t(REQUESTED_STUDY_TEST_OPTIONS.find(({ value }) => value === preview.studyType)?.label ?? preview.studyType)} />
              {[...scheduleFields, ...transportFields].map(({ key, label, type }) => (
                <SummaryField key={key} label={t(label)} value={type === "date" ? formatTwoPQCivilDate(String(preview[key]), language) : String(preview[key])} />
              ))}
              <SummaryField label={t("Transport temperature")} value={isUrgentStudy(preview.studyType) ? "4 °C" : "−20 °C"} />
              {selectedGroup ? <SummaryField label={t("Group with a planned pickup")} value={selectedGroup.id} /> : null}
              <SummaryField label={t("Observations")} value={normalizeObservationsValue(preview.notes)} />
            </dl>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={savingForm} onClick={() => setPreview(null)}>{t("Edit")}</Button>
            <Button type="button" disabled={savingForm} onClick={saveForm}>
              <Save className="size-4" />
              {t(savingForm ? "Saving..." : "Save treatment plan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} role="alert" className="text-sm text-destructive">{message}</p> : null;
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}
