"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileCheck2, ListChecks } from "lucide-react";
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
import { getDiscoverOrganizationCountryGroups } from "@/lib/discover-organization-fields";
import { appText, type AppLanguage } from "@/lib/language";
import {
  CRM_CATEGORY_OPTIONS,
  CRM_PROFESSIONAL_CATEGORY_OPTIONS,
  CRM_STATUS_OPTIONS,
  CRM_TEMPLATE_STATUS_OPTIONS,
  type PartnershipCrmTemplateAudience,
} from "@/lib/partnership-crm";

type ImportRulesKind = "organizations" | "professionals" | "templates";

type RuleLine = {
  label: string;
  detail: string;
  example?: string;
};

const ORGANIZATION_HEADERS = [
  "name",
  "category",
  "website",
  "country",
  "status",
  "is_favorite",
  "contact_name",
  "email",
  "linkedin",
  "last_contact_at",
  "notes",
] as const;

const TEMPLATE_HEADERS = [
  "name",
  "audience",
  "category",
  "subject",
  "body",
  "status",
  "is_favorite",
  "notes",
] as const;

const PROFESSIONAL_HEADERS = [
  "name",
  "category",
  "title",
  "primary_affiliation",
  "potential_pocket_genes_editor_fit",
  "email_route",
  "linkedin_route",
  "research_basis",
  "website",
  "country",
  "status",
  "is_favorite",
  "email",
  "linkedin",
  "last_contact_at",
  "notes",
] as const;

const EXPLICIT_DATETIME_RULE =
  "Optional. Use a complete ISO datetime with an explicit timezone. Accepted: 2026-08-25T17:29:00.000Z or 2026-08-25T14:29:00-03:00. Rejected: 2026-08-25 and 2026-08-25T14:29:00 because they do not include timezone.";
const CRM_FAVORITE_RULE =
  "Optional. Use true/false, 1/0, yes/no, or favorito. True rows are shown with a yellow star and sorted first in CRM lists.";
const TEMPLATE_FAVORITE_RULE =
  "Optional. Use true/false, 1/0, yes/no, or favorito. True templates are shown with a yellow star and sorted first in plantillas lists.";
const CRM_STRUCTURED_NOTES_RULE =
  'Optional structured JSON object string. Maximum 2000 characters. Prefer concise keys such as reviewed, instagram, services, argentina, digital, note, sources, email_route, or linkedin_route. Store each note fragment as a JSON value, for example {"instagram":"https://www.instagram.com/adnsalta/","services":"NIPT listed as a purchasable service."}. Do not use markdown bullets, labels with bold text, or pasted scraped pages. If the JSON is placed in a CSV cell, wrap the whole cell in double quotes and escape each internal quote by doubling it.';
const ORGANIZATION_NOTES_JSON_EXAMPLE =
  '{"reviewed":"2026-09-12","instagram":"https://www.instagram.com/adnsalta/","services":"NIPT listed as a purchasable service; genetic tests and clinical laboratory services.","sources":"https://www.adnsalta.com.ar/productos/test-prenatal-no-invasivo-nipt/ ; https://www.adnsalta.com.ar/"}';
const PROFESSIONAL_NOTES_JSON_EXAMPLE =
  '{"reviewed":"2026-09-12","route":"LinkedIn response; validate recipient context before email.","sources":"Public affiliation site and LinkedIn record."}';

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

const TEMPLATE_VARIABLES = [
  "contact_name",
  "organization_name",
  "professional_name",
  "first_name",
  "primary_affiliation",
  "potential_pocket_genes_editor_fit",
  "email_route",
  "linkedin_route",
  "research_basis",
  "title",
  "website",
  "website_sentence",
] as const;

const PROFESSIONAL_VARIABLE_QUALITY_RULE =
  "Best effort is required for professional imports: whenever source data allows it, fill name, title, primary_affiliation, potential_pocket_genes_editor_fit, email_route, linkedin_route, research_basis, and website so professional plantillas that use variables do not render blank or generic. The potential_pocket_genes_editor_fit value must be a short lowercase noun phrase that fits directly after “Por tu experiencia en ...”; never start it with labels such as “Propuesta editorial:”, “Editorial proposal:”, “Hook editorial:” or similar.";

const PROFESSIONAL_TEMPLATE_VARIABLE_COVERAGE = [
  {
    variable: "{{professional_name}}, {{first_name}}, {{contact_name}}",
    source: "name",
  },
  { variable: "{{title}}", source: "title" },
  { variable: "{{primary_affiliation}}", source: "primary_affiliation" },
  {
    variable: "{{potential_pocket_genes_editor_fit}}",
    source: "potential_pocket_genes_editor_fit",
  },
  { variable: "{{email_route}}", source: "email_route" },
  { variable: "{{linkedin_route}}", source: "linkedin_route" },
  { variable: "{{research_basis}}", source: "research_basis" },
  { variable: "{{website}}, {{website_sentence}}", source: "website" },
] as const;

const PROFESSIONAL_TEMPLATE_MANDATORY_CLOSING = [
  "Te comparto nuestro link para que puedas conocer la propuesta y sumarte a la red:",
  "",
  "https://goldencrowvs.com/pocket-genes/join-us/",
  "",
  "Quedamos a la espera de tu respuesta.",
  "",
  "Saludos,",
  "Federico",
].join("\n");

