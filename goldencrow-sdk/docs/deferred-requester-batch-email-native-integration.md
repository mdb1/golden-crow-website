# Deferred requester batch email: native integration

This document is the implementation contract for adding the native-client call
that sends one aggregate confirmation email to the person who requested a
completed signed-out deferred batch.

This command requires the same long-lived notification Bearer token as the
provider command. Implement the shared layer first by following the
[service-notification device authentication guide](./service-notification-device-auth-native-integration.md).

The requester confirmation is separate from the per-transaction provider
notification. Current and new native releases must keep sending one provider
notification per committed transaction through:

```text
POST /service-transactions/notify-provider
```

Follow the
[zero-Firestore provider notification guide](./zero-firestore-provider-notification-native-integration.md)
for that integration. The legacy
`POST /service-transactions/:transactionId/notify-owner` route remains available
only for already-released clients during migration. A current client must never
call both provider routes for the same transaction. The requester endpoint sends
one additional email for the complete current deferred batch.

## Non-negotiable behavior

1. Make exactly one requester-confirmation call after the one final
   `deferred_service_transactions` batch write succeeds.
2. Send only the services created by the current action. Never load, merge, or
   send transaction IDs already present in the requester's deferred index.
3. Build the payload from the confirmed batch data already held in memory by
   the app. Do not read the deferred index, service transactions, offers, or
   providers again for this email.
4. Preserve the completed batch order. Do not sort or deduplicate its rows.
5. Do not call the endpoint before the deferred index commit succeeds. A failed
   index commit must produce no requester email.
6. Treat the email as a best-effort post-commit effect. A notification failure
   must not undo or reinterpret committed service transactions or the successful
   deferred-index write.
7. Do not automatically retry an ambiguous HTTP failure. The endpoint has no
   durable idempotency receipt, so a timeout or lost response may mean that
   Gmail accepted the first message; an automatic retry can send a duplicate.
   The only allowed retry is one token refresh and one retry after HTTP `401`,
   because authentication is rejected before Gmail is called.
8. Keep the current zero-Firestore provider notification once per transaction,
   independently of this requester batch email. Do not add provider lookups or
   receipts, restore the legacy `/notify-owner` call, or call both provider
   routes from a current native build.

## SDK contract

Production URL:

```text
POST https://golden-crow-sdk.vercel.app/service-transactions/notify-requester
Content-Type: application/json
Authorization: Bearer <service-notification access token>
```

The JSON body is strict. It has exactly these fields:

```json
{
  "requestedByUserEmail": "requester@example.com",
  "items": [
    {
      "serviceName": "Secuenciacion de exoma",
      "providerName": "Laboratorio Uno"
    },
    {
      "serviceName": "Consulta genetica",
      "providerName": "Profesional Dos"
    }
  ]
}
```

Validation rules:

- `requestedByUserEmail` is trimmed, lowercased, must be a valid email, and may
  contain at most 320 characters.
- `items` must contain between 1 and 100 entries.
- Every item must contain exactly `serviceName` and `providerName`.
- Both names are trimmed, must be non-empty, and may contain at most 180
  characters each.
- Extra root or item fields are rejected. In particular, the client must not
  send transaction IDs, HTML, subject text, recipients, download URLs, QR data,
  or any other message configuration.
- Item order is retained in the email.

Success is synchronous HTTP `200`:

```json
{
  "status": "sent",
  "itemCount": 2
}
```

The native client should require `status == "sent"` and require `itemCount` to
equal the number of submitted rows before recording the request as successful.

Invalid bodies return HTTP `400`. A Gmail delivery failure returns HTTP `502`:

```json
{
  "error": "Requester confirmation email could not be sent."
}
```

The native integration must not retry ambiguous delivery outcomes because the
endpoint is not idempotent. A first authentication `401` is the sole exception:
refresh the token and retry exactly once. A future explicit delivery-retry UX
may retry only if the product accepts the possibility of a duplicate message,
or after the SDK gains a durable idempotency contract.

Missing, invalid, or expired notification authentication returns HTTP `401`;
insufficient scope returns HTTP `403`. The endpoint is outside the backoffice
cookie/session surface so the signed-out flow can call it, but it is not
anonymous. It requires a signed Bearer token with
`service-transactions:notify`; a Firebase user token or reporting token is not
a substitute.

## What the server owns

