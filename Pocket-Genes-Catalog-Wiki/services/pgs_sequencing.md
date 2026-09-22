# S08. Sequence the requested scope — `pgs_sequencing`

Process an accepted DNA sample and deliver FASTQ reads supporting the contracted order scope.

**Provider:** Atlas Precision Laboratory (`pgp_precision_lab`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** wet_lab

## Provider work

Prepare and run the laboratory work, assess the requested scope, and deliver the contracted read files and support evidence.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `dna_sample` | `pgo_dna_sample` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `reads` | `pgo_sequence_reads` | new_object |
| Output | `source_dna` | `same_as:dna_sample` | new_revision |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `sequencing_profile` | `enum` | Yes | Sequencing profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
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
  },
  "fields": [
    {
      "key": "sequencing_profile",
      "value": "pg_demo_targeted_reads_v1"
    }
  ]
}
```

## Acceptance conditions

- The provider has accepted the DNA identity, quantity, quality and physical availability.
- The sequencing profile supports the order scope and requested variant classes.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- FASTQ is the output of this particular contract. A different laboratory contract may deliver BAM or VCF and combine later transformations internally.
- The digital deliverable carries the run/profile, reference and assessment evidence needed to evaluate its suitability for the order.
- Return a new revision of the source physical object recording consumed material and remaining quantity. This fixture consumes the entire provided aliquot. Physical execution must lock the current revision to prevent concurrent reuse.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
