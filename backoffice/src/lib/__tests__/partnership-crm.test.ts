import {
  parseCrmCsv,
  renderCrmTemplate,
  templateForCategory,
  type PartnershipCrmOrganizationRecord,
} from "@/lib/partnership-crm";

const organization: PartnershipCrmOrganizationRecord = {
  id: "crm-1",
  schemaVersion: 1,
  name: "MedicGen",
  category: "Laboratory / Genomics",
  website: "https://medicgen.com/",
  websiteDomain: "medicgen.com",
  country: "Argentina",
  status: "new",
  contactName: "Marcelo Herran",
  contactEmail: "marcelo@medicgen.com",
  contactLinkedIn: "https://linkedin.com/in/marcelo",
  lastContactAt: null,
  notes: "LinkedIn referral from Cesar.",
  normalizedName: "medicgen",
};

describe("partnership CRM helpers", () => {
  it("parses CRM CSV rows without requiring contact email", () => {
    const parsed = parseCrmCsv(
      [
        "name,category,website,country,contact_name,email,linkedin,status,notes",
        "MedicGen,Genetic Testing Platform,medicgen.com,Argentina,Marcelo,marcelo@medicgen.com,https://linkedin.com/in/marcelo,Contacted,Already replied",
        "Angelman Argentina,Foundation,angelman.org.ar,Argentina,,,,New,Research contact later",
      ].join("\n"),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        name: "MedicGen",
        contactEmail: "marcelo@medicgen.com",
        status: "contacted",
      }),
      expect.objectContaining({
        name: "Angelman Argentina",
        contactEmail: "",
        status: "new",
      }),
    ]);
  });

  it("reports missing organization names but keeps the row visible for preview", () => {
    const parsed = parseCrmCsv("name,category,email\n,Foundation,ada@example.org");

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toEqual([
      { row: 2, message: "Organization name is required." },
    ]);
  });

  it("renders category-aware templates with organization variables", () => {
    expect(templateForCategory("Genetic Testing Platform")).toBe(
      "laboratory_genomics",
    );

    const rendered = renderCrmTemplate("laboratory_genomics", organization);

    expect(rendered.subject).toBe("Pocket Genes + MedicGen");
    expect(rendered.body).toContain("Hola Marcelo");
    expect(rendered.body).toContain("MedicGen (medicgen.com)");
    expect(rendered.body).not.toContain("{{organization_name}}");
  });
});
