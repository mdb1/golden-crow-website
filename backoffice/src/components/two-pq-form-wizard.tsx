import type { ReactNode } from "react";
import { CheckCircle2, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const TWO_PQ_WIZARD_PANEL_CLASS =
  "glass-panel flex w-full min-w-0 max-w-full flex-col gap-5 overflow-x-hidden px-5 py-5";
export const TWO_PQ_WIZARD_PRIMARY_BUTTON_CLASS =
  "bg-indigo-600 text-white hover:bg-indigo-700";
export const TWO_PQ_WIZARD_SUBMIT_PANEL_CLASS =
  "mx-auto max-w-5xl rounded-2xl border border-indigo-200 bg-indigo-50/72 p-5 shadow-[0_18px_48px_rgba(79,70,229,0.12)] dark:border-indigo-300/22 dark:bg-indigo-950/22";
export const TWO_PQ_WIZARD_SUBMIT_BUTTON_CLASS =
  "mt-4 min-h-14 w-full bg-indigo-600 text-base font-semibold text-white hover:bg-indigo-700 sm:text-lg";

type WizardStep = {
  key: string;
  label: string;
  status?: "valid" | "invalid";
};

export function TwoPQFormWizardHeader({
  title,
  progressLabel,
  steps,
  activeIndex,
  onSelectStep,
  restoredLabel,
  savingLabel,
  disabled = false,
  stepsClassName = "md:grid-cols-3 xl:grid-cols-6",
}: {
  title: string;
  progressLabel: string;
  steps: readonly WizardStep[];
  activeIndex: number;
  onSelectStep: (index: number) => void;
  restoredLabel?: string;
  savingLabel?: string;
  disabled?: boolean;
  stepsClassName?: string;
}) {
  return (
    <>
      <div className="flex min-w-0 max-w-full flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            {title}
          </h2>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {restoredLabel ? <Badge variant="rose">{restoredLabel}</Badge> : null}
          {savingLabel ? <Badge variant="outline">{savingLabel}</Badge> : null}
          <Badge variant="outline">{progressLabel}</Badge>
        </div>
      </div>

      <div className={`grid min-w-0 max-w-full gap-2 ${stepsClassName}`}>
        {steps.map((step, index) => {
          const active = index === activeIndex;
          const completed = step.status === "valid";
          const invalid = step.status === "invalid";
          const stepButtonClass = [
            "flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
            completed
              ? "border-emerald-600 bg-emerald-600 text-white shadow-[0_8px_18px_rgba(5,150,105,0.22)] hover:bg-emerald-700"
              : active
                ? "border-indigo-300 bg-indigo-500/12 text-indigo-950 dark:border-indigo-300/40 dark:text-indigo-100"
                : invalid
                  ? "border-red-200 bg-red-50/65 text-red-950 hover:bg-red-50 dark:border-red-300/28 dark:bg-red-950/18 dark:text-red-100"
                  : "border-border/80 bg-background/54 text-muted-foreground hover:bg-background/80",
          ].join(" ");
          const stepNumberClass = [
            "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
            completed
              ? "border-white/70 bg-white/18 text-white"
              : active
                ? "border-indigo-600 bg-indigo-600 text-white shadow-[0_6px_14px_rgba(79,70,229,0.24)]"
                : invalid
                  ? "border-red-300 bg-red-100 text-red-700 dark:border-red-300/42 dark:bg-red-400/12 dark:text-red-200"
                  : "border-indigo-300/80 bg-transparent text-indigo-700 dark:border-indigo-300/45 dark:text-indigo-200",
          ].join(" ");

          return (
            <button
              key={step.key}
              type="button"
              onClick={() => onSelectStep(index)}
              disabled={disabled}
              aria-current={active ? "step" : undefined}
              className={stepButtonClass}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={stepNumberClass}>{index + 1}</span>
                <span className="min-w-0 truncate">{step.label}</span>
              </span>
              {completed ? (
                <CheckCircle2 className="size-4 text-white" />
              ) : invalid ? (
                <CircleX className="size-4 text-red-600" />
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}

export type PreviewField = {
  label: string;
  value: string;
  wide?: boolean;
};

export type PreviewSectionData = {
  title: string;
  fields: PreviewField[];
};

export function TwoPQFormPreviewPaper({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl rounded-sm bg-white px-6 py-8 text-black shadow-[0_24px_70px_rgba(15,23,42,0.16)] ring-1 ring-black/10 sm:px-10 sm:py-12">
      <div className="border-b border-black/20 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/55">
          2PQ
        </p>
        <h2 className="mt-2 font-heading text-2xl font-semibold text-black">
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-black/70">
          {description}
        </p>
      </div>

      <div className="mt-8 space-y-8">{children}</div>
      {footer}
    </div>
  );
}

export function PreviewPaperSection({ section }: { section: PreviewSectionData }) {
  return (
    <section className="border-t border-black/12 pt-5 first:border-t-0 first:pt-0">
      <h3 className="font-heading text-base font-semibold text-black">
        {section.title}
      </h3>
      <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {section.fields.map((field) => (
          <div
            key={`${section.title}-${field.label}`}
            className={field.wide ? "sm:col-span-2" : undefined}
          >
            <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-black/55">
              {field.label}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap break-words border-b border-black/12 pb-2 text-sm leading-6 text-black">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
