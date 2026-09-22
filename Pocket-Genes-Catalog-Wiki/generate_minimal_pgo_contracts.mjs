#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(root);
const objectsPath = path.join(root, "catalog/objects.json");
const appSchemaRoot = path.join(
  repositoryRoot,
  "mydnamap-ios/mydnamap/Resources/FileWizardSchemas"
);

const readJSON = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeJSON = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const nonemptyString = (description) => ({
  type: "string",
  minLength: 1,
  pattern: "\\S",
  description
});

const optionalNotes = {
  type: "string",
  description: "Optional additional information the person wants to communicate. It may be empty."
};

const httpsURL = (description) => ({
  type: "string",
  minLength: 1,
  format: "uri",
  pattern: String.raw`^[Hh][Tt][Tt][Pp][Ss]://[^/?#\\\s]+(?:[/?#]|$)`,
  description
});

const enumField = (values, description, labels) => ({
  type: "string",
  enum: values,
  description,
  ...(labels ? { "x-enum-labels": labels } : {})
});

const closedObject = (properties, required = [], description) => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required,
  additionalProperties: false
});

const contentSchema = (type, properties, required) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `https://schemas.pocketgenes.example/objects/${type}/1.0.0/schema.json`,
  title: `${type} content`,
  ...closedObject(properties, required, `Minimal domain content for ${type}.`)
});

const withNotes = (properties) => ({ ...properties, notes: optionalNotes });

const openEnum = (entries, description) => enumField(
  entries.map(([value]) => value),
  description,
  entries.map(([, label]) => label)
);

const sampleTypes = [
  ["blood", "Blood"],
  ["dried_blood_spot", "Dried blood spot"],
  ["saliva", "Saliva"],
  ["buccal_swab", "Buccal swab"],
  ["tissue", "Tissue"],
  ["skin_biopsy", "Skin biopsy"],
  ["bone_marrow_aspirate", "Bone marrow aspirate"],
  ["bone_marrow_core", "Bone marrow core biopsy"],
  ["amniotic_fluid", "Amniotic fluid"],
  ["chorionic_villi", "Chorionic villi"],
  ["cord_blood", "Cord blood"],
  ["cerebrospinal_fluid", "Cerebrospinal fluid"],
  ["urine", "Urine"],
  ["stool", "Stool"],
  ["hair_follicles", "Hair follicles"],
  ["nail_clippings", "Nail clippings"],
  ["semen", "Semen"],
  ["embryo_biopsy", "Embryo biopsy"],
  ["whole_embryo", "Whole embryo"],
  ["polar_body", "Polar body"],
  ["other", "Other"]
];

const testOrderSampleTypes = [
  ...sampleTypes.slice(0, -1),
  ["plasma", "Plasma"],
  ["serum", "Serum"],
  ["extracted_dna", "Extracted DNA"],
  ["extracted_rna", "Extracted RNA"],
  ["other", "Other"]
];

const testTypes = [
  ["single_gene", "Single-gene test"],
  ["gene_panel", "Gene panel"],
  ["exome_sequencing", "Exome sequencing"],
  ["genome_sequencing", "Genome sequencing"],
  ["targeted_variant_testing", "Targeted variant testing"],
  ["repeat_expansion_testing", "Repeat expansion testing"],
  ["methylation_analysis", "Methylation analysis"],
  ["chromosomal_microarray", "Chromosomal microarray"],
  ["karyotype", "Karyotype"],
  ["fish", "FISH"],
  ["other", "Other"]
];

const collectionMethods = [
  ["venous_blood_draw", "Venous blood draw"],
  ["capillary_blood_collection", "Capillary blood collection"],
  ["buccal_swab", "Buccal swab"],
  ["saliva_collection", "Saliva collection"],
  ["needle_aspiration", "Needle aspiration"],
  ["core_biopsy", "Core biopsy"],
  ["surgical_biopsy", "Surgical biopsy"],
  ["skin_punch_biopsy", "Skin punch biopsy"],
  ["amniocentesis", "Amniocentesis"],
  ["chorionic_villus_sampling", "Chorionic villus sampling"],
  ["lumbar_puncture", "Lumbar puncture"],
  ["embryo_biopsy", "Embryo biopsy"],
  ["polar_body_biopsy", "Polar body biopsy"],
  ["self_collection", "Self-collection"],
  ["other", "Other"]
];

const containers = [
  ["edta_tube", "EDTA tube"],
  ["heparin_tube", "Heparin tube"],
  ["citrate_tube", "Citrate tube"],
  ["serum_tube", "Serum tube"],
  ["dna_stabilization_tube", "DNA stabilization tube"],
  ["rna_stabilization_tube", "RNA stabilization tube"],
  ["sterile_container", "Sterile container"],
  ["swab_collection_kit", "Swab collection kit"],
  ["saliva_collection_kit", "Saliva collection kit"],
  ["cryovial", "Cryovial"],
  ["filter_paper_card", "Filter paper card"],
  ["formalin_container", "Formalin container"],
  ["other", "Other"]
];

const formFieldTypes = [
  "text", "long_text", "email", "phone", "url", "address", "postal_code",
  "country_code", "identifier", "number", "integer", "positive_integer",
  "percentage", "boolean", "date", "datetime", "time", "enum", "multi_enum",
  "string_list", "integer_list", "number_list"
];

