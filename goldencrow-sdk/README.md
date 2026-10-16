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
```

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

All endpoints except `/health`, `/auth/login`, `/auth/logout`, `/client-bookings`, and `/internal/openapi/*` require a valid Firebase session cookie. The `/internal/openapi/*` bridge routes are intended for the backoffice `/open-api` route layer; reporting data and write routes require `Authorization: Bearer <access_token>`.

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
| POST | /reporting/integration-clients/:clientId/revoke | Revoke a client so token exchange and business API requests fail |
| POST | /internal/openapi/oauth/token | Internal bridge for client-credentials access-token exchange |
| GET | /internal/openapi/reporting/patients?patientId=:id | Internal bridge for public reporting patient lookup |
| GET | /internal/openapi/reporting/patients/:id | Internal bridge for public reporting patient lookup by patient ID |
| POST | /internal/openapi/reporting/reports/upload | Internal bridge for public reporting upload notifications |
| GET | /internal/openapi/reporting/2pq/cases/:caseCode | Internal bridge for public 2PQ case lookup |
| GET | /posts | List community posts |
| GET | /posts/:id | Get post detail |
| DELETE | /posts/:id | Delete post |
| GET | /comments | List comments (required ?postId= param) |
| DELETE | /comments/:id | Delete comment |
| GET | /progress/:uid | Get user learning progress |
| GET | /stats | Dashboard aggregate counts |
