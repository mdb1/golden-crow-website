export type WizardLocale = 'en' | 'es';
export type WizardPublisherKind = 'organization' | 'individual';

export type WizardCategoryOption = {
  value: string;
  label: string;
  flag?: string;
};

export type WizardSocialOption = {
  value: string;
  label: string;
  placeholder: string;
  assetName: string;
};

export type WizardCountryGroup = {
  key: 'recommended' | 'all';
  label: string;
  options: WizardCategoryOption[];
};

export const WIZARD_ORGANIZATION_CATEGORY_OPTIONS = [
  { value: 'org_genetic_testing_laboratories', label: 'Genetic Testing Laboratory' },
  { value: 'org_genomics_laboratories', label: 'Genomics Laboratory' },
  { value: 'org_molecular_diagnostics_laboratories', label: 'Molecular Diagnostics Laboratory' },
  { value: 'org_reproductive_genetics_laboratories', label: 'Reproductive Genetics Laboratory' },
  { value: 'org_prenatal_genetics_laboratories', label: 'Prenatal Genetics Laboratory' },
  { value: 'org_nipt_providers', label: 'NIPT Provider' },
  { value: 'org_oncology_genetics_laboratories', label: 'Oncology Genetics Laboratory' },
  { value: 'org_pharmacogenomics_providers', label: 'Pharmacogenomics Provider' },
  { value: 'org_nutrigenomics_providers', label: 'Nutrigenomics Provider' },
  { value: 'org_bioinformatics_companies', label: 'Bioinformatics Company' },
  { value: 'org_variant_interpretation_companies', label: 'Variant Interpretation Company' },
  { value: 'org_genetic_testing_platforms', label: 'Genetic Testing Platform' },
  { value: 'org_clinical_genetics_centers', label: 'Clinical Genetics Center' },
  { value: 'org_genetic_counseling_centers', label: 'Genetic Counseling Center' },
  { value: 'org_fertility_clinics', label: 'Fertility Clinic' },
  { value: 'org_reproductive_medicine_centers', label: 'Reproductive Medicine Center' },
  { value: 'org_gamete_banks', label: 'Gamete Bank' },
  { value: 'org_maternal_medicine_centers', label: 'Maternal Medicine Center' },
  { value: 'org_fetal_medicine_centers', label: 'Fetal Medicine Center' },
  { value: 'org_oncology_centers', label: 'Oncology Center' },
  { value: 'org_neurogenetics_centers', label: 'Neurogenetics Center' },
  { value: 'org_cardiogenetics_centers', label: 'Cardiogenetics Center' },
  { value: 'org_pediatric_genetics_centers', label: 'Pediatric Genetics Center' },
  { value: 'org_metabolic_genetics_centers', label: 'Metabolic Genetics Center' },
  { value: 'org_rare_disease_centers', label: 'Rare Disease Center' },
  { value: 'org_rare_disease_foundations', label: 'Rare Disease Foundation' },
  { value: 'org_patient_organizations', label: 'Patient Organization' },
  { value: 'org_disease_foundations', label: 'Disease Foundation' },
  { value: 'org_patient_advocacy_organizations', label: 'Patient Advocacy Organization' },
  { value: 'org_caregiver_organizations', label: 'Caregiver Organization' },
  { value: 'org_family_support_organizations', label: 'Family Support Organization' },
  { value: 'org_rare_disease_networks', label: 'Rare Disease Network' },
  { value: 'org_patient_communities', label: 'Patient Community' },
  { value: 'org_disability_organizations', label: 'Disability Organization' },
  { value: 'org_genetics_education_providers', label: 'Genetics Education Provider' },
  { value: 'org_genomics_education_providers', label: 'Genomics Education Provider' },
  { value: 'org_bioinformatics_education_providers', label: 'Bioinformatics Education Provider' },
  { value: 'org_medical_education_providers', label: 'Medical Education Provider' },
  { value: 'org_universities', label: 'University' },
  { value: 'org_teaching_hospitals', label: 'Teaching Hospital' },
  { value: 'org_scientific_societies', label: 'Scientific Society' },
  { value: 'org_medical_societies', label: 'Medical Society' },
  { value: 'org_professional_associations', label: 'Professional Association' },
  { value: 'org_genomics_research_institutes', label: 'Genomics Research Institute' },
  { value: 'org_genetics_research_institutes', label: 'Genetics Research Institute' },
  { value: 'org_rare_disease_research_organizations', label: 'Rare Disease Research Organization' },
  { value: 'org_university_research_laboratories', label: 'University Research Laboratory' },
  { value: 'org_clinical_research_organizations', label: 'Clinical Research Organization' },
  { value: 'org_clinical_trial_sponsors', label: 'Clinical Trial Sponsor' },
  { value: 'org_clinical_trial_networks', label: 'Clinical Trial Network' },
  { value: 'org_biobanks', label: 'Biobank' },
  { value: 'org_genomic_databases', label: 'Genomic Database' },
  { value: 'org_precision_medicine_companies', label: 'Precision Medicine Company' },
  { value: 'org_biotechnology_companies', label: 'Biotechnology Company' },
  { value: 'org_gene_therapy_companies', label: 'Gene Therapy Company' },
  { value: 'org_cell_therapy_companies', label: 'Cell Therapy Company' },
  { value: 'org_pharmaceutical_companies', label: 'Pharmaceutical Company' },
  { value: 'org_sequencing_companies', label: 'Sequencing Company' },
  { value: 'org_healthcare_networks', label: 'Healthcare Network' },
  { value: 'org_public_health_organizations', label: 'Public Health Organization' },
] as const satisfies readonly WizardCategoryOption[];

