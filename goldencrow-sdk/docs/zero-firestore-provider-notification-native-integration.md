# Zero-Firestore provider email: native integration

This document is the implementation contract for migrating native Pocket Genes
clients from the legacy provider-notification command to the new client-trusted,
best-effort provider email.

This command requires the shared long-lived notification Bearer token. Before
implementing either native transport, follow the complete
[service-notification device authentication guide](./service-notification-device-auth-native-integration.md).

The new command deliberately trusts values that the native app already has in
memory when it creates a service transaction. It sends a fixed Spanish email
without loading the transaction, offer, provider, deferred index, or delivery
receipt from Firestore.

## Required result

For every service transaction whose Firestore commit succeeds, the current
native release must make **one** best-effort call to:

```text
POST /service-transactions/notify-provider
```

It must no longer call this legacy route for that same transaction:

```text
POST /service-transactions/:transactionId/notify-owner
```

Calling both routes would send two provider/operations emails. The SDK retains
the legacy route only so already-released apps continue to work until users
upgrade; retaining the server route is not permission for a new client to call
both.

The new notification must never:

- run before Firestore confirms the service-transaction commit;
- turn an email problem into a failed service transaction;
- retry automatically after a timeout, connection error, HTTP `502`, or other
  ambiguous result (the only allowed retry is one refresh-and-retry after an
  authentication `401`, before Gmail can run);
- perform a new Firestore lookup for the transaction, offer, provider, or
  requester;
- persist a notification receipt or idempotency record;
- fall back to `federico@goldencrowvs.com` or to the legacy endpoint; or
- include a transaction ID, transaction-detail link, custom subject, custom
  HTML, or client-selected URL.

## Exact SDK contract

Production request:

```http
POST https://golden-crow-sdk.vercel.app/service-transactions/notify-provider
Content-Type: application/json
Authorization: Bearer <service-notification access token>
```

The JSON body is strict and contains exactly three fields:

```json
{
  "providerContactEmail": "provider@example.org",
  "requestedByUserEmail": "requester@example.com",
  "serviceName": "Secuenciación de exoma"
}
```

Validation rules:

- `providerContactEmail` is trimmed, lowercased, must be a valid email, and has
  a maximum length of 320 characters.
- `requestedByUserEmail` is trimmed, lowercased, must be a valid email, and has
  a maximum length of 320 characters.
- `serviceName` is trimmed, must be non-empty, and has a maximum length of 180
  characters.
- Extra fields are rejected. Do not send a transaction ID, provider name,
  subject, HTML, text, URL, locale, routing mode, or idempotency key.

The only successful response is HTTP `200`:

```json
{
  "status": "sent"
}
```

The native implementation must decode the body and require
`status == "sent"`. It must not carry over the legacy endpoint's acceptance of
HTTP `202`.

An invalid body returns HTTP `400`. A Gmail delivery failure returns HTTP
`502` with a generic body:

```json
{
  "error": "Provider notification email could not be sent."
}
```

Neither failure is retryable by the app. Because there is no receipt, a lost
HTTP response can occur after Gmail accepted the message, and retrying can send
a duplicate.

Missing, invalid, or expired notification authentication returns HTTP `401`;
insufficient scope returns HTTP `403`. A first `401` permits exactly one token
refresh and one retry because authentication fails before Gmail is called. No
other failure permits a retry.

The endpoint is outside the backoffice cookie/session surface so the signed-out
flow can call it, but it is not anonymous. It requires the signed Bearer token
with `service-transactions:notify`; a Firebase ID token, reporting token,
transaction capability ID, or transaction ID is not a substitute.

## What the SDK owns

The SDK always sends to the supplied `providerContactEmail`. This route does
not read or honor `SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER`; that
legacy routing boolean affects only the old `/notify-owner` circuit.

The SDK owns the complete Spanish subject, HTML, plain-text fallback, escaping,
layout, sender, and destination link. The app cannot replace any of them. The
email identifies the requested service and the requester's email and always
links to the general provider hub:

```text
https://golden-crow-backoffice.vercel.app/publisher-portal/service-transactions
```

It intentionally does not link to a transaction detail. Although the app knows
the transaction ID, that ID is unnecessary for this contract and must not be
sent.

## Reuse the provider data already read during authorization

Do not solve this migration by calling the native
`ServiceProviderContactResolver` after the commit. That resolver performs a
publisher-document lookup and would merely move the avoidable SDK read into the
client.

Both native implementations already perform a force-fresh provider
authorization before committing a request. That existing read has the complete
canonical publisher map, including the email used by the manual provider-mail
flow. Preserve the normalized contact email from that same authorization
result and carry it to the post-commit effect. This changes the value returned
by an existing read; it must not add another read.

On Android, "reuse" means replacing the current state-only result of the
force-fresh authorization with a richer result from that **same one lookup**.
It does not mean calling the current state resolver and then resolving the
publisher again for its email.

Use the same precedence as the current manual mail UI:

1. `social.email`
2. root `contactEmail`
3. root `email`

Normalize with the platform's existing `ServiceProviderEmailAddress` helper.
Do not choose a different field, derive an address from a provider name, or use
the requester email as the recipient.

If the already-read canonical publisher map has no valid provider email, skip
the notification and emit only a generic diagnostic. The committed transaction
must remain successful. Do not perform a fallback read, call the legacy route,
or redirect the message to Federico.

## iOS implementation instructions

Implement this in the sibling repository under `mydnamap-ios`.

### Authoritative existing files

- Legacy transport and privacy/logging reference:
  `mydnamap/Tabs/ServicesHub/ServiceTransactionOwnerNotifier.swift`
- Email normalization and manual recipient precedence:
  `mydnamap/Tabs/ServicesHub/ServiceProviderContactResolver.swift`
- Transient request model:
  `mydnamap/Tabs/ServicesHub/ServiceRequestModels.swift`
- Existing force-fresh publisher identity read:
  `mydnamap/Services/DeletedUserProvider.swift`
- Transaction creation and post-commit integration:
  `mydnamap/Tabs/ServicesHub/ServicesHubService.swift`
- Existing tests:
  `MyDnaMapTests/ServiceTransactionOwnerNotifierTests.swift`,
  `MyDnaMapTests/DeletedUserProviderTests.swift`, and
  `MyDnaMapTests/ServicesHubModelTests.swift`

### Step-by-step iOS change

1. Add a separate transport, for example
   `ServiceTransactionProviderNotifier.swift`. Define an injectable protocol
   such as `ServiceTransactionProviderNotifying` whose operation accepts only:

   ```swift
   providerContactEmail: String
   requestedByUserEmail: String
   serviceName: String
   completion: @escaping (Result<Void, Error>) -> Void
   ```

2. Model the strict encodable request body with exactly the three SDK field
   names. Normalize the provider email with
   `ServiceProviderEmailAddress.normalized(_:)`, normalize the requester with
   `TransactionEmailCollectProvider.normalizedEmail(_:)`, trim the service
   name, and enforce the 320/320/180 limits before constructing a request.

3. Mirror the proven mechanics in `ServiceTransactionOwnerNotifier`: use
   `ServiceTransactionOwnerNotifier.productionBaseURL`, `URLSession`, POST,
   `application/json`, and a 15-second timeout. The exact path is
   `/service-transactions/notify-provider`; there is no path parameter. Inject
   the shared token provider from the device-authentication guide and attach
   its value as `Authorization: Bearer <token>`.

4. Accept only HTTP `200`, decode `{ "status": "sent" }`, and reject every
   other status or success-body value. The first `401` may refresh the token
   and retry this request exactly once. Do not retry any other result.

5. Add an OSLog category dedicated to this command. Log only a fixed message
   such as `Provider notification failed.` Never log either email, the service
   name, JSON body, response body, transaction ID, URL-loading error
   description, or `localizedDescription`.

