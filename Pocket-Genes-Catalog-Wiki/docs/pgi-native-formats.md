# PGI Native JSON Format Rules

This document is the exact native JSON contract for the three provider payload extensions used by Pocket Genes and the app decoder.

| Extension | Native Swift model | Provider format key | Meaning |
| --- | --- | --- | --- |
| `.pgi1.json` | `MDMAPIModel` | `mdm` | MyDNAMap full genome JSON. |
| `.pgi2.json` | `AGAPIModel` | `ag` | ActyonGenomics visual/clinical JSON. |
| `.pgi3.json` | `TwoPQAPIModel` | `2pq` | 2PQ reproductive case graph JSON. |

General rules:

- The root JSON must be the native model itself. It is not wrapped in `object_id`, `object_type`, or `data`.
- Extension, API model, provider format key, schema path, payload path suffix and media type are a closed tuple. Cross-combinations are invalid:
  - `.pgi1.json` = `MDMAPIModel` = `mdm` = `schemas/protocol/pgi1-mdm.schema.json` = `application/vnd.pocketgenes.pgi1+json`.
  - `.pgi2.json` = `AGAPIModel` = `ag` = `schemas/protocol/pgi2-ag.schema.json` = `application/vnd.pocketgenes.pgi2+json`.
  - `.pgi3.json` = `TwoPQAPIModel` = `2pq` = `schemas/protocol/pgi3-2pq.schema.json` = `application/vnd.pocketgenes.pgi3+json`.
- A `.pgi1.json` payload must never be accepted as `AGAPIModel` or `TwoPQAPIModel`, even if a decoder could parse overlapping fields. The same rule applies to `.pgi2.json` and `.pgi3.json`.
- The Pocket Genes object envelope for `pgo_interactive_report` must keep the same closed tuple in `data.native_format`, and `data.payload_ref` must point to bytes whose path and media type match that exact tuple.
- Non-nullable means the Swift property is not optional. The key must be present and the value must not be JSON null; otherwise native `JSONDecoder` fails.
- Nullable/omittable means the Swift property is optional. The key may be absent or present with JSON null; both decode to nil.
- Arrays are non-null when the property is non-optional, but they may be empty unless a semantic rule below says otherwise.
- Unknown keys are rejected by these exchange schemas even though Swift decoding may ignore extra JSON. Pocket Genes should prefer strict exchange files.
- Strings that represent dates remain strings at this layer because the native Swift models store them as `String`, not `Date`.
- `AncestryAPIModel.LineageInfoAPIModel.description` intentionally uses the JSON key `desription` because that is the current native `CodingKeys` spelling.

## .pgi1.json — `MDMAPIModel`

A `.pgi1.json` file must decode as `MDMAPIModel`. It contains every MyDNAMap section the app expects for full-genome browsing.

Provider format key: `mdm`.

