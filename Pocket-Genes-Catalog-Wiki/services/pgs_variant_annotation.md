# S11. Annotate a VCF — `pgs_variant_annotation`

Add the agreed variant annotations while preserving input identity, native variant context and analytical limitations.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Enrich variants using the provider annotation profile and record the knowledge-source versions and limitations.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `unannotated_vcf` | `pgo_unannotated_vcf` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `annotated_variants` | `pgo_annotated_vcf` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `annotation_profile` | `enum` | Yes | Annotation profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "annotation_profile",
        "label": "Annotation profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "PG_DEMO_ANN_V1",
            "label": "Demo annotation profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "annotation_profile",
      "value": "PG_DEMO_ANN_V1"
    }
  ]
}
```

## Acceptance conditions

- The VCF encoding, reference and variant representation are accepted.
- Required analytical-support information is available in the registered object.

## Scope rules

- When a supplied order cannot be supported by the input, return awaiting_input or failed with the affected scope. Without an order, preserve the input limitations and never claim a broader assessment.
- Annotation adds information about supplied variants; it cannot recover data missing from the input analysis.
- The annotated and unannotated types share .vcf but have different accepted semantic profiles.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
