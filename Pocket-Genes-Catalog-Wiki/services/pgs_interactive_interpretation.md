# S12. Produce an interactive genomic result — `pgs_interactive_interpretation`

Convert an annotated VCF into a registered Pocket Genes interactive report backed by a native MyDNAMap .pgi1.json payload that matches MDMAPIModel.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Produce or register a native PGI payload, validate it against the matching provider schema, attach support evidence and limitations, and return the Pocket Genes registration object.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `annotated_vcf` | `pgo_annotated_vcf` | Required 1:1 |
| Output | `interactive_report` | `pgo_interactive_report` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `interpretation_profile` | `enum` | Yes | Interactive report profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "interpretation_profile",
        "label": "Interactive report profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_mdm_pgi1_v1",
            "label": "Demo PGI1 MDMAPIModel profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "interpretation_profile",
      "value": "pg_demo_mdm_pgi1_v1"
    }
  ]
}
```

## Acceptance conditions

- The requested demo result is .pgi1.json version 1.0.0 and must validate against schemas/protocol/pgi1-mdm.schema.json.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Scope rules

- The demo genomic content is derived from the VCF and registered as a native MDMAPIModel payload; a symptom bundle is not an input.
- Carry source scope and limitations into the Pocket Genes registration object. A pipeline compares that declared support with its linked order.
- No test_order is a required input to this specific conversion. It can be purchased for an existing compatible annotated VCF.
- PGI2/AGAPIModel and PGI3/TwoPQAPIModel use the same pgo_interactive_report registration concept, but require their own native payload sources and schemas.
- Clinical relevance or report sections live in the native PGI payload and provider profile; patient-specific conclusions belong to the appropriately scoped reporting service.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