export const WIZARD_INDIVIDUAL_CATEGORY_OPTIONS = [
  { value: 'pro_clinical_geneticists', label: 'Clinical Geneticist' },
  { value: 'pro_medical_geneticists', label: 'Medical Geneticist' },
  { value: 'pro_molecular_geneticists', label: 'Molecular Geneticist' },
  { value: 'pro_human_geneticists', label: 'Human Geneticist' },
  { value: 'pro_cytogeneticists', label: 'Cytogeneticist' },
  { value: 'pro_genetic_counselors', label: 'Genetic Counselor' },
  { value: 'pro_genomics_specialists', label: 'Genomics Specialist' },
  { value: 'pro_bioinformaticians', label: 'Bioinformatician' },
  { value: 'pro_computational_biologists', label: 'Computational Biologist' },
  { value: 'pro_molecular_biologists', label: 'Molecular Biologist' },
  { value: 'pro_cell_biologists', label: 'Cell Biologist' },
  { value: 'pro_biotechnologists', label: 'Biotechnologist' },
  { value: 'pro_biochemists', label: 'Biochemist' },
  { value: 'pro_microbiologists', label: 'Microbiologist' },
  { value: 'pro_biomedical_scientists', label: 'Biomedical Scientist' },
  { value: 'pro_laboratory_scientists', label: 'Laboratory Scientist' },
  { value: 'pro_laboratory_technicians', label: 'Laboratory Technician' },
  { value: 'pro_genomic_analysts', label: 'Genomic Analyst' },
  { value: 'pro_variant_scientists', label: 'Variant Scientist' },
  { value: 'pro_variant_curators', label: 'Variant Curator' },
  { value: 'pro_data_scientists', label: 'Data Scientist' },
  { value: 'pro_biostatisticians', label: 'Biostatistician' },
  { value: 'pro_research_scientists', label: 'Research Scientist' },
  { value: 'pro_clinical_researchers', label: 'Clinical Researcher' },
  { value: 'pro_principal_investigators', label: 'Principal Investigator' },
  { value: 'pro_physicians', label: 'Physician' },
  { value: 'pro_pediatricians', label: 'Pediatrician' },
  { value: 'pro_neurologists', label: 'Neurologist' },
  { value: 'pro_oncologists', label: 'Oncologist' },
  { value: 'pro_hematologists', label: 'Hematologist' },
  { value: 'pro_cardiologists', label: 'Cardiologist' },
  { value: 'pro_endocrinologists', label: 'Endocrinologist' },
  { value: 'pro_immunologists', label: 'Immunologist' },
  { value: 'pro_pathologists', label: 'Pathologist' },
  { value: 'pro_reproductive_specialists', label: 'Reproductive Specialist' },
  { value: 'pro_fertility_specialists', label: 'Fertility Specialist' },
  { value: 'pro_embryologists', label: 'Embryologist' },
  { value: 'pro_obstetricians', label: 'Obstetrician' },
  { value: 'pro_gynecologists', label: 'Gynecologist' },
  { value: 'pro_maternal_medicine_specialists', label: 'Maternal Medicine Specialist' },
  { value: 'pro_fetal_medicine_specialists', label: 'Fetal Medicine Specialist' },
  { value: 'pro_pediatric_genetics_specialists', label: 'Pediatric Genetics Specialist' },
  { value: 'pro_metabolic_disease_specialists', label: 'Metabolic Disease Specialist' },
  { value: 'pro_rare_disease_specialists', label: 'Rare Disease Specialist' },
  { value: 'pro_pharmacogenomics_specialists', label: 'Pharmacogenomics Specialist' },
  { value: 'pro_precision_medicine_specialists', label: 'Precision Medicine Specialist' },
  { value: 'pro_genetic_epidemiologists', label: 'Genetic Epidemiologist' },
  { value: 'pro_public_health_specialists', label: 'Public Health Specialist' },
  { value: 'pro_clinical_trial_specialists', label: 'Clinical Trial Specialist' },
  { value: 'pro_research_coordinators', label: 'Research Coordinator' },
  { value: 'pro_patient_advocates', label: 'Patient Advocate' },
  { value: 'pro_patient_navigators', label: 'Patient Navigator' },
  { value: 'pro_rare_disease_advocates', label: 'Rare Disease Advocate' },
  { value: 'pro_caregivers', label: 'Caregiver' },
  { value: 'pro_educators', label: 'Educator' },
  { value: 'pro_professors', label: 'Professor' },
  { value: 'pro_science_communicators', label: 'Science Communicator' },
  { value: 'pro_medical_writers', label: 'Medical Writer' },
  { value: 'pro_healthcare_executives', label: 'Healthcare Executive' },
  { value: 'pro_biotechnology_entrepreneurs', label: 'Biotechnology Entrepreneur' },
  { value: 'pro_entrepreneurs', label: 'Entrepreneur' },
  { value: 'pro_startup_founders', label: 'Startup Founder' },
  { value: 'pro_small_business_owners', label: 'Small Business Owner' },
  { value: 'pro_software_engineers', label: 'Software Engineer' },
  { value: 'pro_app_developers', label: 'App Developer' },
  { value: 'pro_web_developers', label: 'Web Developer' },
  { value: 'pro_product_managers', label: 'Product Manager' },
  { value: 'pro_ux_ui_designers', label: 'UX/UI Designer' },
  { value: 'pro_data_engineers', label: 'Data Engineer' },
  { value: 'pro_ai_engineers', label: 'AI Engineer' },
  { value: 'pro_machine_learning_engineers', label: 'Machine Learning Engineer' },
  { value: 'pro_ai_researchers', label: 'AI Researcher' },
  { value: 'pro_content_creators', label: 'Content Creator' },
  { value: 'pro_microinfluencers', label: 'Microinfluencer' },
  { value: 'pro_influencers', label: 'Influencer' },
  { value: 'pro_social_media_managers', label: 'Social Media Manager' },
  { value: 'pro_community_managers', label: 'Community Manager' },
  { value: 'pro_marketing_specialists', label: 'Marketing Specialist' },
  { value: 'pro_growth_marketers', label: 'Growth Marketer' },
  { value: 'pro_brand_strategists', label: 'Brand Strategist' },
  { value: 'pro_communications_managers', label: 'Communications Manager' },
  { value: 'pro_journalists', label: 'Journalist' },
  { value: 'pro_editors', label: 'Editor' },
  { value: 'pro_podcast_hosts', label: 'Podcast Host' },
  { value: 'pro_video_producers', label: 'Video Producer' },
  { value: 'pro_public_speakers', label: 'Public Speaker' },
  { value: 'pro_leaders', label: 'Leader' },
  { value: 'pro_project_managers', label: 'Project Manager' },
  { value: 'pro_consultants', label: 'Consultant' },
  { value: 'pro_other', label: 'Other' },
] as const satisfies readonly WizardCategoryOption[];

