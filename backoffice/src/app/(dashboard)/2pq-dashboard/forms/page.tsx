import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { TwoPQFormsList } from "@/components/two-pq-forms-list";
import { Button } from "@/components/ui/button";
import { getTwoPQForms } from "@/lib/two-pq-server";

export default async function TwoPQFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ createdId?: string }>;
}) {
  const { createdId } = await searchParams;
  const forms = await getTwoPQForms();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="2PQ"
        title="Forms"
        description={
          createdId
            ? `Stored form ${createdId} in 2pq_forms.`
            : "Stored 2PQ study request and sample forms."
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/2pq-dashboard">
              <ArrowLeft className="size-3.5" />
              Back to dashboard
            </Link>
          </Button>
        }
      />

      <section className="glass-panel flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-1">
          <p className="section-eyebrow">2pq_forms</p>
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            Existing stored forms
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            <ClipboardList className="mr-1 inline size-4" />
            All submitted form flows are stored as joined documents here.
          </p>
        </div>
        <TwoPQFormsList forms={forms} />
      </section>
    </div>
  );
}
