export type DiscoverPublisherCategoryKind = "organization" | "individual";

export type DiscoverPublisherCategoryOption<Key extends string = string> = {
  value: Key;
  label: string;
};

export const DISCOVER_ORGANIZATION_CATEGORY_OPTIONS = [
  { value: "org_genetic_testing_laboratories", label: "Genetic Testing Laboratory" },
  { value: "org_genomics_laboratories", label: "Genomics Laboratory" },
  { value: "org_molecular_diagnostics_laboratories", label: "Molecular Diagnostics Laboratory" },
  { value: "org_reproductive_genetics_laboratories", label: "Reproductive Genetics Laboratory" },
  { value: "org_prenatal_genetics_laboratories", label: "Prenatal Genetics Laboratory" },
  { value: "org_nipt_providers", label: "NIPT Provider" },
  { value: "org_oncology_genetics_laboratories", label: "Oncology Genetics Laboratory" },
  { value: "org_pharmacogenomics_providers", label: "Pharmacogenomics Provider" },
  { value: "org_nutrigenomics_providers", label: "Nutrigenomics Provider" },
  { value: "org_bioinformatics_companies", label: "Bioinformatics Company" },
  { value: "org_variant_interpretation_companies", label: "Variant Interpretation Company" },
  { value: "org_genetic_testing_platforms", label: "Genetic Testing Platform" },
  { value: "org_clinical_genetics_centers", label: "Clinical Genetics Center" },
  { value: "org_genetic_counseling_centers", label: "Genetic Counseling Center" },
  { value: "org_fertility_clinics", label: "Fertility Clinic" },
  { value: "org_reproductive_medicine_centers", label: "Reproductive Medicine Center" },
  { value: "org_gamete_banks", label: "Gamete Bank" },
  { value: "org_maternal_medicine_centers", label: "Maternal Medicine Center" },
  { value: "org_fetal_medicine_centers", label: "Fetal Medicine Center" },
  { value: "org_oncology_centers", label: "Oncology Center" },
  { value: "org_neurogenetics_centers", label: "Neurogenetics Center" },
  { value: "org_cardiogenetics_centers", label: "Cardiogenetics Center" },
  { value: "org_pediatric_genetics_centers", label: "Pediatric Genetics Center" },
  { value: "org_metabolic_genetics_centers", label: "Metabolic Genetics Center" },
  { value: "org_rare_disease_centers", label: "Rare Disease Center" },
  { value: "org_rare_disease_foundations", label: "Rare Disease Foundation" },
  { value: "org_patient_organizations", label: "Patient Organization" },
  { value: "org_disease_foundations", label: "Disease Foundation" },
  { value: "org_patient_advocacy_organizations", label: "Patient Advocacy Organization" },
  { value: "org_caregiver_organizations", label: "Caregiver Organization" },
  { value: "org_family_support_organizations", label: "Family Support Organization" },
  { value: "org_rare_disease_networks", label: "Rare Disease Network" },
  { value: "org_patient_communities", label: "Patient Community" },
  { value: "org_disability_organizations", label: "Disability Organization" },
  { value: "org_genetics_education_providers", label: "Genetics Education Provider" },
  { value: "org_genomics_education_providers", label: "Genomics Education Provider" },
  { value: "org_bioinformatics_education_providers", label: "Bioinformatics Education Provider" },
  { value: "org_medical_education_providers", label: "Medical Education Provider" },
  { value: "org_universities", label: "University" },
  { value: "org_teaching_hospitals", label: "Teaching Hospital" },
  { value: "org_scientific_societies", label: "Scientific Society" },
  { value: "org_medical_societies", label: "Medical Society" },
  { value: "org_professional_associations", label: "Professional Association" },
  { value: "org_genomics_research_institutes", label: "Genomics Research Institute" },
  { value: "org_genetics_research_institutes", label: "Genetics Research Institute" },
  { value: "org_rare_disease_research_organizations", label: "Rare Disease Research Organization" },
  { value: "org_university_research_laboratories", label: "University Research Laboratory" },
  { value: "org_clinical_research_organizations", label: "Clinical Research Organization" },
  { value: "org_clinical_trial_sponsors", label: "Clinical Trial Sponsor" },
  { value: "org_clinical_trial_networks", label: "Clinical Trial Network" },
  { value: "org_biobanks", label: "Biobank" },
  { value: "org_genomic_databases", label: "Genomic Database" },
  { value: "org_precision_medicine_companies", label: "Precision Medicine Company" },
  { value: "org_biotechnology_companies", label: "Biotechnology Company" },
  { value: "org_gene_therapy_companies", label: "Gene Therapy Company" },
  { value: "org_cell_therapy_companies", label: "Cell Therapy Company" },
  { value: "org_pharmaceutical_companies", label: "Pharmaceutical Company" },
  { value: "org_sequencing_companies", label: "Sequencing Company" },
  { value: "org_healthcare_networks", label: "Healthcare Network" },
  { value: "org_public_health_organizations", label: "Public Health Organization" },
] as const satisfies readonly DiscoverPublisherCategoryOption[];

