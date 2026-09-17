# Interactive genomic report — `pgo_interactive_report`

Pocket Genes registration object for a native provider JSON payload. PGI1 uses `MDMAPIModel`, PGI2 uses `AGAPIModel`, and PGI3 uses `TwoPQAPIModel`.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Bioinformatics |
| Extensions | `.pgi1.json`, `.pgi2.json`, `.pgi3.json` |
| Native schemas | `schemas/protocol/pgi1-mdm.schema.json`, `schemas/protocol/pgi2-ag.schema.json`, `schemas/protocol/pgi3-2pq.schema.json` |
| Object schema | `schemas/objects/pgo_interactive_report.schema.json` |
| Example object record | `examples/objects/pgo_interactive_report.pgobject.json` |
| Example native payload | `payloads/demo-mdm.pgi1.json` |

The native `.pgi*.json` file is not the Pocket Genes object envelope. The object envelope registers the file, links it to orders and upstream objects, stores support evidence, and points to the raw payload with `payload_ref` and `files[]`.

## Object Data Fields

| Property | Type | Required | Nullable | Rule |
| --- | --- | --- | --- | --- |
| `subject_id` | string | Yes | No | Required for matching the payload to orders and service transactions. |
| `order_ref` | object | No | Omit only | Present when the payload belongs to an ordered pipeline. |
| `reference_id` | string | Yes | No | Required for scope and compatibility checks. |
| `profile_id` | string | Yes | No | Required so report services know which compatibility profile produced the payload. |
| `analysis_support` | object | Yes | No | Required evidence summary; file extension alone never proves sufficiency. |
| `native_format` | object | Yes | No | Required mapping from extension to API model and schema. |
| `payload_ref` | file descriptor | Yes | No | Points to the raw native JSON payload. Its bytes must match `files[]`. |
| `source_variants_ref` | object | No | Omit only | Present when generated from a Pocket Genes variant object. |
| `result_summary` | string | Yes | No | Required for list cells and report triage before loading the full payload. |
| `method_summary` | string | Yes | No | Required for downstream reporting and audit context. |
| `produced_by` | string | Yes | No | Required provider/source identifier. |
| `produced_at` | date-time string | Yes | No | Required production/registration time. |
| `provenance` | object | No | Omit only | Source disclosure, especially for imported files. |

## Validation Logic

- `native_format` is a closed tuple, not a set of independently selectable labels: `.pgi1.json` requires `MDMAPIModel`, provider format `mdm`, schema `schemas/protocol/pgi1-mdm.schema.json`, media type `application/vnd.pocketgenes.pgi1+json`; `.pgi2.json` requires `AGAPIModel`, provider format `ag`, schema `schemas/protocol/pgi2-ag.schema.json`, media type `application/vnd.pocketgenes.pgi2+json`; `.pgi3.json` requires `TwoPQAPIModel`, provider format `2pq`, schema `schemas/protocol/pgi3-2pq.schema.json`, media type `application/vnd.pocketgenes.pgi3+json`.
- Cross-format combinations are invalid. A `.pgi1.json` payload cannot be registered as `AGAPIModel`; a `.pgi2.json` payload cannot be registered as `MDMAPIModel`; a `.pgi3.json` payload cannot be registered as either of the other native models.
- `payload_ref.path` must end with the selected extension and `payload_ref.media_type` must match the selected native format exactly.
- `.pgi1.json` files must validate against `schemas/protocol/pgi1-mdm.schema.json` and decode as `MDMAPIModel`.
- `.pgi2.json` files must validate against `schemas/protocol/pgi2-ag.schema.json` and decode as `AGAPIModel`.
- `.pgi3.json` files must validate against `schemas/protocol/pgi3-2pq.schema.json`, decode as `TwoPQAPIModel`, and pass the app's graph consistency checks.
- Non-nullable fields are required because the native Swift property is non-optional; missing or JSON null values fail `JSONDecoder` and should be rejected before service execution.
- Nullable fields correspond to Swift optional properties. They may be omitted or set to JSON null.
- Unknown fields are rejected by the PGI schema even though Swift decoding may ignore them; the catalog format is intentionally strict for exchange and validation.

## Linked Mock Services

- Produced or updated by: `pgs_interactive_interpretation` when the requested profile is `.pgi1.json`/`MDMAPIModel`.
- Consumed by: `pgs_final_report` when the report profile supports the native payload's extension and API model.