| Model / field | JSON type | Nullable or omittable | Rule |
| --- | --- | --- | --- |
| `MDMAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `MDMAPIModel.panels` | array<PanelAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MDMAPIModel.pharmacos` | PharmageneticAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MDMAPIModel.pathology` | PathologyAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MDMAPIModel.ancestry` | AncestryAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MDMAPIModel.variants` | array<VariantAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `PanelAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `PanelAPIModel.id` | integer | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PanelAPIModel.background_image` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `PanelAPIModel.name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PanelAPIModel.description` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PanelAPIModel.categories` | array<CategoryAPIModel> or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `CategoryAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `CategoryAPIModel.name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `CategoryAPIModel.description` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `CategoryAPIModel.category_icon` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `CategoryAPIModel.genome` | array<GenomeAPIModel> or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `CategoryAPIModel.ideal_gen_percentage` | number or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `GenomeAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `GenomeAPIModel.gen` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenomeAPIModel.snp` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenomeAPIModel.ideal_gen` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `GenomeAPIModel.my_gen` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `PharmageneticAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `PharmageneticAPIModel.name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PharmageneticAPIModel.description` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PharmageneticAPIModel.categories` | array<PharmageneticCategoryAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `PharmageneticCategoryAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `PharmageneticCategoryAPIModel.name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PharmageneticCategoryAPIModel.sf_icon` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `PharmageneticCategoryAPIModel.types` | array<DrugCategoryAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `DrugCategoryAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `DrugCategoryAPIModel.name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `DrugCategoryAPIModel.sf_icon` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `DrugCategoryAPIModel.drugs` | array<DrugsLevelAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `DrugsLevelAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `DrugsLevelAPIModel.name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `DrugsLevelAPIModel.risk` | enum<low, medium, high, veryHigh> or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `DrugsLevelAPIModel.description` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `DrugsLevelAPIModel.analyzed_genes` | array<DrugGenAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `DrugsLevelAPIModel.result` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `DrugGenAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `DrugGenAPIModel.gen` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `DrugGenAPIModel.genotype` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `DrugGenAPIModel.effect` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `DrugGenAPIModel.conclusion` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `PathologyAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `PathologyAPIModel.name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PathologyAPIModel.description` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PathologyAPIModel.categories` | array<PathologyCategory> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `PathologyCategory` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `PathologyCategory.category_icon` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PathologyCategory.name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PathologyCategory.description` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `PathologyCategory.conditions` | array<ConditionAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `ConditionAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `ConditionAPIModel.condition` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `ConditionAPIModel.is_genetic_variant` | boolean | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `ConditionAPIModel.gen_variant` | GenVariantAPIModel or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `GenVariantAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `GenVariantAPIModel.title` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantAPIModel.icon` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantAPIModel.condition` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantAPIModel.explanation` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantAPIModel.gen_info` | GenVariantInfoAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `GenVariantInfoAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `GenVariantInfoAPIModel.gen` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantInfoAPIModel.nm` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantInfoAPIModel.c_dna` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantInfoAPIModel.protein` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantInfoAPIModel.cigosity` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantInfoAPIModel.depth` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantInfoAPIModel.snv` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantInfoAPIModel.classification` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantInfoAPIModel.description` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenVariantInfoAPIModel.variant_description` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `AncestryAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `AncestryAPIModel.charts` | array<AncestryChartAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AncestryAPIModel.lineage` | LineageAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AncestryAPIModel.world_map` | WorldMapAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `AncestryChartAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `AncestryChartAPIModel.name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AncestryChartAPIModel.percentage` | number | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AncestryChartAPIModel.color` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AncestryChartAPIModel.sub_sectors` | array<AncestryChartAPIModel> or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `LineageAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `LineageAPIModel.paternal_lineage` | LineageDetailsAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `LineageAPIModel.maternal_lineage` | LineageDetailsAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `LineageDetailsAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `LineageDetailsAPIModel.haplogroup` | LineageInfoAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `LineageDetailsAPIModel.migration` | LineageInfoAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `LineageDetailsAPIModel.history` | LineageInfoAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `LineageInfoAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `LineageInfoAPIModel.title` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `LineageInfoAPIModel.desription` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `WorldMapAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `WorldMapAPIModel.image_url` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `WorldMapAPIModel.genetic_distribution` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `WorldMapAPIModel.lineage` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `WorldMapAPIModel.halogroups` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `WorldMapAPIModel.limitations` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `WorldMapAPIModel.more_info` | MoreInfoAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `MoreInfoAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `MoreInfoAPIModel.explanation` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MoreInfoAPIModel.description` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `VariantAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `VariantAPIModel.id` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.chrom` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.position` | integer | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.reference` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.alternate` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.quality` | number | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.info` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.filter` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

## .pgi2.json — `AGAPIModel`

A `.pgi2.json` file must decode as `AGAPIModel`. It contains the ActyonGenomics-style clinical report bundle and interpretation sections.

Provider format key: `ag`.

