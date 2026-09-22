# Native services and PGO experience

This chapter records the current native implementation contract for the Pocket Genes service circuit. It complements the data-model chapters: model validation remains authoritative for stored data, while this document defines how the iOS client discovers offers, creates requests, resumes authentication, presents transactions, and opens delivered Pocket Genes Objects (PGOs).

## 0. Explore entry points and FAQ

The Explore home uses its normal navigation title and top-right language control. Its three equal-weight destinations are **View my reports** / **Ver mis informes**, **I want to get a study** / **Quiero hacerme un estudio**, and **Request a service from the list** / **Solicitar un servicio del listado**. The third route opens available services directly. Changing language updates the visible home copy immediately.

**How services work** opens the full Frequently Asked Questions experience, not an answer to one narrow provider question. `ServicesFrequentQuestionsProvider` is the single source of every FAQ title, section, question, and answer in English and Spanish. The screen uses a plain document-like hierarchy, covers requesters, providers, offers, forms, files, limits, timing, delivery, privacy, ownership, and support, and starts every expandable answer collapsed.

## 1. Services Hub

`ServicesHub` is an all-in-one requester destination. It opens directly on **Service transactions** and does not place a redundant “Services Hub” introduction above the list.

- The signed-in user sees only their own reduced transaction summaries from `community_users/{uid}.requestedServiceTransactions`.
- The root `service_transactions/{requestId}` document remains authoritative for detail, status, inputs, issues, contract snapshots, and outputs.
- Every transaction remains visible even when its source offer is later hidden, archived, or removed from discovery.
- A floating **Request a service** action opens the real offer list.
- **View account status** opens the limits modal.
- Signed-out, empty, loading, and error states occupy the available list height. Empty/authentication content is centered without an extra outlined card.
- Transaction rows are independent indigo-tinted rounded cells on a transparent list surface. The service name is primary; provider, status/date, stage, and a centered trailing chevron follow in that order. Technical `pgs_*` identifiers are not list titles.
- `delivered` rows receive a visible completion treatment only when the root output contract is internally consistent.

The service module uses the Discover star field in dark mode and the shared grouped background in light mode. Offer, transaction, detail, account, and request-flow screens use the same pink service accent. List cells and tappable provider cards may use a translucent tinted surface; ordinary detail sections remain transparent.

## 2. Authentication is resumable

Authentication is presented through the app-wide `AuthenticationWallCoordinator`, not through a screen-local sheet that loses the initiating action.

- Opening the user's transaction list, account status, or a real request while signed out presents the authentication wall.
- After successful sign-in, the original callback runs: lists reload, account status reloads, or the selected offer request continues.
- A signed-out tap on **Request this service** must never become a no-op.
- The simulator may run without authentication because it does not persist a real transaction, but requester fields use the real signed-in identity whenever one exists.

## 3. Offer discovery and simulation

The **Available** tab reads root `service_offers` and shows only offers where all of the following are true:

1. `status == "active"`;
2. `availability != "mock_catalog_only"`; and
3. `isHiddenFromSearch == false`.

`isHiddenFromSearch` is required and must be boolean. Missing, non-boolean, or snake-case variants invalidate the offer. The flag affects discovery only; it never hides existing transactions.

The **Simulator** tab is the only place where the bundled fifteen mock services appear. Simulation reuses the real form, confirmation, congrats, and process-follow-up concepts, but writes no root transaction and consumes no request limit.

Offer cells are individual rounded/outlined surfaces on a transparent table. Their leading PGO/service artwork is top-aligned, not vertically centered against a multiline description. The conversion is shown with `PGOConversionView`; raw `shortContract` text is not rendered to users.

## 4. Offer detail and service contract

Offer detail keeps these concerns separate:

- provider: one tappable organization/professional card, with the publisher's actual artwork, opening the Discover provider detail;
- service details: requester-facing `description`, category/delivery metadata when present, and a two-row commercial summary when cost or turnaround exists;
- provider work: its own full-width prose section using `providerWork`;
- complete service contract: a button that presents `ServiceContractScreen` modally.

The obsolete availability row is not shown. Compact turnaround values are parsed as positive integer plus `m`, `h`, `d`, or `w`, then localized in singular/plural long form, for example `1d` -> “1 day” / “1 día” and `2w` -> “2 weeks” / “2 semanas”.

`ServiceContractScreen` is an adaptive document surface: white with black text in light mode, black with white text in dark mode, with a correctly contrasted pink action. It loads as one stable sheet without a content-size jump. Offer and transaction snapshots are massaged into the same document model. The visual conversion uses `PGOConversionView`; no user-facing table or row prints the raw short-contract expression.

`PGOConversionView` supports `compact`, `medium`, and `fullWidth`. It renders `A + B -> C + D`; full-width mode adds centered object labels below fixed artwork. The expression parser exists only to produce that visual model.

## 5. Real request flow

Tapping **Request this service** opens the request flow. It never creates a transaction immediately.

