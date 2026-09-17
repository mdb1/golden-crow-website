# Test order — `pgo_test_order`

The formal test request carrying patient identity, purpose, clinical suspicion, requested analytical scope, consent linkage, and required deliverables.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Test planning, Wet lab, Bioinformatics |
| Extension | .pgorder.json |
| Icon asset | icons/pgo_test_order.svg |
| Icon subject | A clipboard with a checked gene list and a small order seal. |
| JSON Schema | schemas/objects/pgo_test_order.schema.json |
| Example record | examples/objects/pgo_test_order.pgorder.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `order_number` | string | Yes | Human-readable order number. minLength: 1 |
| `patient` | object | Yes | Self-contained patient identity required by the ordered deliverable. |
| `patient.subject_id` | string | Yes | Synthetic or platform-assigned subject identifier; do not infer identity from a filename. minLength: 1 |
| `patient.full_name` | string | Yes | Patient name to appear in the final report. minLength: 1 |
| `patient.date_of_birth` | string | Yes | Date of birth supplied for the order. format: date; minLength: 1 |
| `patient.identifier` | string | Yes | Patient identifier for the ordering organization; the fixture is synthetic. minLength: 1 |
| `objective` | string | Yes | Question or intended objective of this test. minLength: 1 |
| `clinical_suspicion` | string | Yes | Suspicion or clinical reason being evaluated; may explicitly state that none was specified. minLength: 1 |
| `scope` | object | Yes | The analytical scope required by the order. |
| `scope.genes` | array | Yes | Requested genes, using the specified gene namespace. minItems: 1 |
| `scope.reference_id` | string | Yes | Reference assembly identifier agreed by the providers. minLength: 1 |
| `scope.variant_classes` | array | Yes | Variant classes required by this order. minItems: 1 |
| `fulfillment` | object | Yes | The outcome and intermediate laboratory handoff required by this order. |
| `fulfillment.wet_lab_output_type` | string | Yes | Object type the selected lab is expected to deliver. minLength: 1 |
| `fulfillment.final_output_types` | array | Yes | Requested final output object types. minItems: 1 |
| `fulfillment.required_profile` | string | Yes | Versioned analytical profile providers must satisfy. minLength: 1 |
| `fulfillment.scope_policy` | string | Yes | Requested analytical and reporting boundary. Options: requested_only; minLength: 1 |
| `fulfillment.analysis_support_required` | boolean | Yes | Require explicit support for requested analytical scope rather than relying on filename or variant presence. Value: True |
| `consent_ref` | object | Yes | Completed consent record relied upon for this order. |
| `consent_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `consent_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `candidate_genes_ref` | object | Yes | Candidate gene bundle used to create the order. |
| `candidate_genes_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `candidate_genes_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `requested_by` | string | Yes | Professional, organization or user recorded as placing the order. minLength: 1 |
| `issued_at` | string | Yes | Time the order was issued. format: date-time; minLength: 1 |
| `status` | string | Yes | Order state. Options: issued, in_progress, completed, cancelled; minLength: 1 |


**Sample object record**

```json
{
  "object_id": "obj_demo_order",
  "object_type": "pgo_test_order",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:15:00Z",
  "created_by": "pgp_clinical_planning",
  "input_refs": [
    {
      "object_id": "obj_demo_form_test_ordering",
      "revision": 1
    },
    {
      "object_id": "obj_demo_consent",
      "revision": 1
    },
    {
      "object_id": "obj_demo_genes",
      "revision": 1
    }
  ],
  "data": {
    "order_number": "PG-DEMO-ORDER-001",
    "patient": {
      "subject_id": "subject_demo_001",
      "full_name": "Alex Example",
      "date_of_birth": "1990-01-01",
      "identifier": "PATIENT-DEMO-001"
    },
    "objective": "Evaluate the synthetic three-gene demonstration",
    "clinical_suspicion": "Demo clinical hypothesis only",
    "scope": {
      "genes": [
        "PGGENE_A",
        "PGGENE_B",
        "PGGENE_C"
      ],
      "reference_id": "PG_DEMO_REF_1",
      "variant_classes": [
        "SNV",
        "small_indel"
      ]
    },
    "fulfillment": {
      "wet_lab_output_type": "pgo_sequence_reads",
      "final_output_types": [
        "pgo_interactive_report",
        "pgo_pdf_report"
      ],
      "required_profile": "pg_demo_small_variant_v1",
      "scope_policy": "requested_only",
      "analysis_support_required": true
    },
    "consent_ref": {
      "object_id": "obj_demo_consent",
      "revision": 1
    },
    "candidate_genes_ref": {
      "object_id": "obj_demo_genes",
      "revision": 1
    },
    "requested_by": "user_demo_001",
    "issued_at": "2026-09-16T12:15:00Z",
    "status": "issued"
  },
  "files": []
}
```

**Validation and JSON logic**

- Creation requires its own completed form plus informed_consent plus bundle_of_candidate_genes.
- Patient identity, objective and clinical suspicion must be available directly in this object for the final reporting provider.
- Order scope must remain within the recorded consent scope and explicitly define which genes and variant classes are requested.
- A matching native file extension alone cannot fulfill the order; the deliverable must satisfy the scope and required profile.
- The final reporting request can use this order and a matching registered PGI object without fetching original symptom bundles or intake forms.
- requested_only limits requested analysis and reporting. It does not claim that an instrument cannot physically acquire additional raw signal.

**Linked mock services**

- Produced or updated by: `pgs_test_ordering`
- Consumed by: `pgs_collection_request`, `pgs_dna_extraction`, `pgs_sequencing`, `pgs_read_alignment`, `pgs_variant_calling`, `pgs_variant_annotation`, `pgs_final_report`

**Other service opportunities**

- Formal output of test planning.
- Define wet-lab processing and its digital handoff.
- Combine with a registered PGI payload to produce a final self-contained PDF.
