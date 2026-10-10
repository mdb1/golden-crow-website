# Pocket Genes Objects and Services Wiki

This document is generated from the strict schema-1 catalog and is the shared source of truth for native apps, backend, backoffice, providers and documentation.

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
| `deferred_service_transactions` | Email-to-transaction-ID index for requesters without an account | snake_case |

The same concept intentionally changes casing at a boundary. There are no aliases, fallback reads, or dual writes.

Entries in `catalog/services.json.services[]` and every `services/*.json` file are direct `service_offers` documents, so every nested document key remains lower camel case. The snake-case platform form objects, provider requests and provider results are separate protocol fixtures under `examples/forms/`, `examples/requests/` and `examples/results/`; they are never embedded in or copied verbatim into a service offer.

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

A service offer is an untimed, provider-owned published template. It selects a real Discover organization or professional individual, declares zero or more required input slots, zero or more output slots, integer contract versions, work description, optional commercial terms, and at least one stage. Offers start as draft and become selectable only through publish/active state. `isHiddenFromSearch` always removes an offer from discovery without hiding transactions already created from it. Otherwise, `isHighlightedOffer` places it under Highlighted and `isProfessionalOffer` places it under For professionals; an offer may appear in both segments, and one with both flags false appears in neither.

The full highlighted card requires both conditions: `isHighlightedOffer` is true and a normalized `promotionalBannerImageUrl` or, when no URL is present, `promotionalBannerImageUploadDataUrl` is available. An offer with a banner but `isHighlightedOffer` false uses the regular service cell with the complete banner as its top section. If both image properties are absent, null or empty, the regular cell reserves no banner box, even when `isHighlightedOffer` is true. Both banner presentations use a 1024:500 frame and aspect-fit rendering so the entire image remains visible without cropping. Segment flags continue to determine whether the offer is listed under Highlighted, For professionals, or both.

`inputSlots` and `outputSlots` are explicit arrays, but each may be empty independently and both may be empty simultaneously. A service may therefore require no form or input object, may finish without producing an object, or may represent provider work with neither object inputs nor object outputs. Empty arrays never create placeholder slots, synthetic objects, or hidden requirements. The calculated `shortContract` uses `none` for each empty side: `none -> report:pdf_report`, `form:form -> none`, or `none -> none`. Native contract and transaction screens show intentional empty states for those sides instead of fabricated rows.

If and only if an offer enables form input, it declares exactly one required `pgo_form` slot with role `form` and a matching external `formShape`. Manual slots cannot use `pgo_form`. The external shape retains generated ID and integer version; the submitted PGO freezes only its field definitions and answers.

### Optional more-information presentation

`moreInformation` is an optional, presentation-only lower-camel-case map on a `service_offers` document. It explains a published offer without changing its input slots, output slots, acceptance rules, price, availability, or provider obligations. The same closed shape is available at `service_transactions.offerSnapshot.moreInformation` so a transaction can freeze the explanatory content that accompanied the selected offer.

| Optional child key | Non-null shape | What to publish |
| --- | --- | --- |
| `frequentQuestions` | array of `{ question, answer }` | Questions a requester commonly asks and direct answers. |
| `keyInsights` | array of `{ title, description }` | The most important takeaways about the service. |
| `scientificFacts` | array of `{ title, description }` | Relevant scientific context stated for the requester. |
| `usefulLinks` | array of `{ title, url }` | Titled external resources whose `url` is absolute HTTPS. |
| `sampleLink` | one `{ title, description, buttonTitle, url }` map | A featured example or sample resource and the exact action label that opens it. |
| `bulletSegments` | array of `{ title, description, imageUrl?, imageUploadDataUrl? }` | Illustrated explanatory segments. Supply at least one image source: an absolute-HTTPS `imageUrl`, an inline base64 image data URL in `imageUploadDataUrl`, or both. When both are present, apps prefer `imageUrl`. |
| `technicalInformationFacts` | array of `{ title, description, subitems }` | Technical facts with an ordered `subitems: string[]` list. |
| `biologicalSampleRequirements` | array of `{ title, description, instructions }` | Biological-material requirements and the instructions needed to satisfy each one. |
| `websiteUrl` | string | The offer's absolute HTTPS website destination. |

Every child key is independently optional and may explicitly be `null`. The root `moreInformation` value may also be omitted or `null`. An empty map, a map whose children are all null, and empty top-level arrays are valid representations of no displayable content. In those states the service-offer detail screen does not show the **More information** button. When at least one section has displayable content, the button presents a modal list; each key has its own visual component, and every omitted, null, or empty section is skipped. The table documents the persistence contract rather than visual order. Both mobile clients use the editorial order `keyInsights`, `scientificFacts`, `frequentQuestions`, `sampleLink`, `bulletSegments`, `technicalInformationFacts`, `biologicalSampleRequirements`, `usefulLinks`, then `websiteUrl`; absence collapses that section without leaving a gap. The illustrated hero uses the real service display name, and shortcuts or anchor chips are created only for destinations that actually exist.

Every visible segment has a styled title header with a small information control at its upper right. Activating that control expands a localized gray explanation directly below the title on the same screen; it never opens a second modal. The `sampleLink` control is the intentional exception in placement: it overlays the featured card's upper-right corner while preserving a full touch target and reserved title space. This guidance is owned by the mobile apps and is not another Firestore field: catalog authors supply only the optional keys and values in the table above.

The two native apps share the same interaction contract. Frequently asked questions and technical groups disclose their content inline; technical headers reserve equal leading and trailing control slots for vertical alignment. `bulletSegments` accepts either `imageUrl` or `imageUploadDataUrl` and renders a fixed circular leading thumbnail without an expand action. The service website has its own titled section. Supplied decorative artwork is bundled for the hero, featured sample link, illustrated-image fallback, and first biological-requirement summary; artwork does not create a section when the corresponding model value is absent.

Every non-null array item is a closed map and must contain all fields shown for that item type, except that each `bulletSegments[]` item requires `title`, `description`, and at least one of its two optional image-source keys. A non-null `sampleLink` is also closed and requires all four fields. Object members and array string items are nonempty after whitespace; array items themselves cannot be null. Empty `technicalInformationFacts[].subitems` arrays are valid. `usefulLinks[].url`, `sampleLink.url`, `bulletSegments[].imageUrl`, and `websiteUrl` must be nonempty absolute URIs with the exact lowercase `https://` scheme. Userinfo is forbidden; the host must use DNS/IPv4 label form or bracketed IPv6; an optional port contains one to five digits; whitespace is invalid. Paths, queries, and fragments remain valid. `bulletSegments[].imageUploadDataUrl` must be a nonempty `data:image/...;base64,...` value with a valid base64 payload. This is the same uploaded-image representation used elsewhere in the apps and is copied unchanged into transaction offer snapshots.

The map accepts only the nine keys in the table, and every nested item accepts only its documented keys. Unknown properties, malformed non-null values, snake-case aliases such as `more_information`, `frequent_questions`, `button_title`, `image_url`, `image_upload_data_url`, or `website_url`, and wrong-case alternatives are rejected rather than read as compatibility aliases.

#### Complete authoring example

```json
{
  "frequentQuestions": [
    {
      "question": "What kinds of specimens can be used?",
      "answer": "The provider reviews compatible blood, tissue, or embryo-biopsy specimens against the selected extraction profile."
    }
  ],
  "keyInsights": [
    {
      "title": "A quality DNA input starts with the specimen",
      "description": "Specimen identity, condition, and the requested downstream study determine whether extraction can proceed."
    }
  ],
  "scientificFacts": [
    {
      "title": "Extraction separates DNA from other cellular material",
      "description": "The laboratory uses a validated workflow to isolate DNA while controlling contamination and degradation."
    }
  ],
  "usefulLinks": [
    {
      "title": "DNA extraction overview",
      "url": "https://example.com/services/dna-extraction/overview"
    }
  ],
  "sampleLink": {
    "title": "Review a sample result",
    "description": "See a fictional example of the information returned after an accepted extraction workflow.",
    "buttonTitle": "Open sample",
    "url": "https://example.com/services/dna-extraction/sample"
  },
  "bulletSegments": [
    {
      "title": "Provider review",
      "description": "The laboratory confirms that the submitted specimen and order are suitable for the published workflow.",
      "imageUrl": "https://example.com/images/services/dna-extraction-review.png"
    }
  ],
  "technicalInformationFacts": [
    {
      "title": "Technical deliverables",
      "description": "The completed service registers the extracted DNA and the updated source-specimen state.",
      "subitems": [
        "Extracted DNA identity and measured properties",
        "Source-specimen revision reflecting material use"
      ]
    }
  ],
  "biologicalSampleRequirements": [
    {
      "title": "Accepted material",
      "description": "Submit one specimen compatible with the extraction profile selected in the request form.",
      "instructions": "Keep the specimen identified and follow the provider's collection, packaging, and delivery directions."
    }
  ],
  "websiteUrl": "https://example.com/services/dna-extraction"
}
```

### Transactions

A transaction is a timed execution created from an existing active offer. It inherits the pinned service ID/version, provider, input slots, and output slots, including explicit empty arrays. Transaction identity and time use root transaction fields; they are not generated form answers. `requestedByUserId` is always optional because a requester may not have an account yet. Every new transaction must have at least one requester identity: an authenticated request has `requestedByUserId` and may retain `requestedByUserEmail`; an accountless request has a normalized `requestedByUserEmail` and no `requestedByUserId`. An offer with no form and no input slots proceeds directly to confirmation and admission without creating a form object or asking for files.

### Supplemental linked output reports

`service_transactions.outputReports` is the one report-link boundary for a service transaction. It is optional, output-only, and independent of the service offer contract. The field may be omitted or explicitly `null`; an empty array is also valid. All three states mean that the transaction has no linked report to present, so native transaction detail screens omit the entire **Linked output reports** section. The section appears only when at least one valid linked report is actually present.

When present and non-null, the value is an array of unique closed maps with exactly one key:

`{ "reportCode": "ABC123" }`

`reportCode` uses the lower-camel-case key required inside `service_transactions`; its value is exactly six uppercase ASCII letters or digits. The snapshot must not duplicate a report title, file name, URL, owner, provider format, upload version, or report payload, and it must not use snake-case `report_code`. There is no `inputReports` field. `outputReports` also never appears on `service_offers` or inside `offerSnapshot`.

Service-offer `inputSlots`, `outputSlots`, the corresponding frozen snapshot arrays, `shortContract`, and `outputObjects` describe Pocket Genes Objects only. They never promise, require, or count uploaded reports. A PGO type such as `pgo_pdf_report` remains an object governed by an object slot; that is distinct from a supplemental uploaded-report link. Consequently, adding or removing `outputReports` never changes transaction status, never makes a transaction complete or incomplete, never satisfies a missing `outputSlots` role, and never prevents delivery. A provider may attach no report, one report, or several reports without changing the contracted object outcome.

#### Backend registration and linkage

Before appending a snapshot, trusted backend/provider tooling registers a real, authorized report through the existing report storage circuit:

1. Normalize and validate the six-character code, then resolve `report_codes/{reportCode}` through its snake-case `uploaded_report_id` field.
2. Load `uploaded_reports/{uploadedReportId}` and require its snake-case `report_code` to equal the transaction snapshot code exactly. The record must be ready for the requesting user, expose a supported `provider_format`, and have a positive `upload_version_count`.
3. Supply report bytes through the report record's usable `download_url` or its `linked_file_id`. A linked `file_storage` record must carry the same snake-case `linked_report_code` and a compatible `file_type`/payload.
4. Only after the report can be resolved safely, append the unique lower-camel-case transaction snapshot `{ "reportCode": "ABC123" }`. Do not copy snake-case storage metadata into the transaction and do not write both naming styles.

For uploaded reports, the canonical `provider_format` values supported by both native clients are exactly `mdm`, `ag`, `2pq`, `vcf`, and `pdf`. When `linked_file_id` is used, `file_storage.file_type` must use the same canonical value. A `pgo_*` value belongs to the separate uploaded-object/`outputObjects` circuit and is never a linked report format.

The following is a partial linkage example; unrelated collection-required ownership, authorization, attribution, and audit fields are intentionally omitted:

    service_transactions/{transactionId}
    { "outputReports": [{ "reportCode": "ABC123" }] }

    report_codes/ABC123
    { "uploaded_report_id": "uploaded-report-123" }

    uploaded_reports/uploaded-report-123
    {
      "report_code": "ABC123",
      "provider_format": "pdf",
      "upload_version_count": 3,
      "linked_file_id": "file-123"
    }

    file_storage/file-123
    {
      "linked_report_code": "ABC123",
      "file_type": "pdf",
      "file_content": "<payload encoded for the normal PDF report pipeline>"
    }

The direct-download variant writes an unpadded absolute HTTP(S) `download_url` with a host on `uploaded_reports` instead of depending on `linked_file_id` and `file_storage`. In both variants all report-code occurrences must match byte-for-byte; clients do not trim, uppercase, or accept legacy aliases at read time.

The transaction detail screen resolves each code through that same established report path and presents the report experience below **Output files**: download when it is not stored locally, open when it is available, and update when the registered positive upload version is newer. Resolution or authorization failures are report-level errors; they do not retroactively alter the transaction lifecycle. Writers should omit the field when there are no links, although explicit `null` and `[]` remain valid no-content representations for readers and migrations.

### Email-only requests and deferred linking

The offers authentication wall has a tertiary **Continue without signing in** action. It never unlocks another account's private records; it establishes only the device's verified deferred-email boundary. It opens `TransactionEmailCollectScreen` before the service form, validates one email address, and checks the normalized lowercase value against the `community_users` account index before storing it locally through `TransactionEmailCollectProvider`. An existing account blocks the anonymous path and shows a dedicated warning with a **Log in** action that presents the shared authentication wall again; a failed lookup also blocks progress. Only an email confirmed not to belong to an existing account is eligible for the anonymous form. Native then reads that email's deferred index and permits at most five unresolved `deferred_transaction_ids`. At five IDs, `TransactionEmailCollectLimitExceededScreen` replaces the form path with a terminal explanation and a primary **Log in to continue** action. Successful authentication returns to the usual authenticated request flow. Transaction creation enforces the same maximum atomically while writing the transaction and deferred index, so concurrent devices cannot exceed it. Only after both checks pass is the email stored locally. The provider records whether the device has requested a service with the email, the `deferred_email` request method, and the locally known deferred transaction IDs. The email is requester identity for admission and transaction creation; it is not an authenticated user ID.

An email-only request still creates its complete canonical document in root `service_transactions`, with `requestedByUserEmail` and without `requestedByUserId`. The separate `deferred_service_transactions` collection is only an index. It contains exactly one deterministic document per normalized email (the document ID is a URL-safe base64 encoding of that normalized email), with this closed snake_case payload:

`{ "email": "x@y.com", "deferred_transaction_ids": ["pgr_..."] }`

It never duplicates transaction data. New accountless requests append their transaction ID to `deferred_transaction_ids`; duplicate IDs are forbidden. The email field and every indexed transaction's `requestedByUserEmail` must normalize to the exact same value.

The standard requested-services screen uses one list for authenticated and accountless requests. When signed out, if `TransactionEmailCollectProvider` retains an email, native reads only that email's deterministic deferred index, loads those exact transaction documents, and verifies that each still has the same normalized `requestedByUserEmail` and no `requestedByUserId`. Verified deferred requests appear directly as the normal tappable service-request cells and open the usual transaction detail screen; there is no separate deferred-services modal. The signed-out empty state is shown only when no verified deferred requests exist. When deferred cells are present, a **Create an account** promotional cell and device-link disclaimer appear below them and open the shared authentication wall. Signed-out detail access repeats the deterministic-index membership, email, and missing-user-ID checks before returning the full transaction. Missing, mismatched, malformed, already-linked, or non-indexed transactions are never shown or opened.

The **Account status** modal follows the same boundary. While signed out with verified deferred requests, its usage projection is built only from the current email's exact verified deferred items, so cooldown, daily usage, total remaining, and recent activity are available without an authentication empty state. It never broadens the lookup to arbitrary transactions sharing an untrusted email value.

Native code checks the one deferred index document for the exact verified account email after every successful authentication completed through the shared authentication wall, regardless of which feature presented it, including Discover, **View my reports**, and the requested-services account promotion. Opening or refreshing either authenticated transaction screen also performs the check in the background; while that screen is doing the work, its table shows a small **Linking service transactions** spinner. For each valid deferred ID, one Firestore transaction performs the normalization as a unit:

1. Read the full `service_transactions/{id}`, verify the exact normalized email, and reject a record linked to a different user.
2. Build the normal reduced snapshot and insert or replace it in `community_users/{uid}.requestedServiceTransactions`.
3. Add the authenticated UID to `service_transactions.requestedByUserId`, producing the same user-to-transaction link as a request originally made while signed in.
4. Remove the ID from `deferred_service_transactions.deferred_transaction_ids` only after the user and transaction links are written in that same atomic operation.

Missing, malformed, email-mismatched, or conflicting transactions are never attached to the user; unresolved valid references remain available for a later safe retry. Feature-specific post-login work runs only after this normalization attempt finishes. After linking, native reloads `requestedServiceTransactions`, so the normalized transactions appear in the standard list. Native pending-output discovery uses that normalized index on app/root startup, when the user enters the **Reports** tab, and from the existing downloaded-file and source-selection entry points. A successful account transition schedules the same authenticated discovery again, so newly linked files do not depend on visiting one particular screen. The email may remain on the full transaction as immutable requester provenance, but future authorization and user-list lookup use `requestedByUserId`.

The native requester sequence is:

1. Validate the offer, form, all selected object references, and either the authenticated user identity or collected normalized email without writing.
2. Recompute usage limits from root transactions by `requestedByUserId` for an authenticated requester or by `requestedByUserEmail` for an email-only requester.
3. Approve or deny before creating a provider-owned form object.
4. When approved, create the strict pgo_form file under the provider organization, register its object/code, and download the requester's local copy.
5. Create the service transaction and either the reduced authenticated-user snapshot or the one-per-email deferred index entry.
6. Present confirmation over the service hub, then allow process tracking.

Status progression is controlled by provider/backoffice work. Native users cannot force progress. `delivered` is the successful final state and requires every contractually promised output PGO snapshot in `outputObjects`. When `outputSlots` is empty, `delivered` is consistent only with an empty `outputObjects` array and no object is required to prove completion. Supplemental `outputReports` are always optional: their absence, null value, empty array, later addition, removal, or resolution failure does not change status or completeness, and they never satisfy a declared PGO output slot.

### Proactive service-output discovery

Output availability and transaction status are intentionally independent in the native clients. For an authenticated requester, discovery starts only from that user's reduced `requestedServiceTransactions` references, fetches the referenced root transactions one by one, verifies `requestedByUserId` against the active user, and inspects every valid referenced transaction regardless of whether its status is `requested`, `received`, `validating`, `awaiting_input`, `accepted`, `queued`, `running`, `delivered`, `rejected`, `failed`, or `cancelled`. A failure or stale reference is isolated to that transaction and does not suppress later checks.

Every scan considers both canonical output boundaries: `outputObjects` and `outputReports`. Objects are eligible as soon as their canonical object snapshot is attached. Reports remain optional and are eligible only when their report code resolves to supported, ready downloadable metadata and payload. Items already present in the local downloaded-file inventory are removed from the result, and repeated pending references are presented only once. A transaction-detail screen likewise shows attached output objects immediately even before `delivered`; early availability never changes status, satisfies missing contract roles, or proves completion.

The app-level discovery coordinator runs asynchronously on root startup, after the authenticated user boundary changes, and whenever the user switches to the **Reports** tab. Its presentation owner lives above the tab content, so the existing **New files available** experience can appear over any root tab, including **Discover**. Existing downloaded-file and report/object source-selection entry points request that same whole-account scan through the global coordinator instead of owning competing modal presentations. Only one global scan or presentation is active at a time: overlapping scan triggers coalesce, routine triggers received while the modal is visible are ignored, and the post-authentication normalization refresh waits until the current presentation ends so newly linked transactions are not missed. Discovery never downloads silently: the user still chooses one item or **Download all**, whose queue is processed sequentially.

### Ownership and delivery

The creator/administrator of an object is its seeder and may manage its stored source. `is_clinician` grants access to both report and object administration; it does not itself confer ownership. Pocket Genes transports and presents authorized files but does not warrant their clinical content.

Service offers are the primary way a regular user requests new objects. Backoffice/provider tooling performs fulfillment, registers output objects, and marks delivery. The requester keeps the transaction throughout its lifecycle and may download, open, and update an attached object through the normal nine-digit object-code circuit as soon as it becomes available; the later `delivered` status still communicates contractual completion rather than file visibility.

Physical specimen identity, custody and consumption safeguards remain operational controls outside PGO content. A transport transaction moves an existing specimen; it does not create duplicate biological material.