const PROFESSIONAL_TEMPLATE_BODY_RULES = [
  {
    label: "Purpose",
    detail:
      "Invite the recipient to discover the proposal and join the network. Present editorial contributions as an optional opportunity.",
  },
  {
    label: "Personalization",
    detail:
      "Use relevant variables in the subject and earlier paragraphs to explain why the invitation fits the recipient. Keep the closing unchanged.",
  },
  {
    label: "Mandatory closing",
    detail:
      "Use the approved closing verbatim, preserving paragraph breaks, followed only by the sender's signature.",
  },
] as const;

const PROFESSIONAL_TEMPLATE_WRITING_STYLE_RULES = [
  "Warm, professional Argentine Spanish: Use natural voseo, complete sentences and connected paragraphs. Avoid slang, exaggerated praise and sales jargon.",
  'Team voice: Prefer formulations such as "Con mi equipo estamos construyendo", "Nos gustaría invitarte" and "Quedamos a la espera de tu respuesta."',
  "Explain the invitation fully: Introduce the network, explain its relevance to the recipient, describe the benefits of joining for free and mention optional ways to participate.",
  "Keep the invitation low-pressure: Do not ask the recipient to suggest topics, explain concepts, recommend resources or commit to a contribution as the final call to action.",
  'Preserve the approved wording: Do not shorten the closing to "Conocé más", "Te dejo el link" or "Te comparto el link para conocer Pocket Genes."',
] as const;

const PROFESSIONAL_TEMPLATE_REVIEW_RULE =
  "A template is editorially complete only when it preserves the approved closing, contains no additional question or call to action after it, and follows the requested voice. CSV validity alone does not establish writing-style compliance.";

const ORGANIZATION_TEMPLATE_BODY_RULES = [
  {
    label: "Purpose",
    detail:
      "Invite the organization contact to discover the proposal and join the network. Present collaborations, institutional visibility, and editorial contributions as optional opportunities.",
  },
  {
    label: "Personalization",
    detail:
      "Use relevant organization variables in the subject and earlier paragraphs to explain why the invitation fits the organization. Keep the closing unchanged.",
  },
  {
    label: "Mandatory closing",
    detail:
      "Use the approved closing verbatim, preserving paragraph breaks, followed only by the sender's signature.",
  },
] as const;

const ORGANIZATION_TEMPLATE_WRITING_STYLE_RULES = [
  "Warm, professional Argentine Spanish: Use natural voseo, complete sentences and connected paragraphs. Avoid slang, exaggerated praise and sales jargon.",
  'Team voice: Prefer formulations such as "Con mi equipo estamos construyendo", "Nos gustaría invitarte" and "Quedamos a la espera de tu respuesta."',
  "Explain the invitation fully: Introduce the network, explain its relevance to the organization, describe the benefits of joining for free and mention optional ways to participate.",
  "Keep the invitation low-pressure: Do not ask the recipient to suggest topics, explain concepts, recommend resources or commit to a contribution as the final call to action.",
  'Preserve the approved wording: Do not shorten the closing to "Conocé más", "Te dejo el link" or "Te comparto el link para conocer Pocket Genes."',
] as const;

const ORGANIZATION_TEMPLATE_REVIEW_RULE =
  "An organization template is editorially complete only when it preserves the approved closing, contains no additional question or call to action after it, and follows the requested voice. CSV validity alone does not establish writing-style compliance.";

function csvHeadersFor(kind: ImportRulesKind) {
  if (kind === "professionals") {
    return PROFESSIONAL_HEADERS;
  }

  return kind === "organizations" ? ORGANIZATION_HEADERS : TEMPLATE_HEADERS;
}

function requiredHeadersFor(kind: ImportRulesKind) {
  return kind === "templates" ? ["name", "subject", "body"] : ["name"];
}

function optionalHeadersFor(kind: ImportRulesKind) {
  const required = new Set(requiredHeadersFor(kind));
  return csvHeadersFor(kind).filter((header) => !required.has(header));
}

function usesProfessionalTemplateRules(
  kind: ImportRulesKind,
  audience: PartnershipCrmTemplateAudience,
) {
  return kind === "templates" && audience === "professionals";
}

function usesOrganizationTemplateRules(
  kind: ImportRulesKind,
  audience: PartnershipCrmTemplateAudience,
) {
  return kind === "templates" && audience === "organizations";
}

function usesAudienceTemplateRules(
  kind: ImportRulesKind,
  audience: PartnershipCrmTemplateAudience,
) {
  return (
    usesProfessionalTemplateRules(kind, audience) ||
    usesOrganizationTemplateRules(kind, audience)
  );
}

function templateAudienceRulePrefix(audience: PartnershipCrmTemplateAudience) {
  return audience === "professionals" ? "Professional" : "Organization";
}

function templateBodyRulesForAudience(
  audience: PartnershipCrmTemplateAudience,
) {
  return audience === "professionals"
    ? PROFESSIONAL_TEMPLATE_BODY_RULES
    : ORGANIZATION_TEMPLATE_BODY_RULES;
}

function templateWritingStyleRulesForAudience(
  audience: PartnershipCrmTemplateAudience,
) {
  return audience === "professionals"
    ? PROFESSIONAL_TEMPLATE_WRITING_STYLE_RULES
    : ORGANIZATION_TEMPLATE_WRITING_STYLE_RULES;
}

