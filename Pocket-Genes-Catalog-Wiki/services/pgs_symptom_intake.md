# S01. Structure submitted symptoms — `pgs_symptom_intake`

Turn the submitted observations into a reusable symptom bundle. A professional or organization can supply this service.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** test_planning

## Provider work

Review the form, clarify wording if needed, and return structured entries with transaction-bound context.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Output | `symptoms` | `pgo_bundle_of_symptoms` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `observations` | `string_list` | Yes | Reported observations |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "observations",
        "label": "Reported observations",
        "type": "string_list",
        "required": true
      }
    ]
  },
  "fields": [
    {
      "key": "observations",
      "value": [
        "Hearing loss",
        "Balance difficulties"
      ]
    }
  ]
}
```

## Acceptance conditions

- The form identifies one subject and contains at least one observation.
- Record whether each structured item is reported, observed or uncertain; do not silently replace a report with a confirmed finding.

## Scope rules

- This service structures supplied information; it does not itself establish a diagnosis.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
