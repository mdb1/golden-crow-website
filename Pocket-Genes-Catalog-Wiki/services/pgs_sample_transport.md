# Transport an already collected specimen — `pgs_sample_transport`

Move an already biologically collected physical specimen from origin to destination and record custody and receipt.

This is the transport service. It does not create a `collection_request`, replace a `collection_request`, or describe the act of collecting the biological sample from the subject. The `collection_request` input documents the prior or intended biological sample collection event; this service only moves a sample that already exists.

**Provider:** `pgp_sample_logistics`. **Service version:** `1`. **Stage:** Wet Lab.

**Provider work:** Perform the physical handoff and transport of the existing specimen, record custody, and obtain destination receipt.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| collection_request | pgo_collection_request | True | 1–1 |
| blood_sample | pgo_blood_sample | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| delivered_specimen | same_as:blood_sample | new_revision |

**Form shape**

`pgfs_sample_transport` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| contact_name | text | True | — |
| contact_phone | text | True | — |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_sample_transport",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:35:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_sample_transport",
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
        "key": "contact_name",
        "value": "Example Contact"
      },
      {
        "key": "contact_phone",
        "value": "+54-DEMO-ONLY"
      }
    ]
  },
  "files": []
}
```

**Request**

```json
{
  "request_id": "pgr_demo_sample_transport",
  "service_id": "pgs_sample_transport",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_sample_transport",
        "revision": 1
      }
    },
    {
      "role": "collection_request",
      "object_ref": {
        "object_id": "obj_demo_collection",
        "revision": 1
      }
    },
    {
      "role": "blood_sample",
      "object_ref": {
        "object_id": "obj_demo_blood",
        "revision": 1
      }
    }
  ]
}
```

**Completed result**

```json
{
  "request_id": "pgr_demo_sample_transport",
  "status": "completed",
  "outputs": [
    {
      "role": "delivered_specimen",
      "object_ref": {
        "object_id": "obj_demo_blood",
        "revision": 2
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- The specimen reference identifies a real sample that has already been biologically collected.
- Pickup and delivery locations, availability and handling requirements must be accepted before dispatch.
- The `collection_request` input documents the prior or intended biological sample collection; it is not the transport order itself.
- The specimen type and material_kind remain unchanged.
- Preserve object_id; return a new revision with destination, custody events and receipt status.
- If collection or receipt fails, record the real state. Do not fabricate a delivered specimen or create another pickup automatically.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "1d"
}
```