## Downloaded-file updates

`DownloadedFileUpdater` keeps authorized local reports and Pocket Genes Objects current without changing backend records or service fulfillment. This lifecycle introduces no new backend collection or document field. Canonical identity is `{ kind, code }`; report codes are six uppercase ASCII letters/digits, object codes are nine ASCII digits, and only a positive canonical `upload_version_count` greater than the installed version creates an update. Replacements must match kind, code, source, and a version at least as new as the probe, then commit over the existing local copy without a delete-first interval.

The three explicit intents are `collectionAutomatic` for the fully blocking **Your downloaded files** sweep, `currentAutomatic` for one silently probed current file, and `currentManual` for the user's one-file **Update now** request. Current-file checks show no UI in the usual up-to-date case. A compact blocker appears only after a newer version is proven and remains through sequential download, validated local replacement, and active-content rehydration.

Automatic intents honor `BlacklistedFileUpdateProvider`. A blacklisted current file shows the green **Update now** action only when its quiet probe proves a newer version; that manual run bypasses filtering once but preserves the opt-out. Runs are serialized, cancellable, watchdog-bounded, failure-safe, retryable as fresh runs, and privacy-safe: public state never contains file payloads, URLs, access credentials, ownership/requester data, or clinical content. iOS and Android share this contract for reports and objects. The full generated specification is `docs/downloaded-file-updates.md`.

## Deleted identity continuity

This contract applies whenever retained application data references a person, profile, professional, publisher, provider, owner, requester, participant, or organization whose canonical identity no longer exists. It applies to every current and future feature, even when that feature is not named below.

### Non-cascading continuity rule

Deleting an account or identity does not implicitly delete otherwise valid content or business records created by, owned by, requested by, published by, or associated with that identity. Posts, replies, reference cards, conversations, events, activity entries, relationships, service offers, service transactions, reports, Pocket Genes Objects, stored files, audit records, and other surviving records remain available wherever their own retention, moderation, privacy, authorization, and lifecycle rules allow them to appear.

The absence of the referenced identity changes attribution and identity-targeted actions; it does not make the surviving record malformed. Clients must not discard a valid record merely because its creator, owner, requester, provider, publisher, or participant lookup is missing. Content is removed only by its own explicit deletion, moderation, legal, retention, or lifecycle rule. Account deletion is never an inferred cascade.

Keeping a record does not widen access. Existing authorization, access-code, transaction-party, report, object, file, and privacy boundaries still apply. A missing owner must never cause ownership or administrative rights to transfer to another user, and cached email, username, display name, avatar, logo, or raw ID must never be used to bypass those boundaries.

### Authoritative identity states

Every identity reference is resolved through the shared `DeletedUserProvider` contract into exactly one runtime state:

1. **Loading/unresolved:** no authoritative result exists yet. Show a neutral loading presentation when needed and do not enable identity-targeted actions.
2. **Active:** a successful authoritative lookup found the canonical identity. Normal presentation and actions may be used, subject to their ordinary authorization.
3. **Deleted:** a successful server lookup authoritatively confirmed that the canonical identity document does not exist, or a trusted backend deletion marker confirms deletion. Only this state may use deleted-identity copy.
4. **Unavailable:** the lookup failed, timed out, was denied, returned malformed data, received an invalid/blank reference, or otherwise could not establish existence. This is not deletion. Show a retryable unavailable state and never label it **Deleted**.

A missing embedded snapshot, missing avatar, empty display name, cached miss, offline cache, permission error, or network error is not evidence of deletion. Authoritative active/deleted results may be cached for a short bounded period and invalidated on authentication or account lifecycle changes. User-owned mutations must force a fresh authoritative check because an authentication session can outlive account deletion.

### Single presentation authority

`DeletedUserProvider` is the single point of contact on every client, including iOS, Android, and web, for identity availability and deleted/unavailable presentation. Despite its historical name, its presentation contract covers user, profile, professional, owner, publisher, provider, and organization references. Lookup adapters may resolve different canonical collections, but feature code must not invent its own tombstones.

The provider owns:

- State resolution, batching, deduplication, bounded caching, invalidation, and retry behavior.
- Context-aware localized display names, descriptions, accessibility labels, icons, colors, full-state views, and navigation destinations.
- The decision to suppress cached identity imagery and personal text after confirmed deletion.
- The active-identity guard used immediately before mutations that require a live actor.

Feature screens own their surviving domain content and authorization rules, but consume the provider's presentation. They must not hardcode **Deleted user**, select a one-off icon, expose a raw identifier, or independently infer deletion.

### Canonical deleted presentation

A confirmed deleted identity uses a neutral gray crossed-out/slashed profile icon. The default cross-platform semantic asset is `person.crop.circle.badge.xmark` (or the visually equivalent platform icon) with `#8E8E93`. It has no remote image URL. Preserved snapshots may remain in storage for historical integrity, but client rendering must ignore their former avatar, logo, icon, color, username, full name, email, and organization name once deletion is confirmed.

The provider selects localized context-aware copy:

| Context | Primary English fallback | Intended use |
| --- | --- | --- |
| Person byline, message, participant, requester, friend | **Deleted user** | A missing human account in retained content or a relationship. |
| Profile destination | **Deleted profile** | A route whose primary resource was the deleted person's profile. |
| Organization, institutional publisher, organization owner | **Deleted organization** | A missing organization identity or publisher record. |
| Professional publisher or service provider | **Deleted provider** | A missing professional/provider identity when provider wording is clearer than user wording. |
| Generic ownership field | **Deleted owner** | A report/object owner row when person versus organization cannot be established safely. |

Spanish and every other supported locale must receive real translations from the provider. Screens must not concatenate localized fragments. Accessibility labels must convey both the identity kind and that it was deleted; color and the crossed-out mark cannot be the only signal.

Unavailable identity presentation must be visibly and semantically different: use provider-owned **User information unavailable** or context equivalent, an unavailable/warning icon, and **Try again** when retry is possible. It must not reuse deleted wording, imply permanent deletion, or silently fall back to stale personal data.

### Surface-by-surface behavior

| Surface or record | What survives | Deleted-identity behavior |
| --- | --- | --- |
| Community posts, replies, comments, reactions, reference cards, and quoted content | The content, timestamps, counts, attachments, and thread structure remain under their own rules. | Replace the author identity only. The card/detail remains readable and tappable. The byline uses **Deleted user** and the gray crossed-out icon; the identity control opens the deleted-profile state instead of a live profile. |
| Public/private community profile and activity routes | Links from retained content may still navigate to the former identity route. | Show a complete deleted-profile state with no former personal fields. Activity that cannot exist without the profile gets an intentional empty/deleted state; never crash or synthesize a profile. |
| Rare Friends connections, requests, suggestions, circles, participant lists, chat threads, messages, and notifications | Historical relationship, circle, message, and notification records remain when their own rules retain them. | Historical rows/messages show a tombstone identity. Do not allow new friendship requests, follows, invitations, direct chats, or other mutations targeting the deleted identity. Active-only discovery/suggestion lists may exclude deleted identities. If no actionable identities remain, show that surface's normal empty state. |
| Discover feed items, news, research, opportunities, events, saved items, and spotlight references | Published/editorial content remains readable, shareable, and saved according to its own status. | Override stale `publisherSnapshot` identity presentation. Publisher taps open a deleted-profile/organization/provider state. A missing publisher never causes a valid feed item or event to disappear. Active publisher directories may exclude deleted publishers because those lists advertise actionable identities. |
| Service offers | Historical offer content and references remain available where the product normally exposes them. | Show **Deleted provider** or **Deleted organization** in place of the former provider. Disable a new request, contact, follow, or other action that requires the missing provider; do not infer a replacement provider. Existing transactions remain reachable. |
| Service transactions and process history | Contract snapshot, status, stages, inputs, outputs, dates, and audit history remain visible to already-authorized parties. | A deleted requester or provider is tombstoned in its role. Do not attach the transaction to a different account, recover identity from email, or expose former personal data. Provider/requester-targeted actions are disabled, while authorized access to surviving transaction details and outputs continues. |
| Reports, report owners, uploaded objects, object owners, access-code records, and stored files | The report/object/file remains governed by its own owner, code, storage, and authorization records. | Render the missing creator/owner/provider through the provider. Do not delete the report/object, invalidate a legitimate code solely because identity presentation is missing, grant management rights, or replace the owner. Missing subordinate data gets a contextual empty state. |
| Pocket Genes Object content | The strict serialized domain payload is unchanged. | Never add deleted-user flags, names, icons, owner IDs, creator snapshots, tombstones, or platform envelopes to PGO JSON. Resolve deleted identity only at surrounding `uploaded_objects`, `object_owners`, `service_transactions`, Discover publisher, report, and UI presentation boundaries. |
| Events, activity/audit entries, and in-app notifications | Historical event and audit facts remain according to their independent policy. | Preserve the fact and replace only actor presentation. If the target content itself is gone, show the event/notification's missing-content state rather than pretending the actor deletion removed it. |
| Organizations, professionals, publishers, and providers | Surviving content and business history that reference the entity remain. | Use the context label and gray crossed-out identity visual; suppress the former logo and contact data. Active catalogs may omit the missing entity, but historical content must still render. |
| Any future actor-linked feature | Its domain record survives according to its own policy. | Resolve every actor reference through `DeletedUserProvider`. A feature is incomplete if a missing identity can hide surviving content, leak stale identity data, expose a raw ID, enable a forbidden mutation, or crash. |

### Navigation, interaction, and empty states

Content navigation and identity navigation are separate. Tapping a retained post, reply, event, offer, transaction, report, object, or message opens that surviving record when the viewer is authorized. Tapping its deleted avatar/name opens the provider-owned deleted state. Deep links to deleted profiles, owners, publishers, providers, or organizations must resolve to that same fallback instead of failing navigation.

Actions that operate on surviving content, such as reading, sharing, saving, downloading an already-authorized output, or viewing transaction progress, continue under normal rules. Actions that require the deleted principal, including follow, friend request, invite, start-chat, provider contact, ownership transfer acceptance, editing as that owner, or creation of a new service request, are absent or disabled with provider-owned explanatory copy. Mutation code must reject the operation even if stale UI left a control visible.

Identity absence is not a content empty state. A list of retained posts from deleted authors still shows the posts. A conversation with deleted senders still shows retained messages. Use an empty state only when the domain query itself has no visible records or the requested subordinate resource is independently missing. Detail screens must tolerate absent optional profile, owner, provider, report, object, attachment, participant, or contact data and replace the missing region with a contextual empty state rather than force-unwrapping, spinning forever, or removing the whole surviving record.

### Backoffice and persistence responsibilities

Deletion tooling must make non-cascading behavior explicit. Removing authentication, community user, public/private profile, or an organization/professional identity must not issue broad deletes against content, relationship history, offers, transactions, reports, objects, files, events, or audit records unless a separate explicit policy requires that exact deletion. It may clean active-only indexes and future-action queues, but retained records keep stable foreign IDs so the provider can resolve their presentation deterministically.

Clients must not rewrite every historical record to copy a tombstone, and no collection gains ad hoc `isDeletedUser`, deleted-name, or deleted-avatar aliases. The canonical identity lookup (or trusted deletion marker) determines runtime state. Existing snapshots remain provenance only and are overridden at presentation time. Logging and analytics may retain opaque IDs where policy permits, but user-facing UI never shows a raw deleted identity ID or personal snapshot as fallback.

Every producer that persists actor-linked data must write the stable canonical reference available at that boundary. These references are platform metadata, never serialized PGO content:

| Retained boundary | Stable reference used for runtime resolution |
| --- | --- |
| Community posts, replies, messages, reactions, Rare Friends relationships/circles, notifications, events, and audit entries | The canonical community-user ID, plus an explicit actor kind only when the record can reference more than one identity collection. |
| Discover feed items, saved items, opportunities, events, organizations, and professionals | Publisher ID plus publisher kind, resolved against `feed_organizations` or `feed_individuals`. A publisher snapshot is display provenance only. |
| `service_offers` and `service_transactions` | `providerId` plus `providerKind`; authenticated transactions also retain `requestedByUserId`. Snapshot names and requester emails never replace those references. |
| `uploaded_reports` and `report_owners` | `report_owner_id` and, when the owner is tied to an account, `owner_community_user_id`. |
| `uploaded_objects` and `object_owners` | `object_owner_id` and `owner_community_user_id`; service-created objects additionally retain `provider_id` plus `provider_kind`. |
| `file_storage` | Authenticated submissions retain `submitted_by_user_id`; provider-produced files also retain `provider_id` plus `provider_kind` when that canonical provider is known. |

New writes must not rely on email, username, display name, avatar URL, logo URL, or other mutable personal text as the only actor reference. A legacy record with no usable canonical ID is **Unavailable**, not **Deleted**: keep the domain record, suppress stale personal snapshots, show the provider-owned unavailable state, and do not guess identity by email. A record with a usable canonical reference must resolve that reference before rendering its identity region, even when a cached snapshot is present.

### Platform parity and acceptance tests

iOS, Android, and web must implement the same state machine, evidence rules, labels by context, gray crossed-out visual semantics, navigation results, mutation guards, retry behavior, accessibility meaning, and English/Spanish localization wherever the corresponding surface exists. Layout may be native to each platform; behavior may not diverge.

Minimum automated coverage includes:

1. Provider unit tests for active, deleted, unavailable, loading, invalid ID, authoritative cache expiry/invalidation, request deduplication, batch lookup, forced refresh, and stale completion handling.
2. Negative tests proving timeout, permission denial, malformed data, missing snapshot object, offline state, and missing embedded snapshots never become **Deleted**.
3. Presentation tests proving deleted state suppresses every cached avatar/logo/name/email/color and emits the provider-owned context label, icon, gray color, description, and accessibility label.
4. Feature tests for community posts/replies/profiles/activity, Rare Friends connections/circles/chat, Discover publishers/events, services/offers/transactions, and report/object/owner details. Each test keeps the domain record visible while replacing identity presentation.
5. Navigation tests proving identity taps and deep links reach the deleted or retryable unavailable state, while content taps still reach surviving authorized content.
6. Mutation tests proving stale sessions and stale UI cannot post, reply, follow, connect, message, administer, transfer, contact, or request work as/with a deleted principal.
7. Empty-state and malformed-reference tests proving missing nested data cannot crash, loop indefinitely, reveal a raw ID, or erase otherwise valid parent content.
8. Contract tests proving serialized PGO files remain unchanged and reject any attempted deleted-identity metadata or platform envelope.
9. Cross-platform snapshot/semantic assertions for the gray crossed-out icon, context-specific localized copy, retryable unavailable state, and accessibility labels.

The acceptance rule is universal: every retained record must remain coherent when each actor reference is independently active, deleted, temporarily unavailable, loading, malformed, or absent. New actor-linked surfaces must add these cases before they are complete.

## Closed service-offer type registry

This registry is the complete and exclusive taxonomy for service offers. It contains exactly 110 values and is intentionally closed: adding a category requires a coordinated contract change to the canonical catalog, schema, validator, documentation, native provider and tests. Entries 1–30 describe one atomic genomic professional or pipeline outcome. Entries 31–60 describe an inseparable, end-to-end genomic pathway whose contracted outcome is a completed report. Entries 61–110 describe person-to-person advice, education and support whose outcome is professional guidance rather than genomic processing.

Este registro es la taxonomía completa y exclusiva de las ofertas de servicios. Contiene exactamente 110 valores y es cerrado de manera intencional: agregar una categoría requiere un cambio coordinado del catálogo canónico, el esquema, el validador, la documentación, el proveedor nativo y las pruebas. Las entradas 1–30 describen un resultado profesional o de proceso genómico puntual. Las entradas 31–60 describen un circuito genómico integral e indivisible cuyo resultado contratado es un informe terminado. Las entradas 61–110 describen asesoramiento, educación y apoyo entre personas cuyo resultado es orientación profesional y no procesamiento genómico.

### Persistence and selection rules / Reglas de persistencia y selección

- **Persist the key only / Persistir únicamente la clave.** The field is the lower-camel-case `service_offers.serviceCategory`, and its value is one exact, case-sensitive `sot_*` key from the table. Never write `service_category`, a translated label, a description or an SF Symbol. / El campo es `service_offers.serviceCategory` en lower camel case y su valor es una clave `sot_*` exacta y sensible a mayúsculas de la tabla. Nunca se guarda `service_category`, una etiqueta traducida, una descripción ni un SF Symbol.
- **Exactly one category per offer / Exactamente una categoría por oferta.** Select the category that describes the offer's primary contracted and billable outcome. Inputs, supporting steps and the provider's profession do not determine the category. / Se selecciona la categoría que describe el resultado principal contratado y facturable. Los insumos, pasos auxiliares y la profesión del proveedor no determinan la categoría.
- **Split independently marketed outcomes / Separar resultados comercializados por separado.** If two outcomes can be requested or fulfilled independently, publish separate offers. If several steps are inseparable parts of one package, use the category of the final primary outcome and describe the included supporting work in the offer. / Si dos resultados pueden solicitarse o cumplirse de manera independiente, se publican ofertas separadas. Si varios pasos son partes inseparables de un paquete, se usa la categoría del resultado final principal y se describe el trabajo auxiliar incluido en la oferta.
- **Reserve `sot_complete_*` for the full pathway / Reservar `sot_complete_*` para el circuito integral.** A complete category is valid only when one offer includes sample planning and collection, laboratory analysis, bioinformatic interpretation and delivery of the named final report. The schema therefore requires exactly the three canonical stages `test_planning`, `wet_lab` and `bioinformatics`. A collection-only, assay-only, interpretation-only or report-formatting offer must use one of entries 1–30 instead. / Una categoría integral solo es válida cuando una misma oferta incluye planificación y toma de muestra, análisis de laboratorio, interpretación bioinformática y entrega del informe final indicado. Por eso el esquema exige exactamente las tres etapas canónicas `test_planning`, `wet_lab` y `bioinformatics`. Una oferta solo de toma, ensayo, interpretación o armado de informe debe usar una de las entradas 1–30.
- **Reserve `sot_human_advice_*` for human guidance / Reservar `sot_human_advice_*` para la orientación humana.** Entries 61–110 classify a contracted consultation, counseling, teaching or support outcome. They require the single stage `human_advice`; that stage is invalid for every other category. They do not imply that Pocket Genes licensed, accredited or endorsed the provider, and they never represent emergency response, an invasive procedure, legal representation, admission, approval, employment, savings or another guaranteed result unless the offer expressly and lawfully says so. / Las entradas 61–110 clasifican un resultado contratado de consulta, asesoramiento, enseñanza o apoyo. Requieren la única etapa `human_advice`, que es inválida para cualquier otra categoría. No implican que Pocket Genes haya habilitado, acreditado o avalado al prestador y nunca representan respuesta de emergencia, un procedimiento invasivo, representación legal, admisión, aprobación, empleo, ahorro u otro resultado garantizado, salvo que la oferta lo indique de manera expresa y lícita.
- **Keep service stages separate from PGO stages / Separar las etapas de servicio de las etapas PGO.** `human_advice` extends only the service-offer, transaction-snapshot and provider-capability lifecycle vocabulary. It does not change the three-stage PGO object catalog and is never written into standalone serialized PGO content. / `human_advice` amplía únicamente el vocabulario del ciclo de ofertas, snapshots de transacción y capacidades de prestadores. No modifica el catálogo de objetos PGO de tres etapas y nunca se escribe dentro del contenido PGO serializado e independiente.
- **Keep provider identity separate / Mantener separada la identidad del prestador.** Human-advice offers are suitable for independent professionals but may also be published by organizations. `providerKind` remains an independent field, while credentials, jurisdiction, delivery mode and precise scope must be stated and verified through their own provider and offer data. / Las ofertas de asesoramiento humano son adecuadas para profesionales independientes, pero también pueden ser publicadas por organizaciones. `providerKind` sigue siendo un campo independiente, mientras que las credenciales, la jurisdicción, la modalidad y el alcance preciso deben declararse y verificarse mediante los datos propios del prestador y de la oferta.
- **Do not relabel genomic work as advice / No reclasificar trabajo genómico como asesoramiento.** A test, sample, assay, genomic interpretation or report deliverable continues to use entries 1–60. Advice may discuss such work, but the selected category must follow the primary billable outcome. / Un estudio, una muestra, un ensayo, una interpretación genómica o un informe entregable continúa usando las entradas 1–60. El asesoramiento puede tratar esos temas, pero la categoría elegida debe seguir el resultado principal facturable.
- **Keep screening and diagnosis distinct / Distinguir cribado de diagnóstico.** A category named screening or risk report communicates probability and follow-up needs; it must not be presented as a definitive diagnosis. Non-clinical wellness, ancestry and trait reports must retain their stated limits. / Una categoría denominada cribado o informe de riesgo comunica probabilidades y necesidades de seguimiento; no debe presentarse como diagnóstico definitivo. Los informes no clínicos de bienestar, ascendencia y rasgos deben conservar los límites indicados.
- **No aliases or inferred values / Sin alias ni valores inferidos.** Writers and backoffice validation accept only registered keys. Labels are localized at display time from the registry, and the SF Symbol is presentation metadata for the picker. / Los escritores y la validación de backoffice aceptan únicamente claves registradas. Las etiquetas se localizan al mostrarse desde el registro y el SF Symbol es metadato de presentación para el selector.
- **Historical fallback is display-only / El fallback histórico es solo visual.** Native readers tolerate a missing, null, empty or unrecognized historical value and display **Uncategorized / Sin categoría**. That fallback is not a 111th category, is never persisted, and does not match a category filter; editing the offer requires selecting a valid key. / Los lectores nativos toleran un valor histórico ausente, nulo, vacío o desconocido y muestran **Uncategorized / Sin categoría**. Ese fallback no es una categoría número 111, nunca se persiste y no coincide con un filtro de categoría; para editar la oferta se debe elegir una clave válida.