const CATEGORY_LABELS_ES: Record<string, string> = {
  'Genetic Testing Laboratory': 'Laboratorio de pruebas genéticas',
  'Genomics Laboratory': 'Laboratorio de genómica',
  'Molecular Diagnostics Laboratory': 'Laboratorio de diagnóstico molecular',
  'Reproductive Genetics Laboratory': 'Laboratorio de genética reproductiva',
  'Prenatal Genetics Laboratory': 'Laboratorio de genética prenatal',
  'NIPT Provider': 'Proveedor de NIPT',
  'Oncology Genetics Laboratory': 'Laboratorio de genética oncológica',
  'Pharmacogenomics Provider': 'Proveedor de farmacogenómica',
  'Nutrigenomics Provider': 'Proveedor de nutrigenómica',
  'Bioinformatics Company': 'Empresa de bioinformática',
  'Variant Interpretation Company': 'Empresa de interpretación de variantes',
  'Genetic Testing Platform': 'Plataforma de pruebas genéticas',
  'Clinical Genetics Center': 'Centro de genética clínica',
  'Genetic Counseling Center': 'Centro de asesoramiento genético',
  'Fertility Clinic': 'Clínica de fertilidad',
  'Reproductive Medicine Center': 'Centro de medicina reproductiva',
  'Gamete Bank': 'Banco de gametos',
  'Maternal Medicine Center': 'Centro de medicina materna',
  'Fetal Medicine Center': 'Centro de medicina fetal',
  'Oncology Center': 'Centro de oncología',
  'Neurogenetics Center': 'Centro de neurogenética',
  'Cardiogenetics Center': 'Centro de cardiogenética',
  'Pediatric Genetics Center': 'Centro de genética pediátrica',
  'Metabolic Genetics Center': 'Centro de genética metabólica',
  'Rare Disease Center': 'Centro de enfermedades poco frecuentes',
  'Rare Disease Foundation': 'Fundación de enfermedades poco frecuentes',
  'Patient Organization': 'Organización de pacientes',
  'Disease Foundation': 'Fundación de enfermedades',
  'Patient Advocacy Organization': 'Organización de apoyo a pacientes',
  'Caregiver Organization': 'Organización de cuidadores',
  'Family Support Organization': 'Organización de apoyo familiar',
  'Rare Disease Network': 'Red de enfermedades poco frecuentes',
  'Patient Community': 'Comunidad de pacientes',
  'Disability Organization': 'Organización de discapacidad',
  'Genetics Education Provider': 'Proveedor de educación en genética',
  'Genomics Education Provider': 'Proveedor de educación en genómica',
  'Bioinformatics Education Provider': 'Proveedor de educación en bioinformática',
  'Medical Education Provider': 'Proveedor de educación médica',
  University: 'Universidad',
  'Teaching Hospital': 'Hospital universitario',
  'Scientific Society': 'Sociedad científica',
  'Medical Society': 'Sociedad médica',
  'Professional Association': 'Asociación profesional',
  'Genomics Research Institute': 'Instituto de investigación genómica',
  'Genetics Research Institute': 'Instituto de investigación genética',
  'Rare Disease Research Organization': 'Organización de investigación en enfermedades poco frecuentes',
  'University Research Laboratory': 'Laboratorio universitario de investigación',
  'Clinical Research Organization': 'Organización de investigación clínica',
  'Clinical Trial Sponsor': 'Patrocinador de ensayo clínico',
  'Clinical Trial Network': 'Red de ensayos clínicos',
  Biobank: 'Biobanco',
  'Genomic Database': 'Base de datos genómica',
  'Precision Medicine Company': 'Empresa de medicina de precisión',
  'Biotechnology Company': 'Empresa de biotecnología',
  'Gene Therapy Company': 'Empresa de terapia génica',
  'Cell Therapy Company': 'Empresa de terapia celular',
  'Pharmaceutical Company': 'Empresa farmacéutica',
  'Sequencing Company': 'Empresa de secuenciación',
  'Healthcare Network': 'Red de atención médica',
  'Public Health Organization': 'Organización de salud pública',
  'Clinical Geneticist': 'Genetista clínico',
  'Medical Geneticist': 'Genetista médico',
  'Molecular Geneticist': 'Genetista molecular',
  'Human Geneticist': 'Genetista humano',
  Cytogeneticist: 'Citogenetista',
  'Genetic Counselor': 'Asesor genético',
  'Genomics Specialist': 'Especialista en genómica',
  Bioinformatician: 'Bioinformático',
  'Computational Biologist': 'Biólogo computacional',
  'Molecular Biologist': 'Biólogo molecular',
  'Cell Biologist': 'Biólogo celular',
  Biotechnologist: 'Biotecnólogo',
  Biochemist: 'Bioquímico',
  Microbiologist: 'Microbiólogo',
  'Biomedical Scientist': 'Científico biomédico',
  'Laboratory Scientist': 'Científico de laboratorio',
  'Laboratory Technician': 'Técnico de laboratorio',
  'Genomic Analyst': 'Analista genómico',
  'Variant Scientist': 'Científico de variantes',
  'Variant Curator': 'Curador de variantes',
  'Data Scientist': 'Científico de datos',
  Biostatistician: 'Bioestadístico',
  'Research Scientist': 'Investigador científico',
  'Clinical Researcher': 'Investigador clínico',
  'Principal Investigator': 'Investigador principal',
  Physician: 'Médico',
  Pediatrician: 'Pediatra',
  Neurologist: 'Neurólogo',
  Oncologist: 'Oncólogo',
  Hematologist: 'Hematólogo',
  Cardiologist: 'Cardiólogo',
  Endocrinologist: 'Endocrinólogo',
  Immunologist: 'Inmunólogo',
  Pathologist: 'Patólogo',
  'Reproductive Specialist': 'Especialista en reproducción',
  'Fertility Specialist': 'Especialista en fertilidad',
  Embryologist: 'Embriólogo',
  Obstetrician: 'Obstetra',
  Gynecologist: 'Ginecólogo',
  'Maternal Medicine Specialist': 'Especialista en medicina materna',
  'Fetal Medicine Specialist': 'Especialista en medicina fetal',
  'Pediatric Genetics Specialist': 'Especialista en genética pediátrica',
  'Metabolic Disease Specialist': 'Especialista en enfermedades metabólicas',
  'Rare Disease Specialist': 'Especialista en enfermedades poco frecuentes',
  'Pharmacogenomics Specialist': 'Especialista en farmacogenómica',
  'Precision Medicine Specialist': 'Especialista en medicina de precisión',
  'Genetic Epidemiologist': 'Epidemiólogo genético',
  'Public Health Specialist': 'Especialista en salud pública',
  'Clinical Trial Specialist': 'Especialista en ensayos clínicos',
  'Research Coordinator': 'Coordinador de investigación',
  'Patient Advocate': 'Referente de pacientes',
  'Patient Navigator': 'Navegador de pacientes',
  'Rare Disease Advocate': 'Referente de enfermedades poco frecuentes',
  Caregiver: 'Cuidador',
  Educator: 'Educador',
  Professor: 'Profesor',
  'Science Communicator': 'Comunicador cientifico',
  'Medical Writer': 'Redactor medico',
  'Healthcare Executive': 'Ejecutivo de salud',
  'Biotechnology Entrepreneur': 'Emprendedor biotecnológico',
  Entrepreneur: 'Emprendedor',
  'Startup Founder': 'Fundador de startup',
  'Small Business Owner': 'Dueño de pequeña empresa',
  'Software Engineer': 'Ingeniero de software',
  'App Developer': 'Desarrollador de apps',
  'Web Developer': 'Desarrollador web',
  'Product Manager': 'Product manager',
  'UX/UI Designer': 'Diseñador UX/UI',
  'Data Engineer': 'Ingeniero de datos',
  'AI Engineer': 'Ingeniero de IA',
  'Machine Learning Engineer': 'Ingeniero de aprendizaje automático',
  'AI Researcher': 'Investigador en IA',
  'Content Creator': 'Creador de contenido',
  Microinfluencer: 'Microinfluenciador',
  Influencer: 'Influenciador',
  'Social Media Manager': 'Responsable de redes sociales',
  'Community Manager': 'Gestor de comunidad',
  'Marketing Specialist': 'Especialista en marketing',
  'Growth Marketer': 'Especialista en growth marketing',
  'Brand Strategist': 'Estratega de marca',
  'Communications Manager': 'Responsable de comunicaciones',
  Journalist: 'Periodista',
  Editor: 'Editor de contenido',
  'Podcast Host': 'Conductor de podcast',
  'Video Producer': 'Productor de video',
  'Public Speaker': 'Orador',
  Leader: 'Líder',
  'Project Manager': 'Gerente de proyectos',
  Consultant: 'Consultor',
  Other: 'Otro',
};

