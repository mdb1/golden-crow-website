import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { TwoPQFormFlow } from "@/components/two-pq-form-flow";
import { Button } from "@/components/ui/button";
import {
  TWO_PQ_FORM_LABELS,
  getTwoPQFormTypeFromSlug,
} from "@/lib/two-pq-forms";
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
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ Forms"
        title={TWO_PQ_FORM_LABELS[formType]}
        description="Complete each step and store the joined form payload in 2pq_forms."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/2pq-dashboard">
              <ArrowLeft className="size-3.5" />
              Back to dashboard
            </Link>
          </Button>
        }
      />
      <TwoPQFormFlow
        formType={formType}
        institutions={lookupData.institutions}
        doctors={lookupData.doctors}
        patients={lookupData.patients}
      />
    </div>
  );
}
