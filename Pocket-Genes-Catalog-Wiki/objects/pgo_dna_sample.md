# 10. Extracted DNA sample — `pgo_dna_sample`

Domain description of a distinguishable extracted DNA specimen.

**Nature:** physical  
**Stages:** wet_lab  
**Serialized extension:** `.pgdna.json`  
**Schema:** `schemas/objects/pgo_dna_sample.schema.json`  
**Example:** `examples/objects/pgo_dna_sample.pgdna.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sample_label` | `string` | Yes | Actual label or identifier used to distinguish the specimen. |
| `volume_ul` | `number` | No | Volume in microlitres. |
| `concentration_ng_ul` | `number` | No | Concentration in nanograms per microlitre. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Physical specimen boundary

The content describes distinguishable physical material. It does not contain custody, transport, consumption, ownership, order references, source references, or file URLs. Existing operational specimen controls remain outside this content and must still prevent duplicate identity and reuse of consumed material.



## Minimal example

```json
{
  "sample_label": "DNA aliquot A",
  "volume_ul": 40,
  "concentration_ng_ul": 25
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