### Lifecycle routing guide / Guía por etapa del ciclo

| Area / Área | Keys / Claves | Selection boundary / Criterio de selección |
| --- | --- | --- |
| Clinical preparation / Preparación clínica | 1–5 | Counseling, phenotype intake, consent, test choice or issuance of the order; stop at the exact action sold. / Asesoramiento, admisión fenotípica, consentimiento, selección del estudio o emisión de la orden; se elige la acción exacta vendida. |
| Specimen and laboratory / Muestra y laboratorio | 6–12 | Collection, transport, accession/quality, DNA extraction, sequencing, targeted genotyping or chromosome-level analysis. / Toma, transporte, recepción/calidad, extracción de ADN, secuenciación, genotipado dirigido o análisis cromosómico. |
| Specialized screening / Cribados especializados | 13–14 | Use only for prenatal screening or reproductive carrier screening; these are purpose-defined screenings, not generic sequencing or final clinical interpretation. / Se usa solo para cribado prenatal o de portadores reproductivos; son cribados definidos por propósito, no secuenciación genérica ni interpretación clínica final. |
| Bioinformatics pipeline / Flujo bioinformático | 15–20 | Quality control, alignment, small-variant calling, structural/CNV analysis, annotation or prioritization; each key names one computational boundary. / Control de calidad, alineamiento, detección de variantes pequeñas, análisis estructural/CNV, anotación o priorización; cada clave representa un límite computacional. |
| Interpretation by purpose / Interpretación por propósito | 21–27 | General clinical interpretation or a purpose-specific analysis for rare disease, hereditary cancer, pharmacogenomics, nutrigenomics/metabolism, ancestry or polygenic risk. / Interpretación clínica general o análisis específico de enfermedad rara, cáncer hereditario, farmacogenómica, nutrigenómica/metabolismo, ascendencia o riesgo poligénico. |
| Reporting and exchange / Informes e intercambio | 28–30 | Create a report, independently review a completed report, or convert/validate files without biological interpretation. / Crear un informe, revisar de forma independiente un informe terminado o convertir/validar archivos sin interpretación biológica. |
| Complete human reports / Informes humanos integrales | 31–43 | Use only when collection, laboratory genomics, interpretation and the named human health, wellness, ancestry or trait report are sold as one inseparable service. / Usar solo cuando la toma, el estudio genómico de laboratorio, la interpretación y el informe humano de salud, bienestar, ascendencia o rasgos se venden como un servicio indivisible. |
| Complete reproductive and early-life reports / Informes reproductivos y de primera etapa de vida integrales | 44–54 | Carrier, fertility, sperm-DNA, karyotype, preimplantation, prenatal or newborn pathways that begin with the required sample and end with the purpose-specific report. / Circuitos de portación, fertilidad, ADN espermático, cariotipo, preimplantación, etapa prenatal o neonatal que comienzan con la muestra requerida y terminan con el informe específico. |
| Complete animal and authentication reports / Informes animales y de autenticación integrales | 55–60 | Species-aware animal health, traits, diversity, identity or food-authentication workflows delivered from verified sampling through the final report. / Circuitos por especie de salud, rasgos, diversidad, identidad animal o autenticación alimentaria entregados desde el muestreo verificado hasta el informe final. |
| Health and reproductive guidance / Orientación en salud y reproducción | 61–68 | Non-emergency medical, medication, nutrition, rehabilitation, reproductive, sexual-health, pregnancy or postpartum guidance; choose the professional scope actually contracted. / Orientación no urgente médica, farmacéutica, nutricional, de rehabilitación, reproductiva, de salud sexual, embarazo o posparto; se elige el alcance profesional efectivamente contratado. |
| Psychological and social support / Apoyo psicológico y social | 69–76 | Psychological, relationship, grief, addiction-recovery, parenting, caregiving, accessibility or social-resource support; emergency response and formal certifications stay outside these categories. / Apoyo psicológico, vincular, en duelo, recuperación de adicciones, crianza, cuidados, accesibilidad o recursos sociales; la respuesta de emergencia y las certificaciones formales quedan fuera de estas categorías. |
| Legal guidance / Orientación jurídica | 77–81 | Civil, family and estate, labor, commercial-contract or immigration advice under the provider's declared jurisdiction; representation is included only when explicitly stated. / Asesoramiento civil, de familia y sucesiones, laboral, comercial-contractual o migratorio bajo la jurisdicción declarada por el prestador; la representación solo se incluye cuando se indica expresamente. |
| Education and career / Educación y carrera | 82–86 | Tutoring, specialized learning support, language instruction, admissions planning or career guidance; no credential, admission, funding or employment result is implied. / Tutoría, apoyo especializado al aprendizaje, enseñanza de idiomas, planificación de admisiones u orientación profesional; no se presume un título, admisión, financiamiento ni empleo. |
| Technology, business and finance / Tecnología, negocios y finanzas | 87–90 | Practical digital support, cybersecurity/privacy consulting, entrepreneurship consulting, or financial/accounting/tax guidance, each limited to the provider's declared competence and authorization. / Soporte digital práctico, consultoría en ciberseguridad y privacidad, consultoría para emprendimientos o asesoramiento financiero, contable e impositivo, cada uno limitado a la competencia y habilitación declaradas por el prestador. |
| Health professional development and healthcare improvement / Desarrollo profesional y mejora en salud | 91–100 | Career and professional development, clinical mentoring, leadership, training design, research and publication support, evidence-based practice, quality and safety, or practice operations; choose the exact professional or organizational outcome contracted. / Desarrollo de carrera y profesional, mentoría clínica, liderazgo, diseño de capacitación, apoyo en investigación y publicación, práctica basada en evidencia, calidad y seguridad u operaciones de prácticas; se elige el resultado profesional u organizacional exacto contratado. |
| Digital health and health technology / Salud digital y tecnología sanitaria | 101–110 | Digital-health strategy, system implementation and optimization, interoperability, telehealth, health-data governance, responsible AI adoption, medical-technology products, infrastructure, usability, human factors, or accessibility; select the exact advisory outcome rather than a clinical service or custom engineering deliverable. / Estrategia de salud digital, implementación y optimización de sistemas, interoperabilidad, telesalud, gobierno de datos de salud, adopción responsable de inteligencia artificial, productos de tecnología médica, infraestructura, usabilidad, factores humanos o accesibilidad; se selecciona el resultado de asesoramiento exacto y no un servicio clínico ni un desarrollo de ingeniería a medida. |

### Exact 110-value registry / Registro exacto de 110 valores

