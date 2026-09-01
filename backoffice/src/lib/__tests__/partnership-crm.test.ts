import {
  bestCrmTemplateForOrganization,
  bestCrmTemplateForTarget,
  CRM_CATEGORY_OPTIONS,
  CRM_PROFESSIONAL_CATEGORY_OPTIONS,
  normalizeCrmCategory,
  normalizeCrmCountry,
  parseCrmCsv,
  parseCrmTemplateCsv,
  renderCrmTemplate,
  type PartnershipCrmOrganizationRecord,
  type PartnershipCrmProfessionalRecord,
  type PartnershipCrmTemplateRecord,
} from "@/lib/partnership-crm";
import {
  DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS,
  DISCOVER_ORGANIZATION_CATEGORY_OPTIONS,
} from "@/lib/discover-publisher-categories";

const organization: PartnershipCrmOrganizationRecord = {
  id: "crm-1",
  schemaVersion: 1,
  name: "Genome Lab",
  category: "Laboratory / Genomics",
  website: "https://genomelab.example/",
  websiteDomain: "genomelab.example",
  country: "Argentina",
  status: "new",
  contactName: "Marcelo",
  contactEmail: "marcelo@genomelab.example",
  contactLinkedIn: "https://linkedin.com/in/marcelo",
  lastContactAt: null,
  notes: "LinkedIn referral.",
  is_favorite: false,
  normalizedName: "genome lab",
};

const laboratoryTemplate: PartnershipCrmTemplateRecord = {
  id: "tpl-lab",
  schemaVersion: 1,
  name: "Laboratory outreach",
  audience: "organizations",
  category: "Laboratory / Genomics",
  subject: "Pocket Genes + {{organization_name}}",
  body: "Hola {{contact_name}}, vimos {{organization_name}}{{website_sentence}}.",
  status: "active",
  notes: "",
  is_favorite: false,
  normalizedName: "laboratory outreach",
};

const foundationTemplate: PartnershipCrmTemplateRecord = {
  id: "tpl-foundation",
  schemaVersion: 1,
  name: "Foundation outreach",
  audience: "organizations",
  category: "Foundation",
  subject: "Pocket Genes + {{organization_name}}",
  body: "Hola {{contact_name}}, queremos conversar con {{organization_name}}.",
  status: "active",
  notes: "",
  is_favorite: false,
  normalizedName: "foundation outreach",
};

const professional: PartnershipCrmProfessionalRecord = {
  id: "pro-1",
  schemaVersion: 1,
  name: "Dra. Ada Genome",
  category: "pro_clinical_geneticists",
  title: "Genetista clinica",
  primaryAffiliation: "Genome Lab",
  potentialPocketGenesEditorFit:
    "Clinical genetics, genetic testing, result interpretation and patient education.",
  emailRoute:
    "Publicly listed professional or official institutional contact address; verify recipient context before outreach.",
  linkedInRoute: "Official LinkedIn page of the affiliated organization.",
  researchBasis:
    "Existing verified Pocket Genes partnership dataset, affiliation website and LinkedIn record.",
  website: "https://genomelab.example/",
  websiteDomain: "genomelab.example",
  country: "Argentina",
  status: "new",
  email: "ada@genomelab.example",
  linkedIn: "https://linkedin.com/in/ada",
  lastContactAt: null,
  notes: "",
  is_favorite: false,
  normalizedName: "dra ada genome",
};

const professionalTemplate: PartnershipCrmTemplateRecord = {
  id: "tpl-pro",
  schemaVersion: 1,
  name: "Professional outreach",
  audience: "professionals",
  category: "pro_clinical_geneticists",
  subject: "Pocket Genes + {{professional_name}}",
  body: "Hola {{first_name}}, vi tu trabajo como {{title}} en {{primary_affiliation}}. Base: {{research_basis}}",
  status: "active",
  notes: "",
  is_favorite: false,
  normalizedName: "professional outreach",
};

