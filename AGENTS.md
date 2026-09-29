# Repo Instructions

- After completing a requested code fix or implementation, commit and push it to `main` automatically unless the user explicitly asks not to push, asks for a PR/branch workflow, or the work cannot pass the mandatory gates. Do not wait for a separate `commit and push` prompt.
- When the user says `commit and push` without naming a branch, commit the requested change and push it directly to `main`. Do not leave requested work only on a `codex/*`, feature, or draft branch unless the user explicitly asks for that branch or PR flow.
- Every time you make a commit that will be pushed, bump the backoffice version by exactly `+1`.
- The version source of truth is `backoffice/src/lib/app-version.ts`.
- Treat the version bump as mandatory for every pushed commit. Do not wait for the user to remind you.
- If a commit was created without a version bump, fix the version before pushing.
- Keep the bumped version visible on the authentication screen.
- Before pushing, verify the committed version with `git show HEAD:backoffice/src/lib/app-version.ts`.

## Header Uncluttering

- Header uncluttering is the required cleanup for operational dashboard screens whose top chrome repeats the same area/title/context in the navbar, a page hero, helper banners, and the first workbench/list card.
- On uncluttered screens, the navbar must show only the main route title. Hide navbar eyebrows and secondary gray descriptions for the affected route family; navigation, account, language, theme, and sign-out controls must remain visible.
- Keep the original page hero code mounted but hidden by default. Add a small icon-only info button in the first operational panel so users can reveal or hide that header context on demand.
- Remove or permanently hide decorative helper banners and repeated explanatory copy above the actual inputs, filters, tables, or action buttons. Do not remove validation messages, warning/error banners, empty states, field labels, field descriptions that clarify an input, or any user action.
- The first operational panel should show only the functional title and controls needed to work. Do not show repeated eyebrows such as `Areas`, `Access`, or `2PQ` there unless they are part of a table, filter, record value, or other non-header data.
- Back navigation is part of header uncluttering. Every visible action whose label starts with `Back to`, `Volver a`, `Volver al`, or equivalent must include a leading lucide `ArrowLeft` icon inside the clickable button/link. Do not use bare text or unicode arrows for back actions, and do not change the label or destination while adding the icon.
- Sidebar uncluttering follows the same standard: the expanded sidebar should contain product identity, navigation groups, navigation labels, and functional controls only. Do not add explanatory descriptions, version chips, role-scope paragraphs, or repeated marketing/context copy to the sidebar.
- In collapsed icon mode, no sidebar text may remain visible. Custom sidebar header/footer content must be hidden or icon-only under `group-data-[collapsible=icon]`; menu labels should rely on tooltips instead of visible text.
- In detail screens, apply the same rule to internal sections. The section title that names the actual content stays visible, for example `Médicos asociados a esta institución`; surrounding eyebrows such as `Médicos de institución`, generic subtitles such as `Parent entity`, and explanatory paragraphs that only restate permissions or why the block exists are clutter and should be removed.
- Apply this below the first fold too. Nested relationship blocks, dashboard cards, list/action blocks, access panels, and field-group sections are cluttered when they repeat the pattern `small category label` + `real title` + `generic explanatory paragraph`; keep the real title and controls, remove the category label and paragraph unless the text is live data, a warning, an error, or a necessary field-level instruction.
- Preserve text that carries live data, an empty/error/warning state, a destructive-action consequence, a field label, or a concrete record descriptor. Header uncluttering is not a reason to remove operational state or make a relationship ambiguous.
- Header uncluttering must not change the data loaded, form fields, validation, mutations, permissions, navigation targets, pagination, or CRUD behavior.

## 2PQ Observaciones Fields

- `Observaciones` fields must never be required or block a form step, preview, draft checkpoint, or submission.
- When a 2PQ `Observaciones` value is blank, normalize it to the exact text `Sin observaciones` before preview, draft persistence, final submission, and SDK storage.
- Keep user-entered observations by trimming surrounding whitespace only. Do not replace non-empty observations.

## 2PQ Case Service Transactions

