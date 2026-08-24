import {
  discoverIndividualCategoryProvider,
  discoverOrganizationCategoryProvider,
} from "../lib/discover-publisher-categories";

describe("Discover publisher category providers", () => {
  it("keeps the fixed Discover publisher category lists at their required counts", () => {
    expect(discoverOrganizationCategoryProvider.optionCount).toBe(60);
    expect(discoverIndividualCategoryProvider.optionCount).toBe(90);
  });

  it("normalizes legacy aliases and serializes canonical comma-separated keys", () => {
    expect(
      discoverOrganizationCategoryProvider.normalizeCsv(
        "foundation,org_patient_organizations,foundation",
      ),
    ).toBe("org_rare_disease_foundations,org_patient_organizations");
    expect(
      discoverIndividualCategoryProvider.normalizeCsv(
        "researcher,pro_medical_geneticists,researcher",
      ),
    ).toBe("pro_research_scientists,pro_medical_geneticists");
    expect(
      discoverIndividualCategoryProvider.normalizeCsv(
        [
          "pro_project_managers",
          "pro_startup_founders",
          "pro_app_developers",
          "pro_entrepreneurs",
          "pro_software_engineers",
        ].join(","),
      ),
    ).toBe(
      [
        "pro_project_managers",
        "pro_startup_founders",
        "pro_app_developers",
        "pro_entrepreneurs",
        "pro_software_engineers",
      ].join(","),
    );
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