| Key | English | Español | SF Symbol | Closed definition (English) | Definición cerrada (español) |
| --- | --- | --- | --- | --- | --- |
| `sot_genetic_counseling` | Genetic counseling | Asesoramiento genético | `person.2.wave.2.fill` | Professional counseling that explains genetic risk, testing choices, inheritance, and informed next steps; it does not perform laboratory testing or interpret a completed genomic dataset. | Asesoramiento profesional que explica el riesgo genético, las opciones de estudio, la herencia y los próximos pasos informados; no realiza pruebas de laboratorio ni interpreta un conjunto de datos genómicos completo. |
| `sot_clinical_intake_phenotyping` | Clinical intake and phenotyping | Admisión clínica y fenotipado | `list.clipboard.fill` | Collection and structuring of symptoms, diagnoses, family history, and observable traits before test selection or genomic analysis. | Recopilación y estructuración de síntomas, diagnósticos, antecedentes familiares y rasgos observables antes de seleccionar un estudio o realizar un análisis genómico. |
| `sot_informed_consent` | Genetic informed consent | Consentimiento informado genético | `signature` | Creation, review, or capture of consent specifically authorizing a genetic or genomic service and its declared data uses. | Creación, revisión o registro del consentimiento que autoriza específicamente un servicio genético o genómico y los usos de datos declarados. |
| `sot_genetic_test_selection` | Genetic test selection | Selección de estudio genético | `checklist.checked` | Comparison and recommendation of the most appropriate genetic test for an already defined clinical question; it does not place the order. | Comparación y recomendación del estudio genético más apropiado para una pregunta clínica ya definida; no realiza la orden. |
| `sot_genetic_test_ordering` | Genetic test ordering | Orden de estudio genético | `doc.badge.plus` | Preparation and issuance of a concrete genetic test order after the test, patient, sample requirements, and authorization are known. | Preparación y emisión de una orden concreta de estudio genético una vez definidos el estudio, la persona, los requisitos de muestra y la autorización. |
| `sot_sample_collection` | Biological sample collection | Toma de muestra biológica | `cross.vial.fill` | Scheduling or performing collection of blood, saliva, tissue, cells, or another declared biological specimen. | Programación o realización de la toma de sangre, saliva, tejido, células u otra muestra biológica declarada. |
| `sot_sample_logistics` | Sample transport and logistics | Transporte y logística de muestras | `shippingbox.fill` | Chain-of-custody transport, routing, delivery, or temperature-controlled logistics for an already collected biological sample. | Transporte con cadena de custodia, ruteo, entrega o logística con temperatura controlada para una muestra biológica ya tomada. |
| `sot_sample_accession_quality` | Sample accession and quality | Recepción y calidad de muestras | `checkmark.seal.fill` | Laboratory receipt, identity verification, suitability checks, and pre-analytic quality assessment of a submitted sample. | Recepción en laboratorio, verificación de identidad, controles de aptitud y evaluación de calidad preanalítica de una muestra recibida. |
| `sot_dna_extraction` | DNA extraction | Extracción de ADN | `drop.triangle.fill` | Isolation of DNA from a biological specimen, producing an extracted-DNA object rather than sequence data or interpretation. | Aislamiento de ADN a partir de una muestra biológica, con producción de un objeto de ADN extraído y no de datos de secuencia ni interpretación. |
| `sot_dna_sequencing` | DNA sequencing | Secuenciación de ADN | `waveform.path.ecg.rectangle.fill` | Generation of raw DNA sequence reads from prepared genetic material using a declared sequencing assay or platform. | Generación de lecturas crudas de secuencia de ADN a partir de material genético preparado mediante un ensayo o plataforma declarados. |
| `sot_genotyping` | Targeted genotyping | Genotipado dirigido | `scope` | Measurement of a predefined set of loci, alleles, or markers; it is distinct from broad sequencing and from downstream interpretation. | Medición de un conjunto predefinido de loci, alelos o marcadores; es diferente de la secuenciación amplia y de la interpretación posterior. |
| `sot_cytogenetic_analysis` | Cytogenetic analysis | Análisis citogenético | `square.grid.3x3.fill` | Chromosome-level laboratory analysis such as karyotyping, FISH, or equivalent cytogenetic assessment. | Análisis de laboratorio a nivel cromosómico, como cariotipo, FISH o una evaluación citogenética equivalente. |
| `sot_prenatal_genetic_screening` | Prenatal genetic screening | Cribado genético prenatal | `figure.and.child.holdinghands` | Screening during pregnancy for declared fetal or chromosomal risks, including NIPT; screening is not a definitive diagnostic interpretation. | Cribado durante el embarazo de riesgos fetales o cromosómicos declarados, incluido NIPT; el cribado no constituye una interpretación diagnóstica definitiva. |
| `sot_reproductive_carrier_screening` | Reproductive carrier screening | Cribado reproductivo de portadores | `figure.2.and.child.holdinghands` | Assessment of carrier status for inherited conditions in an individual or reproductive pair for family-planning use. | Evaluación del estado de portador de enfermedades hereditarias en una persona o pareja reproductiva para planificación familiar. |
| `sot_sequence_quality_control` | Sequence quality control | Control de calidad de secuencias | `waveform.and.magnifyingglass` | Technical assessment, trimming, filtering, or validation of raw sequence reads before alignment or variant discovery. | Evaluación técnica, recorte, filtrado o validación de lecturas crudas antes del alineamiento o el descubrimiento de variantes. |
| `sot_read_alignment` | Sequence read alignment | Alineamiento de lecturas | `point.3.connected.trianglepath.dotted` | Mapping sequence reads to a declared reference assembly, producing aligned-read data without calling variants. | Mapeo de lecturas de secuencia contra un ensamblado de referencia declarado, produciendo datos alineados sin detectar variantes. |
| `sot_variant_calling` | Small-variant calling | Detección de variantes pequeñas | `text.badge.checkmark` | Identification of SNVs and small insertions or deletions from aligned genomic reads; it excludes structural and copy-number analysis. | Identificación de SNV y pequeñas inserciones o deleciones a partir de lecturas genómicas alineadas; excluye el análisis estructural y de número de copias. |
| `sot_structural_variant_cnv_analysis` | Structural variant and CNV analysis | Análisis de variantes estructurales y CNV | `rectangle.3.group.fill` | Detection of large rearrangements, copy-number gains or losses, and other declared structural genomic events. | Detección de grandes reordenamientos, ganancias o pérdidas de número de copias y otros eventos genómicos estructurales declarados. |
| `sot_variant_annotation` | Variant annotation | Anotación de variantes | `tag.fill` | Addition of gene, transcript, population, functional, and database context to already called variants without ranking or clinical conclusions. | Incorporación de contexto de genes, transcritos, población, función y bases de datos a variantes ya detectadas, sin priorización ni conclusiones clínicas. |
| `sot_gene_variant_prioritization` | Gene and variant prioritization | Priorización de genes y variantes | `arrow.up.arrow.down.square.fill` | Ranking of candidate genes or variants against a declared phenotype or analysis goal without issuing a final clinical interpretation. | Ordenamiento de genes o variantes candidatos según un fenotipo u objetivo de análisis declarado, sin emitir una interpretación clínica final. |
| `sot_genomic_interpretation` | Clinical genomic interpretation | Interpretación genómica clínica | `stethoscope` | Expert classification and clinical assessment of genomic findings for a defined case, including evidence and limitations. | Clasificación experta y evaluación clínica de hallazgos genómicos para un caso definido, con evidencia y limitaciones. |
| `sot_rare_disease_analysis` | Rare-disease genomic analysis | Análisis genómico de enfermedades raras | `magnifyingglass.circle.fill` | Case-level genomic investigation specifically for a suspected rare or undiagnosed disorder using phenotype-linked evidence. | Investigación genómica de un caso específicamente por una enfermedad rara o no diagnosticada, usando evidencia vinculada al fenotipo. |
| `sot_hereditary_cancer_analysis` | Hereditary cancer analysis | Análisis de cáncer hereditario | `shield.checkerboard` | Assessment of germline findings and family context specifically for inherited cancer susceptibility syndromes. | Evaluación de hallazgos germinales y contexto familiar específicamente para síndromes de predisposición hereditaria al cáncer. |
| `sot_pharmacogenomic_analysis` | Pharmacogenomic analysis | Análisis farmacogenómico | `pills.fill` | Evaluation of genetic variants for declared medication response, metabolism, efficacy, or adverse-reaction guidance. | Evaluación de variantes genéticas para orientar respuesta, metabolismo, eficacia o reacciones adversas de medicamentos declarados. |
| `sot_nutrigenomic_metabolic_analysis` | Nutrigenomic and metabolic analysis | Análisis nutrigenómico y metabólico | `leaf.fill` | Interpretation of genetic factors specifically related to nutrient processing, dietary response, or inherited metabolic traits. | Interpretación de factores genéticos relacionados específicamente con el procesamiento de nutrientes, la respuesta alimentaria o rasgos metabólicos heredados. |
| `sot_ancestry_analysis` | Genetic ancestry analysis | Análisis de ascendencia genética | `globe.americas.fill` | Estimation of population ancestry, geographic origins, or genetic lineages; it does not provide medical risk interpretation. | Estimación de ascendencia poblacional, orígenes geográficos o linajes genéticos; no proporciona interpretación de riesgo médico. |
| `sot_polygenic_risk_analysis` | Polygenic risk analysis | Análisis de riesgo poligénico | `chart.xyaxis.line` | Calculation and contextualization of a declared polygenic score for a specified trait or condition using an identified model and population scope. | Cálculo y contextualización de una puntuación poligénica declarada para un rasgo o condición, usando un modelo y alcance poblacional identificados. |
| `sot_genomic_report_generation` | Genomic report generation | Generación de informe genómico | `doc.richtext.fill` | Assembly of validated service outputs into a human-readable genomic report without adding a separate second-opinion review. | Composición de resultados validados del servicio en un informe genómico legible, sin agregar una revisión independiente de segunda opinión. |
| `sot_genomic_report_review` | Genomic report review | Revisión de informe genómico | `doc.text.magnifyingglass` | Independent professional review, explanation, or second opinion on an already completed genomic report. | Revisión profesional independiente, explicación o segunda opinión sobre un informe genómico ya finalizado. |
| `sot_genomic_data_interoperability` | Genomic data conversion and interoperability | Conversión e interoperabilidad de datos genómicos | `arrow.left.arrow.right.square.fill` | Deterministic conversion, packaging, validation, or exchange of genomic files between declared formats without biological analysis or interpretation. | Conversión determinística, empaquetado, validación o intercambio de archivos genómicos entre formatos declarados, sin análisis biológico ni interpretación. |
| `sot_complete_health_genomics_report` | Comprehensive health genomics report | Informe genómico integral de salud | `heart.text.square.fill` | An inseparable sample-to-report health profile that combines specimen collection, genomic testing, evidence-based interpretation across the declared health domains, and one consolidated final report; it is not a diagnosis of every disease. | Perfil de salud indivisible desde la toma de muestra hasta el informe, que combina obtención de la muestra, estudio genómico, interpretación basada en evidencia de las áreas de salud declaradas y un informe final consolidado; no diagnostica todas las enfermedades. |
| `sot_complete_rare_disease_diagnostic_report` | Rare-disease genomic diagnosis report | Informe genómico diagnóstico de enfermedades poco frecuentes | `cross.case.fill` | A complete diagnostic pathway for a suspected rare or undiagnosed disorder, from collection of the patient and any declared family samples through phenotype-guided genomic analysis and a clinically interpreted final report. | Circuito diagnóstico completo para una enfermedad poco frecuente o aún no diagnosticada, desde la toma de la muestra de la persona y de los familiares declarados hasta el análisis genómico guiado por el fenotipo y el informe final con interpretación clínica. |
| `sot_complete_hereditary_cancer_report` | Hereditary cancer genomic report | Informe genómico de cáncer hereditario | `cross.case.circle.fill` | A sample-to-report assessment of inherited cancer susceptibility, including the declared germline panel, family-history context, variant interpretation, and a final report suitable for professional counseling and follow-up. | Evaluación de principio a fin de la predisposición hereditaria al cáncer, que incluye el panel germinal declarado, el contexto de antecedentes familiares, la interpretación de variantes y un informe final apto para asesoramiento y seguimiento profesional. |
| `sot_complete_inherited_cardiovascular_report` | Inherited cardiovascular disease genomic report | Informe genómico de enfermedades cardiovasculares hereditarias | `heart.circle.fill` | A complete inherited-cardiovascular service covering specimen collection, analysis of the declared cardiomyopathy, arrhythmia, aortopathy, or lipid-disorder genes, case-aware interpretation, and delivery of the final report. | Servicio cardiovascular hereditario completo que abarca la toma de muestra, el análisis de los genes declarados para miocardiopatías, arritmias, aortopatías o trastornos lipídicos, la interpretación según el caso y la entrega del informe final. |
| `sot_complete_neurogenetic_disease_report` | Neurogenetic disease report | Informe de enfermedades neurogenéticas | `brain.fill` | An end-to-end evaluation for a declared hereditary neurologic or neurodegenerative question, joining sample acquisition, the appropriate molecular assay, phenotype-aware interpretation, and a clear final report with limitations. | Evaluación integral para una consulta neurológica o neurodegenerativa hereditaria declarada, que reúne la obtención de la muestra, el ensayo molecular apropiado, la interpretación según el fenotipo y un informe final claro con sus limitaciones. |
| `sot_complete_cystic_fibrosis_report` | Cystic fibrosis genetic report | Informe genético de fibrosis quística | `lungs.fill` | A complete CFTR testing service, from an accepted patient or reproductive sample through the declared variant or full-gene analysis, interpretation for the stated diagnostic or reproductive purpose, and the final report. | Servicio completo de estudio de CFTR, desde una muestra aceptada de la persona o con fines reproductivos hasta el análisis de variantes o del gen completo declarado, la interpretación para el objetivo diagnóstico o reproductivo indicado y el informe final. |
| `sot_complete_pharmacogenomic_report` | Personalized pharmacogenomic report | Informe farmacogenómico personalizado | `pill.circle.fill` | A complete medication-response genomics service that collects the specimen, assays the declared gene-drug markers, assigns supported phenotypes, and delivers a clinician-oriented report without independently prescribing or changing treatment. | Servicio farmacogenómico completo que obtiene la muestra, estudia los marcadores gen-fármaco declarados, asigna los fenotipos respaldados y entrega un informe orientado al profesional, sin prescribir ni modificar tratamientos por sí solo. |
| `sot_complete_nutrigenomic_report` | Personalized nutrigenomic report | Informe nutrigenómico personalizado | `fork.knife.circle.fill` | An end-to-end nutritional genomics profile, including sample collection, analysis of the declared nutrient and metabolic markers, evidence-graded interpretation, and a final report intended to complement professional nutrition advice. | Perfil nutrigenómico integral que incluye toma de muestra, análisis de los marcadores nutricionales y metabólicos declarados, interpretación graduada según la evidencia y un informe final destinado a complementar el asesoramiento nutricional profesional. |
| `sot_complete_food_response_genetics_report` | Food-response genetics report | Informe genético de respuesta a los alimentos | `carrot.fill` | A sample-to-report genetic assessment of declared inherited food-response traits, such as lactose metabolism or celiac susceptibility; it excludes IgE or IgG antibody testing and does not diagnose a food allergy. | Evaluación genética de principio a fin de rasgos hereditarios declarados relacionados con la respuesta a los alimentos, como el metabolismo de la lactosa o la susceptibilidad celíaca; excluye los estudios de anticuerpos IgE o IgG y no diagnostica alergias alimentarias. |
| `sot_complete_sports_performance_genetics_report` | Sports performance genetics report | Informe genético de rendimiento deportivo | `figure.run` | A complete non-diagnostic sports-genetics service that takes a specimen, evaluates the declared performance, recovery, metabolism, and injury-susceptibility markers, and returns a contextualized final report. | Servicio completo y no diagnóstico de genética deportiva que toma una muestra, evalúa los marcadores declarados de rendimiento, recuperación, metabolismo y susceptibilidad a lesiones, y entrega un informe final contextualizado. |
| `sot_complete_skin_hair_genetics_report` | Skin and hair genetics report | Informe genético de piel y cabello | `sparkles` | An end-to-end cosmetic and wellness genetics profile covering sample collection, analysis of the declared skin or hair traits, cautious interpretation of their evidence, and a personalized non-diagnostic report. | Perfil genético integral de bienestar y cuidado estético que abarca la toma de muestra, el análisis de los rasgos declarados de piel o cabello, una interpretación prudente de la evidencia y un informe personalizado no diagnóstico. |
| `sot_complete_genetic_ancestry_report` | Comprehensive genetic ancestry report | Informe integral de ascendencia genética | `map.fill` | A complete ancestry service from DNA collection through comparison with declared reference populations and lineages to a final probabilistic report; it makes no medical or legal identity determination. | Servicio completo de ascendencia, desde la toma de ADN y su comparación con poblaciones y linajes de referencia declarados hasta un informe probabilístico final; no determina identidad médica ni legal. |
| `sot_complete_personal_traits_genetics_report` | Genetic traits and characteristics report | Informe genético de rasgos y características personales | `theatermasks.fill` | A sample-to-report, non-diagnostic profile of declared physical, sensory, or behavioral trait probabilities, with laboratory genotyping, transparent evidence limits, and a final educational report. | Perfil no diagnóstico de principio a fin sobre probabilidades de rasgos físicos, sensoriales o conductuales declarados, con genotipificación de laboratorio, límites de evidencia transparentes y un informe educativo final. |
| `sot_complete_reproductive_carrier_report` | Reproductive carrier screening report | Informe integral de portación reproductiva | `person.2.circle.fill` | A complete carrier-screening pathway for one person or a reproductive pair, including sample collection, the declared recessive and X-linked panel, couple-aware residual-risk interpretation when applicable, and the final report. | Circuito completo de cribado de portadores para una persona o pareja reproductiva, que incluye toma de muestra, el panel declarado de enfermedades recesivas y ligadas al X, interpretación del riesgo residual de la pareja cuando corresponda y el informe final. |
| `sot_complete_female_fertility_genetics_report` | Female fertility genetic report | Informe genético de fertilidad femenina | `person.crop.circle.fill.badge.plus` | An end-to-end genetic assessment for a declared female-fertility question, combining sample collection, indicated molecular or cytogenetic testing, reproductive-context interpretation, and a final report without claiming to measure fertility on genetics alone. | Evaluación genética integral para una consulta declarada de fertilidad femenina, que combina toma de muestra, estudios moleculares o citogenéticos indicados, interpretación en contexto reproductivo y un informe final, sin afirmar que la genética por sí sola mide la fertilidad. |
| `sot_complete_male_infertility_genetics_report` | Male infertility genetic report | Informe genético de infertilidad masculina | `person.crop.circle.fill.badge.checkmark` | A complete genetic workup for an indicated male-infertility presentation, from blood or other accepted sample through the declared karyotype, Y-microdeletion, CFTR, or related testing to an interpreted final report. | Estudio genético completo para una presentación indicada de infertilidad masculina, desde sangre u otra muestra aceptada hasta el cariotipo, las microdeleciones del cromosoma Y, CFTR u otros análisis declarados, con un informe final interpretado. |
| `sot_complete_sperm_dna_integrity_report` | Sperm DNA integrity report | Informe de integridad del ADN espermático | `waveform.path.ecg` | A complete semen-sample service that measures the declared sperm DNA fragmentation or chromatin-integrity endpoint, performs quality-controlled interpretation, and delivers a fertility-context report; it is not whole-genome sequencing. | Servicio completo sobre una muestra de semen que mide el indicador declarado de fragmentación del ADN espermático o integridad de la cromatina, realiza una interpretación con control de calidad y entrega un informe en contexto de fertilidad; no es secuenciación del genoma completo. |
| `sot_complete_reproductive_couple_karyotype_report` | Reproductive couple karyotype report | Informe de cariotipo de la pareja reproductiva | `person.2.fill` | An end-to-end cytogenetic service for a reproductive pair, covering both blood collections, chromosome analysis, joint interpretation for infertility or pregnancy-loss risk, and coordinated final reports. | Servicio citogenético integral para una pareja reproductiva que abarca ambas extracciones de sangre, el análisis cromosómico, la interpretación conjunta del riesgo de infertilidad o pérdida gestacional y los informes finales coordinados. |
| `sot_complete_preimplantation_aneuploidy_report` | Preimplantation aneuploidy screening report | Informe preimplantacional de cribado de aneuploidías | `circle.grid.cross.fill` | A complete PGT-A pathway from accepted embryo-biopsy material through genome-wide chromosome copy-number screening and quality review to an embryo-level report for the treating reproductive team. | Circuito completo de PGT-A, desde el material aceptado de biopsia embrionaria hasta el cribado del número de copias cromosómicas a escala genómica, su control de calidad y un informe por embrión para el equipo de reproducción tratante. |
| `sot_complete_preimplantation_monogenic_report` | Preimplantation monogenic disease report | Informe preimplantacional de enfermedades monogénicas | `microbe.fill` | A complete PGT-M service for a confirmed familial variant, including case review and assay preparation, embryo-biopsy testing, linkage or direct-variant analysis as declared, and the final embryo report. | Servicio completo de PGT-M para una variante familiar confirmada, que incluye revisión del caso y preparación del ensayo, estudio de biopsias embrionarias, análisis de ligamiento o de la variante directa según lo declarado y el informe final de cada embrión. |
| `sot_complete_preimplantation_structural_report` | Preimplantation structural rearrangement report | Informe preimplantacional de reordenamientos estructurales | `square.3.layers.3d.down.right` | An end-to-end PGT-SR pathway for a known parental chromosome rearrangement, from case setup and embryo biopsy through the declared unbalanced-rearrangement analysis to the final embryo-level report. | Circuito integral de PGT-SR para un reordenamiento cromosómico parental conocido, desde la preparación del caso y la biopsia embrionaria hasta el análisis declarado de reordenamientos desequilibrados y el informe final por embrión. |
| `sot_complete_noninvasive_prenatal_report` | Non-invasive prenatal aneuploidy report | Informe prenatal no invasivo de aneuploidías | `cross.vial` | A complete maternal-blood cfDNA screening service, including collection, laboratory and bioinformatic assessment of the declared fetal chromosome risks, quality metrics, and a final risk report; it is screening, not a diagnostic result. | Servicio completo de cribado de ADN fetal libre en sangre materna que incluye extracción, evaluación de laboratorio y bioinformática de los riesgos cromosómicos fetales declarados, métricas de calidad y un informe final de riesgo; es un cribado, no un resultado diagnóstico. |
| `sot_complete_prenatal_carrier_fetal_risk_report` | Prenatal carrier and fetal-risk report | Informe prenatal de portación y riesgo fetal | `figure.child.circle.fill` | An integrated maternal-sample pathway that combines the declared carrier panel with reflex fetal cfDNA risk assessment when indicated and returns one clearly separated maternal and fetal-risk report; elevated risk requires appropriate confirmation. | Circuito integrado sobre una muestra materna que combina el panel de portación declarado con la evaluación refleja del riesgo fetal mediante ADN libre cuando está indicada, y entrega un informe que separa con claridad los resultados maternos y el riesgo fetal; un riesgo elevado requiere la confirmación correspondiente. |
| `sot_complete_newborn_genomic_screening_report` | Newborn genomic screening report | Informe de cribado genómico neonatal | `stroller.fill` | A complete newborn screening pathway from the accepted neonatal specimen through the declared genomic analysis and quality review to a family- and clinician-facing report that identifies screening findings and recommended confirmatory follow-up. | Circuito completo de cribado neonatal, desde la muestra aceptada del recién nacido hasta el análisis genómico declarado y su control de calidad, con un informe para la familia y el equipo clínico que identifica hallazgos de cribado y el seguimiento confirmatorio recomendado. |
| `sot_complete_animal_parentage_identity_report` | Animal parentage and identity report | Informe genético de parentesco e identidad animal | `pawprint.circle.fill` | An end-to-end animal identity service that collects or receives verified specimens, compares the declared parentage or identity markers, applies species-appropriate interpretation, and issues the final relationship or identity report. | Servicio integral de identidad animal que obtiene o recibe muestras verificadas, compara los marcadores declarados de parentesco o identidad, aplica una interpretación adecuada para la especie y emite el informe final de vínculo o identidad. |
| `sot_complete_canine_health_diversity_report` | Canine health and genetic diversity report | Informe de salud y diversidad genética canina | `dog.fill` | A complete canine DNA profile from cheek-swab collection through the declared breed-relevant disease and diversity markers to a final report for veterinary care or responsible breeding; only validated markers for the stated breed are interpreted. | Perfil completo de ADN canino, desde la toma de hisopado bucal hasta los marcadores declarados de enfermedades y diversidad pertinentes para la raza, con un informe final para la atención veterinaria o la cría responsable; solo se interpretan marcadores validados para la raza indicada. |
| `sot_complete_feline_health_traits_report` | Feline genetic health and traits report | Informe genético de salud y rasgos felinos | `cat.fill` | An end-to-end feline genetics service covering sample collection, the declared inherited-disease, blood-group, ancestry, or coat-trait panel, species- and breed-aware interpretation, and one final report. | Servicio integral de genética felina que abarca la toma de muestra, el panel declarado de enfermedades hereditarias, grupo sanguíneo, ascendencia o rasgos del pelaje, la interpretación según especie y raza y un informe final. |
| `sot_complete_equine_health_performance_report` | Equine genetic health and performance report | Informe genético de salud y rendimiento equino | `hare.fill` | A complete equine testing pathway from hair-root or other accepted specimen through the declared inherited-disease, gait, performance, or coat-trait markers to a final veterinary or breeding report. | Circuito completo de estudio equino, desde raíces de pelo u otra muestra aceptada hasta los marcadores declarados de enfermedades hereditarias, locomoción, rendimiento o rasgos del pelaje, con un informe final veterinario o de cría. |
| `sot_complete_livestock_breeding_traits_report` | Livestock breeding and production genomics report | Informe genético de reproducción y aptitudes productivas ganaderas | `leaf.circle.fill` | An end-to-end livestock genetics service that links a verified animal specimen to the declared reproductive, health, milk, fiber, or production-trait panel and delivers a species-specific report for veterinary or breeding decisions. | Servicio integral de genética ganadera que vincula una muestra animal verificada con el panel declarado de reproducción, salud, leche, fibra o aptitudes productivas y entrega un informe específico para la especie destinado a decisiones veterinarias o de cría. |
| `sot_complete_meat_species_authentication_report` | Meat species DNA-authentication report | Informe de autenticación de especies cárnicas por ADN | `barcode.viewfinder` | A complete food-authentication service from documented meat sampling through species-targeted DNA analysis and mixture review to a final report identifying the detected declared species; it does not assess nutritional quality or food allergy. | Servicio completo de autenticación alimentaria, desde el muestreo documentado de carne hasta el análisis de ADN dirigido a especies y la revisión de mezclas, con un informe final que identifica las especies declaradas detectadas; no evalúa calidad nutricional ni alergias alimentarias. |
| `sot_human_advice_medical_consultation` | Medical consultation | Consulta médica | `cross.case.circle` | Non-emergency review of general or specialty health concerns, symptoms, history, prevention, and appropriate next steps by a qualified professional; it excludes procedures and emergency care. | Consulta no urgente con un profesional habilitado sobre inquietudes generales o especializadas de salud, síntomas, antecedentes, prevención y próximos pasos adecuados; no incluye procedimientos ni atención de urgencia. |
| `sot_human_advice_medical_second_opinion` | Medical second opinion | Segunda opinión médica | `doc.text.fill.viewfinder` | Independent review of an existing diagnosis, result, or treatment plan to clarify alternatives before a decision; it does not guarantee a different diagnosis or outcome. | Revisión independiente de un diagnóstico, resultado o plan terapéutico existente para aclarar alternativas antes de decidir; no garantiza un diagnóstico ni un resultado diferente. |
| `sot_human_advice_medication_pharmacy_counseling` | Medication and pharmacy counseling | Asesoramiento farmacéutico y sobre medicamentos | `pills.circle.fill` | Guidance on safe use, interactions, adverse effects, adherence, and storage of medicines; prescribing or changes occur only when professionally authorized. | Orientación sobre uso seguro, interacciones, efectos adversos, adherencia y conservación de medicamentos; la prescripción o los cambios solo se realizan cuando el profesional está habilitado. |
| `sot_human_advice_nutrition_dietary_counseling` | Nutrition and dietary counseling | Asesoramiento nutricional y alimentario | `fork.knife` | Non-genomic assessment of eating patterns, goals, and practical food planning; genetic or nutrigenomic interpretation remains under the existing genomic categories. | Evaluación no genómica de hábitos alimentarios, objetivos y planificación práctica de la alimentación; la interpretación genética o nutrigenómica corresponde a las categorías genómicas existentes. |
| `sot_human_advice_rehabilitation_physical_therapy_guidance` | Rehabilitation and physical therapy guidance | Orientación en rehabilitación y fisioterapia | `figure.walk.motion` | Professional guidance on mobility, therapeutic exercise, recovery, and self-management within the declared scope; it excludes emergency and procedural care. | Orientación profesional sobre movilidad, ejercicio terapéutico, recuperación y autocuidado dentro del alcance declarado; no incluye atención de urgencia ni procedimientos. |
| `sot_human_advice_reproductive_fertility_counseling` | Reproductive and fertility counseling | Asesoramiento reproductivo y de fertilidad | `calendar.badge.plus` | Guidance on family-building goals, fertility-care options, care pathways, and referrals; it excludes procedures, laboratory testing, and genetic interpretation. | Orientación sobre objetivos reproductivos, opciones y circuitos de atención de la fertilidad y derivaciones; no incluye procedimientos, estudios de laboratorio ni interpretación genética. |
| `sot_human_advice_sexual_health_counseling` | Sexual health counseling | Asesoramiento en salud sexual | `heart.text.square` | Confidential guidance on sexual wellbeing, contraception, STI prevention, consent, and care navigation; it excludes emergency care and diagnostic procedures. | Orientación confidencial sobre bienestar sexual, anticoncepción, prevención de infecciones de transmisión sexual, consentimiento y acceso a la atención; no incluye urgencias ni procedimientos diagnósticos. |
| `sot_human_advice_pregnancy_postpartum_support` | Pregnancy and postpartum support | Acompañamiento durante el embarazo y el posparto | `person.crop.circle.badge.plus` | Non-emergency education and practical support for pregnancy, birth preparation, recovery, and infant feeding; it does not provide obstetric procedures. | Educación y apoyo práctico no urgente durante el embarazo, la preparación para el parto, la recuperación y la alimentación infantil; no incluye procedimientos obstétricos. |
| `sot_human_advice_psychological_counseling` | Psychological counseling | Asesoramiento psicológico | `brain.head.profile` | Structured support for emotional or behavioral concerns and coping strategies from a qualified professional; it is not an emergency or crisis-response service. | Apoyo estructurado de un profesional habilitado para inquietudes emocionales o conductuales y estrategias de afrontamiento; no es un servicio de urgencia ni de respuesta a crisis. |
| `sot_human_advice_couples_family_counseling` | Couples and family counseling | Orientación para parejas y familias | `person.3.fill` | Support for communication, conflict, relationship patterns, and family dynamics; it excludes legal mediation or representation. | Apoyo para trabajar comunicación, conflictos, patrones vinculares y dinámicas familiares; no incluye mediación ni representación legal. |
| `sot_human_advice_grief_bereavement_support` | Grief and bereavement support | Acompañamiento en duelo y pérdidas | `heart.slash.circle.fill` | Emotional and practical support for anticipated or experienced loss and adjustment; it is not crisis response. | Apoyo emocional y práctico ante una pérdida prevista o vivida y su proceso de adaptación; no es atención de crisis. |
| `sot_human_advice_addiction_recovery_counseling` | Addiction recovery counseling | Asesoramiento para la recuperación de adicciones | `arrow.triangle.2.circlepath.circle.fill` | Support for recovery goals, harm reduction, relapse prevention, and access to resources; it excludes medical detoxification and emergency care. | Apoyo para objetivos de recuperación, reducción de daños, prevención de recaídas y acceso a recursos; no incluye desintoxicación médica ni atención de urgencia. |
| `sot_human_advice_parenting_guidance` | Parenting guidance | Orientación para la crianza | `figure.2` | Guidance on developmentally appropriate routines, communication, boundaries, and caregiving strategies; it excludes diagnosis, therapy, and custody advice. | Orientación sobre rutinas, comunicación, límites y estrategias de cuidado adecuadas al desarrollo; no incluye diagnóstico, terapia ni asesoramiento sobre custodia. |
| `sot_human_advice_caregiver_eldercare_support` | Caregiver and eldercare support | Orientación para personas cuidadoras y cuidado de adultos mayores | `person.2.badge.gearshape.fill` | Guidance on care planning, resources, respite, coordination, and aging in place; it excludes direct nursing or clinical care. | Orientación sobre planificación del cuidado, recursos, servicios de respiro, coordinación y envejecimiento en el hogar; no incluye atención directa de enfermería ni atención clínica. |
| `sot_human_advice_disability_accessibility_guidance` | Disability and accessibility guidance | Orientación sobre discapacidad y accesibilidad | `figure.roll` | Guidance on accommodations, assistive strategies, accessibility, and service navigation; it does not issue medical or legal certification. | Orientación sobre ajustes razonables, estrategias de apoyo, accesibilidad y acceso a servicios; no emite certificaciones médicas ni legales. |
| `sot_human_advice_social_care_navigation` | Social care navigation | Orientación y acceso a servicios sociales | `hands.sparkles.fill` | Identification and coordination of community, health, benefits, and social supports; it does not guarantee eligibility or provide legal representation. | Identificación y coordinación de recursos comunitarios, sanitarios, prestaciones y apoyos sociales; no garantiza elegibilidad ni brinda representación legal. |
| `sot_human_advice_personal_civil_legal` | Personal and civil legal advice | Asesoramiento jurídico personal y civil | `building.columns` | Advice on everyday civil matters such as consumer rights, housing, personal contracts, debt, or property within a declared jurisdiction; representation is included only if stated. | Asesoramiento sobre asuntos civiles cotidianos, como consumo, vivienda, contratos personales, deudas o bienes, dentro de una jurisdicción declarada; la representación solo se incluye si se indica. |
| `sot_human_advice_family_estate_legal` | Family and estate legal advice | Asesoramiento jurídico de familia y sucesiones | `house.and.flag.fill` | Advice on family relationships, separation, custody, adoption, wills, estates, and inheritance within the declared jurisdiction; court representation is included only if stated. | Asesoramiento sobre relaciones familiares, separación, custodia, adopción, testamentos, sucesiones y herencias dentro de la jurisdicción declarada; la representación judicial solo se incluye si se indica. |
| `sot_human_advice_employment_labor_legal` | Employment and labor legal advice | Asesoramiento jurídico laboral | `briefcase.fill` | Advice on workplace rights, employment terms, obligations, and disputes within the declared jurisdiction; it does not guarantee a legal outcome. | Asesoramiento sobre derechos laborales, condiciones de empleo, obligaciones y conflictos dentro de la jurisdicción declarada; no garantiza un resultado jurídico. |
| `sot_human_advice_business_contract_legal` | Business and contract legal advice | Asesoramiento jurídico comercial y contractual | `doc.on.doc.fill` | Advice on entity formation, governance, commercial agreements, and business compliance; business strategy belongs to the entrepreneurship category. | Asesoramiento sobre constitución de entidades, gobierno, acuerdos comerciales y cumplimiento empresarial; la estrategia de negocio corresponde a la categoría de emprendimientos. |
| `sot_human_advice_immigration_residency_legal` | Immigration and residency legal advice | Asesoramiento jurídico migratorio y de residencia | `airplane` | Advice on visas, residency, citizenship, and migration procedures within the declared jurisdiction; it does not guarantee approval. | Asesoramiento sobre visas, residencia, ciudadanía y procedimientos migratorios dentro de la jurisdicción declarada; no garantiza la aprobación. |
| `sot_human_advice_academic_tutoring` | Academic tutoring | Tutoría y apoyo académico | `books.vertical.fill` | Individual or small-group instruction, explanation, practice, and study skills for declared subjects and levels; it does not award a credential. | Enseñanza individual o en grupos pequeños, explicación, práctica y técnicas de estudio para materias y niveles declarados; no otorga títulos. |
| `sot_human_advice_special_education_learning_support` | Special education and learning support | Apoyo educativo especializado y al aprendizaje | `person.text.rectangle.fill` | Individual learning strategies, accommodations, and educational support; it does not provide a clinical diagnosis or formal certification. | Estrategias individuales de aprendizaje, ajustes y apoyo educativo; no realiza diagnósticos clínicos ni emite certificaciones formales. |
| `sot_human_advice_language_learning` | Language instruction | Enseñanza de idiomas | `character.book.closed.fill` | Structured instruction and practice for a declared language and proficiency level; certification is included only when explicitly stated. | Enseñanza y práctica estructuradas para un idioma y nivel declarados; la certificación solo se incluye si se indica expresamente. |
| `sot_human_advice_academic_admissions_guidance` | Academic and admissions guidance | Orientación académica y para admisiones | `graduationcap.fill` | Guidance on study choices, applications, scholarships, and academic planning; it does not guarantee admission or funding. | Orientación sobre elección de estudios, postulaciones, becas y planificación académica; no garantiza admisión ni financiamiento. |
| `sot_human_advice_career_vocational_guidance` | Career and vocational guidance | Orientación profesional y vocacional | `arrow.up.right.circle.fill` | Guidance on career direction, transitions, skills, CVs, interviews, and job-search planning; it does not guarantee employment. | Orientación sobre dirección profesional, transiciones, habilidades, currículum, entrevistas y planificación de la búsqueda laboral; no garantiza empleo. |
| `sot_human_advice_digital_technology_support` | Digital technology support | Asesoramiento y soporte tecnológico digital | `wrench.and.screwdriver.fill` | Person-to-person setup, troubleshooting, and practical guidance for devices, software, connectivity, and online services; it excludes custom engineering and security audits. | Asistencia personalizada para configurar, resolver problemas y aprender a usar dispositivos, software, conectividad y servicios en línea; no incluye ingeniería a medida ni auditorías de seguridad. |
| `sot_human_advice_cybersecurity_privacy_consulting` | Cybersecurity and privacy consulting | Consultoría en ciberseguridad y privacidad | `lock.shield.fill` | Guidance on risk review, protective controls, security awareness, privacy settings, and incident preparation; it does not guarantee prevention of breaches or legal compliance. | Orientación sobre evaluación de riesgos, controles de protección, concientización, configuración de privacidad y preparación ante incidentes; no garantiza evitar incidentes ni el cumplimiento legal. |
| `sot_human_advice_business_entrepreneurship_consulting` | Business and entrepreneurship consulting | Consultoría para negocios y emprendimientos | `chart.line.uptrend.xyaxis.circle.fill` | Guidance on business models, markets, strategy, operations, pricing, and planning; it excludes legal or accounting deliverables and guaranteed commercial results. | Orientación sobre modelos de negocio, mercado, estrategia, operaciones, precios y planificación; no incluye entregables legales o contables ni garantiza resultados comerciales. |
| `sot_human_advice_financial_accounting_tax_consulting` | Financial, accounting and tax consulting | Asesoramiento financiero, contable e impositivo | `banknote.fill` | Guidance on budgeting, records, reporting, and tax planning or compliance within declared credentials and jurisdiction; it does not guarantee savings or returns, and investment recommendations require separate authorization. | Orientación sobre presupuestos, registros, informes y planificación o cumplimiento tributario dentro de las credenciales y jurisdicción declaradas; no garantiza ahorros ni rendimientos, y las recomendaciones de inversión requieren habilitación específica. |
| `sot_human_advice_health_professional_career_guidance` | Health professional career guidance | Orientación profesional en salud | `stethoscope.circle.fill` | Guidance for health professionals on specialty or role choices, clinical and non-clinical career paths, transitions, credentialing plans, CVs, interviews, and job-search strategy; it does not award credentials or guarantee admission, licensing, or employment. | Orientación para profesionales de la salud sobre elección de especialidad o función, trayectorias clínicas y no clínicas, transiciones, planificación de acreditaciones, currículum, entrevistas y estrategias de búsqueda laboral; no otorga credenciales ni garantiza admisión, habilitación o empleo. |
| `sot_human_advice_health_professional_development` | Professional development for health professionals | Desarrollo profesional en salud | `person.badge.plus.fill` | Structured planning of competencies, continuing education, reflective practice, professional portfolios, and development goals for people working in health; it excludes clinical supervision and does not issue credentials or formal performance ratings. | Planificación estructurada de competencias, educación continua, práctica reflexiva, portafolios profesionales y objetivos de desarrollo para personas que trabajan en salud; no incluye supervisión clínica ni emite credenciales o evaluaciones formales de desempeño. |
| `sot_human_advice_clinical_mentoring_supervision` | Clinical mentoring and professional supervision | Mentoría y supervisión profesional clínica | `person.badge.shield.checkmark.fill` | Qualified mentoring or supervision focused on clinical reasoning, ethical practice, professional boundaries, case reflection, and role development; it does not provide direct patient care or transfer responsibility for care, and counts toward mandated supervision only when explicitly stated. | Mentoría o supervisión calificada centrada en razonamiento clínico, práctica ética, límites profesionales, reflexión sobre casos y desarrollo del rol; no brinda atención directa ni transfiere la responsabilidad asistencial, y solo computa como supervisión obligatoria cuando se indica expresamente. |
| `sot_human_advice_healthcare_leadership_management` | Healthcare leadership and management development | Desarrollo de liderazgo y gestión en salud | `building.2.crop.circle.fill` | Development for current or emerging healthcare leaders covering communication, team leadership, delegation, conflict, change, governance, and management decisions; day-to-day workflow redesign belongs to health practice operations, and organizational results are not guaranteed. | Desarrollo para líderes actuales o emergentes del ámbito de la salud sobre comunicación, conducción de equipos, delegación, conflictos, cambio, gobierno y decisiones de gestión; el rediseño de procesos cotidianos corresponde a la gestión operativa de prácticas de salud y no se garantizan resultados organizacionales. |
| `sot_human_advice_health_education_training_design` | Health education and training design | Diseño de educación y capacitación en salud | `books.vertical.circle.fill` | Design of learning objectives, curricula, instructional formats, assessments, and materials for patients, communities, students, or health workforces; delivery, accreditation, and credential issuance are included only when explicitly stated. | Diseño de objetivos de aprendizaje, programas, modalidades didácticas, evaluaciones y materiales para pacientes, comunidades, estudiantes o equipos de salud; el dictado, la acreditación y la emisión de credenciales solo se incluyen cuando se indican expresamente. |
| `sot_human_advice_health_research_methodology` | Health research methodology consulting | Asesoramiento metodológico en investigación en salud | `chart.bar.doc.horizontal.fill` | Methodological guidance on health research questions, protocols, study designs, sampling, measurement, data-analysis plans, and reporting standards; it does not conduct the study, grant ethics approval, or guarantee valid or publishable findings. | Orientación metodológica sobre preguntas de investigación en salud, protocolos, diseños de estudio, muestreo, medición, planes de análisis de datos y estándares de reporte; no ejecuta el estudio, no concede aprobación ética ni garantiza hallazgos válidos o publicables. |
| `sot_human_advice_health_scientific_writing_publication` | Health scientific writing and publication support | Escritura científica y publicación en salud | `pencil.and.outline` | Ethical support for outlining, drafting, editing, reporting-guideline compliance, journal selection, submission, and responses to reviewers for health research; it excludes undisclosed ghostwriting or fabricated authorship and does not guarantee publication. | Apoyo ético para estructurar, redactar y editar investigaciones en salud, cumplir guías de reporte, seleccionar revistas, preparar envíos y responder a revisores; no incluye redacción no declarada en nombre de terceros ni atribuciones ficticias de autoría, y no garantiza la publicación. |
| `sot_human_advice_evidence_based_health_practice` | Evidence-based health practice guidance | Orientación en práctica de salud basada en evidencia | `checkmark.shield.fill` | Guidance on framing answerable questions, searching for and critically appraising evidence, synthesizing findings, and applying them within a declared health context; it does not replace professional judgment or provide patient-specific diagnosis or treatment. | Orientación para formular preguntas respondibles, buscar y evaluar críticamente la evidencia, sintetizar hallazgos y aplicarlos dentro de un contexto de salud declarado; no reemplaza el criterio profesional ni brinda diagnóstico o tratamiento específico para un paciente. |
| `sot_human_advice_healthcare_quality_patient_safety` | Healthcare quality and patient safety consulting | Consultoría en calidad asistencial y seguridad del paciente | `exclamationmark.shield.fill` | Review of clinical-quality indicators, care processes, incidents, risks, safety culture, and improvement plans for healthcare organizations or teams; it does not certify regulatory compliance or guarantee that adverse events will be prevented. | Revisión de indicadores de calidad clínica, procesos asistenciales, incidentes, riesgos, cultura de seguridad y planes de mejora para organizaciones o equipos de salud; no certifica el cumplimiento normativo ni garantiza la prevención de eventos adversos. |
| `sot_human_advice_health_practice_operations` | Health practice operations consulting | Consultoría en gestión operativa de prácticas de salud | `gearshape.2.fill` | Guidance on day-to-day operations of health practices, including intake, scheduling, capacity, patient flow, roles, documentation, referrals, and service coordination; it excludes clinical decision-making, legal attestations, and guaranteed efficiency or revenue outcomes. | Orientación sobre la operación cotidiana de prácticas de salud, incluidos admisión, turnos, capacidad, flujo de pacientes, funciones, documentación, derivaciones y coordinación de servicios; no incluye decisiones clínicas ni certificaciones legales, y no garantiza resultados de eficiencia o ingresos. |
| `sot_human_advice_digital_health_strategy_transformation` | Digital health strategy and transformation consulting | Consultoría en estrategia y transformación digital en salud | `bolt.heart.fill` | Advisory for healthcare organizations and teams to define a digital-health vision, assess maturity, prioritize initiatives, establish governance, and build a phased transformation roadmap; it does not implement individual systems, provide clinical care, or guarantee adoption, savings, or health outcomes. | Asesoramiento para organizaciones y equipos de salud orientado a definir una visión de salud digital, evaluar su madurez, priorizar iniciativas, establecer un modelo de gobierno y construir una hoja de ruta de transformación por etapas; no implementa sistemas específicos, no brinda atención clínica ni garantiza adopción, ahorros o resultados de salud. |
| `sot_human_advice_health_information_systems_implementation` | Health information systems implementation guidance | Asesoramiento para la implementación de sistemas de información en salud | `server.rack` | Guidance on requirements, configuration governance, migration readiness, testing, training, cutover, and go-live planning for electronic health records, laboratory, imaging, practice-management, and related health systems; it does not license or operate software, perform clinical work, or guarantee implementation schedules or outcomes. | Orientación sobre requisitos, gobierno de la configuración, preparación de migraciones, pruebas, capacitación, transición y salida a producción de historias clínicas electrónicas, sistemas de laboratorio, imágenes, gestión de prácticas y otros sistemas de salud; no licencia ni opera software, no realiza tareas clínicas ni garantiza plazos o resultados de implementación. |
| `sot_human_advice_electronic_health_record_workflow_optimization` | Electronic health record and clinical workflow optimization | Optimización de historias clínicas electrónicas y flujos asistenciales | `doc.text.fill` | Assessment and improvement of an existing electronic health record's templates, orders, alerts, documentation, roles, handoffs, and clinician-facing workflows to reduce avoidable burden and friction; it does not make clinical decisions, directly administer production systems, or guarantee productivity, safety, or financial results. | Evaluación y mejora de plantillas, órdenes, alertas, documentación, funciones, traspasos y flujos asistenciales de una historia clínica electrónica ya implementada para reducir cargas y fricciones evitables; no toma decisiones clínicas, no administra directamente sistemas productivos ni garantiza resultados de productividad, seguridad o rentabilidad. |
| `sot_human_advice_health_data_interoperability_integration` | Health data interoperability and systems integration consulting | Consultoría en interoperabilidad de datos e integración de sistemas de salud | `network` | Advisory design of architectures, data mappings, interface specifications, APIs, exchange workflows, and validation plans for clinical and administrative health systems using applicable standards; it does not build or operate custom integrations, convert dedicated genomic file formats, certify compliance, or guarantee successful exchange with every external system. | Diseño consultivo de arquitecturas, mapeos de datos, especificaciones de interfaces, API, flujos de intercambio y planes de validación para sistemas clínicos y administrativos de salud mediante los estándares aplicables; no desarrolla ni opera integraciones a medida, no convierte formatos genómicos especializados, no certifica cumplimiento ni garantiza el intercambio exitoso con todos los sistemas externos. |
| `sot_human_advice_telehealth_remote_care_implementation` | Telehealth and remote care implementation | Implementación de telesalud y atención remota | `video.fill` | Planning of telehealth and remote-care services, including platform requirements, identity and consent workflows, scheduling, remote monitoring, escalation paths, accessibility, and staff and patient onboarding; it does not deliver medical care, supply regulated devices, certify jurisdictional compliance, or guarantee access, adoption, or clinical outcomes. | Planificación de servicios de telesalud y atención remota, incluidos requisitos de plataforma, flujos de identidad y consentimiento, turnos, monitoreo remoto, vías de escalamiento, accesibilidad e incorporación de profesionales y pacientes; no brinda atención médica, no provee dispositivos regulados, no certifica el cumplimiento jurisdiccional ni garantiza acceso, adopción o resultados clínicos. |
| `sot_human_advice_health_data_governance_analytics` | Health data governance and analytics consulting | Consultoría en gobierno y analítica de datos de salud | `chart.bar.xaxis` | Definition of stewardship, data dictionaries, quality rules, lineage, access, retention, indicators, and analytics or dashboard roadmaps for operational, administrative, and population-level health data; it does not design research studies, interpret genomic variants, replace privacy or cybersecurity review, operate data platforms, or guarantee actionable findings. | Definición de responsables, diccionarios de datos, reglas de calidad, linaje, acceso, retención, indicadores y hojas de ruta de analítica o tableros para datos de salud operativos, administrativos y poblacionales; no diseña estudios de investigación, no interpreta variantes genómicas, no reemplaza revisiones de privacidad o ciberseguridad, no opera plataformas de datos ni garantiza hallazgos accionables. |
| `sot_human_advice_healthcare_ai_evaluation_adoption` | Healthcare AI evaluation and responsible adoption | Evaluación y adopción responsable de inteligencia artificial en salud | `brain.filled.head.profile` | Guidance on selecting healthcare AI use cases and assessing data fit, workflow fit, performance evidence, bias, safety, explainability, human oversight, monitoring, and rollout governance; it does not train or deploy models, diagnose or treat patients, grant regulatory approval, or guarantee accuracy, fairness, safety, or business value. | Orientación para seleccionar casos de uso de inteligencia artificial en salud y evaluar la adecuación de los datos y flujos, la evidencia de desempeño, los sesgos, la seguridad, la explicabilidad, la supervisión humana, el monitoreo y el gobierno de su adopción; no entrena ni despliega modelos, no diagnostica ni trata pacientes, no concede aprobación regulatoria ni garantiza precisión, equidad, seguridad o valor comercial. |
| `sot_human_advice_digital_health_product_medical_technology` | Digital health product and medical technology advisory | Asesoramiento en productos digitales y tecnología médica | `cpu.fill` | Product discovery and planning for health applications, software as a medical device, connected devices, and other medical technologies, covering user needs, requirements, clinical context, risk inputs, evidence plans, and lifecycle considerations; it does not engineer or manufacture the product, determine final regulatory classification, secure approval, or guarantee market success. | Descubrimiento y planificación de productos para aplicaciones de salud, software como dispositivo médico, dispositivos conectados y otras tecnologías médicas, abarcando necesidades de usuarios, requisitos, contexto clínico, insumos de riesgo, planes de evidencia y consideraciones del ciclo de vida; no desarrolla ni fabrica el producto, no determina su clasificación regulatoria definitiva, no obtiene aprobaciones ni garantiza éxito comercial. |
| `sot_human_advice_health_it_infrastructure_cloud_architecture` | Health IT infrastructure and cloud architecture consulting | Consultoría en infraestructura de TI y arquitectura en la nube para salud | `cloud.fill` | Architecture guidance for hosting, networks, identity, availability, backups, disaster recovery, observability, capacity, and cloud services that support healthcare workloads; it does not administer production environments, perform cybersecurity audits, certify regulatory compliance, or guarantee uptime, recovery, performance, or cost savings. | Orientación arquitectónica sobre alojamiento, redes, identidad, disponibilidad, copias de seguridad, recuperación ante desastres, observabilidad, capacidad y servicios en la nube que soportan cargas de trabajo de salud; no administra entornos productivos, no realiza auditorías de ciberseguridad, no certifica cumplimiento normativo ni garantiza disponibilidad, recuperación, rendimiento o ahorro de costos. |
| `sot_human_advice_health_technology_usability_human_factors_accessibility` | Health technology usability, human factors, and accessibility | Usabilidad, factores humanos y accesibilidad en tecnología de salud | `accessibility.fill` | User research, task analysis, usability and accessibility evaluation, and interaction-design recommendations for clinician- and patient-facing health technologies; it does not replace formal regulatory validation, provide individual disability accommodations, make clinical decisions, or guarantee certification, adoption, safety, or error-free use. | Investigación con usuarios, análisis de tareas, evaluación de usabilidad y accesibilidad, y recomendaciones de diseño de interacción para tecnologías de salud destinadas a profesionales y pacientes; no reemplaza la validación regulatoria formal, no brinda adaptaciones individuales por discapacidad, no toma decisiones clínicas ni garantiza certificación, adopción, seguridad o uso sin errores. |