export const DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS = [
  { value: "pro_clinical_geneticists", label: "Clinical Geneticist" },
  { value: "pro_medical_geneticists", label: "Medical Geneticist" },
  { value: "pro_molecular_geneticists", label: "Molecular Geneticist" },
  { value: "pro_human_geneticists", label: "Human Geneticist" },
  { value: "pro_cytogeneticists", label: "Cytogeneticist" },
  { value: "pro_genetic_counselors", label: "Genetic Counselor" },
  { value: "pro_genomics_specialists", label: "Genomics Specialist" },
  { value: "pro_bioinformaticians", label: "Bioinformatician" },
  { value: "pro_computational_biologists", label: "Computational Biologist" },
  { value: "pro_molecular_biologists", label: "Molecular Biologist" },
  { value: "pro_cell_biologists", label: "Cell Biologist" },
  { value: "pro_biotechnologists", label: "Biotechnologist" },
  { value: "pro_biochemists", label: "Biochemist" },
  { value: "pro_microbiologists", label: "Microbiologist" },
  { value: "pro_biomedical_scientists", label: "Biomedical Scientist" },
  { value: "pro_laboratory_scientists", label: "Laboratory Scientist" },
  { value: "pro_laboratory_technicians", label: "Laboratory Technician" },
  { value: "pro_genomic_analysts", label: "Genomic Analyst" },
  { value: "pro_variant_scientists", label: "Variant Scientist" },
  { value: "pro_variant_curators", label: "Variant Curator" },
  { value: "pro_data_scientists", label: "Data Scientist" },
  { value: "pro_biostatisticians", label: "Biostatistician" },
  { value: "pro_research_scientists", label: "Research Scientist" },
  { value: "pro_clinical_researchers", label: "Clinical Researcher" },
  { value: "pro_principal_investigators", label: "Principal Investigator" },
  { value: "pro_physicians", label: "Physician" },
  { value: "pro_pediatricians", label: "Pediatrician" },
  { value: "pro_neurologists", label: "Neurologist" },
  { value: "pro_oncologists", label: "Oncologist" },
  { value: "pro_hematologists", label: "Hematologist" },
  { value: "pro_cardiologists", label: "Cardiologist" },
  { value: "pro_endocrinologists", label: "Endocrinologist" },
  { value: "pro_immunologists", label: "Immunologist" },
  { value: "pro_pathologists", label: "Pathologist" },
  { value: "pro_reproductive_specialists", label: "Reproductive Specialist" },
  { value: "pro_fertility_specialists", label: "Fertility Specialist" },
  { value: "pro_embryologists", label: "Embryologist" },
  { value: "pro_obstetricians", label: "Obstetrician" },
  { value: "pro_gynecologists", label: "Gynecologist" },
  { value: "pro_maternal_medicine_specialists", label: "Maternal Medicine Specialist" },
  { value: "pro_fetal_medicine_specialists", label: "Fetal Medicine Specialist" },
  { value: "pro_pediatric_genetics_specialists", label: "Pediatric Genetics Specialist" },
  { value: "pro_metabolic_disease_specialists", label: "Metabolic Disease Specialist" },
  { value: "pro_rare_disease_specialists", label: "Rare Disease Specialist" },
  { value: "pro_pharmacogenomics_specialists", label: "Pharmacogenomics Specialist" },
  { value: "pro_precision_medicine_specialists", label: "Precision Medicine Specialist" },
  { value: "pro_genetic_epidemiologists", label: "Genetic Epidemiologist" },
  { value: "pro_public_health_specialists", label: "Public Health Specialist" },
  { value: "pro_clinical_trial_specialists", label: "Clinical Trial Specialist" },
  { value: "pro_research_coordinators", label: "Research Coordinator" },
  { value: "pro_patient_advocates", label: "Patient Advocate" },
  { value: "pro_patient_navigators", label: "Patient Navigator" },
  { value: "pro_rare_disease_advocates", label: "Rare Disease Advocate" },
  { value: "pro_caregivers", label: "Caregiver" },
  { value: "pro_educators", label: "Educator" },
  { value: "pro_professors", label: "Professor" },
  { value: "pro_science_communicators", label: "Science Communicator" },
  { value: "pro_medical_writers", label: "Medical Writer" },
  { value: "pro_healthcare_executives", label: "Healthcare Executive" },
  { value: "pro_biotechnology_entrepreneurs", label: "Biotechnology Entrepreneur" },
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
