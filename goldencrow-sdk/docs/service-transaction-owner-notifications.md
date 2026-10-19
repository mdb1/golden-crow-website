# Service transaction notifications

Native clients trigger the notification email after Firestore confirms a new
service transaction. The SDK does not watch the `service_transactions`
collection.

## Request

`POST /service-transactions/:transactionId/notify-owner`

The path must contain a native app's high-entropy transaction ID:
`pgr_ios_<32 lowercase hex characters>` or
`pgr_android_<32 lowercase hex characters>`. The strict JSON body contains
only the normalized requester email:

```json
{
  "requestedByUserEmail": "requester@example.com"
}
```

The command reloads the transaction and frozen offer, verifies the supplied
email against the canonical requester, requires the native-app contract source
and platform-specific idempotency key, and verifies that the referenced service
provider still exists and is active. The high-entropy transaction ID plus exact
stored requester email are the guest-flow proof; clients must not log or expose
the email, and should avoid logging the full ID. Deterministic 2PQ and
backoffice transaction IDs are rejected. Clients cannot choose the recipient
or supply message content.

Recipient routing is controlled in one place by
`SEND_SERVICE_TRANSACTION_NOTIFICATIONS_TO_PROVIDER`. The prepared rollout's
initial value is `false`: eligible notifications go to
`federico@goldencrowvs.com` rather than the service provider. When the switch is
`true`, both native first-send and manual preview/resend resolve the recipient
from the linked live `feed_organizations` or `feed_individuals` publisher's
validated `contactEmail`; they fail closed instead of falling back when that
address is unusable. The switch in source is the authority for the active mode.
Follow the complete preflight, test, deployment, verification, and rollback
procedure in
[Service transaction provider-recipient cutover](./service-transaction-provider-recipient-cutover.md).

The message shows only the canonical service name and requester email in a
compact card. Temporary operations mode links to the authenticated backoffice
service-transactions dashboard; provider mode links to the publisher portal.

## Manual GOD MODE resend

The deferred transaction detail screen previews and resends one linked
transaction at a time through the authenticated admin routes:

```text
GET  /admin/support-services/deferred-transactions/:deferredId/transactions/:transactionId/notification
POST /admin/support-services/deferred-transactions/:deferredId/transactions/:transactionId/notification
```

The preview reloads the persisted deferred index, selected transaction, and
live Discover provider. It shows the exact resolved recipient, routing mode,
subject, text and canonical email input alongside the provider publisher's
name, account type, contact email, and every transaction ID linked to the
deferred email. While temporary routing is active, provider details and linked
IDs are operator context only; they are not added to the outbound message. In
provider mode, the validated live provider contact email is also the actual
recipient. If an operator has moved the deferred index to another email, the
preview shows both values and builds the message from the immutable transaction
requester email.

The POST body contains a client-generated `resendRequestId` UUID and the
server-generated `previewFingerprint` returned by GET. The server reloads and
rebuilds all delivery data, requires the linked Discover provider to still
exist and be active, re-resolves the live recipient, and rejects the command
when its current fingerprint no longer matches the preview. The fingerprint
includes `recipientMode` and `recipientEmail`, so a routing-mode or provider
email change requires a fresh preview. It never accepts a recipient or message
from the client. Each UUID has an independent receipt and lease in
`service_transaction_notification_resends`, so retrying the same action cannot
send twice or redirect a confirmed resend, while a newly confirmed action can
deliberately send another email. Historical sent receipts keep their original
recipient and are not rewritten by a routing change. These receipts do not
alter the native app's one-time notification receipt.

Responses are `200` with `sent` or `already_sent`, or `202` with `in_progress`
when another request currently owns the delivery lease. Delivery failures are
retryable and return `502`; they never undo the committed service transaction.
A durable record in `service_transaction_notifications` deduplicates normal
retries and concurrent calls for the same transaction. Gmail delivery and the
Firestore receipt cannot be one atomic operation, so the command provides
at-least-once delivery in the rare case where Gmail accepts a message but its
receipt cannot be persisted. An active five-minute lease prevents immediate
duplicate retries while that result is ambiguous.

Set `SERVICE_TRANSACTION_MAIL_FROM` to a Gmail-verified no-reply send-as
identity when one is available. Otherwise, the authenticated Gmail mailbox is
used with the `Pocket Genes no-reply` display name.
