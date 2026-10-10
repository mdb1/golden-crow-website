# Downloaded-File Update Lifecycle

The downloaded-file update lifecycle is a native-client convenience for files the user has already downloaded. It applies equally to reports and Pocket Genes Objects, preserves the user's current selection, and never changes the meaning or lifecycle of a service transaction. Two native entities own the behavior: `DownloadedFileUpdater` coordinates version checks and safe local replacement, while `BlacklistedFileUpdateProvider` stores the user's per-file automatic-update opt-outs.

## Canonical identity and version

An update preference and every public update state identify a file only by the closed pair `{ kind, code }`:

| Member | Canonical values | Rule |
| --- | --- | --- |
| `kind` | `report` or `object` | Keeps the report and object code namespaces independent. |
| Report `code` | Exactly six uppercase ASCII letters or digits | Uses the existing report code without trimming, case conversion, or an alias. |
| Object `code` | Exactly nine ASCII digits | Uses the existing object code without an alias. |

Source/provider format, object type, local record ID, file name, owner, URL, current version, and file content are not identity. Source still participates in replacement validation: a downloaded report must retain its report source/provider format, and an object must retain its registered PGO object type. A report can never replace an object or vice versa.

The local current version is the positive integer saved with the downloaded file. The remote latest version comes only from the canonical positive `uploaded_reports.upload_version_count` or `uploaded_objects.upload_version_count` metadata reached through the existing authorized report/object lookup. Clients do not infer versions from dates, payloads, URLs, file names, or service transactions. A missing or non-positive local or remote version is **version unavailable**, not an invitation to overwrite.

An update exists only when `latestVersion > currentVersion`. Equal versions and a remote value lower than the local value are treated as up to date; automatic update never performs a rollback. Before persistence, the downloaded replacement must match the same `kind`, canonical `code`, and source, and its positive version must be greater than the installed version and at least the version observed by the probe. This permits the backend to advance again between the probe and download while rejecting stale, misrouted, or mismatched content.

## Three run intents

Every inspectable `updateRun` declares exactly one intent:

| Intent | Trigger and scope | Blacklist | Presentation |
| --- | --- | --- | --- |
| `collectionAutomatic` | Opening **Your downloaded files**; evaluates the deduplicated local report/object collection in stable order. | Respected. | The detailed, non-interactive `DownloadedFileUpdaterView` blocks that screen for the run and shows per-item progress and outcomes. |
| `currentAutomatic` | Opening or restoring Explore with one already-selected report or object, including an app launch that bypasses **Your downloaded files**. | Respected. | The version probe is silent and non-blocking. Only a proven update entering download, storage, or active-content rehydration presents the compact blocking `CurrentDownloadedFileUpdaterView`. |
| `currentManual` | The user selects the green **Update now** action for the current blacklisted file after a probe proved a newer version exists. | Bypassed for this run only. | Uses the same compact blocking view while downloading, replacing, and rehydrating the current content. |

A current automatic probe is attempted once for the exact current-file fingerprint of canonical identity, source, and installed version. View recomposition, repeated appearance callbacks, and nested Explore destinations must not duplicate it. A successful replacement changes the installed version and therefore permits a later probe of the new fingerprint when the root Explore experience is entered again.

## Update-run pipeline

An `updateRun` has a unique run ID, start time, optional finish time, intent, phase, ordered item states, optional current item, and the finalized identities that will actually be replaced. It moves forward through `preparing`, `validatingVersions`, `filteringBlacklist`, `updatingFiles`, and `finished`.

