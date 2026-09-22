# 06. Sample collection request — `pgo_collection_request`

A request to obtain biological material; it is not courier pickup or specimen transport.

**Nature:** virtual  
**Stages:** wet_lab  
**Serialized extension:** `.pgcollection.json`  
**Schema:** `schemas/objects/pgo_collection_request.schema.json`  
**Example:** `examples/objects/pgo_collection_request.pgcollection.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `patient` | `string` | Yes | Patient/source name or meaningful identifier for collection. |
| `sample_type` | `enum<string>` | Yes | Biological material to obtain. |
| `collection_method` | `enum<string>` | No | Method used to obtain the biological material. |
| `container` | `enum<string>` | No | Collection container or kit. |
| `requested_quantity` | `string` | No | Readable quantity including its unit, for example 2 mL. |
| `collection_site` | `string` | No | Readable collection location. |
| `scheduled_at` | `string` | No | Scheduled collection time. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Biological collection only

This object asks for the act of obtaining biological material from a person or source. It never means courier pickup, shipping, or transport. Only `patient` and `sample_type` are required; scheduling and collection arrangements remain optional.

## Enum choices

#### `sample_type` choices

| Stored value | Display label |
| --- | --- |
| `blood` | Blood |
| `dried_blood_spot` | Dried blood spot |
| `saliva` | Saliva |
| `buccal_swab` | Buccal swab |
| `tissue` | Tissue |
| `skin_biopsy` | Skin biopsy |
| `bone_marrow_aspirate` | Bone marrow aspirate |
| `bone_marrow_core` | Bone marrow core biopsy |
| `amniotic_fluid` | Amniotic fluid |
| `chorionic_villi` | Chorionic villi |
| `cord_blood` | Cord blood |
| `cerebrospinal_fluid` | Cerebrospinal fluid |
| `urine` | Urine |
| `stool` | Stool |
| `hair_follicles` | Hair follicles |
| `nail_clippings` | Nail clippings |
| `semen` | Semen |
| `embryo_biopsy` | Embryo biopsy |
| `whole_embryo` | Whole embryo |
| `polar_body` | Polar body |
| `other` | Other |

#### `collection_method` choices

| Stored value | Display label |
| --- | --- |
| `venous_blood_draw` | Venous blood draw |
| `capillary_blood_collection` | Capillary blood collection |
| `buccal_swab` | Buccal swab |
| `saliva_collection` | Saliva collection |
| `needle_aspiration` | Needle aspiration |
| `core_biopsy` | Core biopsy |
| `surgical_biopsy` | Surgical biopsy |
| `skin_punch_biopsy` | Skin punch biopsy |
| `amniocentesis` | Amniocentesis |
| `chorionic_villus_sampling` | Chorionic villus sampling |
| `lumbar_puncture` | Lumbar puncture |
| `embryo_biopsy` | Embryo biopsy |
| `polar_body_biopsy` | Polar body biopsy |
| `self_collection` | Self-collection |
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
  "patient": "Patient AB-123",
  "sample_type": "blood",
  "collection_method": "venous_blood_draw",
  "container": "edta_tube"
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