const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR',
  'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE',
  'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ',
  'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD',
  'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR',
  'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
  'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI',
  'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
  'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS',
  'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
  'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK',
  'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME',
  'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ',
  'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU',
  'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
  'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS',
  'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI',
  'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV',
  'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK',
  'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA',
  'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const;

const RECOMMENDED_COUNTRY_CODES_BY_LOCALE = {
  en: ['GLOBAL', 'US', 'GB', 'CA', 'AU', 'NZ'],
  es: ['GLOBAL', 'AR', 'ES', 'MX', 'CO', 'CL', 'PE', 'UY'],
} as const satisfies Record<WizardLocale, readonly string[]>;

export const WIZARD_SOCIAL_OPTIONS = [
  {
    value: 'facebook',
    label: 'Facebook profile',
    placeholder: 'https://facebook.com/...',
    assetName: 'social_facebook',
  },
  {
    value: 'twitter',
    label: 'X / Twitter profile',
    placeholder: 'https://x.com/...',
    assetName: 'social_twitter',
  },
  {
    value: 'instagram',
    label: 'Instagram profile',
    placeholder: 'https://instagram.com/...',
    assetName: 'social_instagram',
  },
  {
    value: 'tiktok',
    label: 'TikTok profile',
    placeholder: 'https://tiktok.com/@...',
    assetName: 'social_tiktok',
  },
  {
    value: 'youtube',
    label: 'YouTube channel',
    placeholder: 'https://youtube.com/@...',
    assetName: 'social_youtube',
  },
  {
    value: 'linkedin',
    label: 'LinkedIn profile',
    placeholder: 'https://linkedin.com/in/...',
    assetName: 'social_linkedin',
  },
  {
    value: 'github',
    label: 'GitHub profile',
    placeholder: 'https://github.com/...',
    assetName: 'social_github',
  },
  {
    value: 'gitlab',
    label: 'GitLab profile',
    placeholder: 'https://gitlab.com/...',
    assetName: 'social_gitlab',
  },
  {
    value: 'stack_overflow',
    label: 'Stack Overflow profile',
    placeholder: 'https://stackoverflow.com/users/...',
    assetName: 'social_stack_overflow',
  },
  {
    value: 'hugging_face',
    label: 'Hugging Face profile',
    placeholder: 'https://huggingface.co/...',
    assetName: 'social_hugging_face',
  },
  {
    value: 'kaggle',
    label: 'Kaggle profile',
    placeholder: 'https://kaggle.com/...',
    assetName: 'social_kaggle',
  },
  {
    value: 'researchgate',
    label: 'ResearchGate profile',
    placeholder: 'https://researchgate.net/profile/...',
    assetName: 'social_researchgate',
  },
  {
    value: 'orcid',
    label: 'ORCID',
    placeholder: 'https://orcid.org/...',
    assetName: 'social_orcid',
  },
  {
    value: 'google_scholar',
    label: 'Google Scholar profile',
    placeholder: 'https://scholar.google.com/...',
    assetName: 'social_google_scholar',
  },
  {
    value: 'pubmed',
    label: 'PubMed profile',
    placeholder: 'https://pubmed.ncbi.nlm.nih.gov/...',
    assetName: 'social_pubmed',
  },
  {
    value: 'scopus',
    label: 'Scopus profile',
    placeholder: 'https://scopus.com/...',
    assetName: 'social_scopus',
  },
  {
    value: 'web_of_science',
    label: 'Web of Science profile',
    placeholder: 'https://webofscience.com/...',
    assetName: 'social_web_of_science',
  },
  {
    value: 'biostars',
    label: 'BioStars profile',
    placeholder: 'https://biostars.org/u/...',
    assetName: 'social_biostars',
  },
  {
    value: 'protocols_io',
    label: 'protocols.io profile',
    placeholder: 'https://protocols.io/...',
    assetName: 'social_protocols_io',
  },
  {
    value: 'osf',
    label: 'OSF profile',
    placeholder: 'https://osf.io/...',
    assetName: 'social_osf',
  },
  {
    value: 'zenodo',
    label: 'Zenodo profile',
    placeholder: 'https://zenodo.org/...',
    assetName: 'social_zenodo',
  },
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    placeholder: 'https://wa.me/...',
    assetName: 'social_whatsapp',
  },
  {
    value: 'telegram',
    label: 'Telegram',
    placeholder: 'https://t.me/...',
    assetName: 'social_telegram',
  },
  {
    value: 'threads',
    label: 'Threads profile',
    placeholder: 'https://threads.net/@...',
    assetName: 'social_threads',
  },
  {
    value: 'pinterest',
    label: 'Pinterest profile',
    placeholder: 'https://pinterest.com/...',
    assetName: 'social_pinterest',
  },
  {
    value: 'snapchat',
    label: 'Snapchat profile',
    placeholder: 'https://snapchat.com/add/...',
    assetName: 'social_snapchat',
  },
  {
    value: 'reddit',
    label: 'Reddit profile',
    placeholder: 'https://reddit.com/u/...',
    assetName: 'social_reddit',
  },
  {
    value: 'discord',
    label: 'Discord server',
    placeholder: 'https://discord.gg/...',
    assetName: 'social_discord',
  },
  {
    value: 'twitch',
    label: 'Twitch channel',
    placeholder: 'https://twitch.tv/...',
    assetName: 'social_twitch',
  },
  {
    value: 'bluesky',
    label: 'Bluesky profile',
    placeholder: 'https://bsky.app/profile/...',
    assetName: 'social_bluesky',
  },
  {
    value: 'mastodon',
    label: 'Mastodon profile',
    placeholder: 'https://mastodon.social/@...',
    assetName: 'social_mastodon',
  },
  {
    value: 'email',
    label: 'Contact email',
    placeholder: 'contact@example.org or mailto:...',
    assetName: 'social_email',
  },
  {
    value: 'other',
    label: 'Other link',
    placeholder: 'https://...',
    assetName: 'social_other',
  },
] as const satisfies readonly WizardSocialOption[];

