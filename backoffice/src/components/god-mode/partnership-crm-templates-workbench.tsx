"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileUp,
  Filter,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { ActionToast, type ActionToastState } from "@/components/action-toast";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Progress } from "@/components/ui/progress";
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
import {
  CrmCategorySelect,
  formatCrmCategory,
} from "@/components/god-mode/crm-category-select";
import { CrmImportRulesDialog } from "@/components/god-mode/crm-import-rules-dialog";
import { CrmTargetSegmentedControl } from "@/components/god-mode/crm-target-segmented-control";
import { appText, type AppLanguage } from "@/lib/language";
import {
  CRM_TEMPLATE_STATUS_OPTIONS,
  DEFAULT_CRM_CATEGORY,
  DEFAULT_CRM_PROFESSIONAL_CATEGORY,
  PARTNERSHIP_CRM_FROM_EMAIL,
  normalizeCrmPrimaryCategory,
  parseCrmTemplateCsv,
  renderCrmTemplate,
  templateStatusLabel,
  type ParsedCrmTemplateCsv,
  type PartnershipCrmOrganizationRecord,
  type PartnershipCrmProfessionalRecord,
  type PartnershipCrmTargetRecord,
  type PartnershipCrmTemplateInput,
  type PartnershipCrmTemplateAudience,
  type PartnershipCrmTemplateRecord,
  type PartnershipCrmTemplatesPage,
  type PartnershipCrmTemplateStatus,
} from "@/lib/partnership-crm";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const TEMPLATES_QUERY_KEY = "god-mode-partnership-crm-templates";
const TEMPLATE_IMPORT_CTA_CLASS =
  "h-11 min-w-[11rem] bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.26)] hover:bg-blue-700 focus-visible:ring-blue-500/35 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400";
