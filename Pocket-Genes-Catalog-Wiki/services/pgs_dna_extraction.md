# Extract DNA from an accepted specimen — `pgs_dna_extraction`

Produce an identified DNA sample from one compatible blood, tissue or embryo-biopsy specimen.

**Provider:** `pgp_precision_lab`. **Service version:** `1`. **Stage:** Wet Lab.

**Search visibility:** discoverable (`isHiddenFromSearch: false`).

**Provider work:** Perform the accepted extraction method and return the DNA identity, measured properties and source lineage.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| blood_sample | pgo_blood_sample | True | 1–1 |
| test_order | pgo_test_order | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| dna_sample | pgo_dna_sample | new_object |
| source_specimen | same_as:blood_sample | new_revision |

**Form shape**

`pgfs_dna_extraction` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| extraction_profile | enum | True | demo_blood_dna_v1, demo_tissue_dna_v1, demo_embryo_biopsy_dna_v1 |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_dna_extraction",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T15:05:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_dna_extraction",
    "form_shape_version": 1,
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-16T15:05:00Z"
      },
      {
        "key": "requested_by",
        "value": "user_demo_001"
      },
      {
        "key": "extraction_profile",
        "value": "demo_blood_dna_v1"
      }
    ],
    "form_shape": {
      "id": "pgfs_dna_extraction",
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
          "key": "extraction_profile",
          "label": "Extraction profile",
          "type": "enum",
          "required": true,
          "options": [
            {
              "value": "demo_blood_dna_v1",
              "label": "Demo blood DNA extraction"
            },
            {
              "value": "demo_tissue_dna_v1",
              "label": "Demo tissue DNA extraction"
            },
            {
              "value": "demo_embryo_biopsy_dna_v1",
              "label": "Demo embryo-biopsy DNA extraction"
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
  "request_id": "pgr_demo_dna_extraction",
  "service_id": "pgs_dna_extraction",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_dna_extraction",
        "revision": 1
      }
    },
    {
      "role": "blood_sample",
      "object_ref": {
        "object_id": "obj_demo_blood",
        "revision": 2
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
  "request_id": "pgr_demo_dna_extraction",
  "status": "delivered",
  "outputs": [
    {
      "role": "dna_sample",
      "object_ref": {
        "object_id": "obj_demo_dna",
        "revision": 1
      }
    },
    {
      "role": "source_specimen",
      "object_ref": {
        "object_id": "obj_demo_blood",
        "revision": 3
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- Exactly one specimen occupies the specimen slot; accepted_types are alternatives, not three required inputs.
- The specimen is received at this provider, available for the planned procedure and accepted under the selected extraction profile.
- For pgo_embryo_sample, data.material_kind must equal embryo_biopsy. A whole_embryo is rejected by this service.
- The blood, tissue or embryo-biopsy material must match the selected extraction profile.
- Resolve the explicitly supplied test_order at its pinned revision. Its data.scope.genes, reference_id and variant_classes define the requested analysis.
- Respect data.fulfillment.scope_policy=requested_only. Additional supported capability does not expand the order.
- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- The extracted DNA has its own object_id and a lineage reference to the source specimen. Record source consumption or remaining quantity in specimen tracking.
- Return a new revision of the source physical object recording consumed material and remaining quantity. This fixture consumes the entire provided aliquot. Physical execution must lock the current revision to prevent concurrent reuse.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "1d"
}
```
