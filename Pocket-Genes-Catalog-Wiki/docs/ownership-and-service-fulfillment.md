# Ownership and Service Fulfillment

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

## Strict first schema

This is the first PGO content schema and it has not shipped to production. There is no legacy compatibility reader, alias, fallback, dual decoder, or runtime migration utility. Writers emit only the strict allowlists; readers reject envelopes, removed keys and unknown properties immediately.

Repository fixtures and generators were replaced at their source instead of converted at runtime. Existing platform records may still surround strict content for identity, ownership and transaction tests, but that wrapper is not accepted as a PGO file. No discarded field is copied into `notes`, and no old local payload path is rewritten into a fabricated URL.

The repository fixtures are synthetic schema examples using the IANA-reserved `example.com` domain. They are not production objects and are never represented as live downloads.

## Responsibility

The object/report administrator warrants that they are authorized to seed and share the file. Downloaders must protect access codes. Providers remain responsible for their contracted work. Pocket Genes provides distribution, access and exploration infrastructure and is not the author of third-party clinical content.

## Collections

Report and object owner records remain separate. Objects use nine-digit numeric codes, `object_codes`, `uploaded_objects`, and `object_owners`; reports use six-character alphanumeric codes and their parallel collections. Stored files are agnostic and may back either domain. No PGO content duplicates owner or access facts.
