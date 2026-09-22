# 01. Form — `pgo_form`

A completed form with its frozen field definitions and typed answers.

**Nature:** virtual  
**Stages:** test_planning, wet_lab, bioinformatics  
**Serialized extension:** `.pgform.json`  
**Schema:** `schemas/objects/pgo_form.schema.json`  
**Example:** `examples/objects/pgo_form.pgform.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `form_shape` | `object` | Yes | Frozen form shape. |
| `fields` | `array<object>` | Yes | Submitted answers. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Frozen form structure

`form_shape` contains exactly `fields`. Definitions stay ordered. Every definition requires `key`, `label`, `type`, and `required`; only `options` and `help_info_text` are optional. `options` is required and nonempty only for `enum` and `multi_enum`, and must be omitted for every other type.

Answers contain exactly `key` and `value`. Keys must be unique and declared by the frozen shape. Values are validated against the matching definition, including enum membership and numeric array element types. Optional unanswered fields may be absent. An empty answer array is valid when no required field is unanswered.

Supported definition types:

`text`, `long_text`, `email`, `phone`, `url`, `address`, `postal_code`, `country_code`, `identifier`, `number`, `integer`, `positive_integer`, `percentage`, `boolean`, `date`, `datetime`, `time`, `enum`, `multi_enum`, `string_list`, `integer_list`, `number_list`.

There are no universal `requested_at`, `requested_by`, or `subject_id` questions. Request identity and time belong to the service transaction. Shape IDs and versions belong to the service-offer configuration, not this content.

## Enum choices

#### `form_shape.fields[].type` choices

| Stored value | Display label |
| --- | --- |
| `text` | text |
| `long_text` | long_text |
| `email` | email |
| `phone` | phone |
| `url` | url |
| `address` | address |
| `postal_code` | postal_code |
| `country_code` | country_code |
| `identifier` | identifier |
| `number` | number |
| `integer` | integer |
| `positive_integer` | positive_integer |
| `percentage` | percentage |
| `boolean` | boolean |
| `date` | date |
| `datetime` | datetime |
| `time` | time |
| `enum` | enum |
| `multi_enum` | multi_enum |
| `string_list` | string_list |
| `integer_list` | integer_list |
| `number_list` | number_list |

## Minimal example

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "presentation",
        "label": "Report presentation",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "clinical",
            "label": "Clinical"
          },
          {
            "value": "patient",
            "label": "For the patient"
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
      "key": "presentation",
      "value": "clinical"
    }
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Definition and answer keys must each be unique.
- Every answer key must be declared by the frozen form shape and match its declared type.
- enum and multi_enum require nonempty options; all other field types must omit options.
- Optional unanswered fields may be omitted and fields may be empty when no required answer exists.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.