| Model / field | JSON type | Nullable or omittable | Rule |
| --- | --- | --- | --- |
| `AGAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `AGAPIModel.variants` | array<VariantAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AGAPIModel.result` | ResultAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AGAPIModel.resume` | ResumeAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AGAPIModel.information` | InformationAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AGAPIModel.panel_information` | PanelInfoAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AGAPIModel.genomic_methods` | GenomicMethodsAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AGAPIModel.methodological_limitations` | MethodologyLimitationsAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AGAPIModel.disclaimer` | DisclaimerAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AGAPIModel.sequenced_regions` | array<SequencedGenAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AGAPIModel.sequence` | SequenceAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AGAPIModel.genetic_counseling` | GeneticCounselingAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `AGAPIModel.variant_interpretations` | array<VariantInterpretationAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `VariantAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `VariantAPIModel.id` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.chrom` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.position` | integer | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.reference` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.alternate` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.quality` | number | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.info` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantAPIModel.filter` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `ResultAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `ResultAPIModel.cards` | array<TitleDescriptionAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `TitleDescriptionAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TitleDescriptionAPIModel.title` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TitleDescriptionAPIModel.description` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `ResumeAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `ResumeAPIModel.prioritized_genetic_variants` | array<GeneticVariantAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `ResumeAPIModel.copy_number_variants` | array<GeneticVariantAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `ResumeAPIModel.other_identified_genetic_variants` | array<GeneticVariantAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `GeneticVariantAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `GeneticVariantAPIModel.variant_number` | integer | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GeneticVariantAPIModel.gene` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GeneticVariantAPIModel.hg39_position` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GeneticVariantAPIModel.variant` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GeneticVariantAPIModel.zygosity` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GeneticVariantAPIModel.classification` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GeneticVariantAPIModel.condition` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `InformationAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `InformationAPIModel.case_information` | CaseInfoAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `InformationAPIModel.medical_information` | MedicalInfo | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `InformationAPIModel.patient_information` | PatientInfoAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `InformationAPIModel.references` | array<ReferenceAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `InformationAPIModel.clinical_diagnosis` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `InformationAPIModel.hpo_terms` | array<HpoTermAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `CaseInfoAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `CaseInfoAPIModel.case_id` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `CaseInfoAPIModel.sample_id` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `CaseInfoAPIModel.sample_type` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `CaseInfoAPIModel.cnvs` | boolean | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `CaseInfoAPIModel.mtdna` | boolean | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `CaseInfoAPIModel.reception_date` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `CaseInfoAPIModel.sequencing_date` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `CaseInfoAPIModel.report_date` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `MedicalInfo` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `MedicalInfo.doctor_name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MedicalInfo.clinic` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MedicalInfo.lab` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MedicalInfo.email` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `PatientInfoAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `PatientInfoAPIModel.patient_name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PatientInfoAPIModel.dni_ci` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PatientInfoAPIModel.sex` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PatientInfoAPIModel.birth_date` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PatientInfoAPIModel.age` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PatientInfoAPIModel.legal_guardian` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `ReferenceAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `ReferenceAPIModel.sample_id` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `ReferenceAPIModel.relation` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `ReferenceAPIModel.full_name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `HpoTermAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `HpoTermAPIModel.name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `HpoTermAPIModel.hpo_id` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `PanelInfoAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `PanelInfoAPIModel.a_vision_info` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PanelInfoAPIModel.regions_info` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PanelInfoAPIModel.mitocondrial_sequence` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PanelInfoAPIModel.cover_diseases` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PanelInfoAPIModel.panel_content` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `GenomicMethodsAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `GenomicMethodsAPIModel.extraction_and_sequencing` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenomicMethodsAPIModel.bioinformatic_processing` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenomicMethodsAPIModel.databases_used` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenomicMethodsAPIModel.variant_interpretation` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GenomicMethodsAPIModel.results_categorization` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `MethodologyLimitationsAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `MethodologyLimitationsAPIModel.limited_coverage` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MethodologyLimitationsAPIModel.interpretation_errors` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MethodologyLimitationsAPIModel.structural_variants` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MethodologyLimitationsAPIModel.public_databases` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MethodologyLimitationsAPIModel.unknown_variants` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MethodologyLimitationsAPIModel.test_errors` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `MethodologyLimitationsAPIModel.evolving_evidence` | TitleDescriptionAPIModel | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `DisclaimerAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `DisclaimerAPIModel.title` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `DisclaimerAPIModel.description` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `SequencedGenAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `SequencedGenAPIModel.title` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SequencedGenAPIModel.description` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SequencedGenAPIModel.analyzed_genes` | array<string> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SequencedGenAPIModel.color` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `SequenceAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `SequenceAPIModel.laboratory` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SequenceAPIModel.genomic_library` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SequenceAPIModel.sequencing_platform` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SequenceAPIModel.expected_mean_coverage` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SequenceAPIModel.protocol` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SequenceAPIModel.samples` | array<SampleCoverageAPIModel> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `SampleCoverageAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `SampleCoverageAPIModel.relation` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SampleCoverageAPIModel.sample_id` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SampleCoverageAPIModel.quality` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SampleCoverageAPIModel.mean_coverage` | integer | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SampleCoverageAPIModel.coverage_over_20x` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SampleCoverageAPIModel.icon` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `GeneticCounselingAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `GeneticCounselingAPIModel.title` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GeneticCounselingAPIModel.description` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `VariantInterpretationAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `VariantInterpretationAPIModel.variant_number` | integer | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantInterpretationAPIModel.variant_name` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantInterpretationAPIModel.acmg_classification` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantInterpretationAPIModel.associated_phenotypes` | array<string> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantInterpretationAPIModel.variant_details` | VariantDetails | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantInterpretationAPIModel.post_analysis` | PostAnalysis | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantInterpretationAPIModel.quality_metrics` | QualityMetrics | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantInterpretationAPIModel.gnomad` | GnomADInfo | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantInterpretationAPIModel.functional_prediction` | FunctionalPrediction | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantInterpretationAPIModel.summary` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantInterpretationAPIModel.interpretation` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantInterpretationAPIModel.reference` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `VariantDetails` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `VariantDetails.description` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantDetails.position` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantDetails.transcripts` | array<string> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantDetails.exon` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `VariantDetails.total_exons` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `PostAnalysis` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `PostAnalysis.classification` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PostAnalysis.original` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `PostAnalysis.criteria` | array<string> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `QualityMetrics` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `QualityMetrics.proband` | SampleQuality | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `QualityMetrics.father` | SampleQuality | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `QualityMetrics.mother` | SampleQuality | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `SampleQuality` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `SampleQuality.zygosity` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SampleQuality.quality` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SampleQuality.depth` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `SampleQuality.allele_fraction` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `GnomADInfo` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `GnomADInfo.allele_total` | number | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GnomADInfo.allele_count` | integer | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `GnomADInfo.allele_max` | number | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `FunctionalPrediction` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `FunctionalPrediction.revel` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `FunctionalPrediction.conservation` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `FunctionalPrediction.gerp` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `FunctionalPrediction.phastcons_100_vertebrates` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `FunctionalPrediction.splicing_prediction` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `FunctionalPrediction.spliceai` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