## Request limits

Stable usage configuration is `20` total transactions, `5` per UTC day, and a `300`-second cooldown unless policy configuration changes.

Usage state is functional and recomputed from root `service_transactions` using `requestedAt` plus the active requester key: `requestedByUserId` for an authenticated requester or the exact normalized `requestedByUserEmail` for an email-only requester. Never persist today's count, remaining tokens, last transaction time, cooldown start/end, next request time, or pending admissions. UTC buckets split at 00:00 UTC; the UI displays the reset in device-local time. When daily reset and cooldown both apply, the later deadline wins.

Admission runs before form-object persistence and provider dispatch. A denied attempt creates no transaction, file, uploaded object, code, owner normalization, counter, or cooldown record. `catalog/usage-policy.json` remains the executable source and declares both authenticated and deferred requester keys.

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

## Validation and acceptance

The executable validator checks all twenty schemas, examples, notes variants, unknown-field rejection, exact PDF minimum, standalone symptoms/genes/specimens, Other behavior, direct component URLs, strict forms, service copies, provider examples, naming boundaries, deferred transaction indexing, native PGI mappings, generator idempotence, and the usage policy.

Global object validity is distinct from service suitability. A provider may ask for clarification or reject an input that does not satisfy its published service, but it cannot make provider-specific prerequisites universally required PGO fields.

