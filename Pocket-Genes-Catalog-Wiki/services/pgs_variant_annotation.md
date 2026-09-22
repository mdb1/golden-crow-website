# Annotate a VCF — `pgs_variant_annotation`

Add the agreed variant annotations while preserving source identity, variant provenance and analytical limitations.

**Provider:** `pgp_variant_analysis`. **Service version:** `1`. **Stage:** Bioinformatics.

**Search visibility:** discoverable (`isHiddenFromSearch: false`).

**Provider work:** Enrich variants using the provider annotation profile and record the knowledge-source versions and limitations.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| unannotated_vcf | pgo_unannotated_vcf | True | 1–1 |
| test_order | pgo_test_order | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| annotated_variants | pgo_annotated_vcf | new_object |

**Form shape**

`pgfs_variant_annotation` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| annotation_profile | enum | True | PG_DEMO_ANN_V1 |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_variant_annotation",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-17T14:05:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_variant_annotation",
    "form_shape_version": 1,
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-17T14:05:00Z"
      },
      {
        "key": "requested_by",
        "value": "user_demo_001"
      },
      {
        "key": "annotation_profile",
        "value": "PG_DEMO_ANN_V1"
      }
    ],
    "form_shape": {
      "id": "pgfs_variant_annotation",
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
          "key": "annotation_profile",
          "label": "Annotation profile",
          "type": "enum",
          "required": true,
          "options": [
            {
              "value": "PG_DEMO_ANN_V1",
              "label": "Demo annotation profile"
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
  "request_id": "pgr_demo_variant_annotation",
  "service_id": "pgs_variant_annotation",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_variant_annotation",
        "revision": 1
      }
    },
    {
      "role": "unannotated_vcf",
      "object_ref": {
        "object_id": "obj_demo_unannotated_vcf",
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
  "request_id": "pgr_demo_variant_annotation",
  "status": "delivered",
  "outputs": [
    {
      "role": "annotated_variants",
      "object_ref": {
        "object_id": "obj_demo_annotated_vcf",
        "revision": 1
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- The VCF encoding, reference and variant representation are accepted.
- Required analytical-support information is available in the registered object.
- When a test_order is supplied, resolve its pinned revision and enforce data.scope.genes, reference_id and variant_classes plus data.fulfillment requirements.
- When an order is supplied, respect data.fulfillment.scope_policy=requested_only. Additional capability does not expand that order.
- Without a test_order, annotate within the input object's declared source scope and available analytical-support evidence. An existing compatible unannotated VCF can use this service independently.
- Carry forward data.analysis_support with status, evaluated_genes, supported_variant_classes, evidence and limitations. Do not infer an adequately assessed gene from absence of VCF rows.
- When a supplied order cannot be supported by the input, return awaiting_input or failed with the affected scope. Without an order, preserve the input limitations and never claim a broader assessment.
- Annotation adds information about supplied variants; it cannot recover data missing from the input analysis.
- The annotated and unannotated types share .vcf but have different accepted semantic profiles.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "4h"
}
```