function templateReviewRuleForAudience(
  audience: PartnershipCrmTemplateAudience,
) {
  return audience === "professionals"
    ? PROFESSIONAL_TEMPLATE_REVIEW_RULE
    : ORGANIZATION_TEMPLATE_REVIEW_RULE;
}

function ruleLinesFor(
  kind: ImportRulesKind,
  audience: PartnershipCrmTemplateAudience = "organizations",
): RuleLine[] {
  if (kind === "professionals") {
    return [
      {
        label: "name",
        detail:
          "Required. Trimmed before save. Maximum 180 characters. Blank professional names are invalid rows and must be fixed before import.",
        example: "Cesar Sanchez Sarmiento",
      },
      {
        label: "category",
        detail:
          "Optional. Use one or more canonical pro_* category keys, or exact professional category labels. Multiple values must be comma-separated inside one quoted CSV cell. Unknown values are ignored; if every value is unknown, category is saved blank.",
        example: '"pro_reproductive_specialists,pro_fertility_specialists"',
      },
      {
        label: "title",
        detail:
          "Optional but best effort for professional templates. Maximum 180 characters. Store only the professional role, title, specialty, or credential. Powers {{title}}.",
        example: "CEO and reproductive medicine specialist",
      },
      {
        label: "primary_affiliation",
        detail:
          "Optional but best effort for professional templates. Maximum 180 characters. Store the main institution, company, lab, hospital, or professional affiliation as a plain name. Powers {{primary_affiliation}}.",
        example: "MedicGen / Nascentis",
      },
      {
        label: "potential_pocket_genes_editor_fit",
        detail:
          "Optional but best effort and high value for professional templates. Maximum 2000 characters. Store only the exact title, work, topic, or editorial hook as a short lowercase noun phrase that fits inside: “Por tu experiencia en {{potential_pocket_genes_editor_fit}}, pensamos que podría haber un buen match.” Never start with labels or prefixes such as “Propuesta editorial:”, “Editorial proposal:”, “Hook editorial:”, “Fit editorial:” or explanatory wording. Do not add wrapping quotes, commas, periods, or explanatory punctuation at the end. Powers {{potential_pocket_genes_editor_fit}}.",
        example: "adopción de pruebas genéticas y educación de pacientes",
      },
      {
        label: "email_route",
        detail:
          "Optional but best effort for professional templates. Maximum 2000 characters. Store how the recipient email was found and what context should be verified before outreach. This is not the direct email field. Powers {{email_route}}.",
        example:
          "Public institutional contact; verify recipient context before outreach.",
      },
      {
        label: "linkedin_route",
        detail:
          "Optional but best effort for professional templates. Maximum 2000 characters. Store the LinkedIn route, such as the professional profile or official affiliated organization page. This is not the direct LinkedIn URL field. Powers {{linkedin_route}}.",
        example: "Public personal LinkedIn profile used to verify affiliation.",
      },
      {
        label: "research_basis",
        detail:
          "Optional but best effort for professional templates. Maximum 2000 characters. Store the source basis used to validate the lead, such as datasets, affiliation websites, LinkedIn records, or other verified references. Powers {{research_basis}}.",
        example:
          "Affiliation website, LinkedIn record, and prior outreach notes.",
      },
      {
        label: "website",
        detail:
          "Optional but best effort for professional templates. Maximum 500 characters. Use a public website URL. Values without protocol are accepted and normalized with https:// when possible. Powers {{website}} and {{website_sentence}}.",
        example: "https://medicgen.com/",
      },
      {
        label: "country",
        detail:
          "Optional. Use one or more two-letter country codes from the CRM whitelist. Multiple values must be comma-separated inside one quoted CSV cell. GLOBAL and unknown countries are ignored; if every value is invalid, country is saved blank.",
        example: '"AR,UY"',
      },
      {
        label: "status",
        detail:
          "Optional. Use one accepted CRM status key. Blank or unrecognized values default to new. Spanish aliases are normalized by the CSV parser before sending.",
        example: "replied",
      },
      {
        label: "is_favorite",
        detail: CRM_FAVORITE_RULE,
        example: "true",
      },
      {
        label: "email",
        detail:
          "Optional direct email. Maximum 180 characters. Lowercased before save. Missing email does not block import, but the row cannot send CRM email until an email is added.",
        example: "marcelo@medicgen.com",
      },
      {
        label: "linkedin",
        detail:
          "Optional. Maximum 500 characters. Use the public LinkedIn profile URL for this professional. Values without protocol are accepted and normalized with https:// when possible.",
        example: "https://www.linkedin.com/in/nascentisfertility",
      },
      {
        label: "last_contact_at",
        detail: EXPLICIT_DATETIME_RULE,
        example: "2026-08-25T14:29:00-03:00",
      },
      {
        label: "notes",
        detail: CRM_STRUCTURED_NOTES_RULE,
        example: PROFESSIONAL_NOTES_JSON_EXAMPLE,
      },
    ];
  }

  if (kind === "organizations") {
    return [
      {
        label: "name",
        detail:
          "Required. Trimmed before save. Maximum 180 characters. Blank names are invalid rows and must be fixed before import.",
        example: "Genome Lab Argentina",
      },
      {
        label: "category",
        detail:
          "Optional. Use one or more canonical org_* category keys, or exact Discover organization labels. Multiple values must be comma-separated inside one quoted CSV cell. Unknown values are ignored; if every value is unknown, category is saved blank.",
        example: '"org_genetic_testing_laboratories,org_genomics_laboratories"',
      },
      {
        label: "website",
        detail:
          "Optional. Maximum 500 characters. Use a public organization website URL. Values without protocol are accepted and normalized with https:// when possible.",
        example: "https://genomelab.example",
      },
      {
        label: "country",
        detail:
          "Optional. Use one or more two-letter country codes from the CRM whitelist. Multiple values must be comma-separated inside one quoted CSV cell. GLOBAL and unknown countries are ignored; if every value is invalid, country is saved blank.",
        example: '"AR,UY"',
      },
      {
        label: "status",
        detail:
          "Optional. Use one accepted CRM status key. Blank or unrecognized values default to new. Spanish aliases are normalized by the CSV parser before sending.",
        example: "contacted",
      },
      {
        label: "is_favorite",
        detail: CRM_FAVORITE_RULE,
        example: "true",
      },
      {
        label: "contact_name",
        detail:
          "Optional. Maximum 140 characters. Store only the primary contact person's name, not the email or notes.",
        example: "Ada Genome",
      },
      {
        label: "email",
        detail:
          "Optional direct email. Maximum 180 characters. Lowercased before save. Missing email does not block import, but the row cannot send CRM email until an email is added.",
        example: "ada@genomelab.example",
      },
      {
        label: "linkedin",
        detail:
          "Optional. Maximum 500 characters. Use the public LinkedIn URL for the primary contact or organization. Values without protocol are accepted and normalized with https:// when possible.",
        example: "https://www.linkedin.com/in/adagenome",
      },
      {
        label: "last_contact_at",
        detail: EXPLICIT_DATETIME_RULE,
        example: "2026-08-25T17:29:00.000Z",
      },
      {
        label: "notes",
        detail: CRM_STRUCTURED_NOTES_RULE,
        example: ORGANIZATION_NOTES_JSON_EXAMPLE,
      },
    ];
  }

  return [
    {
      label: "name",
      detail:
        "Required. Trimmed before save. Maximum 180 characters. This is the internal template name shown in the template list.",
      example: "Professional intro",
    },
    {
      label: "subject",
      detail:
        "Required. Trimmed before save. Maximum 180 characters. Template variables such as {{organization_name}} or {{first_name}} are allowed. Prefer subjects that use a relevant variable when possible; unknown variables render blank.",
      example: "Pocket Genes + {{organization_name}}",
    },
    {
      label: "body",
      detail: usesAudienceTemplateRules(kind, audience)
        ? `Required. Maximum 12000 characters. Use quoted multiline cells or literal \\n for line breaks. Prefer body copy that uses audience variables where they improve personalization; unknown variables render blank. ${templateAudienceRulePrefix(
            audience,
          )} templates must follow the ${templateAudienceRulePrefix(
            audience,
          ).toLowerCase()} template body rules, preserve the approved closing verbatim, and contain no additional question or call to action after it.`
        : "Required. Maximum 12000 characters. Use quoted multiline cells or literal \\n for line breaks. Prefer body copy that uses audience variables where they improve personalization; unknown variables render blank.",
      example: "Hi {{first_name}},\\nI am reaching out about Pocket Genes.",
    },
    {
      label: "audience",
      detail:
        "Optional. Use organizations or professionals. Aliases professional, individual, individuals, personas, and profesionales normalize to professionals. Blank uses the selected import audience.",
      example: "professionals",
    },
    {
      label: "category",
      detail:
        "Optional single value. Use one canonical category key for the selected audience, or an exact category label. Multiple categories are not supported for templates; if several are provided, only the first recognized category is saved. Unknown values become blank.",
      example: "pro_reproductive_specialists",
    },
    {
      label: "status",
      detail:
        "Optional. Use one accepted template status key. Blank or unrecognized values default to active. Active, inactive, and archived aliases are normalized.",
      example: "active",
    },
    {
      label: "is_favorite",
      detail: TEMPLATE_FAVORITE_RULE,
      example: "true",
    },
    {
      label: "notes",
      detail:
        "Optional internal notes. Maximum 2000 characters. Literal \\n is converted to a line break.",
      example: "Use only for validated professional leads.",
    },
  ];
}

