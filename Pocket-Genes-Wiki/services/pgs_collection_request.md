# Create a formal specimen pickup request — `pgs_collection_request`

Create a company-addressed pickup instruction linked to the test order and to an existing specimen.

**Provider:** `pgp_sample_logistics`. **Stage:** Wet lab.

**Provider work:** Check pickup coverage, destination acceptance and specimen availability; issue the formal transport instruction.

**Input slots in addition to the form**

| Role | Accepted types | Required | Cardinality |
| --- | --- | --- | --- |
| test_order | pgo_test_order | True | {"min": 1, "max": 1} |
| specimen | pgo_blood_sample, pgo_tissue_sample, pgo_embryo_sample | True | {"min": 1, "max": 1} |


**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| collection_request | pgo_collection_request | new_object |


**Form shape**

`pgfs_collection_request` version `1.0.0`

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| pickup_address | text | True | — |
| destination_address | text | True | — |
| pickup_window_start | datetime | True | — |
| pickup_window_end | datetime | True | — |
| handling_profile | enum | True | [{"value": "handling_demo_v1", "label": "Demo blood transport profile"}, {"value": "demo_tissue_transport_v1", "label": "Demo tissue transport profile"}, {"value": "demo_embryo_transport_v1", "label": "Demo embryo transport profile"}] |


**Filled form**

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
    "form_shape_version": "1.0.0",
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
        "key": "pickup_address",
        "value": "100 Example Avenue, Demo City, AR"
      },
      {
        "key": "destination_address",
        "value": "200 Example Avenue, Demo City, AR"
      },
      {
        "key": "pickup_window_start",
        "value": "2026-09-16T13:00:00Z"
      },
      {
        "key": "pickup_window_end",
        "value": "2026-09-16T15:00:00Z"
      },
      {
        "key": "handling_profile",
        "value": "handling_demo_v1"
      }
    ]
  },
  "files": []
}
```

**Request**

```json
{
  "request_id": "pgr_demo_collection_request",
  "service_id": "pgs_collection_request",
  "service_version": "1.0.0",
  "form_ref": {
    "object_id": "obj_demo_form_collection_request",
    "revision": 1
  },
  "inputs": [
    {
      "role": "test_order",
      "object_ref": {
        "object_id": "obj_demo_order",
        "revision": 1
      }
    },
    {
      "role": "specimen",
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
  "request_id": "pgr_demo_collection_request",
  "status": "completed",
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

- The specimen is identified and available at origin.
- The destination laboratory accepts that specimen and handling profile.
- The receiving logistics provider is explicitly named on the resulting collection request as assigned_provider_id=pgp_sample_logistics for this offer.
- Resolve the explicitly supplied test_order at its pinned revision. Its data.scope.genes, reference_id and variant_classes define the requested analysis.
- Respect data.fulfillment.scope_policy=requested_only. Additional supported capability does not expand the order.
- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- This contract requests pickup of an existing specimen. Creating the collection_request does not create or physically collect a sample.
- Any whole-embryo movement requires an explicitly supported handling profile and provider capability; a biopsy profile cannot authorize whole-embryo transport.

**Illustrative commercial terms**

```json
{
  "price": {
    "amount": 5000,
    "currency": "ARS",
    "basis": "per accepted request",
    "is_mock": true
  },
  "turnaround": "2 business hours",
  "turnaround_starts_at": "accepted after required inputs are available; waiting for a specimen or clarification pauses the estimate",
  "tax_and_payment_policy": "Not specified in this fictional catalog",
  "failure_policy": "Assess fulfillment and remaining usable outputs; refunds or rework follow the accepted service terms. No default automatic repeat of physical work."
}
```
