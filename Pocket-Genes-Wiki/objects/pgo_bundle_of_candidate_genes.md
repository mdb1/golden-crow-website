# Candidate gene bundle — `pgo_bundle_of_candidate_genes`

A provider-selected set of candidate genes for the next planning step, optionally ranked and explained.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Test planning |
| Extension | .pggenes.json |
| Icon asset | icons/pgo_bundle_of_candidate_genes.svg |
| Icon subject | A DNA helix next to three candidate markers. |
| JSON Schema | schemas/objects/pgo_bundle_of_candidate_genes.schema.json |
| Example record | examples/objects/pgo_bundle_of_candidate_genes.pggenes.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `subject_id` | string | Yes | Synthetic or platform-assigned subject identifier; do not infer identity from a filename. minLength: 1 |
| `gene_namespace` | string | Yes | Identifier system used by all gene_id entries. minLength: 1 |
| `genes` | array | Yes | Candidate genes selected by the provider. minItems: 1 |
| `genes[].gene_id` | string | Yes | Gene identifier in gene_namespace. minLength: 1 |
| `genes[].rank` | integer | Yes | Provider-assigned candidate rank. minimum: 1 |
| `genes[].rationale` | string | Yes | Reason for including this candidate. minLength: 1 |
| `genes[].evidence_refs` | array | Yes | References supporting inclusion; may point to observation or source identifiers. minItems: 1 |
| `source_symptoms_ref` | object | Yes | Symptom bundle used by the provider. |
| `source_symptoms_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `source_symptoms_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `method` | string | Yes | Method name or version used for prioritization. minLength: 1 |


**Sample object record**

```json
{
  "object_id": "obj_demo_genes",
  "object_type": "pgo_bundle_of_candidate_genes",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:10:00Z",
  "created_by": "pgp_clinical_planning",
  "input_refs": [
    {
      "object_id": "obj_demo_form_gene_prioritization",
      "revision": 1
    },
    {
      "object_id": "obj_demo_symptoms",
      "revision": 1
    }
  ],
  "data": {
    "subject_id": "subject_demo_001",
    "gene_namespace": "PG_DEMO_GENE",
    "genes": [
      {
        "gene_id": "PGGENE_A",
        "rank": 1,
        "rationale": "Fictional candidate 1 selected from demo observations.",
        "evidence_refs": [
          "observation_demo_001",
          "observation_demo_002"
        ]
      },
      {
        "gene_id": "PGGENE_B",
        "rank": 2,
        "rationale": "Fictional candidate 2 selected from demo observations.",
        "evidence_refs": [
          "observation_demo_001",
          "observation_demo_002"
        ]
      },
      {
        "gene_id": "PGGENE_C",
        "rank": 3,
        "rationale": "Fictional candidate 3 selected from demo observations.",
        "evidence_refs": [
          "observation_demo_001",
          "observation_demo_002"
        ]
      }
    ],
    "source_symptoms_ref": {
      "object_id": "obj_demo_symptoms",
      "revision": 1
    },
    "method": "demo-prioritization-v1"
  },
  "files": []
}
```

**Validation and JSON logic**

- gene_id and rank must be unique within this bundle.
- Candidate status must remain distinct from variant findings and confirmed causality.
- The test-order service can accept this bundle directly alongside informed_consent and its completed form.

**Linked mock services**

- Produced or updated by: `pgs_gene_prioritization`
- Consumed by: `pgs_test_ordering`

**Other service opportunities**

- Symptom-driven gene prioritization.
- Independent professional candidate review.
- Direct input to test ordering.
