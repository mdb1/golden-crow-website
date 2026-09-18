# Produce an interactive genomic result — `pgs_interactive_interpretation`

Convert an annotated VCF into a registered Pocket Genes interactive report backed by a native MyDNAMap .pgi1.json payload that matches MDMAPIModel.

**Provider:** `pgp_variant_analysis`. **Service version:** `1`. **Stage:** Bioinformatics.

**Provider work:** Produce or register a native PGI payload, validate it against the matching provider schema, attach support evidence and limitations, and return the Pocket Genes registration object.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| annotated_vcf | pgo_annotated_vcf | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| interactive_report | pgo_interactive_report | new_object |

**Form shape**

`pgfs_interactive_interpretation` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| interpretation_profile | enum | True | pg_demo_mdm_pgi1_v1 |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_interactive_interpretation",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-17T15:05:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_interactive_interpretation",
    "form_shape_version": 1,
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-17T15:05:00Z"
      },
      {
        "key": "requested_by",
        "value": "user_demo_001"
      },
      {
        "key": "interpretation_profile",
        "value": "pg_demo_mdm_pgi1_v1"
      }
    ]
  },
  "files": []
}
```

**Request**

```json
{
  "request_id": "pgr_demo_interactive_interpretation",
  "service_id": "pgs_interactive_interpretation",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_interactive_interpretation",
        "revision": 1
      }
    },
    {
      "role": "annotated_vcf",
      "object_ref": {
        "object_id": "obj_demo_annotated_vcf",
        "revision": 1
      }
    }
  ]
}
```

**Completed result**

```json
{
  "request_id": "pgr_demo_interactive_interpretation",
  "status": "completed",
  "outputs": [
    {
      "role": "interactive_report",
      "object_ref": {
        "object_id": "obj_demo_interactive",
        "revision": 1
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- The annotated VCF object declares an accepted annotation profile, source scope and analytical-support evidence.
- The requested demo result is .pgi1.json version 1.0.0 and must validate against schemas/protocol/pgi1-mdm.schema.json.
- The returned pgo_interactive_report stores native_format and payload_ref metadata that match the raw PGI file.
- The demo genomic content is derived from the VCF and registered as a native MDMAPIModel payload; a symptom bundle is not an input.
- Carry source scope and limitations into the Pocket Genes registration object. A pipeline compares that declared support with its linked order.
- No test_order is a required input to this specific conversion. It can be purchased for an existing compatible annotated VCF.
- PGI2/AGAPIModel and PGI3/TwoPQAPIModel use the same pgo_interactive_report registration concept, but require their own native payload sources and schemas.
- Clinical relevance or report sections live in the native PGI payload and provider profile; patient-specific conclusions belong to the appropriately scoped reporting service.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "1d"
}
```
