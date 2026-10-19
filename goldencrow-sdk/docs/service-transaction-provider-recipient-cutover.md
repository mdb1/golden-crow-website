# Service transaction provider-recipient cutover

This is the production runbook for changing service-transaction notification
emails from the temporary Federico mailbox to each transaction's real service
provider. The application code is already prepared for both modes. The
cutover itself has exactly one routing switch and does not require changing an
API, a mobile client, an environment variable, or a recipient address by hand.

## The only routing switch

Open:

```text
goldencrow-sdk/src/lib/service-transaction-notification-routing.ts
```

Find this uniquely named export:

```ts
export const SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER = false;
```

The values mean:

- `false`: keep the current temporary behavior and send service-transaction
  notifications to `federico@goldencrowvs.com`.
- `true`: send them to the linked provider's current live `contactEmail`.

To activate provider delivery, change **only** `false` to `true` on that line:

```diff
-export const SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER = false;
+export const SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER = true;
```

To roll back, change the same value from `true` to `false`. Do not replace the
Federico fallback constant, add another flag, or paste a provider email into
source code. Keeping the fallback intact is what makes the one-line rollback
possible.

The prepared rollout is initially committed at `false`, so its first deployment
does not change existing delivery behavior. After that, the value in this file
is the source of truth for the active mode; the runbook does not need another
content edit when the switch changes.

## Where the provider address comes from

Provider mode does not use the provider email frozen into an offer or
transaction snapshot. For every new preview or newly claimed delivery attempt,
the SDK follows the transaction's canonical `providerKind` and `providerId`,
then reads the current publisher document:

- `providerKind: "organization"` reads
  `feed_organizations/{providerId}.contactEmail`.
- `providerKind: "individual"` reads
  `feed_individuals/{providerId}.contactEmail`.

This is the same live provider contact email shown in the manual notification
preview on the deferred service-transaction detail screen. With the switch set
to `true`, that preview's recipient and the provider contact email must match.
The browser and native clients cannot provide or override the recipient.

The SDK normalizes and validates the live address before delivery. It fails
closed: it sends no email if the publisher is missing, inactive, has no
`contactEmail`, or has an invalid `contactEmail`. The service transaction stays
committed, so an operator can repair the publisher record and retry the
notification deliberately.

## Behavior matrix

| Switch | Live provider state | Result |
| --- | --- | --- |
| `false` | Publisher exists and is active | Send to the temporary Federico mailbox. The provider email is context only. |
| `false` | Publisher is missing or inactive | Block the notification under the existing provider-integrity checks. |
| `true` | Publisher exists, is active, and has a valid `contactEmail` | Send to that live `contactEmail`. |
| `true` | Publisher is missing or inactive | Block without sending. |
| `true` | `contactEmail` is missing, blank, or invalid | Block without sending. |

Both delivery paths use this same routing decision:

- the first-send endpoint called after a native transaction is created; and
- the GOD MODE manual preview/resend flow.

Temporary operations mode uses the Federico greeting and backoffice link.
Provider mode uses a neutral greeting and links to the publisher portal. In
both modes the message identifies the canonical requested service and includes
the requester's canonical email.

There is no fallback to Federico while the switch is `true`. That is
intentional: silently sending a provider's customer data to the wrong mailbox
would be worse than a visible, retryable failure.

## Preflight before changing the switch

Perform these checks before editing the line:

1. Check the working tree first. If it contains unrelated or unrecognized
   changes, stop and preserve them before continuing. Then start from an
   up-to-date `main` branch:

   ```bash
   git status --short
   git switch main
   git pull --ff-only origin main
   git status --short
   ```

2. In GOD MODE, open the deferred service-transaction detail screen and open
   the manual email preview for representative transactions. Include both an
   organization and an individual if both provider kinds are in active use.

3. For every provider that may receive requests, confirm that the preview
   identifies the intended publisher, its status is active, and its provider
   contact email is a real mailbox controlled by that provider. Correct the
   publisher's canonical `contactEmail` before cutover if necessary.

