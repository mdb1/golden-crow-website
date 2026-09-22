import { readFileSync } from "node:fs";
import path from "node:path";
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

const MINIMUM_CONTENT_BY_TYPE: Record<string, Record<string, unknown>> = {
  pgo_form: { form_shape: { fields: [] }, fields: [] },
  pgo_bundle_of_symptoms: {
    observations: [{ label: "Hearing loss" }],
  },
  pgo_bundle_of_candidate_genes: { genes: ["BRCA1"] },
  pgo_informed_consent: {
    title: "Consent",
    text: "Consent text supplied by the patient.",
  },
  pgo_test_order: {
    patient: "Patient AB-123",
    test_name: "Hereditary cancer panel",
    sample_type: "blood",
  },
  pgo_collection_request: {
    patient: "Patient AB-123",
    sample_type: "blood",
  },
  pgo_blood_sample: { sample_label: "Tube A" },
  pgo_tissue_sample: { sample_label: "Biopsy A" },
  pgo_embryo_sample: {
    sample_label: "Embryo sample A",
    material_kind: "embryo_biopsy",
  },
  pgo_dna_sample: { sample_label: "DNA A" },
  pgo_sequence_reads: {
    title: "Sequence reads",
    reads: [
      {
        key: "read_1",
        name: "Read 1",
        download_url: "https://example.com/read?id=1",
      },
    ],
  },
  pgo_sequence_data: {
    title: "Nucleotide sequences",
    download_url: "https://example.com/sequences?signature=kept",
  },
  pgo_aligned_reads: {
    title: "Aligned reads",
    download_url: "https://example.com/aligned?signature=kept",
  },
  pgo_unannotated_vcf: {
    title: "Unannotated variants",
    download_url: "https://example.com/variants?stage=raw",
  },
  pgo_annotated_vcf: {
    title: "Annotated variants",
    download_url: "https://example.com/variants?stage=annotated",
  },
  pgo_interactive_report: {
    title: "Interactive genomic report",
    download_url: "https://example.com/report?format=interactive",
  },
  pgo_pdf_report: {
    title: "Genetic test report",
    download_url: "https://example.com/report?signature=kept",
  },
  pgo_image_bundle: {
    title: "Images",
    images: [
      {
        key: "image_1",
        name: "Image 1",
        download_url: "https://example.com/image?id=1",
      },
    ],
  },
  pgo_karyotype_result: { result_notation: "46,XX" },
  pgo_flow_cytometry_data: {
    title: "Flow cytometry data",
    download_url: "https://example.com/flow?signature=kept",
  },
};