## Object reference pages

### 01. Form — `pgo_form`

A completed form with its frozen field definitions and typed answers.

**Nature:** virtual<br>
**Stages:** test_planning, wet_lab, bioinformatics<br>
**Serialized extension:** `.pgform.json`<br>
**Schema:** `schemas/objects/pgo_form.schema.json`<br>
**Example:** `examples/objects/pgo_form.pgform.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `form_shape` | `object` | Yes | Frozen form shape. |
| `fields` | `array<object>` | Yes | Submitted answers. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Frozen form structure

`form_shape` contains exactly `fields`. Definitions stay ordered. Every definition requires `key`, `label`, `type`, and `required`; only `options` and `help_info_text` are optional. `options` is required and nonempty only for `enum` and `multi_enum`, and must be omitted for every other type.

Answers contain exactly `key` and `value`. Keys must be unique and declared by the frozen shape. Values are validated against the matching definition, including enum membership and numeric array element types. Optional unanswered fields may be absent. An empty answer array is valid when no required field is unanswered.

Supported definition types:

`text`, `long_text`, `email`, `phone`, `url`, `address`, `postal_code`, `country_code`, `identifier`, `number`, `integer`, `positive_integer`, `percentage`, `boolean`, `date`, `datetime`, `time`, `enum`, `multi_enum`, `string_list`, `integer_list`, `number_list`.

There are no universal `requested_at`, `requested_by`, or `subject_id` questions. Request identity and time belong to the service transaction. Shape IDs and versions belong to the service-offer configuration, not this content.

## Enum choices

#### `form_shape.fields[].type` choices

| Stored value | Display label |
| --- | --- |
| `text` | text |
| `long_text` | long_text |
| `email` | email |
| `phone` | phone |
| `url` | url |
| `address` | address |
| `postal_code` | postal_code |
| `country_code` | country_code |
| `identifier` | identifier |
| `number` | number |
| `integer` | integer |
| `positive_integer` | positive_integer |
| `percentage` | percentage |
| `boolean` | boolean |
| `date` | date |
| `datetime` | datetime |
| `time` | time |
| `enum` | enum |
| `multi_enum` | multi_enum |
| `string_list` | string_list |
| `integer_list` | integer_list |
| `number_list` | number_list |

## Minimal example

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "presentation",
        "label": "Report presentation",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "clinical",
            "label": "Clinical"
          },
          {
            "value": "patient",
            "label": "For the patient"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "presentation",
      "value": "clinical"
    }
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Definition and answer keys must each be unique.
- Every answer key must be declared by the frozen form shape and match its declared type.
- enum and multi_enum require nonempty options; all other field types must omit options.
- Optional unanswered fields may be omitted and fields may be empty when no required answer exists.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 02. Symptom bundle — `pgo_bundle_of_symptoms`

A standalone set of readable symptom observations with optional terminology coding.

**Nature:** virtual<br>
**Stages:** test_planning<br>
**Serialized extension:** `.pgsymptoms.json`<br>
**Schema:** `schemas/objects/pgo_bundle_of_symptoms.schema.json`<br>
**Example:** `examples/objects/pgo_bundle_of_symptoms.pgsymptoms.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `observations` | `array<object>` | Yes |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Observation structure

Each nonempty `observations` item requires only `label`. It may add `presence` (`present`, `absent`, or `uncertain`) and a closed `code` object containing exactly `system` and `value`. Code systems are `hpo`, `snomed_ct`, and `other`. Free text without a code is valid.

## Enum choices

#### `observations[].presence` choices

| Stored value | Display label |
| --- | --- |
| `present` | present |
| `absent` | absent |
| `uncertain` | uncertain |

#### `observations[].code.system` choices

| Stored value | Display label |
| --- | --- |
| `hpo` | hpo |
| `snomed_ct` | snomed_ct |
| `other` | other |

## Minimal example

```json
{
  "observations": [
    {
      "label": "Hearing loss",
      "presence": "present"
    }
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 03. Candidate gene bundle — `pgo_bundle_of_candidate_genes`

A standalone nonempty list of candidate gene symbols.

**Nature:** virtual<br>
**Stages:** test_planning<br>
**Serialized extension:** `.pggenes.json`<br>
**Schema:** `schemas/objects/pgo_bundle_of_candidate_genes.schema.json`<br>
**Example:** `examples/objects/pgo_bundle_of_candidate_genes.pggenes.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `genes` | `array<string>` | Yes |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Gene entries

`genes` is a nonempty ordered array of nonempty gene-symbol strings. It contains no ranking, namespace, evidence, symptom reference, or method object.



## Minimal example

```json
{
  "genes": [
    "BRCA1",
    "BRCA2"
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 04. Informed consent — `pgo_informed_consent`

Readable informed-consent content with optional explicit workflow state and acceptance facts.

**Nature:** virtual<br>
**Stages:** test_planning, wet_lab, bioinformatics<br>
**Serialized extension:** `.pgconsent.json`<br>
**Schema:** `schemas/objects/pgo_informed_consent.schema.json`<br>
**Example:** `examples/objects/pgo_informed_consent.pgconsent.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Consent title. |
| `text` | `string` | Yes | Actual consent text. |
| `status` | `enum<string>` | No | Consent workflow state. |
| `accepted_by` | `string` | No | Actual person who accepted the consent. |
| `accepted_at` | `string` | No | Actual acceptance time. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Consent meaning

`text` is the actual consent text. Optional status is exactly `pending`, `accepted`, `declined`, or `withdrawn`. Upload and schema validity never imply acceptance. `accepted_by` and `accepted_at` describe the actual acceptance only when known.

## Enum choices

#### `status` choices

| Stored value | Display label |
| --- | --- |
| `pending` | pending |
| `accepted` | accepted |
| `declined` | declined |
| `withdrawn` | withdrawn |

## Minimal example

```json
{
  "title": "Consent for genetic testing",
  "text": "I confirm that I received and understood the information provided.",
  "status": "pending"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 05. Test order — `pgo_test_order`

A standalone request for a named test on a stated patient or source and specimen type.

**Nature:** virtual<br>
**Stages:** test_planning, wet_lab, bioinformatics<br>
**Serialized extension:** `.pgorder.json`<br>
**Schema:** `schemas/objects/pgo_test_order.schema.json`<br>
**Example:** `examples/objects/pgo_test_order.pgorder.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `patient` | `string` | Yes | Patient/source name or meaningful identifier supplied for this order. |
| `test_name` | `string` | Yes | Actual requested test name. |
| `sample_type` | `enum<string>` | Yes | Specimen or material expected by the testing provider. |
| `test_type` | `enum<string>` | No | Optional broad test category. |
| `objective` | `string` | No | Optional objective for the test. |
| `clinical_suspicion` | `string` | No | Optional clinical suspicion. |
| `genes` | `array<string>` | No |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Order meaning

`patient` is readable user-supplied identity, not a mandatory Pocket Genes subject record. `test_name` is the actual requested study. `test_type` is only an optional broad category. Consent and provider suitability remain service checks.

## Enum choices

#### `sample_type` choices

| Stored value | Display label |
| --- | --- |
| `blood` | Blood |
| `dried_blood_spot` | Dried blood spot |
| `saliva` | Saliva |
| `buccal_swab` | Buccal swab |
| `tissue` | Tissue |
| `skin_biopsy` | Skin biopsy |
| `bone_marrow_aspirate` | Bone marrow aspirate |
| `bone_marrow_core` | Bone marrow core biopsy |
| `amniotic_fluid` | Amniotic fluid |
| `chorionic_villi` | Chorionic villi |
| `cord_blood` | Cord blood |
| `cerebrospinal_fluid` | Cerebrospinal fluid |
| `urine` | Urine |
| `stool` | Stool |
| `hair_follicles` | Hair follicles |
| `nail_clippings` | Nail clippings |
| `semen` | Semen |
| `embryo_biopsy` | Embryo biopsy |
| `whole_embryo` | Whole embryo |
| `polar_body` | Polar body |
| `plasma` | Plasma |
| `serum` | Serum |
| `extracted_dna` | Extracted DNA |
| `extracted_rna` | Extracted RNA |
| `other` | Other |

#### `test_type` choices

| Stored value | Display label |
| --- | --- |
| `single_gene` | Single-gene test |
| `gene_panel` | Gene panel |
| `exome_sequencing` | Exome sequencing |
| `genome_sequencing` | Genome sequencing |
| `targeted_variant_testing` | Targeted variant testing |
| `repeat_expansion_testing` | Repeat expansion testing |
| `methylation_analysis` | Methylation analysis |
| `chromosomal_microarray` | Chromosomal microarray |
| `karyotype` | Karyotype |
| `fish` | FISH |
| `other` | Other |

## Minimal example

```json
{
  "patient": "Patient AB-123",
  "test_name": "Hereditary cancer panel",
  "sample_type": "blood"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 06. Sample collection request — `pgo_collection_request`

A request to obtain biological material; it is not courier pickup or specimen transport.

**Nature:** virtual<br>
**Stages:** wet_lab<br>
**Serialized extension:** `.pgcollection.json`<br>
**Schema:** `schemas/objects/pgo_collection_request.schema.json`<br>
**Example:** `examples/objects/pgo_collection_request.pgcollection.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `patient` | `string` | Yes | Patient/source name or meaningful identifier for collection. |
| `sample_type` | `enum<string>` | Yes | Biological material to obtain. |
| `collection_method` | `enum<string>` | No | Method used to obtain the biological material. |
| `container` | `enum<string>` | No | Collection container or kit. |
| `requested_quantity` | `string` | No | Readable quantity including its unit, for example 2 mL. |
| `collection_site` | `string` | No | Readable collection location. |
| `scheduled_at` | `string` | No | Scheduled collection time. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Biological collection only

This object asks for the act of obtaining biological material from a person or source. It never means courier pickup, shipping, or transport. Only `patient` and `sample_type` are required; scheduling and collection arrangements remain optional.

## Enum choices

#### `sample_type` choices

| Stored value | Display label |
| --- | --- |
| `blood` | Blood |
| `dried_blood_spot` | Dried blood spot |
| `saliva` | Saliva |
| `buccal_swab` | Buccal swab |
| `tissue` | Tissue |
| `skin_biopsy` | Skin biopsy |
| `bone_marrow_aspirate` | Bone marrow aspirate |
| `bone_marrow_core` | Bone marrow core biopsy |
| `amniotic_fluid` | Amniotic fluid |
| `chorionic_villi` | Chorionic villi |
| `cord_blood` | Cord blood |
| `cerebrospinal_fluid` | Cerebrospinal fluid |
| `urine` | Urine |
| `stool` | Stool |
| `hair_follicles` | Hair follicles |
| `nail_clippings` | Nail clippings |
| `semen` | Semen |
| `embryo_biopsy` | Embryo biopsy |
| `whole_embryo` | Whole embryo |
| `polar_body` | Polar body |
| `other` | Other |

#### `collection_method` choices

| Stored value | Display label |
| --- | --- |
| `venous_blood_draw` | Venous blood draw |
| `capillary_blood_collection` | Capillary blood collection |
| `buccal_swab` | Buccal swab |
| `saliva_collection` | Saliva collection |
| `needle_aspiration` | Needle aspiration |
| `core_biopsy` | Core biopsy |
| `surgical_biopsy` | Surgical biopsy |
| `skin_punch_biopsy` | Skin punch biopsy |
| `amniocentesis` | Amniocentesis |
| `chorionic_villus_sampling` | Chorionic villus sampling |
| `lumbar_puncture` | Lumbar puncture |
| `embryo_biopsy` | Embryo biopsy |
| `polar_body_biopsy` | Polar body biopsy |
| `self_collection` | Self-collection |
| `other` | Other |

#### `container` choices

| Stored value | Display label |
| --- | --- |
| `edta_tube` | EDTA tube |
| `heparin_tube` | Heparin tube |
| `citrate_tube` | Citrate tube |
| `serum_tube` | Serum tube |
| `dna_stabilization_tube` | DNA stabilization tube |
| `rna_stabilization_tube` | RNA stabilization tube |
| `sterile_container` | Sterile container |
| `swab_collection_kit` | Swab collection kit |
| `saliva_collection_kit` | Saliva collection kit |
| `cryovial` | Cryovial |
| `filter_paper_card` | Filter paper card |
| `formalin_container` | Formalin container |
| `other` | Other |

## Minimal example

