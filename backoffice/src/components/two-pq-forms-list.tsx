import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TWO_PQ_FORM_LABELS,
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
  tone = "default",
}: {
  forms: TwoPQFormRecord[];
  limit?: number;
  tone?: "default" | "indigo";
}) {
  const visibleForms = typeof limit === "number" ? forms.slice(0, limit) : forms;
  const emptyClass =
    tone === "indigo"
      ? "rounded-2xl border border-dashed border-indigo-200/80 bg-white/58 px-4 py-5 text-sm text-indigo-950/58 dark:border-indigo-300/20 dark:bg-indigo-950/24 dark:text-indigo-50/62"
      : "rounded-2xl border border-dashed border-border/80 bg-background/50 px-4 py-5 text-sm text-muted-foreground";
  const articleClass =
    tone === "indigo"
      ? "flex flex-col gap-3 rounded-2xl border border-indigo-100/90 bg-white/68 px-4 py-3 shadow-[0_12px_32px_rgba(99,102,241,0.12)] md:flex-row md:items-center md:justify-between dark:border-indigo-300/18 dark:bg-indigo-950/28"
      : "flex flex-col gap-3 rounded-2xl border border-border/75 bg-background/64 px-4 py-3 md:flex-row md:items-center md:justify-between";
  const iconClass =
    tone === "indigo"
      ? "flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-400/14 dark:text-indigo-100"
      : "flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-700 dark:text-indigo-200";

  return (
    <div className="grid gap-3">
      {visibleForms.length === 0 ? (
        <div className={emptyClass}>
          No stored forms yet.
        </div>
      ) : (
        visibleForms.map((form) => {
          const authorEmail = form.authorEmail ?? form.createdByEmail;

          return (
            <article
              key={form.id}
              className={articleClass}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={iconClass}>
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
                    authorEmail ? `Author: ${authorEmail}` : undefined,
                  ])}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <Badge variant="brand">{TWO_PQ_FORM_LABELS[form.formType]}</Badge>
                <Badge variant="outline">{formatDate(form.createdAt)}</Badge>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/2pq-dashboard/forms/${encodeURIComponent(form.id)}`}>
                    Open
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
