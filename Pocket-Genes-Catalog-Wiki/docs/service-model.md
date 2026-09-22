# Pocket Genes Service Model

## Canonical content rule

This is schema 1. There is no legacy compatibility contract, no older production PGO JSON, and no fallback reader. A PGO file is a strict, standalone domain payload selected and validated as one of exactly twenty registered types. It is not a portable platform record and it does not identify itself.

The JSON root must not contain `object_id`, `object_type`, `schema_version`, `revision`, `created_at`, `created_by`, `input_refs`, or generic `files`. There is no `data` wrapper in the serialized file. Those concepts remain in the existing platform records only when an actual feature uses them.

Every type has optional root `notes: string`. Notes may be absent or empty. Notes never become a landfill for removed metadata.

### Content versus platform records

| Boundary | Responsibility | Naming |
| --- | --- | --- |
| Serialized PGO file | Strict domain allowlist only | snake_case |
| `uploaded_objects` | Type, code, owner, linked file, upload version | snake_case |
| `file_storage` | Stored-file identity and content/linkage | snake_case |
| `object_owners` / `object_codes` | Ownership and access lookup | snake_case |
| `service_offers` | Untimed published contract and slots | lower camel case |
| `service_transactions` | Timed request, role bindings, status and outputs | lower camel case |

The same concept intentionally changes casing at a boundary. There are no aliases, fallback reads, or dual writes.

## Exact object registry

| Type | Required content | Optional content |
| --- | --- | --- |
| `pgo_form` | `form_shape`, `fields` | `notes` |
| `pgo_bundle_of_symptoms` | `observations` | `notes` |
| `pgo_bundle_of_candidate_genes` | `genes` | `notes` |
| `pgo_informed_consent` | `title`, `text` | `status`, `accepted_by`, `accepted_at`, `notes` |
| `pgo_test_order` | `patient`, `test_name`, `sample_type` | `test_type`, `objective`, `clinical_suspicion`, `genes`, `notes` |
| `pgo_collection_request` | `patient`, `sample_type` | `collection_method`, `container`, `requested_quantity`, `collection_site`, `scheduled_at`, `notes` |
| `pgo_blood_sample` | `sample_label` | `material`, `container`, `volume_ml`, `notes` |
| `pgo_tissue_sample` | `sample_label` | `anatomical_site`, `preparation`, `notes` |
| `pgo_embryo_sample` | `sample_label`, `material_kind` | `embryo_identifier`, `notes` |
| `pgo_dna_sample` | `sample_label` | `volume_ul`, `concentration_ng_ul`, `notes` |
| `pgo_sequence_reads` | `title`, `reads` | `notes` |
| `pgo_sequence_data` | `title`, `download_url` | `notes` |
| `pgo_aligned_reads` | `title`, `download_url` | `index_download_url`, `notes` |
| `pgo_unannotated_vcf` | `title`, `download_url` | `notes` |
| `pgo_annotated_vcf` | `title`, `download_url` | `notes` |
| `pgo_interactive_report` | `title`, `download_url` | `notes` |
| `pgo_pdf_report` | `title`, `download_url` | `notes` |
| `pgo_image_bundle` | `title`, `images` | `notes` |
| `pgo_karyotype_result` | `result_notation` | `interpretation`, `notes` |
| `pgo_flow_cytometry_data` | `title`, `download_url` | `notes` |

## Service architecture

### Offers

A service offer is an untimed, provider-owned published template. It selects a real Discover organization or professional individual, declares one object type per required input slot, at least one non-form output, integer contract versions, work description, optional commercial terms, and at least one stage. Offers start as draft and become selectable only through publish/active state. `isHiddenFromSearch` removes an offer from discovery without hiding transactions already created from it.

If and only if an offer enables form input, it declares exactly one required `pgo_form` slot with role `form` and a matching external `formShape`. Manual slots cannot use `pgo_form`. The external shape retains generated ID and integer version; the submitted PGO freezes only its field definitions and answers.

### Transactions

A transaction is a timed execution created from an existing active offer. It inherits the pinned service ID/version, provider, input slots, and output slots. Transaction identity and time use transaction fields such as `requestedAt` and `requestedByUserId`; they are not generated form answers.

The native requester sequence is:

1. Validate the offer, form and all selected object references without writing.
2. Recompute usage limits from root transactions.
3. Approve or deny before creating a provider-owned form object.
4. When approved, create the strict pgo_form file under the provider organization, register its object/code, and download the requester's local copy.
5. Create the service transaction and reduced user snapshot.
6. Present confirmation over the service hub, then allow process tracking.

