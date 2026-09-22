import { PGO_OBJECT_SCHEMAS } from "../contracts/pgo-object-schemas.generated.js";
import {
  serializedPgoObjectSchemaError,
  SUPPORTED_PGO_OBJECT_SCHEMA_TYPES,
} from "../lib/pgo-object-schema.js";

const EXPECTED_OBJECT_TYPES = [
  "pgo_form",
  "pgo_bundle_of_symptoms",
  "pgo_bundle_of_candidate_genes",
  "pgo_informed_consent",
  "pgo_test_order",
  "pgo_collection_request",
  "pgo_blood_sample",
  "pgo_tissue_sample",
  "pgo_embryo_sample",
  "pgo_dna_sample",
  "pgo_sequence_reads",
  "pgo_sequence_data",
  "pgo_aligned_reads",
  "pgo_unannotated_vcf",
  "pgo_annotated_vcf",
  "pgo_interactive_report",
  "pgo_pdf_report",
  "pgo_image_bundle",
  "pgo_karyotype_result",
  "pgo_flow_cytometry_data",
].sort();

function record(value: unknown) {
  return value as Record<string, unknown>;
}

function dataProperties(objectType: string) {
  const schemaProperties = record(PGO_OBJECT_SCHEMAS[objectType]?.properties);
  return record(record(schemaProperties.data).properties);
}

describe("embedded PGO object schemas", () => {
  it("registers the exact 20-type catalog without runtime file dependencies", () => {
    expect(SUPPORTED_PGO_OBJECT_SCHEMA_TYPES).toEqual(EXPECTED_OBJECT_TYPES);
    expect(Object.keys(PGO_OBJECT_SCHEMAS).sort()).toEqual(EXPECTED_OBJECT_TYPES);
  });

  it("compiles and enforces the complete envelope for every catalog type", () => {
    for (const objectType of EXPECTED_OBJECT_TYPES) {
      const schema = PGO_OBJECT_SCHEMAS[objectType];
      const properties = schema?.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      expect(properties?.object_type?.const).toBe(objectType);
      expect(
        serializedPgoObjectSchemaError(objectType, {
          object_type: objectType,
        }),
      ).toContain("missing required field");
    }
  });

  it("preserves catalog fields whose names also look like schema annotations", () => {
    expect(dataProperties("pgo_pdf_report")).toHaveProperty("title");
    expect(dataProperties("pgo_form")).toHaveProperty("form_shape");

    const findings = record(dataProperties("pgo_karyotype_result").findings);
    const findingProperties = record(record(findings.items).properties);
    expect(findingProperties).toHaveProperty("description");
  });

  it("rejects object types outside the fixed catalog", () => {
    expect(serializedPgoObjectSchemaError("pgo_unknown", {})).toBe(
      "no runtime schema is registered for pgo_unknown",
    );
  });
});
