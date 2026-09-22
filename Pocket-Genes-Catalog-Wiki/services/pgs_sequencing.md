# Sequence the requested scope — `pgs_sequencing`

Process an accepted DNA sample and deliver FASTQ reads supporting the contracted order scope.

**Provider:** `pgp_precision_lab`. **Service version:** `1`. **Stage:** Wet Lab.

**Search visibility:** discoverable (`isHiddenFromSearch: false`).

**Provider work:** Prepare and run the laboratory work, assess the requested scope, and deliver the contracted read files and support evidence.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| dna_sample | pgo_dna_sample | True | 1–1 |
| test_order | pgo_test_order | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| reads | pgo_sequence_reads | new_object |
| source_dna | same_as:dna_sample | new_revision |

**Form shape**

`pgfs_sequencing` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| sequencing_profile | enum | True | pg_demo_targeted_reads_v1 |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_sequencing",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T16:05:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_sequencing",
    "form_shape_version": 1,
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-16T16:05:00Z"
      },
      {
        "key": "requested_by",
        "value": "user_demo_001"
      },
      {
        "key": "sequencing_profile",
        "value": "pg_demo_targeted_reads_v1"
      }
    ],
    "form_shape": {
      "id": "pgfs_sequencing",
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
          "key": "sequencing_profile",
          "label": "Sequencing profile",
          "type": "enum",
          "required": true,
          "options": [
            {
              "value": "pg_demo_targeted_reads_v1",
              "label": "Demo targeted read profile"
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
  "request_id": "pgr_demo_sequencing",
  "service_id": "pgs_sequencing",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_sequencing",
        "revision": 1
      }
    },
    {
      "role": "dna_sample",
      "object_ref": {
        "object_id": "obj_demo_dna",
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
  "request_id": "pgr_demo_sequencing",
  "status": "delivered",
  "outputs": [
    {
      "role": "reads",
      "object_ref": {
        "object_id": "obj_demo_fastq",
        "revision": 1
      }
    },
    {
      "role": "source_dna",
      "object_ref": {
        "object_id": "obj_demo_dna",
        "revision": 2
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- The provider has accepted the DNA identity, quantity, quality and physical availability.
- The sequencing profile supports the order scope and requested variant classes.
- Resolve the explicitly supplied test_order at its pinned revision. Its data.scope.genes, reference_id and variant_classes define the requested analysis.
- Respect data.fulfillment.scope_policy=requested_only. Additional supported capability does not expand the order.
- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- Carry forward data.analysis_support with status, evaluated_genes, supported_variant_classes, evidence and limitations. Do not infer an adequately assessed gene from absence of VCF rows.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- FASTQ is the output of this particular contract. A different laboratory contract may deliver BAM or VCF and combine later transformations internally.
- The digital deliverable carries the run/profile, reference and assessment evidence needed to evaluate its suitability for the order.
- Return a new revision of the source physical object recording consumed material and remaining quantity. This fixture consumes the entire provided aliquot. Physical execution must lock the current revision to prevent concurrent reuse.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "3d"
}
```