const SOCIAL_LABELS_ES: Record<string, string> = {
  'Facebook profile': 'Perfil de Facebook',
  'X / Twitter profile': 'Perfil en X / Twitter',
  'Instagram profile': 'Perfil de Instagram',
  'TikTok profile': 'Perfil de TikTok',
  'YouTube channel': 'Canal de YouTube',
  'LinkedIn profile': 'Perfil de LinkedIn',
  'GitHub profile': 'Perfil de GitHub',
  'GitLab profile': 'Perfil de GitLab',
  'Stack Overflow profile': 'Perfil de Stack Overflow',
  'Hugging Face profile': 'Perfil de Hugging Face',
  'Kaggle profile': 'Perfil de Kaggle',
  'ResearchGate profile': 'Perfil de ResearchGate',
  ORCID: 'ORCID',
  'Google Scholar profile': 'Perfil de Google Scholar',
  'PubMed profile': 'Perfil de PubMed',
  'Scopus profile': 'Perfil de Scopus',
  'Web of Science profile': 'Perfil de Web of Science',
  'BioStars profile': 'Perfil de BioStars',
  'protocols.io profile': 'Perfil de protocols.io',
  'OSF profile': 'Perfil de OSF',
  'Zenodo profile': 'Perfil de Zenodo',
  WhatsApp: 'WhatsApp',
  Telegram: 'Telegram',
  'Threads profile': 'Perfil de Threads',
  'Pinterest profile': 'Perfil de Pinterest',
  'Snapchat profile': 'Perfil de Snapchat',
  'Reddit profile': 'Perfil de Reddit',
  'Discord server': 'Servidor de Discord',
  'Twitch channel': 'Canal de Twitch',
  'Bluesky profile': 'Perfil de Bluesky',
  'Mastodon profile': 'Perfil de Mastodon',
  'Contact email': 'Email de contacto',
  'Other link': 'Otro enlace',
};

