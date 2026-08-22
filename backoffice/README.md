# PocketGenes Backoffice

Next.js admin interface for the PocketGenes platform. Requires GoldenCrow SDK running as a backend.

## Prerequisites

- Node.js 20+
- GoldenCrow SDK running (see `goldencrow-sdk/README.md`)
- Firebase project (same project as the SDK)

## Environment Variables

Create `backoffice/.env.local` with the following variables:

| Variable | Description |
|----------|-------------|
| `GOLDENCROW_SDK_URL` | SDK base URL for server-side requests (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_SDK_URL` | SDK base URL for client-side requests (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Random secret for NextAuth session signing — generate with: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Backoffice URL (e.g. `http://localhost:3001`) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain (e.g. `project-id.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket (e.g. `project-id.appspot.com`) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID |
| `GOLDENCROW_OPENAPI_INTERNAL_TOKEN` | Shared service token used by `/open-api/*` routes to call the SDK internal bridge |

### Getting Firebase Web Config

1. Go to [Firebase Console](https://console.firebase.google.com) → your project
2. Project Settings → Your apps → Web app
3. Copy the config object values into the env vars above

## Running Locally

Run both services:

```bash
# Terminal 1 — GoldenCrow SDK (port 3000)
cd goldencrow-sdk
npm install
npm run dev

# Terminal 2 — Backoffice (port 3001)
cd backoffice
npm install
npm run dev
# Open http://localhost:3001
```

## Tests

```bash
cd backoffice
npx jest                       # everything (~11s)
npx jest habits-client-list    # one file — the arg is a PATH pattern, not a test name
npx jest -t "drops a recurrence"   # one test, by name
npm run test:gc-fitness        # only the gc-fitness surface (--testPathPatterns=gc-fitness)
```

Nothing to install and nothing to start: no emulator, no dev server, no
Firebase credentials. Every test either exercises a pure module or mounts a
component with React Testing Library, and everything that would touch Firebase
is mocked at the module boundary.

### This suite is the only gate before production

**The backoffice auto-deploys `main` on push, and CI is switched off for cost.**
There is no pipeline that will catch a red test after the fact — `npx jest`
green locally is literally the last thing between a merge and the trainers
using it. Run the whole suite (not just your file) before pushing.

The gate is wider than this package: `firestore.rules` and several algorithms
are shared with the iOS and Android apps, so a change here can break them and
vice versa. The four suites and when to run them are in the repo-root
`CLAUDE.md` → "Test gate before push". When in doubt, run all four.

### Writing a UI test

The harness is already installed — RTL 16, `user-event` 14, `jest-dom`, jsdom —
and `jest.setup.ts` polyfills what radix/shadcn need (`ResizeObserver`,
`scrollIntoView`, `matchMedia`, pointer capture). Adding a component test is
writing a file, not a project. Existing ones worth copying:
`src/components/gc-fitness/__tests__/` and
`src/app/gc-fitness/habits/__tests__/`.

**1. The jsdom docblock, as the first three lines.** The config default is
`testEnvironment: "node"`; without this, RTL dies with
`ReferenceError: document is not defined`.

```tsx
/**
 * @jest-environment jsdom
 */
```

**2. Mock the Server Action and `sonner`.** Any `*-actions` module imports
`firebase-admin`, which drags in Node-only deps and throws at import time under
jsdom — it MUST be mocked, whether or not your test calls it. Mocking `toast`
is how you tell "it saved" apart from "it refused".

```tsx
const mockAssignTemplate = jest.fn();
jest.mock("@/lib/gc-fitness/workout-assignment-actions", () => ({
  assignTemplate: (...args: unknown[]) => mockAssignTemplate(...args),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
```

The import can reach you INDIRECTLY, and then the failure looks like nothing
you wrote. `firebase-admin` depends on `jose`, which is ESM-only, so the suite
dies at import with `SyntaxError: Unexpected token 'export'` and **zero tests
run** — including via a shared UI helper: `exercise-multi-add-dialog` imports
`ChipRow` from `exercise-picker-popover`, which imports `use-favorites`, which
imports `favorites-actions`, which imports `firebase-admin`. If a suite reports
`Tests: 0 total`, read the stack for the transitive import and mock the nearest
hook (`@/lib/gc-fitness/use-favorites` in that case), not the leaf.

**3. Translations need no provider.** `next-intl` is ESM-only at its public
entrypoint, so `jest.config.js` maps it to `src/lib/test-utils/next-intl-stub.tsx`
for every test. The stub resolves keys against the real **EN** catalog
(`messages/en.json`), `useLocale()` returns `"en"`, and `NextIntlClientProvider`
is a pass-through you don't need to render. So assert on the English strings the
catalog actually contains — and read them from `messages/en.json` rather than
guessing. (Some `aria-label`s are hardcoded Spanish in the components; those
stay Spanish.)

**4. Assert the PAYLOAD, not the pixels.** The question a UI test answers is
"does this component build the right object and hand it to the right action?" —
not "what does it look like". The rendered screen is usually driven by the same
in-memory state that produced the write, so a screen assertion can pass with the
wire shape wrong.

```tsx
await user.click(screen.getByRole("button", { name: "Assign" }));
await waitFor(() => expect(mockAssignTemplate).toHaveBeenCalled());
expect(mockAssignTemplate.mock.calls[0][0]).toMatchObject({ scope: "one" });
```

Two payload rules that bite specifically here: an omitted key must be **absent**,
not `undefined` (the backoffice's Firestore handle has no
`ignoreUndefinedProperties`, so `undefined` throws at write time) — assert with
`expect("key" in payload).toBe(false)`. And an empty string is a real value:
optional text fields must go out as `undefined`, never `""`.

The exception is a purely presentational component (e.g.
`workout-log-detail-view.tsx`), which writes nothing — there the screen IS the
contract.

**5. Mock the child, assert the props that cross the boundary.** For a component
that is mostly a shell, this is far cheaper than mounting the whole tree and it
tests exactly what the shell decides. Give the stub a button that fires the
callback:

```tsx
jest.mock("@/components/gc-fitness/schedule/move-assignment-dialog", () => ({
  MoveAssignmentDialog: (props: {
    chip: { id: string };
    onConfirm: (scope: string) => void;
  }) => (
    <div data-testid="move-dialog">
      <span data-testid="move-dialog-chip">{props.chip.id}</span>
      <button onClick={() => props.onConfirm("all")}>scope-all</button>
    </div>
  ),
}));
```

**6. Never use today's date in a fixture.** Several components fall back to
`todayCivil()`; a fixture pinned to today sits exactly on the boundary being
tested and the assertion cannot fail. Compute offsets instead
(`civilOffset(-1)`, `civilOffset(30)`). The one legitimate exception is a fixed
instant used to test timezone conversion itself.

### Verify by mutation

**A test that passes on the first run has proven nothing until you have seen it
fail.** For each assertion that matters: break the invariant in the SOURCE by
hand, confirm the red, revert. Put the results in the PR as a table.

```bash
# 1. break it — remove the same-day guard in month-calendar.tsx:
#      if (chip.scheduledFor === targetDay) return;
npx jest month-calendar-drag-move     # expect RED
git checkout src/components/gc-fitness/schedule/month-calendar.tsx
npx jest month-calendar-drag-move     # green again
git diff --stat                       # must be empty before committing
```

**If a mutation comes back GREEN, find out why before touching the test.** Every
single time so far it has been one of these, and only one was a weak assertion:

- **The test asserted too loosely.** `toHaveTextContent("-")` is satisfied by
  `"-300s"`, so admitting negative rest gaps stayed green. Read the exact cell.
- **The assertion ran before the effect.** React Query's `mutate()` does not call
  the mutation function synchronously, so `expect(action).not.toHaveBeenCalled()`
  right after a click passes no matter what. Flush first:
  `await act(async () => { await new Promise((r) => setTimeout(r, 0)); })`.
- **The mutation didn't apply where you thought.** The logic was duplicated (a
  preview copy and a submit copy of the same `.sort()`), or a `s///` without
  `/g` hit only one of them. Check the occurrence count.
- **The code is dead.** Two mechanisms implementing one contract, and the one
  you mutated isn't the one that runs (e.g. a collapsed bilingual field already
  mirrors on every keystroke, so the mirror at save time is unreachable from
  that path). Assert the CONTRACT, and cover EACH mechanism through the one path
  where it is the only thing running — then both bite their own mutation.
