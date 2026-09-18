# Extracted DNA sample — `pgo_dna_sample`

Extracted DNA represented as a physical material object available for a compatible laboratory service.

| Attribute | Value |
| --- | --- |
| Nature | physical |
| Stages | Wet lab |
| Extension | .pgdna.json — tracking record for the physical item |
| Icon asset | icons/pgo_dna_sample.svg |
| Icon subject | A small sample tube containing a DNA helix. |
| JSON Schema | schemas/objects/pgo_dna_sample.schema.json |
| Example record | examples/objects/pgo_dna_sample.pgdna.json |


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
| `concentration` | object | Yes | A quantity with explicit units. |
| `concentration.value` | number | Yes | Non-negative remaining or collected amount. minimum: 0 |
| `concentration.unit` | string | Yes | Unit of measurement agreed by the service. minLength: 1 |
| `extraction_method` | string | Yes | Extraction method or process identifier. minLength: 1 |
| `source_sample_ref` | object | Yes | Physical specimen from which DNA was extracted. |
| `source_sample_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `source_sample_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |


**Sample object record**

```json
{
  "object_id": "obj_demo_dna",
  "object_type": "pgo_dna_sample",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T16:00:00Z",
  "created_by": "pgp_precision_lab",
  "input_refs": [
    {
      "object_id": "obj_demo_form_dna_extraction",
      "revision": 1
    },
    {
      "object_id": "obj_demo_blood",
      "revision": 2
    },
    {
      "object_id": "obj_demo_order",
      "revision": 1
    }
  ],
  "data": {
    "subject_id": "subject_demo_001",
    "order_ref": {
      "object_id": "obj_demo_order",
      "revision": 1
    },
    "sample_label": "DEMO-DNA-001",
    "state": "received_at_destination",
    "collected_at": "2026-09-16T16:00:00Z",
    "collected_by": "pgp_precision_lab",
    "current_location": {
      "location_id": "location_demo_lab",
      "name": "Demo laboratory",
      "country_code": "AR"
    },
    "custodian_id": "pgp_precision_lab",
    "quantity": {
      "value": 20,
      "unit": "uL"
    },
    "handling_profile": "handling_demo_dna_v1",
    "lineage_refs": [
      {
        "object_id": "obj_demo_blood",
        "revision": 2
      }
    ],
    "concentration": {
      "value": 5,
      "unit": "ng/uL"
    },
    "extraction_method": "extraction_demo_v1",
    "source_sample_ref": {
      "object_id": "obj_demo_blood",
      "revision": 2
    }
  },
  "files": []
}
```

**Validation and JSON logic**

- source_sample_ref and lineage_refs must identify the source material consistently.
- Concentration and volume use explicit units and must meet the receiving service requirements.
- Available material must be updated when a service consumes all or part of the DNA sample.

**Linked mock services**

- Produced or updated by: `pgs_dna_extraction`, `pgs_sequencing`
- Consumed by: `pgs_sequencing`

**Other service opportunities**

- Blood or tissue to extracted DNA.
- DNA sample plus test order to sequence reads.
- DNA sample to an agreed variant file through a combined laboratory service.
