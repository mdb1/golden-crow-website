# S15. Prepare a consultation summary PDF — `pgs_form_to_pdf`

Create a standalone professional summary from the submitted form, demonstrating a service with no additional input objects.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** test_planning

## Provider work

Review the submitted information within the service scope and issue a clearly labeled consultation summary.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Output | `summary` | `pgo_pdf_report` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient_name` | `text` | No | Patient name |
| `objective` | `long_text` | Yes | Document objective |
| `submitted_information` | `string_list` | Yes | Information to include |
| `language` | `enum` | Yes | Document language |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "patient_name",
        "label": "Patient name",
        "type": "text",
        "required": false
      },
      {
        "key": "objective",
        "label": "Document objective",
        "type": "long_text",
        "required": true
      },
      {
        "key": "submitted_information",
        "label": "Information to include",
        "type": "string_list",
        "required": true
      },
      {
        "key": "language",
        "label": "Document language",
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
      }
    ]
  },
  "fields": [
    {
      "key": "patient_name",
      "value": "Alex Example"
    },
    {
      "key": "objective",
      "value": "Summarize the submitted request."
    },
    {
      "key": "submitted_information",
      "value": [
        "Consultation note A",
        "Consultation note B"
      ]
    },
    {
      "key": "language",
      "value": "en"
    }
  ]
}
```

## Acceptance conditions

- The form contains the information required for the offered summary service.
- The provider labels the document as a consultation summary and preserves the source/assessment distinction.

## Scope rules

- This PDF is a planning-stage summary. Sharing pgo_pdf_report with a final genomic report does not make the two documents semantically interchangeable.
- Document-purpose and required-content profiles determine which later services can accept it.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
