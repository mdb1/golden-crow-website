# Service-notification device authentication: native integration

This is the implementation contract for adding the shared device-authentication
layer used by the two native best-effort email commands:

```text
POST /service-transactions/notify-provider
POST /service-transactions/notify-requester
```

Both commands are outside the backoffice cookie-authentication surface, but
they are **not anonymous endpoints**. Every request must carry the long-lived
service-notification Bearer token described below. The SDK validates the
token's server signature and claims before it can invoke Gmail.

Implement this layer once per native platform and inject the same token
provider into both notification transports. Do not build a separate token
cache for each email command.

## Exact authentication contract

The native repository has an untracked root `.env` with these two values:

```dotenv
API_CLIENT=gci_live_...
API_SECRET=gcs_live_...
```

Obtain a notification token with:

```http
POST https://golden-crow-sdk.vercel.app/service-transactions/notification-token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "gci_live_...",
  "client_secret": "gcs_live_..."
}
```

The JSON body is strict. Use those exact snake-case keys and do not add an
email, device ID, Firebase ID token, session cookie, requested scope, or any
other field.

Success is HTTP `200`:

```json
{
  "access_token": "<signed token>",
  "token_type": "Bearer",
  "expires_in": 31536000,
  "scope": "service-transactions:notify"
}
```

The client must require all of the following before caching the response:

- `access_token` is a non-empty string;
- `token_type` is exactly `Bearer`;
- `expires_in` is a positive integer; the production value is `31536000`
  seconds, or one year; and
- `scope` is exactly `service-transactions:notify`.

Compute `expiresAt = receivedAt + expires_in`. Treat a cached token as expired
five minutes early so a request is not started with a token at the edge of its
validity. Do not decode the token to make authorization decisions; its claims
are server-owned.

Invalid input returns HTTP `400`. Unknown, inactive, or mismatched client
credentials return HTTP `401`. Do not fall back to
`/internal/openapi/oauth/token`: that endpoint issues a reporting token with a
different audience, use, scope, persistence model, and quota.

The production SDK deployment should keep a stable server-only
`SERVICE_TRANSACTION_NOTIFICATION_TOKEN_SIGNING_SECRET` of at least 32 bytes.
This value is not `API_SECRET` and must never ship in either app. If the
dedicated value is not configured, the SDK derives a domain-separated key from
the server-only MyDNAMap Firebase Admin private key. Changing either active
signing source invalidates outstanding tokens; clients recover through the
single `401` refresh flow below.

Because verification is deliberately stateless, revoking an integration
client or rotating its `API_SECRET` prevents future exchanges but does not
immediately revoke a notification token that was already issued. An issued
token remains valid until its one-year expiry unless the server signing source
is rotated. This is the intentional tradeoff that keeps every email call at
zero Firestore operations.

## Calling either notification endpoint

Add the same header to both email requests:

```http
Authorization: Bearer <access_token>
```

The existing strict email JSON bodies do not change. Never put the token,
client ID, or client secret in a notification URL or an email-command JSON
body; the client credentials belong only in the token-exchange JSON body shown
above.

The SDK verifies the token locally before parsing the email command or calling
Gmail. Verification requires its signature plus the exact issuer, audience,
token use, scope, not-before time, and expiry defined by the SDK. The app does
not sign each email request itself: it presents the server-signed token as a
Bearer credential, and the backend verifies that signature on every call.

The server-owned claim contract is:

| Claim | Required value |
| --- | --- |
| `iss` | `goldencrow-openapi` |
| `aud` | `goldencrow-service-notifications` |
| `token_use` | `service_notifications` |
| `scope` | `service-transactions:notify` |
| `sub` and `client_id` | the same authenticated `gci_live_...` client ID |
| lifetime | exactly `31536000` seconds |

These values document what the backend checks. Native clients should validate
the token endpoint's response envelope and expiry, not reimplement server-side
JWT authorization.

Expected authentication failures are:

- HTTP `401`: missing, malformed, invalid, not-yet-valid, or expired token;
- HTTP `403`: a valid token without `service-transactions:notify`.

A backoffice session cookie, Firebase user token, or reporting access token is
not a substitute.