- Every newly created `2pq_case`, regardless of whether it originates in the backoffice case form or the 2PQ form workflow, must create exactly one service transaction before File Storage and report-code auto-sync begins.
- The canonical offer is the `service_offers` document `rhTE3dfB8Ovhf86lY3Z5`. Its identity must remain `serviceId: pgs_2pq_74399`, `providerKind: organization`, and `providerId: kfFtJlLuyW6deXW2Im3S`. Read the current offer version and frozen contract from that live document; do not hardcode a service version or reconstruct its snapshots.
- The generated transaction uses a deterministic `pgr_2pq_<normalized_case_id>` request ID and deterministic idempotency key so retries resolve to the same transaction.
- A 2PQ-generated service transaction must never set `requestedByUserId`. Set only `requestedByUserEmail`, using the normalized `authEmail` of the doctor assigned to the case, and index the request in `deferred_service_transactions` under that email.
- This trusted system workflow is not subject to consumer token cooldown, daily limits, total limits, or the ordinary five-item deferred cap. Those limits must continue to apply to regular manually created service transactions.
- The selected doctor must have a valid email. If the mandatory service transaction cannot be created, case creation must fail and the just-created case and batch linkage must be rolled back instead of leaving a case without its service transaction.
- When a case is in canonical `report_ready` status and has a valid HTTPS `download_url`, finalize the service output after sampling synchronization and after the case File Storage/report-code synchronization. This invariant applies to manual saves, next-status actions, and Open API report notifications.
- Resolve the existing `<THREE_LETTER_CODE>XXX` report code and require its owner to be the canonical 2PQ publisher. The service provider's authoritative object owner must match that report owner before any output can be delivered.
- Create or reuse the deterministic File Storage document `pgo_2pq_<normalized_case_id>_pdf_report` with `file_type: pgo_pdf_report` and exact content `{ title, download_url }`. A retry may reuse it only when the canonical name, creator, type, and content are unchanged.
- Use the frozen offer's single PDF output role, create the canonical `uploaded_objects` / `object_codes` records through the dedicated service-output command, and link the File Storage file, object, provider owner, and service transaction atomically. Never write a camel-case alias into `file_storage`, `uploaded_objects`, or `object_codes`.
- Keep `requestedByUserId` absent and require `requestedByUserEmail` to remain the normalized assigned-doctor email. Advance the service transaction through valid statuses to `running`, attach the PDF object, then mark it `delivered`. Replays must validate and reuse the same file/object/transaction rather than create duplicates.

## 2PQ File Storage Snapshot Contract

- A 2PQ File Storage JSON snapshot is scoped to one current case. `entities.cases` must contain exactly that case and must never include sibling cases from its sequencing batch.
- `entities.batches` must contain either zero items when the case has no resolvable parent batch or exactly one compact snapshot of the directly linked batch. It must never contain more than one batch.
- The compact batch snapshot contains only scalar identity, scope, status, execution, and update fields. Do not include child case IDs, nested case records, relationship arrays, arbitrary maps, or other expandable batch-tree data.
- Building a case snapshot must not query or load the parent batch's `children_cases`, `linkedCaseIds`, or cases selected by `parent_batch`. Fetch the current case, its directly referenced batch, and samplings belonging to the current case only.
- `main_case.sibling_case_ids` is retained for format compatibility but must always be an empty array. The snapshot must not query or expose sibling case IDs; the parent batch ID and the current case's sampling IDs remain valid direct references.
- `main_case.download_url` and the root `download_url` on the sole `entities.cases[0]` item must always be emitted from the current case's canonical `download_url`, using `null` when it is absent.
- Every emitted 2PQ `scope` must include `institutionName`, `doctorName`, and `patientName` next to the corresponding IDs. Resolve those names through direct document reads using the current case's `institutionId`, `doctorId`, and optional `patientId`; do not infer names from batch or sampling text.
- Enforce the bounds in the authoritative `.pgi3.json` schema: `batches` has `maxItems: 1`, while `cases` has `minItems: 1` and `maxItems: 1`.

## 2PQ Case Status Progress

