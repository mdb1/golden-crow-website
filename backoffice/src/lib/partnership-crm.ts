import { normalizeDiscoverOrganizationCountryCode } from "./discover-organization-fields";

export const PARTNERSHIP_CRM_FROM_EMAIL = "federico@goldencrowvs.com";

export const CRM_STATUS_OPTIONS = [
  { value: "new", label: "CRM New" },
  { value: "contacted", label: "CRM Contacted" },
  { value: "replied", label: "CRM Replied" },
  { value: "meeting", label: "CRM Meeting" },
  { value: "partner", label: "CRM Partner" },
  { value: "no_response", label: "CRM No Response" },
  { value: "not_interested", label: "CRM Not Interested" },
  { value: "not_a_fit", label: "CRM Not a Fit" },
] as const;

export const CRM_CATEGORY_OPTIONS = [
  "Laboratory / Genomics",
  "Fertility Clinic",
  "Foundation",
  "Education",
  "Umbrella Organization",
  "Hospital",
  "Research Center",
  "Scientific Society",
  "Genetic Testing Platform",
  "Other",
] as const;

export const CRM_TEMPLATE_STATUS_OPTIONS = [
  { value: "active", label: "Template Active" },
  { value: "inactive", label: "Template Inactive" },
  { value: "archived", label: "Template Archived" },
] as const;

export type PartnershipCrmStatus = (typeof CRM_STATUS_OPTIONS)[number]["value"];
export type PartnershipCrmTemplateStatus =
  (typeof CRM_TEMPLATE_STATUS_OPTIONS)[number]["value"];
export type CrmDuplicateAction = "skip" | "update" | "import";

export interface PartnershipCrmOrganizationRecord {
  id: string;
  schemaVersion: number;
  name: string;
  category: string;
  website: string;
  websiteDomain: string;
  country: string;
  status: PartnershipCrmStatus;
  contactName: string;
  contactEmail: string;
  contactLinkedIn: string;
  lastContactAt: string | null;
  notes: string;
  normalizedName: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
}

export interface PartnershipCrmActivityRecord {
  id: string;
  type: "created" | "updated" | "status" | "note" | "email" | "import";
  title: string;
  body: string;
  occurredAt?: string;
  createdAt?: string;
  createdByEmail?: string;
  metadata?: Record<string, unknown>;
}

export interface PartnershipCrmOrganizationsPage {
  organizations: PartnershipCrmOrganizationRecord[];
  nextCursor?: string;
}

export interface PartnershipCrmActivitiesPage {
  activities: PartnershipCrmActivityRecord[];
  nextCursor?: string;
}

export interface PartnershipCrmTemplateRecord {
  id: string;
  schemaVersion: number;
  name: string;
  category: string;
  subject: string;
  body: string;
  status: PartnershipCrmTemplateStatus;
  notes: string;
  normalizedName: string;
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string;
  updatedByEmail?: string;
}

export interface PartnershipCrmTemplatesPage {
  templates: PartnershipCrmTemplateRecord[];
  nextCursor?: string;
}

export interface PartnershipCrmTemplateInput {
  name: string;
  category?: string;
  subject: string;
  body: string;
  status?: PartnershipCrmTemplateStatus;
  notes?: string;
}

export interface PartnershipCrmOrganizationInput {
  name: string;
  category?: string;
  website?: string;
  country?: string;
  status?: PartnershipCrmStatus;
  contactName?: string;
  contactEmail?: string;
  contactLinkedIn?: string;
  lastContactAt?: string | null;
  notes?: string;
}

export interface PartnershipCrmDuplicateCandidate {
  id: string;
  name: string;
  website: string;
  websiteDomain: string;
  contactEmail: string;
  status: PartnershipCrmStatus;
}

export interface PartnershipCrmImportPreviewRow {
  rowId: string;
  organization: PartnershipCrmOrganizationInput;
  valid: boolean;
  errors: string[];
  missingEmail: boolean;
  duplicateCandidates: PartnershipCrmDuplicateCandidate[];
  duplicateAction?: CrmDuplicateAction;
  duplicateOrganizationId?: string;
}

