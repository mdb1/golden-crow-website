import serviceOfferTypesCatalog from "../../../Pocket-Genes-Catalog-Wiki/catalog/service-offer-types.json";

export const SUPPORT_SERVICE_CATEGORY_KEYS = [
  "sot_genetic_counseling",
  "sot_clinical_intake_phenotyping",
  "sot_informed_consent",
  "sot_genetic_test_selection",
  "sot_genetic_test_ordering",
  "sot_sample_collection",
  "sot_sample_logistics",
  "sot_sample_accession_quality",
  "sot_dna_extraction",
  "sot_dna_sequencing",
  "sot_genotyping",
  "sot_cytogenetic_analysis",
  "sot_prenatal_genetic_screening",
  "sot_reproductive_carrier_screening",
  "sot_sequence_quality_control",
  "sot_read_alignment",
  "sot_variant_calling",
  "sot_structural_variant_cnv_analysis",
  "sot_variant_annotation",
  "sot_gene_variant_prioritization",
  "sot_genomic_interpretation",
  "sot_rare_disease_analysis",
  "sot_hereditary_cancer_analysis",
  "sot_pharmacogenomic_analysis",
  "sot_nutrigenomic_metabolic_analysis",
  "sot_ancestry_analysis",
  "sot_polygenic_risk_analysis",
  "sot_genomic_report_generation",
  "sot_genomic_report_review",
  "sot_genomic_data_interoperability",
  "sot_complete_health_genomics_report",
  "sot_complete_rare_disease_diagnostic_report",
  "sot_complete_hereditary_cancer_report",
  "sot_complete_inherited_cardiovascular_report",
  "sot_complete_neurogenetic_disease_report",
  "sot_complete_cystic_fibrosis_report",
  "sot_complete_pharmacogenomic_report",
  "sot_complete_nutrigenomic_report",
  "sot_complete_food_response_genetics_report",
  "sot_complete_sports_performance_genetics_report",
  "sot_complete_skin_hair_genetics_report",
  "sot_complete_genetic_ancestry_report",
  "sot_complete_personal_traits_genetics_report",
  "sot_complete_reproductive_carrier_report",
  "sot_complete_female_fertility_genetics_report",
  "sot_complete_male_infertility_genetics_report",
  "sot_complete_sperm_dna_integrity_report",
  "sot_complete_reproductive_couple_karyotype_report",
  "sot_complete_preimplantation_aneuploidy_report",
  "sot_complete_preimplantation_monogenic_report",
  "sot_complete_preimplantation_structural_report",
  "sot_complete_noninvasive_prenatal_report",
  "sot_complete_prenatal_carrier_fetal_risk_report",
  "sot_complete_newborn_genomic_screening_report",
  "sot_complete_animal_parentage_identity_report",
  "sot_complete_canine_health_diversity_report",
  "sot_complete_feline_health_traits_report",
  "sot_complete_equine_health_performance_report",
  "sot_complete_livestock_breeding_traits_report",
  "sot_complete_meat_species_authentication_report",
  "sot_human_advice_medical_consultation",
  "sot_human_advice_medical_second_opinion",
  "sot_human_advice_medication_pharmacy_counseling",
  "sot_human_advice_nutrition_dietary_counseling",
  "sot_human_advice_rehabilitation_physical_therapy_guidance",
  "sot_human_advice_reproductive_fertility_counseling",
  "sot_human_advice_sexual_health_counseling",
  "sot_human_advice_pregnancy_postpartum_support",
  "sot_human_advice_psychological_counseling",
  "sot_human_advice_couples_family_counseling",
  "sot_human_advice_grief_bereavement_support",
  "sot_human_advice_addiction_recovery_counseling",
  "sot_human_advice_parenting_guidance",
  "sot_human_advice_caregiver_eldercare_support",
  "sot_human_advice_disability_accessibility_guidance",
  "sot_human_advice_social_care_navigation",
  "sot_human_advice_personal_civil_legal",
  "sot_human_advice_family_estate_legal",
  "sot_human_advice_employment_labor_legal",
  "sot_human_advice_business_contract_legal",
  "sot_human_advice_immigration_residency_legal",
  "sot_human_advice_academic_tutoring",
  "sot_human_advice_special_education_learning_support",
  "sot_human_advice_language_learning",
  "sot_human_advice_academic_admissions_guidance",
  "sot_human_advice_career_vocational_guidance",
  "sot_human_advice_digital_technology_support",
  "sot_human_advice_cybersecurity_privacy_consulting",
  "sot_human_advice_business_entrepreneurship_consulting",
  "sot_human_advice_financial_accounting_tax_consulting",
  "sot_human_advice_health_professional_career_guidance",
  "sot_human_advice_health_professional_development",
  "sot_human_advice_clinical_mentoring_supervision",
  "sot_human_advice_healthcare_leadership_management",
  "sot_human_advice_health_education_training_design",
  "sot_human_advice_health_research_methodology",
  "sot_human_advice_health_scientific_writing_publication",
  "sot_human_advice_evidence_based_health_practice",
  "sot_human_advice_healthcare_quality_patient_safety",
  "sot_human_advice_health_practice_operations",
] as const;