- Advancing a 2PQ case status is one ordered backend operation: update the case, update its sampling children sequentially, update File Storage when applicable, then update the report code when applicable.
- The `Next status` action must open a blocking progress modal and display persisted backend progress for all four stages. Do not simulate stage completion with timers.
- File Storage and report-code stages must be marked `skipped` / `Not applicable` when automatic synchronization is disabled or the case lacks the required code; they must not remain pending.
- Keep the modal open after success or failure. Never call `router.refresh()` automatically when the mutation resolves; only the modal's final `Finish` action may close the process and refresh the detail screen.
- A failure must mark the currently running stage as failed, preserve completed stages, expose the request error log, and still let the operator finish and refresh so partial backend state is represented honestly.

## Backoffice Firestore Pagination

- Any backoffice surface that reads potentially unbounded Firestore data must paginate instead of loading full collections.
- Default to 20 rows per page with a visible "Load more" / "Cargar más" control unless the product asks for a different size.
- Prefer cursor-based Server Action pagination. For merged activity feeds, bound each Firestore source with a small `limit(...)`, merge those bounded results, and return a cursor for the next page.
- Avoid fan-out reads across every client/thread when a scoped indexed query or collection-group query can fetch the same page.

## Community Account Deletion

- `user_roles` persists the server-managed community identity link as `communityUserId`, `communityUserOriginalEmail`, and `communityUserOriginalUsername`. Clients must not author or edit these fields.
- Completing any primary profile setup must create or update both `report_owners/{uid}` and `object_owners/{uid}`, and link the role to the newly created or updated `community_users` record in the same operation. Both owner collections use their canonical snake_case identity fields. Preserve `communityUserOriginalEmail` once established so later email changes cannot erase the recovery key.
- Deleting a user account or running full role cleanup removes only the matching `community_users` identity document. Resolve it in this order: persisted `communityUserId`, role `firebaseUid`, resolved Firebase Auth UID, `communityUserOriginalEmail`, current role email, then `communityUserOriginalUsername`. Stop after the first unique match; never gather authored content.
- Changing an account email must synchronize Firebase Auth, the email-keyed role, private/public profiles, the linked community account, report/object owner identities, and directly linked patient, doctor, professional, or 2PQ client account records. Firestore identity updates and the role move belong in one batch, and a failed batch must roll Firebase Auth back.
- Email synchronization is identity maintenance only. It must not query or rewrite publications, posts, comments, notes, events, reports, objects, files, service offers, or service transactions.
- Never delete community posts, comments, replies, or nested event records as a consequence of account deletion. Authored community content intentionally remains orphaned because clients preserve and render that conversation history.
- Community account deletion must not query `community_posts`, `community_comments`, collection-group `comments`, or the `community_users/{uid}/events` subcollection.
- Apply the same non-cascading rule to every account or owner identity. Deleting `report_owners`, `object_owners`, or `feed_individuals` records must not delete or query their report codes, uploaded reports, object codes, uploaded objects, stored files, Discover publications, notes, events, service offers, or service transactions.
- Full role cleanup has no stored-file deletion stage. Linked artifacts remain intentionally orphaned and clients are responsible for rendering missing-owner state.

## Discover Field Naming

- Discover publisher and feed item document/API keys must be camelCase only for `feed_organizations`, `feed_individuals`, and `feed_items`.
- Do not add, read, write, or preserve snake_case field keys in those collections. For example, use `descriptionEn`, `colorHex`, `isRequestedThroughWebWizard`, `approvalRequestDate`, `htmlBody`, `imageUrl`, `sourceUrl`, and `sourceButtonText`.
- When a user describes a new Discover field in snake_case, treat that spelling as conversational shorthand and implement the actual key in camelCase.
- Snake_case identifier values remain valid and must not be renamed. This includes status/type/category identifiers such as `pending_approval`, `research_update`, `raw_vcf`, and `pro_medical_geneticists`.
- Collection names and public route slugs such as `feed_organizations`, `feed_individuals`, `feed_items`, and `/discover/feed-entries` are not field keys; do not rename them as part of field naming cleanup.
- Discover feed item shared content belongs only at the `feed_items` root: `title`, `subtitle`, `body`, `htmlBody`, `imageUrl`, `sourceUrl`, and `sourceButtonText`. Never duplicate, read, write, preserve, or backfill these values inside typed payload nodes such as `news`, `researchUpdate`, `upcomingEvent`, or any other Discover feed type.
- Typed Discover payload nodes must contain only type-specific fields. Do not add compatibility aliases such as `summary`, `detailBody`, nested `title`, nested `body`, nested `htmlBody`, nested `imageUrl`, `startsAt`, `journalName`, or `locationName`; normalize old records away from those aliases instead of propagating them. `topic` is valid only as the canonical field for `educationalExplainer`, never as a compatibility alias for `researchTopic`.

