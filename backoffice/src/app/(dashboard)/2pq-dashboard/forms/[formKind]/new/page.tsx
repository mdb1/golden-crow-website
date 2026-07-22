import { notFound } from "next/navigation";
import { TwoPQFormFlow } from "@/components/two-pq-form-flow";
import { getTwoPQFormTypeFromSlug } from "@/lib/two-pq-forms";
import { getTwoPQFormDraft, getTwoPQFormLookupData } from "@/lib/two-pq-server";

export default async function NewTwoPQFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ formKind: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const { formKind } = await params;
  const { draft: draftParam } = await searchParams;
  const formType = getTwoPQFormTypeFromSlug(formKind);
  if (!formType) {
    notFound();
  }

  const shouldRestoreDraft =
    draftParam === "1" || draftParam === "true" || draftParam === "yes";
  const [lookupData, formDraft] = await Promise.all([
    getTwoPQFormLookupData({
      includeStudyRequestForms: formType === "sample",
    }),
    shouldRestoreDraft ? getTwoPQFormDraft() : Promise.resolve(null),
  ]);
  const initialDraft = formDraft?.formType === formType ? formDraft : null;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <TwoPQFormFlow
        formType={formType}
        institutions={lookupData.institutions}
        doctors={lookupData.doctors}
        patients={lookupData.patients}
        cases={lookupData.cases}
        studyRequestForms={lookupData.studyRequestForms}
        initialDraft={initialDraft}
      />
    </div>
  );
}
