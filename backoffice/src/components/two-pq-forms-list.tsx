import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TWO_PQ_FORM_LABELS,
  TWO_PQ_FORM_ROUTES,
  type TwoPQFormRecord,
} from "@/lib/two-pq-forms";
import { compactList } from "@/lib/moderation-utils";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function TwoPQFormsList({
  forms,
  limit,
}: {
  forms: TwoPQFormRecord[];
  limit?: number;
}) {
  const visibleForms = typeof limit === "number" ? forms.slice(0, limit) : forms;

  return (
    <div className="grid gap-3">
      {visibleForms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-background/50 px-4 py-5 text-sm text-muted-foreground">
          No stored forms yet.
        </div>
      ) : (
        visibleForms.map((form) => (
          <article
            key={form.id}
            className="flex flex-col gap-3 rounded-2xl border border-border/75 bg-background/64 px-4 py-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-700 dark:text-indigo-200">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {form.patientName ?? "Unnamed patient"}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{form.id}</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {compactList([
                  TWO_PQ_FORM_LABELS[form.formType],
                  form.requestedTestName,
                  form.institutionName,
                  form.patientEmail,
                ])}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <Badge variant="brand">{TWO_PQ_FORM_LABELS[form.formType]}</Badge>
              <Badge variant="outline">{formatDate(form.createdAt)}</Badge>
              <Button variant="outline" size="sm" asChild>
                <Link href={TWO_PQ_FORM_ROUTES[form.formType]}>
                  New similar form
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
