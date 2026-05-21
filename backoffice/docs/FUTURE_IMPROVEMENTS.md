# Future Improvements

This document tracks intentional gaps and follow-up work we want after the MVP is stable.

## Backoffice

- Reintroduce a trainer allowlist only after the auth and provisioning flow is stable enough to support it again.
- Keep the client daily view lazy-loaded by default and only prefetch what is needed for the current interaction.
- Add stronger analytics for client trends: habit adherence, workout completion, chat activity, reminders, and progress photos.
- Expand the client detail page with more review tools for weekly calls, notes, and long-term goal tracking.
- Revisit the exercise library and template builder UX after the core coach workflow is validated by real usage.

## iOS App

- Validate the active workout flow end to end, including every set state transition and error path.
- Add and verify Apple Watch workout integration.
- Test and harden app behavior when backgrounded, terminated, or restored mid-session.
- Improve recovery states for auth, provisioning, and sync failures so the app does not keep running half-broken.
- Revisit the progress-photo and comparison flows on smaller screens after real usage feedback.

## Cross-cutting

- Reassess Firestore read patterns once the MVP is stable, but avoid premature optimizations that increase maintenance cost.
- Keep the data model lean and only add extra denormalization when the product flow proves it is necessary.