function record(value: unknown) {
  return value as Record<string, unknown>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function formContent(
  definitions: Array<Record<string, unknown>>,
  answers: Array<Record<string, unknown>>,
) {
  return { form_shape: { fields: definitions }, fields: answers };
}

describe("embedded PGO content schemas", () => {
  it("registers the exact 20-type catalog without runtime file dependencies", () => {
    expect(SUPPORTED_PGO_OBJECT_SCHEMA_TYPES).toEqual(EXPECTED_OBJECT_TYPES);
    expect(Object.keys(PGO_OBJECT_SCHEMAS).sort()).toEqual(EXPECTED_OBJECT_TYPES);
    expect(Object.keys(MINIMUM_CONTENT_BY_TYPE).sort()).toEqual(
      EXPECTED_OBJECT_TYPES,
    );
  });

  it("is generated exactly from every source content schema", () => {
    const sourceDirectory = path.resolve(
      __dirname,
      "../../../Pocket-Genes-Catalog-Wiki/schemas/objects",
    );

    for (const objectType of EXPECTED_OBJECT_TYPES) {
      const source = JSON.parse(
        readFileSync(
          path.join(sourceDirectory, `${objectType}.schema.json`),
          "utf8",
        ),
      ) as Record<string, unknown>;
      delete source.$id;
      delete source.$schema;
      expect(PGO_OBJECT_SCHEMAS[objectType]).toEqual(source);
    }
  });

  it("accepts minimum content and an empty optional notes field for all 20 types", () => {
    for (const objectType of EXPECTED_OBJECT_TYPES) {
      const minimum = MINIMUM_CONTENT_BY_TYPE[objectType];
      expect(serializedPgoObjectSchemaError(objectType, minimum)).toBeNull();
      expect(
        serializedPgoObjectSchemaError(objectType, {
          ...minimum,
          notes: "",
        }),
      ).toBeNull();
      expect(
        serializedPgoObjectSchemaError(objectType, {
          ...minimum,
          notes: "Additional human information.",
        }),
      ).toBeNull();
      expect(
        serializedPgoObjectSchemaError(objectType, {
          ...minimum,
          notes: { legacy_metadata: true },
        }),
      ).not.toBeNull();
    }
  });

  it("rejects unknown root fields and old object envelopes for all 20 types", () => {
    for (const objectType of EXPECTED_OBJECT_TYPES) {
      const minimum = MINIMUM_CONTENT_BY_TYPE[objectType];
      expect(
        serializedPgoObjectSchemaError(objectType, {
          ...minimum,
          legacy_metadata: "forbidden",
        }),
      ).toContain("contains unsupported field legacy_metadata");
      expect(
        serializedPgoObjectSchemaError(objectType, {
          object_id: "legacy-object-id",
          object_type: objectType,
          schema_version: "1.0.0",
          revision: 1,
          created_at: "2026-09-22T10:00:00Z",
          created_by: "legacy-user",
          data: minimum,
        }),
      ).not.toBeNull();
    }
  });

  it("keeps pgo_pdf_report exact and accepts direct HTTPS URLs without filename suffixes", () => {
    const exactPdf = {
      title: "Genetic test report",
      download_url: "https://example.com/download?signature=kept",
    };
    expect(
      serializedPgoObjectSchemaError("pgo_pdf_report", exactPdf),
    ).toBeNull();
    expect(
      serializedPgoObjectSchemaError("pgo_pdf_report", {
        ...exactPdf,
        download_url: "HTTPS://example.com/download?signature=kept",
      }),
    ).toBeNull();
    const readsWithUppercaseScheme = clone(
      MINIMUM_CONTENT_BY_TYPE.pgo_sequence_reads!,
    );
    (
      (readsWithUppercaseScheme.reads as Array<Record<string, unknown>>)[0]!
    ).download_url = "HTTPS://example.com/read?id=1";
    expect(
      serializedPgoObjectSchemaError(
        "pgo_sequence_reads",
        readsWithUppercaseScheme,
      ),
    ).toBeNull();
    expect(
      serializedPgoObjectSchemaError("pgo_pdf_report", {
        ...exactPdf,
        notes: "",
      }),
    ).toBeNull();
    expect(
      serializedPgoObjectSchemaError("pgo_pdf_report", {
        ...exactPdf,
        page_count: 4,
      }),
    ).toContain("contains unsupported field page_count");
    expect(
      serializedPgoObjectSchemaError("pgo_pdf_report", {
        ...exactPdf,
        files: [{ path: "legacy.pdf" }],
      }),
    ).toContain("contains unsupported field files");
    for (const downloadUrl of [
      "https:example.com/report",
      "https:///report",
      "https://example.com\\report",
    ]) {
      expect(
        serializedPgoObjectSchemaError("pgo_pdf_report", {
          title: "Invalid report URL",
          download_url: downloadUrl,
        }),
      ).not.toBeNull();
    }
  });

  it("retains x-enum-labels as a non-validation catalog annotation", () => {
    const bloodSampleSchema = PGO_OBJECT_SCHEMAS.pgo_blood_sample;
    expect(bloodSampleSchema).toBeDefined();
    const properties = record(bloodSampleSchema?.properties);
    const material = record(properties.material);
    expect(material["x-enum-labels"]).toEqual([
      "Whole blood",
      "Plasma",
      "Serum",
      "Buffy coat",
      "Dried blood spot",
      "Other",
    ]);
    expect(
      serializedPgoObjectSchemaError("pgo_blood_sample", {
        sample_label: "Tube A",
        material: "whole_blood",
      }),
    ).toBeNull();
  });

  it("validates answers for every supported frozen-form field type", () => {
    const cases: Array<[string, unknown]> = [
      ["text", "Short answer"],
      ["long_text", "Long answer"],
      ["email", "patient@example.com"],
      ["phone", "+5491112345678"],
      ["url", "https://example.com/value?query=kept"],
      ["url", "HTTPS://example.com/value?query=kept"],
      ["address", "123 Main Street"],
      ["postal_code", "B1234 ABC"],
      ["country_code", "AR"],
      ["identifier", "patient:AB-123"],
      ["number", 1.25],
      ["integer", -2],
      ["positive_integer", 2],
      ["percentage", 99.5],
      ["boolean", false],
      ["date", "2024-02-29"],
      ["datetime", "2024-02-29T12:30:45Z"],
      ["date", "0099-01-01"],
      ["datetime", "0099-01-01T00:00:00Z"],
      ["time", "23:59"],
      ["enum", "first"],
      ["multi_enum", ["first", "second"]],
      ["string_list", ["one", "two"]],
      ["integer_list", [1, -2]],
      ["number_list", [1.25, -2]],
    ];
    const definitions = cases.map(([type], index) => ({
      key: `field_${index}`,
      label: `Field ${index}`,
      type,
      required: true,
      ...(type === "enum" || type === "multi_enum"
        ? {
            options: [
              { value: "first", label: "First" },
              { value: "second", label: "Second" },
            ],
          }
        : {}),
      ...(index === 0 ? { help_info_text: "Useful guidance" } : {}),
    }));
    const answers = cases.map(([, value], index) => ({
      key: `field_${index}`,
      value,
    }));

    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent(definitions, answers),
      ),
    ).toBeNull();
  });

  it("enforces the native enum option value and label contract", () => {
    const definition = {
      key: "presentation",
      label: "Presentation",
      type: "enum",
      required: false,
      options: [{ value: "clinical", label: "Clinical" }],
    };
    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent([definition], []),
      ),
    ).toBeNull();
    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent(
          [
            {
              ...definition,
              options: [{ value: "not allowed", label: "Not allowed" }],
            },
          ],
          [],
        ),
      ),
    ).not.toBeNull();
    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent(
          [
            {
              ...definition,
              options: [{ value: "clinical", label: "x".repeat(121) }],
            },
          ],
          [],
        ),
      ),
    ).not.toBeNull();
  });

  it("rejects duplicate, undeclared, missing, and incorrectly typed form answers", () => {
    const definition = {
      key: "choice",
      label: "Choice",
      type: "enum",
      required: true,
      options: [
        { value: "first", label: "First" },
        { value: "second", label: "Second" },
      ],
    };

    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent([definition, { ...definition }], [
          { key: "choice", value: "first" },
        ]),
      ),
    ).toContain("duplicate field key choice");
    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent([definition], [
          { key: "choice", value: "first" },
          { key: "choice", value: "first" },
        ]),
      ),
    ).toContain("duplicate answer key choice");
    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent([definition], [{ key: "other", value: "first" }]),
      ),
    ).toContain("is not declared by form_shape");
    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent([definition], []),
      ),
    ).toContain("missing required answer choice");
    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent([definition], [{ key: "choice", value: "unknown" }]),
      ),
    ).toContain("is invalid for type enum");
  });

  it("rejects duplicate enum declarations and noncanonical multi-enum order", () => {
    const duplicateOptions = {
      key: "choice",
      label: "Choice",
      type: "enum",
      required: false,
      options: [
        { value: "same", label: "One" },
        { value: "same", label: "Two" },
      ],
    };
    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent([duplicateOptions], []),
      ),
    ).toContain("duplicate option values");

    const multiEnum = {
      key: "choices",
      label: "Choices",
      type: "multi_enum",
      required: false,
      options: [
        { value: "first", label: "First" },
        { value: "second", label: "Second" },
      ],
    };
    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent([multiEnum], [
          { key: "choices", value: ["second", "first"] },
        ]),
      ),
    ).toContain("is invalid for type multi_enum");
  });

  it("allows empty optional collections but rejects empty required collections", () => {
    const optionalDefinitions = ["multi_enum", "string_list", "integer_list", "number_list"].map(
      (type, index) => ({
        key: `field_${index}`,
        label: `Field ${index}`,
        type,
        required: false,
        ...(type === "multi_enum"
          ? { options: [{ value: "one", label: "One" }] }
          : {}),
      }),
    );
    expect(
      serializedPgoObjectSchemaError(
        "pgo_form",
        formContent(
          optionalDefinitions,
          optionalDefinitions.map((field) => ({ key: field.key, value: [] })),
        ),
      ),
    ).toBeNull();

    for (const definition of optionalDefinitions) {
      const requiredDefinition = { ...definition, required: true };
      expect(
        serializedPgoObjectSchemaError(
          "pgo_form",
          formContent([requiredDefinition], [
            { key: requiredDefinition.key, value: [] },
          ]),
        ),
      ).toContain(`is invalid for type ${requiredDefinition.type}`);
    }
  });

  it("rejects malformed scalar and list form values", () => {
    const failures: Array<[string, unknown]> = [
      ["email", "not-an-email"],
      ["phone", "011-1234-5678"],
      ["url", "http://example.com"],
      ["url", "https:example.com"],
      ["url", "https:///path"],
      ["url", "https://example.com\\evil"],
      ["country_code", "ar"],
      ["integer", 1.5],
      ["positive_integer", 0],
      ["percentage", 100.1],
      ["date", "2023-02-29"],
      ["datetime", "2023-02-29T12:00:00Z"],
      ["datetime", "2026-09-22 12:00"],
      ["time", "24:00"],
      ["string_list", ["valid", " "]],
      ["integer_list", [1, 1.5]],
      ["number_list", [1, "2"]],
    ];

    for (const [type, value] of failures) {
      const definition = {
        key: "field",
        label: "Field",
        type,
        required: true,
      };
      expect(
        serializedPgoObjectSchemaError(
          "pgo_form",
          formContent([definition], [{ key: "field", value }]),
        ),
      ).not.toBeNull();
    }
  });

  it("requires unique component keys for reads and images", () => {
    const reads = clone(MINIMUM_CONTENT_BY_TYPE.pgo_sequence_reads!);
    const read = clone((reads.reads as unknown[])[0]);
    (reads.reads as unknown[]).push(read);
    expect(
      serializedPgoObjectSchemaError("pgo_sequence_reads", reads),
    ).toContain("reads contains duplicate component key read_1");

    const images = clone(MINIMUM_CONTENT_BY_TYPE.pgo_image_bundle!);
    const image = clone((images.images as unknown[])[0]);
    (images.images as unknown[]).push(image);
    expect(
      serializedPgoObjectSchemaError("pgo_image_bundle", images),
    ).toContain("images contains duplicate component key image_1");
  });

  it("rejects object types outside the fixed catalog", () => {
    expect(serializedPgoObjectSchemaError("pgo_unknown", {})).toBe(
      "no runtime schema is registered for pgo_unknown",
    );
  });
});
