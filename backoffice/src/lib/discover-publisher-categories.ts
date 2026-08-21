export type DiscoverPublisherCategoryKind = "organization" | "individual";

export type DiscoverPublisherCategoryOption<Key extends string = string> = {
  value: Key;
  label: string;
};

export const DISCOVER_ORGANIZATION_CATEGORY_OPTIONS = [
  { value: "org_genetic_testing_laboratories", label: "Genetic Testing Laboratories" },
  { value: "org_genomics_laboratories", label: "Genomics Laboratories" },
  { value: "org_molecular_diagnostics_laboratories", label: "Molecular Diagnostics Laboratories" },
  { value: "org_reproductive_genetics_laboratories", label: "Reproductive Genetics Laboratories" },
  { value: "org_prenatal_genetics_laboratories", label: "Prenatal Genetics Laboratories" },
  { value: "org_nipt_providers", label: "NIPT Providers" },
  { value: "org_oncology_genetics_laboratories", label: "Oncology Genetics Laboratories" },
  { value: "org_pharmacogenomics_providers", label: "Pharmacogenomics Providers" },
  { value: "org_nutrigenomics_providers", label: "Nutrigenomics Providers" },
  { value: "org_bioinformatics_companies", label: "Bioinformatics Companies" },
  { value: "org_variant_interpretation_companies", label: "Variant Interpretation Companies" },
  { value: "org_genetic_testing_platforms", label: "Genetic Testing Platforms" },
  { value: "org_clinical_genetics_centers", label: "Clinical Genetics Centers" },
  { value: "org_genetic_counseling_centers", label: "Genetic Counseling Centers" },
  { value: "org_fertility_clinics", label: "Fertility Clinics" },
  { value: "org_reproductive_medicine_centers", label: "Reproductive Medicine Centers" },
  { value: "org_gamete_banks", label: "Gamete Banks" },
  { value: "org_maternal_medicine_centers", label: "Maternal Medicine Centers" },
  { value: "org_fetal_medicine_centers", label: "Fetal Medicine Centers" },
  { value: "org_oncology_centers", label: "Oncology Centers" },
  { value: "org_neurogenetics_centers", label: "Neurogenetics Centers" },
  { value: "org_cardiogenetics_centers", label: "Cardiogenetics Centers" },
  { value: "org_pediatric_genetics_centers", label: "Pediatric Genetics Centers" },
  { value: "org_metabolic_genetics_centers", label: "Metabolic Genetics Centers" },
  { value: "org_rare_disease_centers", label: "Rare Disease Centers" },
  { value: "org_rare_disease_foundations", label: "Rare Disease Foundations" },
  { value: "org_patient_organizations", label: "Patient Organizations" },
  { value: "org_disease_foundations", label: "Disease Foundations" },
  { value: "org_patient_advocacy_organizations", label: "Patient Advocacy Organizations" },
  { value: "org_caregiver_organizations", label: "Caregiver Organizations" },
  { value: "org_family_support_organizations", label: "Family Support Organizations" },
  { value: "org_rare_disease_networks", label: "Rare Disease Networks" },
  { value: "org_patient_communities", label: "Patient Communities" },
  { value: "org_disability_organizations", label: "Disability Organizations" },
  { value: "org_genetics_education_providers", label: "Genetics Education Providers" },
  { value: "org_genomics_education_providers", label: "Genomics Education Providers" },
  { value: "org_bioinformatics_education_providers", label: "Bioinformatics Education Providers" },
  { value: "org_medical_education_providers", label: "Medical Education Providers" },
  { value: "org_universities", label: "Universities" },
  { value: "org_teaching_hospitals", label: "Teaching Hospitals" },
  { value: "org_scientific_societies", label: "Scientific Societies" },
  { value: "org_medical_societies", label: "Medical Societies" },
  { value: "org_professional_associations", label: "Professional Associations" },
  { value: "org_genomics_research_institutes", label: "Genomics Research Institutes" },
  { value: "org_genetics_research_institutes", label: "Genetics Research Institutes" },
  { value: "org_rare_disease_research_organizations", label: "Rare Disease Research Organizations" },
  { value: "org_university_research_laboratories", label: "University Research Laboratories" },
  { value: "org_clinical_research_organizations", label: "Clinical Research Organizations" },
  { value: "org_clinical_trial_sponsors", label: "Clinical Trial Sponsors" },
  { value: "org_clinical_trial_networks", label: "Clinical Trial Networks" },
  { value: "org_biobanks", label: "Biobanks" },
  { value: "org_genomic_databases", label: "Genomic Databases" },
  { value: "org_precision_medicine_companies", label: "Precision Medicine Companies" },
  { value: "org_biotechnology_companies", label: "Biotechnology Companies" },
  { value: "org_gene_therapy_companies", label: "Gene Therapy Companies" },
  { value: "org_cell_therapy_companies", label: "Cell Therapy Companies" },
  { value: "org_pharmaceutical_companies", label: "Pharmaceutical Companies" },
  { value: "org_sequencing_companies", label: "Sequencing Companies" },
  { value: "org_healthcare_networks", label: "Healthcare Networks" },
  { value: "org_public_health_organizations", label: "Public Health Organizations" },
] as const satisfies readonly DiscoverPublisherCategoryOption[];