6. Extend `DeletedContentOwnerIdentity` in `DeletedUserProvider.swift` with an
   optional transient provider contact email. In its existing
   `init(reference:data:)`, derive it from the same `data` map with
   `ServiceProviderEmailAddress.registeredEmail(in:)`. Do not persist it in a
   service offer, service transaction, UserDefaults, or disk cache.

7. Change `ServicesHubService.authorizeFinalRequestIdentities(...)` so its
   successful result carries the provider email returned by the existing
   `requireActiveContentOwner(...)` force-fresh authorization. The method
   currently receives `.success(identity)` and discards the identity; retain
   `identity` and its normalized email instead. Do not invoke
   `ServiceProviderContactResolver.resolve(...)` here.

8. The form flow may authorize once before provisioning and again immediately
   before the transaction write. Use the result from the existing **final**
   authorization that already gates `commitRequestOffer`; do not introduce a
   third lookup. Pass that transient email into `writeRequestOffer` or its
   post-commit closure without adding it to `transactionData`.

9. Replace `ServicesHubService`'s automatic legacy notifier dependency with
   the new notifier. In `finishCommit`, after `error == nil`, dispatch exactly
   one new provider notification using:

   ```swift
   providerContactEmail: finalAuthorization.providerContactEmail
   requestedByUserEmail: requester.email
   serviceName: submission.offer.title
   ```

   Keep deferred local bookkeeping in its current order. The HTTP call remains
   fire-and-forget/best-effort and must not delay, roll back, or change
   `completion(.success(summary))`.

10. Delete the automatic call to
    `transactionOwnerNotifier.notifyOwner(transactionID:requestedByUserEmail:)`
    from the new client code path. Do not call both notifiers. The legacy Swift
    transport may remain in source temporarily for rollback/reference, but it
    must no longer be injected into or reached from transaction creation.

11. When either email is absent/invalid or the service name violates the
    bounds, log the same generic failure and finish successfully. Do not look
    anything up, fall back to a different recipient, or retry.

12. The signed-out Fast Transaction Maker already creates each root
    transaction through `ServicesHubService`. Therefore the same final
    provider-authorization result supplies the email per transaction. Do not
    add provider lookups to
    `FastTransactionMakerIOSAmazingRunner`, do not add the provider email to
    the final deferred-index write, and do not confuse this per-transaction
    provider email with the separate one-per-batch requester confirmation.

The required order is:

```text
existing final provider authorization read
  -> retain provider contact email in memory
    -> Firestore transaction commit succeeds
      -> one POST /service-transactions/notify-provider
        -> report transaction creation success independently
```

### iOS tests

Add focused tests for the new notifier and update the existing source/flow
contract tests. Cover at least:

- exact URL, method, content type, 15-second timeout, and exact JSON keys;
- normalization of both emails and trimming of `serviceName`;
- local rejection of invalid or over-320-character emails, blank service name,
  a name longer than 180 characters, and extra encoded fields;
- acceptance only of HTTP `200` plus body `status == "sent"`;
- the shared Bearer header, one refresh-and-retry after a first `401`, and no
  retry after transport, timeout, `400`, `403`, or `502` failure;
- extraction of the provider email from the already-read content-owner map
  with the existing manual-flow precedence;
- one new notifier invocation only after a successful Firestore commit;
- no invocation after a failed commit;
- provider-email absence leaves a successful committed request successful;
- Fast Transaction Maker requests use the same post-commit path without a new
  contact lookup;
- no reachable `/notify-owner` call remains in automatic creation; and
- logs contain no emails, service name, transaction ID, body, or network error
  description.

Run the complete iOS test target on an available simulator:

```bash
xcodebuild \
  -project mydnamap-ios/mydnamap.xcodeproj \
  -scheme mydnamap \
  -destination 'platform=iOS Simulator,id=<AVAILABLE_SIMULATOR_UDID>' \
  test
```

## Android implementation instructions