1. Normalize valid local candidates, reject malformed kind/code/source/version combinations, deduplicate by canonical identity with first occurrence winning, and preserve source order.
2. Probe canonical latest-version metadata. The focused `currentAutomatic` probe remains entirely in the background during this step.
3. Mark each item as up to date, version unavailable, version-check failed, or update available. No local file is changed during discovery.
4. Unless the intent is `currentManual`, consult `BlacklistedFileUpdateProvider` only after a newer version is known. Mark opted-out items `skippedBlacklisted` and exclude them from the queue.
5. Publish the final `listOfItemsThatNeedToBeUpdated` and its matching identity list. It contains only validated, newer, non-blacklisted candidates, except that an explicitly requested `currentManual` run may contain its one blacklisted current file.
6. Download queued replacements strictly one at a time. Validate the replacement identity, source, and version before it can reach storage.
7. Replace the existing local entry through one repository-level commit. The downloaded-files collection and active-file record are updated as one logical replacement boundary; there is no delete-first interval and a failed validation, download, or persistence operation leaves the prior readable version intact.
8. When the replaced identity is currently open, keep the compact blocker visible while the active parser/model is rehydrated from the newly persisted content. Never leave the screen rendering the old in-memory report or object after reporting success.
9. Publish a terminal item state and finish time, clear the current item and private payload context, emit completion, and release the coordinator for the next run.

The collection queue is sequential by contract: at most one replacement downloads or commits at a time. A failure for one collection item is recorded and the next queued item continues. Public states may include `pendingValidation`, `validatingVersion`, `versionUnavailable`, `upToDate`, `updateAvailable`, `skippedBlacklisted`, `queuedForUpdate`, `downloading`, `storing`, `updated`, `versionCheckFailed`, and `updateFailed`. Events cover run start, phase changes, item-state changes, final queue creation, successful replacement, failed replacement, and run completion.

## Quiet current-file experience

The common case must be invisible. While a `currentAutomatic` run prepares, checks a version, discovers an unavailable version, confirms the installed version is current, or encounters a version-check failure, Explore stays usable and shows no update overlay. No transient spinner, toast, layout shift, or empty state is introduced merely because the app checked.

Once a newer non-blacklisted version is confirmed and its download begins, interaction is blocked only for the short download, validated replacement, and rehydration window. The compact overlay is kind-aware and explains that a newer version of the current report or object is being installed and that the user should wait for the latest information. It does not show the collection table, a cancel action, internal code, URL, owner, or raw status machine. It covers the complete interactive surface, supports Dynamic Type/font scaling, exposes a progress accessibility role/label, honors reduced motion, and cannot be dismissed over an incomplete replacement.

If there is no update, nothing else happens. If a known update cannot be downloaded or stored, the blocker is removed, the previous local content remains available, and a localized retryable explanation is shown without leaking an internal error or path.

## Blacklist and manual update

`BlacklistedFileUpdateProvider` is a local preference store, not a server blacklist and not an authorization system. It persists only valid canonical `{ kind, code }` identities in a closed versioned representation. Corrupt, aliased, partially valid, or future-incompatible preference data fails open to an empty blacklist so malformed local data cannot silently disable updates.

Automatic runs still perform the quiet version probe for the current blacklisted file. This is required to distinguish a current file from one for which **Update now** is useful. When and only when a newer version is proven for that blacklisted identity, the Explore details area shows a green **Update now** button directly below **Reactivate automatic updates**. Unknown-version, up-to-date, wrong-identity, and stale-run states never show that action.

Selecting **Update now** starts `currentManual`. The explicit action bypasses blacklist filtering only for that single run; it does not remove the identity from `BlacklistedFileUpdateProvider` or silently reverse the user's opt-out. After success the file remains opted out, **Reactivate automatic updates** remains available, and **Update now** disappears until a later probe proves another newer version. Selecting **Reactivate automatic updates** is the only one of these actions that removes the identity from the blacklist.

## Concurrency, cancellation, failure, and retry

Only one write-capable update run may own the native coordinator at a time. Collection and focused requests use that same serialization boundary, or an equivalent repository-level identity lock, so two runs can never download and replace the same canonical identity concurrently. A focused request that arrives while another run owns the coordinator waits or retries after release; it is not silently discarded. Before a queued focused request starts, it must re-resolve the current file and stop if the selected identity changed or the file disappeared.

