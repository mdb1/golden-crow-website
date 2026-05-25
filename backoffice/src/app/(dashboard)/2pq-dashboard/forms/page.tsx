import Link from "next/link";
import { Archive, ArrowLeft, ClipboardList } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { TwoPQFormCompletionDialog } from "@/components/two-pq-form-completion-dialog";
import { TwoPQFormsList } from "@/components/two-pq-forms-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTwoPQForms } from "@/lib/two-pq-server";

export default async function TwoPQFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ createdId?: string; includeArchived?: string }>;
}) {
  const { createdId, includeArchived: includeArchivedParam } = await searchParams;
  const includeArchived =
    includeArchivedParam === "1" ||
    includeArchivedParam === "true" ||
    includeArchivedParam === "yes";
  const forms = await getTwoPQForms({ includeArchived });

  return (
    <div className="flex flex-col gap-6">
      <TwoPQFormCompletionDialog createdId={createdId} />
      <PageHero
        eyebrow="2PQ"
        title="Forms"
        description="Stored 2PQ study request and sample forms."
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="section-eyebrow">2pq_forms</p>
              {includeArchived ? <Badge variant="warning">Archived visible</Badge> : null}
            </div>
            <h2 className="font-heading text-2xl font-semibold text-foreground">
              Existing stored forms
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              <ClipboardList className="mr-1 inline size-4" />
              All submitted form flows are stored as joined documents here.
            </p>
          </div>
          <Button variant={includeArchived ? "default" : "outline"} size="sm" asChild>
            <Link href={includeArchived ? "/2pq-dashboard/forms" : "/2pq-dashboard/forms?includeArchived=1"}>
              <Archive className="size-3.5" />
              {includeArchived ? "Hide archived" : "Show archived"}
            </Link>
          </Button>
        </div>
        <TwoPQFormsList forms={forms} allowMutations />
      </section>
    </div>
  );
}
