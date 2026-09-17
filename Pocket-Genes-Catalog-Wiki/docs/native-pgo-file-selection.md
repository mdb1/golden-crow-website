# Native PGO file selection contract

The native app file-type selector is driven by the Pocket Genes Object catalog, not by a short list of raw file extensions.

## Rules

- Every selectable type is a Pocket Genes Object (`pgo_*`) from `catalog/objects.json`.
- The native source identifier for a catalog object is the exact `object_type`, for example `pgo_sequence_data` or `pgo_pdf_report`.
- Each object has a dedicated native API model name, such as `PGOSequenceDataAPIModel`, `PGOPDFReportAPIModel`, or `PGOFlowCytometryDataAPIModel`.
- File extensions are only discovery hints. The authoritative identity is always the wrapper field `object_type`.
- Even object types backed by non-JSON payloads, such as FASTA, FASTQ, BAM, VCF, PDF, image bundles, or FCS, are selected and stored as JSON object wrappers.
- Large payloads must be represented through `files[]` references with path, URL, file storage ID, media type, size, and digest metadata when available.
- The native app must not store large raw FASTA, FASTQ, BAM, VCF, PDF, image, or FCS payloads directly in its local active-file JSON.
- A PGO wrapper must include `object_id`, `object_type`, `schema_version`, `revision`, `created_at`, `created_by`, `input_refs`, `data`, and `files`.
- The app must reject a wrapper when its `object_type` does not match the type selected by the user.
- For object types whose payload is external by nature, `files[]` must not be empty.

## Native organization

- `PGOObjectType` is the single enum for the 20 catalog objects.
- `PGOObjectCatalog` exposes grouped selectable types for the UI.
- `PGOObjectConverter` validates object wrappers and routes them to the corresponding typed API model.
- Every PGO keeps its own API model file or narrow model group under `Services/PGO/Models`.
- The generic PGO explorer displays object metadata, input references, payload references, and data fields without loading raw payloads into memory.

## Legacy formats

The app still supports legacy provider-specific report formats:

- `MDMAPIModel` for `.pgi1.json`
- `AGAPIModel` for `.pgi2.json`
- `TwoPQAPIModel` for `.pgi3.json`
- `VCFAPIModel` for legacy raw VCF
- `PDFAPIModel` for legacy raw PDF

Those formats remain available for compatibility, but the catalog-driven generic file selector uses PGO object types.
