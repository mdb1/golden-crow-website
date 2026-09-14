import {
  discoverGeneticReportCategoryLabels,
  parseDiscoverGeneticReportCategoryKeys,
  serializeDiscoverGeneticReportCategoryKeys,
} from "@/lib/discover";

describe("Discover field helpers", () => {
  it("preserves the submitted order of genetic report category keys", () => {
    expect(
      parseDiscoverGeneticReportCategoryKeys(
        "grc_full_genome,grc_reproductive,grc_full_genome,not_real",
      ),
    ).toEqual(["grc_full_genome", "grc_reproductive"]);
    expect(
      serializeDiscoverGeneticReportCategoryKeys([
        "grc_hereditary_cancer",
        "grc_ophthalmics",
        "grc_hereditary_cancer",
      ]),
    ).toBe("grc_hereditary_cancer,grc_ophthalmics");
    expect(
      discoverGeneticReportCategoryLabels(
        "grc_full_genome,grc_reproductive",
      ),
    ).toEqual(["Full genome", "Reproductive"]);
  });
});