export type SupportServiceCategoryKey =
  (typeof SUPPORT_SERVICE_CATEGORY_KEYS)[number];

export type SupportServiceCategory = {
  key: SupportServiceCategoryKey;
  nameEnglish: string;
  nameSpanish: string;
  descriptionEnglish: string;
  descriptionSpanish: string;
  systemImage: string;
};

type RawServiceCategory = Omit<SupportServiceCategory, "key"> & {
  key: string;
};

const CATEGORY_KEY_SET = new Set<string>(SUPPORT_SERVICE_CATEGORY_KEYS);
const rawCategories =
  serviceOfferTypesCatalog.serviceOfferTypes as RawServiceCategory[];

if (
  rawCategories.length !== SUPPORT_SERVICE_CATEGORY_KEYS.length ||
  new Set(rawCategories.map((category) => category.key)).size !==
    SUPPORT_SERVICE_CATEGORY_KEYS.length ||
  rawCategories.some((category) => !CATEGORY_KEY_SET.has(category.key))
) {
  throw new Error(
    "The service-offer category catalog must contain exactly 100 canonical keys.",
  );
}

export const SUPPORT_SERVICE_CATEGORIES: SupportServiceCategory[] =
  SUPPORT_SERVICE_CATEGORY_KEYS.map((key) => {
    const category = rawCategories.find((candidate) => candidate.key === key);
    if (!category) {
      throw new Error(`Missing canonical service category ${key}.`);
    }
    return { ...category, key };
  });