## .pgi3.json — `TwoPQAPIModel`

A `.pgi3.json` file must decode as `TwoPQAPIModel`. It contains a graph of reproductive batches, cases, and samplings.

Provider format key: `2pq`.

| Model / field | JSON type | Nullable or omittable | Rule |
| --- | --- | --- | --- |
| `TwoPQAPIModel` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQAPIModel.main_case` | TwoPQMainCaseReference | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQAPIModel.entities` | TwoPQEntities | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `TwoPQMainCaseReference` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQMainCaseReference.id` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQMainCaseReference.sibling_case_ids` | array<string> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQMainCaseReference.parent_batch_id` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQMainCaseReference.children_sampling_ids` | array<string> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQMainCaseReference.last_updated` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `TwoPQEntities` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQEntities.batches` | array<TwoPQBatch> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQEntities.cases` | array<TwoPQCase> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQEntities.samplings` | array<TwoPQSampling> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `TwoPQBatch` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQBatch.id` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQBatch.kind` | const `batch` | No: key required and value cannot be null | Must equal `batch` for 2PQ graph validation. |
| `TwoPQBatch.scope` | TwoPQScope | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQBatch.identity` | TwoPQIdentity | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQBatch.status` | TwoPQStatus | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQBatch.execution` | TwoPQExecution | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQBatch.relations` | TwoPQBatchRelations | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQBatch.notes` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQBatch.timestamps` | TwoPQTimestamps | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQBatch.audit` | TwoPQAudit | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `TwoPQScope` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQScope.institutionId` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQScope.doctorId` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQScope.patientId` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `TwoPQIdentity` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQIdentity.batchLabel` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQIdentity.runId` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQIdentity.caseLabel` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQIdentity.sampleId` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQIdentity.caseLabelSnapshot` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `TwoPQStatus` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQStatus.analysisStatus` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQStatus.caseStatus` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQStatus.priority` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQStatus.processingStatus` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQStatus.qcStatus` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `TwoPQExecution` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQExecution.platform` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQExecution.scheduling` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQExecution.providerName` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQExecution.providerFormat` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQExecution.contactName` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQExecution.contactEmail` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQExecution.phoneNumber` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `TwoPQBatchRelations` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQBatchRelations.caseIds` | array<string> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `TwoPQTimestamps` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQTimestamps.createdAt` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQTimestamps.updatedAt` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `TwoPQAudit` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQAudit.createdByEmail` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQAudit.updatedByEmail` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `TwoPQCase` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQCase.id` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQCase.kind` | const `case` | No: key required and value cannot be null | Must equal `case` for 2PQ graph validation. |
| `TwoPQCase.scope` | TwoPQScope | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQCase.identity` | TwoPQIdentity | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQCase.classification` | TwoPQCaseClassification | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQCase.status` | TwoPQStatus | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQCase.logistics` | TwoPQCaseLogistics | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQCase.relations` | TwoPQCaseRelations | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQCase.notes` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQCase.timestamps` | TwoPQTimestamps | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQCase.audit` | TwoPQAudit | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `TwoPQCaseClassification` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQCaseClassification.caseType` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `TwoPQCaseLogistics` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQCaseLogistics.trackingNumber` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQCaseLogistics.requestedAt` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQCaseLogistics.dueAt` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `TwoPQCaseRelations` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQCaseRelations.batchId` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQCaseRelations.samplingIds` | array<string> | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `TwoPQSampling` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQSampling.id` | string | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQSampling.kind` | const `sampling` | No: key required and value cannot be null | Must equal `sampling` for 2PQ graph validation. |
| `TwoPQSampling.scope` | TwoPQScope | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQSampling.identity` | TwoPQIdentity | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQSampling.specimen` | TwoPQSpecimen | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQSampling.status` | TwoPQStatus | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQSampling.dates` | TwoPQSamplingDates | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQSampling.relations` | TwoPQSamplingRelations | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQSampling.notes` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQSampling.timestamps` | TwoPQTimestamps | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |
| `TwoPQSampling.audit` | TwoPQAudit | No: key required and value cannot be null | Swift non-optional `let` requires this key and a non-null value for JSONDecoder and native UI access. |

| `TwoPQSpecimen` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQSpecimen.sampleType` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `TwoPQSamplingDates` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQSamplingDates.collectionDate` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQSamplingDates.receptionDate` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |
| `TwoPQSamplingDates.runId` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

| `TwoPQSamplingRelations` | object | No when referenced by a non-nullable parent | Object shape. Unknown keys are rejected by the PGI contract. |
| `TwoPQSamplingRelations.caseId` | string or null | Optional: may be omitted or null | Swift optional (`?`) accepts absent or null; app treats it as unavailable. |

### `.pgi3.json` graph rules

- `main_case.id` must resolve to an entity in `entities.cases`.
- Every `main_case.sibling_case_ids[]` value must resolve to an entity case.
- `main_case.parent_batch_id`, when non-null and non-empty, must resolve to an entity batch and match the main case relation.
- Every `main_case.children_sampling_ids[]` value must resolve to an entity sampling.
- Every batch must have `kind == "batch"`; every case must have `kind == "case"`; every sampling must have `kind == "sampling"`.
- Batch `relations.caseIds[]` and case `relations.batchId` must point to each other when both are present.
- Case `relations.samplingIds[]` and sampling `relations.caseId` must point to each other when both are present.
- Batch and case scope must share `institutionId` and `doctorId`.
- Case and sampling scope must share `institutionId` and `doctorId`. If both sides provide non-empty `patientId`, they must match.
