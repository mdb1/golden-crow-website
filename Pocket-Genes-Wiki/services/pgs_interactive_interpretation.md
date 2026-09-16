# Produce an interactive genomic result — `pgs_interactive_interpretation`

Convert an annotated VCF into the symptom-independent clinical-relevance structure stored in .pgi1.json.

**Provider:** `pgp_variant_analysis`. **Stage:** Bioinformatics.

**Provider work:** Produce structured genomic findings, their clinical relevance, evidence and limitations using the provider interpretation profile.

**Input slots in addition to the form**

| Role | Accepted types | Required | Cardinality |
| --- | --- | --- | --- |
| annotated_variants | pgo_annotated_vcf | True | {"min": 1, "max": 1} |


**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| interactive_report | pgo_interactive_report | new_object |


**Form shape**

`pgfs_interactive_interpretation` version `1.0.0`

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| interpretation_profile | enum | True | [{"value": "pg_demo_pgi1_v1", "label": "Demo PGI1 interpretation profile"}] |


**Filled form**

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
    "form_shape_version": "1.0.0",
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
        "value": "pg_demo_pgi1_v1"
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
  "service_version": "1.0.0",
  "form_ref": {
    "object_id": "obj_demo_form_interactive_interpretation",
    "revision": 1
  },
  "inputs": [
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
- The requested result schema is .pgi1.json version 1.0.0.
- The genomic content is derived from the VCF and its carried source/analytical-support information; a symptom bundle is not an input.
- Carry source scope and limitations into the interactive object. A pipeline compares that declared support with its linked order.
- No test_order is a required input to this specific conversion. It can be purchased for an existing compatible annotated VCF.
- Clinical relevance is represented as structured variant information with provenance; patient-specific conclusions belong to the appropriately scoped reporting service.

**Illustrative commercial terms**

```json
{
  "price": {
    "amount": 20000,
    "currency": "ARS",
    "basis": "per accepted request",
    "is_mock": true
  },
  "turnaround": "1 business day",
  "turnaround_starts_at": "accepted after required inputs are available; waiting for a specimen or clarification pauses the estimate",
  "tax_and_payment_policy": "Not specified in this fictional catalog",
  "failure_policy": "Assess fulfillment and remaining usable outputs; refunds or rework follow the accepted service terms. No default automatic repeat of physical work."
}
```
