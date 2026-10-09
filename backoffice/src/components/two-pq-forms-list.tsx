"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps, type FormEvent, useState } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpDown,
  CalendarDays,
  CircleDot,
  ClipboardList,
  Filter,
  type LucideIcon,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAdminContext } from "@/components/admin-context-provider";
import { useAppLanguage } from "@/components/app-language-provider";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sdkFetch } from "@/lib/sdk-client";
import { isGlobalAdminRole } from "@/lib/admin-areas";
import type {
  TwoPQFormRecord,
  TwoPQFormsOrder,
  TwoPQFormsTypeFilter,
  TwoPQFormType,
} from "@/lib/two-pq-forms";
import {
  canArchiveTwoPQForms,
  getTwoPQFormDisplayTitle,
} from "@/lib/two-pq-forms";
import { compactList } from "@/lib/moderation-utils";
import { appText } from "@/lib/language";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 20;

type FormsFilterState = {
  includeArchived: boolean;
  formType: TwoPQFormsTypeFilter;
  search: string;
  createdFrom: string;
  createdTo: string;
  order: TwoPQFormsOrder;
};

type FormsPageResponse = {
  forms: TwoPQFormRecord[];
  nextCursor: string | null;
  hasMore: boolean;
};

const DEFAULT_FILTERS: FormsFilterState = {
  includeArchived: false,
  formType: "study_request_cojoined",
  search: "",
  createdFrom: "",
  createdTo: "",
  order: "newest",
};

