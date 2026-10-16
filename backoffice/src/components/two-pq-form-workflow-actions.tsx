import Link from "next/link";
import { ClipboardList, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminRole } from "@/lib/admin-areas";
import { appText, type AppLanguage } from "@/lib/language";
import {
  canCreateTwoPQFormType,
  TWO_PQ_FORM_ROUTES,
  type TwoPQFormType,
} from "@/lib/two-pq-forms";

const WORKFLOW_STEPS: Array<{
  number: number;
  formType: TwoPQFormType;
  label: string;
  audience: string;
}> = [
  {
    number: 1,
    formType: "study_request",
    label: "Complete study request form",
    audience: "All enabled profiles",
  },
  {
    number: 2,
    formType: "sample",
    label: "Complete sample form (biopsies)",
    audience: "Laboratory staff only",
  },
  {
    number: 3,
    formType: "withdrawal_request",
    label: "Complete withdrawal request form",
    audience: "All enabled profiles",
  },
];

export function TwoPQFormWorkflowActions({
  role,
  language,
}: {
  role: AdminRole;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);

  return (
    <section aria-labelledby="two-pq-form-workflow-title">
      <div className="mb-4">
        <h2
          id="two-pq-form-workflow-title"
          className="font-heading text-xl font-semibold text-foreground"
        >
          {t("Complete the forms in this order")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Each step stays visible; unavailable actions are disabled for the current profile.")}
        </p>
      </div>

      <ol className="grid gap-3 lg:grid-cols-3">
        {WORKFLOW_STEPS.map((step) => {
          const enabled = canCreateTwoPQFormType(role, step.formType);
          const buttonClassName = enabled
            ? "mt-4 min-h-11 w-full justify-start whitespace-normal rounded-xl bg-indigo-600 px-4 text-left leading-snug text-white shadow-[0_12px_28px_rgba(79,70,229,0.2)] hover:bg-indigo-700"
            : "mt-4 min-h-11 w-full justify-start whitespace-normal rounded-xl border border-slate-300 bg-slate-200 px-4 text-left leading-snug text-slate-500 opacity-100 shadow-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400";

          return (
            <li
              key={step.formType}
              className="flex min-w-0 flex-col rounded-2xl border border-indigo-100 bg-white/72 p-4 dark:border-indigo-300/18 dark:bg-indigo-950/18"
            >
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-300">
                {t("Step")} {step.number}
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {t(step.label)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(step.audience)}
              </p>

              {enabled ? (
                <Button className={buttonClassName} asChild>
                  <Link href={TWO_PQ_FORM_ROUTES[step.formType]}>
                    <ClipboardList className="size-4 shrink-0" />
                    {t(step.label)}
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  className={buttonClassName}
                  disabled
                  aria-disabled="true"
                  title={t("Not enabled for this profile")}
                >
                  <LockKeyhole className="size-4 shrink-0" />
                  {t(step.label)}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