The client supplies only the normalized requester email and the two display
names for each confirmed item. The SDK owns the subject, Spanish copy, HTML,
plain-text fallback, escaping, styles, and all destinations.

The email tells the requester to:

1. Download Pocket Genes.
2. Create an account or sign in with the same email used for the request.
3. Open requested services to confirm and follow the requests.

The main download CTA is fixed to:

```text
https://goldencrowvs.com/pocket-genes/download/
```

The QR is a fixed inline-CID PNG. The QR and its visible fallback App Store
button both target exactly:

```text
https://apps.apple.com/ar/app/pocket-genes/id6748587627
```

The native app must not generate or upload the QR.

## iOS implementation instructions

The current iOS implementation is in the sibling `mydnamap` repository. Use
these existing files as the authoritative integration points:

- Legacy per-transaction transport reference for shared URLSession mechanics:
  `mydnamap-ios/mydnamap/Tabs/ServicesHub/ServiceTransactionOwnerNotifier.swift`
- Deferred batch Firestore write:
  `mydnamap-ios/mydnamap/Tabs/ServicesHub/ServicesHubService.swift`, method
  `linkFastTransactionMakerDeferredBatch(email:transactionIDs:completion:)`
- Exact batch-finalization point:
  `mydnamap-ios/mydnamap/Tabs/FastTransactionMaker/FastTransactionMakerIOSModels.swift`,
  method `FastTransactionMakerIOSAmazingRunner.finalizeCompletedBatch(runID:)`
- Existing request/ordering data:
  `FastTransactionMakerIOSAmazingRunner.summaries`

Implement the iOS counterpart as follows:

1. Add a separate requester-confirmation transport in the same Services Hub
   area. Do not merge it with either the current provider transport or the
   legacy compatibility transport. A clear name is
   `ServiceTransactionRequesterConfirmationNotifier.swift`.
2. Define a small injectable protocol so runner tests can use a spy. Its single
   operation receives a requester email and an ordered array of items, then
   completes with `Result<Void, Error>` (or a typed decoded success result).
3. Mirror the proven network mechanics shared by the notification transports:
   use the production SDK base URL, `URLSession`, JSON encoding,
   `Content-Type: application/json`, and a 15-second request timeout. Treat
   `ServiceTransactionOwnerNotifier` only as a legacy mechanics reference, not
   as an active dependency to preserve. Inject the application-wide token
   provider and attach `Authorization: Bearer <token>`.
4. Normalize the email with
   `TransactionEmailCollectProvider.normalizedEmail(_:)` before creating the
   request. Reject an invalid email locally.
5. Trim and validate all rows locally against the SDK bounds: 1...100 rows and
   1...180 characters for each non-empty name. Encode no additional fields.
6. POST to the exact path `/service-transactions/notify-requester`. There is no
   transaction ID in this path.
7. Accept only HTTP `200`, decode the response, and verify both `status` and
   `itemCount`. Do not carry over the legacy `/notify-owner` endpoint's
   acceptance of HTTP `202` to this new endpoint. On the first `401` only,
   refresh the notification token and retry once; no other result is
   retryable.
8. Inject the new notifier into `FastTransactionMakerIOSAmazingRunner`, with
   the production implementation as its default. Keep the `ServicesHubService`
   dependency used for transaction creation and deferred-batch linkage, but do
   not duplicate provider-notification wiring in the runner. The active provider
   flow inside `ServicesHubService` must follow the zero-Firestore provider
   notification guide and must not retain a reachable legacy notifier call.
9. In `finalizeCompletedBatch(runID:)`, leave the authenticated branch
   unchanged. The requester email is specifically tied to the signed-out
   deferred batch.
10. Leave the existing call to
    `service.linkFastTransactionMakerDeferredBatch(...)` unchanged. Inside its
    `.success` branch, create the email rows from the already-confirmed
    summaries:

    ```swift
    let items = summaries.map {
        ServiceTransactionRequesterConfirmationItem(
            serviceName: $0.serviceName,
            providerName: $0.providerName
        )
    }
    ```

    Use `serviceName`, not `customTransactionName`, and use the confirmed
    summary's `providerName`. Do not query Firestore and do not map from the
    historical deferred-index contents.
11. Start the notifier exactly once from that `.success` branch. Log a failure
    generically and set `phase = .finished` regardless of the notification
    result. Because the runner is `@MainActor`, return to `MainActor` (or the
    main queue, matching the surrounding code), re-check the original `runID`,
    and only then mutate runner state from the notifier completion. Do not
    surface a retry button for this post-commit email.