- **The fixture couldn't tell the two behaviors apart.** An exercise with a
  single muscle group makes `.some()` and `.every()` agree; a row that is both
  `source: "wger"` AND library-tagged can't distinguish a check on one from a
  check on the other. Widen the fixture, not the assertion.
- **The invariant you assumed isn't real.** Moving the exercise-library dedupe
  from before the filters to after `searchExercises` keeps every test green,
  because with real twins (same name, same fields) filtering and searching are
  per-row predicates. Say so in the header instead of asserting an ordering the
  code doesn't actually depend on.
- **The mutation was malformed** and changed nothing (appending a `void 0`,
  adding a second redundant call). `Tests: 0 total` or an unchanged count is the
  tell — re-read the diff you applied before drawing a conclusion.
  In particular `if (false)`, deleting a function name from a call, or dropping
  a null-guard the types depend on all fail to COMPILE, and ts-jest then reports
  `Tests: 0 total` — which looks exactly like green if you only read the exit
  code. Always read the `Tests:` line, never the exit status alone.
- **The fixture made the two branches the same value.** Snapping to "the newest
  photo" cannot be told from "leave it alone" when the fixture already starts on
  the newest one; seeding URL params with exactly the defaults proves nothing
  about whether the params are read at all. Start from a value the correct
  behavior has to CHANGE.
