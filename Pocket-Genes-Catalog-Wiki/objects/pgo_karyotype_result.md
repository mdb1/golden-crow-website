# Karyotype result — `pgo_karyotype_result`

Structured chromosome-analysis findings produced from an accepted metaphase image bundle, with image provenance and review status.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Bioinformatics |
| Extension | .pgkaryotype.json |
| Icon asset | icons/pgo_karyotype_result.svg |
| Icon subject | Two stylized chromosome pairs beside a result tick. |
| JSON Schema | schemas/objects/pgo_karyotype_result.schema.json |
| Example record | examples/objects/pgo_karyotype_result.pgkaryotype.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `subject_id` | string | Yes | Synthetic or platform-assigned subject identifier; do not infer identity from a filename. minLength: 1 |
| `order_ref` | object | No | Linked test order when one governs this service. |
| `order_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `order_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `source_images_ref` | object | Yes | Metaphase image bundle analyzed by the provider. |
| `source_images_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `source_images_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `notation_system` | string | Yes | System used for the result notation; fixtures use PG_DEMO_NOTATION. minLength: 1 |
| `result_notation` | string | Yes | Result in the declared notation system. minLength: 1 |
| `findings` | array | Yes | Findings supported by the analyzed images. minItems: 0 |
| `findings[].finding_id` | string | Yes | Unique finding identifier. minLength: 1 |
| `findings[].description` | string | Yes | Chromosome finding or observation statement. minLength: 1 |
| `findings[].supporting_image_ids` | array | Yes | Images from source_images_ref supporting this finding. minItems: 1 |
| `analyzed_image_count` | integer | Yes | Number of submitted images used in this result. minimum: 1 |
| `review_status` | string | Yes | Provider-recorded review state. Options: automated_draft, professional_reviewed; minLength: 1 |
| `reviewer_id` | string | No | Identifier of the reviewer when professionally reviewed. minLength: 1 |
| `limitations` | array | Yes | Limits of the analysis or submitted images. minItems: 0 |


**Sample object record**

```json
{
  "object_id": "obj_demo_karyotype",
  "object_type": "pgo_karyotype_result",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T13:00:00Z",
  "created_by": "pgp_cytogenetics",
  "input_refs": [
    {
      "object_id": "obj_demo_form_karyotype_analysis",
      "revision": 1
    },
    {
      "object_id": "obj_demo_images",
      "revision": 1
    }
  ],
  "data": {
    "subject_id": "subject_demo_001",
    "order_ref": {
      "object_id": "obj_demo_order",
      "revision": 1
    },
    "source_images_ref": {
      "object_id": "obj_demo_images",
      "revision": 1
    },
    "notation_system": "PG_DEMO_NOTATION",
    "result_notation": "DEMO_CHROMOSOME_RESULT",
    "findings": [
      {
        "finding_id": "karyotype_finding_demo_001",
        "description": "Fictional chromosome-pattern finding used to illustrate the service contract.",
        "supporting_image_ids": [
          "image_demo_001",
          "image_demo_002"
        ]
      }
    ],
    "analyzed_image_count": 2,
    "review_status": "professional_reviewed",
    "reviewer_id": "professional_demo_cytogenetics",
    "limitations": [
      "Synthetic images and notation; not a clinical karyotype."
    ]
  },
  "files": []
}
```

**Validation and JSON logic**

- supporting_image_ids must exist in the referenced image bundle.
- review_status professional_reviewed requires reviewer_id.
- Notation and review requirements must match the downstream service contract.
- This image-analysis route can end in its own PDF; it does not need a VCF or pgi1 conversion.

**Linked mock services**

- Produced or updated by: `pgs_karyotype_analysis`
- Consumed by: No service in the initial 15; retained as an accepted type for additional provider contracts.

**Other service opportunities**

- Metaphase image bundle to structured karyotype result.
- Independent professional review of a karyotype draft.
- Karyotype result to PDF.
