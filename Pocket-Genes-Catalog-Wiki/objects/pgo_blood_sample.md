# 07. Blood sample — `pgo_blood_sample`

Domain description of a distinguishable blood specimen.

**Nature:** physical  
**Stages:** wet_lab  
**Serialized extension:** `.pgblood.json`  
**Schema:** `schemas/objects/pgo_blood_sample.schema.json`  
**Example:** `examples/objects/pgo_blood_sample.pgblood.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sample_label` | `string` | Yes | Actual label or identifier used to distinguish the specimen. |
| `material` | `enum<string>` | No | Blood material. |
| `container` | `enum<string>` | No | Specimen container. |
| `volume_ml` | `number` | No | Volume in millilitres. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Physical specimen boundary

The content describes distinguishable physical material. It does not contain custody, transport, consumption, ownership, order references, source references, or file URLs. Existing operational specimen controls remain outside this content and must still prevent duplicate identity and reuse of consumed material.

## Enum choices

#### `material` choices

| Stored value | Display label |
| --- | --- |
| `whole_blood` | Whole blood |
| `plasma` | Plasma |
| `serum` | Serum |
| `buffy_coat` | Buffy coat |
| `dried_blood_spot` | Dried blood spot |
| `other` | Other |

#### `container` choices

| Stored value | Display label |
| --- | --- |
| `edta_tube` | EDTA tube |
| `heparin_tube` | Heparin tube |
| `citrate_tube` | Citrate tube |
| `serum_tube` | Serum tube |
| `dna_stabilization_tube` | DNA stabilization tube |
| `rna_stabilization_tube` | RNA stabilization tube |
| `sterile_container` | Sterile container |
| `swab_collection_kit` | Swab collection kit |
| `saliva_collection_kit` | Saliva collection kit |
| `cryovial` | Cryovial |
| `filter_paper_card` | Filter paper card |
| `formalin_container` | Formalin container |
| `other` | Other |

## Minimal example

```json
{
  "sample_label": "Blood specimen A",
  "material": "whole_blood",
  "container": "edta_tube",
  "volume_ml": 2
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