- **The assertion was weaker than the invariant.** "The two timezones produce
  different headings" holds with the timezone bug in place too — a wrong civil
  day still produces *some* heading. Assert the exact label.
- **The value comes from somewhere else.** A ternary that duplicates one its
  caller already applied (the generator repeating `metric === "time" ? 0 : reps`
  from the engine) can never differ. That is a finding for the dead-code issue,
  not a test to strengthen.

### Query traps that have already cost time

- A bare `/Editar/` also matches "Editar recurrencia" — anchor the regex
  (`/^Editar$/`).
- Dialog titles and bodies often render the same text → `findAllByText`, not
  `findByText`.
- Numeric inputs with `inputMode` expose `role="textbox"`, **not**
  `spinbutton`.
- A shadcn `Select`/combobox trigger does NOT take its placeholder as its
  accessible name — match on `textContent`.
- With two `role="combobox"` elements, never index blindly; identify which is
  which.
- `window.location` cannot be stubbed in this jsdom — not via `defineProperty`,
  not via the `delete` trick, not via `spyOn`.
- The next-intl stub caches `t` per namespace on purpose. If you see
  *Maximum update depth exceeded*, look for another hook in your test returning
  a fresh reference each render before blaming the component.
- **Custom pill groups are not buttons.** The trend-range selector and the
  metric switcher are `role="tab"` inside a `role="tablist"`; the muscle-group
  chips are `role="checkbox"`. `getByRole("button", …)` misses all of them.
- **RTL's string matcher compares the ELEMENT's whole text.** A label that
  shares its `<p>` with a value (`Latest: 80 kg · 3 sessions`) is NOT findable
  with `getByText("Latest:")` — scan for the element and read the child, or use
  a function matcher.
- **`textContent` runs adjacent nodes together.** A note followed by its date
  reads as `Nota 112026-08-01`, so a loose `/Nota \d+/` matches across the
  boundary. Bracket or otherwise delimit fixture markers.
- The next-intl stub does **not** implement ICU plurals. A catalog entry like
  `{count, plural, one {# session} other {# sessions}}` renders verbatim —
  never assert on those strings.
- **`toHaveTextContent` is a SUBSTRING match.** `toHaveTextContent("assign-1")`
  passes on `"workout:assign-1"`, so the wrong-id bug survives the assertion
  (this is the same shape as the earlier `toHaveTextContent("-")` matching
  `"-300s"`). Anchor with a regex — `/^assign-1$/`.
