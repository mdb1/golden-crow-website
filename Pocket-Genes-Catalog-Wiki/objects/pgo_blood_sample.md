# Blood sample — `pgo_blood_sample`

An identified blood specimen whose digital object tracks location, custody, availability and processing lineage.

| Attribute | Value |
| --- | --- |
| Nature | physical |
| Stages | Wet lab |
| Extension | .pgblood.json — tracking record for the physical item |
| Icon asset | icons/pgo_blood_sample.svg |
| Icon subject | A blood collection tube with a droplet. |
| JSON Schema | schemas/objects/pgo_blood_sample.schema.json |
| Example record | examples/objects/pgo_blood_sample.pgblood.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `subject_id` | string | Yes | Synthetic or platform-assigned subject identifier; do not infer identity from a filename. minLength: 1 |
| `order_ref` | object | Yes | The test order governing this specimen. |
| `order_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `order_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `sample_label` | string | Yes | Human-readable identifier physically applied to the specimen container. minLength: 1 |
| `state` | string | Yes | Current lifecycle state. Options: available_at_origin, in_transit, received_at_destination, processing, partially_consumed, consumed, unavailable; minLength: 1 |
| `collected_at` | string | Yes | Time the specimen or material was obtained. format: date-time; minLength: 1 |
| `collected_by` | string | Yes | Provider or professional identifier responsible for obtaining the material. minLength: 1 |
| `current_location` | object | Yes | A named physical location. |
| `current_location.location_id` | string | Yes | Registered location identifier. minLength: 1 |
| `current_location.name` | string | Yes | Display name for the current location. minLength: 1 |
| `current_location.country_code` | string | Yes | Country code for routing; two uppercase letters. minLength: 1; pattern: ^[A-Z]{2}$ |
| `custodian_id` | string | Yes | Provider or organization currently responsible for the specimen. minLength: 1 |
| `quantity` | object | Yes | A quantity with explicit units. |
| `quantity.value` | number | Yes | Non-negative remaining or collected amount. minimum: 0 |
| `quantity.unit` | string | Yes | Unit of measurement agreed by the service. minLength: 1 |
| `handling_profile` | string | Yes | Provider-defined, versioned handling profile. The fixture is not a medical handling instruction. minLength: 1 |
| `lineage_refs` | array | Yes | Parent material objects; empty for an initial collected specimen. minItems: 0 |
| `lineage_refs[].object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `lineage_refs[].revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `container_type` | string | Yes | Container profile accepted for this particular order. minLength: 1 |


**Sample object record**

```json
{
  "object_id": "obj_demo_blood",
  "object_type": "pgo_blood_sample",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:20:00Z",
  "created_by": "platform_demo_import",
  "input_refs": [],
  "data": {
    "subject_id": "subject_demo_001",
    "order_ref": {
      "object_id": "obj_demo_order",
      "revision": 1
    },
    "sample_label": "DEMO-SAMPLE-001",
    "state": "available_at_origin",
    "collected_at": "2026-09-16T12:20:00Z",
    "collected_by": "pgp_precision_lab",
    "current_location": {
      "location_id": "location_demo_origin",
      "name": "Demo collection site",
      "country_code": "AR"
    },
    "custodian_id": "pgp_precision_lab",
    "quantity": {
      "value": 1,
      "unit": "container"
    },
    "handling_profile": "handling_demo_v1",
    "lineage_refs": [],
    "container_type": "container_demo_blood_v1"
  },
  "files": []
}
```

**Validation and JSON logic**

- The .pgblood.json file is a tracking record for the physical specimen; transferring it does not transfer the specimen.
- subject_id and order_ref must match the laboratory request.
- State, custodian, location, available quantity and handling profile must be accepted before work begins.
- Transport preserves object_id and records a new revision for the changed state.
- Material derived from this specimen, such as extracted DNA, receives a new object_id with lineage_refs pointing back to this specimen.

**Linked mock services**

- Produced or updated by: `pgs_sample_transport`, `pgs_dna_extraction`
- Consumed by: `pgs_collection_request`, `pgs_sample_transport`, `pgs_dna_extraction`

**Other service opportunities**

- Blood collection and registration.
- Pickup and transport to laboratory.
- Blood specimen to extracted DNA or directly to an agreed laboratory output.