const formOption = closedObject({
  value: {
    ...nonemptyString("Stable stored option value."),
    maxLength: 128,
    pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"
  },
  label: {
    ...nonemptyString("Human-readable option label frozen with the form."),
    maxLength: 120
  }
}, ["value", "label"], "One enum choice.");

const formFieldDefinition = {
  type: "object",
  properties: {
    key: {
      ...nonemptyString("Stable field key."),
      maxLength: 64,
      pattern: "^[a-z][a-z0-9_]{0,63}$"
    },
    label: { ...nonemptyString("Human-readable field label."), maxLength: 120 },
    type: enumField(formFieldTypes, "Field value and validation type."),
    required: { type: "boolean", description: "Whether an answer must be present." },
    options: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: formOption,
      description: "Allowed choices. Present only for enum and multi_enum."
    },
    help_info_text: {
      ...nonemptyString("Optional guidance displayed by the native form."),
      maxLength: 500
    }
  },
  required: ["key", "label", "type", "required"],
  additionalProperties: false,
  allOf: [
    {
      if: { properties: { type: { enum: ["enum", "multi_enum"] } }, required: ["type"] },
      then: { required: ["options"] },
      else: { not: { required: ["options"] } }
    }
  ]
};

const formAnswer = closedObject({
  key: nonemptyString("Key of a field declared by form_shape.fields."),
  value: {
    oneOf: [
      { type: "string" },
      { type: "number" },
      { type: "boolean" },
      { type: "array", items: { oneOf: [{ type: "string" }, { type: "number" }] } }
    ],
    description: "Typed answer validated against the matching frozen field definition."
  }
}, ["key", "value"], "One submitted answer.");

const symptomCode = closedObject({
  system: enumField(["hpo", "snomed_ct", "other"], "Terminology system."),
  value: nonemptyString("Code in the selected terminology system.")
}, ["system", "value"], "Optional terminology code.");

const symptomObservation = closedObject({
  label: nonemptyString("Readable symptom or observation."),
  presence: enumField(["present", "absent", "uncertain"], "Observation presence."),
  code: symptomCode
}, ["label"], "One symptom observation.");

const downloadableComponent = (kind) => closedObject({
  key: nonemptyString(`Unique ${kind} key within this object.`),
  name: nonemptyString(`Readable ${kind} name.`),
  download_url: httpsURL(`HTTPS URL used to download this ${kind}.`)
}, ["key", "name", "download_url"], `One downloadable ${kind}.`);

const singleFileProperties = () => withNotes({
  title: nonemptyString("Human-facing title."),
  download_url: httpsURL("HTTPS URL used to download the native file.")
});

