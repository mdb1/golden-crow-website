"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { appText, type AppLanguage } from "@/lib/language";
import {
  CRM_CATEGORY_OPTIONS,
  CRM_TEMPLATE_STATUS_OPTIONS,
  PARTNERSHIP_CRM_FROM_EMAIL,
  renderCrmTemplate,
  templateStatusLabel,
  type PartnershipCrmOrganizationRecord,
  type PartnershipCrmTemplateInput,
  type PartnershipCrmTemplateRecord,
  type PartnershipCrmTemplatesPage,
  type PartnershipCrmTemplateStatus,
} from "@/lib/partnership-crm";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const TEMPLATES_QUERY_KEY = "god-mode-partnership-crm-templates";
const TEMPLATE_VARIABLES = [
  {
    token: "{{contact_name}}",
    label: "Contact name",
  },
  {
    token: "{{organization_name}}",
    label: "Organization name",
  },
  {
    token: "{{website}}",
    label: "Website",
  },
  {
    token: "{{website_sentence}}",
    label: "Website sentence",
  },
] as const;

type TemplateFilters = {
  query: string;
  status: "all" | PartnershipCrmTemplateStatus;
  category: string;
};

type TemplateFormState = {
  name: string;
  category: string;
  subject: string;
  body: string;
  status: PartnershipCrmTemplateStatus;
  notes: string;
};

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  name: "",
  category: "Laboratory / Genomics",
  subject: "",
  body: "",
  status: "active",
  notes: "",
};

const SAMPLE_ORGANIZATION: PartnershipCrmOrganizationRecord = {
  id: "preview",
  schemaVersion: 1,
  name: "Organizacion Ejemplo",
  category: "Laboratory / Genomics",
  website: "https://example.org/",
  websiteDomain: "example.org",
  country: "Argentina",
  status: "new",
  contactName: "Contacto",
  contactEmail: "contacto@example.org",
  contactLinkedIn: "",
  lastContactAt: null,
  notes: "",
  normalizedName: "organizacion ejemplo",
};

function buildTemplateListPath(filters: TemplateFilters, cursor?: string) {
  const params = new URLSearchParams({ limit: "20" });
  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }
  if (filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.category.trim()) {
    params.set("category", filters.category.trim());
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  return `/admin/partnership-crm/templates?${params.toString()}`;
}

function formatDateTime(
  value: string | null | undefined,
  language: AppLanguage,
) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(language === "es" ? "es-AR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function templatePayload(
  state: TemplateFormState,
): PartnershipCrmTemplateInput {
  return {
    name: state.name.trim(),
    category: state.category.trim(),
    subject: state.subject.trim(),
    body: state.body.trim(),
    status: state.status,
    notes: state.notes.trim(),
  };
}

function toFormState(
  template?: PartnershipCrmTemplateRecord,
): TemplateFormState {
  if (!template) {
    return EMPTY_TEMPLATE_FORM;
  }

  return {
    name: template.name,
    category: template.category || "Laboratory / Genomics",
    subject: template.subject,
    body: template.body,
    status: template.status,
    notes: template.notes,
  };
}

function templateRecordFromState(
  state: TemplateFormState,
): PartnershipCrmTemplateRecord {
  return {
    id: "preview",
    schemaVersion: 1,
    name: state.name,
    category: state.category,
    subject: state.subject,
    body: state.body,
    status: state.status,
    notes: state.notes,
    normalizedName: state.name.trim().toLowerCase(),
  };
}

function statusBadgeVariant(status: PartnershipCrmTemplateStatus) {
  if (status === "active") {
    return "success" as const;
  }
  if (status === "inactive") {
    return "warning" as const;
  }
  return "secondary" as const;
}

