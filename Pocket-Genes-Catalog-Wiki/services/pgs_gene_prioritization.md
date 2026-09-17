# Prioritize candidate genes — `pgs_gene_prioritization`

Use a symptom bundle to return a ranked or selected bundle of candidate genes for subsequent test planning.

**Provider:** `pgp_clinical_planning`. **Service version:** `1`. **Stage:** Test Planning.

**Provider work:** Apply the provider method and professional review where included; return genes, evidence and ranking rationale.

**Input slots**

| Role | Accepted object type | Required | Cardinality |
| --- | --- | --- | --- |
| form | pgo_form | True | 1–1 |
| bundle_of_symptoms | pgo_bundle_of_symptoms | True | 1–1 |

**Outputs**

| Role | Type / binding | Identity behavior |
| --- | --- | --- |
| candidate_genes | pgo_bundle_of_candidate_genes | new_object |

**Form shape**

`pgfs_gene_prioritization` version `1`. This shape is valid because the offer declares a `pgo_form` input slot; unknown fields are rejected.

| Field | Type | Required | Enum options |
| --- | --- | --- | --- |
| requested_at | datetime | True | — |
| requested_by | text | True | — |
| ranking_mode | enum | True | ranked, selected |
| maximum_genes | integer | True | — |

**Filled form input object**

```json
{
  "object_id": "obj_demo_form_gene_prioritization",
  "object_type": "pgo_form",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:06:00Z",
  "created_by": "user_demo_001",
  "input_refs": [],
  "data": {
    "form_shape_id": "pgfs_gene_prioritization",
    "form_shape_version": 1,
    "fields": [
      {
        "key": "requested_at",
        "value": "2026-09-16T12:06:00Z"
      },
      {
        "key": "requested_by",
        "value": "user_demo_001"
      },
      {
        "key": "ranking_mode",
        "value": "ranked"
      },
      {
        "key": "maximum_genes",
        "value": 3
      }
    ]
  },
  "files": []
}
```

**Request**

```json
{
  "request_id": "pgr_demo_gene_prioritization",
  "service_id": "pgs_gene_prioritization",
  "service_version": 1,
  "inputs": [
    {
      "role": "form",
      "object_ref": {
        "object_id": "obj_demo_form_gene_prioritization",
        "revision": 1
      }
    },
    {
      "role": "bundle_of_symptoms",
      "object_ref": {
        "object_id": "obj_demo_symptoms",
        "revision": 1
      }
    }
  ]
}
```

**Completed result**

```json
{
  "request_id": "pgr_demo_gene_prioritization",
  "status": "completed",
  "outputs": [
    {
      "role": "candidate_genes",
      "object_ref": {
        "object_id": "obj_demo_genes",
        "revision": 1
      }
    }
  ]
}
```

**Acceptance and fulfillment rules**

- The provider accepts the symptom bundle schema and any declared terminology profile.
- The symptom bundle represents one identified subject.
- Candidate status and supporting reasons must be preserved. Ranking does not establish that these genes are affected.

**Illustrative commercial terms**

```json
{
  "price": {
    "summary": "Calculated after submission"
  },
  "turnaround": "1d"
}
```