export function getWizardSocialOptions(locale: WizardLocale) {
  return WIZARD_SOCIAL_OPTIONS.map((option) => ({
    ...option,
    label: locale === 'es' ? SOCIAL_LABELS_ES[option.label] ?? option.label : option.label,
  }));
}

export const WIZARD_GENETIC_REPORT_CATEGORY_OPTIONS = [
  { value: 'reproductive', label: 'Reproductive', labelEs: 'Reproductivo' },
  { value: 'ophthalmics', label: 'Ophthalmics', labelEs: 'Oftalmológico' },
  { value: 'full_genome', label: 'Full genome', labelEs: 'Genoma completo' },
  { value: 'raw_pdf', label: 'Raw PDF', labelEs: 'PDF crudo' },
  { value: 'raw_vcf', label: 'Raw VCF', labelEs: 'VCF crudo' },
  { value: 'other', label: 'Other', labelEs: 'Otro' },
] as const;

function localizeCategory(option: WizardCategoryOption, locale: WizardLocale) {
  return {
    value: option.value,
    label: locale === 'es' ? CATEGORY_LABELS_ES[option.label] ?? option.label : option.label,
  };
}

function countryLabel(code: string, locale: WizardLocale) {
  if (code === 'GLOBAL') {
    return locale === 'es' ? 'Global' : 'Global';
  }

  const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
  return displayNames.of(code) ?? code;
}

