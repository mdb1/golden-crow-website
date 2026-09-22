# S13. Create the final self-contained report — `pgs_final_report`

Combine the complete test order with a registered PGI payload into a final PDF for the requested objective.

**Provider:** Clarity Report Studio (`pgp_report_studio`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** bioinformatics

## Provider work

Verify the order match, native PGI schema, support evidence and scope, perform included report review, and issue a complete PDF using the selected presentation.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Input | `interactive_report` | `pgo_interactive_report` | Required 1:1 |
| Output | `report` | `pgo_pdf_report` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `language` | `enum` | Yes | Report language |
| `presentation` | `enum` | Yes | Report presentation |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "language",
        "label": "Report language",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "en",
            "label": "English"
          },
          {
            "value": "es-AR",
            "label": "Spanish, Argentina"
          }
        ]
      },
      {
        "key": "presentation",
        "label": "Report presentation",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "clinical",
            "label": "Clinical report"
          },
          {
            "value": "patient",
            "label": "Patient-facing report"
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
      "key": "language",
      "value": "en"
    },
    {
      "key": "presentation",
      "value": "clinical"
    }
  ]
}
```

## Acceptance conditions

- The order and registered PGI object identify the same subject and compatible specimen/source lineage.
- The order contains patient identity, clinical objective, suspicion and required reporting context.
- The selected provider service includes the review/issuance responsibilities required by its report profile. Rendering alone does not supply missing professional conclusions or authorizations.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- The order, registered PGI object and this service form are sufficient under this contract; do not require the original intake form or symptom bundle.
- Both successful requested-scope assessment and explicit limitations must appear in the final self-contained report as appropriate.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
