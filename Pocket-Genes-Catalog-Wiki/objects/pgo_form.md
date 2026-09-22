# Form — `pgo_form`

A completed, service-specific request form. The published shape belongs to service configuration, while every submitted object carries an immutable copy of that exact shape so the app can reconstruct the complete form without loading the current offer.

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
| `form_shape` | object | Yes | Immutable snapshot of the exact published shape used for this submission. Its `id` and `version` must equal the two fields above. |
| `form_shape.id` | string | Yes | Exact published shape identifier. |
| `form_shape.version` | integer | Yes | Positive lifecycle counter pinned when the request was submitted. |
| `form_shape.allow_unknown_fields` | boolean | Yes | Must be `false`; it is never configurable. |
| `form_shape.fields` | array | Yes | Ordered field definitions used to reconstruct labels, controls, requiredness and choices. Keys must be unique. |
| `form_shape.fields[].key` | string | Yes | Stable field key. |
| `form_shape.fields[].label` | string | Yes | User-facing label frozen at submission time. |
| `form_shape.fields[].type` | enum | Yes | One of `text`, `number`, `integer`, `boolean`, `date`, `datetime`, `enum`, `multi_enum`, `string_list`. |
| `form_shape.fields[].required` | boolean | Yes | Whether the completed object must contain an answer for this key. |
| `form_shape.fields[].options` | array | Yes | Non-empty only for `enum` and `multi_enum`; every option has unique non-empty `value` and `label`. Empty for every other type. |
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
    "form_shape_version": 1,
    "form_shape": {
      "id": "pgfs_symptom_intake",
      "version": 1,
      "allow_unknown_fields": false,
      "fields": [
        {
          "key": "requested_at",
          "label": "Requested at",
          "type": "datetime",
          "required": true,
          "options": []
        },
        {
          "key": "requested_by",
          "label": "Requested by",
          "type": "text",
          "required": true,
          "options": []
        },
        {
          "key": "subject_id",
          "label": "Subject identifier",
          "type": "text",
          "required": true,
          "options": []
        },
        {
          "key": "observations",
          "label": "Reported observations",
          "type": "string_list",
          "required": true,
          "options": []
        }
      ]
    },
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

- `form_shape` is required and immutable. Its ID and integer version must match `form_shape_id` and `form_shape_version`; a consumer must never substitute the current offer shape.
- Shape keys and answer keys must each be unique. Unknown answers and `allow_unknown_fields: true` are invalid.
- Validate every answer against the embedded type, enum options and requiredness. Optional unanswered fields remain in `form_shape.fields` and are omitted from `data.fields`, which lets the explorer show the whole original form as submitted.
- requested_at and requested_by must appear exactly once. requested_at must be a date-time and requested_by must identify the actual requester.
- `date` uses `YYYY-MM-DD`; `datetime` uses ISO 8601; `integer` is a JSON number with no fractional part; `multi_enum` and `string_list` are arrays of strings.
- The service can require only this form, or this form plus additional objects.
- Common request fields are platform-populated or verified; they are not editable evidence of someone else making a request.

**Linked mock services**

- Produced or updated by: No service in the initial 15; retained as an accepted type for additional provider contracts.
- Consumed by: `pgs_symptom_intake`, `pgs_gene_prioritization`, `pgs_informed_consent`, `pgs_test_ordering`, `pgs_collection_request`, `pgs_sample_transport`, `pgs_dna_extraction`, `pgs_sequencing`, `pgs_read_alignment`, `pgs_variant_calling`, `pgs_variant_annotation`, `pgs_interactive_interpretation`, `pgs_final_report`, `pgs_karyotype_analysis`, `pgs_form_to_pdf`

**Other service opportunities**

- Symptom intake without existing pieces.
- Informed consent request without existing pieces.
- Language and layout selection accompanying final report inputs.
