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
    "The service-offer category catalog must contain exactly 30 canonical keys.",
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
