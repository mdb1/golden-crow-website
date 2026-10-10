# S07. Extract DNA from an accepted specimen — `pgs_dna_extraction`

Produce an identified DNA sample from one compatible blood, tissue or embryo-biopsy specimen.

**Provider:** Atlas Precision Laboratory (`pgp_precision_lab`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** wet_lab<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Perform the accepted extraction method and return the DNA identity, measured properties and source lineage.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `blood_sample` | `pgo_blood_sample` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `dna_sample` | `pgo_dna_sample` | new_object |
| Output | `source_specimen` | `same_as:blood_sample` | new_revision |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `extraction_profile` | `enum` | Yes | Extraction profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "extraction_profile",
        "label": "Extraction profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "demo_blood_dna_v1",
            "label": "Demo blood DNA extraction"
          },
          {
            "value": "demo_tissue_dna_v1",
            "label": "Demo tissue DNA extraction"
          },
          {
            "value": "demo_embryo_biopsy_dna_v1",
            "label": "Demo embryo-biopsy DNA extraction"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "extraction_profile",
      "value": "demo_blood_dna_v1"
    }
  ]
}
```

## Acceptance conditions

- Exactly one specimen occupies the specimen slot; acceptedTypes are alternatives, not three required inputs.
- The specimen is received at this provider, available for the planned procedure and accepted under the selected extraction profile.
- For pgo_embryo_sample, data.material_kind must equal embryo_biopsy. A whole_embryo is rejected by this service.
- The blood, tissue or embryo-biopsy material must match the selected extraction profile.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- The extracted DNA has its own object_id and a lineage reference to the source specimen. Record source consumption or remaining quantity in specimen tracking.
- Return a new revision of the source physical object recording consumed material and remaining quantity. This fixture consumes the entire provided aliquot. Physical execution must lock the current revision to prevent concurrent reuse.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## More information

This fixture demonstrates the optional closed `moreInformation` map. Only non-null, non-empty sections are rendered in the modal.

```json
{
  "frequentQuestions": [
    {
      "question": "What kinds of specimens can be used?",
      "answer": "The provider reviews compatible blood, tissue, or embryo-biopsy specimens against the selected extraction profile."
    }
  ],
  "keyInsights": [
    {
      "title": "A quality DNA input starts with the specimen",
      "description": "Specimen identity, condition, and the requested downstream study determine whether extraction can proceed."
    }
  ],
  "scientificFacts": [
    {
      "title": "Extraction separates DNA from other cellular material",
      "description": "The laboratory uses a validated workflow to isolate DNA while controlling contamination and degradation."
    }
  ],
  "usefulLinks": [
    {
      "title": "DNA extraction overview",
      "url": "https://example.com/services/dna-extraction/overview"
    }
  ],
  "sampleLink": {
    "title": "Review a sample result",
    "description": "See a fictional example of the information returned after an accepted extraction workflow.",
    "buttonTitle": "Open sample",
    "url": "https://example.com/services/dna-extraction/sample"
  },
  "bulletSegments": [
    {
      "title": "Provider review",
      "description": "The laboratory confirms that the submitted specimen and order are suitable for the published workflow.",
      "imageUrl": "https://example.com/images/services/dna-extraction-review.png"
    }
  ],
  "technicalInformationFacts": [
    {
      "title": "Technical deliverables",
      "description": "The completed service registers the extracted DNA and the updated source-specimen state.",
      "subitems": [
        "Extracted DNA identity and measured properties",
        "Source-specimen revision reflecting material use"
      ]
    }
  ],
  "biologicalSampleRequirements": [
    {
      "title": "Accepted material",
      "description": "Submit one specimen compatible with the extraction profile selected in the request form.",
      "instructions": "Keep the specimen identified and follow the provider's collection, packaging, and delivery directions."
    }
  ],
  "websiteUrl": "https://example.com/services/dna-extraction"
}
```

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.
