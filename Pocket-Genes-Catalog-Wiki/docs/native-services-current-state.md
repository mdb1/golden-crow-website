# Native Services Current State

## Service architecture

### Offers

A service offer is an untimed, provider-owned published template. It selects a real Discover organization or professional individual, declares zero or more required input slots, zero or more output slots, integer contract versions, work description, optional commercial terms, and at least one stage. Offers start as draft and become selectable only through publish/active state. `isHiddenFromSearch` always removes an offer from discovery without hiding transactions already created from it. Otherwise, `isHighlightedOffer` places it under Highlighted and `isProfessionalOffer` places it under For professionals; an offer may appear in both segments, and one with both flags false appears in neither.

The full highlighted card requires both conditions: `isHighlightedOffer` is true and a normalized `promotionalBannerImageUrl` or, when no URL is present, `promotionalBannerImageUploadDataUrl` is available. An offer with a banner but `isHighlightedOffer` false uses the regular service cell with the complete banner as its top section. If both image properties are absent, null or empty, the regular cell reserves no banner box, even when `isHighlightedOffer` is true. Both banner presentations use a 1024:500 frame and aspect-fit rendering so the entire image remains visible without cropping. Segment flags continue to determine whether the offer is listed under Highlighted, For professionals, or both.

`inputSlots` and `outputSlots` are explicit arrays, but each may be empty independently and both may be empty simultaneously. A service may therefore require no form or input object, may finish without producing an object, or may represent provider work with neither object inputs nor object outputs. Empty arrays never create placeholder slots, synthetic objects, or hidden requirements. The calculated `shortContract` uses `none` for each empty side: `none -> report:pdf_report`, `form:form -> none`, or `none -> none`. Native contract and transaction screens show intentional empty states for those sides instead of fabricated rows.

If and only if an offer enables form input, it declares exactly one required `pgo_form` slot with role `form` and a matching external `formShape`. Manual slots cannot use `pgo_form`. The external shape retains generated ID and integer version; the submitted PGO freezes only its field definitions and answers.

### Transactions

A transaction is a timed execution created from an existing active offer. It inherits the pinned service ID/version, provider, input slots, and output slots, including explicit empty arrays. Transaction identity and time use root transaction fields; they are not generated form answers. `requestedByUserId` is always optional because a requester may not have an account yet. Every new transaction must have at least one requester identity: an authenticated request has `requestedByUserId` and may retain `requestedByUserEmail`; an accountless request has a normalized `requestedByUserEmail` and no `requestedByUserId`. An offer with no form and no input slots proceeds directly to confirmation and admission without creating a form object or asking for files.

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

Missing, malformed, email-mismatched, or conflicting transactions are never attached to the user; unresolved valid references remain available for a later safe retry. Feature-specific post-login work runs only after this normalization attempt finishes. After linking, native reloads `requestedServiceTransactions`, so the normalized transactions appear in the standard list. In the **View my reports** flow, entering the authenticated downloaded-files screen then runs the existing pending-output discovery against the normalized transaction index, allowing newly linked delivered files to appear immediately as download options. The email may remain on the full transaction as immutable requester provenance, but future authorization and user-list lookup use `requestedByUserId`.

The native requester sequence is:

1. Validate the offer, form, all selected object references, and either the authenticated user identity or collected normalized email without writing.
2. Recompute usage limits from root transactions by `requestedByUserId` for an authenticated requester or by `requestedByUserEmail` for an email-only requester.
3. Approve or deny before creating a provider-owned form object.
4. When approved, create the strict pgo_form file under the provider organization, register its object/code, and download the requester's local copy.
5. Create the service transaction and either the reduced authenticated-user snapshot or the one-per-email deferred index entry.
6. Present confirmation over the service hub, then allow process tracking.

Status progression is controlled by provider/backoffice work. Native users cannot force progress. `delivered` is the successful final state and requires every contractually promised output PGO snapshot in `outputObjects`. When `outputSlots` is empty, `delivered` is consistent only with an empty `outputObjects` array and no object is required to prove completion. Optional `outputReports` do not satisfy a declared PGO output slot.

### Ownership and delivery

The creator/administrator of an object is its seeder and may manage its stored source. `is_clinician` grants access to both report and object administration; it does not itself confer ownership. Pocket Genes transports and presents authorized files but does not warrant their clinical content.

Service offers are the primary way a regular user requests new objects. Backoffice/provider tooling performs fulfillment, registers output objects, and marks delivery. The requester keeps the transaction while work is pending, then downloads, opens, and updates delivered objects through the normal nine-digit object-code circuit.

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

## Request limits

Stable usage configuration is `20` total transactions, `5` per UTC day, and a `300`-second cooldown unless policy configuration changes.

Usage state is functional and recomputed from root `service_transactions` using `requestedAt` plus the active requester key: `requestedByUserId` for an authenticated requester or the exact normalized `requestedByUserEmail` for an email-only requester. Never persist today's count, remaining tokens, last transaction time, cooldown start/end, next request time, or pending admissions. UTC buckets split at 00:00 UTC; the UI displays the reset in device-local time. When daily reset and cooldown both apply, the later deadline wins.

Admission runs before form-object persistence and provider dispatch. A denied attempt creates no transaction, file, uploaded object, code, owner normalization, counter, or cooldown record. `catalog/usage-policy.json` remains the executable source and declares both authenticated and deferred requester keys.

The available-services list reads only active, non-hidden Firebase offers whose highlighted or professional segment flag is enabled. A request form is produced only when the selected offer declares its matching `pgo_form` input. Confirmation, validation/loading, congrats, transaction detail, process tracking, provider contact, contract document, input downloads and delivered results are separate native states. Transaction detail shows explicit empty states for missing input and output contracts instead of inventing rows.

The strict first-schema redesign changes object payloads only. Offers allow the explicit email-only request route described above. The account transaction list remains authenticated; the signed-out device modal is a read-only view constrained to the locally retained email's verified deferred index. Publisher resolution, ownership, role binding, delivery consistency, provider email lookup, and transaction visibility remain enforced.