4. Confirm the product/privacy decision to disclose the requested service and
   requester email to these providers, and confirm that intended recipients
   can sign in to the publisher portal linked by the provider-mode message.

5. Use a controlled provider/test offer to confirm that its mailbox can
   receive Pocket Genes messages. Do not use a real customer transaction for
   the first test unless sending that message has been explicitly approved.

6. Choose a low-traffic deployment window. Let any visible manual send finish
   first. Tell operators to refresh notification previews after the deployment
   because previews generated in the old mode are deliberately invalid in the
   new mode.

7. Confirm that Gmail delivery credentials and the configured From/send-as
   identity are healthy. The routing switch changes `To`; it does not change
   the authenticated Gmail account or `From` header.

## Activate provider delivery

1. In
   `goldencrow-sdk/src/lib/service-transaction-notification-routing.ts`, change
   the one boolean from `false` to `true`.

2. Confirm that the named switch appears once and has the intended value:

   ```bash
   rg -n '^export const SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER = ' \
     goldencrow-sdk/src/lib/service-transaction-notification-routing.ts
   git diff -- goldencrow-sdk/src/lib/service-transaction-notification-routing.ts
   ```

   The behavioral diff must be the one-line `false` to `true` change. Do not
   edit the fixed fallback address.

3. Apply the repository's release-version policy. This is release metadata,
   not a second recipient setting. Open
   `backoffice/src/lib/app-version.ts` and increase only the numeric version by
   exactly `+1` (for example, `3.486` becomes `3.487`). Do not run the bump
   helper for this SDK-only cutover: by design, it is a no-op when no other
   backoffice source file is staged. Then verify that the version diff is
   exactly one line and stage it with the routing switch:

   ```bash
   git diff -- backoffice/src/lib/app-version.ts
   git add goldencrow-sdk/src/lib/service-transaction-notification-routing.ts \
     backoffice/src/lib/app-version.ts
   ```

   This version-only backoffice change will not trigger another automatic bump
   in the pre-commit hook.

4. Run all mandatory gates before pushing:

   ```bash
   git diff --check
   git diff --cached --check
   (cd goldencrow-sdk && npm run build)
   (cd backoffice && npx jest)
   ```

   `goldencrow-sdk`'s build includes TypeScript compilation, boot smoke checks,
   and the SDK Jest suite. Do not push if either command is red. A pre-existing
   failure must be investigated and must not be used to hide a regression.

5. Review and commit only the intended files:

   ```bash
   git status --short
   git diff --cached
   git commit -m "Route service transaction notifications to providers"
   git show HEAD:goldencrow-sdk/src/lib/service-transaction-notification-routing.ts
   git show HEAD:backoffice/src/lib/app-version.ts
   git push origin main
   ```

   The first `git show` must contain `= true;`. The second must show exactly the
   expected one-step version increment. `main` deploys automatically.

## Verify the production deployment

1. Wait for the SDK and backoffice production deployments for the pushed
   commit to complete.

2. Confirm that the SDK booted normally:

   ```bash
   curl -i https://golden-crow-sdk.vercel.app/health
   ```

   Production should return a JSON application response, normally HTTP `200`,
   rather than a Vercel `FUNCTION_INVOCATION_FAILED` response.

3. Reload the backoffice completely. Open a controlled deferred transaction,
   then open its manual notification preview. Confirm all of the following
   before pressing Send:

   - the linked publisher is the intended organization or individual;
   - the publisher is active;
   - the displayed provider contact email is correct; and
   - the actual recipient shown by the preview is the same provider email, not
     `federico@goldencrowvs.com`.

4. Send one approved controlled message from that freshly loaded preview.
   Confirm that the provider/test mailbox receives exactly one message and the
   UI reports `sent`. Do **not** press Send again to test idempotency: another
   deliberately confirmed UI action receives a new UUID and may send another
   email. `already_sent` is expected only when the transport/API retries the
   exact same `resendRequestId` and fingerprint.

