# Prepare a consultation summary PDF — `pgs_form_to_pdf`

Create a standalone professional summary from the submitted form, demonstrating a service with no additional input objects.

**Provider:** `pgp_clinical_planning`. **Service version:** `1`. **Stage:** Test Planning.

**Search visibility:** discoverable (`isHiddenFromSearch: false`).

**Provider work:** Review the submitted information within the service scope and issue a clearly labeled consultation summary.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| summary | pgo_pdf_report | new_object |

**Form shape**

`pgfs_form_to_pdf` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| subject_id | text | True | — |
| patient_name | text | True | — |
| objective | text | True | — |
| submitted_information | string_list | True | — |
| language | enum | True | en, es-AR |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_form_to_pdf",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:00:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_form_to_pdf",
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
        "key": "patient_name",
        "value": "Alex Example"
      },
      {
        "key": "objective",
        "value": "Summarize the demonstration request"
      },
      {
        "key": "submitted_information",
        "value": [
          "Synthetic consultation note A",
          "Synthetic consultation note B"
        ]
      },
      {
        "key": "language",
        "value": "en"
      }
    ],
    "form_shape": {
      "id": "pgfs_form_to_pdf",
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
          "key": "patient_name",
          "label": "Patient name",
          "type": "text",
          "required": true,
          "options": []
        },
        {
          "key": "objective",
          "label": "Consultation objective",
          "type": "text",
          "required": true,
          "options": []
        },
        {
          "key": "submitted_information",
          "label": "Information to review",
          "type": "string_list",
          "required": true,
          "options": []
        },
        {
          "key": "language",
          "label": "Report language",
          "type": "enum",
          "required": true,
          "options": [
            {
              "value": "en",
              "label": "English"
            },
            {
              "value": "es-AR",
              "label": "Spanish, Argentina"
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
  "request_id": "pgr_demo_form_to_pdf",
  "service_id": "pgs_form_to_pdf",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_form_to_pdf",
        "revision": 1
      }
    }
  ]
}
```

**Completed result**

```json
{
  "request_id": "pgr_demo_form_to_pdf",
  "status": "delivered",
  "outputs": [
    {
      "role": "summary",
      "object_ref": {
        "object_id": "obj_demo_consultation_pdf",
        "revision": 1
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- The form contains the information required for the offered summary service.
- The provider labels the document as a consultation summary and preserves the source/assessment distinction.
- This PDF is a planning-stage summary. Sharing pgo_pdf_report with a final genomic report does not make the two documents semantically interchangeable.
- Document-purpose and required-content profiles determine which later services can accept it.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "1d"
}
```
