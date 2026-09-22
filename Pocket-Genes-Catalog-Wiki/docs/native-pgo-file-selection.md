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
- The legacy PDF and VCF choices remain visible as the two classic report experiences.
- The 20 catalog objects live inside one collapsible **Pocket Genes Objects** section. When expanded, its first subsection is **Request preparation**, followed by the remaining catalog groups.
- Tapping a PGO catalog cell opens **Choose your object**, never **Choose your report**.
- `PGOObjectConverter` validates object wrappers and routes them to the corresponding typed API model.
- Every PGO keeps its own API model file or narrow model group under `Services/PGO/Models`.
- The PGO explorer is content-first. Every one of the 20 catalog types has a dedicated primary content route; metadata, input references, process, payload references, and wrapper fields remain secondary destinations and must not replace the object's main visualization.

## File hub presentation

- The generic file destination is titled **Your files** / **Tus archivos**. Supporting copy uses **Choose** / **Elige** consistently.
- PDF and VCF remain the two classic report experiences at the top.
- **Pocket Genes Objects** is a transparent collapsible section title, not another grid card. Expanding it reveals the four catalog groups in the same scrollable composition; it must not present an oversized nested sheet or overlap the disclaimer.
- Every source tile is square. Its artwork has a fixed, uncompressible square equal to one half of the tile side, receives 24 points of top spacing, and is separated from the label by a flexible spacer. Labels use at most two lines. Text length must never resize the artwork.
- The generic **File** tile follows the same artwork geometry as PGO tiles.
- PGO tiles use the canonical cube artwork mapped by `PGOObjectType`, not legacy line icons.
- The nine-digit add-object control fills the alert width with equal positions and 16-point horizontal insets. It accepts only ASCII digits.
- A stored object row presents a 36-point type artwork beside a vertical stack containing **Object code** and the exact nine-digit value.
- **Open object** and **View sample object** are plain actions without a container fill or outline.

## PGO explorer presentation

The object explorer does not reuse the report-explorer introduction or fun-fact carousel. Those components remain report-only.

1. The object-specific hero/header is the first view.
2. The real compact `QuickAccessView` is immediately second.
3. The first quick action is always the one-word **Open** / **Abrir** and routes to the object's dedicated content visualization.
4. Every other quick-action title is unique and exactly one displayed word. The data lens is normally **Metadata** / **Metadatos**.
5. Header accent comes from the canonical color on `PGOObjectType` and matches the object's artwork family.
6. Header pills use a flow layout: they fill the available row before wrapping to the next line.
7. Metadata, process, payload, and insight destinations are secondary. They may explain wrapper structure, but the primary content route must answer what the PGO contains. Examples include a candidate-gene list, an image gallery for `pgo_image_bundle`, consent content, specimen state, reads/sequences, variants, karyotype findings, and flow-cytometry results.
8. Large external payloads remain referenced and lazily opened. A rich explorer does not require loading full FASTA, FASTQ, BAM, VCF, PDF, image, or FCS bytes into the root view.

PGO educational material lives in `LessonReferencePGO.json` and `LessonDictionaryPGO.json`, with Spanish overlays in `SpanishLearnContent.json`. It explains genomic/service processes and object interpretation, not only wrapper formatting. Object explorers may link to that material from secondary destinations, but they do not reintroduce report-style fun-fact cards into the main object explorer.

## Native object access and ownership

PGO access is a separate backend contract from legacy report access. The native client must not fall back from object collections to report collections.

- An object access code is exactly nine ASCII digits (`0` through `9`). It is not a six-character alphanumeric report code. The add-object UI uses a numeric keyboard, displays nine slots, strips non-ASCII digits, limits input to nine digits, and refuses lookup until all nine positions are filled.
- The code is looked up at root `object_codes/{objectCode}`.
- The code document must contain a non-empty `uploaded_object_id`.
- The full record is loaded from root `uploaded_objects/{uploaded_object_id}`.
- The uploaded object must identify its catalog type through the required `object_type` field. Its value must exactly equal the selected canonical `pgo_*` identifier. `provider_format`, display names and file extensions are not accepted as aliases.
- Object payload retrieval uses the uploaded object's `download_url` or `linked_file_id`, following the same large-payload boundary as the wrapper contract. The downloaded/linked wrapper must still pass strict `object_type` validation.
- The uploaded object links to its maker through `object_owner_id`. The maker profile is loaded from root `object_owners/{object_owner_id}`.
- A locally stored PGO records `ownerObjectCode`; it must not populate `ownerReportCode`.
- PGO explorer actions route to object creator, object details, and raw object views. Generic buttons, alerts, empty states, and disconnect language say **object**, not **report**. A `pgo_interactive_report` or `pgo_pdf_report` may still use report terminology when describing that object's actual domain payload.

The legacy report contract remains unchanged and isolated: `report_codes/{reportCode}` -> `uploaded_reports/{uploaded_report_id}` -> `report_owners/{report_owner_id}`.

