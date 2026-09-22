# S14. Analyze a metaphase image bundle — `pgs_karyotype_analysis`

Review a compatible bundle of metaphase images and return a structured karyotype result without a sequencing step.

**Provider:** Chromosome Image Services (`pgp_cytogenetics`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Perform digital image analysis and the professional review included in the offered cytogenetics service.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `image_bundle` | `pgo_image_bundle` | Required 1:1 |
| Output | `karyotype_result` | `pgo_karyotype_result` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `objective` | `long_text` | No | Analysis objective |
| `analysis_profile` | `enum` | Yes | Analysis profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "objective",
        "label": "Analysis objective",
        "type": "long_text",
        "required": false
      },
      {
        "key": "analysis_profile",
        "label": "Analysis profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_metaphase_review_v1",
            "label": "Demo metaphase image review"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "objective",
      "value": "Review the supplied metaphase images."
    },
    {
      "key": "analysis_profile",
      "value": "pg_demo_metaphase_review_v1"
    }
  ]
}
```

## Acceptance conditions

- The image bundle declares a metaphase-imaging profile accepted by the provider.
- Subject identity, acquisition context, image count and image quality satisfy the selected review profile.

## Scope rules

- A generic image MIME type is insufficient; the acquisition profile and content must match the analysis.
- This three-stage catalog places digital image analysis in bioinformatics, used here as the broader digital-analysis stage.
- Report the examined material, findings, support and limitations for the selected scope.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