## Persistent Field-Key Naming

- Field naming is a per-collection contract. Prefer coherence inside a collection over applying one global case convention to every Firestore document.
- Use this canonical table for document fields and every nested map stored under the listed collection:

| Collection | Field-key convention | Canonical examples |
| --- | --- | --- |
| `service_offers` | lower camel case | `serviceId`, `isHiddenFromSearch`, `isHighlightedOffer`, `isProfessionalOffer`, `promotionalBannerImageUrl`, `promotionalBannerImageUploadDataUrl`, `changeLogHistoryByVersion`, `changeLogFormShapeByVersion`, `outputSlots` |
| `service_transactions` | lower camel case | `outputObjects`, `outputReports`, `objectType`, `objectCode`, `reportCode` |
| `deferred_service_transactions` | snake case | `email`, `deferred_transaction_ids` |
| `uploaded_objects` | snake case | `object_type`, `object_code`, `object_owner_id`, `upload_version_count` |
| `uploaded_reports` | snake case | `report_code`, `report_owner_id`, `upload_version_count` |
| `file_storage` | snake case | `file_name`, `linked_object_code`, `linked_report_code` |
| `object_owners` | snake case | `owner_name`, `owner_contact_email` |
| `report_owners` | snake case | `owner_name`, `owner_contact_email` |
| `object_codes` | snake case | `uploaded_object_id`, `owner_id` |
| `report_codes` | snake case | `uploaded_report_id`, `owner_id` |

- The same semantic value intentionally uses different spellings at different collection boundaries. For example, a `service_transactions.outputObjects[]` item uses `objectType` and `objectCode`, while the corresponding `uploaded_objects` document uses `object_type` and `object_code`.
- `service_transactions.requestedByUserId` is optional only when a normalized `requestedByUserEmail` is present. Email-only transactions must be indexed by deterministic normalized-email document ID in `deferred_service_transactions`, whose payload contains only `email` and unique `deferred_transaction_ids`.
- `service_offers.changeLogHistoryByVersion` and `service_offers.changeLogFormShapeByVersion` are the declared nested-map key exceptions. The field names and each entry's `en` / `es` fields remain lower camel case, but their server-generated transition keys use the exact snake-case pattern `v<from>_to_v<to>` such as `v1_to_v2`, where `to` is exactly `from + 1`. These are immutable version-transition identifiers, not compatibility aliases or client-authored field names.
- The backend must append exactly one bilingual `{ en, es }` change-log entry for every successful existing-offer save, including saves that only change status or no editable contract field. Clients must never submit, replace, or remove `changeLogHistoryByVersion`.
- The backend must append one bilingual `{ en, es }` entry to `changeLogFormShapeByVersion` only when the normalized request form changes. Form-shape versions start at `1`, increase by exactly one per form change regardless of offer publication state, and remain unchanged for offer-only saves. Clients never control the form-shape version or its history.
- Change-log entries must describe only the fields that changed and the automatic version increment. Do not persist contractual-continuity explanations in `changeLogHistoryByVersion` or `changeLogFormShapeByVersion`; continuity remains a separate update invariant and acknowledgement.
- Updating a service offer requires explicit acknowledgement that transactions already created remain bound to their frozen offer version. The new offer version applies only to transactions created after the update.
- Naming fixes are strict contract migrations within the affected collection. Do not add dual reads, fallback aliases, migration flags, or writes containing both spellings. Producers and consumers must move together, and the wrong convention for that collection must be rejected.
- Collection names are identifiers rather than field keys and retain their canonical spelling.
- Enum values, role values, IDs, and catalog identifiers are values rather than keys. Values such as `pgo_pdf_report`, `test_planning`, and `pgr_*` stay unchanged.
- Versioned PGO JSON files are a separate serialization boundary. Their schemas may independently require snake-case payload keys such as `object_type`; decode those only through the PGO file-model/schema layer.
- Keep collection-specific Firestore map construction separate from PGO file encoding and from service-transaction snapshots. A key mapping at one boundary does not determine the spelling at another boundary.
- Centralize repeated canonical field names in contract constants where practical. Avoid freehand string literals for a shared persisted key.
- A persisted-key change is incomplete until all writers, readers, schemas, validators, docs, fixtures, and negative tests have been updated in the same change.
- Before accepting persistence work, search the affected code and Firestore schemas for both camel-case and snake-case variants. Every occurrence must match the table for the collection where it is persisted, be a declared serialized-file key, be a value, or be a negative test proving rejection.