export const SUPPORT_SERVICE_CATEGORY_GROUPS = [
  {
    id: "clinical_preparation",
    nameEnglish: "Clinical preparation",
    nameSpanish: "Preparación clínica",
    descriptionEnglish:
      "Counseling, phenotype intake, consent, test choice, and test ordering.",
    descriptionSpanish:
      "Asesoramiento, admisión fenotípica, consentimiento, selección y orden del estudio.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(0, 5),
  },
  {
    id: "specimen_and_laboratory",
    nameEnglish: "Specimen and laboratory",
    nameSpanish: "Muestra y laboratorio",
    descriptionEnglish:
      "Collection, logistics, accession, extraction, sequencing, genotyping, and cytogenetics.",
    descriptionSpanish:
      "Toma, logística, recepción, extracción, secuenciación, genotipado y citogenética.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(5, 12),
  },
  {
    id: "specialized_screening",
    nameEnglish: "Specialized screening",
    nameSpanish: "Cribados especializados",
    descriptionEnglish:
      "Purpose-defined prenatal and reproductive carrier screening.",
    descriptionSpanish:
      "Cribados definidos por propósito: prenatal y de portadores reproductivos.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(12, 14),
  },
  {
    id: "bioinformatics_pipeline",
    nameEnglish: "Bioinformatics pipeline",
    nameSpanish: "Flujo bioinformático",
    descriptionEnglish:
      "Quality control, alignment, variant detection, annotation, and prioritization.",
    descriptionSpanish:
      "Control de calidad, alineamiento, detección, anotación y priorización de variantes.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(14, 20),
  },
  {
    id: "interpretation_by_purpose",
    nameEnglish: "Interpretation by purpose",
    nameSpanish: "Interpretación por propósito",
    descriptionEnglish:
      "Clinical interpretation and genomic analyses for a declared purpose.",
    descriptionSpanish:
      "Interpretación clínica y análisis genómicos para un propósito declarado.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(20, 27),
  },
  {
    id: "reporting_and_exchange",
    nameEnglish: "Reporting and exchange",
    nameSpanish: "Informes e intercambio",
    descriptionEnglish:
      "Report generation, report review, and genomic data interoperability.",
    descriptionSpanish:
      "Generación y revisión de informes e interoperabilidad de datos genómicos.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(27, 30),
  },
  {
    id: "complete_genomic_reports",
    nameEnglish: "Complete genomic reports",
    nameSpanish: "Informes genómicos completos",
    descriptionEnglish:
      "End-to-end diagnostic, health, wellness, ancestry, and trait reports.",
    descriptionSpanish:
      "Informes integrales de diagnóstico, salud, bienestar, ascendencia y rasgos.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(30, 44),
  },
  {
    id: "complete_reproductive_reports",
    nameEnglish: "Complete reproductive and prenatal reports",
    nameSpanish: "Informes reproductivos y prenatales completos",
    descriptionEnglish:
      "Fertility, carrier, preimplantation, prenatal, and newborn genomic reports.",
    descriptionSpanish:
      "Informes genómicos de fertilidad, portación, preimplantación, prenatal y neonatal.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(44, 54),
  },
  {
    id: "complete_animal_food_reports",
    nameEnglish: "Animal and food genomic reports",
    nameSpanish: "Informes genómicos animales y alimentarios",
    descriptionEnglish:
      "Complete animal health, identity, breeding, and food-authentication services.",
    descriptionSpanish:
      "Servicios integrales de salud, identidad y reproducción animal y autenticación alimentaria.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(54, 60),
  },
  {
    id: "human_health_and_support",
    nameEnglish: "Health, wellbeing, and social guidance",
    nameSpanish: "Orientación en salud, bienestar y apoyo social",
    descriptionEnglish:
      "Person-to-person professional guidance for health, relationships, care, and wellbeing.",
    descriptionSpanish:
      "Orientación profesional personalizada para salud, vínculos, cuidados y bienestar.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(60, 76),
  },
  {
    id: "legal_advice",
    nameEnglish: "Legal advice",
    nameSpanish: "Asesoramiento jurídico",
    descriptionEnglish:
      "Personal, family, employment, business, and immigration legal guidance.",
    descriptionSpanish:
      "Orientación jurídica personal, familiar, laboral, comercial y migratoria.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(76, 81),
  },
  {
    id: "education_and_career",
    nameEnglish: "Education and career guidance",
    nameSpanish: "Orientación educativa y profesional",
    descriptionEnglish:
      "Tutoring, learning support, language instruction, admissions, and career guidance.",
    descriptionSpanish:
      "Tutoría, apoyo al aprendizaje, idiomas, admisiones y orientación profesional.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(81, 86),
  },
  {
    id: "technology_business_and_finance",
    nameEnglish: "Technology, business, and finance",
    nameSpanish: "Tecnología, negocios y finanzas",
    descriptionEnglish:
      "Digital support, cybersecurity, entrepreneurship, accounting, and tax consulting.",
    descriptionSpanish:
      "Soporte digital, ciberseguridad, emprendimientos, contabilidad e impuestos.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(86, 90),
  },
  {
    id: "health_professional_development",
    nameEnglish: "Professional development in healthcare",
    nameSpanish: "Desarrollo profesional en salud",
    descriptionEnglish:
      "Career, mentoring, leadership, education, research, evidence, quality, and operations guidance for health professionals.",
    descriptionSpanish:
      "Orientación sobre carrera, mentoría, liderazgo, educación, investigación, evidencia, calidad y gestión para profesionales de la salud.",
    keys: SUPPORT_SERVICE_CATEGORY_KEYS.slice(90, 100),
  },
] as const;

export function isSupportServiceCategoryKey(
  value: unknown,
): value is SupportServiceCategoryKey {
  return typeof value === "string" && CATEGORY_KEY_SET.has(value);
}

export function supportServiceCategoryByKey(value: unknown) {
  return isSupportServiceCategoryKey(value)
    ? (SUPPORT_SERVICE_CATEGORIES.find((category) => category.key === value) ??
        null)
    : null;
}

export function supportServiceCategoryName(
  category: SupportServiceCategory,
  language: "en" | "es",
) {
  return language === "es" ? category.nameSpanish : category.nameEnglish;
}

export function supportServiceCategoryDescription(
  category: SupportServiceCategory,
  language: "en" | "es",
) {
  return language === "es"
    ? category.descriptionSpanish
    : category.descriptionEnglish;
}
