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
- **Trainer allowlist:** `GC_FITNESS_TEAM_ALLOWLIST` (comma-separated emails;
  case-insensitive; case-insensitive matched at request time — no redeploy needed
  for allowlist edits).
- **Private key encoding:** BASE64 (avoids newline-escape issues in the Vercel
  env-var UI). Encode with `printf '%s' '<key>' | base64`.
- **Cookie signing:** rotate `GC_FITNESS_COOKIE_SIGNATURE_KEY` annually or when
  leaked via `openssl rand -hex 32`. Use different values for Production /
  Preview / Development environments.

### After Vercel paste — smoke test

After pasting the 10 vars into Vercel → Settings → Environment Variables and
redeploying with build cache disabled:

1. Sign in at the deployed `/login` with an allowlisted email.
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
| `habits` | Generated habit ID | Trainer-authored habits for clients. |
| `habit_logs` | `{habitId}_{civilDate}` | Client daily habit check-ins. |
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

### Trainer login

To allow a trainer into the backoffice:

1. Add the email to `GC_FITNESS_TEAM_ALLOWLIST` in `backoffice/.env.local`
   and in the deployed environment.
2. Make sure the Firebase Auth user has a `role: "trainer"` custom claim.
   The login endpoint also upserts `users/{trainerUid}` with email, display
   name, photo URL, and trainer role so clients can display coach identity.
3. Log in at `/gc-fitness/login`.

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

### Notes and progress photos

Open `/gc-fitness/clients/{clientUid}` from the roster.

- `Private coach notes` writes `client_notes/{coachUid}_{clientUid}`. These
  are for the trainer only; they are not visible in iOS.
- `Progress photos` reads `progress_photos` for that client and signs Storage
  URLs server-side for the dashboard gallery.
- In iOS, the client goes to `Settings → Progress photos` to upload a check-in
  image with an optional caption. The app writes the Storage object first and
  then the Firestore metadata document.

### Assign habits

Open `/gc-fitness/habits`.

Create a habit, select the client, choose the habit type, and save. iOS reads
assigned habits by `clientId` and lets the client mark today's value as
complete from the Habits tab and Dashboard mini-list. Habit completions are
stored in `habit_logs` using `{habitId}_{civilDate}` so one habit/day is
idempotent.

### Client calendar

iOS Dashboard now shows a `Next 7 days` agenda. It reads future
`workout_assignments` by `clientId + scheduledFor` and recent completed
`workout_logs`; the view is intentionally client-side so coaches only need to
assign workouts from the backoffice schedule page.

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