## Cost and quota contract

The credential exchange performs one Firestore read of the integration client
and no Firestore write. The SDK does not create a token document, usage event,
audit record, receipt, or quota counter for this notification token.

Each authenticated provider or requester email call then performs:

```text
Firestore document reads:  0
Firestore document writes: 0
```

Token verification is cryptographic and in-process. These notification calls
do not use the reporting API's five-requests-per-minute quota. A batch may send
five provider emails and one requester email—or more provider emails—with the
same cached token without the sixth request receiving the reporting API's
`429` response.

The exchange should normally happen only once per installed app per one-year
token lifetime. It happens again when the token expires, the secure store is
cleared, or an email command returns `401` and the one allowed refresh succeeds.

## Retry rules

There is exactly one safe notification retry case:

1. Send an email command with the cached Bearer token.
2. If and only if the response is HTTP `401`, invalidate that exact cached
   token, obtain a fresh token through the credential exchange, and retry the
   original email request exactly once.
3. If the second request is also `401`, stop.

This retry is safe because the SDK rejects authentication before Gmail is
called. Make the token provider single-flight so concurrent notification calls
share one credential exchange. Invalidation must be conditional: a late `401`
for token A must not delete a newer token B that another request already saved.

Do **not** refresh or retry an email command after:

- a timeout, connection interruption, cancellation, or non-HTTP response;
- HTTP `400`, `403`, `429`, `500`, `502`, or any status other than `401`; or
- an HTTP `200` body that fails the endpoint's success-contract validation.

Those results can be ambiguous after Gmail accepted the message, so retrying
could send a duplicate. A token-exchange failure must also leave the committed
transaction or deferred batch successful; the next independent notification
may try to obtain a token again, but do not add a background retry queue.

## Credential handling before either platform change

The root `.env` is build input, not a runtime file. Do not add it to either app
bundle as a resource and do not try to open it on the device. First update the
native repository's `.gitignore` with:

```gitignore
.env
.env.*
!.env.example
/mydnamap-ios/mydnamap/Generated/ServiceNotificationCredentials.generated.swift
```

Add a tracked `.env.example` containing empty placeholders only. Never print,
log, upload, snapshot-test, or commit the real `API_CLIENT`, `API_SECRET`,
Bearer token, `Authorization` header, or token response.

Local and CI release builds must fail with a short generic error when either
build value is absent. Never silently compile an empty credential and never
place a real credential in a test fixture.

## iOS implementation instructions

Implement in `mydnamap-ios`. The existing transports are:

- `mydnamap/Tabs/ServicesHub/ServiceTransactionOwnerNotifier.swift` for the
  established URLSession/base-URL pattern;
- `mydnamap/Tabs/ServicesHub/ServiceTransactionRequesterConfirmationNotifier.swift`
  for the new requester command; and
- the provider transport added alongside those files according to
  `zero-firestore-provider-notification-native-integration.md`.

### 1. Make the build credentials available

Add a small build-generation script that parses the repository-root `.env`
without executing it as shell code. It must require exactly non-empty
`API_CLIENT` and `API_SECRET` values and emit a gitignored generated Swift file,
for example:

```text
mydnamap-ios/mydnamap/Generated/ServiceNotificationCredentials.generated.swift
```

The generated type should expose only internal immutable values:

```swift
enum ServiceNotificationBuildCredentials {
    static let clientID: String = "<generated API_CLIENT>"
    static let clientSecret: String = "<generated API_SECRET>"
}
```

Escape values as Swift string literals; do not interpolate untrusted `.env`
text into executable Swift source. Run generation before local, CI, archive,
and TestFlight builds. The Xcode project uses filesystem-synchronized groups,
so verify target membership without adding duplicate manual project entries.
Keep the generated file out of Git and out of test snapshots.

### 2. Add a Keychain-backed token store

Create a focused file such as
`ServiceNotificationDeviceAuthentication.swift`. Define an injectable store
protocol and a production Keychain implementation using Security.framework.
Store one Codable record containing `accessToken` and `expiresAt` as a generic
password item with stable service/account identifiers. Use:

```text
kSecClassGenericPassword
kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
```

Use `SecItemCopyMatching`, `SecItemAdd`/`SecItemUpdate`, and `SecItemDelete`.
Never put the token in UserDefaults, an app-group preference, analytics,
crash metadata, logs, or a URL cache. Corrupt or undecodable stored data should
be deleted and treated as a cache miss.

### 3. Implement a single-flight token provider

Define an injectable protocol such as:

```swift
protocol ServiceNotificationAccessTokenProviding {
    func validAccessToken() async throws -> String
    func invalidate(ifMatching token: String) async
}
```

Implement it as an `actor`. The actor should:

1. return its in-memory token when valid beyond the five-minute skew;
2. otherwise load and validate the Keychain record;
3. otherwise await an existing in-flight exchange `Task`, if one exists;
4. otherwise create exactly one exchange task;
5. POST the strict credential body to
   `/service-transactions/notification-token` with a 15-second timeout;
6. validate the complete `200` response contract;
7. save the token record to Keychain and memory; and
8. clear the in-flight task on either success or failure.

`invalidate(ifMatching:)` must clear memory and Keychain only when the stored
token equals the rejected token. This prevents a delayed request from erasing
a token that another request just refreshed.

### 4. Authenticate both email transports

Inject the same `ServiceNotificationAccessTokenProviding` instance into the
provider notifier and
`ServiceTransactionRequesterConfirmationNotifier`. Immediately before making
the request, obtain a valid token and set:

```swift
request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
```

Keep a per-call `didRetryAfterUnauthorized` flag. On HTTP `401`, conditionally
invalidate the token, obtain a new one, rebuild the request, and resend once.
No other result may enter that branch. Keep all existing post-commit
best-effort behavior and payload validation unchanged.

Do not inject authentication into the legacy
`/:transactionId/notify-owner` transport; it remains an independent
compatibility route for old app releases.

### 5. iOS tests

Use injectable URLProtocol/session, clock, credential source, token store, and
token provider fakes. Cover at least:

- exact token URL/method/content type and the three exact request keys;
- complete validation of `token_type`, `expires_in`, and scope;
- a valid Keychain token prevents an exchange;
- an expired or near-expiry token causes one exchange;
- six simultaneous callers perform one exchange and all receive the token;
- both email transports send the exact `Authorization: Bearer ...` header;
- first email response `401` causes one refresh and one retry;
- second `401` stops without a third call;
- `403`, timeout, connection failure, `400`, and `502` cause no email retry;
- late `401` for an old token cannot delete a newly cached token;
- token/exchange failures do not change committed transaction or batch state;
  and
- diagnostics contain no credentials, tokens, headers, payload values, or
  response bodies.

Run the complete iOS test target, not only the new authentication tests.

## Android implementation instructions

Implement in `mydnamap-android`. The existing transport and dependency patterns
are:

- `app/src/main/java/com/genetics/app/services/data/ServiceTransactionOwnerNotifier.kt`;
- the provider/requester transports added under the same package; and
- `app/src/main/java/com/genetics/app/di/ServicesModule.kt`.

### 1. Expose build credentials through BuildConfig

In `app/build.gradle.kts`, parse `rootProject.file("../.env")` as a simple
key/value file; do not execute or source it. Require non-empty `API_CLIENT` and
`API_SECRET` for app builds, escape them as Kotlin/Java string literals, enable
`buildFeatures.buildConfig`, and generate BuildConfig string fields. AGP emits
those fields as public static members, so expose them to app code only through
an `internal` credential-source wrapper. Unit tests should inject fake
credentials instead of reading that wrapper.

Any CI job that configures an app compile, test, bundle, or release task must
create an ephemeral root `.env` from masked CI secrets before Gradle starts and
delete it afterward. This keeps the required-value check active without
putting real credentials in the repository or test fixtures.

Do not copy `.env` into `res/raw`, `assets`, the APK as a standalone file, test
resources, Gradle output, or CI logs. Make release builds fail generically when
the values are missing.

### 2. Add an Android Keystore-backed token store

Create a focused authentication file under
`app/src/main/java/com/genetics/app/services/data/`. Define an injectable token
store and use an AES key generated in `AndroidKeyStore` with:

```text
KeyProperties.KEY_ALGORITHM_AES
KeyProperties.BLOCK_MODE_GCM
KeyProperties.ENCRYPTION_PADDING_NONE
```

Encrypt a serialized record containing `accessToken` and `expiresAt`; persist
only the IV and ciphertext in an app-private preference/DataStore. Never store
the token in plaintext SharedPreferences, saved state, Room, analytics, logs,
or WorkManager input. If the key is missing/invalidated or ciphertext cannot be
authenticated, delete the cached record and treat it as a cache miss.

### 3. Implement a single-flight token provider

Define an injectable interface such as:

```kotlin
interface ServiceNotificationAccessTokenProvider {
    suspend fun validAccessToken(): String
    suspend fun invalidateIfMatching(token: String)
}
```

Use a `Mutex` plus a shared `Deferred` (or an equivalent one-flight primitive)
so concurrent provider notifications and the requester notification await the
same exchange. Follow the same lookup order as iOS: valid memory value, valid
encrypted persisted value, current in-flight exchange, then one new exchange.

The exchange uses the existing injected OkHttpClient, the exact token path and
strict JSON contract, and a 15-second per-call timeout. Validate all response
fields, compute the five-minute-skewed expiry, encrypt the record, and clear the
in-flight handle in `finally`. Cancellation remains cancellation; do not turn
it into a background retry.

`invalidateIfMatching` must compare the rejected token with the current token
before deleting either memory or persisted state.

### 4. Authenticate both email transports

Provide one application-scoped token provider from `ServicesModule.kt` and
inject it into both new email notifiers. Set:

```kotlin
.header("Authorization", "Bearer $token")
```

on both requests. On the first HTTP `401` only, conditionally invalidate,
obtain a fresh token, rebuild the closed response/request objects, and retry
once. Do not use an OkHttp authenticator that can loop indefinitely; keep the
one-retry state explicit and covered by unit tests. Preserve coroutine
cancellation and all existing best-effort post-commit boundaries.

Do not alter the legacy `/notify-owner` notifier or attach the notification
token to unrelated SDK, Firebase, image, or download traffic.

### 5. Android tests

Use fake credentials, an in-memory encrypted-store abstraction, a test clock,
MockWebServer/OkHttp interception, and coroutine-test dispatchers. Mirror the
iOS cases above, including six concurrent calls sharing one exchange, one safe
`401` refresh, no retry for ambiguous failures, conditional invalidation, and
Bearer headers on both exact paths. Also assert no WorkManager request or
durable email retry is scheduled.

Run:

```bash
cd mydnamap-android
./gradlew :app:compileDebugKotlin :app:testDebugUnitTest
```

## Rollout and end-to-end verification

Deploy the SDK token gate before releasing the new native builds. Already
released clients continue to use the untouched legacy `/notify-owner` provider
route; the two newer notification routes return `401` to a build that has not
yet added this Bearer layer. Because email is best effort, that temporary
failure must never roll back a committed transaction or deferred batch.

Verify with controlled inboxes and server logs that do not contain secrets:

1. Confirm `.env` and generated credential source are ignored and absent from
   the Git index and app resources as standalone files.
2. On a fresh install, trigger notification authentication and observe one
   token exchange, one integration-client Firestore read, and no token write.
3. Trigger five provider notifications plus one requester notification within
   one minute. Confirm all six use the same Bearer token and none receives the
   reporting API's five-per-minute `429`.
4. Confirm every email command performs zero Firestore reads and writes.
5. Relaunch the app and confirm the secure-store token is reused without an
   exchange.
6. Inject an expired/invalid token and confirm one exchange plus one email
   retry after the first `401`.
7. Return `401` twice and confirm the second result stops the flow.
8. Simulate a timeout and HTTP `502` after an email request starts. Confirm no
   token refresh or email retry occurs and the committed operation stays
   successful.
9. Inspect provider and requester requests and confirm the Bearer header is
   present while logs/crash reports contain no credential or PII.
10. Verify the legacy `/notify-owner` compatibility flow is unchanged for an
    older released app.