export const DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS = [
  { value: "pro_clinical_geneticists", label: "Clinical Geneticists" },
  { value: "pro_medical_geneticists", label: "Medical Geneticists" },
  { value: "pro_molecular_geneticists", label: "Molecular Geneticists" },
  { value: "pro_human_geneticists", label: "Human Geneticists" },
  { value: "pro_cytogeneticists", label: "Cytogeneticists" },
  { value: "pro_genetic_counselors", label: "Genetic Counselors" },
  { value: "pro_genomics_specialists", label: "Genomics Specialists" },
  { value: "pro_bioinformaticians", label: "Bioinformaticians" },
  { value: "pro_computational_biologists", label: "Computational Biologists" },
  { value: "pro_molecular_biologists", label: "Molecular Biologists" },
  { value: "pro_cell_biologists", label: "Cell Biologists" },
  { value: "pro_biotechnologists", label: "Biotechnologists" },
  { value: "pro_biochemists", label: "Biochemists" },
  { value: "pro_microbiologists", label: "Microbiologists" },
  { value: "pro_biomedical_scientists", label: "Biomedical Scientists" },
  { value: "pro_laboratory_scientists", label: "Laboratory Scientists" },
  { value: "pro_laboratory_technicians", label: "Laboratory Technicians" },
  { value: "pro_genomic_analysts", label: "Genomic Analysts" },
  { value: "pro_variant_scientists", label: "Variant Scientists" },
  { value: "pro_variant_curators", label: "Variant Curators" },
  { value: "pro_data_scientists", label: "Data Scientists" },
  { value: "pro_biostatisticians", label: "Biostatisticians" },
  { value: "pro_research_scientists", label: "Research Scientists" },
  { value: "pro_clinical_researchers", label: "Clinical Researchers" },
  { value: "pro_principal_investigators", label: "Principal Investigators" },
  { value: "pro_physicians", label: "Physicians" },
  { value: "pro_pediatricians", label: "Pediatricians" },
  { value: "pro_neurologists", label: "Neurologists" },
  { value: "pro_oncologists", label: "Oncologists" },
  { value: "pro_hematologists", label: "Hematologists" },
  { value: "pro_cardiologists", label: "Cardiologists" },
  { value: "pro_endocrinologists", label: "Endocrinologists" },
  { value: "pro_immunologists", label: "Immunologists" },
  { value: "pro_pathologists", label: "Pathologists" },
  { value: "pro_reproductive_specialists", label: "Reproductive Specialists" },
  { value: "pro_fertility_specialists", label: "Fertility Specialists" },
  { value: "pro_embryologists", label: "Embryologists" },
  { value: "pro_obstetricians", label: "Obstetricians" },
  { value: "pro_gynecologists", label: "Gynecologists" },
  { value: "pro_maternal_medicine_specialists", label: "Maternal Medicine Specialists" },
  { value: "pro_fetal_medicine_specialists", label: "Fetal Medicine Specialists" },
  { value: "pro_pediatric_genetics_specialists", label: "Pediatric Genetics Specialists" },
  { value: "pro_metabolic_disease_specialists", label: "Metabolic Disease Specialists" },
  { value: "pro_rare_disease_specialists", label: "Rare Disease Specialists" },
  { value: "pro_pharmacogenomics_specialists", label: "Pharmacogenomics Specialists" },
  { value: "pro_precision_medicine_specialists", label: "Precision Medicine Specialists" },
  { value: "pro_genetic_epidemiologists", label: "Genetic Epidemiologists" },
  { value: "pro_public_health_specialists", label: "Public Health Specialists" },
  { value: "pro_clinical_trial_specialists", label: "Clinical Trial Specialists" },
  { value: "pro_research_coordinators", label: "Research Coordinators" },
  { value: "pro_patient_advocates", label: "Patient Advocates" },
  { value: "pro_patient_navigators", label: "Patient Navigators" },
  { value: "pro_rare_disease_advocates", label: "Rare Disease Advocates" },
  { value: "pro_caregivers", label: "Caregivers" },
  { value: "pro_educators", label: "Educators" },
  { value: "pro_professors", label: "Professors" },
  { value: "pro_science_communicators", label: "Science Communicators" },
  { value: "pro_medical_writers", label: "Medical Writers" },
  { value: "pro_healthcare_executives", label: "Healthcare Executives" },
  { value: "pro_biotechnology_entrepreneurs", label: "Biotechnology Entrepreneurs" },
] as const satisfies readonly DiscoverPublisherCategoryOption[];

