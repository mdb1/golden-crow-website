# 02. Symptom bundle — `pgo_bundle_of_symptoms`

A standalone set of readable symptom observations with optional terminology coding.

**Nature:** virtual  
**Stages:** test_planning  
**Serialized extension:** `.pgsymptoms.json`  
**Schema:** `schemas/objects/pgo_bundle_of_symptoms.schema.json`  
**Example:** `examples/objects/pgo_bundle_of_symptoms.pgsymptoms.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `observations` | `array<object>` | Yes |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Observation structure

Each nonempty `observations` item requires only `label`. It may add `presence` (`present`, `absent`, or `uncertain`) and a closed `code` object containing exactly `system` and `value`. Code systems are `hpo`, `snomed_ct`, and `other`. Free text without a code is valid.

## Enum choices

#### `observations[].presence` choices

| Stored value | Display label |
| --- | --- |
| `present` | present |
| `absent` | absent |
| `uncertain` | uncertain |

#### `observations[].code.system` choices

| Stored value | Display label |
| --- | --- |
| `hpo` | hpo |
| `snomed_ct` | snomed_ct |
| `other` | other |

## Minimal example

```json
{
  "observations": [
    {
      "label": "Hearing loss",
      "presence": "present"
    }
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.