## Auth Surface Isolation

- There are two independent authentication circuits. They must coexist, but they must not share Firebase client apps, server cookies, login pages, redirects, or route handlers unless the user explicitly asks for a cross-surface auth migration.
- Always describe `/login` as the primary PocketGenes / Pocket Gyms backoffice login flow for the platform and core backoffice functionality.
- Primary `/login` is the PocketGenes / Pocket Gyms authentication surface:
  - Browser page: `backoffice/src/app/(auth)/login/page.tsx`.
  - Firebase Web SDK app: `backoffice/src/lib/firebase.ts`.
  - Backoffice proxy route: `/api/sdk/auth/login`.
  - SDK route: `goldencrow-sdk/src/routes/auth.routes.ts` `/auth/login`.
  - Browser session handoff: `backoffice/src/lib/auth.ts` NextAuth credentials flow.
  - Cookie: `session`.
- Primary first-time signup completion uses `/complete-profile` after a whitelisted email account is created. Keep that flow short: show full name, username, and one optional professional-details step containing profession, company, contact, and bio text fields. Do not show icon, color, gender, condition/disease steps, or generic explanatory helper banners such as `What happens when you finish` there. Default skipped profile fields to `person.crop.circle.fill`, `#5A4FCF`, blank gender, and no condition, and make the progress dots count only the visible steps.
- GC Fitness authentication is the trainer surface and must stay isolated under `/gc-fitness/login` and `/api/gc-fitness/login`:
  - Firebase Web SDK app: named `gc-fitness` app in `backoffice/src/lib/firebase/gc-fitness-client.ts`.
  - Server auth/session library: `next-firebase-auth-edge`.
  - Cookie: `GcFitnessAuthToken`.
- The primary Firebase Web SDK initializer at `backoffice/src/lib/firebase.ts` must only use the `[DEFAULT]` Firebase app. Never replace it with `getApps()[0]`, because a named GC Fitness app can be initialized first in the same browser session and break `/login` by minting tokens for the wrong Firebase project.
- Do not add GC Fitness project cards, redirects, imports, cookie handling, `GcFitnessAuthToken`, `next-firebase-auth-edge`, or `/gc-fitness/*` branching to `backoffice/src/app/(auth)/login/page.tsx`, `backoffice/src/lib/auth.ts`, `backoffice/src/app/api/sdk/[...sdkPath]/route.ts`, or the SDK `/auth/login` path.
- Do not make `/api/sdk/[...sdkPath]` aware of GC Fitness auth. It is the primary SDK proxy and must keep forwarding core platform SDK requests to `golden-crow-sdk`; `/api/gc-fitness/*` is the only GC Fitness API auth surface.
- Do not make `backoffice/src/proxy.ts` treat `/login`, `/api/auth/*`, or `/api/sdk/*` as GC Fitness routes. GC Fitness path handling belongs only to `/gc-fitness/*` and `/api/gc-fitness/*`.
- Any change under `/gc-fitness/*` must preserve `/login` behavior. Before pushing such a change, verify that `/login` still renders the primary sign-in page and that `backoffice/src/app/(auth)/login/page.tsx` contains no `gc-fitness`, `/gc-fitness`, `GcFitnessAuthToken`, or `next-firebase-auth-edge` references.

## SDK Auth Startup Isolation