function exampleCsvFor(
  kind: ImportRulesKind,
  audience: PartnershipCrmTemplateAudience,
) {
  if (kind === "professionals") {
    return [
      PROFESSIONAL_HEADERS.join(","),
      [
        '"Cesar Sanchez Sarmiento"',
        '"pro_reproductive_specialists,pro_fertility_specialists"',
        '"CEO and reproductive medicine specialist"',
        '"MedicGen / Nascentis"',
        '"Genetic testing adoption and carrier screening"',
        '"LinkedIn response; validate recipient context before email"',
        '"Public LinkedIn profile"',
        '"Public affiliation site and LinkedIn record"',
        '"https://medicgen.com/"',
        '"AR"',
        '"replied"',
        '"true"',
        '""',
        '"https://www.linkedin.com/in/nascentisfertility"',
        '"2026-08-25T14:29:00-03:00"',
        csvCell(PROFESSIONAL_NOTES_JSON_EXAMPLE),
      ].join(","),
    ].join("\n");
  }

  if (kind === "organizations") {
    return [
      ORGANIZATION_HEADERS.join(","),
      [
        '"Genome Lab Argentina"',
        '"org_genetic_testing_laboratories,org_genomics_laboratories"',
        '"https://genomelab.example"',
        '"AR,UY"',
        '"contacted"',
        '"true"',
        '"Ada Genome"',
        '"ada@genomelab.example"',
        '"https://www.linkedin.com/in/adagenome"',
        '"2026-08-25T17:29:00.000Z"',
        csvCell(ORGANIZATION_NOTES_JSON_EXAMPLE),
      ].join(","),
    ].join("\n");
  }

  const category =
    audience === "professionals"
      ? "pro_reproductive_specialists"
      : "org_genetic_testing_laboratories";
  const name =
    audience === "professionals" ? "Professional intro" : "Organization intro";
  const subject =
    audience === "professionals"
      ? "Pocket Genes + {{primary_affiliation}}"
      : "Pocket Genes + {{organization_name}}";
  const body =
    audience === "professionals"
      ? "Hola {{first_name}},\\n\\nCon mi equipo estamos construyendo Pocket Genes, una red para conectar profesionales, instituciones y proyectos vinculados a genetica, medicina reproductiva y salud personalizada. Nos gustaria invitarte porque tu experiencia en {{potential_pocket_genes_editor_fit}} podria aportar una mirada valiosa a la comunidad.\\n\\nSumarte a la red es gratuito y permite que mas personas conozcan tu trabajo, tu afiliacion principal y posibles oportunidades de colaboracion. Si en algun momento te interesa, tambien podrias participar con aportes editoriales o revisar contenidos vinculados a tu especialidad.\\n\\nTe comparto nuestro link para que puedas conocer la propuesta y sumarte a la red:\\n\\nhttps://goldencrowvs.com/pocket-genes/join-us/\\n\\nQuedamos a la espera de tu respuesta.\\n\\nSaludos,\\nFederico"
      : "Hola {{contact_name}},\\n\\nCon mi equipo estamos construyendo Pocket Genes, una red para conectar organizaciones, profesionales e iniciativas vinculadas a genetica, medicina reproductiva y salud personalizada. Nos gustaria invitar a {{organization_name}} porque su trabajo{{website_sentence}} podria aportar valor a la comunidad.\\n\\nSumarse a la red es gratuito y permite que mas personas conozcan la organizacion, sus servicios y posibles oportunidades de colaboracion. Si en algun momento les interesa, tambien pueden participar con aportes editoriales o compartir novedades institucionales relevantes.\\n\\nTe comparto nuestro link para que puedas conocer la propuesta y sumarte a la red:\\n\\nhttps://goldencrowvs.com/pocket-genes/join-us/\\n\\nQuedamos a la espera de tu respuesta.\\n\\nSaludos,\\nFederico";

  return [
    TEMPLATE_HEADERS.join(","),
    [
      `"${name}"`,
      `"${audience}"`,
      `"${category}"`,
      `"${subject}"`,
      `"${body}"`,
      '"active"',
      '"true"',
      '"Use only for validated leads."',
    ].join(","),
  ].join("\n");
}

