"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Braces,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  FileUp,
  Filter,
  GripVertical,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
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
    key: "contact_name",
    token: "{{contact_name}}",
    label: "Contact name",
    className:
      "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-300/35 dark:bg-sky-400/15 dark:text-sky-100",
    dotClassName: "bg-sky-500",
    recommended: true,
  },
  {
    key: "organization_name",
    token: "{{organization_name}}",
    label: "Organization name",
    className:
      "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-300/35 dark:bg-blue-400/15 dark:text-blue-100",
    dotClassName: "bg-blue-500",
    recommended: true,
  },
  {
    key: "website",
    token: "{{website}}",
    label: "Website",
    className:
      "border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-300/35 dark:bg-orange-400/15 dark:text-orange-100",
    dotClassName: "bg-orange-500",
    recommended: false,
  },
  {
    key: "website_sentence",
    token: "{{website_sentence}}",
    label: "Website sentence",
    className:
      "border-lime-200 bg-lime-50 text-lime-950 dark:border-lime-300/35 dark:bg-lime-400/15 dark:text-lime-100",
    dotClassName: "bg-lime-500",
    recommended: true,
  },
] as const;
const PROFESSIONAL_TEMPLATE_VARIABLES = [
  {
    key: "professional_name",
    token: "{{professional_name}}",
    label: "Professional name",
    className:
      "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-300/35 dark:bg-violet-400/15 dark:text-violet-100",
    dotClassName: "bg-violet-500",
    recommended: true,
  },
  {
    key: "first_name",
    token: "{{first_name}}",
    label: "First name",
    className:
      "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-300/35 dark:bg-fuchsia-400/15 dark:text-fuchsia-100",
    dotClassName: "bg-fuchsia-500",
    recommended: true,
  },
  {
    key: "primary_affiliation",
    token: "{{primary_affiliation}}",
    label: "Primary affiliation",
    className:
      "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-300/35 dark:bg-indigo-400/15 dark:text-indigo-100",
    dotClassName: "bg-indigo-500",
    recommended: true,
  },
  {
    key: "potential_pocket_genes_editor_fit",
    token: "{{potential_pocket_genes_editor_fit}}",
    label: "Potential Pocket Genes editor fit",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/35 dark:bg-emerald-400/15 dark:text-emerald-100",
    dotClassName: "bg-emerald-500",
    recommended: true,
  },
  {
    key: "email_route",
    token: "{{email_route}}",
    label: "Email route",
    className:
      "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-300/35 dark:bg-amber-400/15 dark:text-amber-100",
    dotClassName: "bg-amber-500",
    recommended: false,
  },
  {
    key: "linkedin_route",
    token: "{{linkedin_route}}",
    label: "LinkedIn route",
    className:
      "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-100",
    dotClassName: "bg-cyan-500",
    recommended: false,
  },
  {
    key: "research_basis",
    token: "{{research_basis}}",
    label: "Research basis",
    className:
      "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-300/35 dark:bg-teal-400/15 dark:text-teal-100",
    dotClassName: "bg-teal-500",
    recommended: false,
  },
  {
    key: "title",
    token: "{{title}}",
    label: "Role / specialty",
    className:
      "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-300/35 dark:bg-rose-400/15 dark:text-rose-100",
    dotClassName: "bg-rose-500",
    recommended: true,
  },
  {
    key: "website",
    token: "{{website}}",
    label: "Website",
    className:
      "border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-300/35 dark:bg-orange-400/15 dark:text-orange-100",
    dotClassName: "bg-orange-500",
    recommended: false,
  },
  {
    key: "website_sentence",
    token: "{{website_sentence}}",
    label: "Website sentence",
    className:
      "border-lime-200 bg-lime-50 text-lime-950 dark:border-lime-300/35 dark:bg-lime-400/15 dark:text-lime-100",
    dotClassName: "bg-lime-500",
    recommended: false,
  },
] as const;

type TemplateVariableDefinition = {
  key: string;
  token: string;
  label: string;
  className: string;
  dotClassName: string;
  recommended: boolean;
};

type TemplateQuickPatch = Partial<
  Pick<
    PartnershipCrmTemplateInput,
    "category" | "status" | "notes" | "is_favorite"
  >
>;

const TEMPLATE_VARIABLE_PATTERN = /\{\{([a-z_]+)\}\}/g;

const TEMPLATE_IMPORT_PREVIEW_LIMIT = 50;
const TEMPLATE_DETAIL_PANEL_MIN_WIDTH_PERCENT = 100 / 3;
const TEMPLATE_DETAIL_PANEL_MAX_WIDTH_PERCENT = 200 / 3;
const TEMPLATE_DETAIL_PANEL_DEFAULT_WIDTH_PERCENT = 50;
const TEMPLATE_DETAIL_PANEL_KEYBOARD_STEP_PERCENT = 4;

function clampTemplateDetailPanelWidthPercent(value: number) {
  return Math.min(
    TEMPLATE_DETAIL_PANEL_MAX_WIDTH_PERCENT,
    Math.max(TEMPLATE_DETAIL_PANEL_MIN_WIDTH_PERCENT, value),
  );
}

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
  duplicateTemplate?: PartnershipCrmTemplateRecord;
  duplicateReason?: string;
  conflicts: TemplateImportConflict[];
};

type TemplateImportConflict = {
  key: keyof PartnershipCrmTemplateInput;
  label: string;
  existingValue: unknown;
  incomingValue: unknown;
};

type TemplateImportResult = {
  rowNumber: number;
  action: "created" | "updated" | "skipped" | "invalid" | "failed";
  templateId?: string;
  template?: PartnershipCrmTemplateRecord;
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
    "Clinical genetics, genetic testing, result interpretation and patient education",
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

function templateVariablesForAudience(
  audience: PartnershipCrmTemplateAudience,
): readonly TemplateVariableDefinition[] {
  return audience === "professionals"
    ? PROFESSIONAL_TEMPLATE_VARIABLES
    : ORGANIZATION_TEMPLATE_VARIABLES;
}

function sampleVariableValue(
  key: string,
  target: PartnershipCrmTargetRecord,
  audience: PartnershipCrmTemplateAudience,
) {
  const organization = target as PartnershipCrmOrganizationRecord;
  const professional = target as PartnershipCrmProfessionalRecord;
  const website =
    audience === "professionals"
      ? professional.website || professional.websiteDomain
      : organization.website || organization.websiteDomain;

  switch (key) {
    case "contact_name":
      return audience === "professionals"
        ? professional.name || "equipo"
        : organization.contactName || "equipo";
    case "organization_name":
      return audience === "professionals"
        ? professional.primaryAffiliation || professional.name
        : organization.name;
    case "professional_name":
      return audience === "professionals"
        ? professional.name
        : organization.contactName || organization.name;
    case "first_name": {
      const name =
        audience === "professionals"
          ? professional.name
          : organization.contactName || organization.name;
      return name.trim().split(/\s+/)[0] ?? "";
    }
    case "primary_affiliation":
      return audience === "professionals"
        ? professional.primaryAffiliation
        : "";
    case "potential_pocket_genes_editor_fit":
      return audience === "professionals"
        ? professional.potentialPocketGenesEditorFit
        : "";
    case "email_route":
      return audience === "professionals" ? professional.emailRoute : "";
    case "linkedin_route":
      return audience === "professionals" ? professional.linkedInRoute : "";
    case "research_basis":
      return audience === "professionals" ? professional.researchBasis : "";
    case "title":
      return audience === "professionals" ? professional.title : "";
    case "website":
      return website;
    case "website_sentence":
      return target.websiteDomain ? ` (${target.websiteDomain})` : "";
    default:
      return "";
  }
}

function renderTemplatePreviewText(
  value: string,
  target: PartnershipCrmTargetRecord,
  audience: PartnershipCrmTemplateAudience,
) {
  return value.replace(TEMPLATE_VARIABLE_PATTERN, (_, key: string) => {
    const rawValue = sampleVariableValue(key, target, audience);
    return key === "potential_pocket_genes_editor_fit" && rawValue
      ? `"${rawValue}"`
      : rawValue;
  });
}

function renderTemplatePreviewNodes(
  value: string,
  target: PartnershipCrmTargetRecord,
  audience: PartnershipCrmTemplateAudience,
) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    const [token, key] = match;
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(value.slice(cursor, index));
    }

    const rawValue = sampleVariableValue(key, target, audience);
    nodes.push(
      key === "potential_pocket_genes_editor_fit" && rawValue ? (
        <em key={`${key}-${index}`}>{`"${rawValue}"`}</em>
      ) : (
        rawValue
      ),
    );
    cursor = index + token.length;
  }

  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }

  return nodes.length > 0 ? nodes : null;
}

function uniqueTemplateTokens(value: string) {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const match of value.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    const token = match[0];
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }

  return tokens;
}