## Native object administration

Object administration is a first-class clinician workflow, not a report-management compatibility mode.

- `community_users.is_clinician == true` exposes both **Manage uploaded reports** and **Manage uploaded objects** under the profile section **Reports and objects**. The capability applies to both domains; it is not owned by either `report_owners` or `object_owners`.
- The object entry opens **Manage Objects** / **Administrar objetos**. Every subsequent screen, label, empty state and destructive confirmation uses object terminology and object collections.
- Creator information is read from and written to root `object_owners/{communityUserId}`. It must never be resolved from `report_owners`.
- The current user's manageable object IDs are stored in `community_users/{communityUserId}.owned_objects`. The client loads only those IDs from root `uploaded_objects`; it must not infer ownership by scanning report data.
- Every managed object record requires an exact canonical `object_type` from the 20-item catalog. Missing values and aliases such as `form`, extensions or display names are rejected. Its `object_owner_id` and `owner_community_user_id` are required and must identify the same owner.
- New access codes are generated by the app as random nine-digit ASCII strings. Leading zeroes are valid. Before use, the candidate must be checked against `object_codes/{code}`; collisions generate a new candidate.
- Creating an object writes the full record to `uploaded_objects`, writes `object_codes/{code}.uploaded_object_id`, adds the uploaded object ID to `community_users.owned_objects`, and creates or merges the owner snapshot at `object_owners`. These writes must preserve the same owner community user ID.
- An object may begin as an in-process tracker without a source. Its later first upload preserves the object identity and code. Every downloadable `uploaded_objects` record requires a positive integer `upload_version_count`: the first upload stores `1`, and each payload replacement increments it by exactly one rather than creating a second ownership entry.
- A locally downloaded object persists its remote `upload_version_count` beside its nine-digit code. Reopening a service-result screen must recognize that exact code immediately and show **Open**, never **Download**. A metadata-only remote check changes the action to **Update** only when the remote count is greater. Updating replaces the existing local object and its stored version under the same code, so **Choose your object** continues to show a single current item.
- Deleting object-owner information deletes that user's object records and object codes and clears only `owned_objects`. It must not delete reports or set `is_clinician` to false. Deleting report-owner information follows the inverse rule and must leave objects and clinician access intact.

Ownership is creator provenance, not recipient access. Downloading an object delivered by a service stores an authorized local copy but does not add the requester to `owned_objects`, replace `object_owner_id`, or grant editing rights. The full identity, terms, offer/transaction, backoffice, delivery, and non-clinician requester rules are normative in [Ownership, provenance, and service fulfillment](ownership-and-service-fulfillment.md).

## Service-delivered objects

- Requesting a service is the primary native path for a non-clinician to ask a provider to create a new object. Direct object creation remains an `is_clinician` creator workflow and does not fulfill a service transaction.
- A service offer is the reusable, versioned and execution-untimed template/contract. A service transaction is the time-bound request against one frozen offer version.
- The native app may create the request, read the signed-in user's transaction, show progress, communicate, download delivered results, and explore local copies.
- Transaction status changes, `outputObjects`, optional `outputReports`, and the final `delivered` action are managed only through the provider web backoffice and trusted backend.
- Neither `is_clinician` nor ownership of an input object grants native transaction-management authority.
- Delivery requires exact coverage of all promised output roles with ready, versioned objects of the promised catalog types. Optional report snapshots do not satisfy PGO output slots.
- Result downloads resolve the strict `object_codes` chain, retain the remote `upload_version_count`, and show **Open** or **Update** on later visits without transferring creator ownership to the requester.

### Shared stored files

Root `file_storage` is payload storage shared by report and object workflows. The stored payload is domain-agnostic, but each record may be permanently claimed by only one access-code domain:

- `linked_report_code` identifies a legacy six-character report link.
- `linked_object_code` identifies a strict nine-digit object link.
- A stored file is available for a new link only when both fields are empty or null.
- Linking an object writes `linked_object_code` and clears legacy report-link fields. Linking a report writes `linked_report_code` and clears `linked_object_code`.
- Once linked, the association is immutable and the file cannot be reused by a different report or object.
- A clinician may link only a stored file created by the same signed-in account. A manually entered File ID must pass the same creator check as a file selected from the picker.
- Updating a linked stored file creates a new upload version on its linked report or object after ownership and code-to-record integrity are verified.
- Firestore security rules and backend validation must enforce the same one-link invariant; native checks are user feedback, not the security boundary.

## Legacy formats

The app still supports legacy provider-specific report formats:

- `MDMAPIModel` for `.pgi1.json`
- `AGAPIModel` for `.pgi2.json`
- `TwoPQAPIModel` for `.pgi3.json`
- `VCFAPIModel` for legacy raw VCF
- `PDFAPIModel` for legacy raw PDF

Those formats remain available for compatibility, but the catalog-driven generic file selector uses PGO object types.
