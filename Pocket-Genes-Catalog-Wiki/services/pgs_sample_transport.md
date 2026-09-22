# S06. Transport an already collected specimen — `pgs_sample_transport`

Move an already biologically collected physical specimen from origin to destination and record custody and receipt. This is the transport service; it does not create or replace the biological sample collection request.

**Provider:** Origin Sample Services (`pgp_sample_logistics`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** wet_lab

## Provider work

Perform the physical handoff and transport of the existing specimen, record custody, and obtain destination receipt.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `collection_request` | `pgo_collection_request` | Required 1:1 |
| Input | `blood_sample` | `pgo_blood_sample` | Required 1:1 |
| Output | `delivered_specimen` | `same_as:blood_sample` | new_revision |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `contact_name` | `text` | Yes | Contact name |
| `contact_phone` | `phone` | Yes | Contact phone |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "contact_name",
        "label": "Contact name",
        "type": "text",
        "required": true
      },
      {
        "key": "contact_phone",
        "label": "Contact phone",
        "type": "phone",
        "required": true
      }
    ]
  },
  "fields": [
    {
      "key": "contact_name",
      "value": "Example Contact"
    },
    {
      "key": "contact_phone",
      "value": "+541155551234"
    }
  ]
}
```

## Acceptance conditions

- The specimen reference identifies a real sample that has already been biologically collected.
- The transport provider accepts pickup and delivery locations, availability and handling requirements before dispatch.
- The collection_request input documents the prior or intended biological sample collection; it is not the transport order itself.

## Scope rules

- Reject references where object_type or revision differ from the submitted collection_request and physical specimen.
- Preserve object_id; return a new revision with destination, custody events and receipt status.
- If transport or receipt fails, record the real state. Do not fabricate a delivered specimen or create another pickup automatically.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
