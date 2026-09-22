# S02. Prioritize candidate genes — `pgs_gene_prioritization`

Use a symptom bundle to return a ranked or selected bundle of candidate genes for subsequent test planning.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** test_planning

## Provider work

Apply the provider method and professional review where included; return genes, evidence and ranking rationale.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `bundle_of_symptoms` | `pgo_bundle_of_symptoms` | Required 1:1 |
| Output | `candidate_genes` | `pgo_bundle_of_candidate_genes` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `ranking_mode` | `enum` | Yes | Result organization |
| `maximum_genes` | `positive_integer` | Yes | Maximum genes |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "ranking_mode",
        "label": "Result organization",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "ranked",
            "label": "Ranked list"
          },
          {
            "value": "selected",
            "label": "Selected set"
          }
        ]
      },
      {
        "key": "maximum_genes",
        "label": "Maximum genes",
        "type": "positive_integer",
        "required": true
      }
    ]
  },
  "fields": [
    {
      "key": "ranking_mode",
      "value": "ranked"
    },
    {
      "key": "maximum_genes",
      "value": 3
    }
  ]
}
```

## Acceptance conditions

- The provider accepts the symptom bundle schema and any declared terminology profile.
- The symptom bundle represents one identified subject.

## Scope rules

- Candidate status and supporting reasons must be preserved. Ranking does not establish that these genes are affected.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