const contracts = {
  pgo_form: {
    description: "A completed form with its frozen field definitions and typed answers.",
    properties: withNotes({
      form_shape: closedObject({
        fields: {
          type: "array",
          items: formFieldDefinition,
          description: "Ordered frozen field definitions used to render and validate this submission."
        }
      }, ["fields"], "Frozen form shape."),
      fields: { type: "array", items: formAnswer, description: "Submitted answers." }
    }),
    required: ["form_shape", "fields"],
    example: {
      form_shape: {
        fields: [{
          key: "presentation",
          label: "Report presentation",
          type: "enum",
          required: false,
          options: [
            { value: "clinical", label: "Clinical" },
            { value: "patient", label: "For the patient" },
            { value: "other", label: "Other" }
          ]
        }]
      },
      fields: [{ key: "presentation", value: "clinical" }]
    },
    validationRules: [
      "Definition and answer keys must each be unique.",
      "Every answer key must be declared by the frozen form shape and match its declared type.",
      "enum and multi_enum require nonempty options; all other field types must omit options.",
      "Optional unanswered fields may be omitted and fields may be empty when no required answer exists."
    ]
  },
  pgo_bundle_of_symptoms: {
    description: "A standalone set of readable symptom observations with optional terminology coding.",
    properties: withNotes({
      observations: { type: "array", minItems: 1, items: symptomObservation }
    }),
    required: ["observations"],
    example: { observations: [{ label: "Hearing loss", presence: "present" }] }
  },
  pgo_bundle_of_candidate_genes: {
    description: "A standalone nonempty list of candidate gene symbols.",
    properties: withNotes({
      genes: { type: "array", minItems: 1, items: nonemptyString("Gene symbol.") }
    }),
    required: ["genes"],
    example: { genes: ["BRCA1", "BRCA2"] }
  },
  pgo_informed_consent: {
    description: "Readable informed-consent content with optional explicit workflow state and acceptance facts.",
    properties: withNotes({
      title: nonemptyString("Consent title."),
      text: nonemptyString("Actual consent text."),
      status: enumField(["pending", "accepted", "declined", "withdrawn"], "Consent workflow state."),
      accepted_by: nonemptyString("Actual person who accepted the consent."),
      accepted_at: { ...nonemptyString("Actual acceptance time."), format: "date-time" }
    }),
    required: ["title", "text"],
    example: {
      title: "Consent for genetic testing",
      text: "I confirm that I received and understood the information provided.",
      status: "pending"
    }
  },
  pgo_test_order: {
    description: "A standalone request for a named test on a stated patient or source and specimen type.",
    properties: withNotes({
      patient: nonemptyString("Patient/source name or meaningful identifier supplied for this order."),
      test_name: nonemptyString("Actual requested test name."),
      sample_type: openEnum(testOrderSampleTypes, "Specimen or material expected by the testing provider."),
      test_type: openEnum(testTypes, "Optional broad test category."),
      objective: nonemptyString("Optional objective for the test."),
      clinical_suspicion: nonemptyString("Optional clinical suspicion."),
      genes: { type: "array", minItems: 1, items: nonemptyString("Gene symbol.") }
    }),
    required: ["patient", "test_name", "sample_type"],
    example: {
      patient: "Patient AB-123",
      test_name: "Hereditary cancer panel",
      sample_type: "blood"
    }
  },
  pgo_collection_request: {
    description: "A request to obtain biological material; it is not courier pickup or specimen transport.",
    properties: withNotes({
      patient: nonemptyString("Patient/source name or meaningful identifier for collection."),
      sample_type: openEnum(sampleTypes, "Biological material to obtain."),
      collection_method: openEnum(collectionMethods, "Method used to obtain the biological material."),
      container: openEnum(containers, "Collection container or kit."),
      requested_quantity: nonemptyString("Readable quantity including its unit, for example 2 mL."),
      collection_site: nonemptyString("Readable collection location."),
      scheduled_at: { ...nonemptyString("Scheduled collection time."), format: "date-time" }
    }),
    required: ["patient", "sample_type"],
    example: {
      patient: "Patient AB-123",
      sample_type: "blood",
      collection_method: "venous_blood_draw",
      container: "edta_tube"
    }
  },
  pgo_blood_sample: {
    description: "Domain description of a distinguishable blood specimen.",
    properties: withNotes({
      sample_label: nonemptyString("Actual label or identifier used to distinguish the specimen."),
      material: openEnum([
        ["whole_blood", "Whole blood"], ["plasma", "Plasma"], ["serum", "Serum"],
        ["buffy_coat", "Buffy coat"], ["dried_blood_spot", "Dried blood spot"], ["other", "Other"]
      ], "Blood material."),
      container: openEnum(containers, "Specimen container."),
      volume_ml: { type: "number", minimum: 0, description: "Volume in millilitres." }
    }),
    required: ["sample_label"],
    example: { sample_label: "Blood specimen A", material: "whole_blood", container: "edta_tube", volume_ml: 2 }
  },
  pgo_tissue_sample: {
    description: "Domain description of a distinguishable tissue specimen.",
    properties: withNotes({
      sample_label: nonemptyString("Actual label or identifier used to distinguish the specimen."),
      anatomical_site: nonemptyString("Readable anatomical site."),
      preparation: openEnum([
        ["fresh", "Fresh"], ["frozen", "Frozen"],
        ["formalin_fixed_unembedded", "Formalin-fixed, unembedded"], ["ffpe", "FFPE"],
        ["alcohol_preserved", "Alcohol-preserved"], ["other", "Other"]
      ], "Tissue preparation.")
    }),
    required: ["sample_label"],
    example: { sample_label: "Tissue specimen A", anatomical_site: "Skin", preparation: "fresh" }
  },
  pgo_embryo_sample: {
    description: "Domain description of distinguishable embryo-derived material.",
    properties: withNotes({
      sample_label: nonemptyString("Actual label or identifier used to distinguish the specimen."),
      material_kind: openEnum([
        ["embryo_biopsy", "Embryo biopsy"], ["whole_embryo", "Whole embryo"],
        ["polar_body", "Polar body"], ["other", "Other"]
      ], "Kind of embryo-derived material."),
      embryo_identifier: nonemptyString("Associated embryo identifier when known.")
    }),
    required: ["sample_label", "material_kind"],
    example: { sample_label: "Embryo material A", material_kind: "embryo_biopsy", embryo_identifier: "Embryo 4" }
  },
  pgo_dna_sample: {
    description: "Domain description of a distinguishable extracted DNA specimen.",
    properties: withNotes({
      sample_label: nonemptyString("Actual label or identifier used to distinguish the specimen."),
      volume_ul: { type: "number", minimum: 0, description: "Volume in microlitres." },
      concentration_ng_ul: { type: "number", minimum: 0, description: "Concentration in nanograms per microlitre." }
    }),
    required: ["sample_label"],
    example: { sample_label: "DNA aliquot A", volume_ul: 40, concentration_ng_ul: 25 }
  },
  pgo_sequence_reads: {
    description: "A named collection of one or more directly downloadable sequencing-read files.",
    properties: withNotes({
      title: nonemptyString("Human-facing title."),
      reads: { type: "array", minItems: 1, items: downloadableComponent("read") }
    }),
    required: ["title", "reads"],
    example: {
      title: "Sequencing reads",
      reads: [
        { key: "r1", name: "Read 1", download_url: "https://example.com/sample_R1.fastq.gz" },
        { key: "r2", name: "Read 2", download_url: "https://example.com/sample_R2.fastq.gz" }
      ]
    }
  },
  pgo_sequence_data: {
    description: "A titled reference to downloadable native nucleotide-sequence data.",
    properties: singleFileProperties(), required: ["title", "download_url"],
    example: { title: "Nucleotide sequences", download_url: "https://example.com/sequences" }
  },
  pgo_aligned_reads: {
    description: "A titled reference to downloadable aligned reads with an optional index.",
    properties: withNotes({
      title: nonemptyString("Human-facing title."),
      download_url: httpsURL("HTTPS URL used to download the aligned reads."),
      index_download_url: httpsURL("HTTPS URL used to download the optional alignment index.")
    }),
    required: ["title", "download_url"],
    example: {
      title: "Aligned reads",
      download_url: "https://example.com/sample.bam",
      index_download_url: "https://example.com/sample.bam.bai"
    }
  },
  pgo_unannotated_vcf: {
    description: "A titled reference to a downloadable native unannotated VCF.",
    properties: singleFileProperties(), required: ["title", "download_url"],
    example: { title: "Unannotated variants", download_url: "https://example.com/variants" }
  },
  pgo_annotated_vcf: {
    description: "A titled reference to a downloadable native annotated VCF.",
    properties: singleFileProperties(), required: ["title", "download_url"],
    example: { title: "Annotated variants", download_url: "https://example.com/annotated-variants" }
  },
  pgo_interactive_report: {
    description: "A titled reference to a downloadable native PGI report decoded through the existing PGI format parsers.",
    properties: singleFileProperties(), required: ["title", "download_url"],
    example: { title: "Interactive genomic report", download_url: "https://example.com/interactive-report" }
  },
  pgo_pdf_report: {
    description: "A titled reference to a downloadable PDF report.",
    properties: singleFileProperties(), required: ["title", "download_url"],
    example: { title: "Genetic test report", download_url: "https://example.com/reports/report.pdf" }
  },
  pgo_image_bundle: {
    description: "A named collection of one or more directly downloadable images.",
    properties: withNotes({
      title: nonemptyString("Human-facing title."),
      images: { type: "array", minItems: 1, items: downloadableComponent("image") }
    }),
    required: ["title", "images"],
    example: {
      title: "Metaphase images",
      images: [
        { key: "metaphase_1", name: "Metaphase image 1", download_url: "https://example.com/image-1.png" },
        { key: "metaphase_2", name: "Metaphase image 2", download_url: "https://example.com/image-2.png" }
      ]
    }
  },
  pgo_karyotype_result: {
    description: "A karyotype notation with an optional readable professional interpretation.",
    properties: withNotes({
      result_notation: nonemptyString("Actual karyotype result notation."),
      interpretation: nonemptyString("Optional readable interpretation.")
    }),
    required: ["result_notation"],
    example: { result_notation: "46,XX", interpretation: "No numerical chromosome abnormality was identified." }
  },
  pgo_flow_cytometry_data: {
    description: "A titled reference to downloadable native flow-cytometry data.",
    properties: singleFileProperties(), required: ["title", "download_url"],
    example: { title: "Flow cytometry data", download_url: "https://example.com/flow-data" }
  }
};

