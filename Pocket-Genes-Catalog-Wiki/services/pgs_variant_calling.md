# S10. Call variants in the requested scope — `pgs_variant_calling`

Derive an unannotated VCF from aligned reads for the contracted genes, regions and variant classes.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Call the agreed classes, assess support across the requested scope and produce a native VCF with transaction-bound input and output records.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `aligned_reads` | `pgo_aligned_reads` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `variants` | `pgo_unannotated_vcf` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `calling_profile` | `enum` | Yes | Variant-calling profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "calling_profile",
        "label": "Variant-calling profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_calling_v1",
            "label": "Demo variant-calling profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "calling_profile",
      "value": "pg_demo_calling_v1"
    }
  ]
}
```

## Acceptance conditions

- The alignment reference matches the order and the calling profile.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
