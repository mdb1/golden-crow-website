# Analyze a metaphase image bundle — `pgs_karyotype_analysis`

Review a compatible bundle of metaphase images and return a structured karyotype result without a sequencing step.

**Provider:** `pgp_cytogenetics`. **Service version:** `1`. **Stage:** Bioinformatics.

**Search visibility:** discoverable (`isHiddenFromSearch: false`).

**Provider work:** Perform digital image analysis and the professional review included in the offered cytogenetics service.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| image_bundle | pgo_image_bundle | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| karyotype_result | pgo_karyotype_result | new_object |

**Form shape**

`pgfs_karyotype_analysis` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| subject_id | text | True | — |
| objective | text | True | — |
| analysis_profile | enum | True | pg_demo_metaphase_review_v1 |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_karyotype_analysis",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:35:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_karyotype_analysis",
    "form_shape_version": 1,
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-16T12:35:00Z"
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
        "key": "objective",
        "value": "Demonstrate image-based cytogenetic review"
      },
      {
        "key": "analysis_profile",
        "value": "pg_demo_metaphase_review_v1"
      }
    ],
    "form_shape": {
      "id": "pgfs_karyotype_analysis",
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
          "key": "objective",
          "label": "Analysis objective",
          "type": "text",
          "required": true,
          "options": []
        },
        {
          "key": "analysis_profile",
          "label": "Analysis profile",
          "type": "enum",
          "required": true,
          "options": [
            {
              "value": "pg_demo_metaphase_review_v1",
              "label": "Demo metaphase image review"
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
  "request_id": "pgr_demo_karyotype_analysis",
  "service_id": "pgs_karyotype_analysis",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_karyotype_analysis",
        "revision": 1
      }
    },
    {
      "role": "image_bundle",
      "object_ref": {
        "object_id": "obj_demo_images",
        "revision": 1
      }
    }
  ]
}
```

**Completed result**

```json
{
  "request_id": "pgr_demo_karyotype_analysis",
  "status": "delivered",
  "outputs": [
    {
      "role": "karyotype_result",
      "object_ref": {
        "object_id": "obj_demo_karyotype",
        "revision": 1
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- The image bundle declares a metaphase-imaging profile accepted by the provider.
- Subject identity, acquisition context, image count and image quality satisfy the selected review profile.
- A generic image MIME type is insufficient; the acquisition profile and content must match the analysis.
- This three-stage catalog places digital image analysis in bioinformatics, used here as the broader digital-analysis stage.
- Report the examined material, findings, support and limitations for the selected scope.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "1d"
}
```