const catalog = readJSON(objectsPath);
const existingByID = new Map(catalog.objects.map((object) => [object.id, object]));
const contractIDs = Object.keys(contracts);

if (contractIDs.length !== 20 || existingByID.size !== 20) {
  throw new Error("The minimal contract must contain exactly the existing 20 PGO types.");
}
if (contractIDs.some((id) => !existingByID.has(id))) {
  throw new Error("The minimal contract type identifiers do not match the existing catalog.");
}

const genericRules = [
  "The content is standalone and does not require a Pocket Genes service or another registered object.",
  "Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.",
  "Required strings must contain at least one non-whitespace character.",
  "notes is optional, may be empty, and must not be populated with discarded technical metadata."
];

const primitiveTypeName = (property) => {
  if (property.type === "array") return "array";
  if (property.type === "object") return "object";
  if (property.type) return Array.isArray(property.type) ? property.type.join(" | ") : property.type;
  if (property.oneOf) return "typed value";
  return "value";
};

catalog.objects = catalog.objects.map((existing) => {
  const contract = contracts[existing.id];
  const schema = contentSchema(existing.id, contract.properties, contract.required);
  const dataSchema = structuredClone(schema);
  delete dataSchema.$schema;
  delete dataSchema.$id;
  delete dataSchema.title;

  const properties = Object.entries(contract.properties).map(([name, definition]) => ({
    name,
    type: primitiveTypeName(definition),
    required: contract.required.includes(name),
    description: definition.description ?? `${name} content.`
  }));

  const schemaPath = path.join(root, existing.schema_path);
  const examplePath = path.join(root, existing.example_path);
  writeJSON(schemaPath, schema);
  writeJSON(examplePath, contract.example);
  writeJSON(path.join(appSchemaRoot, `${existing.id}.schema.json`), schema);

  return {
    ...existing,
    description: contract.description,
    properties,
    data_schema: dataSchema,
    example_data: contract.example,
    validation_rules: [...genericRules, ...(contract.validationRules ?? [])],
    example: contract.example
  };
});

catalog.object_count = catalog.objects.length;
catalog.schema_version = "1.0.0";
writeJSON(objectsPath, catalog);

const formField = (key, label, type, required, options, helpInfoText) => ({
  key,
  label,
  type,
  required,
  ...(options ? { options } : {}),
  ...(helpInfoText ? { helpInfoText } : {})
});

