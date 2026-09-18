# Form — `pgo_form`

A service-specific list of filled fields accompanying every service request. The shape belongs to service configuration; the form is the completed request object.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Test planning, Wet lab, Bioinformatics |
| Extension | .pgform.json |
| Icon asset | icons/pgo_form.svg |
| Icon subject | A compact form sheet with three input lines and one checked field. |
| JSON Schema | schemas/objects/pgo_form.schema.json |
| Example record | examples/objects/pgo_form.pgform.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `form_shape_id` | string | Yes | Identifier of the form_shape published by the requested service. minLength: 1 |
| `form_shape_version` | integer | Yes | Exact integer version of the form_shape used to fill and validate this form. minimum: 1 |
| `fields` | array | Yes | Filled request fields, including requested_at and requested_by. minItems: 2 |
| `fields[].key` | string | Yes | Field key declared in the service form_shape. minLength: 1 |
| `fields[].value` | string/number/boolean/array | Yes | Filled value. Actual type, requiredness, and enum options are enforced by the referenced form_shape. |


**Sample object record**

```json
{
  "object_id": "obj_demo_form_symptom_intake",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:00:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_symptom_intake",
    "form_shape_version": "1.0.0",
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-16T12:00:00Z"
      },
      {
        "key": "requested_by",
        "value": "user_demo_001"
      },
      {
        "key": "subject_id",
        "value": "subject_demo_001"
      },
      {
        "key": "observations",
        "value": [
          "Synthetic observation A",
          "Synthetic observation B"
        ]
      }
    ]
  },
  "files": []
}
```

**Validation and JSON logic**

- Resolve the exact form_shape_id and form_shape_version before accepting a request.
- Field keys must be unique. Validate every field against its shape-defined type, enum options and requiredness.
- requested_at and requested_by must appear exactly once. requested_at must be a date-time and requested_by must identify the actual requester.
- The service can require only this form, or this form plus additional objects.
- Common request fields are platform-populated or verified; they are not editable evidence of someone else making a request.

**Linked mock services**

- Produced or updated by: No service in the initial 15; retained as an accepted type for additional provider contracts.
- Consumed by: `pgs_symptom_intake`, `pgs_gene_prioritization`, `pgs_informed_consent`, `pgs_test_ordering`, `pgs_collection_request`, `pgs_sample_transport`, `pgs_dna_extraction`, `pgs_sequencing`, `pgs_read_alignment`, `pgs_variant_calling`, `pgs_variant_annotation`, `pgs_interactive_interpretation`, `pgs_final_report`, `pgs_karyotype_analysis`, `pgs_form_to_pdf`

**Other service opportunities**

- Symptom intake without existing pieces.
- Informed consent request without existing pieces.
- Language and layout selection accompanying final report inputs.
