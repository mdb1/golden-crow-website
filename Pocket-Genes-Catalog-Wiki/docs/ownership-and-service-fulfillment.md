# Ownership and Service Fulfillment

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

Service offers are the primary way a regular user requests new objects. Backoffice/provider tooling performs fulfillment, registers output objects, and marks delivery. The requester keeps the transaction while work is pending, then downloads, opens, and updates delivered objects through the normal nine-digit object-code circuit.

Physical specimen identity, custody and consumption safeguards remain operational controls outside PGO content. A transport transaction moves an existing specimen; it does not create duplicate biological material.

## Strict first schema

This is the first PGO content schema and it has not shipped to production. There is no legacy compatibility reader, alias, fallback, dual decoder, or runtime migration utility. Writers emit only the strict allowlists; readers reject envelopes, removed keys and unknown properties immediately.

Repository fixtures and generators were replaced at their source instead of converted at runtime. Existing platform records may still surround strict content for identity, ownership and transaction tests, but that wrapper is not accepted as a PGO file. No discarded field is copied into `notes`, and no old local payload path is rewritten into a fabricated URL.

The repository fixtures are synthetic schema examples using the IANA-reserved `example.com` domain. They are not production objects and are never represented as live downloads.

## Responsibility

The object/report administrator warrants that they are authorized to seed and share the file. Downloaders must protect access codes. Providers remain responsible for their contracted work. Pocket Genes provides distribution, access and exploration infrastructure and is not the author of third-party clinical content.

## Collections

Report and object owner records remain separate. Objects use nine-digit numeric codes, `object_codes`, `uploaded_objects`, and `object_owners`; reports use six-character alphanumeric codes and their parallel collections. Stored files are agnostic and may back either domain. No PGO content duplicates owner or access facts.
