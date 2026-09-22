import mdmSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/protocol/pgi1-mdm.schema.json";
import agSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/protocol/pgi2-ag.schema.json";
import twoPqSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/protocol/pgi3-2pq.schema.json";
import alignedReadsSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_aligned_reads.schema.json";
import annotatedVcfSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_annotated_vcf.schema.json";
import bloodSampleSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_blood_sample.schema.json";
import candidateGenesSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_bundle_of_candidate_genes.schema.json";
import symptomsSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_bundle_of_symptoms.schema.json";
import collectionRequestSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_collection_request.schema.json";
import dnaSampleSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_dna_sample.schema.json";
import embryoSampleSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_embryo_sample.schema.json";
import flowCytometrySchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_flow_cytometry_data.schema.json";
import formSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_form.schema.json";
import imageBundleSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_image_bundle.schema.json";
import informedConsentSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_informed_consent.schema.json";
import interactiveReportSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_interactive_report.schema.json";
import karyotypeSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_karyotype_result.schema.json";
import pdfReportSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_pdf_report.schema.json";
import sequenceDataSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_sequence_data.schema.json";
import sequenceReadsSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_sequence_reads.schema.json";
import testOrderSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_test_order.schema.json";
import tissueSampleSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_tissue_sample.schema.json";
import unannotatedVcfSchema from "../../../Pocket-Genes-Catalog-Wiki/schemas/objects/pgo_unannotated_vcf.schema.json";
import type { StoredFileFormat } from "@/lib/file-storage";

export type JsonSchema = {
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
  [key: string]: unknown;
};

export const FILE_WIZARD_SCHEMAS: Record<string, JsonSchema> = {
  mdm: mdmSchema as JsonSchema,
  ag: agSchema as JsonSchema,
  "2pq": twoPqSchema as JsonSchema,
  pgo_aligned_reads: alignedReadsSchema as JsonSchema,
  pgo_annotated_vcf: annotatedVcfSchema as JsonSchema,
  pgo_blood_sample: bloodSampleSchema as JsonSchema,
  pgo_bundle_of_candidate_genes: candidateGenesSchema as JsonSchema,
  pgo_bundle_of_symptoms: symptomsSchema as JsonSchema,
  pgo_collection_request: collectionRequestSchema as JsonSchema,
  pgo_dna_sample: dnaSampleSchema as JsonSchema,
  pgo_embryo_sample: embryoSampleSchema as JsonSchema,
  pgo_flow_cytometry_data: flowCytometrySchema as JsonSchema,
  pgo_form: formSchema as JsonSchema,
  pgo_image_bundle: imageBundleSchema as JsonSchema,
  pgo_informed_consent: informedConsentSchema as JsonSchema,
  pgo_interactive_report: interactiveReportSchema as JsonSchema,
  pgo_karyotype_result: karyotypeSchema as JsonSchema,
  pgo_pdf_report: pdfReportSchema as JsonSchema,
  pgo_sequence_data: sequenceDataSchema as JsonSchema,
  pgo_sequence_reads: sequenceReadsSchema as JsonSchema,
  pgo_test_order: testOrderSchema as JsonSchema,
  pgo_tissue_sample: tissueSampleSchema as JsonSchema,
  pgo_unannotated_vcf: unannotatedVcfSchema as JsonSchema,
};

export const FILE_WIZARD_FORMATS = Object.keys(
  FILE_WIZARD_SCHEMAS,
) as StoredFileFormat[];

export function fileWizardSchema(fileType: string) {
  return FILE_WIZARD_SCHEMAS[fileType.trim().toLowerCase()] ?? null;
}

export function resolveFileWizardSchema(
  schema: JsonSchema,
  root: JsonSchema,
  seen: ReadonlySet<string> = new Set(),
): JsonSchema {
  if (!schema.$ref?.startsWith("#/$defs/")) return schema;
  if (seen.has(schema.$ref)) return schema;
  const name = decodeURIComponent(schema.$ref.slice("#/$defs/".length));
  const target = root.$defs?.[name];
  return target
    ? resolveFileWizardSchema(target, root, new Set([...seen, schema.$ref]))
    : schema;
}