const optionObjects = (entries) => entries.map(([value, label]) => ({ value, label }));

const serviceFormContracts = {
  pgs_symptom_intake: {
    fields: [
      formField("observations", "Reported observations", "string_list", true)
    ],
    values: { observations: ["Hearing loss", "Balance difficulties"] }
  },
  pgs_gene_prioritization: {
    fields: [
      formField("ranking_mode", "Result organization", "enum", true, optionObjects([
        ["ranked", "Ranked list"], ["selected", "Selected set"]
      ])),
      formField("maximum_genes", "Maximum genes", "positive_integer", true)
    ],
    values: { ranking_mode: "ranked", maximum_genes: 3 }
  },
  pgs_informed_consent: {
    fields: [
      formField("patient", "Patient or source", "text", true),
      formField("consent_title", "Consent title", "text", true),
      formField("consent_text", "Consent text", "long_text", true),
      formField("signer_name", "Expected signer name", "text", false),
      formField("signer_capacity", "Expected signer capacity", "enum", false, optionObjects([
        ["self", "Self"], ["representative", "Representative"], ["other", "Other"]
      ]))
    ],
    values: {
      patient: "Patient AB-123",
      consent_title: "Consent for genetic testing",
      consent_text: "Please review the purpose, implications and limitations of the proposed genetic test.",
      signer_name: "Alex Example",
      signer_capacity: "self"
    }
  },
  pgs_test_ordering: {
    fields: [
      formField("patient", "Patient or source", "text", true),
      formField("test_name", "Requested test name", "text", true),
      formField("sample_type", "Requested specimen", "enum", true, optionObjects(testOrderSampleTypes)),
      formField("test_type", "Broad test type", "enum", false, optionObjects(testTypes)),
      formField("objective", "Objective", "long_text", false),
      formField("clinical_suspicion", "Clinical suspicion", "long_text", false),
      formField("genes", "Genes", "string_list", false)
    ],
    values: {
      patient: "Patient AB-123",
      test_name: "Hereditary cancer panel",
      sample_type: "blood",
      test_type: "gene_panel",
      objective: "Evaluate an inherited cancer predisposition.",
      genes: ["BRCA1", "BRCA2"]
    }
  },
  pgs_collection_request: {
    fields: [
      formField("patient", "Patient or source", "text", true),
      formField("sample_type", "Biological material to collect", "enum", true, optionObjects(sampleTypes)),
      formField("collection_method", "Collection method", "enum", false, optionObjects(collectionMethods)),
      formField("container", "Container or kit", "enum", false, optionObjects(containers)),
      formField("requested_quantity", "Requested quantity", "text", false),
      formField("collection_site", "Collection site", "address", false),
      formField("scheduled_at", "Scheduled collection time", "datetime", false)
    ],
    values: {
      patient: "Patient AB-123",
      sample_type: "blood",
      collection_method: "venous_blood_draw",
      container: "edta_tube",
      requested_quantity: "2 mL",
      collection_site: "Demo clinical collection room"
    }
  },
  pgs_sample_transport: {
    fields: [
      formField("contact_name", "Contact name", "text", true),
      formField("contact_phone", "Contact phone", "phone", true)
    ],
    values: { contact_name: "Example Contact", contact_phone: "+541155551234" }
  },
  pgs_dna_extraction: {
    fields: [
      formField("extraction_profile", "Extraction profile", "enum", true, optionObjects([
        ["demo_blood_dna_v1", "Demo blood DNA extraction"],
        ["demo_tissue_dna_v1", "Demo tissue DNA extraction"],
        ["demo_embryo_biopsy_dna_v1", "Demo embryo-biopsy DNA extraction"]
      ]))
    ],
    values: { extraction_profile: "demo_blood_dna_v1" }
  },
  pgs_sequencing: {
    fields: [
      formField("sequencing_profile", "Sequencing profile", "enum", true, optionObjects([
        ["pg_demo_targeted_reads_v1", "Demo targeted read profile"]
      ]))
    ],
    values: { sequencing_profile: "pg_demo_targeted_reads_v1" }
  },
  pgs_read_alignment: {
    fields: [
      formField("alignment_profile", "Alignment profile", "enum", true, optionObjects([
        ["pg_demo_alignment_v1", "Demo alignment profile"]
      ]))
    ],
    values: { alignment_profile: "pg_demo_alignment_v1" }
  },
  pgs_variant_calling: {
    fields: [
      formField("calling_profile", "Variant-calling profile", "enum", true, optionObjects([
        ["pg_demo_calling_v1", "Demo variant-calling profile"]
      ]))
    ],
    values: { calling_profile: "pg_demo_calling_v1" }
  },
  pgs_variant_annotation: {
    fields: [
      formField("annotation_profile", "Annotation profile", "enum", true, optionObjects([
        ["PG_DEMO_ANN_V1", "Demo annotation profile"]
      ]))
    ],
    values: { annotation_profile: "PG_DEMO_ANN_V1" }
  },
  pgs_interactive_interpretation: {
    fields: [
      formField("interpretation_profile", "Interactive report profile", "enum", true, optionObjects([
        ["pg_demo_mdm_pgi1_v1", "Demo PGI1 MDMAPIModel profile"]
      ]))
    ],
    values: { interpretation_profile: "pg_demo_mdm_pgi1_v1" }
  },
  pgs_final_report: {
    fields: [
      formField("language", "Report language", "enum", true, optionObjects([
        ["en", "English"], ["es-AR", "Spanish, Argentina"]
      ])),
      formField("presentation", "Report presentation", "enum", true, optionObjects([
        ["clinical", "Clinical report"], ["patient", "Patient-facing report"], ["other", "Other"]
      ]))
    ],
    values: { language: "en", presentation: "clinical" }
  },
  pgs_karyotype_analysis: {
    fields: [
      formField("objective", "Analysis objective", "long_text", false),
      formField("analysis_profile", "Analysis profile", "enum", true, optionObjects([
        ["pg_demo_metaphase_review_v1", "Demo metaphase image review"]
      ]))
    ],
    values: {
      objective: "Review the supplied metaphase images.",
      analysis_profile: "pg_demo_metaphase_review_v1"
    }
  },
  pgs_form_to_pdf: {
    fields: [
      formField("patient_name", "Patient name", "text", false),
      formField("objective", "Document objective", "long_text", true),
      formField("submitted_information", "Information to include", "string_list", true),
      formField("language", "Document language", "enum", true, optionObjects([
        ["en", "English"], ["es-AR", "Spanish, Argentina"]
      ]))
    ],
    values: {
      patient_name: "Alex Example",
      objective: "Summarize the submitted request.",
      submitted_information: ["Consultation note A", "Consultation note B"],
      language: "en"
    }
  }
};

