# S09. Align sequence reads — `pgs_read_alignment`

Align accepted FASTQ reads to the order reference and return an aligned-read object.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Run the alignment and quality assessment under the declared profile; retain the transaction-bound input and selected reference context.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `sequence_reads` | `pgo_sequence_reads` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `aligned_reads` | `pgo_aligned_reads` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `alignment_profile` | `enum` | Yes | Alignment profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "alignment_profile",
        "label": "Alignment profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_alignment_v1",
            "label": "Demo alignment profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "alignment_profile",
      "value": "pg_demo_alignment_v1"
    }
  ]
}
```

## Acceptance conditions

- Read layout, encoding and sequencing profile are supported.
- The specified reference is available to the provider and agrees with the order.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