function formatDate(value: string, language: "en" | "es") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function buildFormsQuery(
  filters: FormsFilterState,
  pageSize: number,
  cursor?: string | null,
) {
  const params = new URLSearchParams();
  params.set("limit", String(pageSize));
  if (filters.includeArchived) {
    params.set("includeArchived", "1");
  }
  if (filters.formType === "study_request_cojoined") {
    params.set("formType", "study_request");
  } else if (filters.formType !== "all") {
    params.set("formType", filters.formType);
  }
  if (filters.search.trim()) {
    params.set("search", filters.search.trim());
  }
  if (filters.createdFrom) {
    params.set("createdFrom", filters.createdFrom);
  }
  if (filters.createdTo) {
    params.set("createdTo", filters.createdTo);
  }
  if (filters.order !== "newest") {
    params.set("order", filters.order);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  return params;
}

function buildFormsUrl(filters: FormsFilterState) {
  const params = buildFormsQuery(filters, DEFAULT_PAGE_SIZE);
  params.delete("limit");
  params.set("formType", filters.formType);
  const query = params.toString();
  return query ? `/2pq-dashboard/forms?${query}` : "/2pq-dashboard/forms";
}

function hasActiveFilters(filters: FormsFilterState) {
  return (
    filters.includeArchived ||
    filters.formType !== DEFAULT_FILTERS.formType ||
    Boolean(filters.search.trim()) ||
    Boolean(filters.createdFrom) ||
    Boolean(filters.createdTo) ||
    filters.order !== "newest"
  );
}

function formTypeLabel(
  type: TwoPQFormsTypeFilter,
  t: (text: string) => string,
) {
  if (type === "study_request_cojoined") {
    return t("Study request (Co-joined)");
  }
  if (type === "study_request") {
    return t("Study request");
  }
  if (type === "sample") {
    return t("Biopsy form");
  }
  if (type === "withdrawal_request") {
    return t("Withdrawal request");
  }
  return t("All types");
}

function CoJoinedFormSequence({
  form,
  t,
}: {
  form: TwoPQFormRecord;
  t: (text: string) => string;
}) {
  const linkedBiopsyFormId = form.linkedBiopsyForm ?? null;
  const linkedWithdrawalRequestId = form.linkedWithdrawalRequest ?? null;
  const steps = [
    {
      number: 1,
      label: t("Study"),
      formId: form.id,
    },
    {
      number: 2,
      label: t("Biopsy"),
      formId: linkedBiopsyFormId,
    },
    {
      number: 3,
      label: t("Withdrawal"),
      formId: linkedWithdrawalRequestId,
    },
  ];
  const nextAction = !linkedBiopsyFormId && !linkedWithdrawalRequestId
    ? {
        label: t("Complete biopsy form"),
        href: `/2pq-dashboard/forms/sample/new?${new URLSearchParams({
          studyRequestFormId: form.id,
        }).toString()}`,
      }
    : linkedBiopsyFormId && !linkedWithdrawalRequestId
      ? {
          label: t("Complete withdrawal form"),
          href: `/2pq-dashboard/forms/withdrawal-request/new?${new URLSearchParams({
            studyRequestFormId: form.id,
            ...(form["2pq_case"] ? { caseId: form["2pq_case"] } : {}),
          }).toString()}`,
        }
      : null;

  return (
    <div
      aria-label={t("Co-joined form sequence")}
      className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-950"
    >
      <div className="grid grid-cols-3 gap-1">
        {steps.map((step, index) => {
          const isLinked = Boolean(step.formId);
          const segmentClass = cn(
            "flex min-h-20 min-w-0 flex-col items-center justify-center px-5 py-3 text-center outline-none transition-[filter,transform] focus-visible:brightness-110 sm:min-h-24 sm:px-8",
            isLinked
              ? "bg-emerald-600 text-white shadow-[0_8px_22px_rgba(5,150,105,0.2)] hover:bg-emerald-500 active:scale-[0.99] dark:bg-emerald-500 dark:hover:bg-emerald-400"
              : "cursor-default bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
          );
          const segmentStyle = {
            clipPath:
              index === 0
                ? "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%)"
                : "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%, 18px 50%)",
          };
          const content = (
            <>
              <span className="flex items-baseline justify-center gap-1.5">
                <span className="text-lg font-bold sm:text-xl">
                  {step.number}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide sm:text-sm">
                  {step.label}
                </span>
              </span>
              <span
                className={cn(
                  "mt-1 max-w-full truncate font-mono text-[9px] sm:text-xs",
                  isLinked
                    ? "text-white/82"
                    : "text-slate-500 dark:text-slate-300",
                )}
              >
                {step.formId ?? t("Not linked")}
              </span>
            </>
          );

          const accessibilityLabel = `${step.label}: ${isLinked ? t("Linked") : t("Not linked")}`;
          return step.formId ? (
            <Link
              key={step.number}
              href={`/2pq-dashboard/forms/${encodeURIComponent(step.formId)}`}
              aria-label={accessibilityLabel}
              data-state="linked"
              className={segmentClass}
              style={segmentStyle}
            >
              {content}
            </Link>
          ) : (
            <div
              key={step.number}
              aria-label={accessibilityLabel}
              data-state="empty"
              className={segmentClass}
              style={segmentStyle}
            >
              {content}
            </div>
          );
        })}
      </div>
      {form["2pq_case"] || nextAction ? (
        <div className="flex flex-wrap items-center justify-end gap-2 px-2 pb-2 pt-3">
          {form["2pq_case"] ? (
            <Link
              href={`/2pq-dashboard/cases/${encodeURIComponent(form["2pq_case"])}`}
              aria-label={`${t("Open 2PQ case")} ${form["2pq_case"]}`}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 dark:border-indigo-300/24 dark:bg-indigo-400/12 dark:text-indigo-100 dark:hover:bg-indigo-400/20"
            >
              <CircleDot className="size-3.5 shrink-0" />
              <span>{t("2PQ case")}</span>
              <span className="truncate font-mono">{form["2pq_case"]}</span>
              <ArrowRight className="size-3.5 shrink-0" />
            </Link>
          ) : null}
          {nextAction ? (
            <Button size="sm" asChild>
              <Link href={nextAction.href}>
                {nextAction.label}
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const FORM_TYPE_VISUALS: Record<
  TwoPQFormType,
  {
    Icon: LucideIcon;
    articleClass: string;
    badgeVariant: ComponentProps<typeof Badge>["variant"];
    iconClass: string;
  }
> = {
  study_request: {
    Icon: ClipboardList,
    articleClass:
      "border-sky-200/90 bg-sky-50/70 shadow-[0_12px_32px_rgba(125,211,252,0.14)] dark:border-sky-300/18 dark:bg-sky-500/8",
    badgeVariant: "brand",
    iconClass:
      "flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-400/14 dark:text-sky-100",
  },
  sample: {
    Icon: CircleDot,
    articleClass:
      "border-emerald-200/90 bg-emerald-50/70 shadow-[0_12px_32px_rgba(110,231,183,0.14)] dark:border-emerald-300/18 dark:bg-emerald-500/8",
    badgeVariant: "success",
    iconClass:
      "flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-400/14 dark:text-emerald-100",
  },
  withdrawal_request: {
    Icon: ArrowDownToLine,
    articleClass:
      "border-amber-200/90 bg-amber-50/70 shadow-[0_12px_32px_rgba(251,191,36,0.14)] dark:border-amber-300/18 dark:bg-amber-500/8",
    badgeVariant: "warning",
    iconClass:
      "flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-400/14 dark:text-amber-100",
  },
};

export function TwoPQFormsList({
  forms,
  initialCursor = null,
  initialHasMore = false,
  initialFilters = DEFAULT_FILTERS,
  pageSize = DEFAULT_PAGE_SIZE,
  limit,
  tone = "default",
  allowMutations = false,
}: {
  forms: TwoPQFormRecord[];
  initialCursor?: string | null;
  initialHasMore?: boolean;
  initialFilters?: FormsFilterState;
  pageSize?: number;
  limit?: number;
  tone?: "default" | "indigo";
  allowMutations?: boolean;
}) {
  const router = useRouter();
  const adminContext = useAdminContext();
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [pendingAction, setPendingAction] = useState<{
    type: "archive" | "delete";
    form: TwoPQFormRecord;
  } | null>(null);
  const [storedForms, setStoredForms] = useState(forms);
  const [filters, setFilters] = useState<FormsFilterState>(initialFilters);
  const [draftFilters, setDraftFilters] =
    useState<FormsFilterState>(initialFilters);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const visibleForms =
    typeof limit === "number" ? storedForms.slice(0, limit) : storedForms;
  const activeFilters = hasActiveFilters(filters);
  const emptyClass =
    tone === "indigo"
      ? "rounded-2xl border border-dashed border-indigo-200/80 bg-white/58 px-4 py-5 text-sm text-indigo-950/58 dark:border-indigo-300/20 dark:bg-indigo-950/24 dark:text-indigo-50/62"
      : "rounded-2xl border border-dashed border-border/80 bg-background/50 px-4 py-5 text-sm text-muted-foreground";
  const articleClass =
    tone === "indigo"
      ? "flex flex-col gap-3 rounded-2xl border border-indigo-100/90 bg-white/68 px-4 py-3 shadow-[0_12px_32px_rgba(99,102,241,0.12)] md:flex-row md:items-center md:justify-between dark:border-indigo-300/18 dark:bg-indigo-950/28"
      : "flex flex-col gap-3 rounded-2xl border border-border/75 bg-background/64 px-4 py-3 md:flex-row md:items-center md:justify-between";
  const canDeleteForms = isGlobalAdminRole(adminContext.role);
  const canArchiveForms = canArchiveTwoPQForms(adminContext.role);

  async function loadForms(
    nextFilters: FormsFilterState,
    options: { append?: boolean; cursor?: string | null } = {},
  ) {
    const append = Boolean(options.append);
    if (append && !options.cursor) {
      return;
    }

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const params = buildFormsQuery(nextFilters, pageSize, options.cursor);
      const payload = await sdkFetch<FormsPageResponse>(
        `/2pq/forms?${params.toString()}`,
      );
      setStoredForms((current) =>
        append ? [...current, ...payload.forms] : payload.forms,
      );
      setNextCursor(payload.nextCursor ?? null);
      setHasMore(Boolean(payload.hasMore));
      setFilters(nextFilters);
      setDraftFilters(nextFilters);
      if (!append) {
        router.replace(buildFormsUrl(nextFilters), { scroll: false });
      }
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("Unable to load stored forms."),
      });
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadForms(draftFilters);
  }

  function applyQuickFilter(nextFilters: FormsFilterState) {
    setDraftFilters(nextFilters);
    void loadForms(nextFilters);
  }

  async function handleConfirmAction() {
    if (!pendingAction) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (pendingAction.type === "delete") {
        await sdkFetch(
          `/2pq/forms/${encodeURIComponent(pendingAction.form.id)}`,
          {
            method: "DELETE",
          },
        );
        setStoredForms((current) =>
          current.filter((form) => form.id !== pendingAction.form.id),
        );
        setToast({
          id: Date.now(),
          tone: "success",
          message: `${t("Form")} ${pendingAction.form.id} ${t("was deleted.")}`,
        });
      } else {
        const payload = await sdkFetch<{ form: TwoPQFormRecord }>(
          `/2pq/forms/${encodeURIComponent(pendingAction.form.id)}/archive`,
          { method: "PATCH" },
        );
        setStoredForms((current) =>
          filters.includeArchived
            ? current.map((form) =>
                form.id === pendingAction.form.id ? payload.form : form,
              )
            : current.filter((form) => form.id !== pendingAction.form.id),
        );
        setToast({
          id: Date.now(),
          tone: "success",
          message: `${t("Form")} ${pendingAction.form.id} ${t("was archived.")}`,
        });
      }
      setPendingAction(null);
      router.refresh();
    } catch (error) {
      setToast({
        id: Date.now(),
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("Unable to update this form."),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />

      <form
        className="grid gap-3 rounded-2xl border border-border/70 bg-background/54 p-3"
        onSubmit={handleFilterSubmit}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(190px,0.9fr)]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label
              htmlFor="two-pq-form-search"
              className="text-xs text-muted-foreground"
            >
              <Search className="size-3.5" />
              {t("Search by patient")}
            </Label>
            <Input
              id="two-pq-form-search"
              value={draftFilters.search}
              placeholder={t("Name, email or DNI")}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label
              htmlFor="two-pq-form-from"
              className="text-xs text-muted-foreground"
            >
              <CalendarDays className="size-3.5" />
              {t("From")}
            </Label>
            <Input
              id="two-pq-form-from"
              type="date"
              value={draftFilters.createdFrom}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  createdFrom: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label
              htmlFor="two-pq-form-to"
              className="text-xs text-muted-foreground"
            >
              <CalendarDays className="size-3.5" />
              {t("To")}
            </Label>
            <Input
              id="two-pq-form-to"
              type="date"
              value={draftFilters.createdTo}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  createdTo: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label
              htmlFor="two-pq-form-type"
              className="text-xs text-muted-foreground"
            >
              <Filter className="size-3.5" />
              {t("Form type")}
            </Label>
            <Select
              value={draftFilters.formType}
              onValueChange={(value) =>
                setDraftFilters((current) => ({
                  ...current,
                  formType: value as TwoPQFormsTypeFilter,
                }))
              }
            >
              <SelectTrigger id="two-pq-form-type" className="w-full">
                <SelectValue>
                  {formTypeLabel(draftFilters.formType, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All types")}</SelectItem>
                <SelectItem value="study_request_cojoined">
                  {t("Study request (Co-joined)")}
                </SelectItem>
                <SelectItem value="study_request">
                  {t("Study request")}
                </SelectItem>
                <SelectItem value="sample">{t("Biopsy form")}</SelectItem>
                <SelectItem value="withdrawal_request">
                  {t("Withdrawal request")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Filter className="size-3.5" />
            )}
            {isLoading ? t("Loading...") : t("Apply filters")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              applyQuickFilter({
                ...draftFilters,
                order: draftFilters.order === "newest" ? "oldest" : "newest",
              })
            }
            disabled={isLoading}
          >
            <ArrowUpDown className="size-3.5" />
            {draftFilters.order === "newest"
              ? t("Newest first")
              : t("Oldest first")}
          </Button>
          <Button
            type="button"
            variant={draftFilters.includeArchived ? "default" : "outline"}
            size="sm"
            onClick={() =>
              applyQuickFilter({
                ...draftFilters,
                includeArchived: !draftFilters.includeArchived,
              })
            }
            disabled={isLoading}
          >
            <Archive className="size-3.5" />
            {draftFilters.includeArchived
              ? t("Hide archived")
              : t("Show archived")}
          </Button>
          {activeFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => applyQuickFilter(DEFAULT_FILTERS)}
              disabled={isLoading}
            >
              <X className="size-3.5" />
              {t("Clear filters")}
            </Button>
          ) : null}
          <p className="ml-auto text-xs text-muted-foreground">
            {visibleForms.length} {t("forms shown")}
          </p>
        </div>
      </form>

      <div className="grid gap-3">
        {visibleForms.length === 0 ? (
          <div className={emptyClass}>
            {activeFilters
              ? t("No forms match these filters.")
              : t("No stored forms yet.")}
          </div>
        ) : (
          visibleForms.map((form) => {
            const authorEmail = form.authorEmail ?? form.createdByEmail;
            const isArchived = Boolean(form.archivedAt);
            const displayTitle = getTwoPQFormDisplayTitle(form, language);
            const formVisuals = FORM_TYPE_VISUALS[form.formType];
            const FormIcon = formVisuals.Icon;
            const showCoJoinedSequence =
              filters.formType === "study_request_cojoined" &&
              form.formType === "study_request";

            return (
              <article
                key={form.id}
                className={cn(
                  articleClass,
                  formVisuals.articleClass,
                  showCoJoinedSequence && "md:flex-col md:items-stretch",
                )}
              >
                <div
                  className={cn("min-w-0", showCoJoinedSequence && "w-full")}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={formVisuals.iconClass}>
                      <FormIcon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {displayTitle}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {form.id}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {compactList([
                      formTypeLabel(form.formType, t),
                      form.requestedTestName,
                      form.institutionName,
                      form.patientEmail,
                      authorEmail
                        ? `${t("Author")}: ${authorEmail}`
                        : undefined,
                    ])}
                  </p>
                  {showCoJoinedSequence ? (
                    <CoJoinedFormSequence form={form} t={t} />
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  {!showCoJoinedSequence ? (
                    <Badge variant={formVisuals.badgeVariant}>
                      {formTypeLabel(form.formType, t)}
                    </Badge>
                  ) : null}
                  {isArchived ? (
                    <Badge variant="warning">{t("Archived")}</Badge>
                  ) : null}
                  <Badge variant="outline">
                    {formatDate(form.createdAt, language)}
                  </Badge>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/2pq-dashboard/forms/${encodeURIComponent(form.id)}`}
                    >
                      {t("Open")}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                  {allowMutations && canDeleteForms ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setPendingAction({ type: "delete", form })}
                    >
                      <Trash2 className="size-3.5" />
                      {t("Delete")}
                    </Button>
                  ) : null}
                  {allowMutations && canArchiveForms && !isArchived ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPendingAction({ type: "archive", form })
                      }
                      className="border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-300/20 dark:bg-indigo-400/12 dark:text-indigo-100"
                    >
                      <Archive className="size-3.5" />
                      {t("Archive")}
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>

      {hasMore && !limit ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void loadForms(filters, { append: true, cursor: nextCursor })
            }
            disabled={isLoadingMore || !nextCursor}
          >
            {isLoadingMore ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowDownToLine className="size-3.5" />
            )}
            {isLoadingMore ? t("Loading...") : t("Load more")}
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setPendingAction(null);
          }
        }}
      >
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogMedia
              className={
                pendingAction?.type === "delete"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-indigo-500/10 text-indigo-700"
              }
            >
              {pendingAction?.type === "delete" ? (
                <Trash2 className="size-5" />
              ) : (
                <Archive className="size-5" />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {pendingAction?.type === "delete"
                ? t("Delete form")
                : t("Archive form")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "delete"
                ? `${t("This permanently deletes")} ${pendingAction.form.id} ${t("from 2pq_forms. Linked 2PQ case or sampling records are kept. This is only available to full admins.")}`
                : `${t("This archives")} ${pendingAction?.form.id} ${t("so it leaves the default forms list. It can still be reviewed when archived forms are shown.")}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              {t("Cancel")}
            </AlertDialogCancel>
            <Button
              type="button"
              variant={
                pendingAction?.type === "delete" ? "destructive" : "default"
              }
              onClick={() => void handleConfirmAction()}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t("Working...")
                : pendingAction?.type === "delete"
                  ? t("Delete form")
                  : t("Archive form")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
