import {
  SUPPORT_SERVICE_CATEGORIES,
  SUPPORT_SERVICE_CATEGORY_GROUPS,
  SUPPORT_SERVICE_CATEGORY_KEYS,
  isSupportServiceCategoryKey,
  isSupportServiceCategoryValue,
  parseSupportServiceCategoryKeys,
  serializeSupportServiceCategoryKeys,
  supportServiceCategoriesByValue,
  supportServiceCategoryByKey,
  supportServiceCategoryValueIssue,
  synchronizeSupportServiceStagesForCategories,
} from "@/lib/support-service-categories";

describe("support service categories", () => {
  it("exposes the exact closed 110-value bilingual registry", () => {
    expect(SUPPORT_SERVICE_CATEGORY_KEYS).toHaveLength(110);
    expect(new Set(SUPPORT_SERVICE_CATEGORY_KEYS).size).toBe(110);
    expect(SUPPORT_SERVICE_CATEGORIES).toHaveLength(110);
    expect(SUPPORT_SERVICE_CATEGORY_GROUPS).toHaveLength(15);
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
    expect(
      isSupportServiceCategoryKey(
        "sot_human_advice_healthcare_ai_evaluation_adoption",
      ),
    ).toBe(true);
    expect(
      isSupportServiceCategoryKey(
        "sot_human_advice_genomic_biobanking_governance",
      ),
    ).toBe(true);
    expect(
      isSupportServiceCategoryKey(
        "sot_human_advice_genomics_regulatory_research_ethics",
      ),
    ).toBe(true);
    expect(
      isSupportServiceCategoryKey(
        "sot_human_advice_genomics_science_communication",
      ),
    ).toBe(true);
    expect(
      isSupportServiceCategoryKey(
        "sot_human_advice_addiction_recovery_counseling",
      ),
    ).toBe(false);
    expect(
      isSupportServiceCategoryKey(
        "sot_human_advice_immigration_residency_legal",
      ),
    ).toBe(false);
    expect(
      isSupportServiceCategoryKey("sot_human_advice_language_learning"),
    ).toBe(false);
    expect(isSupportServiceCategoryKey("Genomic report generation")).toBe(
      false,
    );
    expect(isSupportServiceCategoryKey("SOT_GENOMIC_REPORT_GENERATION")).toBe(
      false,
    );
    expect(isSupportServiceCategoryKey("")).toBe(false);
    expect(supportServiceCategoryByKey("sot_unknown")).toBeNull();
  });

  it("parses recognized category keys in stored order with stable deduplication", () => {
    expect(
      parseSupportServiceCategoryKeys(
        " sot_genomic_report_review,unknown,sot_genomic_interpretation,sot_genomic_report_review,,sot_genomic_data_interoperability ",
      ),
    ).toEqual([
      "sot_genomic_report_review",
      "sot_genomic_interpretation",
      "sot_genomic_data_interoperability",
    ]);
    expect(parseSupportServiceCategoryKeys(null)).toEqual([]);
  });

  it("validates only strict canonical category values", () => {
    expect(isSupportServiceCategoryValue("sot_genomic_interpretation")).toBe(
      true,
    );
    expect(
      isSupportServiceCategoryValue(
        "sot_genomic_report_review,sot_genomic_interpretation",
      ),
    ).toBe(true);
    expect(
      isSupportServiceCategoryValue(
        "sot_human_advice_parenting_guidance,sot_human_advice_social_care_navigation",
      ),
    ).toBe(true);

    expect(isSupportServiceCategoryValue("")).toBe(false);
    expect(
      isSupportServiceCategoryValue(
        "sot_genomic_interpretation, sot_genomic_report_review",
      ),
    ).toBe(false);
    expect(
      isSupportServiceCategoryValue(
        "sot_genomic_interpretation,,sot_genomic_report_review",
      ),
    ).toBe(false);
    expect(
      isSupportServiceCategoryValue("sot_genomic_interpretation,sot_unknown"),
    ).toBe(false);
    expect(
      isSupportServiceCategoryValue(
        "sot_genomic_interpretation,sot_genomic_interpretation",
      ),
    ).toBe(false);
    expect(
      isSupportServiceCategoryValue(
        "sot_genomic_interpretation,sot_human_advice_parenting_guidance",
      ),
    ).toBe(true);
    expect(supportServiceCategoryValueIssue("")).toBe("empty");
    expect(
      supportServiceCategoryValueIssue(
        "sot_genomic_interpretation,sot_human_advice_parenting_guidance",
      ),
    ).toBeNull();
    expect(
      supportServiceCategoryValueIssue(
        "sot_genomic_interpretation,sot_unknown",
      ),
    ).toBe("invalid");
    expect(
      supportServiceCategoryValueIssue(
        "sot_genomic_report_review,sot_genomic_interpretation",
      ),
    ).toBeNull();
  });

  it("accepts every registered category in one comma-delimited scalar", () => {
    const value = SUPPORT_SERVICE_CATEGORY_KEYS.join(",");

    expect(isSupportServiceCategoryValue(value)).toBe(true);
    expect(serializeSupportServiceCategoryKeys(SUPPORT_SERVICE_CATEGORY_KEYS)).toBe(
      value,
    );
    expect(supportServiceCategoriesByValue(value)).toHaveLength(
      SUPPORT_SERVICE_CATEGORY_KEYS.length,
    );
  });

  it("serializes and resolves categories in first-selection order", () => {
    const value = serializeSupportServiceCategoryKeys([
      "sot_genomic_report_review",
      "sot_human_advice_parenting_guidance",
      " sot_genomic_interpretation ",
      "sot_genomic_report_review",
      "unknown",
      "sot_genomic_data_interoperability",
    ]);

    expect(value).toBe(
      "sot_genomic_report_review,sot_human_advice_parenting_guidance,sot_genomic_interpretation,sot_genomic_data_interoperability",
    );
    expect(
      supportServiceCategoriesByValue(value).map((category) => category.key),
    ).toEqual([
      "sot_genomic_report_review",
      "sot_human_advice_parenting_guidance",
      "sot_genomic_interpretation",
      "sot_genomic_data_interoperability",
    ]);
  });

  it("synchronizes stages without restricting category combinations", () => {
    expect(
      synchronizeSupportServiceStagesForCategories(
        "sot_human_advice_parenting_guidance",
        ["test_planning", "human_advice"],
      ),
    ).toEqual(["human_advice"]);
    expect(
      synchronizeSupportServiceStagesForCategories(
        "sot_genomic_interpretation,sot_human_advice_parenting_guidance",
        ["wet_lab"],
      ),
    ).toEqual(["wet_lab", "human_advice"]);
    expect(
      synchronizeSupportServiceStagesForCategories(
        "sot_complete_health_genomics_report",
        ["wet_lab", "human_advice"],
      ),
    ).toEqual(["test_planning", "wet_lab", "bioinformatics"]);
    expect(
      synchronizeSupportServiceStagesForCategories(
        "sot_complete_health_genomics_report,sot_human_advice_parenting_guidance",
        ["human_advice"],
      ),
    ).toEqual([
      "test_planning",
      "wet_lab",
      "bioinformatics",
      "human_advice",
    ]);
    expect(
      synchronizeSupportServiceStagesForCategories(
        "sot_genomic_interpretation",
        ["human_advice"],
      ),
    ).toEqual(["test_planning"]);
    expect(
      synchronizeSupportServiceStagesForCategories(
        SUPPORT_SERVICE_CATEGORY_KEYS.join(","),
        [],
      ),
    ).toEqual([
      "test_planning",
      "wet_lab",
      "bioinformatics",
      "human_advice",
    ]);
  });

  it("uses the genomics-focused names and descriptions from the canonical registry", () => {
    expect(
      supportServiceCategoryByKey("sot_human_advice_medical_consultation"),
    ).toMatchObject({
      nameEnglish: "Genetics-related medical consultation",
      nameSpanish: "Consulta médica relacionada con genética",
      descriptionEnglish:
        "Clinical evaluation of symptoms, family history, inherited conditions, and appropriate genetic testing or specialist referral.",
      descriptionSpanish:
        "Evaluación clínica de síntomas, antecedentes familiares, enfermedades hereditarias y posibles estudios genéticos o derivaciones especializadas.",
    });
    expect(
      supportServiceCategoryByKey(
        "sot_human_advice_genomic_biobanking_governance",
      ),
    ).toMatchObject({
      nameEnglish: "Genomic biobanking and biospecimen governance",
      nameSpanish: "Gestión de biobancos genómicos y muestras biológicas",
    });
    expect(
      supportServiceCategoryByKey(
        "sot_human_advice_genomics_regulatory_research_ethics",
      ),
    ).toMatchObject({
      nameEnglish: "Genomics regulatory and research ethics consulting",
      nameSpanish: "Consultoría regulatoria y ética en genómica",
    });
    expect(
      supportServiceCategoryByKey(
        "sot_human_advice_genomics_science_communication",
      ),
    ).toMatchObject({
      nameEnglish: "Genomics science communication and public education",
      nameSpanish: "Divulgación científica y educación pública en genómica",
    });
    expect(
      supportServiceCategoryByKey(
        "sot_human_advice_health_technology_usability_human_factors_accessibility",
      ),
    ).toMatchObject({
      nameEnglish: "Genomics technology usability and accessibility",
      nameSpanish: "Usabilidad y accesibilidad de tecnologías genómicas",
      descriptionEnglish:
        "User research and usability or accessibility evaluation for genomic portals, genetic test ordering, report viewers, and patient-facing genetics applications.",
      descriptionSpanish:
        "Investigación con usuarios y evaluación de usabilidad o accesibilidad de portales genómicos, solicitud de estudios, visores de informes y aplicaciones genéticas para pacientes.",
    });
  });
});
