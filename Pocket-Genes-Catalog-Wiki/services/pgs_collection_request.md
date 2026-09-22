# S05. Create an actual biological sample collection request — `pgs_collection_request`

Create a request for a qualified collector or laboratory to obtain a real biological sample from the subject. This means phlebotomy, swab, saliva, biopsy, or embryo-material collection; it is not courier pickup, package pickup, truck pickup, or sample transport.

**Provider:** Origin Sample Services (`pgp_sample_logistics`)  
**Provider kind:** organization  
**Service version:** 1  
**Stages:** wet_lab

## Provider work

Verify the subject, consent, requested material, collection method, collection site, collection window, and preparation profile; schedule or perform the biological sample collection.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `collection_request` | `pgo_collection_request` | new_object |

The compact `shortContract` is backend/catalog syntax only. Native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient` | `text` | Yes | Patient or source |
| `sample_type` | `enum` | Yes | Biological material to collect |
| `collection_method` | `enum` | No | Collection method |
| `container` | `enum` | No | Container or kit |
| `requested_quantity` | `text` | No | Requested quantity |
| `collection_site` | `address` | No | Collection site |
| `scheduled_at` | `datetime` | No | Scheduled collection time |

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
        "key": "sample_type",
        "label": "Biological material to collect",
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
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "collection_method",
        "label": "Collection method",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "venous_blood_draw",
            "label": "Venous blood draw"
          },
          {
            "value": "capillary_blood_collection",
            "label": "Capillary blood collection"
          },
          {
            "value": "buccal_swab",
            "label": "Buccal swab"
          },
          {
            "value": "saliva_collection",
            "label": "Saliva collection"
          },
          {
            "value": "needle_aspiration",
            "label": "Needle aspiration"
          },
          {
            "value": "core_biopsy",
            "label": "Core biopsy"
          },
          {
            "value": "surgical_biopsy",
            "label": "Surgical biopsy"
          },
          {
            "value": "skin_punch_biopsy",
            "label": "Skin punch biopsy"
          },
          {
            "value": "amniocentesis",
            "label": "Amniocentesis"
          },
          {
            "value": "chorionic_villus_sampling",
            "label": "Chorionic villus sampling"
          },
          {
            "value": "lumbar_puncture",
            "label": "Lumbar puncture"
          },
          {
            "value": "embryo_biopsy",
            "label": "Embryo biopsy"
          },
          {
            "value": "polar_body_biopsy",
            "label": "Polar body biopsy"
          },
          {
            "value": "self_collection",
            "label": "Self-collection"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "container",
        "label": "Container or kit",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "edta_tube",
            "label": "EDTA tube"
          },
          {
            "value": "heparin_tube",
            "label": "Heparin tube"
          },
          {
            "value": "citrate_tube",
            "label": "Citrate tube"
          },
          {
            "value": "serum_tube",
            "label": "Serum tube"
          },
          {
            "value": "dna_stabilization_tube",
            "label": "DNA stabilization tube"
          },
          {
            "value": "rna_stabilization_tube",
            "label": "RNA stabilization tube"
          },
          {
            "value": "sterile_container",
            "label": "Sterile container"
          },
          {
            "value": "swab_collection_kit",
            "label": "Swab collection kit"
          },
          {
            "value": "saliva_collection_kit",
            "label": "Saliva collection kit"
          },
          {
            "value": "cryovial",
            "label": "Cryovial"
          },
          {
            "value": "filter_paper_card",
            "label": "Filter paper card"
          },
          {
            "value": "formalin_container",
            "label": "Formalin container"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "requested_quantity",
        "label": "Requested quantity",
        "type": "text",
        "required": false
      },
      {
        "key": "collection_site",
        "label": "Collection site",
        "type": "address",
        "required": false
      },
      {
        "key": "scheduled_at",
        "label": "Scheduled collection time",
        "type": "datetime",
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
      "key": "sample_type",
      "value": "blood"
    },
    {
      "key": "collection_method",
      "value": "venous_blood_draw"
    },
    {
      "key": "container",
      "value": "edta_tube"
    },
    {
      "key": "requested_quantity",
      "value": "2 mL"
    },
    {
      "key": "collection_site",
      "value": "Demo clinical collection room"
    }
  ]
}
```

## Acceptance conditions

- The request identifies the subject or source, the linked test order, the biological material to obtain, and the qualified collection method.
- The assigned provider accepts the sample collection site, time window, consent state, and preparation profile before the collection is scheduled or performed.
- This is an actual biological sample collection request. It is explicitly not a courier pickup, package pickup, truck pickup, or transport order.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- The collection_request describes the intended biological collection event. A physical sample object is created or linked only when the sample is actually obtained.
- Transportation after collection belongs to pgs_sample_transport or another explicit transport service, never to pgs_collection_request.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