function commonPitfallsFor(kind: ImportRulesKind) {
  const common = [
    "Use the exact header row shown here when generating CSVs. Unsupported headers are ignored.",
    "If a cell contains commas, quotes, or line breaks, wrap the whole cell in double quotes.",
    'Escape a quote inside a cell by doubling it, for example He said ""hello"".',
  ];

  if (kind === "templates") {
    return [
      ...common,
      "Template category accepts one value only. Multiple categories are not saved as a list.",
      "Template body and notes can use literal \\n for line breaks. The importer converts literal \\n to real line breaks.",
      "Unknown template variables render blank, so use only variables listed in this modal.",
    ];
  }

  return [
    ...common,
    "Cells with multiple category or country keys must be quoted, otherwise the commas will shift later columns.",
    "Structured JSON notes must be a single quoted CSV cell with internal quotes escaped by doubling them.",
    "Use an explicit timezone for last_contact_at. Date-only values and datetimes without timezone are rejected.",
    "GLOBAL, unknown countries, and unknown categories are ignored instead of being saved as custom free text.",
  ];
}

function dialogDescriptionFor(kind: ImportRulesKind) {
  if (kind === "organizations") {
    return "Rules for CRM organization CSV imports.";
  }

  return kind === "professionals"
    ? "Rules for CRM professional CSV imports."
    : "Rules for CRM template CSV imports.";
}

function importBehaviorLinesFor(kind: ImportRulesKind) {
  return kind === "templates"
    ? [
        "Preview the parsed template rows before creating templates.",
        "Template imports create valid rows one by one; invalid rows are skipped and completed rows are not reverted.",
        "Use Evaluate one by one to decide Add / Skip / Combine for each row. Possible duplicates are surfaced on the row card before anything is saved.",
        "Literal \\n is converted to a line break in template body and notes.",
        "Use active templates for the CRM send flow; archived templates are kept out of normal sending.",
      ]
    : [
        "Load a CSV first, then choose Start interactive download to review Add / Skip row by row, or Import all to accept every valid row.",
        "CRM target imports preview and commit one row at a time with a browser checkpoint.",
        "If the import fails in the middle, completed rows are kept and the checkpoint can resume from the last saved point.",
        "Duplicates are surfaced on the row card. Add imports anyway; Skip leaves the existing CRM untouched.",
      ];
}