describe("partnership CRM helpers", () => {
  it("uses the Discover organization category catalog as its CRM whitelist", () => {
    expect(CRM_CATEGORY_OPTIONS).toBe(DISCOVER_ORGANIZATION_CATEGORY_OPTIONS);
    expect(CRM_CATEGORY_OPTIONS).toHaveLength(60);
  });

  it("uses the Discover individual category catalog for professional CRM records", () => {
    expect(CRM_PROFESSIONAL_CATEGORY_OPTIONS).toBe(
      DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS,
    );
    expect(CRM_PROFESSIONAL_CATEGORY_OPTIONS.length).toBeGreaterThan(60);
  });

  it("normalizes CRM categories to the fixed organization category list", () => {
    expect(normalizeCrmCategory("lab")).toBe(
      "org_genetic_testing_laboratories",
    );
    expect(normalizeCrmCategory("Genomics Laboratory")).toBe(
      "org_genomics_laboratories",
    );
    expect(normalizeCrmCategory("fundacion")).toBe(
      "org_rare_disease_foundations",
    );
    expect(normalizeCrmCategory("Plataforma de pruebas geneticas")).toBe(
      "org_genetic_testing_platforms",
    );
    expect(normalizeCrmCategory("lab, Scientific Society, lab")).toBe(
      "org_genetic_testing_laboratories,org_scientific_societies",
    );
    expect(normalizeCrmCategory("genetista, Researcher", "professionals")).toBe(
      "pro_clinical_geneticists,pro_research_scientists",
    );
    expect(normalizeCrmCategory("Unmapped category")).toBe("");
    expect(normalizeCrmCategory("")).toBe("");
  });

  it("normalizes CRM countries as comma-separated concrete country codes", () => {
    expect(normalizeCrmCountry("Argentina, Spain, AR, Global")).toBe("AR,ES");
    expect(normalizeCrmCountry("United States (US), New Zealand")).toBe(
      "US,NZ",
    );
  });

  it("parses CRM CSV rows without requiring contact email", () => {
    const parsed = parseCrmCsv(
      [
        "name,category,website,country,contact_name,email,linkedin,status,is_favorite,notes",
        '"Genome Lab","Genetic Testing Platform, Scientific Society",genomelab.example,"Argentina,Spain",Marcelo,marcelo@genomelab.example,https://linkedin.com/in/marcelo,Contacted,true,Already replied',
        "Angelman Argentina,Foundation,angelman.org.ar,Argentina,,,,New,false,Research contact later",
      ].join("\n"),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        name: "Genome Lab",
        category: "org_genetic_testing_platforms,org_scientific_societies",
        country: "AR,ES",
        contactEmail: "marcelo@genomelab.example",
        status: "contacted",
        is_favorite: true,
      }),
      expect.objectContaining({
        name: "Angelman Argentina",
        category: "org_rare_disease_foundations",
        country: "AR",
        contactEmail: "",
        status: "new",
        is_favorite: false,
      }),
    ]);
  });

  it("parses professional CRM CSV rows against the professional model", () => {
    const parsed = parseCrmCsv(
      [
        "name,category,title,primary_affiliation,potential_pocket_genes_editor_fit,email_route,linkedin_route,research_basis,website,country,email,linkedin,status,is_favorite,notes",
        'Dra. Ada Genome,genetista,Genetista clinica,Genome Lab,"Clinical genetics, genetic testing and patient education",Public email listing,Affiliated organization LinkedIn,Verified dataset and website,genomelab.example,Argentina,ada@genomelab.example,https://linkedin.com/in/ada,Contacted,favorito,Direct intro',
      ].join("\n"),
      "professionals",
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        name: "Dra. Ada Genome",
        category: "pro_clinical_geneticists",
        title: "Genetista clinica",
        primaryAffiliation: "Genome Lab",
        potentialPocketGenesEditorFit:
          "Clinical genetics, genetic testing and patient education",
        emailRoute: "Public email listing",
        linkedInRoute: "Affiliated organization LinkedIn",
        researchBasis: "Verified dataset and website",
        email: "ada@genomelab.example",
        status: "contacted",
        is_favorite: true,
      }),
    ]);
  });

  it("reports missing organization names but keeps the row visible for preview", () => {
    const parsed = parseCrmCsv(
      "name,category,email\n,Foundation,ada@example.org",
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toEqual([
      { row: 2, message: "Organization name is required." },
    ]);
  });

  it("parses CRM template CSV rows with normalized category and status values", () => {
    const parsed = parseCrmTemplateCsv(
      [
        "name,category,subject,body,status,is_favorite,notes",
        '"Lab intro","lab","Pocket Genes + {{organization_name}}","Hola {{contact_name}}\\nLinea 2","activo","starred","Primary"',
        '"Foundation intro","fundacion","Pocket Genes para {{organization_name}}","Hola {{contact_name}}","archivada","false","Secondary"',
      ].join("\n"),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        name: "Lab intro",
        audience: "organizations",
        category: "org_genetic_testing_laboratories",
        subject: "Pocket Genes + {{organization_name}}",
        body: "Hola {{contact_name}}\nLinea 2",
        status: "active",
        notes: "Primary",
        is_favorite: true,
      }),
      expect.objectContaining({
        name: "Foundation intro",
        audience: "organizations",
        category: "org_rare_disease_foundations",
        status: "archived",
        is_favorite: false,
      }),
    ]);
  });

  it("parses professional template CSV rows with audience-specific category normalization", () => {
    const parsed = parseCrmTemplateCsv(
      [
        "name,audience,category,subject,body,status,is_favorite,notes",
        '"Professional intro","professionals","genetista","Pocket Genes + {{professional_name}}","Hola {{first_name}}","active","yes","Primary"',
      ].join("\n"),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        name: "Professional intro",
        audience: "professionals",
        category: "pro_clinical_geneticists",
        subject: "Pocket Genes + {{professional_name}}",
        body: "Hola {{first_name}}",
        is_favorite: true,
      }),
    ]);
  });

  it("keeps invalid CRM template CSV rows visible for preview", () => {
    const parsed = parseCrmTemplateCsv(
      "name,category,subject,body\n,lab,,Hola",
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toEqual([
      { row: 2, message: "Template name is required." },
      { row: 2, message: "Template subject is required." },
    ]);
  });

  it("renders Firebase-backed templates with organization variables", () => {
    expect(
      bestCrmTemplateForOrganization(organization, [
        foundationTemplate,
        laboratoryTemplate,
      ])?.id,
    ).toBe("tpl-lab");

    const rendered = renderCrmTemplate(laboratoryTemplate, organization);

    expect(rendered.subject).toBe("Pocket Genes + Genome Lab");
    expect(rendered.body).toContain("Hola Marcelo");
    expect(rendered.body).toContain("Genome Lab (genomelab.example)");
    expect(rendered.body).not.toContain("{{organization_name}}");
  });

  it("matches templates against any category on a multi-category target", () => {
    expect(
      bestCrmTemplateForOrganization(
        {
          ...organization,
          category: "org_patient_organizations,org_genomics_laboratories",
        },
        [foundationTemplate, laboratoryTemplate],
      )?.id,
    ).toBe("tpl-lab");

    expect(
      bestCrmTemplateForTarget(
        {
          ...professional,
          category: "pro_bioinformaticians,pro_clinical_geneticists",
        },
        [professionalTemplate],
        "professionals",
      )?.id,
    ).toBe("tpl-pro");
  });

  it("renders Firebase-backed templates with professional variables", () => {
    expect(
      bestCrmTemplateForTarget(
        professional,
        [laboratoryTemplate, professionalTemplate],
        "professionals",
      )?.id,
    ).toBe("tpl-pro");

    const rendered = renderCrmTemplate(
      professionalTemplate,
      professional,
      "professionals",
    );

    expect(rendered.subject).toBe("Pocket Genes + Dra. Ada Genome");
    expect(rendered.body).toContain("Hola Dra.");
    expect(rendered.body).toContain("Genetista clinica");
    expect(rendered.body).toContain("Genome Lab");
    expect(rendered.body).toContain("Existing verified Pocket Genes");
    expect(rendered.body).not.toContain("{{professional_name}}");
  });

  it("matches templates to organizations through normalized category aliases", () => {
    expect(
      bestCrmTemplateForOrganization(
        { ...organization, category: "Laboratory / Genomics" },
        [
          foundationTemplate,
          { ...laboratoryTemplate, category: "laboratorio genomica" },
        ],
      )?.id,
    ).toBe("tpl-lab");
  });
});