```json
{
  "patient": "Patient AB-123",
  "sample_type": "blood",
  "collection_method": "venous_blood_draw",
  "container": "edta_tube"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 07. Blood sample — `pgo_blood_sample`

Domain description of a distinguishable blood specimen.

**Nature:** physical<br>
**Stages:** wet_lab<br>
**Serialized extension:** `.pgblood.json`<br>
**Schema:** `schemas/objects/pgo_blood_sample.schema.json`<br>
**Example:** `examples/objects/pgo_blood_sample.pgblood.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sample_label` | `string` | Yes | Actual label or identifier used to distinguish the specimen. |
| `material` | `enum<string>` | No | Blood material. |
| `container` | `enum<string>` | No | Specimen container. |
| `volume_ml` | `number` | No | Volume in millilitres. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Physical specimen boundary

The content describes distinguishable physical material. It does not contain custody, transport, consumption, ownership, order references, source references, or file URLs. Existing operational specimen controls remain outside this content and must still prevent duplicate identity and reuse of consumed material.

## Enum choices

#### `material` choices

| Stored value | Display label |
| --- | --- |
| `whole_blood` | Whole blood |
| `plasma` | Plasma |
| `serum` | Serum |
| `buffy_coat` | Buffy coat |
| `dried_blood_spot` | Dried blood spot |
| `other` | Other |

#### `container` choices

| Stored value | Display label |
| --- | --- |
| `edta_tube` | EDTA tube |
| `heparin_tube` | Heparin tube |
| `citrate_tube` | Citrate tube |
| `serum_tube` | Serum tube |
| `dna_stabilization_tube` | DNA stabilization tube |
| `rna_stabilization_tube` | RNA stabilization tube |
| `sterile_container` | Sterile container |
| `swab_collection_kit` | Swab collection kit |
| `saliva_collection_kit` | Saliva collection kit |
| `cryovial` | Cryovial |
| `filter_paper_card` | Filter paper card |
| `formalin_container` | Formalin container |
| `other` | Other |

## Minimal example

```json
{
  "sample_label": "Blood specimen A",
  "material": "whole_blood",
  "container": "edta_tube",
  "volume_ml": 2
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 08. Tissue sample — `pgo_tissue_sample`

Domain description of a distinguishable tissue specimen.

**Nature:** physical<br>
**Stages:** wet_lab<br>
**Serialized extension:** `.pgtissue.json`<br>
**Schema:** `schemas/objects/pgo_tissue_sample.schema.json`<br>
**Example:** `examples/objects/pgo_tissue_sample.pgtissue.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sample_label` | `string` | Yes | Actual label or identifier used to distinguish the specimen. |
| `anatomical_site` | `string` | No | Readable anatomical site. |
| `preparation` | `enum<string>` | No | Tissue preparation. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Physical specimen boundary

The content describes distinguishable physical material. It does not contain custody, transport, consumption, ownership, order references, source references, or file URLs. Existing operational specimen controls remain outside this content and must still prevent duplicate identity and reuse of consumed material.

## Enum choices

#### `preparation` choices

| Stored value | Display label |
| --- | --- |
| `fresh` | Fresh |
| `frozen` | Frozen |
| `formalin_fixed_unembedded` | Formalin-fixed, unembedded |
| `ffpe` | FFPE |
| `alcohol_preserved` | Alcohol-preserved |
| `other` | Other |

## Minimal example

```json
{
  "sample_label": "Tissue specimen A",
  "anatomical_site": "Skin",
  "preparation": "fresh"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 09. Embryo material — `pgo_embryo_sample`

Domain description of distinguishable embryo-derived material.

**Nature:** physical<br>
**Stages:** wet_lab<br>
**Serialized extension:** `.pgembryo.json`<br>
**Schema:** `schemas/objects/pgo_embryo_sample.schema.json`<br>
**Example:** `examples/objects/pgo_embryo_sample.pgembryo.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sample_label` | `string` | Yes | Actual label or identifier used to distinguish the specimen. |
| `material_kind` | `enum<string>` | Yes | Kind of embryo-derived material. |
| `embryo_identifier` | `string` | No | Associated embryo identifier when known. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Physical specimen boundary

The content describes distinguishable physical material. It does not contain custody, transport, consumption, ownership, order references, source references, or file URLs. Existing operational specimen controls remain outside this content and must still prevent duplicate identity and reuse of consumed material.

## Enum choices

#### `material_kind` choices

| Stored value | Display label |
| --- | --- |
| `embryo_biopsy` | Embryo biopsy |
| `whole_embryo` | Whole embryo |
| `polar_body` | Polar body |
| `other` | Other |

## Minimal example

```json
{
  "sample_label": "Embryo material A",
  "material_kind": "embryo_biopsy",
  "embryo_identifier": "Embryo 4"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 10. Extracted DNA sample — `pgo_dna_sample`

Domain description of a distinguishable extracted DNA specimen.

**Nature:** physical<br>
**Stages:** wet_lab<br>
**Serialized extension:** `.pgdna.json`<br>
**Schema:** `schemas/objects/pgo_dna_sample.schema.json`<br>
**Example:** `examples/objects/pgo_dna_sample.pgdna.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sample_label` | `string` | Yes | Actual label or identifier used to distinguish the specimen. |
| `volume_ul` | `number` | No | Volume in microlitres. |
| `concentration_ng_ul` | `number` | No | Concentration in nanograms per microlitre. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Physical specimen boundary

The content describes distinguishable physical material. It does not contain custody, transport, consumption, ownership, order references, source references, or file URLs. Existing operational specimen controls remain outside this content and must still prevent duplicate identity and reuse of consumed material.



## Minimal example

```json
{
  "sample_label": "DNA aliquot A",
  "volume_ul": 40,
  "concentration_ng_ul": 25
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 11. Sequence reads — `pgo_sequence_reads`

A named collection of one or more directly downloadable sequencing-read files.

**Nature:** virtual<br>
**Stages:** wet_lab, bioinformatics<br>
**Serialized extension:** `.fastq`<br>
**Schema:** `schemas/objects/pgo_sequence_reads.schema.json`<br>
**Example:** `examples/objects/pgo_sequence_reads.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `reads` | `array<object>` | Yes |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Component structure

`reads` is nonempty. Each read contains exactly `key`, `name`, and `download_url`; all are nonempty, keys are unique, and the URL resolves the component directly. No size, checksum, MIME type, role, path, source reference, or generic file descriptor is permitted.



## Minimal example

```json
{
  "title": "Sequencing reads",
  "reads": [
    {
      "key": "r1",
      "name": "Read 1",
      "download_url": "https://example.com/sample_R1.fastq.gz"
    },
    {
      "key": "r2",
      "name": "Read 2",
      "download_url": "https://example.com/sample_R2.fastq.gz"
    }
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 12. Nucleotide sequences — `pgo_sequence_data`

A titled reference to downloadable native nucleotide-sequence data.

**Nature:** virtual<br>
**Stages:** wet_lab, bioinformatics<br>
**Serialized extension:** `.fasta`<br>
**Schema:** `schemas/objects/pgo_sequence_data.schema.json`<br>
**Example:** `examples/objects/pgo_sequence_data.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Nucleotide sequences",
  "download_url": "https://example.com/sequences"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 13. Aligned reads — `pgo_aligned_reads`

A titled reference to downloadable aligned reads with an optional index.

**Nature:** virtual<br>
**Stages:** wet_lab, bioinformatics<br>
**Serialized extension:** `.bam`<br>
**Schema:** `schemas/objects/pgo_aligned_reads.schema.json`<br>
**Example:** `examples/objects/pgo_aligned_reads.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the aligned reads. |
| `index_download_url` | `string` | No | HTTPS URL used to download the optional alignment index. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Alignment files

`download_url` points directly to the aligned reads. Optional `index_download_url` expresses index availability without a duplicate boolean. No generic file list is allowed.



## Minimal example

```json
{
  "title": "Aligned reads",
  "download_url": "https://example.com/sample.bam",
  "index_download_url": "https://example.com/sample.bam.bai"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 14. Unannotated variants — `pgo_unannotated_vcf`

A titled reference to a downloadable native unannotated VCF.

**Nature:** virtual<br>
**Stages:** wet_lab, bioinformatics<br>
**Serialized extension:** `.vcf`<br>
**Schema:** `schemas/objects/pgo_unannotated_vcf.schema.json`<br>
**Example:** `examples/objects/pgo_unannotated_vcf.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Unannotated variants",
  "download_url": "https://example.com/variants"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 15. Annotated variants — `pgo_annotated_vcf`

A titled reference to a downloadable native annotated VCF.

**Nature:** virtual<br>
**Stages:** bioinformatics<br>
**Serialized extension:** `.vcf`<br>
**Schema:** `schemas/objects/pgo_annotated_vcf.schema.json`<br>
**Example:** `examples/objects/pgo_annotated_vcf.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Annotated variants",
  "download_url": "https://example.com/annotated-variants"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 16. Interactive genomic report — `pgo_interactive_report`

A titled reference to a downloadable native PGI report decoded through the existing PGI format parsers.

**Nature:** virtual<br>
**Stages:** bioinformatics<br>
**Serialized extension:** `.pgi1.json / .pgi2.json / .pgi3.json`<br>
**Schema:** `schemas/objects/pgo_interactive_report.schema.json`<br>
**Example:** `examples/objects/pgo_interactive_report.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Interactive genomic report",
  "download_url": "https://example.com/interactive-report"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 17. PDF report — `pgo_pdf_report`

A titled reference to a downloadable PDF report.

**Nature:** virtual<br>
**Stages:** test_planning, wet_lab, bioinformatics<br>
**Serialized extension:** `.pdf`<br>
**Schema:** `schemas/objects/pgo_pdf_report.schema.json`<br>
**Example:** `examples/objects/pgo_pdf_report.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Genetic test report",
  "download_url": "https://example.com/reports/report.pdf"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 18. Image bundle — `pgo_image_bundle`

A named collection of one or more directly downloadable images.

**Nature:** virtual<br>
**Stages:** test_planning, wet_lab, bioinformatics<br>
**Serialized extension:** `.pgimages.json`<br>
**Schema:** `schemas/objects/pgo_image_bundle.schema.json`<br>
**Example:** `examples/objects/pgo_image_bundle.pgimages.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `images` | `array<object>` | Yes |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Component structure

`images` is nonempty. Each image contains exactly `key`, `name`, and `download_url`; all are nonempty, keys are unique, and the URL resolves the component directly. No size, checksum, MIME type, role, path, source reference, or generic file descriptor is permitted.



## Minimal example

```json
{
  "title": "Metaphase images",
  "images": [
    {
      "key": "metaphase_1",
      "name": "Metaphase image 1",
      "download_url": "https://example.com/image-1.png"
    },
    {
      "key": "metaphase_2",
      "name": "Metaphase image 2",
      "download_url": "https://example.com/image-2.png"
    }
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 19. Karyotype result — `pgo_karyotype_result`

A karyotype notation with an optional readable professional interpretation.

**Nature:** virtual<br>
**Stages:** bioinformatics<br>
**Serialized extension:** `.pgkaryotype.json`<br>
**Schema:** `schemas/objects/pgo_karyotype_result.schema.json`<br>
**Example:** `examples/objects/pgo_karyotype_result.pgkaryotype.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `result_notation` | `string` | Yes | Actual karyotype result notation. |
| `interpretation` | `string` | No | Optional readable interpretation. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Result meaning

`result_notation` is the actual karyotype notation. Professional interpretation is optional; notes may communicate additional readable limitations. Images are separate objects when they exist and are not mandatory dependencies.



## Minimal example

```json
{
  "result_notation": "46,XX",
  "interpretation": "No numerical chromosome abnormality was identified."
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

---

### 20. Flow cytometry data — `pgo_flow_cytometry_data`

A titled reference to downloadable native flow-cytometry data.

**Nature:** virtual<br>
**Stages:** wet_lab, bioinformatics<br>
**Serialized extension:** `.fcs`<br>
**Schema:** `schemas/objects/pgo_flow_cytometry_data.schema.json`<br>
**Example:** `examples/objects/pgo_flow_cytometry_data.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Flow cytometry data",
  "download_url": "https://example.com/flow-data"
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.

## Service catalog

### S01. Structure submitted symptoms — `pgs_symptom_intake`

Turn the submitted observations into a reusable symptom bundle. A professional or organization can supply this service.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** test_planning<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Review the form, clarify wording if needed, and return structured entries with transaction-bound context.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Output | `symptoms` | `pgo_bundle_of_symptoms` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `observations` | `string_list` | Yes | Reported observations |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "observations",
        "label": "Reported observations",
        "type": "string_list",
        "required": true
      }
    ]
  },
  "fields": [
    {
      "key": "observations",
      "value": [
        "Hearing loss",
        "Balance difficulties"
      ]
    }
  ]
}
```

## Acceptance conditions

- The form identifies one subject and contains at least one observation.
- Record whether each structured item is reported, observed or uncertain; do not silently replace a report with a confirmed finding.

## Scope rules

- This service structures supplied information; it does not itself establish a diagnosis.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S02. Prioritize candidate genes — `pgs_gene_prioritization`

Use a symptom bundle to return a ranked or selected bundle of candidate genes for subsequent test planning.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** test_planning<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Apply the provider method and professional review where included; return genes, evidence and ranking rationale.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `bundle_of_symptoms` | `pgo_bundle_of_symptoms` | Required 1:1 |
| Output | `candidate_genes` | `pgo_bundle_of_candidate_genes` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `ranking_mode` | `enum` | Yes | Result organization |
| `maximum_genes` | `positive_integer` | Yes | Maximum genes |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "ranking_mode",
        "label": "Result organization",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "ranked",
            "label": "Ranked list"
          },
          {
            "value": "selected",
            "label": "Selected set"
          }
        ]
      },
      {
        "key": "maximum_genes",
        "label": "Maximum genes",
        "type": "positive_integer",
        "required": true
      }
    ]
  },
  "fields": [
    {
      "key": "ranking_mode",
      "value": "ranked"
    },
    {
      "key": "maximum_genes",
      "value": 3
    }
  ]
}
```

## Acceptance conditions

- The provider accepts the symptom bundle schema and any declared terminology profile.
- The symptom bundle represents one identified subject.

## Scope rules

- Candidate status and supporting reasons must be preserved. Ranking does not establish that these genes are affected.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S03. Record informed consent — `pgs_informed_consent`

Receive the completed consent-specific form and produce an informed-consent record for the stated scope.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** test_planning<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Present or verify the consent material and record the completed consent process as specified by the provider service.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Output | `consent` | `pgo_informed_consent` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient` | `text` | Yes | Patient or source |
| `consent_title` | `text` | Yes | Consent title |
| `consent_text` | `long_text` | Yes | Consent text |
| `signer_name` | `text` | No | Expected signer name |
| `signer_capacity` | `enum` | No | Expected signer capacity |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "patient",
        "label": "Patient or source",
        "type": "text",
        "required": true
      },
      {
        "key": "consent_title",
        "label": "Consent title",
        "type": "text",
        "required": true
      },
      {
        "key": "consent_text",
        "label": "Consent text",
        "type": "long_text",
        "required": true
      },
      {
        "key": "signer_name",
        "label": "Expected signer name",
        "type": "text",
        "required": false
      },
      {
        "key": "signer_capacity",
        "label": "Expected signer capacity",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "self",
            "label": "Self"
          },
          {
            "value": "representative",
            "label": "Representative"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "patient",
      "value": "Patient AB-123"
    },
    {
      "key": "consent_title",
      "value": "Consent for genetic testing"
    },
    {
      "key": "consent_text",
      "value": "Please review the purpose, implications and limitations of the proposed genetic test."
    },
    {
      "key": "signer_name",
      "value": "Alex Example"
    },
    {
      "key": "signer_capacity",
      "value": "self"
    }
  ]
}
```

## Acceptance conditions

- The consent text, its version, signer identity and signature or acceptance evidence must be recoverable in the resulting object.
- Only an accepted consent for the appropriate scope can satisfy the test-ordering contract. A submission alone is not proof of valid consent.

## Scope rules

- The record retains what was consented to, when and by whom. Subsequent use must fit that scope.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S04. Create the test order — `pgs_test_ordering`

Combine the consent record, candidate genes and patient/request context into the formal test order.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** test_planning<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Review consent and test selection, consolidate the patient context, and issue the order with explicit fulfillment requirements.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `informed_consent` | `pgo_informed_consent` | Required 1:1 |
| Input | `bundle_of_candidate_genes` | `pgo_bundle_of_candidate_genes` | Required 1:1 |
| Output | `test_order` | `pgo_test_order` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient` | `text` | Yes | Patient or source |
| `test_name` | `text` | Yes | Requested test name |
| `sample_type` | `enum` | Yes | Requested specimen |
| `test_type` | `enum` | No | Broad test type |
| `objective` | `long_text` | No | Objective |
| `clinical_suspicion` | `long_text` | No | Clinical suspicion |
| `genes` | `string_list` | No | Genes |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "patient",
        "label": "Patient or source",
        "type": "text",
        "required": true
      },
      {
        "key": "test_name",
        "label": "Requested test name",
        "type": "text",
        "required": true
      },
      {
        "key": "sample_type",
        "label": "Requested specimen",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "blood",
            "label": "Blood"
          },
          {
            "value": "dried_blood_spot",
            "label": "Dried blood spot"
          },
          {
            "value": "saliva",
            "label": "Saliva"
          },
          {
            "value": "buccal_swab",
            "label": "Buccal swab"
          },
          {
            "value": "tissue",
            "label": "Tissue"
          },
          {
            "value": "skin_biopsy",
            "label": "Skin biopsy"
          },
          {
            "value": "bone_marrow_aspirate",
            "label": "Bone marrow aspirate"
          },
          {
            "value": "bone_marrow_core",
            "label": "Bone marrow core biopsy"
          },
          {
            "value": "amniotic_fluid",
            "label": "Amniotic fluid"
          },
          {
            "value": "chorionic_villi",
            "label": "Chorionic villi"
          },
          {
            "value": "cord_blood",
            "label": "Cord blood"
          },
          {
            "value": "cerebrospinal_fluid",
            "label": "Cerebrospinal fluid"
          },
          {
            "value": "urine",
            "label": "Urine"
          },
          {
            "value": "stool",
            "label": "Stool"
          },
          {
            "value": "hair_follicles",
            "label": "Hair follicles"
          },
          {
            "value": "nail_clippings",
            "label": "Nail clippings"
          },
          {
            "value": "semen",
            "label": "Semen"
          },
          {
            "value": "embryo_biopsy",
            "label": "Embryo biopsy"
          },
          {
            "value": "whole_embryo",
            "label": "Whole embryo"
          },
          {
            "value": "polar_body",
            "label": "Polar body"
          },
          {
            "value": "plasma",
            "label": "Plasma"
          },
          {
            "value": "serum",
            "label": "Serum"
          },
          {
            "value": "extracted_dna",
            "label": "Extracted DNA"
          },
          {
            "value": "extracted_rna",
            "label": "Extracted RNA"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "test_type",
        "label": "Broad test type",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "single_gene",
            "label": "Single-gene test"
          },
          {
            "value": "gene_panel",
            "label": "Gene panel"
          },
          {
            "value": "exome_sequencing",
            "label": "Exome sequencing"
          },
          {
            "value": "genome_sequencing",
            "label": "Genome sequencing"
          },
          {
            "value": "targeted_variant_testing",
            "label": "Targeted variant testing"
          },
          {
            "value": "repeat_expansion_testing",
            "label": "Repeat expansion testing"
          },
          {
            "value": "methylation_analysis",
            "label": "Methylation analysis"
          },
          {
            "value": "chromosomal_microarray",
            "label": "Chromosomal microarray"
          },
          {
            "value": "karyotype",
            "label": "Karyotype"
          },
          {
            "value": "fish",
            "label": "FISH"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "objective",
        "label": "Objective",
        "type": "long_text",
        "required": false
      },
      {
        "key": "clinical_suspicion",
        "label": "Clinical suspicion",
        "type": "long_text",
        "required": false
      },
      {
        "key": "genes",
        "label": "Genes",
        "type": "string_list",
        "required": false
      }
    ]
  },
  "fields": [
    {
      "key": "patient",
      "value": "Patient AB-123"
    },
    {
      "key": "test_name",
      "value": "Hereditary cancer panel"
    },
    {
      "key": "sample_type",
      "value": "blood"
    },
    {
      "key": "test_type",
      "value": "gene_panel"
    },
    {
      "key": "objective",
      "value": "Evaluate an inherited cancer predisposition."
    },
    {
      "key": "genes",
      "value": [
        "BRCA1",
        "BRCA2"
      ]
    }
  ]
}
```

## Acceptance conditions

- Patient and subject references agree across the form and input objects.
- The consent is accepted and its scope covers the proposed order.
- The provider confirms the selected tests and scope within its offered test-ordering process.

## Scope rules

- Create pgo_test_order content from the patient, test name and sample type actually supplied, plus only the optional context the requester provided.
- Consent checks and provider suitability checks remain service responsibilities and are not fabricated inside the order content.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S05. Create an actual biological sample collection request — `pgs_collection_request`

Create a request for a qualified collector or laboratory to obtain a real biological sample from the subject. This means phlebotomy, swab, saliva, biopsy, or embryo-material collection; it is not courier pickup, package pickup, truck pickup, or sample transport.

**Provider:** Origin Sample Services (`pgp_sample_logistics`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** wet_lab<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Verify the subject, consent, requested material, collection method, collection site, collection window, and preparation profile; schedule or perform the biological sample collection.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `collection_request` | `pgo_collection_request` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient` | `text` | Yes | Patient or source |
| `sample_type` | `enum` | Yes | Biological material to collect |
| `collection_method` | `enum` | No | Collection method |
| `container` | `enum` | No | Container or kit |
| `requested_quantity` | `text` | No | Requested quantity |
| `collection_site` | `address` | No | Collection site |
| `scheduled_at` | `datetime` | No | Scheduled collection time |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "patient",
        "label": "Patient or source",
        "type": "text",
        "required": true
      },
      {
        "key": "sample_type",
        "label": "Biological material to collect",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "blood",
            "label": "Blood"
          },
          {
            "value": "dried_blood_spot",
            "label": "Dried blood spot"
          },
          {
            "value": "saliva",
            "label": "Saliva"
          },
          {
            "value": "buccal_swab",
            "label": "Buccal swab"
          },
          {
            "value": "tissue",
            "label": "Tissue"
          },
          {
            "value": "skin_biopsy",
            "label": "Skin biopsy"
          },
          {
            "value": "bone_marrow_aspirate",
            "label": "Bone marrow aspirate"
          },
          {
            "value": "bone_marrow_core",
            "label": "Bone marrow core biopsy"
          },
          {
            "value": "amniotic_fluid",
            "label": "Amniotic fluid"
          },
          {
            "value": "chorionic_villi",
            "label": "Chorionic villi"
          },
          {
            "value": "cord_blood",
            "label": "Cord blood"
          },
          {
            "value": "cerebrospinal_fluid",
            "label": "Cerebrospinal fluid"
          },
          {
            "value": "urine",
            "label": "Urine"
          },
          {
            "value": "stool",
            "label": "Stool"
          },
          {
            "value": "hair_follicles",
            "label": "Hair follicles"
          },
          {
            "value": "nail_clippings",
            "label": "Nail clippings"
          },
          {
            "value": "semen",
            "label": "Semen"
          },
          {
            "value": "embryo_biopsy",
            "label": "Embryo biopsy"
          },
          {
            "value": "whole_embryo",
            "label": "Whole embryo"
          },
          {
            "value": "polar_body",
            "label": "Polar body"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "collection_method",
        "label": "Collection method",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "venous_blood_draw",
            "label": "Venous blood draw"
          },
          {
            "value": "capillary_blood_collection",
            "label": "Capillary blood collection"
          },
          {
            "value": "buccal_swab",
            "label": "Buccal swab"
          },
          {
            "value": "saliva_collection",
            "label": "Saliva collection"
          },
          {
            "value": "needle_aspiration",
            "label": "Needle aspiration"
          },
          {
            "value": "core_biopsy",
            "label": "Core biopsy"
          },
          {
            "value": "surgical_biopsy",
            "label": "Surgical biopsy"
          },
          {
            "value": "skin_punch_biopsy",
            "label": "Skin punch biopsy"
          },
          {
            "value": "amniocentesis",
            "label": "Amniocentesis"
          },
          {
            "value": "chorionic_villus_sampling",
            "label": "Chorionic villus sampling"
          },
          {
            "value": "lumbar_puncture",
            "label": "Lumbar puncture"
          },
          {
            "value": "embryo_biopsy",
            "label": "Embryo biopsy"
          },
          {
            "value": "polar_body_biopsy",
            "label": "Polar body biopsy"
          },
          {
            "value": "self_collection",
            "label": "Self-collection"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "container",
        "label": "Container or kit",
        "type": "enum",
        "required": false,
        "options": [
          {
            "value": "edta_tube",
            "label": "EDTA tube"
          },
          {
            "value": "heparin_tube",
            "label": "Heparin tube"
          },
          {
            "value": "citrate_tube",
            "label": "Citrate tube"
          },
          {
            "value": "serum_tube",
            "label": "Serum tube"
          },
          {
            "value": "dna_stabilization_tube",
            "label": "DNA stabilization tube"
          },
          {
            "value": "rna_stabilization_tube",
            "label": "RNA stabilization tube"
          },
          {
            "value": "sterile_container",
            "label": "Sterile container"
          },
          {
            "value": "swab_collection_kit",
            "label": "Swab collection kit"
          },
          {
            "value": "saliva_collection_kit",
            "label": "Saliva collection kit"
          },
          {
            "value": "cryovial",
            "label": "Cryovial"
          },
          {
            "value": "filter_paper_card",
            "label": "Filter paper card"
          },
          {
            "value": "formalin_container",
            "label": "Formalin container"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      },
      {
        "key": "requested_quantity",
        "label": "Requested quantity",
        "type": "text",
        "required": false
      },
      {
        "key": "collection_site",
        "label": "Collection site",
        "type": "address",
        "required": false
      },
      {
        "key": "scheduled_at",
        "label": "Scheduled collection time",
        "type": "datetime",
        "required": false
      }
    ]
  },
  "fields": [
    {
      "key": "patient",
      "value": "Patient AB-123"
    },
    {
      "key": "sample_type",
      "value": "blood"
    },
    {
      "key": "collection_method",
      "value": "venous_blood_draw"
    },
    {
      "key": "container",
      "value": "edta_tube"
    },
    {
      "key": "requested_quantity",
      "value": "2 mL"
    },
    {
      "key": "collection_site",
      "value": "Demo clinical collection room"
    }
  ]
}
```

## Acceptance conditions

- The request identifies the subject or source, the linked test order, the biological material to obtain, and the qualified collection method.
- The assigned provider accepts the sample collection site, time window, consent state, and preparation profile before the collection is scheduled or performed.
- This is an actual biological sample collection request. It is explicitly not a courier pickup, package pickup, truck pickup, or transport order.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- The collection_request describes the intended biological collection event. A physical sample object is created or linked only when the sample is actually obtained.
- Transportation after collection belongs to pgs_sample_transport or another explicit transport service, never to pgs_collection_request.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S06. Transport an already collected specimen — `pgs_sample_transport`

Move an already biologically collected physical specimen from origin to destination and record custody and receipt. This is the transport service; it does not create or replace the biological sample collection request.

**Provider:** Origin Sample Services (`pgp_sample_logistics`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** wet_lab<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Perform the physical handoff and transport of the existing specimen, record custody, and obtain destination receipt.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `collection_request` | `pgo_collection_request` | Required 1:1 |
| Input | `blood_sample` | `pgo_blood_sample` | Required 1:1 |
| Output | `delivered_specimen` | `same_as:blood_sample` | new_revision |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `contact_name` | `text` | Yes | Contact name |
| `contact_phone` | `phone` | Yes | Contact phone |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "contact_name",
        "label": "Contact name",
        "type": "text",
        "required": true
      },
      {
        "key": "contact_phone",
        "label": "Contact phone",
        "type": "phone",
        "required": true
      }
    ]
  },
  "fields": [
    {
      "key": "contact_name",
      "value": "Example Contact"
    },
    {
      "key": "contact_phone",
      "value": "+541155551234"
    }
  ]
}
```

## Acceptance conditions

- The specimen reference identifies a real sample that has already been biologically collected.
- The transport provider accepts pickup and delivery locations, availability and handling requirements before dispatch.
- The collection_request input documents the prior or intended biological sample collection; it is not the transport order itself.

