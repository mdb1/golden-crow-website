# PDF report — `pgo_pdf_report`

A native PDF deliverable that may represent a standalone form-based service or a complete report assembled from a test order and a registered PGI payload.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Test planning, Wet lab, Bioinformatics |
| Extension | .pdf |
| Icon asset | icons/pgo_pdf_report.svg |
| Icon subject | A folded document corner with three report lines. |
| JSON Schema | schemas/objects/pgo_pdf_report.schema.json |
| Example record | examples/objects/pgo_pdf_report.pgobject.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `title` | string | Yes | Document title. minLength: 1 |
| `report_kind` | string | Yes | The declared purpose of this report. Options: final_genomic, assessment, laboratory, administrative; minLength: 1 |
| `language` | string | Yes | Language tag used in the document. minLength: 1 |
| `subject_id` | string | Yes | Synthetic or platform-assigned subject identifier; do not infer identity from a filename. minLength: 1 |
| `order_ref` | object | No | Order associated with this report when the service requires one. |
| `order_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `order_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `source_pgi_ref` | object | No | Registered PGI payload used for a final genomic report. |
| `source_pgi_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `source_pgi_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `created_by_provider_id` | string | Yes | Provider responsible for the PDF. minLength: 1 |
| `generated_at` | string | Yes | PDF generation time. format: date-time; minLength: 1 |
| `page_count` | integer | Yes | Number of pages in the native PDF. minimum: 1 |
| `status` | string | Yes | Report state. Options: draft, final, superseded; minLength: 1 |
| `template_id` | string | Yes | Report template identifier and version. minLength: 1 |


**Sample object record**

```json
{
  "object_id": "obj_demo_pdf",
  "object_type": "pgo_pdf_report",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-17T16:10:00Z",
  "created_by": "pgp_report_studio",
  "input_refs": [
    {
      "object_id": "obj_demo_form_final_report",
      "revision": 1
    },
    {
      "object_id": "obj_demo_order",
      "revision": 1
    },
    {
      "object_id": "obj_demo_interactive",
      "revision": 1
    }
  ],
  "data": {
    "title": "Pocket Genes demonstration genomic report",
    "report_kind": "final_genomic",
    "language": "en",
    "subject_id": "subject_demo_001",
    "order_ref": {
      "object_id": "obj_demo_order",
      "revision": 1
    },
    "source_pgi_ref": {
      "object_id": "obj_demo_interactive",
      "revision": 1
    },
    "created_by_provider_id": "pgp_report_studio",
    "generated_at": "2026-09-17T16:10:00Z",
    "page_count": 1,
    "status": "final",
    "template_id": "pg_demo_report_v1"
  },
  "files": [
    {
      "role": "primary",
      "path": "payloads/demo-report.pdf",
      "media_type": "application/pdf",
      "sha256": "cddb432eb94be2f1ad212a73488bf17a2be9ebb2335bf835023ceb89783e72f7",
      "size_bytes": 44812
    }
  ]
}
```

**Native content / decoded preview**

The following is a readable preview. The package also contains the actual binary file; this text is not its byte representation.

```text
Pocket Genes catalog fixture | Generated from test_order + PGI payload
1
Pocket Genes
Genomic report - synthetic example
SYNTHETIC DEMONSTRATION. The patient, genes and findings below are fictional catalog fixtures.
Order and patient context
Patient: Alex Example | Identifier: PATIENT-DEMO-001
Date of birth: 1990-01-01 | Order: PG-DEMO-ORDER-001
Objective: Evaluate the synthetic three-gene demonstration
Clinical suspicion: Demo clinical hypothesis only
Requested genes: PGGENE_A, PGGENE_B, PGGENE_C
Genomic findings
PGGENE_A | PG_DEMO_1:101 A>G | Genotype 1/1
Synthetic example 1 of a structured relevance statement; no real disease or risk is asserted.
Evidence: PG_DEMO_KNOWLEDGE_BASE:ENTRY_001 | Knowledge version 1.0.0
PGGENE_B | PG_DEMO_1:401 A>T | Genotype 1/1
Synthetic example 2 of a structured relevance statement; no real disease or risk is asserted.
Evidence: PG_DEMO_KNOWLEDGE_BASE:ENTRY_002 | Knowledge version 1.0.0
PGGENE_C | PG_DEMO_1:701 A>C | Genotype 1/1
Synthetic example 3 of a structured relevance statement; no real disease or risk is asserted.
Evidence: PG_DEMO_KNOWLEDGE_BASE:ENTRY_003 | Knowledge version 1.0.0
Scope and limitations
Evaluated genes: PGGENE_A, PGGENE_B, PGGENE_C
Reference: PG_DEMO_REF_1 | Supported variant classes: SNV, small_indel
Synthetic catalog fixture illustrating variant annotation and structured result production.
Synthetic fixture only; the native sample bytes do not establish real gene coverage or clinical validity.
These tiny files demonstrate the interface contract. Their synthetic scope declaration is not evidence of real assay coverage.
Source objects
Test order: obj_demo_order revision 1. Genomic result: obj_demo_interactive revision 1.
Issued by Clarity Report Studio (fictional) | 17 September 2026, 16:10 UTC.
Genomic analysis: Variant Analysis Cooperative (fictional), produced 17 September 2026, 16:00 UTC.
```

**Validation and JSON logic**

- The primary payload is a real PDF file; the sidecar contains the metadata.
- A final_genomic report requires order_ref and source_pgi_ref with matching subject and order scope.
- For the final reporting service, form plus test_order plus a registered PGI payload are the complete input contract.
- The final genomic PDF must contain the order context, genomic findings, methods, support, limitations and issuing-provider information required by that service.
- A PDF can also be the output of a form-only service; such services do not need a genomic source reference.

**Linked mock services**

- Produced or updated by: `pgs_final_report`, `pgs_form_to_pdf`
- Consumed by: No service in the initial 15; retained as an accepted type for additional provider contracts.

**Other service opportunities**

- Form to administrative or assessment PDF.
- Test order plus registered PGI payload to final genomic PDF.
- Karyotype findings plus reporting form to a PDF.
