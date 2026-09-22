# Form Shape Field Contract

## Two distinct boundaries

The service offer's external `formShape` is camelCase configuration with generated `id`, integer `version`, ordered `fields`, and `allowUnknownFields: false`. The strict `pgo_form` content is snake_case and contains only `form_shape`, `fields`, and optional `notes`. Its embedded `form_shape` contains exactly `fields`; IDs, versions and allow-unknown flags are forbidden content.

### Frozen form structure

`form_shape` contains exactly `fields`. Definitions stay ordered. Every definition requires `key`, `label`, `type`, and `required`; only `options` and `help_info_text` are optional. `options` is required and nonempty only for `enum` and `multi_enum`, and must be omitted for every other type.

Field keys use `^[a-z][a-z0-9_]{0,63}$`. Labels contain 1 to 120 characters and optional `help_info_text` contains 1 to 500 characters after trimming. Each option value contains 1 to 128 characters and matches `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`; its readable label contains 1 to 120 characters. Option values are unique within the field.

Answers contain exactly `key` and `value`. Keys must be unique and declared by the frozen shape. Values are validated against the matching definition, including enum membership and numeric array element types. Optional unanswered fields may be absent. An empty answer array is valid when no required field is unanswered.

Supported definition types:

`text`, `long_text`, `email`, `phone`, `url`, `address`, `postal_code`, `country_code`, `identifier`, `number`, `integer`, `positive_integer`, `percentage`, `boolean`, `date`, `datetime`, `time`, `enum`, `multi_enum`, `string_list`, `integer_list`, `number_list`.

There are no universal `requested_at`, `requested_by`, or `subject_id` questions. Request identity and time belong to the service transaction. Shape IDs and versions belong to the service-offer configuration, not this content.

## Field validation

- `email`: syntactically valid email.
- `phone`: E.164, beginning with `+`, with no spaces.
- `url`: absolute HTTPS URL.
- `country_code`: uppercase ISO 3166-1 alpha-2.
- `identifier`: constrained stable identifier syntax.
- `integer` and `positive_integer`: integral numeric values; positive means greater than zero.
- `percentage`: numeric 0 through 100.
- `date`, `datetime`, and `time`: their declared temporal formats.
- `enum`: one stored option value.
- `multi_enum`: unique option values in declaration order.
- `string_list`, `integer_list`, and `number_list`: typed arrays; numeric arrays stay numeric.

Inline validation errors clear when the user edits the field. Optional unanswered fields are omitted. `help_info_text` is optional, requester-facing guidance shown from the field info control.

## Example

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