- The SDK must be able to boot `/health` and `/auth/login` using only the primary MyDNAMap credentials required for the PocketGenes / Pocket Gyms auth surface. Missing Pocket Gyms or GC Fitness project credentials must never crash the whole SDK at module import time.
- `goldencrow-sdk/src/config/firebase.ts` owns the Firebase Admin named-app registry. Keep `adminAppFor(project)` explicit by project key, and keep `adminAuthFor`, `adminDbFor`, and `adminStorageFor` lazy so importing route/repository modules does not initialize unrelated Firebase projects.
- Do not add top-level Firebase Admin app initialization, top-level service-account validation, or top-level Firestore/Auth/Storage calls for optional projects in SDK modules imported by `registerRoutes`. Validate project-specific env only when that project is actually used.
- `goldencrow-sdk/src/config/env.ts` must not call `requireEnv(...)` for Firebase Admin credentials at module load. Project-specific Firebase env validation belongs in `goldencrow-sdk/src/config/firebase.ts` through the named-app accessor for that project.
- Route modules may keep module-scope handles returned by `adminAuthFor(...)` or `adminDbFor(...)` only because those handles are lazy. If that laziness is removed, those route modules must be changed first or `/auth/login` can be broken by unrelated project env.
- A production response with `x-vercel-error: FUNCTION_INVOCATION_FAILED` from `https://golden-crow-sdk.vercel.app/health` or `/api/sdk/auth/login` means the SDK function crashed before returning an application response. Treat that as an SDK boot/startup regression, not as a bad login credential.

## Auth Verification Before Push

- For any auth-related change, run `git diff --check`.
- If SDK files under `goldencrow-sdk/src/config`, `goldencrow-sdk/src/routes`, `goldencrow-sdk/src/repositories`, or `goldencrow-sdk/src/middleware` changed, run `npm run build` in `goldencrow-sdk`.
- If SDK startup or Firebase Admin initialization changed, verify the SDK can boot and `/health` returns a JSON response instead of throwing. A disconnected local Firebase check may return JSON `503`; that is acceptable. A thrown process error is not.
- Before pushing `/gc-fitness/*` auth changes, verify the primary login page source stays isolated with: `rg -n "gc-fitness|/gc-fitness|GcFitnessAuthToken|next-firebase-auth-edge" 'backoffice/src/app/(auth)/login/page.tsx' backoffice/src/lib/auth.ts 'backoffice/src/app/api/sdk/[...sdkPath]/route.ts' goldencrow-sdk/src/routes/auth.routes.ts`. There should be no matches unless the user explicitly requested a cross-surface migration.
- Before pushing primary `/login` auth changes, verify GC Fitness still owns only its own routes and cookie: `/gc-fitness/login`, `/api/gc-fitness/login`, and `GcFitnessAuthToken`.
- After deployment of an auth fix, verify production behavior with:
  - `curl -i https://golden-crow-sdk.vercel.app/health` should return JSON, normally `200 {"status":"ok","firebase":"connected"}` in production.
  - `curl -i -X POST https://golden-crow-backoffice.vercel.app/api/sdk/auth/login -H 'content-type: application/json' --data '{"idToken":"fake"}'` should return JSON `401 {"error":"Invalid ID token"}`, not Vercel `FUNCTION_INVOCATION_FAILED`.

## Test gate before push — ALL suites green (MANDATORY)

- You MAY commit work-in-progress without running tests between commits, but
  **before `git push` and before treating a task/PR as done, the full test
  suite must be GREEN.** `main` auto-deploys on push, so a red push ships
  broken code to production.
- Backoffice: run `npx jest` (cwd `backoffice/`) — must be fully green.
- GC Fitness changes are cross-repo: `firestore.rules` and the `civil-date` /
  habit-compliance algorithm twins are shared with the iOS app
  (`../gc-fitness`). When a change could affect those, also run the iOS gates
  in `../gc-fitness` per its `CLAUDE.md` "Test gate before push" section
  (`swift test` in `Packages/GCFitnessCore`, the GCFitness simulator build, and
  the Firestore-rules emulator suite). If in doubt, run all four suites.
- A pre-existing red suite must be called out explicitly and must not mask a
  regression your change introduced.