function countryFlag(code: string) {
  if (code === 'GLOBAL') {
    return String.fromCodePoint(0x1f310);
  }

  return code
    .toUpperCase()
    .replace(/[A-Z]/g, (char) =>
      String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65),
    );
}

function countryOption(code: string, locale: WizardLocale) {
  return {
    value: code,
    flag: countryFlag(code),
    label: `${countryLabel(code, locale)} (${code})`,
  };
}

export function getWizardCategoryOptions(
  kind: WizardPublisherKind,
  locale: WizardLocale,
) {
  const options =
    kind === 'organization'
      ? WIZARD_ORGANIZATION_CATEGORY_OPTIONS
      : WIZARD_INDIVIDUAL_CATEGORY_OPTIONS;

  return options.map((option) => localizeCategory(option, locale));
}

export function getWizardCountryGroups(locale: WizardLocale): WizardCountryGroup[] {
  const recommendedCountryCodes = RECOMMENDED_COUNTRY_CODES_BY_LOCALE[locale];
  const recommended = new Set<string>(recommendedCountryCodes);
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  const recommendedOptions = recommendedCountryCodes.map((code) =>
    countryOption(code, locale),
  );
  const allOptions = COUNTRY_CODES.filter((code) => !recommended.has(code))
    .map((code) => countryOption(code, locale))
    .sort((a, b) => collator.compare(a.label, b.label));

  return [
    {
      key: 'recommended',
      label: locale === 'es' ? 'Países recomendados' : 'Recommended countries',
      options: recommendedOptions,
    },
    {
      key: 'all',
      label: locale === 'es' ? 'Todos los demás países' : 'All other countries',
      options: allOptions,
    },
  ];
}

export function getWizardGeneticReportCategoryOptions(locale: WizardLocale) {
  return WIZARD_GENETIC_REPORT_CATEGORY_OPTIONS.map((option) => ({
    value: option.value,
    label: locale === 'es' ? option.labelEs : option.label,
  }));
}
