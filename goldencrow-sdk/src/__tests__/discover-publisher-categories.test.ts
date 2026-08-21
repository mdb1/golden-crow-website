import {
  discoverIndividualCategoryProvider,
  discoverOrganizationCategoryProvider,
} from "../lib/discover-publisher-categories";

describe("Discover publisher category providers", () => {
  it("keeps the fixed Discover publisher category lists at 60 options each", () => {
    expect(discoverOrganizationCategoryProvider.optionCount).toBe(60);
    expect(discoverIndividualCategoryProvider.optionCount).toBe(60);
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
  });
});
