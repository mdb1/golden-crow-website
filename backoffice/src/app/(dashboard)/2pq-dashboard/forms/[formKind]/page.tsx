import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { TwoPQFormDetail } from "@/components/two-pq-form-detail";
import { Button } from "@/components/ui/button";
import { TWO_PQ_FORM_LABELS, type TwoPQFormRecord } from "@/lib/two-pq-forms";
import { getTwoPQForm } from "@/lib/two-pq-server";

export default async function TwoPQFormDetailPage({
  params,
}: {
  params: Promise<{ formKind: string }>;
}) {
  const { formKind } = await params;

  let form: TwoPQFormRecord;
  try {
    form = await getTwoPQForm(formKind);
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ Forms"
        title={form.patientName ?? form.id}
        description={`${TWO_PQ_FORM_LABELS[form.formType]} stored in 2pq_forms.`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/2pq-dashboard/forms">
              <ArrowLeft className="size-3.5" />
              Back to forms
            </Link>
          </Button>
        }
      />
      <TwoPQFormDetail form={form} />
    </div>
  );
}