function countryOptions(language: AppLanguage) {
  return getDiscoverOrganizationCountryGroups(language).map((group) => ({
    ...group,
    options: group.options.filter((option) => option.code !== "GLOBAL"),
  }));
}

function OptionGrid({
  items,
}: {
  items: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.value}
          className="min-w-0 rounded-lg border border-border/80 bg-background/70 px-3 py-2"
        >
          <code className="block truncate font-mono text-[0.72rem] text-foreground">
            {item.value}
          </code>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function buildImportRulesText({
  language,
  kind,
  audience,
  t,
}: {
  language: AppLanguage;
  kind: ImportRulesKind;
  audience: PartnershipCrmTemplateAudience;
  t: (text: string) => string;
}) {
  const headers = csvHeadersFor(kind);
  const requiredHeaders = requiredHeadersFor(kind);
  const optionalHeaders = optionalHeadersFor(kind);
  const lines = ruleLinesFor(kind, audience);
  const exampleCsv = exampleCsvFor(kind, audience);
  const pitfalls = commonPitfallsFor(kind);
  const statusOptions =
    kind === "templates" ? CRM_TEMPLATE_STATUS_OPTIONS : CRM_STATUS_OPTIONS;
  const countries = kind === "templates" ? [] : countryOptions(language);
  const categoryAudience = kind === "templates" ? audience : kind;
  const categoryOptions =
    categoryAudience === "professionals"
      ? CRM_PROFESSIONAL_CATEGORY_OPTIONS
      : CRM_CATEGORY_OPTIONS;
  const categoryGuidance =
    kind === "templates"
      ? "Use one canonical category key for the selected template audience."
      : categoryAudience === "professionals"
        ? "Use canonical pro_* keys when possible. Quote the CSV cell when multiple keys are separated by commas."
        : "Use canonical org_* keys when possible. Quote the CSV cell when multiple keys are separated by commas.";
  const countryGuidance =
    "Use normalized country codes from the CRM country whitelist. Quote the CSV cell when multiple codes are separated by commas. GLOBAL is not accepted.";

  return [
    t("Import rules"),
    t(dialogDescriptionFor(kind)),
    "",
    t("CSV structure"),
    `${t("Header row")}: ${headers.join(",")}`,
    t("First row must contain supported column headers."),
    t(
      "Use comma-separated CSV and quote cells that contain commas, quotes, or line breaks.",
    ),
    t("Escape quotes by doubling them."),
    t("Empty rows are ignored."),
    "",
    t("Example CSV"),
    exampleCsv,
    "",
    t("Required columns"),
    requiredHeaders.join(", "),
    "",
    t("Optional columns"),
    optionalHeaders.join(", "),
    ...(kind === "professionals"
      ? [
          "",
          t("Professional variable quality"),
          t(PROFESSIONAL_VARIABLE_QUALITY_RULE),
          "",
          t("Professional template variable coverage"),
          ...PROFESSIONAL_TEMPLATE_VARIABLE_COVERAGE.map(
            (item) => `${item.variable}: ${item.source}`,
          ),
          t(
            "email and linkedin are not template variables, but they should still be filled when available because they make outreach actionable and easier to verify.",
          ),
        ]
      : []),
    "",
    t("Field rules"),
    ...lines.flatMap((line) => [
      `${line.label}: ${t(line.detail)}`,
      ...(line.example ? [`  ${t("Example")}: ${line.example}`] : []),
    ]),
    ...(usesAudienceTemplateRules(kind, audience)
      ? [
          "",
          t(`${templateAudienceRulePrefix(audience)} template body rules`),
          ...templateBodyRulesForAudience(audience).map(
            (rule) => `${t(rule.label)}: ${t(rule.detail)}`,
          ),
          "",
          t("Approved mandatory closing"),
          PROFESSIONAL_TEMPLATE_MANDATORY_CLOSING,
          "",
          t(`${templateAudienceRulePrefix(audience)} template writing style`),
          ...templateWritingStyleRulesForAudience(audience).map(
            (rule) => `- ${t(rule)}`,
          ),
          "",
          t(`${templateAudienceRulePrefix(audience)} template review rules`),
          t(templateReviewRuleForAudience(audience)),
        ]
      : []),
    "",
    t("Accepted statuses"),
    ...statusOptions.map((option) => `${option.value}: ${t(option.label)}`),
    "",
    t("Accepted categories"),
    t(categoryGuidance),
    ...categoryOptions.map(
      (category) => `${category.value}: ${t(category.label)}`,
    ),
    ...(kind !== "templates"
      ? [
          "",
          t("Accepted countries"),
          t(countryGuidance),
          ...countries.flatMap((group) => [
            t(group.label),
            ...group.options.map(
              (country) => `${country.code}: ${country.label}`,
            ),
          ]),
        ]
      : []),
    ...(kind === "templates"
      ? [
          "",
          t("Template variables"),
          t("Use variables in subject or body as {{variable_name}}."),
          t(
            "Prefer templates that use the accepted variables for their audience. Variables are not mandatory, but they make CRM outreach safer to reuse and score better in plantillas.",
          ),
          t("Unknown variables render blank."),
          ...TEMPLATE_VARIABLES.map((variable) => `{{${variable}}}`),
        ]
      : []),
    "",
    t("Common import mistakes to avoid"),
    ...pitfalls.map((line) => `- ${t(line)}`),
    "",
    t("Import behavior"),
    ...importBehaviorLinesFor(kind).map((line) => `- ${t(line)}`),
  ].join("\n");
}

export function CrmImportRulesDialog({
  open,
  onOpenChange,
  language,
  kind,
  audience = "organizations",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: AppLanguage;
  kind: ImportRulesKind;
  audience?: PartnershipCrmTemplateAudience;
}) {
  const t = (text: string) => appText(language, text);
  const headers = csvHeadersFor(kind);
  const requiredHeaders = requiredHeadersFor(kind);
  const optionalHeaders = optionalHeadersFor(kind);
  const lines = ruleLinesFor(kind, audience);
  const exampleCsv = exampleCsvFor(kind, audience);
  const pitfalls = commonPitfallsFor(kind);
  const statusOptions =
    kind === "templates" ? CRM_TEMPLATE_STATUS_OPTIONS : CRM_STATUS_OPTIONS;
  const countries = kind === "templates" ? [] : countryOptions(language);
  const categoryAudience = kind === "templates" ? audience : kind;
  const categoryOptions =
    categoryAudience === "professionals"
      ? CRM_PROFESSIONAL_CATEGORY_OPTIONS
      : CRM_CATEGORY_OPTIONS;
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const copyText = useMemo(
    () => buildImportRulesText({ language, kind, audience, t }),
    [audience, kind, language, t],
  );

  useEffect(() => {
    if (open) {
      setCopyStatus("idle");
    }
  }, [audience, kind, open]);

  async function copyRules() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="crm-control-surface sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("Import rules")}</DialogTitle>
          <DialogDescription>{t(dialogDescriptionFor(kind))}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {kind === "professionals" ? (
            <section className="rounded-xl border border-emerald-200/70 bg-emerald-50/75 p-4 text-emerald-950 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-100">
              <h3 className="font-heading text-sm font-semibold">
                {t("Professional variable quality")}
              </h3>
              <p className="mt-1 text-sm leading-6">
                {t(PROFESSIONAL_VARIABLE_QUALITY_RULE)}
              </p>
              <div className="mt-3 grid gap-2 rounded-lg border border-emerald-200/70 bg-white/55 p-3 text-xs dark:border-emerald-300/20 dark:bg-black/10">
                <p className="font-semibold">
                  {t("Professional template variable coverage")}
                </p>
                <div className="grid gap-1.5">
                  {PROFESSIONAL_TEMPLATE_VARIABLE_COVERAGE.map((item) => (
                    <div
                      key={item.variable}
                      className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(130px,0.35fr)] sm:items-center"
                    >
                      <code className="break-words font-mono">
                        {item.variable}
                      </code>
                      <span className="font-mono text-emerald-800 dark:text-emerald-200">
                        {item.source}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="leading-5">
                  {t(
                    "email and linkedin are not template variables, but they should still be filled when available because they make outreach actionable and easier to verify.",
                  )}
                </p>
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-border/80 bg-background/70 p-4">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              <h3 className="font-heading text-sm font-semibold">
                {t("CSV structure")}
              </h3>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
              <div className="rounded-lg bg-muted/35 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("Header row")}
                </p>
                <code className="mt-2 block whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                  {headers.join(",")}
                </code>
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground">
                <p>{t("First row must contain supported column headers.")}</p>
                <p>
                  {t(
                    "Use comma-separated CSV and quote cells that contain commas, quotes, or line breaks.",
                  )}
                </p>
                <p>{t("Escape quotes by doubling them.")}</p>
                <p>{t("Empty rows are ignored.")}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border/80 bg-background/70 p-4">
            <h3 className="font-heading text-sm font-semibold">
              {t("Example CSV")}
            </h3>
            <code className="mt-3 block max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/35 p-3 font-mono text-xs leading-5 text-foreground">
              {exampleCsv}
            </code>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.55fr)_minmax(0,1fr)]">
            <section className="rounded-xl border border-border/80 bg-background/70 p-4">
              <h3 className="font-heading text-sm font-semibold">
                {t("Required columns")}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {requiredHeaders.map((header) => (
                  <Badge key={header} variant="success">
                    {header}
                  </Badge>
                ))}
              </div>
              <h3 className="mt-5 font-heading text-sm font-semibold">
                {t("Optional columns")}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {optionalHeaders.map((header) => (
                  <Badge key={header} variant="outline">
                    {header}
                  </Badge>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border/80 bg-background/70 p-4">
              <h3 className="font-heading text-sm font-semibold">
                {t("Field rules")}
              </h3>
              <div className="mt-3 divide-y divide-border/70 rounded-lg border border-border/70">
                {lines.map((line) => (
                  <div
                    key={line.label}
                    className="grid gap-1 px-3 py-2.5 sm:grid-cols-[140px_minmax(0,1fr)]"
                  >
                    <code className="font-mono text-xs text-foreground">
                      {line.label}
                    </code>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t(line.detail)}
                    </p>
                    {line.example ? (
                      <p className="text-xs leading-5 text-muted-foreground sm:col-start-2">
                        <span className="font-medium text-foreground">
                          {t("Example")}:
                        </span>{" "}
                        <code className="font-mono text-foreground">
                          {line.example}
                        </code>
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {usesAudienceTemplateRules(kind, audience) ? (
            <section className="rounded-xl border border-emerald-200/70 bg-emerald-50/75 p-4 text-emerald-950 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-100">
              <h3 className="font-heading text-sm font-semibold">
                {t(
                  `${templateAudienceRulePrefix(audience)} template body rules`,
                )}
              </h3>
              <div className="mt-3 grid gap-2 text-xs leading-5">
                {templateBodyRulesForAudience(audience).map((rule) => (
                  <div
                    key={rule.label}
                    className="rounded-lg border border-emerald-200/70 bg-white/55 px-3 py-2 dark:border-emerald-300/20 dark:bg-black/10"
                  >
                    <p className="font-semibold">{t(rule.label)}</p>
                    <p className="mt-1">{t(rule.detail)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-emerald-200/70 bg-white/70 p-3 dark:border-emerald-300/20 dark:bg-black/15">
                <p className="text-xs font-semibold">
                  {t("Approved mandatory closing")}
                </p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6">
                  {PROFESSIONAL_TEMPLATE_MANDATORY_CLOSING}
                </pre>
              </div>
            </section>
          ) : null}

          {usesAudienceTemplateRules(kind, audience) ? (
            <section className="rounded-xl border border-blue-200/70 bg-blue-50/75 p-4 text-blue-950 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-100">
              <h3 className="font-heading text-sm font-semibold">
                {t(
                  `${templateAudienceRulePrefix(audience)} template writing style`,
                )}
              </h3>
              <ul className="mt-3 grid gap-2 text-xs leading-5">
                {templateWritingStyleRulesForAudience(audience).map((rule) => (
                  <li key={rule} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span>{t(rule)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {usesAudienceTemplateRules(kind, audience) ? (
            <section className="rounded-xl border border-violet-200/70 bg-violet-50/75 p-4 text-violet-950 dark:border-violet-300/20 dark:bg-violet-400/10 dark:text-violet-100">
              <h3 className="font-heading text-sm font-semibold">
                {t(
                  `${templateAudienceRulePrefix(audience)} template review rules`,
                )}
              </h3>
              <p className="mt-2 text-sm leading-6">
                {t(templateReviewRuleForAudience(audience))}
              </p>
            </section>
          ) : null}

          <section className="rounded-xl border border-border/80 bg-background/70 p-4">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              <h3 className="font-heading text-sm font-semibold">
                {t("Accepted statuses")}
              </h3>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <Badge key={option.value} variant="secondary">
                  <code className="font-mono">{option.value}</code>
                  <span className="ml-1 text-muted-foreground">
                    {t(option.label)}
                  </span>
                </Badge>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border/80 bg-background/70 p-4">
            <h3 className="font-heading text-sm font-semibold">
              {t("Accepted categories")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {kind === "templates"
                ? t(
                    "Use one canonical category key for the selected template audience.",
                  )
                : categoryAudience === "professionals"
                  ? t(
                      "Use canonical pro_* keys when possible. Quote the CSV cell when multiple keys are separated by commas.",
                    )
                  : t(
                      "Use canonical org_* keys when possible. Quote the CSV cell when multiple keys are separated by commas.",
                    )}
            </p>
            <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border/80 bg-muted/20 p-3">
              <OptionGrid
                items={categoryOptions.map((category) => ({
                  value: category.value,
                  label: t(category.label),
                }))}
              />
            </div>
          </section>

          {kind !== "templates" ? (
            <section className="rounded-xl border border-border/80 bg-background/70 p-4">
              <h3 className="font-heading text-sm font-semibold">
                {t("Accepted countries")}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "Use normalized country codes from the CRM country whitelist. Quote the CSV cell when multiple codes are separated by commas. GLOBAL is not accepted.",
                )}
              </p>
              <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border/80 bg-muted/20 p-3">
                <div className="grid gap-4">
                  {countries.map((group) => (
                    <div key={group.key} className="grid gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {t(group.label)}
                      </p>
                      <OptionGrid
                        items={group.options.map((country) => ({
                          value: country.code,
                          label: country.label,
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {kind === "templates" ? (
            <section className="rounded-xl border border-border/80 bg-background/70 p-4">
              <h3 className="font-heading text-sm font-semibold">
                {t("Template variables")}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Use variables in subject or body as {{variable_name}}.")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "Prefer templates that use the accepted variables for their audience. Variables are not mandatory, but they make CRM outreach safer to reuse and score better in plantillas.",
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Unknown variables render blank.")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {TEMPLATE_VARIABLES.map((variable) => (
                  <Badge key={variable} variant="outline">
                    <code className="font-mono">{`{{${variable}}}`}</code>
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-amber-200/70 bg-amber-50/75 p-4 text-amber-950 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100">
            <h3 className="font-heading text-sm font-semibold">
              {t("Common import mistakes to avoid")}
            </h3>
            <ul className="mt-3 grid gap-2 text-xs leading-5">
              {pitfalls.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{t(item)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-blue-200/70 bg-blue-50/75 p-4 text-blue-950 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-100">
            <h3 className="font-heading text-sm font-semibold">
              {t("Import behavior")}
            </h3>
            <ul className="mt-3 grid gap-2 text-xs leading-5">
              {importBehaviorLinesFor(kind).map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  <span>{t(item)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyRules()}
          >
            {copyStatus === "copied" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copyStatus === "copied"
              ? t("Copied")
              : copyStatus === "error"
                ? t("Copy error")
                : t("Copy")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
