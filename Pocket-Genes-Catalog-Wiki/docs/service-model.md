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
| `deferred_service_transactions` | Email-to-transaction-ID index for requesters without an account | snake_case |

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

## Closed service-offer type registry

This registry is the complete and exclusive taxonomy for service offers. It contains exactly 30 values and is intentionally closed: adding a category requires a coordinated contract change to the canonical catalog, schema, validator, documentation, native provider and tests.

Este registro es la taxonomía completa y exclusiva de las ofertas de servicios. Contiene exactamente 30 valores y es cerrado de manera intencional: agregar una categoría requiere un cambio coordinado del catálogo canónico, el esquema, el validador, la documentación, el proveedor nativo y las pruebas.

### Persistence and selection rules / Reglas de persistencia y selección

- **Persist the key only / Persistir únicamente la clave.** The field is the lower-camel-case `service_offers.serviceCategory`, and its value is one exact, case-sensitive `sot_*` key from the table. Never write `service_category`, a translated label, a description or an SF Symbol. / El campo es `service_offers.serviceCategory` en lower camel case y su valor es una clave `sot_*` exacta y sensible a mayúsculas de la tabla. Nunca se guarda `service_category`, una etiqueta traducida, una descripción ni un SF Symbol.
- **Exactly one category per offer / Exactamente una categoría por oferta.** Select the category that describes the offer's primary contracted and billable outcome. Inputs, supporting steps and the provider's profession do not determine the category. / Se selecciona la categoría que describe el resultado principal contratado y facturable. Los insumos, pasos auxiliares y la profesión del proveedor no determinan la categoría.
- **Split independently marketed outcomes / Separar resultados comercializados por separado.** If two outcomes can be requested or fulfilled independently, publish separate offers. If several steps are inseparable parts of one package, use the category of the final primary outcome and describe the included supporting work in the offer. / Si dos resultados pueden solicitarse o cumplirse de manera independiente, se publican ofertas separadas. Si varios pasos son partes inseparables de un paquete, se usa la categoría del resultado final principal y se describe el trabajo auxiliar incluido en la oferta.
- **No aliases or inferred values / Sin alias ni valores inferidos.** Writers and backoffice validation accept only registered keys. Labels are localized at display time from the registry, and the SF Symbol is presentation metadata for the picker. / Los escritores y la validación de backoffice aceptan únicamente claves registradas. Las etiquetas se localizan al mostrarse desde el registro y el SF Symbol es metadato de presentación para el selector.
- **Historical fallback is display-only / El fallback histórico es solo visual.** Native readers tolerate a missing, null, empty or unrecognized historical value and display **Uncategorized / Sin categoría**. That fallback is not a 31st category, is never persisted, and does not match a category filter; editing the offer requires selecting a valid key. / Los lectores nativos toleran un valor histórico ausente, nulo, vacío o desconocido y muestran **Uncategorized / Sin categoría**. Ese fallback no es una categoría número 31, nunca se persiste y no coincide con un filtro de categoría; para editar la oferta se debe elegir una clave válida.

### Lifecycle routing guide / Guía por etapa del ciclo

| Area / Área | Keys / Claves | Selection boundary / Criterio de selección |
| --- | --- | --- |
| Clinical preparation / Preparación clínica | 1–5 | Counseling, phenotype intake, consent, test choice or issuance of the order; stop at the exact action sold. / Asesoramiento, admisión fenotípica, consentimiento, selección del estudio o emisión de la orden; se elige la acción exacta vendida. |
| Specimen and laboratory / Muestra y laboratorio | 6–12 | Collection, transport, accession/quality, DNA extraction, sequencing, targeted genotyping or chromosome-level analysis. / Toma, transporte, recepción/calidad, extracción de ADN, secuenciación, genotipado dirigido o análisis cromosómico. |
| Specialized screening / Cribados especializados | 13–14 | Use only for prenatal screening or reproductive carrier screening; these are purpose-defined screenings, not generic sequencing or final clinical interpretation. / Se usa solo para cribado prenatal o de portadores reproductivos; son cribados definidos por propósito, no secuenciación genérica ni interpretación clínica final. |
| Bioinformatics pipeline / Flujo bioinformático | 15–20 | Quality control, alignment, small-variant calling, structural/CNV analysis, annotation or prioritization; each key names one computational boundary. / Control de calidad, alineamiento, detección de variantes pequeñas, análisis estructural/CNV, anotación o priorización; cada clave representa un límite computacional. |
| Interpretation by purpose / Interpretación por propósito | 21–27 | General clinical interpretation or a purpose-specific analysis for rare disease, hereditary cancer, pharmacogenomics, nutrigenomics/metabolism, ancestry or polygenic risk. / Interpretación clínica general o análisis específico de enfermedad rara, cáncer hereditario, farmacogenómica, nutrigenómica/metabolismo, ascendencia o riesgo poligénico. |
| Reporting and exchange / Informes e intercambio | 28–30 | Create a report, independently review a completed report, or convert/validate files without biological interpretation. / Crear un informe, revisar de forma independiente un informe terminado o convertir/validar archivos sin interpretación biológica. |

### Exact 30-value registry / Registro exacto de 30 valores

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

## Offer and transaction naming

| Boundary | Convention | Examples |
| --- | --- | --- |
| `service_offers` | lower_camel_case | `serviceId`, `isHiddenFromSearch`, `isHighlightedOffer`, `isProfessionalOffer`, `promotionalBannerImageUrl`, `promotionalBannerImageUploadDataUrl`, `inputSlots`, `outputSlots`, `objectType` |
| `service_transactions` | lower_camel_case | `requestedByUserId`, `requestedByUserEmail`, `outputObjects`, `outputReports`, `objectType`, `objectCode`, `reportCode` |
| `deferred_service_transactions` | snake_case | `email`, `deferred_transaction_ids` |
| `uploaded_objects` | snake_case | `object_type`, `object_code`, `object_owner_id`, `upload_version_count`, `submitted_by_email` |
| `uploaded_reports` | snake_case | `report_code`, `report_owner_id`, `upload_version_count` |
| `file_storage` | snake_case | `file_name`, `linked_object_code`, `linked_report_code`, `submitted_by_email` |
| `object_owners` | snake_case | `owner_name`, `owner_contact_email` |
| `report_owners` | snake_case | `owner_name`, `owner_contact_email` |
| `object_codes` | snake_case | `uploaded_object_id`, `owner_id` |
| `report_codes` | snake_case | `uploaded_report_id`, `owner_id` |

Serialized PGO keys remain snake_case. Explicit adapters convert them when embedding snapshots in camelCase service transactions. Wrong-case aliases are rejected.

## Validation and acceptance

The executable validator checks all twenty schemas, examples, notes variants, unknown-field rejection, exact PDF minimum, standalone symptoms/genes/specimens, Other behavior, direct component URLs, strict forms, service copies, provider examples, naming boundaries, deferred transaction indexing, native PGI mappings, generator idempotence, and the usage policy.

Global object validity is distinct from service suitability. A provider may ask for clarification or reject an input that does not satisfy its published service, but it cannot make provider-specific prerequisites universally required PGO fields.