function TemplateStatusBadge({
  status,
  language,
}: {
  status: PartnershipCrmTemplateStatus;
  language: AppLanguage;
}) {
  return (
    <Badge variant={statusBadgeVariant(status)}>
      {appText(language, templateStatusLabel(status))}
    </Badge>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {children}
    </p>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-background/50 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function TemplatePreview({
  form,
  language,
}: {
  form: TemplateFormState;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const rendered = renderCrmTemplate(
    templateRecordFromState(form),
    SAMPLE_ORGANIZATION,
  );

  return (
    <aside className="rounded-xl border border-border/80 bg-white p-4 text-slate-950 shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:bg-slate-950 dark:text-slate-50">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {t("Preview")}
          </p>
          <h3 className="mt-1 truncate font-heading text-lg font-semibold">
            {rendered.subject || t("No subject")}
          </h3>
        </div>
        <Badge variant="outline">{t("Preview sample")}</Badge>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300">
        <p className="truncate">
          <span className="font-semibold text-slate-900 dark:text-slate-50">
            {t("From")}:
          </span>{" "}
          {PARTNERSHIP_CRM_FROM_EMAIL}
        </p>
        <p className="truncate">
          <span className="font-semibold text-slate-900 dark:text-slate-50">
            {t("Recipient")}:
          </span>{" "}
          {SAMPLE_ORGANIZATION.contactEmail}
        </p>
      </div>
      <div className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
        {rendered.body || t("No message yet.")}
      </div>
    </aside>
  );
}

export function PartnershipCrmTemplateBrowser() {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [filters, setFilters] = useState<TemplateFilters>({
    query: "",
    status: "all",
    category: "",
  });
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const currentCursor = cursorStack[cursorStack.length - 1];

  const templatesQuery = useQuery({
    queryKey: [TEMPLATES_QUERY_KEY, filters, currentCursor],
    queryFn: () =>
      sdkFetch<PartnershipCrmTemplatesPage>(
        buildTemplateListPath(filters, currentCursor),
      ),
  });
  const templates = templatesQuery.data?.templates ?? [];
  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        CRM_TEMPLATE_STATUS_OPTIONS.map((option) => [
          option.value,
          templates.filter((template) => template.status === option.value)
            .length,
        ]),
      ) as Record<PartnershipCrmTemplateStatus, number>,
    [templates],
  );

  function resetCursorsForFilterChange(patch: Partial<TemplateFilters>) {
    setCursorStack([]);
    setFilters((current) => ({ ...current, ...patch }));
  }

  return (
    <section className="glass-panel flex flex-col gap-5 px-4 py-4 md:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold text-foreground">
            {t("Plantillas")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HeaderUnclutterButton />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => templatesQuery.refetch()}
            disabled={templatesQuery.isFetching}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                templatesQuery.isFetching && "animate-spin",
              )}
            />
            {t("Refresh")}
          </Button>
          <Button type="button" size="sm" asChild>
            <Link href="/god-mode/plantillas/new">
              <Plus className="h-3.5 w-3.5" />
              {t("Alta de plantilla")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border/80 bg-background/60 p-3 lg:grid-cols-[minmax(220px,1fr)_180px_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(event) =>
              resetCursorsForFilterChange({ query: event.target.value })
            }
            placeholder={t("Search templates...")}
            className="pl-8"
          />
        </div>
        <Select
          value={filters.status}
          onValueChange={(value) =>
            resetCursorsForFilterChange({
              status: value as TemplateFilters["status"],
            })
          }
        >
          <SelectTrigger className="w-full">
            <Filter className="h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All statuses")}</SelectItem>
            {CRM_TEMPLATE_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={filters.category}
          onChange={(event) =>
            resetCursorsForFilterChange({ category: event.target.value })
          }
          placeholder={t("Category")}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {CRM_TEMPLATE_STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() =>
              resetCursorsForFilterChange({ status: option.value })
            }
            className={cn(
              "rounded-xl border px-3 py-2 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40",
              filters.status === option.value
                ? "border-foreground/35 bg-muted"
                : "border-border/80 bg-background/60",
            )}
          >
            <p className="text-xs text-muted-foreground">{t(option.label)}</p>
            <p className="mt-1 text-lg font-semibold">
              {statusCounts[option.value]}
            </p>
          </button>
        ))}
      </div>

      {templatesQuery.error ? (
        <ErrorBanner>{t("Failed to load templates.")}</ErrorBanner>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border/80 bg-background/64">
        {templatesQuery.isFetching && templates.length === 0 ? (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <EmptyState>
            <span className="block">{t("No templates found.")}</span>
            <Button type="button" size="sm" asChild className="mt-3">
              <Link href="/god-mode/plantillas/new">
                <Plus className="h-3.5 w-3.5" />
                {t("Alta de plantilla")}
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Template")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead>{t("Category")}</TableHead>
                <TableHead>{t("Updated")}</TableHead>
                <TableHead>{t("Notes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="whitespace-normal">
                    <Link
                      href={`/god-mode/plantillas/${encodeURIComponent(
                        template.id,
                      )}`}
                      className="block max-w-[320px] text-left"
                    >
                      <span className="block truncate font-medium text-foreground">
                        {template.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {template.subject || t("No subject")}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <TemplateStatusBadge
                      status={template.status}
                      language={language}
                    />
                  </TableCell>
                  <TableCell className="whitespace-normal text-sm text-muted-foreground">
                    {template.category || t("No category")}
                  </TableCell>
                  <TableCell className="whitespace-normal text-sm text-muted-foreground">
                    {formatDateTime(template.updatedAt, language)}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <p className="line-clamp-2 max-w-[280px] text-xs text-muted-foreground">
                      {template.notes || "-"}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setCursorStack((current) => current.slice(0, -1))}
          disabled={cursorStack.length === 0 || templatesQuery.isFetching}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t("Previous")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {templates.length} {t("visible")}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            templatesQuery.data?.nextCursor &&
            setCursorStack((current) => [
              ...current,
              templatesQuery.data!.nextCursor!,
            ])
          }
          disabled={
            !templatesQuery.data?.nextCursor || templatesQuery.isFetching
          }
        >
          {t("Load more")}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </section>
  );
}

export function PartnershipCrmTemplateWorkbench({
  mode,
  templateId,
}: {
  mode: "create" | "edit";
  templateId?: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TemplateFormState>(EMPTY_TEMPLATE_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toast, setToast] = useState<ActionToastState | null>(null);
  const isEditing = mode === "edit";

  const templateQuery = useQuery({
    queryKey: [TEMPLATES_QUERY_KEY, templateId],
    queryFn: () =>
      sdkFetch<{ template: PartnershipCrmTemplateRecord }>(
        `/admin/partnership-crm/templates/${encodeURIComponent(
          templateId ?? "",
        )}`,
      ),
    enabled: isEditing && Boolean(templateId),
  });

  useEffect(() => {
    if (mode === "create") {
      setForm(EMPTY_TEMPLATE_FORM);
      return;
    }

    if (templateQuery.data?.template) {
      setForm(toFormState(templateQuery.data.template));
    }
  }, [mode, templateQuery.data?.template]);

  function update(patch: Partial<TemplateFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function insertVariable(token: string) {
    setForm((current) => ({
      ...current,
      body: `${current.body}${current.body.endsWith(" ") || !current.body ? "" : " "}${token}`,
    }));
  }

  const canSave = Boolean(
    form.name.trim() && form.subject.trim() && form.body.trim(),
  );

  const saveMutation = useMutation({
    mutationFn: (payload: PartnershipCrmTemplateInput) => {
      const path =
        isEditing && templateId
          ? `/admin/partnership-crm/templates/${encodeURIComponent(templateId)}`
          : "/admin/partnership-crm/templates";

      return sdkFetch<{ template: PartnershipCrmTemplateRecord }>(path, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [TEMPLATES_QUERY_KEY] });
      setForm(toFormState(result.template));
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Template saved."),
      });
      if (!isEditing) {
        router.push(`/god-mode/plantillas/${result.template.id}`);
      }
      router.refresh();
    },
    onError: (error) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to save template."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      sdkFetch<{ deleted: boolean; templateId: string }>(
        `/admin/partnership-crm/templates/${encodeURIComponent(
          templateId ?? "",
        )}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      setDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: [TEMPLATES_QUERY_KEY] });
      router.push("/god-mode/plantillas");
      router.refresh();
    },
    onError: (error) => {
      setDeleteOpen(false);
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to delete template."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    saveMutation.mutate(templatePayload(form));
  }

  return (
    <section className="glass-panel flex flex-col gap-5 px-4 py-4 md:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href="/god-mode/plantillas">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("Volver a plantillas")}
            </Link>
          </Button>
          <h2 className="mt-2 font-heading text-xl font-semibold text-foreground">
            {isEditing ? t("Plantilla") : t("Alta de plantilla")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HeaderUnclutterButton />
          {isEditing ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("Delete")}
            </Button>
          ) : null}
          <Button
            type="submit"
            form="crm-template-form"
            size="sm"
            disabled={!canSave || saveMutation.isPending}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {saveMutation.isPending ? t("Saving...") : t("Save changes")}
          </Button>
        </div>
      </div>

      {templateQuery.error ? (
        <ErrorBanner>{t("Failed to load template.")}</ErrorBanner>
      ) : null}

      {templateQuery.isFetching && isEditing && !templateQuery.data ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.96fr)_minmax(320px,0.64fr)]">
          <div className="grid gap-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-[420px] rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.96fr)_minmax(320px,0.64fr)]">
          <form
            id="crm-template-form"
            onSubmit={handleSubmit}
            className="grid gap-4"
          >
            <div className="grid gap-3 rounded-xl border border-border/80 bg-background/70 p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div className="space-y-1.5">
                  <Label htmlFor="crm-template-name">
                    {t("Template name")}
                  </Label>
                  <Input
                    id="crm-template-name"
                    value={form.name}
                    onChange={(event) => update({ name: event.target.value })}
                    placeholder={t("Template name")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Status")}</Label>
                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      update({
                        status: value as PartnershipCrmTemplateStatus,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CRM_TEMPLATE_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(option.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,0.58fr)_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <Label htmlFor="crm-template-category">{t("Category")}</Label>
                  <Input
                    id="crm-template-category"
                    list="crm-template-categories"
                    value={form.category}
                    onChange={(event) =>
                      update({ category: event.target.value })
                    }
                    placeholder={t("Category")}
                  />
                  <datalist id="crm-template-categories">
                    {CRM_CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-template-subject">{t("Subject")}</Label>
                  <Input
                    id="crm-template-subject"
                    value={form.subject}
                    onChange={(event) =>
                      update({ subject: event.target.value })
                    }
                    placeholder="Pocket Genes + {{organization_name}}"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="crm-template-body">{t("Message")}</Label>
                <Textarea
                  id="crm-template-body"
                  value={form.body}
                  onChange={(event) => update({ body: event.target.value })}
                  className="min-h-80 font-mono text-sm leading-6"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="crm-template-notes">{t("Notes")}</Label>
                <Textarea
                  id="crm-template-notes"
                  value={form.notes}
                  onChange={(event) => update({ notes: event.target.value })}
                  className="min-h-24"
                />
              </div>
            </div>

            <div className="grid gap-3 rounded-xl border border-border/80 bg-background/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-heading text-sm font-semibold">
                  {t("Template variables")}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_VARIABLES.map((variable) => (
                  <Button
                    key={variable.token}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => insertVariable(variable.token)}
                    title={t(variable.label)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="font-mono text-xs">{variable.token}</span>
                  </Button>
                ))}
              </div>
            </div>
          </form>

          <div className="grid gap-4">
            <TemplatePreview form={form} language={language} />
          </div>
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Delete template")}</DialogTitle>
            <DialogDescription>
              {t("This removes the template from the CRM send flow.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMutation.isPending}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending || !templateId}
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? t("Deleting...") : t("Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionToast
        toast={toast}
        onDismiss={() => setToast(null)}
        language={language}
      />
    </section>
  );
}