export interface PartnershipCrmImportPreview {
  rows: PartnershipCrmImportPreviewRow[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    missingEmail: number;
    duplicates: number;
  };
}

export interface PartnershipCrmImportResult {
  results: Array<{
    rowId: string;
    action: "created" | "updated" | "skipped" | "invalid";
    organizationId?: string;
    reason?: string;
  }>;
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    invalid: number;
  };
}

export interface ParsedCrmCsv {
  rows: PartnershipCrmOrganizationInput[];
  errors: Array<{ row: number; message: string }>;
}

const STATUS_ALIASES: Record<string, PartnershipCrmStatus> = {
  new: "new",
  nuevo: "new",
  nueva: "new",
  contacted: "contacted",
  contactado: "contacted",
  contactada: "contacted",
  replied: "replied",
  respondio: "replied",
  respondio_: "replied",
  respondido: "replied",
  meeting: "meeting",
  reunion: "meeting",
  reunio_n: "meeting",
  partner: "partner",
  socio: "partner",
  no_response: "no_response",
  sin_respuesta: "no_response",
  not_interested: "not_interested",
  no_interesado: "not_interested",
  no_interesada: "not_interested",
  not_a_fit: "not_a_fit",
  no_encaja: "not_a_fit",
};

const CATEGORY_ALIASES: Record<string, (typeof CRM_CATEGORY_OPTIONS)[number]> =
  {
    laboratory: "Laboratory / Genomics",
    lab: "Laboratory / Genomics",
    genomics: "Laboratory / Genomics",
    laboratorio_genomica: "Laboratory / Genomics",
    laboratory_genomics: "Laboratory / Genomics",
    fertility: "Fertility Clinic",
    fertility_clinic: "Fertility Clinic",
    clinica_de_fertilidad: "Fertility Clinic",
    foundation: "Foundation",
    fundacion: "Foundation",
    education: "Education",
    educacion: "Education",
    umbrella_organization: "Umbrella Organization",
    organizacion_paraguas: "Umbrella Organization",
    hospital: "Hospital",
    research_center: "Research Center",
    centro_de_investigacion: "Research Center",
    scientific_society: "Scientific Society",
    sociedad_cientifica: "Scientific Society",
    genetic_testing_platform: "Genetic Testing Platform",
    plataforma_de_pruebas_geneticas: "Genetic Testing Platform",
    other: "Other",
    otro: "Other",
  };

const HEADER_ALIASES: Record<keyof PartnershipCrmOrganizationInput, string[]> =
  {
    name: [
      "name",
      "organization",
      "organization_name",
      "nombre",
      "organizacion",
    ],
    category: ["category", "organization_category", "categoria", "tipo"],
    website: ["website", "web", "url", "site", "sitio"],
    country: ["country", "pais"],
    status: ["status", "estado"],
    contactName: ["contact", "contact_name", "primary_contact", "contacto"],
    contactEmail: ["email", "contact_email", "mail", "correo"],
    contactLinkedIn: ["linkedin", "contact_linkedin", "linked_in"],
    lastContactAt: ["last_contact", "last_contact_at", "ultimo_contacto"],
    notes: ["notes", "note", "notas", "observaciones"],
  };

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeStatus(value: string): PartnershipCrmStatus {
  const key = normalizeKey(value);
  return STATUS_ALIASES[key] ?? "new";
}

export function normalizeCrmCategory(value: string) {
  const raw = value.trim();
  if (!raw) {
    return "";
  }

  const normalized = normalizeKey(raw);
  return (
    CRM_CATEGORY_OPTIONS.find(
      (category) => normalizeKey(category) === normalized,
    ) ??
    CATEGORY_ALIASES[normalized] ??
    "Other"
  );
}

