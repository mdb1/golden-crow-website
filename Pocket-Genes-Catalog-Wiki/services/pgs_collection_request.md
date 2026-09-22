# Create an actual biological sample collection request — `pgs_collection_request`

Create a request for a qualified collector or laboratory to obtain a real biological sample from the subject. This means phlebotomy, swab, saliva, biopsy, or embryo-material collection; it is not courier pickup, package pickup, truck pickup, or sample transport.

**Provider:** `pgp_sample_logistics`. **Service version:** `1`. **Stage:** Wet Lab.

**Search visibility:** discoverable (`isHiddenFromSearch: false`).

**Provider work:** Verify the subject, consent, requested material, collection method, collection site, collection window, and preparation profile; schedule or perform the biological sample collection.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| test_order | pgo_test_order | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| collection_request | pgo_collection_request | new_object |

**Form shape**

`pgfs_collection_request` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| subject_id | text | True | — |
| collection_site | text | True | — |
| requested_sample_type | enum | True | blood, buccal_swab, saliva, tissue, embryo_material |
| collection_method | enum | True | phlebotomy, buccal_swab, saliva_kit, tissue_biopsy, embryo_biopsy |
| collection_window_start | datetime | True | — |
| collection_window_end | datetime | True | — |
| preparation_profile | text | True | — |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_collection_request",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:25:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_collection_request",
    "form_shape_version": 1,
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-16T12:25:00Z"
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
        "key": "collection_site",
        "value": "Demo clinical collection room, 100 Example Avenue, Demo City, AR"
      },
      {
        "key": "requested_sample_type",
        "value": "blood"
      },
      {
        "key": "collection_method",
        "value": "phlebotomy"
      },
      {
        "key": "collection_window_start",
        "value": "2026-09-16T13:00:00Z"
      },
      {
        "key": "collection_window_end",
        "value": "2026-09-16T15:00:00Z"
      },
      {
        "key": "preparation_profile",
        "value": "EDTA tube, subject identity check, consent confirmed before draw"
      }
    ],
    "form_shape": {
      "id": "pgfs_collection_request",
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
          "key": "collection_site",
          "label": "Biological sample collection site",
          "type": "text",
          "required": true,
          "options": []
        },
        {
          "key": "requested_sample_type",
          "label": "Sample type to collect",
          "type": "enum",
          "required": true,
          "options": [
            {
              "value": "blood",
              "label": "Blood draw"
            },
            {
              "value": "buccal_swab",
              "label": "Buccal swab"
            },
            {
              "value": "saliva",
              "label": "Saliva sample"
            },
            {
              "value": "tissue",
              "label": "Tissue biopsy"
            },
            {
              "value": "embryo_material",
              "label": "Embryo material collection"
            }
          ]
        },
        {
          "key": "collection_method",
          "label": "Collection method",
          "type": "enum",
          "required": true,
          "options": [
            {
              "value": "phlebotomy",
              "label": "Phlebotomy / venous blood draw"
            },
            {
              "value": "buccal_swab",
              "label": "Buccal swab performed on the subject"
            },
            {
              "value": "saliva_kit",
              "label": "Saliva kit completed by the subject"
            },
            {
              "value": "tissue_biopsy",
              "label": "Tissue biopsy performed by a qualified provider"
            },
            {
              "value": "embryo_biopsy",
              "label": "Embryo biopsy material collection"
            }
          ]
        },
        {
          "key": "collection_window_start",
          "label": "Sample collection window start",
          "type": "datetime",
          "required": true,
          "options": []
        },
        {
          "key": "collection_window_end",
          "label": "Sample collection window end",
          "type": "datetime",
          "required": true,
          "options": []
        },
        {
          "key": "preparation_profile",
          "label": "Collection preparation profile",
          "type": "text",
          "required": true,
          "options": []
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
  "request_id": "pgr_demo_collection_request",
  "service_id": "pgs_collection_request",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_collection_request",
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
  "request_id": "pgr_demo_collection_request",
  "status": "delivered",
  "outputs": [
    {
      "role": "collection_request",
      "object_ref": {
        "object_id": "obj_demo_collection",
        "revision": 1
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- The request identifies the subject or source, the linked test order, the biological material to obtain, and the qualified collection method.
- The assigned provider accepts the sample collection site, time window, consent state, and preparation profile before the collection is scheduled or performed.
- This is an actual biological sample collection request. It is explicitly not a courier pickup, package pickup, truck pickup, or transport order.
- Resolve the explicitly supplied test_order at its pinned revision. Its data.scope.genes, reference_id and variant_classes define the requested analysis.
- Respect data.fulfillment.scope_policy=requested_only. Additional supported capability does not expand the order.
- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- The collection_request describes the intended biological collection event. A physical sample object is created or linked only when the sample is actually obtained.
- Transportation after collection belongs to pgs_sample_transport or another explicit transport service, never to pgs_collection_request.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "2h"
}
```