const embeddedField = (field) => ({
  key: field.key,
  label: field.label,
  type: field.type,
  required: field.required,
  ...(field.options ? { options: structuredClone(field.options) } : {}),
  ...(field.helpInfoText ? { help_info_text: field.helpInfoText } : {})
});

const answerFields = (config) => Object.entries(config.values).map(([key, value]) => ({ key, value }));

const migrateService = (service) => {
  const config = serviceFormContracts[service.serviceId];
  const hasFormInput = service.inputSlots?.some((slot) => slot.objectType === "pgo_form");
  if (hasFormInput !== Boolean(config)) {
    throw new Error(`Form contract mismatch for ${service.serviceId}`);
  }

  const migrated = structuredClone(service);
  if (config) {
    migrated.formShape = {
      id: service.formShape.id,
      version: service.formShape.version,
      fields: structuredClone(config.fields),
      allowUnknownFields: false
    };
    migrated.sampleFormData = { fields: answerFields(config) };
    const oldFixture = service.sampleFormObject;
    migrated.sampleFormObject = {
      object_id: oldFixture.object_id,
      object_type: "pgo_form",
      schema_version: oldFixture.schema_version,
      revision: oldFixture.revision,
      created_at: oldFixture.created_at,
      created_by: oldFixture.created_by,
      data: {
        form_shape: { fields: config.fields.map(embeddedField) },
        fields: answerFields(config)
      }
    };
  } else {
    delete migrated.formShape;
    delete migrated.sampleFormData;
    delete migrated.sampleFormObject;
  }

  const staleContractPath = /(data\.(scope|fulfillment|analysis_support|reference_id|profile_id|native_format|payload_ref|source_pgi_ref|source_images_ref|lineage_refs)|\bnative_format\b|\bpayload_ref\b|\bsupport evidence\b|\braw payload\b|reference_id and variant_classes|scope_policy=requested_only)/i;
  const currentSuitabilityRule = "Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.";
  for (const key of ["acceptedConditions", "scopeRules"]) {
    const rules = (migrated[key] ?? []).filter((rule) => !staleContractPath.test(rule));
    if ((migrated[key] ?? []).some((rule) => staleContractPath.test(rule))) {
      rules.push(currentSuitabilityRule);
    }
    migrated[key] = [...new Set(rules)];
  }
  migrated.description = migrated.description
    .replaceAll("variant provenance", "native variant context")
    .replaceAll("source identity", "input identity");
  migrated.providerWork = migrated.providerWork
    .replaceAll("registered provenance", "transaction-bound input and output records")
    .replaceAll("input and reference provenance", "the transaction-bound input and selected reference context")
    .replaceAll("provenance", "transaction-bound context");

  if (migrated.serviceId === "pgs_test_ordering") {
    migrated.scopeRules = [
      "Create pgo_test_order content from the patient, test name and sample type actually supplied, plus only the optional context the requester provided.",
      "Consent checks and provider suitability checks remain service responsibilities and are not fabricated inside the order content."
    ];
  }
  return migrated;
};

const servicesPath = path.join(root, "catalog/services.json");
const servicesCatalog = readJSON(servicesPath);
servicesCatalog.services = servicesCatalog.services.map(migrateService);
writeJSON(servicesPath, servicesCatalog);
writeJSON(
  path.join(repositoryRoot, "mydnamap-ios/mydnamap/Resources/PocketGenesServicesCatalog.json"),
  servicesCatalog
);

for (const service of servicesCatalog.services) {
  writeJSON(path.join(root, `services/${service.serviceId}.json`), service);
  if (service.sampleFormObject) {
    writeJSON(path.join(root, `examples/forms/${service.serviceId}.pgform.json`), service.sampleFormObject);
  }
  writeJSON(path.join(root, `examples/requests/${service.serviceId}.json`), service.sampleRequest);
  writeJSON(path.join(root, `examples/results/${service.serviceId}.json`), service.sampleResult);
}

