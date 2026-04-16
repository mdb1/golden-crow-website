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

Login is backend-controlled. Access is granted to emails in the SDK's `TEAM_ALLOWLIST` and to users with an active admin role assignment in Firebase (for example `full_admin`, `institution_admin`, or `institution_doctor`).

## Sections

| Section | Path | Description |
|---------|------|-------------|
| Dashboard | `/` | Live counts for users, reports, community, learning |
| Users | `/users` | User list with search, edit, cascade delete |
| Reports | `/reports` | DNA report list with source filter, detail, delete |
| Learning | `/learning` | Learning module and lesson browser |
