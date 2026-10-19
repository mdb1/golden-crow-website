# GoldenCrow SDK

Fastify BFF server wrapping Firebase Admin SDK. Provides authenticated HTTP endpoints for the PocketGenes backoffice admin interface.

## Prerequisites

- Node.js 20+
- Firebase project with Firestore and Firebase Auth enabled
- Service account credentials (JSON) from Firebase Console

## Environment Variables

Create `goldencrow-sdk/.env` with the following variables:

| Variable | Description |
|----------|-------------|
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase project ID (e.g. `my-project-id`) |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service account email (e.g. `firebase-adminsdk-xxxxx@project.iam.gserviceaccount.com`) |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Service account private key — include the full value with `\n` for newlines |
| `TEAM_ALLOWLIST` | Comma-separated list of authorized admin email addresses |
| `PORT` | Port to listen on (default: `3000`) |
| `NODE_ENV` | `development` or `production` |
| `BACKOFFICE_ORIGIN` | CORS allowed origin for the backoffice (e.g. `http://localhost:3001`) |
| `GOLDENCROW_OPENAPI_REPORTING_QUOTA_PER_MINUTE` | Optional per-client public reporting quota override (default: `60`) |

### Getting Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com) → your project
2. Project Settings → Service Accounts → Generate new private key
3. Download the JSON file
4. Copy values from the JSON into the env vars above
5. For `FIREBASE_ADMIN_PRIVATE_KEY`: copy the `private_key` field value including `-----BEGIN...-----END-----` with literal `\n` characters preserved

## Running Locally

```bash
cd goldencrow-sdk
npm install
npm run dev
# SDK is available at http://localhost:3000
# Health check: curl http://localhost:3000/health
```

## Tests and the deploy gate (#451)

```bash
npm test         # jest (~20 s)
npm run smoke    # boot the compiled app (run `npx tsc` first)
npm run build    # what Vercel runs: deps check → tsc → smoke → jest
npm run test:time-travel   # time-bomb detector (not part of build)
```

**Rule: fixtures never depend on today.** A test that passes only near the
date it was written blocks every deploy the day it expires (the backoffice
lost a day of deploys to that on 2026-10-16). Pin `Date`
(`jest.useFakeTimers({ now, doNotFake: [...timers] })`) or derive fixture dates
from `Date.now()`. `npm run test:time-travel` runs the suite unshifted and with
`Date` moved +1, +40, +400 and −1 days (`TEST_CLOCK_SHIFT_DAYS`, handled in
`jest.setup.ts`; timers stay real and a test's own fake timers win) and lists
the tests that fail only when shifted. Extra args go to jest; one file:
`NODE_ENV=test TEST_CLOCK_SHIFT_DAYS=40 npx jest --config jest.config.cjs <file>`.

Vercel runs `npm run build` for every production deploy (pushes to `main`;
previews are skipped by the project's Ignored Build Step), and a failing build
never replaces the running deploy, so the tests in it are the ones nobody can
skip: a red `main` stays on the last green SDK instead of shipping. `scripts/smoke-boot.mjs` imports `dist/server.js` with
require(esm) OFF (the Vercel runtime mode) and checks that the app boots, that
`POST /auth/login` with a bad token answers 401 (not 500), and that **every
route not in its public list answers 401 to an anonymous request**. Adding a
public route therefore means adding it to `PUBLIC_PATHS` in `src/server.ts`
AND to the list in the smoke — on purpose, twice. It needs no credentials.

## Available Endpoints

Most endpoints require a valid Firebase session cookie. Session-exempt routes
are explicitly listed in `src/server.ts`; session-exempt does not necessarily
mean anonymous. The `/internal/openapi/*` reporting routes require their
reporting Bearer token. `/service-transactions/notification-token` requires
active API client credentials, while `/service-transactions/notify-provider`
and `/service-transactions/notify-requester` require the separate signed
service-notification Bearer token.

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | SDK health check + Firebase connectivity |
| POST | /auth/login | Exchange Firebase ID token for session cookie |
| POST | /auth/logout | Clear session cookie |
| GET | /users | List all users (Auth + Firestore merged) |
| GET | /users/:uid | Get user detail |
| PUT | /users/:uid | Update user profile |
| DELETE | /users/:uid | Cascade delete user |
| GET | /reports | List reports (optional ?source= filter) |
| GET | /reports/:id | Get report detail |
| DELETE | /reports/:id | Delete report |
| GET | /reporting/integration-clients | List public reporting integration clients for a full admin |
| POST | /reporting/integration-clients | Create a public reporting integration client for a full admin |
| GET | /reporting/integration-clients/events | List key-management events from `openapi_reporting_access_events` |
| POST | /reporting/integration-clients/:clientId/secret/rotate | Create or renew a client secret and reveal it once |
| POST | /reporting/integration-clients/:clientId/revoke | Revoke a client so future token exchanges and reporting API requests fail; an already-issued stateless notification token remains valid until expiry or signing-key rotation |
| POST | /internal/openapi/oauth/token | Internal bridge for client-credentials access-token exchange |
| GET | /internal/openapi/reporting/patients?patientId=:id | Internal bridge for public reporting patient lookup |
| GET | /internal/openapi/reporting/patients/:id | Internal bridge for public reporting patient lookup by patient ID |
| POST | /internal/openapi/reporting/reports/upload | Internal bridge for public reporting upload notifications |
| GET | /internal/openapi/reporting/2pq/cases/:caseCode | Internal bridge for public 2PQ case lookup |
| POST | /service-transactions/notification-token | Exchange active API client credentials for a one-year notification Bearer token |
| POST | /service-transactions/notify-provider | Send the fixed provider email with a notification Bearer token and zero Firestore operations |
| POST | /service-transactions/notify-requester | Send the aggregate requester email with a notification Bearer token and zero Firestore operations |
| GET | /posts | List community posts |
| GET | /posts/:id | Get post detail |
| DELETE | /posts/:id | Delete post |
| GET | /comments | List comments (required ?postId= param) |
| DELETE | /comments/:id | Delete comment |
| GET | /progress/:uid | Get user learning progress |
| GET | /stats | Dashboard aggregate counts |
