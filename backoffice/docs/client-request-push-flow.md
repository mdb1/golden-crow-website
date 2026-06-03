# Client Request Push Flow

This surface uses a derived request state instead of a scheduled cleanup job.

## State model

- `progressPhotosRequestedAt`
- `bodyWeightRequestedAt`

The backoffice treats each timestamp as the source of truth.

## UI contract

- A request is considered active for 3 days from `requestedAt`.
- While active, the client card shows `Pedido el {fecha}` and disables the CTA.
- After the TTL, the same timestamp becomes historical and the card shows `Ultima petición {fecha}`.
- No background job flips the state back. The UI derives the status from the timestamp on render.

## Push contract

- Requests are sent as `nudge` pushes.
- The push payload includes a `deepLink`:
  - `gcfitness://progress/check-in`
  - `gcfitness://progress/log-weight`
- The iOS app must route those links directly into the corresponding Progress screen flows.

## Activity log contract

- Every request action is recorded in `coach_activity` so `my-activity` can show the audit trail.
- If a request is already active, the action is skipped and no duplicate log entry is written.

## Why this is explicit

- It avoids a timer-based state machine in Firestore.
- It keeps the push behavior and the UI status derived from the same timestamp.
- It makes the deep-link contract stable for future app changes.
