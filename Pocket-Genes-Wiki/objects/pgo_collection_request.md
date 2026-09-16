# Collection request — `pgo_collection_request`

A formal request to a named company to pick up a specified sample at origin and deliver it to the agreed destination as part of a test order.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Wet lab |
| Extension | .pgcollection.json |
| Icon asset | icons/pgo_collection_request.svg |
| Icon subject | A small delivery van with a specimen box. |
| JSON Schema | schemas/objects/pgo_collection_request.schema.json |
| Example record | examples/objects/pgo_collection_request.pgcollection.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `order_ref` | object | Yes | Parent test order. |
| `order_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `order_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `sample_refs` | array | Yes | Identified samples included in this pickup. minItems: 1 |
| `sample_refs[].object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `sample_refs[].revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `assigned_provider_id` | string | Yes | Company formally asked to fulfill the request. minLength: 1 |
| `pickup` | object | Yes | Location and contact information for a logistics instruction. |
| `pickup.location_id` | string | Yes | Registered pickup or destination location identifier. minLength: 1 |
| `pickup.name` | string | Yes | Location display name. minLength: 1 |
| `pickup.address_line` | string | Yes | Address needed by the selected company. minLength: 1 |
| `pickup.city` | string | Yes | City. minLength: 1 |
| `pickup.country_code` | string | Yes | Country code. minLength: 1; pattern: ^[A-Z]{2}$ |
| `pickup.contact_name` | string | Yes | Contact at the site. minLength: 1 |
| `pickup.contact_phone` | string | Yes | Contact phone used for the request; synthetic in the fixture. minLength: 1 |
| `destination` | object | Yes | Location and contact information for a logistics instruction. |
| `destination.location_id` | string | Yes | Registered pickup or destination location identifier. minLength: 1 |
| `destination.name` | string | Yes | Location display name. minLength: 1 |
| `destination.address_line` | string | Yes | Address needed by the selected company. minLength: 1 |
| `destination.city` | string | Yes | City. minLength: 1 |
| `destination.country_code` | string | Yes | Country code. minLength: 1; pattern: ^[A-Z]{2}$ |
| `destination.contact_name` | string | Yes | Contact at the site. minLength: 1 |
| `destination.contact_phone` | string | Yes | Contact phone used for the request; synthetic in the fixture. minLength: 1 |
| `window_start` | string | Yes | Start of the requested pickup window. format: date-time; minLength: 1 |
| `window_end` | string | Yes | End of the requested pickup window. format: date-time; minLength: 1 |
| `handling_profile` | string | Yes | Handling profile accepted by the logistics provider. minLength: 1 |
| `status` | string | Yes | Collection-request lifecycle status. Options: requested, accepted, picked_up, delivered, cancelled; minLength: 1 |


**Sample object record**

```json
{
  "object_id": "obj_demo_collection",
  "object_type": "pgo_collection_request",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:30:00Z",
  "created_by": "pgp_sample_logistics",
  "input_refs": [
    {
      "object_id": "obj_demo_form_collection_request",
      "revision": 1
    },
    {
      "object_id": "obj_demo_order",
      "revision": 1
    },
    {
      "object_id": "obj_demo_blood",
      "revision": 1
    }
  ],
  "data": {
    "order_ref": {
      "object_id": "obj_demo_order",
      "revision": 1
    },
    "sample_refs": [
      {
        "object_id": "obj_demo_blood",
        "revision": 1
      }
    ],
    "assigned_provider_id": "pgp_sample_logistics",
    "pickup": {
      "location_id": "location_demo_origin",
      "name": "Demo collection site",
      "address_line": "100 Example Avenue",
      "city": "Demo City",
      "country_code": "AR",
      "contact_name": "Demo origin contact",
      "contact_phone": "+54-DEMO-0001"
    },
    "destination": {
      "location_id": "location_demo_lab",
      "name": "Demo laboratory",
      "address_line": "200 Example Avenue",
      "city": "Demo City",
      "country_code": "AR",
      "contact_name": "Demo laboratory contact",
      "contact_phone": "+54-DEMO-0002"
    },
    "window_start": "2026-09-16T13:00:00Z",
    "window_end": "2026-09-16T15:00:00Z",
    "handling_profile": "handling_demo_v1",
    "status": "requested"
  },
  "files": []
}
```

**Validation and JSON logic**

- This object is the addressed pickup instruction, not the physical sample.
- The pickup window must have window_end later than window_start.
- Samples must belong to the linked order, be available at the pickup location, and satisfy the selected handling profile.
- Pickup and delivery update location and custody on the same physical sample identity; they do not invent a replacement sample.
- A sample that has not yet been obtained must be collected or registered before an execution request requiring sample_refs can begin.

**Linked mock services**

- Produced or updated by: `pgs_collection_request`
- Consumed by: `pgs_sample_transport`

**Other service opportunities**

- Test order plus form to addressed pickup request once samples are identified.
- Collection request plus sample to transported sample.
- Tracking the handoff to the selected laboratory.