const fixtureContent = (type, oldData, fileName) => {
  const base = structuredClone(contracts[type].example);
  if (typeof oldData?.notes === "string") base.notes = oldData.notes;
  if (typeof oldData?.sample_label === "string" && "sample_label" in contracts[type].properties) {
    base.sample_label = oldData.sample_label;
  }
  if (type === "pgo_embryo_sample" && ["embryo_biopsy", "whole_embryo", "polar_body", "other"].includes(oldData?.material_kind)) {
    base.material_kind = oldData.material_kind;
    if (typeof oldData.embryo_identifier === "string") base.embryo_identifier = oldData.embryo_identifier;
  }
  if (type === "pgo_dna_sample") {
    if (typeof oldData?.quantity?.value === "number" && oldData.quantity.unit === "uL") {
      base.volume_ul = oldData.quantity.value;
    }
    if (typeof oldData?.concentration?.value === "number" && oldData.concentration.unit === "ng/uL") {
      base.concentration_ng_ul = oldData.concentration.value;
    }
  }
  if (type === "pgo_pdf_report" && fileName === "obj_demo_consultation_pdf.pgobject.json") {
    base.title = oldData?.title ?? "Fictional consultation summary";
    base.download_url = "https://example.com/reports/consultation-summary.pdf";
  }
  return base;
};

for (const fileName of fs.readdirSync(path.join(root, "examples/objects")).filter((name) => name.endsWith(".json"))) {
  const filePath = path.join(root, "examples/objects", fileName);
  const fixture = readJSON(filePath);
  if (fixture.object_type && fixture.data) {
    const migrated = {
      object_id: fixture.object_id,
      object_type: fixture.object_type,
      schema_version: fixture.schema_version,
      revision: fixture.revision,
      created_at: fixture.created_at,
      created_by: fixture.created_by,
      data: fixtureContent(fixture.object_type, fixture.data, fileName)
    };
    writeJSON(filePath, migrated);
  }
}

const externalFieldDefinition = {
  type: "object",
  properties: {
    key: { ...nonemptyString("Stable lower snake-case field key."), maxLength: 64, pattern: "^[a-z][a-z0-9_]{0,63}$" },
    label: { ...nonemptyString("Human-readable label."), maxLength: 120 },
    type: enumField(formFieldTypes, "Field value and validation type."),
    required: { type: "boolean" },
    options: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: formOption },
    helpInfoText: { ...nonemptyString("Optional requester-facing guidance."), maxLength: 500 }
  },
  required: ["key", "label", "type", "required"],
  additionalProperties: false,
  allOf: [{
    if: { properties: { type: { enum: ["enum", "multi_enum"] } }, required: ["type"] },
    then: { required: ["options"] },
    else: { not: { required: ["options"] } }
  }]
};

const externalFormShape = closedObject({
  id: { ...nonemptyString("Generated pgfs_ form-shape identifier."), pattern: "^pgfs_[A-Za-z0-9_]+$" },
  version: { type: "integer", minimum: 1 },
  fields: { type: "array", items: externalFieldDefinition },
  allowUnknownFields: { type: "boolean", const: false }
}, ["id", "version", "fields", "allowUnknownFields"], "Published service-offer form configuration.");

const pgoFormContentSchema = contentSchema("pgo_form", contracts.pgo_form.properties, contracts.pgo_form.required);
const platformFormObject = closedObject({
  object_id: { ...nonemptyString("Platform-managed object identity."), pattern: "^obj_[A-Za-z0-9_]+$" },
  object_type: { const: "pgo_form" },
  schema_version: { const: "1.0.0" },
  revision: { type: "integer", minimum: 1 },
  created_at: { type: "string", format: "date-time" },
  created_by: nonemptyString("Platform-managed creator identity."),
  data: { $ref: "#/$defs/form_data" }
}, ["object_id", "object_type", "schema_version", "revision", "created_at", "created_by", "data"], "Platform fixture surrounding strict pgo_form content.");
const serviceFormData = closedObject({
  fields: { type: "array", items: formAnswer }
}, ["fields"], "Sample answers for the service form; request identity and time live on the transaction.");

const rewriteProtocolDefinitions = (value) => {
  if (Array.isArray(value)) return value.map(rewriteProtocolDefinitions);
  if (!value || typeof value !== "object") return value;
  const rewritten = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, rewriteProtocolDefinitions(child)])
  );
  if (rewritten.$defs) {
    if (rewritten.$defs.field_definition) rewritten.$defs.field_definition = structuredClone(externalFieldDefinition);
    if (rewritten.$defs.form_shape) rewritten.$defs.form_shape = structuredClone(externalFormShape);
    if (rewritten.$defs.form_field) rewritten.$defs.form_field = structuredClone(formAnswer);
    if (rewritten.$defs.form_data) rewritten.$defs.form_data = structuredClone(pgoFormContentSchema);
    if (rewritten.$defs.form_object) rewritten.$defs.form_object = structuredClone(platformFormObject);
    if (rewritten.$defs.service_form_data) rewritten.$defs.service_form_data = structuredClone(serviceFormData);
    delete rewritten.$defs.file_descriptor;
  }
  return rewritten;
};