1. Render the offer's optional `formShape`. Fields are not individually wrapped in redundant cards. Platform values `requested_at` and `requested_by` come from the authenticated requester; the user supplies every other required answer.
2. For every non-form input slot, open the in-app File picker. It searches eligible Pocket Genes storage already known to the app and never opens the external Files importer.
3. Allow **I will attach the files later**. Missing roles are persisted in `missingRequiredInputRoles`, and `attachmentsPending` is set.
4. The final action says **Request service**, not “Continue”. It opens a custom Pocket Genes confirmation alert with **Cancel** and a pink **Send** CTA. The copy asks the user to review the form and states that submitted answers cannot be edited afterward.
5. Shake-to-undo is disabled while the user edits the service form and restored when the flow leaves that editing state.
6. After confirmation, show the event-driven request creation screen. Navigation is locked only while the request pipeline is active.

Form controls are generated from the exact shape and support text, number, integer, boolean, date, datetime, enum, multi-enum, and string-list fields. The stored `pgo_form` embeds the immutable shape plus typed submitted values so `PGOFormExploreScreen` and the original-form modal can reconstruct any supported form after the offer changes.

## 6. Functional-limit creation state machine

`ServiceRequestCreationStep` is the native source of truth for visible progress:

1. `validatingRequest`
2. `validatingForm` when applicable
3. `resolvingProvider` when applicable
4. `validatingLimits`
5. `calculatingUsage`
6. `eligibilityApproved`
7. `preparingForm` when applicable
8. `registeringForm` when applicable
9. `downloadingForm` when applicable
10. `creatingTransaction`
11. `finalizingTransaction`

The UI advances only when the service layer emits the next step. It must not use a cosmetic timer to invent progress. Earlier completed steps remain checked, the active step remains animated, and success cannot appear while a callback is unresolved.

All deterministic rejection must happen before provider-owned data is persisted. Validation covers the discoverable active offer, exact form contract and values, declared input roles/types/revisions, authenticated requester, real active publisher, owner destination, and idempotency. The app then loads stable policy configuration plus every root transaction for `requestedByUserId` and derives total capacity, UTC-day usage, latest request, cooldown deadline, and effective next allowed moment from each transaction's server `requestedAt`.

Approval exists only in memory. The app never persists a daily counter, remaining balance, last/next request date, cooldown date, UTC bucket date, or pending admission. Only after this functional calculation approves the request may form provisioning begin. Limits, shape, and answers are not re-evaluated later in the same approved pipeline.

## 7. Provider-owned submitted form

When the offer declares `pgo_form`, the submitted form is a real PGO owned by the provider account, not by the requester and not an embedded-only transaction field.

1. Resolve the exact active `feed_organizations` or `feed_individuals` publisher from `providerId`/`providerKind`.
2. Resolve its owning community UID from the publisher's explicit account fields. Arbitrary provider names or email strings are not owner IDs.
3. Require `object_owners/{providerUid}` or normalize it once from `report_owners/{providerUid}` when only the report-owner profile exists.
4. Generate a collision-checked nine-digit ASCII object code.
5. Create provider-owned `file_storage` content named `<requester name> - YYYY-MM-DD.pgform.json`.
6. Create `uploaded_objects` as exact `pgo_form` with `upload_version_count: 1`, create `object_codes`, and add the object ID to the provider's `community_users.owned_objects`.
7. Download the submitted form into the requester's local object inventory through the normal object-code circuit.
8. Create the root transaction and reduced requester summary in the final batch without writing any derived usage state.

The transaction's form input includes `role`, `objectRef`, `objectType`, `objectCode`, `uploadedObjectId`, `fileStorageId`, `objectOwnerId`, and an immutable `objectSnapshot`. If the final transaction batch fails after provisional form registration, compensating cleanup removes the provisional file, uploaded object, code, provider index entry, and local copy. A valid provider owner normalization may remain.

## 8. Completion and navigation

Successful creation changes one Services Hub route state from `offers` to `completed(transaction)` in a single SwiftUI transaction with animations disabled. That atomic replacement removes the complete offer/detail/form path and presents congrats over the refreshed Services Hub without exposing a sequence of pops and pushes. A back gesture can therefore never return to a completed form or congrats screen.

- Dismissing congrats reveals the refreshed transaction list.
- The subtle back action dismisses congrats to the list.
- **View request** atomically replaces `completed(transaction)` with `transaction(transaction)`, leaving the navigation stack as home -> Services Hub -> transaction detail without displaying intermediate navigation operations.
- The loading surface uses one progress driver that remains alive for the complete attempt, including periods with no queued callback. It may terminate only after failure is surfaced or the success handler has been delivered.
- The root transaction commit callback or committed-document listener is authoritative success. Once either confirms the matching request ID, commit observation and network watchdogs stop, the pending visual cadence drains, and the success handler must fire exactly once.
- A separate committed-success fallback takes over if normal UI delivery has not happened within the execution-policy deadline. It preserves the minimum visible cadence for remaining confirmed steps and then invokes the same idempotent success handler. A committed request must never remain indefinitely on `finalizingTransaction`.
- Congrats uses a compact success icon, short human-readable service/provider/status text without a surrounding metadata card, deliberate spacing, and bottom-pinned primary and tertiary actions.