- **A `<label>` next to an input is not associated with it.** Several forms
  (the generator's assign modal, among others) render the label as a sibling
  with no `htmlFor` and no wrapping, so `getByLabelText` finds nothing. Address
  those by `input[type=date|time|number]` and note it in the header.
- **`key` never reaches props.** React consumes it, so a remount cannot be
  asserted from a props spy. Count mounts with a `useEffect(() => …, [])`
  inside the stubbed child.
- **Two elements can share an accessible name across roles.** The "Back" muscle
  chip and the "Back" nav button coexist on the generator's step 2. Filter on a
  discriminating attribute (the chips are the only ones with `aria-pressed`).
- **A day number rendered as `"YYYY-MM-DD".slice(8, 10)` is ZERO-PADDED.**
  `getByText("9")` finds nothing; the cell says `"09"`.
- **Controls disabled during a `useTransition` swallow the next interaction.**
  A second filter pick, or a "Load more" whose label flips to "Loading…", fails
  as a MISSING ELEMENT rather than as a wrong assertion. Wait for the control to
  come back (`findByRole`, or `waitFor(() => expect(el).toBeEnabled())`).

### jsdom gaps that look like component bugs

Each of these throws INSIDE the component, so the test fails on a missing
button rather than on its own assertion:

- **`URL.createObjectURL` / `revokeObjectURL` don't exist.** Any staged-file
  preview calls them synchronously. Shim both in a `beforeAll`.
- **`Element.prototype.scrollTo` doesn't exist**, and there is no layout. Any
  auto-scroll-to-bottom (the chat thread) dies on mount.
- **Recharts renders nothing measurable** — no layout means width/height are
  `-1` and the chart body never mounts. Assert the chart's data through a text
  readout computed from the same array the chart receives, and say so in the
  header.
- **`rerender()` with the SAME element object is a no-op** — React bails out on
  referential identity, so an effect you expect to re-run never does. Build the
  element fresh each time.
- **`mockReturnValue` hands back one stable object**, so a `useMemo` over it
  never recomputes and its dependent effects never re-run. Use
  `mockImplementation` when the test is about what happens on a re-fetch.
- **`<canvas>.getContext("2d")` returns null** (the `canvas` npm package is not
  installed), so any export-to-image path bails on its own first guard. Scope
  the test to the state the export reads instead of the painting.
- **Components that capture `new Date()` at mount need the clock pinned.**
  Today/Yesterday/Overdue headings are decided against the wall clock, so a
  suite run near local midnight silently regroups every fixture. Use
  `jest.useFakeTimers({ now })` and wire user-event with
  `userEvent.setup({ advanceTimers: jest.advanceTimersByTime })`, or clicks stop
  working while the fake timers are installed.

### What does NOT exist: browser E2E

There is **no Playwright and no Cypress**, and the backoffice has **no emulator
plumbing** — no `FIRESTORE_EMULATOR_HOST`, no `connectFirestoreEmulator`. It
talks to real Firebase through the Admin SDK. Don't assume a real browser is
covering anything; nothing in this repo runs one.

Standing one up would mean emulator plumbing for both SDKs (client + Admin),
minting a `next-firebase-auth-edge` session cookie, and seeding fixtures —
roughly what the mobile UI-test harness (#609) cost. Worth doing eventually; not
worth blocking regression coverage on, since these tests run in the gate that
already protects production.

## Authentication

Login is backend-controlled. Access is granted to emails in the SDK's `TEAM_ALLOWLIST` and to users with an active admin role assignment in Firebase (for example `full_admin`, `institution_admin`, or `institution_doctor`). Email account creation now checks that access first, creates the auth account only after approval, and then sends the authenticated user into a complete-profile flow that writes the required Firebase profile documents.

## Sections

| Section | Path | Description |
|---------|------|-------------|
| Dashboard | `/` | Live counts for users, reports, community, learning |
| Users | `/users` | User list with search, edit, cascade delete |
| Reports | `/reports` | DNA report list with source filter, detail, delete |
| Learning | `/learning` | Learning module and lesson browser |

## GC Fitness — Vercel environment setup

The GC Fitness trainer surface (`/gc-fitness/*` routes — clients roster,
per-client deep view, chat, habits, exercises, schedule, settings, templates)
requires per-project Firebase Admin credentials in Vercel. These are scoped
to the `gcfitness-3476b` Firebase project and are NOT shared with the existing
MyDNAMap / Pocket Gyms env vars (Pitfall 16 isolation — separate Firebase
projects, separate cookies, separate allowlists).

Follow the runbook in:

- `.planning/phases/11-backoffice-slot-in/11-08-env-vars-setup-PLAN.md`
  (full step-by-step paste flow + troubleshooting)
- `.env.example` (variable names + brief provenance per key)

### Key facts

- **Firebase project:** `gcfitness-3476b` (separate from MyDNAMap + Pocket Gyms).
- **Bundle ID (iOS):** `com.goldencrow.fitness` (configured in Firebase).
- **Trainer allowlist:** currently not enforced. The login flow promotes any
  authenticated Google account to a GC Fitness trainer. The env var remains in
  the manifest for future tightening, but it is not used by the live gate now.
- **Private key encoding:** BASE64 (avoids newline-escape issues in the Vercel
  env-var UI). Encode with `printf '%s' '<key>' | base64`.
- **Cookie signing:** rotate `GC_FITNESS_COOKIE_SIGNATURE_KEY` annually or when
  leaked via `openssl rand -hex 32`. Use different values for Production /
  Preview / Development environments.

### After Vercel paste — smoke test

After pasting the 10 vars into Vercel → Settings → Environment Variables and
redeploying with build cache disabled:

1. Sign in at the deployed `/login` with any Google account.
2. Pick the GC Fitness card from the project selector (added by plan 11-03).
3. You should land at `/gc-fitness/clients` (the trainer roster) without
   seeing the `auth-helpers.ts: server misconfigured` error.
4. Click any roster row → the per-client deep view (`/gc-fitness/clients/[id]`)
   should render with the 4-widget Suspense grid (added by plan 11-07).

If any step fails, see the troubleshooting section of the 11-08 runbook.

## GC Fitness — local operations runbook

### Local URLs

Run the backoffice locally:

```bash
cd backoffice
npm install
npm run dev
```

Open:

- Trainer login: `http://localhost:3001/gc-fitness/login`
- Dashboard: `http://localhost:3001/gc-fitness/dashboard`
- Clients: `http://localhost:3001/gc-fitness/clients`
- Schedule: `http://localhost:3001/gc-fitness/schedule`
- Workout templates: `http://localhost:3001/gc-fitness/templates`
- Exercise library: `http://localhost:3001/gc-fitness/exercises`
  (`/gc-fitness/library` redirects here)
- Habits: `http://localhost:3001/gc-fitness/habits`
- Chat: `http://localhost:3001/gc-fitness/chat`
- Settings / quick replies: `http://localhost:3001/gc-fitness/settings`

The GC Fitness routes use Firebase Auth plus the `GcFitnessAuthToken` cookie,
not the PocketGenes NextAuth session. That is why `/gc-fitness/*` has its own
login and logout flow.

### Seed the default exercise library

The exercise library is backed by the shared `exercises` collection. If the
catalog looks empty in a fresh project or local dev database, run:

```bash
cd backoffice
npm run seed:gc-fitness-library
```

That seed job now loads 300 default wger exercises and 15 starter workout
templates.

### Firebase database

Use the native Cloud Firestore `(default)` database in project
`gcfitness-3476b`. Do not point the iOS app or backoffice at the named
Firestore Enterprise / MongoDB database `gc-fitness-database`; native SDK
listeners require the native Firestore database.

Core collections:

| Collection | Document ID | Purpose |
|------------|-------------|---------|
| `users` | Firebase Auth UID | App user mirror. Trainer docs carry `role: "trainer"`; client docs carry `role: "client"`, `coachId`, `coachDisplayName`, and `coachPhotoURL`. |
| `user_mirror` | Lowercased email | Pre-created client placeholders when the app user does not exist yet. |
| `exercises` | `wger-{uuid}` or trainer custom ID | Exercise library metadata. Media fields are `gs://` Storage paths when available. |
| `workout_templates` | `tpl-{trainerUid}-...` | Reusable routines owned by one trainer. |
| `workout_assignments` | Generated assignment ID | A template snapshot assigned to a client for a scheduled date. |
| `workout_logs` | Client-written log ID | Completed workout session logs from iOS. |
| `habit_templates` | `global-*` or generated ID | Reusable habit library. Global templates are seeded/read-only; trainer templates are private to that trainer. |
| `habits` | Generated habit ID | Client-specific habit assignments copied from a template or created manually. |
| `habit_logs` | `{habitId}_{civilDate}` | Client daily habit check-ins. |
| `client_goals` | Generated goal ID | Coach-authored short/medium/long-term goals visible to the assigned client. |
| `chats` | Client UID | One coach/client thread metadata doc. |
| `chats/{clientUid}/messages` | Message ID | Chat messages. |
| `progress_photos` | Generated photo ID | Client-uploaded progress photo metadata. Image bytes live in Storage at `progress_photos/{clientUid}/...`. |
| `client_notes` | `{coachUid}_{clientUid}` | Trainer-private notes for one client. Clients cannot read these docs. |

Rules and composite indexes live in the iOS repo (`gc-fitness`) and are
deployed with Firebase CLI:

```bash
cd ../gc-fitness
npx firebase deploy --only firestore:rules,firestore:indexes --project gcfitness-3476b
```

Storage is required for chat attachments, exercise media, and progress photos.
Initialize Firebase Storage once from the Firebase console for project
`gcfitness-3476b`, then deploy storage rules:

```bash
cd ../gc-fitness
npx firebase deploy --only storage --project gcfitness-3476b
```

Storage rules cap user-uploaded chat images and progress photos at 1 MB.
The iOS app compresses images before upload, but oversized files are still
rejected at the rule layer.

### Trainer and admin login (multi-role)

GC Fitness now supports multi-role custom claims:

- `trainer`
- `admin`

A single user can hold both roles at the same time (`trainer + admin`).

On login (`/api/gc-fitness/login`), the system always ensures the user has
`trainer` role and preserves any existing `admin` role. Claims are normalized
as:

- `role`: `"trainer"` (primary compatibility flag)
- `roles`: string array (example: `["trainer", "admin"]`)
- `admin`: boolean mirror (`true` when `roles` contains `admin`)

The login endpoint also upserts `users/{trainerUid}` with email, display name,
photo URL, and trainer profile fields so clients can display coach identity.

1. Log in at `/gc-fitness/login`.

### GC Fitness admin console

Route: `/gc-fitness/admin` (admin-only).

Current capabilities:

- List all coaches (`users.role == "trainer"`) with:
  - roles
  - clients count
  - custom workouts count
  - custom exercises count
- Add coach email to allowlist (`coach_allowlist/{email}` doc)
- Promote an existing user email to admin (`trainer + admin` by default)
- Delete client with cascade
- Delete coach with cascade (including linked clients)

If a non-admin user opens `/gc-fitness/admin`, the app redirects to
`/gc-fitness/forbidden`.

### Create a new admin user (runbook)

1. Ensure the person can sign in with Google on `/gc-fitness/login`.
2. Open `/gc-fitness/admin` with an existing admin account.
3. In **Promote existing user to admin**, submit the target email.
4. Ask that user to sign out and sign in again to refresh token claims.
5. Confirm they can open `/gc-fitness/admin`.

Resulting role model:

- Trainer-only: `roles = ["trainer"]`
- Admin-only (supported): `roles = ["admin"]`
- Trainer + admin (recommended for coach operators): `roles = ["trainer", "admin"]`

### Cascade deletion safety

Admin console currently exposes destructive operations:

- `Delete client (cascade)` requires confirmation text `DELETE CLIENT`
- `Delete coach (cascade)` requires confirmation text `DELETE COACH`

Both actions run server-side with Firebase Admin SDK and are intended for
operator-only recovery/cleanup workflows.

Dry-run and audit:

- Each delete form has a `Dry run` button and an `Execute` button.
- Dry run computes impact counts without deleting data.
- Both dry-run and execute attempts are logged to `admin_operations` with
  actor, mode, target uid, status, and summary payload.

### Add or assign a client

Go to `/gc-fitness/clients`.

The "Add client" form accepts an email and name:

- If a Firebase Auth user already exists for that email, the action sets that
  user's custom claims to `role: "client"` and `coachId: trainer.uid`, writes
  `users/{clientUid}`, and creates/merges `chats/{clientUid}`.
- If the Auth user does not exist yet, the action writes
  `user_mirror/{lowercaseEmail}` so the client can be attached when they
  onboard in the app.

After a client is attached, they appear in the roster and their chat thread
is reachable from `/gc-fitness/chat`.

The roster also shows pre-created `user_mirror` entries that belong to the
current coach and have not signed in yet. They are marked as pending sign-in
and stay non-clickable until the app user materializes.

The attach flow also copies the trainer's display name and photo URL onto the
client doc as `coachDisplayName` and `coachPhotoURL`. The iOS app reads those
fields from the client's own `users/{clientUid}` document.

### Assign workouts

1. Confirm templates exist at `/gc-fitness/templates`.
2. Open `/gc-fitness/schedule`.
3. Pick a client.
4. Assign a template to the desired date.

The assignment writes a `workout_assignments` document with a denormalized
`templateSnapshot`. iOS reads assignments by `clientId` and `scheduledFor`,
so changes to the original template do not mutate already-assigned workouts.

### Chat

Client messages are stored under `chats/{clientUid}/messages`. The parent
`chats/{clientUid}` doc stores the trainer id, last-message preview, last
message timestamp, and unread counters. In production this denormalization
should be handled by the `onMessageCreated` Cloud Function; the backoffice
also updates the parent doc when the trainer sends a message so local testing
works before functions are deployed.

Open `/gc-fitness/chat`, select a conversation on the left, then reply from
the right pane. Direct links use:

```text
/gc-fitness/chat?chatId={clientUid}
```

### Client profile, notes, goals, and progress photos

Open `/gc-fitness/clients/{clientUid}` from the roster.

- `Private coach notes` writes `client_notes/{coachUid}_{clientUid}`. These
  are for the trainer only; they are not visible in iOS.
- `Goals` writes `client_goals` with `horizon: short | medium | long`.
  Active goals are visible on the client's iOS Dashboard.
- `Progress photos` reads `progress_photos` for that client and signs Storage
  URLs server-side for the dashboard gallery.
- In iOS, the client goes to `Settings → Progress photos` to upload a check-in
  image with an optional caption. The app writes the Storage object first and
  then the Firestore metadata document.

`/gc-fitness/users/{clientUid}` redirects to the same profile route so coach
links can use either naming convention.

### Assign habits

Open `/gc-fitness/habits`.

Use the reusable habit library for normal assignment:

1. Select a global or coach-owned template.
2. Select one or more clients.
3. Click `Assign selected`.

This copies the template into one `habits` document per client. Later edits to
that assignment affect only that client. Coaches can also create their own
templates from the same page; those templates are visible only to that coach.

Manual one-off habits still exist through `New habit`. iOS reads assigned
habits by `clientId` and lets the client mark today's value as complete from
the Habits tab and Dashboard mini-list. Habit completions are stored in
`habit_logs` using `{habitId}_{civilDate}` so one habit/day is idempotent.

### Client calendar

iOS Dashboard now shows a `Next 7 days` agenda. It reads future
`workout_assignments` by `clientId + scheduledFor` and recent completed
`workout_logs`; the view is intentionally client-side so coaches only need to
assign workouts from the backoffice schedule page.

The backoffice per-client daily timeline is lazy-loaded one day at a time:
the page fetches only the current day up front, and changing the selected day
pulls that single day on demand. This keeps Firestore reads lower and avoids
adding maintenance-heavy denormalization just to save a few extra queries.

### Seed exercise library and starter routines

The current native Firestore database starts empty. To preload the local/live
GC Fitness library:

```bash
cd backoffice
npm run seed:gc-fitness-library -- --exercise-count 300 --trainer-email trainer@example.com
```

The script:

- Fetches wger exercise metadata.
- Writes 300 `exercises` docs when enough English records are available.
- Writes 15 starter `workout_templates` for the selected trainer.
- Is idempotent and uses deterministic seeded template IDs.

Current media note: the app's model expects demonstration media as MP4 files
in Firebase Storage referenced by `gs://...`, not raw external GIF URLs. The
seed stores upstream image/video references under `sourceMedia` for later
transcoding/upload, while `mediaURL` and `thumbnailURL` stay `null` until the
Storage pipeline is run.

The older wger media pipeline lives in `../gc-fitness/scripts/wger`. It can
pull curated wger records, transcode videos with `ffmpeg`, and upload MP4s
to Firebase Storage. That curated set currently contains 124 records, so it
does not by itself satisfy the 300-exercise library target.