Implement this in the sibling repository under `mydnamap-android`.

### Authoritative existing files

- Legacy OkHttp/dispatcher reference:
  `app/src/main/java/com/genetics/app/services/data/ServiceTransactionOwnerNotifier.kt`
- Existing post-commit boundary:
  `app/src/main/java/com/genetics/app/services/data/ServiceRequestPostCommitEffects.kt`
- Existing provider-authorization read:
  `app/src/main/java/com/genetics/app/services/data/ServiceRequestIdentityAuthorizer.kt`
- State-only provider resolver currently used by that authorization:
  `app/src/main/java/com/genetics/app/services/data/ServiceProviderPresentationResolver.kt`
- Force-fresh canonical identity boundary:
  `app/src/main/java/com/genetics/app/data/repository/DeletedUserProvider.kt`
- Raw canonical publisher-map preservation:
  `app/src/main/java/com/genetics/app/common/DeletedIdentityModels.kt` and
  `app/src/main/java/com/genetics/app/data/repository/DeletedIdentityLookupServices.kt`
- Existing repository commit integration:
  `app/src/main/java/com/genetics/app/services/data/FirebaseServicesHubRepository.kt`
- Request model:
  `app/src/main/java/com/genetics/app/services/domain/model/ServiceRequests.kt`
- Provider-email normalization:
  `app/src/main/java/com/genetics/app/services/domain/model/ServiceIdentity.kt`
- Dependency injection:
  `app/src/main/java/com/genetics/app/di/ServicesModule.kt`
- Existing test patterns:
  `app/src/test/java/com/genetics/app/services/data/ServiceTransactionOwnerNotifierTest.kt`
  `app/src/test/java/com/genetics/app/services/data/ServiceRequestPostCommitEffectsTest.kt`,
  and `app/src/test/java/com/genetics/app/services/ServiceIdentityLogicTest.kt`

### Step-by-step Android change

1. Add a separate `ServiceTransactionProviderNotifier` and HTTP
   implementation. Its suspend operation accepts only
   `providerContactEmail`, `requestedByUserEmail`, and `serviceName`.

2. Reuse the existing OkHttp client, coroutine pattern, 15-second call timeout,
   and fixed production SDK base URL. POST a strict JSON body to
   `/service-transactions/notify-provider`. Validate and normalize with
   `ServiceProviderEmailAddress.normalized(...)` and
   `TransactionEmailCollectProvider.normalizedEmail(...)`, enforce the
   320/320/180 limits, and do not encode a transaction ID. Inject the shared
   application-scoped token provider and add
   `Authorization: Bearer <token>`.

3. Accept only HTTP `200` and decode `status == "sent"`. An HTTP `202` is no
   longer success. The first `401` may refresh the token and retry exactly
   once; no other result is retryable. Do not add a WorkManager job.

4. Replace the legacy best-effort dispatcher with a separate provider
   dispatcher that launches once in the existing application coroutine scope,
   swallows non-cancellation delivery errors, and logs a fixed generic message.
   It must not log arguments, request/response bodies, URLs, or throwable
   messages that can include PII.

5. Change `ServiceRequestIdentityAuthorizer.authorize(...)` to return a small
   transient authorization value containing `providerContactEmail` instead of
   returning `Unit`. Keep the existing requester/session validation order and
   the existing test-injectable provider lookup seam.

6. The production authorizer currently performs its provider check with this
   one call:

   ```kotlin
   providerResolver.state(provider, forceRefresh = true)
   ```

   `ServiceProviderPresentationResolver.state(...)` reaches the shared
   `DeletedUserProvider` authority but deliberately returns only
   `DeletedUserState`, so the already-loaded `canonicalData` is discarded at
   that boundary. **Replace that state-only provider lookup; do not call a
   second lookup after it.**