const ORGANIZATION_TEMPLATE_VARIABLES = [
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
const PROFESSIONAL_TEMPLATE_VARIABLES = [
  {
    token: "{{professional_name}}",
    label: "Professional name",
  },
  {
    token: "{{first_name}}",
    label: "First name",
  },
  {
    token: "{{primary_affiliation}}",
    label: "Primary affiliation",
  },
  {
    token: "{{potential_pocket_genes_editor_fit}}",
    label: "Potential Pocket Genes editor fit",
  },
  {
    token: "{{email_route}}",
    label: "Email route",
  },
  {
    token: "{{linkedin_route}}",
    label: "LinkedIn route",
  },
  {
    token: "{{research_basis}}",
    label: "Research basis",
  },
  {
    token: "{{title}}",
    label: "Role / specialty",
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

const TEMPLATE_IMPORT_PREVIEW_LIMIT = 50;

const ORGANIZATION_TEMPLATE_IMPORT_SAMPLE_CSV = [
  "name,audience,category,subject,body,status,is_favorite,notes",
  [
    '"Laboratorio - primer contacto"',
    '"organizations"',
    '"org_genetic_testing_laboratories"',
    '"Pocket Genes + {{organization_name}}"',
    '"Hola {{contact_name}},\\n\\nSoy Federico de Pocket Genes. Vi el trabajo de {{organization_name}}{{website_sentence}} y queria coordinar una conversacion corta para explorar colaboracion clinica/genomica.\\n\\nTe parece si agendamos 20 minutos esta semana?"',
    '"active"',
    '"true"',
    '"Usar con laboratorios y centros de genomica."',
  ].join(","),
].join("\n");
const PROFESSIONAL_TEMPLATE_IMPORT_SAMPLE_CSV = [
  "name,audience,category,subject,body,status,is_favorite,notes",
  [
    '"Profesional - primer contacto"',
    '"professionals"',
    '"pro_clinical_geneticists"',
    '"Pocket Genes + {{professional_name}}"',
    '"Hola {{first_name}},\\n\\nSoy Federico de Pocket Genes. Vi tu trabajo como {{title}} en {{primary_affiliation}}{{website_sentence}} y queria coordinar una conversacion corta para explorar colaboracion clinica/genomica.\\n\\nTe parece si agendamos 20 minutos esta semana?"',
    '"active"',
    '"true"',
    '"Usar con profesionales clinicos y referentes de genetica."',
  ].join(","),
].join("\n");

type TemplateFilters = {
  query: string;
  audience: PartnershipCrmTemplateAudience;
  status: "all" | PartnershipCrmTemplateStatus;
  category: string;
};

type TemplateFormState = {
  name: string;
  audience: PartnershipCrmTemplateAudience;
  category: string;
  subject: string;
  body: string;
  status: PartnershipCrmTemplateStatus;
  notes: string;
  is_favorite: boolean;
};

type TemplateImportPreviewRow = {
  rowNumber: number;
  template: PartnershipCrmTemplateInput;
  errors: string[];
  valid: boolean;
};

type TemplateImportResult = {
  rowNumber: number;
  action: "created" | "invalid" | "failed";
  templateId?: string;
  error?: string;
};

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  name: "",
  audience: "organizations",
  category: DEFAULT_CRM_CATEGORY,
  subject: "",
  body: "",
  status: "active",
  notes: "",
  is_favorite: false,
};

function defaultTemplateCategory(audience: PartnershipCrmTemplateAudience) {
  return audience === "professionals"
    ? DEFAULT_CRM_PROFESSIONAL_CATEGORY
    : DEFAULT_CRM_CATEGORY;
}

const SAMPLE_ORGANIZATION: PartnershipCrmOrganizationRecord = {
  id: "preview",
  schemaVersion: 1,
  name: "Organizacion Ejemplo",
  category: DEFAULT_CRM_CATEGORY,
  website: "https://example.org/",
  websiteDomain: "example.org",
  country: "Argentina",
  status: "new",
  contactName: "Contacto",
  contactEmail: "contacto@example.org",
  contactLinkedIn: "",
  lastContactAt: null,
  notes: "",
  is_favorite: false,
  normalizedName: "organizacion ejemplo",
};

const SAMPLE_PROFESSIONAL: PartnershipCrmProfessionalRecord = {
  id: "preview-professional",
  schemaVersion: 1,
  name: "Dra. Ana Genoma",
  category: DEFAULT_CRM_PROFESSIONAL_CATEGORY,
  title: "Genetista clinica",
  primaryAffiliation: "Hospital Genomico",
  potentialPocketGenesEditorFit:
    "Clinical genetics, genetic testing, result interpretation and patient education.",
  emailRoute:
    "Publicly listed professional or official institutional contact address.",
  linkedInRoute: "Official LinkedIn page of the affiliated organization.",
  researchBasis:
    "Existing verified Pocket Genes partnership dataset, affiliation website and LinkedIn record.",
  website: "https://example.org/",
  websiteDomain: "example.org",
  country: "Argentina",
  status: "new",
  email: "ana@example.org",
  linkedIn: "",
  lastContactAt: null,
  notes: "",
  is_favorite: false,
  normalizedName: "dra ana genoma",
};

function sampleTargetForAudience(
  audience: PartnershipCrmTemplateAudience,
): PartnershipCrmTargetRecord {
  return audience === "professionals"
    ? SAMPLE_PROFESSIONAL
    : SAMPLE_ORGANIZATION;
}

function buildTemplateListPath(filters: TemplateFilters, cursor?: string) {
  const params = new URLSearchParams({
    limit: "20",
    audience: filters.audience,
  });
  const category = normalizeCrmPrimaryCategory(
    filters.category,
    filters.audience,
  );
  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }
  if (filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (category) {
    params.set("category", category);
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

function FavoriteCell({
  isFavorite,
  language,
}: {
  isFavorite: boolean;
  language: AppLanguage;
}) {
  const label = appText(language, isFavorite ? "Favorite" : "Not favorite");

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex h-6 w-6 items-center justify-center"
    >
      {isFavorite ? (
        <Star
          aria-hidden="true"
          className="h-4 w-4 fill-amber-400 text-amber-500"
        />
      ) : (
        <span aria-hidden="true" className="text-xs text-muted-foreground/50">
          -
        </span>
      )}
    </span>
  );
}

function favoriteFirstRecords<T extends { is_favorite?: boolean }>(
  records: T[],
) {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const favoriteDelta =
        Number(Boolean(right.record.is_favorite)) -
        Number(Boolean(left.record.is_favorite));
      return favoriteDelta || left.index - right.index;
    })
    .map(({ record }) => record);
}

function templatePayload(
  state: TemplateFormState,
): PartnershipCrmTemplateInput {
  return {
    name: state.name.trim(),
    audience: state.audience,
    category: normalizeCrmPrimaryCategory(state.category, state.audience),
    subject: state.subject.trim(),
    body: state.body.trim(),
    status: state.status,
    notes: state.notes.trim(),
    is_favorite: state.is_favorite,
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
    audience: template.audience ?? "organizations",
    category:
      normalizeCrmPrimaryCategory(
        template.category,
        template.audience ?? "organizations",
      ) || defaultTemplateCategory(template.audience ?? "organizations"),
    subject: template.subject,
    body: template.body,
    status: template.status,
    notes: template.notes,
    is_favorite: template.is_favorite,
  };
}

function templateRecordFromState(
  state: TemplateFormState,
): PartnershipCrmTemplateRecord {
  return {
    id: "preview",
    schemaVersion: 1,
    name: state.name,
    audience: state.audience,
    category: normalizeCrmPrimaryCategory(state.category, state.audience),
    subject: state.subject,
    body: state.body,
    status: state.status,
    notes: state.notes,
    is_favorite: state.is_favorite,
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

function templatePreviewRows(
  parsed: ParsedCrmTemplateCsv,
): TemplateImportPreviewRow[] {
  const errorsByRow = parsed.errors.reduce((map, error) => {
    const errors = map.get(error.row) ?? [];
    errors.push(error.message);
    map.set(error.row, errors);
    return map;
  }, new Map<number, string[]>());

  return parsed.rows.map((template, index) => {
    const rowNumber = index + 2;
    const errors = errorsByRow.get(rowNumber) ?? [];

    return {
      rowNumber,
      template,
      errors,
      valid: errors.length === 0,
    };
  });
}

function templateImportResultTone(result: TemplateImportResult) {
  if (result.action === "created") {
    return "success" as const;
  }
  if (result.action === "invalid") {
    return "warning" as const;
  }
  return "destructive" as const;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error.";
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
  const sampleTarget = sampleTargetForAudience(form.audience);
  const rendered = renderCrmTemplate(
    templateRecordFromState(form),
    sampleTarget,
    form.audience,
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
          {form.audience === "professionals"
            ? SAMPLE_PROFESSIONAL.email
            : SAMPLE_ORGANIZATION.contactEmail}
        </p>
      </div>
      <div className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
        {rendered.body || t("No message yet.")}
      </div>
    </aside>
  );
}

function TemplateImportDialog({
  open,
  initialAudience,
  onOpenChange,
  onImported,
  language,
}: {
  open: boolean;
  initialAudience: PartnershipCrmTemplateAudience;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const [audience, setAudience] =
    useState<PartnershipCrmTemplateAudience>(initialAudience);
  const csvTextRef = useRef("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedCrmTemplateCsv | null>(null);
  const [importing, setImporting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [results, setResults] = useState<TemplateImportResult[]>([]);

  useEffect(() => {
    if (open) {
      setAudience(initialAudience);
    }
  }, [initialAudience, open]);

  useEffect(() => {
    if (open) {
      return;
    }

    setAudience(initialAudience);
    csvTextRef.current = "";
    setFileName("");
    setParsed(null);
    setImporting(false);
    setCompleted(false);
    setProcessedCount(0);
    setResults([]);
  }, [initialAudience, open]);

  const previewRows = useMemo(
    () => (parsed ? templatePreviewRows(parsed) : []),
    [parsed],
  );
  const visiblePreviewRows = useMemo(
    () => previewRows.slice(0, TEMPLATE_IMPORT_PREVIEW_LIMIT),
    [previewRows],
  );
  const validRows = useMemo(
    () => previewRows.filter((row) => row.valid),
    [previewRows],
  );
  const headerErrors = useMemo(
    () => parsed?.errors.filter((error) => error.row < 2) ?? [],
    [parsed],
  );
  const resultByRow = useMemo(
    () => new Map(results.map((result) => [result.rowNumber, result] as const)),
    [results],
  );
  const invalidCount = previewRows.length - validRows.length;
  const createdCount = results.filter(
    (result) => result.action === "created",
  ).length;
  const failedCount = results.filter(
    (result) => result.action === "failed",
  ).length;
  const progressValue =
    validRows.length > 0
      ? Math.round((processedCount / validRows.length) * 100)
      : 0;
  const canImport = validRows.length > 0 && !importing && !completed;

  function resetImportState() {
    csvTextRef.current = "";
    setFileName("");
    setParsed(null);
    setImporting(false);
    setCompleted(false);
    setProcessedCount(0);
    setResults([]);
  }

  function parseCsv(
    text: string,
    nextFileName = "",
    nextAudience: PartnershipCrmTemplateAudience = audience,
  ) {
    csvTextRef.current = text;
    setFileName(nextFileName);
    setParsed(text.trim() ? parseCrmTemplateCsv(text, nextAudience) : null);
    setCompleted(false);
    setProcessedCount(0);
    setResults([]);
  }

  function handleAudienceChange(nextAudience: PartnershipCrmTemplateAudience) {
    setAudience(nextAudience);
    parseCsv(csvTextRef.current, fileName, nextAudience);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      csvTextRef.current = text;
      setFileName(file.name);
      setParsed(parseCrmTemplateCsv(text, audience));
      setCompleted(false);
      setProcessedCount(0);
      setResults([]);
    } catch (error) {
      csvTextRef.current = "";
      setFileName(file.name);
      setParsed({
        rows: [],
        errors: [{ row: 0, message: errorMessage(error) }],
      });
      setCompleted(false);
      setProcessedCount(0);
      setResults([]);
    } finally {
      input.value = "";
    }
  }

  async function handleImport() {
    if (!canImport) {
      return;
    }

    const skippedRows = previewRows
      .filter((row) => !row.valid)
      .map<TemplateImportResult>((row) => ({
        rowNumber: row.rowNumber,
        action: "invalid",
        error: row.errors.join(" "),
      }));
    let nextResults = skippedRows;
    let createdAny = false;

    setCompleted(false);
    setImporting(true);
    setProcessedCount(0);
    setResults(nextResults);

    for (const [index, row] of validRows.entries()) {
      try {
        const response = await sdkFetch<{
          template: PartnershipCrmTemplateRecord;
        }>("/admin/partnership-crm/templates", {
          method: "POST",
          body: JSON.stringify(row.template),
        });
        nextResults = [
          ...nextResults,
          {
            rowNumber: row.rowNumber,
            action: "created",
            templateId: response.template.id,
          },
        ];
        createdAny = true;
      } catch (error) {
        nextResults = [
          ...nextResults,
          {
            rowNumber: row.rowNumber,
            action: "failed",
            error: errorMessage(error),
          },
        ];
      }

      setResults(nextResults);
      setProcessedCount(index + 1);
    }

    setImporting(false);
    setCompleted(true);
    if (createdAny) {
      onImported();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!importing) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("Import templates from CSV")}</DialogTitle>
          <DialogDescription>
            {t("Review each template before creating it in plantillas.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <CrmTargetSegmentedControl
            value={audience}
            onChange={handleAudienceChange}
            language={language}
            disabled={importing || completed}
          />

          {completed ? (
            <section className="overflow-hidden rounded-[1.35rem] border border-emerald-200 bg-[linear-gradient(155deg,rgba(240,253,244,0.98),rgba(236,253,245,0.92)_52%,rgba(209,250,229,0.92))] text-emerald-950 shadow-[0_22px_70px_rgba(16,185,129,0.20)] dark:border-emerald-300/20 dark:bg-[linear-gradient(155deg,rgba(6,78,59,0.86),rgba(6,95,70,0.54)_55%,rgba(16,185,129,0.18))] dark:text-emerald-50 dark:shadow-none">
              <div className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="relative mt-1 flex h-12 w-12 shrink-0 items-center justify-center">
                      <span className="two-pq-success-ring absolute inset-0 rounded-full bg-emerald-400/35" />
                      <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_12px_28px_rgba(5,150,105,0.28)]">
                        <CheckCircle2 className="h-6 w-6" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800/70 dark:text-emerald-100/70">
                        {t("Import completed")}
                      </p>
                      <h3 className="mt-2 font-heading text-2xl font-semibold">
                        {t("Template import finished")}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-emerald-950/72 dark:text-emerald-50/72">
                        {t(
                          "Templates were processed one by one and the plantillas list has been refreshed.",
                        )}
                      </p>
                      {fileName ? (
                        <p className="mt-2 truncate text-xs text-emerald-950/60 dark:text-emerald-50/60">
                          {fileName}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Badge variant="success" className="h-7 px-3 text-sm">
                    {previewRows.length} {t("rows")}
                  </Badge>
                </div>

                <div className="mt-5 h-3 overflow-hidden rounded-full bg-emerald-100/85 dark:bg-emerald-950/45">
                  <div className="h-full rounded-full bg-emerald-600" />
                </div>

                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("Created templates")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {createdCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("Valid")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {validRows.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("Invalid")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {invalidCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 bg-white/76 px-4 py-3 dark:border-emerald-300/16 dark:bg-emerald-950/24">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900/58 dark:text-emerald-50/58">
                      {t("Failed rows")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{failedCount}</p>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {!completed ? (
            <>
              <div className="grid gap-3 rounded-xl border border-border/80 bg-background/70 p-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(280px,0.7fr)]">
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="crm-template-import-file">
                      {t("CSV file")}
                    </Label>
                    <Input
                      id="crm-template-import-file"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileChange}
                      disabled={importing}
                    />
                    {fileName ? (
                      <p className="text-xs text-muted-foreground">
                        {t("Selected file")}: {fileName}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-3">
                    <p className="text-sm font-medium">
                      {parsed ? t("CSV parsed") : t("No CSV selected")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t(
                        "Raw CSV contents are not rendered. The preview below is capped to protect the UI.",
                      )}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-heading text-sm font-semibold">
                      {t("Sample template CSV")}
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        parseCsv(
                          audience === "professionals"
                            ? PROFESSIONAL_TEMPLATE_IMPORT_SAMPLE_CSV
                            : ORGANIZATION_TEMPLATE_IMPORT_SAMPLE_CSV,
                          "sample-plantillas.csv",
                        )
                      }
                      disabled={importing}
                    >
                      {t("Use sample")}
                    </Button>
                  </div>
                  <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
                    {audience === "professionals"
                      ? PROFESSIONAL_TEMPLATE_IMPORT_SAMPLE_CSV
                      : ORGANIZATION_TEMPLATE_IMPORT_SAMPLE_CSV}
                  </pre>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-5">
                {[
                  { label: "Found", value: previewRows.length },
                  { label: "Valid", value: validRows.length },
                  { label: "Invalid", value: invalidCount },
                  { label: "Created templates", value: createdCount },
                  { label: "Failed rows", value: failedCount },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-border/80 bg-background/70 px-3 py-2"
                  >
                    <p className="text-xs text-muted-foreground">
                      {t(item.label)}
                    </p>
                    <p className="mt-1 text-lg font-semibold">{item.value}</p>
                  </div>
                ))}
              </div>

              {parsed && (importing || completed) ? (
                <div className="rounded-xl border border-border/80 bg-background/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      {completed ? t("Import completed") : t("Importing CSV")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {processedCount} / {validRows.length} {t("templates")}
                    </p>
                  </div>
                  <Progress value={progressValue} className="mt-3 h-2" />
                </div>
              ) : null}

              {headerErrors.length > 0 ? (
                <ErrorBanner>
                  {headerErrors.map((error) => t(error.message)).join(" ")}
                </ErrorBanner>
              ) : null}

              <div className="max-h-[360px] overflow-auto rounded-xl border border-border/80 bg-background/64">
                {previewRows.length === 0 ? (
                  <EmptyState>{t("No import rows found.")}</EmptyState>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("Row")}</TableHead>
                        <TableHead>{t("Template")}</TableHead>
                        <TableHead className="w-10">
                          <span className="sr-only">{t("Favorite")}</span>
                        </TableHead>
                        <TableHead>{t("Applies to")}</TableHead>
                        <TableHead>{t("Category")}</TableHead>
                        <TableHead>{t("Subject")}</TableHead>
                        <TableHead>{t("Message")}</TableHead>
                        <TableHead>{t("Status")}</TableHead>
                        <TableHead>{t("Import")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visiblePreviewRows.map((row) => {
                        const result = resultByRow.get(row.rowNumber);
                        const resultLabel = result
                          ? result.action === "created"
                            ? "Created"
                            : result.action === "invalid"
                              ? "Invalid"
                              : "Failed"
                          : row.valid
                            ? "Ready"
                            : "Invalid";

                        return (
                          <TableRow key={row.rowNumber}>
                            <TableCell className="font-mono text-xs">
                              {row.rowNumber}
                            </TableCell>
                            <TableCell className="min-w-48 whitespace-normal">
                              <p className="font-medium">{row.template.name}</p>
                              {row.template.notes ? (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {row.template.notes}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <FavoriteCell
                                isFavorite={Boolean(row.template.is_favorite)}
                                language={language}
                              />
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {row.template.audience === "professionals"
                                  ? t("Professionals")
                                  : t("Organizations")}
                              </Badge>
                            </TableCell>
                            <TableCell className="min-w-44 whitespace-normal text-sm text-muted-foreground">
                              {formatCrmCategory(
                                row.template.category ?? "",
                                language,
                                row.template.audience ?? "organizations",
                              ) || t("No category")}
                            </TableCell>
                            <TableCell className="min-w-56 whitespace-normal text-sm">
                              {row.template.subject || "-"}
                            </TableCell>
                            <TableCell className="min-w-72 whitespace-normal">
                              <p className="max-h-16 overflow-hidden whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                                {row.template.body || "-"}
                              </p>
                            </TableCell>
                            <TableCell>
                              <TemplateStatusBadge
                                status={row.template.status ?? "active"}
                                language={language}
                              />
                            </TableCell>
                            <TableCell className="min-w-36 whitespace-normal">
                              <Badge
                                variant={
                                  result
                                    ? templateImportResultTone(result)
                                    : row.valid
                                      ? "success"
                                      : "destructive"
                                }
                              >
                                {t(resultLabel)}
                              </Badge>
                              {row.errors.length > 0 ? (
                                <p className="mt-1 text-xs text-destructive">
                                  {row.errors
                                    .map((error) => t(error))
                                    .join(" ")}
                                </p>
                              ) : null}
                              {result?.action === "failed" && result.error ? (
                                <p className="mt-1 text-xs text-destructive">
                                  {result.error}
                                </p>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
              {previewRows.length > visiblePreviewRows.length ? (
                <p className="text-xs text-muted-foreground">
                  {t("Showing first")} {visiblePreviewRows.length} {t("of")}{" "}
                  {previewRows.length} {t("parsed rows")}.
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <DialogFooter className={completed ? "gap-3" : undefined}>
          {completed ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={resetImportState}
                className="h-11"
              >
                <FileUp className="h-4 w-4" />
                {t("Import another CSV")}
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => onOpenChange(false)}
                className={TEMPLATE_IMPORT_CTA_CLASS}
              >
                <CheckCircle2 className="h-4 w-4" />
                {t("Done")}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={importing}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={handleImport}
                disabled={!canImport}
                className={TEMPLATE_IMPORT_CTA_CLASS}
              >
                <FileUp className="h-4 w-4" />
                {importing
                  ? t("Importing...")
                  : `${t("Import")} ${validRows.length} ${t("templates")}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PartnershipCrmTemplateBrowser() {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<TemplateFilters>({
    query: "",
    audience: "organizations",
    status: "all",
    category: "",
  });
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importRulesOpen, setImportRulesOpen] = useState(false);
  const currentCursor = cursorStack[cursorStack.length - 1];

  const templatesQuery = useQuery({
    queryKey: [TEMPLATES_QUERY_KEY, filters, currentCursor],
    queryFn: () =>
      sdkFetch<PartnershipCrmTemplatesPage>(
        buildTemplateListPath(filters, currentCursor),
      ),
  });
  const templates = useMemo(
    () => favoriteFirstRecords(templatesQuery.data?.templates ?? []),
    [templatesQuery.data?.templates],
  );
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

  function handleAudienceChange(audience: PartnershipCrmTemplateAudience) {
    resetCursorsForFilterChange({ audience, category: "" });
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <FileUp className="h-3.5 w-3.5" />
            {t("Import CSV")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportRulesOpen(true)}
          >
            <ListChecks className="h-3.5 w-3.5" />
            {t("Import rules")}
          </Button>
          <Button type="button" size="sm" asChild>
            <Link href="/god-mode/plantillas/new">
              <Plus className="h-3.5 w-3.5" />
              {t("Alta de plantilla")}
            </Link>
          </Button>
        </div>
      </div>

      <CrmTargetSegmentedControl
        value={filters.audience}
        onChange={handleAudienceChange}
        language={language}
      />

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
        <CrmCategorySelect
          id="crm-template-category-filter"
          value={filters.category}
          onChange={(category) => resetCursorsForFilterChange({ category })}
          language={language}
          mode="filter"
          audience={filters.audience}
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
                <TableHead className="w-10">
                  <span className="sr-only">{t("Favorite")}</span>
                </TableHead>
                <TableHead>{t("Applies to")}</TableHead>
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
                    <FavoriteCell
                      isFavorite={template.is_favorite}
                      language={language}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {template.audience === "professionals"
                        ? t("Professionals")
                        : t("Organizations")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <TemplateStatusBadge
                      status={template.status}
                      language={language}
                    />
                  </TableCell>
                  <TableCell className="whitespace-normal text-sm text-muted-foreground">
                    {formatCrmCategory(
                      template.category,
                      language,
                      template.audience ?? "organizations",
                    ) || t("No category")}
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

      <TemplateImportDialog
        open={importOpen}
        initialAudience={filters.audience}
        onOpenChange={setImportOpen}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: [TEMPLATES_QUERY_KEY] });
          void templatesQuery.refetch();
        }}
        language={language}
      />
      <CrmImportRulesDialog
        open={importRulesOpen}
        onOpenChange={setImportRulesOpen}
        language={language}
        kind="templates"
        audience={filters.audience}
      />
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

  function updateAudience(audience: PartnershipCrmTemplateAudience) {
    setForm((current) => ({
      ...current,
      audience,
      category: defaultTemplateCategory(audience),
    }));
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
  const templateVariables =
    form.audience === "professionals"
      ? PROFESSIONAL_TEMPLATE_VARIABLES
      : ORGANIZATION_TEMPLATE_VARIABLES;

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
              <div className="space-y-1.5">
                <Label>{t("Applies to")}</Label>
                <CrmTargetSegmentedControl
                  value={form.audience}
                  onChange={updateAudience}
                  language={language}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_120px]">
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
                <div className="space-y-1.5">
                  <Label htmlFor="crm-template-is-favorite">
                    {t("Favorite")}
                  </Label>
                  <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
                    <Checkbox
                      id="crm-template-is-favorite"
                      checked={form.is_favorite}
                      onCheckedChange={(checked) =>
                        update({ is_favorite: checked === true })
                      }
                    />
                    <Star
                      aria-hidden="true"
                      className={cn(
                        "h-4 w-4",
                        form.is_favorite
                          ? "fill-amber-400 text-amber-500"
                          : "text-muted-foreground/50",
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,0.58fr)_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <Label htmlFor="crm-template-category">{t("Category")}</Label>
                  <CrmCategorySelect
                    id="crm-template-category"
                    value={form.category}
                    onChange={(category) => update({ category })}
                    language={language}
                    mode="form"
                    audience={form.audience}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-template-subject">{t("Subject")}</Label>
                  <Input
                    id="crm-template-subject"
                    value={form.subject}
                    onChange={(event) =>
                      update({ subject: event.target.value })
                    }
                    placeholder={
                      form.audience === "professionals"
                        ? "Pocket Genes + {{professional_name}}"
                        : "Pocket Genes + {{organization_name}}"
                    }
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
                {templateVariables.map((variable) => (
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
