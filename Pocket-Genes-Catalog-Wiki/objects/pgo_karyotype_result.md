# 19. Karyotype result — `pgo_karyotype_result`

A karyotype notation with an optional readable professional interpretation.

**Nature:** virtual  
**Stages:** bioinformatics  
**Serialized extension:** `.pgkaryotype.json`  
**Schema:** `schemas/objects/pgo_karyotype_result.schema.json`  
**Example:** `examples/objects/pgo_karyotype_result.pgkaryotype.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `result_notation` | `string` | Yes | Actual karyotype result notation. |
| `interpretation` | `string` | No | Optional readable interpretation. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Result meaning

`result_notation` is the actual karyotype notation. Professional interpretation is optional; notes may communicate additional readable limitations. Images are separate objects when they exist and are not mandatory dependencies.



## Minimal example

```json
{
  "result_notation": "46,XX",
  "interpretation": "No numerical chromosome abnormality was identified."
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
