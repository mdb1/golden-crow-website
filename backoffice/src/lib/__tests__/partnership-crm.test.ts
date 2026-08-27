import {
  bestCrmTemplateForOrganization,
  normalizeCrmCategory,
  parseCrmCsv,
  renderCrmTemplate,
  type PartnershipCrmOrganizationRecord,
  type PartnershipCrmTemplateRecord,
} from "@/lib/partnership-crm";

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
  normalizedName: "genome lab",
};

const laboratoryTemplate: PartnershipCrmTemplateRecord = {
  id: "tpl-lab",
  schemaVersion: 1,
  name: "Laboratory outreach",
  category: "Laboratory / Genomics",
  subject: "Pocket Genes + {{organization_name}}",
  body: "Hola {{contact_name}}, vimos {{organization_name}}{{website_sentence}}.",
  status: "active",
  notes: "",
  normalizedName: "laboratory outreach",
};

const foundationTemplate: PartnershipCrmTemplateRecord = {
  id: "tpl-foundation",
  schemaVersion: 1,
  name: "Foundation outreach",
  category: "Foundation",
  subject: "Pocket Genes + {{organization_name}}",
  body: "Hola {{contact_name}}, queremos conversar con {{organization_name}}.",
  status: "active",
  notes: "",
  normalizedName: "foundation outreach",
};

describe("partnership CRM helpers", () => {
  it("normalizes CRM categories to the fixed organization category list", () => {
    expect(normalizeCrmCategory("lab")).toBe("Laboratory / Genomics");
    expect(normalizeCrmCategory("fundacion")).toBe("Foundation");
    expect(normalizeCrmCategory("Plataforma de pruebas geneticas")).toBe(
      "Genetic Testing Platform",
    );
    expect(normalizeCrmCategory("Unmapped category")).toBe("Other");
    expect(normalizeCrmCategory("")).toBe("");
  });

  it("parses CRM CSV rows without requiring contact email", () => {
    const parsed = parseCrmCsv(
      [
        "name,category,website,country,contact_name,email,linkedin,status,notes",
        "Genome Lab,Genetic Testing Platform,genomelab.example,Argentina,Marcelo,marcelo@genomelab.example,https://linkedin.com/in/marcelo,Contacted,Already replied",
        "Angelman Argentina,Foundation,angelman.org.ar,Argentina,,,,New,Research contact later",
      ].join("\n"),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        name: "Genome Lab",
        category: "Genetic Testing Platform",
        country: "AR",
        contactEmail: "marcelo@genomelab.example",
        status: "contacted",
      }),
      expect.objectContaining({
        name: "Angelman Argentina",
        category: "Foundation",
        country: "AR",
        contactEmail: "",
        status: "new",
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

  it("matches templates to organizations through normalized category aliases", () => {
    expect(
      bestCrmTemplateForOrganization(
        { ...organization, category: "lab" },
        [
          foundationTemplate,
          { ...laboratoryTemplate, category: "laboratorio genomica" },
        ],
      )?.id,
    ).toBe("tpl-lab");
  });
});
