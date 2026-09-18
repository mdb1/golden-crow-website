# Create the final self-contained report — `pgs_final_report`

Combine the complete test order with a registered PGI payload into a final PDF for the requested objective.

**Provider:** `pgp_report_studio`. **Service version:** `1`. **Stage:** Bioinformatics.

**Provider work:** Verify the order match, native PGI schema, support evidence and scope, perform included report review, and issue a complete PDF using the selected presentation.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| test_order | pgo_test_order | True | 1–1 |
| interactive_report | pgo_interactive_report | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| report | pgo_pdf_report | new_object |

**Form shape**

`pgfs_final_report` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| language | enum | True | en, es-AR |
| presentation | enum | True | clinical, patient |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_final_report",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-17T16:05:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_final_report",
    "form_shape_version": 1,
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-17T16:05:00Z"
      },
      {
        "key": "requested_by",
        "value": "user_demo_001"
      },
      {
        "key": "language",
        "value": "en"
      },
      {
        "key": "presentation",
        "value": "clinical"
      }
    ]
  },
  "files": []
}
```

**Request**

```json
{
  "request_id": "pgr_demo_final_report",
  "service_id": "pgs_final_report",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_final_report",
        "revision": 1
      }
    },
    {
      "role": "test_order",
      "object_ref": {
        "object_id": "obj_demo_order",
        "revision": 1
      }
    },
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

**Completed result**

```json
{
  "request_id": "pgr_demo_final_report",
  "status": "completed",
  "outputs": [
    {
      "role": "report",
      "object_ref": {
        "object_id": "obj_demo_pdf",
        "revision": 1
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- The order and registered PGI object identify the same subject and compatible specimen/source lineage.
- The order contains patient identity, clinical objective, suspicion and required reporting context.
- The PGI object contains native_format, payload_ref, support evidence, limitations and producer information required by the reporting profile.
- The raw payload validates against the matching PGI schema: pgi1-mdm, pgi2-ag or pgi3-2pq.
- The selected provider service includes the review/issuance responsibilities required by its report profile. Rendering alone does not supply missing professional conclusions or authorizations.
- Resolve the explicitly supplied test_order at its pinned revision. Its data.scope.genes, reference_id and variant_classes define the requested analysis.
- Resolve the pgo_interactive_report object, then validate its raw payload using native_format.schema_path before rendering.
- Respect data.fulfillment.scope_policy=requested_only. Additional supported capability does not expand the order.
- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- Carry forward data.analysis_support with status, evaluated_genes, supported_variant_classes, evidence and limitations. Do not infer an adequately assessed gene from absence of provider payload rows.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- The order, registered PGI object and this service form are sufficient under this contract; do not require the original intake form or symptom bundle.
- Both successful requested-scope assessment and explicit limitations must appear in the final self-contained report as appropriate.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "1d"
}
```
