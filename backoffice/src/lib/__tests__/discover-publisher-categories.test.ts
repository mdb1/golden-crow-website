import {
  discoverIndividualCategoryProvider,
  discoverOrganizationCategoryProvider,
} from "@/lib/discover-publisher-categories";

describe("Discover publisher category providers", () => {
  it("exposes the fixed category option counts for organizations and individuals", () => {
    expect(discoverOrganizationCategoryProvider.optionCount).toBe(60);
    expect(discoverIndividualCategoryProvider.optionCount).toBe(90);
  });

  it("serializes multiple category keys as canonical comma-separated values", () => {
    expect(
      discoverOrganizationCategoryProvider.normalizeCsv(
        "patient_advocacy_group, org_genetics_research_institutes,patient_advocacy_group",
      ),
    ).toBe(
      "org_patient_advocacy_organizations,org_genetics_research_institutes",
    );
    expect(
      discoverIndividualCategoryProvider.normalizeCsv(
        "researcher, pro_medical_geneticists, researcher",
      ),
    ).toBe("pro_research_scientists,pro_medical_geneticists");
    expect(
      discoverIndividualCategoryProvider.normalizeCsv(
        "pro_software_engineers, pro_other, pro_software_engineers",
      ),
    ).toBe("pro_software_engineers,pro_other");
  });

  it("keeps publisher category keys unique and correctly prefixed", () => {
    const organizationKeys = discoverOrganizationCategoryProvider.options.map(
      (option) => option.value,
    );
    const individualKeys = discoverIndividualCategoryProvider.options.map(
      (option) => option.value,
    );
    const allKeys = [...organizationKeys, ...individualKeys];

    expect(organizationKeys.every((key) => key.startsWith("org_"))).toBe(true);
    expect(individualKeys.every((key) => key.startsWith("pro_"))).toBe(true);
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });
});