12. Keep the existing deferred-finalization retry behavior unchanged. If the
    Firestore write fails, the user may retry that write; only its eventual
    success starts the one email call. A failure that occurs after the HTTP call
    starts must not set `deferredBatchFinalizationNeedsRetry`.
13. Add a dedicated `OSLog` category. Never log the requester email, service or
    provider names, JSON body, response body, transaction IDs, or a network
    error description that may embed request data.

The critical ordering must be:

```text
all root service transactions committed
  -> one deferred index transaction succeeds
    -> one best-effort requester email call begins
      -> runner finishes
```

It must never become:

```text
each root transaction -> one requester email
```

The current `/notify-provider` notification remains once per root transaction
and continues independently. `/notify-owner` is compatibility-only for
already-released clients and must not also run in the current flow.

### iOS tests

Add requester-notifier tests beside the existing notification transport tests
and runner coverage in `MyDnaMapTests/ServicesHubModelTests.swift` or a focused
new test file.
Cover at least:

- exact URL, HTTP method, content type, timeout, and JSON field names;
- email normalization and name trimming;
- local rejection of invalid email, zero items, 101 items, blank names, names
  longer than 180 characters, and unexpected success codes;
- decoding `200 {"status":"sent","itemCount":N}` and rejecting a mismatched
  count;
- the shared Bearer header, one refresh-and-retry after a first `401`, and no
  retry for `403`, timeout, connection failure, `400`, or `502`;
- one notifier invocation after a successful deferred batch write;
- zero notifier invocations before or during per-item creation;
- zero invocations when the deferred batch write fails;
- rows sourced only from the current ordered `summaries` array;
- a notifier failure leaves the finished committed batch intact and offers no
  automatic retry;
- logs contain none of the sensitive request values;
- the requester-batch tests remain green alongside the provider-migration tests
  that prove the current creation flow calls `/notify-provider` and has no
  reachable automatic `/notify-owner` call.

Because the Xcode project uses filesystem-synchronized groups, a Swift source
or test file added under the existing synchronized folders should not require a
manual `project.pbxproj` entry. Verify target membership in the build rather
than editing the project file preemptively.

Run the complete iOS test target on an available simulator, not only the new
test class:

```bash
xcodebuild \
  -project mydnamap-ios/mydnamap.xcodeproj \
  -scheme mydnamap \
  -destination 'platform=iOS Simulator,id=<AVAILABLE_SIMULATOR_UDID>' \
  test
```

## Android implementation instructions

Android's legacy provider-notification transport remains a useful OkHttp and
dispatcher reference in:

```text
mydnamap-android/app/src/main/java/com/genetics/app/services/data/
ServiceTransactionOwnerNotifier.kt
```

Use its OkHttp, coroutine, timeout, dependency-injection, best-effort logging,
and test patterns as a mechanical reference. Add a separate
requester-confirmation notifier. The active provider flow must separately follow
the
[zero-Firestore provider notification guide](./zero-firestore-provider-notification-native-integration.md):
current builds use only `/service-transactions/notify-provider`, and the legacy
owner notifier/dispatcher may remain in source only for compatibility or
rollback reference, not in the active transaction-creation graph.

The current Android code does not have the iOS signed-out Fast Transaction
Maker multi-item finalizer. In particular,
`DefaultServiceRequestPostCommitEffects.afterCommit()` is a per-transaction
hook. **Do not call the requester endpoint from that hook**: doing so would
send one requester email per item and violate the aggregate-email contract.

For an Android flow that creates a genuine deferred batch:

1. Retain the complete ordered list of successfully committed
   `ServiceTransactionSummary` values in the batch coordinator.
2. Perform the one final deferred-index write that adds the complete batch.
3. Only after that write succeeds, make one requester-confirmation call using
   `summary.serviceName` and `summary.providerName`.
4. Launch it as a best-effort post-commit coroutine. A failure is logged without
   failing or rolling back the batch, and is not automatically retried.
5. Wire the notifier through `ServicesModule.kt` in the same style as the
   current provider notifier, while keeping the requester and provider
   transports and dispatchers independent. Do not reintroduce the legacy owner
   dispatcher while adding the requester notifier.