## 9. Transaction detail and process follow-up

Transaction detail loads the root record and presents:

- one nonduplicated title;
- a tappable provider card without redundant provider ID/kind/name rows;
- transparent detail sections;
- a separate provider-work section;
- collapsed **Request summary** and **Request metadata** sections;
- inputs as downloadable object cells;
- the full contract modal action;
- issues/pending roles when present;
- delivered results when valid; and
- a large bottom-pinned **Process follow-up** CTA.

A submitted form input behaves like every downloadable object: **Download** -> spinner -> **Open**, with **Update** only when the remote `upload_version_count` is greater than the local version. **See original filled form data** presents a separate modal containing the embedded form shape and submitted values; it does not expand the full payload inline.

**Process follow-up** is a standalone modal containing only the tracking block. It does not duplicate the complete request summary. A requester cannot force the next status. **Contact** attempts to compose an email to the provider organization's declared email and performs no other status mutation.

## 10. Delivery and results

`delivered` is the only successful terminal status. The detail and process screens expose **View results** only when each frozen output role has exactly one valid `outputObjects` snapshot with the promised `objectType` and a resolvable nine-digit `objectCode`.

`ServiceTransactionResultScreen` shows each promised object with one of these actions:

- **Download** when the exact code is not stored locally;
- a spinner while retrieval is active;
- **Open** when the exact code and current version are already local; or
- **Update** when the same remote object has a greater positive `upload_version_count`.

Download/update uses `object_codes -> uploaded_objects -> object_owners -> file_storage`, persists the remote version, replaces an older local copy under the same code, and makes the object available in **Choose your object**. Opening uses the standard blocking activation flow before routing to the matching PGO explorer. Optional `outputReports` are companion links and never repair a missing promised PGO.

## 11. Account status and UTC limits

The account-status modal presents transparent sections over the service background:

- configured request cooldown;
- last request derived from root transaction timestamps;
- requests today as `used/max`, for example `4/5`;
- total remaining as derived `remaining/total`;
- current daily-window start and next reset;
- seven UTC day buckets in a bar chart; and
- a rotating service-limits Join Us banner.

Day boundaries and counts are always split at `00:00 UTC`. The displayed start/reset timestamps are converted to the device's local time, so Buenos Aires may show the next UTC reset as 9:00 PM on the preceding local date. Chart bucket labels still identify UTC buckets.

The countdown refreshes every second. The cooldown deadline is recalculated as latest real `requestedAt + cooldown_seconds`. When cooldown and daily-cap waits are both active, the effective deadline is the later of that temporary deadline and the next UTC day boundary. Exhausted total capacity has no automatic reset date.

## 12. PGO selection and exploration

The file hub is titled **Your files** / **Tus archivos**. PDF and VCF remain classic report experiences. The 20 catalog PGOs live under one transparent collapsible **Pocket Genes Objects** section, beginning with **Request preparation**.

- Every PGO grid tile uses its cube artwork in an uncompressible square equal to one half of the tile side, with 24 points of top spacing. A spacer separates artwork from a maximum two-line label so text never resizes the image.
- Tapping a PGO opens **Choose your object**, not the report-code flow.
- The add-object alert uses nine equal numeric positions across the available alert width with 16-point side insets.
- Stored-object rows show a 36-point type artwork beside **Object code** and the exact code.
- **Open object** / **View sample object** actions have no decorative wrapper surface.

The PGO explorer intentionally differs from report explorers. It has no report-style introduction or fun-fact carousel. Its object-specific hero is first and the true compact `QuickAccessView` is second. The first action is always one-word **Open** / **Abrir**; other actions are unique one-word labels, with the data lens normally shown as **Metadata** / **Metadatos**. Header tint comes from the canonical `PGOObjectType` color, pills use a flow layout that fills each row before wrapping, and every one of the 20 types routes **Open** to a content-first visualization designed for that object rather than to generic wrapper metadata. Metadata, process, payload, and insight views remain secondary navigation destinations.

PGO and service education lives in the dedicated Learn catalog (`LessonReferencePGO.json` and `LessonDictionaryPGO.json`). It teaches the process of obtaining and interpreting genomic objects, what each object can contain, and how it participates in a service journey; it must not be reduced to JSON-format trivia.

All service, PGO, Learn, FAQ, empty-state, action, and error strings used by this circuit require valid English and Spanish localization entries. The native content overlays include `SpanishServicesContent.json`, `SpanishPGOExploreContent.json`, and `SpanishLearnContent.json` alongside localized strings and the bilingual FAQ provider. Missing translations must never leak localization keys or force English into the Spanish UI.