export function normalizeCrmCountry(value: string) {
  const countryCode = normalizeDiscoverOrganizationCountryCode(value);
  return countryCode === "GLOBAL" ? "" : countryCode;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function fieldForHeader(header: string) {
  const normalized = normalizeKey(header);
  const entry = Object.entries(HEADER_ALIASES).find(([, aliases]) =>
    aliases.includes(normalized),
  );

  return entry?.[0] as keyof PartnershipCrmOrganizationInput | undefined;
}

export function parseCrmCsv(text: string): ParsedCrmCsv {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const [headerLine, ...dataLines] = lines;

  if (!headerLine) {
    return {
      rows: [],
      errors: [{ row: 0, message: "CSV file is empty." }],
    };
  }

  const headers = parseCsvLine(headerLine).map(fieldForHeader);
  if (!headers.includes("name")) {
    return {
      rows: [],
      errors: [{ row: 1, message: "CSV needs a name column." }],
    };
  }

  const rows: PartnershipCrmOrganizationInput[] = [];
  const errors: ParsedCrmCsv["errors"] = [];

  dataLines.forEach((line, index) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((field, cellIndex) => {
      if (field) {
        row[field] = cells[cellIndex]?.trim() ?? "";
      }
    });

    if (!row.name?.trim()) {
      errors.push({
        row: index + 2,
        message: "Organization name is required.",
      });
    }

    rows.push({
      name: row.name?.trim() ?? "",
      category: normalizeCrmCategory(row.category ?? ""),
      website: row.website?.trim() ?? "",
      country: normalizeCrmCountry(row.country ?? ""),
      status: normalizeStatus(row.status ?? ""),
      contactName: row.contactName?.trim() ?? "",
      contactEmail: row.contactEmail?.trim().toLowerCase() ?? "",
      contactLinkedIn: row.contactLinkedIn?.trim() ?? "",
      lastContactAt: row.lastContactAt?.trim() || null,
      notes: row.notes?.trim() ?? "",
    });
  });

  return { rows, errors };
}

function websiteSentence(organization: PartnershipCrmOrganizationRecord) {
  if (!organization.websiteDomain) {
    return "";
  }

  return ` (${organization.websiteDomain})`;
}

export function renderCrmTemplate(
  template: PartnershipCrmTemplateRecord,
  organization: PartnershipCrmOrganizationRecord,
) {
  const variables: Record<string, string> = {
    contact_name: organization.contactName || "equipo",
    organization_name: organization.name,
    website: organization.website || organization.websiteDomain,
    website_sentence: websiteSentence(organization),
  };
  const apply = (value: string) =>
    value.replace(
      /\{\{([a-z_]+)\}\}/g,
      (_, key: string) => variables[key] ?? "",
    );

  return {
    template,
    subject: apply(template.subject),
    body: apply(template.body),
  };
}

export function statusLabel(status: PartnershipCrmStatus) {
  return (
    CRM_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

export function templateStatusLabel(status: PartnershipCrmTemplateStatus) {
  return (
    CRM_TEMPLATE_STATUS_OPTIONS.find((option) => option.value === status)
      ?.label ?? status
  );
}

export function bestCrmTemplateForOrganization(
  organization: PartnershipCrmOrganizationRecord,
  templates: PartnershipCrmTemplateRecord[],
) {
  const activeTemplates = templates.filter(
    (template) => template.status === "active",
  );
  const visibleTemplates =
    activeTemplates.length > 0 ? activeTemplates : templates;
  const organizationCategory = normalizeKey(organization.category);

  if (!visibleTemplates.length) {
    return null;
  }

  return (
    visibleTemplates.find(
      (template) => normalizeKey(template.category) === organizationCategory,
    ) ??
    visibleTemplates.find((template) => {
      const templateCategory = normalizeKey(template.category);
      return (
        organizationCategory &&
        templateCategory &&
        (organizationCategory.includes(templateCategory) ||
          templateCategory.includes(organizationCategory))
      );
    }) ??
    visibleTemplates[0]
  );
}