function templateUsageFor(template: PartnershipCrmTemplateRecord) {
  const subjectTokens = uniqueTemplateTokens(template.subject);
  const bodyTokens = uniqueTemplateTokens(template.body);
  const allTokens = Array.from(new Set([...subjectTokens, ...bodyTokens]));
  const definitions = templateVariablesForAudience(template.audience);
  const definitionByToken = new Map(
    definitions.map((variable) => [variable.token, variable]),
  );
  const knownTokens = allTokens.filter((token) => definitionByToken.has(token));
  const unknownTokens = allTokens.filter(
    (token) => !definitionByToken.has(token),
  );

  return {
    subjectTokens,
    bodyTokens,
    allTokens,
    knownTokens,
    unknownTokens,
    definitions,
    recommendedMissing: definitions.filter(
      (variable) =>
        variable.recommended && !knownTokens.includes(variable.token),
    ),
  };
}

function templateFitAnalysis(template: PartnershipCrmTemplateRecord) {
  const usage = templateUsageFor(template);
  const subjectUsesVariable = usage.subjectTokens.some((token) =>
    usage.knownTokens.includes(token),
  );
  const bodyVariableCount = usage.bodyTokens.filter((token) =>
    usage.knownTokens.includes(token),
  ).length;
  const recommendedUsed = usage.definitions.filter(
    (variable) =>
      variable.recommended && usage.knownTokens.includes(variable.token),
  ).length;
  const recommendedTotal = Math.max(
    usage.definitions.filter((variable) => variable.recommended).length,
    1,
  );
  const score = Math.min(
    100,
    (subjectUsesVariable ? 20 : 0) +
      (bodyVariableCount >= 2 ? 35 : bodyVariableCount === 1 ? 22 : 0) +
      Math.round((recommendedUsed / recommendedTotal) * 30) +
      (template.category ? 10 : 0) +
      (template.is_favorite ? 5 : 0),
  );
  const label =
    score >= 80
      ? "Strong template fit"
      : score >= 55
        ? "Good template fit"
        : "Needs more dynamic variables";

  return {
    ...usage,
    score,
    label,
    recommendedUsed,
    recommendedTotal,
  };
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

function isPartnershipCrmTemplatesPage(
  value: unknown,
): value is PartnershipCrmTemplatesPage {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray((value as { templates?: unknown }).templates)
  );
}