## Scope rules

- Reject references where object_type or revision differ from the submitted collection_request and physical specimen.
- Preserve object_id; return a new revision with destination, custody events and receipt status.
- If transport or receipt fails, record the real state. Do not fabricate a delivered specimen or create another pickup automatically.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S07. Extract DNA from an accepted specimen — `pgs_dna_extraction`

Produce an identified DNA sample from one compatible blood, tissue or embryo-biopsy specimen.

**Provider:** Atlas Precision Laboratory (`pgp_precision_lab`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** wet_lab<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Perform the accepted extraction method and return the DNA identity, measured properties and source lineage.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `blood_sample` | `pgo_blood_sample` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `dna_sample` | `pgo_dna_sample` | new_object |
| Output | `source_specimen` | `same_as:blood_sample` | new_revision |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `extraction_profile` | `enum` | Yes | Extraction profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "extraction_profile",
        "label": "Extraction profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "demo_blood_dna_v1",
            "label": "Demo blood DNA extraction"
          },
          {
            "value": "demo_tissue_dna_v1",
            "label": "Demo tissue DNA extraction"
          },
          {
            "value": "demo_embryo_biopsy_dna_v1",
            "label": "Demo embryo-biopsy DNA extraction"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "extraction_profile",
      "value": "demo_blood_dna_v1"
    }
  ]
}
```

## Acceptance conditions

- Exactly one specimen occupies the specimen slot; acceptedTypes are alternatives, not three required inputs.
- The specimen is received at this provider, available for the planned procedure and accepted under the selected extraction profile.
- For pgo_embryo_sample, data.material_kind must equal embryo_biopsy. A whole_embryo is rejected by this service.
- The blood, tissue or embryo-biopsy material must match the selected extraction profile.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- The extracted DNA has its own object_id and a lineage reference to the source specimen. Record source consumption or remaining quantity in specimen tracking.
- Return a new revision of the source physical object recording consumed material and remaining quantity. This fixture consumes the entire provided aliquot. Physical execution must lock the current revision to prevent concurrent reuse.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## More information

This fixture demonstrates the optional closed `moreInformation` map. Only non-null, non-empty sections are rendered in the modal.

```json
{
  "frequentQuestions": [
    {
      "question": "What kinds of specimens can be used?",
      "answer": "The provider reviews compatible blood, tissue, or embryo-biopsy specimens against the selected extraction profile."
    }
  ],
  "keyInsights": [
    {
      "title": "A quality DNA input starts with the specimen",
      "description": "Specimen identity, condition, and the requested downstream study determine whether extraction can proceed."
    }
  ],
  "scientificFacts": [
    {
      "title": "Extraction separates DNA from other cellular material",
      "description": "The laboratory uses a validated workflow to isolate DNA while controlling contamination and degradation."
    }
  ],
  "usefulLinks": [
    {
      "title": "DNA extraction overview",
      "url": "https://example.com/services/dna-extraction/overview"
    }
  ],
  "sampleLink": {
    "title": "Review a sample result",
    "description": "See a fictional example of the information returned after an accepted extraction workflow.",
    "buttonTitle": "Open sample",
    "url": "https://example.com/services/dna-extraction/sample"
  },
  "bulletSegments": [
    {
      "title": "Provider review",
      "description": "The laboratory confirms that the submitted specimen and order are suitable for the published workflow.",
      "imageUrl": "https://example.com/images/services/dna-extraction-review.png"
    }
  ],
  "technicalInformationFacts": [
    {
      "title": "Technical deliverables",
      "description": "The completed service registers the extracted DNA and the updated source-specimen state.",
      "subitems": [
        "Extracted DNA identity and measured properties",
        "Source-specimen revision reflecting material use"
      ]
    }
  ],
  "biologicalSampleRequirements": [
    {
      "title": "Accepted material",
      "description": "Submit one specimen compatible with the extraction profile selected in the request form.",
      "instructions": "Keep the specimen identified and follow the provider's collection, packaging, and delivery directions."
    }
  ],
  "websiteUrl": "https://example.com/services/dna-extraction"
}
```

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S08. Sequence the requested scope — `pgs_sequencing`

Process an accepted DNA sample and deliver FASTQ reads supporting the contracted order scope.

**Provider:** Atlas Precision Laboratory (`pgp_precision_lab`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** wet_lab<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Prepare and run the laboratory work, assess the requested scope, and deliver the contracted read files and support evidence.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `dna_sample` | `pgo_dna_sample` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `reads` | `pgo_sequence_reads` | new_object |
| Output | `source_dna` | `same_as:dna_sample` | new_revision |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `sequencing_profile` | `enum` | Yes | Sequencing profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "sequencing_profile",
        "label": "Sequencing profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_targeted_reads_v1",
            "label": "Demo targeted read profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "sequencing_profile",
      "value": "pg_demo_targeted_reads_v1"
    }
  ]
}
```

## Acceptance conditions

- The provider has accepted the DNA identity, quantity, quality and physical availability.
- The sequencing profile supports the order scope and requested variant classes.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- FASTQ is the output of this particular contract. A different laboratory contract may deliver BAM or VCF and combine later transformations internally.
- The digital deliverable carries the run/profile, reference and assessment evidence needed to evaluate its suitability for the order.
- Return a new revision of the source physical object recording consumed material and remaining quantity. This fixture consumes the entire provided aliquot. Physical execution must lock the current revision to prevent concurrent reuse.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S09. Align sequence reads — `pgs_read_alignment`

Align accepted FASTQ reads to the order reference and return an aligned-read object.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** bioinformatics<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Run the alignment and quality assessment under the declared profile; retain the transaction-bound input and selected reference context.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `sequence_reads` | `pgo_sequence_reads` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `aligned_reads` | `pgo_aligned_reads` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `alignment_profile` | `enum` | Yes | Alignment profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "alignment_profile",
        "label": "Alignment profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_alignment_v1",
            "label": "Demo alignment profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "alignment_profile",
      "value": "pg_demo_alignment_v1"
    }
  ]
}
```

## Acceptance conditions

- Read layout, encoding and sequencing profile are supported.
- The specified reference is available to the provider and agrees with the order.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S10. Call variants in the requested scope — `pgs_variant_calling`

Derive an unannotated VCF from aligned reads for the contracted genes, regions and variant classes.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** bioinformatics<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Call the agreed classes, assess support across the requested scope and produce a native VCF with transaction-bound input and output records.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `aligned_reads` | `pgo_aligned_reads` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `variants` | `pgo_unannotated_vcf` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `calling_profile` | `enum` | Yes | Variant-calling profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "calling_profile",
        "label": "Variant-calling profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_calling_v1",
            "label": "Demo variant-calling profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "calling_profile",
      "value": "pg_demo_calling_v1"
    }
  ]
}
```

## Acceptance conditions

- The alignment reference matches the order and the calling profile.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S11. Annotate a VCF — `pgs_variant_annotation`

Add the agreed variant annotations while preserving input identity, native variant context and analytical limitations.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** bioinformatics<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Enrich variants using the provider annotation profile and record the knowledge-source versions and limitations.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `unannotated_vcf` | `pgo_unannotated_vcf` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Output | `annotated_variants` | `pgo_annotated_vcf` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `annotation_profile` | `enum` | Yes | Annotation profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "annotation_profile",
        "label": "Annotation profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "PG_DEMO_ANN_V1",
            "label": "Demo annotation profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "annotation_profile",
      "value": "PG_DEMO_ANN_V1"
    }
  ]
}
```

## Acceptance conditions

- The VCF encoding, reference and variant representation are accepted.
- Required analytical-support information is available in the registered object.

## Scope rules

- When a supplied order cannot be supported by the input, return awaiting_input or failed with the affected scope. Without an order, preserve the input limitations and never claim a broader assessment.
- Annotation adds information about supplied variants; it cannot recover data missing from the input analysis.
- The annotated and unannotated types share .vcf but have different accepted semantic profiles.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S12. Produce an interactive genomic result — `pgs_interactive_interpretation`

Convert an annotated VCF into a registered Pocket Genes interactive report backed by a native MyDNAMap .pgi1.json payload that matches MDMAPIModel.

**Provider:** Variant Analysis Cooperative (`pgp_variant_analysis`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** bioinformatics<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Produce or register a native PGI payload, validate it against the matching provider schema, attach support evidence and limitations, and return the Pocket Genes registration object.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `annotated_vcf` | `pgo_annotated_vcf` | Required 1:1 |
| Output | `interactive_report` | `pgo_interactive_report` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `interpretation_profile` | `enum` | Yes | Interactive report profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "interpretation_profile",
        "label": "Interactive report profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_mdm_pgi1_v1",
            "label": "Demo PGI1 MDMAPIModel profile"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "interpretation_profile",
      "value": "pg_demo_mdm_pgi1_v1"
    }
  ]
}
```

## Acceptance conditions

- The requested demo result is .pgi1.json version 1.0.0 and must validate against schemas/protocol/pgi1-mdm.schema.json.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Scope rules

- The demo genomic content is derived from the VCF and registered as a native MDMAPIModel payload; a symptom bundle is not an input.
- Carry source scope and limitations into the Pocket Genes registration object. A pipeline compares that declared support with its linked order.
- No test_order is a required input to this specific conversion. It can be purchased for an existing compatible annotated VCF.
- PGI2/AGAPIModel and PGI3/TwoPQAPIModel use the same pgo_interactive_report registration concept, but require their own native payload sources and schemas.
- Clinical relevance or report sections live in the native PGI payload and provider profile; patient-specific conclusions belong to the appropriately scoped reporting service.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S13. Create the final self-contained report — `pgs_final_report`

Combine the complete test order with a registered PGI payload into a final PDF for the requested objective.

**Provider:** Clarity Report Studio (`pgp_report_studio`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** bioinformatics<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Verify the order match, native PGI schema, support evidence and scope, perform included report review, and issue a complete PDF using the selected presentation.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `test_order` | `pgo_test_order` | Required 1:1 |
| Input | `interactive_report` | `pgo_interactive_report` | Required 1:1 |
| Output | `report` | `pgo_pdf_report` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `language` | `enum` | Yes | Report language |
| `presentation` | `enum` | Yes | Report presentation |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "language",
        "label": "Report language",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "en",
            "label": "English"
          },
          {
            "value": "es-AR",
            "label": "Spanish, Argentina"
          }
        ]
      },
      {
        "key": "presentation",
        "label": "Report presentation",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "clinical",
            "label": "Clinical report"
          },
          {
            "value": "patient",
            "label": "Patient-facing report"
          },
          {
            "value": "other",
            "label": "Other"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "language",
      "value": "en"
    },
    {
      "key": "presentation",
      "value": "clinical"
    }
  ]
}
```

## Acceptance conditions

- The order and registered PGI object identify the same subject and compatible specimen/source lineage.
- The order contains patient identity, clinical objective, suspicion and required reporting context.
- The selected provider service includes the review/issuance responsibilities required by its report profile. Rendering alone does not supply missing professional conclusions or authorizations.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## Scope rules

- Fulfillment is measured against the order; file extension alone never proves sufficiency.
- If the input cannot support the requested scope, return awaiting_input or failed with the affected scope; do not report a complete negative result.
- The order, registered PGI object and this service form are sufficient under this contract; do not require the original intake form or symptom bundle.
- Both successful requested-scope assessment and explicit limitations must appear in the final self-contained report as appropriate.
- Validate the transaction-bound inputs, native content and optional order context against this published service; do not infer unsupported coverage, findings or capabilities.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S14. Analyze a metaphase image bundle — `pgs_karyotype_analysis`

Review a compatible bundle of metaphase images and return a structured karyotype result without a sequencing step.

**Provider:** Chromosome Image Services (`pgp_cytogenetics`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** bioinformatics<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Perform digital image analysis and the professional review included in the offered cytogenetics service.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Input | `image_bundle` | `pgo_image_bundle` | Required 1:1 |
| Output | `karyotype_result` | `pgo_karyotype_result` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `objective` | `long_text` | No | Analysis objective |
| `analysis_profile` | `enum` | Yes | Analysis profile |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "objective",
        "label": "Analysis objective",
        "type": "long_text",
        "required": false
      },
      {
        "key": "analysis_profile",
        "label": "Analysis profile",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "pg_demo_metaphase_review_v1",
            "label": "Demo metaphase image review"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "objective",
      "value": "Review the supplied metaphase images."
    },
    {
      "key": "analysis_profile",
      "value": "pg_demo_metaphase_review_v1"
    }
  ]
}
```

## Acceptance conditions

- The image bundle declares a metaphase-imaging profile accepted by the provider.
- Subject identity, acquisition context, image count and image quality satisfy the selected review profile.

## Scope rules

- A generic image MIME type is insufficient; the acquisition profile and content must match the analysis.
- This three-stage catalog places digital image analysis in bioinformatics, used here as the broader digital-analysis stage.
- Report the examined material, findings, support and limitations for the selected scope.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

---

### S15. Prepare a consultation summary PDF — `pgs_form_to_pdf`

Create a standalone professional summary from the submitted form, demonstrating a service with no additional input objects.

**Provider:** Meridian Clinical Planning (`pgp_clinical_planning`)<br>
**Provider kind:** organization<br>
**Service version:** 1<br>
**Stages:** test_planning<br>
**Highlighted:** No<br>
**For professionals:** Yes<br>
**Promotional banner:** Not set

## Provider work

Review the submitted information within the service scope and issue a clearly labeled consultation summary.

## Contract slots

| Direction | Role | PGO type | Rule |
| --- | --- | --- | --- |
| Input | `form` | `pgo_form` | Required 1:1 |
| Output | `summary` | `pgo_pdf_report` | new_object |

Input and output arrays are independent. Either may be empty, and both may be empty at the same time. An empty side is encoded as `none` in the calculated `shortContract`, including `none -> none`. The compact syntax is backend/catalog data only; native user interfaces render it as `PGOConversionView`, never as raw text.

## Request form

| Key | Type | Required | Label |
| --- | --- | --- | --- |
| `patient_name` | `text` | No | Patient name |
| `objective` | `long_text` | Yes | Document objective |
| `submitted_information` | `string_list` | Yes | Information to include |
| `language` | `enum` | Yes | Document language |

The completed form freezes only the definitions and answers. Requester identity and request time are transaction fields.

```json
{
  "form_shape": {
    "fields": [
      {
        "key": "patient_name",
        "label": "Patient name",
        "type": "text",
        "required": false
      },
      {
        "key": "objective",
        "label": "Document objective",
        "type": "long_text",
        "required": true
      },
      {
        "key": "submitted_information",
        "label": "Information to include",
        "type": "string_list",
        "required": true
      },
      {
        "key": "language",
        "label": "Document language",
        "type": "enum",
        "required": true,
        "options": [
          {
            "value": "en",
            "label": "English"
          },
          {
            "value": "es-AR",
            "label": "Spanish, Argentina"
          }
        ]
      }
    ]
  },
  "fields": [
    {
      "key": "patient_name",
      "value": "Alex Example"
    },
    {
      "key": "objective",
      "value": "Summarize the submitted request."
    },
    {
      "key": "submitted_information",
      "value": [
        "Consultation note A",
        "Consultation note B"
      ]
    },
    {
      "key": "language",
      "value": "en"
    }
  ]
}
```

## Acceptance conditions

- The form contains the information required for the offered summary service.
- The provider labels the document as a consultation summary and preserves the source/assessment distinction.

## Scope rules

- This PDF is a planning-stage summary. Sharing pgo_pdf_report with a final genomic report does not make the two documents semantically interchangeable.
- Document-purpose and required-content profiles determine which later services can accept it.

## More information

This offer omits `moreInformation`, so its detail screen shows no More information action.

## Transaction rule

A real request selects this active published offer. The transaction pins `serviceId`, integer `serviceVersion`, provider, roles, and object references. The PGO inputs remain independently valid content; the provider may still reject unsuitable inputs under this published service contract.

## Provider catalog

### Meridian Clinical Planning — `pgp_clinical_planning`

Fictional multidisciplinary provider that structures request information, prioritizes candidate genes, records informed consent, prepares test orders, and produces form-based documents.

**Kind:** professional_services_organization<br>
**Stages:** test_planning<br>
**Regions:** AR<br>
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_symptom_intake`
- `pgs_gene_prioritization`
- `pgs_informed_consent`
- `pgs_test_ordering`
- `pgs_form_to_pdf`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://meridianplanning.example",
    "operations_email": "operations@meridianplanning.example",
    "integration_email": "integrations@meridianplanning.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://meridianplanning.example/api/v1",
    "execution_modes": [
      "professional_review",
      "assisted_document_generation"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint"
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

---

### Origin Sample Services — `pgp_sample_logistics`

Fictional provider coordinating real biological sample collection by qualified staff and, when a separate transport service is requested, transporting already collected specimens while preserving identity, custody and condition records.

**Kind:** sample_collection_and_transport_provider<br>
**Stages:** wet_lab<br>
**Regions:** AR<br>
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_collection_request`
- `pgs_sample_transport`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://originsamples.example",
    "operations_email": "operations@originsamples.example",
    "integration_email": "integrations@originsamples.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://originsamples.example/api/v1",
    "execution_modes": [
      "biological_sample_collection",
      "physical_transport"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "state_semantics": "A collection request schedules or records the intended biological sample collection event. Transport is a separate service that moves an already collected specimen and returns the same specimen object_id at a later revision with destination and custody evidence."
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

---

### Atlas Precision Laboratory — `pgp_precision_lab`

Fictional laboratory extracting DNA from accepted specimens and producing the agreed sequencing-read deliverable for the scope and fulfillment requirements in a test order.

**Kind:** laboratory<br>
**Stages:** wet_lab<br>
**Regions:** AR<br>
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_dna_extraction`
- `pgs_sequencing`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://atlasprecision.example",
    "operations_email": "operations@atlasprecision.example",
    "integration_email": "integrations@atlasprecision.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://atlasprecision.example/api/v1",
    "execution_modes": [
      "specimen_receipt",
      "laboratory_processing"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "acceptance_checks": [
      "test_order_scope",
      "accepted_specimen_type_and_state",
      "quantity_and_quality_requirements",
      "agreed_output_profile"
    ]
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

---

### Variant Analysis Cooperative — `pgp_variant_analysis`

Fictional specialist in independently purchasable alignment, variant calling, annotation, and symptom-independent structured genomic interpretation.

**Kind:** bioinformatics_company<br>
**Stages:** bioinformatics<br>
**Regions:** AR<br>
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_read_alignment`
- `pgs_variant_calling`
- `pgs_variant_annotation`
- `pgs_interactive_interpretation`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://variantanalysis.example",
    "operations_email": "operations@variantanalysis.example",
    "integration_email": "integrations@variantanalysis.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://variantanalysis.example/api/v1",
    "execution_modes": [
      "automated_processing",
      "specialist_review_when_included"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "complete_example_contract": "variant_analysis_api_example"
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

---

### Clarity Report Studio — `pgp_report_studio`

Fictional report provider combining a self-contained test order with a symptom-independent .pgi1.json result and the service form to produce a final PDF. Request-specific presentation options belong to the form.

**Kind:** report_production_company<br>
**Stages:** bioinformatics<br>
**Regions:** AR<br>
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_final_report`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://clarityreports.example",
    "operations_email": "operations@clarityreports.example",
    "integration_email": "integrations@clarityreports.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://clarityreports.example/api/v1",
    "execution_modes": [
      "document_generation"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "clinical_role": "Any required professional interpretation or authorization must be explicitly part of the contracted service and attributable to its actual performer. Rendering a PDF does not itself supply that authorization."
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

---

### Chromosome Image Services — `pgp_cytogenetics`

Fictional image-analysis provider accepting a compatible metaphase image bundle and returning a structured karyotype result. The digital analysis can be requested independently of specimen preparation or sequencing.

**Kind:** cytogenetics_analysis_company<br>
**Stages:** bioinformatics<br>
**Regions:** AR<br>
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_karyotype_analysis`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://chromosomeimages.example",
    "operations_email": "operations@chromosomeimages.example",
    "integration_email": "integrations@chromosomeimages.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://chromosomeimages.example/api/v1",
    "execution_modes": [
      "image_analysis",
      "expert_review_when_included"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "stage_note": "Bioinformatics is the catalog bucket for digital analytical services, including this non-sequencing image-analysis branch."
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.

## Generated sources

- `generate_minimal_pgo_contracts.mjs` generates schemas, examples, service/provider fixtures and bundled app catalogs.
- `generate_minimal_pgo_docs.mjs` generates this wiki and all reference pages.
- `sync_pgo_form_contract.mjs` invokes the strict generator; it contains no legacy synchronization logic.
- `validate_catalog.py` is the executable conformance suite.
