import {
  discoverIndividualCategoryProvider,
  discoverOrganizationCategoryProvider,
} from "@/lib/discover-publisher-categories";

describe("Discover publisher category providers", () => {
  it("exposes exactly 60 category options for organizations and individuals", () => {
    expect(discoverOrganizationCategoryProvider.optionCount).toBe(60);
    expect(discoverIndividualCategoryProvider.optionCount).toBe(60);
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
  });
});
