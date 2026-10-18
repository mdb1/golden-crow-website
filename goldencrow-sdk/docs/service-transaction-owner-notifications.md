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

For the current temporary routing policy, every email is sent to
`federico@goldencrowvs.com` rather than the service provider. The message shows
only the canonical service name and requester email in a compact card, with a
single button to the authenticated backoffice service-transactions dashboard.

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
