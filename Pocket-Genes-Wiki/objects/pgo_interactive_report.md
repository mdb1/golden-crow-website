# Interactive genomic report — `pgo_interactive_report`

Pocket Genes structured genomic findings and their clinical relevance derived from variant data, independently of the user symptom bundle.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Bioinformatics |
| Extension | .pgi1.json |
| Icon asset | icons/pgo_interactive_report.svg |
| Icon subject | A document card with two selectable result rows. |
| JSON Schema | schemas/objects/pgo_interactive_report.schema.json |
| Example record | examples/objects/pgo_interactive_report.pgi1.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `subject_id` | string | Yes | Synthetic or platform-assigned subject identifier; do not infer identity from a filename. minLength: 1 |
| `order_ref` | object | No | Linked order when this object belongs to an ordered pipeline; optional for a standalone or imported object. |
| `order_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `order_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `reference_id` | string | Yes | Reference identifier shared across sequence analysis and variant coordinates. minLength: 1 |
| `profile_id` | string | Yes | Versioned analytical contract or compatibility profile. minLength: 1 |
| `analysis_support` | object | Yes | Declared analysis support, separate from the presence or absence of variant records. |
| `analysis_support.status` | string | Yes | Whether this object is sufficient for its linked analytical scope. Options: sufficient, partial, unassessed; minLength: 1 |
| `analysis_support.evaluated_genes` | array | Yes | Genes evaluated by the declared process. Empty when unassessed. minItems: 0 |
| `analysis_support.supported_variant_classes` | array | Yes | Variant classes supported by the declared process. minItems: 0 |
| `analysis_support.evidence` | array | Yes | Evidence supporting the status. A sufficient status requires evidence. minItems: 0 |
| `analysis_support.evidence[].kind` | string | Yes | Evidence category, such as provider_attestation or analytical_qc; this fixture uses synthetic_fixture_attestation. minLength: 1 |
| `analysis_support.evidence[].reference` | string | Yes | An auditable evidence identifier or source reference. minLength: 1 |
| `analysis_support.evidence[].summary` | string | Yes | What this evidence establishes, including its limitations. minLength: 1 |
| `analysis_support.limitations` | array | Yes | Known scope or analytical limitations. minItems: 0 |
| `format_version` | string | Yes | Version of the pgi1 data format. Value: 1.0.0; minLength: 1 |
| `gene_namespace` | string | Yes | Gene identifier namespace used in findings. minLength: 1 |
| `source_variants_ref` | object | No | Pinned upstream object when recorded in Pocket Genes. Imported standalone objects may omit this reference with explicit source disclosure. |
| `source_variants_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `source_variants_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `findings` | array | Yes | Genomic findings with source genotype; may be empty with an explicit result summary. minItems: 0 |
| `findings[].finding_id` | string | Yes | Identifier unique within this report. minLength: 1 |
| `findings[].gene_id` | string | Yes | Gene identifier in the declared namespace. minLength: 1 |
| `findings[].variant` | object | Yes | A variant coordinate on reference_id. |
| `findings[].variant.contig` | string | Yes | Reference contig identifier. minLength: 1 |
| `findings[].variant.position` | integer | Yes | One-based variant position. minimum: 1 |
| `findings[].variant.reference` | string | Yes | Reference allele. minLength: 1 |
| `findings[].variant.alternate` | string | Yes | Alternate allele. minLength: 1 |
| `findings[].clinical_relevance` | object | Yes | Clinical relevance associated with genomic findings independently of the intake symptom bundle. |
| `findings[].clinical_relevance.label` | string | Yes | Human-readable clinical relevance label from the declared source. minLength: 1 |
| `findings[].clinical_relevance.summary` | string | Yes | Symptom-independent relevance statement for this finding. minLength: 1 |
| `findings[].clinical_relevance.evidence_refs` | array | Yes | Evidence identifiers or source references. minItems: 1 |
| `findings[].clinical_relevance.knowledge_version` | string | Yes | Version of the knowledge used to construct this statement. minLength: 1 |
| `findings[].genotype` | string | Yes | Genotype copied from the source VCF sample, retaining ploidy and phased or unphased separators. minLength: 1; pattern: ^(?:[0-9]+\|\.)(?:[\|/](?:[0-9]+\|\.))*$ |
| `result_summary` | string | Yes | Plain-language summary restricted to the supported genomic scope. minLength: 1 |
| `method_summary` | string | Yes | Methods and processing provenance required by downstream reporting. minLength: 1 |
| `produced_by` | string | Yes | Provider responsible for the structured results. minLength: 1 |
| `produced_at` | string | Yes | Time the structured results were produced. format: date-time; minLength: 1 |
| `provenance` | object | No | Explicit source disclosure for an imported object or a provider-generated result. This supplements registered lineage; it does not prove analytical sufficiency. |
| `provenance.source_kind` | string | Yes | Whether this object entered from outside the recorded network or was generated by a provider service. Options: imported, provider_generated |
| `provenance.source_label` | string | Yes | Human-readable description of where this object came from. minLength: 1 |
| `provenance.imported_at` | string | No | When the object was registered from an external source; required when source_kind is imported. format: date-time |
| `provenance.producer_label` | string | No | Known producing provider or source label; omit when genuinely unknown rather than inventing an identity. minLength: 1 |


