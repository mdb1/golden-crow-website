import { notFound } from "next/navigation";
import { TwoPQFormFlow } from "@/components/two-pq-form-flow";
import { getTwoPQFormTypeFromSlug } from "@/lib/two-pq-forms";
import { getTwoPQFormLookupData } from "@/lib/two-pq-server";

export default async function NewTwoPQFormPage({
  params,
}: {
  params: Promise<{ formKind: string }>;
}) {
  const { formKind } = await params;
  const formType = getTwoPQFormTypeFromSlug(formKind);
  if (!formType) {
    notFound();
  }

  const lookupData = await getTwoPQFormLookupData();

  return (
    <div className="flex flex-col">
      <TwoPQFormFlow
        formType={formType}
        institutions={lookupData.institutions}
        doctors={lookupData.doctors}
        patients={lookupData.patients}
        cases={lookupData.cases}
      />
    </div>
  );
}
