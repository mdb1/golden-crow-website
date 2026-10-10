# S01. Structure submitted symptoms — `pgs_symptom_intake`

Turn the submitted observations into a reusable symptom bundle. A professional or organization can supply this service.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** test_planning<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Review the form, clarify wording if needed, and return structured entries with transaction-bound context.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Output | `symptoms` | `pgo_bundle_of_symptoms` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

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

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
