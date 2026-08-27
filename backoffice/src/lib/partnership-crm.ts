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

export const CRM_EMAIL_TEMPLATES = [
  {
    key: "laboratory_genomics",
    label: "Laboratory / Genomics",
    subject: "Pocket Genes + {{organization_name}}",
    body: `Hola {{contact_name}}, ¿cómo estás?

Te contacto porque con mi equipo desarrollamos Pocket Genes, una red enfocada en acercar información genética clara, accionable y confiable a pacientes, familias y profesionales.

Estuve viendo {{organization_name}}{{website_sentence}} y creo que puede haber una buena oportunidad para explorar una colaboración: visibilidad dentro de la red, educación para pacientes y derivación hacia organizaciones con experiencia real en genética.

¿Te parece si coordinamos una breve reunión para entender si tiene sentido avanzar juntos?

Abrazo,
Federico`,
  },
  {
    key: "fertility_clinic",
    label: "Fertility Clinic",
    subject: "Pocket Genes + {{organization_name}}",
    body: `Hola {{contact_name}}, ¿cómo estás?

Te escribo porque Pocket Genes está construyendo una red de organizaciones y profesionales que ayudan a familias a navegar decisiones genéticas con información clara.

Por el trabajo de {{organization_name}}{{website_sentence}}, me parece interesante conversar sobre cómo podríamos acercar recursos de genética reproductiva a pacientes que están buscando orientación confiable.

¿Tenés disponibilidad para una reunión corta esta semana o la próxima?

Abrazo,
Federico`,
  },
  {
    key: "foundation",
    label: "Foundation",
    subject: "Pocket Genes + {{organization_name}}",
    body: `Hola {{contact_name}}, ¿cómo estás?

Te contacto porque Pocket Genes busca conectar pacientes, familias, fundaciones y organizaciones científicas en un espacio más simple para encontrar apoyo e información genética.

Me interesó el trabajo de {{organization_name}}{{website_sentence}} y creo que podría tener sentido explorar una colaboración para amplificar recursos, campañas o iniciativas que ya estén llevando adelante.

¿Te parece si agendamos una breve llamada?

Abrazo,
Federico`,
  },
  {
    key: "education",
    label: "Education",
    subject: "Pocket Genes + {{organization_name}}",
    body: `Hola {{contact_name}}, ¿cómo estás?

Te escribo por Pocket Genes, una red orientada a hacer más accesible la educación genética para pacientes, familias y profesionales.

Viendo el perfil de {{organization_name}}{{website_sentence}}, creo que puede haber una buena oportunidad para sumar contenidos, cursos o recursos educativos dentro de la red.

¿Te interesaría conversar unos minutos para evaluar una colaboración?

Abrazo,
Federico`,
  },
  {
    key: "umbrella_organization",
    label: "Umbrella Organization",
    subject: "Pocket Genes + {{organization_name}}",
    body: `Hola {{contact_name}}, ¿cómo estás?

Te contacto porque Pocket Genes está armando una red de organizaciones vinculadas a genética, salud, investigación y apoyo a pacientes.

Por el rol de {{organization_name}}{{website_sentence}}, me parece que tendría sentido conversar sobre cómo conectar mejor a sus miembros, aliados o comunidades con recursos genéticos confiables.

¿Te parece si coordinamos una breve reunión?

Abrazo,
Federico`,
  },
  {
    key: "generic_partnership",
    label: "Generic Partnership",
    subject: "Pocket Genes + {{organization_name}}",
    body: `Hola {{contact_name}}, ¿cómo estás?

Te contacto porque con mi equipo estamos desarrollando Pocket Genes, una red para conectar pacientes, familias, profesionales y organizaciones alrededor de la genética.

Me gustaría conocer más sobre {{organization_name}}{{website_sentence}} y evaluar si hay una colaboración concreta que aporte valor a ambas partes.

¿Tenés disponibilidad para una reunión breve?

Abrazo,
Federico`,
  },
  {
    key: "follow_up",
    label: "Follow-up",
    subject: "Seguimiento: Pocket Genes + {{organization_name}}",
    body: `Hola {{contact_name}}, ¿cómo estás?

Te escribo para retomar mi mensaje sobre Pocket Genes y una posible colaboración con {{organization_name}}.

Creo que puede haber una oportunidad concreta para acercar información genética confiable a más personas y me gustaría entender si tiene sentido conversarlo.

¿Te viene bien que coordinemos una llamada corta?

Abrazo,
Federico`,
  },
] as const;

export type PartnershipCrmStatus = (typeof CRM_STATUS_OPTIONS)[number]["value"];
export type CrmEmailTemplateKey = (typeof CRM_EMAIL_TEMPLATES)[number]["key"];
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

const HEADER_ALIASES: Record<keyof PartnershipCrmOrganizationInput, string[]> = {
  name: ["name", "organization", "organization_name", "nombre", "organizacion"],
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
      category: row.category?.trim() ?? "",
      website: row.website?.trim() ?? "",
      country: row.country?.trim() ?? "",
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
  templateKey: CrmEmailTemplateKey,
  organization: PartnershipCrmOrganizationRecord,
) {
  const template =
    CRM_EMAIL_TEMPLATES.find((entry) => entry.key === templateKey) ??
    CRM_EMAIL_TEMPLATES[0];
  const variables: Record<string, string> = {
    contact_name: organization.contactName || "equipo",
    organization_name: organization.name,
    website: organization.website || organization.websiteDomain,
    website_sentence: websiteSentence(organization),
  };
  const apply = (value: string) =>
    value.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => variables[key] ?? "");

  return {
    template,
    subject: apply(template.subject),
    body: apply(template.body),
  };
}

export function statusLabel(status: PartnershipCrmStatus) {
  return (
    CRM_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
  );
}

export function templateForCategory(category: string): CrmEmailTemplateKey {
  const normalized = normalizeKey(category);
  if (normalized.includes("fertility")) {
    return "fertility_clinic";
  }
  if (normalized.includes("foundation") || normalized.includes("fundacion")) {
    return "foundation";
  }
  if (normalized.includes("education") || normalized.includes("educacion")) {
    return "education";
  }
  if (normalized.includes("umbrella") || normalized.includes("society")) {
    return "umbrella_organization";
  }
  if (
    normalized.includes("lab") ||
    normalized.includes("genomic") ||
    normalized.includes("genetic")
  ) {
    return "laboratory_genomics";
  }

  return "generic_partnership";
}
