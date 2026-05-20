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