Both transports must nevertheless share the one application-scoped token
provider documented in the device-authentication guide. Add
`Authorization: Bearer <token>` and allow only the explicit one-time `401`
refresh/retry; this authentication retry is separate from, and does not create,
a durable email retry.

Do not add an Android shake gesture, accelerometer trigger, or hidden Fast
Transaction Maker entry point. The Android repository explicitly forbids that
iOS-only activation pattern. This email integration may be attached only to a
supported visible Android batch workflow with a real final deferred write.

Test the Android requester transport using the existing notification tests'
OkHttp interception pattern. Add the same schema, response,
one-call-after-batch, no-call-on-index-failure, non-retry, and privacy
assertions listed for iOS. Keep the provider-migration regression coverage that
proves the current flow calls only `/notify-provider`. Then run:

```bash
cd mydnamap-android
./gradlew :app:compileDebugKotlin :app:testDebugUnitTest
```

## Trust boundary and abuse risk

This endpoint deliberately performs no transaction-data Firestore verification.
It trusts the authenticated native caller's `requestedByUserEmail`,
`serviceName`, and `providerName`, so each email adds zero Firestore reads and
zero Firestore writes. It is a credential-gated client-directed email relay
with a closed, fixed template. A caller must first obtain a valid, signed
`service-transactions:notify` Bearer token.

The strict body, bounded row count and lengths, fixed message copy, fixed
links, HTML escaping, and absence of arbitrary recipient/HTML/URL fields limit
what can be sent, but they do not prove that the caller created a deferred
batch. The token authenticates possession of the integration credentials, not
the submitted batch facts. Do not claim otherwise in client comments or
documentation.

If that trust assumption becomes unacceptable, add a separately designed
control such as edge rate limiting or introduce a server-side
capability/idempotency contract. Do not quietly add Firestore
re-reads to this client integration, because zero additional Firestore
operations is an explicit requirement.

## Firebase quota impact

The requester email call adds:

```text
Firestore document reads:  0
Firestore document writes: 0
```

The existing Firestore transaction used by
`linkFastTransactionMakerDeferredBatch` still reads the one deferred document
to preserve older unresolved IDs and writes its merged ID list. That is the
existing batch-index cost, not an email cost. The new SDK endpoint neither
reloads that document nor reads any transaction/offer/provider document, and it
does not persist a notification receipt. Gmail delivery and the inline QR MIME
attachment are outside Firestore quotas.

The shared one-year token exchange adds one integration-client Firestore read
and no write, normally once per installed app per token lifetime. Bearer
verification and every email call are cryptographic/in-process and do not use
the reporting API's five-per-minute quota. Five provider emails plus this one
requester email may therefore be sent in the same minute with the same token.

## Release and end-to-end checklist

Deploy the SDK before releasing a native client. An older SDK returns `404` for
the new route, and the best-effort native behavior would correctly preserve the
committed batch but no requester email would be sent.

Use a controlled test inbox for the final end-to-end test:

1. On a fresh install, confirm the app obtains one token from
   `/service-transactions/notification-token`, stores it securely, and then
   reuses it. Confirm an unauthenticated email request returns `401` without
   sending mail.
2. With a current native build, confirm each committed transaction sends one
   authenticated provider email through `/notify-provider` and makes no
   `/notify-owner` call.
3. Complete a signed-out batch containing at least two services from different
   providers.
4. Confirm the final deferred document contains the new batch plus any older
   unresolved IDs that were already present.
5. Confirm the requester receives exactly one new email.
6. Confirm its table contains only the current batch, in the selected/completed
   order, and displays the correct service and provider for every row.
7. Confirm the download CTA opens
   `https://goldencrowvs.com/pocket-genes/download/`.
8. Confirm the QR and its fallback button both open
   `https://apps.apple.com/ar/app/pocket-genes/id6748587627`.
9. Repeat a new batch with the same email and confirm the new email contains
   only that new action, not the earlier deferred IDs.
10. Simulate a deferred-index failure and confirm no requester email is sent.
11. Simulate an email-network failure after a successful index write and
    confirm the batch remains complete, the app does not retry automatically,
    and logs reveal no requester data.
12. Submit at least six authenticated notification calls within one minute and
    confirm none is rejected by the reporting API's five-per-minute quota.
13. As a separate compatibility check, verify an already-released client can
    still use `/notify-owner`; never enable both provider routes in the same
    current-client transaction flow.
