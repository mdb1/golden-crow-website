# S03. Record informed consent — `pgs_informed_consent`

Receive the completed consent-specific form and produce an informed-consent record for the stated scope.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** test_planning

## Provider work

Present or verify the consent material and record the completed consent process as specified by the provider service.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Output | `consent` | `pgo_informed_consent` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient` | `text` | Yes | Patient or source |
| `consent_title` | `text` | Yes | Consent title |
| `consent_text` | `long_text` | Yes | Consent text |
| `signer_name` | `text` | No | Expected signer name |
| `signer_capacity` | `enum` | No | Expected signer capacity |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "patient",
        "label": "Patient or source",
        "type": "text",
        "required": true
      },
      {
        "key": "consent_title",
        "label": "Consent title",
        "type": "text",
        "required": true
      },
      {
        "key": "consent_text",
        "label": "Consent text",
        "type": "long_text",
        "required": true
      },
      {
        "key": "signer_name",
        "label": "Expected signer name",
        "type": "text",
        "required": false
      },
      {
        "key": "signer_capacity",
        "label": "Expected signer capacity",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "self",
            "label": "Self"
          },
          {
            "value": "representative",
            "label": "Representative"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "patient",
      "value": "Patient AB-123"
    },
    {
      "key": "consent_title",
      "value": "Consent for genetic testing"
    },
    {
      "key": "consent_text",
      "value": "Please review the purpose, implications and limitations of the proposed genetic test."
    },
    {
      "key": "signer_name",
      "value": "Alex Example"
    },
    {
      "key": "signer_capacity",
      "value": "self"
    }
  ]
}
```

## Acceptance conditions

- The consent text, its version, signer identity and signature or acceptance evidence must be recoverable in the resulting object.
- Only an accepted consent for the appropriate scope can satisfy the test-ordering contract. A submission alone is not proof of valid consent.

## Scope rules

- The record retains what was consented to, when and by whom. Subsequent use must fit that scope.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