Run IDs, expected queue positions, and canonical identities guard every asynchronous completion. Late callbacks from a finished, cancelled, timed-out, superseded, or different run are ignored. Network and persistence steps have a bounded watchdog. While the process remains alive, cancellation and timeout publish terminal states, remove any blocking overlay, release coordinator ownership, and retain the last complete local version. Process termination cannot publish an in-memory terminal event; safety instead comes from the atomic, no-delete-first replacement boundary. On the next launch there is no stale overlay or retained in-memory run, and the app reads whichever complete local version was durably committed.

A version-check failure never starts a download. A download, identity-validation, or persistence failure never reports replacement success. The updater's `updated` state and successful-replacement event mean that the validated file was durably installed; they do not claim that the presentation layer has finished rehydrating it. If that subsequent rehydration fails, the UI removes its blocker, preserves the installed local replacement, and presents a localized load error instead of claiming that the new content is visible. Collection runs continue with later items after an item-level failure; focused runs end after their one item. Retry is a fresh run using fresh local and remote versions, initiated by a later eligible automatic entry or an explicit manual action. Implementations must not spin in an unbounded retry loop.

## Privacy, authorization, and persistence boundaries

All metadata lookup and download operations reuse the existing authorized report/object access paths. Update eligibility never grants access, guesses a code, changes an owner, or bypasses a report/object authorization check. A blacklist entry grants no access and the manual blacklist bypass affects preference filtering only.

Downloaded bytes and serialized report/object content remain inside private run context until validated persistence. Public state, events, analytics, and logs may contain only the canonical kind/code identity, neutral source/type, positive version numbers, timestamps, phases, counts, and sanitized failure categories/messages needed for presentation. They must not contain payloads, data URLs, download URLs, access credentials, form answers, variants, clinical values, owner details, requester details, or other report/object content. Private run context is cleared at terminal completion.

The blacklist uses platform-local preferences (UserDefaults on iOS and SharedPreferences on Android) and is not synchronized to Firestore. This lifecycle introduces no new backend collection or document field. It may read existing version and download metadata and overwrite the authorized local copy; it does not rewrite `uploaded_reports`, `uploaded_objects`, `file_storage`, ownership/code records, service offers, or service transactions.

Updating a file never changes a service transaction's status, completion, contract snapshot, input/output slots, `outputObjects`, or `outputReports`. Supplemental linked output reports remain optional, and updating a locally downloaded report cannot make a transaction complete or incomplete. A local update is content freshness, not service fulfillment.

## Cross-platform parity and acceptance

iOS and Android implement the same identities, version comparison, run intents, phases, blacklist behavior, manual bypass, queue order, replacement validation, active-content rehydration, blocker visibility, failure safety, and report/object coverage. Platform-native layout may differ; behavior and localized English/Spanish meaning may not.

The acceptance test matrix for this contract includes:

1. Canonical report/object identity validation, namespace separation, positive/unknown versions, duplicate first-wins order, and rejection of mismatched kind, code, source, or replacement version.
2. All three intents, including a single-item scope for both current intents and a stable sequential queue for `collectionAutomatic`.
3. Silent `currentAutomatic` preparation/version checks and an absent overlay for up-to-date, unavailable, failed-probe, and blacklisted-without-known-update cases.
4. Compact blocker appearance only during proven download, storage, and current-content rehydration, followed by rendering from the newly stored version.
5. Blacklisted automatic skip, conditional green **Update now**, one-run manual bypass, preserved opt-out after success/failure, and explicit reactivation as the only preference removal.
6. Single-owner concurrency, queued/retried focused requests, changed-selection cancellation, stale callback rejection, watchdog timeout, lifecycle cancellation, and coordinator release.
7. Download, validation, and persistence failures leaving the prior file readable; rehydration failure retaining the durably installed replacement while presenting a localized load error; collection continuation after an item failure; and clean fresh-run retry.
8. Public state/event/log privacy tests proving no payload, URL, credentials, owner/requester data, or clinical content escapes private run context.
9. Report and all supported object-source paths on both platforms, plus English/Spanish copy, accessibility, reduced-motion, and full interaction blocking assertions.
10. Persistence tests proving local collection and active selection advance together, the blacklist survives relaunch, manual update does not clear it, and no backend or service-transaction record is mutated.