7. Add a request-authorization operation to the existing provider resolver (or
   an equivalently scoped helper used by the authorizer). Its entire provider
   resolution must consist of exactly one call to:

   ```kotlin
   deletedUserProvider.requireActiveContentOwner(
       reference = DeletedContentOwnerReference(
           id = provider.id,
           kind = if (provider.kind == ServiceProviderKind.organization) {
               DeletedContentOwnerKind.Organization
           } else {
               DeletedContentOwnerKind.Profile
           },
       ),
       action = DeletedContentOwnerMutationAction.RequestService,
   )
   ```

   This call already delegates to
   `contentOwnerAvailability(..., forceRefresh = true)`. In production that
   reaches `FirestoreDeletedContentOwnerLookupService`, which performs the one
   `Source.SERVER` publisher-document read. Do not call `state(...)`,
   `resolve(...)`, `contentOwnerAvailability(...)`, or a contact resolver in
   addition to `requireActiveContentOwner(...)`.

8. Use the returned `DeletedContentOwnerIdentity` directly. Its
   `canonicalData` is already an in-memory `data.toMap()` copy of the same raw
   Firestore document; no model enrichment or read is required. Normalize the
   recipient with:

   ```kotlin
   ServiceProviderEmailAddress.registeredEmail(
       identity.canonicalData,
       offer.provider.kind,
   )
   ```

   This preserves the manual mail flow's `social.email`, `contactEmail`, then
   `email` precedence. Map deleted/unavailable identity errors back to the
   current `ProviderDeleted` / `ProviderUnavailable` authorization errors so
   request behavior does not change. A valid active provider with no usable
   email may return a successful authorization with a null notification email;
   the missing best-effort email must not reject the service transaction.

9. Update `ServicesHubRepository.authorizeRequestIdentities(...)` to return the
   same transient authorization value. For a form request,
   `ServiceRequestExecutionCoordinator` already performs a pre-provisioning
   authorization; requests without a prepared form skip that particular gate.
   `FirebaseServicesHubRepository.requestOffer(...)` always performs the final
   authorization immediately before the write. Preserve those existing gates
   and do not move provider-email dispatch into the coordinator. Capture the
   result of the **existing call at the start of
   `FirebaseServicesHubRepository.requestOffer(...)`** and reuse it; do not add
   an authorization call after it or after commit. Earlier UI/form
   authorizations may remain as they are, but the email adds zero lookups to
   them.

10. Extend `FirebaseServiceRequestPostCommitObserver.observe(...)` and
   `ServiceRequestPostCommitEffects.afterCommit(...)` with an immutable
   provider-notification input assembled before starting the write:

   ```kotlin
   providerContactEmail = finalAuthorization.providerContactEmail
   requestedByUserEmail = requester.email
   serviceName = submission.offer.title
   ```

   Keep that input in memory only. Do not put it into Firestore, SharedPreferences,
   SavedStateHandle, analytics, or a retry queue.

11. Preserve the current `Task.addOnSuccessListener` boundary. Only a successful
   Firebase commit may invoke the effect, including when the UI coroutine has
   already stopped waiting. A failed commit must invoke nothing.

12. In `DefaultServiceRequestPostCommitEffects`, retain the existing local
    deferred bookkeeping, then dispatch the new provider call once. Remove the
    call to `ownerNotificationDispatcher.notifyAfterCommit(...)`. Do not wire
    both dispatchers into the same app release.

13. Update `ServicesModule.kt` to provide the new notifier and dispatcher and
    inject only that dispatcher into the active post-commit flow. The old
    classes may remain temporarily for rollback/reference, but no active Hilt
    graph or transaction-creation code may call `/notify-owner`.

14. A missing/invalid provider or requester email is a generic best-effort
    notification failure, not a transaction failure. Do not perform a fallback
    lookup or send to a fallback recipient.

### Android tests

Use the existing interceptor/OkHttp request-capture pattern and post-commit
Task tests. Cover at least:

- exact path, method, media type, body fields, normalization, and timeout;
- rejection of invalid/bounded inputs before issuing a request;
- acceptance only of `200 {"status":"sent"}`;
- the shared Bearer header, one refresh-and-retry after a first `401`, and no
  automatic retry after any ambiguous failure;
- extraction of the contact email from the single force-fresh authorization
  result's `canonicalData`, including precedence tests;
- the final authorizer's underlying publisher lookup runs exactly once while
  producing both active/deleted state and contact email;
- a regression test fails if code calls `providerResolver.state(...)` and then
  performs a second identity/contact lookup;
- no additional provider lookup beyond the UI/form/final authorization calls
  that already existed before this email migration;
- exactly one dispatch after a successful authenticated or deferred commit;
- zero dispatches after a failed commit;
- notification failure cannot escape the post-commit effect or change the
  committed result;
- local deferred bookkeeping still precedes notification dispatch;
- no active automatic reference to `/notify-owner`; and
- privacy-safe logging.

Run:

```bash
cd mydnamap-android
./gradlew :app:compileDebugKotlin :app:testDebugUnitTest
```

## Trust boundary

This endpoint intentionally trusts the authenticated native client's selected
destination and content values. It is a credential-gated email relay
constrained to one server-owned template and one fixed portal URL. A caller
must first obtain a valid, signed `service-transactions:notify` Bearer token.

The strict three-field schema, bounded lengths, HTML escaping, fixed Spanish
copy, fixed subject, fixed URL, and lack of arbitrary HTML/URLs limit abuse but
do not prove that a transaction exists. The token authenticates possession of
the integration credentials; it does not validate the client-supplied
transaction facts. Do not claim otherwise in code comments or product copy.

Adding edge rate limiting later would not require Firestore reads. Adding
transaction verification or durable idempotency would change the
explicit zero-Firestore/best-effort contract and must be designed separately.

## Firebase quota impact

Each authenticated email operation adds exactly:

```text
Firestore document reads:  0
Firestore document writes: 0
```

The service transaction itself and the provider authorization already have
their normal Firestore costs. The migration must reuse the provider document
returned by that existing authorization read. It must not add a second provider
read for the email. Gmail/API traffic is outside Firestore read/write quotas.
The one-year token exchange adds one integration-client Firestore read and no
write, normally once per installed app per token lifetime. Its cryptographic
verification has no five-per-minute reporting quota. See the shared
device-authentication guide for the full cost and refresh contract.

The legacy `/notify-owner` endpoint still incurs its old Firestore verification
and receipt costs when an old app release calls it. Those costs disappear for a
transaction only after the installed client has migrated to the new route.

## Release order and end-to-end verification

Deploy the SDK first, then release iOS and Android. Until users upgrade, old
clients continue calling the retained legacy endpoint. New clients call only
the new endpoint.

For each platform, verify with controlled requester and provider inboxes:

1. Deploy the SDK, obtain a token from `/service-transactions/notification-token`,
   and confirm the new endpoint returns `200 {"status":"sent"}` for a valid
   Bearer-authenticated test payload. Confirm the same request without the
   header returns `401` and sends no email.
2. Install the new native build and create one service transaction.
3. Confirm exactly one provider email arrives, in Spanish, at the provider
   email already known by the app.
4. Confirm it contains the correct service name and requester email.
5. Confirm every link opens only
   `https://golden-crow-backoffice.vercel.app/publisher-portal/service-transactions`.
6. Confirm no transaction-detail URL or transaction ID appears in either HTML
   or plain text.
7. Confirm the native build made one `/notify-provider` call and no
   `/notify-owner` call.
8. Create a signed-out/deferred transaction and repeat the same checks.
9. Simulate a failed Firestore commit and confirm no email request starts.
10. Simulate a timeout or HTTP `502` after a successful commit and confirm the
    transaction remains successful, the app does not retry, and logs contain no
    PII.
11. Measure or spy on the provider lookup boundary and confirm the email caused
    no additional Firestore read.
12. Verify an older released client still functions through `/notify-owner`
    while the migration rolls out.
