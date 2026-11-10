import { notFound } from "next/navigation";
import { TwoPQFormFlow } from "@/components/two-pq-form-flow";
import { TwoPQTreatmentStartForm } from "@/components/two-pq-treatment-start-form";
import { getAdminContextServer } from "@/lib/admin-context-server";
import {
  canCreateTwoPQFormType,
  canGroupWithTwoPQPickup,
  canPlanTreatmentForStudyRequest,
  canUseStudyRequestForBiopsy,
  getTwoPQFormTypeFromSlug,
} from "@/lib/two-pq-forms";
import {
  getTwoPQCase,
  getTwoPQForm,
  getTwoPQFormDraft,
  getTwoPQFormLookupData,
  getTwoPQFormsPage,
} from "@/lib/two-pq-server";

function one(value: string | string[] | undefined) {
  const selected = Array.isArray(value) ? value[0] : value;
  return selected?.trim() || undefined;
}

export default async function NewTwoPQFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ formKind: string }>;
  searchParams: Promise<{
    draft?: string | string[];
    studyRequestFormId?: string | string[];
    linkedStudyRequestFormId?: string | string[];
    caseId?: string | string[];
  }>;
}) {
  const { formKind } = await params;
  const {
    draft: draftParam,
    studyRequestFormId: studyRequestFormIdParam,
    linkedStudyRequestFormId: linkedStudyRequestFormIdParam,
    caseId: caseIdParam,
  } = await searchParams;
  const formType = getTwoPQFormTypeFromSlug(formKind);
  if (!formType) {
    notFound();
  }

  const adminContext = await getAdminContextServer();
  if (!canCreateTwoPQFormType(adminContext.role, formType)) {
    notFound();
  }

  const normalizedDraftParam = one(draftParam);
  const shouldRestoreDraft =
    normalizedDraftParam === "1" ||
    normalizedDraftParam === "true" ||
    normalizedDraftParam === "yes";
  const linkedStudyRequestFormId = one(linkedStudyRequestFormIdParam) ?? one(studyRequestFormIdParam);

  if (formType === "treatment_start") {
    const [requestsPage, formDraft] = await Promise.all([
      getTwoPQFormsPage({
        formType: "study_request",
        availableForTreatmentStart: true,
        limit: 20,
      }),
      shouldRestoreDraft ? getTwoPQFormDraft() : Promise.resolve(null),
    ]);
    const initialDraft = formDraft?.formType === "treatment_start" ? formDraft : null;
    const requestedId = initialDraft?.state.linkedStudyRequestFormId ?? linkedStudyRequestFormId;
    const exactRequest = requestedId
      ? requestsPage.forms.find((form) => form.id === requestedId) ??
        await getTwoPQForm(requestedId).catch(() => null)
      : null;
    const selectedRequest = exactRequest && canPlanTreatmentForStudyRequest(exactRequest)
      ? exactRequest
      : null;
    const forms = selectedRequest && !requestsPage.forms.some((form) => form.id === selectedRequest.id)
      ? [selectedRequest, ...requestsPage.forms]
      : requestsPage.forms;
    const draftStudyType = initialDraft?.state.treatmentStart.studyType;
    const groupId = draftStudyType === "pgtAStandard" || draftStudyType === "pgtSr"
      ? initialDraft?.state.groupWithTreatmentStartFormId
      : undefined;
    const group = selectedRequest && groupId
      ? await getTwoPQForm(groupId).catch(() => null)
      : null;
    const initialPickupGroup = selectedRequest && group && canGroupWithTwoPQPickup(group, selectedRequest.institutionId)
      ? group
      : null;

    return (
      <div className="flex w-full min-w-0 max-w-full flex-col overflow-x-hidden">
        <TwoPQTreatmentStartForm
          initialRequestsPage={{ ...requestsPage, forms }}
          initialDraft={initialDraft}
          initialStudyRequestId={selectedRequest?.id}
          unavailableStudyRequest={Boolean(requestedId && !selectedRequest)}
          initialPickupGroup={initialPickupGroup}
          unavailablePickupGroup={Boolean(groupId && !initialPickupGroup)}
        />
      </div>
    );
  }

  const requestedStudyRequestFormId =
    formType === "sample" || formType === "withdrawal_request"
      ? linkedStudyRequestFormId
      : undefined;
  const requestedCaseId =
    formType === "withdrawal_request" ? one(caseIdParam) : undefined;
  const [lookupData, formDraft, exactStudyRequest, exactRequestedCase] =
    await Promise.all([
      getTwoPQFormLookupData({
        includeStudyRequestForms: formType === "sample",
      }),
      shouldRestoreDraft ? getTwoPQFormDraft() : Promise.resolve(null),
      requestedStudyRequestFormId
        ? getTwoPQForm(requestedStudyRequestFormId).catch(() => null)
        : Promise.resolve(null),
      requestedCaseId
        ? getTwoPQCase(requestedCaseId).catch(() => null)
        : Promise.resolve(null),
    ]);
  const initialDraft = formDraft?.formType === formType ? formDraft : null;
  const resumeStudyRequestId = initialDraft?.formType === "sample"
    ? initialDraft.state.linkedStudyRequestFormId || requestedStudyRequestFormId
    : requestedStudyRequestFormId;
  const preselectedStudyRequest = resumeStudyRequestId
    ? exactStudyRequest?.id === resumeStudyRequestId
      ? exactStudyRequest
      : lookupData.studyRequestForms.find((form) => form.id === resumeStudyRequestId) ??
        (resumeStudyRequestId !== requestedStudyRequestFormId
          ? await getTwoPQForm(resumeStudyRequestId).catch(() => null)
          : null)
    : undefined;
  const canPreselectStudyRequest = Boolean(
    formType === "sample" &&
      preselectedStudyRequest?.formType === "study_request" &&
      canUseStudyRequestForBiopsy(preselectedStudyRequest),
  );
  const resolvedCaseId =
    requestedCaseId ??
    (formType === "withdrawal_request" &&
    preselectedStudyRequest?.formType === "study_request"
      ? (preselectedStudyRequest["2pq_case"] ?? undefined)
      : undefined);
  const exactResolvedCase =
    resolvedCaseId && exactRequestedCase?.id !== resolvedCaseId
      ? await getTwoPQCase(resolvedCaseId).catch(() => null)
      : exactRequestedCase;
  const preselectedCase = resolvedCaseId
    ? exactResolvedCase?.id === resolvedCaseId
      ? exactResolvedCase
      : lookupData.cases.find((caseRecord) => caseRecord.id === resolvedCaseId)
    : undefined;
  const studyRequestForms = canPreselectStudyRequest
    ? [
        preselectedStudyRequest!,
        ...lookupData.studyRequestForms.filter(
          (form) => form.id !== preselectedStudyRequest!.id,
        ),
      ]
    : lookupData.studyRequestForms;
  const cases = preselectedCase
    ? [
        preselectedCase,
        ...lookupData.cases.filter(
          (caseRecord) => caseRecord.id !== preselectedCase.id,
        ),
      ]
    : lookupData.cases;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <TwoPQFormFlow
        formType={formType}
        institutions={lookupData.institutions}
        doctors={lookupData.doctors}
        patients={lookupData.patients}
        cases={cases}
        studyRequestForms={studyRequestForms}
        initialDraft={initialDraft}
        initialLinkedStudyRequestFormId={
          canPreselectStudyRequest ? preselectedStudyRequest?.id : undefined
        }
        initialWithdrawalCaseId={preselectedCase?.id}
      />
    </div>
  );
}
