# Record informed consent — `pgs_informed_consent`

Receive the completed consent-specific form and produce an informed-consent record for the stated scope.

**Provider:** `pgp_clinical_planning`. **Service version:** `1`. **Stage:** Test Planning.

**Provider work:** Present or verify the consent material and record the completed consent process as specified by the provider service.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| consent | pgo_informed_consent | new_object |

**Form shape**

`pgfs_informed_consent` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| subject_id | text | True | — |
| signer_name | text | True | — |
| signer_capacity | enum | True | self, representative |
| consent_text_id | text | True | — |
| consent_text_version | text | True | — |
| scope_description | text | True | — |
| accepted | boolean | True | — |
| signature_evidence_id | text | True | — |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_informed_consent",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:00:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_informed_consent",
    "form_shape_version": 1,
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
        "key": "signer_name",
        "value": "Alex Example"
      },
      {
        "key": "signer_capacity",
        "value": "self"
      },
      {
        "key": "consent_text_id",
        "value": "consent_demo_testing"
      },
      {
        "key": "consent_text_version",
        "value": "1.0.0"
      },
      {
        "key": "scope_description",
        "value": "Demo testing and processing for PGGENE_A, PGGENE_B and PGGENE_C"
      },
      {
        "key": "accepted",
        "value": true
      },
      {
        "key": "signature_evidence_id",
        "value": "signature_demo_001"
      }
    ]
  },
  "files": []
}
```

**Request**

```json
{
  "request_id": "pgr_demo_informed_consent",
  "service_id": "pgs_informed_consent",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_informed_consent",
        "revision": 1
      }
    }
  ]
}
```

**Completed result**

```json
{
  "request_id": "pgr_demo_informed_consent",
  "status": "completed",
  "outputs": [
    {
      "role": "consent",
      "object_ref": {
        "object_id": "obj_demo_consent",
        "revision": 1
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- The consent text, its version, signer identity and signature or acceptance evidence must be recoverable in the resulting object.
- Only an accepted consent for the appropriate scope can satisfy the test-ordering contract. A submission alone is not proof of valid consent.
- The record retains what was consented to, when and by whom. Subsequent use must fit that scope.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "1d"
}
```
