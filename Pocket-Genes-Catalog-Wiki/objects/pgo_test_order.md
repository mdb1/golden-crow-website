# 05. Test order — `pgo_test_order`

A standalone request for a named test on a stated patient or source and specimen type.

**Nature:** virtual  
**Stages:** test_planning, wet_lab, bioinformatics  
**Serialized extension:** `.pgorder.json`  
**Schema:** `schemas/objects/pgo_test_order.schema.json`  
**Example:** `examples/objects/pgo_test_order.pgorder.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `patient` | `string` | Yes | Patient/source name or meaningful identifier supplied for this order. |
| `test_name` | `string` | Yes | Actual requested test name. |
| `sample_type` | `enum<string>` | Yes | Specimen or material expected by the testing provider. |
| `test_type` | `enum<string>` | No | Optional broad test category. |
| `objective` | `string` | No | Optional objective for the test. |
| `clinical_suspicion` | `string` | No | Optional clinical suspicion. |
| `genes` | `array<string>` | No |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Order meaning

`patient` is readable user-supplied identity, not a mandatory Pocket Genes subject record. `test_name` is the actual requested study. `test_type` is only an optional broad category. Consent and provider suitability remain service checks.

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
| `plasma` | Plasma |
| `serum` | Serum |
| `extracted_dna` | Extracted DNA |
| `extracted_rna` | Extracted RNA |
| `other` | Other |

#### `test_type` choices

| Stored value | Display label |
| --- | --- |
| `single_gene` | Single-gene test |
| `gene_panel` | Gene panel |
| `exome_sequencing` | Exome sequencing |
| `genome_sequencing` | Genome sequencing |
| `targeted_variant_testing` | Targeted variant testing |
| `repeat_expansion_testing` | Repeat expansion testing |
| `methylation_analysis` | Methylation analysis |
| `chromosomal_microarray` | Chromosomal microarray |
| `karyotype` | Karyotype |
| `fish` | FISH |
| `other` | Other |

## Minimal example

```json
{
  "patient": "Patient AB-123",
  "test_name": "Hereditary cancer panel",
  "sample_type": "blood"
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