5. If a currently released iOS or Android client already invokes the
   notification endpoint, create one controlled native service transaction
   with that client. Otherwise, exercise the existing production endpoint
   through the approved server-side test flow; do not ship a mobile release
   solely for this routing switch. Confirm that the first-send notification
   reaches the provider mailbox exactly once. This proves that manual and
   native delivery share the new route.

6. Inspect the corresponding authorized notification records/logs. New
   receipts must record the provider in `recipientEmail`, while the fresh
   preview must show provider routing mode. Do not edit receipts manually.

7. Check the temporary Federico mailbox and the SDK error logs during the
   observation window. New controlled provider-mode messages must not arrive at
   Federico; a missing/invalid provider email must produce a visible failure
   without any delivery.

## Receipt and preview-fingerprint semantics

The switch changes new routing decisions; it does not rewrite delivery
history.

- Existing `service_transaction_notifications` receipts whose status is
  `sent` remain sent and are not delivered again or redirected. Their stored
  recipient remains historical evidence.
- Existing `service_transaction_notification_resends` receipts also remain
  historical. Replaying a manual resend with the same confirmed
  `resendRequestId` UUID does not redirect it to a different mailbox.
- The manual preview fingerprint includes both `recipientMode` and
  `recipientEmail`. A preview opened before a cutover, rollback, or provider
  email edit will no longer match. The send is rejected before delivery and
  the operator must reload the preview.
- Each newly confirmed manual resend uses a new UUID and a fingerprint from the
  fresh preview. Never reuse a UUID to try to force a different destination.
- A claimed in-flight attempt keeps the routing decision it already claimed.
  This is why the runbook calls for a low-traffic window and for visible sends
  to finish before switching.
- Gmail delivery and Firestore receipt finalization are not atomic. Existing
  lease and idempotency behavior still applies; do not bypass it by deleting or
  editing a receipt.

## Roll back to the temporary mailbox

Rollback uses the same single source line:

```diff
-export const SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER = true;
+export const SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER = false;
```

Then repeat the release-version bump, mandatory gates, commit, push, health
check, and fresh-preview verification above. In the fresh production preview,
the actual recipient must again be `federico@goldencrowvs.com`; the provider
contact email remains visible only as operator context.

Rollback cannot recall messages that were already accepted by Gmail, rewrite
historical receipts, or redirect a resend that was already confirmed with its
UUID. Treat it as a routing change for new or otherwise retryable attempts.

## No mobile release is required

iOS and Android continue sending the same transaction ID and canonical
requester email to the same endpoint. They never select the notification
recipient. Therefore this `false`/`true` deployment is entirely server-side and
does not require an App Store or Play Store release.

## Explicitly out of scope

This switch controls only service-transaction notification recipients. It does
not unhardcode or change other uses of Federico or the Golden Crow mailbox:

- Partnership CRM sender identity and signature in
  `goldencrow-sdk/src/lib/partnership-crm-email.ts`, plus its backoffice UI
  mirror in `backoffice/src/lib/partnership-crm.ts`.
- Discover publisher-request notification routing in
  `goldencrow-sdk/src/lib/discover-publisher-request-notification-email.ts`.
- Public website contact/support addresses and copy, including
  `pocket-genes/src/i18n/en.ts` and `pocket-genes/src/i18n/es.ts`.
- The Gmail-authenticated mailbox, Gmail OAuth credentials, signature, or
  `From`/send-as identity. Service-transaction From behavior is controlled
  separately by `SERVICE_TRANSACTION_MAIL_FROM` and `GMAIL_USER`.

Those are independent delivery contracts and need separate requirements,
testing, and rollout decisions. Do not modify them as part of this cutover, and
do not run a repository-wide text replacement: tests, fixtures, and historical
`backoffice/public/botfarm/*.json` records also contain Federico references
that are not production routing settings.