Status progression is controlled by provider/backoffice work. Native users cannot force progress. `delivered` is the successful final state and requires every contractually promised output PGO snapshot in `outputObjects`. Optional `outputReports` do not satisfy a PGO output slot.

### Ownership and delivery

The creator/administrator of an object is its seeder and may manage its stored source. `is_clinician` grants access to both report and object administration; it does not itself confer ownership. Pocket Genes transports and presents authorized files but does not warrant their clinical content.

Service offers are the primary way a regular user requests new objects. Backoffice/provider tooling performs fulfillment, registers output objects, and marks delivery. The requester keeps the transaction while work is pending, then downloads, opens, and updates delivered objects through the normal nine-digit object-code circuit.

Physical specimen identity, custody and consumption safeguards remain operational controls outside PGO content. A transport transaction moves an existing specimen; it does not create duplicate biological material.

## Request limits

The usage policy is unchanged by the PGO redesign. Stable configuration is `20` total transactions, `5` per UTC day, and a `300`-second cooldown unless policy configuration changes.

Usage state is functional and recomputed from root `service_transactions` using `requestedByUserId` and `requestedAt`. Never persist today's count, remaining tokens, last transaction time, cooldown start/end, next request time, or pending admissions. UTC buckets split at 00:00 UTC; the UI displays the reset in device-local time. When daily reset and cooldown both apply, the later deadline wins.

Admission runs before form-object persistence and provider dispatch. A denied attempt creates no transaction, file, uploaded object, code, owner normalization, counter, or cooldown record. `catalog/usage-policy.json` remains the executable source and is intentionally untouched by this migration.

## Native files and URLs

All PGO download URLs are absolute HTTPS and preserve query parameters. URLs may be opaque and need no filename extension. The client downloads and inspects actual native content with the supported parser; it must report ambiguity rather than guess.

Native interactive-report mappings remain:

| File | Model | Provider format |
| --- | --- | --- |
| `.pgi1.json` | `MDMAPIModel` | `mdm` |
| `.pgi2.json` | `AGAPIModel` | `ag` |
| `.pgi3.json` | `TwoPQAPIModel` | `2pq` |

These mappings belong to native parser configuration, not each `pgo_interactive_report`. The six single-file PGOs contain exactly `title`, `download_url`, and optional `notes`; aligned reads may additionally contain `index_download_url`.

## Strict first schema

This is the first PGO content schema and it has not shipped to production. There is no legacy compatibility reader, alias, fallback, dual decoder, or runtime migration utility. Writers emit only the strict allowlists; readers reject envelopes, removed keys and unknown properties immediately.

Repository fixtures and generators were replaced at their source instead of converted at runtime. Existing platform records may still surround strict content for identity, ownership and transaction tests, but that wrapper is not accepted as a PGO file. No discarded field is copied into `notes`, and no old local payload path is rewritten into a fabricated URL.

The repository fixtures are synthetic schema examples using the IANA-reserved `example.com` domain. They are not production objects and are never represented as live downloads.

## Offer and transaction naming

| Boundary | Convention | Examples |
| --- | --- | --- |
| `service_offers` | lower_camel_case | `serviceId`, `isHiddenFromSearch`, `inputSlots`, `outputSlots`, `objectType` |
| `service_transactions` | lower_camel_case | `outputObjects`, `outputReports`, `objectType`, `objectCode`, `reportCode` |
| `uploaded_objects` | snake_case | `object_type`, `object_code`, `object_owner_id`, `upload_version_count` |
| `uploaded_reports` | snake_case | `report_code`, `report_owner_id`, `upload_version_count` |
| `file_storage` | snake_case | `file_name`, `linked_object_code`, `linked_report_code` |
| `object_owners` | snake_case | `owner_name`, `owner_contact_email` |
| `report_owners` | snake_case | `owner_name`, `owner_contact_email` |
| `object_codes` | snake_case | `uploaded_object_id`, `owner_id` |
| `report_codes` | snake_case | `uploaded_report_id`, `owner_id` |

Serialized PGO keys remain snake_case. Explicit adapters convert them when embedding snapshots in camelCase service transactions. Wrong-case aliases are rejected.

## Validation and acceptance

The executable validator checks all twenty schemas, examples, notes variants, unknown-field rejection, exact PDF minimum, standalone symptoms/genes/specimens, Other behavior, direct component URLs, strict forms, service copies, provider examples, naming boundaries, native PGI mappings, generator idempotence, and the unchanged usage policy.

Global object validity is distinct from service suitability. A provider may ask for clarification or reject an input that does not satisfy its published service, but it cannot make provider-specific prerequisites universally required PGO fields.