export type DiscoverOrganizationCategoryKey =
  (typeof DISCOVER_ORGANIZATION_CATEGORY_OPTIONS)[number]["value"];
export type DiscoverIndividualCategoryKey =
  (typeof DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS)[number]["value"];

const ORGANIZATION_LEGACY_ALIASES = {
  foundation: "org_rare_disease_foundations",
  hospital: "org_teaching_hospitals",
  university: "org_universities",
  laboratory: "org_genetic_testing_laboratories",
  research_institute: "org_genomics_research_institutes",
  patient_advocacy_group: "org_patient_advocacy_organizations",
  patient_advocacy: "org_patient_advocacy_organizations",
  public_health_agency: "org_public_health_organizations",
  conference_organizer: "org_scientific_societies",
  company: "org_biotechnology_companies",
} as const satisfies Partial<Record<string, DiscoverOrganizationCategoryKey>>;

const INDIVIDUAL_LEGACY_ALIASES = {
  researcher: "pro_research_scientists",
  clinician: "pro_physicians",
  genetic_counselor: "pro_genetic_counselors",
  patient_advocate: "pro_patient_advocates",
  bioinformatician: "pro_bioinformaticians",
  educator: "pro_educators",
  journalist: "pro_science_communicators",
  community_leader: "pro_patient_navigators",
} as const satisfies Partial<Record<string, DiscoverIndividualCategoryKey>>;

export class DiscoverPublisherCategoryProvider<Key extends string> {
  readonly optionCount: number;

  private readonly optionsByKey: ReadonlyMap<Key, DiscoverPublisherCategoryOption<Key>>;
  private readonly aliases: ReadonlyMap<string, Key>;

  constructor(
    readonly kind: DiscoverPublisherCategoryKind,
    readonly options: readonly DiscoverPublisherCategoryOption<Key>[],
    aliases: Partial<Record<string, Key>> = {},
  ) {
    this.optionCount = options.length;
    this.optionsByKey = new Map(options.map((option) => [option.value, option]));
    this.aliases = new Map(
      Object.entries(aliases).flatMap(([alias, key]) =>
        key ? [[this.normalize(alias), key as Key]] : [],
      ),
    );
  }

  parse(value: string | null | undefined): Key[] {
    const seen = new Set<Key>();
    return String(value ?? "")
      .split(",")
      .map((token) => this.canonicalKey(token))
      .filter((key): key is Key => {
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  serialize(keys: readonly string[]): string {
    return this.parse(keys.join(",")).join(",");
  }

  normalizeCsv(value: string | null | undefined): string {
    return this.serialize(String(value ?? "").split(","));
  }

  invalidKeys(value: string | null | undefined): string[] {
    return String(value ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => !this.canonicalKey(token));
  }

  labelFor(key: string): string {
    const canonical = this.canonicalKey(key);
    return canonical ? (this.optionsByKey.get(canonical)?.label ?? canonical) : key;
  }

  labelsForCsv(value: string | null | undefined): string[] {
    return this.parse(value).map((key) => this.labelFor(key));
  }

  formatCsv(value: string | null | undefined, emptyLabel = "Unspecified"): string {
    const labels = this.labelsForCsv(value);
    return labels.length ? labels.join(", ") : emptyLabel;
  }

  hasKey(value: string | null | undefined, key: string): boolean {
    const canonical = this.canonicalKey(key);
    return Boolean(canonical && this.parse(value).includes(canonical));
  }

  private canonicalKey(value: string): Key | null {
    const normalized = this.normalize(value);
    if (!normalized) {
      return null;
    }

    if (this.optionsByKey.has(normalized as Key)) {
      return normalized as Key;
    }

    return this.aliases.get(normalized) ?? null;
  }

  private normalize(value: string) {
    return value.trim().toLowerCase();
  }
}

export const discoverOrganizationCategoryProvider =
  new DiscoverPublisherCategoryProvider<DiscoverOrganizationCategoryKey>(
    "organization",
    DISCOVER_ORGANIZATION_CATEGORY_OPTIONS,
    ORGANIZATION_LEGACY_ALIASES,
  );

export const discoverIndividualCategoryProvider =
  new DiscoverPublisherCategoryProvider<DiscoverIndividualCategoryKey>(
    "individual",
    DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS,
    INDIVIDUAL_LEGACY_ALIASES,
  );

export function discoverPublisherCategoryProviderForKind(
  kind: DiscoverPublisherCategoryKind,
) {
  return kind === "individual"
    ? discoverIndividualCategoryProvider
    : discoverOrganizationCategoryProvider;
}