**Sample object record**

```json
{
  "object_id": "obj_demo_interactive",
  "object_type": "pgo_interactive_report",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-17T16:00:00Z",
  "created_by": "pgp_variant_analysis",
  "input_refs": [
    {
      "object_id": "obj_demo_form_interactive_interpretation",
      "revision": 1
    },
    {
      "object_id": "obj_demo_annotated_vcf",
      "revision": 1
    }
  ],
  "data": {
    "subject_id": "subject_demo_001",
    "order_ref": {
      "object_id": "obj_demo_order",
      "revision": 1
    },
    "reference_id": "PG_DEMO_REF_1",
    "profile_id": "pg_demo_small_variant_v1",
    "analysis_support": {
      "status": "sufficient",
      "evaluated_genes": [
        "PGGENE_A",
        "PGGENE_B",
        "PGGENE_C"
      ],
      "supported_variant_classes": [
        "SNV",
        "small_indel"
      ],
      "evidence": [
        {
          "kind": "synthetic_fixture_attestation",
          "reference": "demo-evidence-001",
          "summary": "Illustrative provider declaration for the fictional three-gene fixture; not a real measurement or clinical result."
        }
      ],
      "limitations": [
        "Synthetic fixture only; the native sample bytes do not establish real gene coverage or clinical validity."
      ]
    },
    "format_version": "1.0.0",
    "gene_namespace": "PG_DEMO_GENE",
    "source_variants_ref": {
      "object_id": "obj_demo_annotated_vcf",
      "revision": 1
    },
    "findings": [
      {
        "finding_id": "finding_demo_001",
        "gene_id": "PGGENE_A",
        "variant": {
          "contig": "PG_DEMO_1",
          "position": 101,
          "reference": "A",
          "alternate": "G"
        },
        "clinical_relevance": {
          "label": "Demonstration finding",
          "summary": "Synthetic example 1 of a structured relevance statement; no real disease or risk is asserted.",
          "evidence_refs": [
            "PG_DEMO_KNOWLEDGE_BASE:ENTRY_001"
          ],
          "knowledge_version": "1.0.0"
        },
        "genotype": "1/1"
      },
      {
        "finding_id": "finding_demo_002",
        "gene_id": "PGGENE_B",
        "variant": {
          "contig": "PG_DEMO_1",
          "position": 401,
          "reference": "A",
          "alternate": "T"
        },
        "clinical_relevance": {
          "label": "Demonstration finding",
          "summary": "Synthetic example 2 of a structured relevance statement; no real disease or risk is asserted.",
          "evidence_refs": [
            "PG_DEMO_KNOWLEDGE_BASE:ENTRY_002"
          ],
          "knowledge_version": "1.0.0"
        },
        "genotype": "1/1"
      },
      {
        "finding_id": "finding_demo_003",
        "gene_id": "PGGENE_C",
        "variant": {
          "contig": "PG_DEMO_1",
          "position": 701,
          "reference": "A",
          "alternate": "C"
        },
        "clinical_relevance": {
          "label": "Demonstration finding",
          "summary": "Synthetic example 3 of a structured relevance statement; no real disease or risk is asserted.",
          "evidence_refs": [
            "PG_DEMO_KNOWLEDGE_BASE:ENTRY_003"
          ],
          "knowledge_version": "1.0.0"
        },
        "genotype": "1/1"
      }
    ],
    "result_summary": "Three fictional findings are represented for demonstration within the three requested fictional genes.",
    "method_summary": "Synthetic catalog fixture illustrating variant annotation and structured result production.",
    "produced_by": "pgp_variant_analysis",
    "produced_at": "2026-09-17T16:00:00Z",
    "provenance": {
      "source_kind": "provider_generated",
      "source_label": "Synthetic provider-generated result for the Pocket Genes demonstration pipeline.",
      "producer_label": "Pocket Genes demo fixture author"
    }
  },
  "files": []
}
```

**Validation and JSON logic**

- The schema contains genomic findings and relevance; it does not require a bundle_of_symptoms or a copy of intake symptoms.
- The order_ref supplies linkage and scope; the patient identity and clinical question used for the final PDF remain in test_order.
- An empty findings array is not sufficient to claim a negative result; the summary must reflect support, evidence and limitations.
- All findings must be within the requested analysis and reporting scope.
- Method summary, provenance, limitations and evidence needed by the reporting contract must travel in these objects so the reporting provider does not need earlier pipeline pieces.
- order_ref is optional for a standalone or imported object. A service request that explicitly requires a test order must compare the supplied order with subject, scope, reference, profile and any existing linkage.
- Imported standalone objects can omit upstream object references that do not exist in Pocket Genes, but must provide provenance.source_kind=imported, source_label, imported_at, and disclose known limitations in analysis_support.limitations. Do not invent upstream identities or scope evidence.
- Provider-generated outputs require the actual upstream source_variants_ref and common input_refs as a semantic provenance rule. A missing source reference cannot be excused by changing or omitting provenance metadata.

**Linked mock services**

- Produced or updated by: `pgs_interactive_interpretation`
- Consumed by: `pgs_final_report`

**Other service opportunities**

- VCF to interactive genomic report.
- Interactive display of structured genomic findings.
- Test order plus pgi1 plus reporting form to final PDF.