function updateCachedTemplateListPages(
  queryClient: QueryClient,
  updater: (
    templates: PartnershipCrmTemplateRecord[],
  ) => PartnershipCrmTemplateRecord[],
) {
  queryClient.setQueriesData<unknown>(
    { queryKey: [TEMPLATES_QUERY_KEY] },
    (current: unknown) =>
      isPartnershipCrmTemplatesPage(current)
        ? {
            ...current,
            templates: updater(current.templates),
          }
        : current,
  );
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

function templateInputFromRecord(
  template: PartnershipCrmTemplateRecord,
  patch: TemplateQuickPatch = {},
): PartnershipCrmTemplateInput {
  const audience = template.audience ?? "organizations";

  return {
    name: template.name,
    audience,
    category: normalizeCrmPrimaryCategory(template.category, audience),
    subject: template.subject,
    body: template.body,
    status: template.status,
    notes: template.notes,
    is_favorite: template.is_favorite,
    ...patch,
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

function statusBadgeVariant(status: PartnershipCrmTemplateStatus) {
  if (status === "active") {
    return "success" as const;
  }
  if (status === "inactive") {
    return "warning" as const;
  }
  return "secondary" as const;
}

const TEMPLATE_IMPORT_DUPLICATE_SCAN_PAGE_LIMIT = 50;
const TEMPLATE_IMPORT_DUPLICATE_SCAN_PAGE_CAP = 10;

const TEMPLATE_IMPORT_CONFLICT_FIELDS: Array<{
  key: keyof PartnershipCrmTemplateInput;
  label: string;
}> = [
  { key: "name", label: "Template name" },
  { key: "audience", label: "Applies to" },
  { key: "category", label: "Category" },
  { key: "subject", label: "Subject" },
  { key: "body", label: "Message" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
  { key: "is_favorite", label: "Favorite" },
];

function normalizeTemplateMatchValue(value: string | undefined | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function templateImportAudience(
  template:
    PartnershipCrmTemplateInput | PartnershipCrmTemplateRecord | undefined,
): PartnershipCrmTemplateAudience {
  return template?.audience ?? "organizations";
}

function findTemplateDuplicateCandidate(
  incoming: PartnershipCrmTemplateInput,
  existingTemplates: PartnershipCrmTemplateRecord[],
) {
  const incomingAudience = templateImportAudience(incoming);
  const incomingName = normalizeTemplateMatchValue(incoming.name);
  const incomingSubject = normalizeTemplateMatchValue(incoming.subject);
  const sameAudienceTemplates = existingTemplates.filter(
    (template) => templateImportAudience(template) === incomingAudience,
  );
  const byName = sameAudienceTemplates.find(
    (template) => normalizeTemplateMatchValue(template.name) === incomingName,
  );
  if (byName) {
    return {
      template: byName,
      reason: "Same audience and template name.",
    };
  }

  if (!incomingSubject) {
    return null;
  }

  const bySubject = sameAudienceTemplates.find(
    (template) =>
      normalizeTemplateMatchValue(template.subject) === incomingSubject,
  );

  return bySubject
    ? {
        template: bySubject,
        reason: "Same audience and subject.",
      }
    : null;
}

function comparableTemplateImportValue(
  value: unknown,
  key: keyof PartnershipCrmTemplateInput,
) {
  if (key === "is_favorite") {
    return Boolean(value);
  }

  return typeof value === "string" ? value.trim() : (value ?? "");
}

function templateImportConflicts(
  existing: PartnershipCrmTemplateRecord,
  incoming: PartnershipCrmTemplateInput,
): TemplateImportConflict[] {
  return TEMPLATE_IMPORT_CONFLICT_FIELDS.flatMap(({ key, label }) => {
    const existingValue = comparableTemplateImportValue(existing[key], key);
    const incomingValue = comparableTemplateImportValue(incoming[key], key);

    return existingValue === incomingValue
      ? []
      : [
          {
            key,
            label,
            existingValue,
            incomingValue,
          },
        ];
  });
}

function templatePreviewRows(
  parsed: ParsedCrmTemplateCsv,
  existingTemplates: PartnershipCrmTemplateRecord[] = [],
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
    const duplicate = findTemplateDuplicateCandidate(
      template,
      existingTemplates,
    );

    return {
      rowNumber,
      template,
      errors,
      valid: errors.length === 0,
      duplicateTemplate: duplicate?.template,
      duplicateReason: duplicate?.reason,
      conflicts: duplicate
        ? templateImportConflicts(duplicate.template, template)
        : [],
    };
  });
}

function templateImportResultTone(result: TemplateImportResult) {
  if (result.action === "created" || result.action === "updated") {
    return "success" as const;
  }
  if (result.action === "skipped") {
    return "secondary" as const;
  }
  if (result.action === "invalid") {
    return "warning" as const;
  }
  return "destructive" as const;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error.";
}

function formatTemplateImportValue(
  key: keyof PartnershipCrmTemplateInput,
  value: unknown,
  audience: PartnershipCrmTemplateAudience,
  language: AppLanguage,
) {
  const t = (text: string) => appText(language, text);

  if (key === "is_favorite") {
    return value ? t("Favorite") : t("Not favorite");
  }

  if (key === "audience") {
    return value === "professionals" ? t("Professionals") : t("Organizations");
  }

  if (key === "category") {
    return formatCrmCategory(String(value ?? ""), language, audience) || "-";
  }

  if (key === "status") {
    return t(templateStatusLabel(value as PartnershipCrmTemplateStatus));
  }

  const text = String(value ?? "").trim();
  return text || "-";
}

function mergeTemplateNotes(existingNotes: string, incomingNotes: string) {
  const existing = existingNotes.trim();
  const incoming = incomingNotes.trim();

  if (!existing) {
    return incoming;
  }
  if (
    !incoming ||
    normalizeTemplateMatchValue(existing) ===
      normalizeTemplateMatchValue(incoming)
  ) {
    return existing;
  }

  return `${existing}\n\n--- CSV import ---\n${incoming}`;
}

function mergeTemplateInputWithExisting(
  existing: PartnershipCrmTemplateRecord,
  incoming: PartnershipCrmTemplateInput,
): PartnershipCrmTemplateInput {
  const audience = templateImportAudience(existing);

  return {
    name: existing.name.trim() || incoming.name.trim(),
    audience,
    category:
      normalizeCrmPrimaryCategory(existing.category, audience) ||
      normalizeCrmPrimaryCategory(incoming.category ?? "", audience),
    subject: existing.subject.trim() || incoming.subject.trim(),
    body: existing.body.trim() || incoming.body.trim(),
    status: existing.status || incoming.status || "active",
    notes: mergeTemplateNotes(existing.notes, incoming.notes ?? ""),
    is_favorite: Boolean(existing.is_favorite || incoming.is_favorite),
  };
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
  const renderedSubject = renderTemplatePreviewText(
    form.subject,
    sampleTarget,
    form.audience,
  );
  const renderedBody = renderTemplatePreviewNodes(
    form.body,
    sampleTarget,
    form.audience,
  );

  return (
    <aside className="rounded-xl border border-border/80 bg-white p-4 text-slate-950 shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:border-white/70 dark:bg-black dark:text-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {t("Preview")}
          </p>
          <h3 className="mt-1 truncate font-heading text-lg font-semibold">
            {renderedSubject || t("No subject")}
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
      <div className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800 dark:border dark:border-white/40 dark:bg-black dark:text-white">
        {renderedBody || t("No message yet.")}
      </div>
    </aside>
  );
}

function TemplateVariablePill({
  variable,
  muted = false,
  title,
  children,
}: {
  variable: TemplateVariableDefinition;
  muted?: boolean;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      title={title ?? variable.token}
      className={cn(
        "inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 font-mono text-[0.72rem] font-semibold leading-5",
        variable.className,
        muted && "opacity-45",
      )}
    >
      {children ?? variable.token}
    </span>
  );
}

function UnknownTemplateVariablePill({ token }: { token: string }) {
  return (
    <span
      title={token}
      className="inline-flex max-w-full items-center rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.72rem] font-semibold leading-5 text-destructive"
    >
      {token}
    </span>
  );
}

function templateVariableDefinitionByToken(
  audience: PartnershipCrmTemplateAudience,
) {
  return new Map(
    templateVariablesForAudience(audience).map(
      (variable) => [variable.token, variable] as const,
    ),
  );
}

function templateVariableUsageForText(
  subject: string,
  body: string,
  audience: PartnershipCrmTemplateAudience,
) {
  const subjectTokens = uniqueTemplateTokens(subject);
  const bodyTokens = uniqueTemplateTokens(body);
  const allTokens = Array.from(new Set([...subjectTokens, ...bodyTokens]));
  const definitions = templateVariablesForAudience(audience);
  const definitionByToken = templateVariableDefinitionByToken(audience);
  const knownTokens = allTokens.filter((token) => definitionByToken.has(token));
  const unknownTokens = allTokens.filter(
    (token) => !definitionByToken.has(token),
  );
  const variables = allTokens.map((token) => ({
    token,
    variable: definitionByToken.get(token),
    usedInSubject: subjectTokens.includes(token),
    usedInBody: bodyTokens.includes(token),
  }));

  return {
    subjectTokens,
    bodyTokens,
    allTokens,
    knownTokens,
    unknownTokens,
    definitions,
    variables,
  };
}

function renderTemplateVariablePillNodes(
  value: string,
  audience: PartnershipCrmTemplateAudience,
) {
  const nodes: React.ReactNode[] = [];
  const target = sampleTargetForAudience(audience);
  const definitionByToken = templateVariableDefinitionByToken(audience);
  let cursor = 0;

  for (const match of value.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    const [token, key] = match;
    const index = match.index ?? 0;

    if (index > cursor) {
      nodes.push(value.slice(cursor, index));
    }

    const variable = definitionByToken.get(token);
    if (variable) {
      const rawValue = sampleVariableValue(key, target, audience);
      const displayedValue =
        key === "potential_pocket_genes_editor_fit" && rawValue
          ? `"${rawValue}"`
          : rawValue;
      nodes.push(
        <TemplateVariablePill
          key={`${token}-${index}`}
          variable={variable}
          title={`${variable.token} - ${variable.label}`}
        >
          {displayedValue || variable.token}
        </TemplateVariablePill>,
      );
    } else {
      nodes.push(
        <UnknownTemplateVariablePill key={`${token}-${index}`} token={token} />,
      );
    }

    cursor = index + token.length;
  }

  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }

  return nodes.length > 0 ? nodes : null;
}

function TemplatePreviewSidePanel({
  template,
  notesDraft,
  onNotesDraftChange,
  onQuickUpdate,
  onDelete,
  onClose,
  pending,
  deletePending,
  language,
}: {
  template: PartnershipCrmTemplateRecord;
  notesDraft: string;
  onNotesDraftChange: (value: string) => void;
  onQuickUpdate: (patch: TemplateQuickPatch) => void;
  onDelete: () => void;
  onClose: () => void;
  pending: boolean;
  deletePending: boolean;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const analysis = templateFitAnalysis(template);
  const target = sampleTargetForAudience(template.audience);
  const renderedSubject = renderTemplatePreviewText(
    template.subject,
    target,
    template.audience,
  );
  const renderedBody = renderTemplatePreviewNodes(
    template.body,
    target,
    template.audience,
  );
  const usedVariableDefinitions = analysis.definitions.filter((variable) =>
    analysis.knownTokens.includes(variable.token),
  );
  const notesChanged = notesDraft !== template.notes;

  return (
    <aside
      data-testid="template-preview-panel"
      className="grid gap-4 xl:min-h-0 xl:overflow-y-auto xl:overscroll-auto xl:pl-2"
    >
      <div className="rounded-xl border border-border/80 bg-background/70 p-4">
        <div className="flex items-start gap-3 border-b border-border/70 pb-3">
          <div className="min-w-0 flex-1">
            <h3
              data-testid="template-preview-panel-title"
              className="line-clamp-2 break-words font-heading text-xl font-semibold text-foreground"
            >
              {template.name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatCrmCategory(
                template.category,
                language,
                template.audience,
              ) || t("No category")}
            </p>
          </div>
          <div
            data-testid="template-preview-panel-actions"
            className="ml-auto flex min-w-max shrink-0 flex-col items-end self-stretch"
          >
            <div
              data-testid="template-preview-panel-action-row"
              className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap"
            >
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="shrink-0"
                aria-label={
                  template.is_favorite
                    ? t("Unmark as favorite")
                    : t("Mark as favorite")
                }
                title={
                  template.is_favorite
                    ? t("Unmark as favorite")
                    : t("Mark as favorite")
                }
                onClick={() =>
                  onQuickUpdate({ is_favorite: !template.is_favorite })
                }
                disabled={pending}
              >
                <Star
                  className={cn(
                    "h-3.5 w-3.5",
                    template.is_favorite
                      ? "fill-amber-400 text-amber-500"
                      : "text-muted-foreground/60",
                  )}
                />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="shrink-0"
                asChild
              >
                <Link
                  href={`/god-mode/plantillas/${encodeURIComponent(template.id)}`}
                  aria-label={t("Edit")}
                  title={t("Edit")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="sr-only">{t("Edit")}</span>
                </Link>
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                className="shrink-0"
                aria-label={t("Delete")}
                title={t("Delete")}
                onClick={onDelete}
                disabled={deletePending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={t("Hide details")}
                title={t("Hide details")}
                onClick={onClose}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1" aria-hidden="true" />
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div
            data-testid="template-preview-panel-tags"
            className="flex flex-wrap items-center gap-2"
          >
            <TemplateStatusBadge status={template.status} language={language} />
            <Badge variant="outline">
              {template.audience === "professionals"
                ? t("Professionals")
                : t("Organizations")}
            </Badge>
          </div>
          <div className="space-y-1.5">
            <Label>{t("Status")}</Label>
            <Select
              value={template.status}
              onValueChange={(value) =>
                onQuickUpdate({
                  status: value as PartnershipCrmTemplateStatus,
                })
              }
              disabled={pending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="crm-control-dropdown">
                {CRM_TEMPLATE_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-panel-category">{t("Category")}</Label>
            <CrmCategorySelect
              id="template-panel-category"
              value={template.category}
              onChange={(category) => onQuickUpdate({ category })}
              language={language}
              mode="form"
              audience={template.audience}
            />
          </div>
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        className="h-12 w-full bg-blue-600 text-base font-semibold text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] hover:bg-blue-700 focus-visible:ring-blue-500/35 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400"
        asChild
      >
        <Link href={`/god-mode/plantillas/${encodeURIComponent(template.id)}`}>
          <Pencil className="h-4 w-4" />
          {t("Edit text")}
        </Link>
      </Button>

      <div className="rounded-xl border border-border/80 bg-white p-4 text-slate-950 shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:border-white/70 dark:bg-black dark:text-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {t("Preview")}
            </p>
            <h4 className="mt-1 truncate font-heading text-lg font-semibold">
              {renderedSubject || t("No subject")}
            </h4>
          </div>
          <Badge variant="outline">{t("Read only")}</Badge>
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
            {template.audience === "professionals"
              ? SAMPLE_PROFESSIONAL.email
              : SAMPLE_ORGANIZATION.contactEmail}
          </p>
        </div>
        <div className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800 dark:border dark:border-white/40 dark:bg-black dark:text-white">
          {renderedBody || t("No message yet.")}
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-background/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("Template fit")}
            </p>
            <h4 className="mt-1 font-heading text-lg font-semibold">
              {t(analysis.label)}
            </h4>
          </div>
          <div className="rounded-full border border-border/80 bg-muted/30 px-3 py-1 text-sm font-semibold">
            {analysis.score}%
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-blue-600 dark:bg-blue-400"
            style={{ width: `${analysis.score}%` }}
          />
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {analysis.recommendedMissing.length > 0
            ? `${t("Recommended variables missing")}: ${analysis.recommendedMissing
                .map((variable) => variable.token)
                .join(", ")}`
            : t("Uses the recommended dynamic variables for this audience.")}
        </p>
      </div>

      <div
        data-testid="template-preview-variables"
        className="rounded-xl border border-border/80 bg-background/70 p-4"
      >
        <div className="flex items-center gap-2">
          <Braces className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-heading text-sm font-semibold">
            {t("Variables")}
          </h4>
        </div>
        {usedVariableDefinitions.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-border/80">
            <table className="w-full text-left text-xs">
              <tbody>
                {usedVariableDefinitions.map((variable) => {
                  const usedInSubject = analysis.subjectTokens.includes(
                    variable.token,
                  );
                  const usedInBody = analysis.bodyTokens.includes(
                    variable.token,
                  );

                  return (
                    <tr
                      key={variable.token}
                      className="border-b border-border/60 last:border-b-0"
                    >
                      <th className="bg-muted/30 px-2 py-2 align-top">
                        <TemplateVariablePill variable={variable} />
                      </th>
                      <td className="px-2 py-2 align-top text-muted-foreground">
                        <div className="flex flex-wrap gap-1">
                          {usedInSubject ? (
                            <Badge variant="outline">{t("Subject")}</Badge>
                          ) : null}
                          {usedInBody ? (
                            <Badge variant="outline">{t("Message")}</Badge>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState>{t("No variables used in this message.")}</EmptyState>
          </div>
        )}
        {analysis.unknownTokens.length > 0 ? (
          <p className="mt-3 text-sm text-destructive">
            {t("Unknown variables render blank")}:{" "}
            {analysis.unknownTokens.join(", ")}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/80 bg-background/70 p-4">
        <Label htmlFor="template-panel-notes">{t("Notes")}</Label>
        <Textarea
          id="template-panel-notes"
          value={notesDraft}
          onChange={(event) => onNotesDraftChange(event.target.value)}
          className="mt-2 min-h-24"
        />
        <Button
          type="button"
          size="sm"
          className="mt-3"
          onClick={() => onQuickUpdate({ notes: notesDraft })}
          disabled={pending || !notesChanged}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {pending ? t("Saving...") : t("Save notes")}
        </Button>
      </div>
    </aside>
  );
}

function TemplateImportReviewCard({
  row,
  rowIndex,
  totalRows,
  result,
  importing,
  checkingDuplicates,
  canImportRemaining,
  onAdd,
  onCombine,
  onSkip,
  onReviewRemaining,
  onImportAllRemaining,
  language,
}: {
  row: TemplateImportPreviewRow;
  rowIndex: number;
  totalRows: number;
  result?: TemplateImportResult;
  importing: boolean;
  checkingDuplicates: boolean;
  canImportRemaining: boolean;
  onAdd: () => void;
  onCombine: () => void;
  onSkip: () => void;
  onReviewRemaining: () => void;
  onImportAllRemaining: () => void;
  language: AppLanguage;
}) {
  const t = (text: string) => appText(language, text);
  const audience = row.template.audience ?? "organizations";
  const usage = templateVariableUsageForText(
    row.template.subject,
    row.template.body,
    audience,
  );
  const resultLabel = result
    ? result.action === "created"
      ? "Row imported"
      : result.action === "updated"
        ? "Row updated"
        : result.action === "skipped"
          ? "Row skipped"
          : result.action === "invalid"
            ? "Row invalid"
            : "Failed"
    : row.valid
      ? "Ready"
      : "Row invalid";
  const hasDuplicate = Boolean(row.duplicateTemplate);

  return (
    <section
      data-testid="template-import-current-row"
      className="grid gap-4 rounded-[1.15rem] border border-border/80 bg-background/75 p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t("Current row")}</Badge>
            <span className="text-sm text-muted-foreground">
              {t("Row")} {rowIndex + 1} {t("of")} {totalRows}
            </span>
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
          </div>
          <h3 className="mt-2 font-heading text-xl font-semibold text-foreground">
            {row.template.name || t("Untitled template")}
          </h3>
          {row.template.notes ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {row.template.notes}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {audience === "professionals"
              ? t("Professionals")
              : t("Organizations")}
          </Badge>
          <TemplateStatusBadge
            status={row.template.status ?? "active"}
            language={language}
          />
          {row.template.is_favorite ? (
            <Badge variant="warning">
              <Star className="h-3.5 w-3.5 fill-amber-400" />
              {t("Favorite")}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("Category")}
          </p>
          <p className="mt-1 text-sm font-medium">
            {formatCrmCategory(
              row.template.category ?? "",
              language,
              audience,
            ) || t("No category")}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("CSV row")}
          </p>
          <p className="mt-1 font-mono text-sm font-medium">{row.rowNumber}</p>
        </div>
      </div>

      {row.errors.length > 0 ? (
        <ErrorBanner>
          {row.errors.map((error) => t(error)).join(" ")}
        </ErrorBanner>
      ) : null}
      {result?.action === "failed" && result.error ? (
        <ErrorBanner>{result.error}</ErrorBanner>
      ) : null}

      {row.duplicateTemplate ? (
        <div
          data-testid="template-import-duplicate"
          className="rounded-xl border border-amber-200 bg-amber-50/85 p-3 text-amber-950 dark:border-amber-300/25 dark:bg-amber-400/12 dark:text-amber-50"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t("Possible duplicate")}</p>
              <p className="mt-1 text-sm leading-6 text-amber-950/75 dark:text-amber-50/75">
                {t(
                  "This row matches an existing template. Accept creates a separate template; skip leaves the existing template unchanged; combine updates the existing template using the merge rules.",
                )}
              </p>
              {row.duplicateReason ? (
                <p className="mt-1 text-xs text-amber-950/65 dark:text-amber-50/65">
                  {t(row.duplicateReason)}
                </p>
              ) : null}
            </div>
            <Badge variant="warning" className="max-w-full truncate">
              {row.duplicateTemplate.name}
            </Badge>
          </div>

          <div className="mt-3 rounded-lg border border-amber-200/80 bg-white/70 dark:border-amber-300/20 dark:bg-black/20">
            {row.conflicts.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-amber-200/80 dark:border-amber-300/20">
                  <tr>
                    <th className="px-2 py-2 font-semibold">{t("Field")}</th>
                    <th className="px-2 py-2 font-semibold">
                      {t("Existing template")}
                    </th>
                    <th className="px-2 py-2 font-semibold">{t("CSV new")}</th>
                  </tr>
                </thead>
                <tbody>
                  {row.conflicts.map((conflict) => (
                    <tr
                      key={conflict.key}
                      className="border-b border-amber-200/70 last:border-b-0 dark:border-amber-300/20"
                    >
                      <th className="w-36 px-2 py-2 align-top font-medium">
                        {t(conflict.label)}
                      </th>
                      <td className="max-w-[16rem] whitespace-pre-wrap px-2 py-2 align-top">
                        {formatTemplateImportValue(
                          conflict.key,
                          conflict.existingValue,
                          audience,
                          language,
                        )}
                      </td>
                      <td className="max-w-[16rem] whitespace-pre-wrap px-2 py-2 align-top">
                        {formatTemplateImportValue(
                          conflict.key,
                          conflict.incomingValue,
                          audience,
                          language,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-3 py-2 text-sm text-amber-950/75 dark:text-amber-50/75">
                {t("No field differences detected.")}
              </p>
            )}
          </div>

          <p className="mt-2 text-xs leading-5 text-amber-950/70 dark:text-amber-50/70">
            {t(
              "Merge rules preserve existing subject and body unless they are blank, merge notes, and keep favorite enabled if either side is favorite.",
            )}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>{t("Subject")}</Label>
          <div className="min-h-11 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm leading-7">
            {renderTemplateVariablePillNodes(row.template.subject, audience) ??
              "-"}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("Message")}</Label>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-background px-3 py-2 text-sm leading-7">
            {renderTemplateVariablePillNodes(row.template.body, audience) ??
              "-"}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <Braces className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-heading text-sm font-semibold">
            {t("Variables used")}
          </h4>
        </div>
        {usage.variables.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-border/70 bg-background/70">
            <table className="w-full text-left text-xs">
              <tbody>
                {usage.variables.map((entry) => (
                  <tr
                    key={entry.token}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <th className="w-[15rem] bg-muted/30 px-2 py-2 align-top">
                      {entry.variable ? (
                        <TemplateVariablePill variable={entry.variable} />
                      ) : (
                        <UnknownTemplateVariablePill token={entry.token} />
                      )}
                    </th>
                    <td className="px-2 py-2 align-top text-muted-foreground">
                      <div className="flex flex-wrap gap-1">
                        {entry.usedInSubject ? (
                          <Badge variant="outline">{t("Subject")}</Badge>
                        ) : null}
                        {entry.usedInBody ? (
                          <Badge variant="outline">{t("Message")}</Badge>
                        ) : null}
                        {entry.variable ? null : (
                          <Badge variant="destructive">
                            {t("Unknown variables render blank")}
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("No variables used in this message.")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onSkip}
          disabled={importing || Boolean(result)}
        >
          <X className="h-4 w-4" />
          {t("Skip row")}
        </Button>
        {hasDuplicate ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCombine}
            disabled={
              importing || checkingDuplicates || Boolean(result) || !row.valid
            }
          >
            <CheckCircle2 className="h-4 w-4" />
            {checkingDuplicates
              ? t("Checking...")
              : importing
                ? t("Importing...")
                : t("Combine with existing")}
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={onAdd}
          disabled={
            importing || checkingDuplicates || Boolean(result) || !row.valid
          }
        >
          <Plus className="h-4 w-4" />
          {checkingDuplicates
            ? t("Checking...")
            : importing
              ? t("Importing...")
              : t(hasDuplicate ? "Accept row" : "Add row")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onReviewRemaining}
          disabled={importing || checkingDuplicates || !canImportRemaining}
        >
          <FileText className="h-4 w-4" />
          {t("Review remaining one by one")}
        </Button>
        <Button
          type="button"
          className={TEMPLATE_IMPORT_CTA_CLASS}
          onClick={onImportAllRemaining}
          disabled={importing || checkingDuplicates || !canImportRemaining}
        >
          <FileUp className="h-4 w-4" />
          {importing ? t("Importing...") : t("Import all remaining")}
        </Button>
      </div>
    </section>
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
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [results, setResults] = useState<TemplateImportResult[]>([]);
  const [existingTemplates, setExistingTemplates] = useState<
    PartnershipCrmTemplateRecord[]
  >([]);
  const [duplicateScanLoading, setDuplicateScanLoading] = useState(false);
  const [duplicateScanError, setDuplicateScanError] = useState("");

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
    setActiveRowIndex(0);
    setProcessedCount(0);
    setResults([]);
    setExistingTemplates([]);
    setDuplicateScanLoading(false);
    setDuplicateScanError("");
  }, [initialAudience, open]);

  useEffect(() => {
    const parsedForScan = parsed;

    if (!open || !parsedForScan) {
      setExistingTemplates([]);
      setDuplicateScanError("");
      setDuplicateScanLoading(false);
      return;
    }

    const rowsForDuplicateScan = parsedForScan.rows;
    let cancelled = false;

    async function loadExistingTemplatesForDuplicateScan() {
      setDuplicateScanLoading(true);
      setDuplicateScanError("");

      try {
        const loaded: PartnershipCrmTemplateRecord[] = [];
        const audiencesToScan = Array.from(
          new Set(
            rowsForDuplicateScan.length > 0
              ? rowsForDuplicateScan.map((row) => templateImportAudience(row))
              : [audience],
          ),
        );

        for (const scanAudience of audiencesToScan) {
          let cursor: string | undefined;

          for (
            let pageIndex = 0;
            pageIndex < TEMPLATE_IMPORT_DUPLICATE_SCAN_PAGE_CAP;
            pageIndex += 1
          ) {
            const params = new URLSearchParams({
              limit: String(TEMPLATE_IMPORT_DUPLICATE_SCAN_PAGE_LIMIT),
              audience: scanAudience,
            });
            if (cursor) {
              params.set("cursor", cursor);
            }

            const page = await sdkFetch<PartnershipCrmTemplatesPage>(
              `/admin/partnership-crm/templates?${params.toString()}`,
            );
            loaded.push(...page.templates);

            if (!page.nextCursor) {
              break;
            }
            cursor = page.nextCursor;
          }
        }

        if (!cancelled) {
          setExistingTemplates(loaded);
        }
      } catch (error) {
        if (!cancelled) {
          setExistingTemplates([]);
          setDuplicateScanError(errorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setDuplicateScanLoading(false);
        }
      }
    }

    void loadExistingTemplatesForDuplicateScan();

    return () => {
      cancelled = true;
    };
  }, [audience, open, parsed]);

  const previewRows = useMemo(
    () => (parsed ? templatePreviewRows(parsed, existingTemplates) : []),
    [existingTemplates, parsed],
  );
  const validRows = useMemo(
    () => previewRows.filter((row) => row.valid),
    [previewRows],
  );
  const visiblePreviewRows = useMemo(
    () => previewRows.slice(0, TEMPLATE_IMPORT_PREVIEW_LIMIT),
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
  const updatedCount = results.filter(
    (result) => result.action === "updated",
  ).length;
  const failedCount = results.filter(
    (result) => result.action === "failed",
  ).length;
  const skippedCount = results.filter(
    (result) => result.action === "skipped",
  ).length;
  const currentRow = previewRows[activeRowIndex] ?? null;
  const currentRowResult = currentRow
    ? resultByRow.get(currentRow.rowNumber)
    : undefined;
  const hasPendingRows = previewRows.some(
    (row) => !resultByRow.has(row.rowNumber),
  );
  const progressValue =
    previewRows.length > 0
      ? Math.round((processedCount / previewRows.length) * 100)
      : 0;
  const canImportRemaining =
    previewRows.length > 0 &&
    hasPendingRows &&
    !importing &&
    !completed &&
    !duplicateScanLoading;

  function resetImportState() {
    csvTextRef.current = "";
    setFileName("");
    setParsed(null);
    setImporting(false);
    setCompleted(false);
    setActiveRowIndex(0);
    setProcessedCount(0);
    setResults([]);
    setExistingTemplates([]);
    setDuplicateScanLoading(false);
    setDuplicateScanError("");
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
    setActiveRowIndex(0);
    setProcessedCount(0);
    setResults([]);
    setExistingTemplates([]);
    setDuplicateScanError("");
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
      setActiveRowIndex(0);
      setProcessedCount(0);
      setResults([]);
      setExistingTemplates([]);
      setDuplicateScanError("");
    } catch (error) {
      csvTextRef.current = "";
      setFileName(file.name);
      setParsed({
        rows: [],
        errors: [{ row: 0, message: errorMessage(error) }],
      });
      setCompleted(false);
      setActiveRowIndex(0);
      setProcessedCount(0);
      setResults([]);
      setExistingTemplates([]);
      setDuplicateScanError("");
    } finally {
      input.value = "";
    }
  }

  function mergeResult(
    currentResults: TemplateImportResult[],
    nextResult: TemplateImportResult,
  ) {
    return [
      ...currentResults.filter(
        (result) => result.rowNumber !== nextResult.rowNumber,
      ),
      nextResult,
    ].sort((left, right) => left.rowNumber - right.rowNumber);
  }

  function nextUnprocessedRowIndex(
    startIndex: number,
    nextResults: TemplateImportResult[],
  ) {
    const processedRows = new Set(
      nextResults.map((result) => result.rowNumber),
    );

    return previewRows.findIndex(
      (row, index) => index > startIndex && !processedRows.has(row.rowNumber),
    );
  }

  function commitImportProgress(
    rowIndex: number,
    nextResults: TemplateImportResult[],
  ) {
    const nextRowIndex = nextUnprocessedRowIndex(rowIndex, nextResults);

    setResults(nextResults);
    setProcessedCount(nextResults.length);

    if (nextRowIndex >= 0) {
      setActiveRowIndex(nextRowIndex);
      return;
    }

    setActiveRowIndex(Math.max(0, previewRows.length - 1));
    setCompleted(previewRows.length > 0);
  }

  function absorbImportedTemplate(result: TemplateImportResult) {
    if (!result.template) {
      return;
    }

    setExistingTemplates((current) => {
      const withoutCurrent = current.filter(
        (template) => template.id !== result.template!.id,
      );
      return [...withoutCurrent, result.template!];
    });
  }

  async function createTemplateFromRow(row: TemplateImportPreviewRow) {
    if (!row.valid) {
      return {
        rowNumber: row.rowNumber,
        action: "invalid" as const,
        error: row.errors.join(" "),
      };
    }

    try {
      const response = await sdkFetch<{
        template: PartnershipCrmTemplateRecord;
      }>("/admin/partnership-crm/templates", {
        method: "POST",
        body: JSON.stringify(row.template),
      });

      return {
        rowNumber: row.rowNumber,
        action: "created" as const,
        templateId: response.template.id,
        template: response.template,
      };
    } catch (error) {
      return {
        rowNumber: row.rowNumber,
        action: "failed" as const,
        error: errorMessage(error),
      };
    }
  }

  async function mergeTemplateFromRow(row: TemplateImportPreviewRow) {
    if (!row.valid) {
      return {
        rowNumber: row.rowNumber,
        action: "invalid" as const,
        error: row.errors.join(" "),
      };
    }

    if (!row.duplicateTemplate) {
      return {
        rowNumber: row.rowNumber,
        action: "failed" as const,
        error: "No duplicate template was found for this row.",
      };
    }

    try {
      const response = await sdkFetch<{
        template: PartnershipCrmTemplateRecord;
      }>(
        `/admin/partnership-crm/templates/${encodeURIComponent(
          row.duplicateTemplate.id,
        )}`,
        {
          method: "PUT",
          body: JSON.stringify(
            mergeTemplateInputWithExisting(row.duplicateTemplate, row.template),
          ),
        },
      );

      return {
        rowNumber: row.rowNumber,
        action: "updated" as const,
        templateId: response.template.id,
        template: response.template,
      };
    } catch (error) {
      return {
        rowNumber: row.rowNumber,
        action: "failed" as const,
        error: errorMessage(error),
      };
    }
  }

  async function handleAddCurrentRow() {
    if (!currentRow || currentRowResult || importing) {
      return;
    }

    setCompleted(false);
    setImporting(true);
    const result = await createTemplateFromRow(currentRow);
    const nextResults = mergeResult(results, result);
    absorbImportedTemplate(result);
    setImporting(false);
    commitImportProgress(activeRowIndex, nextResults);

    if (result.action === "created") {
      onImported();
    }
  }

  async function handleCombineCurrentRow() {
    if (!currentRow || currentRowResult || importing) {
      return;
    }

    setCompleted(false);
    setImporting(true);
    const result = await mergeTemplateFromRow(currentRow);
    const nextResults = mergeResult(results, result);
    absorbImportedTemplate(result);
    setImporting(false);
    commitImportProgress(activeRowIndex, nextResults);

    if (result.action === "updated") {
      onImported();
    }
  }

  function handleSkipCurrentRow() {
    if (!currentRow || currentRowResult || importing) {
      return;
    }

    const result: TemplateImportResult = currentRow.valid
      ? {
          rowNumber: currentRow.rowNumber,
          action: "skipped",
          error: "Skipped during interactive review.",
        }
      : {
          rowNumber: currentRow.rowNumber,
          action: "invalid",
          error: currentRow.errors.join(" "),
        };

    commitImportProgress(activeRowIndex, mergeResult(results, result));
  }

  function handleReviewRemainingOneByOne() {
    if (!canImportRemaining) {
      return;
    }

    const currentIsPending =
      currentRow && !resultByRow.has(currentRow.rowNumber);
    if (currentIsPending) {
      setCompleted(false);
      return;
    }

    const nextRowIndex = nextUnprocessedRowIndex(-1, results);
    if (nextRowIndex >= 0) {
      setCompleted(false);
      setActiveRowIndex(nextRowIndex);
    }
  }

  async function handleImportRemaining() {
    if (!canImportRemaining) {
      return;
    }

    let workingResults = results;
    let createdAny = false;

    setCompleted(false);
    setImporting(true);

    for (
      let rowIndex = activeRowIndex;
      rowIndex < previewRows.length;
      rowIndex += 1
    ) {
      const row = previewRows[rowIndex];
      if (
        !row ||
        workingResults.some((result) => result.rowNumber === row.rowNumber)
      ) {
        continue;
      }

      setActiveRowIndex(rowIndex);
      if (!row.valid || row.duplicateTemplate) {
        setImporting(false);
        setResults(workingResults);
        setProcessedCount(workingResults.length);
        return;
      }

      const result = await createTemplateFromRow(row);
      workingResults = mergeResult(workingResults, result);
      absorbImportedTemplate(result);
      createdAny = createdAny || result.action === "created";
      setResults(workingResults);
      setProcessedCount(workingResults.length);
    }

    setImporting(false);
    setActiveRowIndex(Math.max(0, previewRows.length - 1));
    setCompleted(previewRows.length > 0);

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
      <DialogContent className="crm-control-surface sm:max-w-5xl">
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

                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-6">
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
                      {t("Updated")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {updatedCount}
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
                      {t("Skipped rows")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {skippedCount}
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

              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
                {[
                  { label: "Found", value: previewRows.length },
                  { label: "Valid", value: validRows.length },
                  { label: "Invalid", value: invalidCount },
                  { label: "Created templates", value: createdCount },
                  { label: "Updated", value: updatedCount },
                  { label: "Skipped rows", value: skippedCount },
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

              {parsed && previewRows.length > 0 ? (
                <div className="rounded-xl border border-border/80 bg-background/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      {duplicateScanLoading
                        ? t("Checking existing templates")
                        : importing
                          ? t("Importing one row at a time")
                          : t("Ready for review")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {processedCount} / {previewRows.length} {t("templates")}
                    </p>
                  </div>
                  <Progress value={progressValue} className="mt-3 h-2" />
                </div>
              ) : null}

              {duplicateScanError ? (
                <ErrorBanner>
                  {t("Unable to check existing templates for duplicates.")}{" "}
                  {duplicateScanError}
                </ErrorBanner>
              ) : null}

              {headerErrors.length > 0 ? (
                <ErrorBanner>
                  {headerErrors.map((error) => t(error.message)).join(" ")}
                </ErrorBanner>
              ) : null}

              {currentRow ? (
                <TemplateImportReviewCard
                  row={currentRow}
                  rowIndex={activeRowIndex}
                  totalRows={previewRows.length}
                  result={currentRowResult}
                  importing={importing}
                  checkingDuplicates={duplicateScanLoading}
                  canImportRemaining={canImportRemaining}
                  onAdd={handleAddCurrentRow}
                  onCombine={handleCombineCurrentRow}
                  onSkip={handleSkipCurrentRow}
                  onReviewRemaining={handleReviewRemainingOneByOne}
                  onImportAllRemaining={handleImportRemaining}
                  language={language}
                />
              ) : (
                <EmptyState>{t("No import rows found.")}</EmptyState>
              )}

              <div className="rounded-xl border border-border/80 bg-background/64 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-heading text-sm font-semibold">
                    {t("Import queue")}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {visiblePreviewRows.length} / {previewRows.length}{" "}
                    {t("rows")}
                  </span>
                </div>
                {visiblePreviewRows.length === 0 ? (
                  <EmptyState>{t("No import rows found.")}</EmptyState>
                ) : (
                  <div className="mt-3 grid max-h-56 gap-2 overflow-auto pr-1">
                    {visiblePreviewRows.map((row, index) => {
                      const result = resultByRow.get(row.rowNumber);
                      const resultLabel = result
                        ? result.action === "created"
                          ? "Row imported"
                          : result.action === "updated"
                            ? "Row updated"
                            : result.action === "skipped"
                              ? "Row skipped"
                              : result.action === "invalid"
                                ? "Row invalid"
                                : "Failed"
                        : row.valid
                          ? "Ready"
                          : "Row invalid";

                      return (
                        <button
                          key={row.rowNumber}
                          type="button"
                          className={cn(
                            "grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                            index === activeRowIndex
                              ? "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-300/35 dark:bg-blue-400/12 dark:text-blue-50"
                              : "border-border/70 bg-background/60 hover:bg-muted/45",
                          )}
                          onClick={() => setActiveRowIndex(index)}
                          disabled={importing}
                        >
                          <span className="font-mono text-xs">
                            {t("Row")} {row.rowNumber}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {row.template.name || t("Untitled template")}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {row.template.subject || t("No subject")}
                            </span>
                          </span>
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
                        </button>
                      );
                    })}
                  </div>
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
                variant="outline"
                onClick={handleReviewRemainingOneByOne}
                disabled={!canImportRemaining}
              >
                <FileText className="h-4 w-4" />
                {t("Review remaining one by one")}
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={handleImportRemaining}
                disabled={!canImportRemaining}
                className={TEMPLATE_IMPORT_CTA_CLASS}
              >
                <FileUp className="h-4 w-4" />
                {importing ? t("Importing...") : t("Import all remaining")}
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [previewPanelOpen, setPreviewPanelOpen] = useState(false);
  const templateSplitPaneRef = useRef<HTMLDivElement | null>(null);
  const [templatePanelWidthPercent, setTemplatePanelWidthPercent] = useState(
    TEMPLATE_DETAIL_PANEL_DEFAULT_WIDTH_PERCENT,
  );
  const [templatePanelResizing, setTemplatePanelResizing] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<PartnershipCrmTemplateRecord | null>(null);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [toast, setToast] = useState<ActionToastState | null>(null);
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
  const selectedTemplate = selectedTemplateId
    ? (templates.find((template) => template.id === selectedTemplateId) ?? null)
    : null;
  const selectedTemplates = useMemo(
    () => templates.filter((template) => selectedTemplateIds.has(template.id)),
    [selectedTemplateIds, templates],
  );
  const selectedTemplateIdList = useMemo(
    () => Array.from(selectedTemplateIds),
    [selectedTemplateIds],
  );
  const selectedVisibleTemplateCount = selectedTemplates.length;
  const allVisibleTemplatesSelected =
    templates.length > 0 && selectedVisibleTemplateCount === templates.length;
  const someVisibleTemplatesSelected =
    selectedVisibleTemplateCount > 0 &&
    selectedVisibleTemplateCount < templates.length;
  const showPreviewPanel = Boolean(previewPanelOpen && selectedTemplate);
  const templateSplitPaneStyle = showPreviewPanel
    ? ({
        "--crm-template-list-panel-width": `${
          100 - templatePanelWidthPercent
        }fr`,
        "--crm-template-detail-panel-width": `${templatePanelWidthPercent}fr`,
      } as CSSProperties)
    : undefined;
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

  const quickUpdateMutation = useMutation({
    mutationFn: ({
      template,
      patch,
    }: {
      template: PartnershipCrmTemplateRecord;
      patch: TemplateQuickPatch;
    }) =>
      sdkFetch<{ template: PartnershipCrmTemplateRecord }>(
        `/admin/partnership-crm/templates/${encodeURIComponent(template.id)}`,
        {
          method: "PUT",
          body: JSON.stringify(templateInputFromRecord(template, patch)),
        },
      ),
    onSuccess: (result) => {
      updateCachedTemplateListPages(queryClient, (templates) =>
        templates.map((template) =>
          template.id === result.template.id ? result.template : template,
        ),
      );
      setSelectedTemplateId(result.template.id);
      setNotesDraft(result.template.notes);
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Template saved."),
      });
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
    mutationFn: (template: PartnershipCrmTemplateRecord) =>
      sdkFetch<{ deleted: boolean; templateId: string }>(
        `/admin/partnership-crm/templates/${encodeURIComponent(template.id)}`,
        { method: "DELETE" },
      ),
    onSuccess: (_result, template) => {
      setDeleteTarget(null);
      setSelectedTemplateId((current) =>
        current === template.id ? null : current,
      );
      setPreviewPanelOpen(false);
      queryClient.invalidateQueries({ queryKey: [TEMPLATES_QUERY_KEY] });
      setToast({
        id: Date.now(),
        tone: "success",
        message: t("Template deleted."),
      });
    },
    onError: (error) => {
      setDeleteTarget(null);
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to delete template."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const deleteSelectedTemplatesMutation = useMutation({
    mutationFn: (templateIds: string[]) =>
      Promise.all(
        templateIds.map((templateId) =>
          sdkFetch<{ deleted: boolean; templateId: string }>(
            `/admin/partnership-crm/templates/${encodeURIComponent(
              templateId,
            )}`,
            { method: "DELETE" },
          ),
        ),
      ),
    onSuccess: (_result, templateIds) => {
      const deletedIds = new Set(templateIds);
      setDeleteSelectedOpen(false);
      setSelectedTemplateIds(new Set());
      setDeleteTarget((current) =>
        current && deletedIds.has(current.id) ? null : current,
      );

      if (selectedTemplateId && deletedIds.has(selectedTemplateId)) {
        setSelectedTemplateId(null);
        setPreviewPanelOpen(false);
      }

      updateCachedTemplateListPages(queryClient, (templates) =>
        templates.filter((template) => !deletedIds.has(template.id)),
      );
      queryClient.invalidateQueries({ queryKey: [TEMPLATES_QUERY_KEY] });
      setToast({
        id: Date.now(),
        tone: "success",
        message: `${templateIds.length} ${
          templateIds.length === 1
            ? t("template deleted.")
            : t("templates deleted.")
        }`,
      });
    },
    onError: (error) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to delete selected templates."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const updateSelectedTemplatesFavoriteMutation = useMutation({
    mutationFn: ({
      templates,
      isFavorite,
    }: {
      templates: PartnershipCrmTemplateRecord[];
      isFavorite: boolean;
    }) =>
      Promise.all(
        templates.map((template) =>
          sdkFetch<{ template: PartnershipCrmTemplateRecord }>(
            `/admin/partnership-crm/templates/${encodeURIComponent(
              template.id,
            )}`,
            {
              method: "PUT",
              body: JSON.stringify(
                templateInputFromRecord(template, {
                  is_favorite: isFavorite,
                }),
              ),
            },
          ),
        ),
      ),
    onSuccess: (results, { isFavorite }) => {
      const updatedTemplates = new Map(
        results.map((result) => [result.template.id, result.template]),
      );

      updateCachedTemplateListPages(queryClient, (templates) =>
        templates.map(
          (template) => updatedTemplates.get(template.id) ?? template,
        ),
      );
      queryClient.invalidateQueries({ queryKey: [TEMPLATES_QUERY_KEY] });
      setToast({
        id: Date.now(),
        tone: "success",
        message: isFavorite
          ? t("Selected templates marked as favorite.")
          : t("Selected templates marked as not favorite."),
      });
    },
    onError: (error) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message: t("Unable to update selected templates."),
        details: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const selectedTemplateActionPending =
    deleteSelectedTemplatesMutation.isPending ||
    updateSelectedTemplatesFavoriteMutation.isPending;

  useEffect(() => {
    if (!selectedTemplateId) {
      return;
    }
    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(null);
      setPreviewPanelOpen(false);
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    setNotesDraft(selectedTemplate?.notes ?? "");
  }, [selectedTemplate?.id, selectedTemplate?.notes]);

  useEffect(() => {
    if (selectedTemplateIds.size === 0) {
      return;
    }

    const visibleIds = new Set(templates.map((template) => template.id));
    setSelectedTemplateIds((current) => {
      const next = new Set(
        Array.from(current).filter((templateId) => visibleIds.has(templateId)),
      );

      return next.size === current.size ? current : next;
    });
  }, [selectedTemplateIds.size, templates]);

  useEffect(() => {
    if (!templatePanelResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(event: PointerEvent) {
      event.preventDefault();
      setTemplatePanelWidthFromClientX(event.clientX);
    }

    function stopResizing() {
      setTemplatePanelResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [templatePanelResizing]);

  function setTemplatePanelWidthFromClientX(clientX: number) {
    const bounds = templateSplitPaneRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) {
      return;
    }

    const nextWidth = ((bounds.right - clientX) / bounds.width) * 100;
    setTemplatePanelWidthPercent(
      clampTemplateDetailPanelWidthPercent(Math.round(nextWidth * 10) / 10),
    );
  }

  function handleTemplatePanelResizePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();
    setTemplatePanelWidthFromClientX(event.clientX);
    setTemplatePanelResizing(true);
  }

  function adjustTemplatePanelWidth(delta: number) {
    setTemplatePanelWidthPercent((current) =>
      clampTemplateDetailPanelWidthPercent(current + delta),
    );
  }

  function handleTemplatePanelResizeKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
  ) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustTemplatePanelWidth(TEMPLATE_DETAIL_PANEL_KEYBOARD_STEP_PERCENT);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustTemplatePanelWidth(-TEMPLATE_DETAIL_PANEL_KEYBOARD_STEP_PERCENT);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setTemplatePanelWidthPercent(TEMPLATE_DETAIL_PANEL_MIN_WIDTH_PERCENT);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setTemplatePanelWidthPercent(TEMPLATE_DETAIL_PANEL_MAX_WIDTH_PERCENT);
    }
  }

  function resetCursorsForFilterChange(patch: Partial<TemplateFilters>) {
    setCursorStack([]);
    setSelectedTemplateIds(new Set());
    setDeleteSelectedOpen(false);
    setFilters((current) => ({ ...current, ...patch }));
  }

  function handleAudienceChange(audience: PartnershipCrmTemplateAudience) {
    setSelectedTemplateId(null);
    setPreviewPanelOpen(false);
    setSelectedTemplateIds(new Set());
    setDeleteSelectedOpen(false);
    resetCursorsForFilterChange({ audience, category: "" });
  }

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId);
    setPreviewPanelOpen(true);
  }

  function handleQuickUpdate(patch: TemplateQuickPatch) {
    if (!selectedTemplate) {
      return;
    }

    quickUpdateMutation.mutate({ template: selectedTemplate, patch });
  }

  function toggleTemplateSelection(templateId: string) {
    setSelectedTemplateIds((current) => {
      const next = new Set(current);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  }

  function setVisibleTemplatesSelected(selected: boolean) {
    setSelectedTemplateIds((current) => {
      const next = new Set(current);
      for (const template of templates) {
        if (selected) {
          next.add(template.id);
        } else {
          next.delete(template.id);
        }
      }
      return next;
    });
  }

  function clearSelectedTemplates() {
    setSelectedTemplateIds(new Set());
    setDeleteSelectedOpen(false);
  }

  return (
    <section className="glass-panel crm-control-surface flex flex-col gap-5 px-4 py-4 md:px-5">
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
          <SelectContent className="crm-control-dropdown">
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

      <div
        ref={templateSplitPaneRef}
        data-testid="crm-template-split-pane"
        className={cn(
          "grid gap-4",
          showPreviewPanel &&
            "xl:h-[calc(100vh_-_var(--app-header-height)_-_2rem)] xl:min-h-0 xl:grid-cols-[minmax(0,var(--crm-template-list-panel-width))_1rem_minmax(0,var(--crm-template-detail-panel-width))] xl:items-stretch xl:gap-0 xl:overflow-hidden",
        )}
        style={templateSplitPaneStyle}
      >
        <div
          className={cn(
            "grid content-start gap-4",
            showPreviewPanel &&
              "xl:flex xl:min-h-0 xl:flex-col xl:overflow-visible xl:pr-2",
          )}
        >
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
                <p className="text-xs text-muted-foreground">
                  {t(option.label)}
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {statusCounts[option.value]}
                </p>
              </button>
            ))}
          </div>

          {templatesQuery.error ? (
            <ErrorBanner>{t("Failed to load templates.")}</ErrorBanner>
          ) : null}

          <div
            className={cn(
              "overflow-hidden rounded-xl border border-border/80 bg-background/64",
              showPreviewPanel &&
                "xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-auto",
            )}
          >
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
              <>
                {selectedTemplateIds.size > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/35 px-3 py-2">
                    <p className="text-sm font-medium text-foreground">
                      {selectedTemplateIds.size}{" "}
                      {t(
                        selectedTemplateIds.size === 1
                          ? "template selected"
                          : "templates selected",
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearSelectedTemplates}
                        disabled={selectedTemplateActionPending}
                      >
                        <X className="h-3.5 w-3.5" />
                        {t("Clear selected")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateSelectedTemplatesFavoriteMutation.mutate({
                            templates: selectedTemplates,
                            isFavorite: true,
                          })
                        }
                        disabled={
                          selectedTemplateActionPending ||
                          selectedTemplates.length === 0
                        }
                      >
                        <Star className="h-3.5 w-3.5" />
                        {updateSelectedTemplatesFavoriteMutation.isPending
                          ? t("Updating...")
                          : t("Mark selected as favorite")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateSelectedTemplatesFavoriteMutation.mutate({
                            templates: selectedTemplates,
                            isFavorite: false,
                          })
                        }
                        disabled={
                          selectedTemplateActionPending ||
                          selectedTemplates.length === 0
                        }
                      >
                        <Star className="h-3.5 w-3.5" />
                        {updateSelectedTemplatesFavoriteMutation.isPending
                          ? t("Updating...")
                          : t("Mark selected as not favorite")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteSelectedOpen(true)}
                        disabled={selectedTemplateActionPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("Delete selected")}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          aria-label={t("Select all visible templates")}
                          checked={
                            allVisibleTemplatesSelected
                              ? true
                              : someVisibleTemplatesSelected
                                ? "indeterminate"
                                : false
                          }
                          disabled={selectedTemplateActionPending}
                          onCheckedChange={(checked) =>
                            setVisibleTemplatesSelected(checked === true)
                          }
                        />
                      </TableHead>
                      <TableHead>{t("Template")}</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">{t("Favorite")}</span>
                      </TableHead>
                      <TableHead>{t("Applies to")}</TableHead>
                      <TableHead>{t("Status")}</TableHead>
                      <TableHead>{t("Category")}</TableHead>
                      <TableHead>{t("Updated")}</TableHead>
                      <TableHead>{t("Notes")}</TableHead>
                      <TableHead className="w-28">
                        <span className="sr-only">{t("Actions")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => {
                      const isSelected =
                        showPreviewPanel &&
                        selectedTemplate?.id === template.id;
                      const isBatchSelected = selectedTemplateIds.has(
                        template.id,
                      );

                      return (
                        <TableRow
                          key={template.id}
                          data-state={
                            isSelected || isBatchSelected
                              ? "selected"
                              : undefined
                          }
                          className={cn(
                            "cursor-pointer",
                            isSelected &&
                              "bg-sky-50/80 hover:bg-sky-50 dark:bg-sky-400/10 dark:hover:bg-sky-400/12",
                          )}
                          onClick={() => handleTemplateSelect(template.id)}
                        >
                          <TableCell>
                            <Checkbox
                              aria-label={`${t("Select template")}: ${
                                template.name
                              }`}
                              checked={isBatchSelected}
                              disabled={selectedTemplateActionPending}
                              onClick={(event) => event.stopPropagation()}
                              onCheckedChange={() =>
                                toggleTemplateSelection(template.id)
                              }
                            />
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <button
                              type="button"
                              className="block max-w-[320px] text-left"
                              onClick={() => handleTemplateSelect(template.id)}
                            >
                              <span className="block truncate font-medium text-foreground">
                                {template.name}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {template.subject || t("No subject")}
                              </span>
                            </button>
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
                          <TableCell>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              asChild
                            >
                              <Link
                                href={`/god-mode/plantillas/${encodeURIComponent(
                                  template.id,
                                )}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {t("Edit")}
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
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
        </div>

        {showPreviewPanel ? (
          <div
            role="separator"
            tabIndex={0}
            aria-label={t("Resize template preview panel")}
            aria-orientation="vertical"
            aria-valuemin={Math.round(TEMPLATE_DETAIL_PANEL_MIN_WIDTH_PERCENT)}
            aria-valuemax={Math.round(TEMPLATE_DETAIL_PANEL_MAX_WIDTH_PERCENT)}
            aria-valuenow={Math.round(templatePanelWidthPercent)}
            className={cn(
              "group hidden cursor-col-resize touch-none select-none items-center justify-center self-stretch rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/45 xl:flex",
              templatePanelResizing && "bg-primary/8",
            )}
            onPointerDown={handleTemplatePanelResizePointerDown}
            onKeyDown={handleTemplatePanelResizeKeyDown}
          >
            <div
              className={cn(
                "flex h-16 w-4 items-center justify-center rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-sm transition-colors group-hover:border-primary/45 group-hover:text-foreground group-focus-visible:border-primary/60",
                templatePanelResizing && "border-primary/60 text-foreground",
              )}
            >
              <GripVertical className="h-4 w-4" />
            </div>
          </div>
        ) : null}

        {showPreviewPanel && selectedTemplate ? (
          <TemplatePreviewSidePanel
            template={selectedTemplate}
            notesDraft={notesDraft}
            onNotesDraftChange={setNotesDraft}
            onQuickUpdate={handleQuickUpdate}
            onDelete={() => setDeleteTarget(selectedTemplate)}
            onClose={() => setPreviewPanelOpen(false)}
            pending={quickUpdateMutation.isPending}
            deletePending={deleteMutation.isPending}
            language={language}
          />
        ) : null}
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
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="crm-control-surface">
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
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget)
              }
              disabled={!deleteTarget || deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? t("Deleting...") : t("Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleteSelectedOpen}
        onOpenChange={(open) => {
          if (!open && !deleteSelectedTemplatesMutation.isPending) {
            setDeleteSelectedOpen(false);
          }
        }}
      >
        <DialogContent className="crm-control-surface">
          <DialogHeader>
            <DialogTitle>{t("Delete selected templates")}</DialogTitle>
            <DialogDescription>
              {t(
                "This removes every selected template from the CRM send flow.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border/80 bg-background/70 p-3">
            <p className="text-sm font-semibold text-foreground">
              {selectedTemplateIds.size}{" "}
              {t(
                selectedTemplateIds.size === 1
                  ? "template selected"
                  : "templates selected",
              )}
            </p>
            <div className="mt-3 grid gap-2">
              {selectedTemplates.map((template) => (
                <div
                  key={template.id}
                  className="rounded-lg border border-border/70 bg-background px-3 py-2"
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {template.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {template.subject || t("No subject")}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteSelectedOpen(false)}
              disabled={deleteSelectedTemplatesMutation.isPending}
            >
              <X className="h-4 w-4" />
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                deleteSelectedTemplatesMutation.mutate(selectedTemplateIdList)
              }
              disabled={
                deleteSelectedTemplatesMutation.isPending ||
                selectedTemplateIdList.length === 0
              }
            >
              <Trash2 className="h-4 w-4" />
              {deleteSelectedTemplatesMutation.isPending
                ? t("Deleting...")
                : t("Delete selected")}
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
  const [previewOpen, setPreviewOpen] = useState(false);
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
    <section className="glass-panel crm-control-surface flex flex-col gap-5 px-4 py-4 md:px-5">
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
          <Button
            type="button"
            size="sm"
            className="bg-blue-600 text-white shadow-[0_8px_18px_rgba(37,99,235,0.22)] hover:bg-blue-700 focus-visible:ring-blue-500/35 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400"
            onClick={() => setPreviewOpen(true)}
            disabled={
              templateQuery.isFetching && isEditing && !templateQuery.data
            }
          >
            <Eye className="h-3.5 w-3.5" />
            {t("View preview")}
          </Button>
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
        <div className="grid gap-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
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
                    <SelectContent className="crm-control-dropdown">
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
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="crm-control-surface sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Preview")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("Rendered template preview.")}
            </DialogDescription>
          </DialogHeader>
          <TemplatePreview form={form} language={language} />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="crm-control-surface">
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
