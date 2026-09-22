# S07. Extract DNA from an accepted specimen — `pgs_dna_extraction`

Produce an identified DNA sample from one compatible blood, tissue or embryo-biopsy specimen.

**Provider:** Atlas Precision Laboratory (`pgp_precision_lab`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** wet_lab

## Provider work

Perform the accepted extraction method and return the DNA identity, measured properties and source lineage.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `blood_sample` | `pgo_blood_sample` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `dna_sample` | `pgo_dna_sample` | new_object |
| Output | `source_specimen` | `same_as:blood_sample` | new_revision |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `extraction_profile` | `enum` | Yes | Extraction profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
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
  },
  "fields": [
    {
      "key": "extraction_profile",
      "value": "demo_blood_dna_v1"
    }
  ]
}
```

## Acceptance conditions

- Exactly one specimen occupies the specimen slot; accepted_types are alternatives, not three required inputs.
- The specimen is received at this provider, available for the planned procedure and accepted under the selected extraction profile.
- For pgo_embryo_sample, data.material_kind must equal embryo_biopsy. A whole_embryo is rejected by this service.
- The blood, tissue or embryo-biopsy material must match the selected extraction profile.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- The extracted DNA has its own object_id and a lineage reference to the source specimen. Record source consumption or remaining quantity in specimen tracking.
- Return a new revision of the source physical object recording consumed material and remaining quantity. This fixture consumes the entire provided aliquot. Physical execution must lock the current revision to prevent concurrent reuse.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
