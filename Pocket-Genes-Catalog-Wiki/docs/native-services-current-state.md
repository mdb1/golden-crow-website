# Native Services Current State

## Service architecture

### Offers

A service offer is an untimed, provider-owned published template. It selects a real Discover organization or professional individual, may declare zero or more input slots and zero or more output slots independently, and declares integer contract versions, work description, optional commercial terms, and at least one stage. An offer may therefore have no inputs, no outputs, or neither. Offers start as draft and become selectable only through publish/active state. `isHiddenFromSearch` removes an offer from discovery without hiding transactions already created from it.

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

Status progression is controlled by provider/backoffice work. Native users cannot force progress. `delivered` is the successful final state and requires every contractually promised output PGO snapshot in `outputObjects`. A contract with zero output slots may be marked delivered with an empty `outputObjects` array after the provider finishes its work. Optional `outputReports` do not satisfy a PGO output slot.

### Ownership and delivery

The creator/administrator of an object is its seeder and may manage its stored source. `is_clinician` grants access to both report and object administration; it does not itself confer ownership. Pocket Genes transports and presents authorized files but does not warrant their clinical content.

Service offers are the primary way a regular user requests new objects. Backoffice/provider tooling performs fulfillment, registers output objects, and marks delivery. Each promised output is attached from exactly one source: an absolute HTTPS URL whose response is strict PGO content JSON, or an existing `file_storage` document ID whose snake-case `file_type` and `file_content` match the promised PGO type. The backend derives the file name, atomically claims a stored-file link when applicable, creates the ready `uploaded_objects` record and nine-digit code, and appends only `role`, `objectType`, and `objectCode` to the camel-case transaction snapshot. The requester keeps the transaction while work is pending, then downloads, opens, and updates delivered objects through the normal nine-digit object-code circuit.

Physical specimen identity, custody and consumption safeguards remain operational controls outside PGO content. A transport transaction moves an existing specimen; it does not create duplicate biological material.

## Request limits

The usage policy is unchanged by the PGO redesign. Stable configuration is `20` total transactions, `5` per UTC day, and a `300`-second cooldown unless policy configuration changes.

Usage state is functional and recomputed from root `service_transactions` using `requestedByUserId` and `requestedAt`. Never persist today's count, remaining tokens, last transaction time, cooldown start/end, next request time, or pending admissions. UTC buckets split at 00:00 UTC; the UI displays the reset in device-local time. When daily reset and cooldown both apply, the later deadline wins.

Admission runs before form-object persistence and provider dispatch. A denied attempt creates no transaction, file, uploaded object, code, owner normalization, counter, or cooldown record. `catalog/usage-policy.json` remains the executable source and is intentionally untouched by this migration.

The available-services list reads only active, non-hidden Firebase offers. Mock services exist only in Simulator. A request form is produced from the selected real offer. Confirmation, validation/loading, congrats, transaction detail, process tracking, provider contact, contract document, input downloads and delivered results are separate native states.

The strict content migration changes object payloads only. It does not relax authentication, publisher resolution, ownership, role binding, delivery consistency, provider email lookup, or transaction visibility.
