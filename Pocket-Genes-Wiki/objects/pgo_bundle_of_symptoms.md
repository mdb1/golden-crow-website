# Symptom bundle — `pgo_bundle_of_symptoms`

A structured collection of reported symptoms and observations that a provider can use to prioritize candidate genes.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Test planning |
| Extension | .pgsymptoms.json |
| Icon asset | icons/pgo_bundle_of_symptoms.svg |
| Icon subject | Three observation dots connected to a short assessment list. |
| JSON Schema | schemas/objects/pgo_bundle_of_symptoms.schema.json |
| Example record | examples/objects/pgo_bundle_of_symptoms.pgsymptoms.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `subject_id` | string | Yes | Synthetic or platform-assigned subject identifier; do not infer identity from a filename. minLength: 1 |
| `observations` | array | Yes | Structured observations for this subject. minItems: 1 |
| `observations[].observation_id` | string | Yes | Local identifier for this observation. minLength: 1 |
| `observations[].label` | string | Yes | Reported symptom or clinical observation text. minLength: 1 |
| `observations[].code_system` | string | Yes | Identifier namespace; demo fixtures use PG_DEMO_OBSERVATION. minLength: 1 |
| `observations[].code` | string | Yes | Code in the selected namespace. minLength: 1 |
| `observations[].presence` | string | Yes | Whether the observation was reported present, absent, or uncertain. Options: present, absent, uncertain; minLength: 1 |
| `observations[].source` | string | Yes | How the observation was obtained. Options: self_report, professional_observation, submitted_form; minLength: 1 |
| `observations[].recorded_at` | string | Yes | Time the observation was recorded. format: date-time; minLength: 1 |
| `source_form_ref` | object | Yes | Completed form from which this bundle was created. |
| `source_form_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `source_form_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |


**Sample object record**

```json
{
  "object_id": "obj_demo_symptoms",
  "object_type": "pgo_bundle_of_symptoms",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:05:00Z",
  "created_by": "pgp_clinical_planning",
  "input_refs": [
    {
      "object_id": "obj_demo_form_symptom_intake",
      "revision": 1
    }
  ],
  "data": {
    "subject_id": "subject_demo_001",
    "observations": [
      {
        "observation_id": "observation_demo_001",
        "label": "Fictional observation A",
        "code_system": "PG_DEMO_OBSERVATION",
        "code": "DEMO_OBSERVATION_01",
        "presence": "present",
        "source": "submitted_form",
        "recorded_at": "2026-09-16T12:00:00Z"
      },
      {
        "observation_id": "observation_demo_002",
        "label": "Fictional observation B",
        "code_system": "PG_DEMO_OBSERVATION",
        "code": "DEMO_OBSERVATION_02",
        "presence": "uncertain",
        "source": "submitted_form",
        "recorded_at": "2026-09-16T12:00:00Z"
      }
    ],
    "source_form_ref": {
      "object_id": "obj_demo_form_symptom_intake",
      "revision": 1
    }
  },
  "files": []
}
```

**Validation and JSON logic**

- Keep observation_id unique within the bundle.
- A symptom bundle represents observations; it does not itself assert a diagnosis or a confirmed affected gene.
- Preserve presence and provenance so absent or uncertain observations cannot silently become positive findings.

**Linked mock services**

- Produced or updated by: `pgs_symptom_intake`
- Consumed by: `pgs_gene_prioritization`

**Other service opportunities**

- Form to structured symptom bundle.
- Symptom bundle to ranked candidate genes.
- Professional review of submitted observations.
