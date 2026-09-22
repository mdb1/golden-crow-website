# Align sequence reads — `pgs_read_alignment`

Align accepted FASTQ reads to the order reference and return an aligned-read object.

**Provider:** `pgp_variant_analysis`. **Service version:** `1`. **Stage:** Bioinformatics.

**Search visibility:** discoverable (`isHiddenFromSearch: false`).

**Provider work:** Run the alignment and quality assessment under the declared profile; retain input and reference provenance.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| sequence_reads | pgo_sequence_reads | True | 1–1 |
| test_order | pgo_test_order | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| aligned_reads | pgo_aligned_reads | new_object |

**Form shape**

`pgfs_read_alignment` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| alignment_profile | enum | True | pg_demo_alignment_v1 |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_read_alignment",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-17T12:05:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_read_alignment",
    "form_shape_version": 1,
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-17T12:05:00Z"
      },
      {
        "key": "requested_by",
        "value": "user_demo_001"
      },
      {
        "key": "alignment_profile",
        "value": "pg_demo_alignment_v1"
      }
    ],
    "form_shape": {
      "id": "pgfs_read_alignment",
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
          "key": "alignment_profile",
          "label": "Alignment profile",
          "type": "enum",
          "required": true,
          "options": [
            {
              "value": "pg_demo_alignment_v1",
              "label": "Demo alignment profile"
            }
          ]
        }
      ]
    }
  },
  "files": []
}
```

**Request**

```json
{
  "request_id": "pgr_demo_read_alignment",
  "service_id": "pgs_read_alignment",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_read_alignment",
        "revision": 1
      }
    },
    {
      "role": "sequence_reads",
      "object_ref": {
        "object_id": "obj_demo_fastq",
        "revision": 1
      }
    },
    {
      "role": "test_order",
      "object_ref": {
        "object_id": "obj_demo_order",
        "revision": 1
      }
    }
  ]
}
```

**Completed result**

```json
{
  "request_id": "pgr_demo_read_alignment",
  "status": "delivered",
  "outputs": [
    {
      "role": "aligned_reads",
      "object_ref": {
        "object_id": "obj_demo_bam",
        "revision": 1
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- Read layout, encoding and sequencing profile are supported.
- The specified reference is available to the provider and agrees with the order.
- Resolve the explicitly supplied test_order at its pinned revision. Its data.scope.genes, reference_id and variant_classes define the requested analysis.
- Respect data.fulfillment.scope_policy=requested_only. Additional supported capability does not expand the order.
- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- Carry forward data.analysis_support with status, evaluated_genes, supported_variant_classes, evidence and limitations. Do not infer an adequately assessed gene from absence of VCF rows.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "6h"
}
```
