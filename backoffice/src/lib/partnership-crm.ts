import { normalizeDiscoverOrganizationCountryCode } from "./discover-organization-fields";
import {
  DISCOVER_ORGANIZATION_CATEGORY_OPTIONS,
  type DiscoverOrganizationCategoryKey,
} from "./discover-publisher-categories";

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

export const CRM_CATEGORY_OPTIONS = DISCOVER_ORGANIZATION_CATEGORY_OPTIONS;
export const DEFAULT_CRM_CATEGORY =
  "org_genetic_testing_laboratories" satisfies DiscoverOrganizationCategoryKey;

export const CRM_TEMPLATE_STATUS_OPTIONS = [
  { value: "active", label: "Template Active" },
  { value: "inactive", label: "Template Inactive" },
  { value: "archived", label: "Template Archived" },
] as const;

export type PartnershipCrmStatus = (typeof CRM_STATUS_OPTIONS)[number]["value"];
export type PartnershipCrmTemplateStatus =
  (typeof CRM_TEMPLATE_STATUS_OPTIONS)[number]["value"];
export type PartnershipCrmCategory = DiscoverOrganizationCategoryKey;
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

export interface ParsedCrmTemplateCsv {
  rows: PartnershipCrmTemplateInput[];
  errors: Array<{ row: number; message: string }>;
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

const CATEGORY_ALIASES: Record<string, PartnershipCrmCategory | ""> = {
  laboratory: "org_genetic_testing_laboratories",
  lab: "org_genetic_testing_laboratories",
  genomics: "org_genomics_laboratories",
  laboratorio_genomica: "org_genomics_laboratories",
  laboratory_genomics: "org_genomics_laboratories",
  fertility: "org_fertility_clinics",
  fertility_clinic: "org_fertility_clinics",
  clinica_de_fertilidad: "org_fertility_clinics",
  foundation: "org_rare_disease_foundations",
  fundacion: "org_rare_disease_foundations",
  education: "org_genetics_education_providers",
  educacion: "org_genetics_education_providers",
  umbrella_organization: "org_rare_disease_networks",
  organizacion_paraguas: "org_rare_disease_networks",
  hospital: "org_teaching_hospitals",
  research_center: "org_genomics_research_institutes",
  centro_de_investigacion: "org_genomics_research_institutes",
  scientific_society: "org_scientific_societies",
  sociedad_cientifica: "org_scientific_societies",
  genetic_testing_platform: "org_genetic_testing_platforms",
  plataforma_de_pruebas_geneticas: "org_genetic_testing_platforms",
  other: "",
  otro: "",
};

const TEMPLATE_STATUS_ALIASES: Record<string, PartnershipCrmTemplateStatus> = {
  active: "active",
  activo: "active",
  activa: "active",
  enabled: "active",
  inactive: "inactive",
  inactivo: "inactive",
  inactiva: "inactive",
  disabled: "inactive",
  archived: "archived",
  archive: "archived",
  archivado: "archived",
  archivada: "archived",
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

const TEMPLATE_HEADER_ALIASES: Record<keyof PartnershipCrmTemplateInput, string[]> =
  {
    name: ["name", "template", "template_name", "nombre", "plantilla"],
    category: ["category", "template_category", "categoria", "tipo"],
    subject: ["subject", "asunto"],
    body: ["body", "message", "text", "cuerpo", "mensaje", "texto"],
    status: ["status", "estado"],
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

function normalizeTemplateStatus(value: string): PartnershipCrmTemplateStatus {
  const key = normalizeKey(value);
  return TEMPLATE_STATUS_ALIASES[key] ?? "active";
}

export function normalizeCrmCategory(value: string): string {
  const raw = value.trim();
  if (!raw) {
    return "";
  }

  const normalized = normalizeKey(raw);
  const option = CRM_CATEGORY_OPTIONS.find(
    (category) =>
      normalizeKey(category.value) === normalized ||
      normalizeKey(category.label) === normalized,
  );
  if (option) {
    return option.value;
  }

  if (Object.prototype.hasOwnProperty.call(CATEGORY_ALIASES, normalized)) {
    return CATEGORY_ALIASES[normalized] ?? "";
  }

  return "";
}

export function crmCategoryLabel(value: string) {
  const normalized = normalizeCrmCategory(value);
  return (
    CRM_CATEGORY_OPTIONS.find((category) => category.value === normalized)
      ?.label ?? value.trim()
  );
}

export function normalizeCrmCountry(value: string) {
  const countryCode = normalizeDiscoverOrganizationCountryCode(value);
  return countryCode === "GLOBAL" ? "" : countryCode;
}

function parseCsvRecords(text: string) {
  const records: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

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
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(current.trim());
      if (row.some((cell) => cell.trim().length > 0)) {
        records.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((cell) => cell.trim().length > 0)) {
      records.push(row);
    }
  }

  return records;
}

function fieldForHeader(header: string) {
  const normalized = normalizeKey(header);
  const entry = Object.entries(HEADER_ALIASES).find(([, aliases]) =>
    aliases.includes(normalized),
  );

  return entry?.[0] as keyof PartnershipCrmOrganizationInput | undefined;
}

function templateFieldForHeader(header: string) {
  const normalized = normalizeKey(header);
  const entry = Object.entries(TEMPLATE_HEADER_ALIASES).find(([, aliases]) =>
    aliases.includes(normalized),
  );

  return entry?.[0] as keyof PartnershipCrmTemplateInput | undefined;
}

function normalizeTemplateCsvText(value: string) {
  return value.trim().replace(/\\n/g, "\n");
}

export function parseCrmCsv(text: string): ParsedCrmCsv {
  const [headerCells, ...dataRows] = parseCsvRecords(text);

  if (!headerCells) {
    return {
      rows: [],
      errors: [{ row: 0, message: "CSV file is empty." }],
    };
  }

  const headers = headerCells.map(fieldForHeader);
  if (!headers.includes("name")) {
    return {
      rows: [],
      errors: [{ row: 1, message: "CSV needs a name column." }],
    };
  }

  const rows: PartnershipCrmOrganizationInput[] = [];
  const errors: ParsedCrmCsv["errors"] = [];

  dataRows.forEach((cells, index) => {
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

export function parseCrmTemplateCsv(text: string): ParsedCrmTemplateCsv {
  const [headerCells, ...dataRows] = parseCsvRecords(text);

  if (!headerCells) {
    return {
      rows: [],
      errors: [{ row: 0, message: "CSV file is empty." }],
    };
  }

  const headers = headerCells.map(templateFieldForHeader);
  const requiredFields: Array<keyof PartnershipCrmTemplateInput> = [
    "name",
    "subject",
    "body",
  ];
  const missingFields = requiredFields.filter(
    (field) => !headers.includes(field),
  );
  if (missingFields.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: "CSV needs name, subject, and body columns.",
        },
      ],
    };
  }

  const rows: PartnershipCrmTemplateInput[] = [];
  const errors: ParsedCrmTemplateCsv["errors"] = [];

  dataRows.forEach((cells, index) => {
    const row: Record<string, string> = {};
    const rowNumber = index + 2;

    headers.forEach((field, cellIndex) => {
      if (field) {
        row[field] = cells[cellIndex]?.trim() ?? "";
      }
    });

    const name = row.name?.trim() ?? "";
    const subject = row.subject?.trim() ?? "";
    const body = normalizeTemplateCsvText(row.body ?? "");
    const notes = normalizeTemplateCsvText(row.notes ?? "");

    if (!name) {
      errors.push({ row: rowNumber, message: "Template name is required." });
    } else if (name.length > 180) {
      errors.push({
        row: rowNumber,
        message: "Template name must be 180 characters or fewer.",
      });
    }

    if (!subject) {
      errors.push({ row: rowNumber, message: "Template subject is required." });
    } else if (subject.length > 180) {
      errors.push({
        row: rowNumber,
        message: "Template subject must be 180 characters or fewer.",
      });
    }

    if (!body) {
      errors.push({ row: rowNumber, message: "Template body is required." });
    } else if (body.length > 12000) {
      errors.push({
        row: rowNumber,
        message: "Template body must be 12000 characters or fewer.",
      });
    }

    if (notes.length > 2000) {
      errors.push({
        row: rowNumber,
        message: "Template notes must be 2000 characters or fewer.",
      });
    }

    rows.push({
      name,
      category: normalizeCrmCategory(row.category ?? ""),
      subject,
      body,
      status: normalizeTemplateStatus(row.status ?? ""),
      notes,
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
  const organizationCategory = normalizeCrmCategory(organization.category);
  const organizationCategoryKey = normalizeKey(organizationCategory);

  if (!visibleTemplates.length) {
    return null;
  }

  return (
    visibleTemplates.find(
      (template) =>
        normalizeCrmCategory(template.category) === organizationCategory,
    ) ??
    visibleTemplates.find((template) => {
      const templateCategory = normalizeCrmCategory(template.category);
      const templateCategoryKey = normalizeKey(templateCategory);
      return (
        organizationCategoryKey &&
        templateCategoryKey &&
        (organizationCategoryKey.includes(templateCategoryKey) ||
          templateCategoryKey.includes(organizationCategoryKey))
      );
    }) ??
    visibleTemplates[0]
  );
}
