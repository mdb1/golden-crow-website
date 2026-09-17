# Create the test order — `pgs_test_ordering`

Combine the consent record, candidate genes and patient/request context into the formal test order.

**Provider:** `pgp_clinical_planning`. **Service version:** `1`. **Stage:** Test Planning.

**Provider work:** Review consent and test selection, consolidate the patient context, and issue the order with explicit fulfillment requirements.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| informed_consent | pgo_informed_consent | True | 1–1 |
| bundle_of_candidate_genes | pgo_bundle_of_candidate_genes | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| test_order | pgo_test_order | new_object |

**Form shape**

`pgfs_test_ordering` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| subject_id | text | True | — |
| patient_name | text | True | — |
| objective | text | True | — |
| clinical_suspicion | text | True | — |
| reference_id | text | True | — |
| variant_classes | multi_enum | True | SNV, small_indel |
| required_output_types | multi_enum | True | pgo_interactive_report, pgo_pdf_report |
| patient_date_of_birth | date | True | — |
| patient_identifier | text | True | — |
| wet_lab_output_type | enum | True | pgo_sequence_reads, pgo_aligned_reads, pgo_unannotated_vcf, pgo_annotated_vcf |
| required_profile | text | True | — |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_test_ordering",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:11:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_test_ordering",
    "form_shape_version": 1,
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-16T12:11:00Z"
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
        "key": "patient_name",
        "value": "Alex Example"
      },
      {
        "key": "objective",
        "value": "Evaluate the synthetic three-gene demonstration"
      },
      {
        "key": "clinical_suspicion",
        "value": "Demo clinical hypothesis only"
      },
      {
        "key": "reference_id",
        "value": "PG_DEMO_REF_1"
      },
      {
        "key": "variant_classes",
        "value": [
          "SNV",
          "small_indel"
        ]
      },
      {
        "key": "required_output_types",
        "value": [
          "pgo_interactive_report",
          "pgo_pdf_report"
        ]
      },
      {
        "key": "patient_date_of_birth",
        "value": "1990-01-01"
      },
      {
        "key": "patient_identifier",
        "value": "PATIENT-DEMO-001"
      },
      {
        "key": "wet_lab_output_type",
        "value": "pgo_sequence_reads"
      },
      {
        "key": "required_profile",
        "value": "pg_demo_small_variant_v1"
      }
    ]
  },
  "files": []
}
```

**Request**

```json
{
  "request_id": "pgr_demo_test_ordering",
  "service_id": "pgs_test_ordering",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_test_ordering",
        "revision": 1
      }
    },
    {
      "role": "informed_consent",
      "object_ref": {
        "object_id": "obj_demo_consent",
        "revision": 1
      }
    },
    {
      "role": "bundle_of_candidate_genes",
      "object_ref": {
        "object_id": "obj_demo_genes",
        "revision": 1
      }
    }
  ]
}
```

**Completed result**

```json
{
  "request_id": "pgr_demo_test_ordering",
  "status": "completed",
  "outputs": [
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

**Acceptance and fulfillment rules**

- Patient and subject references agree across the form and input objects.
- The consent is accepted and its scope covers the proposed order.
- The provider confirms the selected tests and scope within its offered test-ordering process.
- Create data.scope and data.fulfillment explicitly; retain patient identity, objective, clinical suspicion and consent reference.
- The final report must be generatable from this complete order plus the interactive result and the report service form.
- The candidate-gene bundle feeds test ordering directly; no suggested-tests intermediate object is required.
- The ordering form supplies patient_name, patient_date_of_birth and patient_identifier for the patient record. wet_lab_output_type selects the laboratory handoff; required_output_types maps to fulfillment.final_output_types; required_profile sets the analytical profile.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "1d"
}
```
