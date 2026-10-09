import { notFound } from "next/navigation";
import { TwoPQFormFlow } from "@/components/two-pq-form-flow";
import { getAdminContextServer } from "@/lib/admin-context-server";
import {
  canCreateTwoPQFormType,
  getTwoPQFormTypeFromSlug,
} from "@/lib/two-pq-forms";
import {
  getTwoPQCase,
  getTwoPQForm,
  getTwoPQFormDraft,
  getTwoPQFormLookupData,
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
    caseId?: string | string[];
  }>;
}) {
  const { formKind } = await params;
  const {
    draft: draftParam,
    studyRequestFormId: studyRequestFormIdParam,
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
  const requestedStudyRequestFormId =
    formType === "sample" || formType === "withdrawal_request"
      ? one(studyRequestFormIdParam)
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
  const preselectedStudyRequest = requestedStudyRequestFormId
    ? exactStudyRequest?.id === requestedStudyRequestFormId
      ? exactStudyRequest
      : lookupData.studyRequestForms.find(
          (form) => form.id === requestedStudyRequestFormId,
        )
    : undefined;
  const canPreselectStudyRequest = Boolean(
    formType === "sample" &&
      preselectedStudyRequest?.formType === "study_request" &&
      !preselectedStudyRequest.linkedBiopsyForm,
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
