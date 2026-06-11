import Link from "next/link";
import { ArrowLeft, ClipboardList, FileClock } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { TwoPQFormCompletionDialog } from "@/components/two-pq-form-completion-dialog";
import { TwoPQFormsList } from "@/components/two-pq-forms-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TWO_PQ_FORM_LABELS,
  TWO_PQ_FORM_ROUTES,
  type TwoPQFormsOrder,
  type TwoPQFormType,
} from "@/lib/two-pq-forms";
import { getTwoPQFormDraft, getTwoPQFormsPage } from "@/lib/two-pq-server";

const FORMS_PAGE_SIZE = 20;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formTypeFromParam(value: string | string[] | undefined): TwoPQFormType | undefined {
  const normalized = one(value);
  return normalized === "study_request" || normalized === "sample"
    ? normalized
    : undefined;
}

function orderFromParam(value: string | string[] | undefined): TwoPQFormsOrder {
  return one(value) === "oldest" ? "oldest" : "newest";
}

export default async function TwoPQFormsPage({
  searchParams,
}: {
  searchParams: Promise<{
    createdId?: string;
    includeArchived?: string;
    formType?: string;
    search?: string;
    createdFrom?: string;
    createdTo?: string;
    order?: string;
  }>;
}) {
  const {
    createdId,
    includeArchived: includeArchivedParam,
    formType: formTypeParam,
    search,
    createdFrom,
    createdTo,
    order,
  } = await searchParams;
  const includeArchived =
    includeArchivedParam === "1" ||
    includeArchivedParam === "true" ||
    includeArchivedParam === "yes";
  const formType = formTypeFromParam(formTypeParam);
  const formsOrder = orderFromParam(order);
  const initialFilters = {
    includeArchived,
    formType: formType ?? "all",
    search: search ?? "",
    createdFrom: createdFrom ?? "",
    createdTo: createdTo ?? "",
    order: formsOrder,
  } as const;
  const [formsPage, formDraft] = await Promise.all([
    getTwoPQFormsPage({
      includeArchived,
      formType,
      limit: FORMS_PAGE_SIZE,
      search,
      createdFrom,
      createdTo,
      order: formsOrder,
    }),
    getTwoPQFormDraft(),
  ]);
  const draftHref = formDraft
    ? `${TWO_PQ_FORM_ROUTES[formDraft.formType]}?draft=1`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <TwoPQFormCompletionDialog createdId={createdId} />
      <PageHero
        eyebrow="2PQ"
        title="Forms"
        description="Stored 2PQ study request and sample forms."
        actions={
          <>
            {formDraft && draftHref ? (
              <Button variant="default" size="sm" asChild>
                <Link href={draftHref}>
                  <FileClock className="size-3.5" />
                  Continue from draft
                  <span className="sr-only">
                    {" "}
                    {TWO_PQ_FORM_LABELS[formDraft.formType]}
                  </span>
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href="/2pq-dashboard">
                <ArrowLeft className="size-3.5" />
                Back to dashboard
              </Link>
            </Button>
          </>
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
        </div>
        <TwoPQFormsList
          forms={formsPage.forms}
          initialCursor={formsPage.nextCursor}
          initialHasMore={formsPage.hasMore}
          initialFilters={initialFilters}
          pageSize={FORMS_PAGE_SIZE}
          allowMutations
        />
      </section>
    </div>
  );
}