for (const fileName of fs.readdirSync(path.join(root, "schemas/protocol")).filter((name) => name.endsWith(".schema.json"))) {
  const filePath = path.join(root, "schemas/protocol", fileName);
  writeJSON(filePath, rewriteProtocolDefinitions(readJSON(filePath)));
}

writeJSON(path.join(root, "schemas/protocol/object-envelope.schema.json"), {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Pocket Genes platform object record fixture",
  description: "Platform identity and lifecycle data surrounding strict standalone PGO domain content. This is not the JSON a person uploads.",
  type: "object",
  properties: {
    object_id: nonemptyString("Platform-managed object identity."),
    object_type: enumField(contractIDs, "Registered PGO type selected outside the content."),
    schema_version: { const: "1.0.0" },
    revision: { type: "integer", minimum: 1 },
    created_at: { type: "string", format: "date-time" },
    created_by: nonemptyString("Platform-managed creator identity."),
    data: { type: "object", description: "Strict PGO content validated against object_type." }
  },
  required: ["object_id", "object_type", "schema_version", "revision", "created_at", "created_by", "data"],
  additionalProperties: false
});

const providersPath = path.join(root, "catalog/providers.json");
const providersCatalog = readJSON(providersPath);
providersCatalog.provider_definition = "A provider publishes a service contract and performs each accepted transaction. PGO content remains standalone; identity, ownership, authorization, revisions and service role bindings live in existing platform records.";
providersCatalog.provider_field_guide.provider_id = "Stable pgp_ provider identifier used by services and transactions. It is not repeated inside PGO content.";
providersCatalog.shared_api_contract.form_metadata_location = "The service transaction stores requestedAt and requestedByUserId. A pgo_form input contains only its frozen form_shape.fields, submitted fields and optional notes; requested_at and requested_by are not universal form questions.";
providersCatalog.shared_api_contract.version_binding = "Validate the pinned integer service_version against the published offer. A submitted pgo_form preserves its frozen definitions but carries no content-level form-shape ID or version.";
providersCatalog.shared_api_contract.file_transfer = "File-bearing PGO content exposes direct absolute HTTPS download_url values, or direct component URLs for reads and images. Preserve signed query parameters. The API does not embed native bytes and does not require generic file descriptors inside PGO content.";
providersCatalog.shared_api_contract.matching_rules = [
  "declared_object_type_from_the_platform_record",
  "pinned_service_version_and_role_binding",
  "native_content_parseability_when_applicable",
  "service_specific_suitability",
  "operational_specimen_state_when_applicable"
];
providersCatalog.shared_api_contract.scope_rule = "Global PGO validity and suitability for a particular service are separate checks. Providers validate the actual native input and transaction context needed for their published service without adding universal metadata to every PGO.";
providersCatalog.shared_api_contract.object_provenance = "Service input and output relationships are recorded by role-labelled references on the transaction. Standalone PGO content contains no input_refs, source-reference placeholder or generic provenance envelope.";

const annotationService = servicesCatalog.services.find((service) => service.serviceId === "pgs_variant_annotation");
providersCatalog.variant_analysis_api_example.referenced_form_example = structuredClone(annotationService.sampleFormObject);
providersCatalog.variant_analysis_api_example.example_form_note = "This platform fixture contains strict pgo_form content. The immutable shape contains only field definitions; request identity and time remain on the service transaction.";
providersCatalog.variant_analysis_api_example.example_walkthrough = [
  "Pocket Genes resolves the strict form content, unannotated VCF object and test order at the exact transaction-bound revisions.",
  "Pocket Genes submits the role-labelled inputs, pinned service version and Idempotency-Key.",
  "The provider validates access, role compatibility, native VCF content and service-specific suitability.",
  "The provider performs only the published annotation work and registers a pgo_annotated_vcf whose content is title, download_url and optional notes.",
  "The provider sends the signed completion callback with the registered output object reference.",
  "Pocket Genes verifies the event and makes the output object available to the authorized user."
];
writeJSON(providersPath, providersCatalog);
writeJSON(
  path.join(repositoryRoot, "mydnamap-ios/mydnamap/Resources/PocketGenesProvidersCatalog.json"),
  providersCatalog
);
for (const provider of providersCatalog.providers) {
  writeJSON(path.join(root, `providers/${provider.provider_id}.json`), provider);
}

const fieldConventionPath = path.join(root, "catalog/field-key-conventions.json");
const fieldConventions = readJSON(fieldConventionPath);
fieldConventions.serialized_pgo_content = {
  boundary: "standalone_file_content",
  field_key_convention: "snake_case",
  examples: ["form_shape", "sample_type", "download_url", "accepted_at"],
  rule: "The file contains only the strict domain allowlist for its externally selected PGO type. No casing aliases or envelope fields are accepted."
};
fieldConventions.boundary_adapter_rule = "Map strict snake_case PGO content explicitly at persistence boundaries. service_offers and service_transactions keep camelCase; uploaded_objects and other listed storage collections keep snake_case.";
writeJSON(fieldConventionPath, fieldConventions);

await import("./generate_minimal_pgo_docs.mjs");

console.log(`Generated ${contractIDs.length} strict minimal PGO content contracts and synchronized the object/service/provider ecosystem.`);
