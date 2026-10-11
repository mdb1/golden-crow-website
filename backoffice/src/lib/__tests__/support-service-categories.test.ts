import {
  SUPPORT_SERVICE_CATEGORIES,
  SUPPORT_SERVICE_CATEGORY_GROUPS,
  SUPPORT_SERVICE_CATEGORY_KEYS,
  isSupportServiceCategoryKey,
  supportServiceCategoryByKey,
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
