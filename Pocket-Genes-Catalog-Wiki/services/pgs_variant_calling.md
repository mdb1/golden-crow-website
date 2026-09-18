# Call variants in the requested scope — `pgs_variant_calling`

Derive an unannotated VCF from aligned reads for the contracted genes, regions and variant classes.

**Provider:** `pgp_variant_analysis`. **Service version:** `1`. **Stage:** Bioinformatics.

**Provider work:** Call the agreed classes, assess support across the requested scope and produce a native VCF with registered provenance.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| aligned_reads | pgo_aligned_reads | True | 1–1 |
| test_order | pgo_test_order | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| variants | pgo_unannotated_vcf | new_object |

**Form shape**

`pgfs_variant_calling` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| calling_profile | enum | True | pg_demo_calling_v1 |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_variant_calling",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-17T13:05:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_variant_calling",
    "form_shape_version": 1,
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-17T13:05:00Z"
      },
      {
        "key": "requested_by",
        "value": "user_demo_001"
      },
      {
        "key": "calling_profile",
        "value": "pg_demo_calling_v1"
      }
    ]
  },
  "files": []
}
```

**Request**

```json
{
  "request_id": "pgr_demo_variant_calling",
  "service_id": "pgs_variant_calling",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_variant_calling",
        "revision": 1
      }
    },
    {
      "role": "aligned_reads",
      "object_ref": {
        "object_id": "obj_demo_bam",
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
  "request_id": "pgr_demo_variant_calling",
  "status": "completed",
  "outputs": [
    {
      "role": "variants",
      "object_ref": {
        "object_id": "obj_demo_unannotated_vcf",
        "revision": 1
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- The alignment reference matches the order and the calling profile.
- Input data and support evidence meet the accepted calling requirements.
- Resolve the explicitly supplied test_order at its pinned revision. Its data.scope.genes, reference_id and variant_classes define the requested analysis.
- Respect data.fulfillment.scope_policy=requested_only. Additional supported capability does not expand the order.
- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- Carry forward data.analysis_support with status, evaluated_genes, supported_variant_classes, evidence and limitations. Do not infer an adequately assessed gene from absence of VCF rows.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- Retain analytical-support evidence separately from the variant list inside the registered object; an empty variant list does not establish a complete negative result.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "6h"
}
```
