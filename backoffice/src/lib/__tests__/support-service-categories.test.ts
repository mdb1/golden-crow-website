import {
  SUPPORT_SERVICE_CATEGORIES,
  SUPPORT_SERVICE_CATEGORY_GROUPS,
  SUPPORT_SERVICE_CATEGORY_KEYS,
  isSupportServiceCategoryKey,
  supportServiceCategoryByKey,
} from "@/lib/support-service-categories";

describe("support service categories", () => {
  it("exposes the exact closed 30-value bilingual registry", () => {
    expect(SUPPORT_SERVICE_CATEGORY_KEYS).toHaveLength(30);
    expect(new Set(SUPPORT_SERVICE_CATEGORY_KEYS).size).toBe(30);
    expect(SUPPORT_SERVICE_CATEGORIES).toHaveLength(30);
    expect(SUPPORT_SERVICE_CATEGORY_GROUPS).toHaveLength(6);
    expect(
      SUPPORT_SERVICE_CATEGORY_GROUPS.flatMap((group) => group.keys),
    ).toEqual(SUPPORT_SERVICE_CATEGORY_KEYS);

    for (const category of SUPPORT_SERVICE_CATEGORIES) {
      expect(category.nameEnglish).not.toBe("");
      expect(category.nameSpanish).not.toBe("");
      expect(category.descriptionEnglish).not.toBe("");
      expect(category.descriptionSpanish).not.toBe("");
      expect(category.systemImage).not.toBe("");
    }
  });

  it("accepts exact keys only and leaves historical fallbacks uncategorized", () => {
    expect(isSupportServiceCategoryKey("sot_genomic_report_generation")).toBe(
      true,
    );
    expect(isSupportServiceCategoryKey("Genomic report generation")).toBe(
      false,
    );
    expect(isSupportServiceCategoryKey("SOT_GENOMIC_REPORT_GENERATION")).toBe(
      false,
    );
    expect(isSupportServiceCategoryKey("")).toBe(false);
    expect(supportServiceCategoryByKey("sot_unknown")).toBeNull();
  });
});
