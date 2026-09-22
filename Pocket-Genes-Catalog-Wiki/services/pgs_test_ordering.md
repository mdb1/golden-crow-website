# S04. Create the test order — `pgs_test_ordering`

Combine the consent record, candidate genes and patient/request context into the formal test order.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** test_planning

## Provider work

Review consent and test selection, consolidate the patient context, and issue the order with explicit fulfillment requirements.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `informed_consent` | `pgo_informed_consent` | Required 1:1 |
| Input | `bundle_of_candidate_genes` | `pgo_bundle_of_candidate_genes` | Required 1:1 |
| Output | `test_order` | `pgo_test_order` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient` | `text` | Yes | Patient or source |
| `test_name` | `text` | Yes | Requested test name |
| `sample_type` | `enum` | Yes | Requested specimen |
| `test_type` | `enum` | No | Broad test type |
| `objective` | `long_text` | No | Objective |
| `clinical_suspicion` | `long_text` | No | Clinical suspicion |
| `genes` | `string_list` | No | Genes |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "patient",
        "label": "Patient or source",
        "type": "text",
        "required": true
      },
      {
        "key": "test_name",
        "label": "Requested test name",
        "type": "text",
        "required": true
      },
      {
        "key": "sample_type",
        "label": "Requested specimen",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "blood",
            "label": "Blood"
          },
          {
            "value": "dried_blood_spot",
            "label": "Dried blood spot"
          },
          {
            "value": "saliva",
            "label": "Saliva"
          },
          {
            "value": "buccal_swab",
            "label": "Buccal swab"
          },
          {
            "value": "tissue",
            "label": "Tissue"
          },
          {
            "value": "skin_biopsy",
            "label": "Skin biopsy"
          },
          {
            "value": "bone_marrow_aspirate",
            "label": "Bone marrow aspirate"
          },
          {
            "value": "bone_marrow_core",
            "label": "Bone marrow core biopsy"
          },
          {
            "value": "amniotic_fluid",
            "label": "Amniotic fluid"
          },
          {
            "value": "chorionic_villi",
            "label": "Chorionic villi"
          },
          {
            "value": "cord_blood",
            "label": "Cord blood"
          },
          {
            "value": "cerebrospinal_fluid",
            "label": "Cerebrospinal fluid"
          },
          {
            "value": "urine",
            "label": "Urine"
          },
          {
            "value": "stool",
            "label": "Stool"
          },
          {
            "value": "hair_follicles",
            "label": "Hair follicles"
          },
          {
            "value": "nail_clippings",
            "label": "Nail clippings"
          },
          {
            "value": "semen",
            "label": "Semen"
          },
          {
            "value": "embryo_biopsy",
            "label": "Embryo biopsy"
          },
          {
            "value": "whole_embryo",
            "label": "Whole embryo"
          },
          {
            "value": "polar_body",
            "label": "Polar body"
          },
          {
            "value": "plasma",
            "label": "Plasma"
          },
          {
            "value": "serum",
            "label": "Serum"
          },
          {
            "value": "extracted_dna",
            "label": "Extracted DNA"
          },
          {
            "value": "extracted_rna",
            "label": "Extracted RNA"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "test_type",
        "label": "Broad test type",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "single_gene",
            "label": "Single-gene test"
          },
          {
            "value": "gene_panel",
            "label": "Gene panel"
          },
          {
            "value": "exome_sequencing",
            "label": "Exome sequencing"
          },
          {
            "value": "genome_sequencing",
            "label": "Genome sequencing"
          },
          {
            "value": "targeted_variant_testing",
            "label": "Targeted variant testing"
          },
          {
            "value": "repeat_expansion_testing",
            "label": "Repeat expansion testing"
          },
          {
            "value": "methylation_analysis",
            "label": "Methylation analysis"
          },
          {
            "value": "chromosomal_microarray",
            "label": "Chromosomal microarray"
          },
          {
            "value": "karyotype",
            "label": "Karyotype"
          },
          {
            "value": "fish",
            "label": "FISH"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "objective",
        "label": "Objective",
        "type": "long_text",
        "required": false
      },
      {
        "key": "clinical_suspicion",
        "label": "Clinical suspicion",
        "type": "long_text",
        "required": false
      },
      {
        "key": "genes",
        "label": "Genes",
        "type": "string_list",
        "required": false
      }
    ]
  },
  "fields": [
    {
      "key": "patient",
      "value": "Patient AB-123"
    },
    {
      "key": "test_name",
      "value": "Hereditary cancer panel"
    },
    {
      "key": "sample_type",
      "value": "blood"
    },
    {
      "key": "test_type",
      "value": "gene_panel"
    },
    {
      "key": "objective",
      "value": "Evaluate an inherited cancer predisposition."
    },
    {
      "key": "genes",
      "value": [
        "BRCA1",
        "BRCA2"
      ]
    }
  ]
}
```

## Acceptance conditions

- Patient and subject references agree across the form and input objects.
- The consent is accepted and its scope covers the proposed order.
- The provider confirms the selected tests and scope within its offered test-ordering process.

## Scope rules

- Create pgo_test_order content from the patient, test name and sample type actually supplied, plus only the optional context the requester provided.
- Consent checks and provider suitability checks remain service responsibilities and are not fabricated inside the order content.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
